# Desktop Installation

Detailed installation instructions for all desktop platforms.

---

## Linux

### Arch Linux (AUR)

The easiest way to install on Arch-based distributions:

```bash
# Using yay
yay -S mindwtr-bin

# Using paru
paru -S mindwtr-bin

# Using pamac (Manjaro)
pamac install mindwtr-bin
```

📦 [AUR Package](https://aur.archlinux.org/packages/mindwtr-bin)

### Debian / Ubuntu

Download the `.deb` package from [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases):

```bash
# Download (replace version as needed)
wget https://github.com/dongdongbh/Mindwtr/releases/latest/download/mindwtr_amd64.deb

# Install
sudo dpkg -i mindwtr_*.deb

# Fix dependencies if needed
sudo apt-get install -f
```

### Fedora / RHEL / openSUSE

Download the `.rpm` package from [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases):

```bash
# Install with rpm
sudo rpm -i mindwtr-*.rpm

# Or with dnf (Fedora)
sudo dnf install mindwtr-*.rpm
```

### AppImage (Universal)

Works on most Linux distributions:

```bash
# Download
wget https://github.com/dongdongbh/Mindwtr/releases/latest/download/Mindwtr.AppImage

# Make executable
chmod +x Mindwtr*.AppImage

# Run
./Mindwtr*.AppImage
```

> **Tip:** Use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) for better desktop integration.

### Other Distributions

For other distributions, use the AppImage or build from source (see [[Developer Guide]]).

---

## Windows

### Scoop (Recommended)

You can easily install and update Mindwtr using [Scoop](https://scoop.sh/):

```powershell
scoop bucket add mindwtr https://github.com/dongdongbh/homebrew-mindwtr
scoop install mindwtr
```

### Installer (.msi or .exe)

1. Download the installer from [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch Mindwtr from the Start menu

### Portable

The `.exe` standalone can be run without installation (place in any folder).

---

## macOS

### Homebrew (Recommended)

Install using [Homebrew](https://brew.sh/):

```bash
brew tap dongdongbh/mindwtr
brew install --cask mindwtr
```

### Disk Image (.dmg)

1. Download the `.dmg` from [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases)
2. Open the disk image
3. Drag Mindwtr to your Applications folder
4. Launch from Applications or Spotlight

### Fixing "damaged" or "unidentified developer" Warning

Because the app is not notarized with Apple, macOS may block it. Fix with:

```bash
xattr -cr /Applications/Mindwtr.app
```

Then open the app normally.

Alternatively:
1. Right-click the app in Finder
2. Click "Open"
3. Click "Open" in the security dialog

---

## Data Location

After installation, your data is stored at:

| Platform    | Location                                          |
| ----------- | ------------------------------------------------- |
| **Linux**   | `~/.local/share/mindwtr/data.json`                |
| **Windows** | `%APPDATA%/mindwtr/data.json`                     |
| **macOS**   | `~/Library/Application Support/mindwtr/data.json` |

Config is stored separately:

| Platform    | Location                                       |
| ----------- | ---------------------------------------------- |
| **Linux**   | `~/.config/mindwtr/config.toml`                |
| **Windows** | `%APPDATA%/mindwtr/config.toml`                |
| **macOS**   | `~/Library/Application Support/mindwtr/config.toml` |

---

## Updating

1. Check for updates in Settings → About → Check for Updates
2. Download the new version from [Releases](https://github.com/dongdongbh/Mindwtr/releases)
3. Install over your existing installation

Your data is preserved between updates.

---

## Uninstalling

### Linux (Package Manager)
```bash
# AUR
yay -R mindwtr-bin

# Debian/Ubuntu
sudo dpkg -r mindwtr
```

### Windows
Use "Add or Remove Programs" in Windows Settings.

### macOS
Drag Mindwtr from Applications to Trash.

### Data Cleanup
To remove all data, delete both the config and data directories:
```bash
# Linux
rm -rf ~/.config/mindwtr
rm -rf ~/.local/share/mindwtr

# macOS
rm -rf ~/Library/Application\ Support/mindwtr

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:APPDATA\\mindwtr"
```

---

## Troubleshooting

### App Won't Start (Linux)

Ensure WebKitGTK is installed:
```bash
# Arch
sudo pacman -S webkit2gtk-4.1

# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-0
```

### Missing Icons

Install a complete icon theme:
```bash
sudo pacman -S papirus-icon-theme
```

### Blank Window

Try running with GPU disabled:
```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 mindwtr
```

---

## See Also

- [[Getting Started]]
- [[User Guide Desktop]]
- [[Data and Sync]]
