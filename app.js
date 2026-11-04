import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limitToLast, getDoc, Bytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
// Keep a copy of the board on this device so reloads show it instantly.
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const remember = v => { try { v ? localStorage.setItem("signedIn", "1") : localStorage.removeItem("signedIn") } catch { } };

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

// Only these accounts can choose or stop the current project.
const ADMINS = ["mohammedd.alajmiii@gmail.com"];
const ADMIN_NAME = "Mohammed";

const CATEGORIES = ["App", "Website", "Game", "Video / YouTube", "Music", "Business", "Event", "Art & Design", "Social media", "School", "Sports", "Other"];

// Plans made before custom phases existed used these six.
const OLD_PHASES = [["goal", "Goal"], ["research", "Research"], ["design", "Design"], ["build", "Build"], ["test", "Test"], ["launch", "Launch"]];

// Starting points for a plan. They only add phase names; planners rename, reorder and fill them.
const PLAN_TEMPLATES = [
  { name: "App or website", phases: ["Goal", "Research", "Design", "Build", "Test", "Launch"] },
  { name: "Video or content", phases: ["Idea", "Script", "Filming", "Editing", "Posting"] },
  { name: "Event", phases: ["Plan", "Venue & date", "Invites", "Prep", "Event day", "Wrap-up"] },
  { name: "Business", phases: ["Idea", "Research", "Product", "Branding", "Selling"] },
  { name: "Music", phases: ["Idea", "Writing", "Recording", "Mixing", "Release"] },
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

const VIEWS = ["current", "ideas", "projects", "skills", "chat", "plan"];
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

let isAdmin = false;
let ideas = [], focusId = null, me = null, people = {}, unsubs = [];
const suggestions = {};          // projectId -> [{task, owner, why}]
let quiz = null;                 // {i, answers:[], grow:[]} while taking the quiz

onAuthStateChanged(auth, u => {
  unsubs.forEach(f => f()); unsubs = [];
  $("#boot").hidden = true;
  if (!u) { me = null; remember(false); $("#gate").hidden = false; $("#app").hidden = true; $("#account").hidden = true; return }
  remember(true);
  me = u.uid;
  isAdmin = ADMINS.includes((u.email || "").toLowerCase());
  $("#gate").hidden = true; $("#app").hidden = false; $("#account").hidden = false;
  $("#me-chip").replaceChildren(el("img", { class: "av", src: u.photoURL || AV, alt: "", referrerpolicy: "no-referrer" }), u.displayName || u.email);
  status("Loading the board…");
  setDoc(doc(db, "users", me), { name: u.displayName || u.email, photo: u.photoURL || "" }, { merge: true }).catch(() => {});
  const denied = e => {
    if (e.code === "permission-denied") {
      signOut(auth);
      $("#gate-msg").textContent = u.emailVerified === false
        ? `You signed in as ${u.email}, but Google says that email isn't verified yet. Verify it in your Google account, then sign in again.`
        : `You signed in as ${u.email}, which isn't on the team list. Ask Mohammed to add exactly this email, or sign in with the account he added.`;
    } else status("The board stopped updating. Reload the page to reconnect.", true);
  };
  unsubs.push(onSnapshot(collection(db, "ideas"), s => { ideas = s.docs.map(d => ({ id: d.id, ...d.data() })); status(""); render() }, denied));
  unsubs.push(onSnapshot(doc(db, "meta", "focus"), s => { focusId = s.exists() ? s.data().projectId : null; render() }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "chat"), orderBy("at"), limitToLast(300)), s => {
    const before = chat.length ? chat[chat.length - 1].at : 0;
    chat = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const newest = chat.length ? chat[chat.length - 1] : null;
    if (before && newest && newest.at > before && newest.by !== me && route().view !== "chat") toast(`${firstName(newest.by)}: ${msgSummary(newest).slice(0, 60)}`);
    render();
  }, () => {}));
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
  renderChat();
}

/* ----- current project (home) ----- */

function renderCurrent(projects) {
  const box = $("#current"); box.replaceChildren();
  const fp = projects.find(p => p.id === focusId);
  if (!fp) {
    const top = byVotes(projects).slice(0, 3);
    box.append(el("div", { class: "empty" }, el("h3", {}, "No current project yet"),
      el("p", { style: "margin:6px auto 14px;max-width:48ch" }, isAdmin
        ? "Everyone votes on the Projects tab. When you're ready, press \u201cMake it our project\u201d on the one you choose."
        : `Vote on the Projects tab for the ones you want to build. ${ADMIN_NAME} picks the current project.`),
      el("button", { class: "btn primary", onclick: () => { location.hash = "projects" } }, isAdmin ? "Go to Projects" : "Vote on projects")));
    if (top.length) {
      box.append(el("div", { class: "row", style: "margin:22px 0 10px" }, el("h2", {}, "Most votes so far")));
      box.append(el("div", { class: "list", style: "margin-top:0" }, top.map((p, n) => el("article", { class: "idea" },
        el("div", { class: "row" }, el("span", { class: "label" }, `#${n + 1}`), el("h3", { style: "flex:1 1 auto;min-width:0" }, p.title), catChip(p)),
        el("div", { class: "row" }, voteButton(p), el("span", { class: "spacer" }), pickButton(p))))));
    }
    return;
  }
  const tasks = tasksOf(fp);
  const memberSet = new Set(Object.entries(fp.members || {}).filter(([, v]) => v).map(([u]) => u));
  for (const t of tasks) if (t.owner) memberSet.add(t.owner);
  const members = [...memberSet].sort((a, b) => a === me ? -1 : b === me ? 1 : 0);
  const joined = !!(fp.members || {})[me];

  box.append(el("section", { class: "focus" },
    el("div", { class: "label" }, `Picked by ${ADMIN_NAME}` + (fp.category ? " \u00b7 " + fp.category : "")),
    el("h2", {}, fp.title),
    fp.pitch ? el("p", { style: "margin:0;opacity:.8;max-width:65ch" }, fp.pitch) : null,
    line(progressOf(tasks), "tasks"),
    phaseBar(fp, tasks),
    el("div", { class: "row" },
      el("span", { class: "stack" }, members.slice(0, 8).map(av)),
      el("span", { style: "font-size:13px;opacity:.8" }, members.length ? `${members.length} on the team` : "Nobody has joined yet"),
      el("span", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => write(() => upd(fp.id, { ["members." + me]: joined ? DEL() : true }), joined ? "You left the team" : "You joined the team") }, joined ? "Leave team" : "Join the team"),
      isAdmin ? el("button", { class: "btn quiet", style: "color:inherit;opacity:.75", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: null }), "No current project") }, "Stop this project") : null)));

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
          el("input", { type: "checkbox", id: cid, checked: t.done, disabled: !(t.owner === me || canPlan(fp)), onchange: e => toggleDone(fp, t, e.target.checked) }),
          el("div", { style: "flex:1;min-width:0;display:grid;gap:6px" },
            el("label", { for: cid }, t.text, t.due ? el("span", { class: "label", style: "display:block;margin-top:4px" }, "Due " + fmtDate(t.due)) : null),
            notesBlock(fp, t, "m")))
      })) : el("p", {}, "No tasks yet. Assign some in the plan below.")));
  }
  if (unassigned.length) grid.append(el("article", { class: "idea" },
    el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, "Not assigned yet"),
    el("ul", { class: "steps" }, unassigned.slice(0, 8).map(t => el("li", {}, el("span", {}, t.text)))),
    unassigned.length > 8 ? el("p", {}, `+${unassigned.length - 8} more in the plan`) : null,
    canPlan(fp) ? el("button", { class: "btn primary", onclick: () => runSuggest(fp) }, "Suggest who does what") : null));
  box.append(grid);

  box.append(el("div", { class: "row", style: "margin:26px 0 4px" }, el("h2", {}, "The plan")));
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
  const ranked = byVotes(all);
  const rank = Object.fromEntries(ranked.map((p, n) => [p.id, n + 1]));
  const projects = catBar("projects", ranked);
  if (all.length) box.append(el("p", { style: "margin:0;color:var(--muted);font-size:14px" },
    isAdmin ? "Everyone votes for the projects they want to build. You pick the current project." : `Vote for the projects you want to build. ${ADMIN_NAME} picks the current project.`));
  if (all.length && !projects.length) box.append(el("div", { class: "empty" }, "No projects in this category."));
  else if (!projects.length) box.append(el("div", { class: "empty" }, "No confirmed projects yet. Ideas land here once more people vote keep than drop and someone confirms them."));
  for (const p of projects) {
    const tasks = tasksOf(p), n = projectVoters(p).length;
    box.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("span", { class: "label" }, `#${rank[p.id]} \u00b7 ${n} vote${n === 1 ? "" : "s"}`)),
      el("div", { class: "row" }, el("h3", { style: "flex:1 1 auto;min-width:0" }, p.title), catChip(p), p.id === focusId ? el("span", { class: "pill" }, "Current project") : null),
      p.pitch ? el("p", {}, p.pitch) : null,
      line(progressOf(tasks), "tasks"),
      phaseBar(p, tasks),
      el("div", { class: "row" },
        voteButton(p),
        el("span", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => { location.hash = "plan-" + p.id } }, tasks.length ? "Open the plan" : "Start planning"),
        pickButton(p))));
  }
}

/* ----- project votes ----- */

const projectVoters = p => Object.entries(p.backers || {}).filter(([, v]) => v).map(([u]) => u);
const byVotes = list => list.slice().sort((a, b) => projectVoters(b).length - projectVoters(a).length || (a.approvedAt || 0) - (b.approvedAt || 0));
function voteButton(p) {
  const voted = !!(p.backers || {})[me], vs = projectVoters(p);
  return el("button", { class: "v keep", "aria-pressed": String(voted), onclick: () => write(() => upd(p.id, { ["backers." + me]: voted ? DEL() : true }), voted ? "Vote removed" : "Voted") },
    voted ? "Voted" : "Vote for this", el("b", {}, vs.length), el("span", { class: "stack" }, vs.slice(0, 6).map(av)));
}
const pickButton = p => isAdmin && p.id !== focusId
  ? el("button", { class: "btn primary", onclick: () => write(() => setDoc(doc(db, "meta", "focus"), { projectId: p.id, setBy: me, at: Date.now() }), "This is our project now") }, "Make it our project")
  : null;

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
    plannersRow(p),
    line(progressOf(tasks), "tasks"),
    phaseBar(p, tasks),
    el("div", { class: "row" }, voteButton(p), el("span", { class: "spacer" }), pickButton(p))));
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
  const tasks = tasksOf(p), phases = getPhases(p), planner = canPlan(p);
  const wrap = el("div", { style: "display:grid;gap:14px;margin-top:14px" });

  if (!phases.length) {
    if (!planner) {
      wrap.append(el("div", { class: "empty" }, el("h3", {}, "No plan yet"),
        el("p", { style: "margin:6px auto 0;max-width:46ch" }, `${name(p.author)} and the planners will add the phases and tasks here.`)));
      return wrap;
    }
    const suggested = templateFor(p.category);
    const card = el("section", { class: "idea", style: "gap:14px" },
      el("h3", {}, "Build the plan"),
      el("p", {}, "Split the project into phases, the big stages it goes through. Then add tasks inside each phase and give each one to someone. Start from scratch, or use one of these as a starting point and change anything:"),
      el("div", { class: "row", style: "gap:8px" }, PLAN_TEMPLATES.map(tp => el("button", { class: "btn" + (tp === suggested ? " primary" : ""), title: tp.phases.join(" → "), onclick: () => usePlanTemplate(p, tp) }, tp.name))),
      el("p", { style: "font-size:13px" }, "Each one only adds phase names, like " + suggested.phases.join(" → ") + ". You add the tasks."),
      addPhaseRow(p, phases, "Or type your first phase, e.g. Brainstorm"));
    wrap.append(card);
    return wrap;
  }

  const unassigned = tasks.filter(t => !t.owner && !t.done).length;
  if (planner && !opts.hideSuggest && unassigned) wrap.append(el("div", { class: "row" },
    el("span", { style: "color:var(--muted);font-size:14px" }, `${unassigned} task${unassigned > 1 ? "s" : ""} not assigned yet.`), el("span", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => runSuggest(p) }, "Suggest who does what")));
  if (!opts.hideSuggest && suggestions[p.id]) wrap.append(suggestPanel(p));

  const known = new Set(phases.map(ph => ph.id));
  const loose = tasks.filter(t => !known.has(t.phase));
  phases.forEach((ph, n) => wrap.append(phaseCard(p, ph, n, phases, tasks.filter(t => t.phase === ph.id))));
  if (loose.length) wrap.append(phaseCard(p, { id: "__loose", name: "Not in a phase" }, -1, phases, loose));
  if (planner) wrap.append(el("section", { class: "idea addphase" }, el("h3", {}, "Add a phase"), addPhaseRow(p, phases, "Phase name, e.g. Filming")));
  return wrap;
}

function phaseCard(p, ph, n, phases, list) {
  const planner = canPlan(p), pr = progressOf(list), loose = ph.id === "__loose";
  const head = el("div", { class: "phase-h" });
  if (renamingPhase === p.id + ph.id) {
    const inp = el("input", { id: "rename-" + ph.id, class: "mini", value: ph.name, maxlength: "40", style: "font-size:15px;padding:6px 8px;flex:1 1 160px" });
    const save = () => { const v = inp.value.trim(); renamingPhase = null; if (v && v !== ph.name) write(() => phaseWrite(p, { [`phases.${ph.id}.name`]: v })); else render() };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } if (e.key === "Escape") { renamingPhase = null; render() } });
    setTimeout(() => { inp.focus(); inp.select() }, 0);
    head.append(inp, el("button", { class: "btn", onclick: save }, "Save"), el("button", { class: "btn quiet", onclick: () => { renamingPhase = null; render() } }, "Cancel"));
  } else {
    head.append(...[
      loose ? null : el("span", { class: "phase-n" }, `${n + 1}/${phases.length}`),
      el("h3", {}, ph.name),
      ph.due ? el("span", { class: "chip" }, "By " + fmtDate(ph.due)) : null,
      el("span", { class: "spacer" }),
      list.length ? el("span", { class: "label" }, `${pr.done}/${pr.total} done`) : null].filter(Boolean));
  }
  const sec = el("section", { class: "idea phase" }, head);
  if (planner && !loose && renamingPhase !== p.id + ph.id) {
    const due = el("input", { type: "date", class: "mini", "aria-label": "Finish this phase by", value: ph.due || "", onchange: e => write(() => phaseWrite(p, { [`phases.${ph.id}.due`]: e.target.value || null })) });
    const tools = el("div", { class: "phase-tools" },
      el("label", { class: "row", style: "gap:6px" }, "Finish by", due),
      el("span", { class: "spacer" }),
      n > 0 ? el("button", { class: "linkbtn", "aria-label": "Move phase up", onclick: () => movePhase(p, phases, n, -1) }, "↑ Up") : null,
      n < phases.length - 1 ? el("button", { class: "linkbtn", "aria-label": "Move phase down", onclick: () => movePhase(p, phases, n, 1) }, "↓ Down") : null,
      el("button", { class: "linkbtn", onclick: () => { renamingPhase = p.id + ph.id; render() } }, "Rename"),
      delPhase === p.id + ph.id
        ? el("button", { class: "linkbtn danger", onclick: () => deletePhase(p, ph, list) }, list.length ? `Delete phase and its ${list.length} task${list.length > 1 ? "s" : ""}` : "Tap again to delete")
        : el("button", { class: "linkbtn danger", onclick: () => { delPhase = p.id + ph.id; render() } }, "Delete"));
    sec.append(tools);
  }
  if (!list.length) sec.append(el("p", { style: "font-size:14px" }, planner ? "No tasks in this phase yet. Add the first one below." : "No tasks in this phase yet."));
  for (const t of list) sec.append(taskRow(p, t, phases));
  if (planner && !loose) sec.append(addTaskRow(p, ph));
  return sec;
}

function addTaskRow(p, ph) {
  const tid = `add-${p.id}-${ph.id}`;
  const inp = el("input", { id: tid, placeholder: "Add a task in " + ph.name, maxlength: "140" });
  const who = el("select", { class: "mini", id: tid + "-who", "aria-label": "Who does it" }, el("option", { value: "" }, "Who?"), teamIds().map(u => el("option", { value: u }, name(u))));
  const sk = el("select", { class: "mini", id: tid + "-sk", "aria-label": "Skill needed" }, el("option", { value: "" }, "Skill…"), SKILL_IDS.map(s => el("option", { value: s }, SKILLS[s].name)));
  const add = () => {
    const text = inp.value.trim(); if (!text) return; inp.value = "";
    write(() => upd(p.id, { ["tasks." + uid()]: { text, phase: ph.id, skill: sk.value || null, owner: who.value || null, done: false, order: Date.now(), due: null } }));
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  return el("div", { class: "addtask" }, inp, who, sk, el("button", { class: "btn", onclick: add }, "Add"));
}

function addPhaseRow(p, phases, placeholder) {
  const inp = el("input", { id: "addphase-" + p.id, placeholder, maxlength: "40" });
  const add = () => {
    const v = inp.value.trim(); if (!v) return; inp.value = "";
    const order = phases.length ? Math.max(...phases.map(x => x.order || 0)) + 1 : 1;
    write(() => phaseWrite(p, { ["phases." + uid()]: { name: v, order, due: null } }), "Phase added");
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  return el("div", { class: "addtask" }, inp, el("button", { class: "btn primary", onclick: add }, "Add phase"));
}

function taskRow(p, t, phases) {
  const cid = "t-" + t.id, planner = canPlan(p), mineOrPlanner = planner || t.owner === me;
  const check = el("input", { type: "checkbox", id: cid, checked: t.done, disabled: !mineOrPlanner, title: mineOrPlanner ? "" : "Only the person doing it or a planner can tick this", onchange: e => toggleDone(p, t, e.target.checked) });
  let meta;
  if (planner) {
    const ownerSel = el("select", { class: "mini", "aria-label": "Who's doing it", onchange: e => write(() => upd(p.id, { [t.path + ".owner"]: e.target.value || null })) },
      el("option", { value: "" }, "Unassigned"), teamIds().map(u => el("option", { value: u }, name(u))));
    const skillSel = el("select", { class: "mini", "aria-label": "Skill needed", onchange: e => write(() => upd(p.id, { [t.path + ".skill"]: e.target.value || null })) },
      el("option", { value: "" }, "Any skill"), SKILL_IDS.map(s => el("option", { value: s }, SKILLS[s].name)));
    const phaseSel = el("select", { class: "mini", "aria-label": "Phase", onchange: e => write(() => phaseWrite(p, { [t.path + ".phase"]: e.target.value })) },
      phases.map(ph => el("option", { value: ph.id }, ph.name)));
    ownerSel.value = t.owner || ""; skillSel.value = t.skill || ""; phaseSel.value = t.phase;
    const due = el("input", { type: "date", class: "mini", "aria-label": "Due date", value: t.due || "", onchange: e => write(() => upd(p.id, { [t.path + ".due"]: e.target.value || null })) });
    meta = el("div", { class: "meta" }, t.owner ? av(t.owner) : null, ownerSel, skillSel, due, phases.length > 1 ? phaseSel : null);
  } else {
    meta = el("div", { class: "meta" },
      t.owner ? el("span", { class: "by" }, av(t.owner), name(t.owner)) : el("span", { class: "label" }, "Not assigned"),
      t.skill ? el("span", { class: "chip" }, SKILLS[t.skill].name) : null,
      t.due ? el("span", { class: "label" }, "Due " + fmtDate(t.due)) : null);
  }
  return el("div", { class: "task" + (t.done ? " done" : "") + (t.owner === me ? " mytask" : "") },
    check,
    el("label", { for: cid, class: "ttext" }, t.text),
    planner ? el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => write(() => upd(p.id, { [t.path]: DEL() })) }, "✕") : el("span"),
    meta,
    notesBlock(p, t, "p"));
}

/* ----- planners & phases ----- */

let renamingPhase = null, delPhase = null;
const canPlan = p => !!p && (isAdmin || p.author === me || !!(p.planners || {})[me]);
const plannerIds = p => [...new Set([p.author, ...Object.entries(p.planners || {}).filter(([, v]) => v).map(([u]) => u)].filter(Boolean))];

function getPhases(p) {
  if (p.phases) return Object.entries(p.phases).filter(([, v]) => v && v.name).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.order || 0) - (b.order || 0));
  // Plans made before custom phases existed used these six.
  if (tasksOf(p).length) return OLD_PHASES.map((ph, n) => ({ id: ph[0], name: ph[1], order: n + 1, due: null, virtual: true }));
  return [];
}
// Saves a phase change; turns the old built-in phases into real ones the first time someone edits them.
function phaseWrite(p, data) {
  const out = {};
  for (const ph of getPhases(p)) if (ph.virtual) out["phases." + ph.id] = { name: ph.name, order: ph.order, due: null };
  return upd(p.id, Object.assign(out, data));
}
function movePhase(p, phases, n, dir) {
  const a = phases[n], b = phases[n + dir]; if (!b) return;
  write(() => phaseWrite(p, { [`phases.${a.id}.order`]: b.order, [`phases.${b.id}.order`]: a.order }));
}
function deletePhase(p, ph, list) {
  delPhase = null;
  const data = { [`phases.${ph.id}`]: DEL() };
  for (const t of list) data[t.path] = DEL();
  write(async () => { await phaseWrite(p, {}); await upd(p.id, data) }, "Phase deleted");
}
function usePlanTemplate(p, tp) {
  const base = Date.now(); const data = {};
  tp.phases.forEach((nm, n) => data["phases." + uid() + n] = { name: nm, order: n + 1, due: null });
  write(() => upd(p.id, data), "Phases added. Rename, reorder or delete any of them");
}
function templateFor(cat) {
  const c = (cat || "").toLowerCase();
  if (/video|youtube|social|film/.test(c)) return PLAN_TEMPLATES[1];
  if (/event|sport/.test(c)) return PLAN_TEMPLATES[2];
  if (/business|sell/.test(c)) return PLAN_TEMPLATES[3];
  if (/music/.test(c)) return PLAN_TEMPLATES[4];
  return PLAN_TEMPLATES[0];
}

function plannersRow(p) {
  const ids = plannerIds(p), boss = isAdmin || p.author === me;
  const row = el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Planners:",
    ...ids.map(u => el("span", { class: "planner" }, av(u), name(u), u === p.author ? el("span", { class: "label" }, "idea") : null,
      boss && u !== p.author ? el("button", { class: "x", "aria-label": "Remove " + name(u) + " as planner", onclick: () => write(() => upd(p.id, { ["planners." + u]: DEL() }), "Planner removed") }, "✕") : null)));
  if (boss) {
    const others = teamIds().filter(u => !ids.includes(u));
    if (others.length) {
      const sel = el("select", { class: "mini", "aria-label": "Add a planner", onchange: e => { const u = e.target.value; if (u) write(() => upd(p.id, { ["planners." + u]: true }), `${name(u)} can now plan this project`) } },
        el("option", { value: "" }, "+ Add a planner"), others.map(u => el("option", { value: u }, name(u))));
      row.append(sel);
    }
  }
  return row;
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

/* ----- task notes ----- */

let openNote = null;   // "<where>:<taskId>" of the note box that's open
function toggleDone(p, t, done) {
  openNote = done ? "any:" + t.id : (openNote && openNote.endsWith(":" + t.id) ? null : openNote);
  const data = { [t.path + ".done"]: done };
  if (done) { data[t.path + ".doneBy"] = me; data[t.path + ".doneAt"] = Date.now() }
  write(() => upd(p.id, data), done ? "Nice! Add a note about what you did" : null);
}
function notesBlock(p, t, where) {
  const key = where + ":" + t.id;
  const isOpen = openNote === key || (openNote === "any:" + t.id && where === (route().view === "current" ? "m" : "p"));
  const notes = Object.entries(t.notes || {}).filter(([, n]) => n && n.text).map(([id, n]) => ({ id, ...n })).sort((a, b) => (a.at || 0) - (b.at || 0));
  const box = el("div", { class: "notes" });
  if (t.done && t.doneBy) box.append(el("div", { class: "note-meta" }, `Done by ${name(t.doneBy)}${t.doneAt ? " \u00b7 " + ago(t.doneAt) : ""}`));
  for (const n of notes) box.append(el("div", { class: "note" }, av(n.by),
    el("div", { class: "note-body" }, el("div", { class: "note-meta" }, `${name(n.by)} \u00b7 ${ago(n.at)}`), el("div", {}, n.text)),
    n.by === me ? el("button", { class: "x", title: "Delete note", "aria-label": "Delete note", onclick: () => write(() => upd(p.id, { [`${t.path}.notes.${n.id}`]: DEL() })) }, "\u2715") : null));
  if (isOpen) {
    const ta = el("textarea", { id: `note-${where}-${t.id}`, class: "noteinput", maxlength: "1000", rows: "2",
      placeholder: t.done ? "What did you do? A link, what's finished, what's left\u2026" : "Add a note for the team" });
    const save = () => {
      const text = ta.value.trim(); if (!text) return;
      ta.value = ""; openNote = null;
      write(() => upd(p.id, { [`${t.path}.notes.${uid()}`]: { by: me, text, at: Date.now() } }), "Note added");
    };
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } });
    setTimeout(() => { if (document.activeElement !== ta && openNote) ta.focus() }, 0);
    box.append(el("div", { class: "noteedit" }, ta, el("div", { class: "row", style: "gap:6px" }, el("span", { class: "spacer" }),
      el("button", { class: "btn quiet", onclick: () => { openNote = null; render() } }, t.done ? "Skip" : "Cancel"),
      el("button", { class: "btn primary", onclick: save }, "Save note"))));
  } else box.append(el("button", { class: "linkbtn", onclick: () => { openNote = key; render() } }, notes.length ? "Add another note" : "Add a note"));
  return box;
}
function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago"; if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* ----- chat ----- */

let chat = [];
let chatSel = null;      // message whose actions are showing
let chatReply = null;    // message being replied to
let chatEdit = null;     // own message being edited
let chatDel = null;      // own message waiting for delete confirmation
const seenKey = () => "chatSeen:" + me;
const getSeen = () => { try { return +localStorage.getItem(seenKey()) || 0 } catch { return 0 } };
const setSeen = v => { try { localStorage.setItem(seenKey(), String(v)) } catch { } };
const msgById = id => chat.find(m => m.id === id);
const snippet = t => (t || "").replace(/\s+/g, " ").slice(0, 90) + ((t || "").length > 90 ? "…" : "");

$("#chatform").addEventListener("submit", e => { e.preventDefault(); sendChat() });
$("#chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat() }
  if (e.key === "Escape" && (chatReply || chatEdit)) { e.preventDefault(); cancelChatMode() }
});
function cancelChatMode() {
  if (chatEdit) $("#chat-input").value = "";
  chatReply = null; chatEdit = null; render();
}
let sending = false;
async function sendChat() {
  if (sending) return;
  const inp = $("#chat-input"); const text = inp.value.trim();
  if (chatEdit) {
    if (!text) return;
    inp.value = "";
    const id = chatEdit; chatEdit = null;
    const old = msgById(id);
    if (old && old.text !== text) write(() => updateDoc(doc(db, "chat", id), { text, edited: Date.now() }), "Message edited");
    else render();
    return;
  }
  if (!text && !pending.length) return;
  inp.value = "";
  let replyTo = chatReply && msgById(chatReply) ? chatReply : null;
  chatReply = null;
  const files = pending.splice(0); renderAttach();
  if (files.length) {
    sending = true; $("#chat-send").disabled = true;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadStatus(`Sending ${files.length > 1 ? `file ${i + 1} of ${files.length}` : files[i].f.name}\u2026`);
        const file = await uploadFile(await prepareFile(files[i].f), pct => setUploadStatus(`Sending ${files[i].f.name}\u2026 ${pct}%`));
        const data = { by: me, text: "", at: Date.now(), file };
        if (replyTo) { data.replyTo = replyTo; replyTo = null }
        await setDoc(doc(db, "chat", uid()), data);
      }
    } catch (e) {
      status(e.code === "permission-denied" ? "Sending files isn't allowed yet. Ask Mohammed to update the database rules." : "A file didn't send. Check your connection and try again.", true);
    }
    sending = false; $("#chat-send").disabled = false; setUploadStatus("");
  }
  if (text) {
    const data = { by: me, text, at: Date.now() };
    if (replyTo) data.replyTo = replyTo;
    write(() => setDoc(doc(db, "chat", uid()), data));
  }
  render();
}

/* ----- chat attachments (stored in the database in pieces, since free Firebase has no file storage) ----- */

const MAX_FILE = 5 * 1024 * 1024;     // 5 MB per file
const MAX_IMAGE_IN = 30 * 1024 * 1024;// photos bigger than 5 MB are shrunk first
const PART = 900 * 1024;              // one database document holds under 1 MB
let pending = [];                     // files waiting to be sent: {f, key, url}

const fmtSize = n => n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
const extOf = name => ((name || "").split(".").pop() || "file").slice(0, 4).toUpperCase();
function msgSummary(m) {
  if (m.text) return snippet(m.text);
  if (m.file) return m.file.thumb ? "Photo" : "File: " + m.file.name;
  return "";
}

$("#chat-attach").onclick = () => $("#chat-file").click();
$("#chat-file").onchange = e => { addFiles([...e.target.files]); e.target.value = "" };
$("#chat-input").addEventListener("paste", e => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length) { e.preventDefault(); addFiles(fs) } });
const chatboxEl = document.querySelector(".chatbox");
chatboxEl.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); chatboxEl.classList.add("dropping") } });
chatboxEl.addEventListener("dragleave", e => { if (!chatboxEl.contains(e.relatedTarget)) chatboxEl.classList.remove("dropping") });
chatboxEl.addEventListener("drop", e => { e.preventDefault(); chatboxEl.classList.remove("dropping"); addFiles([...e.dataTransfer.files]) });

function addFiles(fs) {
  for (const f of fs) {
    const isImg = /^image\/(jpeg|png|webp|heic|heif|bmp)$/.test(f.type);
    if (f.size > (isImg ? MAX_IMAGE_IN : MAX_FILE)) { toast(`${f.name} is too big. The limit is 5 MB per file.`); continue }
    pending.push({ f, key: uid(), url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
  }
  renderAttach(); $("#chat-input").focus();
}
function renderAttach() {
  const box = $("#attach-list"); box.replaceChildren(); box.hidden = !pending.length;
  for (const p of pending) box.append(el("div", { class: "att-chip" },
    p.url ? el("img", { src: p.url, alt: "" }) : el("span", { class: "att-ext" }, extOf(p.f.name)),
    el("span", { class: "att-chip-name" }, p.f.name), el("span", { class: "att-size" }, fmtSize(p.f.size)),
    el("button", { type: "button", class: "x", "aria-label": "Remove " + p.f.name, onclick: () => { if (p.url) URL.revokeObjectURL(p.url); pending = pending.filter(x => x !== p); renderAttach() } }, "\u2715")));
}
function setUploadStatus(t) { const n = $("#upload-status"); n.textContent = t; n.hidden = !t }

function canvasJpeg(img, max, q) {
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res({ blob: b, w: c.width, h: c.height, canvas: c }), "image/jpeg", q));
}
async function prepareFile(f) {
  const out = { blob: f, name: f.name || "file", type: f.type || "application/octet-stream" };
  if (f.type.startsWith("image/") && f.type !== "image/svg+xml") {
    try {
      const img = await createImageBitmap(f);
      out.w = img.width; out.h = img.height;
      const keepOriginal = f.size <= PART && /^image\/(jpeg|png|webp|gif)$/.test(f.type);
      if (!keepOriginal && f.type !== "image/gif") {
        const big = await canvasJpeg(img, 1600, 0.82);
        out.blob = big.blob; out.type = "image/jpeg"; out.name = out.name.replace(/\.[^.]+$/, "") + ".jpg"; out.w = big.w; out.h = big.h;
      }
      const small = await canvasJpeg(img, 480, 0.6);
      out.thumb = small.canvas.toDataURL("image/jpeg", 0.6);
    } catch { /* not a picture the browser can read: send it as a normal file */ }
  }
  if (out.blob.size > MAX_FILE) throw new Error("too big");
  return out;
}
async function uploadFile(p, onProgress) {
  const id = uid(); const buf = new Uint8Array(await p.blob.arrayBuffer());
  const parts = Math.max(1, Math.ceil(buf.length / PART));
  for (let n = 0; n < parts; n++) {
    await setDoc(doc(db, "fileparts", `${id}_${n}`), { by: me, fileId: id, n, data: Bytes.fromUint8Array(buf.subarray(n * PART, (n + 1) * PART)) });
    onProgress && onProgress(Math.round((n + 1) / parts * 100));
  }
  const file = { id, name: p.name, type: p.type, size: buf.length, parts };
  if (p.thumb) { file.thumb = p.thumb; file.w = p.w; file.h = p.h }
  return file;
}
const fileCache = {};
function loadFile(f) {
  if (!fileCache[f.id]) fileCache[f.id] = (async () => {
    const snaps = await Promise.all(Array.from({ length: f.parts }, (_, n) => getDoc(doc(db, "fileparts", `${f.id}_${n}`))));
    if (snaps.some(s => !s.exists())) throw new Error("missing");
    return URL.createObjectURL(new Blob(snaps.map(s => s.data().data.toUint8Array()), { type: f.type }));
  })().catch(e => { delete fileCache[f.id]; throw e });
  return fileCache[f.id];
}
async function downloadFile(f) {
  try {
    toast("Downloading\u2026");
    const url = await loadFile(f);
    const a = el("a", { href: url, download: f.name }); document.body.append(a); a.click(); a.remove();
  } catch { toast("That file couldn't be loaded. It may have been deleted.") }
}
function deleteMessage(m) {
  const jobs = [deleteDoc(doc(db, "chat", m.id))];
  if (m.file && m.by === me) for (let n = 0; n < m.file.parts; n++) jobs.push(deleteDoc(doc(db, "fileparts", `${m.file.id}_${n}`)).catch(() => {}));
  return Promise.all(jobs);
}
const playable = f => /^(video|audio)\//.test(f.type);
function attachmentEl(f) {
  if (f.thumb) return el("button", { type: "button", class: "att-img", "aria-label": "Open photo " + f.name, onclick: e => { e.stopPropagation(); openViewer(f) } },
    el("img", { src: f.thumb, alt: f.name, width: f.w || null, height: f.h || null }));
  return el("div", { class: "att-file" },
    el("span", { class: "att-ext" }, extOf(f.name)),
    el("div", { class: "att-info" }, el("div", { class: "att-name" }, f.name), el("div", { class: "att-size" }, fmtSize(f.size))),
    el("button", { type: "button", class: "act", onclick: e => { e.stopPropagation(); playable(f) ? openViewer(f) : downloadFile(f) } }, playable(f) ? "Play" : "Download"));
}
async function openViewer(f) {
  const lb = $("#lightbox"); lb.hidden = false;
  const body = el("div", { class: "lb-body" }, f.thumb ? el("img", { src: f.thumb, alt: f.name }) : el("p", {}, "Loading\u2026"));
  const close = () => { lb.hidden = true; lb.replaceChildren(); document.removeEventListener("keydown", esc) };
  const esc = e => { if (e.key === "Escape") close() };
  document.addEventListener("keydown", esc);
  lb.replaceChildren(el("div", { class: "lb-bar" }, el("span", { class: "lb-name" }, f.name), el("span", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => downloadFile(f) }, "Download"), el("button", { class: "btn", onclick: close }, "Close")), body);
  lb.onclick = e => { if (e.target === lb) close() };
  try {
    const url = await loadFile(f);
    if (lb.hidden) return;
    const media = f.type.startsWith("video/") ? el("video", { src: url, controls: true, autoplay: true, playsinline: true })
      : f.type.startsWith("audio/") ? el("audio", { src: url, controls: true, autoplay: true })
      : el("img", { src: url, alt: f.name });
    body.replaceChildren(media);
  } catch { body.replaceChildren(el("p", {}, "That file couldn't be loaded. It may have been deleted.")) }
}

function jumpTo(id) {
  const n = document.getElementById("msg-" + id); if (!n) return;
  n.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash");
}

function renderChat() {
  const latest = chat.length ? chat[chat.length - 1].at : 0;
  const onChat = route().view === "chat";
  if (onChat && latest > getSeen()) setSeen(latest);
  const unread = chat.filter(m => m.at > getSeen() && m.by !== me).length;
  const badge = $("#c-chat"); badge.hidden = !unread; badge.textContent = unread;
  if (!onChat) return;

  /* reply / edit bar above the input */
  if (chatReply && !msgById(chatReply)) chatReply = null;
  if (chatEdit && !msgById(chatEdit)) chatEdit = null;
  const ctx = $("#chat-context"); ctx.replaceChildren();
  const ctxMsg = msgById(chatEdit || chatReply);
  ctx.hidden = !ctxMsg;
  if (ctxMsg) ctx.append(
    el("div", { style: "flex:1;min-width:0" },
      el("div", { class: "ctx-title" }, chatEdit ? "Editing your message" : `Replying to ${name(ctxMsg.by)}`),
      el("div", { class: "ctx-text" }, msgSummary(ctxMsg))),
    el("button", { type: "button", class: "x", title: "Cancel", "aria-label": "Cancel", onclick: cancelChatMode }, "✕"));
  $("#chat-send").textContent = chatEdit ? "Save" : "Send";

  const log = $("#chatlog");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const prevTop = log.scrollTop;
  log.replaceChildren();
  if (!chat.length) log.append(el("div", { class: "empty", style: "margin:auto" }, "No messages yet. Say hi to the team."));
  let lastDay = "", lastBy = "", lastAt = 0;
  for (const m of chat) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { log.append(el("div", { class: "day" }, new Date(m.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))); lastBy = "" }
    const mine = m.by === me, grouped = m.by === lastBy && m.at - lastAt < 5 * 60 * 1000 && !m.replyTo;
    if (!mine && !grouped) log.append(el("div", { class: "msg-name" }, name(m.by)));
    const time = new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const orig = m.replyTo ? msgById(m.replyTo) : null;
    const quote = m.replyTo ? el("button", { type: "button", class: "quote", onclick: e => { e.stopPropagation(); if (orig) jumpTo(orig.id) } },
      el("strong", {}, orig ? name(orig.by) : "Message"), el("span", {}, orig ? msgSummary(orig) : "This message was deleted")) : null;
    const sel = chatSel === m.id;
    const bubble = el("div", { class: "bubble", tabindex: "0", role: "button", "aria-label": "Message options", "aria-expanded": String(sel),
      onclick: () => { if (String(getSelection())) return; chatSel = sel ? null : m.id; chatDel = null; render() },
      onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chatSel = sel ? null : m.id; chatDel = null; render() } } },
      quote, m.file ? attachmentEl(m.file) : null, m.text ? el("span", {}, m.text) : null, el("span", { class: "msg-time" }, (m.edited ? "edited · " : "") + time));
    const row = el("div", { class: "msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "") + (sel ? " selected" : ""), id: "msg-" + m.id },
      mine ? null : (grouped ? el("span", { class: "av-space" }) : av(m.by)), bubble);
    log.append(row);
    if (sel) {
      const act = (label, fn, cls = "") => el("button", { type: "button", class: "act " + cls, onclick: e => { e.stopPropagation(); fn() } }, label);
      log.append(el("div", { class: "msg-actions" + (mine ? " mine" : "") },
        act("Reply", () => { chatReply = m.id; chatEdit = null; chatSel = null; render(); $("#chat-input").focus() }),
        mine ? act("Edit", () => { chatEdit = m.id; chatReply = null; chatSel = null; $("#chat-input").value = m.text; render(); const i = $("#chat-input"); i.focus(); i.setSelectionRange(i.value.length, i.value.length) }) : null,
        mine ? (chatDel === m.id
          ? act("Tap again to delete", () => { chatSel = null; chatDel = null; if (chatEdit === m.id) { chatEdit = null; $("#chat-input").value = "" } write(() => deleteMessage(m), "Message deleted") }, "danger")
          : act("Delete", () => { chatDel = m.id; render() }, "danger")) : null,
        act("Close", () => { chatSel = null; chatDel = null; render() }, "quiet")));
    }
    lastDay = day; lastBy = m.by; lastAt = m.at;
  }
  log.scrollTop = atBottom || !prevTop ? log.scrollHeight : prevTop;
}

/* ----- shared bits ----- */

function phaseBar(p, tasks) {
  const phases = getPhases(p); if (!phases.length) return null;
  return el("div", { class: "phasebar" }, phases.map((ph, n) => {
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
