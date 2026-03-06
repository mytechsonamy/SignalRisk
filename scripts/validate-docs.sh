#!/usr/bin/env bash
# Validates developer documentation references
set -euo pipefail
ROOT="${1:-.}"
FAILED=0

check_file() {
  [[ -f "$ROOT/$1" ]] && echo "  PASS $1" || { echo "  FAIL MISSING: $1"; FAILED=$((FAILED+1)); }
}

echo "=== Developer Docs Validation ==="
check_file "docs/dev/getting-started.md"
check_file "docs/dev/web-sdk-reference.md"
check_file "docs/dev/mobile-sdk-reference.md"
check_file "docs/dev/api-reference.md"
check_file "docs/dev/architecture.md"
check_file "packages/web-sdk/src/index.ts"
check_file "packages/mobile-sdk/src/index.ts"

[[ $FAILED -eq 0 ]] && echo "All docs present ✓" && exit 0 || { echo "$FAILED missing ✗"; exit 1; }
