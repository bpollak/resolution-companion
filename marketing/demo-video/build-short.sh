#!/usr/bin/env bash
# The vertical short is NOT just the master reframed — it's a different edit.
# Only the beats that survive a thumb-stop: hook, the AI writing your plan,
# the check-off, the celebration, the no-guilt calendar, the coach. ~36s.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p seg out

s() { # s <out> <seg> <start> <dur> <speed>
  ffmpeg -v error -y -ss "$3" -t "$4" -i "seg/$2.mp4" \
    -vf "setpts=PTS/$5,fps=30,scale=720:-2" -an "seg/s-$1.mp4"
}
s 1 a1-coldopen    0.5 3.5 1.0    # "Begin Your Evolution"
s 2 a4-coachopen   2.0 7.0 1.8    # the coach asks the question
s 3 a6-coachreply  0.5 5.0 1.4    # it proposes real daily habits
s 4 a8-building    0.5 6.5 1.6    # "Shaping who you're becoming..."
s 5 b3-checkoff    0.5 4.0 1.0    # the check-off (1x — this is the feel)
s 6 b4-milestone   1.0 6.0 1.4    # MILESTONE COMPLETE
s 7 b5-daycomplete 2.0 8.0 1.5    # "Day complete."
s 8 b7-journey     1.0 6.0 1.5    # the calendar: green, amber, red
s 9 b9-coach       3.0 9.0 1.6    # the coach quotes your real numbers

for i in 1 2 3 4 5 6 7 8 9; do echo "file 's-$i.mp4'"; done > seg/short.txt
ffmpeg -v error -y -f concat -safe 0 -i seg/short.txt -c:v libx264 -crf 18 -preset slow \
  -pix_fmt yuv420p out/screen-short.mp4
echo "out/screen-short.mp4  $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/screen-short.mp4)s"
