"""
siem_ingest.py — Log ingestion pipeline for the Jarvis SIEM dashboard.

Watches log files and feeds parsed events into the SIEM database.
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from siem_data import add_alert, record_metric, get_conn, DB_EVENTS

# Patterns for log parsing
RE_SSH_FAIL = re.compile(r"Failed password for .* from (\d+\.\d+\.\d+\.\d+)")
RE_SSH_INVALID = re.compile(r"Invalid user .* from (\d+\.\d+\.\d+\.\d+)")
RE_PORT_SCAN = re.compile(r"port (\d+) .* (scan|probe)")
RE_DNS_TUNNEL = re.compile(r"(tunnel|exfil|dns).*", re.IGNORECASE)
RE_METRIC_CPU = re.compile(r"cpu[:=]\s*([\d.]+)")
RE_METRIC_MEM = re.compile(r"mem[:=]\s*([\d.]+)")


def parse_line(line: str, source: str):
    """Parse a log line and emit SIEM events."""
    now = datetime.now(timezone.utc).isoformat()
    lower = line.lower()

    # SSH brute force
    m = RE_SSH_FAIL.search(line) or RE_SSH_INVALID.search(line)
    if m:
        ip = m.group(1)
        add_alert("high", f"SSH dictionary attack from {ip}")
        return

    # Port scan
    m = RE_PORT_SCAN.search(line)
    if m:
        port = m.group(1)
        add_alert("medium", f"Port scan detected on port {port}")
        return

    # DNS tunnel / exfil
    if "dns" in lower and ("tunnel" in lower or "exfil" in lower):
        add_alert("high", "Potential data exfil via DNS tunnel")
        return

    # Metrics from logs
    m = RE_METRIC_CPU.search(line)
    if m:
        record_metric("cpu_usage", float(m.group(1)))
    m = RE_METRIC_MEM.search(line)
    if m:
        record_metric("mem_usage", float(m.group(1)))


def ingest_file(path: Path, offset_file: Path):
    """Ingest a single log file, tracking read offset."""
    if not path.exists():
        return 0

    offset = 0
    if offset_file.exists():
        try:
            offset = int(offset_file.read_text().strip())
        except Exception:
            offset = 0

    try:
        with path.open("r", errors="replace") as f:
            f.seek(offset)
            lines = f.readlines()
            new_offset = f.tell()
    except Exception:
        return 0

    count = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            parse_line(line, source=path.name)
            count += 1
        except Exception:
            pass

    offset_file.write_text(str(new_offset))
    return count


def tail_files(paths, poll_interval=5):
    """Continuously tail log files and ingest new lines."""
    offsets = {}
    for p in paths:
        offset_file = Path(str(p) + ".offset")
        offsets[p] = offset_file
        # Initialize offset to end of file on first run
        if not offset_file.exists() and p.exists():
            try:
                offset_file.write_text(str(p.stat().st_size))
            except Exception:
                pass

    while True:
        for p in paths:
            try:
                ingest_file(p, offsets[p])
            except Exception:
                pass
        time.sleep(poll_interval)


def get_default_log_paths():
    """Return default log paths to monitor."""
    base = Path("/home/kyle/pi-siem")
    paths = [
        base / "jarvis" / "jarvis_reminders.log",
        base / "pipeline" / "pipeline.log",
        base / "agents" / "agent.log",
        base / "dashboard" / "dashboard.log",
        base / "voice" / "voice.log",
        base / "jarvis_dashboard_patch.py",
        base / "loadbalancer.log",
    ]
    return [p for p in paths if p.exists()]


if __name__ == "__main__":
    import sys
    paths = get_default_log_paths()
    if not paths:
        print("No log files found to monitor.")
        sys.exit(1)
    print(f"Monitoring {len(paths)} log files...")
    try:
        tail_files(paths)
    except KeyboardInterrupt:
        print("\nIngestion stopped.")
