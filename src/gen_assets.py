import sys, os, shutil
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
hx = lambda s: tuple(int(s[i:i+2], 16) for i in (1, 3, 5))
robots = ['bolt', 'dome', 'mono', 'tank', 'cube', 'twin']
pal = {'d': ['#569CD6', '#CE9178', '#C586C0', '#4EC9B0', '#6A9955', '#DCDCAA'],
       'l': ['#268BD2', '#CB4B16', '#D33682', '#2AA198', '#6C71C4', '#B58900']}
# transparent pixels keep no colour of their own: scaled, a keyed magenta would fringe
def clear(im):
    px = im.load()
    for x in range(im.width):
        for y in range(im.height):
            if px[x, y][3] == 0: px[x, y] = (0, 0, 0, 0)
# plain copies of every GIF / PNG that is drawn as is
for f in os.listdir(src):
    if f.endswith('.gif') or f in ('mail_down.png',):
        shutil.copy(os.path.join(src, f), os.path.join(out, f))
# every robot in every project-colour slot, both themes; the _d file is the base
for i, n in enumerate(robots):
    base = Image.open(os.path.join(src, n + '_d.png')).convert('RGBA')
    a = hx(pal['d'][i]); d = tuple(int(v * 0.6) for v in a)
    found = set(p[:3] for p in base.getdata())
    assert a in found and d in found, (n, a, d)
    for k, cols in pal.items():
        for slot, c in enumerate(cols):
            na = hx(c); nd = tuple(int(v * 0.6) for v in na)
            im = base.copy(); px = im.load()
            for x in range(im.width):
                for y in range(im.height):
                    p = px[x, y]
                    if p[:3] == a: px[x, y] = na + (p[3],)
                    elif p[:3] == d: px[x, y] = nd + (p[3],)
            clear(im)
            im.save(os.path.join(out, '%s_%d_%s.png' % (n, slot, k)))
# pre-tiled strips: mods cannot repeat a background, so one wide image is clipped instead
def tile(name, w, h, dest):
    t = Image.open(os.path.join(src, name)).convert('RGBA')
    im = Image.new('RGBA', (w, h))
    for x in range(0, w, t.width):
        for y in range(0, h, t.height):
            im.paste(t, (x, y))
    clear(im)
    im.save(os.path.join(out, dest), optimize=True)
tile('ground.png', 960, 16, 'ground_960.png')
tile('rail.png', 960, 8, 'rail_960.png')
tile('cave.png', 640, 640, 'cave_640.png')
# still frames, for reduced motion and offline machines
for g in ('i_host', 'cart', 'i_idle', 'miner_idle', 'i_block', 'i_done', 'i_work'):
    Image.open(os.path.join(src, g + '.gif')).convert('RGBA').save(os.path.join(out, g + '_still.png'))
print(len(os.listdir(out)), 'files')
