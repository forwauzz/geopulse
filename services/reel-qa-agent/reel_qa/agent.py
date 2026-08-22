from __future__ import annotations

import json
import os
from typing import Any

from .merge import finalize_report
from .rubric import DEFAULT_MODEL, MODEL_REPORT_SCHEMA, build_review_prompt


class ReelQaAgent:
    """Pickle-safe custom agent for Vertex Agent Platform Runtime."""

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client = None

    def set_up(self) -> None:
        from google import genai

        project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is required")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
        self._client = genai.Client(vertexai=True, project=project, location=location)

    def query(
        self,
        *,
        gcs_uri: str,
        deterministic_report: dict[str, Any],
        brief: str = "",
        brand: dict[str, Any] | None = None,
        pass_number: int = 1,
    ) -> dict[str, Any]:
        if not gcs_uri.startswith("gs://"):
            raise ValueError("gcs_uri_required")
        if pass_number not in (1, 2):
            raise ValueError("pass_number_must_be_1_or_2")
        if self._client is None:
            self.set_up()

        from google.genai import types

        prompt = build_review_prompt(
            deterministic_report=deterministic_report,
            brief=brief,
            brand=brand
            or {
                "business": "GEO-Pulse",
                "website": "getgeopulse.com",
                "voice": "clear, evidence-led, practical, never hype-led",
                "cta": "Run a free AI visibility scan",
            },
            pass_number=pass_number,
        )
        response = self._client.models.generate_content(
            model=self.model,
            contents=[
                types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
                response_json_schema=MODEL_REPORT_SCHEMA,
            ),
        )
        try:
            model_report = json.loads(response.text or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError("gemini_returned_invalid_json") from exc
        if not isinstance(model_report, dict):
            raise RuntimeError("gemini_returned_non_object")
        return finalize_report(
            gcs_uri=gcs_uri,
            deterministic_report=deterministic_report,
            model_report=model_report,
            pass_number=pass_number,
            model=self.model,
        )
