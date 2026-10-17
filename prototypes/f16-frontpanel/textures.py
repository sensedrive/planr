"""PROTOTYP (Ticket #10): malt Frontatlas, Leuchtmaske, MFD- und DED-Anzeigen mit Pillow."""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import layout as L

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

PANEL = (40, 42, 45)
SEAM = (22, 23, 25)
HOUSING = (26, 27, 29)
KEY = (52, 54, 57)
LABEL = (228, 228, 220)
DIAL = (12, 12, 13)


def _font(path: str, px: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(6, int(px)))


class Atlas:
    """Albedo und Leuchtmaske (Hinterleuchtung bei Nacht) teilen dieselbe planare Abbildung."""

    def __init__(self):
        size = (L.ATLAS_W, L.ATLAS_H)
        self.img = Image.new("RGB", size, PANEL)
        self.glow = Image.new("L", size, 0)
        # Detaildurchgang (#14): Höhe für die Normal-Map, Rauheit (0..255 = 0..1)
        self.height = Image.new("L", size, 128)
        self.rough = Image.new("L", size, 196)
        # Flächen unter Glas (Zifferblätter) bekommen keine Gebrauchsspuren
        self.clean = Image.new("L", size, 0)
        self.d = ImageDraw.Draw(self.img)
        self.g = ImageDraw.Draw(self.glow)
        self.hd = ImageDraw.Draw(self.height)
        self.rd = ImageDraw.Draw(self.rough)

    def box_px(self, cx, cz, w, h):
        x0, y0 = L.atlas_px(cx - w / 2, cz + h / 2)
        x1, y1 = L.atlas_px(cx + w / 2, cz - h / 2)
        return [x0, y0, x1, y1]

    def rect(self, cx, cz, w, h, fill, outline=None, width=0, rough=None):
        b = self.box_px(cx, cz, w, h)
        self.d.rectangle(b, fill=fill, outline=outline, width=width)
        if outline is not None:
            # Fugen sind Rillen: tiefer und rauer
            self.hd.rectangle(b, outline=40, width=width)
            self.rd.rectangle(b, outline=235, width=width + 2)
        if rough is not None and fill is not None:
            self.rd.rectangle(b, fill=rough)

    def worn_key(self, x, z, w, h):
        """Gummitaste: matt, in der Mitte vom Daumen blank gerieben."""
        self.rect(x, z, w, h, KEY, rough=225)
        b = self.box_px(x, z, w * 0.62, h * 0.62)
        self.rd.ellipse(b, fill=150)
        blur = self.img.crop([int(v) for v in b]).point(lambda v: min(255, int(v * 1.12)))
        mask = Image.new("L", blur.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, blur.width - 1, blur.height - 1], fill=110)
        self.img.paste(blur, (int(b[0]), int(b[1])), mask.filter(ImageFilter.GaussianBlur(4)))

    def text(self, x, z, s, h_m, color=LABEL, glow=255, font=BOLD, squeeze=0.82, anchor="mm"):
        """Text mit Höhe h_m (Meter), schmal gesetzt wie Cockpit-Stencil."""
        if not s:
            return
        lines = s.split("\n")
        px = L.m2px(h_m)
        f = _font(font, px * 1.35)
        cx, cy = L.atlas_px(x, z)
        total = len(lines) * px * 1.25
        for i, line in enumerate(lines):
            bbox = f.getbbox(line)
            tw, th = bbox[2] - bbox[0] + 4, bbox[3] - bbox[1] + 4
            tmp = Image.new("L", (tw, th), 0)
            ImageDraw.Draw(tmp).text((2 - bbox[0], 2 - bbox[1]), line, font=f, fill=255)
            tmp = tmp.resize((max(1, int(tw * squeeze)), th), Image.LANCZOS)
            ly = cy - total / 2 + (i + 0.5) * px * 1.25
            ox = cx - tmp.width / 2 if anchor == "mm" else cx
            pos = (int(ox), int(ly - tmp.height / 2))
            self.img.paste(Image.new("RGB", tmp.size, color), pos, tmp)
            # Farbe der Beschriftung trägt etwas auf und ist glatter als der Lack
            self.height.paste(150, pos + (pos[0] + tmp.width, pos[1] + tmp.height), tmp)
            self.rough.paste(150, pos + (pos[0] + tmp.width, pos[1] + tmp.height), tmp)
            if glow:
                self.glow.paste(Image.new("L", tmp.size, glow), pos, tmp)

    def line_polar(self, cx, cy, r0, r1, a, color, width, glow=True):
        s, c = math.sin(a), -math.cos(a)
        pts = [(cx + s * r0, cy + c * r0), (cx + s * r1, cy + c * r1)]
        self.d.line(pts, fill=color, width=width)
        if glow:
            self.g.line(pts, fill=230, width=width)


def seams(a: Atlas):
    """Fugen zwischen den Teilpanels."""
    w = 5
    for cx, cz in L.MFDS.values():
        a.rect(cx, cz, 0.158, 0.165, None, SEAM, w)
    a.rect(0, -0.015, 0.27, 0.215, None, SEAM, w)
    cx, cz, iw, ih = L.ICP
    a.rect(cx, cz - 0.02, iw + 0.03, ih + 0.07, None, SEAM, w)
    for cx, cz in L.EYEBROWS.values():
        a.rect(cx, cz, L.EYEBROW_SIZE[0] + 0.012, L.EYEBROW_SIZE[1] + 0.012, None, SEAM, w)
    a.rect(0, (L.Z0 + L.PANEL_TOP) / 2, 0.715, L.PANEL_TOP - L.Z0 - 0.005, None, SEAM, 7)
    # Glareshield-Kante oberhalb des Panels
    a.rect(0, (L.PANEL_TOP + L.Z1) / 2, L.X1 - L.X0, L.Z1 - L.PANEL_TOP, (18, 19, 20))


def mfd_housing(a: Atlas, cx, cz):
    a.rect(cx, cz, L.MFD, L.MFD, HOUSING)
    for x, z, w, h in L.osb_positions(cx, cz):
        a.worn_key(x, z, w, h)
    for (dx, dz), name in zip(((-1, 1), (1, 1), (-1, -1), (1, -1)), ("GAIN", "SYM", "BRT", "CON")):
        a.text(cx + dx * 0.058, cz + dz * 0.046, name, 0.0032)
        a.worn_key(cx + dx * 0.058, cz + dz * 0.058, 0.012, 0.012)


def dial(a: Atlas, kind: str, x, z):
    cx, cy = L.atlas_px(x, z)
    r = L.m2px(0.037)
    a.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DIAL)
    ImageDraw.Draw(a.clean).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    ring = L.m2px(L.GAUGE_R)
    a.d.ellipse([cx - ring, cy - ring, cx + ring, cy + ring], outline=(30, 31, 33), width=int(ring - r))
    if kind == "ASI":
        for i in range(81):
            a_ = math.radians(-150 + i * 300 / 80)
            major = i % 10 == 0
            a.line_polar(cx, cy, r * (0.78 if major else 0.86), r * 0.95, a_, LABEL, 6 if major else 3)
            if major and i:
                tx, ty = cx + math.sin(a_) * r * 0.62, cy - math.cos(a_) * r * 0.62
                a.text(L.X0 + tx / L.ATLAS_W * (L.X1 - L.X0), L.Z1 - ty / L.ATLAS_H * (L.Z1 - L.Z0), str(i // 10), 0.0055)
        a.text(x, z - 0.012, "KNOTS", 0.0028)
        a.text(x, z + 0.016, "MACH", 0.0026, color=(200, 200, 190))
        a.line_polar(cx, cy, 0, r * 0.85, math.radians(-150 + 3.5 * 37.5), LABEL, 9)
    elif kind == "ALT":
        for i in range(50):
            a_ = math.radians(i * 7.2)
            major = i % 5 == 0
            a.line_polar(cx, cy, r * (0.78 if major else 0.87), r * 0.95, a_, LABEL, 6 if major else 3)
            if major:
                tx, ty = cx + math.sin(a_) * r * 0.64, cy - math.cos(a_) * r * 0.64
                a.text(L.X0 + tx / L.ATLAS_W * (L.X1 - L.X0), L.Z1 - ty / L.ATLAS_H * (L.Z1 - L.Z0), str(i // 5), 0.0055)
        a.rect(x - 0.004, z + 0.002, 0.034, 0.011, (230, 230, 225))
        a.text(x - 0.004, z + 0.002, "12 5", 0.0065, color=(15, 15, 15), glow=0, font=MONO, squeeze=1)
        a.text(x, z - 0.024, "ALT", 0.003)
        a.line_polar(cx, cy, 0, r * 0.85, math.radians(215), LABEL, 9)
    elif kind == "ADI":
        box = [cx - r * 0.93, cy - r * 0.93, cx + r * 0.93, cy + r * 0.93]
        a.d.pieslice(box, 180, 360, fill=(170, 174, 178))
        a.d.pieslice(box, 0, 180, fill=(18, 18, 18))
        a.d.line([cx - r * 0.93, cy, cx + r * 0.93, cy], fill=(245, 245, 245), width=7)
        for p in (-20, -10, 10, 20):
            yy = cy + p * r * 0.028
            col = (20, 20, 20) if p < 0 else (230, 230, 230)
            a.d.line([cx - r * 0.25, yy, cx + r * 0.25, yy], fill=col, width=4)
        for deg in (-60, -30, -20, -10, 0, 10, 20, 30, 60):
            a.line_polar(cx, cy, r * 0.93, r * 0.99, math.radians(deg), LABEL, 5)
        orange = (255, 140, 20)
        a.d.line([cx - r * 0.5, cy, cx - r * 0.15, cy, cx - r * 0.08, cy + r * 0.08], fill=orange, width=9)
        a.d.line([cx + r * 0.5, cy, cx + r * 0.15, cy, cx + r * 0.08, cy + r * 0.08], fill=orange, width=9)
        a.g.line([cx - r * 0.5, cy, cx + r * 0.5, cy], fill=200, width=9)
    elif kind == "HSI":
        names = {0: "N", 3: "3", 6: "6", 9: "E", 12: "12", 15: "15", 18: "S", 21: "21", 24: "24", 27: "W", 30: "30", 33: "33"}
        for i in range(72):
            a_ = math.radians(i * 5)
            major = i % 2 == 0
            a.line_polar(cx, cy, r * (0.84 if major else 0.89), r * 0.95, a_, LABEL, 5 if major else 3)
            if i % 6 == 0:
                tx, ty = cx + math.sin(a_) * r * 0.70, cy - math.cos(a_) * r * 0.70
                a.text(L.X0 + tx / L.ATLAS_W * (L.X1 - L.X0), L.Z1 - ty / L.ATLAS_H * (L.Z1 - L.Z0), names[i // 2], 0.005)
        a.line_polar(cx, cy, r * 0.05, r * 0.55, 0.6, (240, 220, 60), 10)
        a.line_polar(cx, cy, r * 0.05, r * 0.55, 0.6 + math.pi, (240, 220, 60), 10)
        a.d.polygon([(cx, cy - r * 0.18), (cx - r * 0.1, cy + r * 0.12), (cx + r * 0.1, cy + r * 0.12)], fill=(240, 240, 240))
    a.text(x, z - 0.0455, {"ASI": "", "ALT": "", "ADI": "", "HSI": ""}[kind], 0.003)


def icp(a: Atlas):
    cx, cz, w, h = L.ICP
    a.rect(cx, cz, w, h, HOUSING)
    for name, big, small, x, z, kw, kh in L.icp_keys():
        a.worn_key(x, z, kw, kh)
        if small:
            a.text(x, z + kh * 0.24, small, 0.0024)
            a.text(x, z - kh * 0.15, big, 0.0052)
        else:
            a.text(x, z, big, 0.0036 if len(big) > 2 else 0.0052)
    # DCS-Wippe links, Rädchen rechts
    a.worn_key(cx - 0.072, cz - 0.0, 0.026, 0.026)
    a.text(cx - 0.072, cz + 0.02, "DCS", 0.0026)
    for i, name in enumerate(("SYM", "BRT", "DEPR\nRET")):
        a.text(cx + 0.075, cz + 0.024 - i * 0.022, name, 0.0024)
    a.text(cx - 0.072, cz - 0.026, "DRIFT C/O", 0.0024)
    a.text(cx + 0.0, L.DED[1] + L.DED[3] / 2 + 0.006, "", 0.003)


def ded_bezel(a: Atlas):
    x, z, w, h = L.DED
    a.rect(x, z, w + 0.012, h + 0.010, HOUSING)


def eyebrows(a: Atlas):
    for key, (cx, cz) in L.EYEBROWS.items():
        w, h = L.EYEBROW_SIZE
        a.rect(cx, cz, w, h, HOUSING)
        lamps = L.EYEBROW_LAMPS[key]
        cols = 2 if len(lamps) == 4 else 3
        rows = 2
        lw, lh = (w - 0.02) / cols, (h - 0.012) / rows
        for i, name in enumerate(lamps):
            r, c = divmod(i, cols)
            x = cx - w / 2 + 0.01 + (c + 0.5) * lw
            z = cz + h / 2 - 0.006 - (r + 0.5) * lh
            a.rect(x, z, lw - 0.003, lh - 0.003, (14, 14, 14))
            red = name in ("ENG FIRE", "ENGINE", "HYD/OIL\nPRESS", "FLCS", "CANOPY", "OXY LOW", "TO/LDG\nCONFIG")
            a.text(x, z, name, 0.0034, color=(95, 40, 36) if red else (95, 85, 50), glow=0)
        a.text(cx, cz - h / 2 - 0.006, "MASTER CAUTION" if key == "EYEBROW_L" else "", 0.0028)


def screw_heads(a: Atlas):
    for x, z in L.screws():
        cx, cy = L.atlas_px(x, z)
        r = L.m2px(0.0036)
        a.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(88, 90, 94), outline=(40, 41, 43), width=3)
        a.d.line([cx - r * 0.7, cy - r * 0.2, cx + r * 0.7, cy + r * 0.2], fill=(30, 30, 32), width=5)
        a.hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=175)
        a.hd.line([cx - r * 0.7, cy - r * 0.2, cx + r * 0.7, cy + r * 0.2], fill=60, width=6)
        a.rd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=110)


def placards(a: Atlas):
    a.text(-0.215, -0.112, "", 0.003)
    a.text(0.0, -0.128, "CAUTION: DO NOT STEP", 0.0025, color=(220, 200, 60), glow=0)
    a.text(-0.32, 0.20, "UHF\nBACKUP", 0.003)
    a.text(0.32, 0.20, "AR\nSTATUS", 0.003)


def _noise(shape, cell, rng):
    """Glattes Rauschen 0..1 mit Strukturgröße `cell` Pixel."""
    h, w = shape
    small = rng.random((max(2, h // cell), max(2, w // cell))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255


def weather(a: Atlas):
    """Gebrauchsspuren: fleckiger Lack, Schmutz in Fugen, Kratzer, Rauheitsvariation."""
    rng = np.random.default_rng(16)
    alb = np.asarray(a.img, dtype=np.float32)
    h = np.asarray(a.height, dtype=np.float32)
    r = np.asarray(a.rough, dtype=np.float32)
    shape = h.shape
    blotch = _noise(shape, 220, rng) * 0.6 + _noise(shape, 60, rng) * 0.4
    fine = rng.normal(0, 1, shape).astype(np.float32)
    # Schmutz sammelt sich in Rillen und Ecken: weichgezeichnete Rillenmaske
    groove = (h < 90).astype(np.uint8) * 255
    dirt = np.asarray(Image.fromarray(groove).filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) / 255
    m = 1 - np.asarray(a.clean, dtype=np.float32) / 255
    shade = 1 + m * (0.07 * (blotch - 0.5) - 0.25 * dirt + 0.012 * fine)
    alb = alb * shade[..., None]
    # feine Kratzer: kurze helle Linien, gehäuft am unteren Panelrand
    scratch = Image.new("L", (shape[1], shape[0]), 0)
    sd = ImageDraw.Draw(scratch)
    for _ in range(500):
        x, y = rng.random() * shape[1], shape[0] * (0.35 + 0.65 * rng.random() ** 0.6)
        ang, ln = rng.normal(0.2, 0.6), rng.uniform(8, 60)
        sd.line([x, y, x + math.cos(ang) * ln, y + math.sin(ang) * ln], fill=int(rng.uniform(40, 120)), width=1)
    sc = np.asarray(scratch, dtype=np.float32) / 255 * m
    alb = alb + sc[..., None] * 28
    a.img = Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8))
    # Höhe: leichte Orangenhaut im Lack, Kratzer als feine Rillen
    hf = h + m * (5 * (_noise(shape, 6, rng) - 0.5) + 1.5 * fine) - sc * 25
    a.height = Image.fromarray(np.clip(hf, 0, 255).astype(np.uint8))
    rf = r + m * (30 * (blotch - 0.5) + 35 * dirt) - sc * 40
    a.rough = Image.fromarray(np.clip(rf, 0, 255).astype(np.uint8))


def normal_from_height(height: Image.Image, strength: float) -> Image.Image:
    """Tangentenraum-Normal-Map (OpenGL/glTF: Grün zeigt nach oben) aus einer Höhenkarte."""
    hf = np.asarray(height.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    gx = np.zeros_like(hf)
    gy = np.zeros_like(hf)
    gx[:, 1:-1] = (hf[:, 2:] - hf[:, :-2]) * 0.5
    gy[1:-1, :] = (hf[:-2, :] - hf[2:, :]) * 0.5  # Bildzeilen laufen nach unten, v nach oben
    n = np.stack([-gx * strength * 10, -gy * strength * 10, np.ones_like(hf)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def build_atlas(path_albedo: str, path_glow: str, path_normal: str | None = None, path_orm: str | None = None):
    a = Atlas()
    seams(a)
    for cx, cz in L.MFDS.values():
        mfd_housing(a, cx, cz)
    for k, (x, z) in L.GAUGES.items():
        dial(a, k, x, z)
    icp(a)
    ded_bezel(a)
    eyebrows(a)
    placards(a)
    screw_heads(a)
    if path_normal:
        weather(a)
        normal_from_height(a.height, strength=float(os.environ.get("NORMAL_STRENGTH", "3.0"))).save(path_normal)
        orm = Image.merge("RGB", (Image.new("L", a.rough.size, 255), a.rough, Image.new("L", a.rough.size, 0)))
        orm.save(path_orm)
    a.img.save(path_albedo)
    a.glow.save(path_glow)


# ---- Anzeigen (eigene Texturen, selbstleuchtend) -------------------------------------------


def build_mfd(path: str, page: str, size=1024):
    img = Image.new("RGB", (size, size), (2, 4, 3))
    d = ImageDraw.Draw(img)
    f = _font(MONO, size * 0.034)
    green, white, cyan = (90, 255, 120), (235, 235, 235), (80, 220, 255)
    tops = {"HSD": ["DEP", "", "CNTL", "", "FR"], "FCR": ["CRM", "RWS", "NORM", "", "OVRD"]}[page]
    bottoms = ["SWAP", page, "SMS", "DTE", "DCLT"]
    for i, t in enumerate(tops):
        d.text((size * (0.15 + i * 0.175), size * 0.04), t, font=f, fill=green, anchor="mt")
    for i, t in enumerate(bottoms):
        d.text((size * (0.15 + i * 0.175), size * 0.96), t, font=f, fill=green, anchor="mb")
    c = size / 2
    if page == "HSD":
        for rr in (0.18, 0.32, 0.46):
            d.ellipse([c - size * rr, c + size * 0.1 - size * rr, c + size * rr, c + size * 0.1 + size * rr], outline=cyan, width=3)
        pts = [(c, c + size * 0.1), (c + size * 0.12, c - size * 0.12), (c - size * 0.05, c - size * 0.32), (c + size * 0.2, c - size * 0.4)]
        d.line(pts, fill=white, width=4)
        for p in pts[1:]:
            d.ellipse([p[0] - 10, p[1] - 10, p[0] + 10, p[1] + 10], outline=white, width=3)
        d.polygon([(c, c + size * 0.07), (c - 18, c + size * 0.13), (c + 18, c + size * 0.13)], outline=cyan, width=3)
        d.text((size * 0.08, size * 0.5), "40", font=f, fill=cyan, anchor="lm")
    else:
        for i in range(1, 4):
            x = size * (0.12 + i * 0.19)
            d.line([(x, size * 0.12), (x, size * 0.88)], fill=(40, 120, 60), width=2)
            y = size * (0.12 + i * 0.19)
            d.line([(size * 0.12, y), (size * 0.88, y)], fill=(40, 120, 60), width=2)
        d.rectangle([size * 0.12, size * 0.12, size * 0.88, size * 0.88], outline=green, width=3)
        d.text((size * 0.07, size * 0.2), "80", font=f, fill=green, anchor="lm")
        d.text((size * 0.07, size * 0.8), "A4", font=f, fill=green, anchor="lm")
        for p in ((0.4, 0.3), (0.62, 0.45)):
            x, y = size * p[0], size * p[1]
            d.rectangle([x - 12, y - 12, x + 12, y + 12], fill=white)
    img.save(path)


def build_ded(path: str, w=768, h=288):
    img = Image.new("RGB", (w, h), (3, 8, 4))
    d = ImageDraw.Draw(img)
    f = _font(MONO, h * 0.15)
    lines = ["UHF 305.00  STPT ▲ 5  ", "                    ", " VHF 1     10:24:36  ", "                    ", " M1 3 C 6400 MAN T75X"]
    for i, s in enumerate(lines):
        d.text((w * 0.04, h * (0.06 + i * 0.185)), s, font=f, fill=(110, 255, 140))
    img.save(path)


if __name__ == "__main__":
    import sys

    out = sys.argv[1] if len(sys.argv) > 1 else "out"
    build_atlas(f"{out}/front_albedo.png", f"{out}/front_glow.png")
    build_mfd(f"{out}/mfd_l.png", "HSD")
    build_mfd(f"{out}/mfd_r.png", "FCR")
    build_ded(f"{out}/ded.png")
