#!/usr/bin/env bash
# Builds the Claude Desktop extension (agasthy-mcp-<version>.mcpb) from the three
# release CLI archives in DIST, and writes its .sha256 next to it.
# Usage: scripts/build-mcpb.sh <version> <dist-dir>
set -euo pipefail

version="${1:?usage: $0 <version> <dist-dir>}"
dist="$(cd "${2:?usage: $0 <version> <dist-dir>}" && pwd)"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
b="$work/bundle"

mkdir -p "$b/bin/darwin-arm64" "$b/bin/linux-x64" "$b/bin/win32-x64"
# Universal (Apple silicon and Intel) when the release has it; the folder name is only a label.
mac_cli="$dist/agasthy-cli-macos-universal.tar.gz"
[ -f "$mac_cli" ] || mac_cli="$dist/agasthy-cli-macos-aarch64.tar.gz"
tar -C "$b/bin/darwin-arm64" -xzf "$mac_cli" agasthy
tar -C "$b/bin/linux-x64" -xzf "$dist/agasthy-cli-linux-x86_64.tar.gz" agasthy
unzip -q -j "$dist/agasthy-cli-windows-x86_64.zip" agasthy.exe -d "$b/bin/win32-x64"
chmod +x "$b/bin/darwin-arm64/agasthy" "$b/bin/linux-x64/agasthy"

cp "$root/integrations/mcp/mcpb/manifest.json" "$b/manifest.json"
cp "$root/apps/desktop/src-tauri/icons/icon.png" "$b/icon.png"
cp "$root/LICENSE" "$b/LICENSE"
got="$(node -p "require('$b/manifest.json').version")"
[ "$got" = "$version" ] || { echo "integrations/mcp/mcpb/manifest.json version $got != $version" >&2; exit 1; }

out="agasthy-mcp-$version.mcpb"
npx --yes @anthropic-ai/mcpb@2.1.2 validate "$b/manifest.json"
npx --yes @anthropic-ai/mcpb@2.1.2 pack "$b" "$dist/$out"
(cd "$dist" && { command -v sha256sum >/dev/null && sha256sum "$out" || shasum -a 256 "$out"; } > "$out.sha256")

# The packed bundle must hold all three binaries, still executable.
listing="$(unzip -Z "$dist/$out")"
for f in bin/darwin-arm64/agasthy bin/linux-x64/agasthy bin/win32-x64/agasthy.exe manifest.json; do
  grep -q " $f\$" <<<"$listing" || { echo "$out is missing $f" >&2; exit 1; }
done
grep -E ' bin/(darwin-arm64|linux-x64)/agasthy$' <<<"$listing" | grep -qv '^.rwx' && { echo "$out lost the exec bit" >&2; exit 1; }
echo "built $dist/$out"
