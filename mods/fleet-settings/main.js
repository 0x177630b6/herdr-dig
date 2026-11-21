// Fleet settings: each project's lead and avatar, and the layout's switches.
// Everything here writes the same labels as the right-click menu and `hc label`.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { PIXEL, ROBOTS, tk, fleet, pref, setPref, toggleTheme, makeLead, setAvatar, avatarPath, projectMark, toggle } from "./lib.js";

export default class FleetSettings extends View {
  render() {
    const t = tk();
    const model = fleet();
    const chip = (id, label, on, action) => h_flex().id(id).h(26).px(8).flex_none().items_center().border(1)
      .border_color(on ? t.text : t.border).bg(on ? t.text : t.pane).text_color(on ? t.canvas : t.text).text_size(12).cursor_pointer()
      .hover((s) => s.border_color(t.text)).on_click(action).child(div().max_w(120).truncate().child(label));

    // Two cards per row, the avatar picker in the card's head: six projects fit unscrolled.
    const project = (p) => v_flex().w(428).flex_none().p(10).gap(8).bg(t.pane).border(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(projectMark(p, t, 28))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.text).child(p.name))
          .child(div().text_size(11).text_color(t.muted).child(p.lead ? `[${p.machine ?? pref("local")}]` : "pick a lead first")))
        .child(h_flex().flex_none().gap(4).children(ROBOTS.map((robot) => div().id(`av-${p.id}-${robot}`).size(30).flex_none().flex().items_center().justify_center()
          .bg(t.selected).border(2).border_color(robot === p.robot ? t.blue : t.border).tooltip(robot)
          .when(Boolean(p.lead), (el) => el.cursor_pointer().hover((s) => s.border_color(t.text)).on_click(() => setAvatar(p, null, robot)))
          .when(!p.lead, (el) => el.opacity(0.4))
          .child(image(avatarPath(robot, p.slot, t)).w(22).h(22))))))
      .child(h_flex().gap(8).items_start()
        .child(div().w(34).flex_none().pt(4).text_size(12).text_color(t.muted).child("Lead"))
        .child(h_flex().flex_1().min_w(0).flex_wrap().gap(6)
          .child(chip(`lead-${p.id}-none`, "none", !p.lead, () => makeLead(p, null)))
          .children(p.agents.filter((a) => !a.offline).map((a) => chip(`lead-${p.id}-${a.address}`, a.name, a.lead, () => makeLead(p, a))))));

    const line = (label, control) => h_flex().h(34).gap(10).items_center().child(div().flex_1().text_color(t.text).child(label)).child(control);
    const sw = (key, label) => line(label, toggle(`sw-${key}`, t, Boolean(pref(key)), () => setPref(key, !pref(key))));

    return v_flex().w_full().p(16).gap(14).bg(t.chrome).text_size(13).text_color(t.text)
      .child(h_flex().items_center()
        .child(div().flex_1().font_family(PIXEL).text_size(14).child("FLEET SETTINGS"))
        .child(div().id("fs-close").px(8).h(26).flex().items_center().border(1).border_color(t.border).text_color(t.muted).cursor_pointer()
          .hover((s) => s.text_color(t.text)).on_click(() => closeOverlay(props()?.overlay)).child("[ x ]")))
      .child(v_flex().flex_none()
        .child(sw("avatars", "Avatars"))
        .child(line("Theme", h_flex().id("fs-theme").h(28).px(10).items_center().border(1).border_color(t.border).cursor_pointer()
          .hover((s) => s.bg(t.selected)).on_click(() => toggleTheme()).child(t.light ? "[ light ]" : "[ dark ]")))
        .child(sw("toast", "Question toast"))
        .child(sw("notify", "Desktop notification when an agent needs you"))
        .child(sw("sound", "Sound when a question arrives"))
        .child(sw("motion", "Motion (carts, toast slide)"))
        .child(sw("builder", "Builder on working panes")))
      .child(div().font_family(PIXEL).text_size(11).text_color(t.muted).child("PROJECTS"))
      .child(h_flex().id("fs-projects").flex_wrap().items_start().gap(8).max_h(640).overflow_y_scrollbar().children(model.projects.map(project)));
  }
}
