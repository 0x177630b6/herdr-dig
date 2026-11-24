// Questions from agents that need you.
// props.part "toast": the floating slab, one question at a time, oldest first.
// props.part "mailbox": the panel under the mailbox button, every pending question.
// Both stay dark in both themes.
// The toast copy also raises the desktop notification: once per new question, and only
// while Herdr is not the window in front (in front, the toast says it).

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, hc, exec, appHome, shared, setShared, closeOverlay, playSound, window, checking } from "herdr";
import { PIXEL, SLAB, fleet, pref, pick, answer, sprite, agentTag } from "./lib.js";

// Shared by the toast and the mailbox (module code is one per mod): when each question
// was first seen, and the last lines of a terminal whose agent gave no question text.
const seen = new Map();
const tails = new Map();
// Desktop notifications. `told`: the question last announced for each agent, kept until the
// agent moves on, so a machine dropping off and coming back does not announce it again.
// Questions already waiting when the layout loads (or the mod is reloaded) are not news:
// nothing is announced in the first seconds, while the fleet is still arriving.
const told = new Map();
const BOOT = Date.now();
const QUIET = 5000;
const NOTIFIER = "Herdr Fleet.app";

const cut = (text, max) => {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

// Herdr has no OS notification of its own for mods (notify() is the in-app toast), so this
// runs the system's program. Names and questions are not ours: they go as arguments, never
// inside a script or a shell line. A missing program (no notify-send) is simply no notification.
function desktop(q, text, avatar) {
  const a = q.agent;
  const title = cut(`${a.project} / ${a.name} needs you`, 80);
  const body = cut(text, 200) || "Waiting on you.";
  const where = cut(agentTag(a), 40);
  const os = window()?.platform;
  if (os === "macos") {
    // argv reaches the script as plain strings: nothing in them is read as AppleScript.
    const plain = () => exec("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv) subtitle (item 3 of argv)", "-e", "end run", "--", title, body, where], { timeout: 10000 }).catch(() => null);
    // The notifier app install.sh builds carries our pixel icon (a notification shows the
    // icon of the app that posts it). The text goes in its environment, as plain strings.
    // No app (not built, or removed): the plain notification, under Script Editor's icon.
    return exec("open", ["-n", "-g", "--env", `FLEET_TITLE=${title}`, "--env", `FLEET_BODY=${body}`, "--env", `FLEET_SUB=${where}`, "-a", `${appHome()}/mods/fleet-notify/${NOTIFIER}`], { timeout: 10000 })
      .then((r) => (r?.code === 0 ? r : plain()), plain);
  } else if (os === "linux") {
    // No subtitle there: the machine goes in the title. mako reads the body as Pango markup.
    const plain = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return exec("notify-send", ["--app-name", "Herdr Fleet", "--icon", `${appHome()}/${avatar || "mods/fleet-notify/icon.png"}`, "--", `${title} [${where}]`, plain], { timeout: 10000 }).catch(() => null);
  }
  return null;
}

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
    // Nothing is drawn while the window is in the background, but timers go on: this one
    // is what sees a question arrive there.
    cx.timer.every(2000, (cx) => { if (!window()?.active) this.queue(cx); });
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

  // A question seen for the first time, announced on the desktop at most once.
  announce(q, model, cx) {
    const a = q.agent;
    if (checking() || props()?.part === "mailbox" || !pref("notify") || window()?.active || Date.now() - BOOT < QUIET || told.get(a.address) === q.key) return;
    told.set(a.address, q.key);
    const avatar = model.projects.find((p) => p.id === a.pid)?.avatar;
    cx.spawn(async (cx) => {
      if (!q.ask) {
        // No text yet: give the agent's hook time to write its `ask` label (that is a new
        // question, announced on its own) and the terminal's tail time to be read.
        await cx.sleep(1500);
        if (!fleet().questions.some((x) => x.key === q.key)) { if (told.get(a.address) === q.key) told.delete(a.address); return; }
      }
      desktop(q, q.ask || tails.get(q.key), avatar);
    });
  }

  queue(cx) {
    const model = fleet();
    const list = model.questions;
    const now = Date.now();
    const live = new Set(list.map((q) => q.key));
    for (const k of [...seen.keys()]) if (!live.has(k)) { seen.delete(k); tails.delete(k); }
    for (const a of model.agents) if (!a.offline && a.status !== "blocked") told.delete(a.address);
    for (const q of list) {
      if (!seen.has(q.key)) { seen.set(q.key, now); this.announce(q, model, cx); }
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
    // Not called while the window is in the background: the timer in init covers that.
    return props()?.part === "mailbox" ? this.mailbox(cx) : this.toast(cx);
  }
}
