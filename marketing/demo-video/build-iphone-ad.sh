#!/usr/bin/env bash
# A tight ~12s screen cut for a paid Meta ad: hook fast, show the loop, end on
# the coach. Same crop/speed approach as build-iphone.sh. Remotion frames it
# with bold captions + an App Store end card (~15s total). Output:
# out/iphone-screen-ad.mp4
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
  printf "  %-8s %5.1fs -> %4.1fs  (%sx)\n" "$name" "$dur" "$(echo "$dur/$speed"|bc -l)" "$speed"
}

echo "── ad cut ──"
seg adA "$C1"  28.0  34.0  2.0   # the AI coach conversation (hook)
seg adB "$C1"  72.0  78.0  2.8   # your plan, ready to build
seg adC "$C2"   1.0   6.4  2.2   # check off -> Day complete
seg adD "$C4"  46.0  58.5  2.8   # the coach adapts your plan (90/10)

SEGS=(adA adB adC adD)
: > seg/iphone-ad.txt
for s in "${SEGS[@]}"; do echo "file '$s.mp4'" >> seg/iphone-ad.txt; done

ffmpeg -v error -y -f concat -safe 0 -i seg/iphone-ad.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/iphone-screen-ad.mp4

echo ""
echo "cumulative starts:"
t=0
for s in "${SEGS[@]}"; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 seg/$s.mp4)
  printf "  %-8s @ %5.2fs\n" "$s" "$t"; t=$(echo "$t + $d"|bc)
done
echo "out/iphone-screen-ad.mp4  ${t}s"