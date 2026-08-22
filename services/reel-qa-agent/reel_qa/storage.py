from __future__ import annotations

from pathlib import Path
from typing import Tuple

MAX_SOURCE_BYTES = 250 * 1024 * 1024
ALLOWED_VIDEO_CONTENT_TYPES = {"video/mp4", "application/octet-stream"}


def parse_gcs_uri(uri: str) -> Tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError("gcs_uri_required")
    remainder = uri[5:]
    bucket, separator, name = remainder.partition("/")
    if not separator or not bucket or not name or ".." in Path(name).parts:
        raise ValueError("invalid_gcs_uri")
    return bucket, name


def download_gcs(uri: str, destination: str | Path) -> None:
    from google.cloud import storage

    bucket_name, blob_name = parse_gcs_uri(uri)
    client = storage.Client()
    blob = client.bucket(bucket_name).blob(blob_name)
    blob.reload()
    if not isinstance(blob.size, int) or blob.size <= 0 or blob.size > MAX_SOURCE_BYTES:
        raise ValueError("source_video_size_out_of_range")
    if blob.content_type and blob.content_type.lower() not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise ValueError("source_must_be_mp4")
    blob.download_to_filename(str(destination))


def upload_gcs(source: str | Path, uri: str, content_type: str = "video/mp4") -> None:
    from google.cloud import storage

    bucket_name, blob_name = parse_gcs_uri(uri)
    client = storage.Client()
    client.bucket(bucket_name).blob(blob_name).upload_from_filename(
        str(source), content_type=content_type
    )
