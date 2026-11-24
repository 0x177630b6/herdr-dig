// The sidebar lists: every agent once, grouped by project, by machine or by status
// (props.group: "project" | "machine" | "status"). Opened as a popup with
// props.menu = an agent's address, it is that agent's right-click menu (lead, avatar, group).

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, run, focused, closeOverlay, setAgentOrder, knownAgents, checking } from "herdr";
import { ROBOTS, INK, tk, fleet, pref, pick, pickProject, makeLead, setAvatar, setGroup, groupName, agentMenu, addButton, avatarPath, sidebarMode, workView, setWorkView, statusIcon, projectMark, tag, agentTag } from "./lib.js";

const SECTIONS = [["blocked", "Needs you"], ["done", "Done, to review"], ["working", "Working"], ["idle", "Idle"]];
const STACK = { project: "projects", machine: "machines", status: "inbox" };

export default class FleetAgents extends View {
  init(_props, cx) {
    this.picking = false;
    this.kinds = null;
    this.grouping = false;
    if (props()?.menu && !checking()) {
      // The name of a new group; Enter moves the agent into it.
      this.name = InputState.new({ placeholder: "New group…" });
      this.name.on("submit", () => this.group(this.name.value()));
    }
    const add = props()?.add;
    if (!add || checking()) return;
    // The agents installed where the new one will run.
    cx.spawn(async (cx) => {
      const list = await knownAgents({ on: add.machine ?? null }).catch(() => []);
      this.kinds = list.filter((k) => k.installed);
      cx.notify();
    });
  }

  // --- the "+" menu ---

  add(t) {
    const target = props().add;
    const done = () => closeOverlay(props().overlay);
    // The real tab is shown: a fresh agent is idle, so the crew view would hide it.
    const start = (argv) => () => {
      if (target.space) run("tab.new", { space: target.space, ...(argv ? { argv } : {}) });
      else run("space.new", { machine: target.machine ?? "", ...(argv ? { argv } : {}) });
      setWorkView("tab");
      done();
    };
    const item = (id, label, action) => h_flex().id(id).h(32).px(10).items_center().text_color(t.text).cursor_pointer()
      .hover((s) => s.bg(t.selected)).on_click(action).child(div().truncate().child(label));
    return v_flex().w_full().p(4).bg(t.chrome).text_size(13)
      .child(div().px(10).pt(6).pb(4).text_size(11).text_color(t.muted).truncate().child(target.space ? `New in ${target.title}` : `New project on ${target.title}`))
      .when(this.kinds === null, (el) => el.child(div().h(32).px(10).flex().items_center().text_color(t.muted).child("Looking for agents…")))
      .children((this.kinds ?? []).map((k, i) => item(`add-${i}`, `${k.name} agent`, start(k.run))))
      .child(div().mx(8).my(3).h(1).bg(t.border))
      .child(item("add-shell", "Terminal", start(null)));
  }

  // --- the right-click menu ---

  group(name) {
    const a = fleet().agents.find((x) => x.address === props().menu);
    if (a && (groupName(name) || a.group)) setGroup(a, name);
    closeOverlay(props().overlay);
  }

  menu(t) {
    const model = fleet();
    const a = model.agents.find((x) => x.address === props().menu);
    const done = () => closeOverlay(props().overlay);
    if (!a) return div().p(10).text_color(t.muted).child("This agent is gone.");
    const p = model.projects.find((x) => x.id === a.pid);
    const item = (id, label, action, dim = false) => h_flex().id(id).h(32).px(10).items_center().text_color(dim ? t.muted : t.text).cursor_pointer()
      .hover((s) => s.bg(t.selected)).on_click(action).child(label);
    if (this.picking) {
      const current = a.lead ? p.robot : a.labels.avatar;
      return v_flex().w_full().p(8).gap(8).bg(t.chrome).text_size(13).text_color(t.text)
        .child(div().text_size(12).text_color(t.muted).child(`Avatar for ${a.name}`))
        .child(h_flex().flex_wrap().gap(6).children(ROBOTS.map((robot) => div().id(`av-${robot}`).size(64).flex().items_center().justify_center()
          .bg(t.selected).border(2).border_color(robot === current ? t.blue : t.border).cursor_pointer().tooltip(robot)
          .hover((s) => s.border_color(t.text))
          .on_click(() => { setAvatar(p, a, robot); done(); })
          .child(image(avatarPath(robot, p.slot, t)).w(48).h(48)))));
    }
    if (this.grouping) {
      // The groups of this agent's space, out of any, or a new one.
      const groups = model.projects.filter((x) => x.space === a.space && x.group);
      return v_flex().w_full().p(4).bg(t.chrome).text_size(13)
        .child(div().px(10).pt(6).pb(4).text_size(11).text_color(t.muted).truncate().child(`Group for ${a.name}`))
        .children(groups.map((g, i) => item(`m-group-${i}`, `${g.group === a.group ? "● " : "○ "}${g.name}`, () => this.group(g.group))))
        .child(item("m-group-none", `${a.group ? "○ " : "● "}No group`, () => this.group(""), true))
        .child(div().mx(8).my(3).h(1).bg(t.border))
        .when(Boolean(this.name), (el) => el.child(div().id("m-group-new").mx(6).mb(4).h(30).px(8).flex().items_center().border(1).border_color(t.border).bg(t.pane).cursor_text()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(this.name).h_full().w_full().text_size(13).text_color(t.text))))
        .child(div().px(10).pb(6).text_size(11).text_color(t.muted).child("Enter to create. Sub-agents follow."));
    }
    return v_flex().w_full().p(4).bg(t.chrome).text_size(13)
      .child(div().px(10).pt(6).pb(4).text_size(11).text_color(t.muted).truncate().child(`${a.project} / ${a.name}`))
      .child(a.lead && a.labels.role === "lead"
        ? item("m-unlead", "Remove lead", () => { makeLead(p, null); done(); })
        : item("m-lead", "Make lead", () => { makeLead(p, a); done(); }))
      .child(item("m-avatar", "Change avatar…", (_e, cx) => { this.picking = true; cx.notify(); }))
      .child(item("m-group", a.group ? `Group: ${a.group}…` : "Group…", (_e, cx) => { this.grouping = true; this.name?.focus(); cx.notify(); }))
      .child(item("m-open", "Open", () => { pick(a); done(); }))
      .child(div().mx(8).my(3).h(1).bg(t.border))
      .child(item("m-settings", "Fleet settings…", () => { done(); run("mod.open", { name: "fleet-settings" }); }, true));
  }

  // --- the lists ---

  groups(model, t) {
    const group = props()?.group ?? "project";
    if (group === "machine") {
      return model.machines.map((m) => ({
        id: `m-${m.name ?? ""}`, title: m.label, count: m.agents.length, color: t.muted, sub: m.online ? "online" : "offline",
        dim: !m.online, pick: () => setWorkView("home"), agents: m.agents, chip: (a) => a.project,
        add: m.online ? { machine: m.name, title: m.label } : null,
      }));
    }
    if (group === "status") {
      const out = SECTIONS.map(([status, title]) => {
        const list = model.agents.filter((a) => a.status === status && !a.offline);
        return { id: `s-${status}`, title, count: list.length, color: { blocked: t.orange, done: t.text, working: t.blue, idle: t.idle }[status], sub: "", pick: () => setWorkView("home"), agents: list, chip: (a) => a.project };
      });
      const off = model.agents.filter((a) => a.offline);
      if (off.length) out.push({ id: "s-offline", title: "Offline", count: off.length, color: t.idle, sub: "", dim: true, pick: () => setWorkView("home"), agents: off, chip: (a) => a.project });
      return out;
    }
    const crew = workView() === "crew";
    return model.projects.map((p) => ({
      id: `p-${p.id}`, title: p.name, project: p, sub: `${p.agents.length} agent${p.agents.length === 1 ? "" : "s"}`,
      on: p.active && crew, pick: () => pickProject(p), agents: p.agents, chip: (a) => agentTag(a),
      add: p.agents.some((a) => !a.offline) || p.machine == null ? { space: p.space, machine: p.machine ?? null, title: p.name } : null,
    }));
  }

  render() {
    const t = tk();
    if (props()?.add) return this.add(t);
    if (props()?.menu) return this.menu(t);
    const model = fleet();
    const groups = this.groups(model, t);
    const shown = focused()?.terminal;
    const mine = sidebarMode() === STACK[props()?.group ?? "project"];
    // agent.next / agent.prev walk the list that is on screen.
    if (mine) setAgentOrder(groups.flatMap((g) => g.agents.filter((a) => a.pane).map((a) => a.address)));

    const header = (g) => h_flex().id(`g-${g.id}`).h(36).px(8).gap(8).flex_none().items_center().cursor_pointer()
      .when(Boolean(g.on), (el) => el.bg(t.selected)).when(Boolean(g.dim), (el) => el.opacity(0.6))
      .hover((s) => s.bg(t.selected)).on_click(g.pick)
      .child(g.project ? projectMark(g.project, t, 24)
        : div().flex_none().size(20).flex().items_center().justify_center().bg(g.color).text_color(INK).text_size(11).font_bold().child(String(g.count)))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.text).child(g.title))
      .child(div().flex_none().text_size(12).text_color(t.muted).child(g.sub))
      .when(Boolean(g.add), (el) => el.child(addButton(`add-${g.id}`, t, g.add)));

    const row = (g, a) => h_flex().id(`a-${g.id}-${a.address}`).h(32).pl(36).pr(8).gap(8).flex_none().items_center().cursor_pointer()
      .when(shown === a.address, (el) => el.bg(t.selected))
      .when(a.offline, (el) => el.opacity(0.5))
      .hover((s) => s.bg(t.selected))
      .on_click(() => pick(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); })
      .child(statusIcon(a.status))
      .child(div().min_w(0).truncate().text_color(t.text).when(a.lead, (el) => el.font_semibold()).child(a.name))
      .when(a.lead, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("lead")))
      .child(div().flex_1())
      .child(tag(g.chip(a), t.muted).max_w(130).truncate());

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .when(model.agents.length === 0, (el) => el.child(div().p(14).text_size(12).text_color(t.muted).child("No agents yet. They show up here once they report a status.")))
      .child(v_flex().id(`fleet-list-${props()?.group ?? "project"}`).flex_1().min_h(0).px(8).pt(8).pb(12).gap(10).overflow_y_scrollbar()
        .children(groups.map((g) => v_flex().flex_none().gap(1).child(header(g)).children(g.agents.map((a) => row(g, a))))));
  }
}
