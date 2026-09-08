"""
jarvis_sysmon.py — System resource monitoring for Jarvis SIEM dashboard.
Exposes: /api/system (cpu, memory, disk, processes, network)
Remote host monitoring is delegated to the unified engine in siem_network.py.
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

from siem_network import remote_scan

PORT = int(os.getenv("SIEM_SYSMON_PORT", "5005"))
COLLECT_INTERVAL = int(os.getenv("SIEM_SYSMON_INTERVAL", "5"))
COLLECT_HISTORY = int(os.getenv("SIEM_SYSMON_HISTORY", "60"))


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
            "errors_in": net.errin,
            "dropped_out": net.dropout,
            "interfaces": {
                iface: {"bytes_sent": s.bytes_sent, "bytes_recv": s.bytes_recv,
                        "packets_sent": s.packets_sent, "packets_recv": s.packets_recv}
                for iface, s in pernic.items() if not iface.startswith("lo")
            },
        }
    return {"bytes_sent": 0, "bytes_recv": 0, "packets_sent": 0, "packets_recv": 0,
            "errors_in": 0, "dropped_out": 0, "interfaces": {}}


def get_processes(limit=20):
    if psutil:
        procs = []
        for proc in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status"]),
                           key=lambda p: p.info.get("cpu_percent", 0) or 0, reverse=True)[:limit]:
            try:
                pi = proc.info
                procs.append({
                    "pid": pi["pid"],
                    "name": pi["name"],
                    "cpu": pi.get("cpu_percent", 0),
                    "memory_mb": (pi.get("memory_info").rss / 1024 / 1024) if pi.get("memory_info") else 0,
                    "status": pi.get("status", "unknown"),
                })
            except Exception:
                continue
        return procs
    return []


def get_thermal():
    """Raspberry Pi thermal telemetry via vcgencmd (no-op elsewhere)."""
    import subprocess

    def vcgencmd(name):
        try:
            out = subprocess.run(["vcgencmd", name],
                                 capture_output=True, text=True, timeout=3).stdout
            return out.strip()
        except Exception:
            return ""

    from siem_network import parse_thermal_output
    lines = []
    for cmd in ("measure_temp", "get_throttled"):
        out = vcgencmd(cmd)
        if out:
            lines.append(out)
    return parse_thermal_output(lines)


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
        "thermal": get_thermal(),
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
            p = f.read().split()
            return {"1min": float(p[0]), "5min": float(p[1]), "15min": float(p[2])}
    except Exception:
        return {"1min": 0, "5min": 0, "15min": 0}


def get_remote_system(ip):
    """Gather system info from a remote host (delegated to the unified engine)."""
    return remote_scan(ip)


class SysMonServer:
    def __init__(self, port=PORT):
        self.port = port
        self.history = []
        self.running = False

    def collect(self):
        state = get_system_status()
        self.history.append(state)
        now = time.time()
        self.history = [h for h in self.history if now - h["timestamp"].timestamp() < COLLECT_HISTORY]
        return state

    def run(self):
        self.running = True
        while self.running:
            self.collect()
            time.sleep(COLLECT_INTERVAL)

    def stop(self):
        self.running = False


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "collect":
        print(json.dumps(get_system_status(), indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "remote" and len(sys.argv) > 2:
        print(json.dumps(get_remote_system(sys.argv[2]), indent=2))
    else:
        server = SysMonServer()
        print(f"SysMon starting on port {PORT}, collecting every {COLLECT_INTERVAL}s")
        server.run()
