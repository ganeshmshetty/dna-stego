"""FastAPI application for the TraceDNA demo.

Run locally:  cd engine && uv run uvicorn tracedna.api.main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..config import (
    ALPHA,
    CHANNEL_PRESETS,
    MAX_PASTE_NT,
    MAX_STRANDS,
    MAX_UPLOAD_BYTES,
    STRAND_LENGTH,
)
from ..types import ChannelParams, CodecParams, Strand
from . import store
from .models import ChannelRequest, EncodeRequest, VerifyRequest

app = FastAPI(title="TraceDNA", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- helpers ---------------------------------------------------------------
def _error(status: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "hint": hint}})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _require(session_id: str) -> dict[str, Any]:
    try:
        return store.load(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"no session {session_id}"})


def _invalidate(artifact: dict[str, Any], *fields: str) -> None:
    stale = set(artifact.get("stale", []))
    stale.update(fields)
    artifact["stale"] = sorted(stale)


def _clear(artifact: dict[str, Any], *fields: str) -> None:
    for field_name in fields:
        artifact.pop(field_name, None)
    stale = set(artifact.get("stale", []))
    stale.difference_update(fields)
    artifact["stale"] = sorted(stale)


def _codec():
    """Lazy import so /health works before the codec modules exist."""
    from ..codec import decode, encode

    return encode, decode


def _verify():
    from ..verify import verify_strands

    return verify_strands


# --- lifecycle -------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    status: dict[str, Any] = {
        "ok": True,
        "python": sys.version.split()[0],
        "platform": platform.system(),
        "alpha": ALPHA,
        "strand_length": STRAND_LENGTH,
        "presets": sorted(CHANNEL_PRESETS),
    }
    try:
        _codec()
        status["codec"] = "ok"
    except Exception as exc:  # noqa: BLE001 - health must never raise
        status["codec"] = f"missing: {exc.__class__.__name__}"
        status["ok"] = False
    try:
        _verify()
        status["verifier"] = "ok"
    except Exception as exc:  # noqa: BLE001
        status["verifier"] = f"missing: {exc.__class__.__name__}"
        status["ok"] = False
    return status


@app.post("/api/session")
def create_session() -> dict[str, Any]:
    session_id = store.new_session_id()
    artifact: dict[str, Any] = {
        "session_id": session_id,
        "created_at": _now(),
        "file": None,
        "recipient": None,
        "key_id": None,
        "params": {
            "strand_length": STRAND_LENGTH,
            "ecc": {"scheme": "rs", "n": 50, "k": 34},
            "watermark": {"mode": "reserved", "field_nt": 16, "bits": 32},
            "payload_bytes_per_strand": 26,
        },
        "strands": [],
        "stats": {},
        "channel": {"sub": 0.0, "ins": 0.0, "delete": 0.0, "dropout": 0.0, "seed": 1, "applied": False},
        "recovery": None,
        "verification": None,
        "stale": [],
    }
    store.create(session_id, artifact)
    return artifact


@app.post("/api/session/{session_id}/file")
def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    recipient: str = Form("alice"),
) -> dict[str, Any]:
    artifact = _require(session_id)
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        return _error(413, "file_too_large", f"upload exceeds {MAX_UPLOAD_BYTES} bytes", "encode a smaller file")
    if not data:
        return _error(400, "empty_file", "the uploaded file is empty", "choose a file with at least one byte")

    store.write_payload(session_id, data)
    artifact["file"] = {
        "name": file.filename or "payload.bin",
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    artifact["recipient"] = recipient.strip().lower()
    artifact["key_id"] = artifact["recipient"]
    _clear(artifact, "strands", "stats", "recovery", "verification")
    artifact["channel"]["applied"] = False
    store.save(session_id, artifact)
    return {"file": artifact["file"], "recipient": artifact["recipient"]}


@app.post("/api/session/{session_id}/encode")
def encode_session(session_id: str, body: EncodeRequest | None = None) -> dict[str, Any]:
    artifact = _require(session_id)
    data = store.read_payload(session_id)

    encode, _decode = _codec()
    from ..watermark.fields import derive_key

    recipient = (body.recipient if body and body.recipient else artifact.get("recipient")) or "alice"
    recipient = recipient.strip().lower()
    mode = (body.watermark_mode if body else None) or artifact["params"]["watermark"]["mode"]
    params = CodecParams(watermark_mode=mode)  # type: ignore[arg-type]
    params.validate()

    expected_strands = -(-len(data) // params.payload_bytes_per_strand)
    if expected_strands > MAX_STRANDS:
        return _error(
            422,
            "too_many_strands",
            f"{len(data)} bytes needs {expected_strands} strands, limit is {MAX_STRANDS}",
            "encode a smaller file or raise MAX_STRANDS",
        )

    result = encode(data, derive_key(recipient), recipient, params)
    artifact["recipient"] = recipient
    artifact["key_id"] = recipient
    artifact["params"]["watermark"]["mode"] = mode
    artifact["params"]["payload_bytes_per_strand"] = params.payload_bytes_per_strand
    artifact["strands"] = [
        {
            "index": strand.index,
            "seq": strand.seq,
            "gc": round(sum(base in "GC" for base in strand.seq) / len(strand.seq), 4),
            "max_homopolymer": _max_run(strand.seq),
            "marked": mode == "reserved",
        }
        for strand in result.strands
    ]
    artifact["stats"] = {
        "strand_count": len(result.strands),
        "nt_total": result.nt_total,
        "bits_per_nt": round(result.bits_per_nt, 4),
        "gc_mean": round(result.gc_mean, 4),
        "gc_spread": round(result.gc_spread, 4),
        "max_homopolymer": result.max_homopolymer,
        "payload_bytes": result.payload_bytes,
    }
    _clear(artifact, "recovery", "verification", "noisy_strands")
    artifact["channel"]["applied"] = False
    store.save(session_id, artifact)

    return {
        "stats": artifact["stats"],
        "preview": artifact["strands"][:3],
        "params": artifact["params"],
    }


@app.post("/api/session/{session_id}/channel")
def apply_channel(session_id: str, body: ChannelRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    if not artifact.get("strands"):
        return _error(409, "not_encoded", "encode the file before applying a channel", "call /encode first")

    from ..channel import apply as apply_noise

    strands = [Strand(index=s["index"], seq=s["seq"]) for s in artifact["strands"]]
    params = ChannelParams(sub=body.sub, ins=body.ins, delete=body.delete, dropout=body.dropout, seed=body.seed)
    params.validate()
    result = apply_noise(strands, params)

    artifact["noisy_strands"] = [{"index": s.index, "seq": s.seq, "survived": True} for s in result.strands]
    artifact["channel"] = {
        "sub": body.sub,
        "ins": body.ins,
        "delete": body.delete,
        "dropout": body.dropout,
        "seed": body.seed,
        "applied": True,
    }
    artifact["channel_stats"] = {
        "strands_in": result.strands_in,
        "strands_out": result.strands_out,
        "nt_in": result.nt_in,
        "nt_out": result.nt_out,
        "events": result.events,
    }
    _clear(artifact, "recovery", "verification")
    store.save(session_id, artifact)

    return {"channel": artifact["channel"], "summary": artifact["channel_stats"], "preview": _diff_preview(artifact, result.strands)}


@app.post("/api/session/{session_id}/recover")
def recover_session(session_id: str) -> dict[str, Any]:
    artifact = _require(session_id)
    noisy = artifact.get("noisy_strands")
    if not noisy:
        return _error(409, "no_channel", "apply a channel before decoding", "call /channel first")

    _encode, decode = _codec()
    strands = [Strand(index=s["index"], seq=s["seq"]) for s in noisy]
    reference = store.read_payload(session_id)
    result = decode(strands, CodecParams(watermark_mode=artifact["params"]["watermark"]["mode"]), reference)  # type: ignore[arg-type]

    artifact["recovery"] = {
        "ok": result.ok,
        "bytes_recovered": result.bytes_recovered,
        "expected_bytes": len(reference),
        "sha256": result.sha256,
        "ber_pre_ecc": result.ber_pre_ecc,
        "ber_post_ecc": result.ber_post_ecc,
        "strands_in": artifact["channel_stats"]["strands_out"],
        "strands_used": result.strands_used,
        "strands_failed": result.strands_failed,
    }
    store.save(session_id, artifact)
    return artifact["recovery"]


@app.post("/api/session/{session_id}/verify")
def verify(session_id: str, body: VerifyRequest) -> dict[str, Any]:
    artifact = _require(session_id)
    if len(body.sequence) > MAX_PASTE_NT:
        return _error(413, "sequence_too_long", f"sequence exceeds {MAX_PASTE_NT} nt", "paste one or a few strands")

    verify_strands = _verify()
    from ..watermark.fields import derive_key

    key_id = body.key_id.strip().lower()
    strands = _parse_strands(body.sequence)
    result = verify_strands(strands, derive_key(key_id)) if strands else None
    if result is None:
        from ..verify import verify_sequence

        result = verify_sequence(body.sequence, derive_key(key_id))

    verdict = {
        "detected": result.detected,
        "claimed_key": key_id,
        "recipient": key_id if result.detected else None,
        "p_value": result.p_value,
        "score": round(result.score, 4),
        "null_mean": result.null_mean,
        "windows_searched": result.windows_searched,
        "strands_scored": result.strands_scored,
        "alpha": ALPHA,
    }
    artifact["verification"] = verdict
    store.save(session_id, artifact)
    return verdict


@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    return _require(session_id)


@app.get("/api/results")
def get_results() -> dict[str, Any]:
    path = store.DATA_ROOT / "eval" / "results.json"
    if not path.exists():
        return {
            "available": False,
            "command": "cd engine && uv run python -m tracedna.eval.sweep",
            "message": "No evaluation run yet. The table is generated by the sweep, never fabricated.",
        }
    return {"available": True, **json.loads(path.read_text())}


# --- small helpers ---------------------------------------------------------
def _max_run(seq: str) -> int:
    best = run = 1
    for i in range(1, len(seq)):
        run = run + 1 if seq[i] == seq[i - 1] else 1
        best = max(best, run)
    return best


def _parse_strands(text: str) -> list[Strand]:
    """Accept one or more sequences separated by blank lines; ignore numbers/labels."""
    chunks: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        cleaned = "".join(ch for ch in line.upper() if ch in "ACGT")
        if cleaned:
            current.append(cleaned)
        elif current:
            chunks.append("".join(current))
            current = []
    if current:
        chunks.append("".join(current))
    strands = []
    for i, chunk in enumerate(chunks):
        if len(chunk) == STRAND_LENGTH:
            strands.append(Strand(index=i, seq=chunk))
    return strands


def _diff_preview(artifact: dict[str, Any], noisy: list[Strand]) -> dict[str, Any] | None:
    if not artifact["strands"] or not noisy:
        return None
    original = artifact["strands"][0]["seq"]
    survivor = next((s for s in noisy if s.index == artifact["strands"][0]["index"]), None)
    if survivor is None:
        return {"original": original, "noisy": "", "index": artifact["strands"][0]["index"], "lost": True}
    return {
        "original": original,
        "noisy": survivor.seq,
        "index": survivor.index,
        "length_delta": len(survivor.seq) - len(original),
        "lost": False,
    }
