#!/usr/bin/env bash
# Cuts the raw takes into one paced screen recording.
#
# The raw takes are ~5 minutes of real-time app usage. Most of that is the
# app thinking (the AI streams at 30ms/char, the plan builds over ~16s of
# rotating status lines). Those moments are the *product*, so we don't cut
# them — we speed-ramp them, and play the payoff beats at 1x.
#
# SEEK IS ACCURATE, NOT FAST. Earlier cuts used `-ss` before `-i` (fast
# keyframe seek); on these sparse-keyframe recordings that drifted each
# segment to a *different* nearby keyframe — up to ~13s off — which is what
# made the onboarding jump backward in time. `-ss` now comes AFTER `-i`, so
# every start time is the frame it says it is. Slower to encode; correct.
#
# Output: out/screen.mp4 (portrait, the phone screen only). Remotion frames it.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out seg

OB=takes/onboarding.mov
TOUR=takes/tour.mov
COACH=takes/coach3.mov   # a COMPLETE weekly-review exchange: ask -> answer -> reply

# seg <name> <src> <start> <end> <speed>   speed >1 = faster.
# The `trim` filter selects the source window on the DECODED stream, so it's
# frame-accurate regardless of keyframe spacing (unlike `-ss`). setpts rebases
# to zero and applies the speed ramp; output = (end-start)/speed seconds.
seg() {
  local name=$1 src=$2 start=$3 end=$4 speed=$5
  local dur
  dur=$(echo "$end - $start" | bc)
  # fps=30 FIRST normalizes the variable-frame-rate capture to CFR, so the
  # time-based trim and the speed ramp are both exact.
  ffmpeg -v error -y -i "$src" \
    -vf "fps=30,trim=start=${start}:duration=${dur},setpts=(PTS-STARTPTS)/${speed},scale=720:-2" -an \
    "seg/${name}.mp4"
  printf "  %-22s %5.1fs -> %4.1fs  (%sx)\n" "$name" "$dur" \
    "$(echo "$dur / $speed" | bc -l)" "$speed"
}

# ── Onboarding (roughly halved, forward-only) ──────────────────────────────
# One question, one answer, one live reply — then the plan builds. The second
# Q&A that used to live here was redundant and doubled the runtime.
echo "── onboarding ──"
seg a1-coldopen    "$OB"    35.0  39.5  1.0   # "Begin Your Evolution"
seg a2-carousel    "$OB"    45.5  56.5  3.3   # welcome -> quick chat -> free vs premium
seg a3-consent     "$OB"    57.5  60.5  1.6   # "AI Coaching & Your Data" — a trust asset
seg a4-coachopen   "$OB"    64.5  71.0  1.5   # the coach asks the first question (streams)
seg a5-answer1     "$OB"    72.5  90.0  3.0   # user answers; coach proposes a plan (ONE take — no jump)
seg a7-planready   "$OB"   121.0 128.0  1.7   # "Your plan is ready to build" -> Create My Plan
seg a8-building    "$OB"   137.0 149.5  3.0   # Create My Plan -> "Reading your goals..." -> "Designing your milestones..." (stop before Today lands: fresh persona name differs from the tour's)

# ── The daily loop ─────────────────────────────────────────────────────────
echo "── the daily loop ──"
seg b1-today       "$TOUR"  31.5  35.5  1.0   # Becoming / Consistent Builder / last-week card
seg b2-scroll      "$TOUR"  35.5  38.5  2.0   # down to today's actions
seg b3-checkoff    "$TOUR"  38.5  41.0  1.0   # tap -> "A vote for Consistent Builder ✓" (1x)
seg b4-milestone   "$TOUR"  42.5  53.5  1.7   # MILESTONE COMPLETE: "not a plan anymore, it's a habit"
seg b5-daycomplete "$TOUR"  56.5  70.0  1.5   # check off the 2nd action -> 2/2 green ring -> "Day complete."
seg b6-note        "$TOUR"  71.0  78.0  2.0   # "How did it go?" -> the coach reads these
seg b7-journey     "$TOUR"  80.0  90.0  1.6   # the calendar: green run, one amber, one red
seg b8-milestones  "$TOUR"  91.0 101.0  1.7   # day detail -> 21/21 "Complete — habit locked in"
seg b9-coachhome   "$TOUR" 101.0 105.8  1.6   # Coach: 100% momentum + the weekly-review card (END before 106.0 — that's when the tour's own review sheet opens, whose greeting differs from the coach take's)

# ── The coach, finished ────────────────────────────────────────────────────
# A whole exchange this time: the coach asks, the user answers, and the coach
# gives a specific, personal reply. (From a separate take; the tour's own
# weekly-review only reached the question.)
echo "── the coach ──"
seg b10-exchange   "$COACH"  44.5  58.0  1.4   # answer sent -> reply streams -> ends as "...next week's momentum?" completes. The raw take stops mid-sentence later, so the cut must end on THIS boundary; the end card fades in over it.

SEGS=(a1-coldopen a2-carousel a3-consent a4-coachopen a5-answer1 a7-planready a8-building \
      b1-today b2-scroll b3-checkoff b4-milestone b5-daycomplete b6-note b7-journey \
      b8-milestones b9-coachhome b10-exchange)

: > seg/list.txt
for s in "${SEGS[@]}"; do echo "file '$s.mp4'" >> seg/list.txt; done

ffmpeg -v error -y -f concat -safe 0 -i seg/list.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/screen.mp4

echo ""
echo "out/screen.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/screen.mp4)s"
