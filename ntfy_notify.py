"""
ntfy_notify.py — Optional push notifications to an ntfy topic.

Sends are fire-and-forget on a daemon thread so alert producers never block.

Environment:
    NTFY_TOPIC      e.g. "jarvis-siem" (password-less topics are fine)
    NTFY_URL        default "https://ntfy.sh" (or a self-hosted server)
    NTFY_TOKEN      optional bearer token for authenticated servers
    NTFY_DISABLE    "1" forces a no-op (dev/test boxes)
    NTFY_TIMEOUT    seconds for the HTTP send (default 5)
"""

import json
import logging
import os
import threading
import urllib.request

LOG = logging.getLogger("ntfy")

ALERT_PRESETS = {
    "high": {"tags": ["rotating_light", "red_circle"], "priority": 5, "title": "SIEM HIGH ALERT"},
    "medium": {"tags": ["warning"], "priority": 3, "title": "SIEM ALERT"},
    "low": {"tags": ["information_source"], "priority": 2, "title": "SIEM NOTICE"},
}


def _config() -> dict:
    return {
        "url": os.getenv("NTFY_URL", "https://ntfy.sh").rstrip("/"),
        "topic": os.getenv("NTFY_TOPIC", "").strip(),
        "token": os.getenv("NTFY_TOKEN", "").strip(),
        "timeout": float(os.getenv("NTFY_TIMEOUT", "5")),
    }


def enabled() -> bool:
    """True when pushes will actually be sent."""
    if os.getenv("NTFY_DISABLE", "0").strip() == "1":
        return False
    return bool(_config()["topic"])


def _send_payload(title: str, message: str, tags, priority):
    cfg = _config()
    body = {
        "title": title,
        "message": message,
        "tags": tags or [],
        "priority": priority if priority is not None else 3,
    }
    req = urllib.request.Request(
        f"{cfg['url']}/{cfg['topic']}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    if cfg["token"]:
        req.add_header("Authorization", f"Bearer {cfg['token']}")
    with urllib.request.urlopen(req, timeout=cfg["timeout"]) as resp:
        resp.read()


def notify(title: str, message: str, tags=None, priority=None) -> bool:
    """Push a notification asynchronously. Returns True if a send was spawned."""
    if not enabled():
        return False
    try:
        threading.Thread(
            target=_send_payload,
            args=(title, message, tags, priority),
            daemon=True,
            name="ntfy-push",
        ).start()
        return True
    except Exception as exc:
        LOG.warning("ntfy spawn failed: %s", exc)
        return False


def notify_alert(message: str, severity: str = "low") -> bool:
    """Push a SIEM alert with ntfy severity mapping."""
    presets = ALERT_PRESETS.get((severity or "low").lower(), ALERT_PRESETS["low"])
    return notify(presets["title"], message, tags=presets["tags"], priority=presets["priority"])