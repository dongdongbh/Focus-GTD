# Mindwtr Mobile

React Native mobile app for the Mindwtr productivity system.

## Features

### GTD Workflow
- **Inbox Processing** - Guided clarify workflow with 2-minute rule
- **Context Filtering** - Filter tasks by @home, @work, @errands, etc.
- **Dark Mode** - Full dark theme support with system preference
- **Swipe Actions** - Quick task management gestures (Swipes Right for Done on Inbox)
- **Smart Tags** - Frequent and recommended context tags
- **Quick Status** - Instant status change via status badge tap

### Screens
| Screen        | Description                        |
| ------------- | ---------------------------------- |
| Inbox         | Capture and process incoming items |
| Next Actions  | Context-filtered actionable tasks  |
| Agenda        | Time-based view                    |
| Review        | Task review and status changes     |
| Projects      | Multi-step outcomes (drawer)       |
| Contexts      | Filter by location/tool (drawer)   |
| Waiting For   | Delegated items (drawer)           |
| Someday/Maybe | Deferred ideas (drawer)            |
| Settings      | Theme preferences                  |

## Tech Stack

- React Native + Expo SDK 54
- TypeScript
- Zustand (shared with desktop via @mindwtr/core)
- Expo Router (file-based navigation)

## Quick Start

```bash
# From monorepo root
bun install

# Start Expo dev server
bun mobile:start

# Run on Android
bun mobile:android

# Run on iOS
bun mobile:ios
```

## Prerequisites

- Node.js
- Bun package manager
- Expo Go app (for device testing) OR
- Android Studio (for emulator) OR
- Xcode (for iOS Simulator)

## Building APK Locally

To build an Android APK locally (without using Expo cloud builds):

### 1. Install Java JDK

```bash
# Arch Linux
sudo pacman -S jdk17-openjdk

# Set JAVA_HOME (add to ~/.zshrc for persistence)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
```

### 2. Install Android SDK

```bash
# Create SDK directory
mkdir -p ~/Android/Sdk/cmdline-tools

# Download command-line tools from:
# https://developer.android.com/studio#command-line-tools-only
# Extract to ~/Android/Sdk/cmdline-tools/latest/

# Set environment variables (add to ~/.zshrc)
export ANDROID_HOME=~/Android/Sdk
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# Install SDK components
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"
```

### 3. Build APK

```bash
# From monorepo root, ensure lockfile is synced
bun install

# Build APK (from apps/mobile directory)
cd apps/mobile
npx eas-cli build --platform android --profile preview --local --output mindwtr-v0.2.3.apk
```

The APK will be saved to `apps/mobile/mindwtr-v0.2.3.apk`.

## Android Environment

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

## Running on Device

### Expo Go (Recommended)
1. Install Expo Go on your phone
2. Run `bun mobile:start`
3. Scan QR code with camera (iOS) or Expo Go (Android)

### Android Emulator
```bash
# List available emulators
emulator -list-avds

# Start emulator
emulator -avd Pixel_API_34 &

# Run app
bun mobile:android
```

## Data Storage

Tasks are stored in AsyncStorage and synced via the shared @mindwtr/core package.

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation
│   ├── _layout.tsx        # Root layout
│   └── settings.tsx       # Settings page
├── components/            # React components
├── contexts/              # React contexts (theme, language)
├── lib/                   # Utilities
│   ├── storage-adapter.ts # AsyncStorage integration
│   └── storage-file.ts    # File operations for sync
├── global.css             # NativeWind entry CSS
├── tailwind.config.js     # Tailwind configuration
├── metro.config.js        # Metro bundler config
├── babel.config.js        # Babel config with NativeWind
└── nativewind-env.d.ts    # TypeScript declarations
```

## NativeWind (Tailwind CSS)

The mobile app uses NativeWind v4 for Tailwind CSS styling.

### Configuration Files

| File                  | Purpose                               |
| --------------------- | ------------------------------------- |
| `tailwind.config.js`  | Tailwind theme and NativeWind preset  |
| `global.css`          | Tailwind directives entry point       |
| `babel.config.js`     | NativeWind babel preset               |
| `metro.config.js`     | CSS processing with `withNativeWind`  |
| `nativewind-env.d.ts` | TypeScript types for `className` prop |

## Data & Sync

### Local Storage
Data is stored in AsyncStorage and automatically synced with the shared Zustand store.

### File Sync
Configure a sync folder in Settings to sync via:
- Dropbox
- Syncthing
- Any folder-based sync service

## Troubleshooting

### Metro Cache Issues

```bash
# Clear cache and restart
bun start --clear

# Or manually clear
rm -rf .expo node_modules/.cache
```

### NativeWind Not Working

1. Ensure `global.css` is imported in `app/_layout.tsx`
2. Check `babel.config.js` has NativeWind preset
3. Restart Metro with cache clear

### Build Errors

```bash
# Reinstall dependencies
cd /path/to/Focus-GTD
rm -rf node_modules apps/mobile/node_modules
bun install
```

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [React Native](https://reactnative.dev/)
