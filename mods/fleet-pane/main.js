// A pane's header in the fleet window: status icon, name, status word, machine tag.
// Under the lead's header (props.lead, avatars on) the lead card: the avatar tile with
// its status border, the avatar's name, and the party of workers.
// Props: { terminal, lead? } in the crew view, { pane, terminal } from Herdr in the tab
// view, { empty: true } when the project has no agent to show.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, run, focused, panes, terminals, window, checking } from "herdr";
import { BLOCKS, BUILDS, blockCount } from "./builds.js";
import { tk, sprite, fleet, pref, pick, agentMenu, setWorkView, STATUS, statusIcon, statusBorder, tag, agentTag } from "./lib.js";

const CELL = 5, TICK = 280, ADMIRE = 14;

export default class FleetPane extends View {
  init(_props, cx) {
    this.build = Math.floor(Math.random() * BUILDS.length);
    this.placed = 0;
    this.busy = false;
    if (!props()?.build || checking()) return;
    // One block per tick while the agent works; a finished build is admired a moment,
    // then another one is picked at random.
    cx.timer.every(TICK, (cx) => {
      if (!this.busy || !window()?.active) return;
      this.placed += 1;
      if (this.placed > blockCount(BUILDS[this.build]) + ADMIRE) {
        this.build = (this.build + 1 + Math.floor(Math.random() * (BUILDS.length - 1))) % BUILDS.length;
        this.placed = 0;
      }
      cx.notify();
    });
  }

  // props.build: floats at the bottom right of a crew pane. Always dark, like the Office.
  builder() {
    const a = fleet().agents.find((x) => x.address === props().build);
    this.busy = Boolean(a && a.status === "working" && pref("builder"));
    // Nothing drawn hides the floating block.
    if (!this.busy) return div();
    const b = BUILDS[this.build];
    let left = this.placed;
    const rows = [...b.rows].reverse().map((row) => [...row].map((c) => (c !== "." && left-- > 0 ? c : ".")));
    const width = Math.max(...b.rows.map((r) => r.length));
    return h_flex().id(`builder-${props().build}`).px(6).pt(4).gap(4).items_end().bg("#1E1E1E").tooltip(`${a.name} is building ${b.name}`)
      .child(sprite(pref("motion") ? "miner_working.gif" : "miner_idle_still.png", 56, 40))
      .child(v_flex().flex_none().w(width * CELL).children(rows.reverse().map((row) => h_flex().h(CELL)
        .children(row.map((c) => div().size(CELL).flex_none().when(c !== ".", (el) => el.bg(BLOCKS[c])))))));
  }

  empty(t, asleep) {
    return v_flex().size_full().items_center().justify_center().gap(10).bg(t.pane).text_color(t.muted).text_size(13)
      .child(asleep ? "Everyone here is asleep. Click an agent to wake its pane." : "No agent in this project yet.")
      .child(h_flex().id("show-tab").h(30).px(10).items_center().border(1).border_color(t.border).text_color(t.text).cursor_pointer()
        .hover((s) => s.bg(t.selected)).on_click(() => setWorkView("tab")).child("[ show its tab ]"));
  }

  card(t, p, lead) {
    const tile = statusBorder(div().flex_none().size(72).p(6).bg(t.selected), lead.status, t).child(image(p.avatar).w(56).h(56));
    return h_flex().h(100).flex_none().px(14).gap(14).items_center().text_size(13).bg(t.card).border_b(1).border_color(t.border).overflow_hidden()
      .child(tile)
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(18).font_semibold().text_color(t.text).truncate().child(p.pal))
        .child(div().text_color(t.muted).truncate().child(`Orchestrator of ${p.name} · ${lead.machineLabel}`)))
      .when(p.workers.length > 0, (el) => el.child(v_flex().flex_none().gap(6).max_w(300)
        .child(div().text_size(12).text_color(t.muted).child("Party"))
        .child(h_flex().gap(6).children(p.workers.slice(0, 7).map((w) =>
          statusBorder(div().id(`party-${w.address}`).size(36).flex_none().flex().items_center().justify_center().bg(t.pane), w.status, t)
            .text_size(12).font_semibold().text_color(t.text).cursor_pointer().tooltip(`${w.name}, ${STATUS[w.status].label}`)
            .when(w.offline, (e) => e.opacity(0.5))
            .on_click((_e, cx) => { cx.stop_propagation(); pick(w); })
            .child((w.name[0] ?? "?").toUpperCase()))))));
  }

  render() {
    const t = tk();
    const pr = props() ?? {};
    if (pr.build) return this.builder();
    if (pr.empty) return this.empty(t, pr.asleep);
    const model = fleet();
    const address = pr.terminal;
    const a = model.agents.find((x) => x.address === address);
    const f = focused();
    const on = f?.terminal === address;
    const p = a && model.projects.find((x) => x.id === a.pid);
    let head;
    if (a) {
      head = h_flex()
        .child(statusIcon(a.status))
        .child(div().flex_none().max_w(260).truncate().font_semibold().text_color(t.text).child(a.name))
        .child(div().flex_1().min_w(0).truncate().text_color(a.status === "blocked" ? t.orangeText : a.status === "working" ? t.blueText : t.muted).child(STATUS[a.status].label + (a.lead ? " · lead" : "")))
        .child(tag(agentTag(a), t.muted));
    } else {
      // Not an agent (a shell, an editor): what Herdr knows about the terminal.
      const pane = panes().find((x) => x.pane === pr.pane) ?? null;
      const term = terminals().find((x) => x.address === address);
      const name = pane?.program?.name ?? term?.program?.name ?? term?.name ?? address ?? "";
      head = h_flex().child(div().text_color(t.idle).child(">_"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.text).child(name))
        .when(Boolean(address?.includes("/")), (el) => el.child(tag(address.split("/")[0], t.muted)));
    }
    head = head.id(`fleet-head-${address}`).h(32).flex_none().px(10).gap(8).items_center().bg(on ? t.selected : t.pane).text_size(13)
      .border_b(1).border_color(on ? t.blue : t.border)
      .on_click(() => run("pane.focus", pr.pane ? { pane: pr.pane } : { terminal: address }))
      .when(Boolean(a), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); }));
    if (!(pr.lead && a && p?.lead === a && pref("avatars"))) return head.size_full();
    return v_flex().size_full().child(head).child(this.card(t, p, a));
  }
}
