#!/usr/bin/env node
// Write dist/latest.json for the in-app updater from the signed update files
// in dist/ (whatever platforms were built):
//
//   macOS:   AGASTHY_<version>_universal.app.tar.gz (+ .sig), for Apple silicon and Intel;
//            or AGASTHY_<version>_aarch64.app.tar.gz / _x86_64.app.tar.gz
//   Windows: AGASTHY_<version>_x64-setup.exe       (+ .sig)
//   Linux:   AGASTHY_<version>_amd64.AppImage      (+ .sig)
//
//   node scripts/updater-manifest.mjs --repo OWNER/NAME [--tag vX.Y.Z] [--notes "text"]
//
// The installed app checks each signature against the public key in
// tauri.conf.json before installing.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const repo = arg("--repo");
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error("usage: updater-manifest.mjs --repo OWNER/NAME [--tag vX.Y.Z] [--notes text]");
  process.exit(2);
}
const version = JSON.parse(readFileSync(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8")).version;
const tag = arg("--tag") ?? `v${version}`;
if (tag !== `v${version}`) {
  console.error(`tag ${tag} does not match the app version ${version} in tauri.conf.json`);
  process.exit(1);
}

// For each platform, the first update file that exists (with its .sig) wins.
const candidates = {
  "darwin-aarch64": [`AGASTHY_${version}_universal.app.tar.gz`, `AGASTHY_${version}_aarch64.app.tar.gz`],
  "darwin-x86_64": [`AGASTHY_${version}_universal.app.tar.gz`, `AGASTHY_${version}_x86_64.app.tar.gz`],
  "windows-x86_64": [`AGASTHY_${version}_x64-setup.exe`],
  "linux-x86_64": [`AGASTHY_${version}_amd64.AppImage`],
  "linux-aarch64": [`AGASTHY_${version}_aarch64.AppImage`],
};
const platforms = {};
for (const [platform, assets] of Object.entries(candidates)) {
  const asset = assets.find((a) => existsSync(join(dist, a)) && existsSync(join(dist, `${a}.sig`)));
  if (asset) {
    platforms[platform] = {
      signature: readFileSync(join(dist, `${asset}.sig`), "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${asset}`,
    };
  }
}
if (Object.keys(platforms).length === 0) {
  console.error("no signed update files in dist/: build with TAURI_SIGNING_PRIVATE_KEY set (see docs/releasing.md)");
  process.exit(1);
}

const manifest = {
  version,
  notes: arg("--notes") ?? `AGASTHY ${version}. See the release notes on GitHub.`,
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(join(dist, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`dist/latest.json: ${Object.keys(platforms).join(", ")}`);
