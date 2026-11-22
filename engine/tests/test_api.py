"""API contract tests.

The end-to-end test skips while the codec/channel modules are still being
written; it activates automatically once they are importable.
"""

from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient

from tracedna.api import store
from tracedna.api.main import app


def _codec_available() -> bool:
    try:
        import tracedna.channel  # noqa: F401
        from tracedna.codec import decode, encode  # noqa: F401
    except ImportError:
        return False
    return True


CODEC_AVAILABLE = _codec_available()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(store, "SESSIONS_ROOT", tmp_path / "sessions")
    return TestClient(app)


@pytest.fixture()
def session_id(client) -> str:
    response = client.post("/api/session")
    assert response.status_code == 200
    return response.json()["session_id"]


def test_health_shape(client) -> None:
    body = client.get("/api/health").json()
    assert body["strand_length"] == 200
    assert body["alpha"] == 0.01
    assert body["presets"] == ["clean", "harsh", "realistic"]
    assert "codec" in body and "verifier" in body


def test_session_is_persisted(session_id, client) -> None:
    body = client.get(f"/api/session/{session_id}").json()
    assert body["session_id"] == session_id
    assert body["strands"] == []
    assert body["recipient"] is None


def test_unknown_session_is_404(client) -> None:
    assert client.get("/api/session/s_nope").status_code == 404


def test_upload_records_hash_and_recipient(client, session_id) -> None:
    payload = b"hello dna storage"
    response = client.post(
        f"/api/session/{session_id}/file",
        files={"file": ("note.txt", payload, "text/plain")},
        data={"recipient": "Alice"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["file"]["sha256"] == hashlib.sha256(payload).hexdigest()
    assert body["recipient"] == "alice"


def test_empty_upload_is_rejected(client, session_id) -> None:
    response = client.post(
        f"/api/session/{session_id}/file",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"recipient": "alice"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "empty_file"


def test_channel_before_encode_is_409(client, session_id) -> None:
    response = client.post(f"/api/session/{session_id}/channel", json={"sub": 0.01})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_encoded"


def test_recover_before_channel_is_409(client, session_id) -> None:
    response = client.post(f"/api/session/{session_id}/recover")
    assert response.status_code == 409


def test_results_are_never_fabricated(client) -> None:
    body = client.get("/api/results").json()
    assert body["available"] is False
    assert "sweep" in body["command"]


@pytest.mark.skipif(not CODEC_AVAILABLE, reason="codec/channel not implemented yet")
def test_end_to_end_roundtrip_and_verify(client, session_id) -> None:
    payload = b"The quick brown fox jumps over the lazy dog. " * 20

    assert client.post(
        f"/api/session/{session_id}/file",
        files={"file": ("fox.txt", payload, "text/plain")},
        data={"recipient": "alice"},
    ).status_code == 200

    encoded = client.post(f"/api/session/{session_id}/encode", json={"recipient": "alice"}).json()
    assert encoded["stats"]["strand_count"] >= 1
    assert 0 < encoded["stats"]["bits_per_nt"] <= 2

    assert client.post(
        f"/api/session/{session_id}/channel",
        json={"sub": 0.0, "ins": 0.0, "delete": 0.0, "dropout": 0.0, "seed": 1},
    ).status_code == 200

    recovered = client.post(f"/api/session/{session_id}/recover").json()["recovery"]
    assert recovered["ok"] is True
    assert recovered["recovered_sha256"] == hashlib.sha256(payload).hexdigest()
    assert recovered["strands_in"] >= recovered["strands_out"] > 0

    artifact = client.get(f"/api/session/{session_id}").json()
    assert len(artifact["strands"][0]["mark_positions"]) == 16
    seq = artifact["strands"][0]["seq"]

    good = client.post(
        f"/api/session/{session_id}/verify",
        json={"sequence": seq, "key_id": "alice"},
    ).json()
    assert good["detected"] is True
    assert good["recipient"] == "alice"

    bad = client.post(
        f"/api/session/{session_id}/verify",
        json={"sequence": seq, "key_id": "bob"},
    ).json()
    assert bad["detected"] is False
