#!/usr/bin/env python3
"""Write winget manifests for an AGASTHY release.

Usage: scripts/winget-manifests.py <version> <installer-sha256> <out-dir>

Writes <out-dir>/HMAKT99.AGASTHY.yaml, .installer.yaml and .locale.en-US.yaml
(manifest schema 1.6.0) for the per-user NSIS installer. Installs through
winget do not show the SmartScreen "Windows protected your PC" prompt.
Submitted with `wingetcreate submit <out-dir>` (see publish-channels.yml).
"""
import pathlib
import re
import sys

if len(sys.argv) != 4:
    sys.exit(__doc__)
version, sha, out = sys.argv[1], sys.argv[2].strip().upper(), pathlib.Path(sys.argv[3])
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    sys.exit(f"not a version: {version}")
if not re.fullmatch(r"[0-9A-F]{64}", sha):
    sys.exit(f"not a SHA-256: {sha}")

ID = "HMAKT99.AGASTHY"
SCHEMA = "1.6.0"
url = f"https://github.com/HMAKT99/Agasthy/releases/download/v{version}/AGASTHY_{version}_x64-setup.exe"
head = lambda kind: f"# yaml-language-server: $schema=https://aka.ms/winget-manifest.{kind}.{SCHEMA}.schema.json\n\n"

files = {
    f"{ID}.yaml": head("version")
    + f"""PackageIdentifier: {ID}
PackageVersion: {version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: {SCHEMA}
""",
    f"{ID}.installer.yaml": head("installer")
    + f"""PackageIdentifier: {ID}
PackageVersion: {version}
InstallerType: nullsoft
Scope: user
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: {url}
    InstallerSha256: {sha}
ManifestType: installer
ManifestVersion: {SCHEMA}
""",
    f"{ID}.locale.en-US.yaml": head("defaultLocale")
    + f"""PackageIdentifier: {ID}
PackageVersion: {version}
PackageLocale: en-US
Publisher: HMAKT99
PublisherUrl: https://github.com/HMAKT99
PublisherSupportUrl: https://github.com/HMAKT99/Agasthy/issues
PackageName: AGASTHY
PackageUrl: https://github.com/HMAKT99/Agasthy
License: Apache-2.0
LicenseUrl: https://github.com/HMAKT99/Agasthy/blob/main/LICENSE
Copyright: The AGASTHY Authors
ShortDescription: Developer machine intelligence for repos, runtimes, packages and coding agents.
Description: |-
  AGASTHY finds every repository, runtime, package and AI tool on your machine and links them in one graph.
  It tracks coding agents (Claude Code, Codex, Cursor and more) and their token spend, shows what breaks before
  you remove anything, and frees disk space safely. Local-first: nothing is sent anywhere.
Tags:
  - developer-tools
  - coding-agents
  - claude-code
  - codex
  - mcp
  - disk-cleanup
ReleaseNotesUrl: https://github.com/HMAKT99/Agasthy/releases/tag/v{version}
ManifestType: defaultLocale
ManifestVersion: {SCHEMA}
""",
}
out.mkdir(parents=True, exist_ok=True)
for name, text in files.items():
    (out / name).write_text(text)
print(f"winget manifests for {ID} {version} in {out}")
