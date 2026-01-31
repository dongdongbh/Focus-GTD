#!/usr/bin/env bash
set -euo pipefail

ARCHS="${ARCHS:-arm64-v8a,armeabi-v7a}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/build}"
cd "$ROOT_DIR"

npx expo prebuild --clean --platform android

if grep -q "^reactNativeArchitectures=" android/gradle.properties; then
  sed -i "s/^reactNativeArchitectures=.*/reactNativeArchitectures=${ARCHS}/" android/gradle.properties
else
  echo "reactNativeArchitectures=${ARCHS}" >> android/gradle.properties
fi

if ! grep -q "splits {\\s*abi" android/app/build.gradle; then
  python3 - <<'PY'
from pathlib import Path

path = Path("android/app/build.gradle")
text = path.read_text()
marker = "defaultConfig {"
if marker in text:
    start = text.find(marker)
    end = text.find("\n    }\n", start)
    if end != -1:
        insert = """
    def reactNativeArchitectures = (findProperty('reactNativeArchitectures') ?: 'arm64-v8a')
        .split(',')
        .collect { it.trim() }
        .findAll { it }
    splits {
        abi {
            enable true
            reset()
            include(*reactNativeArchitectures)
            universalApk false
        }
    }
"""
        text = text[: end + 6] + insert + text[end + 6 :]
        path.write_text(text)
PY
fi

cd android
./gradlew assembleDebug -PreactNativeArchitectures="${ARCHS}"

APK_DIR="${ROOT_DIR}/android/app/build/outputs/apk/debug"
if [[ ! -d "$APK_DIR" ]]; then
  echo "APK output directory not found: $APK_DIR" >&2
  exit 1
fi

IFS=',' read -ra ARCH_LIST <<< "${ARCHS}"
mkdir -p "${OUTPUT_DIR}"
VERSION="$(node -e "console.log(require('../app.json').expo.version)")"

found=0
for arch in "${ARCH_LIST[@]}"; do
  arch_trimmed="$(echo "$arch" | xargs)"
  if [[ -z "$arch_trimmed" ]]; then
    continue
  fi
  apk_path="$(ls "$APK_DIR"/app-*${arch_trimmed}*-debug*.apk 2>/dev/null | head -1 || true)"
  if [[ -n "$apk_path" ]]; then
    out_name="mindwtr-${VERSION}-${arch_trimmed}-debug.apk"
    cp "$apk_path" "${OUTPUT_DIR}/${out_name}"
    echo "APK: ${OUTPUT_DIR}/${out_name}"
    found=1
  fi
done

if [[ "$found" -eq 0 ]]; then
  apk_path="$(ls "$APK_DIR"/app-debug*.apk 2>/dev/null | head -1 || true)"
  if [[ -z "$apk_path" ]]; then
    echo "No debug APKs found in ${APK_DIR}" >&2
    exit 1
  fi
  out_name="mindwtr-${VERSION}-debug.apk"
  cp "$apk_path" "${OUTPUT_DIR}/${out_name}"
  echo "APK: ${OUTPUT_DIR}/${out_name}"
fi
