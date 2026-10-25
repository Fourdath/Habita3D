"""Regenerate the versioned API contract after an intentional schema change."""

import json
from pathlib import Path

from app.main import app


def main():
    target = Path(__file__).resolve().parents[1] / "contracts" / "openapi.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(target)


if __name__ == "__main__":
    main()
