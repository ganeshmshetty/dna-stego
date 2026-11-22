"""API tests for the codon-steganography flow."""

from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient

from tracedna.api import store
from tracedna.api.main import app
from tracedna.genetics.corpus import CorpusMissing, load_corpus

try:
    load_corpus()
    HAVE_CORPUS = True
except CorpusMissing:
    HAVE_CORPUS = False

needs_corpus = pytest.mark.skipif(not HAVE_CORPUS, reason="CDS corpus not fetched")

MESSAGE = "Meet at the north gate at midnight. Bring the samples."


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(store, "SESSIONS_ROOT", tmp_path / "sessions")
    return TestClient(app)


@pytest.fixture()
def session(client) -> dict:
    sid = client.post("/api/session").json()["session_id"]
    client.post(
        f"/api/session/{sid}/cover",
        json={"gene_count": 8, "coder": "usage", "passphrase": "alice"},
    )
    client.post(f"/api/session/{sid}/message", json={"text": MESSAGE})
    artifact = client.post(f"/api/session/{sid}/embed").json()
    artifact["_sid"] = sid
    return artifact


def test_health_reports_corpus(client) -> None:
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["coders"] == ["uniform", "usage"]


def test_key_fingerprints_differ(client) -> None:
    alice = client.post("/api/key", json={"passphrase": "alice"}).json()
    bob = client.post("/api/key", json={"passphrase": "bob"}).json()
    assert alice["fingerprint"] != bob["fingerprint"]
    assert len(alice["fingerprint"].split()) == 4


@needs_corpus
def test_embed_keeps_the_protein(session) -> None:
    assert session["stego"]["protein_identical"] is True
    assert len(session["stego"]["sequence"]) == session["cover"]["nt"]
    assert session["stego"]["capacity_bytes"] > 0


@needs_corpus
def test_correct_key_recovers(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check", json={"passphrase": "alice"}
    ).json()
    assert result["ok"] is True
    assert all(result["checks"].values())
    assert result["crc_ok"] is True
    assert hashlib.sha256(MESSAGE.encode()).hexdigest()[:16] in (
        client.get(f"/api/session/{sid}").json()["message"]["sha256"][:16]
    )


@needs_corpus
def test_wrong_key_fails_with_fingerprint_reason(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check", json={"passphrase": "bob"}
    ).json()
    assert result["ok"] is False
    assert result["checks"]["ecc"] is False
    assert "fingerprint" in (result["reason"] or "")


@needs_corpus
def test_wrong_coder_fails(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check", json={"passphrase": "alice", "coder": "uniform"}
    ).json()
    assert result["ok"] is False
    assert "coder mismatch" in (result["reason"] or "")


@needs_corpus
def test_cover_sequence_has_no_message(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check",
        json={"passphrase": "alice", "sequence": session["cover"]["sequence"]},
    ).json()
    assert result["ok"] is False
    assert "cover sequence" in (result["reason"] or "")


@needs_corpus
def test_heavy_damage_fails(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check",
        json={"passphrase": "alice", "damage": {"coverage": 1, "sub_rate": 0.05, "seed": 2}},
    ).json()
    assert result["ok"] is False
    assert result["damaged"]["consensus_errors"] > 0


@needs_corpus
def test_frame_shift_fails(session, client) -> None:
    sid = session["_sid"]
    result = client.post(
        f"/api/session/{sid}/check",
        json={"passphrase": "alice", "sequence": session["stego"]["sequence"][1:]},
    ).json()
    assert result["ok"] is False
    assert result["checks"]["translatable"] is False
