from __future__ import annotations

from datetime import datetime, timezone

import pytest

from reel_qa.merge import finalize_report, validate_repair_approval


NOW = datetime(2026, 8, 22, 16, 0, tzinfo=timezone.utc)


def model_report(findings: list[dict] | None = None, score: int = 92) -> dict:
    return {
        "creative_score": score,
        "summary": "Clear concept with one repair needed." if findings else "Ready for final approval.",
        "findings": findings or [],
    }


def test_passes_only_a_clean_high_scoring_reel_and_never_publishes() -> None:
    report = finalize_report(
        gcs_uri="gs://private/reel.mp4",
        deterministic_report={"width": 1080, "height": 1920, "findings": []},
        model_report=model_report(),
        pass_number=1,
        model="gemini-test",
        now=NOW,
    )
    assert report["passed"] is True
    assert report["gate_state"] == "approved_for_human_review"
    assert report["publishing_allowed"] is False
    assert report["human_approval_required"] is True


def test_blocks_high_severity_and_classifies_canva_repair() -> None:
    finding = {
        "id": "tiny-url",
        "category": "cta",
        "severity": "high",
        "start_seconds": 7.0,
        "end_seconds": 9.0,
        "problem": "The website is too small.",
        "evidence": "getgeopulse.com occupies less than one line-height.",
        "suggested_fix": "Increase the website size and add the brand highlight.",
        "repair_kind": "canva_layout",
        "confidence": "high",
    }
    report = finalize_report(
        gcs_uri="gs://private/reel.mp4",
        deterministic_report={"findings": []},
        model_report=model_report([finding], 94),
        pass_number=1,
        model="gemini-test",
        now=NOW,
    )
    assert report["passed"] is False
    assert report["gate_state"] == "repair_required"
    assert report["repairs"][0]["execution_class"] == "canva_assisted"
    assert report["repairs"][0]["requires_approval"] is True


def test_second_failed_pass_stops_for_human_intervention() -> None:
    report = finalize_report(
        gcs_uri="gs://private/reel.mp4",
        deterministic_report={
            "findings": [
                {
                    "id": "det-audio-missing",
                    "category": "audio",
                    "severity": "high",
                    "problem": "No audio.",
                    "evidence": "Zero tracks.",
                    "suggested_fix": "Add licensed audio.",
                    "repair_kind": "manual",
                    "confidence": "high",
                }
            ]
        },
        model_report=model_report([], 90),
        pass_number=2,
        model="gemini-test",
        now=NOW,
    )
    assert report["gate_state"] == "human_intervention_required"
    with pytest.raises(ValueError, match="repair_pass_limit_reached"):
        validate_repair_approval(
            report=report,
            approved_action_ids=["repair-det-audio-missing"],
            approved_by="founder",
        )


def test_repair_approval_rejects_unknown_actions() -> None:
    report = finalize_report(
        gcs_uri="gs://private/reel.mp4",
        deterministic_report={"findings": []},
        model_report=model_report(),
        pass_number=1,
        model="gemini-test",
        now=NOW,
    )
    with pytest.raises(ValueError, match="unknown_repair_action"):
        validate_repair_approval(
            report=report,
            approved_action_ids=["repair-does-not-exist"],
            approved_by="founder",
        )
