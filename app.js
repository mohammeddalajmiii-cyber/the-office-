import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

/* ---------- content ---------- */

const SKILLS = {
  build:    { name: "Builder",    about: "Coding, tech and making things work" },
  design:   { name: "Designer",   about: "Visuals, layout and how things look" },
  organize: { name: "Organizer",  about: "Planning, deadlines and keeping the team on track" },
  write:    { name: "Writer",     about: "Words, scripts, captions and explaining things" },
  people:   { name: "Talker",     about: "Presenting, convincing and reaching people" },
  research: { name: "Researcher", about: "Finding answers, comparing options and solving problems" },
  media:    { name: "Creator",    about: "Video, photos, music and editing" },
};
const SKILL_IDS = Object.keys(SKILLS);

const CATEGORIES = ["App", "Website", "Game", "Video / YouTube", "Music", "Business", "Event", "Art & Design", "Social media", "School", "Sports", "Other"];

const PHASES = [
  { id: "goal",     name: "Goal",     hint: "What are we making, and for who?" },
  { id: "research", name: "Research", hint: "What exists already, and do people want it?" },
  { id: "design",   name: "Design",   hint: "How will it look and work?" },
  { id: "build",    name: "Build",    hint: "Make the first working version." },
  { id: "test",     name: "Test",     hint: "Let people try it and fix what breaks." },
  { id: "launch",   name: "Launch",   hint: "Show it off and get people using it." },
];

const TEMPLATE = [
  ["goal", "Write one sentence: what we're making and who it's for", "write"],
  ["goal", "Decide what 'done' means for the first version", "organize"],
  ["goal", "Set a finish date and weekly check-ins", "organize"],
  ["research", "Find 3 similar things that already exist and what they do well", "research"],
  ["research", "Ask 5 people if they'd actually use it", "people"],
  ["design", "Sketch the main screens or parts", "design"],
  ["design", "Pick a name, colors and a logo", "design"],
  ["build", "Set up the project and the tools we need", "build"],
  ["build", "Build the first working version", "build"],
  ["build", "Make the content: text, photos, video, sound", "media"],
  ["test", "Get 3 people to try it and write down every problem", "research"],
  ["test", "Fix the biggest problems", "build"],
  ["launch", "Make a trailer, reel or post to show it off", "media"],
  ["launch", "Write the description and captions", "write"],
  ["launch", "Share it and get people to try it", "people"],
];

const QUIZ = [
  { q: "Your class gets a group project. What do you grab first?", a: [
    ["Making the slides look good", "design"], ["Splitting the work and setting deadlines", "organize"],
    ["Digging up the facts and sources", "research"], ["Presenting it in front of the class", "people"]] },
  { q: "Free Saturday, nothing planned. You're most likely…", a: [
    ["Messing with an app, a game mod or some code", "build"], ["Editing a video or making music", "media"],
    ["Drawing, designing or redoing your setup", "design"], ["Out with friends or on calls", "people"]] },
  { q: "A friend's phone or laptop is acting weird. You…", a: [
    ["Try settings and fixes until it works", "build"], ["Search the exact error and read forums", "research"],
    ["Call someone who'd know", "people"], ["Explain it step by step so they can fix it themselves", "write"]] },
  { q: "Which compliment would make your day?", a: [
    ["“That looks so clean”", "design"], ["“You explained that perfectly”", "write"],
    ["“How did you even make that work?”", "build"], ["“We'd be lost without you keeping us on track”", "organize"]] },
  { q: "The group chat is planning a trip. You're the one who…", a: [
    ["Makes the schedule and the who-brings-what list", "organize"], ["Finds the best places and prices", "research"],
    ["Convinces everyone, parents included", "people"], ["Makes the trip edit afterwards", "media"]] },
  { q: "Pick a YouTube rabbit hole:", a: [
    ["How apps and games are made", "build"], ["Design, art or aesthetic setups", "design"],
    ["Editing, filmmaking or music production", "media"], ["Documentaries and explainers", "research"]] },
  { q: "You need 100 people to try your project. You…", a: [
    ["Make a sick trailer or TikTok", "media"], ["Write the post that makes people click", "write"],
    ["Message people and hype it up in person", "people"], ["Plan where to post, when, and who does what", "organize"]] },
  { q: "Which subject would you take just for fun?", a: [
    ["Computer science or maths", "build"], ["Art", "design"],
    ["English or another language", "write"], ["Science or history", "research"]] },
  { q: "The project gets stuck. You usually…", a: [
    ["Try a different approach and keep testing", "build"], ["Look up how other people solved it", "research"],
    ["Get the team together and talk it out", "people"], ["Break it into smaller steps and hand them out", "organize"]] },
  { q: "Your camera roll is mostly…", a: [
    ["Shots and clips I edit", "media"], ["Screenshots of designs and inspo", "design"],
    ["Notes, lists and reminders", "organize"], ["Memes and chats with friends", "people"]] },
  { q: "There's writing to do for the project. What sounds most fun?", a: [
    ["Telling the story or writing the script", "write"], ["Making the visuals that go with it", "design"],
    ["Recording and editing it", "media"], ["Checking the facts are right", "research"]] },
  { q: "Which tool would you master first?", a: [
    ["VS Code or a game engine", "build"], ["Figma, Canva or Photoshop", "design"],
    ["CapCut, Premiere or FL Studio", "media"], ["Notion, Google Calendar or Trello", "organize"]] },
  { q: "Your team presents to an audience. Your role:", a: [
    ["Speaking on stage", "people"], ["Writing what we'll say", "write"],
    ["Making the slides", "design"], ["Running the live demo", "build"]] },
  { q: "What's the best feeling?", a: [
    ["Something I built actually works", "build"], ["People react to something I made", "media"],
    ["I found the answer nobody else could", "research"], ["A messy plan finally comes together", "organize"]] },
];
const QUIZ_MAX = Object.fromEntries(SKILL_IDS.map(s => [s, QUIZ.filter(x => x.a.some(([, k]) => k === s)).length]));

/* ---------- helpers ---------- */

const $ = s => document.querySelector(s);
const el = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "value") n.value = v; else if (k === "checked" || k === "selected") n[k] = !!v; else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v) } for (const c of kids.flat()) { if (c == null || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(String(c))) } return n };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200) }
const status = (m, warn) => { const s = $("#status"); s.textContent = m || ""; s.className = "status" + (warn ? " warn" : "") };
const DEL = deleteField;
const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23999'/%3E%3C/svg%3E";
const pctOf = (d, t) => t ? Math.round(d / t * 100) : 0;

/* ---------- routing ---------- */

const VIEWS = ["current", "ideas", "projects", "skills", "plan"];
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("plan-")) return { view: "plan", id: h.slice(5) };
  return { view: VIEWS.includes(h) && h !== "plan" ? h : "current" };
}
function show() {
  const r = route(); const tabView = r.view === "plan" ? "projects" : r.view;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.view === tabView);
  for (const k of VIEWS) $("#view-" + k).hidden = r.view !== k;
  render();
}
for (const b of document.querySelectorAll(".tab")) b.onclick = () => { location.hash = b.dataset.view };
addEventListener("hashchange", () => { show(); scrollTo(0, 0) });

/* ---------- auth & data ---------- */

$("#signin").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (e) { $("#gate-msg").textContent = "Sign-in didn't finish. Try again, and allow pop-ups for this site if your browser blocked one." }
};
$("#signout").onclick = () => signOut(auth);

let ideas = [], focusId = null, me = null, people = {}, unsubs = [];
const suggestions = {};          // projectId -> [{task, owner, why}]
let quiz = null;                 // {i, answers:[], grow:[]} while taking the quiz

onAuthStateChanged(auth, u => {
  unsubs.forEach(f => f()); unsubs = [];
  if (!u) { me = null; $("#gate").hidden = false; $("#app").hidden = true; $("#account").hidden = true; return }
  me = u.uid;
  $("#gate").hidden = true; $("#app").hidden = false; $("#account").hidden = false;
  $("#me-chip").replaceChildren(el("img", { class: "av", src: u.photoURL || AV, alt: "", referrerpolicy: "no-referrer" }), u.displayName || u.email);
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
  show();
});

async function write(fn, ok) {
  try { await fn(); if (ok) toast(ok) }
  catch (e) { status(e.code === "permission-denied" ? "You don't have permission to change the board." : "That didn't save. Check your connection and try again.", true) }
}
const upd = (id, data) => updateDoc(doc(db, "ideas", id), data);

/* ---------- derived data ---------- */

const name = id => id === me ? "You" : ((people[id] || {}).name || "A friend");
const firstName = id => id === me ? "you" : (((people[id] || {}).name || "a friend").split(" ")[0]);
const av = id => el("img", { class: "av", src: (people[id] || {}).photo || AV, alt: name(id), title: name(id), referrerpolicy: "no-referrer" });
const tally = i => { let k = 0, d = 0; for (const v of Object.values(i.votes || {})) { if (v === "keep") k++; else if (v === "drop") d++ } return { k, d } };
const voters = (i, kind) => Object.entries(i.votes || {}).filter(([, v]) => v === kind).map(([u]) => u);

function tasksOf(p) {
  const out = [];
  for (const [field, phaseDefault] of [["tasks", "build"], ["steps", "build"]]) {
    for (const [id, t] of Object.entries(p[field] || {})) if (t && t.text) out.push({ id, field, ...t, phase: t.phase || phaseDefault, path: `${field}.${id}` });
  }
  return out.sort((a, b) => (a.order || 0) - (b.order || 0));
}
const progressOf = list => { const d = list.filter(t => t.done).length; return { total: list.length, done: d, pct: pctOf(d, list.length) } };
const teamIds = () => Object.keys(people).sort((a, b) => a === me ? -1 : b === me ? 1 : name(a).localeCompare(name(b)));
const topSkills = id => { const s = (people[id] || {}).skills; if (!s) return []; return SKILL_IDS.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0)).slice(0, 2) };

/* ---------- smart helper: who should do what ---------- */

function suggest(p) {
  const tasks = tasksOf(p);
  const open = tasks.filter(t => !t.done && !t.owner);
  const joined = Object.entries(p.members || {}).filter(([, v]) => v).map(([u]) => u);
  const pool = joined.length >= 2 ? joined : teamIds();
  if (!pool.length) return [];
  const load = Object.fromEntries(pool.map(u => [u, tasks.filter(t => !t.done && t.owner === u).length]));
  const out = [];
  for (const t of open) {
    let best = null;
    for (const u of pool) {
      const prof = people[u] || {};
      const sk = prof.skills ? (prof.skills[t.skill] ?? 0) : 0.35;
      const grow = (prof.grow || []).includes(t.skill) ? 0.12 : 0;
      const score = sk + grow - 0.12 * load[u];
      if (!best || score > best.score) best = { u, score, sk, grow, hasQuiz: !!prof.skills };
    }
    load[best.u]++;
    const skillName = t.skill ? SKILLS[t.skill].name.toLowerCase() : "general";
    let why;
    if (!t.skill) why = `Spreads the work evenly`;
    else if (!best.hasQuiz) why = `Hasn't taken the skills quiz yet, so picked to spread the work`;
    else if (best.grow && best.sk < 0.5) why = `Wants to get better at ${skillName} work`;
    else why = `${SKILLS[t.skill].name} score ${Math.round(best.sk * 100)}%` + (best.grow ? `, and wants to grow in it` : "");
    out.push({ task: t, owner: best.u, why });
  }
  return out;
}

/* ---------- render ---------- */

function keepInputs(fn) {
  const vals = {}; document.querySelectorAll("#app input[id]:not([type=checkbox]), #app textarea[id], #app select[id]").forEach(n => vals[n.id] = n.value);
  const act = document.activeElement; const actId = act && act.id; let sel = null;
  try { sel = act && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null } catch { }
  fn();
  for (const [id, v] of Object.entries(vals)) { const n = document.getElementById(id); if (n && n.type !== "date" && n.tagName !== "SELECT" && v) n.value = v }
  if (actId) { const n = document.getElementById(actId); if (n && n !== document.activeElement) { n.focus(); try { if (sel) n.setSelectionRange(sel[0], sel[1]) } catch { } } }
}

function render() { if (!me) return; keepInputs(renderAll) }

function renderAll() {
  const voting = ideas.filter(i => i.status === "voting").sort((a, b) => b.createdAt - a.createdAt);
  const removed = ideas.filter(i => i.status === "removed");
  const projects = ideas.filter(i => i.status === "approved").sort((a, b) => (a.approvedAt || 0) - (b.approvedAt || 0));
  fillComposeCats();
  $("#c-ideas").textContent = voting.length; $("#c-projects").textContent = projects.length;
  const r = route();
  if (r.view === "current") renderCurrent(projects);
  if (r.view === "ideas") renderIdeas(voting, removed);
  if (r.view === "projects") renderProjects(projects);
  if (r.view === "plan") renderPlanPage(projects.find(p => p.id === r.id));
  if (r.view === "skills") renderSkills();
}

/* ----- current project (home) ----- */

function renderCurrent(projects) {
  const box = $("#current"); box.replaceChildren();
  const fp = projects.find(p => p.id === focusId);
  if (!fp) {
    box.append(el("div", { class: "empty" }, el("h3", {}, "No current project yet"),
      el("p", { style: "margin:6px auto 14px;max-width:46ch" }, "Confirm ideas in the vote, plan them on Projects, then press “Make it our project” on the one you all want to build."),
      el("button", { class: "btn primary", onclick: () => { location.hash = "projects" } }, "Go to Projects")));
    return;
  }
  const tasks = tasksOf(fp);
  const memberSet = new Set(Object.entries(fp.members || {}).filter(([, v]) => v).map(([u]) => u));
  for (const t of tasks) if (t.owner) memberSet.add(t.owner);
  const members = [...memberSet].sort((a, b) => a === me ? -1 : b === me ? 1 : 0);
  const joined = !!(fp.members || {})[me];

  box.append(el("section", { class: "focus" },
    el("div", { class: "label" }, "The project we're all building" + (fp.category ? " \u00b7 " + fp.category : "")),
    el("h2", {}, fp.title),
    fp.pitch ? el("p", { style: "margin:0;opacity:.8;max-width:65ch" }, fp.pitch) : null,
    line(progressOf(tasks), "tasks"),
    phaseBar(tasks),
    el("div", { class: "row" },
      el("span", { class: "stack" }, members.slice(0, 8).map(av)),
      el("span", { style: "font-size:13px;opacity:.8" }, members.length ? `${members.length} on the team` : "Nobody has joined yet"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => write(() => upd(fp.id, { ["members." + me]: joined ? DEL() : true }), joined ? "You left the team" : "You joined the team") }, joined ? "Leave team" : "Join the team"),
      el("button", { class: "btn quiet", style: "color:inherit;opacity:.75", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: null }), "No current project") }, "Stop this project"))));

  /* who's doing what */
  const unassigned = tasks.filter(t => !t.owner && !t.done);
  box.append(el("div", { class: "row", style: "margin:22px 0 10px" }, el("h2", {}, "Who's doing what"), el("span", { class: "spacer" }),
    unassigned.length ? el("span", { class: "label" }, `${unassigned.length} task${unassigned.length > 1 ? "s" : ""} not assigned`) : null));
  if (suggestions[fp.id]) box.append(suggestPanel(fp));
  const grid = el("div", { class: "members" });
  if (!members.length) grid.append(el("div", { class: "empty" }, "Press “Join the team” to get your own task list. Everyone who joins gets a column here."));
  for (const m of members) {
    const mine = tasks.filter(t => t.owner === m);
    const pr = progressOf(mine);
    grid.append(el("article", { class: "idea member" + (m === me ? " me" : "") },
      el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, av(m), name(m), el("span", { class: "spacer" }),
        ...topSkills(m).slice(0, 1).map(s => el("span", { class: "chip" }, SKILLS[s].name))),
      line(pr, "tasks"),
      mine.length ? el("ul", { class: "steps" }, mine.map(t => {
        const cid = "m-" + t.id; return el("li", { class: t.done ? "done" : "" },
          el("input", { type: "checkbox", id: cid, checked: t.done, onchange: e => write(() => upd(fp.id, { [t.path + ".done"]: e.target.checked })) }),
          el("label", { for: cid }, t.text, t.due ? el("span", { class: "label", style: "display:block;margin-top:4px" }, "Due " + fmtDate(t.due)) : null))
      })) : el("p", {}, "No tasks yet. Assign some in the plan below.")));
  }
  if (unassigned.length) grid.append(el("article", { class: "idea" },
    el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, "Not assigned yet"),
    el("ul", { class: "steps" }, unassigned.slice(0, 8).map(t => el("li", {}, el("span", {}, t.text)))),
    unassigned.length > 8 ? el("p", {}, `+${unassigned.length - 8} more in the plan`) : null,
    el("button", { class: "btn primary", onclick: () => runSuggest(fp) }, "Suggest who does what")));
  box.append(grid);

  box.append(el("div", { class: "row", style: "margin:26px 0 4px" }, el("h2", {}, "The plan, A to Z")));
  box.append(planBody(fp, { hideSuggest: true }));
}

/* ----- ideas ----- */

const NEW = "__new";
const allCats = () => {
  const base = CATEGORIES.filter(c => c !== "Other");
  const custom = [...new Set(ideas.map(i => i.category).filter(c => c && !CATEGORIES.includes(c)))].sort((a, b) => a.localeCompare(b));
  return [...base, ...custom, "Other"];
};
const catOptions = () => [...allCats().map(c => el("option", { value: c }, c)), el("option", { value: NEW }, "+ New category\u2026")];
function fillComposeCats() {
  const sel = $("#f-cat"), v = sel.value;
  sel.replaceChildren(el("option", { value: "" }, "Pick a category\u2026"), ...catOptions());
  sel.value = v;
}
$("#f-cat").addEventListener("change", e => {
  const n = $("#f-newcat"); n.hidden = e.target.value !== NEW; n.required = !n.hidden;
  if (!n.hidden) n.focus();
});
fillComposeCats();
const catFilter = { ideas: "", projects: "" };
function catBar(where, list) {
  const box = $("#cat-" + where); box.replaceChildren();
  const used = allCats().filter(c => list.some(i => (i.category || "Other") === c));
  if (used.length < 2 && !catFilter[where]) return list;
  const pick = c => { catFilter[where] = catFilter[where] === c ? "" : c; render() };
  box.append(el("button", { class: "cat", "aria-pressed": String(!catFilter[where]), onclick: () => pick("") }, `All ${list.length}`),
    ...used.map(c => el("button", { class: "cat", "aria-pressed": String(catFilter[where] === c), onclick: () => pick(c) }, `${c} ${list.filter(i => (i.category || "Other") === c).length}`)));
  return catFilter[where] ? list.filter(i => (i.category || "Other") === catFilter[where]) : list;
}
function cleanCat(raw) {
  const t = (raw || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!t) return "";
  return allCats().find(c => c.toLowerCase() === t.toLowerCase()) || t.charAt(0).toUpperCase() + t.slice(1);
}
const catChip = i => el("span", { class: "catchip" }, i.category || "No category");

$("#compose").addEventListener("submit", ev => {
  ev.preventDefault();
  const title = $("#f-title").value.trim(), pitch = $("#f-pitch").value.trim();
  let category = $("#f-cat").value;
  if (category === NEW) category = cleanCat($("#f-newcat").value);
  if (!title || !category) return;
  write(() => setDoc(doc(db, "ideas", uid()), { title, pitch, category, author: me, createdAt: Date.now(), status: "voting", votes: { [me]: "keep" }, tasks: {}, backers: {} }), "Idea added to the vote");
  $("#f-title").value = ""; $("#f-pitch").value = ""; $("#f-cat").value = ""; $("#f-newcat").value = ""; $("#f-newcat").hidden = true; $("#f-newcat").required = false;
});

function renderIdeas(all, removed) {
  const box = $("#ideas"); box.replaceChildren();
  const voting = catBar("ideas", all);
  if (all.length && !voting.length) box.append(el("div", { class: "empty" }, "No ideas in this category."));
  else if (!voting.length) box.append(el("div", { class: "empty" }, "No ideas waiting for a vote. Pitch the first one above."));
  for (const i of voting) {
    const { k, d } = tally(i); const mine = (i.votes || {})[me];
    const vote = kind => write(() => upd(i.id, { ["votes." + me]: mine === kind ? DEL() : kind }));
    const vb = (kind, label, count) => el("button", { class: "v " + kind, "aria-pressed": String(mine === kind), onclick: () => vote(kind) }, label, el("b", {}, count), el("span", { class: "stack" }, voters(i, kind).slice(0, 5).map(av)));
    const verdict = k > d ? el("span", { class: "verdict keep" }, "Leaning keep") : d > k ? el("span", { class: "verdict drop" }, "Leaning drop") : el("span", { class: "verdict" }, "Tied");
    box.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("h3", { style: "flex:1 1 auto;min-width:0" }, i.title), catChip(i)),
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
}

/* ----- projects list ----- */

function renderProjects(all) {
  const box = $("#projects"); box.replaceChildren();
  const projects = catBar("projects", all);
  if (all.length && !projects.length) box.append(el("div", { class: "empty" }, "No projects in this category."));
  else if (!projects.length) box.append(el("div", { class: "empty" }, "No confirmed projects yet. Ideas land here once more people vote keep than drop and someone confirms them."));
  for (const p of projects) {
    const tasks = tasksOf(p), backed = !!(p.backers || {})[me];
    const backers = Object.entries(p.backers || {}).filter(([, v]) => v).map(([u]) => u);
    box.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("h3", { style: "flex:1 1 auto;min-width:0" }, p.title), catChip(p), p.id === focusId ? el("span", { class: "pill" }, "Current project") : null),
      p.pitch ? el("p", {}, p.pitch) : null,
      line(progressOf(tasks), "tasks"),
      tasks.length ? phaseBar(tasks) : null,
      el("div", { class: "row" },
        el("button", { class: "v keep", "aria-pressed": String(backed), onclick: () => write(() => upd(p.id, { ["backers." + me]: backed ? DEL() : true })) }, "I want to build this", el("b", {}, backers.length), el("span", { class: "stack" }, backers.slice(0, 6).map(av))),
        el("span", { class: "spacer" }),
        el("button", { class: "btn" + (tasks.length ? "" : " primary"), onclick: () => { location.hash = "plan-" + p.id } }, tasks.length ? "Open the plan" : "Start planning"),
        p.id === focusId ? null : el("button", { class: "btn primary", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: p.id, setBy: me, at: Date.now() }), "This is our project now") }, "Make it our project"))));
  }
}

/* ----- plan page ----- */

function renderPlanPage(p) {
  const box = $("#plan"); box.replaceChildren();
  box.append(el("button", { class: "back", onclick: () => { location.hash = "projects" } }, "← All projects"));
  if (!p) { box.append(el("div", { class: "empty" }, "This project isn't on the board anymore.")); return }
  const tasks = tasksOf(p);
  box.append(el("article", { class: "idea" },
    el("div", { class: "row" }, el("h2", { style: "flex:1 1 auto;min-width:0" }, p.title), p.id === focusId ? el("span", { class: "pill" }, "Current project") : null),
    p.pitch ? el("p", {}, p.pitch) : null,
    catSelect(p),
    line(progressOf(tasks), "tasks"),
    tasks.length ? phaseBar(tasks) : null,
    p.id === focusId ? null : el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("button", { class: "btn primary", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: p.id, setBy: me, at: Date.now() }), "This is our project now") }, "Make it our project"))));
  box.append(planBody(p));
}

let newCatFor = null;
function catSelect(p) {
  const wrapStyle = "gap:8px;font-size:13px;color:var(--muted)";
  if (newCatFor === p.id) {
    const inp = el("input", { id: "newcat-" + p.id, class: "mini", maxlength: "30", placeholder: "New category name", style: "padding:6px 8px;font-size:13px" });
    const save = () => { const c = cleanCat(inp.value); if (!c) return; newCatFor = null; write(() => upd(p.id, { category: c }), "Category changed") };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } if (e.key === "Escape") { newCatFor = null; render() } });
    setTimeout(() => inp.focus(), 0);
    return el("div", { class: "row", style: wrapStyle }, "Category", inp, el("button", { class: "btn", onclick: save }, "Save"), el("button", { class: "btn quiet", onclick: () => { newCatFor = null; render() } }, "Cancel"));
  }
  const sel = el("select", { class: "mini", "aria-label": "Category", onchange: e => {
    if (e.target.value === NEW) { newCatFor = p.id; render(); return }
    write(() => upd(p.id, { category: e.target.value }), "Category changed");
  } }, !p.category ? el("option", { value: "" }, "Pick a category\u2026") : null, catOptions());
  sel.value = p.category || "";
  return el("label", { class: "row", style: wrapStyle }, "Category", sel);
}

function planBody(p, opts = {}) {
  const tasks = tasksOf(p);
  const wrap = el("div", { style: "display:grid;gap:14px;margin-top:14px" });
  const unassigned = tasks.filter(t => !t.owner && !t.done).length;
  const tools = el("div", { class: "row" });
  if (!tasks.length) tools.append(el("p", { style: "margin:0;color:var(--muted);flex:1 1 260px" }, "No plan yet. Start from our A-to-Z template and edit it, or add tasks one by one below."),
    el("button", { class: "btn primary", onclick: () => addTemplate(p) }, "Fill in a starter plan"));
  else if (!opts.hideSuggest && unassigned) tools.append(el("span", { style: "color:var(--muted);font-size:14px" }, `${unassigned} task${unassigned > 1 ? "s" : ""} not assigned yet.`), el("span", { class: "spacer" }),
    el("button", { class: "btn primary", onclick: () => runSuggest(p) }, "Suggest who does what"));
  if (tools.childNodes.length) wrap.append(tools);
  if (!opts.hideSuggest && suggestions[p.id]) wrap.append(suggestPanel(p));

  PHASES.forEach((ph, n) => {
    const list = tasks.filter(t => t.phase === ph.id);
    const pr = progressOf(list);
    const sec = el("section", { class: "idea phase" },
      el("div", { class: "phase-h" }, el("span", { class: "phase-n" }, `${n + 1}/6`), el("h3", {}, ph.name), el("span", { style: "color:var(--muted);font-size:13px" }, ph.hint), el("span", { class: "spacer" }),
        list.length ? el("span", { class: "label" }, `${pr.done}/${pr.total}`) : null),
      ...list.map(t => taskRow(p, t)));
    const tid = `add-${p.id}-${ph.id}`;
    const inp = el("input", { id: tid, placeholder: "Add a task", maxlength: "140" });
    const sk = el("select", { class: "mini", id: tid + "-sk", "aria-label": "Skill needed" }, el("option", { value: "" }, "Skill…"), SKILL_IDS.map(s => el("option", { value: s }, SKILLS[s].name)));
    const add = () => { const text = inp.value.trim(); if (!text) return; inp.value = ""; write(() => upd(p.id, { ["tasks." + uid()]: { text, phase: ph.id, skill: sk.value || null, owner: null, done: false, order: Date.now(), due: null } })) };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
    sec.append(el("div", { class: "addtask" }, inp, sk, el("button", { class: "btn", onclick: add }, "Add")));
    wrap.append(sec);
  });
  return wrap;
}

function taskRow(p, t) {
  const cid = "t-" + t.id;
  const ownerSel = el("select", { class: "mini", "aria-label": "Who's doing it", onchange: e => write(() => upd(p.id, { [t.path + ".owner"]: e.target.value || null })) },
    el("option", { value: "", selected: !t.owner }, "Unassigned"),
    teamIds().map(u => el("option", { value: u, selected: t.owner === u }, name(u))));
  const skillSel = el("select", { class: "mini", "aria-label": "Skill needed", onchange: e => write(() => upd(p.id, { [t.path + ".skill"]: e.target.value || null })) },
    el("option", { value: "", selected: !t.skill }, "Any skill"),
    SKILL_IDS.map(s => el("option", { value: s, selected: t.skill === s }, SKILLS[s].name)));
  ownerSel.value = t.owner || ""; skillSel.value = t.skill || "";
  const due = el("input", { type: "date", class: "mini", "aria-label": "Due date", value: t.due || "", onchange: e => write(() => upd(p.id, { [t.path + ".due"]: e.target.value || null })) });
  return el("div", { class: "task" + (t.done ? " done" : "") },
    el("input", { type: "checkbox", id: cid, checked: t.done, onchange: e => write(() => upd(p.id, { [t.path + ".done"]: e.target.checked })) }),
    el("label", { for: cid, class: "ttext" }, t.text),
    el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => write(() => upd(p.id, { [t.path]: DEL() })) }, "✕"),
    el("div", { class: "meta" }, t.owner ? av(t.owner) : null, ownerSel, skillSel, due));
}

function addTemplate(p) {
  const base = Date.now(); const data = {};
  TEMPLATE.forEach(([phase, text, skill], n) => data["tasks." + uid() + n] = { text, phase, skill, owner: null, done: false, order: base + n, due: null });
  write(() => upd(p.id, data), "Starter plan added. Edit it however you like");
}

function runSuggest(p) {
  const list = suggest(p);
  if (!list.length) { toast("Everything's already assigned"); return }
  suggestions[p.id] = list; render();
}

function suggestPanel(p) {
  const list = suggestions[p.id] || [];
  const noQuiz = teamIds().filter(u => !(people[u] || {}).skills);
  return el("div", { class: "suggest" },
    el("div", { class: "row" }, el("h3", {}, "Suggested split"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Based on the skills quiz")),
    noQuiz.length ? el("p", { style: "margin:0;font-size:13px;color:var(--muted)" }, `${noQuiz.map(firstName).join(", ")} ${noQuiz.length > 1 ? "haven't" : "hasn't"} taken the skills quiz yet, so these picks are rougher. Take it on the Skills tab for better matches.`) : null,
    ...list.map(s => el("div", { class: "sg-row" },
      el("span", {}, s.task.text),
      el("span", { class: "sg-who" }, av(s.owner), name(s.owner)),
      el("span", { class: "why" }, s.why))),
    el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("button", { class: "btn quiet", onclick: () => { delete suggestions[p.id]; render() } }, "Dismiss"),
      el("button", { class: "btn primary", onclick: () => {
        const data = {}; for (const s of list) data[s.task.path + ".owner"] = s.owner;
        delete suggestions[p.id];
        write(() => upd(p.id, data), "Tasks assigned");
      } }, "Assign all")));
}

/* ----- skills ----- */

function renderSkills() {
  const box = $("#skills"); box.replaceChildren();
  const mine = people[me] || {};
  if (quiz || !mine.skills) box.append(quizCard());
  else box.append(myResults(mine));

  box.append(el("div", { class: "row", style: "margin:26px 0 10px" }, el("h2", {}, "The team's skills")));
  const grid = el("div", { class: "members" });
  for (const u of teamIds()) {
    const prof = people[u] || {};
    const tops = topSkills(u);
    grid.append(el("article", { class: "idea" + (u === me ? " member me" : "") },
      el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, av(u), name(u)),
      prof.skills ? el("div", { class: "row", style: "gap:6px" }, tops.map(s => el("span", { class: "chip" }, SKILLS[s].name))) : el("p", {}, "Hasn't taken the quiz yet."),
      prof.skills ? bars(prof.skills, 3) : null,
      prof.grow && prof.grow.length ? el("p", { style: "font-size:13px" }, "Wants to get better at: " + prof.grow.map(s => SKILLS[s].name).join(", ")) : null));
  }
  box.append(grid);
}

function quizCard() {
  if (!quiz) quiz = { i: 0, answers: [], grow: [] };
  const card = el("section", { class: "idea", style: "gap:14px" });
  if (quiz.i < QUIZ.length) {
    const item = QUIZ[quiz.i];
    card.append(
      el("div", { class: "qprog" }, el("span", {}, "Skills quiz"), el("span", {}, `${quiz.i + 1} / ${QUIZ.length}`)),
      el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pctOf(quiz.i, QUIZ.length)}%` })),
      el("h2", {}, item.q),
      el("p", {}, "Pick the one that sounds most like you. There are no wrong answers."),
      el("div", { class: "opts" }, item.a.map(([text, skill], n) => el("button", { class: "opt", "aria-pressed": String(quiz.answers[quiz.i] === n), onclick: () => { quiz.answers[quiz.i] = n; quiz.i++; render() } }, text))),
      el("div", { class: "row" },
        quiz.i > 0 ? el("button", { class: "btn quiet", onclick: () => { quiz.i--; render() } }, "← Back") : null,
        el("span", { class: "spacer" }),
        (people[me] || {}).skills ? el("button", { class: "btn quiet", onclick: () => { quiz = null; render() } }, "Cancel") : null));
  } else {
    card.append(
      el("div", { class: "qprog" }, el("span", {}, "Last question"), el("span", {}, "Optional")),
      el("h2", {}, "What do you want to get better at?"),
      el("p", {}, "Pick up to 2. The helper will sometimes give you tasks in these so you can level up."),
      el("div", { class: "opts" }, SKILL_IDS.map(s => el("button", { class: "opt", "aria-pressed": String(quiz.grow.includes(s)), onclick: () => {
        if (quiz.grow.includes(s)) quiz.grow = quiz.grow.filter(x => x !== s);
        else if (quiz.grow.length < 2) quiz.grow.push(s);
        render();
      } }, el("strong", {}, SKILLS[s].name), " — ", SKILLS[s].about))),
      el("div", { class: "row" },
        el("button", { class: "btn quiet", onclick: () => { quiz.i--; render() } }, "← Back"),
        el("span", { class: "spacer" }),
        el("button", { class: "btn primary", onclick: saveQuiz }, "See my results")));
  }
  return card;
}

function saveQuiz() {
  const count = Object.fromEntries(SKILL_IDS.map(s => [s, 0]));
  quiz.answers.forEach((n, qi) => { if (n != null) count[QUIZ[qi].a[n][1]]++ });
  const skills = Object.fromEntries(SKILL_IDS.map(s => [s, Math.round(count[s] / QUIZ_MAX[s] * 100) / 100]));
  const grow = quiz.grow.slice();
  quiz = null;
  people[me] = { ...(people[me] || {}), skills, grow };
  write(() => setDoc(doc(db, "users", me), { skills, grow, quizAt: Date.now() }, { merge: true }), "Results saved");
}

function myResults(prof) {
  const tops = topSkills(me);
  return el("section", { class: "focus" },
    el("div", { class: "label" }, "Your strengths"),
    el("div", { class: "role" }, tops.map(s => SKILLS[s].name).join(" + ")),
    el("p", { style: "margin:0;opacity:.85;max-width:60ch" }, tops.map(s => SKILLS[s].about).join(". ") + "."),
    bars(prof.skills),
    prof.grow && prof.grow.length ? el("p", { style: "margin:0;opacity:.85" }, "You want to get better at: " + prof.grow.map(s => SKILLS[s].name).join(", ")) : null,
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn", onclick: () => { quiz = { i: 0, answers: [], grow: (prof.grow || []).slice() }; render() } }, "Retake the quiz")));
}

function bars(skills, limit) {
  const order = SKILL_IDS.slice().sort((a, b) => (skills[b] || 0) - (skills[a] || 0)).slice(0, limit || SKILL_IDS.length);
  return el("div", { class: "bars" }, order.map((s, n) => {
    const v = Math.round((skills[s] || 0) * 100);
    return el("div", { class: "bar" + (n < 2 ? " top" : "") }, el("span", {}, SKILLS[s].name),
      el("div", { class: "track" }, el("div", { class: "fill", style: `width:${v}%` })), el("span", { class: "pct" }, v + "%"));
  }));
}

/* ----- shared bits ----- */

function phaseBar(tasks) {
  return el("div", { class: "phasebar" }, PHASES.map((ph, n) => {
    const list = tasks.filter(t => t.phase === ph.id); const pr = progressOf(list);
    return el("span", { class: "ph" + (pr.total && pr.done === pr.total ? " complete" : "") }, `${n + 1} ${ph.name} ${pr.done}/${pr.total}`);
  }));
}

function fmtDate(d) { try { return new Date(d + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) } catch { return d } }

function line(pr, unit) {
  const t = el("div", { class: "track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": pr.pct, "aria-label": "Progress" }, el("div", { class: "fill", style: `width:${pr.pct}%` }));
  if (pr.total <= 30) for (let i = 1; i < pr.total; i++) t.append(el("span", { class: "tick", style: `left:calc(${i / pr.total * 100}% - 1px)` }));
  return el("div", { style: "display:grid;gap:6px" }, t, el("div", { class: "pmeta" }, el("span", {}, pr.total ? `${pr.done} of ${pr.total} ${unit} done` : `No ${unit} yet`), el("span", {}, pr.pct + "%")));
}

show();
