// The top of the work area: the workshop (the shown project at work: its lead at a desk,
// workers walking to a desk when they start and back to the break corner when they stop,
// the mailbox on the wall), or with the workshop switched off the plain top bar (Home,
// Office, the crew button, one tab per agent, the mailbox). It is also the one mod that does layout-level work: it listens for the
// layout's key commands, arranges the crew view (lead left, workers stacked right) and
// keeps the roster of who lives on which machine.
//
// The crew view is a composition of terminal blocks written with layout.set: the
// person's own tabs and splits are never rearranged.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, layout, focused, spaces, panes, window, settings, shared, setShared, nextCommand, openOverlay, closeOverlay, checking } from "herdr";
import { SPR, PIXEL, tk, fleet, find, pref, pick, pickProject, agentMenu, ago, syncRoster, workView, setWorkView, sidebarMode, setSidebarMode, pixelButton, projectMark, statusIcon, sprite, addButton, follow, setPref, isSwitch, HEADER } from "./lib.js";

const MODES = ["projects", "machines", "inbox", "office-mini"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// More panes than this on the right are too short to read; the rest stay one click away as tabs.
const MAX_WORKERS = 4;
const LEAD_CARD = 101;
// The workshop: px a second walking, a desk's width, the lead's corner, the break corner,
// the floor's height. It is as tall as the sidebar's header, less the rail under it.
const STROLL = 120, DESK = 176, LEAD = 210, BREAK = 250, FLOOR = 22;
const BAR = 44, BANNER = 58, RAIL = 30;
const MINER = { working: "miner_working.gif", blocked: "miner_blocked.gif", done: "miner_done.gif" };
const nodeId = (address) => address.replace(/[^A-Za-z0-9]/g, "_");
const shape = (node) => [node.id, node.size?.px ?? node.size?.weight ?? null, (node.floating ?? []).length, (node.children ?? []).map(shape)];

function paneNode(a, { lead = false, weight } = {}) {
  const id = nodeId(a.address);
  return {
    id: `crew-${id}`, type: "column", resizable: false, background: "background", border: { width: 1, color: "border" },
    ...(weight ? { size: { weight } } : {}),
    // The builder: draws nothing (so hides) unless the agent is working. It floats on the
    // pane, not on its terminal block: layout.set takes at most 16 levels of nesting.
    floating: [{ id: `crew-b-${id}`, content: { mod: "fleet-pane", props: { build: a.address } }, edge: "bottom", align: "end" }],
    children: [
      { id: `crew-h-${id}`, type: "block", size: { px: 32 + (lead ? LEAD_CARD : 0) }, content: { mod: "fleet-pane", props: { terminal: a.address, lead } } },
      { id: `crew-t-${id}`, type: "block", content: { terminal: a.address } },
    ],
  };
}

export default class FleetTabs extends View {
  init(_props, cx) {
    this.visible = {};
    this.woken = {};
    this.lastSet = { sig: "", at: 0 };
    this.refocus = { address: null, at: 0 };
    this.mail = null;
    // The workshop: who sits at which desk (sticky), where each one was last drawn, who walks.
    this.desks = [];
    this.spot = {};
    this.walks = {};
    this.steps = 0;
    this.width = 0;
    if (checking()) return;
    // render() asks for another look a moment later through this timer (a timer started
    // from render itself never redraws).
    this.again = false;
    cx.timer.every(350, (cx) => { if (this.again) { this.again = false; cx.notify(); } });
    // A walk is drawn at its start, then this timer sends it off and later seats it.
    cx.timer.every(120, (cx) => {
      const now = Date.now();
      let moved = false;
      for (const [address, w] of Object.entries(this.walks)) {
        if (!w.go && now - w.at > 60) { w.go = true; moved = true; }
        else if (w.go && now > w.at + 60 + w.ms) { delete this.walks[address]; moved = true; }
      }
      if (moved) cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c);
        cx.notify();
      }
    });
  }

  command(c) {
    if (c === "home" || c === "office" || c === "crew") setWorkView(c);
    else if (c === "mailbox") this.mailbox();
    // Calls the wandering miner now (the rail sends it out).
    else if (c === "walk") setShared("fleet.summon", Date.now());
    // A switch of Fleet settings from a key or a script: "set:usage=on", "set:walker=off".
    else if (c.startsWith("set:")) {
      const [key, value] = c.slice(4).split("=");
      if (isSwitch(key) && (value === "on" || value === "off")) setPref(key, value === "on");
    }
    // The next agent that finished while you weren't looking, in the sidebar's order.
    else if (c === "unread") {
      const list = fleet().agents, at = list.findIndex((a) => a.address === focused()?.terminal);
      const next = [...list.slice(at + 1), ...list.slice(0, at + 1)].find((a) => a.unread);
      if (next) pick(next);
    }
    else if (c === "sidebar-next") setSidebarMode(MODES[(MODES.indexOf(sidebarMode()) + 1) % MODES.length]);
    else if (c.startsWith("space:")) {
      const p = fleet().projects[Number(c.slice(6)) - 1];
      if (p) pickProject(p);
    }
  }

  mailbox() {
    if (shared("fleet.mailbox") && this.mail) { closeOverlay(this.mail); this.mail = null; return; }
    this.mail = openOverlay({ mod: "fleet-notify", kind: "popup", frame: "none", width: 384, props: { part: "mailbox" } });
  }

  // Which workers get a pane. Sticky, so a status change doesn't reshuffle the panes:
  // someone only moves in when they must be seen (wanted, focused, needs you).
  // A sleeping (idle) worker has no pane until it is clicked; one woken sleeper per
  // project stays until another is clicked. The lead is not a worker: always shown.
  workersShown(p, must, wanted) {
    // The one just clicked comes before the one that merely has the keyboard.
    const sleeper = (address) => p.workers.find((a) => a.status === "idle" && a.address === address);
    const woke = sleeper(wanted) ?? p.workers.find((a) => a.status === "idle" && must.has(a.address));
    if (woke) this.woken[p.id] = woke.address;
    const online = p.workers.filter((a) => !a.offline && (a.status !== "idle" || this.woken[p.id] === a.address));
    const cap = p.lead ? MAX_WORKERS : MAX_WORKERS + 2;
    const rank = (a) => (must.has(a.address) ? 9 : RANK[a.status]);
    const live = new Set(online.map((a) => a.address));
    let shown = (this.visible[p.id] ?? []).filter((x) => live.has(x));
    const by = new Map(online.map((a) => [a.address, a]));
    for (const a of [...online].sort((x, y) => rank(y) - rank(x))) {
      if (shown.includes(a.address)) continue;
      if (shown.length < cap) { shown.push(a.address); continue; }
      if (rank(a) < 4) break;
      const weakest = [...shown].sort((x, y) => rank(by.get(x)) - rank(by.get(y)))[0];
      if (rank(by.get(weakest)) >= rank(a)) break;
      shown[shown.indexOf(weakest)] = a.address;
    }
    this.visible[p.id] = shown;
    return online.filter((a) => shown.includes(a.address));
  }

  // The crew node as it should be for the shown project.
  crew(p, must, wanted) {
    const asleep = p?.agents.some((a) => !a.offline);
    const empty = [{ id: asleep ? "crew-asleep" : "crew-empty", type: "block", content: { mod: "fleet-pane", props: { empty: true, asleep } } }];
    if (!p) return empty;
    const lead = p.lead && !p.lead.offline ? p.lead : null;
    const workers = this.workersShown(p, must, wanted);
    const column = (id, list, weight) => ({ id, type: "column", gap: 8, resizable: false, size: { weight }, children: list.map((a) => paneNode(a)) });
    if (lead) {
      const card = pref("avatars");
      return workers.length
        ? [paneNode(lead, { lead: card, weight: 3 }), column("crew-workers", workers, 2)]
        : [paneNode(lead, { lead: card })];
    }
    // No lead: every pane is equal.
    if (!workers.length) return empty;
    if (workers.length === 1) return [paneNode(workers[0])];
    const half = Math.ceil(workers.length / 2);
    return [column("crew-a", workers.slice(0, half), 1), column("crew-b", workers.slice(half), 1)];
  }

  // The sidebar header is taller while it shows the Claude usage lines; the workshop is as
  // tall as that header less the rail, so its floor meets the rail where the header ends.
  fit() {
    const root = layout(), node = find(root, "sidebar-modes"), bar = find(root, "tabs-row"), now = Date.now();
    const px = pref("usage") ? HEADER.usage : HEADER.plain;
    const top = pref("workshop") ? BANNER + px - RAIL : BAR;
    const stale = Boolean(find(root, "workshop"));
    if ((!node || node.size?.px === px) && (!bar || bar.size?.px === top) && !stale) return false;
    if (now - (this.fitted ?? 0) < 1500) return true;
    this.fitted = now;
    const next = JSON.parse(JSON.stringify(root));
    if (node) find(next, "sidebar-modes").size = { px };
    if (bar) find(next, "tabs-row").size = { px: top };
    // The workshop of an earlier version was a block of its own.
    const column = find(next, "work");
    if (column) column.children = column.children.filter((c) => c.id !== "workshop");
    run("layout.set", { layout: next });
    return true;
  }

  arrange(model) {
    const root = layout(), now = Date.now();
    const node = find(root, "crew");
    if (!node || workView() !== "crew") return;
    const f = focused();
    let want = shared("fleet.want");
    if (want && now - want.at > 10000) want = null;
    const p = model.active;
    const must = new Set([want?.address, f?.terminal].filter(Boolean));
    const children = this.crew(p, must, want?.address);
    const sig = JSON.stringify(children.map(shape));
    if (sig !== JSON.stringify((node.children ?? []).map(shape))) {
      // Asked for already: the layout is on its way.
      if (this.lastSet.sig === sig && now - this.lastSet.at < 1500) return true;
      this.lastSet = { sig, at: now };
      const next = JSON.parse(JSON.stringify(root));
      find(next, "crew").children = children;
      run("layout.set", { layout: next });
      return true;
    }
    // The crew is on screen: give the keyboard to the block of the agent asked for, or to
    // the block of an agent whose own (hidden) pane got it from a key or the picker.
    const inCrew = (address) => Boolean(address && find(node, `crew-t-${nodeId(address)}`));
    if (want) {
      if (!want.address) setShared("fleet.want", null);
      else if (inCrew(want.address)) {
        setShared("fleet.want", null);
        run("pane.focus", { terminal: want.address });
      } else return true;
      return false;
    }
    if (f?.pane && inCrew(f.terminal) && !(this.refocus.address === f.terminal && now - this.refocus.at < 2000)) {
      this.refocus = { address: f.terminal, at: now };
      run("pane.focus", { terminal: f.terminal });
    }
  }

  // The workshop: wall, floor, the lead's corner, a row of desks, the break corner.
  workshop(t, model, inset, shells, pending, open) {
    const p = model.active;
    const zoom = settings().zoom || 1;
    const w = (this.width || 1600) / zoom;
    const h = find(layout(), "tabs-row")?.size?.px ?? 200;
    const floor = h - FLOOR;
    const moving = pref("motion");
    const room = t.light
      ? { wall: "#EEE8D5", low: "#E4DCC6", line: "#C9C1A9", floor: "#C9A57A", plank: "#B48E62", edge: "#9C7A52", bench: "#8B7355" }
      : { wall: "#2A2A2B", low: "#252526", line: "#3C3C3C", floor: "#5C4A36", plank: "#4A3B2B", edge: "#3A2E22", bench: "#6C5A44" };

    // At a desk: working, waiting on you, or finished and not read yet. Resting ones are not here.
    const busy = (a) => a.status !== "idle";
    const workers = p ? p.workers.filter((a) => !a.offline && !a.resting) : [];
    const first = inset + LEAD;
    const slots = Math.max(1, Math.floor((w - first - BREAK) / DESK));
    const active = new Set(workers.filter(busy).map((a) => a.address));
    // Sticky desks: someone keeps theirs while busy; a newcomer takes the first free one.
    this.desks = this.desks.slice(0, slots).map((x) => (active.has(x) ? x : null));
    while (this.desks.length < slots) this.desks.push(null);
    for (const a of workers.filter(busy)) {
      if (this.desks.includes(a.address)) continue;
      const free = this.desks.indexOf(null);
      if (free >= 0) this.desks[free] = a.address;
    }
    const seated = new Set(this.desks.filter(Boolean));
    const waiting = workers.filter((a) => busy(a) && !seated.has(a.address)).length;
    const idle = workers.filter((a) => !busy(a));
    const breakX = w - BREAK + 24;
    // Where each one belongs now; a change of place is a walk (mid-way, it turns where it is).
    const target = new Map();
    this.desks.forEach((x, i) => { if (x) target.set(x, first + i * DESK + 8); });
    idle.slice(0, 3).forEach((a, i) => target.set(a.address, breakX + i * 50));
    const now = Date.now();
    for (const [address, x] of target) {
      const k = this.walks[address];
      const was = k ? Math.round(k.from + (k.to - k.from) * Math.min(1, Math.max(0, (now - k.at - 60) / k.ms))) : this.spot[address];
      if (was !== undefined && x !== (k ? k.to : was) && moving) {
        this.walks[address] = { n: ++this.steps, from: was, to: x, at: now, ms: Math.max(300, Math.round((Math.abs(x - was) / STROLL) * 1000)), go: false };
      }
      this.spot[address] = x;
    }
    for (const address of Object.keys(this.spot)) if (!target.has(address) && !this.walks[address]) delete this.spot[address];
    const byAddress = new Map(workers.map((a) => [a.address, a]));

    const clickable = (el, a) => el.cursor_pointer().on_click(() => pick(a))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); });
    const said = (a) => (a.status === "blocked" ? "needs you" : a.status === "done" ? "unread" : a.since ? ago(a.since) : "working");
    const plate = (a) => div().max_w(DESK - 14).truncate().px(6).text_size(11).bg(t.pane).border(1)
      .border_color(a.status === "blocked" ? t.orange : a.status === "done" ? t.blue : t.border)
      .text_color(a.status === "blocked" ? t.orangeText : t.text).when(a.status === "blocked", (el) => el.font_semibold())
      .child(`${a.name} · ${said(a)}`);

    // A desk: the name plate on the wall above, the miner at work beside it.
    const desk = (address, i) => {
      const x = first + i * DESK;
      const a = address ? byAddress.get(address) : null;
      return div().absolute().left(x).top(0).w(DESK).h(h)
        .when(Boolean(a), (el) => el.child(clickable(div().id(`ws-name-${address}`).absolute().left(8).top(floor - 108), a).child(plate(a))))
        .when(Boolean(a) && !this.walks[address], (el) => el.child(clickable(div().id(`ws-at-${address}`).absolute().left(-6).top(floor - 80), a)
          .child(image(SPR + MINER[a.status]).w(112).h(80))))
        .child(image(SPR + "desk.gif").absolute().left(56).top(floor - 60).w(120).h(60));
    };
    const walker = (address) => {
      const k = this.walks[address];
      return image(SPR + (k.to > k.from ? "walker_r.gif" : "walker_l.gif")).id(`ws-walk-${address}-${k.n}`).absolute().top(floor - 60).w(55).h(60)
        .left(k.go ? k.to : k.from).transition("left", { duration: k.ms, easing: "linear" });
    };
    const lead = p?.lead && !p.lead.offline ? p.lead : null;
    const others = model.projects.filter((x) => x !== p && x.agents.some((a) => !a.offline && (a.status === "working" || a.status === "blocked")));
    const count = (n, word, color) => div().text_color(color).child(`${word} ${n}`);
    const chip = (id, border, click) => h_flex().id(id).h(24).px(6).gap(4).flex_none().items_center().bg(t.pane).border(1).border_color(border)
      .text_size(11).text_color(t.text).cursor_pointer().hover((s) => s.border_color(t.text))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(click);

    return div().id("fleet-workshop").relative().size_full().overflow_hidden().bg(room.wall).text_size(12).text_color(t.text)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      // Wainscot and floor boards.
      .child(div().absolute().left(0).right(0).top(floor - 40).h(40).bg(room.low).border_t(2).border_color(room.line))
      .child(div().absolute().left(0).right(0).top(floor).h(FLOOR).bg(room.floor).border_t(3).border_color(room.edge)
        .children([...Array(Math.ceil(w / 96) + 1).keys()].map((i) => div().absolute().left(i * 96 + (i % 2) * 40).top(0).w(2).h(FLOOR).bg(room.plank))))
      // The project's plate, and the lead at its desk.
      .when(Boolean(p), (el) => el.child(h_flex().id("ws-project").absolute().left(inset + 16).top(10).gap(8).items_center().cursor_pointer()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => setWorkView("crew"))
        .child(projectMark(p, t, 24, 18))
        .child(div().max_w(LEAD - 60).truncate().font_family(PIXEL).text_size(12).child(p.name.toUpperCase()))))
      .when(!p, (el) => el.child(div().absolute().left(inset + 16).top(12).text_color(t.muted).child("Pick a project: its crew works here.")))
      .when(Boolean(lead), (el) => el.child(clickable(div().id("ws-lead").absolute().left(inset + 16).top(0).w(LEAD - 30).h(h), lead)
        .child(h_flex().absolute().left(0).top(floor - 108).gap(6).items_center()
          .child(statusIcon(lead.status, 14)).child(div().max_w(LEAD - 56).truncate().font_semibold().text_size(11).child(lead.name)))
        .when(Boolean(pref("avatars")), (e) => e.child(image(p.avatar).absolute().left(36).top(floor - 92).w(48).h(48)))
        .child(image(SPR + "desk.gif").absolute().left(0).top(floor - 60).w(120).h(60))))
      .children(this.desks.map(desk))
      // Top right of the room: other projects at work, the space's shells, a new agent.
      .child(h_flex().absolute().right(BREAK + 8).top(10).gap(6).items_center()
        .children(others.slice(0, 4).map((x) => chip(`ws-other-${x.id}`, x.color, () => pickProject(x))
          .child(statusIcon(x.agents.some((a) => a.status === "blocked" && !a.offline) ? "blocked" : "working", 14)).child(`${x.name} ${x.working}`)))
        .children(shells.map((x) => chip(`ws-shell-${x.id}`, x.active ? t.text : t.border, () => { run("tab.select", { id: x.id }); setWorkView("tab"); })
          .child(div().text_color(t.idle).child(">_")).child(div().max_w(100).truncate().child(x.name))))
        .when(Boolean(p), (el) => el.child(addButton("add-tab", t, { space: p.space, machine: p.machine ?? null, title: p.name }))))
      // The break corner: the board, the mailbox, a bench and who is on a break.
      .child(div().absolute().left(w - BREAK).top(0).w(BREAK).h(h)
        .child(v_flex().absolute().left(14).top(10).w(128).px(8).py(4).bg(t.pane).border(3).border_color(t.border).font_family(PIXEL).text_size(10)
          .child(count(workers.filter((a) => a.status === "working").length + (lead?.status === "working" ? 1 : 0), "WORKING", t.blueText))
          .child(count(workers.filter((a) => a.status === "blocked").length + (lead?.status === "blocked" ? 1 : 0), "NEEDS YOU", t.orangeText))
          .child(count(workers.filter((a) => a.status === "done").length + (lead?.status === "done" ? 1 : 0), "UNREAD", t.text))
          .child(count(idle.length, "BREAK", t.muted))
          .child(count(p?.resting.length ?? 0, "RESTING", t.muted)))
        .child(v_flex().id("ws-mailbox").absolute().left(156).top(14).items_center().gap(2).cursor_pointer()
          .tooltip(`Mailbox, ${pending} question${pending === 1 ? "" : "s"} waiting`)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => this.mailbox())
          .child(div().p(4).bg(open ? t.selected : t.pane).border(2).border_color(pending ? t.orange : t.border).child(sprite(pending ? "mail_up.gif" : "mail_down.png", 36)))
          .child(div().font_bold().text_color(pending ? t.orangeText : t.muted).child(String(pending))))
        .child(div().absolute().left(16).right(16).top(floor - 16).h(16).bg(room.bench).border_t(3).border_color(room.edge))
        .when(waiting > 0, (el) => el.child(div().absolute().left(14).top(floor - 34).text_size(11).text_color(t.muted).child(`+${waiting} more at work`))))
      .children(idle.slice(0, 3).filter((a) => !this.walks[a.address]).map((a, i) => clickable(div().id(`ws-idle-${a.address}`).absolute().left(breakX + i * 50).top(floor - 60), a)
        .tooltip(`${a.name}, on a break`).child(image(SPR + "walker_stand.png").w(45).h(60))))
      .children(Object.keys(this.walks).filter((x) => target.has(x)).map(walker));
  }

  render() {
    const t = tk();
    const model = fleet();
    const view = workView();
    if (!checking()) {
      // The keyboard went to an agent of another group of this space: show that group.
      // (Not on a change of space: there the project picked is the one to show.)
      const fo = focused(), now = fo?.terminal ?? null;
      if (now !== this.seen) {
        const same = fo?.space === this.seenSpace;
        this.seen = now;
        this.seenSpace = fo?.space ?? null;
        const a = same && now && model.agents.find((x) => x.address === now);
        if (a && !a.offline) follow(a);
      }
      syncRoster(model);
      // Still on its way (the layout, or the space of the agent asked for): look again shortly.
      if (this.fit() || this.arrange(model)) this.again = true;
    }
    const p = model.active;
    const f = focused();
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / (settings().zoom || 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const stop = (_e, cx) => cx.stop_propagation();
    const pending = model.questions.length;
    const open = Boolean(shared("fleet.mailbox"));

    const tab = (a) => h_flex().id(`tab-${a.address}`).h(32).px(10).gap(6).flex_none().items_center().text_color(t.muted).cursor_pointer()
      .when(view === "crew" && f?.terminal === a.address, (el) => el.bg(t.selected).text_color(t.text))
      .when(a.offline, (el) => el.opacity(0.5))
      .hover((s) => s.bg(t.selected))
      .on_mouse_down("left", stop).on_click(() => pick(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); })
      .child(statusIcon(a.status)).child(div().max_w(150).truncate().when(a.lead, (el) => el.font_semibold()).child(a.name));

    // Tabs of the space that hold no agent (a shell, an editor): shown as they are in Herdr.
    const space = spaces().find((s) => s.active);
    const withAgent = new Set(model.agents.map((a) => a.tab).filter(Boolean));
    const all = panes();
    const plain = (space?.tabs ?? []).filter((x) => !withAgent.has(x.id)).map((x) => {
      const lead = all.find((q) => q.tab === x.id);
      return h_flex().id(`plain-${x.id}`).h(32).px(10).gap(6).flex_none().items_center().text_color(t.muted).cursor_pointer()
        .when(view === "tab" && x.active, (el) => el.bg(t.selected).text_color(t.text))
        .hover((s) => s.bg(t.selected)).on_mouse_down("left", stop)
        .on_click(() => { run("tab.select", { id: x.id }); setWorkView("tab"); })
        .child(div().text_color(t.idle).child(">_")).child(div().max_w(120).truncate().child(x.named ? x.name : lead?.program?.name ?? x.name));
    });

    if (pref("workshop")) {
      const shells = (space?.tabs ?? []).filter((x) => !withAgent.has(x.id))
        .map((x) => ({ id: x.id, active: view === "tab" && x.active, name: x.named ? x.name : all.find((q) => q.tab === x.id)?.program?.name ?? x.name }));
      return this.workshop(t, model, lights - 10, shells, pending, open);
    }
    const label = (text) => div().font_family(PIXEL).text_size(11).child(text);
    return h_flex().id("fleet-top").size_full().min_w(0).pl(lights).pr(10).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(13)
      .child(pixelButton("go-home", t, { active: view === "home" }, (face) => face.on_click(() => setWorkView("home")).child(label("Home"))))
      .child(pixelButton("go-office", t, { active: view === "office" }, (face) => face.on_click(() => setWorkView("office")).child(label("Office"))))
      .when(Boolean(p), (el) => el.child(pixelButton("go-crew", t, { active: view === "crew", on: t.selected, onInk: t.text, px: 8 },
        (face) => face.on_click(() => setWorkView("crew")).child(projectMark(p, t, 22, 18)).child(div().max_w(160).truncate().font_medium().child(p.name)).child(div().text_color(t.muted).child("crew")))))
      .child(h_flex().id("fleet-tabs-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar()
        // Resting workers keep to the sidebar; the one with the keyboard is never resting.
        .children((p?.agents ?? []).filter((a) => !a.resting).map(tab))
        .when((p?.resting.length ?? 0) > 0, (el) => el.child(div().id("tabs-resting").flex_none().px(8).text_size(12).text_color(t.muted)
          .tooltip("Idle for long: in the sidebar, under Resting").child(`+${p.resting.length} resting`)))
        .children(plain)
        .when(Boolean(p), (el) => el.child(div().flex_none().pl(6).child(addButton("add-tab", t, { space: p.space, machine: p.machine ?? null, title: p.name })))))
      // The key hint gives way when the tabs need the room.
      .when((p?.agents.length ?? 0) + plain.length <= 4, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("ctrl-1…9 project · cmd-] next agent")))
      .child(pixelButton("mailbox", t, { active: open, px: 8, color: t.text }, (face) => face.tooltip(`Mailbox, ${pending} question${pending === 1 ? "" : "s"} waiting`)
        .on_click(() => this.mailbox())
        .child(sprite(pending ? "mail_up.gif" : "mail_down.png", 24)).child(div().font_bold().child(String(pending)))));
  }
}
