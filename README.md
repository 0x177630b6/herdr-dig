# herdr-fleet

A pixel-world layout for the Herdr app: one window for a fleet of
coding agents spread over several machines and projects, with one lead per project.

It installs alongside your own layouts, mods and keys. Nothing of yours is changed.

## What you get

- **Sidebar**: every agent once, by project, by machine or by status, plus a mini Office.
  A "+" on a project or a machine starts a new agent or terminal there.
- **Crew view**: the lead on the left with its avatar card and party, working agents
  stacked on the right. Sleeping (idle) agents have no pane until you click them.
- **Home**: "Needs you" cards and a projects × machines grid.
- **Office**: one cave room per project, the lead at a desk, each worker a miner.
- **Questions**: a toast and a mailbox for agents that are waiting on you.
- **Builder**: while an agent works, a small miner builds something at the bottom right
  of its pane (a tree, a house, a jet…).
- Dark and light themes, a status bar with your machines, carts on a rail.

## Install

Needs the Herdr app and `hc` (herdr-core).

```sh
./install.sh
herdr-app do layout.switch '{"name":"herdr-fleet"}'
```

`install.sh` copies `mods/fleet-*`, `layouts/herdr-fleet.*` and `themes/herdr-fleet-*.json`
into `~/.config/herdr-app/`, adds a `layout:herdr-fleet` section to `keys.json` (after
saving a backup `keys.json.before-fleet-<time>`) and runs `herdr-app check` on every mod.
When updating, use `./install.sh --keep-layout` so the crew arrangement is not reset.

## Use

| Key | Does |
| --- | --- |
| cmd-shift-h / o / k | Home / Office / crew view |
| cmd-shift-m | Mailbox |
| cmd-alt-l | Next sidebar mode |
| ctrl-1…9 | Project 1…9 |
| cmd-shift-, | Fleet settings (also: click the HERDR FLEET plate) |

- **Lead and avatar**: right-click an agent, or use Fleet settings. They are plain labels
  on the lead's terminal: `hc label <terminal> role=lead avatar=bolt|dome|mono|tank|cube|twin`.
  Without a label, the only parent of a project's sub-agents is its lead.
- **Settings**: avatars, theme, question toast, sound, motion, builder.
- **Agent questions** (optional): `hooks/fleet-ask.sh` lets a Claude Code agent publish its
  question and answer buttons as labels. It is not installed for you; see the file.
- **Agents that report no status** (for example Hermes run through a wrapper) are listed
  when Herdr knows their program as an agent, but always show as idle. A wrapper must be
  a script that stays in front, named after the agent, and not a shell script: Herdr reads
  a shell script as a shell. A Python one works:

  ```python
  #!/usr/bin/env python3
  import subprocess, sys
  sys.exit(subprocess.call(["docker", "exec", "-it", "hermes", "hermes", *sys.argv[1:]]))
  ```

## Source

- `src/lib.js`: the shared module. `install.sh` copies it into each mod (those copies are
  not kept in git).
- `mods/fleet-*`: one mod per part of the window. `mods/fleet-pane/builds.js` holds the
  builder's blueprints; add your own there.
- `src/gen_assets.py <original sprites> <out>` (needs Pillow) made the recoloured robots
  and pre-tiled strips in `mods/fleet-chrome/sprites/`.

## Remove

Delete `~/.config/herdr-app/mods/fleet-*`, `layouts/herdr-fleet.*`,
`themes/herdr-fleet-*.json` and the `layout:herdr-fleet` section of `keys.json`.

## Licence

MIT, see `LICENSE`. The Silkscreen font keeps its own licence (below).

## Credits

Pixel font: Silkscreen by Jason Kottke, SIL Open Font License
(`mods/fleet-chrome/fonts/LICENSE-Silkscreen.txt`). Minecraft was only the mood
reference: no textures, characters or fonts of it are used.
