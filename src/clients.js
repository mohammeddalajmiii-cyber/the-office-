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
let shareTab = "status";

const stagesOf = cp => (cp && Array.isArray(cp.stages) && cp.stages.length ? cp.stages : CSTAGES);
const cpOf = id => cProjects.find(c => c.id === id);
const lower = e => String(e || "").trim().toLowerCase();

/* ---------- the status card both clients and partners see ---------- */
function statusCard(cp, { big } = {}) {
  const st = stagesOf(cp), cur = Math.max(0, Math.min(st.length - 1, cp.stage || 0)), pct = Math.max(0, Math.min(100, Math.round(cp.progress || 0)));
  const nx = cp.next || {};
  return el("section", { class: "cstatus" + (big ? " big" : "") },
    el("div", { class: "label" }, "Your project"),
    el("h2", {}, cp.title || "Your project"),
    el("ol", { class: "stages", "aria-label": "Stages" }, st.map((s, i) => el("li", { class: i < cur ? "done" : i === cur ? "now" : "", "aria-current": i === cur ? "step" : null },
      el("span", { class: "dot" }, i < cur ? "✓" : String(i + 1)), el("span", { class: "sname" }, s)))),
    el("div", { class: "cprog" }, el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pct}%` })), el("span", {}, pct + "%")),
    el("div", { class: "cnow" }, el("div", {}, el("span", { class: "label" }, "Now"), el("b", {}, st[cur])),
      nx.text ? el("div", {}, el("span", { class: "label" }, "Next step"), el("b", {}, nx.text), nx.date ? el("span", { class: "cdate" }, fmtDay(new Date(nx.date + "T12:00").getTime())) : null) : null),
    cp.updatedAt ? el("div", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Updated " + ago(cp.updatedAt)) : null);
}
function linksList(cp) {
  const links = Object.entries(cp.links || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
  return links.length ? el("section", { class: "idea" }, el("h3", {}, "Files and links"), el("ul", { class: "plinks" }, links.map(k => el("li", {}, el("a", { href: k.url, target: "_blank", rel: "noopener" }, k.label || k.url))))) : null;
}
function cFeed(posts, { canDelete } = {}) {
  const list = [...posts].sort((a, b) => (b.at || 0) - (a.at || 0));
  return el("div", { class: "pfeed" }, list.length ? list.slice(0, 100).map(p => el("article", { class: "post" + (p.team ? " team" : "") },
    postAv(p.photo), el("div", { class: "post-body" },
      el("div", { class: "post-meta" }, el("b", {}, p.by === me ? "You" : (p.name || "Someone")), p.team ? el("span", { class: "chip" }, "Ardent team") : el("span", { class: "chip" }, "Client"), el("span", {}, ago(p.at))),
      el("div", { class: "post-text" }, p.text)),
    canDelete ? el("button", { class: "x", "aria-label": "Delete update", onclick: () => write(() => deleteDoc(doc(db, "cposts", p.id)), "Deleted") }, "✕") : null))
    : el("div", { class: "empty" }, "No updates yet."));
}

/* ---------- team side: subscriptions, alerts, and the Sharing tab on each project ---------- */
function clientTeamSubs() {
  const quiet = () => {};
  return [
    onSnapshot(collection(db, "cprojects"), s => { cProjects = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, quiet),
    onSnapshot(collection(db, "cposts"), s => {
      const before = new Set(cPosts.map(p => p.id)), first = !cPosts.length;
      cPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of cPosts) if (!before.has(p.id) && !p.team) toast(`${p.name || "A client"}: ${(p.text || "").slice(0, 60)}`);
      render();
    }, quiet),
    onSnapshot(collection(db, "ptasks"), s => { cTasks = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, quiet),
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
  box.append(el("p", { class: "lede", style: "margin:0 0 12px" }, "What this project's client and partners see when they sign in. They never see your tasks, chat, money or other projects."));
  if (!cp) {
    box.append(el("div", { class: "empty" }, el("h3", {}, "No client view yet"),
      el("p", { style: "margin:6px auto 14px;max-width:46ch" }, "Turn it on to give the client a page with this project's progress, and to give partners tasks on it."),
      el("button", { class: "btn primary", onclick: () => saveCP(p, {}, "Client view is on") }, "Turn on client view")));
    return;
  }
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Sharing", style: "margin:0 0 12px" },
    [["status", "Status"], ["people", "People"], ["updates", "Updates"], ["tasks", "Partner tasks"]].map(([k, v]) =>
      el("button", { "aria-pressed": String(shareTab === k), onclick: () => { shareTab = k; render() } }, v + (k === "updates" ? countNew(p.id) : "")))));

  if (shareTab === "status") {
    const st = stagesOf(cp), cur = cp.stage || 0, auto = progressOf(tasksOf(p)).pct;
    const nt = el("input", { class: "noteinput", id: "cpn-" + p.id, maxlength: "120", placeholder: "Next step, e.g. Send you the homepage design" });
    const nd = el("input", { class: "noteinput", id: "cpd-" + p.id, type: "date", style: "max-width:170px" });
    const rng = el("input", { type: "range", min: "0", max: "100", step: "5", value: String(cp.progress || 0), "aria-label": "Progress", style: "flex:1" });
    const out = el("b", { style: "min-width:44px;text-align:right" }, (cp.progress || 0) + "%");
    rng.oninput = () => { out.textContent = rng.value + "%" };
    rng.onchange = () => saveCP(p, { progress: +rng.value }, "Progress saved");
    box.append(el("section", { class: "compose" }, el("h3", {}, "Stage"),
      el("div", { class: "seg seg-wide", role: "group", "aria-label": "Stage" }, st.map((s, i) => el("button", { "aria-pressed": String(cur === i), onclick: () => saveCP(p, { stage: i }, "Stage: " + s) }, s))),
      el("h3", { style: "margin-top:8px" }, "Progress"),
      el("div", { class: "row" }, rng, out),
      el("div", { class: "row" }, el("span", { class: "label" }, `Your task list says ${auto}%`), el("span", { class: "spacer" }),
        el("button", { class: "btn small", onclick: () => saveCP(p, { progress: auto }, "Progress set from tasks") }, `Use ${auto}%`)),
      el("h3", { style: "margin-top:8px" }, "Next step"),
      cp.next && cp.next.text ? el("div", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Now showing: " + cp.next.text + (cp.next.date ? " · " + fmtDay(new Date(cp.next.date + "T12:00").getTime()) : "")) : null,
      el("div", { class: "row" }, nt, nd, el("button", { class: "btn primary", onclick: () => { const t = nt.value.trim(); if (!t) { nt.focus(); return } saveCP(p, { next: { text: t, date: nd.value || "" } }, "Next step saved"); nt.value = ""; nd.value = "" } }, "Save"))));
    const links = Object.entries(cp.links || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
    const lab = el("input", { class: "noteinput", id: "cpl-" + p.id, maxlength: "60", placeholder: "Name, e.g. Homepage design" });
    const url = el("input", { class: "noteinput", id: "cpu-" + p.id, type: "url", maxlength: "500", placeholder: "https://…" });
    box.append(el("section", { class: "compose", style: "margin-top:12px" }, el("h3", {}, "Files and links for the client"),
      links.length ? el("ul", { class: "plinks" }, links.map(k => el("li", {}, el("a", { href: k.url, target: "_blank", rel: "noopener" }, k.label || k.url),
        el("button", { class: "x", "aria-label": "Remove " + (k.label || "link"), onclick: () => saveCP(p, { ["links"]: { [k.id]: DEL() } }, "Removed") }, "✕")))) : el("p", { class: "label", style: "margin:0" }, "Designs to review, the live site, invoices…"),
      lab, url, el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn", onclick: () => {
        let u = url.value.trim(), t = lab.value.trim(); if (!u) { url.focus(); return } if (!/^https?:\/\//i.test(u)) u = "https://" + u;
        lab.value = ""; url.value = ""; saveCP(p, { links: { [uid()]: { label: t, url: u, at: Date.now() } } }, "Link added") } }, "Add link"))));
    box.append(el("h2", { class: "sec-h" }, "What the client sees"), statusCard({ ...cp, title: cp.title || p.title }));
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
    box.append(el("section", { class: "compose" }, el("h3", {}, "Client"), el("p", { class: "label", style: "margin:0" }, "The Google email your client signs in with. Add more than one if several people at the client should see it."),
      (cp.clients || []).length ? el("ul", { class: "plist" }, people("clients")) : null, addRow("clients", "client@company.com")));
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
    const ta = el("textarea", { class: "noteinput", id: "cpmsg-" + p.id, rows: "3", maxlength: "1500", placeholder: "Tell the client what's new: what you finished, what's next, anything you need from them" });
    box.append(el("section", { class: "compose" }, ta, el("div", { class: "row" }, el("span", { class: "label" }, "The client and the project's partners see this."), el("span", { class: "spacer" }),
      el("button", { class: "btn primary", onclick: () => { const t = ta.value.trim(); if (!t) return; ta.value = "";
        write(() => setDoc(doc(db, "cposts", uid()), { pid: p.id, by: me, name: teamName(), photo: photoOf(me) === AV ? "" : photoOf(me), team: true, text: t, at: Date.now() }).then(() => saveCP(p, {})), "Sent to the client") } }, "Send update"))));
    box.append(el("div", { style: "margin-top:12px" }, cFeed(cPosts.filter(x => x.pid === p.id), { canDelete: true })));
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
    if (!myCP.length) { clientStop(); signOut(auth); $("#gate-msg").textContent = `${u.email} doesn't have a project to follow anymore. Message Ardent Studios if that's a mistake.`; return }
    for (const cp of myCP) if (!myCPosts[cp.id]) { myCPosts[cp.id] = []; cUnsubs.push(onSnapshot(query(collection(db, "cposts"), where("pid", "==", cp.id)), s2 => { myCPosts[cp.id] = s2.docs.map(d => ({ id: d.id, ...d.data() })); render() }, () => {})) }
    if (!myCP.find(c => c.id === cSel)) cSel = myCP[0].id;
    render();
  }, () => toast("Can't reach your project. Check your connection.", 5000)));
  render();
}
function renderClient() {
  const box = $("#cv"); const vals = {}; box.querySelectorAll("textarea[id]").forEach(n => vals[n.id] = n.value); box.replaceChildren();
  const first = (myProfile && myProfile.name || "").split(" ")[0];
  const cp = myCP.find(c => c.id === cSel);
  box.append(el("h1", { class: "c-hello" }, first ? `Hi ${first}` : "Hi"), el("p", { class: "lede", style: "margin-top:4px" }, "Here's where your project with Ardent Studios stands. This page updates on its own."));
  if (myCP.length > 1) box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Your projects", style: "margin:12px 0" }, myCP.map(c => el("button", { "aria-pressed": String(c.id === cSel), onclick: () => { cSel = c.id; render() } }, c.title))));
  if (!cp) { box.append(el("div", { class: "empty" }, "Loading your project…")); return }
  box.append(statusCard(cp, { big: true }));
  const lk = linksList(cp); if (lk) box.append(el("div", { style: "margin-top:12px" }, lk));
  const ta = el("textarea", { class: "noteinput", id: "c-msg", rows: "3", maxlength: "1500", placeholder: "Questions, feedback or anything you'd like to send the team" });
  box.append(el("h2", { class: "sec-h" }, "Updates"),
    el("section", { class: "compose" }, ta, el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("button", { class: "btn primary", onclick: () => { const t = ta.value.trim(); if (!t) return; ta.value = "";
        write(() => setDoc(doc(db, "cposts", uid()), { pid: cp.id, by: me, name: myProfile.name, photo: myProfile.photo || "", team: false, text: t, at: Date.now() }), "Sent to the team") } }, "Send to the team"))),
    el("div", { style: "margin-top:12px" }, cFeed(myCPosts[cp.id] || [])),
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
    for (const cp of pProjects) if (!pProjPosts[cp.id]) { pProjPosts[cp.id] = []; pProjUnsubs.push(onSnapshot(query(collection(db, "cposts"), where("pid", "==", cp.id)), s2 => { pProjPosts[cp.id] = s2.docs.map(d => ({ id: d.id, ...d.data() })); render() }, () => {})) }
    render();
  }, () => {}));
  pProjUnsubs.push(onSnapshot(query(collection(db, "ptasks"), where("email", "==", email)), s => { myPTasks = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, () => {}));
}
function partnerProjectsStop() { pProjUnsubs.forEach(f => f()); pProjUnsubs = []; pProjects = []; myPTasks = [] }
function renderPartnerProjects(box) {
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Your projects"),
    el("p", { class: "lede", style: "margin-top:-4px" }, "Projects you're working on with Ardent Studios, and the tasks the team gave you. Tick them off as you finish."));
  if (!pProjects.length) { box.append(el("div", { class: "empty" }, "You're not on a project yet. When the team adds you to one, it shows up here.")); return }
  for (const cp of pProjects) {
    const list = myPTasks.filter(t => t.pid === cp.id).sort((a, b) => (a.done - b.done) || (a.at || 0) - (b.at || 0));
    const team = (pProjPosts[cp.id] || []).filter(x => x.team).sort((a, b) => b.at - a.at)[0];
    box.append(el("div", { style: "display:grid;gap:10px;margin-bottom:20px" }, statusCard(cp),
      el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "Your tasks"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${list.filter(t => t.done).length}/${list.length}`)),
        list.length ? el("ul", { class: "steps" }, list.map(t => el("li", { class: t.done ? "done" : "" },
          el("input", { type: "checkbox", id: "mt-" + t.id, checked: !!t.done, onchange: ev => write(() => updateDoc(doc(db, "ptasks", t.id), { done: ev.target.checked, doneAt: ev.target.checked ? Date.now() : null }), ev.target.checked ? "Nice, done" : null) }),
          el("label", { for: "mt-" + t.id }, t.text, t.due ? el("span", { class: "label", style: "margin-left:8px" }, "due " + fmtDay(new Date(t.due + "T12:00").getTime())) : null)))) : el("p", {}, "No tasks for you yet."),
        team ? el("div", { class: "note" }, el("span", { class: "note-body" }, team.text), el("span", { class: "note-meta" }, (team.name || "Ardent team") + " · " + ago(team.at))) : null)));
  }
}
