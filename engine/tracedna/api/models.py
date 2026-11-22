"""Request models for the codon-steganography flow."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CoverRequest(BaseModel):
    gene_count: int = Field(8, ge=1, le=40)
    coder: str = Field("usage", pattern="^(uniform|usage)$")


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000_000)


class ChannelRequest(BaseModel):
    coverage: int = Field(10, ge=1, le=60)
    sub_rate: float = Field(0.001, ge=0.0, le=0.2)
    seed: int = 1


class DetectRequest(BaseModel):
    gene_count: int = Field(120, ge=20, le=240)


class ErrorBody(BaseModel):
    code: str
    message: str
    hint: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
