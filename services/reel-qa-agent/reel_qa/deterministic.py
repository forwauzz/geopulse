from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path
from typing import Any

BLACK_RE = re.compile(
    r"black_start:(?P<start>\d+(?:\.\d+)?)\s+black_end:(?P<end>\d+(?:\.\d+)?)\s+black_duration:(?P<duration>\d+(?:\.\d+)?)"
)
SILENCE_START_RE = re.compile(r"silence_start:\s*(?P<value>\d+(?:\.\d+)?)")
SILENCE_END_RE = re.compile(
    r"silence_end:\s*(?P<end>\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(?P<duration>\d+(?:\.\d+)?)"
)
MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*(?P<value>-?\d+(?:\.\d+)?)\s*dB")
MAX_VOLUME_RE = re.compile(r"max_volume:\s*(?P<value>-?\d+(?:\.\d+)?)\s*dB")


class MediaAnalysisError(RuntimeError):
    pass


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except FileNotFoundError as exc:
        raise MediaAnalysisError(f"missing_media_binary:{command[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaAnalysisError(f"media_command_timeout:{command[0]}") from exc


def parse_black_intervals(output: str) -> list[dict[str, float]]:
    return [
        {
            "start_seconds": float(match.group("start")),
            "end_seconds": float(match.group("end")),
            "duration_seconds": float(match.group("duration")),
        }
        for match in BLACK_RE.finditer(output)
    ]


def parse_silence_intervals(output: str, total_duration: float) -> list[dict[str, float]]:
    starts = [float(match.group("value")) for match in SILENCE_START_RE.finditer(output)]
    ends = [
        (float(match.group("end")), float(match.group("duration")))
        for match in SILENCE_END_RE.finditer(output)
    ]
    intervals: list[dict[str, float]] = []
    for index, start in enumerate(starts):
        if index < len(ends):
            end, duration = ends[index]
        else:
            end = total_duration
            duration = max(0.0, end - start)
        intervals.append(
            {
                "start_seconds": start,
                "end_seconds": end,
                "duration_seconds": duration,
            }
        )
    return intervals


def _finite_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def inspect_probe(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams") if isinstance(probe.get("streams"), list) else []
    video = next((row for row in streams if row.get("codec_type") == "video"), {})
    audio_streams = [row for row in streams if row.get("codec_type") == "audio"]
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    duration = _finite_float((probe.get("format") or {}).get("duration"), 0.0)
    ratio = width / height if width > 0 and height > 0 else 0.0
    return {
        "width": width,
        "height": height,
        "aspect_ratio": round(ratio, 6),
        "duration_seconds": round(duration, 3),
        "video_codec": str(video.get("codec_name") or "unknown"),
        "audio_track_count": len(audio_streams),
        "has_audio": len(audio_streams) > 0,
    }


def deterministic_findings(facts: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    duration = _finite_float(facts.get("duration_seconds"))
    width = int(facts.get("width") or 0)
    height = int(facts.get("height") or 0)
    ratio = _finite_float(facts.get("aspect_ratio"))

    def add(
        finding_id: str,
        category: str,
        severity: str,
        problem: str,
        evidence: str,
        suggested_fix: str,
        repair_kind: str,
        start: float | None = None,
        end: float | None = None,
    ) -> None:
        findings.append(
            {
                "id": finding_id,
                "category": category,
                "severity": severity,
                "start_seconds": start,
                "end_seconds": end,
                "problem": problem,
                "evidence": evidence,
                "suggested_fix": suggested_fix,
                "repair_kind": repair_kind,
                "confidence": "high",
                "source": "deterministic",
            }
        )

    if width < 1080 or height < 1920 or abs(ratio - (9 / 16)) > 0.01:
        add(
            "det-invalid-canvas",
            "safe_area",
            "critical",
            "The export is not a full-size 9:16 Reel.",
            f"Measured {width}x{height}, ratio {ratio:.4f}.",
            "Resize the Canva design to 1080x1920 and re-export.",
            "canva_layout",
        )
    if duration < 6 or duration > 90:
        add(
            "det-duration-range",
            "timing",
            "high",
            "The reel duration is outside the reviewable campaign range.",
            f"Measured {duration:.2f} seconds; expected 6–90 seconds.",
            "Adjust page durations in Canva and re-export.",
            "canva_timing",
        )
    if not facts.get("has_audio"):
        add(
            "det-audio-missing",
            "audio",
            "high",
            "The exported reel has no audio track.",
            "ffprobe found zero audio streams.",
            "Add an appropriate licensed audio bed before scheduling.",
            "manual",
        )

    black_intervals = facts.get("black_intervals") or []
    for index, interval in enumerate(black_intervals):
        black_duration = _finite_float(interval.get("duration_seconds"))
        if black_duration < 0.35:
            continue
        start = _finite_float(interval.get("start_seconds"))
        end = _finite_float(interval.get("end_seconds"))
        terminal = duration > 0 and end >= duration - 0.12 and start >= duration - 4.0
        add(
            f"det-black-{index + 1}",
            "blank_or_dead_air",
            "high" if black_duration >= 0.75 else "medium",
            "The reel contains a sustained near-black interval.",
            f"Black frames detected from {start:.2f}s to {end:.2f}s ({black_duration:.2f}s).",
            (
                "Trim the terminal blank interval and re-review."
                if terminal
                else "Repair the source slide or animation in Canva; do not blindly trim an internal interval."
            ),
            "trim_terminal_dead_air" if terminal else "canva_timing",
            start,
            end,
        )

    mean_volume = facts.get("mean_volume_db")
    if isinstance(mean_volume, (int, float)) and mean_volume < -30:
        add(
            "det-audio-inaudible",
            "audio",
            "high",
            "The audio track is likely inaudible on a phone.",
            f"Measured mean volume {mean_volume:.1f} dB.",
            "Normalize the audio bed to the GEO-Pulse social target and re-review.",
            "normalize_audio",
        )
    return findings


def analyze_media(path: str | Path) -> dict[str, Any]:
    media_path = str(Path(path).resolve())
    probe_result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            media_path,
        ]
    )
    if probe_result.returncode != 0:
        raise MediaAnalysisError(f"ffprobe_failed:{probe_result.stderr[-500:]}")
    try:
        probe = json.loads(probe_result.stdout)
    except json.JSONDecodeError as exc:
        raise MediaAnalysisError("ffprobe_invalid_json") from exc
    facts = inspect_probe(probe)

    black_result = _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            media_path,
            "-vf",
            "blackdetect=d=0.35:pix_th=0.10",
            "-an",
            "-f",
            "null",
            "-",
        ]
    )
    facts["black_intervals"] = parse_black_intervals(black_result.stderr)

    if facts["has_audio"]:
        audio_result = _run(
            [
                "ffmpeg",
                "-hide_banner",
                "-nostats",
                "-i",
                media_path,
                "-af",
                "silencedetect=n=-45dB:d=0.8,volumedetect",
                "-vn",
                "-f",
                "null",
                "-",
            ]
        )
        facts["silence_intervals"] = parse_silence_intervals(
            audio_result.stderr, facts["duration_seconds"]
        )
        mean_match = MEAN_VOLUME_RE.search(audio_result.stderr)
        max_match = MAX_VOLUME_RE.search(audio_result.stderr)
        facts["mean_volume_db"] = float(mean_match.group("value")) if mean_match else None
        facts["max_volume_db"] = float(max_match.group("value")) if max_match else None
    else:
        facts["silence_intervals"] = []
        facts["mean_volume_db"] = None
        facts["max_volume_db"] = None

    facts["findings"] = deterministic_findings(facts)
    return facts
