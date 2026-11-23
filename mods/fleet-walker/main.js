// The wandering miner's way down: a window as narrow as the miner, over the work area, opened
// by the rail (fleet-chrome) where the miner stopped. It climbs down to the ground strip and
// digs into it. A click sends it away at once.
// props: height (of this window), pace (px a second), lead (ms before it starts down).

import { View, div, image } from "gpui-kit";
import { props, closeOverlay, checking } from "herdr";
import { SPR } from "./lib.js";

const W = 18, H = 24;

export default class FleetWalker extends View {
  init(_props, cx) {
    this.phase = "top";
    if (checking()) return;
    const p = props() ?? {};
    const lead = p.lead ?? 400;
    const climb = Math.round((Math.max(0, (p.height ?? 0) - H) / (p.pace ?? 34)) * 1000);
    const at = (ms, phase, then) => cx.timer.after(ms, (cx) => { this.phase = phase; cx.notify(); then?.(); });
    // The miner is drawn at the top first, and only then sent down: a target changed before
    // the first frame is not animated.
    at(lead, "climb");
    at(lead + climb, "land");
    at(lead + climb + 800, "dig");
    at(lead + climb + 800 + 1000, "gone", () => closeOverlay(p.overlay));
  }

  render() {
    const p = props() ?? {};
    const height = p.height ?? 0;
    const phase = this.phase;
    const floor = Math.max(0, height - H);
    const top = phase === "top" ? 0 : phase === "dig" ? height + 2 : floor;
    const still = phase === "land" || phase === "dig";
    return div().id("fleet-walker").relative().w(W).h(height).overflow_hidden().cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => closeOverlay(p.overlay))
      .when(phase !== "gone", (el) => el.child(image(SPR + (still ? "walker_stand.png" : "walker_climb.gif")).id("walker-down").absolute().left(0).top(top).w(W).h(H)
        .transition("top", { duration: phase === "dig" ? 1000 : Math.round((floor / (p.pace ?? 34)) * 1000), easing: "linear" })));
  }
}
