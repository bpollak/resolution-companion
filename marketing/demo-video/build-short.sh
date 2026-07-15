#!/usr/bin/env bash
# The vertical short is NOT just the master reframed — it's a different edit.
# Only the beats that survive a thumb-stop: hook, the AI writing your plan,
# the check-off, the celebration, the no-guilt calendar, the coach. ~36s.
#
# Re-slices the already-cut master segments (seg/*.mp4). Accurate seek here too
# (`-ss` after `-i`) so each pull lands on the frame it names.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p seg out

s() { # s <out> <seg> <start> <dur> <speed>   frame-accurate window via trim
  ffmpeg -v error -y -i "seg/$2.mp4" \
    -vf "fps=30,trim=start=$3:duration=$4,setpts=(PTS-STARTPTS)/$5,scale=720:-2" -an "seg/s-$1.mp4"
}
s 1 a1-coldopen    0.5 3.5 1.0    # "Begin Your Evolution"
s 2 a4-coachopen   0.0 4.4 1.4    # the coach asks the question (full segment — 1.6s was too brief to read)
s 3 a5-answer1     1.0 4.5 1.4    # the user answers; it proposes real daily habits
s 4 a8-building    0.5 3.5 1.6    # "Designing your milestones..."
s 5 b3-checkoff    0.5 2.0 1.0    # the check-off (1x — this is the feel)
s 6 b4-milestone   0.5 5.5 1.4    # MILESTONE COMPLETE
s 7 b5-daycomplete 4.0 5.0 1.5    # "Day complete."
s 8 b7-journey     0.5 6.0 1.5    # the calendar: green, amber, red
s 9 b10-exchange   1.0 8.7 1.25   # the coach answers back — runs to the same "momentum?" sentence boundary the master ends on

for i in 1 2 3 4 5 6 7 8 9; do echo "file 's-$i.mp4'"; done > seg/short.txt
ffmpeg -v error -y -f concat -safe 0 -i seg/short.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/screen-short.mp4
echo "out/screen-short.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/screen-short.mp4)s"
