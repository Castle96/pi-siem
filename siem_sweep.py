"""
siem_sweep.py — Background multi-endpoint sweeper for the Jarvis SIEM dashboard.

A daemon thread, started by jarvis_siem_server.py, periodically:
  - pings every registry endpoint (latency, packet loss, host-down alerts)
  - runs full SSH inventory scans (cpu/mem/disk/services/ports) on an interval
  - records per-host metrics into metrics.db so the dashboard can show history
  - detects drift in services/ports and raises SIEM alerts
  - refreshes the LAN sweep cache (/api/lan)

Scan results are cached in-memory (with the TTL cache inside remote_scan) so
REST views never re-probe endpoints that were just scanned.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone

from siem_data import (
    record_metric, add_alert, get_metric_history,
    store_snapshot, get_snapshot, clear_snapshot,
)
from siem_network import registry, scan_entry, ping_host, lan_sweep

HEALTH_INTERVAL = int(os.getenv("SIEM_SWEEP_INTERVAL", "30"))
FULL_INTERVAL = int(os.getenv("SIEM_SWEEP_FULL_INTERVAL", "300"))
LAN_INTERVAL = int(os.getenv("SIEM_SWEEP_LAN_INTERVAL", "600"))
ALERT_HOST_DOWN = os.getenv("SIEM_ALERT_HOST_DOWN", "1") == "1"


def _svc_signature(services):
    """Signature of interesting systemd units (active/reloading/failed only)."""
    seen = sorted(
        f"{s.get('name')}:{s.get('active_state')}"
        for s in services
        if s.get("active_state") in ("active", "reloading", "failed")
    )
    return json.dumps(seen)


def _port_signature(ports):
    """Signature of listening ports."""
    seen = sorted(f"{p.get('protocol')}:{p.get('port')}" for p in ports)
    return json.dumps(seen)


class Sweeper:
    """Single background thread scanning every monitored endpoint."""

    def __init__(self):
        self._lock = threading.Lock()
        self.running = False
        self._thread = None
        self.latest = {}          # ip -> most recent full scan result
        self.health = {}          # ip -> {reachable, latency_ms, packet_loss, ts}
        self.lan_hosts = []       # cached LAN sweep results
        self.lan_ts = None
        self._was_reachable = {}  # ip -> last ping reachability
        self._last_full = {}      # ip -> clock of last full scan

    # ------------------------------------------------------------------
    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, name="siem-sweeper", daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False

    def _loop(self):
        last_health = 0.0
        last_full = 0.0
        last_lan = 0.0
        while self.running:
            now = time.time()
            try:
                if now - last_health >= HEALTH_INTERVAL:
                    self.health_cycle()
                    last_health = now
                if now - last_full >= FULL_INTERVAL:
                    self.full_cycle()
                    last_full = now
                if now - last_lan >= LAN_INTERVAL:
                    self.lan_cycle()
                    last_lan = now
            except Exception:
                pass
            time.sleep(1)

    # ------------------------------------------------------------------
    def health_cycle(self):
        """Ping every endpoint; detect hosts going offline."""
        for entry in registry.all():
            ip = self._primary_ip(entry)
            probe = ping_host(ip, count=2)
            probe["ts"] = datetime.now(timezone.utc).isoformat()
            with self._lock:
                self.health[ip] = probe
            record_metric("latency_ms", probe["latency_ms"] or 0.0, host=ip)
            record_metric("availability", 1.0 if probe["reachable"] else 0.0, host=ip)
            self._check_host_transition(ip, probe["reachable"])

    def _check_host_transition(self, ip, reachable):
        was = self._was_reachable.get(ip)
        self._was_reachable[ip] = bool(reachable)
        if was is None:
            return  # first observation: just baseline it
        if was and not reachable:
            entry = registry.get(ip)
            label = (entry or {}).get("label") or ip
            with self._lock:
                self.latest.pop(ip, None)
            add_alert("high", f"Host DOWN: {label} ({ip}) unreachable")

    # ------------------------------------------------------------------
    def full_cycle(self):
        """Full SSH inventory scan of every endpoint; record metrics + drift."""
        for entry in registry.all():
            try:
                self.force_scan(entry)
            except Exception:
                pass

    def force_scan(self, entry):
        """Run (or force) a full scan, record metrics, and detect drift."""
        result = scan_entry(entry, force=True)
        ip = result.get("ip") or self._primary_ip(entry)
        label = entry.get("label") or ip
        self._record_metrics(ip, result)
        if result.get("online"):
            self._detect_drift(ip, label, result)
        with self._lock:
            self.latest[ip] = result
            self._last_full[ip] = time.time()
            self._was_reachable[ip] = bool(result.get("online"))
        return result

    def result_for(self, entry):
        """Return a fresh (<=FULL_INTERVAL old) scan, or run one now."""
        ip = self._primary_ip(entry)
        with self._lock:
            cached = self.latest.get(ip)
            last = self._last_full.get(ip, 0)
        if cached is not None and (time.time() - last) < FULL_INTERVAL:
            return cached
        return scan_entry(entry, force=False) or self.force_scan(entry)

    # ------------------------------------------------------------------
    def _record_metrics(self, ip, result):
        if not result.get("online"):
            return
        try:
            record_metric("cpu_usage", result["cpu"]["percent"], host=ip)
            record_metric("mem_usage", result["memory"]["percent"], host=ip)
            disks = result.get("disks", [])
            if disks:
                root = next((d for d in disks if d.get("mountpoint") == "/"), disks[0])
                record_metric("disk_usage", root.get("percent", 0), host=ip)
            temp = result.get("thermal", {}).get("temp_c")
            if temp is not None:
                record_metric("temp_c", temp, host=ip)
        except Exception:
            pass

    def _detect_drift(self, ip, label, result):
        services = result.get("services", [])
        ports = result.get("ports", [])
        svc_sig = _svc_signature(services)
        port_sig = _port_signature(ports)

        prev_res = self.latest.get(ip)
        # If this host was offline last full scan, baseline silently on reconnect.
        was_offline = prev_res is not None and not prev_res.get("online")
        if was_offline:
            store_snapshot(ip, "services", svc_sig)
            store_snapshot(ip, "ports", port_sig)
            with self._lock:
                self.latest[ip] = result
            return

        changes = []
        prev_svc = get_snapshot(ip, "services")
        if prev_svc and prev_svc["signature"] != svc_sig:
            try:
                old = set(json.loads(prev_svc["signature"]))
                new = set(json.loads(svc_sig))
            except Exception:
                old, new = set(), set()
            changes += [f"service started/active: {_strip_sig(n)}" for n in sorted(new - old)]
            changes += [f"service stopped/failed: {_strip_sig(n)}" for n in sorted(old - new)]

        prev_ports = get_snapshot(ip, "ports")
        if prev_ports and prev_ports["signature"] != port_sig:
            try:
                old_p = set(json.loads(prev_ports["signature"]))
                new_p = set(json.loads(port_sig))
            except Exception:
                old_p, new_p = set(), set()
            changes += [f"port opened: {n}" for n in sorted(new_p - old_p)]
            changes += [f"port closed: {n}" for n in sorted(old_p - new_p)]

        if changes:
            for c in changes[:10]:
                add_alert("medium", f"[{label} ({ip})] {c}")
            if len(changes) > 10:
                add_alert("medium", f"[{label} ({ip})] +{len(changes) - 10} more changes")

        store_snapshot(ip, "services", svc_sig)
        store_snapshot(ip, "ports", port_sig)

    # ------------------------------------------------------------------
    def lan_cycle(self):
        try:
            hosts = lan_sweep(include_ping=True)
            with self._lock:
                self.lan_hosts = hosts
                self.lan_ts = datetime.now(timezone.utc).isoformat()
        except Exception:
            pass

    def refresh_lan(self):
        hosts = lan_sweep(include_ping=True)
        with self._lock:
            self.lan_hosts = hosts
            self.lan_ts = datetime.now(timezone.utc).isoformat()
        return hosts

    # ------------------------------------------------------------------
    def get_health(self, ip):
        with self._lock:
            return self.health.get(ip)

    def get_lan(self):
        with self._lock:
            return self.lan_hosts, self.lan_ts

    def history(self, ip, metric_type="cpu_usage", limit=120):
        return get_metric_history(ip, metric_type, limit)

    def _primary_ip(self, entry):
        ips = [x for x in (entry.get("ips") or [entry.get("ip")]) if x]
        return ips[0] if ips else entry.get("ip")


def _strip_sig(item):
    """'unit.service:active' -> 'unit.service' / 'tcp:22' -> 'tcp/22'."""
    return item.replace(":", "/", 1)


sweeper = Sweeper()