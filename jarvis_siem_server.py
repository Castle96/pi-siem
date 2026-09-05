"""
jarvis_siem_server.py — Serve the React dashboard and stream live SIEM data.

Usage:
    python3 jarvis_siem_server.py

Environment:
    SIEM_TAILNET_ONLY=1   -> restrict access to tailnet ranges only
    SIEM_PORT=8170        -> override listen port
"""

import json
import math
import os
import time
from pathlib import Path

from flask import Flask, Response, send_from_directory, request
from flask_sock import Sock

from siem_data import (
    get_alerts,
    get_metrics,
    get_nodes,
    get_agents,
    get_voice_events,
    seed_demo_data,
    seed_demo_agents,
    seed_demo_voice_events,
)

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dashboard" / "dist"

app = Flask(__name__, static_folder=None)
sock = Sock(app)

seed_demo_data()
seed_demo_agents()
seed_demo_voice_events()

PORT = int(os.getenv("SIEM_PORT", "8170"))
TAILNET_ONLY = os.getenv("SIEM_TAILNET_ONLY", "0") == "1"

# Tailnet CGNAT range + common VPC ranges used by tailscale
TAILNET_RANGES = [
    "100.64.0.0/10",
    "100.85.0.0/16",
    "100.105.0.0/16",
    "100.89.0.0/16",
    "100.120.0.0/16",
    "100.72.0.0/16",
    "100.121.0.0/16",
    "100.77.0.0/16",
    "100.127.0.0/16",
    "100.87.0.0/16",
]


def _ip_in_networks(ip: str, networks) -> bool:
    try:
        import ipaddress
        addr = ipaddress.ip_address(ip)
        return any(addr in ipaddress.ip_network(n, strict=False) for n in networks)
    except Exception:
        return False


@app.before_request
def restrict_to_tailnet():
    if not TAILNET_ONLY:
        return None
    if request.path.startswith("/ws"):
        # WebSocket: allow upgrade; IP check happens on handshake
        return None
    remote = request.remote_addr or ""
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    check_ip = forwarded or remote
    if not _ip_in_networks(check_ip, TAILNET_RANGES):
        return Response("Forbidden", status=403)
    return None


@app.route("/")
def index():
    return send_from_directory(str(DIST_DIR), "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(str(DIST_DIR), path)


@app.route("/api/alerts")
def api_alerts():
    limit = request.args.get("limit", type=int)
    alerts = get_alerts(limit=limit) if limit else get_alerts()
    return {"alerts": alerts}


@app.route("/api/metrics")
def api_metrics():
    return {"metrics": get_metrics()}


@app.route("/api/nodes")
def api_nodes():
    return {"nodes": get_nodes()}


@app.route("/api/agents")
def api_agents():
    return {"agents": get_agents()}


@app.route("/api/storage")
def api_storage():
    cluster_path = Path("/mnt/cluster")
    result = []
    try:
        if cluster_path.exists() and cluster_path.is_dir():
            total = 0
            used = 0
            free = 0
            st = os.statvfs(str(cluster_path))
            total = st.f_blocks * st.f_frsize
            free = st.f_bfree * st.f_frsize
            used = total - free
            result.append({
                "path": str(cluster_path),
                "total": total,
                "used": used,
                "free": free,
                "available": free,
                "usePercent": round((used / total) * 100, 1) if total else 0,
            })
    except Exception as e:
        return {"storage": [], "error": str(e)}
    return {"storage": result}


@app.route("/api/voice/events")
def api_voice_events():
    return {"voiceEvents": get_voice_events()}


@sock.route("/ws")
def websocket(ws):
    while True:
        nodes = get_nodes()
        metrics = get_metrics()
        alerts = get_alerts()
        agents = get_agents()
        voice_events = get_voice_events()
        payload = {
            "type": "update",
            "nodes": nodes,
            "metrics": metrics,
            "alerts": alerts,
            "agents": agents,
            "voiceEvents": voice_events,
        }
        try:
            ws.send(json.dumps(payload))
        except Exception:
            break
        time.sleep(1)


if __name__ == "__main__":
    if not DIST_DIR.exists():
        raise SystemExit(f"Missing built dashboard at {DIST_DIR}. Run `npm run build` first.")
    app.run(host="0.0.0.0", port=PORT)
