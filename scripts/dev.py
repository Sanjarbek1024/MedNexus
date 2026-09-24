"""Run the backend and frontend dev servers together. Ctrl+C stops both.

    python scripts/dev.py
"""

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = os.name == "nt"
PYTHON = ROOT / "backend" / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
NPM = "npm.cmd" if WINDOWS else "npm"


def main() -> None:
    if not PYTHON.exists():
        sys.exit("backend/.venv not found; follow the Quick start in README.md first.")
    if not (ROOT / "frontend" / "node_modules").exists():
        sys.exit("frontend/node_modules not found; run `npm ci` in frontend/ first.")

    processes = [
        subprocess.Popen(
            [str(PYTHON), "-m", "uvicorn", "app.main:app", "--port", "8000"], cwd=ROOT / "backend"
        ),
        subprocess.Popen([NPM, "run", "dev"], cwd=ROOT / "frontend"),
    ]
    print("\n  MedNexus  http://localhost:5173    API docs  http://localhost:8000/docs\n")
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            process.wait()


if __name__ == "__main__":
    main()
