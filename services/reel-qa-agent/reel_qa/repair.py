from __future__ import annotations

import subprocess
import uuid
from pathlib import Path
from typing import Any

from .merge import validate_repair_approval
from .storage import parse_gcs_uri


def build_repair_command(
    input_path: str | Path,
    output_path: str | Path,
    actions: list[dict[str, Any]],
) -> list[str]:
    automatic = [action for action in actions if action.get("execution_class") == "automatic_video"]
    kinds = {str(action.get("kind")) for action in automatic}
    command = ["ffmpeg", "-y", "-hide_banner", "-i", str(input_path)]
    terminal_starts = [
        float(action["start_seconds"])
        for action in automatic
        if action.get("kind") == "trim_terminal_dead_air"
        and isinstance(action.get("start_seconds"), (int, float))
    ]
    if terminal_starts:
        command.extend(["-t", f"{min(terminal_starts):.3f}"])
    command.extend(["-map", "0:v:0", "-map", "0:a?"])
    if "normalize_audio" in kinds:
        command.extend(
            [
                "-c:v",
                "copy",
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
            ]
        )
    else:
        command.extend(["-c", "copy"])
    command.extend(["-movflags", "+faststart", str(output_path)])
    return command


def output_uri(source_uri: str, report_id: str) -> str:
    bucket, _ = parse_gcs_uri(source_uri)
    safe_report = "".join(char for char in report_id if char.isalnum() or char in "-_")[:80]
    return f"gs://{bucket}/reel-qa/repaired/{safe_report}-{uuid.uuid4().hex[:10]}.mp4"


def execute_approved_repairs(
    *,
    input_path: str | Path,
    output_path: str | Path,
    report: dict[str, Any],
    approved_action_ids: list[str],
    approved_by: str,
) -> dict[str, Any]:
    actions = validate_repair_approval(
        report=report,
        approved_action_ids=approved_action_ids,
        approved_by=approved_by,
    )
    automatic = [action for action in actions if action.get("execution_class") == "automatic_video"]
    assisted = [action for action in actions if action.get("execution_class") != "automatic_video"]
    if not automatic:
        return {
            "changed": False,
            "executed_action_ids": [],
            "assisted_action_ids": [action["id"] for action in assisted],
            "next_pass_number": int(report["pass_number"]) + 1,
        }
    command = build_repair_command(input_path, output_path, automatic)
    result = subprocess.run(command, capture_output=True, text=True, timeout=240, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg_repair_failed:{result.stderr[-700:]}")
    return {
        "changed": True,
        "executed_action_ids": [action["id"] for action in automatic],
        "assisted_action_ids": [action["id"] for action in assisted],
        "next_pass_number": int(report["pass_number"]) + 1,
    }
