from __future__ import annotations

from reel_qa.repair import build_repair_command
from reel_qa.storage import parse_gcs_uri


def test_gcs_source_is_narrowly_parsed() -> None:
    assert parse_gcs_uri("gs://private-reels/day-001.mp4") == (
        "private-reels",
        "day-001.mp4",
    )



def test_bounded_repair_command_only_trims_terminal_and_normalizes_audio() -> None:
    command = build_repair_command(
        "input.mp4",
        "output.mp4",
        [
            {
                "id": "repair-tail",
                "kind": "trim_terminal_dead_air",
                "execution_class": "automatic_video",
                "start_seconds": 12.5,
            },
            {
                "id": "repair-audio",
                "kind": "normalize_audio",
                "execution_class": "automatic_video",
            },
            {
                "id": "repair-url",
                "kind": "canva_layout",
                "execution_class": "canva_assisted",
            },
        ],
    )
    assert "12.500" in command
    assert any("loudnorm" in item for item in command)
    assert "canva_layout" not in command
