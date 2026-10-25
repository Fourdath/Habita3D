"""Verify EP2 through NestJS; writes test data ONLY with --disposable-fixtures.

Fixture mode is for an isolated CI/local test database. It does not contact retailers.
The default mode is read-only and suitable for staging health checks.
"""

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from uuid import uuid4
from zoneinfo import ZoneInfo


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--disposable-fixtures", action="store_true",
                        help="Write synthetic test captures into a disposable database only")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    opener = urllib.request.build_opener(NoRedirect)

    def call(path, method="GET", body=None, headers=None, expected=200):
        combined = {"Content-Type": "application/json", **(headers or {})}
        request = urllib.request.Request(base + path, method=method, headers=combined,
                                         data=json.dumps(body).encode() if body is not None else None)
        try:
            response = opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read(2_000_001)
            assert len(data) <= 2_000_000, "Oversized API response"
            assert response.status == expected, f"{method} {path}: {response.status}, expected {expected}: {data[:400]!r}"
            return json.loads(data) if data else None

    ready = call("/api/health/ready", headers={"X-Request-ID": "ep2-smoke"})
    assert ready["status"] == "ok"
    assert ready["services"] == {"postgres": "ok", "python": "ok"}
    catalogue = call("/api/materials?limit=1")
    assert isinstance(catalogue["items"], list) and isinstance(catalogue["total"], int)
    call("/api/captures/status")
    if not args.disposable_fixtures:
        print("EP2 read-only verification: readiness, persisted catalogue and capture status passed.")
        return

    token = os.environ.get("MATERIALS_API_TOKEN", "")
    assert len(token) >= 24 and not token.startswith("replace-"), "Configure a disposable MATERIALS_API_TOKEN"
    operator = {"X-Materials-Token": token}
    fixture = json.loads((Path(__file__).resolve().parents[1] / "backend/test/fixtures/ep2-capture.json").read_text(encoding="utf-8"))
    assert all(p["evidence"].get("test_fixture") for p in fixture["publications"]), "Only explicit test fixtures may be imported"
    call("/api/materials/import", "POST", fixture, expected=401)
    prefix = f"ep2-smoke-{uuid4()}"
    base_time = datetime.now(timezone.utc) - timedelta(minutes=20)

    def capture(index, *, price_delta=0, failed=False):
        result = deepcopy(fixture)
        at = base_time + timedelta(minutes=index)
        result.update(run_id=f"{prefix}-{index}", request_id=f"ep2-smoke-{index}",
                      trigger="manual", scheduled_for=None,
                      started_at=(at-timedelta(seconds=1)).isoformat(),
                      finished_at=(at+timedelta(seconds=1)).isoformat())
        for publication in result["publications"]:
            publication["checked_at"] = at.isoformat()
            # The importer derives display time itself; contract field remains historically labeled.
            publication["last_checked_display"] = at.astimezone(ZoneInfo("America/Santiago")).strftime("%d/%m/%Y %H:%M")
            publication["price_per_box_clp"] += price_delta
            coverage = publication.get("coverage_per_box_m2")
            if coverage is not None:
                publication["price_per_m2_clp"] = str((Decimal(publication["price_per_box_clp"]) / Decimal(coverage)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if failed:
            # Retained records keep the exact latest successful timestamp/price.
            result["publications"] = deepcopy(last_success["publications"])
            result["updated_publication_keys"] = []
            result["retained_publication_keys"] = [p["publication_key"] for p in result["publications"]]
            result["status"] = "failed"
            for group in result["groups"]:
                group.update(status="failed", pages=0, request_urls=[], warnings=[],
                             errors=[{"code": "source_unavailable", "message": "Controlled test failure"}],
                             missing_publication_keys=[p["publication_key"] for p in result["publications"]
                                                       if p["source"] == group["source"] and p["category"] == group["category"]])
                group["metrics"] = {key: None if key.endswith("_percent") else 0 for key in group["metrics"]}
        return result

    first = capture(0)
    imported = call("/api/materials/import", "POST", first, operator, 201)
    assert imported["replayed"] is False
    assert call("/api/materials/import", "POST", first, operator, 201)["replayed"] is True
    selected = first["publications"][0]
    key = selected["publication_key"]
    history_path = f"/api/materials/{key}/history"
    assert call(history_path)["total"] == 1
    unchanged = capture(1)
    call("/api/materials/import", "POST", unchanged, operator, 201)
    assert call(history_path)["total"] == 1, "Unchanged price must not create a change"
    last_success = capture(2, price_delta=1000)
    call("/api/materials/import", "POST", last_success, operator, 201)
    assert call(history_path)["total"] == 2
    before_failure = call(f"/api/materials/{key}")
    failed = capture(3, failed=True)
    call("/api/materials/import", "POST", failed, operator, 201)
    after_failure = call(f"/api/materials/{key}")
    assert after_failure["checkedAt"] == before_failure["checkedAt"], "A failed capture must retain the successful date"
    assert after_failure["pricePerBoxClp"] == before_failure["pricePerBoxClp"]

    def register(suffix):
        return call("/api/auth/register", "POST", {"email": f"{prefix}-{suffix}@example.test", "password": "ep2-test-only-password"}, expected=201)
    session = register("owner")
    other = register("other")
    auth = {"Authorization": f"Bearer {session['accessToken']}"}
    other_auth = {"Authorization": f"Bearer {other['accessToken']}"}
    call("/api/projects", expected=401)
    project = call("/api/projects", "POST", {"name": "EP2 disposable integration test", "budgetClp": 500000}, auth, 201)
    project_path = f"/api/projects/{project['id']}"
    try:
        call(project_path, headers=other_auth, expected=404)
        room = call(project_path + "/rooms", "POST", {
            "name": "Living", "areaMode": "area", "areaM2": "10",
            "wastePercent": "10", "publicationKey": key,
        }, auth, 201)
        expected_boxes = int((Decimal("11") / Decimal(selected["coverage_per_box_m2"])).to_integral_value(rounding=ROUND_CEILING))
        budget = call(project_path + "/budget", headers=auth)
        assert budget["calculation_basis"] == "latest_persisted_publications"
        assert budget["rooms"][0]["boxes"] == expected_boxes
        assert budget["total_cost_clp"] == expected_boxes * (selected["price_per_box_clp"] + 1000)
        last_success = capture(4, price_delta=2000)
        call("/api/materials/import", "POST", last_success, operator, 201)
        updated_budget = call(project_path + "/budget", headers=auth)
        assert updated_budget["total_cost_clp"] == expected_boxes * (selected["price_per_box_clp"] + 2000)
        assert updated_budget["rooms"][0]["publication_key"] == key
        call(project_path + f"/rooms/{room['id']}", "PATCH", {"publicationKey": None}, other_auth, 404)
        call(project_path + "/rooms", "POST", {"name": "Bedroom", "areaMode": "area", "areaM2": "8"}, auth, 201)
        partial = call(project_path + "/budget", headers=auth)
        assert partial["total_cost_clp"] is None and partial["status"] == "partial"
        assert len(partial["unselected_room_ids"]) == 1
    finally:
        call(project_path, "DELETE", headers=auth, expected=204)
        call("/api/auth/logout", "POST", headers=auth, expected=204)
        call("/api/auth/logout", "POST", headers=other_auth, expected=204)
    print("EP2 integration passed: idempotent import, history, retention, owner isolation, rooms and real FastAPI budgets.")


if __name__ == "__main__":
    main()
