#!/usr/bin/env bash
# Builds the Anulekh web app and deploys it to both Cloud Run services.
#   ./scripts/deploy-web.sh            checks + build + deploy (asia-south1 and us-central1)
#   ./scripts/deploy-web.sh --dry-run  checks + build only, nothing deployed
# The phone apps (EAS) and the backend (Render) are not covered by this script.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="project-ba753270-5762-47c5-ba6"
SERVICES=("anulekh-web:asia-south1" "anulekh-web-us:us-central1")
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

step "Checking git (another agent may have pushed newer work)"
git fetch --quiet origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
if [[ "$BEHIND" != "0" ]]; then
  echo "✖ $BRANCH is $BEHIND commit(s) behind origin/$BRANCH — pull and review first so newer work isn't overwritten."
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

for entry in "${SERVICES[@]}"; do
  service=${entry%%:*}
  region=${entry##*:}
  step "Deploying $service ($region)"
  gcloud run deploy "$service" --source . --region "$region" --project "$PROJECT" --quiet
done

step "Done — both services deployed"
