#!/usr/bin/env bash
# Builds the Anulekh web app and deploys it to both Cloud Run services.
# Keeps the permanent Mumbai URL (https://anulekh-web-127496140633.asia-south1.run.app)
# and US URL (https://anulekh-web-us-127496140633.us-central1.run.app) updated and warm.
#
#   ./scripts/deploy-web.sh            checks + build + deploy (asia-south1 & us-central1)
#   ./scripts/deploy-web.sh --dry-run  checks + build only, nothing deployed
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="project-ba753270-5762-47c5-ba6"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Checking git (ensuring local is up to date)"
git fetch --quiet origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
if [[ "$BEHIND" != "0" ]]; then
  echo "✖ $BRANCH is $BEHIND commit(s) behind origin/$BRANCH — pull first."
  exit 1
fi
git status --short | sed 's/^/  uncommitted (will be deployed): /'

step "Type-check"
npx tsc --noEmit

step "Building web app (backend: $(grep -E '^EXPO_PUBLIC_API_URL=' .env | cut -d= -f2-))"
rm -rf dist
npm run build --silent

if $DRY_RUN; then
  echo "✔ Dry run complete — dist/ built, nothing deployed."
  exit 0
fi

step "1/2 Deploying build to us-central1 (anulekh-web-us)"
gcloud run deploy anulekh-web-us \
  --source . \
  --region us-central1 \
  --min-instances 1 \
  --project "$PROJECT" \
  --quiet

IMAGE=$(gcloud run services describe anulekh-web-us \
  --region us-central1 \
  --project "$PROJECT" \
  --format="value(spec.template.spec.containers[0].image)")

step "2/2 Deploying to primary Mumbai region (anulekh-web: asia-south1)"
gcloud run deploy anulekh-web \
  --image "$IMAGE" \
  --region asia-south1 \
  --min-instances 1 \
  --project "$PROJECT" \
  --quiet

step "Deployment Complete!"
echo "🇮🇳 Permanent Mumbai URL: https://anulekh-web-127496140633.asia-south1.run.app"
echo "🌐 Permanent US URL:     https://anulekh-web-us-127496140633.us-central1.run.app"
