"""Request models for the codon-steganography flow."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CoverRequest(BaseModel):
    gene_count: int = Field(8, ge=1, le=40)
    coder: str = Field("usage", pattern="^(uniform|usage)$")
    passphrase: str = Field("alice", min_length=1, max_length=200)


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000_000)


class ChannelRequest(BaseModel):
    coverage: int = Field(10, ge=1, le=60)
    sub_rate: float = Field(0.001, ge=0.0, le=0.2)
    seed: int = 1


class DetectRequest(BaseModel):
    gene_count: int = Field(120, ge=20, le=240)


class DamageParams(BaseModel):
    coverage: int = Field(1, ge=1, le=60)
    sub_rate: float = Field(0.05, ge=0.0, le=0.2)
    seed: int = 1


class CheckRequest(BaseModel):
    sequence: str | None = None
    passphrase: str = Field("alice", min_length=1, max_length=200)
    coder: str | None = Field(None, pattern="^(uniform|usage)$")
    damage: DamageParams | None = None


class KeyRequest(BaseModel):
    passphrase: str = Field(min_length=1, max_length=200)


class ErrorBody(BaseModel):
    code: str
    message: str
    hint: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
