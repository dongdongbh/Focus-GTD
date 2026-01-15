# Mobile Installation

Detailed installation instructions for Android and iOS.

---

## Android

### Google Play (Closed Test)

We are running a closed test on Google Play. Joining helps us reach the 20‑tester requirement to publish publicly.

1. Join the Google Group: https://groups.google.com/g/mindwtr-alpha-testers
2. Install from Google Play:
   - Web link: https://play.google.com/apps/testing/tech.dongdongbh.mindwtr
   - Android link: https://play.google.com/store/apps/details?id=tech.dongdongbh.mindwtr

> **Important:** Keep the app installed for **14 days**. Updates are OK, but uninstalling resets the test window.

### Download APK

1. Go to [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases)
2. Download the latest arm64 APK (e.g., `mindwtr-0.4.3-arm64-v8a.apk` or `app-arm64-v8a-release.apk`)
3. Open the APK on your device

> **Note:** Releases include ABI-split APKs. Most modern Android devices are **arm64-v8a**.

### Install from Unknown Sources

If prompted, enable installation from unknown sources:

1. Go to **Settings → Security** (or **Settings → Apps → Special access**)
2. Enable **Install unknown apps** for your browser or file manager
3. Return to the APK and install

### Verify Installation

After installation:
1. Open Mindwtr from your app drawer
2. Grant any requested permissions
3. Start capturing tasks!

---

## iOS

### Current Status

iOS builds currently require an Apple Developer account ($99/year). Pre-built releases are not available on the App Store.

### Options

1. **Simulator builds** — Available in the source code for development
2. **Self-build** — Build and sign the app yourself with Xcode
3. **TestFlight** — May be available in the future

### Building for iOS (Developers)

```bash
# Clone repo
git clone https://github.com/dongdongbh/Mindwtr.git
cd Mindwtr

# Install dependencies
bun install

# Run on iOS Simulator
bun mobile:ios

# Or open in Xcode for device builds
cd apps/mobile
npx expo prebuild --platform ios
open ios/*.xcworkspace
```

---

## Data Location

Mobile data is stored in the app's internal storage using AsyncStorage.

---

## Updating

### Android

1. Download the new APK from [Releases](https://github.com/dongdongbh/Mindwtr/releases)
2. Install over the existing app
3. Your data is preserved

> **Tip:** In the app, go to **Settings → About → Check for Updates** to see if a new version is available.

---

## Uninstalling

### Android

1. Long-press the Mindwtr icon
2. Select **Uninstall** or drag to the trash

### Data Cleanup

Uninstalling removes all local data. If you want to preserve your data:
1. Export a backup first (**Settings → Data & Sync → Export Backup**)
2. Save the exported file
3. Uninstall the app

---

## Troubleshooting

### App Crashes on Startup

Try clearing app data:
1. Go to **Settings → Apps → Mindwtr**
2. Tap **Storage → Clear Data**
3. Reopen the app

> **Note:** This will delete all local data. Restore from sync or backup.

### Sync Not Working

See [[Data and Sync]] for sync troubleshooting.

### APK Won't Install

- Ensure you have enough storage space
- Enable installation from unknown sources
- Try downloading the APK again (may have been corrupted)

---

## See Also

- [[Getting Started]]
- [[User Guide Mobile]]
- [[Data and Sync]]
