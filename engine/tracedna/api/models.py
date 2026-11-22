"""Request models. Responses are the artifact document defined in the spec §6."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChannelRequest(BaseModel):
    sub: float = Field(0.0, ge=0.0, le=0.05)
    ins: float = Field(0.0, ge=0.0, le=0.05)
    delete: float = Field(0.0, ge=0.0, le=0.05)
    dropout: float = Field(0.0, ge=0.0, le=0.5)
    seed: int = 1


class VerifyRequest(BaseModel):
    sequence: str = Field(min_length=1)
    key_id: str = Field(min_length=1)


class EncodeRequest(BaseModel):
    recipient: str | None = None
    watermark_mode: str = "reserved"


class SessionResponse(BaseModel):
    session_id: str


class ErrorBody(BaseModel):
    code: str
    message: str
    hint: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
