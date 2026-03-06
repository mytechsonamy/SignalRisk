#!/usr/bin/env bash
# Verifies npm workspace package references are consistent
set -euo pipefail

ROOT="${1:-.}"
FAILED=0

echo "=== npm Workspace Verification ==="

# Check root package.json has workspaces
if node -e "const p=require('$ROOT/package.json'); process.exit(p.workspaces ? 0 : 1)" 2>/dev/null; then
  echo "  PASS  root package.json has workspaces"
else
  echo "  FAIL  root package.json missing workspaces"
  FAILED=$((FAILED+1))
fi

# Check all internal packages have unique names
NAMES=$(find "$ROOT/packages" -name "package.json" -not -path "*/node_modules/*" \
  -exec node -e "try{console.log(require(process.argv[1]).name)}catch(e){}" {} \;)
UNIQUE=$(echo "$NAMES" | sort -u | wc -l)
TOTAL=$(echo "$NAMES" | wc -l)
if [[ "$UNIQUE" -eq "$TOTAL" ]]; then
  echo "  PASS  all package names are unique ($TOTAL packages)"
else
  echo "  FAIL  duplicate package names detected"
  FAILED=$((FAILED+1))
fi

# Check redis-module is available
if [[ -f "$ROOT/packages/redis-module/package.json" ]]; then
  echo "  PASS  @signalrisk/redis-module present"
else
  echo "  FAIL  @signalrisk/redis-module missing"
  FAILED=$((FAILED+1))
fi

echo "==="
[[ $FAILED -eq 0 ]] && echo "Workspace verification PASSED" && exit 0 || { echo "$FAILED check(s) FAILED"; exit 1; }
