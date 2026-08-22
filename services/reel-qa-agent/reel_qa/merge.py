from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from .rubric import QA_VERSION, REPAIR_KINDS, SEVERITIES

SEVERITY_PENALTY = {"critical": 35, "high": 18, "medium": 8, "low": 3}
AUTOMATIC_KINDS = {"trim_terminal_dead_air", "normalize_audio"}
CANVA_ASSISTED_KINDS = {"canva_text", "canva_layout", "canva_timing", "canva_animation"}


def _number_or_none(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return round(float(value), 3)
    return None


def _clean_finding(value: dict[str, Any], index: int, source: str) -> dict[str, Any]:
    severity = str(value.get("severity") or "medium")
    if severity not in SEVERITIES:
        severity = "medium"
    repair_kind = str(value.get("repair_kind") or "manual")
    if repair_kind not in REPAIR_KINDS:
        repair_kind = "manual"
    confidence = str(value.get("confidence") or "low")
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"
    finding_id = str(value.get("id") or f"{source}-{index + 1}")
    safe_id = "".join(char if char.isalnum() or char in "-_" else "-" for char in finding_id)
    return {
        "id": safe_id[:80] or f"{source}-{index + 1}",
        "category": str(value.get("category") or "hierarchy")[:40],
        "severity": severity,
        "start_seconds": _number_or_none(value.get("start_seconds")),
        "end_seconds": _number_or_none(value.get("end_seconds")),
        "problem": str(value.get("problem") or "Unspecified reel quality problem.")[:500],
        "evidence": str(value.get("evidence") or "No evidence supplied.")[:700],
        "suggested_fix": str(value.get("suggested_fix") or "Review manually.")[:700],
        "repair_kind": repair_kind,
        "confidence": confidence,
        "source": source,
    }


def _execution_class(repair_kind: str) -> str:
    if repair_kind in AUTOMATIC_KINDS:
        return "automatic_video"
    if repair_kind in CANVA_ASSISTED_KINDS:
        return "canva_assisted"
    return "manual"


def finalize_report(
    *,
    gcs_uri: str,
    deterministic_report: dict[str, Any],
    model_report: dict[str, Any],
    pass_number: int,
    model: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    if pass_number not in (1, 2):
        raise ValueError("pass_number_must_be_1_or_2")
    reviewed_at = (now or datetime.now(timezone.utc)).isoformat()
    deterministic = [
        _clean_finding(item, index, "deterministic")
        for index, item in enumerate(deterministic_report.get("findings") or [])
        if isinstance(item, dict)
    ]
    model_findings = [
        _clean_finding(item, index, "gemini")
        for index, item in enumerate(model_report.get("findings") or [])
        if isinstance(item, dict)
    ]
    seen: set[str] = set()
    findings: list[dict[str, Any]] = []
    for finding in [*deterministic, *model_findings]:
        key = "|".join(
            [
                finding["category"],
                str(finding["start_seconds"]),
                finding["problem"].lower()[:100],
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        findings.append(finding)

    creative_score = model_report.get("creative_score")
    if not isinstance(creative_score, int):
        creative_score = 70
    creative_score = max(0, min(100, creative_score))
    deterministic_penalty = sum(
        SEVERITY_PENALTY[finding["severity"]]
        for finding in deterministic
    )
    score = max(0, min(100, creative_score - deterministic_penalty))
    blocking = [finding for finding in findings if finding["severity"] in {"critical", "high"}]
    passed = score >= 85 and not blocking

    repairs = []
    for finding in findings:
        repair_id = f"repair-{finding['id']}"
        repairs.append(
            {
                "id": repair_id[:90],
                "finding_id": finding["id"],
                "kind": finding["repair_kind"],
                "execution_class": _execution_class(finding["repair_kind"]),
                "instruction": finding["suggested_fix"],
                "requires_approval": True,
                "start_seconds": finding["start_seconds"],
                "end_seconds": finding["end_seconds"],
            }
        )

    gate_state = (
        "approved_for_human_review"
        if passed
        else "repair_required"
        if pass_number == 1
        else "human_intervention_required"
    )
    fingerprint_source = json.dumps(
        {
            "gcs_uri": gcs_uri,
            "pass": pass_number,
            "reviewed_at": reviewed_at,
            "findings": findings,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    report_id = "rqa_" + hashlib.sha256(fingerprint_source.encode("utf-8")).hexdigest()[:20]
    return {
        "qa_version": QA_VERSION,
        "report_id": report_id,
        "reviewed_at": reviewed_at,
        "gcs_uri": gcs_uri,
        "pass_number": pass_number,
        "maximum_passes": 2,
        "model": model,
        "score": score,
        "passed": passed,
        "gate_state": gate_state,
        "summary": str(model_report.get("summary") or "Reel review completed.")[:240],
        "media_facts": {key: value for key, value in deterministic_report.items() if key != "findings"},
        "findings": findings,
        "repairs": repairs,
        "publishing_allowed": False,
        "human_approval_required": True,
    }


def validate_repair_approval(
    *, report: dict[str, Any], approved_action_ids: list[str], approved_by: str
) -> list[dict[str, Any]]:
    if report.get("qa_version") != QA_VERSION:
        raise ValueError("unsupported_qa_report")
    if not str(approved_by).strip():
        raise ValueError("approved_by_required")
    if int(report.get("pass_number") or 0) >= 2:
        raise ValueError("repair_pass_limit_reached")
    requested = set(approved_action_ids)
    available = {
        str(action.get("id")): action
        for action in report.get("repairs") or []
        if isinstance(action, dict)
    }
    if not requested:
        raise ValueError("approved_action_ids_required")
    unknown = requested - set(available)
    if unknown:
        raise ValueError("unknown_repair_action")
    return [available[action_id] for action_id in approved_action_ids]
