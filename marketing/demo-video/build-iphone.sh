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

# Speed rule (Brett's note): let the AI RESPONSES breathe so they're readable
# (~2.0-2.5x, plus a ~1s hold on the finished message); keep the USER TYPING
# quick (~4.5-6.5x). Payoff beats (check-off, day-complete) play near 1x.
echo "── onboarding (clip 1) ──"
seg i1a "$C1"   0.5  13.0  3.6   # welcome carousel + Free vs Premium + AI-consent
seg i1b "$C1"  13.5  21.0  2.2   # AI asks the first question (readable)
seg i1c "$C1"  21.0  27.5  4.5   # you type "run my first 5K" + send (quick)
seg i1d "$C1"  27.5  48.0  2.1   # AI's plan reply streams — the big one (readable + hold)
seg i1e "$C1"  48.0  68.0  6.5   # you type the strength-trainer answer (quick; long)
seg i1f "$C1"  69.0  74.5  2.1   # AI's "ready to build" reply (readable)
seg i1g "$C1"  74.5  91.0  3.4   # Create My Plan -> the plan-building animation

echo "── the daily loop (clip 2) ──"
seg i2a "$C2"   0.3   6.4  1.3   # tap Mark Complete -> 1/1 green ring -> "Day complete." (near 1x)

echo "── Journey + make it yours (clip 3) ──"
seg i3a "$C3"   0.3   7.0  3.0   # Journey 100% + calendar + milestone + day detail
seg i3b "$C3"   7.0  13.0  3.0   # Edit Milestone: target date, actions
seg i3c "$C3"  13.0  16.5  2.6   # Edit Action: frequency, 120-second kickstart
seg i3d "$C3"  16.5  18.5  1.8   # the persona description reveal

echo "── the coach (clip 4) ──"
seg i4a "$C4"   1.5   6.0  2.5   # Coach: 100% momentum -> open Weekly Review
seg i4b "$C4"   6.0  12.0  2.2   # AI asks for a win (readable)
seg i4c "$C4"  12.5  22.0  5.0   # you type the "weekend runs are tough" answer (quick)
seg i4d "$C4"  23.5  32.5  2.5   # AI reply: "what felt toughest?" (readable)
seg i4e "$C4"  32.5  45.5  6.0   # you type the pace/breathing answer (quick)
seg i4f "$C4"  45.5  58.5  2.0   # AI's real coaching reply — 90/10 run-walk (readable + hold)
seg i4g "$C4"  59.5  63.5  4.0   # you type "Good idea, I'll give that a try" (quick)
seg i4h "$C4"  63.5  74.0  2.2   # AI's final reply, ends on a complete question (readable)
seg i4i "$C4"  74.0  78.0  1.6   # rest on the finished conversation

SEGS=(i1a i1b i1c i1d i1e i1f i1g i2a i3a i3b i3c i3d i4a i4b i4c i4d i4e i4f i4g i4h i4i)
: > seg/iphone.txt
for s in "${SEGS[@]}"; do echo "file '$s.mp4'" >> seg/iphone.txt; done

ffmpeg -v error -y -f concat -safe 0 -i seg/iphone.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/iphone-screen.mp4

echo ""
echo "out/iphone-screen.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/iphone-screen.mp4)s"
