"""PROTOTYP (Wegwerf-Code, Ticket #10): Maße des F-16C-Block-50-Frontpanels.

Koordinaten in Metern, Blender-Achsen: x nach rechts, z nach oben, y vom Piloten weg.
Die Panelfläche liegt bei y = 0, alles Vorstehende hat negatives y.
Belegte Maße aus docs/research/f16-cockpit-referenzen.md: MFD-Gehäuse 141 mm, Anzeige 4 Zoll,
Rundinstrumente 83 mm, DED 85,7 x 31,8 mm. Alles andere ist geschätzt.
"""

# Panelfläche, gleichzeitig der Bereich des Frontatlas (planare UV)
X0, X1 = -0.36, 0.36
PANEL_TOP = 0.30
Z0, Z1 = -0.15, 0.33  # Atlas reicht bis über die Glareshield-Kante
ATLAS_W, ATLAS_H = 4096, 2730

MFD = 0.141
MFD_DISPLAY = 0.1016
MFDS = {"MFD_L": (-0.215, -0.03), "MFD_R": (0.215, -0.03)}
OSB_OFFSETS = (-0.036, -0.018, 0.0, 0.018, 0.036)
OSB_RING = 0.0593  # Abstand Tastenmitte zur MFD-Mitte

GAUGE_R = 0.0415  # 83 mm Gehäuse
GAUGES = {"ASI": (-0.095, 0.045), "ADI": (0.0, 0.045), "ALT": (0.095, 0.045), "HSI": (0.0, -0.075)}

ICP = (0.0, 0.205, 0.20, 0.10)  # Mitte x, z, Breite, Höhe
ICP_DEPTH = 0.045
ICP_TOP_KEYS = ["COM1", "COM2", "IFF", "LIST", "A-A", "A-G"]
ICP_PAD = [  # (Ziffer, Kürzel)
    [("1", "T-ILS"), ("2", "ALOW"), ("3", "")],
    [("4", "STPT"), ("5", "CRUS"), ("6", "TIME")],
    [("7", "MARK"), ("8", "FIX"), ("9", "A-CAL")],
    [("RCL", ""), ("0", "M-SEL"), ("ENTR", "")],
]
ICP_KEY = (0.022, 0.015)

DED = (0.0, 0.125, 0.0857, 0.0318)

EYEBROWS = {"EYEBROW_L": (-0.205, 0.262), "EYEBROW_R": (0.205, 0.262)}
EYEBROW_SIZE = (0.13, 0.05)
EYEBROW_LAMPS = {
    "EYEBROW_L": ["TF FAIL", "ENG FIRE", "", "ENGINE"],
    "EYEBROW_R": ["HYD/OIL\nPRESS", "FLCS", "DBU ON", "TO/LDG\nCONFIG", "CANOPY", "OXY LOW"],
}

GLARE_Z = (0.30, 0.326)
GLARE_Y = (-0.12, 0.03)
HUD_BASE = (0.15, 0.075)  # Breite, Höhe über dem Glareshield

# Augpunkt (geschätzt): 0,72 m vor dem Panel, auf Höhe der HUD-Scheibe
EYE = (0.0, -0.72, 0.44)


def atlas_px(x: float, z: float) -> tuple[float, float]:
    """Panelkoordinate -> Pixel im Frontatlas (Ursprung oben links)."""
    return (x - X0) / (X1 - X0) * ATLAS_W, (Z1 - z) / (Z1 - Z0) * ATLAS_H


def m2px(m: float) -> float:
    return m / (X1 - X0) * ATLAS_W


def osb_positions(cx: float, cz: float):
    """Mittelpunkte und Größe der 20 Option Select Buttons eines MFD."""
    out = []
    for o in OSB_OFFSETS:
        out.append((cx + o, cz + OSB_RING, 0.011, 0.008))
        out.append((cx + o, cz - OSB_RING, 0.011, 0.008))
        out.append((cx - OSB_RING, cz - o, 0.008, 0.011))
        out.append((cx + OSB_RING, cz - o, 0.008, 0.011))
    return out


def icp_keys():
    """(Name, Ziffer, Kürzel, x, z, b, h) aller ICP-Tasten."""
    cx, cz, w, h = ICP
    keys = []
    top_z = cz + h / 2 - 0.016
    for i, name in enumerate(ICP_TOP_KEYS):
        x = cx - 0.075 + i * 0.03
        keys.append((name, name, "", x, top_z, 0.024, 0.012))
    for r, row in enumerate(ICP_PAD):
        for c, (big, small) in enumerate(row):
            x = cx - 0.026 + c * 0.026
            z = cz + 0.018 - r * 0.019
            keys.append((f"K{big}", big, small, x, z, ICP_KEY[0], ICP_KEY[1]))
    return keys


def screws():
    """DZUS-Verschlüsse (x, z) an Gehäusen und Teilpanels."""
    s = []
    for cx, cz in MFDS.values():
        for dx in (-0.062, 0.062):
            for dz in (-0.062, 0.062):
                s.append((cx + dx, cz + dz))
    cx, cz, w, h = ICP
    for dx in (-w / 2 + 0.008, w / 2 - 0.008):
        for dz in (-h / 2 + 0.008, h / 2 - 0.008):
            s.append((cx + dx, cz + dz))
    for cx, cz in EYEBROWS.values():
        for dx in (-EYEBROW_SIZE[0] / 2 + 0.006, EYEBROW_SIZE[0] / 2 - 0.006):
            s.append((cx + dx, cz))
    s += [(-0.345, -0.138), (0.345, -0.138), (-0.345, 0.13), (0.345, 0.13), (-0.07, -0.138), (0.07, -0.138)]
    return s
