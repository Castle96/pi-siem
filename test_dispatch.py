import requests
import time
import sqlite3
from pathlib import Path

# Config
JARVIS_URL = "http://localhost:8170"
DB_PATH = Path("data/tasks.db")

def test_dispatch(lang, cmd):
    print(f"🚀 Dispatching {lang} task: {cmd}")
    resp = requests.post(f"{JARVIS_URL}/api/tasks/dispatch", json={"lang": lang, "command": cmd})
    if resp.status_code != 200:
        print(f"❌ Dispatch failed: {resp.text}")
        return None
    
    data = resp.json()
    task_id = data["task_id"]
    print(f"✅ Dispatched. Task ID: {task_id}")
    return task_id

def check_status(task_id):
    resp = requests.get(f"{JARVIS_URL}/api/tasks/status/{task_id}")
    return resp.json()

if __name__ == "__main__":
    # 1. Test Rust Dispatch
    tid_rust = test_dispatch("rust", "echo 'Hello from Ray'")
    
    # 2. Test Go Dispatch
    tid_go = test_dispatch("go", "echo 'Hello from Fleet'")
    
    # 3. Test Python Dispatch
    tid_py = test_dispatch("python", "echo 'Hello from Jarvis'")

    print("\n⏳ Waiting for workers to report (if running)...")
    time.sleep(2)

    for tid in [tid_rust, tid_go, tid_py]:
        if tid:
            print(f"Status for {tid}: {check_status(tid)}")
