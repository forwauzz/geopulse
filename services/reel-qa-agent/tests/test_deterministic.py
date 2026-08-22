from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from reel_qa.deterministic import (
    analyze_media,
    deterministic_findings,
    inspect_probe,
    parse_black_intervals,
    parse_silence_intervals,
)


def test_parses_ffmpeg_evidence() -> None:
    black = parse_black_intervals(
        "[blackdetect] black_start:4.2 black_end:5.45 black_duration:1.25"
    )
    assert black == [
        {"start_seconds": 4.2, "end_seconds": 5.45, "duration_seconds": 1.25}
    ]
    silence = parse_silence_intervals(
        "silence_start: 1.0\nsilence_end: 2.4 | silence_duration: 1.4", 5.0
    )
    assert silence == [
        {"start_seconds": 1.0, "end_seconds": 2.4, "duration_seconds": 1.4}
    ]


def test_probe_contract_and_findings_fail_closed() -> None:
    facts = inspect_probe(
        {
            "streams": [
                {"codec_type": "video", "width": 1080, "height": 1350, "codec_name": "h264"}
            ],
            "format": {"duration": "5.0"},
        }
    )
    facts["black_intervals"] = []
    facts["mean_volume_db"] = None
    findings = deterministic_findings(facts)
    ids = {finding["id"] for finding in findings}
    assert {"det-invalid-canvas", "det-duration-range", "det-audio-missing"} <= ids


@pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg is required for the media acceptance fixture",
)
def test_synthetic_reel_finds_blank_tail_and_missing_audio(tmp_path: Path) -> None:
    output = tmp_path / "synthetic-blank-tail.mp4"
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-f",
            "lavfi",
            "-i",
            "color=c=#00A67E:s=1080x1920:d=6:r=30",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1080x1920:d=1.2:r=30",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = analyze_media(output)
    assert report["width"] == 1080
    assert report["height"] == 1920
    assert report["has_audio"] is False
    ids = {finding["id"] for finding in report["findings"]}
    assert "det-audio-missing" in ids
    terminal = next(finding for finding in report["findings"] if finding["id"].startswith("det-black-"))
    assert terminal["repair_kind"] == "trim_terminal_dead_air"
