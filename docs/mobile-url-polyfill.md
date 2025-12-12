# Mobile URL Polyfill Documentation

## Overview

The mobile app requires a custom URL polyfill to work correctly in React Native's Hermes JavaScript engine. This document explains the implementation, common pitfalls, and troubleshooting steps.

## The Problem

React Native with Hermes has limited URL/URLSearchParams support:

1. **Missing methods** - `URLSearchParams.keys()`, `.entries()`, `.values()` may be missing
2. **No createObjectURL** - `URL.createObjectURL` doesn't exist in Hermes, causing crashes when libraries try to use it
3. **Expo Go timing** - Expo framework code runs before app code, so polyfills must be available immediately at bundle evaluation time

## The Solution

The polyfill is located at `apps/mobile/shims/url-polyfill.js` and provides:

1. **Complete inline implementations** of `FallbackURL` and `FallbackURLSearchParams`
2. **Safe stubs** for `createObjectURL` and `revokeObjectURL` that return empty strings instead of crashing
3. **Automatic detection** - Uses native implementations if they work correctly, falls back if not

### Key Design Decisions

```javascript
// Check if native URLSearchParams has .keys() method
const nativeURLSearchParamsWorks = (() => {
    try {
        if (NativeURLSearchParams) {
            const test = new NativeURLSearchParams('test=1');
            return typeof test.keys === 'function';
        }
        return false;
    } catch {
        return false;
    }
})();

// Use fallback if native lacks .keys()
const URLSearchParamsPoly = nativeURLSearchParamsWorks ? NativeURLSearchParams : FallbackURLSearchParams;
```

### createObjectURL Safety

```javascript
static createObjectURL() {
    console.warn('[Mindwtr] URL.createObjectURL called but not supported by shim.');
    return '';  // Return empty string instead of throwing
}
```

## ⚠️ Critical Pitfall: Don't Use External Packages!

**DO NOT** replace the inline implementations with external packages like:
- `react-native-url-polyfill`
- `whatwg-url-without-unicode`
- `url-polyfill`

### Why This Breaks Things

1. **Platform dependency** - `react-native-url-polyfill/auto` imports `Platform` from react-native, which isn't available when the polyfill loads early
2. **Timing issues** - External packages may have their own imports that run before URL is defined
3. **Expo Go limitation** - In Expo Go development mode, framework code loads before any user code, including Metro's `getModulesRunBeforeMainModule`

### What Happened (December 2024)

We attempted to "improve" the polyfill by using `react-native-url-polyfill` and `whatwg-url-without-unicode` packages. This caused:

- Expo Go crash: `TypeError: Cannot set property 'createObjectURL' of undefined`
- APK crash: `TypeError: searchParams.has is not a function`

The fix was to **restore the original inline implementations** that don't depend on any external packages.

## File Structure

```
apps/mobile/
├── shims/
│   ├── url-polyfill.js       # The polyfill (DO NOT MODIFY LIGHTLY)
│   └── url-polyfill.test.ts  # Tests for the polyfill
├── polyfills.js              # Main polyfill loader
├── metro.config.js           # Metro config with getModulesRunBeforeMainModule
└── index.js                  # App entry point
```

## Loading Order

1. Metro's `getModulesRunBeforeMainModule` loads `shims/url-polyfill.js`
2. `index.js` requires `polyfills.js` 
3. `polyfills.js` verifies URL is set and applies additional polyfills
4. `expo-router/entry` loads

## Testing

Run the polyfill tests:
```bash
cd apps/mobile
bun run test
```

The tests verify:
- URL and URLSearchParams exports are defined
- `createObjectURL` returns empty string (safety behavior)
- `revokeObjectURL` is callable
- `URLSearchParams` basic operations work

## Troubleshooting

### Expo Go crashes with URLSearchParams error

1. Check that `shims/url-polyfill.js` has the **inline** `FallbackURL` and `FallbackURLSearchParams` classes
2. Ensure no external URL polyfill packages are being imported
3. Restart Metro with cache clear: `bun start --clear`

### APK crashes on launch

1. Clear EAS build cache: `rm -rf /tmp/dd/eas-*`
2. Verify the polyfill is included in the build
3. Check `adb logcat` for specific JavaScript errors

### Console shows "URL.createObjectURL is not supported"

This is expected behavior - the warning means the safety stub is working correctly. Some libraries probe for `createObjectURL` support and handle the empty string return gracefully.

## Maintenance Guidelines

1. **Don't refactor to external packages** - The inline implementations are intentional
2. **Test in Expo Go first** - It's the strictest environment for catching polyfill issues
3. **Keep the fallback check** - Always check if native methods work before using them
4. **Document any changes** - Update this file if you modify the polyfill
