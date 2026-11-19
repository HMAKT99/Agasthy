#!/usr/bin/env bash
# Points the README's versioned download links at a published release.
# Usage: scripts/readme-release-links.sh v0.1.6 [README.md README.zh-CN.md ...]
# Reads the release's asset names from $ASSETS (one per line) if set, else from `gh release view`.
# A link is only changed when the release actually has that file, so it never points at a 404.
set -euo pipefail

tag="${1:?usage: $0 vX.Y.Z [README.md ...]}"
shift
readmes=("$@")
[ ${#readmes[@]} -gt 0 ] || readmes=(README.md README.zh-CN.md)
V='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?'
[[ "$tag" =~ ^v${V}$ ]] || { echo "not a version tag: $tag" >&2; exit 1; }
v="${tag#v}"
assets="${ASSETS:-$(gh release view "$tag" --json assets -q '.assets[].name')}"

point() { # asset-name  sed-pattern  replacement
  if grep -qxF "$1" <<<"$assets"; then
    for readme in "${readmes[@]}"; do
      sed -E -i.bak "s#$2#$3#g" "$readme" && rm -f "$readme.bak"
    done
  else
    echo "::warning::$tag has no $1; left that README link as it is"
  fi
}

point "AGASTHY_${v}_x64-setup.exe" \
  "releases/download/v${V}/AGASTHY_${V}_x64-setup\.exe" \
  "releases/download/${tag}/AGASTHY_${v}_x64-setup.exe"
point "agasthy-mcp-${v}.mcpb" \
  "releases/download/v${V}/agasthy-mcp-${V}\.mcpb" \
  "releases/download/${tag}/agasthy-mcp-${v}.mcpb"
if grep -qxF "AGASTHY-${v}-macos-universal.dmg" <<<"$assets"; then
  # One DMG for Apple silicon and Intel: links and their labels say so.
  point "AGASTHY-${v}-macos-universal.dmg" \
    "releases/download/v${V}/AGASTHY-${V}-(apple-silicon|macos-universal)\.dmg" \
    "releases/download/${tag}/AGASTHY-${v}-macos-universal.dmg"
  for readme in "${readmes[@]}"; do
    sed -E -i.bak \
      -e 's#(Download for Mac|Download AGASTHY for macOS) \(Apple silicon\)#\1 (Apple silicon and Intel)#g' \
      -e 's#(下载 Mac 版|下载 macOS 版)（Apple 芯片）#\1（Apple 芯片和 Intel）#g' \
      "$readme" && rm -f "$readme.bak"
  done
else
  point "AGASTHY-${v}-apple-silicon.dmg" \
    "releases/download/v${V}/AGASTHY-${V}-apple-silicon\.dmg" \
    "releases/download/${tag}/AGASTHY-${v}-apple-silicon.dmg"
fi
point "AGASTHY_${v}_amd64.AppImage" \
  "releases/download/v${V}/AGASTHY_${V}_amd64\.AppImage" \
  "releases/download/${tag}/AGASTHY_${v}_amd64.AppImage"
point "agasthy_${v}_amd64.deb" \
  "releases/download/v${V}/agasthy_${V}_amd64\.deb" \
  "releases/download/${tag}/agasthy_${v}_amd64.deb"
