"""Blend each frame's sub-frames (motion blur) and encode an MP4 with Remotion's ffmpeg.
usage: python -I launch-video/rec/film-encode.py <clip-dir> <out.mp4> [fps]
"""
import glob
import os
import subprocess
import sys

from PIL import Image

clip, out = sys.argv[1], sys.argv[2]
fps = sys.argv[3] if len(sys.argv) > 3 else '30'
sub = sorted(glob.glob(os.path.join(clip, 'sub', '*.png')))
frames = {}
for p in sub:
    n = os.path.basename(p).split('_')[0]
    frames.setdefault(n, []).append(p)
blend_dir = os.path.join(clip, 'frames')
os.makedirs(blend_dir, exist_ok=True)
for i, (n, ps) in enumerate(sorted(frames.items())):
    acc = None
    for k, p in enumerate(ps):
        im = Image.open(p).convert('RGB')
        acc = im if acc is None else Image.blend(acc, im, 1 / (k + 1))
    acc.save(os.path.join(blend_dir, f'{i:05d}.png'))
ff = os.path.join(os.path.dirname(__file__), '..', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe')
subprocess.run([ff, '-v', 'error', '-y', '-framerate', fps, '-i', os.path.join(blend_dir, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out], check=True)
print('frames', len(frames), '->', out)
