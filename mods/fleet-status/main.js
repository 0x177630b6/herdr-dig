// The status bar: every machine with its agent count. It also asks `hc machine ls`
// every 5 s which machines are connected, so a dropped one shows offline everywhere.
// With "Claude usage" on in Fleet settings it also asks, every 5 minutes, how much of the
// plan's limits is used (usage.py; the sidebar header shows it).

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { hc, exec, appHome, shared, setShared, window, checking, knownAgents } from "herdr";
import { tk, fleet, pref, sprite } from "./lib.js";

const USAGE_EVERY = 300000;

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
    // Looked at often, asked rarely: switching the setting on shows numbers within seconds.
    let asking = false;
    const usage = (cx) => {
      // In the background only the first answer is fetched: nothing to keep fresh there.
      if (asking || !pref("usage") || (!window()?.active && shared("fleet.plan"))) return;
      if (Date.now() - (shared("fleet.plan")?.at ?? 0) < USAGE_EVERY) return;
      asking = true;
      cx.spawn(async () => {
        const r = await exec("python3", ["-I", `${appHome()}/mods/fleet-status/usage.py`], { timeout: 40000 }).catch(() => null);
        asking = false;
        let got = null;
        try { got = JSON.parse(r?.stdout ?? ""); } catch { /* not installed, or no answer */ }
        setShared("fleet.plan", { at: Date.now(), ok: Boolean(got?.ok), limits: got?.ok ? got.limits : shared("fleet.plan")?.limits ?? [], why: got?.ok ? null : got?.why ?? "no answer" });
      });
    };
    usage(cx);
    cx.timer.every(5000, usage);
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
