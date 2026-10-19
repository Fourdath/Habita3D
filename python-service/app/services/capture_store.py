"""Atomic local evidence cache for block 1; PostgreSQL remains NestJS's responsibility."""

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from tempfile import NamedTemporaryFile


class CaptureBusyError(Exception):
    pass


class CaptureStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.path = directory / "state.json"

    def read(self) -> dict:
        if not self.path.exists():
            return {"version": 1, "publications": {}, "history": {}, "slots": [], "runs": []}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if (
            not isinstance(data, dict)
            or type(data.get("version")) is not int
            or data["version"] != 1
        ):
            raise ValueError("Versión de evidencia local no soportada")
        for key, kind in (
            ("publications", dict),
            ("history", dict),
            ("slots", list),
            ("runs", list),
        ):
            if not isinstance(data.get(key), kind):
                raise ValueError(f"Evidencia local inválida: {key}")
        if not all(isinstance(v, dict) for v in data["publications"].values()):
            raise ValueError("Publicaciones locales inválidas")
        if not all(
            isinstance(v, list) and all(isinstance(row, dict) for row in v)
            for v in data["history"].values()
        ):
            raise ValueError("Historial local inválido")
        if not all(isinstance(v, str) for v in data["slots"] + data["runs"]):
            raise ValueError("Identificadores locales inválidos")
        if "last_capture" in data:
            # Lazy import avoids a module cycle; read() runs only after initialization.
            from app.services.captures import CaptureResult

            CaptureResult.model_validate(data["last_capture"])
        return data

    @contextmanager
    def locked(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self.directory / "capture.lock"
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError as exc:
            raise CaptureBusyError("Ya hay una captura en ejecución") from exc
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(
                    {"pid": os.getpid(), "started_at": datetime.now(timezone.utc).isoformat()},
                    stream,
                )
            yield
        finally:
            path.unlink(missing_ok=True)

    def save(self, result: dict, *, slot: str | None = None) -> None:
        from app.services.captures import CaptureResult

        CaptureResult.model_validate(result)
        state = self.read()
        if result["run_id"] in state["runs"]:
            return
        updated = set(result["updated_publication_keys"])
        for publication in result["publications"]:
            key = publication["publication_key"]
            if key not in updated:
                continue
            previous = state["publications"].get(key)

            def terms(record):
                coverage = record.get("coverage_per_box_m2")
                return (
                    record.get("price_per_box_clp"),
                    Decimal(str(coverage)) if coverage is not None else None,
                    record.get("sale_unit"),
                )

            changed = previous is None or terms(previous) != terms(publication)
            if changed:
                event = {
                    field: publication[field]
                    for field in (
                        "checked_at",
                        "price_per_box_clp",
                        "coverage_per_box_m2",
                        "sale_unit",
                        "currency",
                        "price_type",
                        "commune_code",
                        "seller",
                        "product_url",
                    )
                }
                event["run_id"] = result["run_id"]
                event["change_type"] = "initial" if previous is None else "price_or_pack_change"
                state["history"].setdefault(key, []).append(event)
            state["publications"][key] = publication
        state["last_capture"] = result
        state["runs"] = (state["runs"] + [result["run_id"]])[-1000:]
        if slot:
            state["slots"] = (state["slots"] + [slot])[-1000:]
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.directory, suffix=".tmp", delete=False
            ) as stream:
                temporary = Path(stream.name)
                json.dump(state, stream, ensure_ascii=False, indent=2, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
