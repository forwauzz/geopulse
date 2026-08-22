# GEO-Pulse Reel Doctor

Reel Doctor is the QA and bounded-repair gate for Canva-exported Instagram Reels. The
reviewer runs on Vertex Agent Platform Runtime, watches the complete GCS-hosted MP4 with
Gemini, and merges that judgment with evidence collected by FFmpeg/ffprobe in Cloud Run.

It does **not** publish content and it does **not** make unapproved Canva changes.

## What it catches

- wrong canvas size or aspect ratio;
- sustained black/blank intervals and terminal dead air;
- missing or inaudible audio;
- weak opening hook, poor hierarchy, unreadable text, unsafe crops, spelling;
- incorrect entrance order, insufficient reading time, weak CTA or tiny website;
- unsupported claims, unfinished animations, and abrupt endings.

Every repair is classified as `automatic_video`, `canva_assisted`, or `manual`. Only two
safe video operations are executable in v1: terminal dead-air trimming and audio
normalization. Both require the repair secret and explicit action IDs. Canva source edits
remain an approval-ready instruction list until the Canva side-panel app supports the
relevant property.

## API

`POST /v1/reviews` with `Authorization: Bearer $REEL_QA_API_SECRET`:

```json
{
  "gcs_uri": "gs://YOUR_PRIVATE_BUCKET/reels/day-001.mp4",
  "brief": "Faceless local SEO Reel; CTA is run a free audit.",
  "pass_number": 1
}
```

`POST /v1/repairs` with `Authorization: Bearer $REEL_QA_REPAIR_SECRET` accepts the returned
report, an `approved_action_ids` array, `approved_by`, and the original `gcs_uri`. A changed
asset must be submitted to `/v1/reviews` with `pass_number: 2`. A failed second pass stops
at `human_intervention_required`.

## Local verification

From this directory, with Python 3.12 and FFmpeg on `PATH`:

```bash
python -m pytest -q
```

The integration test generates an intentional 9:16 synthetic MP4 with a blank tail and no
audio. It verifies that the measurable defects are found without calling Gemini.

## Deployment

1. Enable Vertex AI, Cloud Run, Cloud Build, Artifact Registry, and Cloud Storage APIs.
2. Create a private GCS bucket for source and repaired media.
3. Give the Agent Runtime identity `roles/aiplatform.user` and read-only access to source
   media. Give the Cloud Run service account object read/write only on the Reel bucket.
4. Deploy the managed reviewer:

   ```bash
   export GOOGLE_CLOUD_PROJECT=grand-karma-504620-m3
   export GOOGLE_CLOUD_LOCATION=us-central1
   python deploy_agent.py
   ```

5. Build and deploy the worker from this directory with Cloud Build. Configure
   `REEL_QA_AGENT_ENGINE_RESOURCE`, `REEL_QA_API_SECRET`, and `REEL_QA_REPAIR_SECRET` using
   Secret Manager references rather than plaintext environment variables.

The worker is deliberately deployed with `--no-allow-unauthenticated`; callers need Cloud
Run IAM plus the application secret. The secrets provide separation between reviewing and
mutating media.
