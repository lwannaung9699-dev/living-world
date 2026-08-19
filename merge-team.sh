#!/data/data/com.termux/files/usr/bin/bash
set -e
ZIP="$1"
MSG="$2"
if [ -z "$ZIP" ] || [ -z "$MSG" ]; then echo "Usage: ./merge-team.sh <zip-path> \"commit message\""; exit 1; fi
TMP=$(mktemp -d)
unzip -oq "$ZIP" -d "$TMP"
cp -rf "$TMP"/src/* src/ 2>/dev/null || true
cp -rf "$TMP"/*.json . 2>/dev/null || true
rm -rf "$TMP"
npx tsx --test src/sim/test/*.test.ts
git add -A
git commit -m "$MSG"
git push
echo "Merged and pushed."
