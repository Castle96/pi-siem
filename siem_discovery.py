"""
siem_discovery.py — Service discovery and cluster monitoring for Jarvis SIEM.
Discovers: systemd services, listening ports, cluster nodes (jarvis/ray/fleet), docker containers.
Exposes: /api/services, /api/ports, /api/cluster
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

try:
    import requests
except ImportError:
    requests = None

# Cluster node configs from existing cluster_config.py
CLUSTER_NODES = [
    {"hostname": "jarvis", "tailscale_ip": "100.77.187.108", "role": "orchestrator", "lan_ip": "192.168.6.237"},
    {"hostname": "ray", "tailscale_ip": "100.87.90.103", "role": "worker", "lan_ip": "192.168.6.238"},
    {"hostname": "fleet", "tailscale_ip": "100.120.75.92", "role": "worker", "lan_ip": "192.168.6.236"},
]

SSH_PORT = 1023
SSH_USER = "kyle"


def get_systemd_services():
    """Get all systemd services with their state."""
    services = []
    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().split("\n"):
            parts = line.split()
            if len(parts) >= 4:
                services.append({
                    "name": parts[0],
                    "load_state": parts[1],
                    "active_state": parts[2],
                    "sub_state": parts[3] if len(parts) > 3 else "",
                    "description": " ".join(parts[4:]) if len(parts) > 4 else "",
                })
    except Exception as e:
        return {"error": str(e)}
    return services


def get_active_services():
    """Get only active/running services."""
    all_services = get_systemd_services()
    if isinstance(all_services, dict) and "error" in all_services:
        return all_services
    return [s for s in all_services if s["active_state"] in ("active", "reloading")]


def get_inactive_services():
    """Get inactive/failed services."""
    all_services = get_systemd_services()
    if isinstance(all_services, dict) and "error" in all_services:
        return all_services
    return [s for s in all_services if s["active_state"] not in ("active", "reloading")]


def get_listening_ports():
    """Get all listening TCP/UDP ports."""
    ports = []
    if psutil:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" and conn.laddr:
                ports.append({
                    "protocol": conn.type.name,
                    "local_addr": f"{conn.laddr.ip}:{conn.laddr.port}",
                    "pid": conn.pid,
                    "process": _get_process_name(conn.pid) if conn.pid else None,
                })
    else:
        # Fallback: parse ss output
        try:
            result = subprocess.run(["ss", "-tlnp", "-u", "-l"], capture_output=True, text=True, timeout=10)
            for line in result.stdout.strip().split("\n")[1:]:
                parts = line.split()
                if len(parts) >= 4:
                    addr = parts[3]
                    pid_match = None
                    for part in parts:
                        if part.startswith("pid="):
                            pid_match = part[4:].split(",")[0]
                            break
                    ports.append({
                        "protocol": "tcp" if "LISTEN" in line else "udp",
                        "local_addr": addr,
                        "pid": pid_match,
                        "process": None,
                    })
        except Exception:
            pass
    return ports


def _get_process_name(pid):
    """Get process name by PID."""
    if psutil:
        try:
            return psutil.Process(pid).name()
        except Exception:
            return None
    try:
        result = subprocess.run(["ps", "-p", str(pid), "-o", "comm="], capture_output=True, text=True, timeout=5)
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def scan_cluster_node(node):
    """Scan a cluster node via SSH to get its status."""
    result = {
        "hostname": node["hostname"],
        "tailscale_ip": node["tailscale_ip"],
        "lan_ip": node["lan_ip"],
        "role": node["role"],
        "online": False,
        "services_count": 0,
        "active_services": [],
        "listening_ports": [],
        "disk_usage": [],
        "memory_percent": None,
        "cpu_percent": None,
        "last_checked": None,
        "error": None,
    }

    # Try LAN first, then tailnet
    for ip in [node["lan_ip"], node["tailscale_ip"]]:
        if not ip:
            continue
        result = _ssh_scan(node, ip, result)
        if result["online"]:
            break

    result["last_checked"] = datetime.now(timezone.utc).isoformat()
    return result


def _ssh_scan(node, ip, result):
    """Try to SSH into a node and gather info."""
    commands = [
        "systemctl list-units --type=service --state=active --no-legend --no-pager 2>/dev/null | wc -l",
        "systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null | grep -cE '(active|running)'",
        "df -h / /mnt/cluster 2>/dev/null | tail -n +2 | awk '{print $5}' | tr -d '%'",
        "free -m 2>/dev/null | awk '/Mem:/{print $3/$2*100}'",
        "top -bn1 2>/dev/null | grep 'Cpu(s)' | awk '{print $2}'",
        "ss -tlnp 2>/dev/null | grep LISTEN | wc -l",
    ]

    for cmd in commands:
        try:
            proc = subprocess.run(
                ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=3",
                 "-o", "BatchMode=yes", "-p", str(SSH_PORT), f"{SSH_USER}@{ip}", cmd],
                capture_output=True, text=True, timeout=10
            )
            if proc.returncode == 0:
                result["online"] = True
                output = proc.stdout.strip()
                if "wc -l" in cmd and output:
                    result["services_count"] = int(output)
                elif "grep -cE" in cmd and output:
                    result["active_services_count"] = int(output)
                elif "df -h" in cmd and output:
                    result["disk_usage"] = [{"mountpoint": "/", "percent": int(p)} for p in output.split() if p.isdigit()]
                elif "free -m" in cmd and output:
                    try:
                        result["memory_percent"] = float(output)
                    except ValueError:
                        pass
                elif "top -bn1" in cmd and output:
                    try:
                        result["cpu_percent"] = float(output.replace(",", ""))
                    except ValueError:
                        pass
                elif "ss -tlnp" in cmd and output:
                    result["listening_ports_count"] = int(output)
                break
        except Exception as e:
            result["error"] = str(e)

    return result


def scan_all_cluster():
    """Scan all cluster nodes."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(scan_cluster_node, node): node for node in CLUSTER_NODES}
        for future in as_completed(futures):
            results.append(future.result())

    # Sort by online status
    results.sort(key=lambda x: (not x["online"], x["hostname"]))
    return results


def get_services_summary():
    """Summary of all services."""
    active = get_active_services()
    if isinstance(active, dict) and "error" in active:
        return active
    return {
        "total": len(get_systemd_services()) if not isinstance(get_systemd_services(), dict) else 0,
        "active": len(active),
        "inactive": len(get_inactive_services()) if not isinstance(get_inactive_services(), dict) else 0,
        "critical": len([s for s in active if "network" in s["name"].lower() or "ssh" in s["name"].lower() or "docker" in s["name"].lower()]),
        "services": active[:20],  # top 20
    }


def get_cluster_summary():
    """Summary of cluster nodes."""
    nodes = scan_all_cluster()
    online = [n for n in nodes if n["online"]]
    total_disk = sum(sum(d["percent"] for d in n.get("disk_usage", [])) for n in nodes if n.get("disk_usage"))
    avg_mem = sum(n.get("memory_percent") or 0 for n in nodes) / len(nodes) if nodes else 0
    return {
        "total_nodes": len(nodes),
        "online_nodes": len(online),
        "offline_nodes": len(nodes) - len(online),
        "avg_disk_usage": total_disk / len(nodes) if nodes else 0,
        "avg_memory": avg_mem,
        "nodes": nodes,
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "services":
        print(json.dumps(get_services_summary(), indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "ports":
        print(json.dumps({"ports": get_listening_ports()}, indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "cluster":
        print(json.dumps(get_cluster_summary(), indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "node" and len(sys.argv) > 2:
        node = next((n for n in CLUSTER_NODES if n["hostname"] == sys.argv[2]), None)
        if node:
            print(json.dumps(scan_cluster_node(node), indent=2))
        else:
            print(json.dumps({"error": f"Unknown node: {sys.argv[2]}"}, indent=2))
    else:
        print(json.dumps({
            "services": get_services_summary(),
            "ports": {"ports": get_listening_ports()},
            "cluster": get_cluster_summary(),
        }, indent=2))
