"""
Build a Color Panic guide PDF with all round-type illustrations.
Generates phone-style mockup PNGs that match the in-game styling, then
embeds them into a reportlab PDF alongside the rules text.
"""

import io
import os

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image as RLImage, Table,
    TableStyle, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(OUT_DIR, "_pdf_images")
os.makedirs(IMG_DIR, exist_ok=True)

# Game palette (matches styles.css)
BG1 = (26, 11, 46)
BG2 = (45, 27, 78)
ACCENT = (255, 77, 157)
ACCENT2 = (0, 224, 211)
TEXT = (244, 241, 255)
MUTED = (184, 168, 216)
RED = (255, 59, 48)
BLUE = (10, 132, 255)
GREEN = (52, 199, 89)
YELLOW = (255, 214, 10)
CARD_FILL = (255, 255, 255, 20)
CARD_BORDER = (255, 255, 255, 46)

COLOR_HEX = {
    "red": RED, "blue": BLUE, "green": GREEN, "yellow": YELLOW,
}

PHONE_W, PHONE_H = 720, 1280  # vertical phone-like aspect


def _font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _gradient_bg(img):
    """Diagonal-ish gradient mimicking the game's body background."""
    w, h = img.size
    base = Image.new("RGB", (w, h), BG1)
    top = Image.new("RGB", (w, h), BG2)
    mask = Image.new("L", (w, h))
    md = ImageDraw.Draw(mask)
    for y in range(h):
        v = int(255 * (y / h))
        md.line([(0, y), (w, y)], fill=v)
    base = Image.composite(top, base, mask)
    img.paste(base, (0, 0))


def _rounded_rect(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _card(img, box, radius=36):
    """Glass card overlay."""
    x1, y1, x2, y2 = box
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    _rounded_rect(od, box, radius, fill=(255, 255, 255, 22))
    _rounded_rect(od, box, radius, outline=(255, 255, 255, 60), width=2)
    img.alpha_composite(overlay)


def _text(draw, xy, text, font, fill=TEXT, anchor="lt"):
    draw.text(xy, text, font=font, fill=fill, anchor=anchor)


def _color_grid(img, box, labels=("RED", "BLUE", "GREEN", "YELLOW"),
                colors=(RED, BLUE, GREEN, YELLOW), disabled=()):
    """2x2 color tap grid."""
    x1, y1, x2, y2 = box
    gap = 22
    w = (x2 - x1 - gap) // 2
    h = (y2 - y1 - gap) // 2
    font = _font(46)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    positions = [(x1, y1), (x1 + w + gap, y1), (x1, y1 + h + gap), (x1 + w + gap, y1 + h + gap)]
    for i, (px, py) in enumerate(positions):
        col = colors[i]
        if labels[i] in disabled:
            col = tuple(int(c * 0.35) for c in col)
        _rounded_rect(od, [px, py, px + w, py + h], 36, fill=col + (255,))
        # label
        bbox = od.textbbox((0, 0), labels[i], font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        od.text((px + w / 2 - tw / 2, py + h / 2 - th / 2 - 8), labels[i],
                font=font, fill=(255, 255, 255, 255))
    img.alpha_composite(overlay)


def _phone_frame():
    img = Image.new("RGBA", (PHONE_W, PHONE_H), (0, 0, 0, 255))
    bg = Image.new("RGB", (PHONE_W, PHONE_H))
    _gradient_bg(bg)
    img.paste(bg, (0, 0))
    return img


def _header(img, round_n=3, total=10, score=45, name="You"):
    od = ImageDraw.Draw(img)
    box_h = 110
    pad = 36
    w = PHONE_W - pad * 2
    cell_w = (w - 18) // 4
    y = 60
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(overlay)
    cells = [
        ("YOU", name, TEXT),
        ("SCORE", str(score), ACCENT2),
        ("ROUND", f"{round_n}/{total}", TEXT),
        ("STREAK", "🔥2", ACCENT),
    ]
    fl = _font(20)
    fb = _font(38)
    for i, (label, value, color) in enumerate(cells):
        x = pad + i * (cell_w + 6)
        _rounded_rect(od2, [x, y, x + cell_w, y + box_h], 22,
                      fill=(255, 255, 255, 22), outline=(255, 255, 255, 46), width=2)
        # label
        bbox = od2.textbbox((0, 0), label, font=fl)
        tw = bbox[2] - bbox[0]
        od2.text((x + cell_w / 2 - tw / 2, y + 14), label, font=fl, fill=MUTED + (255,))
        # value
        bbox = od2.textbbox((0, 0), value, font=fb)
        tw = bbox[2] - bbox[0]
        od2.text((x + cell_w / 2 - tw / 2, y + 50), value, font=fb, fill=color + (255,))
    img.alpha_composite(overlay)


def _instruction(img, text, color=TEXT, y=240, size=46):
    od = ImageDraw.Draw(img)
    f = _font(size)
    bbox = od.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    od.text((PHONE_W / 2 - tw / 2, y), text, font=f, fill=color + (255,))


def _stimulus(img, text, color=TEXT, y=340, size=110):
    od = ImageDraw.Draw(img)
    f = _font(size)
    bbox = od.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    od.text((PHONE_W / 2 - tw / 2, y), text, font=f, fill=color + (255,))


# ---------------- Round-specific mockups ----------------

def render_everyone_tap():
    img = _phone_frame()
    _header(img, round_n=1)
    _instruction(img, "Everyone tap RED!", y=240, size=44)
    # large stimulus word RED in red
    _stimulus(img, "RED", color=RED, y=340, size=140)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_only_player():
    img = _phone_frame()
    _header(img, round_n=2)
    _instruction(img, "Only Alex tap BLUE!", y=240, size=42)
    _stimulus(img, "BLUE", color=BLUE, y=340, size=140)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_avoid():
    img = _phone_frame()
    _header(img, round_n=3)
    _instruction(img, "Do NOT tap YELLOW!", y=240, size=42)
    _stimulus(img, "YELLOW", color=YELLOW, y=340, size=120)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180], disabled=("YELLOW",))
    return img


def render_word_vs_color():
    img = _phone_frame()
    _header(img, round_n=4)
    _instruction(img, "Tap the WORD, not the color!", y=240, size=38)
    # Word "RED" rendered in BLUE color
    _stimulus(img, "RED", color=BLUE, y=340, size=140)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_opposite():
    img = _phone_frame()
    _header(img, round_n=5)
    _instruction(img, "Tap the OPPOSITE of RED!", y=240, size=40)
    _stimulus(img, "RED", color=RED, y=340, size=140)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_sequence():
    img = _phone_frame()
    _header(img, round_n=6)
    _instruction(img, "Tap this sequence in order!", y=240, size=38)
    # three chips
    od = ImageDraw.Draw(img)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(overlay)
    seq = [RED, GREEN, BLUE]
    labels = ["RED", "GREEN", "BLUE"]
    chip = 130
    gap = 30
    total_w = chip * 3 + gap * 2
    sx = (PHONE_W - total_w) // 2
    sy = 360
    f = _font(22)
    fnum = _font(20)
    for i, c in enumerate(seq):
        x = sx + i * (chip + gap)
        _rounded_rect(od2, [x, sy, x + chip, sy + chip], 28, fill=c + (255,))
        # step number badge
        _rounded_rect(od2, [x - 12, sy - 12, x + 26, sy + 26], 19,
                      fill=BG1 + (255,), outline=(255, 255, 255, 60), width=2)
        bbox = od2.textbbox((0, 0), str(i + 1), font=fnum)
        tw = bbox[2] - bbox[0]
        od2.text((x + 7 - tw / 2, sy - 9), str(i + 1), font=fnum, fill=TEXT + (255,))
        bbox = od2.textbbox((0, 0), labels[i], font=f)
        tw = bbox[2] - bbox[0]
        od2.text((x + chip / 2 - tw / 2, sy + chip / 2 - 14), labels[i],
                 font=f, fill=(255, 255, 255, 255))
    img.alpha_composite(overlay)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_count():
    img = _phone_frame()
    _header(img, round_n=7)
    _instruction(img, "Tap GREEN exactly 3 times!", y=240, size=40)
    _stimulus(img, "3×", color=GREEN, y=340, size=140)
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_last_color():
    img = _phone_frame()
    _header(img, round_n=8)
    _instruction(img, "Watch the colors flash…", y=240, size=40)
    # flash box in middle showing current flash color
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    box_size = 320
    x = (PHONE_W - box_size) // 2
    y = 360
    _rounded_rect(od, [x, y, x + box_size, y + box_size], 48, fill=BLUE + (255,))
    f = _font(40)
    bbox = od.textbbox((0, 0), "3 / 4", font=f)
    tw = bbox[2] - bbox[0]
    od.text((PHONE_W / 2 - tw / 2, y + box_size / 2 - 25), "3 / 4",
            font=f, fill=(255, 255, 255, 255))
    img.alpha_composite(overlay)
    return img


def render_color_math():
    img = _phone_frame()
    _header(img, round_n=9)
    _instruction(img, "What is 2 + 1?", y=240, size=46)
    _stimulus(img, "2 + 1", color=TEXT, y=340, size=140)
    # legend
    od = ImageDraw.Draw(img)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(overlay)
    legend = [("1", RED), ("2", BLUE), ("3", GREEN), ("4", YELLOW)]
    pad = 12
    item_w = 110
    total_w = item_w * 4 + pad * 3
    sx = (PHONE_W - total_w) // 2
    sy = 520
    f = _font(28)
    for i, (n, c) in enumerate(legend):
        x = sx + i * (item_w + pad)
        _rounded_rect(od2, [x, sy, x + item_w, sy + 60], 16, fill=(255, 255, 255, 22))
        _rounded_rect(od2, [x + 12, sy + 18, x + 36, sy + 42], 8, fill=c + (255,))
        od2.text((x + 50, sy + 14), n, font=f, fill=TEXT + (255,))
    img.alpha_composite(overlay)
    _color_grid(img, [60, 680, PHONE_W - 60, 1180])
    return img


def render_majority():
    img = _phone_frame()
    _header(img, round_n=10)
    _instruction(img, "Tap what MOST players will tap!", y=240, size=34)
    od = ImageDraw.Draw(img)
    f = _font(120)
    od.text((PHONE_W / 2 - 70, 320), "👥", font=f, fill=TEXT + (255,))
    _color_grid(img, [60, 580, PHONE_W - 60, 1140])
    return img


def render_minority():
    img = _phone_frame()
    _header(img, round_n=11)
    _instruction(img, "Tap what FEWEST players will tap!", y=240, size=32)
    od = ImageDraw.Draw(img)
    f = _font(120)
    od.text((PHONE_W / 2 - 70, 320), "🎯", font=f, fill=TEXT + (255,))
    _color_grid(img, [60, 580, PHONE_W - 60, 1140])
    return img


def render_memory_sequence():
    img = _phone_frame()
    _header(img, round_n=12)
    _instruction(img, "Memorize this sequence!", y=240, size=40)
    # 5 chips
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    seq = [RED, YELLOW, GREEN, BLUE, RED]
    chip = 100
    gap = 18
    total_w = chip * 5 + gap * 4
    sx = (PHONE_W - total_w) // 2
    sy = 380
    fnum = _font(20)
    for i, c in enumerate(seq):
        x = sx + i * (chip + gap)
        _rounded_rect(od, [x, sy, x + chip, sy + chip], 24, fill=c + (255,))
        _rounded_rect(od, [x - 10, sy - 10, x + 22, sy + 22], 16,
                      fill=BG1 + (255,), outline=(255, 255, 255, 60), width=2)
        bbox = od.textbbox((0, 0), str(i + 1), font=fnum)
        tw = bbox[2] - bbox[0]
        od.text((x + 6 - tw / 2, sy - 9), str(i + 1), font=fnum, fill=TEXT + (255,))
    img.alpha_composite(overlay)
    return img


def render_dont_tap_until():
    img = _phone_frame()
    _header(img, round_n=13)
    _instruction(img, "Wait, THEN tap GREEN!", y=240, size=42)
    # countdown style number
    od = ImageDraw.Draw(img)
    f = _font(220)
    od.text((PHONE_W / 2 - 70, 380), "2", font=f, fill=ACCENT + (255,))
    return img


def render_odd_one_out():
    img = _phone_frame()
    _header(img, round_n=14)
    _instruction(img, "Find the ODD one out!", y=240, size=42)
    # 2x2 grid: 3 same + 1 different — the player taps that color
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    cell = 180
    gap = 22
    total = cell * 2 + gap
    sx = (PHONE_W - total) // 2
    sy = 360
    cells = [BLUE, BLUE, RED, BLUE]
    for i, c in enumerate(cells):
        r, col = divmod(i, 2)
        x = sx + col * (cell + gap)
        y = sy + r * (cell + gap)
        _rounded_rect(od, [x, y, x + cell, y + cell], 22, fill=c + (255,))
    img.alpha_composite(overlay)
    _color_grid(img, [60, 820, PHONE_W - 60, PHONE_H - 100])
    return img


def render_reverse_order():
    img = _phone_frame()
    _header(img, round_n=15)
    _instruction(img, "Tap the sequence BACKWARDS!", y=240, size=34)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    seq = [YELLOW, RED, GREEN]
    chip = 130
    gap = 30
    total_w = chip * 3 + gap * 2
    sx = (PHONE_W - total_w) // 2
    sy = 360
    fnum = _font(20)
    f = _font(22)
    labels = ["YELLOW", "RED", "GREEN"]
    for i, c in enumerate(seq):
        x = sx + i * (chip + gap)
        _rounded_rect(od, [x, sy, x + chip, sy + chip], 28, fill=c + (255,))
        _rounded_rect(od, [x - 12, sy - 12, x + 26, sy + 26], 19,
                      fill=BG1 + (255,), outline=(255, 255, 255, 60), width=2)
        bbox = od.textbbox((0, 0), str(i + 1), font=fnum)
        tw = bbox[2] - bbox[0]
        od.text((x + 7 - tw / 2, sy - 9), str(i + 1), font=fnum, fill=TEXT + (255,))
        bbox = od.textbbox((0, 0), labels[i], font=f)
        tw = bbox[2] - bbox[0]
        od.text((x + chip / 2 - tw / 2, sy + chip / 2 - 14), labels[i],
                font=f, fill=(255, 255, 255, 255))
    # arrow
    arr = _font(70)
    od.text((PHONE_W / 2 - 30, sy + chip + 30), "←", font=arr, fill=ACCENT + (255,))
    img.alpha_composite(overlay)
    _color_grid(img, [60, 720, PHONE_W - 60, PHONE_H - 100])
    return img


def render_color_number():
    img = _phone_frame()
    _header(img, round_n=16)
    _instruction(img, "Tap RED 3×, then BLUE 1×!", y=240, size=38)
    od = ImageDraw.Draw(img)
    f = _font(110)
    od.text((PHONE_W / 2 - 200, 340), "3×", font=f, fill=RED + (255,))
    od.text((PHONE_W / 2 + 40, 340), "1×", font=f, fill=BLUE + (255,))
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_roulette():
    img = _phone_frame()
    _header(img, round_n=17)
    _instruction(img, "🎲 Roulette! Tap any color.", y=240, size=38)
    od = ImageDraw.Draw(img)
    f = _font(180)
    od.text((PHONE_W / 2 - 90, 340), "🎲", font=f, fill=TEXT + (255,))
    _color_grid(img, [60, 620, PHONE_W - 60, 1180])
    return img


def render_drawing():
    img = _phone_frame()
    _header(img, round_n=18)
    _instruction(img, "Memorize the shapes!", y=240, size=40)
    od = ImageDraw.Draw(img)
    shapes = [("●", RED), ("■", BLUE), ("▲", GREEN), ("★", YELLOW)]
    f = _font(120)
    sx = 80
    sy = 380
    gap = 140
    for i, (s, c) in enumerate(shapes):
        od.text((sx + i * gap, sy), s, font=f, fill=c + (255,))
    od.text((PHONE_W / 2 - 200, sy + 220),
            "Which color was 2nd?", font=_font(34), fill=TEXT + (255,))
    return img


def render_boss():
    img = _phone_frame()
    _header(img, round_n=5)
    # boss banner
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    pad = 40
    _rounded_rect(od, [pad, 210, PHONE_W - pad, 290], 22,
                  fill=(255, 142, 60, 255))
    f = _font(34)
    txt = "⚡ BOSS ROUND  ×2 POINTS ⚡"
    bbox = od.textbbox((0, 0), txt, font=f)
    tw = bbox[2] - bbox[0]
    od.text((PHONE_W / 2 - tw / 2, 232), txt, font=f, fill=(26, 11, 46, 255))
    img.alpha_composite(overlay)
    _instruction(img, "Tap the sequence BACKWARDS!", y=320, size=34)
    _color_grid(img, [60, 700, PHONE_W - 60, 1180])
    return img


def render_host_lobby():
    img = _phone_frame()
    od = ImageDraw.Draw(img)
    # logo
    f = _font(72, bold=True)
    od.text((PHONE_W / 2 - 200, 60), "Color Panic", font=f, fill=ACCENT + (255,))
    od.text((PHONE_W / 2 - 130, 160), "Room Code", font=_font(24), fill=MUTED + (255,))
    fcode = _font(140)
    od.text((PHONE_W / 2 - 200, 200), "ZQRP", font=fcode, fill=ACCENT2 + (255,))
    # players
    od.text((80, 420), "Players (3)", font=_font(34), fill=TEXT + (255,))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(overlay)
    names = ["Alex", "Sam", "Jordan"]
    for i, n in enumerate(names):
        y = 480 + i * 90
        _rounded_rect(od2, [80, y, PHONE_W - 80, y + 70], 18,
                      fill=(255, 255, 255, 26))
        od2.text((110, y + 20), n, font=_font(30), fill=TEXT + (255,))
    # difficulty + rounds info
    _rounded_rect(od2, [80, 800, PHONE_W - 80, 900], 18,
                  fill=(255, 255, 255, 18))
    od2.text((110, 822), "Difficulty: Medium · Rounds: 10",
             font=_font(28), fill=TEXT + (255,))
    # start button
    _rounded_rect(od2, [80, 1000, PHONE_W - 80, 1100], 22,
                  fill=ACCENT + (255,))
    od2.text((PHONE_W / 2 - 100, 1030), "Start Game",
             font=_font(40), fill=(255, 255, 255, 255))
    img.alpha_composite(overlay)
    return img


# ---------------- Build & save ----------------

ROUND_RENDERS = [
    ("host_lobby", "Host Lobby (room code + players)", render_host_lobby),
    ("everyone_tap", "Everyone Tap Color", render_everyone_tap),
    ("only_player", "Only Player Tap Color", render_only_player),
    ("avoid", "Avoid Color", render_avoid),
    ("word_vs_color", "Word vs Color (Stroop)", render_word_vs_color),
    ("opposite", "Opposite Color", render_opposite),
    ("sequence", "Sequence", render_sequence),
    ("count", "Count Taps", render_count),
    ("last_color", "Last Color (flash memory)", render_last_color),
    ("color_math", "Color Math", render_color_math),
    ("majority", "Majority", render_majority),
    ("minority", "Minority", render_minority),
    ("memory_sequence", "Memory Sequence (5)", render_memory_sequence),
    ("dont_tap_until", "Don't Tap Until", render_dont_tap_until),
    ("odd_one_out", "Odd One Out", render_odd_one_out),
    ("reverse_order", "Reverse Order", render_reverse_order),
    ("color_number", "Color Number Combo", render_color_number),
    ("roulette", "Roulette", render_roulette),
    ("drawing", "Drawing (shape memory)", render_drawing),
    ("boss", "Boss Round (×2 points)", render_boss),
]


def save_all_images():
    paths = {}
    for key, _, fn in ROUND_RENDERS:
        path = os.path.join(IMG_DIR, f"{key}.png")
        img = fn()
        img.convert("RGB").save(path, "PNG", optimize=True)
        paths[key] = path
    return paths


# ---------------- PDF ----------------

ROUND_DESCRIPTIONS = {
    "everyone_tap": (
        "All players race to tap the named color. Fastest correct tap earns the speed bonus."
    ),
    "only_player": (
        "Only the named player should tap the color. Everyone else must keep their fingers off — any tap from a non-target player counts as wrong."
    ),
    "avoid": (
        "Tap any color *except* the one named. The 'forbidden' color visually dims so you don't fumble it."
    ),
    "word_vs_color": (
        "Stroop-style trap: the screen shows a color word painted in a different color. Ignore the paint — tap what the *word* says."
    ),
    "opposite": (
        "Tap the opposite of the shown color. Red↔Green, Blue↔Yellow. Think before you tap."
    ),
    "sequence": (
        "A 3-color sequence appears. Tap them in the shown order. Wrong color at any step ends your round."
    ),
    "count": (
        "Tap one color *exactly* N times (usually 3 or 4). Over- or under-tap and you miss."
    ),
    "last_color": (
        "A series of colors flashes one at a time. After the flashes end, tap the *last* color you saw."
    ),
    "color_math": (
        "Solve a small math problem (e.g. 2 + 1). The answer maps to a color via the legend (1=red, 2=blue, 3=green, 4=yellow). Tap the color of the answer."
    ),
    "majority": (
        "Tap whichever color you think MOST other players will tap. Scoring is deferred until the room reveals the tally — you win if you sided with the crowd."
    ),
    "minority": (
        "Tap whichever color you think FEWEST other players will tap. You win for picking the least-popular color."
    ),
    "memory_sequence": (
        "A 5-color sequence flashes briefly. After it disappears, recall and tap the sequence in order. Worth big points (30+)."
    ),
    "dont_tap_until": (
        "A 'wait' period plays first. Tap too early and you lose. After the countdown ends, tap the named color as fast as you can."
    ),
    "odd_one_out": (
        "Four squares appear — three share one color, one is different. Tap the color of the odd-one-out."
    ),
    "reverse_order": (
        "A 3-color sequence shows. Tap it in REVERSE order. Worth bonus points."
    ),
    "color_number": (
        "A two-phase combo, e.g. 'Tap RED 3×, then BLUE 1×'. Complete phase A first, then phase B. Any wrong color ends your round."
    ),
    "roulette": (
        "Pure chance. Tap any color; the winning color is rolled randomly afterward. Lucky picks score, the rest don't."
    ),
    "drawing": (
        "Four shapes in different colors flash briefly. After they vanish, the game asks 'what color was the Nth shape?' Tap that color."
    ),
    "boss": (
        "Every 5th round is a Boss Round: harder round types only, with ×2 points and a longer duration. Big swings in the leaderboard."
    ),
}

# Boss is not a round type — it's a modifier — handled in description above.

HOW_TO_PLAY = """\
<b>Color Panic</b> is a local-network party reaction game. One laptop hosts the game; \
players join from their phones on the same Wi-Fi.

<b>Setup</b><br/>
1. On the <b>host laptop</b>, open <font color="#00e0d3">http://localhost:3344</font> and \
tap <b>Create Room as Host</b>.<br/>
2. The host screen shows a 4-letter room code and a join URL like \
<font color="#00e0d3">http://192.168.1.42:3344</font>.<br/>
3. On each <b>phone</b> (same Wi-Fi), open that join URL, tap <b>Join Room as Player</b>, \
enter the code and a name.<br/>
4. Pick a <b>difficulty</b> (Easy / Medium / Hard) and a <b>round count</b> (3–30).<br/>
5. Once everyone is in, host taps <b>Start Game</b>.

<b>How a round works</b><br/>
Every round flashes an instruction (e.g. "Everyone tap RED!") and gives you a small \
time window (3–9 seconds depending on type & difficulty) to act. Some rounds have a \
<b>preview phase</b> where colors flash before you can tap.

<b>Scoring</b><br/>
• Correct tap: <b>+10</b> (some round types pay more — up to 30)<br/>
• Wrong tap: <b>−5</b><br/>
• Fastest correct each round: <b>+5</b> speed bonus<br/>
• 3-in-a-row streak: extra bonus, fire emoji on your card<br/>
• No answer: <b>0</b>

<b>Boss rounds</b><br/>
Every 5th round is a <b>Boss Round</b>. Only the hardest round types appear, the \
duration is 1.5× longer, and points are <b>doubled</b>. Watch for the gold banner.

<b>Difficulties at a glance</b><br/>
• <b>Easy</b> — 8 rounds, gentle pace, simple types only (tap, avoid, opposite, math, last-color, odd-one-out).<br/>
• <b>Medium</b> — 10 rounds, normal pace, full type mix.<br/>
• <b>Hard</b> — 12 rounds, fast pace (65% duration), every type including memory & combos.
"""


def build_pdf(image_paths, out_path):
    styles = getSampleStyleSheet()

    base_text = ParagraphStyle(
        "BaseText", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=11, leading=15,
        textColor=HexColor("#f4f1ff"),
    )
    title = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontName="Helvetica-Bold", fontSize=42, leading=46,
        textColor=HexColor("#ff4d9d"), alignment=TA_CENTER,
        spaceAfter=8,
    )
    subtitle = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontName="Helvetica", fontSize=14, leading=18,
        textColor=HexColor("#b8a8d8"), alignment=TA_CENTER,
        spaceAfter=22,
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontName="Helvetica-Bold", fontSize=22, leading=26,
        textColor=HexColor("#00e0d3"), spaceBefore=10, spaceAfter=10,
    )
    h3 = ParagraphStyle(
        "H3", parent=styles["Heading3"],
        fontName="Helvetica-Bold", fontSize=15, leading=19,
        textColor=HexColor("#ff4d9d"), spaceBefore=6, spaceAfter=4,
    )

    def bg_canvas(canvas, doc):
        # dark gradient-ish background per page
        w, h = LETTER
        # solid dark backdrop
        canvas.setFillColor(HexColor("#1a0b2e"))
        canvas.rect(0, 0, w, h, fill=1, stroke=0)
        # subtle band at top
        canvas.setFillColor(HexColor("#2d1b4e"))
        canvas.rect(0, h - 1.1 * inch, w, 1.1 * inch, fill=1, stroke=0)
        # page number
        canvas.setFillColor(HexColor("#b8a8d8"))
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(w - 0.5 * inch, 0.4 * inch, f"page {doc.page}")
        canvas.drawString(0.5 * inch, 0.4 * inch, "Color Panic — How to Play")

    doc = SimpleDocTemplate(
        out_path, pagesize=LETTER,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.8 * inch, bottomMargin=0.6 * inch,
        title="Color Panic — Game Guide",
        author="Color Panic",
    )

    story = []

    # ---- Cover ----
    story.append(Spacer(1, 1.0 * inch))
    story.append(Paragraph("Color Panic 🎨", title))
    story.append(Paragraph("A local-network multiplayer party reaction game", subtitle))

    # cover image: host lobby
    lobby_img = RLImage(image_paths["host_lobby"], width=3.2 * inch, height=5.7 * inch)
    lobby_img.hAlign = "CENTER"
    story.append(lobby_img)
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph(
        "<i>The host lobby — share the room code and URL with players on the same Wi-Fi.</i>",
        ParagraphStyle("cap", parent=base_text, alignment=TA_CENTER,
                       textColor=HexColor("#b8a8d8"), fontSize=10),
    ))

    story.append(PageBreak())

    # ---- How to play ----
    story.append(Paragraph("How to play", h2))
    story.append(Paragraph(HOW_TO_PLAY, base_text))
    story.append(PageBreak())

    # ---- Rounds ----
    story.append(Paragraph("Round types", h2))
    story.append(Paragraph(
        "There are 18 round types plus a Boss-round modifier that triggers every 5 rounds. "
        "Each round below shows what the player's phone screen looks like.",
        base_text,
    ))
    story.append(Spacer(1, 0.15 * inch))

    # iterate skipping host_lobby (used on cover)
    round_entries = [r for r in ROUND_RENDERS if r[0] != "host_lobby"]

    for key, label, _fn in round_entries:
        img_path = image_paths[key]
        rl_img = RLImage(img_path, width=2.2 * inch, height=3.9 * inch)
        desc_html = ROUND_DESCRIPTIONS.get(key, "")
        text_cell = [
            Paragraph(label, h3),
            Paragraph(desc_html, base_text),
        ]
        tbl = Table(
            [[rl_img, text_cell]],
            colWidths=[2.4 * inch, 4.5 * inch],
        )
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ]))
        story.append(KeepTogether(tbl))

    # ---- Closing ----
    story.append(PageBreak())
    story.append(Paragraph("Tips for hosting", h2))
    tips = """\
• <b>Same Wi-Fi.</b> Phones must be on the same network as the host laptop. Guest networks and VLANs often block this.<br/>
• <b>Firewall.</b> On first run, allow Node.js through your firewall.<br/>
• <b>VPN off.</b> VPNs frequently break LAN routing.<br/>
• <b>Hotspot.</b> Corporate/hotel Wi-Fi often won't let phones reach the laptop. Use a personal hotspot.<br/>
• <b>Group size.</b> Most fun with 3–8 players. Solo works but Majority/Minority rounds need a crowd.<br/>
• <b>Difficulty.</b> Start everyone on Medium; ramp to Hard once people know the round types.
"""
    story.append(Paragraph(tips, base_text))

    doc.build(story, onFirstPage=bg_canvas, onLaterPages=bg_canvas)


def main():
    print("Rendering round mockups…")
    paths = save_all_images()
    out = os.path.join(OUT_DIR, "Color_Panic_Guide.pdf")
    print(f"Building PDF → {out}")
    build_pdf(paths, out)
    print("Done.")


if __name__ == "__main__":
    main()
