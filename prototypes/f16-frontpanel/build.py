"""PROTOTYP (Wegwerf-Code, Ticket #10): baut das F-16C-Frontpanel per Skript in Blender,
backt Ambient Occlusion auf eine zweite UV und exportiert ein GLB.

Aufruf (bpy als Python-Modul, Blender 5.2):
    python build.py <ausgabeordner>
"""

import math
import os
import sys

import bpy  # muss vor bmesh geladen werden
import bmesh
import mathutils

sys.path.insert(0, os.path.dirname(__file__))
import layout as L  # noqa: E402
import textures  # noqa: E402

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "out")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---- Materialien ---------------------------------------------------------------------------


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def material(name, color, rough=0.75, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def image_node(m, img, uv_name, loc):
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.location = loc
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    uv.location = (loc[0] - 250, loc[1])
    nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
    return t


def load_image(path, non_color=False):
    img = bpy.data.images.load(path)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


textures.build_atlas(f"{OUT}/front_albedo.png", f"{OUT}/front_glow.png")
textures.build_mfd(f"{OUT}/mfd_l.png", "HSD")
textures.build_mfd(f"{OUT}/mfd_r.png", "FCR")
textures.build_ded(f"{OUT}/ded.png")

ATLAS = material("FrontAtlas", (255, 255, 255), 0.72)
_b = ATLAS.node_tree.nodes["Principled BSDF"]
_alb = image_node(ATLAS, load_image(f"{OUT}/front_albedo.png"), "UVMap", (-400, 300))
ATLAS.node_tree.links.new(_alb.outputs["Color"], _b.inputs["Base Color"])
_glow = image_node(ATLAS, load_image(f"{OUT}/front_glow.png"), "UVMap", (-400, -100))
ATLAS.node_tree.links.new(_glow.outputs["Color"], _b.inputs["Emission Color"])
_b.inputs["Emission Strength"].default_value = 1.0

M_PANEL = material("PanelSide", (34, 36, 38), 0.8)
M_HOUSING = material("Housing", (24, 25, 27), 0.6)
M_KEY = material("Rubber", (46, 48, 50), 0.85)
M_GLARE = material("Glareshield", (16, 17, 18), 0.95)
M_METAL = material("Fastener", (95, 98, 102), 0.45, 0.8)


def display_material(name, path):
    m = material(name, (0, 0, 0), 0.25)
    b = m.node_tree.nodes["Principled BSDF"]
    t = image_node(m, load_image(path), "UVMap", (-400, 0))
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    return m


def glass_material(name, alpha, tint=(200, 230, 210)):
    m = material(name, tint, 0.05)
    m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = alpha
    m.surface_render_method = "BLENDED"
    return m


M_GLASS = glass_material("GaugeGlass", 0.12, (220, 225, 230))
M_COMBINER = glass_material("Combiner", 0.18)


# ---- Geometrie-Helfer ----------------------------------------------------------------------

STATIC: list[bpy.types.Object] = []  # wird gebacken und zu einem Mesh vereint
SEPARATE: list[bpy.types.Object] = []  # Anzeigen und Glas bleiben eigene Objekte


def _finish(o, mat, bevel, segments=2):
    o.data.materials.append(mat)
    # alles in Weltkoordinaten backen: die planare Atlas-UV rechnet mit den Vertexpositionen
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="bevel")
    return o


def box(name, x, y, z, sx, sy, sz, mat, bevel=0.0, rot=(0, 0, 0), static=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    _finish(o, mat, bevel)
    (STATIC if static else SEPARATE).append(o)
    return o


def cyl(name, x, y, z, r, depth, mat, bevel=0.0, verts=48, axis="Y", static=True):
    rot = {"Y": (math.pi / 2, 0, 0), "X": (0, math.pi / 2, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.name = name
    _finish(o, mat, bevel)
    (STATIC if static else SEPARATE).append(o)
    return o


def cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier="cut")
    if cutter in STATIC:
        STATIC.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)


def plane(name, x, y, z, w, h, mat, tilt=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z), rotation=(math.pi / 2 + tilt, 0, 0))
    o = bpy.context.object
    o.name = name
    o.scale = (w, h, 1)
    # Fläche soll zum Piloten (-y) zeigen; die Standard-UV läuft 0..1 über die Fläche
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for p in o.data.polygons:
        if p.normal.y > 0:
            o.data.flip_normals()
            break
    SEPARATE.append(o)
    return o


# ---- Modell --------------------------------------------------------------------------------

PANEL_Y = (0.0, 0.03)
panel = box("Panel", 0, 0.015, (L.Z0 + L.PANEL_TOP) / 2, L.X1 - L.X0, 0.03, L.PANEL_TOP - L.Z0, M_PANEL)

# Rundinstrumente: Vertiefung im Panel, Zifferblatt, Lünette, Glas
for name, (x, z) in L.GAUGES.items():
    cut(panel, cyl(f"{name}_hole", x, 0.005, z, 0.037, 0.016, M_PANEL))
    cyl(f"{name}_face", x, 0.0115, z, 0.037, 0.002, M_PANEL, verts=64)
    ring = cyl(f"{name}_bezel", x, -0.003, z, L.GAUGE_R, 0.006, M_HOUSING, verts=64)
    cut(ring, cyl(f"{name}_bezel_in", x, -0.003, z, 0.0368, 0.02, M_HOUSING, verts=64))
    _bevel = ring.modifiers.new("b", "BEVEL")
    _bevel.width, _bevel.segments, _bevel.limit_method = 0.0012, 2, "ANGLE"
    bpy.context.view_layer.objects.active = ring
    bpy.ops.object.modifier_apply(modifier="b")
    cyl(f"{name}_glass", x, -0.0015, z, 0.037, 0.0005, M_GLASS, static=False, verts=64)

# MFDs: Gehäuse mit Anzeigevertiefung, 20 OSBs, vier Wippen
MFD_FRONT = -0.03
for name, (cx, cz) in L.MFDS.items():
    h = box(f"{name}_housing", cx, MFD_FRONT / 2, cz, L.MFD, -MFD_FRONT, L.MFD, M_HOUSING, bevel=0.003)
    cut(h, box(f"{name}_recess", cx, MFD_FRONT, cz, L.MFD_DISPLAY + 0.004, 0.012, L.MFD_DISPLAY + 0.004, M_HOUSING))
    for i, (x, z, w, hh) in enumerate(L.osb_positions(cx, cz)):
        box(f"{name}_osb{i}", x, MFD_FRONT - 0.0025, z, w, 0.005, hh, M_KEY, bevel=0.0012)
    for dx in (-1, 1):
        for dz in (-1, 1):
            box(f"{name}_rocker", cx + dx * 0.058, MFD_FRONT - 0.003, cz + dz * 0.058, 0.012, 0.006, 0.012, M_KEY, bevel=0.002)
    plane(f"{name}_display", cx, MFD_FRONT + 0.0055, cz, L.MFD_DISPLAY, L.MFD_DISPLAY,
          display_material(f"{name}_page", f"{OUT}/{name.lower().replace('mfd_', 'mfd_')}.png"))

# ICP mit Tasten, DCS-Wippe, Rädchen und Drift-Cutout-Schalter
icx, icz, iw, ih = L.ICP
ICP_FRONT = -L.ICP_DEPTH
box("ICP", icx, ICP_FRONT / 2, icz, iw, L.ICP_DEPTH, ih, M_HOUSING, bevel=0.004)
for name, big, small, x, z, kw, kh in L.icp_keys():
    box(f"ICP_{name}", x, ICP_FRONT - 0.003, z, kw, 0.006, kh, M_KEY, bevel=0.0015)
box("ICP_DCS", icx - 0.072, ICP_FRONT - 0.004, icz, 0.026, 0.008, 0.026, M_KEY, bevel=0.004)
for i in range(3):
    cyl(f"ICP_wheel{i}", icx + 0.088, ICP_FRONT - 0.002, icz + 0.024 - i * 0.022, 0.009, 0.007, M_KEY, axis="X", verts=24, bevel=0.001)
cyl("ICP_drift_base", icx - 0.072, ICP_FRONT - 0.002, icz - 0.04, 0.005, 0.004, M_METAL, bevel=0.0008)
lever = cyl("ICP_drift_lever", icx - 0.072, ICP_FRONT - 0.009, icz - 0.036, 0.0016, 0.016, M_METAL, verts=16)
_pivot = mathutils.Vector((icx - 0.072, ICP_FRONT - 0.009, icz - 0.036))
lever.data.transform(mathutils.Matrix.Translation(_pivot) @ mathutils.Matrix.Rotation(math.radians(-25), 4, "X") @ mathutils.Matrix.Translation(-_pivot))

# DED unter dem ICP
dx, dz, dw, dh = L.DED
ded = box("DED_bezel", dx, -0.015, dz, dw + 0.012, 0.03, dh + 0.010, M_HOUSING, bevel=0.002)
cut(ded, box("DED_recess", dx, -0.03, dz, dw, 0.012, dh, M_HOUSING))
plane("DED_display", dx, -0.0245, dz, dw, dh, display_material("DED_page", f"{OUT}/ded.png"))

# Eyebrow-Warnleuchten
for key, (cx, cz) in L.EYEBROWS.items():
    w, h = L.EYEBROW_SIZE
    box(key, cx, -0.006, cz, w, 0.012, h, M_HOUSING, bevel=0.002)
    lamps = L.EYEBROW_LAMPS[key]
    cols = 2 if len(lamps) == 4 else 3
    lw, lh = (w - 0.02) / cols, (h - 0.012) / 2
    for i in range(len(lamps)):
        r, c = divmod(i, cols)
        x = cx - w / 2 + 0.01 + (c + 0.5) * lw
        z = cz + h / 2 - 0.006 - (r + 0.5) * lh
        box(f"{key}_lamp{i}", x, -0.014, z, lw - 0.003, 0.004, lh - 0.003, M_KEY, bevel=0.0008)

# DZUS-Verschlüsse auf der jeweiligen Oberfläche
def host_front(x, z):
    for cx, cz in L.MFDS.values():
        if abs(x - cx) < L.MFD / 2 and abs(z - cz) < L.MFD / 2:
            return MFD_FRONT
    if abs(x - icx) < iw / 2 and abs(z - icz) < ih / 2:
        return ICP_FRONT
    for cx, cz in L.EYEBROWS.values():
        if abs(x - cx) < L.EYEBROW_SIZE[0] / 2 and abs(z - cz) < L.EYEBROW_SIZE[1] / 2:
            return -0.012
    return 0.0


for i, (x, z) in enumerate(L.screws()):
    cyl(f"dzus{i}", x, host_front(x, z) - 0.0008, z, 0.0036, 0.0016, M_METAL, verts=20, bevel=0.0006)

# Glareshield mit gerundeter Vorderkante und HUD
gz0, gz1 = L.GLARE_Z
gy0, gy1 = L.GLARE_Y
box("Glareshield", 0, (gy0 + gy1) / 2, (gz0 + gz1) / 2, L.X1 - L.X0 + 0.02, gy1 - gy0, gz1 - gz0, M_GLARE, bevel=0.011)
hw, hh = L.HUD_BASE
box("HUD_base", 0, -0.055, gz1 + hh / 2, hw, 0.11, hh, M_HOUSING, bevel=0.006)
for sx in (-1, 1):
    box("HUD_post", sx * (hw / 2 - 0.008), -0.078, gz1 + hh + 0.05, 0.010, 0.012, 0.10, M_HOUSING, bevel=0.002)
box("HUD_top", 0, -0.078, gz1 + hh + 0.101, hw - 0.006, 0.012, 0.008, M_HOUSING, bevel=0.002)
plane("HUD_combiner", 0, -0.08, gz1 + hh + 0.05, hw - 0.026, 0.094, M_COMBINER, tilt=math.radians(-12))
plane("HUD_combiner2", 0, -0.068, gz1 + hh + 0.05, hw - 0.026, 0.094, M_COMBINER, tilt=math.radians(-12))


# ---- Vereinen, UVs, Materialien je Fläche --------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
for o in STATIC:
    o.select_set(True)
bpy.context.view_layer.objects.active = panel
bpy.ops.object.join()
panel.name = "FrontPanel"
mesh = panel.data

if ATLAS.name not in [m.name for m in mesh.materials]:
    mesh.materials.append(ATLAS)
atlas_index = [m.name for m in mesh.materials].index(ATLAS.name)

bm = bmesh.new()
bm.from_mesh(mesh)
uv = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for loop in f.loops:
        co = loop.vert.co
        loop[uv].uv = ((co.x - L.X0) / (L.X1 - L.X0), (co.z - L.Z0) / (L.Z1 - L.Z0))
    # nur pilotenwärts zeigende Flächen innerhalb des Atlasbereichs (nicht das HUD darüber)
    if f.normal.y < -0.95 and f.calc_center_median().z < L.Z1:
        f.material_index = atlas_index
bm.to_mesh(mesh)
bm.free()

# zweite UV für die gebackene Occlusion
lm = mesh.uv_layers.new(name="LM")
mesh.uv_layers.active = lm
bpy.ops.object.select_all(action="DESELECT")
panel.select_set(True)
bpy.context.view_layer.objects.active = panel
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=1.0)
bpy.ops.object.mode_set(mode="OBJECT")

print(f"FrontPanel: {len(mesh.polygons)} Flächen, {sum(len(p.vertices) - 2 for p in mesh.polygons)} Dreiecke, {len(mesh.materials)} Materialien")


# ---- AO backen -----------------------------------------------------------------------------

AO_SIZE = 2048
ao_img = bpy.data.images.new("FrontPanel_AO", AO_SIZE, AO_SIZE)
ao_img.colorspace_settings.name = "Non-Color"
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(os.environ.get("AO_SAMPLES", "96"))
scene.world = bpy.data.worlds.new("World")
scene.world.light_settings.distance = 0.06

ao_nodes = {}
for m in mesh.materials:
    t = image_node(m, ao_img, "LM", (-400, -500))
    m.node_tree.nodes.active = t
    ao_nodes[m.name] = t

scene.render.bake.margin = 6
bpy.ops.object.bake(type="AO", margin=6)
ao_img.filepath_raw = f"{OUT}/front_ao.png"
ao_img.file_format = "PNG"
ao_img.save()


# ---- Occlusion für den glTF-Export verdrahten ----------------------------------------------

def gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


group = gltf_output_group()
for m in mesh.materials:
    nt = m.node_tree
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(ao_nodes[m.name].outputs["Color"], sep.inputs["Color"])
    gn = nt.nodes.new("ShaderNodeGroup")
    gn.node_tree = group
    nt.links.new(sep.outputs["Red"], gn.inputs["Occlusion"])

mesh.uv_layers.active = mesh.uv_layers["UVMap"]
mesh.uv_layers["UVMap"].active_render = True


# ---- Export --------------------------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
for o in [panel, *SEPARATE]:
    # Tangenten (für spätere Normal-Maps) rechnet der Exporter nur auf Dreiecken
    tbm = bmesh.new()
    tbm.from_mesh(o.data)
    bmesh.ops.triangulate(tbm, faces=tbm.faces[:])
    tbm.to_mesh(o.data)
    tbm.free()
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=f"{OUT}/f16_frontpanel.glb",
    export_format="GLB",
    use_selection=True,
    export_tangents=True,
    export_texcoords=True,
    export_normals=True,
    export_yup=True,
)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/f16_frontpanel.blend")
print("fertig:", OUT)
