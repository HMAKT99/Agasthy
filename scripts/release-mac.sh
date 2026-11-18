#!/usr/bin/env bash
# Build a distributable macOS DMG of AGASTHY.
#
# Without Apple credentials this produces an unsigned DMG (fine for testing;
# other Macs show an "unidentified developer" warning). With them, the app and
# the DMG are signed with your Developer ID and notarized by Apple, so it opens
# normally everywhere:
#
#   APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   APPLE_ID="you@example.com"           # Apple account used for notarization
#   APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx" # an app-specific password, not your login password
#   APPLE_TEAM_ID="TEAMID"
#
# Optional: TARGET=universal-apple-darwin builds one app for Apple silicon and
# Intel (needs `rustup target add x86_64-apple-darwin aarch64-apple-darwin`).
#
# Output: dist/AGASTHY-<version>-<arch>.dmg and a .sha256 checksum next to it.
set -euo pipefail
cd "$(dirname "$0")/.."

# CI passes unset secrets as empty strings; an empty APPLE_SIGNING_IDENTITY
# would make the bundler try to sign with identity "" and fail.
for v in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD TAURI_SIGNING_PRIVATE_KEY_PASSWORD; do
  if [ -z "${!v:-}" ]; then unset "$v"; fi
done
# A key generated without a password needs the variable present but empty.
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+x}" ]; then
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
fi

VERSION=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")

build_args=()
if [ -n "${TARGET:-}" ]; then
  build_args+=(--target "$TARGET")
fi
# Tauri signs (and, with APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID, notarizes) the
# .app itself when APPLE_SIGNING_IDENTITY is set.
pnpm tauri build ${build_args[@]+"${build_args[@]}"}

APP="target/${TARGET:+$TARGET/}release/bundle/macos/AGASTHY.app"
[ -d "$APP" ] || { echo "build did not produce $APP" >&2; exit 1; }

# Name the DMG after what was actually built (the shell may run under Rosetta).
case "$(lipo -archs "$APP/Contents/MacOS/agasthy-desktop")" in
  "x86_64 arm64" | "arm64 x86_64") ARCH_LABEL=macos-universal ;;
  arm64) ARCH_LABEL=apple-silicon ;;
  x86_64) ARCH_LABEL=intel ;;
  *) ARCH_LABEL=unknown ;;
esac

mkdir -p dist
DMG="dist/AGASTHY-${VERSION}-${ARCH_LABEL}.dmg"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/agasthy-dmg.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "AGASTHY ${VERSION}" -srcfolder "$STAGE" -ov -format UDZO "$DMG"

if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"
  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
    xcrun stapler staple "$DMG"
  else
    echo "note: DMG signed but not notarized (APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID not all set)" >&2
  fi
else
  echo "note: ad-hoc signed (no Developer ID). On first launch macOS asks users to allow it in System Settings > Privacy & Security." >&2
fi

# The signed update archive, named the way the updater manifest expects
# (a universal archive serves both Apple silicon and Intel installs).
case "$ARCH_LABEL" in
  macos-universal) UPD=universal ;;
  intel) UPD=x86_64 ;;
  *) UPD=aarch64 ;;
esac
if [ -f "$APP.tar.gz" ] && [ -f "$APP.tar.gz.sig" ]; then
  cp "$APP.tar.gz" "dist/AGASTHY_${VERSION}_${UPD}.app.tar.gz"
  cp "$APP.tar.gz.sig" "dist/AGASTHY_${VERSION}_${UPD}.app.tar.gz.sig"
fi

(cd dist && shasum -a 256 "$(basename "$DMG")" > "$(basename "$DMG").sha256")
echo "$DMG"
