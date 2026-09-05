"""
jarvis_siem_server.py — Serve the React dashboard and stream live SIEM data.

Usage:
    python3 jarvis_siem_server.py

Endpoints:
    /           -> serves dashboard/dist/index.html and static assets
    /ws         -> WebSocket streaming threat map + metrics updates
    /api/alerts -> JSON alert feed
    /api/metrics -> JSON metrics history
"""

import json
import math
import os
import random
import threading
import time
from pathlib import Path

from flask import Flask, send_from_directory
from flask_sock import Sock

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dashboard" / "dist"

app = Flask(__name__, static_folder=None)
sock = Sock(app)

ALERT_SEVERITIES = ["low", "medium", "high"]
ALERT_TEMPLATES = [
    "Brute-force pattern detected on {ip}",
    "Unusual outbound traffic on port {port}",
    "Failed login spike from subnet {subnet}",
    "Potential data exfil via DNS tunnel",
    "Ransomware beacon to {ip}",
    "Suspicious cron job on host {host}",
    "SSH dictionary attack from {ip}",
    "TLS cert mismatch on {host}:443",
]


def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_subnet():
    return f"192.168.{random.randint(0,255)}.0/24"


def random_host():
    return f"node-{random.randint(10,99)}"


def generate_alert():
    template = random.choice(ALERT_TEMPLATES)
    text = template.format(ip=random_ip(), port=random.randint(1024, 65535),
                           subnet=random_subnet(), host=random_host())
    return {
        "id": int(time.time() * 1000),
        "severity": random.choice(ALERT_SEVERITIES),
        "text": text,
    }


# In-memory state
state = {
    "nodes": [],
    "metrics": [],
    "alerts": [],
}

# Initialize nodes
for _ in range(24):
    state["nodes"].append({
        "x": random.random(),
        "y": random.random(),
        "r": 1.5 + random.random() * 2.5,
        "phase": random.random() * math.pi * 2,
        "speed": 0.4 + random.random() * 1.2,
        "active": random.random() < 0.18,
    })

for _ in range(60):
    state["metrics"].append(random.randint(20, 90))

for _ in range(4):
    state["alerts"].append(generate_alert())


@app.route("/")
def index():
    return send_from_directory(str(DIST_DIR), "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(str(DIST_DIR), path)


@app.route("/api/alerts")
def api_alerts():
    return {"alerts": state["alerts"]}


@app.route("/api/metrics")
def api_metrics():
    return {"metrics": state["metrics"]}


@sock.route("/ws")
def websocket(ws):
    while True:
        # Update nodes
        for n in state["nodes"]:
            n.x = max(0.0, min(1.0, n.x + random.uniform(-0.02, 0.02)))
            n.y = max(0.0, min(1.0, n.y + random.uniform(-0.02, 0.02)))
            if random.random() < 0.02:
                n.active = not n.active

        # Update metrics
        last = state["metrics"][-1]
        next_val = max(5, min(98, last + random.randint(-8, 8)))
        state["metrics"].append(next_val)
        if len(state["metrics"]) > 120:
            state["metrics"] = state["metrics"][-120:]

        # Occasionally push an alert
        if random.random() < 0.15:
            state["alerts"].insert(0, generate_alert())
            if len(state["alerts"]) > 20:
                state["alerts"] = state["alerts"][:20]

        payload = {
            "type": "update",
            "nodes": state["nodes"],
            "metrics": state["metrics"],
            "alerts": state["alerts"],
        }
        try:
            ws.send(json.dumps(payload))
        except Exception:
            break
        time.sleep(1)


if __name__ == "__main__":
    if not DIST_DIR.exists():
        raise SystemExit(f"Missing built dashboard at {DIST_DIR}. Run `npm run build` first.")
    app.run(host="0.0.0.0", port=8080)
