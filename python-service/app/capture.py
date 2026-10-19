"""Portable manual/scheduled acquisition, including Windows without Task Scheduler."""

import argparse
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from app.api.materials import get_adapters
from app.observability import configure_logging
from app.services.capture_store import CaptureBusyError, CaptureStore
from app.services.captures import CaptureRequest, capture
from app.sources.client import SafeSourceClient


def due_slot(now: datetime) -> str | None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Se requiere fecha con zona horaria")
    local = now.astimezone(ZoneInfo("America/Santiago"))
    if local.hour not in (8, 12, 16) or local.minute >= 15:
        return None
    return local.replace(minute=0, second=0, microsecond=0).isoformat()


async def run_once(args, *, due: bool = False) -> int:
    store = CaptureStore(Path(args.data_dir))
    slot = due_slot(datetime.now(timezone.utc)) if due else None
    if due and (slot is None or slot in store.read()["slots"]):
        print(json.dumps({"status": "skipped", "reason": "no_pending_slot"}))
        return 0
    request = CaptureRequest(
        sources=args.source or ["sodimac", "easy"],
        categories=args.category or ["ceramic", "laminate"],
        limit_per_category=args.limit,
    )
    try:
        async with SafeSourceClient() as client:
            result = await capture(request, client, get_adapters(), store, slot=slot)
    except CaptureBusyError:
        print(json.dumps({"status": "skipped", "reason": "capture_already_running"}))
        return 0
    data = result.model_dump(mode="json")
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "run_id": result.run_id,
                "status": result.status,
                "updated": len(result.updated_publication_keys),
                "retained": len(result.retained_publication_keys),
                "groups": [g.model_dump(mode="json") for g in result.groups],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if result.status == "complete" else 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Captura acotada de pisos para Habita3D")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--schedule", action="store_true", help="08/12/16 hora America/Santiago")
    mode.add_argument("--due", action="store_true", help="Intentar solo una franja pendiente")
    parser.add_argument("--source", action="append", choices=["sodimac", "easy"])
    parser.add_argument("--category", action="append", choices=["ceramic", "laminate"])
    parser.add_argument("--limit", type=int, default=10, choices=range(1, 11))
    parser.add_argument(
        "--data-dir", default=os.environ.get("MATERIALS_DATA_DIR", "data/materials")
    )
    parser.add_argument("--output", help="Ruta opcional del resultado JSON")
    args = parser.parse_args()
    configure_logging()
    try:
        if not args.schedule:
            return asyncio.run(run_once(args, due=args.due))

        async def schedule():
            while True:
                try:
                    await run_once(args, due=True)
                except (OSError, ValueError):
                    logging.exception("No se pudo completar la captura programada")
                await asyncio.sleep(60)

        asyncio.run(schedule())
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Error de configuración/evidencia: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
