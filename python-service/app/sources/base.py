from dataclasses import dataclass, field
from typing import Any, Protocol


class SourceAccessError(Exception):
    """A source could not be read safely; never replace its data with demo values."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class SourcePage:
    records: list[dict[str, Any]]
    has_next: bool
    request_url: str
    retrieved_count: int | None = None
    excluded_count: int = 0
    warnings: list[str] = field(default_factory=list)


class SourceAdapter(Protocol):
    source: str

    async def fetch_page(self, client: Any, category: str, page: int) -> SourcePage: ...
