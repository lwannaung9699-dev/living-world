#!/data/data/com.termux/files/usr/bin/bash
# Safe merge script.
#
# Fixes two issues found in the previous version:
#   1. mktemp -d landed in Android's /tmp, which is read-only in Termux and
#      caused a silent partial-failure that deleted the repo tree on push
#      (commit ab55350). This version extracts into a directory inside the
#      home dir (~/merged-check) instead of /tmp.
#   2. `tsx --test src/sim/test/*.test.ts` is a non-recursive glob — it only
#      matches test files directly in src/sim/test/, silently skipping every
#      test in a subfolder (creature/, worldgen/, biology/, ecology/,
#      politics/, pipeline/, ...). This version enumerates *.test.ts
#      recursively with `find` so nothing is silently skipped.
#
# Order enforced: extract -> verify -> copy -> test -> commit -> push.
# Any failure stops the script before it touches git (set -e).

set -e

ZIP="$1"
MSG="$2"

if [ -z "$ZIP" ] || [ -z "$MSG" ]; then
  echo "Usage: ./merge-team.sh <zip-path> \"commit message\""
  exit 1
fi

if [ ! -f "$ZIP" ]; then
  echo "ERROR: zip not found: $ZIP"
  exit 1
fi

CHECK_DIR="$HOME/merged-check"
rm -rf "$CHECK_DIR"
mkdir -p "$CHECK_DIR"

echo "==> Extracting $ZIP to $CHECK_DIR ..."
unzip -oq "$ZIP" -d "$CHECK_DIR"

# The zip may contain a single top-level folder (e.g. living-world-.../src/...)
# or extract src/ directly at the root. Find whichever directory actually
# holds "sim" so this works either way.
SRC_SIM_DIR=$(find "$CHECK_DIR" -type d -path "*/src/sim" | head -n 1)

if [ -z "$SRC_SIM_DIR" ]; then
  echo "ERROR: could not find a src/sim directory anywhere in the extracted zip."
  echo "Aborting before touching the repo."
  exit 1
fi

SRC_ROOT=$(dirname "$SRC_SIM_DIR")   # .../src
EXTRACT_ROOT=$(dirname "$SRC_ROOT")  # the dir that directly contains src/

echo "==> Found src/ at: $SRC_ROOT"
echo "==> Verifying required subsystem directories under src/sim ..."

REQUIRED_DIRS="biology creature ecology materials objects politics society worldgen core contracts persistence test"
MISSING=0
for d in $REQUIRED_DIRS; do
  if [ -d "$SRC_SIM_DIR/$d" ]; then
    echo "   OK      $d"
  else
    echo "   MISSING $d"
    MISSING=1
  fi
done

if [ "$MISSING" = "1" ]; then
  echo "ERROR: one or more required subsystem directories are missing from the zip."
  echo "Aborting before touching the repo — nothing has been copied or committed."
  exit 1
fi

echo "==> Verification passed. Copying into repo ..."
cp -rf "$SRC_ROOT" .
if [ -f "$EXTRACT_ROOT/package.json" ]; then
  cp -f "$EXTRACT_ROOT"/*.json . 2>/dev/null || true
fi

echo "==> Running full test suite (recursive enumeration, not a glob) ..."
TEST_FILES=$(find src/sim/test -name "*.test.ts")
TEST_COUNT=$(echo "$TEST_FILES" | wc -l)
echo "==> Found $TEST_COUNT test files."
echo "$TEST_FILES" | xargs npx tsx --test

echo "==> Tests passed. Cleaning up check dir ..."
rm -rf "$CHECK_DIR"

git add -A
git commit -m "$MSG"
git push
echo "Merged and pushed."
