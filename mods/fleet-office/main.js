// The Office: one cave room per project, the lead at a desk, each worker a miner whose
// sprite is its status. props.compact: the sidebar version, mini rooms.
// Sprites carry white pixels, so they are only ever drawn on the (always dark) cave wall.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props } from "herdr";
import { SPR, PIXEL, CAVE, tk, fleet, pref, pick, pickProject, agentMenu, STATUS, sprite, statusIcon, ground, caveWall, heading, agentTag } from "./lib.js";

export default class FleetOffice extends View {
  // The wall is clipped images behind the room's content.
  wall(content) {
    return div().relative().w_full().overflow_hidden().bg("#1E1E1E").children(caveWall()).child(content);
  }

  mini(t, p, avatars) {
    const worker = (w) => div().id(`mini-${w.address}`).flex_none().cursor_pointer().tooltip(`${w.name}, ${w.offline ? "offline" : STATUS[w.status].label}`)
      .when(w.offline, (el) => el.opacity(0.5))
      .on_click(() => pick(w)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(w); })
      .child(sprite(STATUS[w.status].miner, 56, 40));
    return v_flex().flex_none().border(1).border_color(t.border).bg(t.room)
      .child(h_flex().id(`mini-head-${p.id}`).h(28).px(8).gap(8).flex_none().items_center().bg(t.card).border_b(3).border_color(p.color).cursor_pointer()
        .on_click(() => pickProject(p))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.text).child(p.name))
        .child(div().flex_none().text_size(11).text_color(t.muted).child(`${p.working} of ${p.agents.length} working`)))
      .child(this.wall(h_flex().relative().flex_wrap().items_end().gap(6).p(8).min_h(56)
        .when(Boolean(p.lead), (el) => el.child(h_flex().id(`mini-lead-${p.lead.address}`).h(40).gap(4).flex_none().items_center().cursor_pointer()
          .tooltip(`${p.lead.name}, lead, ${p.lead.offline ? "offline" : STATUS[p.lead.status].label}`)
          .when(p.lead.offline, (e) => e.opacity(0.5))
          .on_click(() => pick(p.lead)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(p.lead); })
          .when(avatars, (e) => e.child(image(p.avatar).w(28).h(28).flex_none()))
          .child(statusIcon(p.lead.status))))
        .children(p.workers.map(worker))))
      .child(ground());
  }

  room(t, p, avatars) {
    const caption = (a, word) => [
      h_flex().gap(6).items_center().child(statusIcon(a.status)).child(div().max_w(120).truncate().font_semibold().text_color(CAVE.text).child(a.name)),
      div().text_size(11).text_color(CAVE.muted).child(`${word} [${agentTag(a)}]`),
    ];
    const figure = (a) => v_flex().id(`office-${a.address}`).flex_none().items_center().gap(2).cursor_pointer()
      .when(a.offline, (el) => el.opacity(0.5))
      .on_click(() => pick(a)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); });
    const worker = (w) => figure(w).child(sprite(STATUS[w.status].miner, 112, 80)).children(caption(w, STATUS[w.status].label));
    // The avatar sits behind its desk: placed by hand, 10px of it hidden by the desk top.
    const lead = p.lead ? figure(p.lead)
      .child(div().relative().w(120).h(avatars ? 98 : 60).flex_none()
        .when(avatars, (el) => el.child(image(p.avatar).absolute().left(36).top(0).w(48).h(48)))
        .child(image(SPR + "desk.gif").absolute().left(0).top(avatars ? 38 : 0).w(120).h(60)))
      .children(caption(p.lead, "lead")) : null;
    // The room is at least 520 wide; the lead keeps the left, the workers wrap beside the desk.
    return v_flex().flex_1().min_w(520).border(1).border_color(t.border).bg(t.room)
      .child(h_flex().id(`room-head-${p.id}`).h(36).px(12).gap(8).flex_none().items_center().bg(t.card).border_b(4).border_color(p.color).cursor_pointer()
        .on_click(() => pickProject(p))
        .child(div().flex_1().min_w(0).truncate().font_family(PIXEL).text_size(12).text_color(t.text).child(p.name))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(`${p.working} of ${p.agents.length} working`)))
      .child(this.wall(h_flex().relative().items_end().gap(16).px(14).pt(14).pb(12).min_h(150)
        .when(Boolean(lead), (el) => el.child(lead))
        .child(h_flex().flex_1().min_w(0).flex_wrap().items_end().gap(16).children(p.workers.map(worker)))
        .when(p.agents.length === 0, (el) => el.child(div().text_color(CAVE.muted).child("Nobody here yet.")))))
      .child(ground());
  }

  render() {
    const t = tk();
    const model = fleet();
    const avatars = pref("avatars");
    if (props()?.compact) {
      return v_flex().id("fleet-office-mini").size_full().min_h(0).px(8).pt(8).pb(12).gap(8).bg(t.chrome).text_size(13).overflow_y_scrollbar()
        .children(model.projects.map((p) => this.mini(t, p, avatars)));
    }
    return v_flex().id("fleet-office").size_full().min_h(0).p(20).gap(14).bg(t.canvas).text_size(13).overflow_y_scrollbar()
      .child(heading(t, "Office"))
      .child(h_flex().flex_wrap().items_start().gap(12).children(model.projects.map((p) => this.room(t, p, avatars))));
  }
}
