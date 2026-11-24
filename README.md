# herdr-dig

The **herdr-fleet** layout: a pixel-world layout for the Herdr app: one window for a fleet of
coding agents spread over several machines and projects, with one lead per project.

It installs alongside your own layouts, mods and keys. Nothing of yours is changed.

## What you get

- **Sidebar**: every agent once, by project, by machine or by status, plus a mini Office.
  A "+" on a project or a machine starts a new agent or terminal there.
- **Crew view**: the lead on the left with its avatar card and party, working agents
  stacked on the right. Sleeping (idle) agents have no pane until you click them.
- **Home**: "Needs you" cards and a projects × machines grid.
- **Office**: one cave room per project, the lead at a desk, each worker a miner.
- **Questions**: a toast and a mailbox for agents that are waiting on you, and a desktop
  notification when Herdr is not the window in front (macOS and Omarchy).
- **Builder**: while an agent works, a small miner builds something at the bottom right
  of its pane (a tree, a house, a jet…).
- **Wandering miner**: every few minutes a small miner walks in along the rail, stops
  somewhere and climbs down to the ground. A click on it sends it away.
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
- **Groups**: one space can hold several projects. Right-click an agent, "Group…", pick a
  group or type a new name: the agents of a group are a project of their own (own lead,
  crew view, room and colour), the others stay under the space's name. Sub-agents follow
  their parent. It is the `group` label: `hc label <terminal> group=<name>` (`group=none`
  takes a sub-agent out of its parent's group).
- **Minimise and reorder**: the "−" on a sidebar header hides its agents ("▸" brings them
  back; a minimised header still shows when someone in it needs you). Right-click a
  project's header to move it up, down, to the top or to the bottom; right-click a worker
  to move it within its project. The order also applies to Home, the Office and ctrl-1…9.
- **Settings**: avatars, theme, question toast, desktop notification, sound, motion, builder, wandering miner, Claude usage.
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

## Desktop notifications

When an agent starts needing you while Herdr is not the active window, the layout raises one
system notification: "project / agent needs you", the question (or the last lines of its
terminal) and the machine. In front, the toast already says it, so nothing is raised.
Switch it off in Fleet settings ("Desktop notification when an agent needs you").

- One per question. Questions already waiting when the layout loads are not announced.
- **macOS**: `install.sh` builds a tiny notifier app, "Herdr Fleet", that carries the
  layout's pixel icon (`mods/fleet-notify/icon.png`); it appears under **Herdr Fleet** in
  System Settings > Notifications, where macOS may ask you to allow it the first time.
  Without that app the notification is sent with `osascript` and shows under
  **Script Editor**, with its icon.
- **Omarchy** (and other Linux desktops): sent with `notify-send` (libnotify, which Omarchy
  ships with), shown by mako as app "Herdr Fleet". Without `notify-send`, nothing happens.
- Windows: none.
- Herdr's own alert (its sound and its corner note, Settings > Alerts) stays inside the
  window; this adds the part that reaches you outside it. Nothing is sent over the network.

## Claude usage (optional, off by default)

"Claude usage in the sidebar" in Fleet settings adds two lines under the counts: how much
of your Claude plan's weekly limit is used (one bar for the week, one for the per-model
limit) and when the week starts again. It is refreshed every 5 minutes while the window is active.

Read this before switching it on: it runs `mods/fleet-status/usage.py`, which reads the
sign-in Claude Code keeps on this computer (the macOS keychain item "Claude Code-credentials",
or `~/.claude/.credentials.json`) and sends it to `api.anthropic.com` only, to an endpoint
Anthropic does not document and may change. The token is never printed, stored or put on a
command line. It is the one place where the layout uses the network.

Any switch of Fleet settings can also be set from a key or a script:
`herdr-app do fleet-tabs.set:usage=on` (`avatars`, `toast`, `notify`, `sound`, `motion`,
`builder`, `walker`, `usage`; `on` or `off`).

## Source

- `src/lib.js`: the shared module. `install.sh` copies it into each mod (those copies are
  not kept in git).
- `mods/fleet-*`: one mod per part of the window. `mods/fleet-pane/builds.js` holds the
  builder's blueprints; add your own there.
- `src/gen_assets.py <original sprites> <out>` (needs Pillow) made the recoloured robots
  and pre-tiled strips in `mods/fleet-chrome/sprites/`.
- `src/gen_walker.py <out>` (needs Pillow) draws the wandering miner's sprites (`walker_*`).

## Remove

Delete `~/.config/herdr-app/mods/fleet-*`, `layouts/herdr-fleet.*`,
`themes/herdr-fleet-*.json` and the `layout:herdr-fleet` section of `keys.json`.

## Licence

MIT, see `LICENSE`. The Silkscreen font keeps its own licence (below).

## Credits

Pixel font: Silkscreen by Jason Kottke, SIL Open Font License
(`mods/fleet-chrome/fonts/LICENSE-Silkscreen.txt`). Minecraft was only the mood
reference: no textures, characters or fonts of it are used.
