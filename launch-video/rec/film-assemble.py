"""Assemble the trailer: hook clip + caption, whip transition, race frames, end card, audio.
usage: python -I launch-video/rec/film-assemble.py
Writes launch-video/out/ekpoma-race.mp4 (with the phonk) and ekpoma-race-nomusic.mp4 (same cut, song muted).
"""
import glob
import os
import shutil
import subprocess
import wave

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
LV = os.path.join(ROOT, 'launch-video')
FF = os.path.join(LV, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe')
DL = os.path.join(os.path.expanduser('~'), 'Downloads')
HOOK = os.path.join(DL, 'HYPERSPEED CAMERAMAN🤯🎥But honestly, what really went HYPERSPEED was this flawless installation.mp4')
PHONK = os.path.join(DL, 'VID_20261118_025459_438.mp4')  # the owner's reference: "X-COOL! (Ultra Slowed)"
BODY = os.path.join(LV, 'clips', 'race-body', 'frames')
WORK = os.path.join(LV, 'clips', 'assemble')
OUT = os.path.join(LV, 'out')
W, H, FPS = 1080, 1920, 30
HOOK_SECS = 4.9  # up to the F1 clip's own whip blur
END_SECS = 3.0

F = lambda s: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', s)
EMOJI = lambda s: ImageFont.truetype('C:/Windows/Fonts/seguiemj.ttf', s)


def run(*a):
    subprocess.run([FF, '-v', 'error', '-y', *a], check=True)


shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(os.path.join(WORK, 'hook'))
os.makedirs(os.path.join(WORK, 'seq'))
os.makedirs(OUT, exist_ok=True)

# 1. Hook frames, our caption over theirs (their burned-in "Hyperspeed Cameraman" sits ~20% down)
run('-i', HOOK, '-t', str(HOOK_SECS), '-r', str(FPS), '-s', f'{W}x{H}', os.path.join(WORK, 'hook', '%05d.png'))


def caption(img, text, emoji):
    d = ImageDraw.Draw(img)
    font = F(54)
    tw = d.textlength(text, font=font)
    ew = 58
    x = (W - tw - ew - 14) / 2
    y = 492  # over their own burned-in "Hyperspeed Cameraman" line
    d.rounded_rectangle([x - 28, y - 22, x + tw + ew + 40, y + 80], radius=24, fill=(10, 12, 16))
    d.text((x, y), text, font=font, fill='white')
    d.text((x + tw + 14, y - 2), emoji, font=EMOJI(52), embedded_color=True)


hook = sorted(glob.glob(os.path.join(WORK, 'hook', '*.png')))
body = sorted(glob.glob(os.path.join(BODY, '*.png')))
seq = []
for p in hook:
    im = Image.open(p).convert('RGB')
    caption(im, 'F1 cameramen are built different', '🎥')
    seq.append(im)


# 2. Whip into our race: the first frames smeared sideways, clearing as the pan lands
def smear(im, amount):
    if amount <= 0:
        return im
    small = im.resize((max(8, int(W / (1 + amount * 40))), H), Image.BILINEAR)
    return small.resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(amount * 2))


last_hook = seq[-1]
for i in range(4):
    seq[-4 + i] = smear(seq[-4 + i], (i + 1) / 4)
for i, p in enumerate(body):
    im = Image.open(p).convert('RGB')
    if i < 6:
        im = smear(im, 1 - i / 6)
    seq.append(im)

# 3. End card: fades up over the last race frame
logo = Image.open(os.path.join(ROOT, 'public', 'icon-512.png')).convert('RGBA').resize((360, 360))
card = Image.new('RGB', (W, H), (8, 14, 32))
cd = ImageDraw.Draw(card)
for y in range(H):
    k = y / H
    cd.line([(0, y), (W, y)], fill=(int(8 + 10 * k), int(14 + 30 * k), int(32 + 70 * k)))
card.paste(logo, ((W - 360) // 2, 520), logo)
for text, size, y, col in [('EKPOMA LIFE', 120, 930, 'white'), ('ekpomalife.app', 78, 1080, (124, 196, 255)), ('PLAY FREE', 60, 1210, (255, 214, 102))]:
    tw = cd.textlength(text, font=F(size))
    cd.text(((W - tw) / 2, y), text, font=F(size), fill=col)
credits = 'Truck: Nez1x75 · Benz GLA: tonielpro520 (Sketchfab, CC BY 4.0) · Map © OpenStreetMap contributors'
f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 26)
tw = cd.textlength(credits, font=f)
cd.text(((W - tw) / 2, 1780), credits, font=f, fill=(170, 182, 200))
last = seq[-1]
for i in range(int(END_SECS * FPS)):
    a = min(1, i / 12)
    seq.append(Image.blend(last, card, a) if a < 1 else card)

for i, im in enumerate(seq):
    im.save(os.path.join(WORK, 'seq', f'{i:05d}.png'))
total = len(seq) / FPS
print('frames', len(seq), f'{total:.2f}s')

# 4. Audio: the hook's own sound, then the phonk from where its car chase starts, uncut
run('-i', HOOK, '-t', str(HOOK_SECS), '-ac', '2', '-ar', '44100', os.path.join(WORK, 'a_hook.wav'))
run('-i', PHONK, '-t', f'{total - HOOK_SECS:.3f}', '-ac', '2', '-ar', '44100', os.path.join(WORK, 'a_phonk.wav'))


def join(parts, out, mute_second=False):
    with wave.open(out, 'wb') as w:
        for i, p in enumerate(parts):
            with wave.open(p) as r:
                if i == 0:
                    w.setparams(r.getparams())
                data = r.readframes(r.getnframes())
                w.writeframes(bytes(len(data)) if (mute_second and i == 1) else data)


join([os.path.join(WORK, 'a_hook.wav'), os.path.join(WORK, 'a_phonk.wav')], os.path.join(WORK, 'audio.wav'))
join([os.path.join(WORK, 'a_hook.wav'), os.path.join(WORK, 'a_phonk.wav')], os.path.join(WORK, 'audio-nomusic.wav'), mute_second=True)

for name, audio in [('ekpoma-race.mp4', 'audio.wav'), ('ekpoma-race-nomusic.mp4', 'audio-nomusic.wav')]:
    run('-framerate', str(FPS), '-i', os.path.join(WORK, 'seq', '%05d.png'), '-i', os.path.join(WORK, audio),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-shortest', os.path.join(OUT, name))
    print('wrote', os.path.join(OUT, name))
