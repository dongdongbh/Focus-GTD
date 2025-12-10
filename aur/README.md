# Focus GTD AUR Package

This directory contains the PKGBUILD for maintaining the [focus-gtd-bin](https://aur.archlinux.org/packages/focus-gtd-bin) package on the Arch User Repository (AUR).

## Installation

**Using an AUR helper (recommended):**
```bash
# Using yay
yay -S focus-gtd-bin

# Using paru
paru -S focus-gtd-bin
```

**Manual installation:**
```bash
git clone https://aur.archlinux.org/focus-gtd-bin.git
cd focus-gtd-bin
makepkg -sri
```

---

## Maintaining the AUR Package

### Prerequisites
1. Create an account on [aur.archlinux.org](https://aur.archlinux.org/)
2. Upload your SSH public key to your AUR account
3. Clone the AUR repo: `git clone ssh://aur@aur.archlinux.org/focus-gtd-bin.git`

### Updating the Package

When a new version is released:

```bash
# 1. Go to your local AUR repo clone
cd /path/to/aur/focus-gtd-bin

# 2. Update PKGBUILD
# - Change pkgver to new version (e.g., 0.2.4)
# - Update checksums if needed

# 3. Update checksums (download the new .deb and calculate)
updpkgsums
# Or manually: sha256sum focus-gtd_0.2.4_amd64.deb

# 4. Regenerate .SRCINFO (required by AUR)
makepkg --printsrcinfo > .SRCINFO

# 5. Test locally
makepkg -sri

# 6. If tests pass, commit and push
git add PKGBUILD .SRCINFO
git commit -m "Update to v0.2.4"
git push origin master  # AUR only accepts 'master' branch
```

### Quick Update Script

For convenience, you can use this script to update the AUR package:

```bash
#!/bin/bash
# update-aur.sh

VERSION="$1"
if [ -z "$VERSION" ]; then
    echo "Usage: ./update-aur.sh 0.2.4"
    exit 1
fi

# Update pkgver in PKGBUILD
sed -i "s/^pkgver=.*/pkgver=$VERSION/" PKGBUILD

# Update checksums
updpkgsums

# Regenerate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Test build
makepkg -f

echo "Ready to commit. Run:"
echo "  git add PKGBUILD .SRCINFO && git commit -m 'Update to v$VERSION' && git push origin master"
```

### Package Types

| Package              | Source                     | Notes                    |
| -------------------- | -------------------------- | ------------------------ |
| `focus-gtd-bin`      | GitHub Release `.deb`      | Binary package (current) |
| `focus-gtd`          | Build from source          | Not yet available        |
| `focus-gtd-appimage` | GitHub Release `.AppImage` | Alternative binary       |

### Useful Commands

```bash
# Check PKGBUILD for issues
namcap PKGBUILD

# Check built package
namcap focus-gtd-bin-*.pkg.tar.zst

# View package contents
pacman -Qlp focus-gtd-bin-*.pkg.tar.zst
```

## Notes

- **Repology**: Once published on AUR, the package will automatically appear on [Repology](https://repology.org/) after their next sync
- **Branch**: AUR only accepts pushes to the `master` branch (not `main`)
- **Checksums**: Use `SKIP` during development, but always use proper SHA256 checksums for releases
