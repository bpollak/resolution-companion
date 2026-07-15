#!/usr/bin/env bash
# Stitches Brett's four real-device iPhone screen recordings into one paced
# promo cut. Real app, real device, one coherent persona (5K-Ready Weekend
# Runner): onboarding -> daily check-off -> Journey/customization -> a full
# coach conversation.
#
# Each raw clip carries the iOS screen-record indicator (red dot) in the status
# bar and ends with Control Center pulled down (where Brett stopped recording).
# We CROP the status bar off (a black mask leaves a faint seam where the Coach
# modal's dark-gray header meets pure black) and trim the Control-Center tails.
# Slow stretches (AI streaming, typing) are speed-ramped; payoffs play near 1x.
#
# Output: out/iphone-screen.mp4 (portrait, phone screen only). Remotion frames it.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out seg

C1="takes/ScreenRecording_07-14-2026 17-39-13_1.MP4"   # onboarding + Today + Journey (114s)
C2="takes/ScreenRecording_07-14-2026 17-41-52_1.MP4"   # check-off -> Day complete (7.9s)
C3="takes/ScreenRecording_07-14-2026 17-44-12_1.MP4"   # Journey + edit milestone/action (19.5s)
C4="takes/ScreenRecording_07-14-2026 17-50-32_1.MP4"   # full weekly-review coach convo (84s)

SB=175   # status-bar height to crop off the top (kills the red record dot; title starts ~215px)

# seg <name> <src> <start> <end> <speed>
seg() {
  local name=$1 src=$2 start=$3 end=$4 speed=$5
  local dur; dur=$(echo "$end - $start" | bc)
  ffmpeg -v error -y -i "$src" \
    -vf "fps=30,trim=start=${start}:duration=${dur},setpts=(PTS-STARTPTS)/${speed},crop=iw:ih-${SB}:0:${SB},scale=1080:-2,setsar=1" \
    -an "seg/${name}.mp4"
  printf "  %-14s %5.1fs -> %4.1fs  (%sx)\n" "$name" "$dur" "$(echo "$dur/$speed"|bc -l)" "$speed"
}

echo "── onboarding (clip 1) ──"
seg i1a "$C1"   0.5  11.0  3.3   # Welcome carousel + Free vs Premium
seg i1b "$C1"  11.0  26.0  3.5   # first question + "run my first 5K" + send
seg i1c "$C1"  26.0  58.0  7.0   # coach replies + the second exchange (fast — it's streaming)
seg i1d "$C1"  58.0  68.0  2.6   # the final plan proposal -> Create My Plan
seg i1e "$C1"  68.0  77.0  3.3   # "Reading your goals..." -> "Designing your milestones..."
seg i1f "$C1"  77.0  87.0  2.4   # Today: BECOMING 5K-Ready Weekend Runner, 0/1

echo "── the daily loop (clip 2) ──"
seg i2a "$C2"   0.3   6.4  1.3   # tap Mark Complete -> 1/1 green ring -> "Day complete." (near 1x)

echo "── Journey + make it yours (clip 3) ──"
seg i3a "$C3"   0.3   7.0  2.8   # Journey 100% + calendar + milestone + day detail
seg i3b "$C3"   7.0  13.0  2.8   # Edit Milestone: target date, actions
seg i3c "$C3"  13.0  16.5  2.5   # Edit Action: frequency, 120-second kickstart
seg i3d "$C3"  16.5  18.5  1.6   # the persona description reveal

echo "── the coach (clip 4) ──"
seg i4a "$C4"   1.5   6.0  2.5   # Coach: 100% momentum -> open Weekly Review
seg i4b "$C4"   6.0  29.0  6.5   # the coach's question + first answer + reply (streaming)
seg i4c "$C4"  29.0  42.0  5.0   # the user's second answer (pace/breathing)
seg i4d "$C4"  42.0  58.0  4.0   # the coach's real coaching reply (90/10 run-walk)
seg i4e "$C4"  58.0  81.0  5.0   # "Good idea" -> final reply, ends on a complete question

SEGS=(i1a i1b i1c i1d i1e i1f i2a i3a i3b i3c i3d i4a i4b i4c i4d i4e)
: > seg/iphone.txt
for s in "${SEGS[@]}"; do echo "file '$s.mp4'" >> seg/iphone.txt; done

ffmpeg -v error -y -f concat -safe 0 -i seg/iphone.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/iphone-screen.mp4

echo ""
echo "out/iphone-screen.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/iphone-screen.mp4)s"
