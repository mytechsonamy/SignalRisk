#!/usr/bin/env bash
# Fails CI if main bundle exceeds 500KB gzipped
set -euo pipefail

MAX_KB="${1:-500}"
DIST="apps/dashboard/dist/assets"

if [[ ! -d "$DIST" ]]; then
  echo "dist/assets not found — run npm run build first"
  exit 1
fi

echo "=== Bundle Size Check (limit: ${MAX_KB}KB gzipped) ==="
FAILED=0

for f in "$DIST"/index-*.js "$DIST"/*.js; do
  [[ -f "$f" ]] || continue
  SIZE_BYTES=$(gzip -c "$f" 2>/dev/null | wc -c)
  SIZE_KB=$((SIZE_BYTES / 1024))
  NAME=$(basename "$f")
  if [[ $SIZE_KB -gt $MAX_KB ]]; then
    echo "  FAIL  $NAME — ${SIZE_KB}KB (exceeds ${MAX_KB}KB)"
    FAILED=$((FAILED+1))
  else
    echo "  PASS  $NAME — ${SIZE_KB}KB"
  fi
done

if [[ $FAILED -eq 0 ]]; then
  echo "Bundle size check PASSED"
  exit 0
else
  echo "$FAILED bundle(s) exceed limit"
  exit 1
fi
