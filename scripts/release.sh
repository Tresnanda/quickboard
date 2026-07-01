#!/usr/bin/env bash
# Build + package a signed Quickboard release for the in-app updater.
#
#   ./scripts/release.sh            build + assemble ./release (you upload manually)
#   ./scripts/release.sh --publish  also create the GitHub Release via `gh` + upload
#
# Prereq: the updater signing key at ~/.tauri/quickboard.key (see docs/RELEASING.md).
# The updater offers a release only when tauri.conf.json `version` is higher than
# the installed one -- bump it before running.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/quickboard.key}"
REPO="Tresnanda/quickboard"
PUBLISH="${1:-}"

[ -f "$KEY" ] || { echo "ERROR: signing key not found at $KEY (see docs/RELEASING.md)"; exit 1; }

VERSION="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version")"
TAG="v$VERSION"
echo "==> Building quickboard $TAG"

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

pnpm tauri build

BUNDLE="$ROOT/src-tauri/target/release/bundle"
TARGZ="$(ls "$BUNDLE"/macos/*.app.tar.gz 2>/dev/null | head -1 || true)"
SIG="$(ls "$BUNDLE"/macos/*.app.tar.gz.sig 2>/dev/null | head -1 || true)"
DMG="$(ls "$BUNDLE"/dmg/*.dmg 2>/dev/null | head -1 || true)"

[ -n "$TARGZ" ] && [ -f "$SIG" ] || { echo "ERROR: updater artifacts missing -- is bundle.createUpdaterArtifacts true?"; exit 1; }

# Apple-Silicon build -> darwin-aarch64 (Intel would be darwin-x86_64; a universal
# build should list BOTH keys pointing at the same archive).
if [ "$(uname -m)" = "arm64" ]; then PLAT="darwin-aarch64"; else PLAT="darwin-x86_64"; fi

OUT="$ROOT/release"; rm -rf "$OUT"; mkdir -p "$OUT"
cp "$TARGZ" "$OUT/"; [ -n "$DMG" ] && cp "$DMG" "$OUT/"
TARGZ_NAME="$(basename "$TARGZ")"

cat > "$OUT/latest.json" <<JSON
{
  "version": "$VERSION",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "notes": "See the release notes on GitHub.",
  "platforms": {
    "$PLAT": {
      "signature": "$(cat "$SIG")",
      "url": "https://github.com/$REPO/releases/download/$TAG/$TARGZ_NAME"
    }
  }
}
JSON

echo "==> Assembled ./release ($TARGZ_NAME + latest.json${DMG:+ + dmg})"

if [ "$PUBLISH" = "--publish" ]; then
  command -v gh >/dev/null || { echo "ERROR: gh CLI not found -- install it or upload ./release manually"; exit 1; }
  echo "==> Publishing $TAG to GitHub"
  ASSETS=("$OUT/latest.json" "$OUT/$TARGZ_NAME"); [ -n "$DMG" ] && ASSETS+=("$OUT/$(basename "$DMG")")
  gh release create "$TAG" "${ASSETS[@]}" --repo "$REPO" --title "$TAG" --notes "Release $TAG" --latest
  echo "==> Published $TAG. Installed apps will offer it on next launch."
else
  echo "--> Next: create a GitHub Release tagged $TAG and upload the files in ./release,"
  echo "    or re-run with --publish to do it via gh."
fi
