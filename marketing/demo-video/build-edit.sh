#!/usr/bin/env bash
# Cuts the two raw takes into one paced screen recording.
#
# The raw takes are ~5 minutes of real-time app usage. Most of that is the
# app thinking (the AI streams at 30ms/char, the plan builds over ~16s of
# rotating status lines). Those moments are the *product*, so we don't cut
# them — we speed-ramp them, and play the payoff beats at 1x.
#
# Output: out/screen.mp4 (portrait, the phone screen only). Remotion frames it.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out seg

OB=takes/onboarding.mov
TOUR=takes/tour.mov

# seg <name> <src> <start> <end> <speed>   speed >1 = faster
seg() {
  local name=$1 src=$2 start=$3 end=$4 speed=$5
  local dur
  dur=$(echo "$end - $start" | bc)
  ffmpeg -v error -y -ss "$start" -t "$dur" -i "$src" \
    -vf "setpts=PTS/${speed},fps=30,scale=720:-2" -an \
    "seg/${name}.mp4"
  printf "  %-22s %5.1fs -> %4.1fs  (%sx)\n" "$name" "$dur" \
    "$(echo "$dur / $speed" | bc -l)" "$speed"
}

echo "── onboarding ──"
seg a1-coldopen    "$OB"    33.0  38.5  1.0   # "Begin Your Evolution" (33.0 clears the white launch flash)
seg a2-carousel    "$OB"    37.5  46.0  2.5   # what it is / start with a chat / free vs premium
seg a3-consent     "$OB"    55.0  59.0  2.0   # AI consent — a trust asset, show it
seg a4-coachopen   "$OB"    62.0  69.0  1.0   # the coach asks the first question (streams)
seg a5-answer1     "$OB"    70.0  77.0  1.75  # user types the goal, sends
seg a6-coachreply  "$OB"    79.0  95.0  3.0   # coach proposes two daily habits
seg a7-planready   "$OB"   118.0 127.0  1.5   # "Your plan is ready to build" -> Create My Plan
seg a8-building    "$OB"   131.0 150.0  3.0   # "Reading your goals..." -> "Designing your milestones..."

echo "── the daily loop ──"
seg b1-today       "$TOUR"  32.0  37.5  1.0   # Becoming / Consistent Builder (31.0 clears the launch splash)
seg b2-scroll      "$TOUR"  36.0  38.0  2.0   # down to today's actions
seg b3-checkoff    "$TOUR"  38.0  41.0  1.0   # tap -> glow -> collapse (play this at 1x)
seg b4-milestone   "$TOUR"  41.0  50.0  1.5   # MILESTONE COMPLETE: "not a plan anymore, it's a habit"
seg b5-daycomplete "$TOUR"  56.0  66.0  1.2   # 2/2, green ring, burst dots, "Day complete."
seg b6-note        "$TOUR"  68.0  74.0  2.0   # "How did it go?" -> the coach reads these
seg b7-journey     "$TOUR"  78.0  88.0  1.5   # the calendar: green run, one amber, one red
seg b8-milestones  "$TOUR"  88.0  94.0  1.2   # 21/21 "Complete — habit locked in"
seg b9-coach       "$TOUR" 105.0 122.0  2.2   # weekly review; the coach quotes the real numbers

for s in a1-coldopen a2-carousel a3-consent a4-coachopen a5-answer1 a6-coachreply \
         a7-planready a8-building b1-today b2-scroll b3-checkoff b4-milestone \
         b5-daycomplete b6-note b7-journey b8-milestones b9-coach; do
  echo "file '$s.mp4'"
done > seg/list.txt

ffmpeg -v error -y -f concat -safe 0 -i seg/list.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/screen.mp4

echo ""
echo "out/screen.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/screen.mp4)s"
