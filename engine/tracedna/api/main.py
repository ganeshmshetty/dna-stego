"""FastAPI application: codon-level DNA steganography.

Run: cd engine && uv run uvicorn tracedna.api.main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..attack.codon import DetectionResult
from ..attack import codon as detector
from ..channel.reads import sequence as sequence_reads
from ..genetics.code import split_codons
from ..genetics.corpus import Gene, build_cover, codon_usage, load_corpus
from ..genetics.stego import Coder, embed, extract
from ..keys import derive_key, fingerprint
from . import store
from .models import (
    ChannelRequest,
    CheckRequest,
    CoverRequest,
    DamageParams,
    DetectRequest,
    KeyRequest,
    MessageRequest,
)

app = FastAPI(title="TraceDNA", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_MESSAGE = 1_500_000
_CACHE: dict[str, Any] = {}


def _corpus() -> list[Gene]:
    if "genes" not in _CACHE:
        _CACHE["genes"] = load_corpus()
        _CACHE["usage"] = codon_usage(_CACHE["genes"])
    return _CACHE["genes"]


def _usage() -> dict[str, dict[str, float]]:
    _corpus()
    return _CACHE["usage"]


def _error(status: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "hint": hint}})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _require(session_id: str) -> dict[str, Any]:
    try:
        return store.load(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"no session {session_id}"})


def _save(artifact: dict[str, Any]) -> dict[str, Any]:
    store.save(artifact["session_id"], artifact)
    return artifact


def _invalidate(artifact: dict[str, Any], *fields: str) -> None:
    artifact["stale"] = sorted(set(artifact.get("stale", [])) | set(fields))


def _drop(artifact: dict[str, Any], *fields: str) -> None:
    for name in fields:
        artifact.pop(name, None)
    artifact["stale"] = sorted(set(artifact.get("stale", [])) - set(fields))


def _cover(artifact: dict[str, Any]) -> Gene:
    artifact.setdefault("cover_selection", {"gene_count": 8})
    return build_cover(_corpus(), int(artifact["cover_selection"]["gene_count"]))


def _diff(cover: Gene, stego: str, limit: int = 48) -> list[dict[str, Any]]:
    a = split_codons(cover.nucleotide)
    b = split_codons(stego)
    rows = []
    for i, (left, right) in enumerate(zip(a, b)):
        if left != right:
            rows.append({"codon_index": i, "cover": left, "stego": right})
        if len(rows) >= limit:
            break
    return rows


# --- routes ----------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    genes = _corpus()
    return {
        "ok": True,
        "genes": len(genes),
        "longest_nt": len(genes[0].nucleotide),
        "coders": ["uniform", "usage"],
        "message_limit": MAX_MESSAGE,
    }


@app.get("/api/genes")
def genes() -> dict[str, Any]:
    corpus = _corpus()
    return {
        "count": len(corpus),
        "genes": [
            {"name": g.name, "nt": len(g.nucleotide), "codons": g.codons}
            for g in corpus[:40]
        ],
    }


@app.post("/api/session")
def create_session() -> dict[str, Any]:
    session_id = store.new_session_id()
    artifact = {
        "session_id": session_id,
        "created_at": _now(),
        "key_id": "alice",
        "key_fingerprint": fingerprint(derive_key("alice")),
        "cover_selection": {"gene_count": 8},
        "coder": "usage",
        "cover": None,
        "message": None,
        "stego": None,
        "channel": None,
        "recovery": None,
        "detection": None,
        "stale": [],
    }
    store.create(session_id, artifact)
    return {"session_id": session_id, "created_at": artifact["created_at"]}


@app.post("/api/session/{session_id}/cover")
def set_cover(session_id: str, body: CoverRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    if body.gene_count > len(_corpus()):
        return _error(422, "not_enough_genes", "the corpus is smaller than requested")
    artifact["cover_selection"] = {"gene_count": body.gene_count}
    artifact["coder"] = body.coder
    artifact["key_id"] = body.passphrase.strip().lower()
    artifact["key_fingerprint"] = fingerprint(derive_key(artifact["key_id"]))
    cover = build_cover(_corpus(), body.gene_count)
    artifact["cover"] = {
        "name": cover.name,
        "nt": len(cover.nucleotide),
        "codons": cover.codons,
        "gene_count": body.gene_count,
        "sequence": cover.nucleotide,
        "preview": cover.nucleotide[:900],
        "protein_preview": cover.protein[:300],
    }
    _drop(artifact, "stego", "channel", "recovery", "detection")
    return _save(artifact)


@app.post("/api/session/{session_id}/message")
def set_message_text(session_id: str, body: MessageRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    data = body.text.encode()
    if len(data) > MAX_MESSAGE:
        return _error(413, "message_too_large", f"message exceeds {MAX_MESSAGE} bytes")
    store.write_payload(session_id, data)
    artifact["message"] = {
        "name": "typed-message.txt",
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "preview": body.text[:400],
    }
    _drop(artifact, "stego", "channel", "recovery")
    return _save(artifact)


@app.post("/api/session/{session_id}/message/upload")
def set_message_file(session_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    artifact = _require(session_id)
    data = file.file.read(MAX_MESSAGE + 1)
    if len(data) > MAX_MESSAGE:
        return _error(413, "message_too_large", f"file exceeds {MAX_MESSAGE} bytes")
    if not data:
        return _error(400, "empty_file", "the file is empty")
    store.write_payload(session_id, data)
    artifact["message"] = {
        "name": file.filename or "payload.bin",
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "preview": data[:400].decode("utf-8", "replace"),
    }
    _drop(artifact, "stego", "channel", "recovery")
    return _save(artifact)


@app.post("/api/session/{session_id}/embed")
def do_embed(session_id: str) -> dict[str, Any]:
    artifact = _require(session_id)
    if not artifact.get("message"):
        return _error(409, "no_message", "add a message before embedding")
    data = store.read_payload(session_id)
    cover = _cover(artifact)
    coder: Coder = artifact.get("coder", "usage")  # type: ignore[assignment]
    key = derive_key(artifact.get("key_id", "alice"))
    try:
        result = embed(cover, data, key, _usage(), coder)
    except ValueError as exc:
        return _error(
            422,
            "does_not_fit",
            str(exc),
            "increase the cover size or shorten the message",
        )

    artifact["stego"] = {
        "sequence": result.sequence,
        "preview": result.sequence[:900],
        "protein_identical": result.protein == cover.protein,
        "protein_preview": result.protein[:300],
        "capacity_bytes": result.capacity_bytes,
        "bits_per_codon": round(result.bits_per_codon, 4),
        "codon_count": result.codon_count,
        "changed_nt": sum(1 for a, b in zip(cover.nucleotide, result.sequence) if a != b),
        "diff": _diff(cover, result.sequence),
    }
    _drop(artifact, "channel", "recovery")
    artifact["detection"] = None
    return _save(artifact)


@app.post("/api/session/{session_id}/channel")
def do_channel(session_id: str, body: ChannelRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    if not artifact.get("stego"):
        return _error(409, "not_embedded", "embed a message first")
    result = sequence_reads(
        artifact["stego"]["sequence"],
        coverage=body.coverage,
        sub_rate=body.sub_rate,
        seed=body.seed,
    )
    store.write_consensus(session_id, result.consensus)
    artifact["channel"] = {
        "coverage": body.coverage,
        "sub_rate": body.sub_rate,
        "seed": body.seed,
        "applied": True,
        "reads": result.reads,
        "bases_read": result.bases_read,
        "substitutions": result.substitutions,
        "consensus_errors": result.consensus_errors,
    }
    _drop(artifact, "recovery")
    return _save(artifact)


@app.post("/api/session/{session_id}/recover")
def do_recover(session_id: str) -> dict[str, Any]:
    artifact = _require(session_id)
    if not artifact.get("stego"):
        return _error(409, "not_embedded", "embed a message first")
    consensus = store.read_consensus(session_id) if artifact.get("channel") else artifact["stego"]["sequence"]
    key = derive_key(artifact.get("key_id", "alice"))
    coder: Coder = artifact.get("coder", "usage")  # type: ignore[assignment]
    result = extract(consensus, key, _usage(), coder)
    artifact["recovery"] = {
        "ok": result.ok,
        "sha256": result.sha256,
        "length": result.length,
        "crc_ok": result.crc_ok,
        "error": result.error,
        "bits_read": result.bits_read,
        "preview": (result.message or b"")[:400].decode("utf-8", "replace"),
        "matches_original": result.sha256 == (artifact.get("message") or {}).get("sha256"),
    }
    return _save(artifact)


@app.post("/api/session/{session_id}/detect")
def do_detect(session_id: str, body: DetectRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    coder: Coder = artifact.get("coder", "usage")  # type: ignore[assignment]
    key = derive_key(artifact.get("key_id", "alice"))
    try:
        result: DetectionResult = detector.evaluate(
            _corpus(), _usage(), coder=coder, key=key, count=min(body.gene_count, len(_corpus()))
        )
    except ValueError as exc:
        return _error(422, "not_enough_data", str(exc))
    artifact["detection"] = {
        "auc": result.auc,
        "tpr_at_1pct": result.tpr_at_1pct,
        "n_natural": result.n_natural,
        "n_stego": result.n_stego,
        "n_train": result.n_train,
        "n_test": result.n_test,
        "coder": result.coder,
    }
    return _save(artifact)


@app.post("/api/key")
def key_info(body: KeyRequest) -> dict[str, Any]:
    key = derive_key(body.passphrase)
    return {"passphrase": body.passphrase, "fingerprint": fingerprint(key)}


@app.post("/api/session/{session_id}/check")
def do_check(session_id: str, body: CheckRequest) -> dict[str, Any]:
    """Test any sequence with any key, without touching the session state."""
    artifact = _require(session_id)

    sequence = (body.sequence or "").strip()
    if not sequence:
        sequence = (artifact.get("stego") or {}).get("sequence", "")
    sequence = "".join(ch for ch in sequence.upper() if ch in "ACGT")
    if not sequence:
        return _error(400, "invalid_sequence", "no ACGT bases found in that input")

    supplied = sequence
    cover_sequence = (artifact.get("cover") or {}).get("sequence")

    damaged = None
    if body.damage is not None:
        params: DamageParams = body.damage
        reads = sequence_reads(
            sequence, coverage=params.coverage, sub_rate=params.sub_rate, seed=params.seed
        )
        sequence = reads.consensus
        damaged = {
            "coverage": params.coverage,
            "sub_rate": params.sub_rate,
            "consensus_errors": reads.consensus_errors,
            "substitutions": reads.substitutions,
        }

    key = derive_key(body.passphrase)
    coder: Coder = (body.coder or artifact.get("coder", "usage"))  # type: ignore[assignment]
    result = extract(sequence, key, _usage(), coder)

    original_sha = (artifact.get("message") or {}).get("sha256")
    sha_match = bool(original_sha) and result.sha256 == original_sha
    checks = dict(result.checks)
    checks["sha"] = sha_match
    ok = bool(result.ok and (sha_match if original_sha else True))

    # Explain *why* it failed, not just where. A fingerprint mismatch and a
    # wrong coder both break decoding, but they are different mistakes.
    hints: list[str] = []
    supplied_fingerprint = fingerprint(key)
    if artifact.get("key_fingerprint") and supplied_fingerprint != artifact["key_fingerprint"]:
        hints.append(
            f"key fingerprint {supplied_fingerprint} does not match this session's "
            f"{artifact['key_fingerprint']} — the payload descrambles to noise"
        )
    if body.coder and body.coder != artifact.get("coder"):
        hints.append(
            f"coder mismatch: embedded with {artifact.get('coder')}, checked as {body.coder}"
        )
    if cover_sequence and supplied == cover_sequence:
        hints.append("this is the cover sequence; no message was ever embedded in it")

    if ok:
        reason = None
    elif result.ok and original_sha and not sha_match:
        reason = "CRC passed, but the recovered message differs from this session's original"
    else:
        reason = "; ".join(hints + ([result.error] if result.error else [])) or None

    return {
        "ok": ok,
        "reason": reason,
        "checks": checks,
        "passphrase": body.passphrase,
        "fingerprint": supplied_fingerprint,
        "session_fingerprint": artifact.get("key_fingerprint"),
        "crc_ok": result.crc_ok,
        "length": result.length,
        "preview": (result.message or b"")[:400].decode("utf-8", "replace"),
        "bits_read": result.bits_read,
        "coder": coder,
        "damaged": damaged,
    }


@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    return _require(session_id)
