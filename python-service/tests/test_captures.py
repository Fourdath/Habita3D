import asyncio
import copy
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.services.capture_store import CaptureBusyError, CaptureStore
from app.services.captures import CaptureRequest, acquire_group, capture
from app.services.materials import normalize_record
from app.sources.base import SourceAccessError, SourcePage


def record(identifier="100", *, source="sodimac", **changes):
    return {
        "source": source,
        "external_id": identifier,
        "sku": f"sku-{identifier}",
        "seller": "Sodimac" if source == "sodimac" else "Easy",
        "name": "Cerámica piso gris",
        "category": "ceramic",
        "currency": "CLP",
        "product_url": f"https://www.{source}.cl/producto/{identifier}",
        "package_price": 10000,
        "coverage_m2": "2",
        "sale_unit": "box",
        "availability": "unknown",
        **changes,
    }


class FakeClient:
    async def get_json(self, *args, **kwargs):
        raise AssertionError("Unit tests must not contact retailers")


class FakeAdapter:
    def __init__(self, source, pages):
        self.source = source
        self.responses = pages
        self.calls = []

    async def fetch_page(self, client, category, page):
        assert isinstance(client, FakeClient)
        self.calls.append((category, page))
        response = self.responses[page - 1]
        if isinstance(response, Exception):
            raise response
        return copy.deepcopy(response)


def page(records, **options):
    return SourcePage(
        records=records, has_next=False, request_url="https://www.sodimac.cl/listing", **options
    )


def run_capture(store, adapters, *, slot=None, limit=10):
    request = CaptureRequest(
        sources=list(adapters), categories=["ceramic"], limit_per_category=limit
    )
    return asyncio.run(capture(request, FakeClient(), adapters, store, slot=slot))


def saved_result(publication, run_id):
    value = publication.model_dump(mode="json")
    return {
        "run_id": run_id,
        "updated_publication_keys": [publication.publication_key],
        "publications": [value],
        "request_id": "test",
        "trigger": "manual",
        "scheduled_for": None,
        "started_at": value["checked_at"],
        "finished_at": value["checked_at"],
        "status": "complete",
        "groups": [],
        "retained_publication_keys": [],
    }


def test_metrics_include_exclusions_invalid_records_and_duplicates_in_denominators():
    invalid = record("invalid", package_price=0)
    candidate = record()
    adapter = FakeAdapter(
        "sodimac", [page([candidate, candidate, invalid], retrieved_count=5, excluded_count=2)]
    )
    group, selected = asyncio.run(acquire_group(adapter, FakeClient(), "ceramic", 10, []))
    metrics = group.metrics
    assert metrics.retrieved_records == 5
    assert metrics.excluded_records == 2
    assert metrics.rejected_records == 1
    assert metrics.valid_records == 2
    assert metrics.duplicate_records == 1
    assert metrics.selected_records == 1
    assert metrics.validity_percent == Decimal("40.00")
    assert metrics.duplicates_percent == Decimal("20.00")
    assert len(selected) == 1


def test_limit_is_bounded_and_selection_is_stable_when_source_order_changes():
    records = [record(str(identifier)) for identifier in range(20)]
    first = FakeAdapter("sodimac", [page(records)])
    second = FakeAdapter("sodimac", [page(list(reversed(records)))])
    _, selected = asyncio.run(acquire_group(first, FakeClient(), "ceramic", 10, []))
    _, reordered = asyncio.run(acquire_group(second, FakeClient(), "ceramic", 10, []))
    assert len(selected) == 10
    assert [p.publication_key for p in selected] == [p.publication_key for p in reordered]
    assert first.calls == [("ceramic", 1)]


def test_page_limit_prevents_unbounded_requests():
    responses = [
        SourcePage(records=[], has_next=True, request_url="https://www.easy.cl/listing")
        for _ in range(3)
    ]
    adapter = FakeAdapter("easy", responses)
    group, selected = asyncio.run(acquire_group(adapter, FakeClient(), "ceramic", 10, []))
    assert adapter.calls == [("ceramic", 1), ("ceramic", 2), ("ceramic", 3)]
    assert group.status == "failed"
    assert not selected
    assert group.metrics.validity_percent is None


def test_wrong_group_is_rejected_instead_of_polluting_source():
    adapter = FakeAdapter("sodimac", [page([record(source="easy")])])
    group, selected = asyncio.run(acquire_group(adapter, FakeClient(), "ceramic", 10, []))
    assert not selected
    assert group.metrics.rejected_records == 1


def test_successful_capture_times_are_aware_and_unknown_stock_remains_unknown(tmp_path):
    store = CaptureStore(tmp_path)
    result = run_capture(store, {"sodimac": FakeAdapter("sodimac", [page([record()])])})
    publication = result.publications[0]
    assert result.status == "complete"
    assert result.started_at.utcoffset() is not None
    assert result.finished_at.utcoffset() is not None
    assert publication.checked_at.utcoffset() is not None
    assert publication.availability == "unknown"
    assert store.read()["publications"][publication.publication_key]["checked_at"]


def test_missing_publication_retains_its_price_time_and_history(tmp_path):
    store = CaptureStore(tmp_path)
    first = run_capture(store, {"sodimac": FakeAdapter("sodimac", [page([record()])])})
    original = first.publications[0]
    before_history = copy.deepcopy(store.read()["history"])
    missing = run_capture(store, {"sodimac": FakeAdapter("sodimac", [page([])])})
    assert missing.status == "failed"
    assert missing.updated_publication_keys == []
    assert missing.retained_publication_keys == [original.publication_key]
    assert missing.groups[0].missing_publication_keys == [original.publication_key]
    assert missing.publications[0].checked_at == original.checked_at
    assert missing.publications[0].price_per_box_clp == original.price_per_box_clp
    assert store.read()["history"] == before_history


def test_missing_one_publication_does_not_prevent_other_updates(tmp_path):
    store = CaptureStore(tmp_path)
    first = run_capture(
        store,
        {
            "sodimac": FakeAdapter(
                "sodimac",
                [
                    page([record("one"), record("two")]),
                ],
            )
        },
    )
    previous = {item.external_id: item for item in first.publications}
    second = run_capture(
        store,
        {
            "sodimac": FakeAdapter(
                "sodimac",
                [
                    page([record("one", package_price=15000)]),
                ],
            )
        },
    )
    current = {item.external_id: item for item in second.publications}
    assert second.status == "partial"
    assert current["one"].price_per_box_clp == 15000
    assert current["two"].checked_at == previous["two"].checked_at
    assert len(store.read()["history"][current["one"].publication_key]) == 2
    assert len(store.read()["history"][current["two"].publication_key]) == 1


def test_failure_of_one_source_preserves_its_data_and_allows_other_source(tmp_path):
    store = CaptureStore(tmp_path)
    initial = run_capture(
        store,
        {
            source: FakeAdapter(source, [page([record(source=source)])])
            for source in ("sodimac", "easy")
        },
    )
    previous = {p.source: p for p in initial.publications}
    updated = run_capture(
        store,
        {
            "sodimac": FakeAdapter("sodimac", [SourceAccessError("blocked", "HTTP 403")]),
            "easy": FakeAdapter("easy", [page([record(source="easy", package_price=15000)])]),
        },
    )
    current = {p.source: p for p in updated.publications}
    assert updated.status == "partial"
    assert current["sodimac"].checked_at == previous["sodimac"].checked_at
    assert current["sodimac"].price_per_box_clp == previous["sodimac"].price_per_box_clp
    assert current["easy"].price_per_box_clp == 15000
    assert updated.groups[0].errors[0]["code"] == "blocked"


def test_unchanged_price_advances_check_time_without_duplicate_history(tmp_path):
    store = CaptureStore(tmp_path)
    first_time = datetime(2026, 10, 18, 11, tzinfo=timezone.utc)
    second_time = datetime(2026, 10, 18, 15, tzinfo=timezone.utc)
    first = normalize_record(record(), first_time)
    second = normalize_record(record(), second_time)
    store.save(saved_result(first, "first"))
    store.save(saved_result(second, "second"))
    state = store.read()
    assert len(state["history"][first.publication_key]) == 1
    stored_time = state["publications"][first.publication_key]["checked_at"]
    assert datetime.fromisoformat(stored_time) == second_time


def test_price_change_adds_one_event_and_replaying_run_is_idempotent(tmp_path):
    store = CaptureStore(tmp_path)
    first = normalize_record(record(), datetime(2026, 10, 18, 11, tzinfo=timezone.utc))
    second = normalize_record(
        record(package_price=15000), datetime(2026, 10, 18, 15, tzinfo=timezone.utc)
    )
    store.save(saved_result(first, "first"))
    changed = saved_result(second, "second")
    store.save(changed)
    store.save(changed)
    events = store.read()["history"][first.publication_key]
    assert len(events) == 2
    assert [event["price_per_box_clp"] for event in events] == [10000, 15000]
    assert events[0]["change_type"] == "initial"
    assert events[1]["run_id"] == "second"


def test_equivalent_coverage_format_does_not_invent_price_history(tmp_path):
    store = CaptureStore(tmp_path)
    for index, coverage in enumerate(("2", "2.0", "2.000")):
        publication = normalize_record(
            record(coverage_m2=coverage), datetime(2026, 10, 18, 11 + index, tzinfo=timezone.utc)
        )
        store.save(saved_result(publication, f"run-{index}"))
    assert len(store.read()["history"][publication.publication_key]) == 1


def test_actual_pack_coverage_change_is_a_history_event(tmp_path):
    store = CaptureStore(tmp_path)
    for index, coverage in enumerate(("2", "2.5")):
        publication = normalize_record(
            record(coverage_m2=coverage), datetime(2026, 10, 18, 11 + index, tzinfo=timezone.utc)
        )
        store.save(saved_result(publication, f"run-{index}"))
    assert len(store.read()["history"][publication.publication_key]) == 2


def test_scheduled_slot_cannot_be_attempted_twice_even_after_source_failure(tmp_path):
    store = CaptureStore(tmp_path)
    slot = "2026-10-18T08:00:00-03:00"
    failed_adapter = FakeAdapter("sodimac", [SourceAccessError("blocked", "HTTP 403")])
    assert run_capture(store, {"sodimac": failed_adapter}, slot=slot).status == "failed"
    should_not_run = FakeAdapter("sodimac", [page([record()])])
    with pytest.raises(ValueError, match="franja"):
        run_capture(store, {"sodimac": should_not_run}, slot=slot)
    assert should_not_run.calls == []
    assert store.read()["slots"] == [slot]


def test_capture_lock_rejects_parallel_execution_and_releases_after_exception(tmp_path):
    store = CaptureStore(tmp_path)
    adapter = FakeAdapter("sodimac", [page([record()])])
    with store.locked(), pytest.raises(CaptureBusyError):
        run_capture(store, {"sodimac": adapter})
    assert not adapter.calls
    with pytest.raises(RuntimeError), store.locked():
        raise RuntimeError("unexpected operation failure")
    assert not (tmp_path / "capture.lock").exists()
    assert run_capture(store, {"sodimac": adapter}).status == "complete"


@pytest.mark.parametrize(
    "change",
    [
        {"limit_per_category": 11},
        {"limit_per_category": 0},
        {"limit_per_category": True},
        {"sources": ["sodimac", "sodimac"]},
        {"categories": ["ceramic", "ceramic"]},
    ],
)
def test_capture_request_enforces_agreed_bounds(change):
    with pytest.raises(ValueError):
        CaptureRequest(**change)
