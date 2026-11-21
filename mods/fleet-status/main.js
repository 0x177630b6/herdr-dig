// The status bar: every machine with its agent count. It also asks `hc machine ls`
// every 5 s which machines are connected, so a dropped one shows offline everywhere.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { hc, shared, setShared, window, checking, knownAgents } from "herdr";
import { tk, fleet, sprite } from "./lib.js";

export default class FleetStatus extends View {
  init(_props, cx) {
    if (checking()) return;
    // Which programs are agents, for the ones that report no status of their own.
    cx.spawn(async () => {
      const list = await knownAgents().catch(() => null);
      if (list) setShared("fleet.kinds", list.map((k) => k.key));
    });
    const poll = (cx) => {
      // Nothing to keep fresh while the window is in the background.
      if (!window()?.active) return;
      cx.spawn(async () => {
        const r = await hc(["machine", "ls", "--json"]).catch(() => null);
        if (!r || r.code !== 0) return;
        let states;
        try { states = Object.fromEntries(JSON.parse(r.stdout).machines.filter((m) => !m.temporary).map((m) => [m.name, m.state])); } catch { return; }
        if (JSON.stringify(states) !== JSON.stringify(shared("fleet.machines") ?? {})) setShared("fleet.machines", states);
      });
    };
    poll(cx);
    cx.timer.every(5000, poll);
  }

  render() {
    const t = tk();
    const model = fleet();
    return h_flex().size_full().px(12).gap(16).items_center().bg(t.statusBarBg).text_size(11).text_color(t.statusBarFg).overflow_hidden()
      .child(div().flex_none().child("tailscale"))
      .children(model.machines.map((m) => h_flex().flex_none().gap(6).items_center()
        .when(!m.online, (el) => el.opacity(0.5))
        .child(sprite(m.online ? "i_host.gif" : "i_host_still.png", 16))
        .child(div().font_semibold().child(m.label))
        .child(m.online ? `${m.agents.length} agent${m.agents.length === 1 ? "" : "s"}` : "offline")))
      .child(div().flex_1())
      .child(div().flex_none().child("cmd-shift-h home"));
  }
}
