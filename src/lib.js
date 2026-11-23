// Shared by every fleet-* mod: tokens, the fleet model (projects, leads, avatars,
// machines, questions), label writes and the small pixel-world UI kit.
// One source, src/lib.js; install.sh copies it into each mod folder. Edit it there.

import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, terminals, spaces, machines, theme, shared, setShared, hc, run, layout, openOverlay } from "herdr";

export const SPR = "mods/fleet-chrome/sprites/";
export const PIXEL = "Silkscreen";
export const ROBOTS = ["bolt", "dome", "mono", "tank", "cube", "twin"];

// tokens.json. The app theme (themes/herdr-fleet-*.json) carries the same values for
// terminals and shipped mods; these are the ones the theme has no name for.
const THEMES = {
  dark: {
    canvas: "#181818", chrome: "#252526", pane: "#1E1E1E", border: "#3C3C3C", selected: "#37373D",
    text: "#D4D4D4", muted: "#9D9D9D", blue: "#569CD6", orange: "#CE9178", blueText: "#569CD6",
    orangeText: "#CE9178", idle: "#808080", room: "#2D2D2D", card: "#333333",
    statusBarBg: "#007ACC", statusBarFg: "#FFFFFF",
    project: ["#569CD6", "#CE9178", "#C586C0", "#4EC9B0", "#6A9955", "#DCDCAA"],
    banner: "banner_night.gif", suffix: "d", name: "herdr-fleet-dark",
  },
  light: {
    canvas: "#DDD6C1", chrome: "#EEE8D5", pane: "#FDF6E3", border: "#C9C1A9", selected: "#FDF6E3",
    text: "#073642", muted: "#586E75", blue: "#268BD2", orange: "#CB4B16", blueText: "#1A6DA8",
    orangeText: "#AD3D0F", idle: "#93A1A1", room: "#EEE8D5", card: "#DDD6C1",
    statusBarBg: "#EEE8D5", statusBarFg: "#586E75",
    project: ["#268BD2", "#CB4B16", "#D33682", "#2AA198", "#6C71C4", "#B58900"],
    banner: "banner_day.gif", suffix: "l", name: "herdr-fleet-light",
  },
};
// The toast slab and the cave walls stay dark in both themes.
export const SLAB = { bg: "#252526", pane: "#1E1E1E", text: "#E6E6E6", muted: "#B8B8B8", border: "#E6E6E6", title: "#DCDCAA", button: "#808080", canvas: "#181818" };
export const CAVE = { text: "#E6E6E6", muted: "#B8B8B8" };
export const INK = "#0C0E12";

// Light or dark goes by the shown theme's terminal background, so a theme picked in
// Herdr's own settings still gets the matching banner and robots.
export function isLight() {
  const bg = String(theme().background ?? "#000000");
  const n = parseInt(bg.slice(1, 7), 16);
  if (Number.isNaN(n)) return false;
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 140;
}
export function tk() {
  const light = isLight();
  return { ...THEMES[light ? "light" : "dark"], light };
}
export function toggleTheme() {
  run("app.theme", { name: THEMES[isLight() ? "dark" : "light"].name });
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// --- preferences (shared state: every mod sees them, they survive restarts) ---

const PREFS = { avatars: true, toast: true, notify: true, sound: false, motion: true, builder: true, walker: true, local: "local" };
export const pref = (key) => shared(`fleet.${key}`) ?? PREFS[key];
export const setPref = (key, value) => setShared(`fleet.${key}`, value);

export const sidebarMode = () => find(layout(), "sidebar-lists")?.active ?? "projects";
export const setSidebarMode = (mode) => run("layout.select", { stack: "sidebar-lists", child: mode });
export const workView = () => find(layout(), "work-view")?.active ?? "crew";
export const setWorkView = (view) => { if (workView() !== view) run("layout.select", { stack: "work-view", child: view }); };

// --- status language ---

export const STATUS = {
  working: { label: "working", icon: "i_work.gif", miner: "miner_working.gif", role: "blue" },
  blocked: { label: "needs you", icon: "i_block.gif", miner: "miner_blocked.gif", role: "orange" },
  done: { label: "done", icon: "i_done.gif", miner: "miner_done.gif", role: "text" },
  // Sleeping is drawn still: only what is happening moves.
  idle: { label: "idle", icon: "i_idle_still.png", miner: "miner_idle_still.png", role: "idle" },
};
export const ORDER = ["blocked", "done", "working", "idle"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// The core says "error" for a failed agent; the app's list never says it. Both need the person.
const word = (s) => (s === "error" || s === "failed" ? "blocked" : STATUS[s] ? s : "idle");

// Deterministic, so every machine shows the same robot and colour for a project.
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Drops the status glyph or spinner an agent puts before its title.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();
const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : null);
export const machineLabel = (m) => m ?? pref("local");

// A just-written label takes about 0.65 s to come back in terminals(): until then
// the model shows what was written.
const pending = () => {
  const p = shared("fleet.pending");
  return p && Date.now() - p.at < 3000 ? p : null;
};

// The whole fleet as the mods draw it:
// { projects: [{ id, name, machine, slot, color, lead, workers, agents, avatar, working }],
//   machines: [{ name, label, online, agents }], agents, counts, questions }
export function fleet() {
  const t = tk();
  const listed = new Map(agents().map((a) => [a.address, a]));
  const live = terminals().filter((x) => x.state === "live");
  const byAddress = new Map(live.map((x) => [x.address, x]));
  const all = spaces();
  const tabs = new Map(all.flatMap((s) => s.tabs.map((tab) => [tab.id, tab])));
  const opt = pending();

  const spaceOf = (x, depth = 0) => {
    const a = listed.get(x.address);
    if (a) return a.space;
    const m = machineOf(x.address), id = x.labels?.["herdr.space"];
    if (id) return m ? `${m}/${id}` : id;
    const parent = x.parent && depth < 8 ? byAddress.get(x.parent) : null;
    return parent ? spaceOf(parent, depth + 1) : null;
  };

  // Machines: this computer first, then by name. Offline by the app's connection,
  // or by `hc machine ls` (fleet-status polls it).
  const states = shared("fleet.machines") ?? {};
  const machineList = machines()
    .map((m) => ({ name: m.name, label: machineLabel(m.name), online: m.name === null || (m.layout !== "unavailable" && (states[m.name] ?? "connected") === "connected"), agents: [] }))
    .sort((a, b) => (a.name === null ? -1 : b.name === null ? 1 : a.name.localeCompare(b.name)));
  if (!machineList.some((m) => m.name === null)) machineList.unshift({ name: null, label: machineLabel(null), online: true, agents: [] });
  const machineByName = new Map(machineList.map((m) => [m.name, m]));
  const machineFor = (name) => {
    if (!machineByName.has(name)) {
      const m = { name, label: machineLabel(name), online: (states[name] ?? "connected") === "connected", agents: [] };
      machineByName.set(name, m);
      machineList.push(m);
    }
    return machineByName.get(name);
  };

  const projects = all.map((s) => ({ id: s.id, name: s.name, machine: s.machine, active: s.active, agents: [] }));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const list = [];
  const kinds = new Set(shared("fleet.kinds") ?? []);
  for (const x of live) {
    const a = listed.get(x.address);
    // An agent that reports nothing to Herdr (Hermes behind a wrapper) still counts when
    // its program is one of the agents people start from a menu.
    if (!a && !x.program?.agent && !kinds.has(x.program?.key)) continue;
    const space = spaceOf(x);
    const project = projectById.get(space);
    if (!project) continue;
    const tab = tabs.get(a?.tab ?? "");
    const title = clean(a?.title ?? x.title);
    const telling = title && title !== x.address && !/^[~/]/.test(title) && !title.includes("@") && title.toLowerCase() !== x.program?.key && title !== x.program?.name;
    const machine = machineOf(x.address);
    const labels = { ...(x.labels ?? {}) };
    if (opt?.labels?.[x.address]) Object.assign(labels, opt.labels[x.address]);
    list.push({
      address: x.address, machine, machineLabel: machineLabel(machine), space, project: project.name,
      // A tab named after its program ("Claude Code") says nothing: the agent's own title wins.
      name: x.name || (tab?.named && tab.name !== x.program?.name ? tab.name : null) || (telling ? title : null) || x.program?.name || x.address,
      status: word(a ? a.status : x.status === "done" ? "idle" : x.status),
      pane: a?.pane ?? null, tab: a?.tab ?? (labels["herdr.tab"] ? (machine ? `${machine}/` : "") + labels["herdr.tab"] : null), parent: x.parent ?? null, labels,
      report: x.report ?? null, focused: Boolean(a?.focused), offline: false,
    });
  }

  // Agents of a machine that went away: the last roster, never shown as idle.
  const roster = shared("fleet.roster") ?? {};
  const have = new Set(list.map((a) => a.address));
  for (const m of machineList) {
    if (m.online || m.name === null) continue;
    for (const a of list) if (a.machine === m.name) a.offline = true;
    for (const r of roster[m.name] ?? []) {
      if (have.has(r.address)) continue;
      let project = projectById.get(r.space);
      if (!project) {
        project = { id: r.space, name: r.project, machine: m.name, active: false, agents: [] };
        projects.push(project);
        projectById.set(r.space, project);
      }
      list.push({ address: r.address, machine: m.name, machineLabel: m.name, space: r.space, project: project.name, name: r.name, status: "idle", pane: null, tab: null, parent: null, labels: r.labels ?? {}, report: null, focused: false, offline: true });
    }
  }

  const asks = [];
  for (const a of list) {
    const p = projectById.get(a.space);
    p.agents.push(a);
    machineFor(a.machine).agents.push(a);
  }
  // Colour and robot slot: the name's hash; two projects landing on one slot are told
  // apart in name order by the next free one (the same on every machine showing this fleet).
  const taken = new Set();
  for (const p of [...projects].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    let slot = hash(p.name) % 6;
    for (let i = 0; i < 6 && taken.has(slot); i++) slot = (slot + 1) % 6;
    taken.add(slot);
    if (taken.size === 6) taken.clear();
    p.slot = slot;
  }
  for (const p of projects) {
    p.color = t.project[p.slot];
    p.initial = (p.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
    // The lead: the role=lead label; else the only parent of the project's sub-agents; else none.
    const labelled = p.agents.filter((a) => a.labels.role === "lead");
    const inProject = new Set(p.agents.map((a) => a.address));
    const parents = [...new Set(p.agents.map((a) => a.parent).filter((x) => x && inProject.has(x)))];
    p.lead = labelled[0] ?? (parents.length === 1 ? p.agents.find((a) => a.address === parents[0]) : null) ?? null;
    for (const a of p.agents) a.lead = a === p.lead;
    p.workers = p.agents.filter((a) => !a.lead);
    p.agents = p.lead ? [p.lead, ...p.workers] : p.workers;
    p.robot = ROBOTS.includes(p.lead?.labels.avatar) ? p.lead.labels.avatar : ROBOTS[p.slot];
    p.avatar = avatarPath(p.robot, p.slot, t);
    p.pal = p.robot[0].toUpperCase() + p.robot.slice(1);
    p.working = p.agents.filter((a) => a.status === "working" && !a.offline).length;
    for (const a of p.agents) {
      a.slot = p.slot;
      a.avatar = !a.lead && ROBOTS.includes(a.labels.avatar) ? avatarPath(a.labels.avatar, p.slot, t) : null;
      if (a.status === "blocked" && !a.offline) asks.push(question(a));
    }
  }
  const agentsOut = projects.flatMap((p) => p.agents);
  const counts = { working: 0, blocked: 0, done: 0, idle: 0, offline: 0 };
  for (const a of agentsOut) counts[a.offline ? "offline" : a.status] += 1;
  return { projects, machines: machineList, agents: agentsOut, counts, questions: asks, active: projects.find((p) => p.active) ?? null };
}

export const avatarPath = (robot, slot, t) => `${SPR}${robot}_${slot}_${t.suffix}.png`;

// A pending question. The text: the `ask` label (set by the agent's hook), else what the
// agent reported. `choices`: "Yes|No", or "Yes:1|No:esc" where the part after the colon is
// the keys to press instead of text to type.
function question(a) {
  const ask = String(a.labels.ask ?? "").trim() || String(a.report?.msg ?? "").trim();
  const choices = String(a.labels.choices ?? "").split("|").map((c) => c.trim()).filter(Boolean).map((c) => {
    const at = c.lastIndexOf(":");
    return at > 0 ? { label: c.slice(0, at), keys: c.slice(at + 1).trim().split(/\s+/) } : { label: c, text: c };
  });
  return { agent: a, ask, choices, key: `${a.address}\u0000${ask}` };
}

// --- actions ---

// Shows an agent: its project's crew, its pane focused. fleet-tabs finishes the focus
// once the crew is on screen.
export function pick(a) {
  if (a.offline) return;
  setShared("fleet.want", { address: a.address, at: Date.now() });
  setWorkView("crew");
  run("space.select", { id: a.space });
}
export function pickProject(p) {
  setShared("fleet.want", { address: null, at: Date.now() });
  setWorkView("crew");
  run("space.select", { id: p.id });
}

function writeLabels(changes) {
  const labels = { ...(pending()?.labels ?? {}) };
  for (const [address, kv] of Object.entries(changes)) labels[address] = { ...(labels[address] ?? {}), ...kv };
  setShared("fleet.pending", { at: Date.now(), labels });
  for (const [address, kv] of Object.entries(changes)) hc(["label", address, ...Object.entries(kv).map(([k, v]) => `${k}=${v}`)]).catch(() => null);
}
// At most one lead per project: the previous one loses the label.
export function makeLead(p, a) {
  const changes = {};
  for (const other of p.agents) if (other.labels.role === "lead" && other.address !== a?.address) changes[other.address] = { role: "" };
  if (a) changes[a.address] = { role: "lead", ...(p.lead?.labels.avatar && p.lead.address !== a.address ? { avatar: p.lead.labels.avatar } : {}) };
  writeLabels(changes);
}
// The avatar is the lead's; a worker gets one only when asked for by name.
export function setAvatar(p, a, robot) {
  const target = a ?? p.lead;
  if (!target) return;
  const changes = { [target.address]: { avatar: robot } };
  // No labelled lead yet: the label makes today's lead stick, so the avatar has someone to live on.
  if (target === p.lead && target.labels.role !== "lead") changes[target.address].role = "lead";
  writeLabels(changes);
}
// Answers a question in the agent's terminal and clears it.
export function answer(q, choice) {
  const a = q.agent;
  if (choice.keys) hc(["keys", a.address, ...choice.keys]).catch(() => null);
  else hc(["send", "--force", a.address, choice.text]).catch(() => null);
  writeLabels({ [a.address]: { ask: "", choices: "" } });
}

// The right-click menu of an agent: Make lead, Change avatar, Open (fleet-agents draws it).
export function agentMenu(a) {
  if (a.offline) return;
  openOverlay({ mod: "fleet-agents", kind: "popup", width: 232, height: 196, props: { menu: a.address } });
}

// The "+" menu: a new agent or terminal in a project ({ space, machine, title }), or a
// new project on a machine ({ machine, title }).
export function addMenu(target) {
  openOverlay({ mod: "fleet-agents", kind: "popup", width: 248, props: { add: target } });
}
// The small "+" that opens it.
export const addButton = (id, t, target) => div().id(id).size(22).flex_none().flex().items_center().justify_center()
  .border(1).border_color(t.border).text_color(t.muted).font_bold().cursor_pointer().tooltip(target.space ? `New agent or terminal in ${target.title}` : `New project on ${target.title}`)
  .hover((s) => s.text_color(t.text).border_color(t.text))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click((_e, cx) => { cx.stop_propagation(); addMenu(target); }).child("+");

// Remembers who lives on each reachable machine, so a machine that drops off still
// shows its agents (as offline). Called by the one mod that owns layout-level work.
export function syncRoster(model) {
  const old = shared("fleet.roster") ?? {};
  const next = { ...old };
  for (const m of model.machines) {
    if (m.name === null || !m.online) continue;
    next[m.name] = m.agents.filter((a) => !a.offline).map((a) => ({ address: a.address, name: a.name, space: a.space, project: a.project, labels: { role: a.labels.role, avatar: a.labels.avatar } }));
  }
  if (JSON.stringify(next) !== JSON.stringify(old)) setShared("fleet.roster", next);
}

// --- UI kit ---

export const sprite = (file, w, h = w) => image(SPR + file).w(w).h(h).flex_none();
export const statusIcon = (status, size = 16) => sprite(STATUS[status].icon, size);
export const tag = (text, color) => div().flex_none().text_size(11).text_color(color).child(`[${text}]`);
export const agentTag = (a) => (a.offline ? `${a.machineLabel}: offline` : a.machineLabel);

// 2px border and a hard 2px/2px shadow in the border colour. `build` adds the
// children and the click to the face.
export function pixelButton(id, t, opts, build) {
  const { active = false, h = 32, px = 12, border = t.border, bg = t.chrome, color = t.muted, on = t.text, onInk = t.canvas, grow = false } = opts ?? {};
  const face = h_flex().id(id).relative().h(h).px(px).gap(8).items_center().justify_center().border(2).border_color(border)
    .bg(active ? on : bg).text_color(active ? onInk : color).cursor_pointer()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  const outer = div().relative().pr(2).pb(2)
    .child(div().absolute().left(2).top(2).right(0).bottom(0).bg(border))
    .child(build(face));
  return grow ? outer.flex_1().min_w(0) : outer.flex_none();
}

// Mods cannot repeat a background: pre-tiled pieces side by side in a clipped box.
// An image is fitted inside its box, so a box rounded a hair short would shrink the whole
// piece and open seams: each box is 1px taller than its art, and the width decides.
export const strip = (file, h) => div().relative().w_full().h(h).flex_none().overflow_hidden()
  .children([0, 1, 2, 3].map((i) => image(SPR + file).absolute().left(i * 960).top(0).w(960).h(h + 1)));
export const ground = () => strip("ground_960.png", 16);
// The cave wall behind a room's content (64px tiles), as 640px squares.
export const caveWall = () => [0, 1, 2, 3].map((i) => image(SPR + "cave_640.png").absolute().left(i * 640).top(0).w(640).h(641));

export const heading = (t, text) => div().font_family(PIXEL).text_size(13).text_color(t.muted).child(`── ${text}`.toUpperCase());

// The project's mark: the lead's robot, or (avatars off) a square with its initial.
export function projectMark(p, t, size, plain = 20) {
  if (pref("avatars")) return div().flex_none().size(size).bg(t.selected).child(image(p.avatar).w(size).h(size));
  return div().flex_none().size(plain).flex().items_center().justify_center().bg(p.color).text_color(INK).text_size(11).font_bold().child(p.initial);
}

// Working: dashed blue. Needs you: solid orange. Done: solid text. Idle: solid idle.
export function statusBorder(el, status, t) {
  const color = { working: t.blue, blocked: t.orange, done: t.text, idle: t.idle }[status];
  return status === "working" ? el.border(2).border_dashed().border_color(color) : el.border(2).border_color(color);
}

// A [ on ] / [ off ] switch in the layout's own voice.
export function toggle(id, t, on, action) {
  return h_flex().id(id).h(28).px(10).flex_none().items_center().border(1).border_color(on ? t.text : t.border)
    .bg(on ? t.text : t.chrome).text_color(on ? t.canvas : t.muted).cursor_pointer().on_click(action).child(on ? "[ on ]" : "[ off ]");
}
