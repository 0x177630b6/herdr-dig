// The sidebar lists: every agent once, grouped by project, by machine or by status
// (props.group: "project" | "machine" | "status"). Opened as a popup with
// props.menu = an agent's address, it is that agent's right-click menu (lead, avatar, group, end).
// Workers resting (idle for long, see `rest`) sit folded at the bottom of their project.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, run, focused, closeOverlay, setAgentOrder, knownAgents, shared, setShared, checking } from "herdr";
import { ROBOTS, INK, tk, fleet, pref, pick, endAgent, helpersOf, ago, pickProject, makeLead, setAvatar, setGroup, groupName, move, agentMenu, projectMenu, addButton, avatarPath, sidebarMode, workView, setWorkView, statusIcon, projectMark, tag, agentTag } from "./lib.js";

const SECTIONS = [["blocked", "Needs you"], ["done", "Unread"], ["working", "Working"], ["idle", "Idle"]];
const STACK = { project: "projects", machine: "machines", status: "inbox" };

export default class FleetAgents extends View {
  init(_props, cx) {
    this.picking = false;
    this.kinds = null;
    this.grouping = false;
    this.ending = false;
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

  // "End …?": nothing ends before this second click. `list`: the agents that end.
  confirm(t, title, list, model, action) {
    const done = () => closeOverlay(props().overlay);
    const helpers = list.flatMap((a) => helpersOf(a, model)).filter((h) => !list.includes(h));
    const names = list.slice(0, 8).map((a) => a.name).join(", ") + (list.length > 8 ? ` and ${list.length - 8} more` : "");
    const button = (id, label, strong, click) => h_flex().id(id).h(30).px(12).items_center().border(1).cursor_pointer()
      .border_color(strong ? t.orange : t.border).text_color(strong ? t.orangeText : t.text).hover((s) => s.bg(t.selected)).on_click(click).child(label);
    return v_flex().w_full().p(10).gap(8).bg(t.chrome).text_size(13).text_color(t.text)
      .child(div().font_semibold().child(title))
      .child(div().text_size(12).text_color(t.muted).child(`${names}. ${helpers.length ? `Their ${helpers.length} sub-agent${helpers.length === 1 ? "" : "s"} end too. ` : ""}The terminal closes; its conversation can't be continued here.`))
      .child(h_flex().gap(8).child(button("end-yes", "End", true, () => { action(); done(); })).child(button("end-no", "Cancel", false, () => done())));
  }

  // --- a project's right-click menu: its place in the list ---

  place(t) {
    const model = fleet();
    const p = model.projects.find((x) => x.id === props().project);
    const done = () => closeOverlay(props().overlay);
    if (!p) return div().p(10).text_color(t.muted).child("This project is gone.");
    if (this.ending) return this.confirm(t, `End ${p.resting.length} resting worker${p.resting.length === 1 ? "" : "s"} of ${p.name}?`, p.resting, model, () => p.resting.forEach(endAgent));
    const ids = model.projects.map((x) => x.id), i = ids.indexOf(p.id);
    // Up and down keep the menu open: one click per step.
    const item = (id, label, how, off) => h_flex().id(id).h(32).px(10).items_center().text_color(off ? t.muted : t.text)
      .when(!off, (el) => el.cursor_pointer().hover((s) => s.bg(t.selected)).on_click(() => { move("projects", ids, p.id, how); if (how === "top" || how === "bottom") done(); }))
      .child(label);
    return v_flex().w_full().p(4).bg(t.chrome).text_size(13)
      .child(div().px(10).pt(6).pb(4).text_size(11).text_color(t.muted).truncate().child(`${p.name} · ${i + 1} of ${ids.length}`))
      .child(item("p-top", "Move to top", "top", i === 0))
      .child(item("p-up", "Move up", "up", i === 0))
      .child(item("p-down", "Move down", "down", i === ids.length - 1))
      .child(item("p-bottom", "Move to bottom", "bottom", i === ids.length - 1))
      .when(Boolean(pref("retire")) && p.resting.length > 0, (el) => el.child(div().mx(8).my(3).h(1).bg(t.border))
        .child(h_flex().id("p-end").h(32).px(10).items_center().text_color(t.orangeText).cursor_pointer().hover((s) => s.bg(t.selected))
          .on_click((_e, cx) => { this.ending = true; cx.notify(); }).child(`End resting workers (${p.resting.length})…`)));
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
    if (this.ending) return this.confirm(t, `End ${a.name}?`, [a], model, () => endAgent(a));
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
      .when(!a.lead && p.workers.length > 1, (el) => {
        // Among the workers of its project (the lead stays first); the menu stays open.
        const ids = p.workers.map((x) => x.address), i = ids.indexOf(a.address);
        return el.child(item("m-up", "Move up", () => move("agents", ids, a.address, "up"), i === 0))
          .child(item("m-down", "Move down", () => move("agents", ids, a.address, "down"), i === ids.length - 1));
      })
      .child(item("m-open", "Open", () => { pick(a); done(); }))
      // Never the lead, never while it works: ending is for finished workers.
      .when(Boolean(pref("retire")) && !a.lead && a.status !== "working", (el) => el.child(h_flex().id("m-end").h(32).px(10).items_center().text_color(t.orangeText).cursor_pointer()
        .hover((s) => s.bg(t.selected)).on_click((_e, cx) => { this.ending = true; cx.notify(); }).child("End agent…")))
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
      on: p.active && crew, rest: true, pick: () => pickProject(p), agents: p.agents, chip: (a) => agentTag(a),
      add: p.agents.some((a) => !a.offline) || p.machine == null ? { space: p.space, machine: p.machine ?? null, title: p.name } : null,
    }));
  }

  render() {
    const t = tk();
    if (props()?.add) return this.add(t);
    if (props()?.menu) return this.menu(t);
    if (props()?.project) return this.place(t);
    const model = fleet();
    const groups = this.groups(model, t);
    const shown = focused()?.terminal;
    const mine = sidebarMode() === STACK[props()?.group ?? "project"];
    // agent.next / agent.prev walk the list that is on screen.
    // Groups minimised with their "−": only the header stays (kept across restarts).
    const folded = shared("fleet.folded") ?? {};
    const fold = (g) => { const next = { ...folded }; if (next[g.id]) delete next[g.id]; else next[g.id] = true; setShared("fleet.folded", next); };
    if (mine) setAgentOrder(groups.flatMap((g) => (folded[g.id] ? [] : g.agents.filter((a) => a.pane).map((a) => a.address))));
    const small = (id, label, tip, action) => div().id(id).size(22).flex_none().flex().items_center().justify_center()
      .border(1).border_color(t.border).text_color(t.muted).font_bold().cursor_pointer().tooltip(tip)
      .hover((s) => s.text_color(t.text).border_color(t.text))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(); }).child(label);

    const header = (g) => h_flex().id(`g-${g.id}`).h(36).px(8).gap(8).flex_none().items_center().cursor_pointer()
      .when(Boolean(g.on), (el) => el.bg(t.selected)).when(Boolean(g.dim), (el) => el.opacity(0.6))
      .hover((s) => s.bg(t.selected)).on_click(g.pick)
      .when(Boolean(g.project), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); projectMenu(g.project); }))
      .child(g.project ? projectMark(g.project, t, 24)
        : div().flex_none().size(20).flex().items_center().justify_center().bg(g.color).text_color(INK).text_size(11).font_bold().child(String(g.count)))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.text).child(g.title))
      // Minimised, the header still says when someone in it needs you.
      .when(Boolean(folded[g.id]) && g.agents.some((a) => a.status === "blocked" && !a.offline), (el) => el.child(statusIcon("blocked")))
      .when(Boolean(folded[g.id]) && g.agents.some((a) => a.unread), (el) => el.child(statusIcon("done")))
      .child(div().flex_none().text_size(12).text_color(t.muted).child(g.sub))
      .when(g.agents.length > 0, (el) => el.child(folded[g.id]
        ? small(`fold-${g.id}`, "▸", `Show the agents of ${g.title}`, () => fold(g))
        : small(`fold-${g.id}`, "−", `Minimise ${g.title}`, () => fold(g))))
      .when(Boolean(g.add), (el) => el.child(addButton(`add-${g.id}`, t, g.add)));

    const row = (g, a) => h_flex().id(`a-${g.id}-${a.address}`).h(32).pl(36).pr(8).gap(8).flex_none().items_center().cursor_pointer()
      .when(shown === a.address, (el) => el.bg(t.selected))
      .when(a.offline, (el) => el.opacity(0.5))
      .hover((s) => s.bg(t.selected))
      .on_click(() => pick(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); agentMenu(a); })
      .child(statusIcon(a.status))
      .child(div().min_w(0).truncate().text_color(a.resting ? t.muted : t.text).when(a.lead || a.unread, (el) => el.font_semibold()).child(a.name))
      .when(a.lead, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child("lead")))
      // Unread: finished while you weren't looking.
      .when(Boolean(a.unread), (el) => el.child(div().flex_none().size(6).bg(t.blue).tooltip("Unread")))
      .child(div().flex_1())
      .child(tag(g.rest && a.resting ? `idle ${ago(a.since)}` : g.chip(a), t.muted).max_w(130).truncate());

    // The resting workers of a project: one line, folded until opened.
    const restKey = (g) => `r-${g.id}`;
    const restOpen = (g) => folded[restKey(g)] === false;
    const restLine = (g) => h_flex().id(`rest-${g.id}`).h(28).pl(36).pr(8).gap(8).flex_none().items_center().cursor_pointer().text_size(12).text_color(t.muted)
      .hover((s) => s.bg(t.selected))
      .on_click(() => { const next = { ...folded }; if (restOpen(g)) delete next[restKey(g)]; else next[restKey(g)] = false; setShared("fleet.folded", next); })
      .child(div().flex_none().child(restOpen(g) ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).truncate().child(`Resting · ${g.project.resting.length}`))
      .child(div().flex_none().child(`idle ${pref("rest")}h+`));
    const body = (g) => {
      if (folded[g.id]) return [];
      if (!g.rest || !g.project.resting.length) return g.agents.map((a) => row(g, a));
      const awake = g.agents.filter((a) => !a.resting);
      return [...awake.map((a) => row(g, a)), restLine(g), ...(restOpen(g) ? g.project.resting.map((a) => row(g, a)) : [])];
    };

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .when(model.agents.length === 0, (el) => el.child(div().p(14).text_size(12).text_color(t.muted).child("No agents yet. They show up here once they report a status.")))
      .child(v_flex().id(`fleet-list-${props()?.group ?? "project"}`).flex_1().min_h(0).px(8).pt(8).pb(12).gap(10).overflow_y_scrollbar()
        .children(groups.map((g) => v_flex().flex_none().gap(1).child(header(g)).children(body(g)))));
  }
}
