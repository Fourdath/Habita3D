"""Check the SAST gate against a controlled unsafe statement outside the repository."""

from pathlib import Path
import subprocess
import tempfile

rules = Path(__file__).resolve().with_name("security-rules.yml")
with tempfile.TemporaryDirectory(prefix="habita3d-sast-") as directory:
    sample = Path(directory) / "unsafe.py"
    sample.write_text('eval(input("Untrusted expression: "))\n', encoding="utf-8")
    result = subprocess.run(
        ["semgrep", "scan", "--config", str(rules), "--error", "--strict",
         "--metrics", "off", "--disable-version-check", "--no-git-ignore", str(sample)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 1 or "habita3d-no-python-dynamic-execution" not in result.stdout:
        raise SystemExit("SAST did not block the controlled unsafe statement.\n" + result.stderr)
print("Controlled failure passed: SAST blocked dynamic execution.")
