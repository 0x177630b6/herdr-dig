# The wandering miner: the office miner's little sibling, 12 art pixels tall so it fits on the
# rail. Drawn here (it is not in the original pack).   gen_walker.py <out folder>   needs Pillow
import os, sys
from PIL import Image
out = sys.argv[1]
SCALE = 4  # file pixels per art pixel; drawn at 2 px per art pixel
PAL = {'.': '#FF00FF', 'y': '#F2C94C', 'k': '#E8B890', 'b': '#0C0E12', 'o': '#D9774A', 'd': '#4A5261',
       'n': '#2B2F36', 'h': '#8A6A4A', 'l': '#C9CED6', 's': '#7C8698'}
KEYS = list(PAL)
hx = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))

HEAD = ['....yyyyy..',
        '.ll.yyyyy..',
        'l.hlyyyyyy.',
        '..h.kkkkk..',
        '...hkkkbk..',
        '...hkkkkk..']
WALK_A = HEAD + ['....ooooo..',
                 '....ookoo..',
                 '....ooooo..',
                 '....dd.dd..',
                 '....dd.dd..',
                 '....nn.nnn.']
WALK_B = HEAD + ['....ooooo..',
                 '....okooo..',
                 '....ooooo..',
                 '.....ddd...',
                 '.....ddd...',
                 '.....nnnn..']
STAND = ['..yyyyy..',
         '..yyyyy..',
         '.yyyyyyy.',
         '..kkkkk..',
         '..kbkbk..',
         '..kkkkk..',
         '.ooooooo.',
         '.ooooooo.',
         '.koooook.',
         '..dd.dd..',
         '..dd.dd..',
         '..nn.nn..']
# From behind, on the rope: one hand up, the other down, one boot higher.
CLIMB = ['..yyyyy..',
         '..yyyyy..',
         '.yyyyyyy.',
         'k.hhhhh..',
         'o.hhhhh..',
         'o.kkkkk..',
         'ooooooooo',
         '..ooooo.o',
         '..ooooo.k',
         '..dd.dd..',
         '..nn.dd..',
         '.....nn..']
mirror = lambda rows: [r[::-1] for r in rows]

def frame(rows):
    im = Image.new('P', (len(rows[0]) * SCALE, len(rows) * SCALE), 0)
    im.putpalette([c for k in KEYS for c in hx(PAL[k])])
    px = im.load()
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), row
        for x, ch in enumerate(row):
            for i in range(SCALE):
                for j in range(SCALE):
                    px[x * SCALE + i, y * SCALE + j] = KEYS.index(ch)
    return im

def gif(name, frames, ms):
    f = [frame(r) for r in frames]
    f[0].save(os.path.join(out, name), save_all=True, append_images=f[1:], duration=ms, loop=0, transparency=0, disposal=2)

def png(name, rows):
    im = frame(rows).convert('RGBA'); px = im.load()
    for x in range(im.width):
        for y in range(im.height):
            if px[x, y][:3] == hx(PAL['.']): px[x, y] = (0, 0, 0, 0)
    im.save(os.path.join(out, name))

gif('walker_r.gif', [WALK_A, WALK_B], 220)
gif('walker_l.gif', [mirror(WALK_A), mirror(WALK_B)], 220)
gif('walker_climb.gif', [CLIMB, mirror(CLIMB)], 300)
png('walker_stand.png', STAND)
png('walker_still.png', WALK_A)
