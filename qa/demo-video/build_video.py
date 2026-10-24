#!/usr/bin/env python3
"""Compose the website feature-demo video from the two simulator takes.

Inputs (build/demo-video/, gitignored), made by record-take.sh:
  takeNN/cfr60.mp4   screen recording re-timed to constant 60 fps
  takeNN/start_ms    wall clock when recording started
  takeNN/debug/...   Maestro log, the source of tap times and points

Output: build/demo-video/resolution-companion-demo.mp4 (1920x1080, 30 fps).
Every frame is real app footage; waits are sped up.
"""
import datetime
import glob
import os
import re
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build/demo-video"
OUT = WORK / "resolution-companion-demo.mp4"
ICON = ROOT / "assets/images/icon.png"
SF = "/System/Library/Fonts/SFNS.ttf"

W, H, FPS = 1920, 1080, 30
# The app is dark, so a dark backdrop swallows the phone. "light" (default)
# matches the website's paper sections; "ocean" is a deep teal alternative.
THEMES = {
    "light": dict(top=(246, 248, 250), bottom=(224, 236, 240), glow=(0, 122, 145), glow_k=-0.06,
                  head=(23, 28, 33), sub=(82, 96, 107), tag=(0, 122, 145), link=(0, 122, 145),
                  shadow=70, bezel=(70, 75, 82), bezel_in=(30, 32, 36)),
    "ocean": dict(top=(10, 70, 88), bottom=(4, 32, 44), glow=(0, 217, 255), glow_k=0.10,
                  head=(245, 248, 250), sub=(178, 206, 214), tag=(0, 217, 255), link=(0, 217, 255),
                  shadow=150, bezel=(120, 128, 136), bezel_in=(26, 28, 31)),
}
T = THEMES[os.environ.get("DEMO_THEME", "light")]
# Device points of the recorded iPhone 17 Pro, for mapping Maestro taps
PTS_W, PTS_H = 402, 874
SCR_H = 940
SCR_W = round(SCR_H * 1206 / 2622)
SCR_R = round(55 / PTS_W * SCR_W)  # display corner radius
BEZEL = 14
PHONE_CX, PHONE_CY = 1350, 540
SX, SY = PHONE_CX - SCR_W // 2, PHONE_CY - SCR_H // 2


def font(size, weight="Regular"):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_name(weight)
    return f


CAPTIONS = {
    "A": ("SET UP", "Make a plan with the coach",
          "Tap Make my plan. Chat with the AI coach, or set it up yourself."),
    "B": ("SET UP", "See what’s shared before you chat",
          "The app explains what it sends to the AI coach. You agree before it starts."),
    "C": ("SET UP", "Type what you want to work on",
          "Use your own words, or pick an example."),
    "D": ("SET UP", "The coach suggests a small daily habit",
          "Each habit has a shorter version for busy days."),
    "E": ("SET UP", "Check the plan before you start",
          "Change the goal, the habit or the days. One habit is enough to start."),
    "F": ("REMINDERS", "Turn on a daily reminder",
          "It stays quiet on days you’ve already checked in."),
    "G": ("MILESTONES", "See when you reach a milestone",
          "Here, 21 planned days are done. The app suggests a next step."),
    "H": ("TODAY", "Get a note when something is working",
          "The coach looks at your history. Rest days you’ve earned keep your streak going."),
    "I": ("TODAY", "Check off a habit, or its short version",
          "On a busy day, the 2-minute version still counts."),
    "J": ("TODAY", "Add a quick note",
          "Write down how it went. The coach can read your notes."),
    "K": ("JOURNEY", "See your progress",
          "A calendar of the days you checked in, your streak, and how close you are to each milestone."),
    "L": ("NEW IN 1.6", "Set a reminder time for each habit",
          "You only get a reminder if that habit isn’t done yet."),
    "M": ("COACH", "Look back on your week with the coach",
          "It uses what you actually did. Talk through one thing that went well and one that didn’t."),
}

# (take, src_start, src_end, speed, caption). Ranges within a take are
# contiguous so the cuts never jump; only the playback rate changes.
SEGMENTS = [
    ("title", 3.0),
    ("what", 5.5),
    ("who", 5.0),
    ("how", 5.0),
    ("bridge", 2.0),
    ("take01", 17.6, 24.6, 1.0, "A"),
    ("take01", 24.6, 32.8, 1.4, "B"),
    ("take01", 32.8, 43.7, 1.6, "C"),
    ("take01", 43.7, 57.3, 1.8, "D"),
    ("take01", 57.3, 68.6, 1.25, "E"),
    ("take01", 68.6, 75.8, 1.0, "F"),
    ("later", 1.8),
    ("take02", 9.3, 16.8, 1.0, "G"),
    ("take02", 16.8, 24.9, 1.6, "H"),
    ("take02", 24.9, 38.5, 1.0, "I"),
    ("take02", 38.5, 49.0, 1.4, "J"),
    ("take02", 49.0, 61.0, 1.15, "K"),
    ("take02", 61.0, 82.9, 1.5, "L"),
    ("take02", 82.9, 96.5, 1.6, "M"),
    ("take02", 96.5, 98.5, 1.0, "M"),  # beat to see the finished reply
    ("recap", 7.0),
    ("end", 6.5),
]


def taps(take):
    """(source_seconds, x_pts, y_pts) for every tap Maestro performed."""
    start = int((WORK / take / "start_ms").read_text())
    day = datetime.datetime.fromtimestamp(start / 1000).date()
    log = glob.glob(str(WORK / take / "debug/.maestro/tests/*/maestro.log"))[0]
    out = []
    for line in open(log):
        m = re.match(r"(\d\d):(\d\d):(\d\d)\.(\d+).*Try tapping at \((\d+), (\d+)\)", line)
        if m:
            h, mi, s, ms, x, y = map(int, m.groups())
            t = datetime.datetime(day.year, day.month, day.day, h, mi, s, ms * 1000)
            out.append((t.timestamp() - start / 1000, x, y))
    return out


def rounded_mask(w, h, r, scale=4):
    big = Image.new("L", (w * scale, h * scale), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, w * scale - 1, h * scale - 1), r * scale, fill=255)
    return np.asarray(big.resize((w, h), Image.LANCZOS), np.float32) / 255


def background():
    y = np.linspace(0, 1, H)[:, None]
    base = np.zeros((H, W, 3), np.float32)
    top, bottom = np.array(T["top"]), np.array(T["bottom"])
    base[:] = (top * (1 - y) + bottom * y)[:, None, :][:, 0:1, :]
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((xx - PHONE_CX) / 520) ** 2 + ((yy - PHONE_CY) / 420) ** 2))
    base += glow[..., None] * glow_tint()
    # PIL layer: phone shadow and bezel, drawn once
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox, oy = SX - BEZEL, SY - BEZEL
    ow, oh, orr = SCR_W + 2 * BEZEL, SCR_H + 2 * BEZEL, SCR_R + BEZEL
    ImageDraw.Draw(shadow).rounded_rectangle((ox + 10, oy + 30, ox + ow + 10, oy + oh + 30), orr, fill=(0, 0, 0, T["shadow"]))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(40)))
    body = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle((ox * 2, oy * 2, (ox + ow) * 2, (oy + oh) * 2), orr * 2, fill=(*T["bezel"], 255))
    d.rounded_rectangle((ox * 2 + 4, oy * 2 + 4, (ox + ow) * 2 - 4, (oy + oh) * 2 - 4), orr * 2 - 4, fill=(*T["bezel_in"], 255))
    d.rounded_rectangle((SX * 2 - 6, SY * 2 - 6, (SX + SCR_W) * 2 + 6, (SY + SCR_H) * 2 + 6), SCR_R * 2 + 6, fill=(0, 0, 0, 255))
    img = Image.alpha_composite(img, body.resize((W, H), Image.LANCZOS))
    # Side buttons
    d = ImageDraw.Draw(img)
    for y0, y1 in ((SY + 150, SY + 230), (SY + 260, SY + 340)):
        d.rounded_rectangle((ox - 4, y0, ox + 2, y1), 3, fill=T["bezel"])
    d.rounded_rectangle((ox + ow - 2, SY + 210, ox + ow + 4, SY + 330), 3, fill=T["bezel"])
    return img.convert("RGB")


def glow_tint():
    """Per-channel glow: adds accent light on dark themes, a teal wash on light."""
    g = np.array(T["glow"], np.float32)
    return g * T["glow_k"] if T["glow_k"] > 0 else (255 - g) * T["glow_k"]


def brand(img):
    icon = Image.open(ICON).convert("RGBA").resize((56, 56), Image.LANCZOS)
    m = Image.new("L", (56, 56), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 55, 55), 13, fill=255)
    img.paste(icon, (150, 96), m)
    ImageDraw.Draw(img).text((222, 124), "Resolution Companion", font=font(28, "Semibold"), fill=T["head"], anchor="lm")
    return img


def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=f) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w_
    return lines + [cur]


def caption_layer(key):
    tag, head, sub = CAPTIONS[key]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_tag, f_head, f_sub = font(24, "Semibold"), font(62, "Bold"), font(31)
    head_lines = wrap(d, head, f_head, 760)
    sub_lines = wrap(d, sub, f_sub, 700)
    block = 40 + len(head_lines) * 74 + 22 + len(sub_lines) * 44
    y = H // 2 - block // 2
    x = 150
    tw = d.textlength(tag, font=f_tag) + 6 * len(tag)
    d.rounded_rectangle((x - 2, y - 6, x + tw + 26, y + 34), 20, fill=(*T["tag"], 38))
    cx = x + 12
    for ch in tag:  # letterspacing
        d.text((cx, y + 14), ch, font=f_tag, fill=(*T["tag"], 255), anchor="lm")
        cx += d.textlength(ch, font=f_tag) + 6
    y += 58
    for line in head_lines:
        d.text((x, y), line, font=f_head, fill=(*T["head"], 255))
        y += 74
    y += 22
    for line in sub_lines:
        d.text((x, y), line, font=f_sub, fill=(*T["sub"], 255))
        y += 44
    return np.asarray(layer, np.float32)



def card(lines, icon_size=0):
    """Full-frame text card on the plain background (no phone)."""
    y = np.linspace(0, 1, H)[:, None]
    top, bottom = np.array(T["top"]), np.array(T["bottom"])
    arr = np.repeat((top * (1 - y) + bottom * y)[:, None, :], W, axis=1)
    yy, xx = np.mgrid[0:H, 0:W]
    arr += np.exp(-(((xx - W / 2) / 700) ** 2 + ((yy - H / 2) / 420) ** 2))[..., None] * glow_tint() * 0.8
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    total = icon_size + (40 if icon_size else 0) + sum(s[1] + s[3] for s in lines)
    yy0 = H // 2 - total // 2
    if icon_size:
        icon = Image.open(ICON).convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
        m = Image.new("L", (icon_size, icon_size), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, icon_size - 1, icon_size - 1), int(icon_size * 0.225), fill=255)
        img.paste(icon, (W // 2 - icon_size // 2, yy0), m)
        yy0 += icon_size + 40
    for text, size, weight, gap, color in lines:
        d.text((W // 2, yy0), text, font=font(size, weight), fill=color, anchor="mt")
        yy0 += size + gap
    return np.asarray(img, np.float32)


# Framing before the footage: what the app is, who it's for, how it works
INTRO = {
    "what": ("WHAT IT IS", "Pick a goal. Build a small daily habit to reach it.",
             "An AI coach helps you make the plan, and change it when life gets busy."),
    "who": ("WHO IT’S FOR", "Anyone who wants to build a habit and keep it",
            "Learning a language, exercising, reading, or anything you’ve started and stopped before."),
    "how": ("HOW IT WORKS", "Make a plan, check in each day, and see your progress.",
            "Free to download on iPhone and iPad. No account needed."),
}


def intro_card(tag, head, sub):
    """Centered card with a letterspaced tag, a wrapped headline and a subline."""
    base = Image.fromarray(card([]).astype(np.uint8)).convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_tag, f_head, f_sub = font(26, "Semibold"), font(76, "Bold"), font(36)
    head_lines = wrap(d, head, f_head, 1300)
    sub_lines = wrap(d, sub, f_sub, 1100)
    block = 44 + 40 + len(head_lines) * 92 + 30 + len(sub_lines) * 52
    y = H // 2 - block // 2
    tw = sum(d.textlength(ch, font=f_tag) + 7 for ch in tag) - 7
    x = W // 2 - tw / 2
    d.rounded_rectangle((x - 18, y - 4, x + tw + 18, y + 40), 22, fill=(*T["tag"], 38))
    for ch in tag:  # letterspacing
        d.text((x, y + 18), ch, font=f_tag, fill=(*T["tag"], 255), anchor="lm")
        x += d.textlength(ch, font=f_tag) + 7
    y += 44 + 40
    for line in head_lines:
        d.text((W // 2, y), line, font=f_head, fill=(*T["head"], 255), anchor="mt")
        y += 92
    y += 30
    for line in sub_lines:
        d.text((W // 2, y), line, font=f_sub, fill=(*T["sub"], 255), anchor="mt")
        y += 52
    return np.asarray(Image.alpha_composite(base, layer).convert("RGB"), np.float32)


RECAP = ("WHAT YOU GET", "Build one habit at a time, with help along the way", [
    "A small daily habit, with a 2-minute version for busy days",
    "Reminders at the time you pick, only if a habit isn’t done",
    "A coach that looks at what you actually did",
    "Your streaks, milestones and progress in one place",
])


def recap_card(tag, head, items):
    """Closing summary: tag, headline, then a left-aligned checklist block."""
    base = Image.fromarray(card([]).astype(np.uint8)).convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_tag, f_head, f_item = font(26, "Semibold"), font(60, "Bold"), font(36)
    head_lines = wrap(d, head, f_head, 1600)
    block = 44 + 40 + len(head_lines) * 74 + 56 + len(items) * 66
    y = H // 2 - block // 2
    tw = sum(d.textlength(ch, font=f_tag) + 7 for ch in tag) - 7
    x = W // 2 - tw / 2
    d.rounded_rectangle((x - 18, y - 4, x + tw + 18, y + 40), 22, fill=(*T["tag"], 38))
    for ch in tag:  # letterspacing
        d.text((x, y + 18), ch, font=f_tag, fill=(*T["tag"], 255), anchor="lm")
        x += d.textlength(ch, font=f_tag) + 7
    y += 44 + 40
    for line in head_lines:
        d.text((W // 2, y), line, font=f_head, fill=(*T["head"], 255), anchor="mt")
        y += 74
    y += 56
    iw = max(d.textlength(t, font=f_item) for t in items) + 60
    x0 = W // 2 - iw / 2
    for t in items:
        cy = y + 22
        d.ellipse((x0, cy - 16, x0 + 32, cy + 16), fill=(*T["tag"], 255))
        d.line([(x0 + 9, cy), (x0 + 14, cy + 6), (x0 + 24, cy - 6)], fill=(255, 255, 255, 255), width=4)
        d.text((x0 + 60, cy), t, font=f_item, fill=(*T["sub"], 255), anchor="lm")
        y += 66
    return np.asarray(Image.alpha_composite(base, layer).convert("RGB"), np.float32)


def main():
    bg = np.asarray(brand(background()), np.float32)
    mask = rounded_mask(SCR_W, SCR_H, SCR_R)[..., None]
    caps = {k: caption_layer(k) for k in CAPTIONS}
    title = card([
        ("Resolution Companion", 76, "Bold", 26, T["head"]),
        ("A habit app with an AI coach", 38, "Regular", 0, T["sub"]),
    ], icon_size=180)
    later = card([("Five weeks later", 64, "Bold", 0, T["head"])])
    end = card([
        ("Resolution Companion", 40, "Semibold", 20, T["sub"]),
        ("Download it free on the App Store", 72, "Bold", 34, T["head"]),
        ("resolutioncompanion.com", 44, "Semibold", 30, T["link"]),
        ("iPhone & iPad · No account needed", 30, "Regular", 0, T["sub"]),
    ], icon_size=160)
    bridge = card([("Here’s what that looks like in the app", 56, "Bold", 0, T["head"])])
    fade_to = np.array(T["bottom"], np.float32)
    cards = {"title": title, "later": later, "end": end, "bridge": bridge, "recap": recap_card(*RECAP)}
    cards.update({k: intro_card(*v) for k, v in INTRO.items()})
    tap_log = {t: taps(t) for t in ("take01", "take02")}
    caps_used = [s[4] for s in SEGMENTS if len(s) == 5]

    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT)],
        stdin=subprocess.PIPE)
    caps_seen = {}
    prev_frame = None
    seg_index = -1
    for seg in SEGMENTS:
        seg_index += 1
        if len(seg) == 2:
            name, dur = seg
            n = round(dur * FPS)
            for i in range(n):
                frame = cards[name]
                # Fade in from the previous shot, fade the end card to black
                a = min(1, i / (0.4 * FPS))
                if prev_frame is not None and a < 1:
                    frame = prev_frame * (1 - a) + frame * a
                # Fade from and to the theme's backdrop rather than black
                if name == "end":
                    k = min(1, (n - i) / (0.8 * FPS))
                    frame = frame * k + fade_to * (1 - k)
                elif name == "title":
                    k = min(1, i / (0.6 * FPS))
                    frame = frame * k + fade_to * (1 - k)
                enc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
                last = frame
            prev_frame = last
            continue
        take, s0, s1, speed, key = seg
        cap = cv2.VideoCapture(str(WORK / take / "cfr60.mp4"))
        n = round((s1 - s0) / speed * FPS)
        prev_key = SEGMENTS[seg_index - 1][4] if len(SEGMENTS[seg_index - 1]) == 5 else None
        next_seg = SEGMENTS[seg_index + 1]
        next_key = next_seg[4] if len(next_seg) == 5 else None
        cur_src = -1
        img = None
        for i in range(n):
            src = s0 + i / FPS * speed
            want = int(round(src * 60))
            if want != cur_src:
                if want != cur_src + 1:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, want)
                ok, raw = cap.read()
                if ok:
                    img = cv2.resize(cv2.cvtColor(raw, cv2.COLOR_BGR2RGB), (SCR_W, SCR_H), interpolation=cv2.INTER_AREA)
                cur_src = want
            frame = bg.copy()
            region = frame[SY:SY + SCR_H, SX:SX + SCR_W]
            region[:] = region * (1 - mask) + img.astype(np.float32) * mask
            # Tap rings: ripple from just before the touch registers
            ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(ov)
            for t, x, y in tap_log[take]:
                age = src - (t - 0.05)
                if 0 <= age < 0.55 * speed:
                    p = age / (0.55 * speed)
                    px, py = SX + x * SCR_W / PTS_W, SY + y * SCR_H / PTS_H
                    r = 20 + 26 * p
                    d.ellipse((px - r, py - r, px + r, py + r), outline=(255, 255, 255, int(230 * (1 - p))), width=4)
                    if p < 0.5:
                        r2 = 20
                        d.ellipse((px - r2, py - r2, px + r2, py + r2), fill=(255, 255, 255, int(110 * (1 - 2 * p))))
            o = np.asarray(ov, np.float32)
            if o[..., 3].any():
                a = o[..., 3:4] / 255
                frame = frame * (1 - a) + o[..., :3] * a
            # Caption: fade only where the caption changes
            c = caps[key]
            ca = 1.0
            if key != prev_key:
                ca = min(ca, i / (0.35 * FPS))
            if key != next_key:
                ca = min(ca, (n - 1 - i) / (0.3 * FPS))
            ca = max(0.0, min(1.0, ca))
            a = c[..., 3:4] / 255 * ca
            frame = frame * (1 - a) + c[..., :3] * a
            # Cross-fade in from a card
            if i < 0.4 * FPS and prev_frame is not None and len(SEGMENTS[seg_index - 1]) == 2:
                k = i / (0.4 * FPS)
                frame = prev_frame * (1 - k) + frame * k
            enc.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
        prev_frame = frame
        cap.release()
    enc.stdin.close()
    enc.wait()
    print(OUT)


if __name__ == "__main__":
    main()
