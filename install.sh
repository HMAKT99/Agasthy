#!/bin/sh
# Installs AGASTHY on macOS or Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/HMAKT99/Agasthy/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/HMAKT99/Agasthy/main/install.sh | sh -s -- --cli
#
# Downloads the latest release from GitHub, checks its SHA-256 against the
# checksum published next to it, and installs:
#   macOS: AGASTHY.app into /Applications (or ~/Applications if that is not writable)
#   Linux: the AppImage into ~/Applications/AGASTHY.AppImage
# Options:
#   --cli        also install the read-only `agasthy` command-line tool into ~/.local/bin
#   --cli-only   install only the command-line tool
#   --dir DIR    install the app into DIR instead (for testing)
#
# About the macOS security prompt: files downloaded with curl are not marked as
# "downloaded from the internet", so macOS does not show its "could not verify"
# prompt for the app this script installs. Running this script is the trust
# decision; read it first if you like. Nothing is installed if a checksum does
# not match. No admin rights needed, nothing runs at login, nothing is sent
# anywhere except the downloads from github.com.
set -eu

REPO="HMAKT99/Agasthy"
BASE="https://github.com/$REPO/releases"
want_app=1
want_cli=0
dir=""

while [ $# -gt 0 ]; do
  case "$1" in
    --cli) want_cli=1 ;;
    --cli-only) want_cli=1; want_app=0 ;;
    --dir) shift; dir="${1:?--dir needs a folder}" ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
fail() { printf 'AGASTHY install: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "needs '$1', which was not found"; }
need curl
need uname

os=$(uname -s)
arch=$(uname -m)
case "$arch" in aarch64) arch=arm64 ;; amd64) arch=x86_64 ;; esac

# The latest release tag, from the redirect of /releases/latest (no API token needed).
tag=$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$BASE/latest" | sed 's#.*/tag/##')
case "$tag" in v[0-9]*) ;; *) fail "could not find the latest release (got '$tag')" ;; esac
v=${tag#v}

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t agasthy)
cleanup() {
  if [ -n "${mnt:-}" ]; then hdiutil detach -quiet "$mnt" 2>/dev/null || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else fail "needs shasum or sha256sum to check the download"; fi
}

# fetch NAME: downloads NAME and NAME.sha256 from the release and checks them.
# Returns 1 (without failing) when the release has no such file.
fetch() {
  url="$BASE/download/$tag/$1"
  curl -fsSL -o "$tmp/$1.sha256" "$url.sha256" 2>/dev/null || return 1
  say "Downloading $1 ..."
  curl -fSL --progress-bar -o "$tmp/$1" "$url" || fail "download failed: $url"
  expected=$(cut -c1-64 "$tmp/$1.sha256" | tr 'A-F' 'a-f')
  actual=$(sha256 "$tmp/$1")
  [ "$expected" = "$actual" ] || fail "checksum mismatch for $1 (expected $expected, got $actual). Nothing was installed."
  say "Checksum OK."
}

install_app_macos() {
  need hdiutil
  need ditto
  # Universal (Apple silicon and Intel) when the release has it, else the Apple silicon build.
  dmg="AGASTHY-$v-macos-universal.dmg"
  if ! fetch "$dmg"; then
    [ "$arch" = arm64 ] || fail "AGASTHY $v has no build for Intel Macs yet. See $BASE"
    dmg="AGASTHY-$v-apple-silicon.dmg"
    fetch "$dmg" || fail "AGASTHY $v has no macOS download. See $BASE/tag/$tag"
  fi
  mnt="$tmp/mnt"
  mkdir -p "$mnt"
  hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$tmp/$dmg" || fail "could not open $dmg"
  [ -d "$mnt/AGASTHY.app" ] || fail "$dmg does not contain AGASTHY.app"

  target="${dir:-/Applications}"
  if [ -z "$dir" ] && [ ! -w "$target" ]; then target="$HOME/Applications"; fi
  mkdir -p "$target"
  if pgrep -xq agasthy-desktop 2>/dev/null; then
    say "AGASTHY is running; quit it (menu bar → Quit) and open it again after this finishes."
  fi
  rm -rf "$target/AGASTHY.app.new"
  ditto "$mnt/AGASTHY.app" "$target/AGASTHY.app.new"
  rm -rf "$target/AGASTHY.app"
  mv "$target/AGASTHY.app.new" "$target/AGASTHY.app"
  hdiutil detach -quiet "$mnt" || true
  mnt=""
  say "Installed AGASTHY $v in $target/AGASTHY.app"
  say "Open it from $target (or: open \"$target/AGASTHY.app\")."
}

install_app_linux() {
  [ "$arch" = x86_64 ] || fail "the Linux desktop app ships for x86_64 only so far; try --cli-only, or see $BASE"
  img="AGASTHY_${v}_amd64.AppImage"
  fetch "$img" || fail "AGASTHY $v has no AppImage. See $BASE/tag/$tag"
  target="${dir:-$HOME/Applications}"
  mkdir -p "$target"
  mv "$tmp/$img" "$target/AGASTHY.AppImage"
  chmod +x "$target/AGASTHY.AppImage"
  say "Installed AGASTHY $v at $target/AGASTHY.AppImage (run it to start)."
  say "On Debian or Ubuntu you can use the .deb instead: $BASE/tag/$tag"
}

install_cli() {
  case "$os-$arch" in
    Darwin-*)
      tarball="agasthy-cli-macos-universal.tar.gz"
      if ! fetch "$tarball"; then
        [ "$arch" = arm64 ] || fail "the command-line tool has no Intel Mac build in $tag yet"
        tarball="agasthy-cli-macos-aarch64.tar.gz"
        fetch "$tarball" || fail "$tag has no macOS command-line tool"
      fi ;;
    Linux-x86_64) tarball="agasthy-cli-linux-x86_64.tar.gz"; fetch "$tarball" || fail "$tag has no Linux command-line tool" ;;
    Linux-arm64) tarball="agasthy-cli-linux-aarch64.tar.gz"; fetch "$tarball" || fail "$tag has no Linux ARM command-line tool yet" ;;
    *) fail "no command-line tool for $os $arch" ;;
  esac
  bin="$HOME/.local/bin"
  mkdir -p "$bin"
  tar -xzf "$tmp/$tarball" -C "$tmp" agasthy
  mv "$tmp/agasthy" "$bin/agasthy"
  chmod +x "$bin/agasthy"
  say "Installed the command-line tool: $bin/agasthy ($("$bin/agasthy" --version 2>/dev/null || echo "version unknown"))"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) say "Add it to your PATH:  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc  (then open a new terminal)" ;;
  esac
}

say "AGASTHY $v for $os $arch"
if [ "$want_app" = 1 ]; then
  case "$os" in
    Darwin) install_app_macos ;;
    Linux) install_app_linux ;;
    *) fail "this script is for macOS and Linux. On Windows use install.ps1 or the installer: $BASE" ;;
  esac
fi
if [ "$want_cli" = 1 ]; then install_cli; fi
say "Done. Updates are offered inside the app; nothing installs without your click."
