#!/usr/bin/env bash
# The social (~28s) cut of the real-device promo — a punchier subset of the
# same four iPhone recordings: one onboarding exchange -> plan builds -> the
# daily check-off -> the coach's best coaching moment. Same crop/speed rules as
# build-iphone.sh (status bar cropped off, AI responses kept readable ~2x,
# typing quick). Output: out/iphone-screen-short.mp4.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out seg

C1="takes/ScreenRecording_07-14-2026 17-39-13_1.MP4"   # onboarding
C2="takes/ScreenRecording_07-14-2026 17-41-52_1.MP4"   # check-off -> Day complete
C4="takes/ScreenRecording_07-14-2026 17-50-32_1.MP4"   # coach conversation

SB=175

seg() {
  local name=$1 src=$2 start=$3 end=$4 speed=$5
  local dur; dur=$(echo "$end - $start" | bc)
  ffmpeg -v error -y -i "$src" \
    -vf "fps=30,trim=start=${start}:duration=${dur},setpts=(PTS-STARTPTS)/${speed},crop=iw:ih-${SB}:0:${SB},scale=1080:-2,setsar=1" \
    -an "seg/${name}.mp4"
  printf "  %-6s %5.1fs -> %4.1fs  (%sx)\n" "$name" "$dur" "$(echo "$dur/$speed"|bc -l)" "$speed"
}

echo "── social cut ──"
seg is1 "$C1"  13.5  21.0  3.0   # AI asks the first question (readable)
seg is2 "$C1"  21.0  27.0  5.0   # you type "run my first 5K" (quick)
seg is3 "$C1"  28.0  40.0  2.1   # AI's plan reply streams (readable)
seg is4 "$C1"  74.5  91.0  4.8   # Create My Plan -> the plan builds
seg is5 "$C2"   0.3   6.4  1.4   # check off -> 1/1 green -> "Day complete." (near 1x)
seg is6 "$C4"   1.5   6.0  3.0   # Coach -> open Weekly Review
seg is7 "$C4"  33.0  45.5  5.5   # you tell it what's hard (quick)
seg is8 "$C4"  45.5  58.5  2.1   # the coach's real coaching reply — 90/10 (readable)

SEGS=(is1 is2 is3 is4 is5 is6 is7 is8)
: > seg/iphone-short.txt
for s in "${SEGS[@]}"; do echo "file '$s.mp4'" >> seg/iphone-short.txt; done

ffmpeg -v error -y -f concat -safe 0 -i seg/iphone-short.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/iphone-screen-short.mp4

echo ""
echo "out/iphone-screen-short.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/iphone-screen-short.mp4)s"
