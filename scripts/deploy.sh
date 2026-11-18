#!/usr/bin/env bash
# Rebuild + redeploy the demo to GitHub Pages (gh-pages branch).
# Run from the project root: bash scripts/deploy.sh
set -e
cd "$(dirname "$0")/.."
npm run build
git add -A
git commit -m "WaxSats: update" || true
git push origin main
rm -rf /tmp/waxsats-pages
git worktree add /tmp/waxsats-pages gh-pages
cp -r dist/* /tmp/waxsats-pages/
cd /tmp/waxsats-pages
git add -A
git commit -m "Deploy WaxSats demo (build from main)" || true
git push origin gh-pages
cd ..
git worktree remove /tmp/waxsats-pages --force
echo "Deployed: https://eres0045.github.io/waxsats/"
