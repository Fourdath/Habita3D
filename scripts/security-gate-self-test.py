"""Demonstrate that the credential-file gate blocks a controlled mistake."""

from pathlib import Path
import subprocess
import sys
import tempfile


checker = Path(__file__).with_name("check-tracked-secrets.py")

with tempfile.TemporaryDirectory(prefix="habita3d-security-gate-") as directory:
    root = Path(directory)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    (root / ".env").write_text("DEMO_VALUE=not-a-secret\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(root), "add", "-f", ".env"], check=True)

    blocked = subprocess.run(
        [sys.executable, str(checker), str(root)],
        capture_output=True,
        text=True,
        check=False,
    )
    if blocked.returncode != 1 or ".env" not in blocked.stderr:
        print("Security gate did not block the controlled .env file.", file=sys.stderr)
        raise SystemExit(1)

print("Controlled failure passed: the security gate blocked a tracked .env file.")
