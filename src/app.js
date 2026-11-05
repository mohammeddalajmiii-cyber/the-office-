// Firebase is loaded in the background so the page can draw right away from the last saved copy.
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
let auth, db, GoogleAuthProvider, signInWithPopup, signOut, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limitToLast, getDoc, Bytes;
const fbReady = (async () => {
  const [appM, authM, fsM] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
  const fb = appM.initializeApp(firebaseConfig);
  ({ GoogleAuthProvider, signInWithPopup, signOut } = authM);
  ({ collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limitToLast, getDoc, Bytes } = fsM);
  auth = authM.getAuth(fb);
  db = fsM.initializeFirestore(fb, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  authM.onAuthStateChanged(auth, onAuth);
})();
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
const DEL = () => deleteField();
const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23999'/%3E%3C/svg%3E";
const pctOf = (d, t) => t ? Math.round(d / t * 100) : 0;

/* ---------- routing ---------- */

const VIEWS = ["me", "ideas", "projects", "chat", "skills", "project"];
function route() {
  const h = location.hash.slice(1);
  for (const pre of ["project-", "plan-", "build-"]) if (h.startsWith(pre)) return { view: "project", id: h.slice(pre.length) };
  if (h === "projects-done" || h === "current") return { view: "projects" };
  if (h === "mine" || h === "notes") return { view: "me" };
  return { view: VIEWS.includes(h) && h !== "project" ? h : "me" };
}
function show() {
  const r = route(); const tabView = r.view === "project" ? "projects" : r.view === "skills" ? "me" : r.view;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.view === tabView);
  for (const k of VIEWS) $("#view-" + k).hidden = r.view !== k;
  render();
}
for (const b of document.querySelectorAll(".tab")) b.onclick = () => { location.hash = b.dataset.view };
addEventListener("hashchange", () => { show(); scrollTo(0, 0) });

/* ---------- auth & data ---------- */

$("#signin").onclick = async () => {
  try { await fbReady; await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (e) { $("#gate-msg").textContent = "Sign-in didn't finish. Try again, and allow pop-ups for this site if your browser blocked one." }
};
async function doSignOut() { await fbReady; clearCache(); await signOut(auth) }

let isAdmin = false;
let ideas = [], focusId = null, me = null, people = {}, unsubs = [];
let activeMap = {};   // projects being built right now: id -> {by, at}. Only the admin changes this.
const isActive = p => !!p && p.status === "approved" && (!!activeMap[p.id] || p.id === focusId);
const activeProjects = () => ideas.filter(isActive).sort((a, b) => prioRank(a) - prioRank(b) || ((activeMap[a.id] || {}).at || 0) - ((activeMap[b.id] || {}).at || 0));
const suggestions = {};          // projectId -> [{task, owner, why}]
let quiz = null;                 // {i, answers:[], grow:[]} while taking the quiz

let myProfile = null, privErr = false, privUnsubs = [], privRetry = null, live = false;
function onAuth(u) {
  unsubs.forEach(f => f()); unsubs = [];
  privUnsubs.forEach(f => f()); privUnsubs = [];
  $("#boot").hidden = true;
  if (!u) { me = null; live = false; remember(false); clearCache(); $("#gate").hidden = false; $("#app").hidden = true; return }
  remember(true);
  if (me && me !== u.uid) { ideas = []; people = {}; chat = []; personal = []; myNotes = []; focusId = null; activeMap = {} }
  me = u.uid;
  isAdmin = ADMINS.includes((u.email || "").toLowerCase());
  myProfile = { name: u.displayName || u.email, email: u.email, photo: u.photoURL || "" };
  $("#gate").hidden = true; $("#app").hidden = false;
  if (!ideas.length) status("Loading\u2026");
  setDoc(doc(db, "users", me), { name: myProfile.name, photo: myProfile.photo }, { merge: true }).catch(() => {});
  const denied = e => {
    if (e.code === "permission-denied") {
      signOut(auth); clearCache();
      $("#gate-msg").textContent = u.emailVerified === false
        ? `You signed in as ${u.email}, but Google says that email isn't verified yet. Verify it in your Google account, then sign in again.`
        : `You signed in as ${u.email}, which isn't on the team list. Ask Mohammed to add exactly this email, or sign in with the account he added.`;
    } else status("Can't reach the board. Check your connection.", true);
  };
  unsubs.push(onSnapshot(collection(db, "ideas"), s => { ideas = s.docs.map(d => ({ id: d.id, ...d.data() })); live = true; status(""); render() }, denied));
  unsubs.push(onSnapshot(doc(db, "meta", "focus"), s => { const d = s.exists() ? s.data() : {}; focusId = d.projectId || null; activeMap = d.active || {}; render() }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "chat"), orderBy("at"), limitToLast(300)), s => {
    const before = chat.length ? chat[chat.length - 1].at : 0;
    chat = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const newest = chat.length ? chat[chat.length - 1] : null;
    if (before && newest && newest.at > before && newest.by !== me && route().view !== "chat") toast(`${firstName(newest.by)}: ${msgSummary(newest).slice(0, 60)}`);
    render();
  }, () => {}));
  unsubs.push(onSnapshot(collection(db, "users"), s => { people = {}; s.docs.forEach(d => people[d.id] = d.data()); render() }, () => {}));
  subscribePrivate();
  show();
}
// Your own tasks and notes. If the database rules don't allow them yet, say so and keep retrying.
function subscribePrivate() {
  clearTimeout(privRetry); privUnsubs.forEach(f => f()); privUnsubs = [];
  const fail = e => {
    privErr = e.code === "permission-denied" ? "rules" : "network"; render();
    clearTimeout(privRetry); privRetry = setTimeout(() => { if (me) subscribePrivate() }, 15000);
  };
  privUnsubs.push(onSnapshot(collection(db, "private", me, "tasks"), s => { privErr = false; personal = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, fail));
  privUnsubs.push(onSnapshot(collection(db, "private", me, "notes"), s => {
    privErr = false;
    myNotes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0));
    // Don't redraw while typing in a note, so the cursor doesn't jump.
    const a = document.activeElement; if (!(a && a.classList && a.classList.contains("pnote"))) render();
  }, fail));
}

/* ---------- saved copy on this device, for instant start ---------- */

const CACHE = "pitchroom-cache-v1";
let cacheT = null;
function saveCache() {
  if (!me || !live) return;
  clearTimeout(cacheT);
  cacheT = setTimeout(() => {
    const data = { me, isAdmin, myProfile, ideas, people, focusId, activeMap, personal, chat: chat.slice(-40) };
    try { localStorage.setItem(CACHE, JSON.stringify(data)) }
    catch { try { data.chat = []; localStorage.setItem(CACHE, JSON.stringify(data)) } catch { } }
  }, 1000);
}
function clearCache() { try { localStorage.removeItem(CACHE) } catch { } }
function loadCache() {
  let c = null; try { c = JSON.parse(localStorage.getItem(CACHE) || "null") } catch { }
  if (!c || !c.me) return false;
  ({ me, isAdmin, myProfile } = c);
  ideas = c.ideas || []; people = c.people || {}; focusId = c.focusId || null; activeMap = c.activeMap || {}; personal = c.personal || []; chat = c.chat || [];
  $("#boot").hidden = true; $("#gate").hidden = true; $("#app").hidden = false;
  return true;
}

async function write(fn, ok) {
  try { await fbReady; await fn(); if (ok) toast(ok) }
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
  if (r.view === "ideas") renderIdeas(voting, removed);
  if (r.view === "projects") renderProjects(projects);
  if (r.view === "project") renderProjectPage(ideas.find(p => p.id === r.id && (p.status === "approved" || p.status === "completed")));
  if (r.view === "skills") renderSkills();
  if (r.view === "me") renderMe();
  const open = myTasks().filter(x => !x.t.done && !x.closed).length; const mc = $("#c-mine"); mc.hidden = !open; mc.textContent = open;
  renderAlerts();
  const meAv = $("#me-av"); const src = (myProfile && myProfile.photo) || (people[me] || {}).photo || AV; if (meAv.getAttribute("src") !== src) meAv.src = src;
  saveCache();
  renderChat();
}

/* ----- a project's team board: tasks, this week, meetings ----- */

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const weekKey = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ymd(x) };
const weekLabel = k => k === weekKey() ? "This week" : "Week of " + fmtDate(k);
const teamOf = p => {
  const set = new Set(Object.entries(p.members || {}).filter(([, v]) => v).map(([u]) => u));
  for (const t of tasksOf(p)) assignees(t).forEach(u => set.add(u));
  return [...set].sort((a, b) => a === me ? -1 : b === me ? 1 : name(a).localeCompare(name(b)));
};

let projTab = "tasks", showSettings = null, planEdit = null;
const taskFilter = {};   // project id -> person id whose tasks to show

function renderProjectPage(p) {
  const box = $("#project"); box.replaceChildren();
  box.append(el("button", { class: "back", onclick: () => { location.hash = p && p.status === "completed" ? "projects-done" : "projects" } }, "\u2190 Projects"));
  if (!p) { box.append(el("div", { class: "empty" }, "This project isn't on the board anymore.")); return }
  const tasks = tasksOf(p), team = teamOf(p), joined = !!(p.members || {})[me], planner = canPlan(p);
  const done = p.status === "completed", goal = (p.goals || {})[weekKey()];
  const mineLeft = tasks.filter(t => isAssignee(t, me) && !t.done).length;
  const settingsOpen = showSettings === p.id;

  const head = el("section", { class: "focus" },
    el("div", { class: "row", style: "gap:6px" },
      done ? el("span", { class: "done-badge" }, "\u2713 Completed " + fmtDay(p.completedAt)) : el("span", { class: "pill" }, isActive(p) ? "Building now" : "Up next"),
      prioChip(p), p.category ? catChip(p) : null),
    el("div", { class: "row", style: "align-items:flex-start;flex-wrap:nowrap" }, el("h2", { style: "flex:1;min-width:0" }, p.title),
      planner || joined ? el("button", { class: "btn small", "aria-expanded": String(settingsOpen), onclick: () => { showSettings = settingsOpen ? null : p.id; render() } }, settingsOpen ? "Close" : "Settings") : null),
    p.pitch ? el("p", { class: "pitch" }, p.pitch) : null,
    !done && goal && goal.text ? el("div", { class: "goal-line" + (goal.reached ? " reached" : "") }, el("span", { class: "tlabel" }, goal.reached ? "This week's goal \u2713 reached" : "This week's goal"), el("span", {}, goal.text)) : null,
    tasks.length ? line(progressOf(tasks), "tasks") : null,
    mineLeft ? el("div", { class: "now-sub" }, `${mineLeft} of these are yours`) : null,
    linksBlock(p));
  const actions = el("div", { class: "row", style: "gap:8px" });
  if (!done && !isActive(p)) actions.append(voteButton(p));
  if (!done && !joined) actions.append(el("button", { class: "btn", onclick: () => write(() => upd(p.id, { ["members." + me]: true }), "You joined the team") }, "Join the team"));
  actions.append(el("span", { class: "spacer" }));
  const pick = pickButton(p); if (pick) actions.append(pick);
  if (actions.childNodes.length > 1) head.append(actions);
  box.append(head);

  if (settingsOpen) {
    const set = el("section", { class: "idea settings" }, el("h3", {}, "Project settings"));
    if (planner) set.append(renameBlock(p), catSelect(p), prioControl(p), plannersRow(p));
    const btns = el("div", { class: "row", style: "gap:8px" });
    if (joined) btns.append(el("button", { class: "btn quiet", onclick: () => write(() => upd(p.id, { ["members." + me]: DEL() }), "You left the team") }, "Leave the team"));
    btns.append(el("span", { class: "spacer" }));
    if (isAdmin && isActive(p)) btns.append(el("button", { class: "btn", onclick: () => pauseBuilding(p) }, "Pause"));
    if (planner) btns.append(done ? el("button", { class: "btn", onclick: () => reopenProject(p) }, "Reopen") : completeButton(p));
    set.append(btns);
    if (isAdmin || p.author === me) set.append(deleteBlock(p));
    box.append(set);
  }

  const meetings = Object.values(p.meetings || {}).filter(Boolean).length;
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Show", style: "margin:4px 0 14px" },
    el("button", { "aria-pressed": String(projTab === "tasks"), onclick: () => { projTab = "tasks"; render() } }, "Tasks"),
    el("button", { "aria-pressed": String(projTab === "week"), onclick: () => { projTab = "week"; render() } }, "This week"),
    el("button", { "aria-pressed": String(projTab === "meet"), onclick: () => { projTab = "meet"; render() } }, "Meetings" + (meetings ? " " + meetings : ""))));
  if (projTab === "week") return renderWeek(box, p, team);
  if (projTab === "meet") return renderMeetings(box, p);

  // people chips: tap someone to see only their tasks
  const f = taskFilter[p.id] || null;
  if (team.length && tasks.length) {
    const chip = (u, label, count) => el("button", { class: "pchip", "aria-pressed": String(f === u), onclick: () => { taskFilter[p.id] = u; render() } }, u ? av(u) : null, label, count != null ? el("span", { class: "pcount" }, count) : null);
    box.append(el("div", { class: "pchips" }, chip(null, "Everyone"),
      ...team.map(u => { const list = tasks.filter(t => isAssignee(t, u)); return chip(u, u === me ? "You" : name(u).split(" ")[0], `${list.filter(t => t.done).length}/${list.length}`) })));
  }
  box.append(planBody(p, { filter: f }));
}

// Deleting a whole project. Only the admin and the person who pitched it can do this.
let confirmDelProject = null;
function deleteBlock(p) {
  const box = el("div", { class: "danger" });
  if (confirmDelProject !== p.id) {
    box.append(el("div", { class: "row" }, el("span", { class: "label" }, "Delete this project for everyone"), el("span", { class: "spacer" }),
      el("button", { class: "btn danger-btn small", onclick: () => { confirmDelProject = p.id; render() } }, "Delete project")));
    return box;
  }
  const t = tasksOf(p).length, f = filesOf(p).length, l = linksOf(p).length, m = Object.keys(p.meetings || {}).length;
  const parts = [t && `${t} task${t > 1 ? "s" : ""}`, f && `${f} file${f > 1 ? "s" : ""}`, l && `${l} link${l > 1 ? "s" : ""}`, m && `${m} meeting note${m > 1 ? "s" : ""}`].filter(Boolean);
  box.append(el("p", { class: "danger-text" }, `Delete \u201c${p.title}\u201d? ` + (parts.length ? `This also deletes its ${parts.join(", ")}, plus all notes and check-ins. ` : "") + "This can't be undone."),
    el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }),
      el("button", { class: "btn quiet", onclick: () => { confirmDelProject = null; render() } }, "Cancel"),
      el("button", { class: "btn danger-btn", onclick: () => deleteProject(p) }, "Yes, delete it forever")));
  return box;
}
function deleteProject(p) {
  confirmDelProject = null; showSettings = null;
  const title = p.title;
  location.hash = p.status === "completed" ? "projects-done" : "projects";
  write(async () => {
    // remove its files' stored pieces where allowed, then the project itself
    for (const f of filesOf(p)) if (f.by === me || isAdmin) for (let n = 0; n < f.parts; n++) deleteDoc(doc(db, "fileparts", `${f.id}_${n}`)).catch(() => {});
    if (isAdmin && (activeMap[p.id] || focusId === p.id)) await updateDoc(doc(db, "meta", "focus"), { ["active." + p.id]: DEL(), ...(focusId === p.id ? { projectId: null } : {}) }).catch(() => {});
    await deleteDoc(doc(db, "ideas", p.id));
  }, `\u201c${title}\u201d was deleted`);
}

// Name and description, editable by the project's planners.
function renameBlock(p) {
  const title = el("input", { id: "rn-title-" + p.id, class: "noteinput", maxlength: "80", "aria-label": "Project name" });
  const pitch = el("textarea", { id: "rn-pitch-" + p.id, class: "noteinput", rows: "3", maxlength: "600", "aria-label": "Description", placeholder: "What is it, who's it for?" });
  title.value = p.title || ""; pitch.value = p.pitch || "";
  const save = () => {
    const t = title.value.trim(), d = pitch.value.trim();
    if (!t) { toast("The project needs a name"); title.focus(); return }
    if (t === p.title && d === (p.pitch || "")) { toast("Nothing changed"); return }
    write(() => upd(p.id, { title: t, pitch: d }), "Saved");
  };
  title.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } });
  return el("div", { class: "renameblock" },
    el("label", { class: "tlabel", for: title.id }, "Name"), title,
    el("label", { class: "tlabel", for: pitch.id }, "Description"), pitch,
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: save }, "Save name and description")));
}

/* this week: goal + check-ins */
let editGoal = null, editCheckin = null;
function renderWeek(box, p, members) {
  const wk = weekKey(), planner = canPlan(p);
  const goal = (p.goals || {})[wk];
  const g = el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "This week's goal"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Week of " + fmtDate(wk))));
  if (planner && (editGoal === p.id || !goal || !goal.text)) {
    const ta = el("textarea", { id: "goal-" + p.id, class: "noteinput", rows: "2", maxlength: "300", placeholder: "One clear goal everyone pushes for, e.g. “Finish filming episode 1 by Friday”" });
    if (goal && goal.text && !ta.value) ta.value = goal.text;
    g.append(ta, el("div", { class: "row" }, el("span", { class: "spacer" }),
      editGoal === p.id ? el("button", { class: "btn quiet", onclick: () => { editGoal = null; render() } }, "Cancel") : null,
      el("button", { class: "btn primary", onclick: () => { const v = ta.value.trim(); if (!v) return; editGoal = null; write(() => upd(p.id, { [`goals.${wk}`]: { text: v, by: me, at: Date.now(), reached: false } }), "Goal set for this week") } }, "Set goal")));
  } else if (goal && goal.text) {
    g.append(el("p", { class: "goal-text" + (goal.reached ? " reached" : "") }, goal.text),
      el("div", { class: "row" }, el("span", { class: "label" }, "Set by " + name(goal.by)), el("span", { class: "spacer" }),
        planner ? el("button", { class: "btn quiet", onclick: () => { editGoal = p.id; render() } }, "Edit") : null,
        planner ? el("button", { class: "btn" + (goal.reached ? "" : " primary"), onclick: () => write(() => upd(p.id, { [`goals.${wk}.reached`]: !goal.reached }), goal.reached ? null : "Goal reached!") }, goal.reached ? "Not reached yet" : "Mark as reached")
          : el("span", { class: goal.reached ? "done-badge" : "label" }, goal.reached ? "✓ Reached" : "In progress")));
  } else g.append(el("p", {}, "No goal for this week yet. A planner sets it."));
  box.append(g);

  /* check-ins */
  const week = (p.checkins || {})[wk] || {};
  const mine = week[me];
  box.append(el("div", { class: "row", style: "margin:22px 0 10px" }, el("h2", {}, "Weekly check-in"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${Object.keys(week).length} of ${Math.max(members.length, Object.keys(week).length)} done`)));
  if (!mine || editCheckin === p.id) {
    const f = id => el("textarea", { id: `ci-${id}-${p.id}`, class: "noteinput", rows: "2", maxlength: "800" });
    const did = f("did"), next = f("next"), blk = f("blk");
    if (mine && !did.value) { did.value = mine.did || ""; next.value = mine.next || ""; blk.value = mine.blockers || "" }
    box.append(el("section", { class: "idea checkin-form" },
      el("p", { style: "margin:0" }, "Takes a minute. Helps everyone know where things are."),
      el("label", { class: "tlabel", for: did.id }, "What did I do this week?"), did,
      el("label", { class: "tlabel", for: next.id }, "What will I do next?"), next,
      el("label", { class: "tlabel", for: blk.id }, "Anything blocking me? (leave empty if not)"), blk,
      el("div", { class: "row" }, el("span", { class: "spacer" }),
        mine ? el("button", { class: "btn quiet", onclick: () => { editCheckin = null; render() } }, "Cancel") : null,
        el("button", { class: "btn primary", onclick: () => {
          if (!did.value.trim() && !next.value.trim()) return toast("Write at least what you did or what's next");
          editCheckin = null;
          write(() => upd(p.id, { [`checkins.${wk}.${me}`]: { did: did.value.trim(), next: next.value.trim(), blockers: blk.value.trim(), at: Date.now() } }), "Check-in saved");
        } }, "Save check-in"))));
  }
  const cards = el("div", { class: "members" });
  for (const u of Object.keys(week).sort((a, b) => a === me ? -1 : b === me ? 1 : 0)) cards.append(checkinCard(p, u, week[u], u === me));
  box.append(cards);
  const waiting = members.filter(u => !week[u]);
  if (waiting.length) box.append(el("p", { style: "color:var(--muted);font-size:14px;margin-top:12px" }, "Waiting for: " + waiting.map(u => u === me ? "you" : name(u)).join(", ")));

  /* past weeks */
  const past = [...new Set([...Object.keys(p.checkins || {}), ...Object.keys(p.goals || {})])].filter(k => k < wk).sort().reverse();
  if (past.length) box.append(el("details", { class: "removed" }, el("summary", {}, `Past weeks (${past.length})`),
    el("div", { class: "list" }, past.map(k => {
      const pg = (p.goals || {})[k], pc = (p.checkins || {})[k] || {};
      return el("section", { class: "idea" }, el("h3", {}, weekLabel(k)),
        pg && pg.text ? el("p", {}, (pg.reached ? "✓ Goal reached: " : "Goal: ") + pg.text) : null,
        el("div", { class: "members" }, Object.entries(pc).map(([u, c]) => checkinCard(p, u, c, false))));
    }))));
}
function checkinCard(p, u, c, mine) {
  return el("article", { class: "idea checkin" + (c.blockers ? " blocked" : "") },
    el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, av(u), name(u), el("span", { class: "spacer" }), el("span", { class: "label" }, ago(c.at))),
    c.did ? el("div", {}, el("div", { class: "tlabel" }, "Did"), el("div", { class: "pre" }, c.did)) : null,
    c.next ? el("div", {}, el("div", { class: "tlabel" }, "Next"), el("div", { class: "pre" }, c.next)) : null,
    c.blockers ? el("div", { class: "blocker" }, el("div", { class: "tlabel" }, "Blocked by"), el("div", { class: "pre" }, c.blockers)) : null,
    mine ? el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: () => { editCheckin = p.id; render() } }, "Edit")) : null);
}

/* meetings */
let newMeeting = null, editMeeting = null, delMeeting = null;
function meetingForm(p, m) {
  const id = m ? m.id : "new";
  const date = el("input", { type: "date", class: "mini", id: `mt-date-${id}`, value: m ? m.date : todayStr(), style: "padding:8px 10px;font-size:14px" });
  const title = el("input", { id: `mt-title-${id}`, class: "noteinput", maxlength: "100", placeholder: "Title, e.g. Planning the first video" });
  const text = el("textarea", { id: `mt-text-${id}`, class: "noteinput", rows: "6", maxlength: "5000", placeholder: "What did we talk about? What did we decide? Who does what next?" });
  if (m && !title.value) { title.value = m.title || ""; text.value = m.text || "" }
  const save = () => {
    if (!text.value.trim() && !title.value.trim()) return toast("Write something first");
    const mid = m ? m.id : uid();
    const data = { date: date.value || todayStr(), title: title.value.trim(), text: text.value.trim(), by: m ? m.by : me, at: m ? m.at : Date.now() };
    if (m) data.edited = Date.now();
    newMeeting = null; editMeeting = null;
    write(() => upd(p.id, { ["meetings." + mid]: data }), "Meeting notes saved");
  };
  return el("section", { class: "idea" }, el("div", { class: "row" }, el("label", { class: "tlabel", for: date.id }, "Date"), date), title, text,
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: () => { newMeeting = null; editMeeting = null; render() } }, "Cancel"), el("button", { class: "btn primary", onclick: save }, "Save")));
}
function renderMeetings(box, p) {
  const list = Object.entries(p.meetings || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.at - a.at);
  box.append(el("div", { class: "row", style: "margin-bottom:12px" }, el("p", { style: "margin:0;color:var(--muted);font-size:14px;flex:1 1 220px" }, "Notes from your calls and meetups, so nobody forgets what was decided."),
    newMeeting === p.id ? null : el("button", { class: "btn primary", onclick: () => { newMeeting = p.id; editMeeting = null; render() } }, "New meeting notes")));
  if (newMeeting === p.id) box.append(meetingForm(p, null));
  if (!list.length && newMeeting !== p.id) box.append(el("div", { class: "empty" }, "No meeting notes yet."));
  const wrap = el("div", { class: "list", style: "margin-top:12px" });
  for (const m of list) {
    if (editMeeting === m.id) { wrap.append(meetingForm(p, m)); continue }
    const mine = m.by === me || canPlan(p);
    wrap.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("span", { class: "chip" }, fmtDay(new Date((m.date || todayStr()) + "T12:00").getTime())), el("span", { class: "spacer" }), el("span", { class: "by" }, av(m.by), name(m.by))),
      m.title ? el("h3", {}, m.title) : null,
      m.text ? el("div", { class: "pre" }, m.text) : null,
      mine ? el("div", { class: "row" }, el("span", { class: "spacer" }),
        el("button", { class: "btn quiet", onclick: () => { editMeeting = m.id; newMeeting = null; render() } }, "Edit"),
        delMeeting === m.id
          ? el("button", { class: "linkbtn danger", onclick: () => { delMeeting = null; write(() => upd(p.id, { ["meetings." + m.id]: DEL() }), "Deleted") } }, "Tap again to delete")
          : el("button", { class: "linkbtn danger", onclick: () => { delMeeting = m.id; render() } }, "Delete")) : null));
  }
  box.append(wrap);
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
const catEls = { ideas: $("#cat-ideas"), projects: $("#cat-projects") };   // kept so the filter can sit under the tabs
function catBar(where, list) {
  const box = catEls[where]; box.replaceChildren();
  const used = allCats().filter(c => list.some(i => (i.category || "Other") === c));
  if ((used.length < 2 || list.length < 6) && !catFilter[where]) { box.replaceChildren(); return list }
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
        ideaDeleteBtn(i),
        el("button", { class: "btn", disabled: !(d > k), title: "Available when more people vote drop than keep", onclick: () => write(() => upd(i.id, { status: "removed" }), "Idea removed") }, "Remove"),
        el("button", { class: "btn primary", disabled: !(k > d), title: "Available when more people vote keep than drop", onclick: () => write(() => upd(i.id, { status: "approved", approvedAt: Date.now() }), "Moved to Projects") }, "Confirm → Projects"))));
  }
  const rb = $("#removed"); rb.replaceChildren();
  if (removed.length) {
    rb.append(el("details", { class: "removed" }, el("summary", {}, `Removed ideas (${removed.length})`),
      el("div", { class: "list" }, removed.map(i => el("article", { class: "idea" }, el("h3", {}, i.title), el("div", { class: "row" }, el("span", { class: "by" }, av(i.author), name(i.author)), el("span", { class: "spacer" }),
        ideaDeleteBtn(i),
        el("button", { class: "btn", onclick: () => write(() => upd(i.id, { status: "voting" }), "Back in the vote") }, "Bring back to vote")))))));
  }
}

// The person who pitched an idea, and the admin, can delete it (asks once to be sure).
let confirmDelIdea = null;
function ideaDeleteBtn(i) {
  if (!(isAdmin || i.author === me)) return null;
  if (confirmDelIdea === i.id) return el("span", { class: "row", style: "gap:6px" },
    el("button", { class: "btn quiet", onclick: () => { confirmDelIdea = null; render() } }, "Cancel"),
    el("button", { class: "btn danger-btn", onclick: () => { confirmDelIdea = null; write(() => deleteDoc(doc(db, "ideas", i.id)), "Idea deleted") } }, "Yes, delete it"));
  return el("button", { class: "btn quiet danger-quiet", onclick: () => { confirmDelIdea = i.id; render() } }, i.author === me ? "Delete my idea" : "Delete");
}

/* ----- projects list ----- */

let projShow = "active";
function renderProjects(all) {
  const box = $("#projects"); box.replaceChildren();
  if (location.hash === "#projects-done") projShow = "done";
  const done = ideas.filter(i => i.status === "completed").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Show", style: "margin-bottom:14px" },
    el("button", { "aria-pressed": String(projShow === "active"), onclick: () => { projShow = "active"; if (location.hash === "#projects-done") location.hash = "projects"; render() } }, `Projects ${all.length}`),
    el("button", { "aria-pressed": String(projShow === "done"), onclick: () => { projShow = "done"; render() } }, `Completed ${done.length}`)));
  if (projShow === "done") { renderCompleted(box, done); catEls.projects.replaceChildren(); return }
  box.append(catEls.projects);
  const ranked = byVotes(all);
  const rank = Object.fromEntries(ranked.map((p, n) => [p.id, n + 1]));
  const projects = catBar("projects", ranked);
  if (all.length && !projects.length) { box.append(el("div", { class: "empty" }, "No projects in this category.")); return }
  if (!projects.length) { box.append(el("div", { class: "empty" }, "No projects yet. Ideas land here once the team votes to keep them.")); return }
  const building = projects.filter(isActive).sort((a, b) => prioRank(a) - prioRank(b));
  const next = projects.filter(p => !isActive(p));
  if (building.length) {
    box.append(el("h2", { class: "sec-h" }, "Building now"));
    box.append(el("div", { class: "list", style: "margin-top:0" }, building.map(p => projCard(p))));
  }
  if (next.length) {
    box.append(el("div", { class: "sec-h row" }, el("h2", {}, "Up next"), el("span", { class: "spacer" }), el("span", { class: "label" }, isAdmin ? "Vote, then start the ones you pick" : `Vote for what we build next`)));
    box.append(el("div", { class: "list", style: "margin-top:0" }, next.map(p => projCard(p, rank[p.id]))));
  }
}
/* ----- project links (website, socials, files…) ----- */

let addingLink = null, delLink = null;
const linksOf = p => Object.entries(p.links || {}).filter(([, l]) => l && l.url).map(([id, l]) => ({ id, ...l })).sort((a, b) => (a.at || 0) - (b.at || 0));
function cleanUrl(raw) {
  let v = (raw || "").trim(); if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null } catch { return null }
}
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url } };
function linkChip(p, l, editable) {
  const mine = editable && (l.by === me || canPlan(p));
  const a = el("a", { class: "linkchip", href: l.url, target: "_blank", rel: "noopener noreferrer", title: l.url },
    el("img", { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(l.url))}&sz=32`, alt: "", width: "16", height: "16", loading: "lazy", onerror: e => { e.target.remove() } }),
    el("span", {}, l.label || hostOf(l.url)));
  if (!mine) return a;
  return el("span", { class: "linkwrap" }, a,
    delLink === l.id
      ? el("button", { class: "linkdel sure", "aria-label": "Confirm remove " + (l.label || l.url), onclick: () => { delLink = null; write(() => upd(p.id, { ["links." + l.id]: DEL() }), "Link removed") } }, "Remove?")
      : el("button", { class: "linkdel", "aria-label": "Remove " + (l.label || l.url), onclick: () => { delLink = l.id; render() } }, "\u2715"));
}
function linksBlock(p) {
  const links = linksOf(p);
  const canAdd = p.status !== "completed" || canPlan(p);
  const files = filesOf(p);
  const box = el("div", { class: "links" }, links.map(l => linkChip(p, l, true)), files.map(f => fileChip(p, f, true)));
  if (addingLink === p.id) {
    const url = el("input", { id: "link-url-" + p.id, class: "noteinput", type: "url", inputmode: "url", placeholder: "Paste a link, e.g. instagram.com/ourpage", maxlength: "500" });
    const label = el("input", { id: "link-label-" + p.id, class: "noteinput", maxlength: "40", placeholder: "Name (optional), e.g. Instagram" });
    const save = () => {
      const u = cleanUrl(url.value);
      if (!u) { toast("That doesn't look like a web link. Try something like ourshop.com"); url.focus(); return }
      addingLink = null;
      write(() => upd(p.id, { ["links." + uid()]: { url: u, label: label.value.trim(), by: me, at: Date.now() } }), "Link added");
    };
    for (const i of [url, label]) i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } if (e.key === "Escape") { addingLink = null; render() } });
    setTimeout(() => { if (!url.value) url.focus() }, 0);
    return el("div", { class: "linkform" }, box,
      el("div", { class: "linkfields" }, url, label),
      el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { addingLink = null; render() } }, "Cancel"), el("button", { class: "btn primary small", onclick: save }, "Add link")));
  }
  if (canAdd) {
    const empty = !links.length && !files.length;
    box.append(el("button", { class: "linkchip addlink", onclick: () => { addingLink = p.id; delLink = null; render() } }, empty ? "+ Add a link" : "+ Link"));
    box.append(el("button", { class: "linkchip addlink", onclick: () => pickProjectFiles(p) }, empty ? "+ Add a file or PDF" : "+ File"));
    if (uploadingTo === p.id) box.append(el("span", { class: "label", id: "projupload" }, uploadMsg));
  }
  return links.length || files.length || canAdd ? box : null;
}

/* ----- project files (PDFs, docs, photos…), stored like chat files ----- */

let uploadingTo = null, uploadMsg = "", delFile = null;
const filesOf = p => Object.values(p.files || {}).filter(f => f && f.id && f.parts).sort((a, b) => (a.at || 0) - (b.at || 0));
function pickProjectFiles(p) {
  const inp = el("input", { type: "file", multiple: true, hidden: true });
  inp.addEventListener("change", () => { addProjectFiles(p, [...inp.files]); inp.remove() });
  document.body.append(inp); inp.click();
}
async function addProjectFiles(p, list) {
  if (!list.length || uploadingTo) return;
  await fbReady;
  uploadingTo = p.id;
  let added = 0;
  for (const f of list) {
    const isImg = /^image\/(jpeg|png|webp|heic|heif|bmp)$/.test(f.type);
    if (f.size > (isImg ? MAX_IMAGE_IN : MAX_FILE)) { toast(`${f.name} is too big. The limit is 5 MB per file.`); continue }
    const msg = t => { uploadMsg = t; const n = document.getElementById("projupload"); if (n) n.textContent = t; else render() };
    try {
      msg(`Uploading ${f.name}\u2026`);
      const file = await uploadFile(await prepareFile(f), pct => msg(`Uploading ${f.name}\u2026 ${pct}%`));
      await upd(p.id, { ["files." + file.id]: { ...file, by: me, at: Date.now() } });
      added++;
    } catch (e) {
      toast(e.code === "permission-denied" ? "Uploading isn't allowed yet. Ask Mohammed to update the database rules." : e.message === "too big" ? `${f.name} is too big, even after shrinking it.` : `${f.name} didn't upload. Check your connection and try again.`);
    }
  }
  uploadingTo = null; uploadMsg = ""; render();
  if (added) toast(added > 1 ? `${added} files added` : "File added");
}
function fileChip(p, f, editable) {
  const open = () => (f.thumb || playable(f)) ? openViewer(f) : downloadFile(f);
  const chip = el("button", { class: "linkchip filechip", title: `${f.name} \u00b7 ${fmtSize(f.size)}`, onclick: open },
    f.thumb ? el("img", { src: f.thumb, alt: "", class: "fthumb" }) : el("span", { class: "fext" }, extOf(f.name)),
    el("span", {}, f.name));
  const mine = editable && (f.by === me || canPlan(p));
  if (!mine) return chip;
  return el("span", { class: "linkwrap" }, chip,
    delFile === f.id
      ? el("button", { class: "linkdel sure", "aria-label": "Confirm remove " + f.name, onclick: () => { delFile = null; write(() => deleteProjectFile(p, f), "File removed") } }, "Remove?")
      : el("button", { class: "linkdel", "aria-label": "Remove " + f.name, onclick: () => { delFile = f.id; render() } }, "\u2715"));
}
async function deleteProjectFile(p, f) {
  await upd(p.id, { ["files." + f.id]: DEL() });
  if (f.by === me || isAdmin) for (let n = 0; n < f.parts; n++) deleteDoc(doc(db, "fileparts", `${f.id}_${n}`)).catch(() => {});
}

function projCard(p, n) {
  const tasks = tasksOf(p), team = teamOf(p), left = tasks.filter(t => isAssignee(t, me) && !t.done).length;
  const open = () => { location.hash = "project-" + p.id };
  return el("article", { class: "idea projcard" },
    el("button", { class: "cardlink", onclick: open, "aria-label": "Open " + p.title },
      el("div", { class: "row", style: "gap:8px" }, n ? el("span", { class: "rank" }, "#" + n) : null, el("h3", { style: "flex:1 1 auto;min-width:0" }, p.title), p.priority === "urgent" || p.priority === "high" ? prioChip(p) : null),
      tasks.length ? line(progressOf(tasks), "tasks") : el("span", { class: "label" }, canPlan(p) ? "No plan yet. Tap to make one" : "No plan yet")),
    linksOf(p).length || filesOf(p).length ? el("div", { class: "links" }, linksOf(p).slice(0, 3).map(l => linkChip(p, l, false)),
      filesOf(p).length ? el("span", { class: "label" }, `${filesOf(p).length} file${filesOf(p).length > 1 ? "s" : ""}`) : null) : null,
    isActive(p)
      ? el("div", { class: "row" }, el("span", { class: "stack" }, team.slice(0, 6).map(av)), el("span", { class: "spacer" }), el("span", { class: "now-sub" }, left ? `${left} of your tasks left` : ""))
      : el("div", { class: "row" }, voteButton(p), el("span", { class: "spacer" }), pickButton(p)));
}

/* ----- project votes ----- */

const projectVoters = p => Object.entries(p.backers || {}).filter(([, v]) => v).map(([u]) => u);
const byVotes = list => list.slice().sort((a, b) => projectVoters(b).length - projectVoters(a).length || (a.approvedAt || 0) - (b.approvedAt || 0));
function voteButton(p) {
  const voted = !!(p.backers || {})[me], vs = projectVoters(p);
  return el("button", { class: "v keep", "aria-pressed": String(voted), onclick: () => write(() => upd(p.id, { ["backers." + me]: voted ? DEL() : true }), voted ? "Vote removed" : "Voted") },
    voted ? "Voted" : "Vote for this", el("b", {}, vs.length), el("span", { class: "stack" }, vs.slice(0, 6).map(av)));
}
const pickButton = p => isAdmin && p.status === "approved" && !isActive(p)
  ? el("button", { class: "btn primary", onclick: () => startBuilding(p) }, "Start building")
  : null;
function startBuilding(p) {
  write(async () => {
    const data = { active: { [p.id]: { by: me, at: Date.now() } } };
    if (focusId && focusId !== p.id) data.active[focusId] = { by: me, at: Date.now() - 1 };  // keep the old single "current project" running
    data.projectId = null;
    await setDoc(doc(db, "meta", "focus"), data, { merge: true });
  }, "Started building " + p.title);
}
function pauseBuilding(p) {
  write(async () => {
    const data = { ["active." + p.id]: DEL() };
    if (focusId === p.id) data.projectId = null;
    await updateDoc(doc(db, "meta", "focus"), data);
  }, "Paused. It's still in Projects");
}
let confirmDone = null;
function completeButton(p) {
  if (confirmDone === p.id) return el("span", { class: "row", style: "gap:6px" },
    el("button", { class: "btn quiet", onclick: () => { confirmDone = null; render() } }, "Cancel"),
    el("button", { class: "btn primary", onclick: () => completeProject(p) }, "Yes, it's finished"));
  return el("button", { class: "btn", onclick: () => { confirmDone = p.id; render() } }, "Mark as completed");
}
function completeProject(p) {
  confirmDone = null;
  write(async () => {
    await upd(p.id, { status: "completed", completedAt: Date.now(), completedBy: me });
    if (isAdmin && (activeMap[p.id] || focusId === p.id)) await updateDoc(doc(db, "meta", "focus"), { ["active." + p.id]: DEL(), ...(focusId === p.id ? { projectId: null } : {}) }).catch(() => {});
  }, p.title + " is completed. Well done!");
  celebrate();
  location.hash = "projects-done";
}
function reopenProject(p) { write(() => upd(p.id, { status: "approved", completedAt: DEL(), completedBy: DEL() }), "Reopened. It's back in Projects") }
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = el("canvas", { class: "confetti" }); document.body.append(c);
  const ctx = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const colors = ["--accent", "--keep", "--warn", "--drop"].map(v => cs.getPropertyValue(v).trim() || "#4656D6");
  const bits = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 14, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 3, c: colors[Math.random() * 4 | 0], a: Math.random() * 6 }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) { b.vy += .45; b.x += b.vx; b.y += b.vy; b.a += .2; ctx.fillStyle = b.c; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore() }
    if (++t < 110) requestAnimationFrame(frame); else c.remove();
  })();
}

/* ----- plan page ----- */

function renderCompleted(box, done) {
  if (!done.length) { box.append(el("div", { class: "empty" }, "No completed projects yet. When a project is finished, a planner presses \u201cMark as completed\u201d and it moves here.")); return }
  for (const p of done) {
    const tasks = tasksOf(p), pr = progressOf(tasks);
    const team = [...new Set(tasks.map(t => t.owner).filter(Boolean))];
    const days = p.approvedAt > 1.6e12 && p.completedAt ? Math.max(1, Math.round((p.completedAt - p.approvedAt) / 864e5)) : null;
    box.append(el("article", { class: "idea done-card" },
      el("div", { class: "row" }, el("span", { class: "done-badge" }, "\u2713 Completed " + fmtDay(p.completedAt)), el("span", { class: "spacer" }), catChip(p)),
      el("h3", {}, p.title),
      p.pitch ? el("p", {}, p.pitch) : null,
      el("div", { class: "row", style: "gap:14px;font-size:14px;color:var(--muted)" },
        el("span", {}, `${pr.done} of ${pr.total} tasks done`), days ? el("span", {}, `${days} day${days > 1 ? "s" : ""} from start to finish`) : null,
        el("span", { class: "row", style: "gap:6px" }, el("span", { class: "stack" }, team.slice(0, 6).map(av)), team.length ? `${team.length} worked on it` : "")),
      el("div", { class: "row" }, el("span", { class: "spacer" }),
        canPlan(p) ? el("button", { class: "btn quiet", onclick: () => reopenProject(p) }, "Reopen") : null,
        el("button", { class: "btn", onclick: () => { location.hash = "plan-" + p.id } }, "See the plan and notes"))));
  }
}
function fmtDay(at) { return at ? new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "" }

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
  const editing = planner && planEdit === p.id;
  if (planner && !opts.filter) wrap.append(el("div", { class: "row", style: "gap:8px" },
    unassigned ? el("span", { style: "color:var(--muted);font-size:14px" }, `${unassigned} not assigned`) : null,
    el("span", { class: "spacer" }),
    unassigned ? el("button", { class: "btn small", onclick: () => runSuggest(p) }, "Suggest who does what") : null,
    el("button", { class: "btn small" + (editing ? " primary" : ""), onclick: () => { planEdit = editing ? null : p.id; render() } }, editing ? "Done editing" : "Edit phases")));
  if (suggestions[p.id]) wrap.append(suggestPanel(p));

  const show = t => !opts.filter || isAssignee(t, opts.filter);
  const known = new Set(phases.map(ph => ph.id));
  const loose = tasks.filter(t => !known.has(t.phase) && show(t));
  let shown = 0;
  phases.forEach((ph, n) => {
    const list = tasks.filter(t => t.phase === ph.id && show(t));
    if (opts.filter && !list.length) return;
    shown++;
    wrap.append(phaseCard(p, ph, n, phases, list, { editing, filtered: !!opts.filter }));
  });
  if (loose.length) wrap.append(phaseCard(p, { id: "__loose", name: "Not in a phase" }, -1, phases, loose, { editing, filtered: !!opts.filter }));
  if (opts.filter && !shown && !loose.length) wrap.append(el("div", { class: "empty" }, (opts.filter === me ? "You don't" : name(opts.filter) + " doesn't") + " have any tasks in this project yet."));
  if (editing) wrap.append(el("section", { class: "idea addphase" }, el("h3", {}, "Add a phase"), addPhaseRow(p, phases, "Phase name, e.g. Filming")));
  return wrap;
}

function phaseCard(p, ph, n, phases, list, mode = {}) {
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
  if (planner && mode.editing && !loose && renamingPhase !== p.id + ph.id) {
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
  if (!list.length) sec.append(el("p", { style: "font-size:14px" }, planner ? "No tasks yet. Add the first one below." : "No tasks yet."));
  for (const t of list) sec.append(taskItem(p, t, "p", { people: "always" }));
  if (planner && !loose && !mode.filtered) sec.append(addTaskRow(p, ph));
  return sec;
}

function addTaskRow(p, ph) {
  const tid = `add-${p.id}-${ph.id}`;
  const inp = el("input", { id: tid, placeholder: "+ Add a task", maxlength: "140" });
  const who = el("select", { class: "mini", id: tid + "-who", "aria-label": "Who does it" }, el("option", { value: "" }, "Who?"), teamIds().map(u => el("option", { value: u }, name(u))));
  const add = () => {
    const text = inp.value.trim(); if (!text) return; inp.value = "";
    write(() => upd(p.id, { ["tasks." + uid()]: { text, phase: ph.id, skill: null, owner: who.value || null, assignedBy: me, assignedAt: Date.now(), done: false, order: Date.now(), due: null } }));
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  return el("div", { class: "padd", style: "margin:6px 0 0" }, el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, inp, el("button", { class: "btn", onclick: add }, "Add")),
    el("div", { class: "padd-more row", style: "gap:8px;font-size:13px;color:var(--muted)" }, el("label", { for: who.id }, "Who does it?"), who));
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

/* ----- tasks: the same row everywhere; tap a task to open its details ----- */

let openTask = null, delTask = null;          // "<where>:<taskId>"
const isAssignee = (t, u) => t.owner === u || !!(t.helpers || {})[u];
const assignees = t => [...new Set([t.owner, ...Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u)].filter(Boolean))];
const checkList = t => Object.entries(t.check || {}).filter(([, c]) => c && c.text).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.order || 0) - (b.order || 0));
const TASK_PRIOS = ["urgent", "high", "medium", "low"];
const taskPrioRank = t => TASK_PRIOS.indexOf(t.priority || "medium");
function dueChip(t) {
  if (!t.due) return null;
  const today = todayStr(), late = !t.done && t.due < today, soon = !t.done && t.due === today;
  return el("span", { class: "due" + (late ? " late" : soon ? " soon" : "") }, late ? "Overdue · " + fmtDate(t.due) : soon ? "Due today" : "Due " + fmtDate(t.due));
}

function taskItem(p, t, where, opts = {}) {
  const key = where + ":" + t.id, open = openTask === key;
  const can = canPlan(p) || isAssignee(t, me);
  const cl = checkList(t), cld = cl.filter(c => c.done).length;
  const ncount = Object.values(t.notes || {}).filter(n => n && n.text).length;
  const people = assignees(t);
  const showPeople = opts.people === "always" || (opts.people !== "never" && (opts.people !== "multi" || people.length > 1));
  return el("div", { class: "task" + (t.done ? " done" : "") + (isAssignee(t, me) ? " mytask" : "") + (open ? " open" : "") },
    el("input", { type: "checkbox", id: "c-" + key, checked: t.done, disabled: !can, "aria-label": "Done: " + t.text, title: can ? "" : "Only the people on this task or a planner can tick it", onchange: e => toggleDone(p, t, e.target.checked, key) }),
    el("button", { class: "ttext", "aria-expanded": String(open), onclick: () => { openTask = open ? null : key; delTask = null; render() } }, t.text),
    el("button", { class: "chev", "aria-label": open ? "Close details" : "Open details", onclick: () => { openTask = open ? null : key; delTask = null; render() } }, open ? "–" : "…"),
    el("div", { class: "meta" },
      opts.project ? el("button", { class: "linkbtn", onclick: () => { location.hash = "plan-" + p.id } }, p.title) : null,
      opts.phase ? el("span", { class: "label" }, opts.phase) : null,
      showPeople ? (people.length ? el("span", { class: "stack", title: people.map(name).join(", ") }, people.slice(0, 4).map(av)) : el("span", { class: "label" }, "Not assigned")) : null,
      !t.done && t.status === "doing" ? el("span", { class: "doing" }, "In progress") : null,
      t.priority && t.priority !== "medium" ? el("span", { class: "prio prio-" + t.priority }, PRIORITIES.find(x => x.id === t.priority).name) : null,
      dueChip(t),
      cl.length ? el("span", { class: "label" }, `Checklist ${cld}/${cl.length}`) : null,
      ncount ? el("span", { class: "label" }, `${ncount} note${ncount > 1 ? "s" : ""}`) : null),
    open ? taskDetail(p, t, key) : null);
}

function taskDetail(p, t, key) {
  const planner = canPlan(p), can = planner || isAssignee(t, me), phases = getPhases(p);
  const set = (data, ok) => write(() => upd(p.id, data), ok);
  const box = el("div", { class: "tdetail" });
  const field = (label, ...kids) => el("div", { class: "tfield" }, el("span", { class: "tlabel" }, label), el("div", { class: "tval" }, ...kids));

  const cur = t.done ? "done" : t.status === "doing" ? "doing" : "todo";
  box.append(field("Status", el("div", { class: "seg seg-sm", role: "group", "aria-label": "Status" },
    [["todo", "Not started"], ["doing", "In progress"], ["done", "Done"]].map(([v, l]) => el("button", { "aria-pressed": String(cur === v), disabled: !can, onclick: () => setTaskStatus(p, t, v, key) }, l)))));

  const people = assignees(t);
  if (planner) {
    const lead = el("select", { class: "mini", "aria-label": "Main person", onchange: e => set({ [t.path + ".owner"]: e.target.value || null, [t.path + ".assignedBy"]: me, [t.path + ".assignedAt"]: Date.now() }) },
      el("option", { value: "" }, "Nobody yet"), teamIds().map(u => el("option", { value: u }, name(u))));
    lead.value = t.owner || "";
    const helpers = Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u).filter(u => u !== t.owner);
    const others = teamIds().filter(u => u !== t.owner && !helpers.includes(u));
    const addSel = others.length && t.owner ? el("select", { class: "mini", "aria-label": "Add someone", onchange: e => { const u = e.target.value; if (u) set({ [`${t.path}.helpers.${u}`]: { by: me, at: Date.now() } }, `${name(u)} added to the task`) } },
      el("option", { value: "" }, "+ Add someone"), others.map(u => el("option", { value: u }, name(u)))) : null;
    box.append(field("People", lead,
      ...helpers.map(u => el("span", { class: "planner" }, av(u), name(u), el("button", { class: "x", "aria-label": "Remove " + name(u), onclick: () => set({ [`${t.path}.helpers.${u}`]: DEL() }) }, "✕"))),
      addSel));
  } else {
    box.append(field("People", people.length ? people.map(u => el("span", { class: "planner" }, av(u), name(u))) : el("span", { class: "label" }, "Not assigned yet")));
  }

  if (planner) {
    const pr = el("select", { class: "mini", "aria-label": "Task priority", onchange: e => set({ [t.path + ".priority"]: e.target.value }) }, PRIORITIES.map(x => el("option", { value: x.id }, x.name)));
    pr.value = t.priority || "medium";
    const due = el("input", { type: "date", class: "mini", "aria-label": "Due date", value: t.due || "", onchange: e => set({ [t.path + ".due"]: e.target.value || null }) });
    const sk = el("select", { class: "mini", "aria-label": "Skill needed", onchange: e => set({ [t.path + ".skill"]: e.target.value || null }) }, el("option", { value: "" }, "Any skill"), SKILL_IDS.map(s => el("option", { value: s }, SKILLS[s].name)));
    sk.value = t.skill || "";
    box.append(field("Priority", pr), field("Due", due), field("Skill", sk));
    if (phases.length > 1) {
      const ph = el("select", { class: "mini", "aria-label": "Phase", onchange: e => write(() => phaseWrite(p, { [t.path + ".phase"]: e.target.value })) }, phases.map(x => el("option", { value: x.id }, x.name)));
      ph.value = t.phase; box.append(field("Phase", ph));
    }
  } else {
    box.append(field("Details", el("span", { class: "row", style: "gap:6px" },
      el("span", { class: "prio prio-" + (t.priority || "medium") }, PRIORITIES.find(x => x.id === (t.priority || "medium")).name), dueChip(t) || el("span", { class: "label" }, "No due date"),
      t.skill ? el("span", { class: "chip" }, SKILLS[t.skill].name) : null)));
  }

  /* checklist */
  const cl = checkList(t);
  const ck = el("div", { class: "checklist" });
  for (const c of cl) ck.append(el("div", { class: "ck" + (c.done ? " done" : "") },
    el("input", { type: "checkbox", id: `ck-${key}-${c.id}`, checked: !!c.done, disabled: !can, onchange: e => set({ [`${t.path}.check.${c.id}.done`]: e.target.checked }) }),
    el("label", { for: `ck-${key}-${c.id}` }, c.text),
    can ? el("button", { class: "x", "aria-label": "Remove step " + c.text, onclick: () => set({ [`${t.path}.check.${c.id}`]: DEL() }) }, "✕") : null));
  if (can) {
    const inp = el("input", { id: "ckadd-" + key, placeholder: "Add a step", maxlength: "120" });
    const add = () => { const v = inp.value.trim(); if (!v) return; inp.value = ""; set({ [`${t.path}.check.${uid()}`]: { text: v, done: false, order: Date.now() } }) };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
    ck.append(el("div", { class: "addtask", style: "margin-top:2px" }, inp, el("button", { class: "btn", onclick: add }, "Add")));
  } else if (!cl.length) ck.append(el("span", { class: "label" }, "No steps"));
  box.append(field("Checklist", ck));

  box.append(field("Notes", notesBlock(p, t, key)));

  if (planner) box.append(el("div", { class: "row", style: "justify-content:flex-end" },
    delTask === key
      ? el("button", { class: "linkbtn danger", onclick: () => { delTask = null; openTask = null; set({ [t.path]: DEL() }, "Task deleted") } }, "Tap again to delete this task")
      : el("button", { class: "linkbtn danger", onclick: () => { delTask = key; render() } }, "Delete task")));
  return box;
}

function setTaskStatus(p, t, v, key) {
  if (v === "done") return toggleDone(p, t, true, key);
  const data = { [t.path + ".done"]: false };
  if (v === "doing") { data[t.path + ".status"] = "doing"; data[t.path + ".startedBy"] = me; data[t.path + ".startedAt"] = Date.now() }
  else data[t.path + ".status"] = null;
  write(() => upd(p.id, data), v === "doing" ? "Marked as in progress" : null);
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
  write(async () => {
    const data = { [`phases.${ph.id}`]: DEL() };
    for (const t of list) data[t.path] = DEL();
    await phaseWrite(p, {}); await upd(p.id, data);
  }, "Phase deleted");
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
      const sel = el("select", { class: "mini", "aria-label": "Add a planner", onchange: e => { const u = e.target.value; if (u) write(() => upd(p.id, { ["planners." + u]: { by: me, at: Date.now() } }), `${name(u)} can now plan this project`) } },
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
        const data = {}; for (const s of list) { data[s.task.path + ".owner"] = s.owner; data[s.task.path + ".assignedBy"] = me; data[s.task.path + ".assignedAt"] = Date.now() }
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
function toggleDone(p, t, done, key) {
  openNote = done ? "any:" + t.id : (openNote && openNote.endsWith(":" + t.id) ? null : openNote);
  if (done && key) openTask = key;
  const data = { [t.path + ".done"]: done };
  if (done) { data[t.path + ".doneBy"] = me; data[t.path + ".doneAt"] = Date.now() }
  write(() => upd(p.id, data), done ? "Nice! Add a note about what you did" : null);
}
function notesBlock(p, t, where) {
  const key = where + ":" + t.id;
  const isOpen = openNote === key || openNote === "any:" + t.id;
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
  await fbReady;
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
    await fbReady;
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

/* ----- project priority ----- */

const PRIORITIES = [
  { id: "urgent", name: "Urgent" },
  { id: "high", name: "High" },
  { id: "medium", name: "Medium" },
  { id: "low", name: "Low" },
];
const prioOf = p => PRIORITIES.find(x => x.id === p.priority) || PRIORITIES[2];
const prioRank = p => PRIORITIES.indexOf(prioOf(p));
const prioChip = p => el("span", { class: "prio prio-" + prioOf(p).id }, prioOf(p).name + " priority");
function prioControl(p) {
  if (!canPlan(p)) return el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Priority", prioChip(p));
  const sel = el("select", { class: "mini", "aria-label": "Priority", onchange: e => write(() => upd(p.id, { priority: e.target.value }), "Priority changed") },
    PRIORITIES.map(x => el("option", { value: x.id }, x.name)));
  sel.value = prioOf(p).id;
  return el("label", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Priority", sel);
}

/* ----- my tasks ----- */

let mineShow = "todo";
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
let personal = [];
function myTasks() {
  const out = personal.map(t => ({ t, phase: "", personal: true, p: { id: "__personal", title: "Just for me", priority: t.priority || "medium" } }));
  for (const p of ideas.filter(i => i.status === "approved" || i.status === "completed")) {
    const phases = getPhases(p);
    for (const t of tasksOf(p)) if (isAssignee(t, me)) out.push({ p, t, closed: p.status === "completed", phase: (phases.find(ph => ph.id === t.phase) || {}).name || "" });
  }
  return out;
}
function renderMine(box) {
  const all = myTasks();
  // A task you just ticked stays in "To do" until you save or skip its note.
  const noting = x => openNote && openNote.endsWith(":" + x.t.id);
  const todo = all.filter(x => !x.closed && (!x.t.done || noting(x))), done = all.filter(x => x.t.done);
  const today = todayStr();
  const overdue = todo.filter(x => !x.t.done && x.t.due && x.t.due < today).length;

  box.append(addPersonalTaskRow());
  if (!all.length) { box.append(el("div", { class: "empty" }, "No tasks yet. Add one for yourself above. When a planner gives you a task in a project, it shows up here too.")); return }

  const list = el("section", { class: "idea", style: "gap:0" });
  if (!todo.length) list.append(el("p", { style: "padding:6px 0" }, "All done. Nice work."));
  // Highest priority first, then the soonest due date.
  todo.sort((a, b) => prioRank(a.p) - prioRank(b.p) || taskPrioRank(a.t) - taskPrioRank(b.t) || ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : (a.t.due || "9999") > (b.t.due || "9999") ? 1 : 0) || (isActive(a.p) ? -1 : isActive(b.p) ? 1 : 0) || (a.t.order || 0) - (b.t.order || 0));
  todo.forEach(x => list.append(myTaskRow(x)));
  box.append(list);
  if (done.length) {
    box.append(el("button", { class: "linkbtn", style: "margin:12px 4px", onclick: () => { mineShow = mineShow === "done" ? "todo" : "done"; render() } }, mineShow === "done" ? "Hide finished" : `Show finished (${done.length})`));
    if (mineShow === "done") {
      const dl = el("section", { class: "idea", style: "gap:0;opacity:.85" });
      done.sort((a, b) => (b.t.doneAt || 0) - (a.t.doneAt || 0)).slice(0, 30).forEach(x => dl.append(myTaskRow(x)));
      box.append(dl);
    }
  }
}
function addPersonalTaskRow() {
  const inp = el("input", { id: "ptask-text", placeholder: "+ Add a private task for yourself", maxlength: "200" });
  const due = el("input", { type: "date", class: "mini", id: "ptask-due", "aria-label": "Due date" });
  const pri = el("select", { class: "mini", id: "ptask-prio", "aria-label": "Priority" }, PRIORITIES.map(x => el("option", { value: x.id }, x.name + " priority")));
  pri.value = "medium";
  const add = () => {
    const text = inp.value.trim(); if (!text) return;
    const data = { text, done: false, due: due.value || null, priority: pri.value, order: Date.now() };
    inp.value = ""; due.value = "";
    write(() => setDoc(doc(db, "private", me, "tasks", uid()), data), "Task added");
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  return el("div", { class: "padd" },
    el("div", { class: "addtask", style: "margin:0" }, inp, el("button", { class: "btn primary", onclick: add }, "Add")),
    el("div", { class: "padd-more row", style: "gap:8px;font-size:13px;color:var(--muted)" }, pri, el("label", { class: "row", style: "gap:6px" }, "Due", due), el("span", { class: "spacer" }), el("span", {}, "Only you see these")));
}
function myTaskRow(x) {
  if (x.personal) return personalTaskRow(x.t);
  return taskItem(x.p, x.t, "mine", { project: true, phase: x.phase, people: "multi" });
}

function personalTaskRow(t) {
  const cid = "myp-" + t.id, today = todayStr();
  const late = !t.done && t.due && t.due < today, soon = !t.done && t.due === today;
  const ref = doc(db, "private", me, "tasks", t.id);
  return el("div", { class: "task" + (t.done ? " done" : "") },
    el("input", { type: "checkbox", id: cid, checked: !!t.done, onchange: e => write(() => setDoc(ref, { done: e.target.checked, doneAt: e.target.checked ? Date.now() : null }, { merge: true }), e.target.checked ? "Done" : null) }),
    el("label", { for: cid, class: "ttext" }, t.text),
    el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => write(() => deleteDoc(ref), "Task deleted") }, "\u2715"),
    el("div", { class: "meta" },
      el("span", { class: "label" }, "Just for me"),
      t.due ? el("span", { class: "due" + (late ? " late" : soon ? " soon" : "") }, late ? "Overdue \u00b7 " + fmtDate(t.due) : soon ? "Due today" : "Due " + fmtDate(t.due)) : null));
}

/* ----- private notes (only the person who wrote them can read them) ----- */

let myNotes = [];
const noteTimers = {};
function newPrivateNote() {
  const id = uid();
  myNotes.unshift({ id, text: "", at: Date.now() });
  render();
  setTimeout(() => { const n = document.getElementById("pn-" + id); if (n) n.focus() }, 0);
  write(() => setDoc(doc(db, "private", me, "notes", id), { text: "", at: Date.now() }));
}
function savePrivateNote(id, text) {
  clearTimeout(noteTimers[id]);
  const mark = document.getElementById("pns-" + id); if (mark) mark.textContent = "Saving…";
  noteTimers[id] = setTimeout(async () => {
    try { await fbReady; await setDoc(doc(db, "private", me, "notes", id), { text, at: Date.now() }, { merge: true }); const m = document.getElementById("pns-" + id); if (m) m.textContent = "Saved" }
    catch (e) { const m = document.getElementById("pns-" + id); if (m) m.textContent = e.code === "permission-denied" ? "Not saved: ask Mohammed to update the database rules" : "Not saved: check your connection" }
  }, 700);
}
let delNoteId = null;
function renderNotes(box) {
  box.append(el("div", { class: "row", style: "margin-bottom:12px" },
    el("div", {}, el("p", { style: "margin:0;color:var(--muted);font-size:14px" }, "Only you can see these. Not your friends, not the admin.")),
    el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: newPrivateNote }, "New note")));
  if (!myNotes.length) { box.append(el("div", { class: "empty" }, "No notes yet. Use this for ideas, reminders, to-dos, anything just for you.")); return }
  const grid = el("div", { class: "notegrid" });
  for (const n of myNotes) {
    const ta = el("textarea", { id: "pn-" + n.id, class: "noteinput pnote", maxlength: "20000", rows: "6", placeholder: "Write anything…", oninput: e => savePrivateNote(n.id, e.target.value) });
    ta.value = n.text || "";
    grid.append(el("article", { class: "idea", style: "gap:8px" }, ta,
      el("div", { class: "row", style: "gap:8px;font-size:12px;color:var(--muted)" },
        el("span", { id: "pns-" + n.id }, "Edited " + ago(n.at)), el("span", { class: "spacer" }),
        delNoteId === n.id
          ? el("button", { class: "linkbtn danger", onclick: () => { delNoteId = null; clearTimeout(noteTimers[n.id]); write(() => deleteDoc(doc(db, "private", me, "notes", n.id)), "Note deleted") } }, "Tap again to delete")
          : el("button", { class: "linkbtn danger", onclick: () => { delNoteId = n.id; render() } }, "Delete"))));
  }
  box.append(grid);
}

/* ----- alerts ----- */

const seenAlertsKey = () => "alertsSeen:" + me;
const getAlertsSeen = () => { try { return +localStorage.getItem(seenAlertsKey()) || 0 } catch { return 0 } };
let alertsOpen = false, alertBaseline = null;
const pageOpenedAt = Date.now();
const dayStart = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() + offset * 864e5 };
function buildAlerts() {
  const out = [], today = todayStr();
  const tomorrow = (() => { const d = new Date(dayStart(1)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` })();
  const add = (key, at, who, text, go) => { if (at) out.push({ key, at, who, text, go }) };
  for (const p of ideas) {
    if (p.status === "voting" && p.author !== me) add("idea:" + p.id, p.createdAt, p.author, `${name(p.author)} pitched a new idea: ${p.title}`, "ideas");
    if (p.status === "completed" && p.completedBy !== me) add("done:" + p.id, p.completedAt, p.completedBy, `${p.title} is completed`, "projects-done");
    const pl = (p.planners || {})[me];
    if (pl && typeof pl === "object" && pl.by !== me) add("planner:" + p.id, pl.at, pl.by, `${name(pl.by)} made you a planner of ${p.title}`, "plan-" + p.id);
    if (p.status !== "approved") continue;
    for (const t of tasksOf(p)) {
      if (!isAssignee(t, me)) continue;
      if (t.assignedBy && t.assignedBy !== me) add("task:" + t.id + ":" + t.assignedAt, t.assignedAt, t.assignedBy, `${name(t.assignedBy)} gave you a task: ${t.text} (${p.title})`, "me");
      const h = (t.helpers || {})[me];
      if (h && h.by !== me) add("help:" + t.id, h.at, h.by, `${name(h.by)} added you to a task: ${t.text} (${p.title})`, "me");
      for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by !== me) add("note:" + nid, n.at, n.by, `${name(n.by)} left a note on your task: ${t.text}`, "plan-" + p.id);
      if (!t.done && t.due && t.due <= tomorrow) add("due:" + t.id + ":" + today, dayStart(), null, t.due < today ? `Overdue: ${t.text} (${p.title})` : t.due === today ? `Due today: ${t.text} (${p.title})` : `Due tomorrow: ${t.text} (${p.title})`, "me");
    }
  }
  for (const t of personal) if (!t.done && t.due && t.due <= tomorrow) add("due:" + t.id + ":" + today, dayStart(), null, t.due < today ? `Overdue: ${t.text}` : t.due === today ? `Due today: ${t.text}` : `Due tomorrow: ${t.text}`, "me");
  const wk = weekKey();
  for (const p of ideas.filter(i => i.status === "approved")) {
    const mineHere = canPlan(p) || !!(p.members || {})[me] || tasksOf(p).some(t => isAssignee(t, me));
    if (!mineHere) continue;
    const g = (p.goals || {})[wk];
    if (g && g.text && g.by !== me) add("goal:" + p.id + ":" + wk + ":" + g.at, g.at, g.by, `New goal this week in ${p.title}: ${g.text}`, "build-" + p.id);
    for (const [u, c] of Object.entries((p.checkins || {})[wk] || {})) if (u !== me && c && c.blockers) add("blk:" + p.id + ":" + u + ":" + c.at, c.at, u, `${name(u)} is blocked in ${p.title}: ${c.blockers}`, "build-" + p.id);
    for (const f of filesOf(p)) if (f.by !== me) add("file:" + f.id, f.at, f.by, `${name(f.by)} added a file to ${p.title}: ${f.name}`, "project-" + p.id);
    for (const [lid, l] of Object.entries(p.links || {})) if (l && l.by !== me) add("link:" + lid, l.at, l.by, `${name(l.by)} added a link to ${p.title}: ${l.label || hostOf(l.url)}`, "project-" + p.id);
    for (const [mid, m] of Object.entries(p.meetings || {})) if (m && m.by !== me) add("meet:" + mid, m.at, m.by, `${name(m.by)} added meeting notes in ${p.title}${m.title ? ": " + m.title : ""}`, "build-" + p.id);
  }
  for (const [pid, a] of Object.entries(activeMap)) { const p = ideas.find(i => i.id === pid); if (p && a && a.by !== me && p.status === "approved") add("start:" + pid + ":" + a.at, a.at, a.by, `We started building ${p.title}`, "build-" + pid) }
  for (const m of chat) { if (m.by === me || !m.replyTo) continue; const o = chat.find(x => x.id === m.replyTo); if (o && o.by === me) add("reply:" + m.id, m.at, m.by, `${name(m.by)} replied to you: ${msgSummary(m)}`, "chat") }
  return out.sort((a, b) => b.at - a.at).slice(0, 50);
}
function renderAlerts() {
  const list = buildAlerts(), seen = getAlertsSeen();
  const unread = list.filter(a => a.at > seen).length;
  const c = $("#c-alerts"); c.hidden = !unread; c.textContent = unread > 9 ? "9+" : unread;
  notifyDevice(list);
  const panel = $("#alerts"); panel.hidden = !alertsOpen;
  if (!alertsOpen) return;
  panel.replaceChildren();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  panel.append(el("div", { class: "row", style: "padding:4px 4px 8px" }, el("h3", {}, "Alerts"), el("span", { class: "spacer" }),
    el("button", { class: "x", "aria-label": "Close alerts", onclick: () => { alertsOpen = false; render() } }, "\u2715")));
  if (perm === "default") panel.append(el("div", { class: "alert-tip" }, el("span", {}, "Get these as pop-ups on this phone or computer while the site is open."),
    el("button", { class: "btn primary", onclick: enableDeviceAlerts }, "Turn on")));
  if (!list.length) panel.append(el("p", { class: "alert-empty" }, "Nothing yet. You'll see new tasks, notes, replies and deadlines here."));
  for (const a of list) panel.append(el("button", { class: "alert" + (a.at > alertsSeenAtOpen ? " new" : ""), onclick: () => { alertsOpen = false; location.hash = a.go; render() } },
    a.who ? av(a.who) : el("span", { class: "alert-dot" }, "!"),
    el("span", { class: "alert-body" }, el("span", {}, a.text), el("span", { class: "alert-time" }, a.key.startsWith("due:") ? "Today" : ago(a.at)))));
}
let alertsSeenAtOpen = 0;
function toggleAlerts() {
  alertsOpen = !alertsOpen;
  if (alertsOpen) { alertsSeenAtOpen = getAlertsSeen(); try { localStorage.setItem(seenAlertsKey(), String(Date.now())) } catch { } }
  render();
}
document.addEventListener("click", e => { if (alertsOpen && !e.target.closest("#alerts") && !e.target.closest("#bell")) { alertsOpen = false; render() } });

// Pop-up alerts on this device. They work while the site is open (a tab or the home-screen app).
let swReg = null;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").then(r => { swReg = r }).catch(() => {});
async function enableDeviceAlerts() {
  try { const r = await Notification.requestPermission(); toast(r === "granted" ? "Alerts are on for this device" : "Alerts stay off. You can change this in your browser settings") } catch { toast("This browser can't show alerts") }
  render();
}
function notifyDevice(list) {
  if (!live) return;
  if (alertBaseline === null) { alertBaseline = new Set(list.map(a => a.key)); return }
  // Only pop up things that happened after the page was opened, not old ones that finished loading late.
  const fresh = list.filter(a => !alertBaseline.has(a.key) && a.at > pageOpenedAt && !a.key.startsWith("due:"));
  fresh.forEach(a => alertBaseline.add(a.key));
  if (!fresh.length || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const a of fresh.slice(0, 3)) {
    const opts = { body: a.text, icon: "icon-192.png", badge: "icon-192.png", tag: a.key, data: { go: a.go } };
    if (swReg) swReg.showNotification("Pitch Room", opts).catch(() => {});
    else try { new Notification("Pitch Room", opts) } catch { }
  }
}

/* ----- me: personal home page ----- */

let meTab = "tasks";
function greeting() { const h = new Date().getHours(); return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening" }
function renderMe() {
  const box = $("#me"); box.replaceChildren();
  const prof = people[me] || {}, tops = topSkills(me);
  const fullName = (myProfile && myProfile.name) || prof.name || "";
  const all = myTasks(), open = all.filter(x => !x.t.done && !x.closed), today = todayStr();
  const overdue = open.filter(x => x.t.due && x.t.due < today).length;
  const weekAgo = Date.now() - 7 * 864e5;
  const doneWeek = all.filter(x => x.t.done && (x.t.doneAt || 0) > weekAgo).length;
  const building = activeProjects();

  box.append(el("section", { class: "profile" },
    el("img", { class: "av av-lg", src: (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
    el("div", { class: "profile-main" },
      el("div", { class: "hello" }, greeting() + ","),
      el("h1", {}, fullName.split(" ")[0] || "you"),
      el("div", { class: "row", style: "gap:6px;margin-top:8px" },
        tops.length ? tops.map(s => el("span", { class: "chip" }, SKILLS[s].name)) : el("button", { class: "linkbtn", onclick: () => { location.hash = "skills" } }, "Take the skills quiz \u2192")))),
    el("div", { class: "stats" },
      el("div", { class: "stat" }, el("b", {}, open.length), el("span", {}, "to do")),
      el("div", { class: "stat" + (overdue ? " late" : "") }, el("b", {}, overdue), el("span", {}, "overdue")),
      el("div", { class: "stat" }, el("b", {}, doneWeek), el("span", {}, "done this week"))));

  for (const p of building) {
    const left = tasksOf(p).filter(t => t.owner === me && !t.done).length;
    box.append(el("button", { class: "nowcard", onclick: () => { location.hash = "build-" + p.id } },
      el("span", { class: "now-label" }, "We're building"),
      el("span", { class: "now-title" }, p.title),
      el("span", { class: "now-sub" }, left ? `${left} of your tasks left \u2192` : "Open the project \u2192")));
  }

  if (privErr) box.append(el("div", { class: "notice" }, privErr === "rules"
    ? "Your personal tasks and notes can't load yet. Mohammed needs to publish the latest database rules in Firebase. This page will try again by itself."
    : "Your personal tasks and notes can't load right now. Check your connection. Trying again\u2026"));

  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Show", style: "margin:18px 0 12px" },
    el("button", { "aria-pressed": String(meTab === "tasks"), onclick: () => { meTab = "tasks"; render() } }, "My tasks"),
    el("button", { "aria-pressed": String(meTab === "notes"), onclick: () => { meTab = "notes"; render() } }, "My notes")));
  const body = el("div");
  if (meTab === "notes") renderNotes(body); else renderMine(body);
  box.append(body);

  box.append(el("div", { class: "me-foot" },
    el("button", { class: "btn", onclick: () => { location.hash = "skills" } }, prof.skills ? "Skills & team" : "Skills quiz"),
    el("span", { class: "spacer" }),
    el("span", { class: "me-email" }, (myProfile && myProfile.email) || ""),
    el("button", { class: "btn", onclick: doSignOut }, "Sign out")));
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

$("#me-btn").onclick = () => { location.hash = "me" };
$("#bell").onclick = e => { e.stopPropagation(); toggleAlerts() };
$("#brand").onclick = () => { location.hash = "me" };
if (loadCache()) show();
