"""Reject credential files even when someone force-adds them past .gitignore."""

from pathlib import Path
import subprocess
import sys


def forbidden(path: str) -> bool:
    name = Path(path).name.lower()
    if name in {".env.example", ".env.sample"}:
        return False
    return (
        name == ".env"
        or name.startswith(".env.")
        or name.endswith((".pem", ".key", ".p12", ".pfx"))
        or name in {"id_rsa", "id_ed25519"}
    )


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    paths = [name.decode("utf-8") for name in result.stdout.split(b"\0") if name]
    blocked = [path for path in paths if forbidden(path)]
    if blocked:
        print("Tracked credential files are forbidden:", file=sys.stderr)
        for path in blocked:
            print(f"  {path}", file=sys.stderr)
        return 1
    print("No tracked credential files found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
