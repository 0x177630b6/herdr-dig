// The top bar: Home, Office, the crew button, one tab per agent of the shown project,
// the mailbox. It is also the one mod that does layout-level work: it listens for the
// layout's key commands, arranges the crew view (lead left, workers stacked right) and
// keeps the roster of who lives on which machine.
//
// The crew view is a composition of terminal blocks written with layout.set: the
// person's own tabs and splits are never rearranged.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, layout, focused, spaces, panes, window, settings, shared, setShared, nextCommand, openOverlay, closeOverlay, checking } from "herdr";
import { PIXEL, tk, fleet, find, pref, pick, pickProject, agentMenu, syncRoster, workView, setWorkView, sidebarMode, setSidebarMode, pixelButton, projectMark, statusIcon, sprite, addButton, follow, setPref, isSwitch, HEADER } from "./lib.js";

const MODES = ["projects", "machines", "inbox", "office-mini"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// More panes than this on the right are too short to read; the rest stay one click away as tabs.
const MAX_WORKERS = 4;
const LEAD_CARD = 101;
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
    if (checking()) return;
    // render() asks for another look a moment later through this timer (a timer started
    // from render itself never redraws).
    this.again = false;
    cx.timer.every(350, (cx) => { if (this.again) { this.again = false; cx.notify(); } });
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

  // The sidebar header is taller while it shows the Claude usage lines.
  fit() {
    const root = layout(), node = find(root, "sidebar-modes"), now = Date.now();
    const px = pref("usage") ? HEADER.usage : HEADER.plain;
    if (!node || node.size?.px === px) return false;
    if (now - (this.fitted ?? 0) < 1500) return true;
    this.fitted = now;
    const next = JSON.parse(JSON.stringify(root));
    find(next, "sidebar-modes").size = { px };
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

    const label = (text) => div().font_family(PIXEL).text_size(11).child(text);
    return h_flex().id("fleet-top").size_full().min_w(0).pl(lights).pr(10).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(13)
      .child(pixelButton("go-home", t, { active: view === "home" }, (face) => face.on_click(() => setWorkView("home")).child(label("Home"))))
      .child(pixelButton("go-office", t, { active: view === "office" }, (face) => face.on_click(() => setWorkView("office")).child(label("Office"))))
      .when(Boolean(p), (el) => el.child(pixelButton("go-crew", t, { active: view === "crew", on: t.selected, onInk: t.text, px: 8 },
        (face) => face.on_click(() => setWorkView("crew")).child(projectMark(p, t, 22, 18)).child(div().max_w(160).truncate().font_medium().child(p.name)).child(div().text_color(t.muted).child("crew")))))
      .child(h_flex().id("fleet-tabs-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar()
        .children((p?.agents ?? []).map(tab)).children(plain)
        .when(Boolean(p), (el) => el.child(div().flex_none().pl(6).child(addButton("add-tab", t, { space: p.space, machine: p.machine ?? null, title: p.name })))))
      // The key hint gives way when the tabs need the room.
      .when((p?.agents.length ?? 0) + plain.length <= 4, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("ctrl-1…9 project · cmd-] next agent")))
      .child(pixelButton("mailbox", t, { active: open, px: 8, color: t.text }, (face) => face.tooltip(`Mailbox, ${pending} question${pending === 1 ? "" : "s"} waiting`)
        .on_click(() => this.mailbox())
        .child(sprite(pending ? "mail_up.gif" : "mail_down.png", 24)).child(div().font_bold().child(String(pending)))));
  }
}
