#!/usr/bin/env python3
"""
Generates a terminal-style "neofetch" profile card SVG:
  - Left side: colored ASCII art rendered from the user's LIVE GitHub avatar
               (fetched fresh from https://github.com/<user>.png every run,
               so it updates automatically whenever the avatar changes)
  - Right side: terminal-style info block (About / Contact / GitHub Stats)

Usage:
    python generate_card.py

Configure the CONFIG dict below with your own details, then run this
script (locally or via the included GitHub Action) to (re)generate
dark_mode.svg and light_mode.svg.
"""

import base64
import io
import json
import os
import sys
import textwrap
from datetime import datetime, timezone

import requests
from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------
# CONFIG — edit these to update the card. Everything under "About" / "Tech"
# / "Contact" is static text you control. GitHub Stats are pulled live from
# the GitHub API each time this script runs.
# --------------------------------------------------------------------------
CONFIG = {
    "github_user": "hawike22405",
    "handle": "sayan@hawike22405",       # top-left prompt line, e.g. user@host
    "role": "CS Student, Adamas University",
    "ide": "VS Code, Windows Terminal",
    "languages_programming": "C, C++, Java, JavaScript, HTML, CSS",
    "languages_tools": "Git, GitHub",
    "hobbies": "Coding, Competitive Programming, Learning new tech",
    "email": "gamesrfun22405@gmail.com",
    "linkedin": "linkedin.com/in/sayan-pal-446b9a238",
    "github": "github.com/hawike22405",
    "x": "x.com/Sayanpal22405",
    "reddit": "reddit.com/u/Tipsy_spirit_5002",
}

# ASCII ramp: index 0 = darkest/densest char, last = lightest/blank
ASCII_RAMP = "@%#*+=-:. "

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

AVATAR_COLS = 46          # ascii grid width (characters)
CELL_W = 8                # px per character cell (output raster)
CELL_H = 15
CANVAS_BG = (13, 17, 23)  # GitHub dark background


def fetch_avatar(user: str) -> Image.Image:
    url = f"https://github.com/{user}.png?size=460"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def image_to_ascii_png(img: Image.Image, cols: int) -> Image.Image:
    """Convert an image to a colored-ASCII-art PNG (characters colored by
    the source pixel color), matching the terminal-card aesthetic."""
    w, h = img.size
    cell_aspect = CELL_W / CELL_H
    rows = max(1, int(cols * (h / w) * cell_aspect))

    small = img.resize((cols, rows))
    px = small.load()

    out_w, out_h = cols * CELL_W, rows * CELL_H
    canvas = Image.new("RGB", (out_w, out_h), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT_PATH, CELL_H - 2)

    for y in range(rows):
        for x in range(cols):
            r, g, b = px[x, y]
            brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            char = ASCII_RAMP[int((1 - brightness) * (len(ASCII_RAMP) - 1))]
            if char != " ":
                draw.text(
                    (x * CELL_W, y * CELL_H),
                    char,
                    font=font,
                    fill=(r, g, b),
                )
    return canvas


def png_to_data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def fetch_github_stats(user: str) -> dict:
    stats = {"repos": "?", "followers": "?", "following": "?", "loc": "?"}
    try:
        resp = requests.get(f"https://api.github.com/users/{user}", timeout=15)
        if resp.ok:
            data = resp.json()
            stats["repos"] = data.get("public_repos", "?")
            stats["followers"] = data.get("followers", "?")
            stats["following"] = data.get("following", "?")
    except Exception:
        pass
    # Read LOC data if available (written by count_loc.py)
    loc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loc-data.json")
    if os.path.exists(loc_path):
        try:
            with open(loc_path) as f:
                loc_data = json.load(f)
            total = loc_data.get("total_code", 0)
            if total >= 1_000_000:
                stats["loc"] = f"{total / 1_000_000:.1f}M"
            elif total >= 1_000:
                stats["loc"] = f"{total / 1_000:.1f}K"
            else:
                stats["loc"] = str(total)
        except Exception:
            pass
    return stats


def esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_svg(ascii_data_uri: str, ascii_w: int, ascii_h: int, cfg: dict, stats: dict) -> str:
    lines = []

    def row(y, key, value, dots=""):
        lines.append(
            f'<tspan x="{ascii_w + 30}" y="{y}" class="cc">. </tspan>'
            f'<tspan class="key">{esc(key)}</tspan>'
            f'<tspan class="cc">{esc(dots)}</tspan>'
            f'<tspan class="value">{esc(value)}</tspan>'
        )

    text_x = ascii_w + 30
    body = []
    body.append(f'<tspan x="{text_x}" y="30">{esc(cfg["handle"])}</tspan>')
    body.append(f'<tspan x="{text_x}" y="50" class="cc">{"-" * 32}</tspan>')

    fields = [
        ("Role", " .............. ", cfg["role"]),
        ("IDE", " ............... ", cfg["ide"]),
        ("Lang (Prog)", " ...... ", cfg["languages_programming"]),
        ("Lang (Tools)", " ..... ", cfg["languages_tools"]),
        ("Hobbies", " .......... ", cfg["hobbies"]),
    ]
    y = 80
    for key, dots, val in fields:
        body.append(
            f'<tspan x="{text_x}" y="{y}" class="cc">. </tspan>'
            f'<tspan class="key">{esc(key)}</tspan>'
            f'<tspan class="cc">{esc(dots)}</tspan>'
            f'<tspan class="value">{esc(val)}</tspan>'
        )
        y += 20

    y += 20
    body.append(f'<tspan x="{text_x}" y="{y}">- Contact</tspan>')
    y += 20
    contact_fields = [
        ("Email", " .............. ", cfg["email"]),
        ("GitHub", " ............. ", cfg["github"]),
        ("LinkedIn", " ........... ", cfg["linkedin"]),
        ("X", " ................ ", cfg["x"]),
        ("Reddit", " ............. ", cfg["reddit"]),
    ]
    for key, dots, val in contact_fields:
        body.append(
            f'<tspan x="{text_x}" y="{y}" class="cc">. </tspan>'
            f'<tspan class="key">{esc(key)}</tspan>'
            f'<tspan class="cc">{esc(dots)}</tspan>'
            f'<tspan class="value">{esc(val)}</tspan>'
        )
        y += 20

    y += 20
    body.append(f'<tspan x="{text_x}" y="{y}">- GitHub Stats</tspan>')
    y += 20
    stat_fields = [
        ("Repos", " ............. ", stats["repos"]),
        ("Followers", " ......... ", stats["followers"]),
        ("Following", " ......... ", stats["following"]),
        ("Lines of Code", " .... ", stats["loc"]),
    ]
    for key, dots, val in stat_fields:
        body.append(
            f'<tspan x="{text_x}" y="{y}" class="cc">. </tspan>'
            f'<tspan class="key">{esc(key)}</tspan>'
            f'<tspan class="cc">{esc(dots)}</tspan>'
            f'<tspan class="value">{esc(val)}</tspan>'
        )
        y += 20

    canvas_h = max(ascii_h + 40, y + 30)
    canvas_w = ascii_w + 640

    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    svg = f'''<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns="http://www.w3.org/2000/svg" font-family="ConsolasFallback,Consolas,monospace" width="{canvas_w}px" height="{canvas_h}px" font-size="16px">
<style>
.key {{fill: #ffa657;}}
.value {{fill: #a5d6ff;}}
.cc {{fill: #616e7f;}}
text, tspan {{white-space: pre;}}
</style>
<rect width="{canvas_w}px" height="{canvas_h}px" fill="#0d1117" rx="15"/>
<image x="15" y="20" width="{ascii_w}" height="{ascii_h}" href="{ascii_data_uri}"/>
<text fill="#c9d1d9">
{chr(10).join(body)}
</text>
<text x="{canvas_w - 15}" y="{canvas_h - 12}" text-anchor="end" font-size="10px" fill="#30363d">auto-generated {updated}</text>
</svg>
'''
    return svg


def main():
    cfg = CONFIG
    local_test = os.environ.get("LOCAL_AVATAR_PATH")
    if local_test:
        print(f"[local test mode] Using local avatar file: {local_test}")
        avatar = Image.open(local_test).convert("RGB")
    else:
        print(f"Fetching live avatar for {cfg['github_user']} ...")
        avatar = fetch_avatar(cfg["github_user"])

    print("Converting avatar to colored ASCII art ...")
    ascii_img = image_to_ascii_png(avatar, AVATAR_COLS)
    ascii_uri = png_to_data_uri(ascii_img)

    print("Fetching GitHub stats ...")
    stats = fetch_github_stats(cfg["github_user"])

    print("Building SVG card ...")
    svg = build_svg(ascii_uri, ascii_img.width, ascii_img.height, cfg, stats)

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profile-card.svg")
    with open(out_path, "w") as f:
        f.write(svg)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
