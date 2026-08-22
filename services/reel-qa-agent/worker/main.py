from __future__ import annotations

import hmac
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from reel_qa.agent import ReelQaAgent
from reel_qa.deterministic import MediaAnalysisError, analyze_media
from reel_qa.repair import execute_approved_repairs, output_uri
from reel_qa.storage import download_gcs, upload_gcs

app = FastAPI(title="GEO-Pulse Reel Doctor", version="1.0.0")


class ReviewRequest(BaseModel):
    gcs_uri: str
    brief: str = ""
    brand: dict[str, Any] = Field(default_factory=dict)
    pass_number: int = 1

    @field_validator("gcs_uri")
    @classmethod
    def require_gcs(cls, value: str) -> str:
        if not value.startswith("gs://"):
            raise ValueError("must be a gs:// URI")
        return value

    @field_validator("pass_number")
    @classmethod
    def bounded_pass(cls, value: int) -> int:
        if value not in (1, 2):
            raise ValueError("must be 1 or 2")
        return value


class RepairApproval(BaseModel):
    gcs_uri: str
    report: dict[str, Any]
    approved_action_ids: list[str]
    approved_by: str


def _authorize(header: str | None, secret_name: str) -> None:
    expected = os.environ.get(secret_name, "").strip()
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail=f"{secret_name.lower()}_not_configured")
    supplied = (header or "").removeprefix("Bearer ").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def _remote_review(payload: ReviewRequest, facts: dict[str, Any]) -> dict[str, Any]:
    resource = os.environ.get("REEL_QA_AGENT_ENGINE_RESOURCE", "").strip()
    if not resource:
        return ReelQaAgent(model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")).query(
            gcs_uri=payload.gcs_uri,
            deterministic_report=facts,
            brief=payload.brief,
            brand=payload.brand,
            pass_number=payload.pass_number,
        )

    import agentplatform

    client = agentplatform.Client(
        project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
    )
    # The pinned Agent Platform SDK exposes custom class-method invocation through
    # the generated query transport. Keep this boundary in one place so a public
    # alias can replace it without touching the review contract.
    response = client.agent_engines._query(
        name=resource,
        config={
            "class_method": "query",
            "input": {
                "gcs_uri": payload.gcs_uri,
                "deterministic_report": facts,
                "brief": payload.brief,
                "brand": payload.brand,
                "pass_number": payload.pass_number,
            },
            "include_all_fields": True,
        },
    )
    if not isinstance(response.output, dict):
        raise RuntimeError("agent_engine_returned_non_object")
    return response.output


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "geopulse-reel-doctor"}


@app.post("/v1/reviews")
def review(payload: ReviewRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization, "REEL_QA_API_SECRET")
    try:
        with tempfile.TemporaryDirectory(prefix="reel-qa-") as temp_dir:
            input_path = Path(temp_dir) / "input.mp4"
            download_gcs(payload.gcs_uri, input_path)
            facts = analyze_media(input_path)
            return _remote_review(payload, facts)
    except (ValueError, MediaAnalysisError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"review_failed:{type(exc).__name__}") from exc


@app.post("/v1/repairs")
def repair(payload: RepairApproval, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization, "REEL_QA_REPAIR_SECRET")
    try:
        with tempfile.TemporaryDirectory(prefix="reel-repair-") as temp_dir:
            input_path = Path(temp_dir) / "input.mp4"
            repaired_path = Path(temp_dir) / "repaired.mp4"
            download_gcs(payload.gcs_uri, input_path)
            result = execute_approved_repairs(
                input_path=input_path,
                output_path=repaired_path,
                report=payload.report,
                approved_action_ids=payload.approved_action_ids,
                approved_by=payload.approved_by,
            )
            if result["changed"]:
                repaired_uri = output_uri(payload.gcs_uri, str(payload.report["report_id"]))
                upload_gcs(repaired_path, repaired_uri)
                result["repaired_gcs_uri"] = repaired_uri
            else:
                result["repaired_gcs_uri"] = None
            result["publishing_allowed"] = False
            result["re_review_required"] = True
            return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"repair_failed:{type(exc).__name__}") from exc
