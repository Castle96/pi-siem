"""siem_voice.py — intent parsing and reply generation for the Jarvis voice layer.

Shared by the voice daemons, the SIEM server, and the dashboard "voice console".
The daemons transcribe speech and POST the text to ``/api/voice/intent``; the
server resolves it here into an intent, a spoken reply, and an optional frontend
action.

Intents are resolved by ordered regex patterns. ``reply_for``/``action_for`` are
pure functions so they can be unit-tested and reused; the server feeds them live
SIEM data via ``intent_data()``.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request

LOG = logging.getLogger("siem_voice")

# ---------------------------------------------------------------------------
# Intent catalog: ordered regex -> intent. First match wins.
# ---------------------------------------------------------------------------
_PATTERNS = [
    # Targeted host status ("status of ray", "is jarvis online")
    (re.compile(r"(?:status|health)\s+(?:of\s+)?([a-z0-9][\w.\- ]*)", re.I), "host_status"),
    (re.compile(r"is\s+(.+?)\s+(?:online|up|alive|down|offline|reachable)", re.I), "host_status"),
    (re.compile(r"how is\s+([a-z0-9][\w.\- ]*)\s*(?:doing)?", re.I), "host_status"),

    # Navigation
    (re.compile(r"(?:open|show|launch)\s+(?:the\s+)?(?:system|sys)\s*(?:monitor|mon|diagnos|status)?", re.I), "open_system"),
    (re.compile(r"(?:open|show|go to)\s+(?:the\s+)?service(?:s)?(?:\s+discovery|\s+page)?", re.I), "open_services"),
    (re.compile(r"(?:open|show|go to)\s+(?:the\s+)?cluster(?:\s+view)?", re.I), "open_cluster"),
    (re.compile(r"(?:close|dismiss)(?: the)?\s*(?:all|everything|panels|overlays)?", re.I), "close_panels"),

    # Scans
    (re.compile(r"scan\s+(?:all|everything|the\s+(?:cluster|nodes|endpoints|network|lan)|nodes|hosts)", re.I), "scan_all"),
    (re.compile(r"(?:run|start|do)\s+(?:a\s+)?(?:full\s+)?(?:scan|sweep)", re.I), "scan_all"),

    # Queries
    (re.compile(r"threat\s+(?:level)?|security\s+status|how\s+dangerous", re.I), "threat_level"),
    (re.compile(r"(?:alerts?|incidents?|unacked|unacknowledged|issues?)", re.I), "alerts_summary"),
    (re.compile(r"storage|disk\s*(?:space|usage)?|how\s+full|caps?(?:acity)?", re.I), "storage_status"),
    (re.compile(r"(?:who|which|how\s+many|list|status(?:\s+all)?)", re.I), "online_nodes"),
    (re.compile(r"node\s*(?:status|health)|endpoint\s*(?:status|list)|status|health\s*check|what.{0,25}(?:happen|going)", re.I), "system_status"),
]
    # Agent Tasks ("tell ray to run x", "dispatch to fleet: y")
    (re.compile(r"(?:tell|ask|dispatch\s+to)\s+([a-z0-9][\w.\- ]*)\s+(?:to\s+)?(?:run|do|execute)\s+(.+)", re.I), "agent_task"),
    (re.compile(r"run\s+(.+)\s+on\s+([a-z0-9][\w.\- ]*)", re.I), "agent_task"),

_ALIASES = {
    "ray": "ray", "jarvis": "jarvis", "fleet": "fleet", "node-1": "ray", "node-2": "fleet",
}


def parse_intent(text: str) -> dict | None:
    """Resolve a transcript to an intent dictionary, or None if unclear."""
    for pattern, intent_name in _PATTERNS:
        match = pattern.search(text)
        if match:
            res = {"intent": intent_name}
            
            if intent_name == "agent_task":
                # The regex captures either (target, command) or (command, target)
                # based on which pattern matched.
                groups = match.groups()
                # Pattern 1: (target, command)
                # Pattern 2: (command, target)
                if "tell" in text.lower() or "dispatch" in text.lower():
                    target, command = groups
                else:
                    command, target = groups
                
                # Map target to language
                normalized_target = _ALIASES.get(target.lower().strip(), target.lower().strip())
                lang = "unknown"
                if normalized_target == "ray": lang = "rust"
                elif normalized_target == "fleet": lang = "go"
                elif normalized_target == "jarvis": lang = "python"
                
                res.update({"target": normalized_target, "lang": lang, "command": command.strip()})
            
            elif intent_name == "host_status":
                target = match.group(1)
                res["target"] = _ALIASES.get(target.lower().strip(), target.lower().strip())
            
            return res
    return None


def _match_endpoint(endpoints: list[dict], target: str) -> dict | None:
    if not target:
        return None
    hit = None
    for e in endpoints:
        name = (e.get("hostname") or e.get("label") or "").lower()
        ip = (e.get("ip") or "").lower()
        if target in name or name in target or target in ip:
            hit = e
            break
    if hit is None:
        alias = _ALIASES.get(target)
        if alias:
            for e in endpoints:
                if (e.get("hostname") or "").lower() == alias:
                    hit = e
                    break
    return hit


def _int_to_words_noun(n: int, singular: str, plural: str) -> str:
    if n == 1:
        return f"one {singular}"
    if n == 2:
        return f"two {plural}"
    if n == 3:
        return f"three {plural}"
    if n == 4:
        return f"four {plural}"
    if n == 5:
        return f"five {plural}"
    return f"{n} {plural}"


def _threat_line(threat: str) -> str:
    return {
        "CRITICAL": "threat level critical",
        "HIGH": "threat level high",
        "ELEVATED": "threat level elevated",
        "LOW": "threat level is low",
    }.get(threat.upper(), f"threat level {threat}")


def reply_for(intent: dict | None, data: dict) -> str:
    """Build a spoken reply string for an intent against SIEM data."""
    if not intent:
        return "I'm not sure how to help with that."

    it = intent.get("intent")
    
    if it == "agent_task":
        target = intent.get("target", "agent")
        return f"Dispatching command to {target}."

    if it == "host_status":
        target = intent.get("target")
        if not target:
            return "Which host did you mean?"
        
        # Check if target is in data endpoints
        endpoints = data.get("endpoints", [])
        hit = _match_endpoint(endpoints, target)
        if not hit:
            return f"I can't find any data for {target} right now."
        
        status = hit.get("status", "unknown").upper()
        return f"{target} is {status}."

    if it == "open_system":
        return "Opening system monitor."
    if it == "open_services":
        return "Opening service discovery."
    if it == "open_cluster":
        return "Opening cluster view."
    if it == "close_panels":
        return "Closing panels."
    if it == "scan_all":
        return "Initiating full cluster scan."
    if it == "threat_level":
        level = data.get("threat", "unknown")
        return f"The current threat level is {level}."
    if it == "alerts_summary":
        alerts = data.get("alerts", [])
        count = len([a for a in alerts if not a.get("acked")])
        return f"There are {count} unacknowledged alerts."
    if it == "storage_status":
        storage = data.get("storage", [])
        if not storage:
            return "No storage data available."
        avg = sum(s.get("used", 0) for s in storage) / len(storage) if storage else 0
        return f"Average cluster disk usage is {avg:.1f} percent."
    if it == "online_nodes":
        nodes = data.get("nodes", [])
        return f"There are {len(nodes)} nodes currently online."
    if it == "system_status":
        return "The system is nominal."

    return "Command received."


def action_for(intent: dict | None) -> dict | None:
    """Frontend action (dashboard navigation / scan trigger) for an intent."""
    if not intent:
        return None
    
    it = intent.get("intent")
    
    if it == "agent_task":
        return {
            "type": "agent_dispatch",
            "lang": intent.get("lang"),
            "command": intent.get("command")
        }

    if it == "open_system":
        return {"nav": "system"}
    if it == "open_services":
        return {"nav": "services"}
    if it == "open_cluster":
        return {"nav": "cluster"}
    if it == "close_panels":
        return {"nav": "close"}
    if it == "scan_all":
        return {"scan": "all"}
    
    return None


def intent_data(alerts, endpoints, threat, active_nodes, disks):
    """Bundle live SIEM data into the dict reply_for() consumes."""
    return {
        "alerts": {
            "total": len(alerts),
            "unacked": sum(1 for a in alerts if not a.get("acked")),
            "high": sum(1 for a in alerts if str(a.get("severity", "")).lower() == "high"),
            "recent": alerts[:3],
        },
        "endpoints": endpoints,
        "threat": threat,
        "active_nodes": active_nodes,
        "disks": disks,
    }


def resolve_intent(text: str, server_url: str = "http://127.0.0.1:8170", timeout: float = 5.0) -> dict:
    """Ask the local SIEM server to resolve a transcript (used by the daemons).

    Returns a dict with ``heard``, ``intent``, ``reply`` and ``action`` keys.
    Falls back to offline parsing + a generic reply if the server is down.
    """
    url = server_url.rstrip("/") + "/api/voice/intent"
    body = json.dumps({"text": text}).encode()
    try:
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
        )
        payload = json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())
        return payload
    except Exception as exc:
        LOG.warning("Server intent resolve failed (%s) — falling back to local parse", exc)
        intent = parse_intent(text)
        action = action_for(intent)
        if action and action.get("open") is None:
            return {"heard": True, "intent": intent and intent.get("intent"),
                    "reply": reply_for(intent, {}), "action": None}
        return {"heard": bool(intent), "intent": intent and intent.get("intent"),
                "reply": reply_for(intent, {}), "action": action}