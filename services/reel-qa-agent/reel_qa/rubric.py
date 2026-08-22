from __future__ import annotations

import json
from typing import Any

QA_VERSION = "geopulse-reel-qa-v1"
DEFAULT_MODEL = "gemini-3.7-flash"

SEVERITIES = ("critical", "high", "medium", "low")
REPAIR_KINDS = (
    "trim_terminal_dead_air",
    "normalize_audio",
    "canva_text",
    "canva_layout",
    "canva_timing",
    "canva_animation",
    "manual",
)

MODEL_REPORT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "creative_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "summary": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "hook",
                            "blank_or_dead_air",
                            "timing",
                            "readability",
                            "safe_area",
                            "hierarchy",
                            "brand",
                            "cta",
                            "audio",
                            "spelling",
                            "claim_safety",
                            "sequence",
                            "ending",
                        ],
                    },
                    "severity": {"type": "string", "enum": list(SEVERITIES)},
                    "start_seconds": {"type": ["number", "null"]},
                    "end_seconds": {"type": ["number", "null"]},
                    "problem": {"type": "string"},
                    "evidence": {"type": "string"},
                    "suggested_fix": {"type": "string"},
                    "repair_kind": {"type": "string", "enum": list(REPAIR_KINDS)},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": [
                    "id",
                    "category",
                    "severity",
                    "start_seconds",
                    "end_seconds",
                    "problem",
                    "evidence",
                    "suggested_fix",
                    "repair_kind",
                    "confidence",
                ],
            },
        },
    },
    "required": ["creative_score", "summary", "findings"],
}


def build_review_prompt(
    *,
    deterministic_report: dict[str, Any],
    brief: str,
    brand: dict[str, Any],
    pass_number: int,
) -> str:
    facts = json.dumps(deterministic_report, separators=(",", ":"), sort_keys=True)
    brand_json = json.dumps(brand, separators=(",", ":"), sort_keys=True)
    return f"""
You are the independent GEO-Pulse Reel QA reviewer. Watch the complete video from the
first frame through the last frame. Do not infer that a check passed merely because the
request says it was checked. Report only defects supported by visible or audible evidence.

This is review pass {pass_number} of 2. The reel is a faceless Instagram Reel. It must feel
deliberate, polished, readable on a phone, and complete without relying on a caption.

Review every category:
- first 1.5 seconds: immediately understandable hook, no empty or low-information opening;
- blank/dead sections: unintended black, static, empty, or unfinished-looking intervals;
- timing: enough reading time, no accidental simultaneous entrances, correct sequence;
- readability: spelling, contrast, text size, line breaks, visual crowding;
- Instagram crops: important content stays away from the top, bottom, and side UI zones;
- hierarchy and brand: one focal point, consistent styles, GEO-Pulse identity where useful;
- CTA: a clear action, getgeopulse.com prominent, and enough final-frame exposure;
- audio: audible and appropriate, without clipping or a silent-looking audio placeholder;
- claims: no unsupported performance, ranking, customer, or "viral" claim;
- ending: no abrupt cutoff, blank tail, or unfinished animation.

For each finding, include precise timestamps. A finding without evidence must be omitted.
Use repair_kind=canva_timing for slide duration or entrance order; canva_text for copy;
canva_layout for size, position, contrast, or safe-area changes; canva_animation for motion;
normalize_audio or trim_terminal_dead_air only when that exact video-level operation is safe;
otherwise use manual. Never recommend automatic publishing.

User brief:
{brief.strip() or "No additional brief supplied."}

Brand constraints:
{brand_json}

Deterministic media evidence (authoritative for measurable facts):
{facts}

Return JSON matching the supplied schema. Keep the summary under 240 characters and each
finding concise. A strong reel may return an empty findings array; do not invent criticism.
""".strip()
