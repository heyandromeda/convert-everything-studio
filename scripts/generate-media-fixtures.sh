#!/usr/bin/env bash
# Small audio/video fixtures generated with the system ffmpeg CLI.
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" -ac 2 tone.wav
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=320x240:rate=24:duration=2" -f lavfi -i "sine=frequency=660:duration=2" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart clip.mp4
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=320x240:rate=24:duration=2" -c:v libx264 -pix_fmt yuv420p -f mov clip.mov

ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=320x240:rate=24:duration=2" -f lavfi -i "sine=frequency=500:duration=2" -ac 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest stereo.mp4
echo "media fixtures written"
