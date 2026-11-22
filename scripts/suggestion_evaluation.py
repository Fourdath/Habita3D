"""Compare the first three positions of the catalogue and of the floor recommender.

This reads an existing demonstration project. It never refreshes retailer data
or writes recommendations, rooms or credentials.
"""

import argparse
import json
import os
import re
from datetime import datetime, timezone
from decimal import ROUND_CEILING, Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def compact_result(item, room, available_budget):
    """Calculate the cost independently from the persisted publication snapshot."""
    coverage = item["coveragePerBoxM2"]
    price = item["pricePerBoxClp"]
    boxes = cost = None
    if coverage is not None and Decimal(coverage) > 0 and isinstance(price, int) and price > 0:
        area = (Decimal(room["areaM2"]) if room["areaMode"] == "area"
                else Decimal(room["lengthM"]) * Decimal(room["widthM"]))
        margin = Decimal(room["wastePercent"]) / Decimal(100)
        boxes = int((area * (1 + margin) / Decimal(coverage)).to_integral_value(rounding=ROUND_CEILING))
        cost = boxes * price
    return {
        "publicationKey": item["publicationKey"],
        "category": item["category"],
        "source": item["source"],
        "availability": item["availability"],
        "checkedAt": item["checkedAt"],
        "boxes": boxes,
        "costClp": cost,
        "fitsBudget": cost is not None and cost <= available_budget,
    }


def evaluated_list(items):
    return {"count": len(items), "withinBudget": sum(item["fitsBudget"] for item in items), "items": items}


def evaluate_case(call, auth, project_id, room_id):
    catalogue_path = "/api/materials?limit=40"
    project_path = f"/api/projects/{project_id}"
    catalogue = call(catalogue_path)
    project = call(project_path, headers=auth)
    room = next((item for item in project["rooms"] if item["id"] == room_id), None)
    if room is None:
        raise ValueError("La habitación indicada no existe en el proyecto.")
    result = call(f"{project_path}/rooms/{room_id}/suggestions", headers=auth)
    # Data changed while evaluating? Retry later rather than comparing stale
    # catalogue prices with fresh suggestions or a different room context.
    if catalogue != call(catalogue_path) or project != call(project_path, headers=auth):
        raise ValueError("El catálogo o el proyecto cambió durante la medición. Repita el caso.")
    if result["status"] == "disabled":
        raise ValueError("Active las sugerencias en el proyecto para poder compararlas.")
    if len(catalogue["items"]) != catalogue["total"]:
        raise ValueError("La evaluación requiere la muestra completa de hasta 40 publicaciones.")
    available_budget = result["availableBudgetClp"]
    baseline = [compact_result(item, room, available_budget) for item in catalogue["items"][:3]]
    snapshot = {item["publicationKey"]: item for item in catalogue["items"]}
    recommended = []
    for item in result["items"]:
        original = snapshot.get(item["publication"]["publicationKey"])
        if original is None:
            raise ValueError("Una sugerencia no pertenece al catálogo medido.")
        scored = compact_result(original, room, available_budget)
        if (scored["costClp"] != item["costClp"] or scored["boxes"] != item["boxes"]
                or scored["checkedAt"] != item["publication"]["checkedAt"]):
            raise ValueError("Una sugerencia no coincide con los precios o cantidades medidos.")
        recommended.append({**scored, "reasons": item["reasons"]})

    return {
        "surface": {field: room[field] for field in ("areaMode", "areaM2", "lengthM", "widthM", "wastePercent")},
        "roomBudgetClp": room["budgetClp"],
        "projectBudgetClp": project["budgetClp"],
        "availableBudgetClp": available_budget,
        "budgetProvisional": result["budgetProvisional"],
        "preferredCategory": room.get("preferredCategory"),
        "preferredSource": room.get("preferredSource"),
        "status": result["status"],
        "ruleVersion": result["ruleVersion"],
        "catalogueCount": catalogue["total"],
        "catalogueOrder": evaluated_list(baseline),
        "recommendedOrder": evaluated_list(recommended),
    }


def parse_case(value):
    project_id, separator, room = value.partition(":")
    try:
        if not separator or not re.fullmatch(r"[1-9]\d{0,9}", project_id) or int(project_id) > 2_147_483_647:
            raise ValueError
        room_id = UUID(room)
        if room_id.version != 4:
            raise ValueError
        return project_id, str(room_id)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Use ID_PROYECTO:UUID_HABITACIÓN.") from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18080")
    parser.add_argument("--case", action="append", required=True, type=parse_case,
                        help="ID_PROYECTO:UUID_HABITACIÓN. Repita para 2 o 3 casos.")
    options = parser.parse_args()
    if not 2 <= len(options.case) <= 3:
        parser.error("Indique 2 o 3 casos.")
    base = options.base_url.rstrip("/")
    url = urlsplit(base)
    if (url.hostname not in ("127.0.0.1", "localhost", "::1") or url.scheme not in ("http", "https")
            or url.username is not None or url.path or url.query or url.fragment):
        parser.error("Use el origen local de la demo, sin ruta ni credenciales.")
    access_token = os.environ.get("HABITA_EVALUATION_ACCESS_TOKEN", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,512}", access_token):
        parser.error("Configure HABITA_EVALUATION_ACCESS_TOKEN con una sesión ficticia vigente.")
    opener = build_opener(NoRedirect)

    def call(path, headers=None):
        req = Request(base + path, headers=headers or {})
        try:
            with opener.open(req, timeout=20) as response:
                data = response.read(2_000_001)
                if response.status != 200 or len(data) > 2_000_000:
                    raise ValueError("Respuesta de la API inválida.")
                return json.loads(data)
        except HTTPError as error:
            raise ValueError(f"La API respondió HTTP {error.code}.") from error
        except URLError as error:
            raise ValueError("No se pudo consultar el staging local.") from error

    auth = {"Authorization": f"Bearer {access_token}"}
    try:
        version = call("/api/health/ready")["version"]
        cases = [evaluate_case(call, auth, *case) for case in options.case]
    except (ValueError, KeyError, TypeError, ArithmeticError) as error:
        parser.exit(1, f"Evaluación interrumpida. {error}\n")
    print(json.dumps({
        "checkedAt": datetime.now(timezone.utc).isoformat(), "version": version,
        "method": "first-3-stable-catalogue-vs-recommender", "cases": cases,
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
