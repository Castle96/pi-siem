"""
siem_data.py — Real data providers for the Jarvis SIEM dashboard.

Reads from SQLite databases and exposes normalized data for the WebSocket feed.
"""

import math
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_EVENTS = DATA_DIR / "events.db"
DB_REMINDERS = DATA_DIR / "reminders.db"
DB_METRICS = DATA_DIR / "metrics.db"


def get_conn(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize all SIEM databases if they don't exist."""
    # Events database
    conn = get_conn(DB_EVENTS)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source_ip TEXT,
            dest_ip TEXT,
            event_type TEXT,
            severity TEXT,
            message TEXT,
            acknowledged INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hostname TEXT NOT NULL,
            ip_address TEXT,
            x REAL DEFAULT 0.5,
            y REAL DEFAULT 0.5,
            active INTEGER DEFAULT 1,
            last_seen TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            state TEXT NOT NULL,
            backend TEXT,
            worktree TEXT,
            parent_id INTEGER,
            started_at TEXT,
            finished_at TEXT,
            last_seen TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS voice_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state TEXT NOT NULL,
            text TEXT,
            source TEXT,
            ts TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

    # Reminders database
    conn = get_conn(DB_REMINDERS)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due TEXT NOT NULL,
            recurring TEXT,
            notify_before INTEGER DEFAULT 0,
            notified INTEGER DEFAULT 0,
            created TEXT NOT NULL,
            channel TEXT DEFAULT 'all'
        )
    """)
    conn.commit()
    conn.close()

    # Metrics database
    conn = get_conn(DB_METRICS)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            value REAL NOT NULL,
            host TEXT DEFAULT 'local'
        )
    """)
    _ensure_metrics_host_column(conn)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host TEXT NOT NULL,
            kind TEXT NOT NULL,
            signature TEXT NOT NULL,
            ts TEXT NOT NULL,
            UNIQUE(host, kind)
        )
    """)
    conn.commit()
    conn.close()


def _ensure_metrics_host_column(conn):
    """Add the host column to older metrics tables that predate multi-endpoint support."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(metrics)").fetchall()]
        if "host" not in cols:
            conn.execute("ALTER TABLE metrics ADD COLUMN host TEXT DEFAULT 'local'")
    except Exception:
        pass


def seed_demo_data():
    """Seed initial demo data if databases are empty."""
    init_db()

    # Seed nodes
    conn = get_conn(DB_EVENTS)
    count = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
    if count == 0:
        sample_nodes = [
            ("zev", "192.168.6.237", 0.2, 0.3, 1),
            ("brain", "192.168.6.238", 0.5, 0.5, 1),
            ("fleet", "192.168.6.239", 0.8, 0.2, 1),
            ("evansdesktop", "192.168.6.240", 0.6, 0.7, 1),
            ("iphone-12-pro-max", "192.168.6.241", 0.3, 0.8, 1),
            ("pihole", "192.168.6.242", 0.1, 0.5, 1),
            ("ray", "192.168.6.243", 0.7, 0.4, 0),
            ("homarr", "192.168.6.244", 0.9, 0.6, 1),
        ]
        now = datetime.now(timezone.utc).isoformat()
        conn.executemany(
            "INSERT INTO nodes (hostname, ip_address, x, y, active, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
            [(h, ip, x, y, a, now) for h, ip, x, y, a in sample_nodes],
        )
        conn.commit()
    conn.close()

    # Seed metrics
    conn = get_conn(DB_METRICS)
    count = conn.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]
    if count == 0:
        now = datetime.now(timezone.utc)
        metrics = []
        for i in range(60):
            ts = (now - timedelta(seconds=(60 - i) * 10)).isoformat()
            # CPU-like sine wave with noise
            base = 50 + 30 * math.sin(i * 0.15)
            val = max(5, min(95, base + (hash(i) % 20) - 10))
            metrics.append((ts, "cpu_usage", val))
        conn.executemany(
            "INSERT INTO metrics (timestamp, metric_type, value) VALUES (?, ?, ?)",
            metrics,
        )
        conn.commit()
    conn.close()


def get_nodes():
    """Get all threat map nodes."""
    conn = get_conn(DB_EVENTS)
    rows = conn.execute("SELECT hostname, ip_address, x, y, active FROM nodes").fetchall()
    conn.close()
    nodes = []
    for row in rows:
        nodes.append({
            "x": row["x"],
            "y": row["y"],
            "r": 2.0 + (hash(row["hostname"]) % 10) / 5.0,
            "phase": (hash(row["hostname"]) % 100) / 100.0 * math.pi * 2,
            "speed": 0.4 + (hash(row["hostname"]) % 100) / 200.0,
            "active": bool(row["active"]),
            "hostname": row["hostname"],
            "ip_address": row["ip_address"],
        })
    return nodes


def get_metrics(metric_type="cpu_usage", host="local", limit=60):
    """Get recent metrics history for a host."""
    conn = get_conn(DB_METRICS)
    rows = conn.execute(
        "SELECT value FROM metrics "
        "WHERE metric_type = ? AND host = ? ORDER BY timestamp DESC LIMIT ?",
        (metric_type, host, limit),
    ).fetchall()
    conn.close()
    return [row["value"] for row in reversed(rows)]


def get_metric_history(host, metric_type="cpu_usage", limit=120):
    """Get recent metrics with timestamps for a host."""
    conn = get_conn(DB_METRICS)
    rows = conn.execute(
        "SELECT value, timestamp FROM metrics "
        "WHERE metric_type = ? AND host = ? ORDER BY timestamp DESC LIMIT ?",
        (metric_type, host, limit),
    ).fetchall()
    conn.close()
    return [{"value": r["value"], "ts": r["timestamp"]} for r in reversed(rows)]


def get_metric_hosts():
    """List all hosts that have recorded metrics."""
    conn = get_conn(DB_METRICS)
    rows = conn.execute("SELECT DISTINCT host FROM metrics").fetchall()
    conn.close()
    return [r["host"] for r in rows]


def get_alerts(limit=20):
    """Get recent security alerts."""
    conn = get_conn(DB_EVENTS)
    rows = conn.execute(
        "SELECT id, severity, message FROM events WHERE severity IN ('high', 'medium', 'low') ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    alerts = []
    for row in rows:
        alerts.append({
            "id": row["id"],
            "severity": row["severity"],
            "text": row["message"],
        })
    return alerts


def add_alert(severity: str, message: str):
    """Add a new security alert."""
    conn = get_conn(DB_EVENTS)
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO events (timestamp, severity, message) VALUES (?, ?, ?)",
        (ts, severity, message),
    )
    conn.commit()
    conn.close()
    try:
        from ntfy_notify import notify_alert
        notify_alert(message, severity)
    except Exception:
        pass


ESCALATION_MINUTES = {
    "high": 15,
    "medium": 30,
    "low": 60,
}


def escalate_alerts():
    """Escalate unacked alerts that have exceeded their timeout.

    low → medium, medium → high, high stays high.
    Returns count of escalated alerts.
    """
    now = datetime.now(timezone.utc)
    escalated = 0
    conn = get_conn(DB_EVENTS)
    rows = conn.execute(
        "SELECT id, severity, timestamp FROM events WHERE acknowledged = 0 AND severity IN ('low', 'medium')"
    ).fetchall()
    for row in rows:
        alert_id = row["id"]
        severity = row["severity"]
        try:
            ts = datetime.fromisoformat(row["timestamp"])
        except (ValueError, TypeError):
            continue
        timeout_min = ESCALATION_MINUTES.get(severity, 60)
        age_min = (now - ts).total_seconds() / 60
        if age_min >= timeout_min:
            new_sev = "high" if severity == "medium" else "medium"
            conn.execute(
                "UPDATE events SET severity = ? WHERE id = ?",
                (new_sev, alert_id),
            )
            escalated += 1
    conn.commit()
    conn.close()
    return escalated


def ack_alert(alert_id: int):
    """Acknowledge an alert by id."""
    conn = get_conn(DB_EVENTS)
    conn.execute(
        "UPDATE events SET acknowledged = 1 WHERE id = ? AND severity IN ('high', 'medium', 'low')",
        (alert_id,),
    )
    conn.commit()
    conn.close()


def get_unacked_count():
    """Count unacknowledged alerts."""
    conn = get_conn(DB_EVENTS)
    count = conn.execute(
        "SELECT COUNT(*) FROM events WHERE severity IN ('high', 'medium', 'low') AND acknowledged = 0"
    ).fetchone()[0]
    conn.close()
    return count


def update_node_position(hostname: str, x: float, y: float):
    """Update a node's position."""
    conn = get_conn(DB_EVENTS)
    conn.execute(
        "UPDATE nodes SET x = ?, y = ?, last_seen = ? WHERE hostname = ?",
        (x, y, datetime.now(timezone.utc).isoformat(), hostname),
    )
    conn.commit()
    conn.close()


def record_metric(metric_type: str, value: float, host: str = "local"):
    """Record a new metric value for a host."""
    conn = get_conn(DB_METRICS)
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO metrics (timestamp, metric_type, value, host) VALUES (?, ?, ?, ?)",
        (ts, metric_type, value, host),
    )
    conn.commit()
    conn.close()
    # Keep only last 120 entries per metric type per host
    conn = get_conn(DB_METRICS)
    conn.execute("""
        DELETE FROM metrics
        WHERE metric_type = ? AND host = ? AND id NOT IN (
            SELECT id FROM metrics
            WHERE metric_type = ? AND host = ?
            ORDER BY timestamp DESC
            LIMIT 120
        )
    """, (metric_type, host, metric_type, host))
    conn.commit()
    conn.close()


def get_anomalies(threshold_std: float = 2.0) -> list:
    """Detect metric anomalies using standard deviation.

    Returns list of {metric_type, value, expected, deviation, ts}
    for values that exceed threshold_std standard deviations from the mean.
    """
    conn = get_conn(DB_METRICS)
    rows = conn.execute(
        "SELECT metric_type, value, timestamp FROM metrics ORDER BY timestamp DESC"
    ).fetchall()
    conn.close()

    # Group by type
    by_type: dict[str, list] = {}
    for row in rows:
        by_type.setdefault(row["metric_type"], []).append(
            {"value": row["value"], "ts": row["timestamp"]}
        )

    anomalies = []
    for mtype, entries in by_type.items():
        if len(entries) < 5:
            continue
        values = [e["value"] for e in entries]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std = variance ** 0.5
        if std == 0:
            continue
        # Check the most recent entry
        latest = entries[0]
        deviation = (latest["value"] - mean) / std
        if abs(deviation) > threshold_std:
            anomalies.append({
                "metric_type": mtype,
                "value": latest["value"],
                "expected": round(mean, 1),
                "deviation": round(deviation, 2),
                "ts": latest["ts"],
            })
    return anomalies


# ---------------------------------------------------------------------------
# Agent swarm helpers
# ---------------------------------------------------------------------------
VALID_AGENT_STATES = {"pending", "running", "success", "failed", "blocked", "cancelled"}


def upsert_agent(name: str, state: str, backend: str | None = None,
                 worktree: str | None = None, parent_id: int | None = None):
    if state not in VALID_AGENT_STATES:
        raise ValueError(f"Invalid agent state: {state}")
    conn = get_conn(DB_EVENTS)
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT INTO agents (name, state, backend, worktree, parent_id, started_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            state = excluded.state,
            backend = excluded.backend,
            worktree = excluded.worktree,
            parent_id = excluded.parent_id,
            last_seen = excluded.last_seen,
            finished_at = CASE
                WHEN excluded.state IN ('success','failed','cancelled') THEN excluded.last_seen
                ELSE agents.finished_at
            END
    """, (name, state, backend, worktree, parent_id, now, now))
    conn.commit()
    conn.close()


def finish_agent(name: str, state: str):
    if state not in VALID_AGENT_STATES:
        raise ValueError(f"Invalid agent state: {state}")
    if state not in {"success", "failed", "cancelled"}:
        return
    conn = get_conn(DB_EVENTS)
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE agents SET state = ?, finished_at = ?, last_seen = ? WHERE name = ?",
        (state, now, now, name),
    )
    conn.commit()
    conn.close()


def get_agents():
    conn = get_conn(DB_EVENTS)
    rows = conn.execute("""
        SELECT id, name, state, backend, worktree, parent_id, started_at, finished_at, last_seen
        FROM agents
        ORDER BY id DESC
    """).fetchall()
    conn.close()
    agents = []
    for row in rows:
        agents.append({
            "id": row["id"],
            "name": row["name"],
            "state": row["state"],
            "backend": row["backend"],
            "worktree": row["worktree"],
            "parent_id": row["parent_id"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "last_seen": row["last_seen"],
        })
    return agents


def seed_demo_agents():
    conn = get_conn(DB_EVENTS)
    count = conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
    conn.close()
    if count > 0:
        return
    demo = [
        ("orca-alpha", "success", "opencode", "wt/orca-alpha", None),
        ("orca-beta", "running", "opencode", "wt/orca-beta", None),
        ("orca-gamma", "failed", "opencode", "wt/orca-gamma", None),
        ("terax-1", "running", "opencode", "wt/terax-1", "orca-beta"),
        ("terax-2", "pending", "opencode", "wt/terax-2", "orca-beta"),
        ("ghostty-0", "success", "opencode", "wt/ghostty-0", None),
        ("ghostty-1", "blocked", "opencode", "wt/ghostty-1", "orca-alpha"),
    ]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn(DB_EVENTS)
    conn.executemany("""
        INSERT INTO agents (name, state, backend, worktree, parent_id, started_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, [(n, s, b, w, p, now, now) for n, s, b, w, p in demo])
    conn.commit()
    conn.close()


def add_voice_event(state: str, text: str = "", source: str = ""):
    conn = get_conn(DB_EVENTS)
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO voice_events (state, text, source, ts) VALUES (?, ?, ?, ?)",
        (state, text, source, ts),
    )
    conn.commit()
    conn.close()


def get_voice_events(limit: int = 20):
    conn = get_conn(DB_EVENTS)
    rows = conn.execute(
        "SELECT state, text, source, ts FROM voice_events ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [{"state": r["state"], "text": r["text"], "source": r["source"], "ts": r["ts"]} for r in rows]


def seed_demo_voice_events():
    conn = get_conn(DB_EVENTS)
    count = conn.execute("SELECT COUNT(*) FROM voice_events").fetchone()[0]
    conn.close()
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    demo = [
        ("listening", "", "mic", (now - timedelta(seconds=8)).isoformat()),
        ("thinking", "Checking threat map...", "system", (now - timedelta(seconds=6)).isoformat()),
        ("speaking", "Threat level is elevated on node fleet.", "tts", (now - timedelta(seconds=4)).isoformat()),
        ("idle", "", "", (now - timedelta(seconds=2)).isoformat()),
    ]
    conn = get_conn(DB_EVENTS)
    conn.executemany(
        "INSERT INTO voice_events (state, text, source, ts) VALUES (?, ?, ?, ?)",
        demo,
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Inventory snapshots (used by drift/change detection)
# ---------------------------------------------------------------------------
def store_snapshot(host: str, kind: str, signature: str):
    """Store the current service/port signature for a host."""
    conn = get_conn(DB_METRICS)
    ts = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT INTO snapshots (host, kind, signature, ts) VALUES (?, ?, ?, ?)
        ON CONFLICT(host, kind) DO UPDATE SET signature = excluded.signature, ts = excluded.ts
    """, (host, kind, signature, ts))
    conn.commit()
    conn.close()


def get_snapshot(host: str, kind: str):
    """Get the last stored signature for a host+kind, or None."""
    conn = get_conn(DB_METRICS)
    row = conn.execute(
        "SELECT signature, ts FROM snapshots WHERE host = ? AND kind = ?",
        (host, kind),
    ).fetchone()
    conn.close()
    return {"signature": row["signature"], "ts": row["ts"]} if row else None


def clear_snapshot(host: str, kind: str | None = None):
    """Clear snapshots for a host (optionally only one kind)."""
    conn = get_conn(DB_METRICS)
    if kind:
        conn.execute("DELETE FROM snapshots WHERE host = ? AND kind = ?", (host, kind))
    else:
        conn.execute("DELETE FROM snapshots WHERE host = ?", (host,))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    # Test data providers
    seed_demo_data()
    seed_demo_agents()
    seed_demo_voice_events()
    print("Agents:", get_agents())
    print("Voice events:", get_voice_events())
