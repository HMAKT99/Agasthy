#!/usr/bin/env python3
"""Write the Homebrew tap's cask and CLI formula for a release.

Usage: scripts/bump-homebrew-tap.py <tap-dir> <version> <sums-dir> [--notarized]

<sums-dir> holds the release's .sha256 files. Both files are written whole
from the templates below, so the tap's contents are defined (and reviewed) in
this repository:

- When the release has the universal macOS files (AGASTHY-<v>-macos-universal.dmg,
  agasthy-cli-macos-universal.tar.gz), the cask and formula serve Apple silicon
  and Intel Macs. Otherwise they fall back to the Apple silicon files.
- --notarized drops the cask's first-launch note (the app opens without a prompt).
"""
import pathlib
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
notarized = "--notarized" in sys.argv[1:]
if len(args) != 3:
    sys.exit(__doc__)
tap, version, sums = pathlib.Path(args[0]), args[1], pathlib.Path(args[2])
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    sys.exit(f"not a version: {version}")


def sha(asset: str) -> str | None:
    f = sums / f"{asset}.sha256"
    if not f.exists():
        return None
    h = f.read_text().split()[0].lower()
    if not re.fullmatch(r"[0-9a-f]{64}", h):
        sys.exit(f"bad checksum for {asset}")
    return h


def need(asset: str) -> str:
    return sha(asset) or sys.exit(f"missing {asset}.sha256 in {sums}")


universal_dmg = sha(f"AGASTHY-{version}-macos-universal.dmg")
if universal_dmg:
    dmg_name, dmg_sha, cask_arch = "AGASTHY-#{version}-macos-universal.dmg", universal_dmg, ""
else:
    dmg_name, dmg_sha = "AGASTHY-#{version}-apple-silicon.dmg", need(f"AGASTHY-{version}-apple-silicon.dmg")
    cask_arch = "  depends_on arch: :arm64\n"

caveats = (
    ""
    if notarized
    else """
  caveats <<~EOS
    AGASTHY is not notarized by Apple yet, so the first launch shows
    "Apple could not verify AGASTHY". Click Done, then open
    System Settings > Privacy & Security and click Open Anyway (once).
    Or install without the prompt:
      curl -fsSL https://raw.githubusercontent.com/HMAKT99/Agasthy/main/install.sh | sh
  EOS
"""
)

cask = f'''cask "agasthy" do
  version "{version}"
  sha256 "{dmg_sha}"

  url "https://github.com/HMAKT99/Agasthy/releases/download/v#{{version}}/{dmg_name}"
  name "AGASTHY"
  desc "Developer machine intelligence: repos, runtimes, packages and coding agents"
  homepage "https://github.com/HMAKT99/Agasthy"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
{cask_arch}  depends_on macos: :monterey

  app "AGASTHY.app"
{caveats}
  zap trash: [
    "~/Library/Application Support/org.agasthy.desktop",
    "~/Library/Caches/org.agasthy.desktop",
    "~/Library/Preferences/org.agasthy.desktop.plist",
    "~/Library/Saved Application State/org.agasthy.desktop.savedState",
    "~/Library/WebKit/org.agasthy.desktop",
  ]
end
'''

base = f"https://github.com/HMAKT99/Agasthy/releases/download/v{version}"
universal_cli = sha("agasthy-cli-macos-universal.tar.gz")
if universal_cli:
    macos = f'''  on_macos do
    url "{base}/agasthy-cli-macos-universal.tar.gz"
    sha256 "{universal_cli}"
  end'''
else:
    macos = f'''  on_macos do
    depends_on arch: :arm64

    on_arm do
      url "{base}/agasthy-cli-macos-aarch64.tar.gz"
      sha256 "{need("agasthy-cli-macos-aarch64.tar.gz")}"
    end
  end'''

linux_arm = sha("agasthy-cli-linux-aarch64.tar.gz")
linux_blocks = f'''    on_intel do
      url "{base}/agasthy-cli-linux-x86_64.tar.gz"
      sha256 "{need("agasthy-cli-linux-x86_64.tar.gz")}"
    end'''
if linux_arm:
    linux_blocks += f'''

    on_arm do
      url "{base}/agasthy-cli-linux-aarch64.tar.gz"
      sha256 "{linux_arm}"
    end'''
linux = f'''  on_linux do
{"" if linux_arm else "    depends_on arch: :x86_64" + chr(10) + chr(10)}{linux_blocks}
  end'''

formula = f'''class AgasthyCli < Formula
  desc "Read-only CLI and MCP server for AGASTHY developer machine intelligence"
  homepage "https://github.com/HMAKT99/Agasthy"
  license "Apache-2.0"

{macos}

{linux}

  def install
    bin.install "agasthy"
  end

  def caveats
    <<~EOS
      Most queries read what the AGASTHY app has scanned:
        brew install --cask hmakt99/tap/agasthy
      Use it from coding agents with the MCP server:
        claude mcp add agasthy -- #{{opt_bin}}/agasthy mcp
    EOS
  end

  test do
    assert_match "agasthy #{{version}}", shell_output("#{{bin}}/agasthy --version")
    output = pipe_output("#{{bin}}/agasthy mcp",
      '{{"jsonrpc":"2.0","id":1,"method":"tools/list"}}' + "\\n")
    assert_match "readOnlyHint", output
  end
end
'''

(tap / "Casks").mkdir(parents=True, exist_ok=True)
(tap / "Formula").mkdir(parents=True, exist_ok=True)
(tap / "Casks/agasthy.rb").write_text(cask)
(tap / "Formula/agasthy-cli.rb").write_text(formula)
kind = "universal" if universal_dmg else "Apple silicon"
print(f"tap points at {version} ({kind}{', notarized' if notarized else ''})")
