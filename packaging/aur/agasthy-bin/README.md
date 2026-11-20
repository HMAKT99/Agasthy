# agasthy-bin (AUR)

The Arch User Repository package for Arch-based systems (Omarchy, Manjaro, EndeavourOS). Once it is published, users install it with:

```sh
yay -S agasthy-bin    # or: paru -S agasthy-bin
```

It installs the official release binaries, so nothing is compiled on the user's machine:
- the desktop app (`agasthy-desktop`, with its menu entry and icons), taken from the release `.deb`;
- the `agasthy` command-line tool and read-only MCP server, taken from the release CLI tarball.

It works on x86_64 and aarch64. CI (`.github/workflows/aur-check.yml`) builds and installs it on Arch Linux whenever this folder changes.

## Publishing (first time)

1. Create an account on https://aur.archlinux.org and add your SSH public key in *My Account*.
2. Run these commands:

```sh
git clone ssh://aur@aur.archlinux.org/agasthy-bin.git aur-agasthy-bin
cp PKGBUILD .SRCINFO aur-agasthy-bin/
cd aur-agasthy-bin
git add PKGBUILD .SRCINFO
git commit -m "agasthy-bin 0.1.10"
git push
```

The AUR repository must contain only `PKGBUILD` and `.SRCINFO`, so this README stays here.

## Updating for a new release

1. In `PKGBUILD`, set `pkgver` to the new version and reset `pkgrel=1`.
2. Replace the four `sha256sums_*` values with the ones from the release's `.sha256` files:
   ```sh
   v=0.1.11
   for f in agasthy_${v}_amd64.deb agasthy-cli-linux-x86_64.tar.gz agasthy_${v}_arm64.deb agasthy-cli-linux-aarch64.tar.gz; do
     curl -fsSL "https://github.com/HMAKT99/Agasthy/releases/download/v$v/$f.sha256"
   done
   ```
3. Regenerate `.SRCINFO` on an Arch system: `makepkg --printsrcinfo > .SRCINFO`. Otherwise edit the version and checksums in it by hand; CI fails if it doesn't match.
4. Open a PR here. Once CI passes, push both files to the AUR as described above.
