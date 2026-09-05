"""
jarvis_sysmon.py — System resource monitoring for Jarvis SIEM dashboard.
Exposes: /api/system (cpu, memory, disk, processes, network)
Runs as: standalone HTTP server or imported into jarvis_siem_server.py
"""

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

PORT = int(os.getenv("SIEM_SYSMON_PORT", "5005"))
COLLECT_INTERVAL = int(os.getenv("SIEM_SYSMON_INTERVAL", "5"))
COLLECT_HISTORY = int(os.getenv("SIEM_SYSMON_HISTORY", "60"))  # seconds of history


def get_cpu():
    if psutil:
        return {
            "percent": psutil.cpu_percent(interval=0.5),
            "count": psutil.cpu_count(logical=True),
            "frequency": psutil.cpu_freq().current if psutil.cpu_freq() else None,
            "per_cpu": psutil.cpu_percent(interval=0.5, percpu=True),
        }
    return {"percent": 0, "count": 4, "frequency": None, "per_cpu": []}


def get_memory():
    if psutil:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            "total": mem.total,
            "used": mem.used,
            "free": mem.free,
            "percent": mem.percent,
            "available": mem.available,
            "swap_total": swap.total,
            "swap_used": swap.used,
            "swap_free": swap.free,
            "swap_percent": swap.percent,
        }
    return {
        "total": 0, "used": 0, "free": 0, "percent": 0,
        "available": 0, "swap_total": 0, "swap_used": 0, "swap_free": 0, "swap_percent": 0,
    }


def get_disk():
    if psutil:
        disks = []
        for part in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                })
            except Exception:
                continue
        return disks
    return []


def get_network():
    if psutil:
        net = psutil.net_io_counters()
        pernic = psutil.net_io_counters(pernic=True)
        return {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
            "erors_in": net.errin,
            "dropped_out": net.dropout,
            "interfaces": {
                iface: {
                    "bytes_sent": stats.bytes_sent,
                    "bytes_recv": stats.bytes_recv,
                    "packets_sent": stats.packets_sent,
                    "packets_recv": stats.packets_recv,
                }
                for iface, stats in pernic.items()
                if not iface.startswith("lo")
            },
        }
    return {"bytes_sent": 0, "bytes_recv": 0, "packets_sent": 0, "packets_recv": 0, "errors_in": 0, "dropped_out": 0, "interfaces": {}}


def get_processes(limit=20):
    if psutil:
        procs = []
        for proc in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status"]), key=lambda p: p.info.get("cpu_percent", 0) or 0, reverse=True)[:limit]:
            try:
                pinfo = proc.info
                procs.append({
                    "pid": pinfo["pid"],
                    "name": pinfo["name"],
                    "cpu": pinfo.get("cpu_percent", 0),
                    "memory_mb": (pinfo.get("memory_info").rss / 1024 / 1024) if pinfo.get("memory_info") else 0,
                    "status": pinfo.get("status", "unknown"),
                })
            except Exception:
                continue
        return procs
    return []


def get_system_status():
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": _get_uptime(),
        "loadavg": _get_loadavg(),
        "cpu": get_cpu(),
        "memory": get_memory(),
        "disks": get_disk(),
        "network": get_network(),
        "processes": get_processes(20),
    }


def _get_uptime():
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except Exception:
        return 0


def _get_loadavg():
    try:
        with open("/proc/loadavg") as f:
            parts = f.read().split()
            return {"1min": float(parts[0]), "5min": float(parts[1]), "15min": float(parts[2])}
    except Exception:
        return {"1min": 0, "5min": 0, "15min": 0}


class SysMonServer:
    def __init__(self, port=PORT):
        self.port = port
        self.history = []
        self.running = False

    def collect(self):
        """Collect current system state."""
        state = get_system_status()
        self.history.append(state)
        # Prune history
        now = time.time()
        self.history = [h for h in self.history if now - h["timestamp"].timestamp() < COLLECT_HISTORY]
        return state

    def get_history(self, metric="cpu", key="percent"):
        """Return time series for a metric."""
        series = []
        for h in self.history:
            if metric == "cpu" and "cpu" in h:
                series.append({"t": h["timestamp"].isoformat(), "v": h["cpu"].get(key, 0)})
            elif metric == "memory" and "memory" in h:
                series.append({"t": h["timestamp"].isoformat(), "v": h["memory"].get(key, 0)})
            elif metric == "disk" and "disks" in h:
                for d in h["disks"]:
                    if d["mountpoint"] == "/":
                        series.append({"t": h["timestamp"].isoformat(), "v": d.get(key, 0)})
        return series[-100:]

    def run(self):
        """Run the collection loop (for systemd service)."""
        self.running = True
        while self.running:
            self.collect()
            time.sleep(COLLECT_INTERVAL)

    def stop(self):
        self.running = False


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "collect":
        # One-shot collect for API use
        print(json.dumps(get_system_status(), indent=2))
    else:
        server = SysMonServer()
        print(f"SysMon starting on port {PORT}, collecting every {COLLECT_INTERVAL}s")
        server.run()
