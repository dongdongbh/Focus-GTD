#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <base64_or_compat_payload> <output_path>" >&2
  exit 1
fi

input="$1"
output="$2"

if ! printf '%s' "$input" | tr -d '\r' | base64 --decode > "$output" 2>/dev/null; then
  printf '%s' "$input" | tr -d '\r' | base64 -D > "$output"
fi
