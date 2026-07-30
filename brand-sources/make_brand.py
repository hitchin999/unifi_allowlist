"""Redraw the UniFi Allow List brand mark.

The old mark laid a padlock across the wifi arcs, so the lock body sat in the
middle of the lines and the whole thing read as clutter at small sizes. Here the
lock takes the place of the emitter dot underneath the arcs, and a mask cuts a
clean gap out of the arcs around it, so the two shapes never touch whatever the
rendering size.
"""

import math
import pathlib

import cairosvg

OUT = pathlib.Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

CX, CY = 128.0, 158.0
RADII = (96.0, 68.0, 40.0)
STROKE = 15.0
A1, A2 = 140.0, 40.0


def arc(r: float) -> str:
    x1 = CX + r * math.cos(math.radians(A1))
    y1 = CY - r * math.sin(math.radians(A1))
    x2 = CX + r * math.cos(math.radians(A2))
    y2 = CY - r * math.sin(math.radians(A2))
    return f"M {x1:.2f} {y1:.2f} A {r} {r} 0 0 1 {x2:.2f} {y2:.2f}"


# padlock: shackle as a stroked path, body as a rounded rect
SHACKLE = "M 115 166 V 152 a 13 13 0 0 1 26 0 V 166"
BODY = '<rect x="102" y="166" width="52" height="40" rx="10"/>'


def glyph(fg: str) -> str:
    arcs = "".join(
        f'<path d="{arc(r)}"/>' for r in RADII
    )
    return f"""
  <mask id="cut">
    <rect width="256" height="256" fill="white"/>
    <g fill="black" stroke="black" stroke-width="7" stroke-linejoin="round">
      <path d="{SHACKLE}" fill="none" stroke-linecap="round"/>
      {BODY}
    </g>
  </mask>
  <g mask="url(#cut)" fill="none" stroke="{fg}" stroke-width="{STROKE}"
     stroke-linecap="round">{arcs}</g>
  <path d="{SHACKLE}" fill="none" stroke="{fg}" stroke-width="11"
        stroke-linecap="round"/>
  <g fill="{fg}">{BODY}</g>
"""


def icon_svg(dark: bool) -> str:
    top, bot = ("#3B8CFF", "#1665E0") if dark else ("#0A84FF", "#0052CC")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{top}"/>
      <stop offset="1" stop-color="{bot}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="58" fill="url(#bg)"/>
  {glyph("#FFFFFF")}
</svg>"""


def logo_svg(dark: bool) -> str:
    top, bot = ("#3B8CFF", "#1665E0") if dark else ("#0A84FF", "#0052CC")
    text = "#F8FAFC" if dark else "#0B1B33"
    tile, pad = 176.0, 32.0
    k = tile / 256.0
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 240" width="720" height="240">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{top}"/>
      <stop offset="1" stop-color="{bot}"/>
    </linearGradient>
  </defs>
  <g transform="translate({pad} {pad}) scale({k})">
    <rect width="256" height="256" rx="58" fill="url(#bg)"/>
    {glyph("#FFFFFF")}
  </g>
  <text x="{pad + tile + 34}" y="143" fill="{text}"
        font-family="Poppins" font-weight="600" font-size="58"
        letter-spacing="-1">UniFi Allow List</text>
</svg>"""


jobs = [
    ("icon.png", icon_svg(False), 256),
    ("icon@2x.png", icon_svg(False), 512),
    ("dark_icon.png", icon_svg(True), 256),
    ("dark_icon@2x.png", icon_svg(True), 512),
    ("logo.png", logo_svg(False), 720),
    ("logo@2x.png", logo_svg(False), 1440),
    ("dark_logo.png", logo_svg(True), 720),
    ("dark_logo@2x.png", logo_svg(True), 1440),
]

for name, svg, width in jobs:
    cairosvg.svg2png(
        bytestring=svg.encode(), write_to=str(OUT / name), output_width=width
    )
    print("wrote", name, width)

# keep the sources next to the repo so this can be redone
(OUT / "icon.svg").write_text(icon_svg(False))
(OUT / "dark_icon.svg").write_text(icon_svg(True))
(OUT / "logo.svg").write_text(logo_svg(False))
(OUT / "dark_logo.svg").write_text(logo_svg(True))
print("wrote svg sources")
