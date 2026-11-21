#!/bin/sh
# Installs (or updates) the herdr-fleet layout into the Herdr app's home.
# Adds alongside: existing layouts, mods and key sections are never changed.
#   ./install.sh          copy everything, merge keys, check every mod
#   ./install.sh --keep-layout   same, but leave an installed layouts/herdr-fleet.json alone
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
[ -d "$HOME_DIR" ] || { echo "no Herdr app home at $HOME_DIR" >&2; exit 1; }

# The shared module, into every mod that imports it.
for mod in "$HERE"/mods/fleet-*; do
  cp "$HERE/src/lib.js" "$mod/lib.js"
done

mkdir -p "$HOME_DIR/mods" "$HOME_DIR/layouts" "$HOME_DIR/themes"

# macOS shows a notification under the icon of the app that posts it: build a tiny
# notifier app carrying the layout's pixel icon (Script Editor's icon otherwise).
build_notifier() {
  src="$HERE/mods/fleet-notify"; app="$HOME_DIR/mods/fleet-notify/Herdr Fleet.app"
  [ "$(uname)" = "Darwin" ] || return 0
  [ -d "$app" ] && [ "$app" -nt "$src/notifier.js" ] && [ "$app" -nt "$src/icon.png" ] && return 0
  tmp=$(mktemp -d) || return 1
  mkdir -p "$HOME_DIR/mods/fleet-notify" "$tmp/fleet.iconset"
  for n in 16 32 128 256 512; do
    sips -z "$n" "$n" "$src/icon.png" --out "$tmp/fleet.iconset/icon_${n}x${n}.png" >/dev/null || return 1
    sips -z $((n * 2)) $((n * 2)) "$src/icon.png" --out "$tmp/fleet.iconset/icon_${n}x${n}@2x.png" >/dev/null || return 1
  done
  iconutil -c icns "$tmp/fleet.iconset" -o "$tmp/fleet.icns" || return 1
  osacompile -l JavaScript -o "$tmp/Herdr Fleet.app" "$src/notifier.js" || return 1
  cp "$tmp/fleet.icns" "$tmp/Herdr Fleet.app/Contents/Resources/applet.icns"
  rm -f "$tmp/Herdr Fleet.app/Contents/Resources/Assets.car"
  plist="$tmp/Herdr Fleet.app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string dev.herdr-fleet.notifier" "$plist" >/dev/null
  codesign --force -s - "$tmp/Herdr Fleet.app" >/dev/null 2>&1 || return 1
  [ -d "$app" ] && mv "$app" "$tmp/old.app"
  mv "$tmp/Herdr Fleet.app" "$app"
}
build_notifier || echo "note: notifier app not built; notifications will use Script Editor's icon" >&2
for mod in "$HERE"/mods/fleet-*; do
  name=$(basename "$mod")
  mkdir -p "$HOME_DIR/mods/$name"
  # The app writes its own files into a mod folder (.d.ts, jsconfig.json): leave them.
  (cd "$mod" && find . -type f ! -name '.DS_Store' | while read -r f; do
    mkdir -p "$HOME_DIR/mods/$name/$(dirname "$f")"
    cmp -s "$f" "$HOME_DIR/mods/$name/$f" || cp "$f" "$HOME_DIR/mods/$name/$f"
  done)
done
cp "$HERE"/themes/herdr-fleet-*.json "$HOME_DIR/themes/"
cp "$HERE/layouts/herdr-fleet.svg" "$HOME_DIR/layouts/" 2>/dev/null || true
if [ "${1:-}" != "--keep-layout" ] || [ ! -f "$HOME_DIR/layouts/herdr-fleet.json" ]; then
  cp "$HERE/layouts/herdr-fleet.json" "$HOME_DIR/layouts/herdr-fleet.json"
fi

# Keys: add the layout's own section; every other section stays byte for byte in meaning.
python3 -I - "$HERE/keys.json" "$HOME_DIR/keys.json" <<'PY'
import json, os, shutil, sys, time
src, dst = sys.argv[1], sys.argv[2]
add = json.load(open(src))
cur = json.load(open(dst)) if os.path.exists(dst) else {}
new = dict(cur)
for section, keys in add.items():
    new[section] = keys
if new != cur:
    if os.path.exists(dst):
        shutil.copy(dst, dst + ".before-fleet-" + time.strftime("%Y%m%d-%H%M%S"))
    tmp = dst + ".tmp"
    json.dump(new, open(tmp, "w"), ensure_ascii=True, separators=(",", ":"))
    os.replace(tmp, dst)
    print("keys.json: section(s) written:", ", ".join(add))
PY

status=0
for mod in "$HERE"/mods/fleet-*; do
  name=$(basename "$mod")
  [ -f "$mod/main.js" ] || continue
  if out=$(herdr-app check "$HOME_DIR/mods/$name" 2>&1); then echo "ok   $name"; else echo "FAIL $name"; echo "$out"; status=1; fi
done
exit $status
