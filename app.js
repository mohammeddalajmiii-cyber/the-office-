import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const $ = s => document.querySelector(s);
const el = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v) } for (const c of kids.flat()) { if (c == null || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(String(c))) } return n };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200) }
const status = (m, warn) => { const s = $("#status"); s.textContent = m || ""; s.className = "status" + (warn ? " warn" : "") };
const DEL = deleteField;
const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23999'/%3E%3C/svg%3E";

/* routing */
function show() {
  const h = location.hash.slice(1); const v = h === "projects" || h === "ideas" ? h : "current";
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.view === v);
  for (const k of ["current", "ideas", "projects"]) $("#view-" + k).hidden = v !== k;
}
for (const b of document.querySelectorAll(".tab")) b.onclick = () => { location.hash = b.dataset.view };
addEventListener("hashchange", show); show();

/* auth */
$("#signin").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (e) { $("#gate-msg").textContent = "Sign-in didn't finish. Try again, and allow pop-ups for this site if your browser blocked one." }
};
$("#signout").onclick = () => signOut(auth);

let ideas = [], focusId = null, me = null, people = {}, unsubs = [];

onAuthStateChanged(auth, u => {
  unsubs.forEach(f => f()); unsubs = [];
  if (!u) { me = null; $("#gate").hidden = false; $("#app").hidden = true; $("#account").hidden = true; return }
  me = u.uid;
  $("#gate").hidden = true; $("#app").hidden = false; $("#account").hidden = false;
  $("#me-chip").replaceChildren(el("img", { class: "av", src: u.photoURL || AV, alt: "" }), u.displayName || u.email);
  status("Loading the board…");
  setDoc(doc(db, "users", me), { name: u.displayName || u.email, photo: u.photoURL || "" }, { merge: true }).catch(() => {});
  const denied = e => {
    if (e.code === "permission-denied") {
      signOut(auth);
      $("#gate-msg").textContent = `${u.email} isn't on the team list yet. Ask whoever runs the site to add your email, then sign in again.`;
    } else status("The board stopped updating. Reload the page to reconnect.", true);
  };
  unsubs.push(onSnapshot(collection(db, "ideas"), s => { ideas = s.docs.map(d => ({ id: d.id, ...d.data() })); status(""); render() }, denied));
  unsubs.push(onSnapshot(doc(db, "meta", "focus"), s => { focusId = s.exists() ? s.data().projectId : null; render() }, () => {}));
  unsubs.push(onSnapshot(collection(db, "users"), s => { people = {}; s.docs.forEach(d => people[d.id] = d.data()); render() }, () => {}));
});

async function write(fn, ok) {
  try { await fn(); if (ok) toast(ok) }
  catch (e) { status(e.code === "permission-denied" ? "You don't have permission to change the board." : "That didn't save. Check your connection and try again.", true) }
}
const upd = (id, data) => updateDoc(doc(db, "ideas", id), data);

/* compose */
$("#compose").addEventListener("submit", ev => {
  ev.preventDefault();
  const title = $("#f-title").value.trim(), pitch = $("#f-pitch").value.trim(); if (!title) return;
  const id = uid();
  write(() => setDoc(doc(db, "ideas", id), { title, pitch, author: me, createdAt: Date.now(), status: "voting", votes: { [me]: "keep" }, steps: {}, backers: {} }), "Idea added to the vote");
  $("#f-title").value = ""; $("#f-pitch").value = "";
});

const tally = i => { let k = 0, d = 0; for (const v of Object.values(i.votes || {})) { if (v === "keep") k++; else if (v === "drop") d++ } return { k, d } };
const voters = (i, kind) => Object.entries(i.votes || {}).filter(([, v]) => v === kind).map(([u]) => u);
const stepList = i => Object.entries(i.steps || {}).filter(([, s]) => s).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.order || 0) - (b.order || 0));
const progress = i => { const s = stepList(i); const d = s.filter(x => x.done).length; return { total: s.length, done: d, pct: s.length ? Math.round(d / s.length * 100) : 0 } };
const name = id => id === me ? "You" : ((people[id] || {}).name || "A friend");
const av = id => el("img", { class: "av", src: (people[id] || {}).photo || AV, alt: name(id), title: name(id), referrerpolicy: "no-referrer" });

function render() {
  if (!me) return;
  const voting = ideas.filter(i => i.status === "voting").sort((a, b) => b.createdAt - a.createdAt);
  const removed = ideas.filter(i => i.status === "removed");
  const projects = ideas.filter(i => i.status === "approved").sort((a, b) => (a.approvedAt || 0) - (b.approvedAt || 0));
  $("#c-ideas").textContent = voting.length; $("#c-projects").textContent = projects.length;

  /* current project (home) */
  const cbox = $("#current"); cbox.replaceChildren();
  const fp = projects.find(p => p.id === focusId);
  if (!fp) {
    cbox.append(el("div", { class: "empty" }, el("h3", {}, "No current project yet"),
      el("p", { style: "margin:6px auto 14px;max-width:46ch" }, "Confirm ideas in the vote, plan them on Projects, then press “Make it our project” on the one you all want to build."),
      el("button", { class: "btn primary", onclick: () => { location.hash = "projects" } }, "Go to Projects")));
  } else {
    const pr = progress(fp);
    const tasks = Object.entries(fp.tasks || {}).filter(([, t]) => t).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.order || 0) - (b.order || 0));
    const memberSet = new Set(Object.entries(fp.members || {}).filter(([, v]) => v).map(([u]) => u));
    for (const t of tasks) if (t.owner) memberSet.add(t.owner);
    const members = [...memberSet].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
    const joined = !!(fp.members || {})[me];
    const tDone = tasks.filter(t => t.done).length;
    const tpr = { total: tasks.length, done: tDone, pct: tasks.length ? Math.round(tDone / tasks.length * 100) : 0 };
    cbox.append(el("section", { class: "focus" },
      el("div", { class: "label" }, "The project we're all building"),
      el("h2", {}, fp.title),
      fp.pitch ? el("p", { style: "margin:0;opacity:.8;max-width:65ch" }, fp.pitch) : null,
      el("div", { class: "label", style: "margin-top:4px" }, "Plan progress"),
      line(pr, "steps"),
      el("div", { class: "label", style: "margin-top:4px" }, "Team tasks"),
      line(tpr, "tasks"),
      el("div", { class: "row" },
        el("span", { class: "stack" }, members.slice(0, 8).map(av)),
        el("span", { style: "font-size:13px;opacity:.8" }, members.length ? `${members.length} on the team` : "Nobody has joined yet"),
        el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => write(() => upd(fp.id, { ["members." + me]: joined ? DEL() : true }), joined ? "You left the team" : "You joined the team") }, joined ? "Leave team" : "Join the team"),
        el("button", { class: "btn quiet", style: "color:inherit;opacity:.75", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: null }), "No current project") }, "Stop this project"))));

    const grid = el("div", { class: "members" });
    if (!members.length) grid.append(el("div", { class: "empty" }, "Press “Join the team” to get your own task list. Everyone who joins gets a column here."));
    for (const m of members) {
      const mine = tasks.filter(t => t.owner === m); const d = mine.filter(t => t.done).length;
      const mpr = { total: mine.length, done: d, pct: mine.length ? Math.round(d / mine.length * 100) : 0 };
      const inp = el("input", { id: "task-" + m, placeholder: m === me ? "Add a task for yourself" : "Add a task for " + name(m), maxlength: "140" });
      const add = () => { const t = inp.value.trim(); if (!t) return; inp.value = ""; write(() => upd(fp.id, { ["tasks." + uid()]: { text: t, owner: m, done: false, order: Date.now() } })) };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
      grid.append(el("article", { class: "idea member" + (m === me ? " me" : "") },
        el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, av(m), name(m), el("span", { class: "spacer" }), el("span", { class: "label" }, `${d}/${mine.length}`)),
        line(mpr, "tasks"),
        mine.length ? el("ul", { class: "steps" }, mine.map(t => {
          const cid = "t-" + t.id; return el("li", { class: t.done ? "done" : "" },
            el("input", { type: "checkbox", id: cid, checked: !!t.done, onchange: e => write(() => upd(fp.id, { ["tasks." + t.id + ".done"]: e.target.checked })) }),
            el("label", { for: cid }, t.text),
            el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => write(() => upd(fp.id, { ["tasks." + t.id]: DEL() })) }, "✕"))
        })) : el("p", {}, "No tasks yet."),
        el("div", { class: "addstep" }, inp, el("button", { class: "btn", onclick: add }, "Add"))));
    }
    cbox.append(el("div", { class: "row", style: "margin:22px 0 10px" }, el("h2", {}, "Who's doing what")), grid);
  }

  /* ideas */
  const box = $("#ideas"); box.replaceChildren();
  if (!voting.length) box.append(el("div", { class: "empty" }, "No ideas waiting for a vote. Pitch the first one above."));
  for (const i of voting) {
    const { k, d } = tally(i); const mine = (i.votes || {})[me];
    const vote = kind => write(() => upd(i.id, { ["votes." + me]: mine === kind ? DEL() : kind }));
    const vb = (kind, label, count) => el("button", { class: "v " + kind, "aria-pressed": String(mine === kind), onclick: () => vote(kind) }, label, el("b", {}, count), el("span", { class: "stack" }, voters(i, kind).slice(0, 5).map(av)));
    const verdict = k > d ? el("span", { class: "verdict keep" }, "Leaning keep") : d > k ? el("span", { class: "verdict drop" }, "Leaning drop") : el("span", { class: "verdict" }, "Tied");
    box.append(el("article", { class: "idea" },
      el("h3", {}, i.title),
      i.pitch ? el("p", {}, i.pitch) : null,
      el("div", { class: "by" }, av(i.author), "Pitched by ", name(i.author)),
      el("div", { class: "vote" }, vb("keep", "Keep", k), vb("drop", "Drop", d), el("span", { class: "spacer" }), verdict),
      el("div", { class: "row" },
        el("span", { class: "spacer" }),
        i.author === me ? el("button", { class: "btn quiet", onclick: () => write(() => deleteDoc(doc(db, "ideas", i.id)), "Idea deleted") }, "Delete my idea") : null,
        el("button", { class: "btn", disabled: !(d > k), title: "Available when more people vote drop than keep", onclick: () => write(() => upd(i.id, { status: "removed" }), "Idea removed") }, "Remove"),
        el("button", { class: "btn primary", disabled: !(k > d), title: "Available when more people vote keep than drop", onclick: () => write(() => upd(i.id, { status: "approved", approvedAt: Date.now() }), "Moved to Projects") }, "Confirm → Projects"))));
  }
  const rb = $("#removed"); rb.replaceChildren();
  if (removed.length) {
    rb.append(el("details", { class: "removed" }, el("summary", {}, `Removed ideas (${removed.length})`),
      el("div", { class: "list" }, removed.map(i => el("article", { class: "idea" }, el("h3", {}, i.title), el("div", { class: "row" }, el("span", { class: "by" }, av(i.author), name(i.author)), el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => write(() => upd(i.id, { status: "voting" }), "Back in the vote") }, "Bring back to vote")))))));
  }

  /* projects */
  const pbox = $("#projects"); pbox.replaceChildren();
  if (!projects.length) pbox.append(el("div", { class: "empty" }, "No confirmed projects yet. Ideas land here once more people vote keep than drop and someone confirms them."));
  for (const p of projects) {
    const pr = progress(p), steps = stepList(p), backed = !!(p.backers || {})[me];
    const backers = Object.entries(p.backers || {}).filter(([, v]) => v).map(([u]) => u);
    const inp = el("input", { id: "step-" + p.id, placeholder: "Add a step — e.g. Sketch the screens", maxlength: "140" });
    const add = () => { const t = inp.value.trim(); if (!t) return; inp.value = ""; write(() => upd(p.id, { ["steps." + uid()]: { text: t, done: false, order: Date.now() } })) };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
    pbox.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("h3", {}, p.title), el("span", { class: "spacer" }), p.id === focusId ? el("span", { class: "pill" }, "Current project") : null),
      p.pitch ? el("p", {}, p.pitch) : null,
      line(pr, "steps"),
      el("div", { class: "label" }, "Plan"),
      steps.length ? el("ul", { class: "steps" }, steps.map(s => {
        const cid = "s-" + p.id + "-" + s.id; return el("li", { class: s.done ? "done" : "" },
          el("input", { type: "checkbox", id: cid, checked: !!s.done, onchange: e => write(() => upd(p.id, { ["steps." + s.id + ".done"]: e.target.checked })) }),
          el("label", { for: cid }, s.text),
          el("button", { class: "x", title: "Delete step", "aria-label": "Delete step " + s.text, onclick: () => write(() => upd(p.id, { ["steps." + s.id]: DEL() })) }, "✕"))
      })) : el("p", {}, "No steps yet. Break the build into steps and tick them off as you go."),
      el("div", { class: "addstep" }, inp, el("button", { class: "btn", onclick: add }, "Add step")),
      el("div", { class: "row" },
        el("button", { class: "v keep", "aria-pressed": String(backed), onclick: () => write(() => upd(p.id, { ["backers." + me]: backed ? DEL() : true })) }, "I want to build this", el("b", {}, backers.length), el("span", { class: "stack" }, backers.slice(0, 6).map(av))),
        el("span", { class: "spacer" }),
        p.id === focusId ? null : el("button", { class: "btn primary", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: p.id, setBy: me, at: Date.now() }), "This is our project now") }, "Make it our project"))));
  }
}

function line(pr, unit) {
  const t = el("div", { class: "track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": pr.pct, "aria-label": "Progress" }, el("div", { class: "fill", style: `width:${pr.pct}%` }));
  for (let i = 1; i < pr.total; i++) t.append(el("span", { class: "tick", style: `left:calc(${i / pr.total * 100}% - 1px)` }));
  return el("div", { style: "display:grid;gap:6px" }, t, el("div", { class: "pmeta" }, el("span", {}, pr.total ? `${pr.done} of ${pr.total} ${unit} done` : `No ${unit} yet`), el("span", {}, pr.pct + "%")));
}
