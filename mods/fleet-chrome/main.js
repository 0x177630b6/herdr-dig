// The fleet window's static chrome, one copy per part (props.part):
// banner, modes (mode switch + summary strip), footer, rail, ground.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, run, window } from "herdr";
import { SPR, PIXEL, tk, fleet, pref, sidebarMode, setSidebarMode, toggleTheme, pixelButton, statusIcon, strip, ground } from "./lib.js";

const MODES = [["projects", "Projects"], ["machines", "Machines"], ["inbox", "Inbox"], ["office-mini", "Office"]];
const CROSSING = 26000;

export default class FleetChrome extends View {
  init(_props, cx) {
    this.width = 0;
    this.carts = [{ lap: 0, go: false }, { lap: 0, go: false }];
    if (props()?.part !== "rail") return;
    // A cart crosses left to right in 26 s; the second one starts half a crossing later.
    // Each lap is a new element at the left edge, then one native transition across.
    const start = (i) => (cx) => {
      if (!pref("motion") || !window()?.active) return;
      this.launch(i, cx);
    };
    cx.timer.after(400, (cx) => { this.launch(0, cx); cx.timer.every(CROSSING, start(0)); });
    cx.timer.after(400 + CROSSING / 2, (cx) => { this.launch(1, cx); cx.timer.every(CROSSING, start(1)); });
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
    const count = (status, n, label) => h_flex().gap(5).items_center().flex_none()
      .child(statusIcon(status)).child(div().font_semibold().text_color(t.text).child(String(n))).child(label);
    return v_flex().size_full().bg(t.chrome).text_color(t.text)
      .child(h_flex().gap(4).pt(10).pb(6).pl(10).pr(10)
        .children(MODES.map(([id, label]) => pixelButton(`mode-${id}`, t, { active: mode === id, h: 36, px: 0, grow: true },
          (face) => face.w_full().font_family(PIXEL).text_size(10).on_click(() => setSidebarMode(id)).child(label)))))
      .child(h_flex().flex_1().flex_wrap().gap_x(10).gap_y(2).px(14).pb(6).items_center().text_size(12).text_color(t.muted).border_b(1).border_color(t.border).overflow_hidden()
        .child(count("blocked", c.blocked, "need you"))
        .child(count("done", c.done, "done"))
        .child(count("working", c.working, "working"))
        .child(count("idle", c.idle, "idle")));
  }

  footer(t) {
    return v_flex().size_full().bg(t.chrome)
      .child(ground())
      .child(h_flex().flex_1().px(14).gap(8).items_center().justify_between().text_size(12).text_color(t.muted)
        .child(div().truncate().child("cmd-p go to agent"))
        .child(h_flex().id("theme-toggle").h(30).px(10).flex_none().items_center().border(1).border_color(t.border).text_color(t.text).cursor_pointer()
          .hover((s) => s.bg(t.selected)).on_click(() => toggleTheme()).child(t.light ? "[ dark ]" : "[ light ]")));
  }

  rail(t) {
    const w = this.width || 1600;
    const moving = pref("motion");
    const cart = (c, i) => (moving
      ? image(SPR + "cart.gif").id(`cart-${i}-${c.lap}`).absolute().bottom(5).left(c.go ? w + 8 : -40).w(32).h(24).transition("left", { duration: CROSSING, easing: "linear" })
      // Reduced motion: the carts park.
      : image(SPR + "cart_still.png").absolute().bottom(5).left(i === 0 ? 24 : w * 0.6).w(32).h(24));
    return div().id("fleet-rail").relative().size_full().overflow_hidden().bg(t.canvas)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .child(div().absolute().left(0).right(0).bottom(0).h(8).child(strip("rail_960.png", 8)))
      .children(this.carts.map((c, i) => (c.lap || !moving ? cart(c, i) : null)).filter(Boolean));
  }

  render() {
    const t = tk();
    switch (props()?.part) {
      case "banner": return this.banner(t);
      case "modes": return this.modes(t);
      case "footer": return this.footer(t);
      case "rail": return this.rail(t);
      default: return div().size_full().bg(t.chrome).child(ground());
    }
  }
}
