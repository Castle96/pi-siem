"""
siem_discovery.py — Service discovery and cluster monitoring for Jarvis SIEM.
Discovers: systemd services, listening ports, cluster nodes (from the endpoint
registry), docker containers.
Exposes: /api/services, /api/ports, /api/cluster

Remote scanning is delegated to the unified engine in siem_network.py.
"""

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    import psutil
except ImportError:
    psutil = None

try:
    import requests
except ImportError:
    requests = None

from siem_network import registry, scan_entry, cluster_node_payload


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
    """Get all listening TCP/UDP ports (protocol normalized to tcp/udp)."""
    ports = []
    if psutil:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" and conn.laddr:
                ports.append({
                    "protocol": "tcp" if conn.type == getattr(psutil, "SOCK_STREAM", 1) else "udp",
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
    """Scan a cluster node (registry entry) via the unified engine."""
    entry = node if isinstance(node, dict) and node.get("ips") else registry.get(node.get("ip") if isinstance(node, dict) else node)
    if not entry:
        return {"error": "unknown node", "online": False}
    result = scan_entry(entry)
    payload = cluster_node_payload(entry, result)
    payload["last_checked"] = datetime.now(timezone.utc).isoformat()
    return payload


def scan_all_cluster():
    """Scan all cluster nodes (from the registry) in parallel."""
    nodes = registry.cluster()
    results = []
    with ThreadPoolExecutor(max_workers=max(3, len(nodes))) as executor:
        futures = {executor.submit(scan_entry, node): node for node in nodes}
        for future in as_completed(futures):
            entry = futures[future]
            try:
                res = future.result()
            except Exception:
                res = {"error": "scan failed", "online": False}
            results.append(cluster_node_payload(entry, res))
    results.sort(key=lambda x: (not x["online"], x["hostname"] or ""))
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
        node = next((n for n in registry.cluster() if n.get("label") == sys.argv[2] or sys.argv[2] in (n.get("ips") or [])), None)
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