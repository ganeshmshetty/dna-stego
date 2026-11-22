"""Session persistence. One JSON artifact per session, plus the raw payload.

Local-only: no database, no locking beyond an atomic write.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any

DATA_ROOT = Path(os.environ.get("TRACEDNA_DATA", Path(__file__).resolve().parents[3] / "data"))
SESSIONS_ROOT = DATA_ROOT / "sessions"


def new_session_id() -> str:
    return "s_" + uuid.uuid4().hex[:20]


def session_dir(session_id: str) -> Path:
    if not session_id or "/" in session_id or ".." in session_id:
        raise ValueError("invalid session id")
    return SESSIONS_ROOT / session_id


def create(session_id: str, artifact: dict[str, Any]) -> dict[str, Any]:
    directory = session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    save(session_id, artifact)
    return artifact


def load(session_id: str) -> dict[str, Any]:
    path = session_dir(session_id) / "artifact.json"
    if not path.exists():
        raise FileNotFoundError(session_id)
    return json.loads(path.read_text())


def save(session_id: str, artifact: dict[str, Any]) -> None:
    """Atomic write, so a crashed request never leaves a half-written artifact."""
    directory = session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".artifact-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(artifact, handle, indent=2)
        os.replace(tmp, directory / "artifact.json")
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def payload_path(session_id: str) -> Path:
    return session_dir(session_id) / "payload.bin"


def write_payload(session_id: str, data: bytes) -> None:
    directory = session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    payload_path(session_id).write_bytes(data)


def read_payload(session_id: str) -> bytes:
    return payload_path(session_id).read_bytes()


def write_consensus(session_id: str, sequence: str) -> None:
    path = session_dir(session_id) / "consensus.txt"
    path.write_text(sequence)


def read_consensus(session_id: str) -> str:
    path = session_dir(session_id) / "consensus.txt"
    if not path.exists():
        raise FileNotFoundError("consensus")
    return path.read_text().strip()
