import asyncio
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

import pytest

from app.sources.base import SourceAccessError
from app.sources.client import (
    MAX_RESPONSE_BYTES,
    USER_AGENT,
    SafeSourceClient,
    _NoRedirect,
)

URL = "https://www.sodimac.cl/s/browse/v1/listing/cl"
EASY_URL = "https://www.easy.cl/search/ceramica%20piso"


class Clock:
    def __init__(self):
        self.seconds = 0.0
        self.pauses = []

    async def sleep(self, seconds: float):
        self.pauses.append(seconds)
        self.seconds += seconds

    def monotonic(self):
        return self.seconds

    def now(self):
        return datetime(2026, 10, 18, 12, tzinfo=UTC) + timedelta(seconds=self.seconds)


class Transport:
    def __init__(self, clock: Clock, *, robots: bytes = b"User-agent: *\nAllow: /\n"):
        self.clock = clock
        self.robots = robots
        self.robots_status = 200
        self.robots_headers = {}
        self.replies = []
        self.calls = []

    def __call__(self, url, headers):
        self.calls.append((url, dict(headers), self.clock.seconds))
        if urlsplit(url).path == "/robots.txt":
            return self.robots_status, self.robots_headers, self.robots
        reply = self.replies.pop(0) if self.replies else (200, {}, b'{"ok":true}')
        if isinstance(reply, Exception):
            raise reply
        return reply


def setup(*, robots: bytes = b"User-agent: *\nAllow: /\n"):
    clock = Clock()
    transport = Transport(clock, robots=robots)
    client = SafeSourceClient(
        transport=transport, sleep=clock.sleep, monotonic=clock.monotonic, clock=clock.now
    )
    return client, transport, clock


def get(client, url=URL, **kwargs):
    return asyncio.run(client.get_json(url, **kwargs))


@pytest.mark.parametrize(
    "url",
    [
        "http://www.sodimac.cl/path",
        "https://sodimac.cl/path",
        "https://www.easy.cl.evil.example/path",
        "https://127.0.0.1/path",
        "https://169.254.169.254/latest/meta-data/",
        "https://[::1]/path",
        "https://user:password@www.easy.cl/path",
        "https://user@www.easy.cl/path",
        "https://www.easy.cl:444/path",
        "https://www.easy.cl:invalid/path",
        "https://www.easy.cl./path",
        "https://www.easy.cl/path#fragment",
        "https://www.easy.cl/path\nHeader: value",
        "https://www.easy.cl\\@evil.example/path",
        "file:///etc/passwd",
    ],
)
def test_url_allowlist_blocks_ssrf_before_any_request(url):
    client, transport, _ = setup()
    with pytest.raises(SourceAccessError) as error:
        get(client, url)
    assert error.value.code == "invalid_url"
    assert transport.calls == []


def test_identifies_research_client_and_encodes_params_without_persisting_cookies():
    client, transport, clock = setup()
    data = get(
        client,
        URL,
        params={"query": "piso flotante", "page": 2},
        cookies={"commune": "13110"},
        headers={"Accept-Language": "es-CL"},
    )
    assert data == {"ok": True}
    assert "query=piso+flotante&page=2" in transport.calls[1][0]
    assert transport.calls[0][1]["User-Agent"] == USER_AGENT
    assert "Cookie" not in transport.calls[0][1]
    assert transport.calls[1][1]["Cookie"] == "commune=13110"
    assert transport.calls[1][1]["Accept-Language"] == "es-CL"
    assert transport.calls[1][1]["Accept-Encoding"] == "identity"
    get(client)
    assert "Cookie" not in transport.calls[2][1]
    assert [call[2] for call in transport.calls] == [0, 5, 10]
    assert clock.pauses == [5, 5]


def test_per_host_lock_shares_robots_and_serializes_concurrent_calls():
    client, transport, _ = setup()

    async def capture():
        async with client:
            return await asyncio.gather(client.get_json(URL), client.get_json(URL))

    assert asyncio.run(capture()) == [{"ok": True}, {"ok": True}]
    assert [call[2] for call in transport.calls] == [0, 5, 10]
    assert sum(urlsplit(call[0]).path == "/robots.txt" for call in transport.calls) == 1
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "client_closed"


def test_robots_disallow_is_fail_closed_and_wildcard_allow_works():
    rules = b"User-agent: *\nDisallow: /\nAllow: /s/browse/v1/listing/\n"
    client, transport, _ = setup(robots=rules)
    assert get(client) == {"ok": True}
    with pytest.raises(SourceAccessError) as error:
        get(client, "https://www.sodimac.cl/private")
    assert error.value.code == "robots_disallowed"
    assert len(transport.calls) == 2


def test_robots_query_wildcard_and_end_anchor():
    rules = b"User-agent: *\nDisallow: /*?private=*\nDisallow: /secret$\n"
    client, transport, _ = setup(robots=rules)
    with pytest.raises(SourceAccessError) as error:
        get(client, EASY_URL, params={"private": "yes"})
    assert error.value.code == "robots_disallowed"
    assert len(transport.calls) == 1
    assert get(client, "https://www.easy.cl/secret/more") == {"ok": True}
    with pytest.raises(SourceAccessError):
        get(client, "https://www.easy.cl/secret")


def test_robots_encoded_unreserved_path_and_reserved_slash_are_distinct():
    rules = b"User-agent: *\nDisallow: /%63eramica\nDisallow: /foo%2Fbar\n"
    client, _, _ = setup(robots=rules)
    with pytest.raises(SourceAccessError):
        get(client, "https://www.easy.cl/ceramica")
    with pytest.raises(SourceAccessError):
        get(client, "https://www.easy.cl/foo%2fbar")
    assert get(client, "https://www.easy.cl/foo/bar") == {"ok": True}


def test_most_specific_user_agent_and_allow_tie_take_precedence():
    rules = (
        b"User-agent: *\nDisallow: /\n"
        b"User-agent: Habita3DResearch\nDisallow: /search\nAllow: /search\n"
    )
    client, _, _ = setup(robots=rules)
    assert get(client, EASY_URL) == {"ok": True}


@pytest.mark.parametrize("delay,expected", [(0, 5), (2, 5), (9.5, 9.5)])
def test_respects_crawl_delay_without_lowering_minimum(delay, expected):
    client, transport, _ = setup(robots=f"User-agent: *\nCrawl-delay: {delay}\n".encode())
    get(client)
    assert transport.calls[1][2] == expected


def test_excessive_crawl_delay_defers_instead_of_overloading_source():
    client, transport, _ = setup(robots=b"User-agent: *\nCrawl-delay: 121\n")
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "retry_deferred"
    assert len(transport.calls) == 1


def test_robots_404_allows_but_every_other_failure_stops_capture():
    client, transport, _ = setup()
    transport.robots_status = 404
    assert get(client) == {"ok": True}
    assert len(transport.calls) == 2
    for status in (401, 403, 500, 302):
        client, transport, _ = setup()
        transport.robots_status = status
        with pytest.raises(SourceAccessError) as error:
            get(client)
        assert error.value.code == "robots_unavailable"
        count = len(transport.calls)
        assert all(urlsplit(call[0]).path == "/robots.txt" for call in transport.calls)
        with pytest.raises(SourceAccessError):
            get(client)
        assert len(transport.calls) == count


@pytest.mark.parametrize("robots", [b"<html>Blocked</html>", b"\xff"])
def test_html_or_invalid_utf8_robots_fails_closed(robots):
    client, transport, _ = setup(robots=robots)
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "robots_unavailable"
    assert len(transport.calls) == 1


def test_403_stops_host_without_retrying_or_attempting_other_category():
    client, transport, _ = setup()
    transport.replies = [(403, {}, b"Forbidden")]
    for _ in range(2):
        with pytest.raises(SourceAccessError) as error:
            get(client)
        assert error.value.code == "forbidden"
    assert len(transport.calls) == 2


@pytest.mark.parametrize(
    "location",
    [
        "http://169.254.169.254/",
        "https://www.easy.cl/search/piso",
        "/another-route",
    ],
)
def test_all_redirects_are_rejected_without_following(location):
    client, transport, _ = setup()
    transport.replies = [(302, {"Location": location}, b"")]
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "redirect_not_allowed"
    assert len(transport.calls) == 2
    assert _NoRedirect().redirect_request(None, None, 302, "", {}, location) is None


def test_429_honors_retry_after_seconds_and_preserves_minimum_pacing():
    client, transport, _ = setup()
    transport.replies = [(429, {"Retry-After": "12"}, b"")]
    assert get(client) == {"ok": True}
    assert [call[2] for call in transport.calls] == [0, 5, 17]


def test_retry_after_http_date_is_respected():
    client, transport, _ = setup()
    transport.replies = [(429, {"Retry-After": "Sun, 18 Oct 2026 12:00:30 GMT"}, b"")]
    assert get(client) == {"ok": True}
    assert [call[2] for call in transport.calls] == [0, 5, 30]


def test_retry_after_beyond_limit_is_deferred_without_sleeping_until_then():
    client, transport, clock = setup()
    transport.replies = [(429, {"Retry-After": "121"}, b"")]
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "retry_deferred"
    assert len(transport.calls) == 2
    assert clock.seconds == 5
    with pytest.raises(SourceAccessError) as later:
        get(client)
    assert later.value.code == "retry_deferred"
    assert len(transport.calls) == 2


def test_last_429_cooldown_is_kept_for_another_category():
    client, transport, _ = setup()
    transport.replies = [(429, {"Retry-After": "20"}, b"")] * 3
    with pytest.raises(SourceAccessError):
        get(client)
    assert get(client) == {"ok": True}
    assert [call[2] for call in transport.calls] == [0, 5, 25, 45, 65]


@pytest.mark.parametrize(
    "reply,code",
    [
        ((429, {}, b""), "rate_limited"),
        ((503, {}, b""), "http_error"),
        (TimeoutError("timeout"), "network_error"),
    ],
)
def test_retries_are_bounded_to_two_and_all_attempts_are_paced(reply, code):
    client, transport, _ = setup()
    transport.replies = [reply, reply, reply, (200, {}, b"{}")]
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == code
    assert [call[2] for call in transport.calls] == [0, 5, 10, 15]
    assert len(transport.replies) == 1


def test_transient_timeout_and_server_failure_recover():
    client, transport, _ = setup()
    transport.replies = [TimeoutError("timeout"), (503, {}, b"")]
    assert get(client) == {"ok": True}
    assert len(transport.calls) == 4


def test_maximum_request_budget_counts_robots_and_retries():
    client, transport, _ = setup()

    async def capture():
        for _ in range(79):
            await client.get_json(URL)
        with pytest.raises(SourceAccessError) as error:
            await client.get_json(URL)
        assert error.value.code == "request_limit"

    asyncio.run(capture())
    assert client.request_count == len(transport.calls) == 80


@pytest.mark.parametrize("body", [b"not json", b"\xff", b'{"price":NaN}', b"[" * 1100])
def test_malformed_nonfinite_or_deep_json_does_not_escape_as_an_internal_error(body):
    client, transport, _ = setup()
    transport.replies = [(200, {}, body)]
    with pytest.raises(SourceAccessError) as error:
        get(client)
    assert error.value.code == "invalid_json"


def test_oversized_json_and_html_are_bounded():
    for text in (False, True):
        client, transport, _ = setup()
        transport.replies = [(200, {}, b"x" * (MAX_RESPONSE_BYTES + 1))]
        with pytest.raises(SourceAccessError) as error:
            asyncio.run(client.get_text(URL)) if text else get(client)
        assert error.value.code == "response_too_large"
        assert len(transport.calls) == 2


def test_text_reader_returns_unicode_and_does_not_accept_silent_compression():
    client, transport, _ = setup()
    transport.replies = [(200, {}, "<h1>Cerámica</h1>".encode())]
    assert asyncio.run(client.get_text(EASY_URL)) == "<h1>Cerámica</h1>"
    transport.replies = [(200, {"Content-Encoding": "gzip"}, b"not plain text")]
    with pytest.raises(SourceAccessError) as error:
        get(client, EASY_URL)
    assert error.value.code == "invalid_encoding"


@pytest.mark.parametrize(
    "headers,cookies",
    [
        ({"User-Agent": "Mozilla/5.0"}, None),
        ({"Host": "127.0.0.1"}, None),
        ({"Authorization": "secret"}, None),
        ({"Cookie": "session=secret"}, None),
        ({"Accept": "value\r\nHost: evil"}, None),
        (None, {"commune": "13110; session=secret"}),
        (None, {"commune": "13110\nHeader: value"}),
    ],
)
def test_does_not_allow_header_or_cookie_injection_or_identity_override(headers, cookies):
    client, transport, _ = setup()
    with pytest.raises(SourceAccessError) as error:
        get(client, headers=headers, cookies=cookies)
    assert error.value.code == "invalid_headers"
    assert transport.calls == []
