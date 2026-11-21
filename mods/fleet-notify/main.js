// Questions from agents that need you.
// props.part "toast": the floating slab, one question at a time, oldest first.
// props.part "mailbox": the panel under the mailbox button, every pending question.
// Both stay dark in both themes.

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, hc, shared, setShared, closeOverlay, playSound, window, checking } from "herdr";
import { PIXEL, SLAB, fleet, pref, pick, answer, sprite, agentTag } from "./lib.js";

// Shared by the toast and the mailbox (module code is one per mod): when each question
// was first seen, and the last lines of a terminal whose agent gave no question text.
const seen = new Map();
const tails = new Map();

export default class FleetNotify extends View {
  init(_props, cx) {
    this.key = null;
    this.slid = false;
    if (checking()) return;
    if (props()?.part === "mailbox") { setShared("fleet.mailbox", true); return; }
    // The slide: a new toast is drawn once off to the right, then this timer lets it in
    // (a timer started from render itself never redraws).
    this.ticking = true;
    cx.timer.every(120, (cx) => { if (this.key && !this.slid) { this.slid = true; cx.notify(); } });
  }

  async close() {
    if (props()?.part === "mailbox") setShared("fleet.mailbox", false);
  }

  // No `ask` label and nothing reported: read the end of the agent's screen once.
  tail(q, cx) {
    if (q.ask || tails.has(q.key) || checking()) return;
    tails.set(q.key, "");
    cx.spawn(async (cx) => {
      const r = await hc(["read", q.agent.address]).catch(() => null);
      const lines = (r?.stdout ?? "").split("\n").map((l) => l.replace(/[─-╿]/g, "").trim()).filter(Boolean);
      tails.set(q.key, lines.slice(-4).join(" ").slice(0, 240));
      cx.notify();
    });
  }

  queue(cx) {
    const list = fleet().questions;
    const now = Date.now();
    const live = new Set(list.map((q) => q.key));
    for (const k of [...seen.keys()]) if (!live.has(k)) { seen.delete(k); tails.delete(k); }
    for (const q of list) {
      if (!seen.has(q.key)) seen.set(q.key, now);
      this.tail(q, cx);
    }
    return [...list].sort((a, b) => seen.get(a.key) - seen.get(b.key));
  }

  buttons(q, later) {
    const done = () => { if (props()?.overlay) closeOverlay(props().overlay); };
    const button = (id, label, filled, action) => h_flex().id(id).min_h(34).px(12).flex_none().items_center().border(2)
      .border_color(filled === null ? SLAB.button : SLAB.text).bg(filled ? SLAB.text : SLAB.bg).text_color(filled ? SLAB.canvas : SLAB.text)
      .when(filled !== null, (el) => el.font_semibold()).cursor_pointer().hover((s) => s.border_color(SLAB.title))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
    const address = q.agent.address;
    return h_flex().flex_wrap().gap(8)
      .children(q.choices.map((c, i) => button(`ans-${address}-${i}`, c.label, i === 0, () => answer(q, c))))
      .child(button(`open-${address}`, "Open", null, () => { pick(q.agent); done(); }))
      .when(Boolean(later), (el) => el.child(button(`later-${address}`, "Later", null, later)));
  }

  toast(cx) {
    const later = shared("fleet.later") ?? {};
    const q = this.queue(cx).find((x) => later[x.agent.address] !== x.key);
    // Nothing drawn hides the floating block.
    if (!q || !pref("toast") || shared("fleet.mailbox")) { this.key = null; return div(); }
    if (q.key !== this.key) {
      this.key = q.key;
      this.slid = !pref("motion") || !this.ticking;
      if (pref("sound") && !checking()) playSound("blocked");
    }
    const a = q.agent;
    const slab = v_flex().id(`toast-${a.address}`).relative().w(340).p(12).gap(10).bg(SLAB.bg).border(2).border_color(SLAB.border).text_size(13).text_color(SLAB.text)
      // Slides in from the right; with reduced motion it is simply there.
      .left(this.slid ? 0 : 380).transition("left", { duration: 600, easing: "ease-out" })
      .child(h_flex().gap(12).items_center()
        .child(sprite("i_block.gif", 40))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().font_family(PIXEL).text_size(12).text_color(SLAB.title).child("Question received!"))
          .child(h_flex().gap(6).child(div().min_w(0).truncate().font_semibold().child(`${a.project} / ${a.name}`)).child(div().flex_none().text_color(SLAB.muted).child(`[${agentTag(a)}]`)))))
      .child(div().child(q.ask || tails.get(q.key) || "Waiting on you."))
      .child(this.buttons(q, () => setShared("fleet.later", { ...later, [a.address]: q.key })));
    return div().w(340).overflow_hidden().child(slab);
  }

  mailbox(cx) {
    const list = this.queue(cx);
    return v_flex().w_full().p(12).gap(12).bg(SLAB.bg).border(2).border_color(SLAB.border).text_size(13).text_color(SLAB.text)
      .child(div().font_family(PIXEL).text_size(12).child("Mailbox"))
      .when(list.length === 0, (el) => el.child(div().text_color(SLAB.muted).child("No questions waiting. Everyone is digging.")))
      .child(v_flex().id("mailbox-list").gap(12).max_h(520).overflow_y_scrollbar().children(list.map((q) => v_flex().flex_none().p(10).gap(8).bg(SLAB.pane).border(1).border_color(SLAB.button)
        .child(h_flex().gap(8).items_center()
          .child(sprite("i_block.gif", 16))
          .child(div().flex_1().font_family(PIXEL).text_size(11).child("Question"))
          .child(div().flex_none().text_size(11).text_color(SLAB.muted).child(`[${agentTag(q.agent)}]`)))
        .child(div().truncate().font_semibold().child(`${q.agent.project} / ${q.agent.name}`))
        .child(div().child(q.ask || tails.get(q.key) || "Waiting on you."))
        .child(this.buttons(q, null)))));
  }

  render(cx) {
    // Nothing moves, sounds or reads terminals while the window is in the background.
    return props()?.part === "mailbox" ? this.mailbox(cx) : this.toast(cx);
  }
}
