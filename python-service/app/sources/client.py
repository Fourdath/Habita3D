"""Small, bounded HTTP reader for the two public EP2 retail sources.

No browser impersonation, access-control bypass, persistent cookies or automatic
redirects. Each client checks robots.txt, serializes calls per host and spaces
all attempts (including robots and retries) by at least five seconds.
"""

import asyncio
import json
import math
import re
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote_to_bytes, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.sources.base import SourceAccessError

ALLOWED_HOSTS = frozenset({"www.sodimac.cl", "www.easy.cl"})
USER_AGENT = "Habita3DResearch/1.0 (+https://github.com/Fourdath/Habita3D)"
MIN_DELAY_SECONDS = 5.0
MAX_RETRY_DELAY_SECONDS = 120.0
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_REQUESTS = 80
TIMEOUT_SECONDS = 15
MAX_RETRIES = 2
_UNRESERVED = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
_HEADER_NAME = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")
_PROTECTED_HEADERS = {
    "host",
    "user-agent",
    "cookie",
    "authorization",
    "proxy-authorization",
    "connection",
    "content-length",
    "transfer-encoding",
    "accept-encoding",
}

Transport = Callable[[str, Mapping[str, str]], tuple[int, Mapping[str, str], bytes]]


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _stdlib_transport(url: str, headers: Mapping[str, str]) -> tuple[int, dict[str, str], bytes]:
    request = Request(url, headers=dict(headers), method="GET")
    opener = build_opener(_NoRedirect())
    try:
        response = opener.open(request, timeout=TIMEOUT_SECONDS)
    except HTTPError as error:
        response = error
    with response:
        response_headers = dict(response.headers.items())
        # Read one extra byte to detect an oversized response without downloading it all.
        body = response.read(MAX_RESPONSE_BYTES + 1)
        return response.code, response_headers, body


def _url(url: str, params: Mapping[str, Any] | None = None) -> tuple[str, str]:
    if not isinstance(url, str) or any(ord(char) < 33 or ord(char) == 127 for char in url):
        raise SourceAccessError("invalid_url", "La URL debe ser HTTPS y no contener controles")
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in ALLOWED_HOSTS
            or parsed.port not in (None, 443)
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or "\\" in url
        ):
            raise ValueError("URL fuera de alcance")
    except ValueError as error:
        raise SourceAccessError(
            "invalid_url", "Solo se admiten los dos hosts HTTPS acordados"
        ) from error
    query = parsed.query
    if params:
        encoded = urlencode(params, doseq=True)
        query = f"{query}&{encoded}" if query else encoded
    path = parsed.path or "/"
    # Encode Unicode path characters, retaining already escaped octets and URL separators.
    path = quote(path, safe="/%:@!$&'()*+,;=-._~")
    result = urlunsplit(("https", parsed.netloc, path, query, ""))
    return result, parsed.hostname


def _normalize_robots_path(path: str) -> str:
    """Compare encoded reserved bytes literally and decode only unreserved bytes."""
    path = quote(path, safe="/%?&=:@!$'()*+,;~-._")

    def normalized(match: re.Match) -> str:
        char = chr(int(match.group(1), 16))
        return char if char in _UNRESERVED else "%" + match.group(1).upper()

    return re.sub(r"%([0-9a-fA-F]{2})", normalized, path)


@dataclass(frozen=True)
class _Rule:
    allow: bool
    pattern: re.Pattern
    specificity: int


@dataclass(frozen=True)
class _Robots:
    rules: tuple[_Rule, ...] = ()
    crawl_delay: float = MIN_DELAY_SECONDS

    def allows(self, url: str) -> bool:
        parsed = urlsplit(url)
        target = _normalize_robots_path(parsed.path + ("?" + parsed.query if parsed.query else ""))
        matches = [rule for rule in self.rules if rule.pattern.match(target)]
        if not matches:
            return True
        most_specific = max(rule.specificity for rule in matches)
        # An equally specific Allow rule wins a conflict.
        return any(rule.allow for rule in matches if rule.specificity == most_specific)


def _parse_robots(text: str) -> _Robots:
    if text.lstrip("\ufeff \t\r\n").startswith("<"):
        raise SourceAccessError("robots_unavailable", "robots.txt devolvió HTML inesperado")
    groups: list[tuple[list[str], list[tuple[bool, str]], list[float]]] = []
    agents: list[str] = []
    paths: list[tuple[bool, str]] = []
    delays: list[float] = []
    has_directives = False

    def flush() -> None:
        nonlocal agents, paths, delays, has_directives
        if agents:
            groups.append((agents, paths, delays))
        agents, paths, delays = [], [], []
        has_directives = False

    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip().lstrip("\ufeff")
        if not line:
            continue
        key, separator, value = line.partition(":")
        if not separator:
            continue
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if has_directives:
                flush()
            if value:
                agents.append(value.lower())
        elif agents:
            has_directives = True
            if key in {"allow", "disallow"} and value:
                paths.append((key == "allow", value))
            elif key == "crawl-delay":
                try:
                    delay = float(value)
                except ValueError:
                    continue
                if math.isfinite(delay) and delay >= 0:
                    delays.append(delay)
    flush()
    product = "habita3dresearch"
    selected = []
    best_score = -1
    for group in groups:
        scores = [
            0 if agent == "*" else len(agent)
            for agent in group[0]
            if agent == "*" or agent in product
        ]
        if not scores:
            continue
        score = max(scores)
        if score > best_score:
            selected, best_score = [group], score
        elif score == best_score:
            selected.append(group)
    rules = []
    delay = MIN_DELAY_SECONDS
    for _, group_paths, group_delays in selected:
        if group_delays:
            delay = max(delay, *group_delays)
        for allow, raw_path in group_paths:
            path = _normalize_robots_path(raw_path)
            anchor = path.endswith("$")
            if anchor:
                path = path[:-1]
            regex = "^" + re.escape(path).replace(r"\*", ".*") + ("$" if anchor else "")
            specificity = len(unquote_to_bytes(path.replace("*", "")))
            rules.append(_Rule(allow, re.compile(regex), specificity))
    return _Robots(tuple(rules), delay)


@dataclass
class _HostState:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    robots: _Robots | None = None
    last_started: float | None = None
    not_before: float = 0
    blocked: tuple[str, str] | None = None


class SafeSourceClient:
    """Use one instance for one bounded capture; dependency injection is for tests.

    Production cannot disable robots, lower the minimum pause or raise the
    request/response limits through environment variables or endpoint inputs.
    """

    def __init__(
        self,
        *,
        transport: Transport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._transport = transport or _stdlib_transport
        self._sleep = sleep
        self._monotonic = monotonic
        self._clock = clock
        self._states: dict[str, _HostState] = {}
        self.request_count = 0
        self._closed = False

    async def __aenter__(self) -> "SafeSourceClient":
        if self._closed:
            raise SourceAccessError("client_closed", "El cliente ya está cerrado")
        return self

    async def __aexit__(self, *args) -> None:
        self._closed = True
        self._states.clear()

    def _headers(
        self,
        *,
        headers: Mapping[str, str] | None,
        cookies: Mapping[str, str] | None,
        accept: str,
    ) -> dict[str, str]:
        result = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Encoding": "identity"}
        for key, value in (headers or {}).items():
            if (
                not isinstance(key, str)
                or not _HEADER_NAME.fullmatch(key)
                or key.lower() in _PROTECTED_HEADERS
                or not isinstance(value, str)
                or len(value) > 8192
                or any(ord(char) < 32 or ord(char) > 255 or ord(char) == 127 for char in value)
            ):
                raise SourceAccessError("invalid_headers", "Cabecera no admitida")
            result[key] = value
        cookie_parts = []
        for key, value in (cookies or {}).items():
            if (
                not isinstance(key, str)
                or not _HEADER_NAME.fullmatch(key)
                or not isinstance(value, str)
                or len(value) > 8192
                or ";" in value
                or any(ord(char) < 32 or ord(char) > 126 for char in value)
            ):
                raise SourceAccessError("invalid_headers", "Cookie pública no válida")
            cookie_parts.append(f"{key}={value}")
        if cookie_parts:
            result["Cookie"] = "; ".join(cookie_parts)
        return result

    async def _pace(self, state: _HostState) -> None:
        delay = state.robots.crawl_delay if state.robots else MIN_DELAY_SECONDS
        if delay > MAX_RETRY_DELAY_SECONDS:
            raise SourceAccessError("retry_deferred", "Crawl-delay requiere diferir la captura")
        earliest = max(
            state.not_before,
            state.last_started + delay if state.last_started is not None else 0,
        )
        wait = earliest - self._monotonic()
        if wait > 0:
            await self._sleep(wait)

    def _retry_after(self, value: str | None) -> float:
        if not value:
            return MIN_DELAY_SECONDS
        value = value.strip()
        if value.isdigit():
            delay = float(value)
        else:
            try:
                date = parsedate_to_datetime(value)
                if date.tzinfo is None:
                    date = date.replace(tzinfo=UTC)
                delay = max(0, (date - self._clock()).total_seconds())
            except (ValueError, TypeError, OverflowError):
                return MIN_DELAY_SECONDS
        if not math.isfinite(delay) or delay > MAX_RETRY_DELAY_SECONDS:
            raise SourceAccessError("retry_deferred", "Retry-After requiere diferir la captura")
        return max(0, delay)

    async def _request(
        self, url: str, headers: Mapping[str, str], state: _HostState
    ) -> tuple[dict[str, str], bytes]:
        for attempt in range(MAX_RETRIES + 1):
            await self._pace(state)
            if self.request_count >= MAX_REQUESTS:
                raise SourceAccessError("request_limit", "Se alcanzó el máximo de 80 solicitudes")
            self.request_count += 1
            state.last_started = self._monotonic()
            try:
                status, received_headers, body = await asyncio.to_thread(
                    self._transport, url, headers
                )
            except (TimeoutError, OSError, URLError) as error:
                if attempt == MAX_RETRIES:
                    raise SourceAccessError(
                        "network_error", "La fuente no respondió después de tres intentos"
                    ) from error
                continue
            response_headers = {key.lower(): value for key, value in received_headers.items()}
            if not isinstance(body, bytes) or len(body) > MAX_RESPONSE_BYTES:
                raise SourceAccessError("response_too_large", "La respuesta supera 8 MiB")
            if 300 <= status < 400:
                raise SourceAccessError(
                    "redirect_not_allowed", "La fuente solicitó una redirección"
                )
            if status == 403:
                state.blocked = ("forbidden", "La fuente rechazó el acceso; captura detenida")
                raise SourceAccessError("forbidden", "La fuente rechazó el acceso; no se reintentó")
            if status == 429 or 500 <= status <= 599:
                try:
                    retry_delay = self._retry_after(response_headers.get("retry-after"))
                except SourceAccessError as error:
                    state.blocked = (error.code, str(error))
                    raise
                # Keep the cooldown even when the final permitted attempt fails,
                # so a later category cannot immediately ignore Retry-After.
                state.not_before = self._monotonic() + retry_delay
                if attempt == MAX_RETRIES:
                    code = "rate_limited" if status == 429 else "http_error"
                    raise SourceAccessError(code, f"La fuente continúa respondiendo HTTP {status}")
                continue
            if status == 404:
                return {**response_headers, "_status": "404"}, body
            if status != 200:
                raise SourceAccessError("http_error", f"La fuente respondió HTTP {status}")
            if response_headers.get("content-encoding", "identity").lower() != "identity":
                raise SourceAccessError(
                    "invalid_encoding", "La fuente ignoró Accept-Encoding identity"
                )
            return response_headers, body
        raise AssertionError("Unreachable bounded retry loop")

    async def _read(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None,
        headers: Mapping[str, str] | None,
        cookies: Mapping[str, str] | None,
        accept: str,
    ) -> tuple[dict[str, str], bytes]:
        if self._closed:
            raise SourceAccessError("client_closed", "El cliente ya está cerrado")
        target, host = _url(url, params)
        request_headers = self._headers(headers=headers, cookies=cookies, accept=accept)
        state = self._states.setdefault(host, _HostState())
        async with state.lock:
            if state.blocked is not None:
                raise SourceAccessError(*state.blocked)
            if state.robots is None:
                robots_url = f"https://{host}/robots.txt"
                robots_headers = self._headers(headers=None, cookies=None, accept="text/plain")
                try:
                    metadata, raw = await self._request(robots_url, robots_headers, state)
                    state.robots = (
                        _Robots()
                        if metadata.get("_status") == "404"
                        else _parse_robots(raw.decode("utf-8-sig"))
                    )
                except (SourceAccessError, UnicodeError) as error:
                    state.blocked = (
                        "robots_unavailable",
                        "No se pudo comprobar robots.txt; captura detenida",
                    )
                    raise SourceAccessError(
                        "robots_unavailable", "No se pudo comprobar robots.txt; captura detenida"
                    ) from error
            if not state.robots.allows(target):
                raise SourceAccessError("robots_disallowed", "robots.txt no permite esta ruta")
            metadata, body = await self._request(target, request_headers, state)
            if metadata.get("_status") == "404":
                raise SourceAccessError("not_found", "La ruta pública no está disponible")
            return metadata, body

    async def get_json(
        self,
        url: str,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        cookies: Mapping[str, str] | None = None,
    ) -> Any:
        _, body = await self._read(
            url, params=params, headers=headers, cookies=cookies, accept="application/json"
        )

        def invalid_constant(value: str) -> None:
            raise ValueError(f"Constante JSON no finita: {value}")

        try:
            return json.loads(body.decode("utf-8-sig"), parse_constant=invalid_constant)
        except (ValueError, UnicodeError, RecursionError) as error:
            raise SourceAccessError("invalid_json", "La fuente no entregó JSON válido") from error

    async def get_text(
        self,
        url: str,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        cookies: Mapping[str, str] | None = None,
    ) -> str:
        _, body = await self._read(
            url, params=params, headers=headers, cookies=cookies, accept="text/html, text/plain"
        )
        try:
            return body.decode("utf-8-sig")
        except UnicodeError as error:
            raise SourceAccessError(
                "invalid_encoding", "El HTML no está codificado en UTF-8"
            ) from error
