"""PROTOTYP (Wegwerf-Code, Ticket #17): alle Maße des Graumodells an einer Stelle.

Koordinaten in Metern, Blender-Achsen wie beim Frontpanel: x nach rechts, y vom Piloten weg
(nach vorn), z nach oben. Die Frontpanelfläche liegt bei y = 0.
Fast alles hier ist geschätzt (docs/research/f16-cockpit-referenzen.md, Abschnitt 2.3);
belegt sind nur Panelbreiten und -höhen der Konsolen und die 30° Lehnenneigung.
"""

# Augpunkt wie im Frontpanel-Prototyp
EYE = (0.0, -0.72, 0.44)

# Wanne
TUB_X = 0.50  # Innenseite der Seitenwände
FLOOR_Z = -0.65
SILL_Z = 0.05  # Oberkante Seitenwand / Canopy-Schiene
REAR_Y = -1.15  # Schott hinter dem Sitz
PANEL_X = 0.36  # halbe Breite des Frontpanels
PANEL_BOTTOM = -0.15

# Konsolen: Oberkante etwa auf Sitzhöhe
CONSOLE_Z = -0.22
CONSOLE_X0 = 0.27  # Innenkante (Abstand zur Mitte)
CONSOLE_FRONT = -0.08
WIDE, NARROW = 0.1455, 0.0756  # DZUS-Panelbreiten [Nachbauer]

# Panels von vorn nach hinten: (Name, Höhe in mm); Reihenfolge geschätzt, Höhen laut xflight
LEFT_WIDE = [
    ("FLCS", 123.8), ("MANUAL TRIM", 104.8), ("FUEL", 57.2), ("AUX COMM", 95.3), ("AUDIO 1", 76.2),
    ("AUDIO 2", 38.1), ("EXT LIGHTING", 85.8), ("EPU", 123.8), ("UHF", 123.8), ("AVTR", 57.2),
    ("ECM", 66.7), ("", 38.1),
]
LEFT_NARROW = [("ANTI G", 145.7), ("TEST", 145.5), ("MAN PITCH", 66.7), ("", 250.0), ("ELEC", 93.6), ("ENG START", 200.0)]
RIGHT_FRONT_GAP = 0.30  # vorn rechts steht der Sidestick auf seinem Sockel
RIGHT_WIDE = [
    ("SNSR PWR", 37.3), ("HUD", 66.7), ("INT LIGHTING", 114.3), ("AIR COND", 57.2), ("OXYGEN", 76.2),
    ("AVIONICS PWR", 95.3), ("ANTI ICE", 38.1), ("KY-58", 123.8), ("DTU", 114.3),
]
RIGHT_NARROW = [("ZEROIZE", 200.0), ("", 200.0), ("", 200.0)]

# Aux-Konsolen zwischen Frontpanel und Seitenwand, schräg zum Piloten gedreht
AUX_Z = (-0.20, 0.26)
AUX_BACK = -0.12  # y der Außenkante an der Seitenwand

# ACES II, Lehne 30° gegen die Senkrechte [belegt]
SEAT_Z = -0.28  # Oberkante Sitzkissen
SEAT_FRONT, SEAT_REAR = -0.18, -0.62
SEAT_W = 0.46
BACK_TILT = 30.0
BACK_LEN = 0.88

# Sidestick auf der rechten Konsole, Armlehne dahinter
STICK = (0.36, -0.27)  # x, y Griffmitte
STICK_BASE_Z = -0.14
STICK_GRIP = 0.12  # Grifflänge
ARMREST = (0.36, -0.62, -0.36, -0.16)  # x, y hinten, y vorn, Oberkante z

# Throttle über der linken Konsole, Schiene längs
THROTTLE_X = -0.37
THROTTLE_RAIL = (-0.48, -0.30)  # y von Leerlauf bis Nachbrenner
THROTTLE_Z = -0.09  # Griffmitte

# Pedale
PEDALS = (0.13, 0.32, -0.52)  # x-Abstand, y, z

# Canopy: Ellipsoid über der Schiene
CANOPY_C = (0.0, -0.30, SILL_Z)
CANOPY_R = (TUB_X, 1.30, 0.72)  # Halbachsen x, y, z
CANOPY_BOW_Y = -0.95
