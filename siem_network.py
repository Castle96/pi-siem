"""
siem_network.py — Unified remote monitoring engine for the Jarvis SIEM dashboard.

Provides:
  - Endpoint registry (data/endpoints.json), seeded from the hard-coded cluster
    nodes and the legacy custom-servers file.
  - ssh_exec / ping_host / tcp_probe primitives.
  - remote_scan(): one canonical full SSH inventory per host (systemd services,
    listening ports, cpu/mem/disk/network/processes). Used by both service
    discovery and system monitoring so we never fork two diverging scanners.
  - scan_entry(): scan a registry entry across fallback IPs (LAN -> tailnet).
  - lan_sweep(): ARP + ICMP discovery of hosts on the local network.
  - Remote-scan result cache with TTL so we stop hammering nodes on every view.
"""

import json
import os
import re
import socket
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
REGISTRY_PATH = DATA_DIR / "endpoints.json"
LEGACY_SERVERS_PATH = DATA_DIR / "custom_servers.json"

SSH_PORT = int(os.getenv("SIEM_SSH_PORT", "1023"))
SSH_USER = os.getenv("SIEM_SSH_USER", "kyle")
SCAN_CACHE_TTL = int(os.getenv("SIEM_SCAN_CACHE_TTL", "120"))
CONNECT_TIMEOUT = int(os.getenv("SIEM_CONNECT_TIMEOUT", "3"))

# Default cluster nodes from the old hard-coded config in siem_discovery.py.
SEED_CLUSTER_NODES = [
    {"hostname": "jarvis", "tailscale_ip": "100.77.187.108", "role": "orchestrator", "lan_ip": "192.168.6.237"},
    {"hostname": "ray", "tailscale_ip": "100.87.90.103", "role": "worker", "lan_ip": "192.168.6.238"},
    {"hostname": "fleet", "tailscale_ip": "100.120.75.92", "role": "worker", "lan_ip": "192.168.6.236"},
]


# ---------------------------------------------------------------------------
# SSH / network primitives
# ---------------------------------------------------------------------------
def ssh_exec(ip, cmd, timeout=10, port=None, user=None):
    """Run a command on a remote host via SSH. Returns (success, stdout, stderr)."""
    try:
        proc = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes",
             f"-o", "ConnectTimeout={CONNECT_TIMEOUT}", "-p", str(port or SSH_PORT),
             f"{user or SSH_USER}@{ip}", cmd],
            capture_output=True, text=True, timeout=timeout,
        )
        return proc.returncode == 0, proc.stdout.strip(), proc.stderr.strip()
    except Exception as e:
        return False, "", str(e)


def ping_host(ip, count=3, timeout=8):
    """ICMP reachability + RTT estimate via the system ping binary."""
    try:
        proc = subprocess.run(
            ["ping", "-c", str(count), "-W", "1", "-q", ip],
            capture_output=True, text=True, timeout=timeout,
        )
        out = proc.stdout or ""
        loss = 100.0
        m = re.search(r"(\d+(?:\.\d+)?)%\s+packet loss", out)
        if m:
            loss = float(m.group(1))
        latency = None
        m = re.search(r"rtt min/avg/max/mdev = [\d.]+/([\d.]+)/", out)
        if m:
            latency = round(float(m.group(1)), 2)
        return {
            "reachable": proc.returncode == 0 and loss < 100,
            "latency_ms": latency,
            "packet_loss": round(loss, 1),
            "error": (proc.stderr or "").strip()[:120] or None,
        }
    except Exception as e:
        return {"reachable": False, "latency_ms": None, "packet_loss": 100.0, "error": str(e)[:120]}


def tcp_probe(ip, port, timeout=1.0):
    """True if a TCP connect to ip:port succeeds."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False


def _bundled_ssh(ip, sections, timeout=20):
    """Run several commands over SSH in a single round trip.

    sections: ordered list of (marker, command) tuples.
    Returns dict marker -> list of output lines (marker lines excluded),
    or None if the SSH session produced no output at all.
    """
    script = "; ".join(f"echo '@@{m}'; {c}" for m, c in sections)
    ok, out, err = ssh_exec(ip, script, timeout=timeout)
    if not out and not ok:
        return None
    result = {}
    current = None
    for line in out.split("\n"):
        line = line.rstrip("\r")
        if line.startswith("@@"):
            current = line[2:]
            result[current] = []
        elif current is not None:
            result[current].append(line)
    return result


# ---------------------------------------------------------------------------
# Remote inventory scan
# ---------------------------------------------------------------------------
def _empty_result(ip):
    return {
        "ip": ip,
        "label": None,
        "hostname": None,
        "online": False,
        "error": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": 0,
        "loadavg": {"1min": 0, "5min": 0, "15min": 0},
        "cpu": {"percent": 0, "count": None, "frequency": None, "per_cpu": []},
        "memory": {"total": 0, "used": 0, "free": 0, "percent": 0, "available": 0,
                   "swap_total": 0, "swap_used": 0, "swap_free": 0, "swap_percent": 0},
        "disks": [],
        "network": {"bytes_sent": 0, "bytes_recv": 0, "packets_sent": 0, "packets_recv": 0,
                    "errors_in": 0, "dropped_out": 0, "interfaces": {}},
        "processes": [],
        "services": [],
        "ports": [],
        "services_count": 0,
        "listening_ports_count": 0,
        "thermal": {"temp_c": None, "throttled": None, "flags": []},
    }


THROTTLED_FLAG_LABELS = {
    0: "soft temp limit",
    1: "soft temp limit occurred",
    2: "throttling now",
    3: "throttling occurred",
    16: "under-voltage",
    17: "under-voltage occurred",
}


def parse_thermal_output(lines):
    """Parse `vcgencmd measure_temp` / `get_throttled` output (or empty).

    Returns {"temp_c": float|None, "throttled": "0x.."|None, "flags": [...]}.
    """
    thermal = {"temp_c": None, "throttled": None, "flags": []}
    for line in lines or []:
        m = re.search(r"temp=([\d.]+)", line)
        if m:
            thermal["temp_c"] = round(float(m.group(1)), 1)
            continue
        m = re.search(r"throttled=0x([0-9a-fA-F]+)", line)
        if m:
            flags_val = int(m.group(1), 16)
            thermal["throttled"] = f"0x{flags_val:x}"
            thermal["flags"] = [
                THROTTLED_FLAG_LABELS[i]
                for i in sorted(THROTTLED_FLAG_LABELS)
                if flags_val & (1 << i)
            ]
    return thermal


def _parse_ss_output(lines):
    """Parse `ss -lntup` output into normalized {protocol, local_addr, port, pid, process}."""
    ports = []
    for line in lines:
        parts = line.split()
        if len(parts) < 5:
            continue
        proto = parts[0]
        if proto not in ("tcp", "tcp6", "udp", "udp6"):
            continue
        proc_field = " ".join(parts[5:]) if len(parts) > 5 else ""
        pid = None
        process = None
        m = re.search(r"pid=(\d+)", proc_field)
        if m:
            pid = m.group(1)
        m = re.search(r'users:\(\("([^"]+)"', proc_field)
        if m:
            process = m.group(1)
        local = parts[3]
        port = local.rsplit(":", 1)[-1]
        if not port.isdigit():
            continue
        ports.append({
            "protocol": "tcp" if proto.startswith("tcp") else "udp",
            "local_addr": local,
            "ip": local.rsplit(":", 1)[0],
            "port": int(port),
            "pid": pid,
            "process": process,
        })
    return ports


def _parse_systemctl(lines):
    """Parse `systemctl list-units --type=service` output rows."""
    services = []
    for line in lines:
        parts = line.split()
        if len(parts) < 4:
            continue
        services.append({
            "name": parts[0],
            "load_state": parts[1],
            "active_state": parts[2],
            "sub_state": parts[3],
            "description": " ".join(parts[4:]),
        })
    return services


def _remote_scan_impl(ip, timeout=20):
    result = _empty_result(ip)
    bundles = _bundled_ssh(ip, [
        ("H", "hostname"),
        ("U", "cat /proc/uptime 2>/dev/null"),
        ("L", "cat /proc/loadavg 2>/dev/null"),
        ("C", "top -bn1 2>/dev/null | grep -m1 'Cpu(s)'"),
        ("M", "free -m 2>/dev/null"),
        ("D", "df -BM --output=source,size,used,avail,pcent,target 2>/dev/null | tail -n +2"),
        ("N", "cat /proc/net/dev 2>/dev/null | tail -n +3"),
        ("P", "top -bn1 2>/dev/null | head -16 | tail -15"),
        ("S", "systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null"),
        ("PS", "ss -lntup 2>/dev/null"),
        ("T", "vcgencmd measure_temp 2>/dev/null; vcgencmd get_throttled 2>/dev/null"),
    ], timeout=timeout)
    if bundles is None:
        result["error"] = "SSH unreachable"
        return result

    if bundles.get("H"):
        result["hostname"] = bundles["H"][0].strip()

    try:
        if bundles.get("U"):
            result["uptime_seconds"] = float(bundles["U"][0])
    except (ValueError, IndexError):
        pass

    if bundles.get("L"):
        parts = bundles["L"][0].split()
        if len(parts) >= 3:
            try:
                result["loadavg"] = {"1min": float(parts[0]), "5min": float(parts[1]), "15min": float(parts[2])}
            except ValueError:
                pass

    if bundles.get("C"):
        parts = bundles["C"][0].split()
        if len(parts) >= 2:
            try:
                result["cpu"]["percent"] = float(parts[1].replace(",", ""))
            except ValueError:
                pass

    if bundles.get("M"):
        _free_fields(result["memory"], bundles["M"], "Mem:")
        swap = {}
        _free_fields(swap, bundles["M"], "Swap:")
        result["memory"].update({
            "swap_total": swap.get("total", 0),
            "swap_used": swap.get("used", 0),
            "swap_free": swap.get("free", 0),
            "swap_percent": swap.get("percent", 0),
        })

    if bundles.get("D"):
        for line in bundles["D"]:
            parts = line.split()
            if len(parts) >= 5:
                try:
                    total_mb = int(parts[1].replace("M", ""))
                    used_mb = int(parts[2].replace("M", ""))
                    avail_mb = int(parts[3].replace("M", ""))
                    percent = int(parts[4].replace("%", ""))
                    result["disks"].append({
                        "device": parts[0],
                        "mountpoint": parts[5] if len(parts) > 5 else "/",
                        "fstype": "",
                        "total": total_mb * 1024 * 1024,
                        "used": used_mb * 1024 * 1024,
                        "free": avail_mb * 1024 * 1024,
                        "percent": percent,
                        "total_mb": total_mb,
                        "used_mb": used_mb,
                        "free_mb": avail_mb,
                    })
                except (ValueError, IndexError):
                    pass

    if bundles.get("N"):
        interfaces = {}
        for line in bundles["N"]:
            parts = line.split()
            if len(parts) >= 16:
                iface = parts[0].rstrip(":")
                if iface == "lo":
                    continue
                try:
                    rx = int(parts[1]); tx = int(parts[9])
                    rp = int(parts[2]); tp = int(parts[10])
                    interfaces[iface] = {
                        "bytes_sent": tx,
                        "bytes_recv": rx,
                        "packets_sent": tp,
                        "packets_recv": rp,
                    }
                except (ValueError, IndexError):
                    pass
        result["network"]["interfaces"] = interfaces

    if bundles.get("P"):
        for line in bundles["P"]:
            parts = line.split()
            if len(parts) >= 11:
                try:
                    cpu = float(parts[8].replace(",", "")) if parts[8].replace(",", "").replace(".", "").isdigit() else 0
                    mem = float(parts[9].replace(",", "")) if parts[9].replace(",", "").replace(".", "").isdigit() else 0
                    result["processes"].append({
                        "pid": int(parts[0]),
                        "user": parts[1],
                        "cpu": cpu,
                        "memory": mem,
                        "name": " ".join(parts[11:]),
                    })
                except (ValueError, IndexError):
                    pass

    if bundles.get("S"):
        result["services"] = _parse_systemctl(bundles["S"])

    if bundles.get("PS"):
        result["ports"] = _parse_ss_output(bundles["PS"])

    if bundles.get("T"):
        result["thermal"] = parse_thermal_output(bundles["T"])

    result["services_count"] = len(result["services"])
    result["listening_ports_count"] = len(result["ports"])
    result["online"] = result["hostname"] is not None or result["uptime_seconds"] > 0
    return result


def _free_fields(memory, lines, prefix):
    """Fill memory dict from a `free -m` line. Returns True on success."""
    for line in lines:
        if line.startswith(prefix):
            parts = line.split()
            if len(parts) >= 4:
                total = int(parts[1]); used = int(parts[2]); free = int(parts[3])
                memory["total"] = total * 1024 * 1024
                memory["used"] = used * 1024 * 1024
                memory["free"] = free * 1024 * 1024
                memory["available"] = (int(parts[6]) if len(parts) > 6 else free) * 1024 * 1024
                memory["percent"] = (used / total) * 100 if total > 0 else 0
                return True
    return False


# ---------------------------------------------------------------------------
# Remote scan cache
# ---------------------------------------------------------------------------
_scan_cache = {}          # ip -> (scan_clock, result)
_cache_lock = threading.Lock()


def _cache_get(ip, max_age=SCAN_CACHE_TTL):
    with _cache_lock:
        ent = _scan_cache.get(ip)
        if ent and (time.time() - ent[0]) < max_age:
            return ent[1]
    return None


def _cache_put(ip, result):
    with _cache_lock:
        _scan_cache[ip] = (time.time(), result)


def remote_scan(ip, force=False, timeout=20):
    """Full remote inventory scan with TTL caching (pass force=True to bypass)."""
    if not force:
        cached = _cache_get(ip)
        if cached is not None:
            return cached
    result = _remote_scan_impl(ip, timeout=timeout)
    _cache_put(ip, result)
    return result


def scan_entry(entry, force=False):
    """Scan a registry entry across its fallback IPs (LAN first, then tailnet)."""
    ips = [x for x in (entry.get("ips") or [entry.get("ip")]) if x]
    if not ips:
        return {"error": "no address configured", "online": False}
    result = None
    for ip in ips:
        result = remote_scan(ip, force=force)
        result["label"] = entry.get("label")
        entry["resolved_ip"] = ip
        if result["online"]:
            return result
    result = result or remote_scan(ips[0], force=force)
    result["label"] = entry.get("label")
    return result


def cluster_node_payload(entry, res):
    """Map a registry entry + scan result to the legacy /api/cluster node shape."""
    entry_ips = [x for x in (entry.get("ips") or [entry.get("ip")]) if x]
    online = bool(res and res.get("online"))
    return {
        "hostname": (res.get("hostname") or entry.get("label") or entry.get("ip")) if res else entry.get("label"),
        "label": entry.get("label"),
        "role": entry.get("role"),
        "lan_ip": entry.get("ip"),
        "tailscale_ip": entry_ips[-1] if len(entry_ips) > 1 else None,
        "online": online,
        "cpu_percent": res.get("cpu", {}).get("percent") if online and res else None,
        "memory_percent": res.get("memory", {}).get("percent") if online and res else None,
        "services_count": len(res.get("services", [])) if online and res else None,
        "listening_ports_count": len(res.get("ports", [])) if online and res else None,
        "disk_usage": [{"mountpoint": d.get("mountpoint", "/"), "percent": d.get("percent", 0)}
                       for d in res.get("disks", [])] if online and res else [],
        "error": (res or {}).get("error"),
        "last_checked": (res or {}).get("timestamp"),
        "ip": (res or {}).get("ip"),
    }


# ---------------------------------------------------------------------------
# Endpoint registry
# ---------------------------------------------------------------------------
class Registry:
    def __init__(self, path=REGISTRY_PATH):
        self.path = Path(path)
        self._lock = threading.RLock()  # reentrant: add/get/save nest via public wrappers
        self.entries = []
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self):
        with self._lock:
            if self.path.exists():
                try:
                    data = json.loads(self.path.read_text())
                    self.entries = data.get("endpoints", data if isinstance(data, list) else [])
                    self.entries = [e for e in self.entries if e.get("ip")]
                except Exception:
                    self.entries = []
            if self.entries:
                return self.entries
            self.entries = self._seed()
            self._save_unlocked()
            return self.entries

    def _seed(self):
        """Build the initial registry from cluster nodes + legacy custom servers."""
        now = datetime.now(timezone.utc).isoformat()
        seeded = []
        for node in SEED_CLUSTER_NODES:
            ips = [x for x in (node.get("lan_ip"), node.get("tailscale_ip")) if x]
            seeded.append({
                "ip": ips[0],
                "ips": ips,
                "hostname": node.get("hostname"),
                "label": node.get("hostname"),
                "role": node.get("role", "worker"),
                "tags": [],
                "source": "seed",
                "added_at": now,
            })
        covered = set()
        for e in seeded:
            covered.update(e.get("ips", [e.get("ip")]))
        for old in _load_legacy_custom_servers():
            ip = old.get("ip")
            if not ip or ip in covered:
                continue
            seeded.append({
                "ip": ip,
                "ips": [ip],
                "label": old.get("label") or ip,
                "role": "custom",
                "tags": [],
                "source": "custom",
                "added_at": old.get("added_at") or now,
            })
            covered.add(ip)
        return seeded

    def save(self):
        with self._lock:
            self._save_unlocked()

    def _save_unlocked(self):
        self.path.write_text(json.dumps({"endpoints": self.entries}, indent=2))

    def all(self):
        with self._lock:
            return list(self.entries)

    def get(self, ip):
        with self._lock:
            return next((e for e in self.entries if e.get("ip") == ip), None)

    def hosts(self):
        with self._lock:
            return set(ip for e in self.entries for ip in (e.get("ips") or [e.get("ip")]))

    def cluster(self):
        with self._lock:
            return [e for e in self.entries if e.get("role") in ("orchestrator", "worker")]

    def custom(self):
        with self._lock:
            return [e for e in self.entries if e.get("role") not in ("orchestrator", "worker")]

    def add(self, ip, label=None, role="custom", tags=None, source="custom"):
        with self._lock:
            if any(ip in (e.get("ips") or [e.get("ip")]) for e in self.entries):
                return {"action": "exists", "ip": ip, "endpoint": self.get(ip)}
            entry = {
                "ip": ip,
                "ips": [ip],
                "label": label or ip,
                "role": role,
                "tags": tags or [],
                "source": source,
                "added_at": datetime.now(timezone.utc).isoformat(),
            }
            self.entries.append(entry)
            self.save()
            return {"action": "added", "ip": ip, "endpoint": entry}

    def remove(self, ip):
        with self._lock:
            before = len(self.entries)
            self.entries = [e for e in self.entries if e.get("ip") != ip and ip not in (e.get("ips") or [])]
            removed = len(self.entries) < before
            if removed:
                self.save()
            return removed

    def set_role(self, ip, role, tags=None):
        with self._lock:
            e = next((e for e in self.entries if e.get("ip") == ip or ip in (e.get("ips") or [])), None)
            if not e:
                return False
            e["role"] = role
            if tags is not None:
                e["tags"] = tags
            self.save()
            return True


def _load_legacy_custom_servers():
    """Loads the legacy data/custom_servers.json (either shape)."""
    if not LEGACY_SERVERS_PATH.exists():
        return []
    try:
        data = json.loads(LEGACY_SERVERS_PATH.read_text())
        if isinstance(data, dict):
            return data.get("servers", [])
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


registry = Registry()
registry.load()


# ---------------------------------------------------------------------------
# LAN sweep
# ---------------------------------------------------------------------------
def _arp_table():
    """Parse /proc/net/arp into [{ip, mac, interface, source}]."""
    hosts = []
    seen = set()
    try:
        with open("/proc/net/arp") as f:
            next(f, None)
            for line in f:
                parts = line.split()
                if len(parts) >= 4:
                    ip, mac = parts[0], parts[3]
                    if ip == "0.0.0.0" or "ff:ff:ff:ff:ff:ff" in mac or ip in ("127.0.0.1",):
                        continue
                    if ip in seen:
                        continue
                    seen.add(ip)
                    hosts.append({
                        "ip": ip,
                        "mac": mac,
                        "interface": parts[5] if len(parts) > 5 else "",
                        "hostname": None,
                        "reachable": None,
                        "latency_ms": None,
                        "source": "arp",
                    })
    except Exception:
        pass
    return hosts


def _local_subnet():
    """Best-effort local subnet from hostname -I (e.g. /24 of the first IP)."""
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5).stdout
        for token in out.split():
            if "." in token:
                base = ".".join(token.split(".")[:3])
                return f"{base}.0/24"
    except Exception:
        pass
    return None


def _ping_candidate(host, timeout=2):
    probe = ping_host(host["ip"], count=1, timeout=timeout)
    host["reachable"] = probe["reachable"]
    host["latency_ms"] = probe["latency_ms"]
    return host


def _resolve_hostname(host):
    if host.get("hostname"):
        return host
    try:
        host["hostname"] = socket.gethostbyaddr(host["ip"])[0]
    except Exception:
        pass
    return host


def lan_sweep(include_ping=True, max_workers=32, timeout=12):
    """Discover hosts on the local network (ARP + optional ICMP sweep).

    DNS reverse lookups are only attempted for hosts already known via ARP or
    that responded to ping, and the whole sweep is time-budgeted so a slow
    resolver can never stall a dashboard request.
    """
    started = time.monotonic()
    hosts = _arp_table()
    by_ip = {h["ip"]: h for h in hosts}

    subnet = _local_subnet()
    if include_ping and subnet:
        try:
            base = subnet.split("/")[0].rsplit(".", 1)[0]
            candidates = [f"{base}.{i}" for i in range(1, 255)]
            todo = [c for c in candidates if c not in by_ip]
            with ThreadPoolExecutor(max_workers=max_workers) as pool:
                futures = {pool.submit(_ping_candidate, {"ip": ip, "mac": "", "interface": "",
                                                          "hostname": None, "reachable": None,
                                                          "latency_ms": None, "source": "ping"}): ip
                           for ip in todo}
                while futures and (time.monotonic() - started) < timeout:
                    done, futures = _wait_threads(futures, timeout - (time.monotonic() - started))
                    for fut in done:
                        h = fut.result()
                        if h.get("reachable"):
                            by_ip.setdefault(h["ip"], h)
        except Exception:
            pass

    # Reverse-resolve only the handful of hosts we already know about.
    resolve_targets = [h for h in by_ip.values() if h.get("source") == "arp" or h.get("reachable")]
    remaining = timeout - (time.monotonic() - started)
    if resolve_targets and remaining > 1:
        try:
            with ThreadPoolExecutor(max_workers=16) as pool:
                futures = {pool.submit(_resolve_hostname, h): h for h in resolve_targets}
                try:
                    _wait_threads(futures, remaining)
                except Exception:
                    pass
        except Exception:
            pass

    discovered = list(by_ip.values())
    discovered.sort(key=lambda h: (h.get("reachable") is not True, h["ip"]))
    return discovered


def _wait_threads(futures, timeout):
    """Wait on a dict of futures for a duration; returns (done, pending)."""
    if timeout <= 0:
        return [], list(futures)
    from concurrent.futures import wait as _wait
    done, pending = _wait(set(futures), timeout=timeout)
    for f in pending:
        f.cancel()
    return list(done), list(pending)


def sweep_known_ports(endpoints, ports=(22, 80, 443, 8170, 5005)):
    """Quick TCP connectivity map for a set of endpoints and ports."""
    rows = []
    for e in (endpoints or []):
        entry_ips = [x for x in (e.get("ips") or [e.get("ip")]) if x]
        ip = entry_ips[0] if entry_ips else e.get("ip")
        row = {"ip": ip, "label": e.get("label"), "ports": {}}
        for port in ports:
            row["ports"][port] = tcp_probe(ip, port)
        rows.append(row)
    return rows