# Website feature-demo video

Real simulator footage of the current build, composited into a 16:9 cut
with captions and tap indicators. Waits (AI replies, typing) are sped up
and badged "Sped up" in the video.

1. Install a simulator build (`npm run build:local:sim`) on the booted sim.
2. `./record-take.sh 01-onboarding.yaml ../../build/demo-video/take01`
   (fresh install, live AI onboarding; note the persona name Coach picks).
3. `DEMO_PERSONA="<that name>" ./seed.sh`, then
   `./record-take.sh 02-daily-use.yaml ../../build/demo-video/take02`.
4. Re-time each take: `ffmpeg -i takeNN/screen.mp4 -vf fps=60 ... takeNN/cfr60.mp4`.
5. `python3 build_video.py` writes `build/demo-video/resolution-companion-demo.mp4`.

AI replies differ per take, so after re-recording, check the segment times
in `build_video.py` against the new take (tap times print from maestro.log).
