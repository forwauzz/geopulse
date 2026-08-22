from __future__ import annotations

import os
from pathlib import Path

import agentplatform

from reel_qa.agent import ReelQaAgent

ROOT = Path(__file__).resolve().parent


def deploy() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or "grand-karma-504620-m3"
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
    client = agentplatform.Client(project=project, location=location)
    remote = client.agent_engines.create(
        agent=ReelQaAgent(model=model),
        config={
            "display_name": "GEO-Pulse Reel QA Reviewer",
            "description": "Reviews complete Canva Reel exports and returns evidence-backed repair plans.",
            "requirements": [
                "google-cloud-aiplatform[agent_engines]==1.163.0",
                "google-genai==2.17.0",
            ],
            "extra_packages": [str(ROOT / "reel_qa")],
            "agent_framework": "custom",
            "python_version": "3.12",
            "env_vars": {
                "GOOGLE_CLOUD_PROJECT": project,
                "GOOGLE_CLOUD_LOCATION": location,
            },
        },
    )
    resource_name = str(remote.api_resource.name)
    print(resource_name)
    return resource_name


if __name__ == "__main__":
    deploy()
