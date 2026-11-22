# SPDX-License-Identifier: Apache-2.0
"""One HTTP answer as `urllib.request.urlopen` hands it to a direct provider transport, for the offline
tests: its status, headers and body, read whole (`read`) or a chunk at a time by `xai.read_whole` when a
deadline bounds the reads (each read's wait set on the socket under it, kept in `waits`). A refusal
carries one as its body: `urllib.error.HTTPError(url, status, msg, headers, Answer(...))`."""
from __future__ import annotations

import io
import json
from types import SimpleNamespace
from typing import Any


class Answer:
    def __init__(self, body: Any = b"", *, status: int = 200, headers: Any = None) -> None:
        self.status = status
        self.headers = {} if headers is None else headers
        self._body = io.BytesIO(body if isinstance(body, bytes) else json.dumps(body).encode())
        self.length = None  # what http.client keeps of a Content-Length still to come: none was sent
        self.waits: list[float] = []
        self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=SimpleNamespace(settimeout=self.waits.append)))

    def __enter__(self) -> Answer:
        return self

    def __exit__(self, *exc: Any) -> None:
        self._body.close()

    def isclosed(self) -> bool:
        return self._body.closed

    def read(self, amount: int = -1) -> bytes:
        return self._body.read(amount)

    def read1(self, amount: int = -1) -> bytes:
        return self._body.read1(amount)
