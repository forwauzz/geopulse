#!/usr/bin/env bash
set -euo pipefail

for name in GITHUB_REPOSITORY REPAIR_MERGE_EVIDENCE REPAIR_ROLLBACK_EVIDENCE REPAIR_MERGE_APP_TOKEN ACTIONS_TOKEN; do
  test -n "${!name:-}" || { echo "$name is required" >&2; exit 1; }
done

export GH_TOKEN="$REPAIR_MERGE_APP_TOKEN"
gh auth setup-git
ORCHESTRATOR_ROOT="$(git rev-parse --show-toplevel)"
MERGE_SHA="$(jq -r '.mergeSha' "$REPAIR_MERGE_EVIDENCE")"
REPAIR_ID="$(jq -r '.repairId' "$REPAIR_MERGE_EVIDENCE")"
ATTEMPT="$(jq -r '.attempt' "$REPAIR_MERGE_EVIDENCE")"
LEASE_ID="$(jq -r '.leaseId' "$REPAIR_MERGE_EVIDENCE")"
ISSUE="$(jq -r '.issueNumber' "$REPAIR_MERGE_EVIDENCE")"
BRANCH="repair-agent/revert-$REPAIR_ID-attempt-$ATTEMPT"

git fetch --no-tags origin main
REMOTE_SHA="$(git ls-remote --heads origin "refs/heads/$BRANCH" | awk '{print $1}')"
if [ -n "$REMOTE_SHA" ]; then
  git fetch --no-tags origin "refs/heads/$BRANCH"
  REVERT_SHA="$(git rev-parse FETCH_HEAD)"
  test "$(git rev-parse "$REVERT_SHA^")" = "$MERGE_SHA"
  git diff --quiet "$MERGE_SHA^" "$REVERT_SHA"
else
  test "$(git rev-parse origin/main)" = "$MERGE_SHA"
  ROLLBACK_PARENT="${RUNNER_TEMP:-/tmp}"
  ROLLBACK_WORKTREE="$(mktemp -d "$ROLLBACK_PARENT/repair-rollback-XXXXXX")"
  case "$ROLLBACK_WORKTREE" in "$ROLLBACK_PARENT"/repair-rollback-*) ;; *) echo 'unsafe rollback worktree path' >&2; exit 1 ;; esac
  rmdir -- "$ROLLBACK_WORKTREE"
  git -C "$ORCHESTRATOR_ROOT" worktree add --detach "$ROLLBACK_WORKTREE" "$MERGE_SHA"
  cleanup_worktree() {
    git -C "$ORCHESTRATOR_ROOT" worktree remove --force "$ROLLBACK_WORKTREE" >/dev/null 2>&1 || true
  }
  trap cleanup_worktree EXIT
  git -C "$ROLLBACK_WORKTREE" config user.name 'GEO-Pulse Repair Rollback'
  git -C "$ROLLBACK_WORKTREE" config user.email 'repair-rollback@getgeopulse.com'
  git -C "$ROLLBACK_WORKTREE" revert --no-edit "$MERGE_SHA"
  REVERT_SHA="$(git -C "$ROLLBACK_WORKTREE" rev-parse HEAD)"
  git -C "$ROLLBACK_WORKTREE" push origin "HEAD:refs/heads/$BRANCH"
fi

PRS="$(gh pr list --repo "$GITHUB_REPOSITORY" --state all --base main --head "$BRANCH" --limit 10 --json number,state,headRefOid,mergedAt,mergeCommit)"
test "$(jq 'length' <<<"$PRS")" -le 1
PR="$(jq -r '.[0].number // empty' <<<"$PRS")"
if [ -z "$PR" ]; then
  PR_URL="$(gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$BRANCH" --title "[ROLLBACK] $REPAIR_ID" --body "Production QA failed for exact deployment \`$MERGE_SHA\`. Deterministic rollback for issue #$ISSUE; the incident stays open until rollback deployment verification and durable feedback.")"
  PR="${PR_URL##*/}"
  PR_STATE='OPEN'
else
  test "$(jq -r '.[0].headRefOid' <<<"$PRS")" = "$REVERT_SHA"
  PR_STATE="$(jq -r '.[0].state' <<<"$PRS")"
fi

if [ "$PR_STATE" = 'OPEN' ]; then
  GH_TOKEN="$ACTIONS_TOKEN" gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$BRANCH"
  VERIFIED=false
  for _poll in $(seq 1 120); do
    RUNS="$(gh api "repos/$GITHUB_REPOSITORY/commits/$REVERT_SHA/check-runs?check_name=verify&filter=latest")"
    CONCLUSION="$(jq -r '[.check_runs[] | select(.name == "verify" and .app.slug == "github-actions" and .app.id == 15368)][0].conclusion // empty' <<<"$RUNS")"
    if [ "$CONCLUSION" = success ]; then VERIFIED=true; break; fi
    if [[ "$CONCLUSION" =~ ^(failure|cancelled|skipped)$ ]]; then exit 1; fi
    sleep 15
  done
  test "$VERIFIED" = true
  CURRENT_PR="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR")"
  CURRENT_MAIN="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main")"
  test "$(jq -r '.head.sha' <<<"$CURRENT_PR")" = "$REVERT_SHA"
  if [ "$(jq -r '.base.sha' <<<"$CURRENT_PR")" != "$MERGE_SHA" ] || [ "$(jq -r '.object.sha' <<<"$CURRENT_MAIN")" != "$MERGE_SHA" ]; then
    MARKER="[repair-rollback-blocked:$REPAIR_ID:attempt:$ATTEMPT]"
    COMMENTS="$(gh api "repos/$GITHUB_REPOSITORY/issues/$ISSUE/comments?per_page=100")"
    if ! jq -e --arg marker "$MARKER" 'any(.[]; (.body // "") | contains($marker))' <<<"$COMMENTS" >/dev/null; then
      gh issue comment "$ISSUE" --repo "$GITHUB_REPOSITORY" --body "$MARKER Rollback stopped because main advanced beyond failed repair merge $MERGE_SHA while CI was running. No rollback was certified; operator reconciliation is required."
    fi
    exit 1
  fi
  MERGED="$(gh api --method PUT "repos/$GITHUB_REPOSITORY/pulls/$PR/merge" -f sha="$REVERT_SHA" -f merge_method=squash)"
  test "$(jq -r '.merged' <<<"$MERGED")" = true
  ROLLBACK_MERGE_SHA="$(jq -r '.sha' <<<"$MERGED")"
else
  test "$PR_STATE" = 'MERGED'
  ROLLBACK_MERGE_SHA="$(jq -r '.[0].mergeCommit.oid // empty' <<<"$PRS")"
fi
[[ "$ROLLBACK_MERGE_SHA" =~ ^[a-f0-9]{40}$ ]]
ROLLBACK_COMMIT="$(gh api "repos/$GITHUB_REPOSITORY/commits/$ROLLBACK_MERGE_SHA")"
test "$(jq '.parents | length' <<<"$ROLLBACK_COMMIT")" = '1'
test "$(jq -r '.parents[0].sha' <<<"$ROLLBACK_COMMIT")" = "$MERGE_SHA"
ORIGINAL_BASE_SHA="$(gh api "repos/$GITHUB_REPOSITORY/commits/$MERGE_SHA" --jq '.parents[0].sha')"
ROLLBACK_TREE="$(jq -r '.commit.tree.sha' <<<"$ROLLBACK_COMMIT")"
ORIGINAL_TREE="$(gh api "repos/$GITHUB_REPOSITORY/commits/$ORIGINAL_BASE_SHA" --jq '.commit.tree.sha')"
test "$ROLLBACK_TREE" = "$ORIGINAL_TREE"

DEPLOYED=false
for _poll in $(seq 1 120); do
  RUNS="$(gh api "repos/$GITHUB_REPOSITORY/commits/$ROLLBACK_MERGE_SHA/check-runs?check_name=Workers%20Builds%3A%20geo-pulse&filter=latest")"
  CHECK="$(jq -c '[.check_runs[] | select(.name == "Workers Builds: geo-pulse" and .app.slug == "cloudflare-workers-and-pages" and .app.id == 85455)][0] // {}' <<<"$RUNS")"
  CONCLUSION="$(jq -r '.conclusion // empty' <<<"$CHECK")"
  if [ "$CONCLUSION" = success ]; then DEPLOYED=true; break; fi
  if [[ "$CONCLUSION" =~ ^(failure|cancelled|skipped)$ ]]; then exit 1; fi
  sleep 15
done
test "$DEPLOYED" = true
DEPLOYMENT_ID="$(jq -r '.id | tostring' <<<"$CHECK")"
DETAILS_URL="$(jq -r '.details_url' <<<"$CHECK")"
COMPLETED_AT="$(jq -r '.completed_at' <<<"$CHECK")"
VERSION_ID="$(sed -nE 's#^.*/builds/([a-f0-9-]{36})$#\1#p' <<<"$DETAILS_URL")"
test -n "$DEPLOYMENT_ID"
test -n "$VERSION_ID"
test -n "$COMPLETED_AT"

PROBE_DIR="$(mktemp -d)"
cleanup_probes() {
  rm -f -- "$PROBE_DIR/home" "$PROBE_DIR/robots" "$PROBE_DIR/sitemap"
  rmdir -- "$PROBE_DIR" 2>/dev/null || true
  if [ -n "${ROLLBACK_WORKTREE:-}" ]; then cleanup_worktree; fi
}
trap cleanup_probes EXIT
for path in home robots sitemap; do
  case "$path" in
    home) url='https://getgeopulse.com/' ;;
    robots) url='https://getgeopulse.com/robots.txt' ;;
    sitemap) url='https://getgeopulse.com/sitemap.xml' ;;
  esac
  curl --silent --show-error --fail --max-time 30 "$url" >"$PROBE_DIR/$path"
done
PROBES_DIGEST="$(sha256sum "$PROBE_DIR/home" "$PROBE_DIR/robots" "$PROBE_DIR/sitemap" | sha256sum | cut -d' ' -f1)"

jq -n \
  --arg repairId "$REPAIR_ID" --argjson attempt "$ATTEMPT" --arg leaseId "$LEASE_ID" \
  --arg originalMergeSha "$MERGE_SHA" --arg rollbackMergeSha "$ROLLBACK_MERGE_SHA" \
  --arg deploymentId "$DEPLOYMENT_ID" --arg versionId "$VERSION_ID" --arg sourceSha "$ROLLBACK_MERGE_SHA" \
  --arg completedAt "$COMPLETED_AT" --arg probesDigest "$PROBES_DIGEST" --argjson pullRequestNumber "$PR" \
  '{schemaVersion:1,repairId:$repairId,attempt:$attempt,leaseId:$leaseId,originalMergeSha:$originalMergeSha,rollbackMergeSha:$rollbackMergeSha,deploymentId:$deploymentId,versionId:$versionId,sourceSha:$sourceSha,completedAt:$completedAt,probesDigest:$probesDigest,pullRequestNumber:$pullRequestNumber}' \
  >"$REPAIR_ROLLBACK_EVIDENCE"
