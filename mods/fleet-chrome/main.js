// The fleet window's static chrome, one copy per part (props.part):
// banner, modes (mode switch + summary strip), footer, rail, ground, workshop.
// The rail also sends out the wandering miner: it walks in along the rail, stops somewhere
// and climbs down to the ground (that part is the fleet-walker window, opened from here).
// The workshop: the shown project as a workshop over the crew view. The lead at its desk;
// a worker that starts working walks from the break corner to a free desk and gets to work,
// and walks back once it is idle again.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, run, window, layout, settings, shared, openOverlay, closeOverlay } from "herdr";
import { SPR, PIXEL, CAVE, tk, fleet, find, pref, pick, pickProject, agentMenu, ago, sidebarMode, setSidebarMode, toggleTheme, pixelButton, statusIcon, sprite, strip, ground, caveWall } from "./lib.js";

const MODES = [["projects", "Projects"], ["machines", "Machines"], ["inbox", "Inbox"], ["office-mini", "Office"]];
const CROSSING = 26000;
// The wandering miner: px a second along the rail and down, how long it stands before going
// down, and the wait between two strolls (3 to 7 minutes).
const PACE = 38, DOWN = 34, STAND = 500;
const pause = () => 180000 + Math.random() * 240000;
// The workshop: px a second walking, a desk's width, the lead's corner and the break corner.
const STROLL = 120, DESK = 176, LEAD = 200, BREAK = 230;
// The scene's height above the ground strip (the workshop block is 124 px).
const SCENE = 108;
const STILL = { blocked: "i_block_still.png", done: "i_done_still.png", working: "i_work_still.png", idle: "i_idle_still.png" };

export default class FleetChrome extends View {
  init(_props, cx) {
    this.width = 0;
    this.carts = [{ lap: 0, go: false }, { lap: 0, go: false }];
    if (props()?.part === "workshop") {
      // Who sits at which desk (sticky), where each one was last drawn, who is on the way.
      this.desks = [];
      this.spot = {};
      this.walks = {};
      this.steps = 0;
      this.dirty = false;
      // A walk starts drawn at its start, then this timer sends it off and later seats it
      // (a timer started from render never redraws).
      cx.timer.every(120, (cx) => {
        const now = Date.now();
        for (const [address, w] of Object.entries(this.walks)) {
          if (!w.go && now - w.at > 60) { w.go = true; this.dirty = true; }
          else if (w.go && now > w.at + 60 + w.ms) { delete this.walks[address]; this.dirty = true; }
        }
        if (this.dirty) { this.dirty = false; cx.notify(); }
      });
      return;
    }
    if (props()?.part !== "rail") return;
    // A cart crosses left to right in 26 s; the second one starts half a crossing later.
    // Each lap is a new element at the left edge, then one native transition across.
    const start = (i) => (cx) => {
      if (!pref("motion") || !window()?.active) return;
      this.launch(i, cx);
    };
    cx.timer.after(400, (cx) => { this.launch(0, cx); cx.timer.every(CROSSING, start(0)); });
    cx.timer.after(400 + CROSSING / 2, (cx) => { this.launch(1, cx); cx.timer.every(CROSSING, start(1)); });
    this.walker = null;
    this.strolls = 0;
    this.summoned = shared("fleet.summon") ?? 0;
    this.next = Date.now() + 40000 + Math.random() * 80000;
    cx.timer.every(2000, (cx) => this.wander(cx));
  }

  // Time for a stroll? Also when called (the fleet-tabs "walk" command), whatever the settings.
  wander(cx) {
    if (this.walker || !this.width || !this.view) return;
    const called = (shared("fleet.summon") ?? 0) !== this.summoned;
    if (!called && (Date.now() < this.next || !pref("walker") || !pref("motion") || !window()?.active)) return;
    this.summoned = shared("fleet.summon") ?? 0;
    this.next = Date.now() + pause();
    // In from either side, to a spot away from the edges. `to` is where it stands.
    const w = this.width / (settings().zoom || 1), right = Math.random() < 0.5;
    const to = Math.round(w * (0.12 + Math.random() * 0.76));
    const from = right ? -24 : w + 2;
    const ms = Math.round((Math.abs(to - from) / PACE) * 1000);
    const me = { n: ++this.strolls, right, from, to, ms, phase: "in" };
    this.walker = me;
    cx.notify();
    cx.timer.after(60, (cx) => { me.phase = "walk"; cx.notify(); });
    cx.timer.after(60 + ms, (cx) => { me.phase = "stand"; cx.notify(); });
    cx.timer.after(60 + ms + STAND, (cx) => {
      this.walker = null;
      cx.notify();
      // Its window closes itself; should it not (a reload in between), it is closed from here.
      const way = this.down(me);
      if (way) cx.timer.after(way.ms + 3000, () => closeOverlay(way.id));
    });
  }

  // The way down: a window as narrow as the miner, from the rail to the ground strip.
  down(me) {
    const root = layout(), px = (id, d) => find(root, id)?.size?.px ?? d;
    // Sizes in a mod are zoomed; the window's own, a block's measured width and `at` are not.
    const zoom = settings().zoom || 1;
    // The rail sits under the top bar, and under the workshop when it is shown.
    const top = px("tabs-row", 44) + (find(root, "workshop") ? px("workshop", 0) : 0), lead = 400;
    const height = Math.round(this.view.height / zoom - top - px("status", 30) - px("ground", 16) + 3);
    if (height < 160) return null;
    const id = openOverlay({ mod: "fleet-walker", kind: "window", frame: "none",
      at: { x: Math.round(this.view.width - this.width + me.to * zoom), y: Math.round(top * zoom) }, props: { height, pace: DOWN, lead } });
    return { id, ms: lead + Math.round((height / DOWN) * 1000) + 1800 };
  }

  launch(i, cx) {
    this.carts[i] = { lap: this.carts[i].lap + 1, go: false };
    cx.notify();
    cx.timer.after(60, (cx) => { this.carts[i].go = true; cx.notify(); });
  }

  banner(t) {
    // Cover: as wide as the sidebar, never narrower than the art's own height asks for.
    const w = Math.max(this.width || 480, 300), h = Math.ceil((w * 56) / 300);
    const mac = window()?.platform === "macos" && !window()?.fullscreen;
    return div().id("fleet-banner").relative().size_full().overflow_hidden().border_b(2).border_color(t.border)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .child(image(SPR + t.banner).absolute().left(0).top((56 - h) / 2).w(w).h(h))
      // The plate clears the macOS window buttons.
      .child(div().absolute().left(mac ? 84 : 10).top(10).pr(2).pb(2)
        .child(div().absolute().left(2).top(2).right(0).bottom(0).bg(t.text))
        .child(div().id("fleet-plate").relative().px(8).py(5).bg(t.chrome).border(2).border_color(t.text)
          .font_family(PIXEL).text_size(14).text_color(t.text).cursor_pointer().tooltip("Fleet settings")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => run("mod.open", { name: "fleet-settings" }))
          .child("HERDR FLEET")));
  }

  modes(t) {
    const mode = sidebarMode();
    const c = fleet().counts;
    // A count of zero is drawn still and faint: only what is happening moves.
    const count = (status, n, label) => h_flex().gap(5).items_center().flex_none()
      .child(n ? statusIcon(status) : sprite(STILL[status], 16).opacity(0.55)).child(div().font_semibold().text_color(t.text).child(String(n))).child(label);
    return v_flex().size_full().bg(t.chrome).text_color(t.text)
      .child(h_flex().gap(4).pt(10).pb(6).pl(10).pr(10)
        .children(MODES.map(([id, label]) => pixelButton(`mode-${id}`, t, { active: mode === id, h: 36, px: 0, grow: true },
          (face) => face.w_full().font_family(PIXEL).text_size(10).on_click(() => setSidebarMode(id)).child(label)))))
      .child(h_flex().flex_1().flex_wrap().gap_x(10).gap_y(2).px(14).pb(6).items_center().text_size(12).text_color(t.muted).border_b(1).border_color(t.border).overflow_hidden()
        .child(count("blocked", c.blocked, "need you"))
        .child(count("done", c.done, "unread"))
        .child(count("working", c.working, "working"))
        .child(count("idle", c.idle, "idle")))
      .when(Boolean(pref("usage")), (el) => el.child(this.usage(t)));
  }

  // The Claude plan's limits (fleet-status asks for them): a bar for the week and one for
  // the model's own limit, then when the week starts again.
  usage(t) {
    const u = shared("fleet.plan");
    const limits = u?.limits ?? [];
    const week = limits.find((l) => l.label === "Week") ?? limits[0];
    const bars = [week, ...limits.filter((l) => l !== week)].filter(Boolean).slice(0, 2);
    const more = limits.filter((l) => !bars.includes(l)).slice(0, 2);
    // To the nearest minute: the time comes a hair short of the hour.
    const d = week?.resets ? new Date(Math.round(new Date(week.resets).getTime() / 60000) * 60000) : null;
    const two = (n) => String(n).padStart(2, "0");
    const when = d && !Number.isNaN(d.getTime())
      ? `resets ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}, ${two(d.getHours())}:${two(d.getMinutes())}`
      : "";
    const bar = (l) => {
      // As wide as the sidebar allows: twenty cells of 5% each (never empty once something is used).
      const cells = Math.max(l.percent > 0 ? 1 : 0, Math.min(20, Math.round(l.percent / 5)));
      const color = l.percent >= 90 ? t.orange : t.blue;
      return h_flex().gap(8).items_center()
        .child(div().w(52).flex_none().truncate().font_family(PIXEL).text_size(10).text_color(t.text).child(l.label.toUpperCase()))
        .child(h_flex().flex_1().min_w(0).gap(1).children([...Array(20).keys()].map((i) => div().flex_1().h(10).bg(i < cells ? color : t.border))))
        .child(div().w(34).flex_none().text_right().font_semibold().text_color(t.text).child(`${l.percent}%`));
    };
    return v_flex().h(64).flex_none().px(14).justify_center().gap(4).border_b(1).border_color(t.border).text_size(12).text_color(t.muted)
      .when(!week, (el) => el.child(div().truncate().child(u ? `Claude usage: ${u.why ?? "nothing to show"}` : "Claude usage: asking…")))
      .when(Boolean(week), (el) => el.children(bars.map(bar))
        .child(div().truncate().text_size(11).child([when, ...more.map((l) => `${l.label} ${l.percent}%`), u?.ok === false ? `not refreshed (${u.why})` : ""].filter(Boolean).join(" · "))));
  }

  footer(t) {
    return v_flex().size_full().bg(t.chrome)
      .child(ground())
      .child(h_flex().flex_1().px(14).gap(8).items_center().justify_between().text_size(12).text_color(t.muted)
        .child(div().truncate().child("cmd-p go to agent"))
        .child(h_flex().id("theme-toggle").h(22).px(8).flex_none().items_center().border(1).border_color(t.border).text_color(t.text).cursor_pointer()
          .hover((s) => s.bg(t.selected)).on_click(() => toggleTheme()).child(t.light ? "[ dark ]" : "[ light ]")));
  }

  rail(t) {
    const w = this.width || 1600;
    const moving = pref("motion");
    const cart = (c, i) => (moving
      ? image(SPR + "cart.gif").id(`cart-${i}-${c.lap}`).absolute().bottom(5).left(c.go ? w + 8 : -40).w(32).h(24).transition("left", { duration: CROSSING, easing: "linear" })
      // Reduced motion: the carts park.
      : image(SPR + "cart_still.png").absolute().bottom(5).left(i === 0 ? 24 : w * 0.6).w(32).h(24));
    // The window's size, for the miner's way down (a measurement: only legal here).
    this.view = globalThis.window?.viewport_size?.() ?? null;
    const m = moving ? this.walker : null;
    // The walking sprite carries the pickaxe behind: its body is 4 px further in when it faces right.
    const miner = !m ? null
      : m.phase === "stand" ? image(SPR + "walker_stand.png").absolute().bottom(6).left(m.to).w(18).h(24)
      : image(SPR + (m.right ? "walker_r.gif" : "walker_l.gif")).id(`walker-${m.n}`).absolute().bottom(6).w(22).h(24)
        .left(m.phase === "walk" ? m.to - (m.right ? 4 : 0) : m.from).transition("left", { duration: m.ms, easing: "linear" });
    return div().id("fleet-rail").relative().size_full().overflow_hidden().bg(t.canvas)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .child(div().absolute().left(0).right(0).bottom(0).h(8).child(strip("rail_960.png", 8)))
      .children(this.carts.map((c, i) => (c.lap || !moving ? cart(c, i) : null)).filter(Boolean))
      .when(Boolean(miner), (el) => el.child(miner));
  }

  workshop(t) {
    const model = fleet(), p = model.active;
    const zoom = settings().zoom || 1;
    const w = (this.width || 1600) / zoom;
    const moving = pref("motion");
    // At a desk: working, waiting on you, or finished and not read yet. Resting ones are not here.
    const busy = (a) => !a.offline && !a.resting && a.status !== "idle";
    const workers = p ? p.workers.filter((a) => !a.offline && !a.resting) : [];
    const slots = Math.max(1, Math.floor((w - LEAD - BREAK) / DESK));
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
    const breakX = w - BREAK + 20;
    // Where each one belongs now; a change of place is a walk.
    const target = new Map();
    this.desks.forEach((x, i) => { if (x) target.set(x, LEAD + i * DESK + 8); });
    idle.slice(0, 3).forEach((a, i) => target.set(a.address, breakX + i * 46));
    const now = Date.now();
    for (const [address, x] of target) {
      // Mid-way and sent elsewhere: it turns where it is.
      const k = this.walks[address];
      const was = k ? Math.round(k.from + (k.to - k.from) * Math.min(1, Math.max(0, (now - k.at - 60) / k.ms))) : this.spot[address];
      if (was !== undefined && x !== (k ? k.to : was) && moving) {
        this.walks[address] = { n: ++this.steps, from: was, to: x, at: now, ms: Math.max(300, Math.round((Math.abs(x - was) / STROLL) * 1000)), go: false };
        this.dirty = true;
      }
      this.spot[address] = x;
    }
    for (const address of Object.keys(this.spot)) if (!target.has(address) && !this.walks[address]) delete this.spot[address];
    const byAddress = new Map(workers.map((a) => [a.address, a]));

    const pill = (text, color, border) => div().max_w(DESK - 12).truncate().px(6).text_size(11).bg("#0C0E12").border(1).border_color(border).text_color(color).child(text);
    const said = (a) => (a.status === "blocked" ? "needs you" : a.status === "done" ? "unread" : a.since ? ago(a.since) : "working");
    const clickable = (el, a) => el.cursor_pointer().on_click(() => pick(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); });
    const MINER = { working: "miner_working.gif", blocked: "miner_blocked.gif", done: "miner_done.gif" };

    // A desk: the name above, the miner at work beside its desk.
    const desk = (address, i) => {
      const x = LEAD + i * DESK;
      const a = address ? byAddress.get(address) : null;
      const walking = a && this.walks[address];
      return div().absolute().left(x).top(0).w(DESK).h_full()
        .child(image(SPR + "desk.gif").absolute().left(56).top(SCENE - 60).w(120).h(60))
        .when(Boolean(a), (el) => el
          .child(clickable(div().id(`ws-name-${address}`).absolute().left(8).top(6), a)
            .child(pill(`${a.name} · ${said(a)}`, a.status === "blocked" ? "#CE9178" : CAVE.text, a.status === "blocked" ? "#CE9178" : a.status === "done" ? "#569CD6" : "#808080")))
          .when(!walking, (e) => e.child(clickable(div().id(`ws-at-${address}`).absolute().left(-6).top(SCENE - 80), a)
            .child(image(SPR + MINER[a.status]).w(112).h(80)))));
    };
    // On the way: the walking miner, sent from where it was to where it belongs.
    const walker = (address) => {
      const k = this.walks[address];
      const right = k.to > k.from;
      return image(SPR + (right ? "walker_r.gif" : "walker_l.gif")).id(`ws-walk-${address}-${k.n}`).absolute().top(SCENE - 60).w(55).h(60)
        .left(k.go ? k.to : k.from).transition("left", { duration: k.ms, easing: "linear" });
    };
    const lead = p?.lead && !p.lead.offline ? p.lead : null;
    const others = model.projects.filter((x) => x !== p && x.agents.some((a) => !a.offline && (a.status === "working" || a.status === "blocked")));

    return div().id("fleet-workshop").relative().size_full().overflow_hidden().bg("#1E1E1E")
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .children(caveWall())
      .child(div().absolute().left(0).right(0).bottom(0).child(ground()))
      .child(div().absolute().left(0).right(0).top(0).bottom(16)
        // The lead's corner: its robot behind the big desk.
        .when(Boolean(lead), (el) => el.child(clickable(div().id("ws-lead").absolute().left(16).top(0).w(LEAD - 24).h_full(), lead)
          .child(h_flex().absolute().left(0).top(6).gap(6).items_center()
            .child(statusIcon(lead.status)).child(div().max_w(LEAD - 50).truncate().font_semibold().text_size(12).text_color(CAVE.text).child(lead.name)))
          .when(Boolean(pref("avatars")), (e) => e.child(image(p.avatar).absolute().left(36).top(SCENE - 82).w(48).h(48)))
          .child(image(SPR + "desk.gif").absolute().left(0).top(SCENE - 60).w(120).h(60))))
        .when(!p, (el) => el.child(div().absolute().left(16).top(10).text_size(12).text_color(CAVE.muted).child("Pick a project: its crew works here.")))
        .children(this.desks.map(desk))
        // The break corner: who is idle, sitting it out.
        .child(div().absolute().left(w - BREAK).top(0).w(BREAK).h_full()
          .child(div().absolute().left(12).top(6).text_size(11).text_color(CAVE.muted)
            .child([idle.length ? `zz ${idle.length} on a break` : "break corner", waiting ? `+${waiting} more at work` : "", p?.resting.length ? `${p.resting.length} resting` : ""].filter(Boolean).join(" · ")))
          .child(div().absolute().left(14).right(14).top(SCENE - 14).h(14).bg("#6C5A44").border_t(3).border_color("#8B7355")))
        .children(idle.slice(0, 3).filter((a) => !this.walks[a.address]).map((a, i) => clickable(div().id(`ws-idle-${a.address}`).absolute().left(breakX + i * 46).top(SCENE - 60), a)
          .tooltip(`${a.name}, idle`).child(image(SPR + "walker_stand.png").w(45).h(60))))
        .children(Object.keys(this.walks).filter((x) => target.has(x)).map(walker))
        // Elsewhere: the other projects with someone at work.
        .when(others.length > 0, (el) => el.child(h_flex().absolute().right(BREAK + 8).top(6).gap(6)
          .children(others.slice(0, 4).map((x) => h_flex().id(`ws-other-${x.id}`).gap(4).px(6).items_center().bg("#0C0E12").border(1).border_color(x.color).cursor_pointer()
            .on_click(() => pickProject(x)).text_size(11).text_color(CAVE.text)
            .child(statusIcon(x.agents.some((a) => a.status === "blocked" && !a.offline) ? "blocked" : "working", 14))
            .child(`${x.name} ${x.working}`))))));
  }

  render() {
    const t = tk();
    switch (props()?.part) {
      case "banner": return this.banner(t);
      case "modes": return this.modes(t);
      case "footer": return this.footer(t);
      case "rail": return this.rail(t);
      case "workshop": return this.workshop(t);
      default: return div().size_full().bg(t.chrome).child(ground());
    }
  }
}
