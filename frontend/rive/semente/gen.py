"""Generates scene.rml for Mavva's seed mascot (Rive CLI project).

Run `python3 gen.py && rive . --verify`. Everything keyed by an animation or
referenced by the state machine gets a fixed id here, so rebuilds are stable.
"""

from __future__ import annotations

import hashlib
import math
import os
import xml.etree.ElementTree as ET
from pathlib import Path

PI = math.pi
# Face position, tuned by hand in the Rive editor (pulled back from file 2675080).
FACE_X, FACE_Y = 3, -28
# Where the feet touch the ground; the artboard leaves ~100px above the sprout for jumps.
GROUND = 448
HEIGHT = 480
# Debug only: which state the mood layer enters first, and the starting gaze
# (LOOKX/LOOKY env vars) - captures can't fire triggers or set inputs.
START = {"idle": "0:80", "happy": "0:81", "sad": "0:82", "celebrate": "0:83"}[os.environ.get("START", "idle")]

# --- palette: the green seed of Mavva's icon (public/manna.svg) ---
BODY_HI = "FFB4E8A4"
BODY_MID = "FF57B663"
BODY_LO = "FF2E8A3C"
BODY_DEEP = "FF1F6B2C"
BELLY = "FF8DD295"
BELLY_HI = "FFBCE6C0"
RIM = "FFF1F8C6"          # warm backlight along the top-right edge
EYE_WHITE = "FFFEFAEC"
PUPIL = "FF2B3229"
IRIS_LOW = "FF4F6E52"
MOUTH_LINE = "FF2E7A3A"   # resting smile and frown: a darker shade of the body
MOUTH_IN = "FF2A0F0B"
TONGUE = "FFD04556"
# Iris: near-black at the top fading to a glowing orange at the bottom.
IRIS_TOP = "FF1E0B05"
IRIS_DARK = "FF3D1508"
IRIS_MID = "FF8A2E0C"
IRIS_GLOW = "FFE8671A"
PUPIL_Y = 1               # rest height of the iris; "sad" drops it to look down
LEAF_BASE = "FF329A40"
LEAF_MID = "FF8DD295"
LEAF_TIP = "FFBCE6C0"
STEM = "FF237D31"
VEIN = "FF237D31"
FOOT = "FF2E8A3C"
SPARK = "FFFFD54A"

def fill(color: str, *, feather: float | None = None, opacity_hex: str | None = None) -> str:
    rule = ' fillRule="clockwise"' if feather else ""
    f = f'<Feather strength="{feather}" name="Feather"/>' if feather else ""
    return f'<Fill{rule} name="Fill"><SolidColor colorValue="{color}" name="Color"/>{f}</Fill>'


def stroke(color: str, thickness: float) -> str:
    return (
        f'<Stroke thickness="{thickness}" cap="round" join="round" name="Stroke">'
        f'<SolidColor colorValue="{color}" name="Color"/></Stroke>'
    )


def ellipse(name: str, x: float, y: float, w: float, h: float, paint: str, *, sid: str = "",
            rotation: float = 0, opacity: float = 1) -> str:
    ident = f' id="{sid}"' if sid else ""
    return (
        f'<Shape x="{x}" y="{y}" rotation="{rotation}" opacity="{opacity}" name="{name}"{ident}>'
        f'<Ellipse width="{w}" height="{h}" originX="0.5" originY="0.5" name="Path"/>{paint}</Shape>'
    )


def soft(name: str, x: float, y: float, w: float, h: float, color: str, *, sid: str = "",
         rotation: float = 0, opacity: float = 1, core: float = 0.45) -> str:
    """A blurred-edge ellipse without Feather (the canvas web runtime ignores Feather):
    a circle with a radial gradient fading to transparent, squashed by scaleY."""
    ident = f' id="{sid}"' if sid else ""
    clear = "00" + color[2:]
    return (
        f'<Shape x="{x}" y="{y}" rotation="{rotation}" scaleY="{h / w:.4f}" opacity="{opacity}" '
        f'name="{name}"{ident}>'
        f'<Ellipse width="{w}" height="{w}" originX="0.5" originY="0.5" name="Path"/>'
        f'<Fill name="Fill"><RadialGradient startX="0" startY="0" endX="{w / 2}" endY="0" name="Gradient">'
        f'<GradientStop colorValue="{color}" position="0"/>'
        f'<GradientStop colorValue="{color}" position="{core}"/>'
        f'<GradientStop colorValue="{clear}" position="1"/></RadialGradient></Fill></Shape>'
    )


def straight(x: float, y: float, radius: float = 0) -> str:
    return f'<StraightVertex x="{x}" y="{y}" radius="{radius}"/>'


def mirrored(x: float, y: float, rot: float, dist: float) -> str:
    return f'<CubicMirroredVertex x="{x}" y="{y}" rotation="{rot:.4f}" distance="{dist}"/>'


def detached(x: float, y: float, in_rot: float, in_dist: float, out_rot: float, out_dist: float) -> str:
    return (
        f'<CubicDetachedVertex x="{x}" y="{y}" inRotation="{in_rot:.4f}" inDistance="{in_dist}" '
        f'outRotation="{out_rot:.4f}" outDistance="{out_dist}"/>'
    )


def asym(x: float, y: float, rot: float, in_dist: float, out_dist: float) -> str:
    return (
        f'<CubicAsymmetricVertex x="{x}" y="{y}" rotation="{rot:.4f}" '
        f'inDistance="{in_dist}" outDistance="{out_dist}"/>'
    )


def path(name: str, vertices: list[str], paint: str, *, closed: bool = True, sid: str = "",
         x: float = 0, y: float = 0, rotation: float = 0, opacity: float = 1) -> str:
    ident = f' id="{sid}"' if sid else ""
    return (
        f'<Shape x="{x}" y="{y}" rotation="{rotation}" opacity="{opacity}" name="{name}"{ident}>'
        f'<PointsPath isClosed="{"true" if closed else "false"}" isClockwise="true" name="Path">'
        + "".join(vertices)
        + f"</PointsPath>{paint}</Shape>"
    )


# --- art -------------------------------------------------------------------

def linear(x1: float, y1: float, x2: float, y2: float, stops: list[tuple[str, float]]) -> str:
    inner = "".join(f'<GradientStop colorValue="{c}" position="{pos}"/>' for c, pos in stops)
    return (f'<Fill name="Fill"><LinearGradient startX="{x1}" startY="{y1}" endX="{x2}" endY="{y2}" '
            f'name="Gradient">{inner}</LinearGradient></Fill>')


def leaf(name: str, sid: str, rotation: float, length: float, width: float) -> str:
    """An almond leaf growing up (-y) from its base at the node origin."""
    up = -PI / 2
    spread = 0.62
    outline = [
        detached(0, 0, up - spread, width, up + spread, width),
        detached(0, -length, PI / 2 - spread, width * 0.8, PI / 2 + spread, width * 0.8),
    ]
    blade = path("Blade", outline, linear(0, 0, 0, -length,
                                         [(LEAF_BASE, 0), (LEAF_MID, 0.55), (LEAF_TIP, 1)]))
    rim = path("Rim", outline, fill(RIM), x=2.5, y=-2, opacity=0.9)
    rib = path("Rib", [straight(0, -3), mirrored(1.5, -length * 0.45, -PI / 2, 8), straight(0, -length * 0.8)],
               stroke(VEIN, 2.4), closed=False, opacity=0.6)
    veins = "".join(
        path("Vein", [straight(1, -length * t), straight(side * width * 0.42, -length * (t + 0.12))],
             stroke(VEIN, 1.6), closed=False, opacity=0.4)
        for t in (0.3, 0.52) for side in (-1, 1)
    )
    return f'<Node rotation="{rotation}" name="{name}" id="{sid}">{veins}{rib}{blade}{rim}</Node>'


# Eyelid travel, in the eye's own space (sclera is 46x52, centred). Open: both lids sit
# outside the eye; closed: they meet a little below the middle, like a cartoon blink.
# Open, each lid (and the upper one's lash line) clears the eye with room to spare,
# so nothing of it shows between blinks.
LID_UP_OPEN, LID_UP_SHUT = -74, -21
LID_LOW_OPEN, LID_LOW_SHUT = 58, 34


def eyelids(mask_id: str, upper_id: str, lower_id: str, skin: tuple[str, str]) -> str:
    """skin: (top-left, bottom-right) tones sampled from the render around this eye, so a
    shut lid melts into the body instead of reading as a coloured disc."""
    clip = f'<ClippingShape sourceId="{mask_id}" name="Clip"/>'
    # Coordinates are the lid's own; with the upper lid shut (centre at y=-21) its visible
    # part spans local y -5..35, which is what the gradient covers.
    upper_paint = linear(-23, -5, 23, 35, [(skin[0], 0), (skin[1], 1)])
    lower_paint = linear(-23, -48, 23, -8, [(skin[0], 0), (skin[1], 1)])
    upper = (
        f'<Shape y="{LID_UP_OPEN}" name="Lid Upper" id="{upper_id}">'
        '<Ellipse width="72" height="72" originX="0.5" originY="0.5" name="Path"/>'
        f'{upper_paint}{stroke(PUPIL, 3.5)}{clip}</Shape>'
    )
    lower = (
        f'<Shape y="{LID_LOW_OPEN}" name="Lid Lower" id="{lower_id}">'
        '<Ellipse width="72" height="40" originX="0.5" originY="0.5" name="Path"/>'
        f'{lower_paint}{clip}</Shape>'
    )
    # The mask has no paint: it only lends its outline to the clip.
    mask = (f'<Shape name="Lid Mask" id="{mask_id}">'
            '<Ellipse width="46" height="52" originX="0.5" originY="0.5" name="Path"/></Shape>')
    return upper + lower + mask


def eye(name: str, x: float, pupil_id: str, mask_id: str, lids: str, look: float, gaze_id: str) -> str:
    """A big warm iris that nearly fills the eye, turned slightly toward the nose (`look`),
    dark on top where the pupil melts in and glowing orange at the bottom."""
    iris = (
        '<Shape name="Iris"><Ellipse width="34" height="34" originX="0.5" originY="0.5" name="Path"/>'
        + linear(0, -17, 0, 17, [(IRIS_TOP, 0), (IRIS_DARK, 0.35), (IRIS_MID, 0.7), (IRIS_GLOW, 1)])
        + "</Shape>"
    )
    pupil = (
        f'<Node x="{look}" y="{PUPIL_Y}" name="Pupil" id="{pupil_id}">'
        + ellipse("Glint", 6, -7, 11, 11, fill("FFFFFFFF"))
        + ellipse("Glint Small", -7, 8, 4.5, 4.5, fill("CCFFFFFF"))
        + soft("Iris Glow", 0, 11, 24, 10, "B3FFA040", core=0.3)
        + soft("Pupil Core", 0, -4, 20, 20, "FF120604", core=0.6)
        + iris
        + "</Node>"
    )
    # The upper lid's shadow on the white of the eye, kept inside the eye by its mask.
    lid_shadow = (
        '<Shape y="-17" name="Lid Shadow"><Ellipse width="58" height="26" originX="0.5" originY="0.5" name="Path"/>'
        + linear(0, -13, 0, 13, [("33325C36", 0), ("00325C36", 1)])
        + f'<ClippingShape sourceId="{mask_id}" name="Clip"/></Shape>'
    )
    sclera = ellipse("Sclera", 0, 0, 46, 52, fill(EYE_WHITE))
    socket = soft("Socket", 0, 5, 60, 68, "33174D22", core=0.55)
    # Gaze follows the pointer (the Look X / Look Y layers); the clip keeps the iris
    # inside the white whatever the gaze and the mood do to it.
    gaze = (f'<Node name="Gaze" id="{gaze_id}"><ClippingShape sourceId="{mask_id}" name="Clip"/>'
            f'{pupil}</Node>')
    return f'<Node x="{x}" name="{name}">{lids}{lid_shadow}{gaze}{sclera}{socket}</Node>'


def happy_eye(x: float) -> str:
    return path("Arc", [straight(-13, 5), mirrored(0, -8, 0, 9), straight(13, 5)],
                stroke(IRIS_DARK, 6.5), closed=False, x=x)


BODY_VERTICES = [
    detached(0, -118, PI - 0.3, 48, 0.3, 48),        # soft tip, where the sprout grows
    asym(108, 18, PI / 2, 66, 54),                    # right side
    mirrored(0, 112, PI, 64),                         # bottom
    asym(-108, 18, -PI / 2, 54, 66),                  # left side
]


def body_shape() -> str:
    paint = (
        '<Fill name="Fill"><RadialGradient startX="-38" startY="-52" endX="160" endY="-52" name="Gradient">'
        f'<GradientStop colorValue="{BODY_HI}" position="0"/>'
        f'<GradientStop colorValue="{BODY_MID}" position="0.42"/>'
        f'<GradientStop colorValue="{BODY_LO}" position="0.82"/>'
        f'<GradientStop colorValue="{BODY_DEEP}" position="1"/></RadialGradient></Fill>'
    )
    return path("Body Shape", BODY_VERTICES, paint)


def arm(name: str, sid: str, x: float, rotation: float) -> str:
    """A stubby arm hanging from the shoulder (the node origin), tucked behind the body."""
    limb = (
        '<Shape name="Limb"><Rectangle width="30" height="58" cornerRadiusTL="15" '
        'originX="0.5" originY="0.08" name="Path"/>'
        + linear(0, 0, 0, 54, [(BODY_MID, 0), (BODY_LO, 1)])
        + "</Shape>"
    )
    shine = soft("Shine", -4, 34, 12, 20, "80FFFFFF", core=0.3)
    return f'<Node x="{x}" y="22" rotation="{rotation}" name="{name}" id="{sid}">{shine}{limb}</Node>'


def sparkle(name: str, sid: str, x: float, y: float, size: float) -> str:
    return (
        f'<Shape x="{x}" y="{y}" opacity="0" scaleX="0.2" scaleY="0.2" name="{name}" id="{sid}">'
        f'<Star width="{size}" height="{size}" points="4" innerRadius="0.32" cornerRadius="2" '
        f'originX="0.5" originY="0.5" name="Path"/>{fill(SPARK)}</Shape>'
    )


def foot(x: float) -> str:
    return (
        soft("Toe Shine", x - 6, 98, 18, 9, "66FFFFFF", core=0.3)
        + ellipse("Foot", x, 104, 48, 30, linear(0, -15, 0, 15, [(BODY_MID, 0), (FOOT, 1)]))
    )


def art() -> str:
    face = (
        f'<Node x="{FACE_X}" y="{FACE_Y}" name="Face" id="0:30">'
        # mouth (front)
        '<Node y="30" name="Mouth">'
        + path("Smile", [straight(-8, 0), mirrored(0, 4.5, 0, 6), straight(8, 0)],
               stroke(MOUTH_LINE, 4), closed=False, sid="0:31")
        + '<Node opacity="0" name="Open" id="0:32">'
        # a wide dark "D" with the tongue clipped inside it
        + '<Shape y="12" name="Tongue"><Ellipse width="20" height="11" originX="0.5" originY="0.5" name="Path"/>'
        + fill(TONGUE) + '<ClippingShape sourceId="0:97" name="Clip"/></Shape>'
        + path("Open Mouth", [straight(-16, -3, 6), straight(16, -3, 6), mirrored(0, 15, PI, 14)],
               fill(MOUTH_IN), sid="0:97")
        + "</Node>"
        + path("Frown", [straight(-10, 6), mirrored(0, -1, 0, 8), straight(10, 6)],
               stroke(MOUTH_LINE, 4), closed=False, sid="0:33", opacity=0)
        + "</Node>"
        # eyes
        + '<Node opacity="0" name="Happy Eyes" id="0:35">'
        + happy_eye(-38) + happy_eye(38)
        + "</Node>"
        + '<Node name="Eyes" id="0:36">'
        # lids take the skin tone under each eye (lighter on the lit left side)
        + eye("Eye L", -38, "0:37", "0:95", eyelids("0:95", "0:91", "0:92", ("FFA2DB98", "FF76C477")), 4, "0:98")
        + eye("Eye R", 38, "0:38", "0:96", eyelids("0:96", "0:93", "0:94", ("FF68BE6E", "FF44A051")), -4, "0:99")
        + "</Node>"
        + "</Node>"
    )
    specks = (
        '<Node name="Specks">'
        + ellipse("Speck 1", -34, -84, 9, 9, fill("F2FFFFFF"))
        + ellipse("Speck 2", -20, -98, 5, 5, fill("D9FFFFFF"))
        + ellipse("Speck 3", 42, -88, 6, 6, fill("80FFFFFF"))
        + "</Node>"
    )
    gloss = soft("Gloss", -56, -46, 30, 58, "FFFFFFFF", rotation=0.45, opacity=0.5, core=0.35)
    # The groove of a seed: a faint crease from the tip down the right side.
    seam = path("Seam", [straight(10, -104), mirrored(66, -42, 1.05, 36), straight(86, 28)],
                stroke(BODY_LO, 3), closed=False, opacity=0.3)
    seam_light = path("Seam Light", [straight(14, -102), mirrored(70, -40, 1.05, 36), straight(90, 28)],
                      stroke(BELLY_HI, 2), closed=False, opacity=0.35)
    belly = (
        soft("Belly Shine", -14, 38, 70, 44, BELLY_HI, opacity=0.55, core=0.3)
        + soft("Belly", 4, 50, 128, 92, BELLY, opacity=0.9, core=0.62)
    )
    under = soft("Under", 0, 100, 210, 50, "66174D22", core=0.25)
    rim = path("Rim Light", BODY_VERTICES, fill(RIM), x=3.5, y=-3, opacity=0.85)
    sprout = (
        '<Node y="-112" name="Sprout" id="0:40">'
        '<Node x="3" y="-30" name="Leaves">'
        + ellipse("Bud", 0, -6, 11, 18, linear(0, 9, 0, -9, [(LEAF_BASE, 0), (LEAF_TIP, 1)]))
        + leaf("Leaf R", "0:41", 0.85, 68, 31)
        + leaf("Leaf L", "0:42", -0.95, 56, 27)
        + "</Node>"
        + path("Stem", [straight(0, 6), mirrored(-3, -14, -PI / 2 + 0.3, 8), straight(3, -32)],
               stroke(STEM, 9), closed=False)
        + "</Node>"
    )
    arms = arm("Arm L", "0:43", -96, 0.55) + arm("Arm R", "0:44", 96, -0.55)
    feet = '<Node name="Feet">' + foot(-40) + foot(40) + "</Node>"
    sparkles = (
        '<Node name="Sparkles" id="0:50">'
        + sparkle("Spark 1", "0:51", -122, -112, 34)
        + sparkle("Spark 2", "0:52", 128, -86, 26)
        + sparkle("Spark 3", "0:53", -138, 6, 22)
        + sparkle("Spark 4", "0:54", 120, 30, 30)
        + "</Node>"
    )
    body = (f'<Node y="-126" name="Body" id="0:21">{face}{specks}{gloss}{seam_light}{seam}{belly}{under}'
            f'{body_shape()}{rim}{arms}{sprout}{feet}</Node>')
    mascot = f'<Node x="200" y="{GROUND}" name="Mascot" id="0:20">{sparkles}{body}</Node>'
    shadow = soft("Shadow", 200, GROUND, 180, 26, "4D0B2A12", sid="0:22", core=0.35)
    return mascot + shadow


# --- animation ---------------------------------------------------------------

EASE = '<CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/>'
EASE_OUT = '<CubicEaseInterpolator x1="0.2" y1="0.8" x2="0.3" y2="1"/>'
EASE_IN = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.9" y2="0.4"/>'


def keys(prop: str, frames: list[tuple], default_ease: str = "ease") -> str:
    """frames: (frame, value) or (frame, value, ease) where ease is ease|out|in|linear|hold."""
    out = []
    for item in frames:
        frame, value = item[0], item[1]
        kind = item[2] if len(item) > 2 else default_ease
        if kind == "hold":
            out.append(f'<KeyFrameDouble frame="{frame}" value="{value}" interpolationType="hold"/>')
        elif kind == "linear":
            out.append(f'<KeyFrameDouble frame="{frame}" value="{value}" interpolationType="linear"/>')
        else:
            curve = {"ease": EASE, "out": EASE_OUT, "in": EASE_IN}[kind]
            out.append(f'<KeyFrameDouble frame="{frame}" value="{value}" interpolationType="cubic">{curve}</KeyFrameDouble>')
    return f'<KeyedProperty property="{prop}">' + "".join(out) + "</KeyedProperty>"


def obj(sid: str, *props: str) -> str:
    return f'<KeyedObject objectId="{sid}">' + "".join(props) + "</KeyedObject>"


def neutral_face(frame: int = 0) -> list[str]:
    """Idle keys every mood property so leaving any reaction lands on the rest pose."""
    f = frame
    return [
        obj("0:36", keys("opacity", [(f, 1, "hold")])),
        obj("0:35", keys("opacity", [(f, 0, "hold")])),
        obj("0:31", keys("opacity", [(f, 1, "hold")])),
        obj("0:32", keys("opacity", [(f, 0, "hold")])),
        obj("0:33", keys("opacity", [(f, 0, "hold")])),
        obj("0:37", keys("y", [(f, PUPIL_Y, "hold")])),
        obj("0:38", keys("y", [(f, PUPIL_Y, "hold")])),
        obj("0:41", keys("rotation", [(f, 0.85, "hold")])),
        obj("0:42", keys("rotation", [(f, -0.95, "hold")])),
        obj("0:21", keys("rotation", [(f, 0, "hold")])),
        obj("0:50", keys("opacity", [(f, 1, "hold")])),
        *[obj(s, keys("opacity", [(f, 0, "hold")])) for s in ("0:51", "0:52", "0:53", "0:54")],
    ]


def idle() -> str:
    body = [
        obj("0:20",
            keys("scaleY", [(0, 1), (75, 1.035), (150, 1)]),
            keys("scaleX", [(0, 1), (75, 0.985), (150, 1)]),
            keys("y", [(0, GROUND, "hold")])),
        obj("0:40", keys("rotation", [(0, -0.07), (75, 0.07), (150, -0.07)])),
        obj("0:22", keys("scaleX", [(0, 1), (75, 0.97), (150, 1)]), keys("opacity", [(0, 1, "hold")])),
        obj("0:43", keys("rotation", [(0, 0.5), (75, 0.62), (150, 0.5)])),
        obj("0:44", keys("rotation", [(0, -0.5), (75, -0.62), (150, -0.5)])),
    ]
    return ('<LinearAnimation loopValue="loop" duration="150" name="Idle" id="0:60">'
            + "".join(body + neutral_face()) + "</LinearAnimation>")


def blink() -> str:
    """Lids close in 4 frames, hold 2, reopen over 7 with a small rebound; a single
    blink, then a double one, at uneven gaps so it never ticks like a metronome."""
    length = 330
    starts = (150, 268, 284)
    upper, lower, squash = [(0, LID_UP_OPEN, "hold")], [(0, LID_LOW_OPEN, "hold")], [(0, 1, "hold")]
    for t in starts:
        upper += [(t, LID_UP_OPEN, "in"), (t + 4, LID_UP_SHUT, "hold"), (t + 6, LID_UP_SHUT, "out"),
                  (t + 13, LID_UP_OPEN, "hold")]
        lower += [(t, LID_LOW_OPEN, "in"), (t + 4, LID_LOW_SHUT, "hold"), (t + 6, LID_LOW_SHUT, "out"),
                  (t + 13, LID_LOW_OPEN, "hold")]
        squash += [(t, 1, "in"), (t + 4, 0.94, "hold"), (t + 6, 0.94, "out"), (t + 11, 1.025), (t + 15, 1, "hold")]
    upper.append((length, LID_UP_OPEN, "hold"))
    lower.append((length, LID_LOW_OPEN, "hold"))
    squash.append((length, 1, "hold"))
    lids = [obj(sid, keys("y", upper)) for sid in ("0:91", "0:93")]
    lids += [obj(sid, keys("y", lower)) for sid in ("0:92", "0:94")]
    return (f'<LinearAnimation loopValue="loop" duration="{length}" name="Blink" id="0:61">'
            + "".join(lids) + obj("0:36", keys("scaleY", squash)) + "</LinearAnimation>")


def face_swap(start: int, end: int, *, happy: bool) -> list[str]:
    on = [(0, 0, "hold"), (start, 1, "hold"), (end, 0, "hold")]
    off = [(0, 1, "hold"), (start, 0, "hold"), (end, 1, "hold")]
    if happy:
        return [
            obj("0:36", keys("opacity", off)), obj("0:35", keys("opacity", on)),
            obj("0:31", keys("opacity", off)), obj("0:32", keys("opacity", on)),
        ]
    return [
        obj("0:31", keys("opacity", off)), obj("0:33", keys("opacity", on)),
    ]


def sparkle_burst(start: int, peak: int, end: int) -> list[str]:
    out = []
    for i, sid in enumerate(("0:51", "0:52", "0:53", "0:54")):
        d = i * 3
        out.append(obj(
            sid,
            keys("opacity", [(0, 0, "hold"), (start + d, 0, "out"), (peak + d, 1), (end + d, 0, "hold")]),
            keys("scaleX", [(0, 0.2, "hold"), (start + d, 0.2, "out"), (peak + d, 1.15), (end + d, 0.7, "hold")]),
            keys("scaleY", [(0, 0.2, "hold"), (start + d, 0.2, "out"), (peak + d, 1.15), (end + d, 0.7, "hold")]),
            keys("rotation", [(0, 0, "hold"), (start + d, 0, "linear"), (end + d, 1.6, "hold")]),
        ))
    return out


def happy() -> str:
    parts = [
        obj("0:20",
            keys("scaleX", [(0, 1, "out"), (6, 1.12), (20, 0.92, "out"), (30, 1, "in"), (42, 1.1), (54, 0.97), (66, 1)]),
            keys("scaleY", [(0, 1, "out"), (6, 0.86), (20, 1.1, "out"), (30, 1, "in"), (42, 0.88), (54, 1.03), (66, 1)]),
            keys("y", [(0, GROUND, "hold"), (6, GROUND, "out"), (30, GROUND - 66, "in"), (42, GROUND, "hold"), (66, GROUND, "hold")])),
        obj("0:22",
            keys("scaleX", [(0, 1), (6, 1.08), (30, 0.6), (42, 1.06), (66, 1)]),
            keys("opacity", [(0, 1), (30, 0.45), (42, 1, "hold")])),
        obj("0:40", keys("rotation", [(0, 0), (20, -0.28), (32, 0.26), (44, -0.12), (56, 0.05), (66, 0)])),
        obj("0:41", keys("rotation", [(0, 0.85), (22, 1.15), (36, 0.7), (66, 0.85)])),
        obj("0:42", keys("rotation", [(0, -0.95), (22, -1.25), (36, -0.8), (66, -0.95)])),
        obj("0:43", keys("rotation", [(0, 0.5, "out"), (16, 2.05), (30, 1.8), (44, 2.0), (66, 0.5)])),
        obj("0:44", keys("rotation", [(0, -0.5, "out"), (16, -2.05), (30, -1.8), (44, -2.0), (66, -0.5)])),
        *face_swap(3, 60, happy=True),
        *sparkle_burst(10, 22, 48),
    ]
    return '<LinearAnimation duration="66" name="Happy" id="0:62">' + "".join(parts) + "</LinearAnimation>"


def sad() -> str:
    parts = [
        obj("0:20",
            keys("scaleY", [(0, 1), (14, 0.93), (72, 0.94), (90, 1)]),
            keys("scaleX", [(0, 1), (14, 1.04), (72, 1.035), (90, 1)]),
            keys("y", [(0, GROUND, "hold")])),
        obj("0:21", keys("rotation", [(0, 0), (16, -0.05), (40, 0.03), (64, -0.03), (90, 0)])),
        obj("0:37", keys("y", [(0, PUPIL_Y), (12, PUPIL_Y + 6), (74, PUPIL_Y + 6), (90, PUPIL_Y)])),
        obj("0:38", keys("y", [(0, PUPIL_Y), (12, PUPIL_Y + 6), (74, PUPIL_Y + 6), (90, PUPIL_Y)])),
        obj("0:40", keys("rotation", [(0, 0), (18, 0.32), (40, 0.24), (60, 0.3), (90, 0)])),
        obj("0:41", keys("rotation", [(0, 0.85), (18, 1.55), (74, 1.5), (90, 0.85)])),
        obj("0:42", keys("rotation", [(0, -0.95), (18, -1.6), (74, -1.55), (90, -0.95)])),
        obj("0:43", keys("rotation", [(0, 0.5), (16, 0.12), (74, 0.15), (90, 0.5)])),
        obj("0:44", keys("rotation", [(0, -0.5), (16, -0.12), (74, -0.15), (90, -0.5)])),
        *face_swap(8, 80, happy=False),
    ]
    return '<LinearAnimation duration="90" name="Sad" id="0:63">' + "".join(parts) + "</LinearAnimation>"


def celebrate() -> str:
    parts = [
        obj("0:20",
            keys("scaleX", [(0, 1, "out"), (6, 1.15), (22, 0.9, "out"), (34, 1, "in"), (48, 1.12),
                            (56, 1.08, "out"), (72, 0.92, "out"), (82, 1, "in"), (94, 1.1), (104, 0.97), (114, 1)]),
            keys("scaleY", [(0, 1, "out"), (6, 0.84), (22, 1.12, "out"), (34, 1, "in"), (48, 0.86),
                            (56, 0.9, "out"), (72, 1.1, "out"), (82, 1, "in"), (94, 0.88), (104, 1.03), (114, 1)]),
            keys("y", [(0, GROUND, "hold"), (6, GROUND, "out"), (34, GROUND - 96, "in"), (48, GROUND, "hold"),
                       (56, GROUND, "out"), (82, GROUND - 70, "in"), (94, GROUND, "hold"), (114, GROUND, "hold")])),
        obj("0:21", keys("rotation", [(0, 0), (22, -0.1), (34, 0.1), (48, 0), (72, 0.08), (82, -0.08), (94, 0)])),
        obj("0:22",
            keys("scaleX", [(0, 1), (34, 0.5), (48, 1.08), (82, 0.62), (94, 1.06), (114, 1)]),
            keys("opacity", [(0, 1), (34, 0.35), (48, 1), (82, 0.45), (94, 1, "hold")])),
        obj("0:40", keys("rotation", [(0, 0), (14, -0.3), (24, 0.3), (34, -0.25), (46, 0.15),
                                      (64, -0.3), (76, 0.3), (88, -0.18), (100, 0.08), (114, 0)])),
        obj("0:41", keys("rotation", [(0, 0.85), (20, 1.2), (44, 0.7), (76, 1.15), (100, 0.85)])),
        obj("0:42", keys("rotation", [(0, -0.95), (20, -1.3), (44, -0.8), (76, -1.25), (100, -0.95)])),
        obj("0:43", keys("rotation", [(0, 0.5, "out"), (14, 2.2), (26, 1.7), (38, 2.2), (50, 1.7),
                                      (62, 2.2), (74, 1.7), (86, 2.2), (100, 1.9), (114, 0.5)])),
        obj("0:44", keys("rotation", [(0, -0.5, "out"), (14, -2.2), (26, -1.7), (38, -2.2), (50, -1.7),
                                      (62, -2.2), (74, -1.7), (86, -2.2), (100, -1.9), (114, -0.5)])),
        *face_swap(3, 108, happy=True),
        *sparkle_burst(12, 26, 54),
    ]
    # second burst rides on the same sparkles, so append keys for them after the first
    return '<LinearAnimation duration="114" name="Celebrate" id="0:64">' + "".join(parts) + "</LinearAnimation>"


# How far the iris travels when the pointer is far away, in the eye's own units, and how
# far the whole face leans the same way (a hint of the head turning to look).
LOOK_X, LOOK_Y = 9, 7
FACE_LEAN_X, FACE_LEAN_Y = 5, 3


def look_pose(name: str, sid: str, prop: str, sign: int) -> str:
    """One-frame pose for the gaze blend: both irises and the face pushed one way."""
    gaze, lean, rest = (LOOK_X, FACE_LEAN_X, FACE_X) if prop == "x" else (LOOK_Y, FACE_LEAN_Y, FACE_Y)
    return (f'<LinearAnimation duration="1" name="{name}" id="{sid}">'
            + obj("0:98", keys(prop, [(0, sign * gaze, "hold")]))
            + obj("0:99", keys(prop, [(0, sign * gaze, "hold")]))
            + obj("0:30", keys(prop, [(0, rest + sign * lean, "hold")]))
            + "</LinearAnimation>")


def look_poses() -> str:
    return (look_pose("Look Left", "0:65", "x", -1) + look_pose("Look Right", "0:66", "x", 1)
            + look_pose("Look Up", "0:67", "y", -1) + look_pose("Look Down", "0:68", "y", 1))


def state_machine() -> str:
    def to_idle(sid: str) -> str:
        return (f'<StateTransition stateToId="0:80" duration="180" enableExitTime="true" '
                f'exitTimeIsPercetange="true" exitTime="100"/>')

    def from_any(state: str, trigger: str) -> str:
        return (f'<StateTransition stateToId="{state}" duration="90">'
                f'<TransitionTriggerCondition inputId="{trigger}"/></StateTransition>')

    return (
        '<StateMachine name="Mascot" id="0:70">'
        '<StateMachineTrigger name="correct" id="0:71"/>'
        '<StateMachineTrigger name="wrong" id="0:72"/>'
        '<StateMachineTrigger name="celebrate" id="0:73"/>'
        # Where the eyes look, 0..100 on each axis (50 = straight ahead); the app feeds the pointer.
        f'<StateMachineNumber name="lookX" value="{os.environ.get("LOOKX", 50)}" id="0:85"/>'
        f'<StateMachineNumber name="lookY" value="{os.environ.get("LOOKY", 50)}" id="0:86"/>'
        '<StateMachineLayer name="Mood" id="0:74">'
        '<AnyState x="160" y="-140">'
        + from_any("0:81", "0:71") + from_any("0:82", "0:72") + from_any("0:83", "0:73")
        + '</AnyState>'
        '<ExitState x="620" y="-140"/>'
        f'<EntryState x="0" y="0"><StateTransition stateToId="{START}"/></EntryState>'
        '<AnimationState x="160" y="0" animationId="0:60" id="0:80"/>'
        f'<AnimationState x="420" y="-60" animationId="0:62" reset="true" id="0:81">{to_idle("")}</AnimationState>'
        f'<AnimationState x="420" y="60" animationId="0:63" reset="true" id="0:82">{to_idle("")}</AnimationState>'
        f'<AnimationState x="420" y="180" animationId="0:64" reset="true" id="0:83">{to_idle("")}</AnimationState>'
        '</StateMachineLayer>'
        '<StateMachineLayer name="Look X" id="0:76">'
        '<AnyState x="160" y="-140"/><ExitState x="420" y="-140"/>'
        '<EntryState x="0" y="0"><StateTransition stateToId="0:87"/></EntryState>'
        '<BlendState1DInput x="160" y="0" inputId="0:85" id="0:87">'
        '<BlendAnimation1D animationId="0:65" value="0"/><BlendAnimation1D animationId="0:66" value="100"/>'
        '</BlendState1DInput>'
        '</StateMachineLayer>'
        '<StateMachineLayer name="Look Y" id="0:77">'
        '<AnyState x="160" y="-140"/><ExitState x="420" y="-140"/>'
        '<EntryState x="0" y="0"><StateTransition stateToId="0:88"/></EntryState>'
        '<BlendState1DInput x="160" y="0" inputId="0:86" id="0:88">'
        '<BlendAnimation1D animationId="0:67" value="0"/><BlendAnimation1D animationId="0:68" value="100"/>'
        '</BlendState1DInput>'
        '</StateMachineLayer>'
        '<StateMachineLayer name="Blink" id="0:75">'
        '<AnyState x="160" y="-140"/><ExitState x="420" y="-140"/>'
        '<EntryState x="0" y="0"><StateTransition stateToId="0:84"/></EntryState>'
        '<AnimationState x="160" y="0" animationId="0:61" id="0:84"/>'
        '</StateMachineLayer>'
        '</StateMachine>'
    )


def scene() -> str:
    return (
        '<Rive version="1" kind="fragment">'
        f'<Artboard defaultStateMachineId="0:70" styleId="0:3" width="400" height="{HEIGHT}" name="Seed" id="0:2">'
        '<LayoutComponentStyle name="Artboard Style" id="0:3"/>'
        + state_machine() + art() + idle() + look_poses() + blink() + happy() + sad() + celebrate()
        + "</Artboard></Rive>"
    )


def with_stable_ids(rml: str) -> str:
    """Give every element without an explicit id one derived from where it sits
    (its ancestors' names, its own tag and name, and its index among identical
    siblings), not from its position in the whole file.

    `rive push` matches objects by id. Ids the CLI hands out are sequential, so
    removing one shape shifted every later id and the push rewrote the wrong
    objects in the editor (the body took the rim light's paint, an arm and a foot
    were deleted). With path-derived ids an id always means the same object, of
    the same type, across edits.
    """
    root = ET.fromstring(rml)
    taken = {el.get("id") for el in root.iter() if el.get("id")}

    def visit(el: ET.Element, trail: str) -> None:
        seen: dict[str, int] = {}
        for child in el:
            label = f"{child.tag}:{child.get('name', '')}"
            seen[label] = seen.get(label, 0) + 1
            path = f"{trail}/{child.get('id') or label}#{seen[label]}"
            if not child.get("id"):
                n = int(hashlib.sha1(path.encode()).hexdigest()[:12], 16) % 900_000_000 + 1
                while f"5:{n}" in taken:
                    n += 1
                child.set("id", f"5:{n}")
                taken.add(f"5:{n}")
            visit(child, path)

    visit(root, "")
    return ET.tostring(root, encoding="unicode")


if __name__ == "__main__":
    Path(__file__).with_name("scene.rml").write_text(with_stable_ids(scene()))
    print("wrote scene.rml")
