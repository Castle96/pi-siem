#!/usr/bin/env python3
"""jarvis_reminders_daemon.py — Reminder scheduler for the Jarvis PI system.

Wires up Sentry SDK with Performance Monitoring for trace visibility.
"""

import json
import logging
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Sentry SDK — with Performance Monitoring enabled
# ---------------------------------------------------------------------------
try:
    import sentry_sdk
    from sentry_sdk import push_scope, capture_exception
    from sentry_sdk.integrations.logging import LoggingIntegration

    SENTRY_DSN = "https://87487640315d12e4bf683b1a167ce752@o1119104.ingest.us.sentry.io/5368906"

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        enable_tracing=True,       # Performance Monitoring
        traces_sample_rate=1.0,    # 100% sampling — adjust later if too noisy
        environment="pi-siem",
        release="jarvis-reminders@1.0.0",
        integrations=[
            LoggingIntegration(level=logging.INFO, event_level=logging.WARNING),
        ],
        # Attach stackhub context for easier filtering in Sentry UI
        before_send_transaction=lambda event, hint: _attach_context(event),
    )
    _sentry_available = True
    print("[sentry] Initialized with Performance Monitoring (traces_sample_rate=1.0)")
except ImportError:
    _sentry_available = False
    print("[sentry] SDK not available — running without Sentry")

# ---------------------------------------------------------------------------
# Logging setup — Sentry-aware
# ---------------------------------------------------------------------------
LOG_DIR = Path("/home/kyle/pi-siem/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "reminders_daemon.log"),
    ],
)
logger = logging.getLogger("jarvis-reminders")


def _attach_context(event):
    """Attach custom context to all Sentry events/transactions."""
    event.setdefault("tags", {})
    event["tags"]["component"] = "jarvis-reminders-daemon"
    event["tags"]["hostname"] = socket.gethostname() if _have_socket else "jarvis"
    return event


_have_socket = True
try:
    import socket
except ImportError:
    _have_socket = False


# ---------------------------------------------------------------------------
# Database helpers with Sentry spans
# ---------------------------------------------------------------------------
DB_PATH = Path("/home/kyle/pi-siem/reminders.db")


def get_db() -> sqlite3.Connection:
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the reminders database schema."""
    conn = get_db()
    try:
        with sentry_sdk.start_span(op="db.query", description="CREATE TABLE reminders") as span:
            span.set_data("db.system", "sqlite")
            span.set_data("db.statement", "CREATE TABLE IF NOT EXISTS reminders")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    due TEXT NOT NULL,          -- ISO timestamp
                    recurring TEXT,             -- 'daily', 'weekly', 'monthly', or NULL
                    notify_before INTEGER DEFAULT 0,  -- minutes before
                    notified INTEGER DEFAULT 0,
                    created TEXT NOT NULL,
                    channel TEXT DEFAULT 'all'  -- 'all', 'slack', 'discord', 'email'
                )
            """)
            conn.commit()
            logger.info("Reminders table ready")
    except Exception as e:
        logger.error(f"DB init failed: {e}")
        if _sentry_available:
            capture_exception(e)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Core reminder logic
# ---------------------------------------------------------------------------
def check_due_reminders() -> list[dict]:
    """Find reminders that are due now or within notify_before window."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        with sentry_sdk.start_span(op="db.query", description="SELECT due reminders") as span:
            span.set_data("db.system", "sqlite")
            span.set_data("db.statement", "SELECT * FROM reminders WHERE ...")
            cursor = conn.execute("""
                SELECT * FROM reminders
                WHERE notified = 0
                  AND due <= ?
                ORDER BY due ASC
            """, (now,))
            rows = [dict(row) for row in cursor.fetchall()]
            span.set_data("db.row_count", len(rows))
            logger.info(f"Found {len(rows)} due reminders")
            return rows
    except Exception as e:
        logger.error(f"Failed to check reminders: {e}")
        if _sentry_available:
            capture_exception(e)
        return []
    finally:
        conn.close()


def mark_notified(reminder_id: int) -> bool:
    """Mark a reminder as notified."""
    conn = get_db()
    try:
        with sentry_sdk.start_span(op="db.query", description="UPDATE reminders SET notified=1") as span:
            span.set_data("db.system", "sqlite")
            span.set_data("db.statement", f"UPDATE reminders SET notified=1 WHERE id={reminder_id}")
            conn.execute("UPDATE reminders SET notified = 1 WHERE id = ?", (reminder_id,))
            conn.commit()
            logger.info(f"Marked reminder {reminder_id} as notified")
            return True
    except Exception as e:
        logger.error(f"Failed to mark reminder {reminder_id}: {e}")
        if _sentry_available:
            capture_exception(e)
        return False
    finally:
        conn.close()


def create_reminder(title: str, due: str, recurring: str | None = None,
                    notify_before: int = 0, channel: str = "all") -> int | None:
    """Create a new reminder. Returns the new ID or None on failure."""
    conn = get_db()
    try:
        created = datetime.now(timezone.utc).isoformat()
        with sentry_sdk.start_span(op="db.query", description="INSERT INTO reminders") as span:
            span.set_data("db.system", "sqlite")
            span.set_data("db.statement", "INSERT INTO reminders ...")
            cursor = conn.execute("""
                INSERT INTO reminders (title, due, recurring, notify_before, notified, created, channel)
                VALUES (?, ?, ?, ?, 0, ?, ?)
            """, (title, due, recurring, notify_before, created, channel))
            conn.commit()
            new_id = cursor.lastrowid
            span.set_data("db.last_insert_id", new_id)
            logger.info(f"Created reminder {new_id}: {title} at {due}")
            return new_id
    except Exception as e:
        logger.error(f"Failed to create reminder: {e}")
        if _sentry_available:
            capture_exception(e)
        return None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Notification dispatch — with spans per channel
# ---------------------------------------------------------------------------
def send_notification(reminder: dict) -> bool:
    """
    Dispatch a reminder notification via configured channels.
    Wraps each channel attempt in its own Sentry span for visibility.
    """
    title = reminder.get("title", "Untitled")
    due = reminder.get("due", "")
    channel = reminder.get("channel", "all")

    channels = ["all"] if channel == "all" else [channel]
    success = False

    with sentry_sdk.start_span(op="notification.dispatch", description=f"Reminder: {title}") as span:
        span.set_data("reminder.id", reminder.get("id"))
        span.set_data("reminder.due", due)

        for ch in channels:
            with sentry_sdk.start_span(op=f"notification.{ch}", description=f"Send via {ch}") as child:
                try:
                    child.set_data("channel", ch)
                    result = _dispatch_channel(ch, reminder)
                    child.set_data("success", result)
                    if result:
                        success = True
                except Exception as e:
                    child.record_exception(e)
                    logger.warning(f"Notification failed for channel {ch}: {e}")
                    if _sentry_available:
                        capture_exception(e)

    return success


def _dispatch_channel(channel: str, reminder: dict) -> bool:
    """Route reminder to a specific channel. Override/extend for actual integrations."""
    # Placeholder — real implementations would hit Slack/Discord/email APIs
    logger.info(f"[channel={channel}] Would notify: {reminder.get('title')} at {reminder.get('due')}")
    # Simulate work to make spans visible
    time.sleep(0.01)
    return True


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main() -> None:
    """Start the reminders daemon."""
    if _sentry_available:
        with sentry_sdk.start_transaction(
            op="daemon.startup",
            name="jarvis-reminders.startup",
        ) as txn:
            txn.set_data("daemon", "jarvis_reminders")
            init_db()

    logger.info("jarvis_reminders_daemon starting")

    # Main loop with a root span for the tick
    while True:
        try:
            with sentry_sdk.start_span(op="daemon.tick", description="Check and dispatch reminders") as span:
                span.set_data("loop", "main")
                due = check_due_reminders()
                for r in due:
                    send_notification(r)
                    mark_notified(r["id"])
        except Exception as e:
            logger.error(f"Tick failed: {e}")
            if _sentry_available:
                capture_exception(e)

        # Sleep between checks — no span for idle time
        time.sleep(60)


if __name__ == "__main__":
    main()
