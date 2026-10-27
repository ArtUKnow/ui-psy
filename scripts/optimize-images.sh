#!/bin/sh
# Converts source PNGs in assets-src/ to WebP in public/ at display-sized widths (≈2x CSS size).
set -eu
cd "$(dirname "$0")/.."
convert() { # source target max_width
  w=$(sips -g pixelWidth "$1" | awk '/pixelWidth/{print $2}')
  mkdir -p "$(dirname "$2")"
  if [ "$w" -gt "$3" ]; then cwebp -quiet -q 82 -alpha_q 90 -m 6 -resize "$3" 0 "$1" -o "$2"; else cwebp -quiet -q 82 -alpha_q 90 -m 6 "$1" -o "$2"; fi
}
for f in assets-src/illustrations/*.png; do convert "$f" "public/illustrations/$(basename "$f" .png).webp" 640; done
for f in assets-src/landing/screens/*.png; do convert "$f" "public/landing/screens/$(basename "$f" .png).webp" 780; done
convert assets-src/landing/doctor-psychiatrist.png public/landing/doctor-psychiatrist.webp 800
