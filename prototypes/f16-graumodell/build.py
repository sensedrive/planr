"""PROTOTYP (Wegwerf-Code, Ticket #17): Graumodell der F-16-Kabine per Blender-Skript.

Wanne, Konsolen mit beschrifteten DZUS-Panels, Aux-Konsolen, Sitz, Sidestick, Throttle,
Pedale und Canopy, grob und ohne gebackenes Licht. Das Frontpanel aus prototypes/f16-frontpanel
lädt der Viewer dazu. Zweck: Augpunkt, Konsolenhöhe und Reichweiten in VR prüfen.

Aufruf (bpy als Python-Modul, Blender 5.2):
    python build.py <ausgabeordner>
"""

import math
import os
import sys

import bpy  # muss vor bmesh geladen werden
import bmesh
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import masse as M  # noqa: E402

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "out")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

CONSOLE_W = M.WIDE + M.NARROW
CONSOLE_X0 = M.TUB_X - CONSOLE_W
PX = 2000  # Pixel pro Meter in den Beschriftungstexturen


# ---- Materialien ---------------------------------------------------------------------------


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def material(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def textured(name, path):
    m = material(name, (255, 255, 255), 0.85)
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path)
    m.node_tree.links.new(t.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    return m


M_TUB = material("Wanne", (92, 97, 100))  # FS 36231 Dark Gull Gray, grob
M_DARK = material("Dunkel", (38, 40, 42))
M_SEAT = material("Sitz", (62, 64, 54))
M_CUSHION = material("Kissen", (48, 52, 44), 0.95)
M_BLACK = material("Griff", (22, 22, 23), 0.6)
M_YELLOW = material("Warngelb", (210, 170, 30), 0.5)
M_METAL = material("Metall", (120, 124, 128), 0.4, 0.8)
M_GLASS = material("CanopyGlas", (230, 220, 170), 0.05)
M_GLASS.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.12
M_GLASS.surface_render_method = "BLENDED"


# ---- Beschriftungstexturen -----------------------------------------------------------------


def _font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _panel(d, x0, y0, x1, y1, name):
    d.rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), fill=(30, 32, 34), outline=(70, 74, 78), width=3)
    for sx in (x0 + 9, x1 - 9):
        for sy in (y0 + 9, y1 - 9):
            d.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), fill=(110, 114, 118))
    if name:
        f = _font(20 if x1 - x0 > 200 else 15)
        d.text(((x0 + x1) / 2, y0 + 22), name, font=f, fill=(225, 225, 215), anchor="mt")
        # angedeutete Bedienelemente, damit die Größenordnung lesbar ist
        n = max(1, int((x1 - x0) // 70))
        for i in range(n):
            cx = x0 + (i + 0.5) * (x1 - x0) / n
            cy = (y0 + y1) / 2 + 12
            if y1 - y0 > 70:
                d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=(12, 12, 13), outline=(90, 94, 98), width=2)


def console_texture(path, columns, length, front_gap=0.0):
    """columns: [(Breite in m, [(Name, mm), ...]), ...] von links nach rechts aus Pilotensicht."""
    w, h = round(CONSOLE_W * PX), round(length * PX)
    img = Image.new("RGB", (w, h), (52, 55, 58))
    d = ImageDraw.Draw(img)
    x = 0
    for width, panels in columns:
        y = front_gap * PX
        for name, mm in panels:
            ph = mm / 1000 * PX
            if y + ph > h:
                break
            _panel(d, x, y, x + width * PX, y + ph, name)
            y += ph
        x += width * PX
    img.save(path)
    return path


def aux_texture(path, labels):
    w = round(math.hypot(M.TUB_X - M.PANEL_X, M.AUX_BACK) * PX)
    h = round((M.AUX_Z[1] - M.AUX_Z[0]) * PX)
    img = Image.new("RGB", (w, h), (52, 55, 58))
    d = ImageDraw.Draw(img)
    y = 6
    for name, frac in labels:
        ph = frac * h
        _panel(d, 4, y, w - 4, y + ph - 4, name)
        y += ph
    img.save(path)
    return path


# ---- Geometrie-Helfer ----------------------------------------------------------------------

PARTS: list[bpy.types.Object] = []


def _done(o, mat):
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    PARTS.append(o)
    return o


def box(name, x0, x1, y0, y1, z0, z1, mat, rot=None):
    """Quader über seine Grenzen; rot = (Achse, Grad) dreht um den Mittelpunkt."""
    r = (0, 0, 0)
    if rot:
        a = math.radians(rot[1])
        r = {"X": (a, 0, 0), "Y": (0, a, 0), "Z": (0, 0, a)}[rot[0]]
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), rotation=r)
    o = bpy.context.object
    o.name = name
    o.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    return _done(o, mat)


def cyl(name, x, y, z, r, depth, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.name = name
    return _done(o, mat)


def quad(name, corners, mat):
    """Ebenes Viereck mit UV 0..1; corners = Bildecken oben-links, oben-rechts, unten-rechts, unten-links,
    so wie der Pilot die Fläche sieht. Die Normale zeigt dann zum Piloten."""
    tl, tr, br, bl = corners
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in (bl, br, tr, tl)]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = t
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    PARTS.append(o)
    return o


def tube(name, points, radius, mat):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (*c, 1)
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.select_set(False)
    o.data.materials.append(mat)
    PARTS.append(o)
    return o


# ---- Wanne ---------------------------------------------------------------------------------

T = 0.02
box("Boden", -M.TUB_X, M.TUB_X, M.REAR_Y, 0.62, M.FLOOR_Z - T, M.FLOOR_Z, M_TUB)
box("Schott", -M.TUB_X, M.TUB_X, M.REAR_Y - T, M.REAR_Y, M.FLOOR_Z, M.SILL_Z, M_TUB)
for s in (-1, 1):
    box(f"Wand_{s}", s * M.TUB_X, s * (M.TUB_X + T), M.REAR_Y, 0.62, M.FLOOR_Z, M.SILL_Z, M_TUB)
    box(f"Schiene_{s}", s * (M.TUB_X - 0.01), s * (M.TUB_X + 0.05), M.REAR_Y, 0.30, M.SILL_Z, M.SILL_Z + 0.025, M_DARK)
# Instrumentenschacht hinter dem Frontpanel und Fußraum darunter
box("Schacht", -M.PANEL_X, M.PANEL_X, 0.0, 0.62, M.PANEL_BOTTOM - 0.03, M.PANEL_BOTTOM, M_DARK)
box("Fussraum", -M.TUB_X, M.TUB_X, 0.62, 0.64, M.FLOOR_Z, M.PANEL_BOTTOM, M_DARK)

# ---- Konsolen ------------------------------------------------------------------------------

length = M.CONSOLE_FRONT - M.REAR_Y
tex_l = console_texture(f"{OUT}/konsole_links.png", [(M.NARROW, M.LEFT_NARROW), (M.WIDE, M.LEFT_WIDE)], length)
tex_r = console_texture(f"{OUT}/konsole_rechts.png", [(M.WIDE, M.RIGHT_WIDE), (M.NARROW, M.RIGHT_NARROW)], length, M.RIGHT_FRONT_GAP)
for s, tex in ((-1, tex_l), (1, tex_r)):
    xi, xo = s * CONSOLE_X0, s * M.TUB_X
    box(f"Konsole_{s}", xi, xo, M.REAR_Y, M.CONSOLE_FRONT, M.FLOOR_Z, M.CONSOLE_Z - 0.001, M_TUB)
    z = M.CONSOLE_Z
    # Bild oben = vorn, Bild links = links aus Pilotensicht
    xl, xr = min(xi, xo), max(xi, xo)
    quad(f"KonsolePanels_{s}", [(xl, M.CONSOLE_FRONT, z), (xr, M.CONSOLE_FRONT, z), (xr, M.REAR_Y, z), (xl, M.REAR_Y, z)],
         textured(f"KonsoleTex_{s}", tex))

# Aux-Konsolen: schräge Flächen vom Frontpanelrand zur Seitenwand
aux_l = aux_texture(f"{OUT}/aux_links.png", [("CMDS", 0.25), ("GEAR", 0.45), ("ALT GEAR", 0.3)])
aux_r = aux_texture(f"{OUT}/aux_rechts.png", [("CAUTION", 0.35), ("PFLD", 0.15), ("FUEL QTY", 0.25), ("CLOCK", 0.25)])
for s, tex in ((-1, aux_l), (1, aux_r)):
    a, b = (s * M.PANEL_X, 0.0), (s * M.TUB_X, M.AUX_BACK)
    z0, z1 = M.AUX_Z
    left, right = (b, a) if s < 0 else (a, b)
    c = [(left[0], left[1], z1), (right[0], right[1], z1), (right[0], right[1], z0), (left[0], left[1], z0)]
    quad(f"Aux_{s}", c, textured(f"AuxTex_{s}", tex))
    # Rückwand, damit von außen nichts durchscheint
    box(f"AuxFuell_{s}", s * M.PANEL_X, s * M.TUB_X, 0.005, 0.12, z0, z1, M_DARK)

# Fahrwerkshebel links an der Aux-Konsole
gx, gy = -0.43, -0.065
cyl("GEAR_HANDLE", gx + 0.03, gy - 0.025, 0.02, 0.006, 0.07, M_METAL, rot=(0, math.pi / 2, 0.6))
cyl("GEAR_KNOB", gx + 0.065, gy - 0.05, 0.02, 0.018, 0.03, M_YELLOW, rot=(0, math.pi / 2, 0.6))

# ---- Sitz (ACES II, grob) ------------------------------------------------------------------

hw = M.SEAT_W / 2
box("Sitzwanne", -hw, hw, M.SEAT_REAR, M.SEAT_FRONT, M.FLOOR_Z + 0.12, M.SEAT_Z - 0.08, M_SEAT)
box("Sitzkissen", -hw + 0.03, hw - 0.03, M.SEAT_REAR, M.SEAT_FRONT, M.SEAT_Z - 0.08, M.SEAT_Z, M_CUSHION)
tilt = math.radians(M.BACK_TILT)
dy, dz = -math.sin(tilt), math.cos(tilt)
mid = M.BACK_LEN / 2
bx = M.SEAT_REAR + dy * mid - math.cos(tilt) * 0.05
bz = M.SEAT_Z + dz * mid - math.sin(tilt) * 0.05
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, bx, bz), rotation=(tilt, 0, 0))
o = bpy.context.object
o.name = "Lehne"
o.scale = (M.SEAT_W, 0.08, M.BACK_LEN)
_done(o, M_SEAT)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, bx + 0.045 * math.cos(tilt), bz + 0.045 * math.sin(tilt) - 0.05), rotation=(tilt, 0, 0))
o = bpy.context.object
o.name = "Rueckenkissen"
o.scale = (M.SEAT_W - 0.08, 0.04, M.BACK_LEN - 0.25)
_done(o, M_CUSHION)
# Kopfstütze am oberen Ende der Lehne
top_y, top_z = M.SEAT_REAR + dy * M.BACK_LEN, M.SEAT_Z + dz * M.BACK_LEN
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, top_y + 0.02, top_z - 0.06), rotation=(tilt, 0, 0))
o = bpy.context.object
o.name = "Kopfstuetze"
o.scale = (0.30, 0.12, 0.22)
_done(o, M_SEAT)
# Schleudergriff zwischen den Knien (gelb-schwarz)
tube("EJECT_HANDLE", [(-0.06, M.SEAT_FRONT + 0.005, M.SEAT_Z - 0.06), (-0.06, M.SEAT_FRONT + 0.03, M.SEAT_Z - 0.02),
                      (0.06, M.SEAT_FRONT + 0.03, M.SEAT_Z - 0.02), (0.06, M.SEAT_FRONT + 0.005, M.SEAT_Z - 0.06)], 0.008, M_YELLOW)

# ---- Sidestick und Armlehne ----------------------------------------------------------------

sx, sy = M.STICK
box("Stick_Sockel", sx - 0.05, sx + 0.05, sy - 0.06, sy + 0.08, M.CONSOLE_Z, M.STICK_BASE_Z, M_DARK)
ax, ay0, ay1, az = M.ARMREST
box("Armlehne", ax - 0.045, ax + 0.045, ay0, ay1, az - 0.04, az, M_CUSHION)
box("Armlehne_Stuetze", ax - 0.03, ax + 0.03, ay0 + 0.05, ay1 - 0.03, M.CONSOLE_Z, az - 0.04, M_DARK)
# Griff leicht nach hinten geneigt, damit die Hand natürlich darauf liegt
cyl("STICK", sx, sy, M.STICK_BASE_Z + M.STICK_GRIP / 2, 0.018, M.STICK_GRIP, M_BLACK, rot=(math.radians(-12), 0, 0))
cyl("STICK_Kopf", sx, sy - 0.012, M.STICK_BASE_Z + M.STICK_GRIP + 0.012, 0.022, 0.03, M_BLACK, rot=(math.radians(-12), 0, 0))

# ---- Throttle ------------------------------------------------------------------------------

ty0, ty1 = M.THROTTLE_RAIL
tx = M.THROTTLE_X
box("Throttle_Schiene", tx - 0.025, tx + 0.025, ty0 - 0.03, ty1 + 0.03, M.CONSOLE_Z, M.CONSOLE_Z + 0.03, M_DARK)
box("Throttle_Arm", tx - 0.012, tx + 0.012, ty0 - 0.01, ty0 + 0.01, M.CONSOLE_Z + 0.03, M.THROTTLE_Z - 0.03, M_METAL)
box("THROTTLE", tx - 0.03, tx + 0.025, ty0 - 0.035, ty0 + 0.045, M.THROTTLE_Z - 0.035, M.THROTTLE_Z + 0.04, M_BLACK)

# ---- Pedale --------------------------------------------------------------------------------

px, py, pz = M.PEDALS
for s in (-1, 1):
    box(f"Pedal_{s}", s * px - 0.05, s * px + 0.05, py, py + 0.02, pz - 0.10, pz + 0.10, M_DARK, rot=("X", -20))

# ---- Canopy --------------------------------------------------------------------------------

cx, cy, cz = M.CANOPY_C
rx, ry, rz = M.CANOPY_R
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, 0, 0))
o = bpy.context.object
o.name = "Canopy"
bm = bmesh.new()
bm.from_mesh(o.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS")
for v in bm.verts:
    v.co = (cx + v.co.x * rx, cy + v.co.y * ry, cz + v.co.z * rz)
bm.to_mesh(o.data)
bm.free()
for p in o.data.polygons:
    p.use_smooth = True
o.data.materials.append(M_GLASS)
PARTS.append(o)
# Canopy-Bogen hinter dem Kopf
k = math.sqrt(max(0.0, 1 - ((M.CANOPY_BOW_Y - cy) / ry) ** 2))
arc = [(k * rx * math.cos(a), M.CANOPY_BOW_Y, cz + k * rz * math.sin(a)) for a in [math.pi * i / 24 for i in range(25)]]
tube("Canopy_Bogen", arc, 0.025, M_DARK)
# Rahmen entlang der Schiene
for s in (-1, 1):
    pts = []
    for i in range(21):
        y = cy - ry * 0.98 + i * (2 * ry * 0.98) / 20
        kk = math.sqrt(max(0.0, 1 - ((y - cy) / ry) ** 2))
        pts.append((s * kk * rx, y, cz + 0.01))
    tube(f"Canopy_Rahmen_{s}", pts, 0.015, M_DARK)

# ---- Rumpf außen, nur zur Orientierung -----------------------------------------------------

bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.55, radius2=0.04, depth=4.2, location=(0, 0.62 + 2.1, -0.25), rotation=(-math.pi / 2, 0, 0))
o = bpy.context.object
o.name = "Nase"
o.scale = (1, 1, 0.75)
_done(o, M_TUB)
box("Ruecken", -0.42, 0.42, -6.0, M.REAR_Y, M.FLOOR_Z, M.SILL_Z - 0.02, M_TUB)

# ---- Export --------------------------------------------------------------------------------

for o in bpy.data.objects:
    o.select_set(o in PARTS)
bpy.ops.export_scene.gltf(
    filepath=f"{OUT}/f16_graumodell.glb",
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_image_format="AUTO",
)
print("fertig:", OUT, len(PARTS), "Teile")
