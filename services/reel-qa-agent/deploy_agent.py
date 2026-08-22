from __future__ import annotations

import os
import shutil
import tempfile
from contextlib import chdir
from pathlib import Path

import agentplatform

from reel_qa.agent import ReelQaAgent

ROOT = Path(__file__).resolve().parent


def deploy() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or "grand-karma-504620-m3"
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
    staging_bucket = os.environ.get(
        "AGENT_STAGING_BUCKET", f"gs://{project}-reel-qa-agent-staging"
    )
    client = agentplatform.Client(project=project, location=location)
    with tempfile.TemporaryDirectory(prefix="reel-qa-agent-") as bundle_dir:
        bundle_root = Path(bundle_dir)
        shutil.copytree(ROOT / "reel_qa", bundle_root / "reel_qa")
        with chdir(bundle_root):
            remote = client.agent_engines.create(
                agent=ReelQaAgent(model=model),
                config={
                    "display_name": "GEO-Pulse Reel QA Reviewer",
                    "description": "Reviews complete Canva Reel exports and returns evidence-backed repair plans.",
                    "staging_bucket": staging_bucket,
                    "requirements": [
                        "cloudpickle==3.1.2",
                        "google-cloud-aiplatform[agent_engines]==1.163.0",
                        "google-genai==2.17.0",
                        "pydantic==2.13.4",
                    ],
                    # The SDK uses the supplied string as the tar member path.
                    # A relative path extracts ``reel_qa`` at the import root.
                    "extra_packages": ["reel_qa"],
                    "agent_framework": "custom",
                    "python_version": "3.12",
                },
            )
    resource_name = str(remote.api_resource.name)
    print(resource_name)
    return resource_name


if __name__ == "__main__":
    deploy()
