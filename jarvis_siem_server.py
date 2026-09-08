"""
jarvis_siem_server.py — Serve the React dashboard and stream live SIEM data.

Usage:
    python3 jarvis_siem_server.py

Environment:
    SIEM_TAILNET_ONLY=1   -> restrict access to tailnet ranges only
    SIEM_PORT=8170        -> override listen port
"""

import json
import sqlite3
import asyncio
import nats
from uuid import uuid4
from pathlib import Path
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, send_from_directory, request
from flask_sock import Sock

from siem_data import (
    get_alerts,
    get_metrics,
    get_nodes,
    get_agents,
    get_voice_events,
    add_voice_event,
    add_alert,
    seed_demo_data,
    seed_demo_agents,
    seed_demo_voice_events,
    ack_alert,
    get_unacked_count,
    record_metric,
    escalate_alerts,
    get_anomalies,
)
from jarvis_sysmon import get_system_status
from siem_discovery import (
    get_services_summary, get_listening_ports,
    get_cluster_summary, scan_all_cluster,
    get_inactive_services,
)
from siem_network import registry, remote_scan, cluster_node_payload
from siem_sweep import sweeper
from siem_voice import parse_intent, reply_for, action_for, intent_data
from voice_tts import tts

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dashboard" / "dist"

app = Flask(__name__, static_folder=None)
sock = Sock(app)

seed_demo_data()
seed_demo_agents()
seed_demo_voice_events()

PORT = int(os.getenv("SIEM_PORT", "8170"))
# Task Management
TASK_DB = BASE_DIR / "data" / "tasks.db"

def init_task_db():
    with sqlite3.connect(TASK_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                agent TEXT,
                command TEXT,
                status TEXT,
                result TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
init_task_db()

async def get_nats_conn():
    # NATS server runs on localhost (.237)
    nc = await nats.connect("nats://localhost:4222")
    return nc

def route_to_agent(lang: str) -> str:
    mapping = {
        "rust": "tasks.rust",
        "go": "tasks.go",
        "python": "tasks.python"
    }
    return mapping.get(lang.lower(), "tasks.unknown")
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


@app.route("/api/alerts/<int:alert_id>/ack", methods=["POST"])
def api_ack_alert(alert_id):
    ack_alert(alert_id)
    return {"ok": True, "id": alert_id}


@app.route("/api/alerts/unacked_count")
def api_unacked_count():
    return {"unacked": get_unacked_count()}


@app.route("/api/alerts/escalate", methods=["POST"])
def api_escalate():
    count = escalate_alerts()
    return {"escalated": count}


@app.route("/api/anomalies")
def api_anomalies():
    return {"anomalies": get_anomalies()}


# Run escalation check on every metrics collection
@app.before_request
def _run_escalation():
    """Auto-escalate alerts on each request (lightweight, in-memory)."""
    try:
        escalate_alerts()
    except Exception:
        pass


@app.route("/api/metrics/realtime")
def api_realtime_metrics():
    """Capture live system metrics into the metrics DB and return them."""
    from jarvis_sysmon import get_system_status
    status = get_system_status()
    cpu = status["cpu"]["percent"]
    mem = status["memory"]["percent"]
    record_metric("cpu_usage", cpu)
    record_metric("mem_usage", mem)
    return {
        "cpu": cpu,
        "memory": mem,
        "loadavg": status["loadavg"],
        "uptime": status["uptime_seconds"],
        "disks": [
            {"mountpoint": d["mountpoint"], "percent": d["percent"]}
            for d in status.get("disks", [])
        ],
    }


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
    sync_status = []
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

            sync_dir = cluster_path / ".sync-status"
            if sync_dir.exists() and sync_dir.is_dir():
                for fp in sync_dir.glob("*.json"):
                    try:
                        data = json.loads(fp.read_text())
                        sync_status.append({
                            "host": data.get("host", fp.stem),
                            "ts": data.get("ts"),
                            "ok": data.get("ok", False),
                        })
                    except Exception:
                        pass
    except Exception as e:
        return {"storage": [], "sync": [], "error": str(e)}
    return {"storage": result, "sync": sorted(sync_status, key=lambda x: x.get("host", ""))}


@app.route("/api/voice/events")
def api_voice_events():
    return {"voiceEvents": get_voice_events()}


@app.route("/api/system")
def api_system():
    return get_system_status()


@app.route("/api/services")
def api_services():
    return get_services_summary()


@app.route("/api/ports")
def api_ports():
    return {"ports": get_listening_ports()}


@app.route("/api/cluster")
def api_cluster():
    return get_cluster_summary()


@app.route("/api/cluster/nodes")
def api_cluster_nodes():
    return {"nodes": scan_all_cluster()}


@app.route("/api/cluster/node/<hostname>")
def api_cluster_node(hostname):
    entries = registry.cluster()
    target = next((e for e in entries if e.get("label") == hostname or hostname in (e.get("ips") or [])), None)
    # Fall back to resolved hostname match (e.g. after a fresh scan)
    if target is None:
        for e in entries:
            try:
                res = sweeper.result_for(e)
            except Exception:
                continue
            if res.get("hostname") == hostname:
                target = e
                break
    if target is None:
        return {"error": f"Unknown node: {hostname}"}, 404
    res = sweeper.result_for(target)
    return cluster_node_payload(target, res)


@app.route("/api/inactive-services")
def api_inactive_services():
    return {"services": get_inactive_services()}


@app.route("/api/remote-system/<ip>")
def api_remote_system(ip):
    entry = registry.get(ip)
    if entry:
        return sweeper.result_for(entry)
    return remote_scan(ip)


def _endpoint_view(entry):
    """Compact per-endpoint status built from sweeper cache (no scans on GET)."""
    ips = [x for x in (entry.get("ips") or [entry.get("ip")]) if x]
    ip = ips[0] if ips else entry.get("ip")
    latest = sweeper.latest.get(ip)
    health = sweeper.get_health(ip)
    scan_online = bool(latest and latest.get("online"))
    health_online = bool(health and health.get("reachable"))
    online = scan_online or health_online
    res = latest or {}
    disks = res.get("disks", [])
    return {
        "ip": ip,
        "ips": ips,
        "label": entry.get("label"),
        "role": entry.get("role"),
        "tags": entry.get("tags", []),
        "source": entry.get("source"),
        "added_at": entry.get("added_at"),
        "online": online,
        "hostname": res.get("hostname"),
        "latency_ms": (health or {}).get("latency_ms"),
        "packet_loss": (health or {}).get("packet_loss"),
        "thermal": (res.get("thermal") if online else None) or {"temp_c": None, "throttled": None, "flags": []},
        "cpu": res.get("cpu", {}).get("percent") if online else None,
        "memory": res.get("memory", {}).get("percent") if online else None,
        "disk": (disks[0].get("percent") if disks else None) if online else None,
        "services_count": len(res.get("services", [])) if online else 0,
        "ports_count": len(res.get("ports", [])) if online else 0,
        "uptime_seconds": res.get("uptime_seconds") if online else None,
        "last_checked": res.get("timestamp"),
        "error": res.get("error"),
        "services": res.get("services", [])[:60] if online else [],
        "ports": res.get("ports", [])[:40] if online else [],
        "disks": [{"mountpoint": d.get("mountpoint"), "percent": d.get("percent")}
                  for d in res.get("disks", [])][:6] if online else [],
    }


@app.route("/api/endpoints")
def api_endpoints():
    return {"endpoints": [_endpoint_view(e) for e in registry.all()]}


@app.route("/api/endpoints", methods=["POST"])
def api_endpoints_post():
    data = request.get_json() or {}
    action = data.get("action", "")
    if action == "add" and data.get("ip"):
        out = registry.add(
            data["ip"],
            label=data.get("label"),
            role=data.get("role", "custom"),
            tags=data.get("tags"),
        )
        return out, (201 if out["action"] == "added" else 200)
    if action == "remove" and data.get("ip"):
        removed = registry.remove(data["ip"])
        return {"removed": removed, "ip": data["ip"]}
    if action == "set_role" and data.get("ip"):
        ok = registry.set_role(data["ip"], data.get("role", "custom"), tags=data.get("tags"))
        return {"ok": ok, "ip": data["ip"]}
    return {"error": "unknown action"}, 400


@app.route("/api/endpoints/<ip>")
def api_endpoint_detail(ip):
    entry = registry.get(ip)
    if not entry:
        return {"error": f"unknown endpoint: {ip}"}, 404
    res = sweeper.result_for(entry)
    view = _endpoint_view(entry)
    view.update({
        "disks": res.get("disks", []),
        "processes": res.get("processes", [])[:20],
        "loadavg": res.get("loadavg"),
        "uptime_seconds": res.get("uptime_seconds"),
    })
    return {"endpoint": view}


@app.route("/api/endpoints/<ip>/scan", methods=["POST"])
def api_endpoint_scan(ip):
    entry = registry.get(ip)
    if not entry:
        return {"error": f"unknown endpoint: {ip}"}, 404
    try:
        res = sweeper.force_scan(entry)
    except Exception as e:
        return {"endpoint": _endpoint_view(entry), "error": str(e)}
    view = _endpoint_view(entry)
    view.update({"disks": res.get("disks", []), "processes": res.get("processes", [])[:20]})
    return {"endpoint": view}


@app.route("/api/endpoints/<ip>/history")
def api_endpoint_history(ip):
    metric_type = request.args.get("type", "cpu_usage")
    limit = request.args.get("limit", type=int) or 120
    return {"ip": ip, "metric_type": metric_type, "history": sweeper.history(ip, metric_type, limit)}


@app.route("/api/lan")
def api_lan():
    hosts, ts = sweeper.get_lan()
    return {"hosts": hosts, "last_scanned": ts}


@app.route("/api/lan/scan", methods=["POST"])
def api_lan_scan():
    try:
        hosts = sweeper.refresh_lan()
    except Exception as e:
        return {"hosts": [], "error": str(e)}, 500
    return {"hosts": hosts, "last_scanned": sweeper.lan_ts}


@app.route("/api/custom-servers", methods=["GET", "POST"])
def api_custom_servers():
    """Legacy alias over the endpoint registry (kept for back-compat)."""
    if request.method == "GET":
        return {"servers": [
            {"ip": e["ip"], "label": e.get("label", e["ip"]), "added_at": e.get("added_at"),
             "online": _endpoint_view(e)["online"]}
            for e in registry.custom()
        ]}
    data = request.get_json() or {}
    action = data.get("action", "")
    if action == "add" and data.get("ip"):
        registry.add(data["ip"], label=data.get("label"), role="custom")
    elif action == "remove" and data.get("ip"):
        registry.remove(data["ip"])
    elif action == "scan":
        results = [sweeper.result_for(e) for e in registry.custom()]
        return {"servers": [{"ip": e["ip"], "label": e.get("label")} for e in registry.custom()],
                "results": results, "action": "scanned"}
    elif action == "scan_one" and data.get("ip"):
        entry = registry.get(data["ip"])
        result = sweeper.result_for(entry) if entry else remote_scan(data["ip"])
        return {"server": {"ip": data["ip"], "result": result}, "action": "scanned_one"}
    return {"servers": [
        {"ip": e["ip"], "label": e.get("label", e["ip"]), "added_at": e.get("added_at"),
         "online": _endpoint_view(e)["online"]}
        for e in registry.custom()
    ]}

@app.route("/api/tasks/dispatch", methods=["POST"])
def api_dispatch_task():
    data = request.get_json() or {}
    lang = data.get("lang")
    command = data.get("command")
    
    if not lang or not command:
        return {"error": "Missing lang or command"}, 400
    
    task_id = str(uuid4())
    subject = route_to_agent(lang)
    
    # Store in DB
    with sqlite3.connect(TASK_DB) as conn:
        conn.execute("INSERT INTO tasks (id, agent, command, status) VALUES (?, ?, ?, ?)",
                     (task_id, lang, command, "QUEUED"))
    
    # Dispatch via NATS (Async run in Flask)
    async def _send():
        try:
            nc = await get_nats_conn()
            payload = json.dumps({"id": task_id, "command": command}).encode()
            await nc.publish(subject, payload)
            await nc.close()
        except Exception as e:
            print(f"NATS Error: {e}")

    asyncio.run(_send())
    
    return {"task_id": task_id, "status": "DISPATCHED", "agent": lang}

@app.route("/api/tasks/status/<task_id>")
def api_task_status(task_id):
    with sqlite3.connect(TASK_DB) as conn:
        row = conn.execute("SELECT agent, status, result FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return {"error": "Task not found"}, 404
        return {"agent": row[0], "status": row[1], "result": row[2]}

@app.route("/api/tasks/update", methods=["POST"])
def api_task_update():
    """Endpoint for workers to report back results."""
    data = request.get_json() or {}
    task_id = data.get("id")
    status = data.get("status")
    result = data.get("result")
    
    if not task_id:
        return {"error": "Missing task_id"}, 400
        
    with sqlite3.connect(TASK_DB) as conn:
        conn.execute("UPDATE tasks SET status = ?, result = ? WHERE id = ?", 
                     (status, result, task_id))
    
    return {"ok": True}

@app.route("/api/tasks/history")
def api_tasks_history():
    """Return the last 50 tasks for the dashboard console."""
    with sqlite3.connect(TASK_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM tasks ORDER BY timestamp DESC LIMIT 50").fetchall()
        return {"tasks": [dict(row) for row in rows]}
STATE_FILE = BASE_DIR / "data" / "voice_state.json"

# Voice intent actions queued for the dashboard (popped into the WS update).
_pending_voice_actions = []
_VOICE_INGEST_KEY = os.getenv("VOICE_INGEST_KEY", "")


def _threat_level() -> str:
    active = sum(1 for a in get_agents() if a.get("active"))
    if active > 6:
        return "CRITICAL"
    if active > 3:
        return "HIGH"
    if active > 0:
        return "ELEVATED"
    return "LOW"


def _live_intent_data():
    endpoints = [_endpoint_view(e) for e in registry.all()]
    sys_status = get_system_status()
    disks = [{"mountpoint": d.get("mountpoint"), "percent": d.get("percent", 0)}
             for d in sys_status.get("disks", [])]
    return intent_data(
        get_alerts(), endpoints, _threat_level(),
        sum(1 for a in get_agents() if a.get("active")), disks,
    )


def _queue_voice_action(action) -> None:
    if not action:
        return
    if _pending_voice_actions and _pending_voice_actions[-1].get("action") == action:
        return
    _pending_voice_actions.append({
        "id": f"{time.time():.0f}-{len(_pending_voice_actions)}",
        "action": action, "ts": time.time(),
    })
    while len(_pending_voice_actions) > 5:
        _pending_voice_actions.pop(0)


def _pop_voice_action():
    return _pending_voice_actions.pop(0) if _pending_voice_actions else None


def _voice_stale(max_age: float = 150.0) -> bool:
    """True when the voice daemon heartbeat looks dead."""
    try:
        data = json.loads(STATE_FILE.read_text())
        ts = data.get("ts")
        if not ts:
            return True
        try:
            return (time.time() - datetime.fromisoformat(ts).timestamp()) > max_age
        except Exception:
            return False
    except Exception:
        return not STATE_FILE.exists()


_VOICE_WATCHDOG_INTERVAL = float(os.getenv("VOICE_WATCHDOG_INTERVAL", "20"))
_voice_was_alive: bool | None = None
_voice_watchdog_lock = threading.Lock()


def _voice_alive() -> bool:
    return not _voice_stale()


def _voice_watchdog_cycle() -> dict:
    """Check the daemon heartbeat once; alert on loss, log on recovery.

    Baselines the first observation so a daemon never configured (or already
    down at boot) doesn't raise a flood of alerts.
    """
    global _voice_was_alive
    alive = _voice_alive()
    with _voice_watchdog_lock:
        prev = _voice_was_alive
        _voice_was_alive = alive
    if prev is None:
        return {"alive": alive, "changed": False}
    if prev and not alive:
        add_alert("medium", "Voice line down: daemon heartbeat stale (voiceStale)")
        add_voice_event("error", text="Voice daemon heartbeat lost", source="watchdog")
        return {"alive": alive, "changed": True}
    if not prev and alive:
        add_voice_event("state", text="Voice link restored", source="watchdog")
        return {"alive": alive, "changed": True}
    return {"alive": alive, "changed": False}


def _voice_watchdog_loop():
    while True:
        try:
            _voice_watchdog_cycle()
        except Exception:
            pass
        time.sleep(_VOICE_WATCHDOG_INTERVAL)


def _read_voice_state():
    """Read the latest voice state from the JSON file the daemon writes."""
    if not STATE_FILE.exists():
        return {"state": "idle", "text": "", "ts": None}
    try:
        data = json.loads(STATE_FILE.read_text())
        return {
            "state": data.get("state", "idle"),
            "text": data.get("text", ""),
            "event": data.get("event", ""),
            "ts": data.get("ts"),
        }
    except Exception:
        return {"state": "idle", "text": "", "ts": None}


@sock.route("/ws/voice")
def voice_websocket(ws):
    """WebSocket endpoint that streams live voice state from the daemon.

    The daemon writes voice_state.json; this endpoint polls it and pushes
    updates to the connected client whenever the state changes.
    """
    last_state = None
    while True:
        try:
            state = _read_voice_state()
            # Only push when state actually changes
            if state != last_state:
                last_state = state
                try:
                    ws.send(json.dumps({"type": "voice_state", **state}))
                except Exception:
                    break
            time.sleep(0.25)  # poll at 4 Hz
        except Exception:
            break


@app.route("/api/voice/state")
def api_voice_state():
    """REST endpoint for voice state (polling fallback for clients that
    don't use WebSocket)."""
    return _read_voice_state()


@app.route("/api/voice/status")
def api_voice_status():
    """Daemon liveness for the watchdog/health UIs."""
    state = _read_voice_state()
    alive = _voice_alive()
    return {
        "alive": alive,
        "stale": not alive,
        "state": state.get("state"),
        "lastTs": state.get("ts"),
    }


@app.route("/api/voice/intent", methods=["POST", "GET"])
def api_voice_intent():
    """Resolve a transcript into an intent, spoken reply, and dashboard action.
    
    POST {"text": "status of ray"} -> {"heard", "intent", "reply", "action"}.
    GET  ?text=...               -> same, for quick CLI/testing.
    """
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        text = str(data.get("text", "")).strip()
        source = str(data.get("source", "voice")).strip() or "voice"
    else:
        text = request.args.get("text", "").strip()
        source = "api"

    if not text:
        return {"heard": False, "intent": None, "reply": "", "action": None}, 400

    intent = parse_intent(text)
    reply = reply_for(intent, _live_intent_data())
    action = action_for(intent)

    if action and action.get("scan") == "all":
        threading.Thread(target=_background_voice_scan, daemon=True).start()

    if action:
        _queue_voice_action(action)
        
        # BRIDGE: If this is an agent task, dispatch it immediately
        if action.get("type") == "agent_dispatch":
            lang = action.get("lang")
            cmd = action.get("command")
            if lang != "unknown":
                # We call the internal logic of api_dispatch_task
                # but we don't want to do a full HTTP request to ourselves.
                async def _dispatch():
                    try:
                        nc = await get_nats_conn()
                        task_id = str(uuid4())
                        subject = route_to_agent(lang)
                        
                        with sqlite3.connect(TASK_DB) as conn:
                            conn.execute("INSERT INTO tasks (id, agent, command, status) VALUES (?, ?, ?, ?)",
                                         (task_id, lang, cmd, "QUEUED"))
                        
                        payload = json.dumps({"id": task_id, "command": cmd}).encode()
                        await nc.publish(subject, payload)
                        await nc.close()
                    except Exception as e:
                        print(f"Voice Dispatch Error: {e}")
                
                asyncio.run(_dispatch())

    add_voice_event("intent", text=f"{intent and intent.get('intent') or 'unknown'}: {text}",
                    source=source)
    add_voice_event("reply", text=reply, source="jarvis")
    record_metric("voice_intents", 1.0, host="voice")
    if not intent:
        record_metric("voice_intents_unknown", 1.0, host="voice")

    tts.say(reply)
    return {"heard": bool(intent), "intent": intent and intent.get("intent"),
            "reply": reply, "action": action}

@app.route("/api/voice/ingest", methods=["POST"])
def api_voice_ingest():
    """Network-wide voice event ingestion from other nodes.

    POST {"source": "ray", "text": "scan all", "state": "listening"}
    Shares state with the local pipeline: the text is resolved through the same
    intent engine and the reply is returned for the remote node to speak aloud.
    Optional auth via X-Voice-Key header (VOICE_INGEST_KEY env).
    """
    key = request.headers.get("X-Voice-Key", "")
    if _VOICE_INGEST_KEY and key != _VOICE_INGEST_KEY:
        return {"error": "unauthorized"}, 401

    data = request.get_json(force=True, silent=True) or {}
    source = str(data.get("source", "")).strip() or "remote"
    state = str(data.get("state", "")).strip()
    text = str(data.get("text", "")).strip()

    if state:
        add_voice_event(state, text=text, source=source)
    if not text:
        return {"received": True, "reply": ""}

    intent = parse_intent(text)
    reply = reply_for(intent, _live_intent_data())
    action = action_for(intent)
    if action:
        _queue_voice_action(action)

    add_voice_event("intent", text=f"{intent and intent.get('intent') or 'unknown'}: {text}",
                    source=source)
    add_voice_event("reply", text=reply, source="jarvis")
    record_metric("voice_intents", 1.0, host=source or "voice")
    return {"received": True, "heard": bool(intent), "intent": intent and intent.get("intent"),
            "reply": reply, "action": action}


@app.route("/api/voice/action")
def api_voice_action():
    """Return queued dashboard voice actions (debug/testing hook)."""
    return {"actions": list(_pending_voice_actions), "stale": _voice_stale()}


def _background_voice_scan():
    """Background scan_all: full scan of every endpoint + LAN sweep."""
    for entry in registry.all():
        try:
            sweeper.force_scan(entry)
        except Exception:
            pass
    try:
        sweeper.refresh_lan()
    except Exception:
        pass


@sock.route("/ws")
def websocket(ws):
    while True:
        nodes = get_nodes()
        metrics = get_metrics()
        alerts = get_alerts()
        agents = get_agents()
        voice_events = get_voice_events()
        cluster_path = Path("/mnt/cluster")
        storage_payload = []
        sync_payload = []
        try:
            if cluster_path.exists() and cluster_path.is_dir():
                st = os.statvfs(str(cluster_path))
                total = st.f_blocks * st.f_frsize
                free = st.f_bfree * st.f_frsize
                used = total - free
                storage_payload.append({
                    "path": str(cluster_path),
                    "total": total,
                    "used": used,
                    "free": free,
                    "available": free,
                    "usePercent": round((used / total) * 100, 1) if total else 0,
                })
                sync_dir = cluster_path / ".sync-status"
                if sync_dir.exists() and sync_dir.is_dir():
                    for fp in sync_dir.glob("*.json"):
                        try:
                            data = json.loads(fp.read_text())
                            sync_payload.append({
                                "host": data.get("host", fp.stem),
                                "ts": data.get("ts"),
                                "ok": data.get("ok", False),
                            })
                        except Exception:
                            pass
        except Exception:
            pass
        payload = {
            "type": "update",
            "nodes": nodes,
            "metrics": metrics,
            "alerts": alerts,
            "agents": agents,
            "voiceEvents": voice_events,
            "storage": storage_payload,
            "sync": sorted(sync_payload, key=lambda x: x.get("host", "")),
            "endpoints": [_endpoint_view(e) for e in registry.all()],
            "voiceAction": _pop_voice_action(),
            "voiceStale": _voice_stale(),
        }
        try:
            ws.send(json.dumps(payload))
        except Exception:
            break
        time.sleep(1)


if __name__ == "__main__":
    if not DIST_DIR.exists():
        raise SystemExit(f"Missing built dashboard at {DIST_DIR}. Run `npm run build` first.")
    threading.Thread(target=_voice_watchdog_loop, daemon=True, name="voice-watchdog").start()
    sweeper.start()
    app.run(host="0.0.0.0", port=PORT)
