// The Home board: who needs you, then every project against every machine.

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { tk, fleet, pick, pickProject, agentMenu, heading, projectMark, statusIcon, sprite, tag, agentTag } from "./lib.js";

export default class FleetBoard extends View {
  render() {
    const t = tk();
    const model = fleet();

    const card = (q) => h_flex().id(`need-${q.agent.address}`).flex_1().min_w(300).min_h(64).px(14).py(10).gap(12).items_center()
      .bg(t.chrome).border(1).border_color(t.orange).cursor_pointer().hover((s) => s.bg(t.selected))
      .on_click(() => pick(q.agent))
      .child(div().flex_none().size(18).flex().items_center().justify_center().bg(t.orange).text_color(t.canvas).text_size(12).font_bold().child("!"))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_semibold().text_color(t.text).child(`${q.agent.project} / ${q.agent.name}`))
        .child(div().truncate().text_color(t.muted).child(q.ask || "Waiting on you.")))
      .child(tag(agentTag(q.agent), t.muted));

    const chip = (a) => h_flex().id(`chip-${a.address}`).h(30).px(8).gap(8).flex_none().items_center().bg(t.pane).border(1).border_color(t.border).cursor_pointer()
      .when(a.offline, (el) => el.opacity(0.5))
      .hover((s) => s.border_color(t.text))
      .on_click(() => pick(a)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); })
      .child(statusIcon(a.status))
      .child(div().min_w(0).truncate().text_color(t.text).when(a.lead, (el) => el.font_semibold()).child(a.name));

    const cell = () => v_flex().flex_1().min_w(0).p(8).gap(4).border_l(1).border_color(t.border);
    const head = h_flex().border_b(1).border_color(t.border)
      .child(div().w(190).flex_none().px(14).py(10).text_size(12).text_color(t.muted).child("Project"))
      .children(model.machines.map((m) => h_flex().flex_1().min_w(0).px(12).py(10).gap(8).items_center().border_l(1).border_color(t.border)
        .when(!m.online, (el) => el.opacity(0.5))
        .child(sprite(m.online ? "i_host.gif" : "i_host_still.png", 16))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(t.text).child(m.online ? m.label : `${m.label}: offline`))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(`${m.agents.length} agent${m.agents.length === 1 ? "" : "s"}`))));
    const row = (p) => h_flex().border_b(1).border_color(t.border)
      .child(h_flex().id(`board-${p.id}`).w(190).flex_none().min_h(64).px(14).py(10).gap(8).items_center().cursor_pointer()
        .hover((s) => s.bg(t.selected)).on_click(() => pickProject(p))
        .child(projectMark(p, t, 36))
        .child(v_flex().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.text).child(p.name))
          .child(div().text_size(12).text_color(t.muted).child(`${p.agents.length} agent${p.agents.length === 1 ? "" : "s"}`))))
      .children(model.machines.map((m) => cell().children(p.agents.filter((a) => a.machine === m.name).map(chip))));

    return v_flex().id("fleet-board").size_full().min_h(0).px(20).pt(20).pb(24).gap(20).bg(t.canvas).text_size(13).overflow_y_scrollbar()
      .child(v_flex().flex_none().gap(10)
        .child(heading(t, "Needs you"))
        .child(model.questions.length
          ? h_flex().flex_wrap().gap(8).children(model.questions.map(card))
          : div().text_color(t.muted).child("Nobody is waiting on you.")))
      .child(v_flex().flex_none().gap(10)
        .child(heading(t, "Projects by machine"))
        // Below 920px the grid scrolls sideways instead of squeezing.
        .child(div().id("fleet-grid").flex_none().bg(t.chrome).border(1).border_color(t.border).overflow_x_scrollbar()
          .child(v_flex().min_w(920).child(head).children(model.projects.map(row)))));
  }
}
