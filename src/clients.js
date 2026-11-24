/* ---------- Clients and per-project partners ----------
   For each internal project the team can open a "Sharing" tab and make a client view:
   - cprojects/{projectId}: what clients and partners may see (stage, progress, next step, links), and who they are
   - cposts/{id}: updates on that project, from the team or from the client
   - ptasks/{id}: tasks given to one partner on that project
   Clients sign in with Google and only ever load their own cprojects. Partners see the projects they are on
   in a new Projects tab, with their own tasks. Nothing here exposes the internal project (tasks, chat, money). */

const CSTAGES = ["Planning", "Design", "Build", "Review", "Live"];
let clientMode = false;
let cProjects = [], cPosts = [], cTasks = [];                 // team: everything
let myCP = [], myCPosts = {}, myPTasks = [], cUnsubs = [], cSel = null, clientEmail = "";
let shareTab = "status", cvOpen = {};

const stagesOf = cp => (cp && Array.isArray(cp.stages) && cp.stages.length ? cp.stages : CSTAGES);
// What the client sees. Everything is on except the work list; the team switches each part on or off.
const CV_PARTS = [["progress", "Progress bar", "How far along the whole project is"], ["stages", "Stages", "Where we are: the steps from start to finish"], ["next", "Next step", "What happens next, and when"],
  ["work", "The work, part by part", "Each phase of our plan and how much of it is done"], ["pay", "Payments", "What they've paid and what's next"], ["links", "Files and links", "Designs, drafts and anything you share"]];
const cvShow = cp => { const s = (cp && cp.show) || {}; return Object.fromEntries(CV_PARTS.map(([k]) => [k, k === "pay" ? (s.pay != null ? s.pay : cp && cp.showPay !== false) : s[k] != null ? !!s[k] : k !== "work"])) };
const cpOf = id => cProjects.find(c => c.id === id);
const lower = e => String(e || "").trim().toLowerCase();

/* ---------- the status card both clients and partners see ---------- */
function statusCard(cp, { big } = {}) {
  const st = stagesOf(cp), cur = Math.max(0, Math.min(st.length - 1, cp.stage || 0)), pct = Math.max(0, Math.min(100, Math.round(cp.progress || 0)));
  const nx = cp.next || {}, sh = cvShow(cp);
  return el("section", { class: "cstatus" + (big ? " big" : "") },
    el("div", { class: "label" }, "Your project"),
    el("h2", {}, cp.title || "Your project"),
    sh.stages ? el("ol", { class: "stages", "aria-label": "Stages" }, st.map((s, i) => el("li", { class: i < cur ? "done" : i === cur ? "now" : "", "aria-current": i === cur ? "step" : null },
      el("span", { class: "dot" }, i < cur ? "✓" : String(i + 1)), el("span", { class: "sname" }, s)))) : null,
    sh.progress ? el("div", { class: "cprog" }, el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pct}%` })), el("span", {}, pct + "%")) : null,
    sh.progress ? el("p", { class: "cprog-note" }, "This bar follows the phases of our work. If it goes back a little, it means we've started the next phase and added its steps.") : null,
    sh.stages || (sh.next && nx.text) ? el("div", { class: "cnow" }, sh.stages ? el("div", {}, el("span", { class: "label" }, "Now"), el("b", {}, st[cur])) : null,
      sh.next && nx.text ? el("div", {}, el("span", { class: "label" }, "Next step"), el("b", {}, nx.text), nx.date ? el("span", { class: "cdate" }, fmtDay(new Date(nx.date + "T12:00").getTime())) : null) : null) : null,
    cp.updatedAt ? el("div", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Updated " + ago(cp.updatedAt)) : null);
}
// The work, phase by phase, with how much of each is done
function workCard(cp) {
  const w = cvShow(cp).work && Array.isArray(cp.work) ? cp.work.filter(x => x && x.total) : [];
  if (!w.length) return null;
  return el("section", { class: "idea workcard" }, el("h3", {}, "The work, part by part"), w.map(x => { const pct = Math.round(x.done / x.total * 100);
    return el("div", { class: "workrow" + (pct === 100 ? " done" : "") }, el("span", { class: "wname" }, (pct === 100 ? "✓ " : "") + x.name), el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pct}%` })), el("span", { class: "label" }, pct + "%")) }));
}
function linksList(cp) {
  if (!cvShow(cp).links) return null;
  const links = Object.entries(cp.links || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
  return links.length ? el("section", { class: "idea" }, el("h3", {}, "Files and links"), el("ul", { class: "plinks" }, links.map(k => el("li", {}, el("a", { href: k.url, target: "_blank", rel: "noopener", onclick: previewClick(k.url, k.label || k.url) }, k.label || k.url))))) : null;
}
// client and team messages on a project, as chat items
const cChatItems = (posts, canDelete) => [...posts].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-200).map(p => ({ id: p.id, by: p.by, name: p.by === me ? "You" : (p.name || "Someone"), photo: p.photo, role: p.team ? "team" : "client", text: p.text || "", at: p.at || 0, canDelete: canDelete(p) }));
// what the client has paid and what's next (the team's site keeps this summary up to date)
function payCard(cp) {
  const y = cp.pay; if (!y || !cvShow(cp).pay || !(y.total || y.items && y.items.length)) return null;
  const f = v => fmtCur(v, y.currency);
  return el("section", { class: "idea paycard" }, el("div", { class: "row" }, el("h3", {}, "Payments"), el("span", { class: "spacer" }), y.late ? el("span", { class: "mstat late" }, "Payment due") : el("span", { class: "mstat paid" }, y.paid >= y.total && y.total ? "Fully paid" : "Up to date")),
    el("div", { class: "adgrid" }, el("div", {}, el("b", {}, f(y.paid)), el("span", {}, "paid")), y.total ? el("div", {}, el("b", {}, f(Math.max(0, y.total - y.paid))), el("span", {}, y.monthly ? "due now" : "left to pay")) : null,
      y.next ? el("div", { class: y.late ? "late" : "" }, el("b", {}, f(y.next.amount)), el("span", {}, "next: " + y.next.label)) : null),
    (y.items || []).length ? el("div", { class: "schedule" }, y.items.map(i => el("div", { class: "sched " + i.status }, el("span", { class: "sched-l" }, i.label), el("span", {}, i.status === "paid" ? "\u2713 " + f(i.amount) : f(i.amount)), el("span", { class: "sched-s" }, { paid: "Paid", late: "Due", due: "Due", upcoming: "Next" }[i.status])))) : null);
}
function cFeed(posts, { canDelete } = {}) {
  const list = [...posts].sort((a, b) => (b.at || 0) - (a.at || 0));
  return el("div", { class: "pfeed" }, list.length ? list.slice(0, 100).map(p => el("article", { class: "post" + (p.team ? " team" : "") },
    postAv(p.photo), el("div", { class: "post-body" },
      el("div", { class: "post-meta" }, el("b", {}, p.by === me ? "You" : (p.name || "Someone")), p.team ? el("span", { class: "chip" }, "Ardent Creative Studios") : el("span", { class: "chip" }, "Client"), el("span", {}, ago(p.at))),
      el("div", { class: "post-text" }, p.text)),
    canDelete ? el("button", { class: "x", "aria-label": "Delete update", onclick: () => write(() => deleteDoc(doc(db, "cposts", p.id)), "Deleted") }, "✕") : null))
    : el("div", { class: "empty" }, "No updates yet."));
}

/* ---------- team side: subscriptions, alerts, and the Sharing tab on each project ---------- */
function clientTeamSubs() {
  const quiet = () => {};
  return [
    onSnapshot(collection(db, "cprojects"), s => { cProjects = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, quiet),
    onSnapshot(collection(db, "cposts"), s => {
      const before = new Set(cPosts.map(p => p.id)), first = !cPosts.length;
      cPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of cPosts) if (!before.has(p.id) && !p.team) toast(`${p.name || "A client"}: ${(p.text || "").slice(0, 60)}`);
      renderSoon();
    }, quiet),
    onSnapshot(collection(db, "ptasks"), s => { cTasks = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, quiet),
  ];
}
function clientAlerts(add) {
  for (const p of cPosts) if (!p.team) { const cp = cpOf(p.pid); add("cpost:" + p.id, p.at, null, `${p.name || "A client"} (${cp ? cp.title : "client"}): ${(p.text || "").slice(0, 80)}`, "project-" + p.pid) }
  for (const t of cTasks) if (t.done && t.doneAt) { const cp = cpOf(t.pid); add("ptask:" + t.id, t.doneAt, null, `${t.name || t.email} finished "${t.text}"${cp ? " on " + cp.title : ""}`, "project-" + t.pid) }
}

function saveCP(p, data, ok) {
  const cp = cpOf(p.id);
  const base = cp ? {} : { title: p.title, clients: [], partners: [], stage: 0, stages: CSTAGES, progress: 0, next: {}, links: {}, createdAt: Date.now(), createdBy: me };
  return write(() => setDoc(doc(db, "cprojects", p.id), { ...base, ...data, updatedAt: Date.now() }, { merge: true }), ok);
}

function renderShare(box, p) {
  const cp = cpOf(p.id);
  box.append(el("p", { class: "lede", style: "margin:0 0 12px" }, "The client's own page for this project. They never see your tasks, chat, money or other projects: only what you switch on here."));
  if (!cp) {
    box.append(el("div", { class: "empty" }, el("h3", {}, "No client view yet"),
      el("p", { style: "margin:6px auto 14px;max-width:46ch" }, "Turn it on to give the client a page with this project's progress, and to give partners tasks on it."),
      el("button", { class: "btn primary", onclick: () => saveCP(p, {}, "Client view is on") }, "Turn on client view")));
    return;
  }
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Sharing", style: "margin:0 0 12px" },
    [["status", "Client page"], ["updates", "Messages"], ["people", "Partners"], ["tasks", "Partner tasks"]].map(([k, v]) =>
      el("button", { "aria-pressed": String(shareTab === k), onclick: () => { shareTab = k; render() } }, v + (k === "updates" ? countNew(p.id) : "")))));

  if (shareTab === "status") {
    const sh = cvShow(cp), live = { ...cp, ...clientLive(p, cp) }, open = cvOpen[p.id] || "";
    const setShow = (k, v) => saveCP(p, { show: { ...sh, [k]: v }, ...(k === "pay" ? { showPay: v } : {}) }, v ? "The client sees it now" : "Hidden from the client");
    const toggle = k => { cvOpen[p.id] = open === k ? "" : k; render() };
    const clients = cp.clients || [], who = clients.map(e => cap1(e.split("@")[0].split(/[._-]/)[0])).join(", ");
    const ctl = el("div", { class: "cvctl" });

    /* 1. three steps to get the page to the client */
    const reviewed = !!cp.reviewedAt, sent = !!cp.linkSentAt, steps = [!!clients.length, reviewed, sent], doneN = steps.filter(Boolean).length;
    const addIn = el("input", { class: "noteinput", id: "cv-add-" + p.id, type: "email", placeholder: "The client's Google email", autocomplete: "off" });
    const addClient = () => { const e = lower(addIn.value); if (!emailOk(e)) { toast("Type their full Google email"); addIn.focus(); return }
      if (ADMINS.includes(e) || teamEmails().includes(e)) { toast("That's a team member. They already see everything"); return }
      if (clients.map(lower).includes(e)) { toast("Already added"); return }
      addIn.value = ""; saveCP(p, { clients: [...clients.map(lower), e] }, "Client added. Now check what they see") };
    addIn.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); addClient() } });
    const msg = `Hi${who ? " " + who.split(",")[0] : ""}! You can follow your project with Ardent Creative Studios here: ${SITE_LINK} (sign in with ${clients[0] || "your Google email"}).`;
    const markSent = () => saveCP(p, { linkSentAt: Date.now() }, null);
    const step = (n, ok, title, sub, ...body) => el("div", { class: "cvstep" + (ok ? " ok" : "") }, el("span", { class: "pstep-n" }, ok ? "✓" : String(n)), el("div", { style: "display:grid;gap:6px;min-width:0;flex:1" }, el("b", {}, title), sub ? el("span", { class: "label" }, sub) : null, ...body));
    const setup = el("section", { class: "compose cvsetup" }, el("div", { class: "row" }, el("h3", {}, doneN === 3 ? "The client page is live" : "Get the page to the client"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${doneN} of 3`)),
      step(1, steps[0], "Who can see it", clients.length ? null : "The Google email your client signs in with. Add more if several people at the client follow it.",
        clients.length ? el("div", { class: "pickrow" }, clients.map(e => el("span", { class: "linkwrap" }, el("span", { class: "linkchip" }, e), el("button", { class: "linkdel", "aria-label": "Remove " + e, onclick: () => saveCP(p, { clients: clients.filter(x => x !== e) }, "Removed. They can't see the page anymore") }, "✕")))) : null,
        el("div", { class: "row", style: "gap:6px;flex-wrap:nowrap" }, addIn, el("button", { class: "btn small" + (clients.length ? "" : " primary"), onclick: addClient }, "Add"))),
      step(2, steps[1], "Check what they see", reviewed ? "Done. Change anything below whenever you want." : "Look at the preview, switch off anything they shouldn't see, then tap Looks good.",
        reviewed ? null : el("div", { class: "row" }, el("button", { class: "btn small" + (steps[0] ? " primary" : ""), onclick: () => saveCP(p, { reviewedAt: Date.now() }, "Great. Now send them the link") }, "Looks good"))),
      step(3, steps[2], "Send them the link", sent ? `Sent ${ago(cp.linkSentAt)}. Send it again any time.` : "They open it and sign in with the email above.",
        el("div", { class: "row", style: "gap:6px" },
          el("a", { class: "btn small" + (steps[0] && steps[1] && !sent ? " primary" : ""), href: "https://wa.me/?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener noreferrer", onclick: markSent }, "Send on WhatsApp"),
          el("button", { class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(msg); toast("Message copied with the link") } catch { toast(SITE_LINK, 5000) } markSent() } }, "Copy the message"))));
    ctl.append(doneN === 3 ? el("details", { class: "fold" }, el("summary", {}, el("b", {}, "✓ The client page is live"), el("span", { class: "label" }, clients.join(", "))), setup) : setup);

    /* 2. what they see: one line each, open a line to change it */
    const card = el("section", { class: "compose cvparts" }, el("h3", {}, "What they see"), el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "It updates by itself from the project. Switch a part off, or open it to change it."));
    const line = (k, title, state, opts = {}) => {
      const on = opts.sw ? sh[opts.sw] : true, isOpen = open === k;
      const r = el("div", { class: "cvline" + (on ? "" : " off") + (isOpen ? " open" : "") },
        el("button", { class: "cvline-main", onclick: () => opts.body ? toggle(k) : null, "aria-expanded": opts.body ? String(isOpen) : null }, el("b", {}, title), el("span", { class: "label" + (opts.warn ? " warn" : "") }, on ? state : "Hidden from the client")),
        opts.body && on ? el("button", { class: "linkbtn", onclick: () => toggle(k) }, isOpen ? "Done" : "Change") : null,
        opts.sw ? el("button", { class: "switch", role: "switch", "aria-checked": String(on), "aria-label": title, disabled: !!opts.lock, title: opts.lock || "", onclick: () => setShow(opts.sw, !on) }, el("span", {})) : el("span", { class: "label" }, opts.fixed || ""));
      card.append(r); if (isOpen && on && opts.body) card.append(el("div", { class: "cvbody" }, ...[].concat(opts.body())));
    };
    // parts of the work
    const allPh = getPhases(p), shownPh = cvPhases(p, cp), shownIds = shownPh.map(x => x.id);
    if (allPh.length) line("phases", "Parts of the work they see", shownPh.length === allPh.length ? "All: " + allPh.map(x => x.name).join(", ") : shownPh.map(x => x.name).join(", ") + ` (${allPh.length - shownPh.length} hidden)`, { fixed: "", body: () => [
      el("span", { class: "label" }, "Only these count for their stages, progress bar and work list."),
      el("div", { class: "pickrow" }, allPh.map(ph => { const on = shownIds.includes(ph.id); return el("button", { type: "button", class: "pickchip", "aria-pressed": String(on), onclick: () => {
        const next = on ? shownIds.filter(x => x !== ph.id) : [...shownIds, ph.id]; if (!next.length) { toast("Keep at least one"); return }
        saveCP(p, { showPhases: allPh.filter(x => next.includes(x.id)).map(x => x.id) }, on ? `${ph.name} is hidden from the client` : `They see ${ph.name}`) } }, (on ? "✓ " : "") + ph.name) }))] });
    // progress
    const auto = cp.progressMode !== "manual";
    line("progress", "Progress bar", auto ? `${live.progress}% · follows the tasks (can go back when a new phase starts)` : `${cp.progress || 0}% · set by hand`, { sw: "progress", body: () => {
      const rng = el("input", { type: "range", min: "0", max: "100", step: "5", value: String(cp.progress || 0), "aria-label": "Progress", style: "flex:1" });
      rng.onchange = () => saveCP(p, { progress: +rng.value }, "Progress saved");
      return [el("div", { class: "seg seg-sm" }, el("button", { "aria-pressed": String(auto), onclick: () => saveCP(p, { progressMode: "auto" }, "It follows the tasks now") }, "Follow the tasks"), el("button", { "aria-pressed": String(!auto), onclick: () => saveCP(p, { progressMode: "manual", progress: live.progress }, "You set it now") }, "Set it by hand")),
        !auto ? el("div", { class: "row", style: "gap:8px" }, rng, el("b", {}, (cp.progress || 0) + "%")) : el("span", { class: "label" }, "Under the bar the client reads that it follows our phases and can go back when the next one starts.")] } });
    // stages
    const fromPlan = cp.stageMode !== "simple" && shownPh.length > 0, st = stagesOf(live);
    line("stages", "Stages", (fromPlan ? "Our phases: " : "Simple: ") + `now ${st[live.stage || 0] || st[0]}`, { sw: "stages", body: () => [
      el("div", { class: "seg seg-sm" }, el("button", { "aria-pressed": String(fromPlan), disabled: !shownPh.length, onclick: () => saveCP(p, { stageMode: "plan" }, "Stages follow your phases") }, "Our phases"), el("button", { "aria-pressed": String(!fromPlan), onclick: () => saveCP(p, { stageMode: "simple", stages: CSTAGES }, "Simple stages") }, "Simple")),
      fromPlan ? el("span", { class: "label" }, `${st.join(" → ")}. The stage moves on by itself when a phase's tasks are all done.`)
        : el("div", { class: "pickrow" }, CSTAGES.map((s2, i2) => el("button", { class: "pickchip", "aria-pressed": String((cp.stage || 0) === i2), onclick: () => saveCP(p, { stage: i2 }, "Stage: " + s2) }, s2)))] });
    // next step: suggest our next open task; warn when its date has passed
    const nx = cp.next || {}, past = nx.date && nx.date < todayStr();
    const nextTask = tasksOf(p).filter(t => !t.done && shownIds.includes(t.phase)).sort((a, b) => shownIds.indexOf(a.phase) - shownIds.indexOf(b.phase) || (a.order || 0) - (b.order || 0))[0];
    line("next", "Next step", nx.text ? (past ? `⚠ “${nx.text}” was due ${fmtDay(new Date(nx.date + "T12:00").getTime())}: update it` : `“${nx.text}”` + (nx.date ? " · " + fmtDay(new Date(nx.date + "T12:00").getTime()) : "")) : "Not written yet", { sw: "next", warn: past || !nx.text, body: () => {
      const nt = el("input", { class: "noteinput", id: "cpn-" + p.id, maxlength: "120", placeholder: "e.g. We send you the first profile draft" }), nd = el("input", { class: "mini", id: "cpd-" + p.id, type: "date" });
      if (!nt.value && nx.text) nt.value = nx.text; if (!nd.value && nx.date) nd.value = nx.date;
      return [el("div", { class: "row", style: "gap:6px;flex-wrap:nowrap" }, nt, nd, el("button", { class: "btn small primary", onclick: () => { cvOpen[p.id] = ""; saveCP(p, { next: { text: nt.value.trim(), date: nd.value || "" } }, nt.value.trim() ? "Next step saved" : "Next step cleared") } }, "Save")),
        nextTask ? el("button", { class: "linkbtn", style: "justify-self:start", onclick: () => { cvOpen[p.id] = ""; saveCP(p, { next: { text: nextTask.text, date: nextTask.due || "" } }, "Next step set from your plan") } }, `Use our next task: “${nextTask.text}”` + (nextTask.due ? " · " + fmtDay(new Date(nextTask.due + "T12:00").getTime()) : "")) : null] } });
    // the rest
    line("work", "The work, part by part", `${(live.work || []).length} part${(live.work || []).length === 1 ? "" : "s"} with how much of each is done`, { sw: "work" });
    line("pay", "Payments", p.money ? (live.pay ? `${fmtCur(live.pay.paid, live.pay.currency)} paid` + (live.pay.next ? ` · next: ${live.pay.next.label}` : "") : "Nothing to show yet") : "No deal yet: set up the money first", { sw: "pay", lock: p.money ? "" : "Set up the money on the Money tab first" });
    const links = Object.entries(cp.links || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
    line("links", "Files and links", links.length ? `${links.length} shared` : "Nothing shared yet", { sw: "links", body: () => {
      const lab = el("input", { class: "noteinput", id: "cpl-" + p.id, maxlength: "60", placeholder: "Name, e.g. Profile draft v1" }), url = el("input", { class: "noteinput", id: "cpu-" + p.id, type: "url", maxlength: "500", placeholder: "https://…" });
      return [links.length ? el("ul", { class: "plinks" }, links.map(k => el("li", {}, el("a", { href: k.url, target: "_blank", rel: "noopener" }, k.label || k.url), el("button", { class: "x", "aria-label": "Remove " + (k.label || "link"), onclick: () => saveCP(p, { links: { [k.id]: DEL() } }, "Removed") }, "✕")))) : null,
        el("div", { class: "row", style: "gap:6px;flex-wrap:nowrap" }, lab, url, el("button", { class: "btn small", onclick: () => { let u = url.value.trim(), t = lab.value.trim(); if (!u) { url.focus(); return } if (!/^https?:\/\//i.test(u)) u = "https://" + u; lab.value = ""; url.value = ""; saveCP(p, { links: { [uid()]: { label: t, url: u, at: Date.now() } } }, "Shared with the client") } }, "Share"))] } });
    const unread = countNew(p.id);
    line("msgs", "Messages", unread ? `Always on ·${unread} new from the client` : "Always on", { fixed: "" });
    card.append(el("div", { class: "row", style: "gap:8px;margin-top:8px" }, el("button", { class: "btn small", onclick: () => { shareTab = "updates"; render() } }, "Open messages"), el("span", { class: "spacer" }), el("button", { class: "btn small quiet", onclick: () => clientReport(p, live) }, "This month's report (PDF)")));
    ctl.append(card);

    /* 3. the preview: exactly the client's page */
    const pv = el("div", { class: "cvpreview" }, el("div", { class: "cvbar" }, el("span", { class: "cvdots" }, el("i"), el("i"), el("i")), el("span", {}, clients.length ? `What ${who} sees, live` : "What the client will see, live")),
      el("div", { class: "cvpage" }, ...clientPage(live, { first: who.split(",")[0], preview: true, posts: cPosts.filter(x => x.pid === p.id) })));
    box.append(el("div", { class: "cvsplit" }, ctl, pv));
  }

  if (shareTab === "people") {
    const addRow = (kind, placeholder) => {
      const inp = el("input", { class: "noteinput", id: `cp-${kind}-${p.id}`, type: "email", placeholder, autocomplete: "off" });
      const go = () => { const e = lower(inp.value); if (!emailOk(e)) { toast("Type their full Google email"); inp.focus(); return }
        if (ADMINS.includes(e) || teamEmails().includes(e)) { toast("That's a team member. They already see everything"); return }
        const list = (cp[kind] || []).map(lower); if (list.includes(e)) { toast("Already added"); return }
        inp.value = ""; saveCP(p, { [kind]: [...list, e] }, kind === "clients" ? "Client added. Send them the link" : "Partner added to this project") };
      inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); go() } });
      return el("div", { class: "addstep" }, inp, el("button", { class: "btn primary", onclick: go }, "Add"));
    };
    const people = (kind) => (cp[kind] || []).map(e => {
      const pm = kind === "partners" ? pMembers.find(m => m.id === e) : null;
      return el("li", { class: "row" }, el("span", {}, pm && pm.name ? `${pm.name} · ${e}` : e), el("span", { class: "spacer" }),
        el("button", { class: "btn quiet small", onclick: () => saveCP(p, { [kind]: (cp[kind] || []).filter(x => x !== e) }, "Removed") }, "Remove"));
    });
    box.append(el("p", { class: "label", style: "margin:0 0 8px;text-transform:none;letter-spacing:0" }, "The client is added on the Client page tab."));
    const known = pMembers.filter(m => !(cp.partners || []).includes(m.id));
    box.append(el("section", { class: "compose", style: "margin-top:12px" }, el("h3", {}, "Partners on this project"),
      el("p", { class: "label", style: "margin:0" }, "They see this project in their Projects tab, with the tasks you give them."),
      (cp.partners || []).length ? el("ul", { class: "plist" }, people("partners")) : null,
      known.length ? el("div", { class: "row", style: "flex-wrap:wrap;gap:6px" }, el("span", { class: "label" }, "Quick add:"), known.slice(0, 12).map(m =>
        el("button", { class: "btn small", onclick: () => saveCP(p, { partners: [...(cp.partners || []), m.id] }, `${m.name || m.id} added`) }, `${m.name || m.id} (${groupName(m.gid)})`))) : null,
      addRow("partners", "partner@gmail.com")));
    box.append(el("div", { class: "idea", style: "margin-top:12px" }, el("div", { class: "label" }, "Send them this link. They sign in with the Google email you added:"),
      el("div", { class: "row" }, el("code", { class: "plink" }, SITE_LINK), el("span", { class: "spacer" }),
        el("button", { class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(SITE_LINK); toast("Link copied") } catch { toast(SITE_LINK, 5000) } } }, "Copy link"))));
  }

  if (shareTab === "updates") {
    try { localStorage.setItem(`cseen:${me}:${p.id}`, String(Date.now())) } catch { }
    box.append(el("div", { class: "chat-who" }, el("span", { class: "teamdot big" }, "C"), el("span", { class: "who-n" }, el("b", {}, (cp.clients || []).length ? "Chat with the client" : "Chat with the client (no client added yet)"), el("span", { class: "label" }, "The client and this project's partners see these messages"))),
      chatView(cChatItems(cPosts.filter(x => x.pid === p.id), () => true), { onDelete: m => write(() => deleteDoc(doc(db, "cposts", m.id)), "Deleted"), empty: "No messages yet. Tell the client what's new: what you finished, what's next, anything you need from them." }),
      chatComposer("cpmsg-" + p.id, "Message the client", t => write(() => setDoc(doc(db, "cposts", uid()), { pid: p.id, by: me, name: teamName(), photo: photoOf(me) === AV ? "" : photoOf(me), team: true, text: t, at: Date.now() }).then(() => saveCP(p, {})))));
  }

  if (shareTab === "tasks") {
    const parts = cp.partners || [];
    if (!parts.length) { box.append(el("div", { class: "empty" }, "Add partners on the People tab first.")); return }
    for (const e of parts) {
      const pm = pMembers.find(m => m.id === e), nm = (pm && pm.name) || e;
      const list = cTasks.filter(t => t.pid === p.id && t.email === e).sort((a, b) => (a.at || 0) - (b.at || 0));
      const ti = el("input", { class: "noteinput", id: `pt-${p.id}-${e}`, maxlength: "140", placeholder: "Task for " + nm.split(" ")[0] });
      const di = el("input", { class: "noteinput", type: "date", style: "max-width:160px", "aria-label": "Due date" });
      const add = () => { const t = ti.value.trim(); if (!t) return; ti.value = "";
        write(() => setDoc(doc(db, "ptasks", uid()), { pid: p.id, email: e, name: nm, text: t, due: di.value || "", done: false, at: Date.now(), by: me }), "Task given to " + nm.split(" ")[0]) };
      ti.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); add() } });
      box.append(el("section", { class: "idea", style: "margin-bottom:12px" }, el("div", { class: "row" }, el("h3", {}, nm), el("span", { class: "spacer" }), el("span", { class: "label" }, `${list.filter(t => t.done).length}/${list.length}`)),
        list.length ? el("ul", { class: "steps" }, list.map(t => el("li", { class: t.done ? "done" : "" },
          el("input", { type: "checkbox", id: "ptk-" + t.id, checked: !!t.done, onchange: ev => write(() => updateDoc(doc(db, "ptasks", t.id), { done: ev.target.checked, doneAt: ev.target.checked ? Date.now() : null })) }),
          el("label", { for: "ptk-" + t.id }, t.text, t.due ? el("span", { class: "label", style: "margin-left:8px" }, "due " + fmtDay(new Date(t.due + "T12:00").getTime())) : null),
          el("button", { class: "x", "aria-label": "Delete task", onclick: () => write(() => deleteDoc(doc(db, "ptasks", t.id)), "Task deleted") }, "✕")))) : el("p", {}, "No tasks yet."),
        el("div", { class: "addstep" }, ti, di, el("button", { class: "btn", onclick: add }, "Add"))));
    }
  }
}
function countNew(pid) {
  let seen = 0; try { seen = Number(localStorage.getItem(`cseen:${me}:${pid}`) || 0) } catch { }
  const n = cPosts.filter(x => x.pid === pid && !x.team && (x.at || 0) > seen).length; return n ? ` (${n})` : "";
}

/* ---------- client side: their own small site ---------- */
async function clientCheck(email) {
  try { await fbReady; const s = await getDocs(query(collection(db, "cprojects"), where("clients", "array-contains", email))); return s.docs.map(d => ({ id: d.id, ...d.data() })) }
  catch { return [] }
}
function clientStop() { cUnsubs.forEach(f => f()); cUnsubs = []; myCP = []; myCPosts = {}; clientMode = false; const c = $("#client"); if (c) c.hidden = true }
function startClient(u, list) {
  clientMode = true; isAdmin = false; clientEmail = lower(u.email); myCP = list; cSel = list[0] && list[0].id;
  myProfile = { name: u.displayName || u.email, email: u.email, photo: u.photoURL || "" };
  $("#boot").hidden = true; $("#gate").hidden = true; $("#app").hidden = true; $("#client").hidden = false;
  cUnsubs.push(onSnapshot(query(collection(db, "cprojects"), where("clients", "array-contains", clientEmail)), s => {
    myCP = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!myCP.length) { clientStop(); signOut(auth); $("#gate-msg").textContent = `${u.email} doesn't have a project to follow anymore. Message Ardent Creative Studios if that's a mistake.`; return }
    for (const cp of myCP) if (!myCPosts[cp.id]) { myCPosts[cp.id] = []; cUnsubs.push(onSnapshot(query(collection(db, "cposts"), where("pid", "==", cp.id)), s2 => { myCPosts[cp.id] = s2.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, () => {})) }
    if (!myCP.find(c => c.id === cSel)) cSel = myCP[0].id;
    renderSoon();
  }, () => toast("Can't reach your project. Check your connection.", 5000)));
  render();
}
// The client's page. The team's Client tab shows the same thing as a preview (no typing, no sign out).
function clientPage(cp, { first, preview, posts } = {}) {
  const out = [el("h1", { class: "c-hello" }, first ? `Hi ${first}` : "Hi"), el("p", { class: "lede", style: "margin-top:4px" }, "Here's where your project with Ardent Creative Studios stands. This page updates on its own."), statusCard(cp, { big: true })];
  for (const c of [workCard(cp), payCard(cp), linksList(cp)]) if (c) out.push(el("div", { style: "margin-top:12px" }, c));
  out.push(el("h2", { class: "sec-h" }, "Messages"),
    el("div", { class: "chat-who" }, el("span", { class: "teamdot big" }, "A"), el("span", { class: "who-n" }, el("b", {}, "Ardent Creative Studios team"), el("span", { class: "label" }, "Questions, feedback, files you need: we reply here"))),
    // in the team's preview, show the chat the way the client sees it: the team's messages come from the other side
    chatView(cChatItems((posts || []).map(x => preview ? { ...x, by: x.team ? "__ardent" : "__client" } : x), () => false), { empty: "No messages yet. Say hello, or ask us anything about your project." }));
  if (preview) out.push(el("div", { class: "cvfake" }, "Message the Ardent Creative Studios team"));
  return out;
}
function renderClient() {
  const box = $("#cv"); const vals = {}; box.querySelectorAll("textarea[id]").forEach(n => vals[n.id] = n.value); box.replaceChildren();
  const first = (myProfile && myProfile.name || "").split(" ")[0];
  const cp = myCP.find(c => c.id === cSel);
  if (myCP.length > 1) box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Your projects", style: "margin:12px 0" }, myCP.map(c => el("button", { "aria-pressed": String(c.id === cSel), onclick: () => { cSel = c.id; render() } }, c.title))));
  if (!cp) { box.append(el("h1", { class: "c-hello" }, first ? `Hi ${first}` : "Hi"), el("div", { class: "empty" }, "Loading your project…")); return }
  box.append(...clientPage(cp, { first, posts: myCPosts[cp.id] || [] }),
    chatComposer("c-msg", "Message the Ardent Creative Studios team", t => write(() => setDoc(doc(db, "cposts", uid()), { pid: cp.id, by: me, name: myProfile.name, photo: myProfile.photo || "", team: false, text: t, at: Date.now() }))),
    el("div", { class: "row", style: "margin-top:22px" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Signed in as " + (myProfile.email || "")), el("span", { class: "spacer" }),
      el("button", { class: "btn quiet small", onclick: () => doSignOut() }, "Sign out")));
  for (const [id, v] of Object.entries(vals)) { const n = document.getElementById(id); if (n && v) n.value = v }
}

/* ---------- partner side: the Projects tab ---------- */
let pProjects = [], pProjPosts = {}, pProjUnsubs = [];
function partnerProjectSubs(email) {
  pProjUnsubs.forEach(f => f()); pProjUnsubs = []; pProjects = []; myPTasks = []; pProjPosts = {};
  pProjUnsubs.push(onSnapshot(query(collection(db, "cprojects"), where("partners", "array-contains", email)), s => {
    pProjects = s.docs.map(d => ({ id: d.id, ...d.data() }));
    for (const cp of pProjects) if (!pProjPosts[cp.id]) { pProjPosts[cp.id] = []; pProjUnsubs.push(onSnapshot(query(collection(db, "cposts"), where("pid", "==", cp.id)), s2 => { pProjPosts[cp.id] = s2.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, () => {})) }
    renderSoon();
  }, () => {}));
  pProjUnsubs.push(onSnapshot(query(collection(db, "ptasks"), where("email", "==", email)), s => { myPTasks = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, () => {}));
}
function partnerProjectsStop() { pProjUnsubs.forEach(f => f()); pProjUnsubs = []; pProjects = []; myPTasks = [] }
function renderPartnerProjects(box) {
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Your projects"),
    el("p", { class: "lede", style: "margin-top:-4px" }, "Projects you're working on with Ardent Creative Studios, and the tasks the team gave you. Tick them off as you finish."));
  if (!pProjects.length) { box.append(el("div", { class: "empty" }, "You're not on a project yet. When the team adds you to one, it shows up here.")); return }
  for (const cp of pProjects) {
    const list = myPTasks.filter(t => t.pid === cp.id).sort((a, b) => (a.done - b.done) || (a.at || 0) - (b.at || 0));
    const team = (pProjPosts[cp.id] || []).filter(x => x.team).sort((a, b) => b.at - a.at)[0];
    box.append(el("div", { style: "display:grid;gap:10px;margin-bottom:20px" }, statusCard(cp),
      el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "Your tasks"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${list.filter(t => t.done).length}/${list.length}`)),
        list.length ? el("ul", { class: "steps" }, list.map(t => el("li", { class: t.done ? "done" : "" },
          el("input", { type: "checkbox", id: "mt-" + t.id, checked: !!t.done, onchange: ev => write(() => updateDoc(doc(db, "ptasks", t.id), { done: ev.target.checked, doneAt: ev.target.checked ? Date.now() : null }), ev.target.checked ? "Nice, done" : null) }),
          el("label", { for: "mt-" + t.id }, t.text, t.due ? el("span", { class: "label", style: "margin-left:8px" }, "due " + fmtDay(new Date(t.due + "T12:00").getTime())) : null)))) : el("p", {}, "No tasks for you yet."),
        team ? el("div", { class: "note" }, el("span", { class: "note-body" }, team.text), el("span", { class: "note-meta" }, (team.name || "Ardent Creative Studios") + " · " + ago(team.at))) : null)));
  }
}

/* ---------- Settings › People and access: one place to add and remove team members, partners and clients ---------- */
let accessRole = "team", accessGid = "", accessPid = "", accessDel = null, creatorStep = null;
const ROLE_NAME = { team: "Team member", creator: "Creator", partner: "Partner", client: "Client" };
function roleOf(e) {
  if (ADMINS.includes(e) || teamEmails().includes(e)) return "team";
  if (pMembers.some(m => m.id === e)) return "partner";
  if (cProjects.some(c => (c.clients || []).includes(e))) return "client";
  return null;
}
function accessSection() {
  const projects = ideas.filter(i => i.status === "approved" || i.status === "completed").sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  if (!accessGid || !pGroups.find(g => g.id === accessGid)) accessGid = (pGroups[0] || {}).id || "";
  if (!accessPid || !projects.find(p => p.id === accessPid)) accessPid = (projects[0] || {}).id || "";
  const em = el("input", { id: "acc-email", class: "noteinput", type: "email", inputmode: "email", placeholder: "Their Google email", maxlength: "120", autocomplete: "off" });
  const nm = el("input", { id: "acc-name", class: "noteinput", maxlength: "60", placeholder: "Their name (optional)" });
  const gh = el("input", { id: "acc-gh", class: "noteinput", maxlength: "60", placeholder: "Their GitHub username (optional, you can add it later)", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const add = () => {
    const e = lower(em.value), n = nm.value.trim();
    if (!emailOk(e)) { toast("That doesn't look like an email address"); em.focus(); return }
    const has = roleOf(e);
    if (accessRole === "creator") {
      // a creator is a team member who can also change the site itself
      if (has && has !== "team") { toast(`${e} is a ${ROLE_NAME[has].toLowerCase()}. Remove them there first`); return }
      if (ADMINS.includes(e)) { toast("That's you. You can already change everything"); return }
      if (creatorsMap()[e]) { toast("Already a creator"); return }
      const g = gh.value; em.value = ""; gh.value = "";
      if (has !== "team") saveTeam([...teamEmails(), e]);
      creatorStep = e;
      saveCreator(e, true, g, `${e} is a creator${has === "team" ? "" : " and on the team"}`);
      return;
    }
    if (has === "team" || (has && has !== accessRole)) { toast(`${e} is already a ${ROLE_NAME[has].toLowerCase()}. Remove them there first`); return }
    if (accessRole === "team") { em.value = ""; nm.value = ""; saveTeam([...teamEmails(), e], `${e} is on the team and can sign in`); return }
    if (accessRole === "partner") {
      if (!accessGid) { toast("Make a partner group first in the Partners tab"); return }
      em.value = ""; nm.value = "";
      write(() => setDoc(doc(db, "pmembers", e), { email: e, name: n || e.split("@")[0], gid: accessGid, active: true, addedBy: me, addedAt: Date.now() }, { merge: true }), `${n || e} is a partner in ${groupName(accessGid)}`);
      return;
    }
    const p = projects.find(x => x.id === accessPid); if (!p) { toast("Pick the client's project"); return }
    const cp = cpOf(p.id); if (cp && (cp.clients || []).includes(e)) { toast("Already a client on this project"); return }
    em.value = ""; nm.value = "";
    saveCP(p, { clients: [...((cp && cp.clients) || []), e] }, `${e} can now follow ${p.title}`);
  };
  em.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); add() } });
  const pick = accessRole === "partner"
    ? (pGroups.length ? el("select", { class: "mini", "aria-label": "Partner group", onchange: ev => { accessGid = ev.target.value } }, [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(g => el("option", { value: g.id, selected: g.id === accessGid }, "Group: " + g.name)))
      : el("span", { class: "label" }, "No partner groups yet. Make one in the Partners tab."))
    : accessRole === "creator" ? gh
    : accessRole === "client"
      ? (projects.length ? el("select", { class: "mini", "aria-label": "Client's project", onchange: ev => { accessPid = ev.target.value } }, projects.map(p => el("option", { value: p.id, selected: p.id === accessPid }, "Project: " + p.title)))
        : el("span", { class: "label" }, "No projects yet."))
      : null;
  const what = { team: "Sees everything: ideas, projects, chat, money and partners.", creator: "A team member who can also change Pitch Room itself: features, fixes and design. They get its code on GitHub. Money, the team list and database rules stay yours.", partner: "Sees only their group's numbers, updates and info, plus projects you add them to.", client: "Sees only their project's progress, next step, files and updates." }[accessRole];
  const sec = el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "People and access"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Only you see this")),
    el("p", { style: "margin:0;font-size:14px" }, "Everyone signs in on the same link with Google, using exactly the email you add here. What they see depends on who they are."),
    el("div", { class: "seg seg-wide", role: "group", "aria-label": "Add as" }, ["team", "creator", "partner", "client"].map(r => el("button", { "aria-pressed": String(accessRole === r), onclick: () => { accessRole = r; render() } }, ROLE_NAME[r]))),
    el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, what),
    em, accessRole === "partner" ? nm : null, pick,
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: add }, "Add " + ROLE_NAME[accessRole].toLowerCase())));
  // after making someone a creator: give their GitHub account access to the code
  if (creatorStep && creatorsMap()[creatorStep]) {
    const c = creatorsMap()[creatorStep], who = creatorStep;
    const ghIn = el("input", { class: "noteinput", maxlength: "60", placeholder: "Their GitHub username", value: c.github || "", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    sec.append(el("div", { class: "note", style: "display:grid;gap:8px" },
      el("b", {}, `Last step: give ${who} the code`),
      el("span", { style: "font-size:14px" }, "Pitch Room's code is on GitHub. Invite their GitHub account as a collaborator (Add people, then type their username). They accept the email invite, and their Build Pitch Room page shows them how to make changes."),
      el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, ghIn, el("button", { class: "btn small", onclick: () => saveCreator(who, true, ghIn.value, "GitHub username saved") }, "Save")),
      el("span", { class: "row", style: "gap:6px" },
        el("a", { class: "btn small primary", href: REPO_URL + "/settings/access", target: "_blank", rel: "noopener noreferrer" }, "Open GitHub › Collaborators"),
        (c.github || "") ? el("button", { class: "btn small quiet", onclick: () => copyText(c.github, "Username copied") }, "Copy @" + c.github) : null,
        el("span", { class: "spacer" }), el("button", { class: "btn small quiet", onclick: () => { creatorStep = null; render() } }, "Done"))));
  }
  if (!teamLoaded) sec.append(el("p", { class: "label" }, "Loading…"));

  const joined = new Set(Object.values(people).map(p => (p.email || "").toLowerCase()).filter(Boolean));
  const row = (key, label, badge, onRemove, locked) => el("div", { class: "teamrow" }, el("span", { class: "teammail" }, label), badge,
    locked ? null : accessDel === key
      ? el("button", { class: "linkdel sure", onclick: () => { accessDel = null; onRemove() } }, "Remove?")
      : el("button", { class: "linkdel", "aria-label": "Remove " + label, onclick: () => { accessDel = key; render() } }, "✕"));
  const group = (title, n, rows) => el("div", { style: "display:grid;gap:2px;margin-top:10px" }, el("div", { class: "label" }, `${title} (${n})`), rows.length ? rows : el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Nobody yet."));

  const team = teamEmails();
  // each team member: joined or not, and a creator switch (creators can change the site itself)
  const crBtn = e => ADMINS.includes(e) ? null : creatorsMap()[e]
    ? (accessDel === "cr:" + e
      ? el("button", { class: "linkdel sure", onclick: () => { accessDel = null; if (creatorStep === e) creatorStep = null; saveCreator(e, false, "", `${e} isn't a creator anymore. Remove them on GitHub too`) } }, "Not a creator?")
      : el("button", { class: "chip", style: "cursor:pointer;border:0;font:inherit;font-size:12.5px", title: "Creator: can change Pitch Room itself. Tap to change", onclick: () => { accessDel = "cr:" + e; render() } }, "\u{1F6E0}️ Creator"))
    : el("button", { class: "linkbtn", style: "font-size:12.5px", onclick: () => { creatorStep = e; saveCreator(e, true, "", `${e} is a creator`) } }, "Make creator");
  sec.append(group("Team", team.length, team.map(e => row("t:" + e, e, el("span", { class: "row", style: "gap:8px;flex:none" }, el("span", { class: joined.has(e) ? "done-badge" : "label" }, ADMINS.includes(e) ? "Admin" : joined.has(e) ? "Joined" : "Hasn't signed in yet"), crBtn(e)),
    () => { saveTeam(team.filter(x => x !== e), `${e} isn't on the team anymore`); if (creatorsMap()[e]) saveCreator(e, false) }, ADMINS.includes(e)))));
  const parts = [...pMembers].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  sec.append(group("Partners", parts.length, parts.map(m => row("p:" + m.id, (m.name ? m.name + " · " : "") + m.id, el("span", { class: "label" }, groupName(m.gid) + (m.uid ? "" : " · not signed in yet")),
    () => write(async () => {
      await deleteDoc(doc(db, "pmembers", m.id));
      for (const c of cProjects.filter(c => (c.partners || []).includes(m.id))) await setDoc(doc(db, "cprojects", c.id), { partners: c.partners.filter(x => x !== m.id) }, { merge: true });
    }, `${m.name || m.id} isn't a partner anymore`)))));
  const clients = {}; for (const c of cProjects) for (const e of c.clients || []) (clients[e] = clients[e] || []).push(c);
  const ce = Object.keys(clients).sort();
  sec.append(group("Clients", ce.length, ce.map(e => row("c:" + e, e, el("span", { class: "label" }, clients[e].map(c => c.title).join(", ")),
    () => write(async () => { for (const c of clients[e]) await setDoc(doc(db, "cprojects", c.id), { clients: (c.clients || []).filter(x => x !== e) }, { merge: true }) }, `${e} can't see their project anymore`)))));
  return sec;
}

/* ---------- payments the client sees: a summary kept on their project page ---------- */
function payOf(p) {
  if (!p.money || p.money.stage === "proposal") return null;
  const r = moneyOf(p), m = p.money, nowM = thisMonth();
  const items = r.schedule.filter(x => x.label !== "Total").slice(-8).map(x => ({ label: x.label.match(/^\d{4}-\d{2}$/) ? monthLabel(x.label) : x.label, amount: x.expected, status: x.status }));
  const open = r.schedule.find(x => x.status !== "paid" && x.label !== "Total");
  const total = m.type === "monthly" ? r.schedule.filter(x => x.status === "late" || x.status === "due" || x.status === "paid").reduce((a, x) => a + x.expected, 0) : r.expected;
  return { currency: r.currency, total, paid: r.received, monthly: m.type === "monthly", late: r.late.length > 0,
    next: open ? { label: open.label.match(/^\d{4}-\d{2}$/) ? monthLabel(open.label) : open.label, amount: open.expected - open.received } : (m.type === "one" && r.expected > r.received ? { label: "balance", amount: r.expected - r.received } : null), items };
}
// What the client page shows that comes from the project itself: its name, progress, stages, the work list and payments.
// The task phases the client sees: all of them, unless the team picked some (cp.showPhases)
const cvPhases = (p, cp) => { const phs = getPhases(p), pick = Array.isArray(cp && cp.showPhases) ? cp.showPhases : null; return pick ? phs.filter(ph => pick.includes(ph.id)) : phs };
function clientLive(p, cp) {
  const tasks = tasksOf(p), phs = cvPhases(p, cp), ids = new Set(phs.map(ph => ph.id)), out = { title: p.title };
  const work = phs.map(ph => { const pr = progressOf(tasks.filter(t => t.phase === ph.id)); return { name: ph.name, done: pr.done, total: pr.total } }).filter(x => x.total);
  out.work = work;
  // progress follows only the phases the client sees
  out.progress = cp.progressMode === "manual" ? (cp.progress || 0) : progressOf(tasks.filter(t => ids.has(t.phase))).pct;
  if (cp.stageMode !== "simple" && work.length) { out.stages = work.map(x => x.name); const i = work.findIndex(x => x.done < x.total); out.stage = i < 0 ? work.length - 1 : i }
  out.pay = payOf(p);
  return out;
}
let paySyncT = null;
function syncClientPay() {
  clearTimeout(paySyncT);
  paySyncT = setTimeout(() => {
    for (const cp of cProjects) {
      const p = ideas.find(i => i.id === cp.id); if (!p || !inTeam(p) || p.status === "removed") continue;
      const live = clientLive(p, cp), data = {};
      for (const [k, v] of Object.entries(live)) if (JSON.stringify(v == null ? null : v) !== JSON.stringify(cp[k] == null ? null : cp[k])) data[k] = v == null ? null : v;
      if (Object.keys(data).length) { if (data.title || data.progress != null || data.stage != null || data.work) data.updatedAt = Date.now(); setDoc(doc(db, "cprojects", cp.id), data, { merge: true }).catch(() => {}) }
    }
  }, 2500);
}

/* ---------- a monthly report for the client, branded Ardent Creative Studios, ready to save as PDF ---------- */
function clientReport(p, cp) {
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), month = now.toLocaleDateString("en", { month: "long", year: "numeric" });
  const tasks = tasksOf(p), done = tasks.filter(t => t.done && (t.doneAt || 0) >= start), next = tasks.filter(t => !t.done).sort((a, b) => taskPrioRank(a) - taskPrioRank(b) || (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 6);
  const st = stagesOf(cp), cur = st[Math.max(0, Math.min(st.length - 1, cp.stage || 0))], pct = Math.round(cp.progress || progressOf(tasks).pct);
  const y = cp.showPay !== false ? payOf(p) : null, esc = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const client = esc(clientOf(p) || (p.money || {}).client || "");
  const li = arr => arr.length ? "<ul>" + arr.map(t => `<li>${esc(t.text)}</li>`).join("") + "</ul>" : "<p class='m'>Nothing to show yet.</p>";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)} · ${month} report · Ardent Creative Studios</title>
<style>@page{margin:18mm}body{font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#11181F;max-width:760px;margin:0 auto;padding:28px}
header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0D5E63;padding-bottom:14px;margin-bottom:22px}header b{font-size:22px;letter-spacing:-.01em}header span{color:#0D5E63}
h1{font-size:26px;margin:0 0 4px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#0D5E63;margin:26px 0 8px}.m{color:#5A646F}
.bar{height:10px;background:#E6E9ED;border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;background:#0D5E63}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.grid div{background:#F3F5F7;border-radius:10px;padding:10px 12px}.grid b{display:block;font-size:18px}
ul{padding-left:20px;margin:0}li{margin:3px 0}footer{margin-top:34px;padding-top:12px;border-top:1px solid #E6E9ED;color:#5A646F;font-size:12.5px}
.print{position:fixed;top:14px;right:14px;background:#0D5E63;color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 14px sans-serif;cursor:pointer}@media print{.print{display:none}}</style></head><body>
<button class="print" onclick="print()">Save as PDF</button>
<header><svg width="18" height="30" viewBox="0 0 60 100"><path fill="#0F5E57" d="M30 2C40 12 45 22 45 34A15 15 0 0 1 15 34C15 22 20 12 30 2Z"/><path fill="#3E9C8F" d="M30 21C34.5 26.5 36.5 31 36.5 38A6.5 6.5 0 0 1 23.5 38C23.5 31 25.5 26.5 30 21Z"/><path fill="#2B2E33" d="M20 66A10 10 0 0 1 40 66L36.5 92A6.5 6.5 0 0 1 23.5 92Z"/></svg><b>Ardent <span>Creative Studios</span></b></header>
<h1>${esc(p.title)}</h1><div class="m">${client ? "Prepared for " + client + " · " : ""}Monthly report · ${month}</div>
<h2>Where we are</h2><div class="grid"><div><span class="m">Stage</span><b>${esc(cur)}</b></div><div><span class="m">Progress</span><b>${pct}%</b></div><div><span class="m">Done this month</span><b>${done.length}</b></div></div>
<div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
<h2>Done this month</h2>${li(done)}
<h2>Coming next</h2>${li(next)}${cp.next && cp.next.text ? `<p><b>Next step:</b> ${esc(cp.next.text)}${cp.next.date ? " · " + esc(fmtDay(new Date(cp.next.date + "T12:00").getTime())) : ""}</p>` : ""}
${y && (y.total || y.paid) ? `<h2>Payments</h2><div class="grid"><div><span class="m">Paid</span><b>${esc(fmtCur(y.paid, y.currency))}</b></div><div><span class="m">${y.monthly ? "Due now" : "Left to pay"}</span><b>${esc(fmtCur(Math.max(0, y.total - y.paid), y.currency))}</b></div>${y.next ? `<div><span class="m">Next</span><b>${esc(fmtCur(y.next.amount, y.currency))}</b><span class="m">${esc(y.next.label)}</span></div>` : ""}</div>` : ""}
<footer>Ardent Creative Studios · ${now.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })} · Questions? Reply on your project page: ${SITE_LINK}</footer></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups for this site to open the report", 4000); return }
  w.document.open(); w.document.write(html); w.document.close();
}
