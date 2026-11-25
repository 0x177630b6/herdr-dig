#!/usr/bin/env python3
"""Draws the banner's continuation over the work area: banner_wide_d.png / banner_wide_l.png.

    python3 src/gen_banner.py mods/fleet-chrome/sprites

The sidebar's banner (300x56) without its sun or moon and its mine door, then mirrored:
mirror + original side by side join without a seam, and the pair repeats without one too
(four pairs in one 2400 px image: images drawn side by side show a hairline where they meet).
The first copy is the mirror, so it continues the sidebar's banner where that one ends.
Needs Pillow.
"""
import sys
from pathlib import Path

from PIL import Image

out = Path(sys.argv[1])


def plain(name):
    im = Image.open(out / name).convert("RGBA")
    px = im.load()
    # The sun (day) or the moon (night): sky over it, the colour of the column's top pixel
    # unless that is a star or a cloud (then the row's colour further left).
    for x in range(232, 262):
        for y in range(2, 26):
            px[x, y] = px[226, y]
    # The mine door: the hills and the ground just left of it, copied over it.
    for x in range(204, 230):
        for y in range(34, 56):
            px[x, y] = px[x - 26, y]
    return im


for name, suffix in (("banner_day.gif", "l"), ("banner_night.gif", "d")):
    a = plain(name)
    # Four pairs in one image: wide enough for a window without a join to show.
    wide = Image.new("RGBA", (2400, 56))
    for i in range(4):
        wide.paste(a.transpose(Image.FLIP_LEFT_RIGHT), (i * 600, 0))
        wide.paste(a, (i * 600 + 300, 0))
    wide.save(out / f"banner_wide_{suffix}.png")
    print(out / f"banner_wide_{suffix}.png")
