// Firebase is loaded in the background so the page can draw right away from the last saved copy.
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
let auth, db, GoogleAuthProvider, signInWithPopup, signOut, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limitToLast, getDoc, getDocs, Bytes, where, writeBatch;
const fbReady = (async () => {
  const [appM, authM, fsM] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
  const fb = appM.initializeApp(firebaseConfig);
  ({ GoogleAuthProvider, signInWithPopup, signOut } = authM);
  ({ collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limitToLast, getDoc, getDocs, Bytes, where, writeBatch } = fsM);
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
let toastT; function toast(m, ms) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms || 2200) }
const status = (m, warn) => { const s = $("#status"); s.textContent = m || ""; s.className = "status" + (warn ? " warn" : "") };
const DEL = () => deleteField();
const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23999'/%3E%3C/svg%3E";
const pctOf = (d, t) => t ? Math.round(d / t * 100) : 0;

/* ---------- routing ---------- */

const VIEWS = ["me", "ideas", "projects", "chat", "partners", "skills", "settings", "money", "project"];
function route() {
  const h = location.hash.slice(1);
  if (h === "money-fund" || h === "money-rules") return { view: "money", tab: h.slice(6) };
  if (h.startsWith("task-")) { const [id, task] = h.slice(5).split("-"); return { view: "project", id, task } }
  for (const pre of ["project-", "plan-", "build-"]) if (h.startsWith(pre)) return { view: "project", id: h.slice(pre.length) };
  if (h === "projects-done" || h === "current") return { view: "projects" };
  if (h === "mine" || h === "notes") return { view: "me" };
  if (h.startsWith("dm-")) return { view: "chat", dm: h.slice(3) };
  if (h.startsWith("pg-")) return { view: "partners", gid: h.slice(3) };
  return { view: VIEWS.includes(h) && h !== "project" ? h : "me" };
}
function show() {
  if (partnerMode) { renderPortal(); return }
  if (clientMode) { renderClient(); return }
  const r = route(); const tabView = r.view === "project" ? "projects" : r.view === "skills" || r.view === "settings" || r.view === "money" ? "me" : r.view;
  for (const b of document.querySelectorAll("#app .tab")) b.setAttribute("aria-selected", b.dataset.view === tabView);
  for (const k of VIEWS) $("#view-" + k).hidden = r.view !== k;
  if (r.tab) moneyTab = r.tab;
  if (r.task) { projTab = "tasks"; taskFilter[r.id] = null; openTask = "p:" + r.task; showTaskAt = r.task }
  render();
  if (showTaskAt) { const id = showTaskAt; showTaskAt = null; setTimeout(() => { const c = document.getElementById("c-p:" + id); if (c) { const row = c.closest(".task"); scrollTo({ top: row.getBoundingClientRect().top + scrollY - 96, behavior: "smooth" }); row.classList.add("flash") } }, 80) }
}
let showTaskAt = null;
for (const b of document.querySelectorAll("#app .tab")) b.onclick = () => { location.hash = b.dataset.view };
for (const b of document.querySelectorAll("#partner .tab")) b.onclick = () => { location.hash = b.dataset.pview };
addEventListener("hashchange", () => { show(); scrollTo(0, 0) });

/* ---------- auth & data ---------- */

$("#signin").onclick = async () => {
  try { await fbReady; await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (e) { $("#gate-msg").textContent = "Sign-in didn't finish. Try again, and allow pop-ups for this site if your browser blocked one." }
};
async function doSignOut() { await fbReady; clearCache(); try { await pushForget() } catch { } await signOut(auth) }

let isAdmin = false;
let ideas = [], focusId = null, me = null, people = {}, unsubs = [];
let activeMap = {};   // projects being built right now: id -> {by, at}. Only the admin changes this.
const isActive = p => !!p && p.status === "approved" && !p.paused && (!!activeMap[p.id] || p.id === focusId);
const activeProjects = () => ideas.filter(isActive).sort((a, b) => prioRank(a) - prioRank(b) || ((activeMap[a.id] || {}).at || 0) - ((activeMap[b.id] || {}).at || 0));
const suggestions = {};          // projectId -> [{task, owner, why}]
let quiz = null;                 // {i, answers:[], grow:[]} while taking the quiz

let myProfile = null, privErr = false, privUnsubs = [], privRetry = null, live = false;
let authN = 0;
async function onAuth(u) {
  const n = ++authN;
  unsubs.forEach(f => f()); unsubs = [];
  privUnsubs.forEach(f => f()); privUnsubs = [];
  if (partnerMode || !u) partnerStop();
  if (clientMode || !u) clientStop();
  if (!u) { $("#boot").hidden = true; me = null; live = false; remember(false); clearCache(); $("#gate").hidden = false; $("#app").hidden = true; return }
  // Partners (lead finders) get their own small site and never load the team's data.
  const email = (u.email || "").toLowerCase(), knownTeam = me === u.uid;
  if (!knownTeam && !ADMINS.includes(email)) {
    const pm = await partnerCheck(email);
    if (n !== authN) return;
    if (pm) { me = u.uid; clearCache(); startPartner(u, pm); return }
    // Clients: anyone listed on a project's client view gets only their project page
    const cl = await clientCheck(email);
    if (n !== authN) return;
    if (cl.length) { me = u.uid; clearCache(); startClient(u, cl); return }
  }
  $("#boot").hidden = true;
  remember(true);
  if (me && me !== u.uid) { ideas = []; people = {}; chat = []; dmThreads = []; dmMsgs = {}; personal = []; myNotes = []; focusId = null; activeMap = {} }
  me = u.uid;
  isAdmin = ADMINS.includes((u.email || "").toLowerCase());
  myProfile = { name: u.displayName || u.email, email: u.email, photo: u.photoURL || "" };
  $("#gate").hidden = true; $("#app").hidden = false;
  if (!ideas.length) status("Loading\u2026");
  setDoc(doc(db, "users", me), { name: myProfile.name, photo: myProfile.photo, email: (u.email || "").toLowerCase() }, { merge: true }).catch(() => {});
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
    if (before && newest && newest.at > before && newest.by !== me) chime();
    if (before && newest && newest.at > before && newest.by !== me && (route().view !== "chat" || document.hidden)) ping({ key: "chat:" + newest.id, who: newest.by, title: realName(newest.by) || "Team chat", sub: "Team chat", text: msgSummary(newest), go: "chat", at: newest.at });
    render();
  }, () => {}));
  // private messages: the conversations I'm in
  unsubs.push(onSnapshot(query(collection(db, "dms"), where("members", "array-contains", me)), s => {
    const before = Object.fromEntries(dmThreads.map(t => [t.id, t.lastAt || 0]));
    dmThreads = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (dmThreads.some(t => t.lastBy && t.lastBy !== me && before[t.id] !== undefined && (t.lastAt || 0) > before[t.id])) chime();
    for (const t of dmThreads) if (t.lastBy && t.lastBy !== me && before[t.id] !== undefined && (t.lastAt || 0) > before[t.id] && (route().dm !== otherOf(t) || document.hidden))
      ping({ key: "dm:" + t.id + ":" + t.lastAt, who: t.lastBy, title: realName(t.lastBy) || "Private message", sub: "Private", text: t.lastText || "", go: "dm-" + t.lastBy, at: t.lastAt });
    render();
  }, () => { dmOff = true; render() }));
  unsubs.push(onSnapshot(collection(db, "users"), s => { people = {}; s.docs.forEach(d => people[d.id] = d.data()); syncLookFromAccount(); render() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "money"), s => { moneyRules = s.exists() ? s.data() : null; ensureMoneyRules(); render() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "fund"), s => { fundDoc = s.exists() ? s.data() : null; render() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "nicks"), s => { nicks = s.exists() ? Object.fromEntries(Object.entries(s.data()).filter(([, v]) => typeof v === "string" && v)) : {}; render() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "news"), s => { newsDoc = s.exists() ? s.data() : null; render() }, () => {}));
  pushBaseline = null;
  unsubs.push(onSnapshot(doc(db, "meta", "push"), s => { pushConfig(s.exists() ? s.data() : null); render() }, () => {}));
  teamLoaded = false; teamDoc = null;
  unsubs.push(...partnerTeamSubs(), ...clientTeamSubs());
  if (isAdmin) unsubs.push(onSnapshot(doc(db, "meta", "team"), s => { teamDoc = s.exists() ? s.data() : null; teamLoaded = true; ensureTeamDoc(); render() }, () => { teamLoaded = true; render() }));
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
  try { await fbReady; await fn(); if (ok) toast(ok); return true }
  catch (e) { const m = e && e.code === "permission-denied" ? "That wasn't allowed by the site's security rules." : "That didn't save. Check your connection and try again."; status(m, true); toast(m + (e && e.code ? " (" + e.code + ")" : ""), 6000); return false }
}
const upd = (id, data) => updateDoc(doc(db, "ideas", id), data);

/* ---------- derived data ---------- */

let nicks = {};
const googleName = id => (people[id] || {}).name || "";
const realName = id => { const p = people[id] || {}; return nicks[id] || p.nick || p.name || "" };
const name = id => id === me ? "You" : (realName(id) || "A friend");
const firstName = id => id === me ? "you" : ((realName(id) || "a friend").split(" ")[0]);
const photoOf = id => { const p = people[id] || {}; return p.pic || p.photo || AV };
const av = id => el("img", { class: "av", src: photoOf(id), alt: name(id), title: name(id), referrerpolicy: "no-referrer" });
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
// The team is only team members: anyone who is a partner or a client never counts, even if they have a profile
// (for example from signing in once before they were added as a partner).
const outsiderEmails = () => new Set([...pMembers.map(m => (m.id || m.email || "").toLowerCase()), ...cProjects.flatMap(c => [...(c.clients || []), ...(c.partners || [])].map(e => String(e).toLowerCase()))]);
const isTeamUid = u => { if (u === me && !partnerMode && !clientMode) return true; const e = ((people[u] || {}).email || "").toLowerCase(); return !pMembers.some(m => m.uid === u) && !(e && outsiderEmails().has(e)) };
const teamIds = () => Object.keys(people).filter(isTeamUid).sort((a, b) => a === me ? -1 : b === me ? 1 : name(a).localeCompare(name(b)));
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

function render() { if (!me) return; if (partnerMode) { renderPortal(); return } if (clientMode) { renderClient(); return } keepInputs(renderAll) }

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
  if (r.view === "settings") renderSettings();
  if (r.view === "money") renderMoneyPage();
  if (r.view === "me") renderMe();
  if (r.view === "partners") renderPartnersTeam(r.gid);
  { const pu = pGroups.reduce((a, g) => a + partnerUnread(g.id), 0); const pc = $("#c-partners"); pc.hidden = !pu; pc.textContent = pu > 9 ? "9+" : pu }
  const open = myTasks().filter(x => !x.t.done && !x.closed && (x.personal || !isBlocked(x.p, x.t))).length; const mc = $("#c-mine"); mc.hidden = !open; mc.textContent = open;
  renderAlerts();
  pushTick();
  renderAssistant();
  const meAv = $("#me-av"); const src = (people[me] || {}).pic || (myProfile && myProfile.photo) || (people[me] || {}).photo || AV; if (meAv.getAttribute("src") !== src) meAv.src = src;
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
      done ? el("span", { class: "done-badge" }, "\u2713 Completed " + fmtDay(p.completedAt)) : el("span", { class: "pill" + (isPaused(p) ? " pill-paused" : "") }, isPaused(p) ? "\u23f8 Paused" : isActive(p) ? "Building now" : "Up next"),
      prioChip(p), catsOf(p).length ? catChip(p) : null),
    el("div", { class: "row", style: "align-items:flex-start;flex-wrap:nowrap" }, el("h2", { style: "flex:1;min-width:0" }, p.title),
      planner || joined ? el("button", { class: "btn small", "aria-expanded": String(settingsOpen), onclick: () => { showSettings = settingsOpen ? null : p.id; render() } }, settingsOpen ? "Close" : "Settings") : null),
    isPaused(p) ? el("div", { class: "paused-line" }, el("span", {}, `\u23f8 Paused by ${p.paused.by === me ? "you" : name(p.paused.by)} ${ago(p.paused.at)}. Its tasks are on hold.`), el("span", { class: "spacer" }), planner ? el("button", { class: "btn primary small", onclick: () => resumeProject(p) }, "Resume") : null) : null,
    clientOf(p) ? clientLine(clientOf(p)) : null,
    p.pitch ? el("p", { class: "pitch" }, p.pitch) : null,
    !done && goal && goal.text ? el("div", { class: "goal-line" + (goal.reached ? " reached" : "") }, el("span", { class: "tlabel" }, goal.reached ? "This week's goal \u2713 reached" : "This week's goal"), el("span", {}, goal.text)) : null,
    tasks.length ? line(progressOf(tasks), "tasks") : null,
    mineLeft ? el("div", { class: "now-sub" }, `${mineLeft} of these are yours`) : null,
    linksBlock(p));
  const actions = el("div", { class: "row", style: "gap:8px" });
  if (!done && !isActive(p) && !isPaused(p)) actions.append(voteButton(p));
  if (!done && !joined) actions.append(el("button", { class: "btn", onclick: () => write(() => upd(p.id, { ["members." + me]: true }), "You joined the team") }, "Join the team"));
  actions.append(el("span", { class: "spacer" }));
  const pick = isPaused(p) ? null : pickButton(p); if (pick) actions.append(pick);
  if (actions.childNodes.length > 1) head.append(actions);
  box.append(head);

  if (settingsOpen) box.append(projectSettings(p, { planner, joined, done }));

  const meetings = Object.values(p.meetings || {}).filter(Boolean).length;
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Show", style: "margin:4px 0 14px" },
    el("button", { "aria-pressed": String(projTab === "tasks"), onclick: () => { projTab = "tasks"; render() } }, "Tasks"),
    el("button", { "aria-pressed": String(projTab === "week"), onclick: () => { projTab = "week"; render() } }, "Week"),
    el("button", { "aria-pressed": String(projTab === "meet"), onclick: () => { projTab = "meet"; render() } }, "Meetings" + (meetings ? " " + meetings : "")),
    el("button", { "aria-pressed": String(projTab === "money"), onclick: () => { projTab = "money"; render() } }, "Money"),
    el("button", { "aria-pressed": String(projTab === "share"), onclick: () => { projTab = "share"; render() } }, "Client" + countNew(p.id))));
  if (projTab === "share") return renderShare(box, p);
  if (projTab === "week") return renderWeek(box, p, team);
  if (projTab === "meet") return renderMeetings(box, p);
  if (projTab === "money") return renderMoney(box, p);

  // people chips: tap someone to see only their tasks
  const f = taskFilter[p.id] || null;
  if (team.length && tasks.length) {
    const chip = (u, label, count) => el("button", { class: "pchip", "aria-pressed": String(f === u), onclick: () => { taskFilter[p.id] = u; render() } }, u ? av(u) : null, label, count != null ? el("span", { class: "pcount" }, count) : null);
    box.append(el("div", { class: "pchips" }, chip(null, "Everyone"),
      ...team.map(u => { const list = tasks.filter(t => isAssignee(t, u)); return chip(u, u === me ? "You" : name(u).split(" ")[0], `${list.filter(t => t.done).length}/${list.length}`) })));
  }
  box.append(planBody(p, { filter: f }));
}

// Project settings, in the order people need them: details, people, status, and deleting last.
function projectSettings(p, { planner, joined, done }) {
  const set = el("section", { class: "idea settings projset" }, el("div", { class: "row" }, el("h3", {}, "Project settings")));
  const group = (title, sub, ...kids) => el("div", { class: "psgroup" }, el("div", { class: "set-h" }, el("h4", {}, title), sub ? el("p", {}, sub) : null), ...kids);
  if (planner) set.append(group("Details", null, renameBlock(p), catSelect(p), prioControl(p)));

  // people: planners shape the plan; the team is who works on it
  const members = Object.entries(p.members || {}).filter(([, v]) => v).map(([u]) => u);
  const boss = isAdmin || p.author === me;
  const others = teamIds().filter(u => !members.includes(u));
  set.append(group("People", "Planners can change the plan, tasks and money. The team is everyone working on it.",
    plannersRow(p),
    el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Team:",
      members.length ? members.map(u => el("span", { class: "planner" }, av(u), name(u),
        planner && u !== me ? el("button", { class: "x", "aria-label": "Take " + name(u) + " off the team", onclick: () => write(() => upd(p.id, { ["members." + u]: DEL() }), `${name(u)} is off this project's team`) }, "✕") : null)) : el("span", {}, "nobody joined yet"),
      planner && others.length ? el("select", { class: "mini", "aria-label": "Add someone to the team", onchange: e => { const u = e.target.value; if (u) write(() => upd(p.id, { ["members." + u]: true }), `${name(u)} is on the team`) } },
        el("option", { value: "" }, "+ Add someone"), others.map(u => el("option", { value: u }, name(u)))) : null),
    el("div", { class: "row" }, el("span", { class: "spacer" }), joined
      ? el("button", { class: "btn quiet small", onclick: () => write(() => upd(p.id, { ["members." + me]: DEL() }), "You left the team") }, "Leave the team")
      : el("button", { class: "btn small", onclick: () => write(() => upd(p.id, { ["members." + me]: true }), "You joined the team") }, "Join the team"))));

  if (planner) set.append(group("Status", done ? "This project is completed." : isPaused(p) ? "Paused: its tasks are on hold and it doesn't count as being built." : "Pause it to put everything on hold, or mark it completed when it's finished.",
    el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }),
      done ? null : isPaused(p) ? el("button", { class: "btn", onclick: () => resumeProject(p) }, "Resume project") : el("button", { class: "btn", onclick: () => pauseProject(p) }, "Pause project"),
      done ? el("button", { class: "btn", onclick: () => reopenProject(p) }, "Reopen") : completeButton(p)),
    !done && confirmDone === p.id ? completeWarning(p) : null));
  if (isAdmin || p.author === me) set.append(group("Delete", null, deleteBlock(p)));
  return set;
}
// Before marking a project completed: say what's still open, so nothing is closed by mistake.
function completeWarning(p) {
  const open = tasksOf(p).filter(t => !t.done).length, out = [];
  if (open) out.push(`${open} task${open > 1 ? "s are" : " is"} still open.`);
  if (p.money) { const r = moneyOf(p); if (r.expected > r.received && !r.proposal) out.push(`The client still owes ${fmtEGP(r.expected - r.received)}.`); const owed = Object.values(r.people).reduce((s, v) => s + Math.max(0, v.balance), 0); if (owed) out.push(`${fmtEGP(owed)} still has to be handed to the team.`) }
  return out.length ? el("div", { class: "notice", style: "margin:0" }, out.join(" ") + " You can still complete it, and reopen it later.") : null;
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
  const client = el("input", { id: "rn-client-" + p.id, class: "noteinput", maxlength: "80", "aria-label": "Client", placeholder: "Client, brand or company (optional)" });
  title.value = p.title || ""; pitch.value = p.pitch || ""; client.value = p.client || "";
  const save = () => {
    const t = title.value.trim(), d = pitch.value.trim(), c = client.value.trim().replace(/\s+/g, " ");
    if (!t) { toast("The project needs a name"); title.focus(); return }
    if (t === p.title && d === (p.pitch || "") && c === (p.client || "")) { toast("Nothing changed"); return }
    write(() => upd(p.id, { title: t, pitch: d, client: c || DEL() }), "Saved");
  };
  title.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } });
  return el("div", { class: "renameblock" },
    el("label", { class: "tlabel", for: title.id }, "Name"), title,
    el("label", { class: "tlabel", for: pitch.id }, "Description"), pitch,
    el("label", { class: "tlabel", for: client.id }, "Client"), client,
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: save }, "Save")));
}

/* ----- import a plan (pasted from Claude or written by the assistant) ----- */

const PLAN_FORMAT = `PHASE: Research
- Visit 3 shops and note their prices | Omar | due 2026-11-20
- Ask 10 people what they'd pay | Sheta | due 2026-11-20
PHASE: Setup
- Buy the starter kit | Mohammed | due 2026-11-25 | high | skill: Organizer
- Make the Instagram page | Omar | skill: Creator | steps: pick a name; design the logo; first 3 posts`;
const importState = {};   // project id -> { open, text, preview }

function ymdOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00").getTime()) }
function toYmd(raw) {
  const v = raw.trim(); if (ymdOk(v)) return v;
  const t = Date.parse(v + (/\d{4}/.test(v) ? "" : " " + new Date().getFullYear()));
  return isNaN(t) ? null : ymd(new Date(t));
}
function matchPerson(raw) {
  const q = raw.trim().toLowerCase().replace(/^@/, ""); if (!q || q === "-" || q === "nobody" || q === "anyone" || q === "unassigned") return { id: null };
  if (q === "me" || q === "i" || q === "myself") return { id: me };
  const ids = teamIds();
  const full = id => realName(id).toLowerCase(), first = id => full(id).split(" ")[0], mail = id => ((people[id] || {}).email || "").toLowerCase();
  const hit = ids.find(id => full(id) === q) || ids.find(id => first(id) === q) || ids.find(id => mail(id) === q || mail(id).split("@")[0] === q)
    || ids.find(id => full(id).includes(q) || (q.length >= 3 && q.includes(first(id))));
  return hit ? { id: hit } : { id: null, unknown: raw.trim() };
}
function matchSkill(raw) {
  const q = raw.trim().toLowerCase();
  return SKILL_IDS.find(s => s === q || SKILLS[s].name.toLowerCase() === q || q.startsWith(SKILLS[s].name.toLowerCase().slice(0, 5))) || null;
}
function parsePlan(text, p) {
  const phases = [], warnings = [], existing = getPhases(p);
  let cur = null, last = null;
  // If the plan uses "PHASE:" lines, other lines ending in ":" (like "Here is a plan:") are just talk, not phases.
  const strict = /^\s*(?:#{1,6}\s*)?(?:phase|stage)\b/im.test(text);
  const phaseNamed = nm => {
    const ex = existing.find(x => x.name.toLowerCase() === nm.toLowerCase());
    let ph = phases.find(x => x.name.toLowerCase() === nm.toLowerCase());
    if (!ph) { ph = { name: nm.slice(0, 40), existingId: ex ? ex.id : null, tasks: [] }; phases.push(ph) }
    return ph;
  };
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.replace(/\*\*/g, "").trimEnd(); const t = line.trim();
    if (!t || t.startsWith("```")) continue;
    let m;
    if ((m = t.match(/^(?:#{1,6}\s*)?(?:phase|stage|step)\s*\d*\s*[:.\-–—]\s*(.+)$/i)) || (m = t.match(/^#{1,6}\s+(.+)$/)) || (!strict && !/^[-*•]|^\d+[.)]/.test(t) && (m = t.match(/^(.{2,40}):$/)))) {
      cur = phaseNamed(m[1].trim().replace(/:$/, "")); last = null; continue;
    }
    if ((m = t.match(/^(?:[-*•]|\d+[.)]|\[ ?\])\s+(.+)$/))) {
      // an indented bullet under a task becomes a checklist step
      if (last && /^\s{2,}/.test(line) && !m[1].includes("|")) { last.steps.push(m[1].trim().slice(0, 120)); continue }
      const parts = m[1].split("|").map(x => x.trim()).filter(Boolean);
      const task = { text: parts[0].replace(/^\[ ?\]\s*/, "").slice(0, 140), owner: null, due: null, priority: "medium", skill: null, steps: [] };
      for (const part of parts.slice(1)) {
        const low = part.toLowerCase(); let mm;
        if ((mm = part.match(/^due[:\s]+(.+)$/i)) || ymdOk(part)) { const d = toYmd(mm ? mm[1] : part); if (d) task.due = d; else warnings.push(`"${task.text}": couldn't read the date "${part}"`) }
        else if ((mm = low.match(/^(?:priority[:\s]+)?(urgent|high|medium|low)(?:\s+priority)?$/))) task.priority = mm[1];
        else if ((mm = part.match(/^skill[:\s]+(.+)$/i))) { task.skill = matchSkill(mm[1]); if (!task.skill) warnings.push(`"${task.text}": unknown skill "${mm[1]}"`) }
        else if ((mm = part.match(/^(?:steps?|checklist)[:\s]+(.+)$/i))) task.steps.push(...mm[1].split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => x.slice(0, 120)));
        else { const who = matchPerson(part.replace(/^(?:who|owner|person|by)[:\s]+/i, "")); if (who.id) task.owner = who.id; else if (who.unknown) warnings.push(`"${task.text}": no one called "${who.unknown}" on the team, so it'll be unassigned`) }
      }
      if (!cur) cur = phaseNamed(existing[0] ? existing[0].name : "Plan");
      cur.tasks.push(task); last = task; continue;
    }
  }
  return { phases: phases.filter(ph => ph.tasks.length || !ph.existingId), warnings };
}
function applyPlan(p, plan) {
  const nPh = plan.phases.filter(x => !x.existingId).length, nT = plan.phases.reduce((n, x) => n + x.tasks.length, 0);
  write(async () => {
    const data = {}, now = Date.now();
    let order = Math.max(0, ...getPhases(p).map(x => x.order || 0));
    let i = 0;
    for (const ph of plan.phases) {
      const pid = ph.existingId || uid() + (i++);
      if (!ph.existingId) data["phases." + pid] = { name: ph.name, order: ++order, due: null };
      for (const t of ph.tasks) {
        const check = {}; t.steps.forEach((s, k) => check[uid() + k] = { text: s, done: false, order: now + k });
        data["tasks." + uid() + (i++)] = { text: t.text, phase: pid, owner: t.owner, assignedBy: t.owner ? me : null, assignedAt: t.owner ? now : null,
          due: t.due, priority: t.priority, skill: t.skill, done: false, order: now + i, check };
      }
    }
    await phaseWrite(p, data);
  }, `Added ${nPh ? nPh + " phase" + (nPh > 1 ? "s" : "") + " and " : ""}${nT} task${nT === 1 ? "" : "s"} to the plan`);
  importState[p.id] = { open: false, text: "", preview: null };
}
function importPanel(p) {
  const st = importState[p.id] || (importState[p.id] = { open: true, text: "", preview: null });
  const ta = el("textarea", { id: "imp-" + p.id, class: "noteinput", rows: "9", placeholder: "Paste the plan here…", spellcheck: "false" });
  if (!ta.value) ta.value = st.text || "";
  ta.addEventListener("input", () => { st.text = ta.value; if (st.preview) { st.preview = null; render() } });
  const box = el("section", { class: "idea importbox" },
    el("div", { class: "row" }, el("h3", {}, "Import a plan"), el("span", { class: "spacer" }), el("button", { class: "x", "aria-label": "Close", onclick: () => { st.open = false; render() } }, "✕")),
    el("p", { style: "margin:0;font-size:14px" }, "Paste a plan from Claude or the assistant. Each phase starts with PHASE:, each task starts with a dash. Who, due date, priority, skill and steps are optional, separated by |."),
    el("details", {}, el("summary", { class: "linkbtn" }, "Show an example"),
      el("pre", { class: "fmt" }, PLAN_FORMAT),
      el("button", { class: "btn small", onclick: async e => { try { await navigator.clipboard.writeText(PLAN_FORMAT); toast("Example copied") } catch { toast("Select the example and copy it") } } }, "Copy example")),
    ta);
  if (!st.preview) {
    box.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: () => {
      st.text = ta.value; const plan = parsePlan(st.text, p);
      if (!plan.phases.some(x => x.tasks.length) && !plan.phases.length) { toast("I couldn't find any phases or tasks. Check the example format."); return }
      st.preview = plan; render();
    } }, "Preview")));
    return box;
  }
  const plan = st.preview, nT = plan.phases.reduce((n, x) => n + x.tasks.length, 0);
  const pv = el("div", { class: "preview" }, el("div", { class: "tlabel" }, `This will add ${plan.phases.filter(x => !x.existingId).length} new phase(s) and ${nT} task(s):`));
  for (const ph of plan.phases) {
    pv.append(el("div", { class: "pv-phase" }, ph.name, ph.existingId ? el("span", { class: "label" }, " (already in the plan, tasks are added to it)") : el("span", { class: "chip", style: "margin-left:6px" }, "new")));
    for (const t of ph.tasks) pv.append(el("div", { class: "pv-task" },
      el("span", {}, t.text),
      el("span", { class: "pv-meta" }, t.owner ? name(t.owner) : "Unassigned", t.due ? " · due " + fmtDate(t.due) : "", t.priority !== "medium" ? " · " + t.priority : "", t.skill ? " · " + SKILLS[t.skill].name : "", t.steps.length ? ` · ${t.steps.length} steps` : "")));
  }
  if (plan.warnings.length) pv.append(el("div", { class: "notice", style: "margin-top:6px" }, plan.warnings.slice(0, 6).map(w => el("div", {}, w))));
  box.append(pv, el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }),
    el("button", { class: "btn quiet", onclick: () => { st.preview = null; render() } }, "Edit text"),
    el("button", { class: "btn primary", disabled: !nT && !plan.phases.length, onclick: () => applyPlan(p, plan) }, "Add to plan")));
  return box;
}
function openImport(p, text) {
  importState[p.id] = { open: true, text: text || (importState[p.id] || {}).text || "", preview: null };
  if (text) importState[p.id].preview = parsePlan(text, p);
  projTab = "tasks"; taskFilter[p.id] = null;
  if (location.hash !== "#project-" + p.id) location.hash = "project-" + p.id; else render();
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
    if (checkinDraft && checkinDraft.pid === p.id && !did.value) { did.value = checkinDraft.did; next.value = checkinDraft.next; blk.value = checkinDraft.blockers }
    else if (mine && !did.value) { did.value = mine.did || ""; next.value = mine.next || ""; blk.value = mine.blockers || "" }
    box.append(el("section", { class: "idea checkin-form" },
      el("p", { style: "margin:0" }, "Takes a minute. Helps everyone know where things are."),
      el("label", { class: "tlabel", for: did.id }, "What did I do this week?"), did,
      el("label", { class: "tlabel", for: next.id }, "What will I do next?"), next,
      el("label", { class: "tlabel", for: blk.id }, "Anything blocking me? (leave empty if not)"), blk,
      el("div", { class: "row" }, el("span", { class: "spacer" }),
        mine ? el("button", { class: "btn quiet", onclick: () => { editCheckin = null; render() } }, "Cancel") : null,
        el("button", { class: "btn primary", onclick: () => {
          if (!did.value.trim() && !next.value.trim()) return toast("Write at least what you did or what's next");
          editCheckin = null; checkinDraft = null;
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
// A project can have several categories. Older projects have one in "category"; newer ones keep the list in "categories".
const catsOf = i => (i && Array.isArray(i.categories) && i.categories.length ? i.categories : i && i.category ? [i.category] : []);
const inCat = (i, c) => { const cs = catsOf(i); return c === "Other" ? !cs.length || cs.includes("Other") : cs.includes(c) };
const setCats = (p, list) => { const cs = [...new Set(list.filter(Boolean))]; return upd(p.id, { categories: cs, category: cs[0] || "" }) };
const allCats = () => {
  const base = CATEGORIES.filter(c => c !== "Other");
  const custom = [...new Set(ideas.flatMap(catsOf).filter(c => c && !CATEGORIES.includes(c)))].sort((a, b) => a.localeCompare(b));
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
  const used = allCats().filter(c => list.some(i => inCat(i, c)));
  if ((used.length < 2 || list.length < 6) && !catFilter[where]) { box.replaceChildren(); return list }
  const pick = c => { catFilter[where] = catFilter[where] === c ? "" : c; render() };
  box.append(el("button", { class: "cat", "aria-pressed": String(!catFilter[where]), onclick: () => pick("") }, `All ${list.length}`),
    ...used.map(c => el("button", { class: "cat", "aria-pressed": String(catFilter[where] === c), onclick: () => pick(c) }, `${c} ${list.filter(i => inCat(i, c)).length}`)));
  return catFilter[where] ? list.filter(i => inCat(i, catFilter[where])) : list;
}
function cleanCat(raw) {
  const t = (raw || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!t) return "";
  return allCats().find(c => c.toLowerCase() === t.toLowerCase()) || t.charAt(0).toUpperCase() + t.slice(1);
}
const catChip = i => { const cs = catsOf(i); return cs.length > 1 ? el("span", { class: "catchips" }, cs.map(c => el("span", { class: "catchip" }, c))) : el("span", { class: "catchip" }, cs[0] || "No category") };
const clientOf = p => (p && (p.client || (p.money || {}).client)) || "";
const clientLine = c => el("div", { class: "clientline" }, el("span", { class: "tlabel" }, "Client"), el("span", {}, c));

// "Help me think": improve what you've typed, or brainstorm with you if the form is empty
$("#f-help").addEventListener("click", () => {
  const t = $("#f-title").value.trim(), d = $("#f-pitch").value.trim(), c = $("#f-client").value.trim();
  asstOpen = true; alertsOpen = false; asstTplOpen = false;
  if (!t && !d) { if (c) { runAssistant(`Ideas for ${c}`, { prompt: `Brainstorm 5 ideas we could pitch to this client (things they'd actually pay for): ${c}\nThink about their customers, what they lose money or time on, and what their competitors don't do yet. ${CREATIVE}\n${IDEA_FORMAT}` }); return }
    runAssistant("Brainstorm new ideas", { prompt: `Brainstorm 5 fresh project ideas our team could build and sell in Egypt. ${CREATIVE}\n${IDEA_FORMAT}` }); return }
  askAboutIdea({ title: t || "my idea", pitch: d, client: c });
});
$("#compose").addEventListener("submit", ev => {
  ev.preventDefault();
  const title = $("#f-title").value.trim(), pitch = $("#f-pitch").value.trim();
  let category = $("#f-cat").value;
  if (category === NEW) category = cleanCat($("#f-newcat").value);
  if (!title || !category) return;
  const client = $("#f-client").value.trim().replace(/\s+/g, " ");
  write(() => setDoc(doc(db, "ideas", uid()), { title, pitch, category, ...(client ? { client } : {}), author: me, createdAt: Date.now(), status: "voting", votes: { [me]: "keep" }, tasks: {}, backers: {} }), "Idea added to the vote");
  $("#f-title").value = ""; $("#f-pitch").value = ""; $("#f-client").value = ""; $("#f-cat").value = ""; $("#f-newcat").value = ""; $("#f-newcat").hidden = true; $("#f-newcat").required = false;
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
      i.client ? clientLine(i.client) : null,
      i.pitch ? el("p", {}, i.pitch) : null,
      el("div", { class: "row", style: "gap:8px" }, el("div", { class: "by", style: "flex:1 1 auto" }, av(i.author), "Pitched by ", name(i.author)),
        el("button", { class: "btn quiet small", onclick: () => askAboutIdea(i) }, "✦ Make it stronger")),
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
  const next = projects.filter(p => !isActive(p) && !isPaused(p)), paused = projects.filter(isPaused);
  if (building.length) {
    box.append(el("h2", { class: "sec-h" }, "Building now"));
    box.append(el("div", { class: "list", style: "margin-top:0" }, building.map(p => projCard(p))));
  }
  if (next.length) {
    box.append(el("div", { class: "sec-h row" }, el("h2", {}, "Up next"), el("span", { class: "spacer" }), el("span", { class: "label" }, isAdmin ? "Vote, then start the ones you pick" : `Vote for what we build next`)));
    box.append(el("div", { class: "list", style: "margin-top:0" }, next.map(p => projCard(p, rank[p.id]))));
  }
  if (paused.length) {
    box.append(el("div", { class: "sec-h row" }, el("h2", {}, "Paused"), el("span", { class: "spacer" }), el("span", { class: "label" }, "On hold. Open one to resume it")));
    box.append(el("div", { class: "list", style: "margin-top:0" }, paused.map(p => projCard(p))));
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
  const a = el("a", { class: "linkchip", href: l.url, target: "_blank", rel: "noopener noreferrer", title: l.url, onclick: previewClick(l.url, l.label || hostOf(l.url)) },
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
  const open = () => viewable(f) ? openViewer(f) : downloadFile(f);
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
    isPaused(p) ? el("div", { class: "row" }, el("span", { class: "pill pill-paused" }, "\u23f8 Paused"), el("span", { class: "spacer" }), el("span", { class: "label" }, "since " + fmtDay(p.paused.at)))
    : isActive(p)
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
const isPaused = p => !!(p && p.paused && p.status === "approved");
function pauseProject(p) {
  write(async () => {
    await upd(p.id, { paused: { by: me, at: Date.now() } });
    if (activeMap[p.id] || focusId === p.id) { const data = { ["active." + p.id]: DEL() }; if (focusId === p.id) data.projectId = null; await updateDoc(doc(db, "meta", "focus"), data).catch(() => {}) }
  }, "Project paused. Its tasks are on hold");
}
function resumeProject(p) { write(() => upd(p.id, { paused: DEL() }), "Project resumed. It's back in Up next") }
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
// Categories: a project can have as many as you like. Tap ✕ on one to remove it, pick from the list to add one.
function catSelect(p) {
  const wrapStyle = "gap:8px;font-size:13px;color:var(--muted);flex-wrap:wrap";
  const cs = catsOf(p);
  const chips = cs.map(c => el("span", { class: "catchip catchip-x" }, c,
    el("button", { type: "button", "aria-label": "Remove category " + c, onclick: () => write(() => setCats(p, cs.filter(x => x !== c)), "Removed " + c) }, "\u2715")));
  if (newCatFor === p.id) {
    const inp = el("input", { id: "newcat-" + p.id, class: "mini", maxlength: "30", placeholder: "New category name", style: "padding:6px 8px;font-size:13px" });
    const save = () => { const c = cleanCat(inp.value); if (!c) return; newCatFor = null; write(() => setCats(p, [...cs, c]), "Added " + c) };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } if (e.key === "Escape") { newCatFor = null; render() } });
    setTimeout(() => inp.focus(), 0);
    return el("div", { class: "row", style: wrapStyle }, "Categories", ...chips, inp, el("button", { class: "btn", onclick: save }, "Add"), el("button", { class: "btn quiet", onclick: () => { newCatFor = null; render() } }, "Cancel"));
  }
  const left = allCats().filter(c => !cs.includes(c));
  const sel = el("select", { class: "mini", "aria-label": "Add a category", onchange: e => {
    const v = e.target.value; if (!v) return;
    if (v === NEW) { newCatFor = p.id; render(); return }
    write(() => setCats(p, [...cs, v]), "Added " + v);
  } }, el("option", { value: "" }, cs.length ? "+ Add another\u2026" : "Pick a category\u2026"), ...left.map(c => el("option", { value: c }, c)), el("option", { value: NEW }, "+ New category\u2026"));
  return el("div", { class: "row", style: wrapStyle }, "Categories", ...chips, sel);
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
      addPhaseRow(p, phases, "Or type your first phase, e.g. Brainstorm"),
      el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Planned it with Claude or the assistant?"), el("button", { class: "btn small", onclick: () => openImport(p) }, "Import a plan")));
    if ((importState[p.id] || {}).open) wrap.append(importPanel(p));
    wrap.append(card);
    return wrap;
  }

  const unassigned = tasks.filter(t => !t.owner && !t.done).length;
  const editing = planner && planEdit === p.id;
  if (planner && !opts.filter) wrap.append(el("div", { class: "row", style: "gap:8px" },
    unassigned ? el("span", { style: "color:var(--muted);font-size:14px" }, `${unassigned} not assigned`) : null,
    el("span", { class: "spacer" }),
    unassigned ? el("button", { class: "btn small", onclick: () => runSuggest(p) }, "Suggest who does what") : null,
    el("button", { class: "btn small", onclick: () => openImport(p) }, "Import plan"),
    el("button", { class: "btn small" + (editing ? " primary" : ""), onclick: () => { planEdit = editing ? null : p.id; render() } }, editing ? "Done editing" : "Edit phases")));
  if (planner && (importState[p.id] || {}).open) wrap.append(importPanel(p));
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
  // Most important first: urgent, high, medium, low. Done tasks go to the bottom.
  // Most important first: urgent, high, medium, low. Tasks still waiting for others come after the ones you can start. Done tasks go to the bottom.
  for (const t of [...list].sort((a, b) => (a.done - b.done) || (isBlocked(p, a) - isBlocked(p, b)) || taskPrioRank(a) - taskPrioRank(b))) sec.append(taskItem(p, t, "p", { people: "always" }));
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

let openTask = null, delTask = null, doneAnyway = null, waitPick = null;   // "<where>:<taskId>"
const isAssignee = (t, u) => t.owner === u || !!(t.helpers || {})[u];
const assignees = t => [...new Set([t.owner, ...Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u)].filter(Boolean))];
const checkList = t => Object.entries(t.check || {}).filter(([, c]) => c && c.text).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.order || 0) - (b.order || 0));
const TASK_PRIOS = ["urgent", "high", "medium", "low"];
const taskPrioRank = t => TASK_PRIOS.indexOf(t.priority || "medium");
const taskLink = (p, t) => "task-" + p.id + "-" + t.id;   // opens the project with this task open
const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function dueText(due, done) {
  const today = todayStr(), late = !done && due < today;
  return late ? "Overdue · " + fmtDate(due) : due === today ? "Due today" : due === plusDays(1) ? "Due tomorrow" : "Due " + fmtDate(due);
}
function dueChip(t) {
  if (!t.due) return null;
  const today = todayStr(), late = !t.done && t.due < today, soon = !t.done && (t.due === today || t.due === plusDays(1));
  return el("span", { class: "due" + (late ? " late" : soon ? " soon" : "") }, dueText(t.due, t.done));
}

/* Waiting for: a task can depend on other tasks. It shows as waiting until they're done. */
const waitIds = t => Object.entries(t.waitFor || {}).filter(([, v]) => v).map(([id]) => id);
function waitInfo(p, t) {
  const all = tasksOf(p), deps = waitIds(t).map(id => all.find(x => x.id === id)).filter(Boolean);
  return { deps, open: deps.filter(d => !d.done) };
}
const isBlocked = (p, t) => !t.done && waitInfo(p, t).open.length > 0;
const waitingOn = (p, t) => tasksOf(p).filter(x => x.id !== t.id && waitIds(x).includes(t.id));   // tasks that need this one
// Every task that waits for this one, directly or through other tasks. Picking one of them would make a loop.
function waitersOf(p, id) {
  const all = tasksOf(p), out = new Set(), stack = [id];
  while (stack.length) { const cur = stack.pop(); for (const x of all) if (!out.has(x.id) && waitIds(x).includes(cur)) { out.add(x.id); stack.push(x.id) } }
  return out;
}
const ownerName = d => { const ps = assignees(d); return ps.length ? ps.map(u => u === me ? "you" : name(u).split(" ")[0]).join(", ") : "nobody yet" };

// Links in notes become tappable. PDFs and Google Drive, Docs, Sheets and Slides open in the viewer.
function linkify(text) {
  const out = []; let last = 0;
  String(text).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (m, i) => {
    out.push(text.slice(last, i));
    const label = m.replace(/^https?:\/\/(www\.)?/, ""), short = label.length > 42 ? label.slice(0, 40) + "…" : label;
    out.push(el("a", { href: m, target: "_blank", rel: "noopener noreferrer", class: "notelink", onclick: previewClick(m, hostOf(m)) }, short));
    last = i + m.length; return m;
  });
  out.push(text.slice(last)); return out;
}

function taskItem(p, t, where, opts = {}) {
  const key = where + ":" + t.id, open = openTask === key;
  const can = canPlan(p) || isAssignee(t, me);
  const cl = checkList(t), cld = cl.filter(c => c.done).length;
  const ncount = Object.values(t.notes || {}).filter(n => n && n.text).length;
  const people = assignees(t), w = t.done ? null : waitInfo(p, t), blocked = !!(w && w.open.length);
  const showPeople = opts.people === "always" || (opts.people !== "never" && (opts.people !== "multi" || people.length > 1));
  const toggle = () => { openTask = open ? null : key; delTask = null; waitPick = null; render() };
  const stepsDone = !t.done && cl.length && cld === cl.length;
  const needed = t.done ? [] : waitingOn(p, t).filter(x => !x.done);
  return el("div", { class: "task" + (t.done ? " done" : " tp-" + (t.priority || "medium")) + (blocked ? " blocked" : "") + (isAssignee(t, me) ? " mytask" : "") + (open ? " open" : "") },
    el("input", { type: "checkbox", id: "c-" + key, checked: t.done, disabled: !can, "aria-label": "Done: " + t.text, title: can ? "" : "Only the people on this task or a planner can tick it", onchange: e => toggleDone(p, t, e.target.checked, key) }),
    el("button", { class: "ttext", "aria-expanded": String(open), onclick: toggle }, t.text),
    el("button", { class: "chev", "aria-label": open ? "Close details" : "Open details", onclick: toggle }, open ? "–" : "…"),
    el("div", { class: "meta" },
      opts.project ? el("button", { class: "linkbtn", onclick: () => { location.hash = taskLink(p, t) } }, p.title) : null,
      opts.phase ? el("span", { class: "label" }, opts.phase) : null,
      showPeople ? (people.length ? el("span", { class: "stack", title: people.map(name).join(", ") }, people.slice(0, 4).map(av)) : el("span", { class: "label" }, "Not assigned")) : null,
      !t.done && t.status === "doing" ? el("span", { class: "doing" }, "In progress" + (t.startedBy && t.startedBy !== me ? " \u00b7 " + name(t.startedBy).split(" ")[0] : "")) : null,
      w && w.deps.length ? (blocked ? el("span", { class: "waitchip", title: w.open.map(d => `${d.text} (${ownerName(d)})`).join("\n") }, "⏳ " + (w.open.length > 1 ? `Waiting for ${w.open.length} tasks` : ownerName(w.open[0]) === "you" ? `Waiting for your “${w.open[0].text}”` : `Waiting for ${ownerName(w.open[0])}: ${w.open[0].text}`))
        : el("span", { class: "readychip" }, "✓ Ready to start")) : null,
      needed.length ? el("span", { class: "needchip", title: needed.map(x => `${x.text} (${ownerName(x)})`).join("\n") }, needed.length > 1 ? `${needed.length} tasks need this` : ownerName(needed[0]) === "nobody yet" ? "Another task needs this" : `${cap(ownerName(needed[0]))} ${ownerName(needed[0]) === "you" ? "need" : "needs"} this next`) : null,
      t.priority && t.priority !== "medium" ? el("span", { class: "prio prio-" + t.priority }, PRIORITIES.find(x => x.id === t.priority).name) : null,
      dueChip(t),
      cl.length ? el("span", { class: "label" + (stepsDone ? " ok" : "") }, `${cld}/${cl.length} steps`) : null,
      ncount ? el("span", { class: "label" }, `${ncount} note${ncount > 1 ? "s" : ""}`) : null,
      stepsDone && can ? el("button", { class: "btn small primary", onclick: () => toggleDone(p, t, true, key) }, "All steps done · Mark done") : null),
    doneAnyway === key ? el("div", { class: "waitwarn" },
      el("span", {}, `Not done yet: ${w.open.map(d => `“${d.text}” (${ownerName(d)})`).join(", ")}. Mark this one done anyway?`),
      el("span", { class: "row", style: "gap:6px" }, el("button", { class: "btn small quiet", onclick: () => { doneAnyway = null; render() } }, "Not yet"),
        el("button", { class: "btn small primary", onclick: () => toggleDone(p, t, true, key, true) }, "Mark done"))) : null,
    open ? taskDetail(p, t, key) : null);
}

function taskDetail(p, t, key) {
  const planner = canPlan(p), can = planner || isAssignee(t, me), phases = getPhases(p);
  const set = (data, ok) => write(() => upd(p.id, typeof data === "function" ? data() : data), ok);
  const box = el("div", { class: "tdetail" });
  const field = (label, ...kids) => el("div", { class: "tfield" }, el("span", { class: "tlabel" }, label), el("div", { class: "tval" }, ...kids));

  const cur = t.done ? "done" : t.status === "doing" ? "doing" : "todo";
  box.append(field("Status", el("div", { class: "seg seg-sm", role: "group", "aria-label": "Status" },
    [["todo", "Not started"], ["doing", "In progress"], ["done", "Done"]].map(([v, l]) => el("button", { "aria-pressed": String(cur === v), disabled: !can, onclick: () => setTaskStatus(p, t, v, key) }, l)))));

  const people = assignees(t);
  if (planner) {
    const lead = el("select", { class: "mini", "aria-label": "Main person", onchange: e => set({ [t.path + ".owner"]: e.target.value || null, [t.path + ".assignedBy"]: me, [t.path + ".assignedAt"]: Date.now() }, e.target.value ? `Given to ${name(e.target.value)}` : null) },
      el("option", { value: "" }, "Nobody yet"), teamIds().map(u => el("option", { value: u }, name(u))));
    lead.value = t.owner || "";
    const helpers = Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u).filter(u => u !== t.owner);
    const others = teamIds().filter(u => u !== t.owner && !helpers.includes(u));
    const addSel = others.length && t.owner ? el("select", { class: "mini", "aria-label": "Add someone", onchange: e => { const u = e.target.value; if (u) set({ [`${t.path}.helpers.${u}`]: { by: me, at: Date.now() } }, `${name(u)} added to the task`) } },
      el("option", { value: "" }, "+ Add someone"), others.map(u => el("option", { value: u }, name(u)))) : null;
    box.append(field("People", lead,
      ...helpers.map(u => el("span", { class: "planner" }, av(u), name(u), el("button", { class: "x", "aria-label": "Remove " + name(u), onclick: () => set(() => ({ [`${t.path}.helpers.${u}`]: DEL() })) }, "✕"))),
      addSel));
  } else {
    box.append(field("People", people.length ? people.map(u => el("span", { class: "planner" }, av(u), name(u))) : el("span", { class: "label" }, "Not assigned yet")));
  }

  if (planner) {
    // due date: one tap for the usual ones, or pick any day
    const due = el("input", { type: "date", class: "mini", "aria-label": "Due date", value: t.due || "", onchange: e => set({ [t.path + ".due"]: e.target.value || null }) });
    const quick = [["Today", 0], ["Tomorrow", 1], ["In a week", 7]].map(([l, n]) => { const d = plusDays(n);
      return el("button", { class: "qd", "aria-pressed": String(t.due === d), onclick: () => set({ [t.path + ".due"]: d }, `Due ${l.toLowerCase()}`) }, l) });
    box.append(field("Due", ...quick, due, t.due ? el("button", { class: "linkbtn", onclick: () => set({ [t.path + ".due"]: null }, "No due date") }, "Clear") : null));
    const pr = el("select", { class: "mini", "aria-label": "Task priority", onchange: e => set({ [t.path + ".priority"]: e.target.value }) }, PRIORITIES.map(x => el("option", { value: x.id }, x.name + " priority")));
    pr.value = t.priority || "medium";
    const sk = el("select", { class: "mini", "aria-label": "Skill needed", onchange: e => set({ [t.path + ".skill"]: e.target.value || null }) }, el("option", { value: "" }, "Any skill"), SKILL_IDS.map(s => el("option", { value: s }, SKILLS[s].name)));
    sk.value = t.skill || "";
    let ph = null;
    if (phases.length > 1) {
      ph = el("select", { class: "mini", "aria-label": "Phase", onchange: e => write(() => phaseWrite(p, { [t.path + ".phase"]: e.target.value })) }, phases.map(x => el("option", { value: x.id }, x.name)));
      ph.value = t.phase;
    }
    box.append(field("Details", pr, sk, ph));
  } else {
    box.append(field("Details", el("span", { class: "row", style: "gap:6px" },
      el("span", { class: "prio prio-" + (t.priority || "medium") }, PRIORITIES.find(x => x.id === (t.priority || "medium")).name), dueChip(t) || el("span", { class: "label" }, "No due date"),
      t.skill ? el("span", { class: "chip" }, SKILLS[t.skill].name) : null)));
  }

  /* waiting for other tasks, and who's waiting on this one */
  {
    const all = tasksOf(p), w = waitInfo(p, t), mine = waitIds(t), phs = getPhases(p), phName = id => (phs.find(x => x.id === id) || {}).name || "";
    const chips = w.deps.map(d => el("span", { class: "planner" + (d.done ? " waitdone" : "") }, (d.done ? "✓ " : "⏳ ") + d.text, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, ownerName(d)),
      can ? el("button", { class: "x", "aria-label": "Stop waiting for " + d.text, onclick: () => set(() => ({ [`${t.path}.waitFor.${d.id}`]: DEL() }), "Not waiting for it anymore") }, "✕") : null));
    // other tasks, this task's phase first; never itself, one it already waits for, or one that waits for it (that would make a loop)
    const loop = waitersOf(p, t.id);
    const options = all.filter(x => x.id !== t.id && !mine.includes(x.id) && !loop.has(x.id) && !x.done)
      .sort((a, b) => (b.phase === t.phase) - (a.phase === t.phase) || (a.order || 0) - (b.order || 0));
    let add = null;
    if (can && options.length) add = waitPick === key
      ? el("select", { class: "mini", "aria-label": "Add a task to wait for", onchange: e => { const id = e.target.value; if (!id) return; const d = all.find(x => x.id === id); waitPick = null;
          set({ [`${t.path}.waitFor.${id}`]: true }, `Waiting for ${ownerName(d)} to finish “${d.text}”`) } },
          el("option", { value: "" }, "Pick the task this one needs first…"),
          options.map(x => el("option", { value: x.id }, `${phs.length > 1 ? phName(x.phase) + " · " : ""}${x.text} (${ownerName(x)})`)))
      : el("button", { class: "linkbtn", onclick: () => { waitPick = key; render() } }, w.deps.length ? "+ Another one" : "+ This needs another task done first");
    if (w.deps.length || add) box.append(field("Waiting for", ...chips, add));
    const needs = waitingOn(p, t);
    if (needs.length) box.append(field("Needed by", ...needs.map(x => el("span", { class: "planner" + (x.done ? " waitdone" : "") }, (x.done ? "✓ " : "") + x.text, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, ownerName(x))))));
  }

  /* checklist: ticking a step starts the task; ticking the last one offers to finish it */
  const cl = checkList(t);
  const ck = el("div", { class: "checklist" });
  const tick = (c, on) => {
    const after = cl.filter(x => x.id === c.id ? on : x.done).length;
    set(() => {
      const d = { [`${t.path}.check.${c.id}.done`]: on };
      if (on && !t.done && t.status !== "doing") { d[t.path + ".status"] = "doing"; d[t.path + ".startedBy"] = me; d[t.path + ".startedAt"] = Date.now() }
      return d;
    }, on && after === cl.length && !t.done ? "All steps done. Mark the task done when you're happy with it" : on && !t.done && t.status !== "doing" ? "Started. It's in progress now" : null);
  };
  if (cl.length) ck.append(el("div", { class: "track", style: "height:6px" }, el("div", { class: "fill", style: `width:${pctOf(cl.filter(c => c.done).length, cl.length)}%` })));
  for (const c of cl) ck.append(el("div", { class: "ck" + (c.done ? " done" : "") },
    el("input", { type: "checkbox", id: `ck-${key}-${c.id}`, checked: !!c.done, disabled: !can, onchange: e => tick(c, e.target.checked) }),
    el("label", { for: `ck-${key}-${c.id}` }, c.text),
    can ? el("button", { class: "x", "aria-label": "Remove step " + c.text, onclick: () => set(() => ({ [`${t.path}.check.${c.id}`]: DEL() })) }, "✕") : null));
  if (can) {
    const inp = el("input", { id: "ckadd-" + key, placeholder: cl.length ? "Add a step" : "Break it into steps (optional)", maxlength: "120" });
    const add = () => { const v = inp.value.trim(); if (!v) return; inp.value = ""; set({ [`${t.path}.check.${uid()}`]: { text: v, done: false, order: Date.now() } }) };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
    ck.append(el("div", { class: "padd", style: "margin:2px 0 0" }, el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, inp, el("button", { class: "btn", onclick: add }, "Add"))));
  } else if (!cl.length) ck.append(el("span", { class: "label" }, "No steps"));
  box.append(field("Steps", ck));

  box.append(field("Notes", notesBlock(p, t, key)));

  if (planner) box.append(el("div", { class: "row", style: "justify-content:flex-end" },
    delTask === key
      ? el("button", { class: "linkbtn danger", onclick: () => { delTask = null; openTask = null; deleteTask(p, t) } }, "Tap again to delete this task")
      : el("button", { class: "linkbtn danger", onclick: () => { delTask = key; render() } }, "Delete task")));
  return box;
}

// Deleting a task also takes it off the "waiting for" list of every task that needed it.
function deleteTask(p, t) {
  const freed = waitingOn(p, t);
  write(() => upd(p.id, Object.assign({ [t.path]: DEL() }, ...freed.map(x => ({ [`${x.path}.waitFor.${t.id}`]: DEL() })))), "Task deleted");
}

function setTaskStatus(p, t, v, key) {
  if (v === "done") return toggleDone(p, t, true, key);
  if (t.done) { reopenTask(p, t, v); return }
  const data = {};
  if (v === "doing") { data[t.path + ".status"] = "doing"; data[t.path + ".startedBy"] = me; data[t.path + ".startedAt"] = Date.now() }
  else data[t.path + ".status"] = null;
  write(() => upd(p.id, data), v === "doing" ? "Marked as in progress" : null);
}
function reopenTask(p, t, status) {
  if (openNote && openNote.endsWith(":" + t.id)) openNote = null;
  write(() => upd(p.id, { [t.path + ".done"]: false, [t.path + ".doneBy"]: DEL(), [t.path + ".doneAt"]: DEL(), [t.path + ".status"]: status === "todo" ? null : "doing" }), "Back on the to-do list");
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

let openNote = null, delNote = null;   // "<where>:<taskId>" of the note box that's open; note id waiting for a second tap
function toggleDone(p, t, done, key, force) {
  if (!done) { doneAnyway = null; return reopenTask(p, t, t.status === "doing" ? "doing" : "todo") }
  // Still waiting for someone else's task? Ask first, so nothing gets ticked by mistake.
  if (!force && waitInfo(p, t).open.length) { doneAnyway = key; render(); return }
  doneAnyway = null;
  openNote = "any:" + t.id;
  if (key) openTask = key;
  const msg = doneMessage(p, t);
  write(() => upd(p.id, { [t.path + ".done"]: true, [t.path + ".doneBy"]: me, [t.path + ".doneAt"]: Date.now() })).then(ok => { if (ok) toast(msg, 4500) });
}
// What finishing this task unlocks: someone's next task, or the end of a phase.
function doneMessage(p, t) {
  const all = tasksOf(p);
  const freed = all.filter(x => !x.done && waitIds(x).includes(t.id) && waitInfo(p, x).open.every(d => d.id === t.id));
  if (freed.length) { const x = freed[0], who = ownerName(x);
    return `Done! ${who === "nobody yet" ? "The next task" : who === "you" ? "You" : cap(who)} can start “${x.text}” now` + (freed.length > 1 ? ` (and ${freed.length - 1} more)` : "") }
  if (!all.some(x => x.phase === t.phase && !x.done && x.id !== t.id)) {
    const phs = getPhases(p), i = phs.findIndex(x => x.id === t.phase);
    if (i >= 0) return `${phs[i].name} is complete ✓ ` + (phs[i + 1] ? `Next up: ${phs[i + 1].name}` : "That was the last phase");
  }
  return "Nice! Add a note about what you did";
}
function notesBlock(p, t, where) {
  const key = where + ":" + t.id;
  const isOpen = openNote === key || openNote === "any:" + t.id;
  const notes = Object.entries(t.notes || {}).filter(([, n]) => n && n.text).map(([id, n]) => ({ id, ...n })).sort((a, b) => (a.at || 0) - (b.at || 0));
  const box = el("div", { class: "notes" });
  if (t.done && t.doneBy) box.append(el("div", { class: "note-meta" }, `Done by ${name(t.doneBy)}${t.doneAt ? " · " + ago(t.doneAt) : ""}`));
  for (const n of notes) box.append(el("div", { class: "note" }, av(n.by),
    el("div", { class: "note-body" }, el("div", { class: "note-meta" }, `${name(n.by)} · ${ago(n.at)}`), el("div", {}, linkify(n.text))),
    n.by === me ? (delNote === n.id
      ? el("button", { class: "linkbtn danger", style: "font-size:12px", onclick: () => { delNote = null; write(() => upd(p.id, { [`${t.path}.notes.${n.id}`]: DEL() }), "Note deleted") } }, "Delete?")
      : el("button", { class: "x", title: "Delete note", "aria-label": "Delete note", onclick: () => { delNote = n.id; render() } }, "✕")) : null));
  if (isOpen) {
    // When someone is waiting on this task, remind them what the next person needs.
    const next = t.done ? waitingOn(p, t).filter(x => !x.done) : [];
    const nextWho = [...new Set(next.flatMap(assignees))].filter(u => u !== me).map(u => name(u).split(" ")[0]);
    const ta = el("textarea", { id: `note-${where}-${t.id}`, class: "noteinput", maxlength: "1000", rows: "2",
      placeholder: !t.done ? "Add a note for the team" : nextWho.length ? `${nextWho.join(" and ")} ${nextWho.length > 1 ? "are" : "is"} next. Leave what they need: a link, where the files are…` : "What did you do? A link, what's finished, what's left…" });
    const save = () => {
      const text = ta.value.trim(); if (!text) return;
      ta.value = ""; openNote = null;
      write(() => upd(p.id, { [`${t.path}.notes.${uid()}`]: { by: me, text, at: Date.now() } }), "Note added");
    };
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (!e.shiftKey && matchMedia("(min-width:760px)").matches))) { e.preventDefault(); save() } });
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

// Private messages live in dms/{a_b}/msgs, where a_b are the two people's ids in order. Only those two can read them.
let dmThreads = [], dmMsgs = {}, dmSubFor = null, dmSubStop = null, dmOff = false;
const dmId = u => [me, u].sort().join("_");
const otherOf = t => (t.members || []).find(x => x !== me) || me;
const chatWith = () => route().dm || null;                    // the person I'm messaging, or null for the team chat
const curList = () => chatWith() ? (dmMsgs[dmId(chatWith())] || []) : chat;
const msgRef = id => chatWith() ? doc(db, "dms", dmId(chatWith()), "msgs", id) : doc(db, "chat", id);
const dmUnread = t => t.lastBy && t.lastBy !== me && (t.lastAt || 0) > ((t.seen || {})[me] || 0);
function watchDm(u) {
  const tid = u ? dmId(u) : null;
  if (tid === dmSubFor) return;
  if (dmSubStop) { dmSubStop(); dmSubStop = null }
  dmSubFor = tid; if (!tid || !db) return;
  dmSubStop = onSnapshot(query(collection(db, "dms", tid, "msgs"), orderBy("at"), limitToLast(300)),
    s => { dmMsgs[tid] = s.docs.map(d => ({ id: d.id, ...d.data() })); render() },
    () => { dmOff = true; render() });
}
// after sending or deleting in a private chat, keep the conversation's summary up to date
function touchThread(u, last) {
  const tid = dmId(u), members = [me, u].sort();
  const pm = pmByUid(u), myPhoto = (people[me] || {}).photo || (myProfile && myProfile.photo) || "";
  const data = { members, ...(last ? { lastAt: last.at, lastBy: me, lastText: msgSummary(last).slice(0, 120) } : {}), seen: { [me]: Date.now() },
    names: { [me]: realName(me) || (myProfile && myProfile.name) || "", [u]: chatName(u) }, roles: { [me]: "team", [u]: pm ? "partner" : "team" },
    photos: { [me]: /^https:\/\//.test(myPhoto) && myPhoto.length < 400 ? myPhoto : "" }, ...(pm ? { gid: pm.gid } : {}) };
  return setDoc(doc(db, "dms", tid), data, { merge: true });
}

let chat = [];
let chatSel = null;      // message whose actions are showing
let chatReply = null;    // message being replied to
let chatEdit = null;     // own message being edited
let chatDel = null;      // own message waiting for delete confirmation
let chatReactPick = null, chatEmojiOpen = false;
const seenKey = () => "chatSeen:" + me;
const getSeen = () => { try { return +localStorage.getItem(seenKey()) || 0 } catch { return 0 } };
const setSeen = v => { try { localStorage.setItem(seenKey(), String(v)) } catch { } };
const msgById = id => curList().find(m => m.id === id);
const snippet = t => (t || "").replace(/\s+/g, " ").slice(0, 90) + ((t || "").length > 90 ? "…" : "");

$("#chatform").addEventListener("submit", e => { e.preventDefault(); sendChat() });
$("#chat-emoji").onclick = () => { chatEmojiOpen = !chatEmojiOpen; const host = $("#chat-emoji-panel"); host.hidden = !chatEmojiOpen; host.replaceChildren(chatEmojiOpen ? emojiPanel(e => insertAtCursor($("#chat-input"), e)) : "") };
$("#chat-input").addEventListener("input", () => autoGrow($("#chat-input")));
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
    if (old && old.text !== text) write(() => updateDoc(msgRef(id), { text, edited: Date.now() }), "Message edited");
    else render();
    return;
  }
  if (!text && !pending.length) return;
  inp.value = ""; autoGrow(inp); if (chatEmojiOpen) $("#chat-emoji").click();
  await fbReady;
  let replyTo = chatReply && msgById(chatReply) ? chatReply : null;
  chatReply = null;
  const files = pending.splice(0); renderAttach();
  const dmTo = chatWith(); let last = null;
  if (files.length) {
    sending = true; $("#chat-send").disabled = true;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadStatus(`Sending ${files.length > 1 ? `file ${i + 1} of ${files.length}` : files[i].f.name}\u2026`);
        const pm = dmTo ? pmByUid(dmTo) : null;
        const file = await uploadFile(await prepareFile(files[i].f), pct => setUploadStatus(`Sending ${files[i].f.name}\u2026 ${pct}%`), pm ? { gid: pm.gid } : {});
        const data = { by: me, text: "", at: Date.now(), file };
        if (replyTo) { data.replyTo = replyTo; replyTo = null }
        await setDoc(msgRef(uid()), data); last = data;
      }
    } catch (e) {
      status(e.code === "permission-denied" ? "Sending files isn't allowed yet. Ask Mohammed to update the database rules." : "A file didn't send. Check your connection and try again.", true);
    }
    sending = false; $("#chat-send").disabled = false; setUploadStatus("");
  }
  if (text) {
    const data = { by: me, text, at: Date.now() };
    if (replyTo) data.replyTo = replyTo;
    last = data;
    write(() => setDoc(msgRef(uid()), data));
  }
  if (dmTo && last) write(() => touchThread(dmTo, last));
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
async function uploadFile(p, onProgress, extra = {}) {
  const id = uid(); const buf = new Uint8Array(await p.blob.arrayBuffer());
  const parts = Math.max(1, Math.ceil(buf.length / PART));
  for (let n = 0; n < parts; n++) {
    await setDoc(doc(db, "fileparts", `${id}_${n}`), { ...extra, by: me, fileId: id, n, data: Bytes.fromUint8Array(buf.subarray(n * PART, (n + 1) * PART)) });
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
  const jobs = [deleteDoc(msgRef(m.id))];
  if (m.file && m.by === me) for (let n = 0; n < m.file.parts; n++) jobs.push(deleteDoc(doc(db, "fileparts", `${m.file.id}_${n}`)).catch(() => {}));
  return Promise.all(jobs);
}
const playable = f => /^(video|audio)\//.test(f.type);
// What the viewer can show inside the site, without downloading first
const isPdf = f => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
const isText = f => /^text\//.test(f.type) || /^application\/(json|xml)$/.test(f.type) || /\.(txt|csv|md|json|log|xml|html?|css|js)$/i.test(f.name || "");
const isPic = f => !!f.thumb || /^image\//.test(f.type);
const viewable = f => isPic(f) || playable(f) || isPdf(f) || isText(f);
let pdfjsLib = null;
async function showPdf(url, body, lb) {
  if (!pdfjsLib) {
    pdfjsLib = await import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href);
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
  }
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const pages = el("div", { class: "lb-pages" }), count = el("div", { class: "lb-count" }, pdf.numPages === 1 ? "1 page" : pdf.numPages + " pages");
  body.classList.add("lb-doc"); body.replaceChildren(pages, count);
  const width = Math.min(body.clientWidth - 8, 900), dpr = Math.min(devicePixelRatio || 1, 2);
  for (let i = 1; i <= pdf.numPages; i++) {
    if (lb.hidden) return;
    const page = await pdf.getPage(i), w0 = page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale: width / w0 * dpr });
    const c = el("canvas", { class: "lb-page", "aria-label": `Page ${i} of ${pdf.numPages}` });
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.style.width = Math.floor(vp.width / dpr) + "px";
    pages.append(c);
    await page.render({ canvasContext: c.getContext("2d"), canvas: c, viewport: vp }).promise;
  }
}
function attachmentEl(f) {
  if (f.thumb) return el("button", { type: "button", class: "att-img", "aria-label": "Open photo " + f.name, onclick: e => { e.stopPropagation(); openViewer(f) } },
    el("img", { src: f.thumb, alt: f.name, width: f.w || null, height: f.h || null }));
  return el("div", { class: "att-file" + (viewable(f) ? " can-open" : ""), onclick: viewable(f) ? e => { e.stopPropagation(); openViewer(f) } : null },
    el("span", { class: "att-ext" }, extOf(f.name)),
    el("div", { class: "att-info" }, el("div", { class: "att-name" }, f.name), el("div", { class: "att-size" }, fmtSize(f.size))),
    el("button", { type: "button", class: "act", onclick: e => { e.stopPropagation(); viewable(f) ? openViewer(f) : downloadFile(f) } }, playable(f) ? "Play" : viewable(f) ? "Open" : "Download"));
}
// Links that can be read inside the site: PDF links, and Google Drive, Docs, Sheets and Slides files
function linkPreview(url) {
  let u; try { u = new URL(url) } catch { return null }
  const h = u.hostname.replace(/^www\./, ""); let m;
  if (h === "drive.google.com") {
    const id = (u.pathname.match(/\/file\/d\/([\w-]+)/) || [])[1] || u.searchParams.get("id");
    if (id) return { frame: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (h === "docs.google.com" && (m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/)))
    return { frame: `https://docs.google.com/${m[1]}/d/${m[2]}/preview` };
  if (/\.pdf$/i.test(u.pathname)) {
    if (h === "dropbox.com") { u.searchParams.delete("dl"); u.searchParams.set("raw", "1") }
    return { pdf: u.href };
  }
  return null;
}
// onclick for a link: opens it in the viewer when it can be read here (ctrl/cmd-click still opens a new tab)
function previewClick(url, label) {
  const pv = linkPreview(url); if (!pv) return null;
  return e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); e.stopPropagation(); openLinkViewer(url, label, pv) };
}
async function openLinkViewer(url, label, pv) {
  const lb = $("#lightbox"); lb.hidden = false;
  const body = el("div", { class: "lb-body" }, el("p", {}, "Loading…"));
  const close = () => { lb.hidden = true; lb.replaceChildren(); document.removeEventListener("keydown", esc) };
  const esc = e => { if (e.key === "Escape") close() };
  document.addEventListener("keydown", esc);
  lb.replaceChildren(el("div", { class: "lb-bar" }, el("span", { class: "lb-name" }, label || hostOf(url)), el("span", { class: "spacer" }),
    el("a", { class: "btn", href: url, target: "_blank", rel: "noopener noreferrer" }, "Open original"), el("button", { class: "btn", onclick: close }, "Close")), body);
  lb.onclick = e => { if (e.target === lb) close() };
  const frame = src => { body.classList.add("lb-fill"); body.replaceChildren(el("iframe", { class: "lb-frame", src, title: label || "Preview", allow: "autoplay; fullscreen", referrerpolicy: "no-referrer" })) };
  if (pv.frame) return frame(pv.frame);
  try { await showPdf(pv.pdf, body, lb) }
  catch { if (!lb.hidden) frame("https://docs.google.com/viewer?embedded=true&url=" + encodeURIComponent(pv.pdf)) }   // the site doesn't let us read it directly
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
    if (isPdf(f)) return await showPdf(url, body, lb);
    if (isText(f) && !isPic(f)) {
      const t = await (await fetch(url)).text();
      body.classList.add("lb-doc"); body.replaceChildren(el("pre", { class: "lb-text" }, t.length > 300000 ? t.slice(0, 300000) + "\n\n\u2026 (download the file to see the rest)" : t));
      return;
    }
    const media = f.type.startsWith("video/") ? el("video", { src: url, controls: true, autoplay: true, playsinline: true })
      : f.type.startsWith("audio/") ? el("audio", { src: url, controls: true, autoplay: true })
      : el("img", { src: url, alt: f.name });
    body.replaceChildren(media);
  } catch { body.replaceChildren(el("p", {}, "This file couldn't be shown here. Tap Download to open it on your device.")) }
}

function jumpTo(id) {
  const n = document.getElementById("msg-" + id); if (!n) return;
  n.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash");
}

function renderChat() {
  const latest = chat.length ? chat[chat.length - 1].at : 0;
  const onChat = route().view === "chat", dm = onChat ? chatWith() : null;
  if (onChat && !dm && latest > getSeen()) setSeen(latest);
  const teamUnread = chat.filter(m => m.at > getSeen() && m.by !== me).length;
  const dmCount = dmThreads.filter(t => dmUnread(t) && !(dm && otherOf(t) === dm)).length;
  const unread = teamUnread + dmCount;
  const badge = $("#c-chat"); badge.hidden = !unread; badge.textContent = unread;
  watchDm(dm);
  if (!onChat) return;
  if (dm === me) { location.hash = "chat"; return }
  // mark a private conversation as read
  if (dm) { const t = dmThreads.find(x => x.id === dmId(dm)); if (t && dmUnread(t)) { t.seen = { ...(t.seen || {}), [me]: Date.now() }; setDoc(doc(db, "dms", t.id), { seen: { [me]: Date.now() } }, { merge: true }).catch(() => {}) } }

  /* who you're talking to: the team, or one person privately */
  const head = $("#chat-head"); head.replaceChildren();
  const lastWith = u => (dmThreads.find(t => t.id === dmId(u)) || {}).lastAt || 0;
  const others = teamIds().filter(u => u !== me && people[u]);   // team members only: partners are never in the team chat
  // partners you can message: they have signed in at least once, or already wrote to you
  const partners = [...new Set([...pMembers.filter(m => m.uid && m.active !== false).map(m => m.uid), ...dmThreads.filter(t => Object.values(t.roles || {}).includes("partner")).map(otherOf)])].filter(u => u !== me && !others.includes(u));
  if (dm && !others.includes(dm) && !partners.includes(dm)) (isPartnerUid(dm) ? partners : others).push(dm);
  const byRecent = (a, b) => lastWith(b) - lastWith(a) || chatName(a).localeCompare(chatName(b));
  others.sort(byRecent); partners.sort(byRecent);
  const chip = u => { const t = dmThreads.find(x => x.id === dmId(u)); const n = t && dmUnread(t) && dm !== u;
    return el("button", { class: "pchip" + (isPartnerUid(u) ? " partnerchip" : ""), role: "tab", "aria-pressed": String(dm === u), title: "Private chat with " + chatName(u), onclick: () => { location.hash = "dm-" + u } }, chatAv(u), chatName(u).split(" ")[0], n ? el("span", { class: "count" }, "1") : null) };
  head.append(el("div", { class: "chatrow" }, el("span", { class: "chatrow-l" }, "Team"), el("div", { class: "pchips chat-people", role: "tablist", "aria-label": "Team chats" },
    el("button", { class: "pchip", role: "tab", "aria-pressed": String(!dm), onclick: () => { location.hash = "chat" } }, el("span", { class: "teamdot", "aria-hidden": "true" }, "#"), "Everyone", teamUnread && dm ? el("span", { class: "count" }, teamUnread) : null),
    others.map(chip))));
  if (partners.length) head.append(el("div", { class: "chatrow partners" }, el("span", { class: "chatrow-l" }, "Partners"), el("div", { class: "pchips chat-people", role: "tablist", "aria-label": "Private chats with partners" }, partners.map(chip))));
  head.append(el("div", { class: "chat-who" }, dm
    ? [chatAv(dm), el("span", { class: "who-n" }, el("b", {}, chatName(dm)), roleBadge(dm)), el("span", { class: "who-lock" }, "🔒 only you two see this")]
    : [el("span", { class: "teamdot big", "aria-hidden": "true" }, "#"), el("span", { class: "who-n" }, el("b", {}, "Team chat"), el("span", { class: "label" }, `${teamIds().length} team members · tap a name to talk privately`))]));
  $("#chat-input").placeholder = dm ? "Message " + chatName(dm).split(" ")[0] : "Message everyone";

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

  const list = curList();
  const log = $("#chatlog");
  if (log.dataset.chan !== (dm || "team")) { log.dataset.chan = dm || "team"; log.scrollTop = 0; chatSel = null; chatReply = null; chatDel = null; if (chatEdit) { chatEdit = null; $("#chat-input").value = "" } }
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const prevTop = log.scrollTop;
  log.replaceChildren();
  if (dm && dmOff) log.append(el("div", { class: "empty", style: "margin:auto;display:grid;gap:8px;justify-items:center" }, isAdmin
    ? [el("span", {}, "Private chats" + (isPartnerUid(dm) ? " with partners" : "") + " need the latest database rules. Copy them, paste them in Firebase › Firestore › Rules, and press Publish."), el("button", { class: "btn small primary", onclick: () => copyText(PARTNER_RULES, "Rules copied. Paste them in Firebase › Firestore › Rules, then Publish") }, "Copy the rules"), el("a", { class: "btn small", href: "https://console.firebase.google.com/project/the-office-ab723/firestore/rules", target: "_blank", rel: "noopener noreferrer" }, "Open Firebase rules")]
    : `Private chats aren't switched on yet. Ask ${ADMIN_NAME} to update the database rules.`));
  else if (!list.length) log.append(el("div", { class: "empty", style: "margin:auto" }, dm ? `No messages with ${chatName(dm).split(" ")[0]} yet. Say hi, only you two will see it.` : "No messages yet. Say hi to the team."));
  // in a private chat: has the other person seen my last message?
  const dmT = dm ? dmThreads.find(t => t.id === dmId(dm)) : null, lastMine = dm ? [...list].reverse().find(m => m.by === me) : null;
  const seenLast = !!(dmT && lastMine && ((dmT.seen || {})[dm] || 0) >= lastMine.at);
  let lastDay = "", lastBy = "", lastAt = 0;
  for (const m of list) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { log.append(el("div", { class: "day" }, new Date(m.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))); lastBy = "" }
    const mine = m.by === me, grouped = m.by === lastBy && m.at - lastAt < 5 * 60 * 1000 && !m.replyTo;
    if (!mine && !grouped) log.append(el("div", { class: "msg-name" }, chatName(m.by), dm && isPartnerUid(m.by) ? el("span", { class: "rolebadge partner" }, "Partner") : null));
    const time = new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const orig = m.replyTo ? msgById(m.replyTo) : null;
    const quote = m.replyTo ? el("button", { type: "button", class: "quote", onclick: e => { e.stopPropagation(); if (orig) jumpTo(orig.id) } },
      el("strong", {}, orig ? chatName(orig.by) : "Message"), el("span", {}, orig ? msgSummary(orig) : "This message was deleted")) : null;
    const sel = chatSel === m.id;
    const bubble = el("div", { class: "bubble" + (isEmojiOnly(m.text) && !m.file && !quote ? " emoji-only" : ""), tabindex: "0", role: "button", "aria-label": "Message options", "aria-expanded": String(sel),
      onclick: () => { if (String(getSelection())) return; chatSel = sel ? null : m.id; chatDel = null; render() },
      onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chatSel = sel ? null : m.id; chatDel = null; render() } } },
      quote, m.file ? attachmentEl(m.file) : null, m.text ? msgBody(m.text) : null, el("span", { class: "msg-time" }, (m.edited ? "edited · " : "") + time));
    const react = (e, on) => write(() => updateDoc(msgRef(m.id), { [`reacts.${emojiKey(e)}.${me}`]: on ? true : DEL() }));
    const row = el("div", { class: "msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "") + (sel ? " selected" : ""), id: "msg-" + m.id },
      mine ? null : (grouped ? el("span", { class: "av-space" }) : chatAv(m.by)), el("div", { class: "bubwrap" }, bubble, reactRow(m, react)));
    log.append(row);
    if (lastMine === m && seenLast) log.append(el("div", { class: "seen" }, "Seen"));
    if (sel) {
      const act = (label, fn, cls = "") => el("button", { type: "button", class: "act " + cls, onclick: e => { e.stopPropagation(); fn() } }, label);
      const has = e => !!((m.reacts || {})[emojiKey(e)] || {})[me];
      log.append(el("div", { class: "reactbar" + (mine ? " mine" : "") }, QUICK_REACTS.map(e => el("button", { type: "button", class: "emo" + (has(e) ? " on" : ""), "aria-label": "React " + e, onclick: ev => { ev.stopPropagation(); chatSel = null; react(e, !has(e)) } }, e)),
        el("button", { type: "button", class: "emo more", "aria-label": "More emoji", onclick: ev => { ev.stopPropagation(); chatReactPick = chatReactPick === m.id ? null : m.id; render() } }, "+")));
      if (chatReactPick === m.id) log.append(el("div", { class: "msg-actions" + (mine ? " mine" : "") }, emojiPanel(e => { chatReactPick = null; chatSel = null; react(e, !has(e)) })));
      log.append(el("div", { class: "msg-actions" + (mine ? " mine" : "") },
        m.text ? act("Copy", () => { copyText(m.text, "Copied"); chatSel = null; render() }) : null,
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

/* ----- chat kit: emoji, reactions and a chat view shared by the team chat, partner groups and partner messages ----- */
const EMOJI = {
  "Smileys": "😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 🤔 🤨 😐 😴 😮 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 🙄 😬 🤫 🤗 🫡 😇 🤓 🫠 🙃",
  "Hands": "👍 👎 👌 ✌️ 🤞 🤝 👏 🙌 🙏 💪 👋 ✋ 👀 🫶 ☝️ 👉 👈 🤙",
  "Work": "✅ ☑️ ❌ ⚠️ ⏳ ⏰ 📅 📌 📎 📝 📊 📈 💡 🔥 🚀 🎯 🏆 💰 💵 💳 📞 💻 📱 🎨 🎬 📸 🔧 🛠️ 📦 🧾 📣 🔗",
  "Hearts & fun": "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✨ ⭐ 🌟 🎉 🎊 🥂 ☕ 🍕 🌙 ☀️ 🙈 💀 🫣",
};
const QUICK_REACTS = ["👍", "❤️", "😂", "🔥", "🙏", "😮"];
const emojiKey = e => [...e].map(c => c.codePointAt(0).toString(16)).join("_");
const emojiOf = k => { try { return k.split("_").map(h => String.fromCodePoint(parseInt(h, 16))).join("") } catch { return "" } };
const isEmojiOnly = t => !!t && t.length <= 24 && /\p{Extended_Pictographic}/u.test(t) && /^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(t);
const recentEmoji = () => { try { return JSON.parse(localStorage.getItem("recentEmoji") || "[]") } catch { return [] } };
function useEmoji(e) { try { localStorage.setItem("recentEmoji", JSON.stringify([e, ...recentEmoji().filter(x => x !== e)].slice(0, 16))) } catch { } }
function emojiPanel(onPick) {
  const rec = recentEmoji();
  const groups = [...(rec.length ? [["Recent", rec]] : []), ...Object.entries(EMOJI).map(([k, v]) => [k, v.split(" ")])];
  return el("div", { class: "emojipanel", role: "dialog", "aria-label": "Emoji", onmousedown: e => e.preventDefault() },
    groups.map(([g, list]) => el("div", { class: "emg" }, el("div", { class: "emg-h" }, g),
      el("div", { class: "emg-l" }, list.map(e => el("button", { type: "button", class: "emo", "aria-label": e, onclick: ev => { ev.stopPropagation(); useEmoji(e); onPick(e) } }, e))))));
}
function insertAtCursor(inp, text) {
  const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
  const pos = s + text.length; try { inp.focus(); inp.setSelectionRange(pos, pos) } catch { }
  inp.dispatchEvent(new Event("input"));
}
// grow a message box with its text, up to a few lines
function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px" }
// reactions under a message: tap one to add or take back yours
function reactRow(m, toggle) {
  const r = Object.entries(m.reacts || {}).map(([k, who]) => ({ e: emojiOf(k), k, n: Object.values(who || {}).filter(Boolean).length, mine: !!(who || {})[me], who: Object.keys(who || {}).filter(u => who[u]) })).filter(x => x.n && x.e);
  if (!r.length) return null;
  return el("div", { class: "reacts" }, r.map(x => el("button", { type: "button", class: "react" + (x.mine ? " mine" : ""), title: x.who.map(u => u === me ? "You" : chatName(u)).join(", "), onclick: e => { e.stopPropagation(); toggle && toggle(x.e, !x.mine) } }, x.e, x.n > 1 ? el("b", {}, x.n) : null)));
}
const msgBody = t => el("span", { class: "msg-text" + (isEmojiOnly(t) ? " big" : "") }, linkify(t));

// Who someone is in a chat: team member or partner (with their group)
const pmByUid = u => (typeof pMembers !== "undefined" ? pMembers : []).find(m => m.uid === u);
const threadNames = u => { for (const t of (typeof dmThreads !== "undefined" ? dmThreads : []).concat(typeof pDms !== "undefined" ? pDms : [])) if ((t.names || {})[u]) return t.names[u]; return "" };
const chatName = u => u === me ? "You" : realName(u) || (pmByUid(u) || {}).name || threadNames(u) || "Someone";
const isPartnerUid = u => !!pmByUid(u) || ((typeof dmThreads !== "undefined" ? dmThreads : []).find(t => (t.roles || {})[u]) || { roles: {} }).roles[u] === "partner";
function chatAv(u, photo) {
  if (people[u]) return av(u);
  const pm = pmByUid(u); return postAv(photo || (pm && pm.photo) || "");
}
const roleBadge = (u, gname) => isPartnerUid(u) ? el("span", { class: "rolebadge partner" }, "Partner" + (gname || (pmByUid(u) ? " · " + groupName(pmByUid(u).gid) : ""))) : el("span", { class: "rolebadge" }, "Team");

/* A simple chat view for partner groups and partner messages.
   items: { id, by, name, photo, role: "team" | "partner", text, at, file, system, canDelete } */
function chatView(items, { onDelete, empty } = {}) {
  const log = el("div", { class: "chatlog cv" });
  if (!items.length) log.append(el("div", { class: "empty", style: "margin:auto" }, empty || "No messages yet. Say hi."));
  let lastDay = "", lastBy = "", lastAt = 0;
  for (const m of items) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { log.append(el("div", { class: "day" }, new Date(m.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))); lastBy = "" }
    lastDay = day;
    if (m.system) { log.append(el("div", { class: "sysline" }, m.text)); lastBy = ""; continue }
    const mine = m.by === me, grouped = m.by === lastBy && m.at - lastAt < 5 * 60e3;
    if (!mine && !grouped) log.append(el("div", { class: "msg-name" }, m.name || "Someone", m.role === "team" ? el("span", { class: "rolebadge" }, "Ardent team") : el("span", { class: "rolebadge partner" }, "Partner")));
    const time = new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    log.append(el("div", { class: "msg" + (mine ? " mine" : "") + (grouped ? " grouped" : "") },
      mine ? null : (grouped ? el("span", { class: "av-space" }) : postAv(m.photo)),
      el("div", { class: "bubble" + (isEmojiOnly(m.text) && !m.file ? " emoji-only" : "") }, m.file ? attachmentEl(m.file) : null, m.text ? msgBody(m.text) : null,
        el("span", { class: "msg-time" }, time, m.canDelete && onDelete ? el("button", { type: "button", class: "msg-del", "aria-label": "Delete message", onclick: e => { e.stopPropagation(); onDelete(m) } }, "✕") : null))));
    lastBy = m.by; lastAt = m.at;
  }
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight });
  return log;
}
// The box at the bottom of a chat: emoji, text, send. Enter sends on a computer; Shift+Enter makes a new line.
const composerOpen = {};
function chatComposer(id, placeholder, onSend) {
  const ta = el("textarea", { id, class: "noteinput", rows: "1", maxlength: "1000", placeholder, "aria-label": "Message" });
  ta.addEventListener("input", () => autoGrow(ta));
  const send = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; autoGrow(ta); composerOpen[id] = false; onSend(t) };
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(min-width:760px)").matches) { e.preventDefault(); send() } });
  const wrap = el("div", { class: "cv-compose" });
  const panelHost = el("div", { class: "cv-emoji" });
  const toggle = () => { composerOpen[id] = !composerOpen[id]; panelHost.replaceChildren(composerOpen[id] ? emojiPanel(e => insertAtCursor(ta, e)) : "") };
  if (composerOpen[id]) panelHost.append(emojiPanel(e => insertAtCursor(ta, e)));
  wrap.append(panelHost, el("div", { class: "chatform" },
    el("button", { type: "button", class: "attach", "aria-label": "Emoji", title: "Emoji", onclick: toggle }, "\u{1F642}"),
    ta, el("button", { type: "button", class: "btn primary", id: id + "-send", onclick: send }, "Send")));
  setTimeout(() => autoGrow(ta), 0);
  return wrap;
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
    for (const t of tasksOf(p)) if (isAssignee(t, me)) out.push({ p, t, closed: p.status === "completed" || isPaused(p), held: isPaused(p), phase: (phases.find(ph => ph.id === t.phase) || {}).name || "" });
  }
  return out;
}
function renderMine(box) {
  const all = myTasks();
  // A task you just ticked stays in "To do" until you save or skip its note.
  const noting = x => openNote && openNote.endsWith(":" + x.t.id);
  const todo = all.filter(x => !x.closed && (!x.t.done || noting(x))), done = all.filter(x => x.t.done);
  const today = todayStr(), soon = plusDays(1);

  box.append(addPersonalTaskRow());
  if (!all.length) { box.append(el("div", { class: "empty" }, "No tasks yet. Add one for yourself above. When a planner gives you a task in a project, it shows up here too.")); return }

  // Three simple groups: what to do now, what's next, and what's waiting on someone else.
  const group = x => {
    if (x.t.done) return "now";
    if (!x.personal && isBlocked(x.p, x.t)) return "wait";
    if (x.t.status === "doing" || (x.t.due && x.t.due <= soon)) return "now";
    return "next";
  };
  const order = (a, b) => (a.t.done - b.t.done) || taskPrioRank(a.t) - taskPrioRank(b.t) || prioRank(a.p) - prioRank(b.p) || ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : (a.t.due || "9999") > (b.t.due || "9999") ? 1 : 0) || (isActive(a.p) ? -1 : isActive(b.p) ? 1 : 0) || (a.t.order || 0) - (b.t.order || 0);
  const groups = [["now", "Now", "In progress or due by tomorrow"], ["next", "Next", "Ready when you are"], ["wait", "Waiting on others", "You can start these once the task before is done"]]
    .map(([id, label, hint]) => ({ id, label, hint, list: todo.filter(x => group(x) === id).sort(order) })).filter(g => g.list.length);

  const list = el("section", { class: "idea", style: "gap:0" });
  if (!todo.length) list.append(el("p", { style: "padding:6px 0" }, "All done. Nice work."));
  for (const g of groups) {
    if (groups.length > 1 || g.id === "wait") list.append(el("div", { class: "mgroup" + (g.id === "wait" ? " wait" : "") }, el("b", {}, g.label), el("span", { class: "pcount" }, g.list.length), el("span", { class: "mhint" }, g.hint)));
    g.list.forEach(x => list.append(myTaskRow(x)));
  }
  box.append(list);
  const held = all.filter(x => x.held && !x.t.done);
  if (held.length) box.append(el("p", { class: "label", style: "margin:8px 2px 0" }, `⏸ ${held.length} of your ${held.length === 1 ? "task is" : "tasks are"} on hold because ${[...new Set(held.map(x => x.p.title))].join(", ")} ${new Set(held.map(x => x.p.id)).size === 1 ? "is" : "are"} paused.`));
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
    inp.value = ""; due.value = ""; pri.value = "medium";
    write(() => setDoc(doc(db, "private", me, "tasks", uid()), data), "Task added");
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  const quick = [["Today", 0], ["Tomorrow", 1]].map(([l, n]) => el("button", { type: "button", class: "qd", onmousedown: e => e.preventDefault(), onclick: () => { due.value = plusDays(n); inp.focus() } }, l));
  return el("div", { class: "padd" },
    el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, inp, el("button", { class: "btn primary", onclick: add }, "Add")),
    el("div", { class: "padd-more row", style: "gap:8px;font-size:13px;color:var(--muted)" }, pri, ...quick, due, el("span", { class: "spacer" }), el("span", {}, "Only you see these")));
}
function myTaskRow(x) {
  if (x.personal) return personalTaskRow(x.t);
  return taskItem(x.p, x.t, "mine", { project: true, phase: x.phase, people: "multi" });
}

let delPTask = null;
function personalTaskRow(t) {
  const cid = "myp-" + t.id;
  const ref = () => doc(db, "private", me, "tasks", t.id);   // only when tapped: drawing must work before the database has loaded
  return el("div", { class: "task" + (t.done ? " done" : " tp-" + (t.priority || "medium")) },
    el("input", { type: "checkbox", id: cid, checked: !!t.done, onchange: e => { const on = e.target.checked; write(() => setDoc(ref(), { done: on, doneAt: on ? Date.now() : null }, { merge: true }), on ? "Done" : "Back on the to-do list") } }),
    el("label", { for: cid, class: "ttext" }, t.text),
    delPTask === t.id
      ? el("button", { class: "linkbtn danger", style: "font-size:12.5px", onclick: () => { delPTask = null; write(() => deleteDoc(ref()), "Task deleted") } }, "Delete?")
      : el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => { delPTask = t.id; render(); setTimeout(() => { if (delPTask === t.id) { delPTask = null; render() } }, 4000) } }, "✕"),
    el("div", { class: "meta" },
      el("span", { class: "label" }, "Just for me"),
      t.priority && t.priority !== "medium" && !t.done ? el("span", { class: "prio prio-" + t.priority }, PRIORITIES.find(x => x.id === t.priority).name) : null,
      dueChip(t)));
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
  partnerAlerts(add);
  clientAlerts(add);
  for (const p of ideas) if (p.status === "approved") for (const t of tasksOf(p)) {
    if (t.done || !isAssignee(t, me)) continue;
    const w = waitInfo(p, t); if (!w.deps.length || w.open.length) continue;
    const last = w.deps.reduce((a, d) => (d.doneAt || 0) > (a.doneAt || 0) ? d : a, w.deps[0]);
    if (last.doneBy === me) continue;
    add("ready:" + p.id + ":" + t.id + ":" + (last.doneAt || 0), last.doneAt, last.doneBy || null, `You can start "${t.text}": ${last.doneBy ? name(last.doneBy).split(" ")[0] : "someone"} finished "${last.text}"`, taskLink(p, t));
  }
  for (const p of ideas) {
    if (p.status === "voting" && p.author !== me) add("idea:" + p.id, p.createdAt, p.author, `${name(p.author)} pitched a new idea: ${p.title}`, "ideas");
    if (p.status === "completed" && p.completedBy !== me) add("done:" + p.id, p.completedAt, p.completedBy, `${p.title} is completed`, "projects-done");
    const pl = (p.planners || {})[me];
    if (pl && typeof pl === "object" && pl.by !== me) add("planner:" + p.id, pl.at, pl.by, `${name(pl.by)} made you a planner of ${p.title}`, "plan-" + p.id);
    if (p.status !== "approved") continue;
    for (const t of tasksOf(p)) {
      const go = taskLink(p, t);
      if (!isAssignee(t, me)) {
        // tasks you gave someone else: hear when they finish it or leave a note
        if (t.assignedBy !== me) continue;
        if (t.done && t.doneBy && t.doneBy !== me) add("fin:" + t.id + ":" + (t.doneAt || 0), t.doneAt, t.doneBy, `${name(t.doneBy)} finished "${t.text}" (${p.title})`, go);
        for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by !== me) add("note:" + nid, n.at, n.by, `${name(n.by)} left a note on a task you gave out: ${t.text}`, go);
        continue;
      }
      if (t.assignedBy && t.assignedBy !== me) add("task:" + t.id + ":" + t.assignedAt, t.assignedAt, t.assignedBy, `${name(t.assignedBy)} gave you a task: ${t.text} (${p.title})`, go);
      const h = (t.helpers || {})[me];
      if (h && h.by !== me) add("help:" + t.id, h.at, h.by, `${name(h.by)} added you to a task: ${t.text} (${p.title})`, go);
      for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by !== me) add("note:" + nid, n.at, n.by, `${name(n.by)} left a note on your task: ${t.text}`, go);
      if (!t.done && t.due && t.due <= tomorrow && !isPaused(p)) add("due:" + t.id + ":" + today, dayStart(), null, t.due < today ? `Overdue: ${t.text} (${p.title})` : t.due === today ? `Due today: ${t.text} (${p.title})` : `Due tomorrow: ${t.text} (${p.title})`, go);
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
  for (const p of dealProjects()) {
    if (!canPlan(p) || p.status !== "approved") continue;
    for (const s of moneyOf(p).late) add("late:" + p.id + ":" + s.label + ":" + today, dayStart(), null, `Late payment: ${p.title}${p.money.client ? " (" + p.money.client + ")" : ""}, ${s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label}`, "project-" + p.id);
  }
  if (isAdmin && moneyRules && moneyRules.reviewAt && moneyRules.reviewAt <= today) add("review:" + moneyRules.reviewAt, dayStart(), null, `Time to review the team fund: it's ${rulesNow().fundPct}% since ${fmtDate(ymd(new Date(moneyRules.setAt || Date.now())))}. Keep it or change it on the Money page.`, "money-rules");
  if (isAdmin && fundDoc) for (const [sid, sb] of Object.entries(fundDoc.subs || {})) if (sb && !sb.paused && sb.nextDue && sb.nextDue <= tomorrow) add("sub:" + sid + ":" + sb.nextDue, dayStart(), null, `${sb.name} subscription is due ${sb.nextDue < today ? "(overdue)" : sb.nextDue === today ? "today" : "tomorrow"}`, "money-fund");
  for (const n of unseenNews()) add("news:" + n.id, n.at || new Date(n.date + "T09:00").getTime(), n.by || null, (n.by ? `${firstName(n.by)} posted: ` : "New in Pitch Room: ") + n.title, "me");
  { const v = rulesNow().version || 1; if (dealProjects().length && ((people[me] || {}).moneyAgreed || {}).version !== v) add("rules:" + v, (moneyRules || {}).updatedAt || dayStart(), null, rulesChanges(rulesNow()).length ? "The money rules changed: " + rulesChanges(rulesNow()).join(", ") + ". Please read and agree" : "Please read and agree to the team's money rules", "money-rules") }
  for (const [pid, a] of Object.entries(activeMap)) { const p = ideas.find(i => i.id === pid); if (p && a && a.by !== me && p.status === "approved") add("start:" + pid + ":" + a.at, a.at, a.by, `We started building ${p.title}`, "build-" + pid) }
  for (const t of dmThreads) if (dmUnread(t)) add("dm:" + t.id + ":" + t.lastAt, t.lastAt, people[t.lastBy] ? t.lastBy : null, `${chatName(t.lastBy)}${isPartnerUid(t.lastBy) ? " (partner)" : ""} sent you a private message: ${(t.lastText || "").slice(0, 60)}`, "dm-" + t.lastBy);
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
  if (perm === "default" || (perm === "granted" && pushBase() && pushSupported() && !pushOn)) panel.append(el("div", { class: "alert-tip" }, el("span", {}, pushBase() && pushSupported() ? "Get these with a sound on this phone or computer, even when the site is closed." : "Get these as pop-ups on this phone or computer while the site is open."),
    el("button", { class: "btn primary", onclick: () => pushBase() && pushSupported() ? pushEnable() : enableDeviceAlerts() }, "Turn on")));
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
  // Looking at the site: a card inside the page. Not looking: the phone's or computer's own pop-up.
  for (const a of fresh.slice(0, 3)) ping({ ...splitAlert(a), key: a.key, who: a.who, go: a.go, at: a.at });
}

/* ----- me: personal home page ----- */

let meTab = "tasks";
function greeting() { const h = new Date().getHours(); return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening" }
function renderMe() {
  const box = $("#me"); box.replaceChildren();
  const prof = people[me] || {}, tops = topSkills(me);
  const fullName = realName(me) || (myProfile && myProfile.name) || "";
  const all = myTasks(), open = all.filter(x => !x.t.done && !x.closed), today = todayStr();
  const overdue = open.filter(x => x.t.due && x.t.due < today).length;
  const weekAgo = Date.now() - 7 * 864e5;
  const doneWeek = all.filter(x => x.t.done && (x.t.doneAt || 0) > weekAgo).length;
  const building = activeProjects();

  box.append(el("section", { class: "profile" },
    el("img", { class: "av av-lg", src: prof.pic || (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
    el("div", { class: "profile-main" },
      el("div", { class: "hello" }, greeting() + ","),
      el("h1", {}, fullName.split(" ")[0] || "you"),
      el("div", { class: "row", style: "gap:6px;margin-top:8px" },
        tops.length ? tops.map(s => el("span", { class: "chip" }, SKILLS[s].name)) : el("button", { class: "linkbtn", onclick: () => { location.hash = "skills" } }, "Take the skills quiz \u2192")),
      el("button", { class: "btn small brief-btn", style: "margin-top:10px", onclick: () => { asstOpen = true; alertsOpen = false; useTemplate(ASST_TEMPLATES[0], null) } }, "☀ Morning brief"))),
    el("div", { class: "stats" },
      el("div", { class: "stat" }, el("b", {}, open.length), el("span", {}, "to do")),
      el("div", { class: "stat" + (overdue ? " late" : "") }, el("b", {}, overdue), el("span", {}, "overdue")),
      el("div", { class: "stat" }, el("b", {}, doneWeek), el("span", {}, "done this week"))));

  { const nc = newsCard(); if (nc) box.append(nc) }
  if (dealProjects().length || isAdmin) {
    const all = allMoney();
    box.append(el("button", { class: "nowcard moneycard", onclick: () => { location.hash = "money" } },
      el("span", { class: "now-label" }, "Money"),
      el("span", { class: "now-title" }, all.me.balance > 0 ? `You're owed ${fmtEGP(all.me.balance)}` : `Team fund ${fmtEGP(fundState(all).balance)}`),
      el("span", { class: "now-sub" }, (all.late.length ? `${all.late.length} late payment${all.late.length > 1 ? "s" : ""} \u00b7 ` : "") + "Open money \u2192")));
  }
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
    el("button", { class: "btn", onclick: () => { location.hash = "settings" } }, isAdmin ? "Settings & team" : "Settings")));
}

/* ----- account settings (everyone) and team access (admin only) ----- */

// Look: "dark" (galaxy), "light", or "system" (match the phone or computer). Saved on this device and on your account.
const THEMES = [["dark", "Dark"], ["pine", "Pine teal"], ["light", "Light"], ["system", "Match my device"]];
function getTheme() { try { return localStorage.getItem("theme") || "dark" } catch { return "dark" } }
function getMeteors() { try { return localStorage.getItem("meteors") !== "off" } catch { return true } }
function applyLook(theme, meteors) {
  try { localStorage.setItem("theme", theme); localStorage.setItem("meteors", meteors ? "on" : "off") } catch { }
  window.applyTheme && window.applyTheme();
  window.pitchBackground && window.pitchBackground();
}
let lookSynced = false;
function syncLookFromAccount() {
  // the first time your account loads on a device, use the look you picked elsewhere
  const prof = people[me]; if (lookSynced || !prof) return;
  try { if (sessionStorage.getItem("lookFromLink")) { lookSynced = true; return } } catch { }
  lookSynced = true;
  if (prof.theme && prof.theme !== getTheme()) applyLook(prof.theme, prof.meteors !== false);
}

// Profile photo: shrunk to a small square so it loads fast everywhere.
async function pickProfilePhoto() {
  const inp = el("input", { type: "file", accept: "image/*", hidden: true });
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.remove(); if (!f) return;
    try {
      const img = await createImageBitmap(f), s = Math.min(img.width, img.height);
      const c = document.createElement("canvas"); c.width = c.height = 192;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
      const pic = c.toDataURL("image/jpeg", 0.82);
      write(() => setDoc(doc(db, "users", me), { pic }, { merge: true }), "Photo updated");
    } catch { toast("That picture couldn't be read. Try a JPG or PNG.") }
  });
  document.body.append(inp); inp.click();
}

let teamDoc = null, teamLoaded = false, delEmail = null;
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function teamEmails() { return (teamDoc && Array.isArray(teamDoc.emails) ? teamDoc.emails : []).map(e => String(e).toLowerCase()) }
// The first time the admin opens the site, the team list is created from the people already allowed in.
const STARTING_TEAM = ["mohammedd.alajmiii@gmail.com", "omar.ayman122y@gmail.com", "sheta7760@gmail.com"];
function ensureTeamDoc() {
  if (!isAdmin || !teamLoaded || teamDoc) return;
  teamDoc = { emails: STARTING_TEAM };
  setDoc(doc(db, "meta", "team"), { emails: STARTING_TEAM, updatedAt: Date.now(), updatedBy: me }).catch(() => {});
}
function saveTeam(emails, ok) {
  const list = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  teamDoc = { ...(teamDoc || {}), emails: list }; render();
  write(() => setDoc(doc(db, "meta", "team"), { emails: list, updatedAt: Date.now(), updatedBy: me }, { merge: true }), ok);
}

function renderSettings() {
  const box = $("#settings"); box.replaceChildren();
  const prof = people[me] || {}, theme = getTheme(), meteors = getMeteors();
  box.append(el("button", { class: "back", onclick: () => { location.hash = "me" } }, "← Me"), el("h2", { class: "sec-h", style: "margin-top:0" }, "Settings"));
  const secs = [["s-you", "You"], ["s-alerts", "Alerts"], ["s-team", "Team"], ["s-help", "Help"], ["s-account", "Account"]];
  box.append(el("nav", { class: "setnav", "aria-label": "Settings sections" }, secs.map(([id, l]) => el("button", { class: "cat", onclick: () => { const n = document.getElementById(id); if (n) scrollTo({ top: n.getBoundingClientRect().top + scrollY - 80, behavior: "smooth" }) } }, l))));
  const sec = (id, title, sub, ...kids) => el("section", { class: "setsec", id }, el("div", { class: "set-h" }, el("h3", {}, title), sub ? el("p", {}, sub) : null), ...kids);
  const item = (title, sub, ...ctrl) => el("div", { class: "setrow" }, el("div", { class: "setrow-t" }, el("b", {}, title), sub ? el("span", {}, sub) : null), el("div", { class: "setrow-c" }, ...ctrl));

  /* you: photo, name, look */
  const nick = el("input", { id: "set-name", class: "noteinput", maxlength: "40", placeholder: (myProfile && myProfile.name) || "Your name" });
  if (!nick.value) nick.value = prof.nick || "";
  const saveName = () => { const v = nick.value.trim(); write(() => setDoc(doc(db, "users", me), { nick: v }, { merge: true }), v ? "Name saved" : "Using your Google name again") };
  nick.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveName() } });
  const setLook = (t, m) => { applyLook(t, m); render(); write(() => setDoc(doc(db, "users", me), { theme: t, meteors: m }, { merge: true })) };
  box.append(sec("s-you", "You", "How you look to the team, and how Pitch Room looks to you.",
    el("div", { class: "idea", style: "gap:0" },
      el("div", { class: "setrow" }, el("img", { class: "av av-lg", src: prof.pic || (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
        el("div", { class: "setrow-t" }, el("b", {}, realName(me) || (myProfile && myProfile.name) || ""), el("span", {}, (myProfile && myProfile.email) || "")),
        el("div", { class: "setrow-c" }, el("button", { class: "btn small", onclick: pickProfilePhoto }, "Change photo"),
          prof.pic ? el("button", { class: "btn quiet small", onclick: () => write(() => setDoc(doc(db, "users", me), { pic: DEL() }, { merge: true }), "Back to your Google photo") }, "Use Google photo") : null)),
      item("Name the team sees", "Leave it empty to use your Google name.", el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, nick, el("button", { class: "btn primary", onclick: saveName }, "Save"))),
      item("Theme", "Saved to your account, so every device matches.", el("div", { class: "seg", role: "group", "aria-label": "Theme" }, THEMES.map(([v, l]) => el("button", { "aria-pressed": String(theme === v), onclick: () => setLook(v, meteors) }, l === "Match my device" ? "Auto" : l)))),
      item("Background animation", "The slow moving map behind the page.", el("div", { class: "seg seg-sm", role: "group", "aria-label": "Background animation" },
        el("button", { "aria-pressed": String(meteors), onclick: () => setLook(theme, true) }, "On"),
        el("button", { "aria-pressed": String(!meteors), onclick: () => setLook(theme, false) }, "Off"))))));

  /* alerts */
  box.append(sec("s-alerts", "Alerts", "What reaches you, and how.", pushSettings(), newsSettings()));

  /* team: nicknames for everyone, plus access for the admin */
  const crew = Object.entries(people).filter(([id, x]) => x && x.name && isTeamUid(id)).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  const nickBox = crew.length ? el("details", { class: "idea setdetails" }, el("summary", {}, el("b", {}, "Nicknames"), el("span", { class: "label" }, `${Object.keys(nicks).length} set · everyone sees them instead of names`)),
    el("div", { class: "nicklist" }, crew.map(([id, x]) => {
      const inp = el("input", { class: "noteinput", maxlength: "30", placeholder: x.nick || x.name, "aria-label": "Nickname for " + x.name, value: nicks[id] || "" });
      const save = () => { const v = inp.value.trim(); if (v === (nicks[id] || "")) return; write(() => setDoc(doc(db, "meta", "nicks"), { [id]: v ? v.slice(0, 30) : DEL() }, { merge: true }), v ? `${x.name.split(" ")[0]} is now “${v}”` : "Nickname removed") };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } });
      return el("div", { class: "nickrow" }, el("img", { class: "av", src: x.pic || x.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
        el("span", { class: "nickname-real" }, id === me ? x.name + " (you)" : x.name), inp, el("button", { class: "btn small", onclick: save }, "Save"));
    }))) : null;
  box.append(sec("s-team", "Team", isAdmin ? "Who can sign in and what they see. Only you see the access list." : "Names everyone on the team sees.", isAdmin ? accessSection() : null, nickBox,
    el("div", { class: "idea", style: "gap:0" }, item("Money rules", "The team fund, finder's fee and how we split.", el("button", { class: "btn small", onclick: () => { moneyTab = "rules"; location.hash = "money" } }, "Open")),
      item("Skills", "Your strengths, used to suggest who does which task.", el("button", { class: "btn small", onclick: () => { location.hash = "skills" } }, "Open")))));

  /* help: fixes for the usual problems, right here */
  const adminId = Object.entries(people).find(([, x]) => ADMINS.includes((x.email || "").toLowerCase()));
  const standalone = (() => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone } catch { return false } })();
  box.append(sec("s-help", "Help", "Quick fixes when something isn't right.", el("div", { class: "idea", style: "gap:0" },
    item("Get the latest version", "If a new feature isn't showing up.", el("button", { class: "btn small", onclick: () => location.replace(location.pathname + "?v=" + Date.now() + location.hash) }, "Reload")),
    item("Refresh this device", "If something looks wrong or out of date. Your work is safe: it's all saved online.", el("button", { class: "btn small", onclick: () => { clearCache(); location.replace(location.pathname + "?v=" + Date.now() + "#me") } }, "Refresh")),
    installGuide(),
    item("Share the site link", SITE_LINK, el("button", { class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(SITE_LINK); toast("Link copied") } catch { toast(SITE_LINK, 5000) } } }, "Copy")),
    adminId && adminId[0] !== me ? item("Still stuck?", `Message ${ADMIN_NAME} privately.`, el("button", { class: "btn small", onclick: () => { location.hash = "dm-" + adminId[0] } }, "Message")) : null,
    item("Version", typeof BUILD_ID !== "undefined" ? BUILD_ID.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).*/, "$3/$2/$1 $4:$5") : "", null))));

  /* account */
  box.append(sec("s-account", "Account", null, el("div", { class: "idea", style: "gap:0" },
    item("Signed in", (myProfile && myProfile.email) || "", el("button", { class: "btn small", onclick: doSignOut }, "Sign out")))));
}

/* ----- assistant (Gemini through Firebase AI Logic) -----
   Loaded separately, only when someone opens it, so the rest of the site never depends on it.
   It only ever suggests: people review and tap to add or save anything. */

const AI_SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const AI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"];   // free-tier models, tried in order
let asstOpen = false, asstBusy = false, asstMsgs = [], aiP = null, checkinDraft = null;

function loadAI() {
  if (!aiP) aiP = (async () => {
    const [appM, aiM] = await Promise.all([import(AI_SDK + "firebase-app.js"), import(AI_SDK + "firebase-ai.js")]);
    const app = appM.getApps().find(a => a.name === "assistant") || appM.initializeApp(firebaseConfig, "assistant");
    return { aiM, ai: aiM.getAI(app, { backend: new aiM.GoogleAIBackend() }) };
  })().catch(e => { aiP = null; throw e });
  return aiP;
}
async function askAI(prompt, system) {
  const { aiM, ai } = await loadAI();
  let last;
  for (const m of AI_MODELS) {
    try {
      const model = aiM.getGenerativeModel(ai, { model: m, systemInstruction: system });
      const r = await model.generateContent(prompt);
      return r.response.text();
    } catch (e) {
      // a model that's missing or out of free requests: try the next one
      last = e; const k = aiErrorKind(e);
      if (k !== "model" && k !== "busy") throw e;
    }
  }
  throw last;
}
function aiErrorRaw(e) {
  const parts = [e && e.code, e && e.customErrorData && e.customErrorData.status, e && e.customErrorData && e.customErrorData.statusText, e && e.message].filter(Boolean);
  return parts.join(" \u00b7 ").slice(0, 300) || String(e);
}
function aiErrorKind(e) {
  const t = aiErrorRaw(e), status = e && e.customErrorData && e.customErrorData.status;
  if (/api-not-enabled|SERVICE_DISABLED|has not been used|API_KEY_SERVICE_BLOCKED|is disabled|not been enabled|enable the/i.test(t) || status === 403) return "off";
  if (status === 404 || /\b404\b|not found for API version|is not found|not supported for generateContent|no longer available/i.test(t)) return "model";
  if (status === 429 || /RESOURCE_EXHAUSTED|\b429\b|quota exceeded|exceeded your current quota|Too Many Requests/i.test(t)) return "busy";
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET|network error/i.test(t)) return "net";
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(t)) return "load";
  return "other";
}
function aiErrorText(e) {
  const k = aiErrorKind(e);
  if (k === "off") return isAdmin ? "The assistant isn't switched on yet. In Firebase, open AI Logic and turn on the Gemini Developer API." : `The assistant isn't switched on yet. Ask ${ADMIN_NAME} to turn it on.`;
  if (k === "busy") return "The free Gemini limit was reached for now. Try again in a minute (daily limits reset overnight).";
  if (k === "model") return "The Gemini models this site uses aren't available on your Firebase project.";
  if (k === "net") return "Couldn't reach the assistant. Check your connection and try again.";
  if (k === "load") return "The assistant couldn't load. Reload the page and try again.";
  return "Something went wrong with the assistant.";
}

// What the assistant is told about the board: only what it needs, never private notes.
function boardContext(p) {
  const today = new Date(), L = [];
  const short = (s, n = 110) => (s || "").replace(/\s+/g, " ").slice(0, n);
  const tline = (t, proj) => `- ${short(t.text)}${proj ? " [" + proj + "]" : ""} | ${assignees(t).map(u => realName(u) || "someone").join(", ") || "unassigned"} | ${t.done ? "done" : t.status === "doing" ? "in progress" : "not started"}${t.due ? " | due " + t.due : ""}${t.priority && t.priority !== "medium" ? " | " + t.priority : ""}`;
  L.push(`Today is ${ymd(today)} (${today.toLocaleDateString("en", { weekday: "long" })}).`);
  L.push(`You are talking to ${realName(me) || "a team member"}${isAdmin ? " (the team's admin)" : ""}.`);
  L.push("Team: " + teamIds().map(u => { const s = topSkills(u).map(k => SKILLS[k].name).join(" + "); return realName(u) + (s ? ` (strengths: ${s})` : "") }).join("; "));
  const mine = myTasks().filter(x => !x.closed);
  L.push(`\nMy tasks (${mine.filter(x => !x.t.done).length} open):`);
  mine.slice(0, 60).forEach(x => L.push(x.personal ? `- ${short(x.t.text)} [private]${x.t.done ? " | done" : ""}${x.t.due ? " | due " + x.t.due : ""}` : tline(x.t, x.p.title)));
  const act = activeProjects();
  if (act.length) { L.push("\nProjects being built now:"); act.forEach(a => { const pr = progressOf(tasksOf(a)); L.push(`- ${a.title} (${prioOf(a).name} priority, ${pr.done}/${pr.total} tasks done)`) }) }
  if (p) {
    L.push(`\nTHE PROJECT WE'RE LOOKING AT: "${p.title}"${catsOf(p).length ? " (" + catsOf(p).join(", ") + ")" : ""}, ${prioOf(p).name} priority, ${p.status === "completed" ? "completed" : isActive(p) ? "being built now" : "not started yet"}.`);
    if (p.pitch) L.push("Description: " + short(p.pitch, 500));
    if (clientOf(p)) L.push("Client: " + clientOf(p));
    const g = (p.goals || {})[weekKey()]; if (g && g.text) L.push(`This week's goal: ${g.text}${g.reached ? " (reached)" : ""}`);
    L.push("Team on this project: " + (teamOf(p).map(u => realName(u)).join(", ") || "nobody yet"));
    const phases = getPhases(p), tasks = tasksOf(p);
    if (!phases.length) L.push("It has no plan yet.");
    phases.forEach(ph => { L.push(`PHASE: ${ph.name}${ph.due ? " (finish by " + ph.due + ")" : ""}`); tasks.filter(t => t.phase === ph.id).slice(0, 40).forEach(t => L.push(tline(t))) });
    const ci = (p.checkins || {})[weekKey()] || {};
    if (Object.keys(ci).length) { L.push("This week's check-ins:"); for (const [u, c] of Object.entries(ci)) L.push(`- ${realName(u)}: did "${short(c.did)}", next "${short(c.next)}"${c.blockers ? `, blocked by "${short(c.blockers)}"` : ""}`) }
    const meets = Object.values(p.meetings || {}).filter(Boolean).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);
    if (meets.length) { L.push("Latest meeting notes:"); meets.forEach(m => L.push(`- ${m.date}: ${short(m.title, 60)} — ${short(m.text, 300)}`)) }
  }
  // what the team finished lately
  const recent = [];
  for (const a of ideas.filter(i => i.status === "approved")) for (const t of tasksOf(a)) if (t.done && t.doneAt && t.doneAt > Date.now() - 7 * 864e5) recent.push({ t, a });
  recent.sort((x, y) => y.t.doneAt - x.t.doneAt);
  if (recent.length) { L.push("\nFinished by the team in the last 7 days:"); recent.slice(0, 30).forEach(({ t, a }) => L.push(`- ${short(t.text, 80)} [${a.title}] by ${assignees(t).map(u => realName(u)).join(", ") || "someone"}, ${ymd(new Date(t.doneAt))}`)) }
  // ideas waiting for votes
  const vot = ideas.filter(i => i.status === "voting");
  if (vot.length) { L.push("\nIdeas in the vote:"); vot.slice(0, 20).forEach(i => { const { k, d } = tally(i), mine = (i.votes || {})[me]; L.push(`- ${i.title}${i.category ? " (" + i.category + ")" : ""}${i.client ? " for client " + i.client : ""}: ${k} keep, ${d} drop${mine ? "" : ", I haven't voted"} | by ${realName(i.author) || "someone"}${i.pitch ? " | " + short(i.pitch, 160) : ""}`) }) }
  // money (everyone on the team can see this on the Money page)
  try {
    const all = allMoney(), F = fundState(all);
    if (all.projects.length || F.subs.length) {
      L.push("\nMoney (EGP):");
      L.push(`- Owed to me: ${fmtEGP(all.me.balance)}. Team fund: ${fmtEGP(F.balance)} (rule: ${rulesNow().fundPct}% of profit).`);
      if (all.month.expected) L.push(`- This month: ${fmtEGP(all.month.received)} received of ${fmtEGP(all.month.expected)} expected.`);
      all.late.slice(0, 10).forEach(({ p: lp, s: ls }) => L.push(`- LATE: ${lp.title}${(lp.money || {}).client ? " (" + lp.money.client + ")" : ""}: ${ls.label} ${fmtEGP(ls.expected - ls.received)}`));
      F.subs.slice(0, 8).forEach(sb => L.push(`- Subscription ${sb.name}: ${sb.amount} EGP, next due ${sb.nextDue || "?"}`));
      F.goals.slice(0, 5).forEach(g => L.push(`- Goal ${g.name}: target ${g.target} EGP`));
    }
  } catch { }
  return L.join("\n");
}
const ASSISTANT_RULES = `You are the assistant inside "Pitch Room", where a small team of friends in Egypt pitch ideas and turn them into real projects that build experience and make money.
Be friendly, practical and short. Use people's first names. Base everything on the board data you are given; if something isn't on the board, say so instead of guessing. Never claim a task is done unless the board says so.
Plain text only: no markdown headings, no bold, no tables. Short lines and simple dashes are fine.
When you suggest phases or tasks, write them ONLY in this exact format so they can be imported (one task per line):
PHASE: <phase name>
- <task> | <first name of who should do it, or leave out> | due <YYYY-MM-DD> | <urgent, high, medium or low> | skill: <Builder, Designer, Organizer, Writer, Talker, Researcher or Creator> | steps: <step one; step two>
Only use team members' real first names. Due dates must be after today and realistic for friends with school or jobs and little money. Match tasks to people's strengths and spread the work fairly.`;

async function runAssistant(userText, opts = {}) {
  const p = currentProject();
  asstMsgs.push({ role: "me", text: userText });
  asstBusy = true; render();
  const history = asstMsgs.slice(-7, -1).map(m => (m.role === "me" ? "Team member: " : "Assistant: ") + m.text).join("\n");
  const prompt = `BOARD DATA\n${boardContext(p)}\n\n${history ? "EARLIER IN THIS CHAT\n" + history + "\n\n" : ""}REQUEST\n${opts.prompt || userText}`;
  try {
    const text = (await askAI(prompt, ASSISTANT_RULES)).trim();
    if (opts.checkin && p) {
      const j = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      checkinDraft = { pid: p.id, did: String(j.did || ""), next: String(j.next || ""), blockers: String(j.blockers || "") };
      asstMsgs.push({ role: "ai", text: "I drafted your check-in from the board. It's filled in on the project's “This week” tab. Check it, change anything, and tap Save." });
      editCheckin = p.id; projTab = "week"; asstOpen = false;
    } else {
      const found = parseIdeas(text);
      asstMsgs.push({ role: "ai", text: found.length ? text.split("\n").filter(l => !/^\s*[-*\d.)\s]*IDEA\s*:/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim() : text, ideas: found, plan: !found.length && /^\s*PHASE:/im.test(text) && /^\s*-\s+/m.test(text) });
    }
  } catch (e) {
    try { console.error("Assistant error", e) } catch { }
    asstMsgs.push({ role: "ai", error: true, text: e instanceof SyntaxError ? "I couldn't draft the check-in this time. Try again." : aiErrorText(e), detail: e instanceof SyntaxError ? "" : aiErrorRaw(e) });
  }
  asstBusy = false; render();
  const log = document.getElementById("asst-log"); if (log) log.scrollTop = log.scrollHeight;
}
function parseIdeas(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*\d.)\s]*IDEA\s*:\s*(.+)$/i); if (!m) continue;
    const [title, category, pitch, pays] = m[1].split("|").map(x => (x || "").replace(/\*\*/g, "").trim());
    if (title) out.push({ title: title.slice(0, 80), category: category || "", pitch: [pitch, pays ? "Who pays: " + pays : ""].filter(Boolean).join(" ").slice(0, 600) });
  }
  return out.slice(0, 10);
}
// Put an idea from the assistant into the "Pitch an idea" form, so you can edit it and add it to the vote.
function useIdea(x) {
  asstOpen = false; if (location.hash !== "#ideas") location.hash = "ideas"; else render();
  setTimeout(() => {
    $("#f-title").value = x.title; $("#f-pitch").value = x.pitch;
    const sel = $("#f-cat"), cat = cleanCat(x.category || ""), known = allCats().find(c => c.toLowerCase() === cat.toLowerCase());
    if (known) { sel.value = known; $("#f-newcat").hidden = true; $("#f-newcat").required = false }
    else if (cat) { sel.value = NEW; $("#f-newcat").hidden = false; $("#f-newcat").required = true; $("#f-newcat").value = cat }
    if (x.client) $("#f-client").value = x.client;
    $("#compose").scrollIntoView({ behavior: "smooth", block: "start" }); toast("Check it, change anything, then tap Add to the vote", 3500);
  }, 60);
}
function askAboutIdea(i) {
  asstOpen = true; alertsOpen = false; asstTplOpen = false;
  runAssistant(`Make “${i.title}” stronger`, { prompt: `Help make this idea from our vote stronger and more creative.\nIdea: ${i.title}${i.client ? " (client: " + i.client + ")" : ""}\n${i.pitch || ""}\nGive: 1) the sharpest version of it in two sentences, 2) who exactly pays and how much in EGP, 3) a first small version we could build in 2 weeks, 4) two bold twists that would make it stand out. Then give 2 improved versions as ideas.\n${IDEA_FORMAT}` });
}
function currentProject() { const r = route(); return r.view === "project" ? ideas.find(i => i.id === r.id) : null }

/* ----- assistant templates ----- */
// need: "project" = open a project first, "plan" = you plan that project. fill = put text in the box for you to finish.
const ASST_TEMPLATES = [
  { g: "Daily", id: "morning", icon: "☀", label: "Morning brief", prompt: "Give me my morning brief for today. Start with a one-line greeting. Then, in short sections: 1) Today's focus: the 3 tasks I should do today and why, 2) Overdue or due in the next 3 days, 3) What the team finished since yesterday, 4) Anything waiting on me (ideas I haven't voted on, late client payments I should chase, subscriptions due soon). End with one short motivating line. Keep it under 180 words." },
  { g: "Daily", id: "next", icon: "→", label: "What should I do next?", prompt: "Pick the one task I should do next and say why in one or two lines, then list the next two after it." },
  { g: "Daily", id: "status", icon: "◷", label: "My status", prompt: "Give me a short status update: what I finished recently, what I'm working on, what's overdue, and what's due soon. Group by project." },
  { g: "Daily", id: "eod", icon: "☾", label: "End-of-day wrap-up", prompt: "Wrap up my day: what I finished today, what's still open, and the first thing I should start tomorrow. Under 100 words." },
  { g: "Daily", id: "week", icon: "▦", label: "Plan my week", prompt: "Plan my week day by day (7 days from today) using my open tasks, due dates and priorities. Keep each day light (2 or 3 tasks), friends have school or jobs. Put overdue things first." },
  { g: "Team", id: "teamweek", icon: "◎", label: "Team weekly recap", prompt: "Write a weekly recap for the whole team: what we finished this week per project, who did great work (name them), what's late or stuck, and the focus for next week. Friendly, under 200 words, ready to post in our chat." },
  { g: "Team", id: "load", icon: "⚖", label: "Who's overloaded?", prompt: "Look at everyone's open tasks and due dates across the projects being built. Who has too much, who has room, and which 2 or 3 tasks should move to someone else (name who and why, based on strengths)." },
  { g: "Team", id: "stuck", icon: "!", label: "What's stuck?", prompt: "List everything that's stuck: overdue tasks, tasks with nobody on them, blockers from check-ins. For each, suggest one concrete way to unstick it." },
  { g: "Team", id: "post", icon: "✎", label: "Write a chat message", fill: "Write a short message for our team chat about: " },
  { g: "Project", id: "sum", icon: "▤", label: "Sum up this project", need: "project", prompt: p => `Summarize "${p.title}": how far along it is, what's going well, what's stuck or overdue, and the next 3 most important steps.` },
  { g: "Project", id: "plan", icon: "✦", label: p => getPhases(p).length ? "Suggest more tasks" : "Plan this project", need: "plan", prompt: p => getPhases(p).length
    ? `Suggest the missing tasks for "${p.title}" so the plan reaches the finish line. Use existing phase names where they fit. Don't repeat tasks already on the board.`
    : `Make a complete step-by-step plan for "${p.title}" from start to launch: 4 to 6 phases, 3 to 6 tasks each, with who does what, due dates and priorities.` },
  { g: "Project", id: "risks", icon: "△", label: "Risks and deadlines", need: "project", prompt: p => `For "${p.title}": will we hit the phase deadlines? List the biggest risks (late tasks, missing skills, too much on one person) and what to do about each.` },
  { g: "Project", id: "agenda", icon: "☰", label: "Meeting agenda", need: "project", prompt: p => `Write a 20-minute meeting agenda for "${p.title}": quick wins to celebrate, decisions we need to make, blockers to solve, and who owns what next. Short bullet lines.` },
  { g: "Project", id: "checkin", icon: "✓", label: "Draft my weekly check-in", need: "team", checkin: true },
  { g: "Project", id: "update", icon: "✉", label: "Client update message", need: "project", prompt: p => `Write a short, professional WhatsApp message to the client of "${p.title}"${(p.money || {}).client ? " (" + p.money.client + ")" : ""} telling them what we finished and what's next, based on the board. No internal names or money details. Under 80 words.` },
  { g: "Ideas", id: "brain", icon: "✺", label: "Brainstorm new ideas", prompt: () => `Brainstorm 5 fresh project ideas our team could build and sell in Egypt. ${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "field", icon: "◈", label: "Ideas in a field…", fill: "Brainstorm 5 fresh ideas in this field: ", wrap: v => `${v}\n${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "forclient", icon: "◉", label: "Ideas for a client…", fill: "Brainstorm 5 ideas we could pitch to this client (things they'd actually pay for): ", wrap: v => `${v}\nThink about their customers, what they lose money or time on, and what their competitors don't do yet. ${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "problems", icon: "⌁", label: "Problems people pay to fix", prompt: () => `List 5 everyday problems that people or small businesses in Egypt would happily pay to fix (things that waste their time or money). Turn each problem into a project idea for our team. ${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "remix", icon: "⟲", label: "Remix our ideas", prompt: () => `Take the ideas already in our vote and remix them: combine two into something better, push one to be 10 times bolder, or shrink one into a version we could sell next week. Give 4 new ideas and say which ideas each came from. ${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "trend", icon: "↗", label: "What's trending we could use", prompt: () => `Think about trends young people and small businesses in Egypt care about right now (social media habits, AI tools, payments, delivery, content, side hustles). Give 5 ideas that ride one of those trends. If you're not sure something is current, say so. ${CREATIVE}\n${IDEA_FORMAT}` },
  { g: "Ideas", id: "pitch", icon: "✧", label: "Make my idea stronger", fill: "Make this idea stronger: who it's for, how it makes money, and a first small version we could build in 2 weeks. The idea: " },
  { g: "Ideas", id: "test", icon: "⚑", label: "Stress-test an idea", fill: "Be a tough but fair investor. Poke the 5 biggest holes in this idea and how we could fix each one, then give it a score out of 10: " },
  { g: "Ideas", id: "rank", icon: "★", label: "Rank our ideas", prompt: "Rank the ideas in the vote from best to worst for our team right now: how fast we could build it, if it can make money, and if we have the skills. One line of reasoning each. Then say which ones I haven't voted on." },
  { g: "Money", id: "money", icon: "£", label: "Money brief", prompt: "Give me a money brief: what I'm owed, the team fund and how close we are to our goals, late client payments (and how late), and subscriptions due soon. Then one practical tip. Use EGP." },
  { g: "Money", id: "chase", icon: "⏰", label: "Chase a late payment", prompt: "For each late client payment, write a short, polite but firm WhatsApp reminder I can send to the client. Mention the amount and month, no threats. If nothing is late, say so." },
  { g: "Money", id: "price", icon: "≈", label: "How much should we charge?", fill: "Help us price this work for a client in Egypt (give a low, fair and high price in EGP and why): " },
];
const tplLabel = (t, p) => typeof t.label === "function" ? t.label(p) : t.label;
let asstTplOpen = false, tplForm = null, pendingWrap = null;
// How the assistant hands over ideas, so each one gets a "Use this idea" button.
const IDEA_FORMAT = `Write each idea on ONE line in exactly this format so we can add it to our vote:
IDEA: <short catchy name> | <category, like Web, App, Marketing, Content, Design, Business or Event> | <2 or 3 sentences: what it is, who it's for, why now> | <who pays and a rough price in EGP>
Before the ideas, one short line. After them, one line saying which idea you'd start with and why.`;
const CREATIVE = `Be genuinely creative: avoid the obvious ideas everyone has (generic e-commerce stores, to-do apps, food delivery). Use idea tricks: combine two things that don't usually go together, flip a normal habit, take something that works abroad and give it a smart local Egyptian twist, serve a niche nobody serves, or turn a daily annoyance into a product. Mix 2 quick wins (buildable in 2 weeks with little money) with 1 or 2 bold bets. Each idea must be different from the others and from the ideas already on our board. Fit our team's strengths.`;
function availableTemplates(p) {
  const planner = p && canPlan(p), onTeam = p && (teamOf(p).includes(me) || canPlan(p)), live = p && p.status !== "completed";
  return ASST_TEMPLATES.filter(t => !t.need || (t.need === "project" && p) || (t.need === "plan" && planner && live) || (t.need === "team" && onTeam && live));
}
function myTemplates() { return Object.entries((people[me] || {}).asstTemplates || {}).filter(([, v]) => v && v.name).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0)) }
function useTemplate(t, p) {
  asstTplOpen = false;
  if (t.fill) { pendingWrap = t.wrap || null; render(); const i = document.getElementById("asst-input"); if (i) { i.value = t.fill; i.focus(); i.setSelectionRange(i.value.length, i.value.length) } return }
  if (t.checkin) return runAssistant(tplLabel(t, p), { checkin: true, prompt: `Draft MY weekly check-in for "${p.title}" based only on the board (tasks I finished or started this week, what's next for me, anything overdue or blocked). Reply with ONLY JSON like {"did":"...","next":"...","blockers":""}. Write in first person, short and plain.` });
  runAssistant(tplLabel(t, p), { prompt: typeof t.prompt === "function" ? t.prompt(p) : t.prompt });
}
function templateList(p) {
  const wrap = el("div", { class: "tpl-list" });
  const groups = {};
  for (const t of availableTemplates(p)) (groups[t.g] || (groups[t.g] = [])).push(t);
  for (const [g, list] of Object.entries(groups)) wrap.append(el("div", { class: "tpl-g" }, g), el("div", { class: "tpl-grid" },
    list.map(t => el("button", { class: "tpl", onclick: () => useTemplate(t, p) }, el("span", { class: "tpl-ico" }, t.icon), el("span", {}, tplLabel(t, p))))));
  // your own templates
  const mine = myTemplates();
  wrap.append(el("div", { class: "tpl-g" }, "Mine"));
  const grid = el("div", { class: "tpl-grid" }, mine.map(t => el("div", { class: "tpl mine" },
    el("button", { class: "tpl-use", onclick: () => useTemplate({ label: t.name, prompt: t.prompt }, p) }, el("span", { class: "tpl-ico" }, "◆"), el("span", {}, t.name)),
    el("button", { class: "x", "aria-label": "Delete template " + t.name, onclick: () => write(() => setDoc(doc(db, "users", me), { asstTemplates: { [t.id]: DEL() } }, { merge: true }), "Template deleted") }, "✕"))));
  if (tplForm) {
    const n = el("input", { id: "tpl-name", class: "mini", maxlength: "40", placeholder: "Name, like “Sunday plan”", value: tplForm.name || "" });
    const q = el("textarea", { id: "tpl-prompt", class: "noteinput", rows: "3", maxlength: "1200", placeholder: "What should the assistant do? Like: every Sunday, plan my week and tell me which client to call." }, tplForm.prompt || "");
    grid.append(el("div", { class: "tpl-form" }, n, q, el("div", { class: "row", style: "gap:6px" },
      el("button", { class: "btn quiet small", onclick: () => { tplForm = null; render() } }, "Cancel"),
      el("button", { class: "btn primary small", onclick: () => {
        const name = n.value.trim(), prompt = q.value.trim(); if (!name || !prompt) { toast("Give it a name and say what it should do"); return }
        const id = uid(); tplForm = null;
        people[me] = { ...(people[me] || {}), asstTemplates: { ...((people[me] || {}).asstTemplates || {}), [id]: { name, prompt, at: Date.now() } } }; render();
        write(() => setDoc(doc(db, "users", me), { asstTemplates: { [id]: { name, prompt, at: Date.now() } } }, { merge: true }), "Template saved");
      } }, "Save template"))));
  } else grid.append(el("button", { class: "tpl add", onclick: () => { tplForm = {}; render() } }, el("span", { class: "tpl-ico" }, "+"), el("span", {}, "Make your own")));
  wrap.append(grid);
  return wrap;
}

function renderAssistant() {
  const panel = $("#asst"); panel.hidden = !asstOpen; if (!asstOpen) return;
  panel.replaceChildren();
  const p = currentProject(), planner = p && canPlan(p);
  const av_ = availableTemplates(p), pick = id => av_.find(t => t.id === id);
  const quick = (p ? ["sum", "plan", "checkin", "next"] : ["morning", "next", "teamweek"]).map(pick).filter(Boolean).slice(0, 3);

  panel.append(el("div", { class: "row asst-head" }, el("span", { class: "asst-ico" }, "✦"), el("h3", {}, "Assistant"), el("span", { class: "spacer" }),
    asstMsgs.length ? el("button", { class: "btn quiet small", onclick: () => { asstMsgs = []; render() } }, "Clear") : null,
    el("button", { class: "x", "aria-label": "Close assistant", onclick: () => { asstOpen = false; render() } }, "✕")));
  const log = el("div", { class: "asst-log", id: "asst-log" });
  if (!asstMsgs.length || asstTplOpen) log.append(el("p", { class: "asst-hint" }, p ? `Pick a template or ask about “${p.title}”.` : "Pick a template or ask anything. Open a project for project templates."));
  if (asstTplOpen || !asstMsgs.length) log.append(templateList(p));
  if (!asstMsgs.length) log.append(el("p", { class: "asst-hint small" }, "Powered by Google Gemini. It only suggests: nothing changes until you tap to add or save. Don't put secrets here."));
  if (!asstTplOpen) for (const m of asstMsgs) {
    const b = el("div", { class: "asst-msg " + (m.role === "me" ? "mine" : "ai") + (m.error ? " err" : "") }, m.text,
      m.detail ? el("div", { class: "asst-detail" }, "Details: " + m.detail) : null);
    log.append(b);
    if (m.ideas && m.ideas.length) log.append(el("div", { class: "idea-sugs" }, m.ideas.map(x => el("div", { class: "idea-sug" },
      el("div", { class: "row", style: "gap:6px" }, el("b", { style: "flex:1 1 auto;min-width:0" }, x.title), x.category ? el("span", { class: "catchip" }, x.category) : null),
      el("p", {}, x.pitch),
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: () => useIdea(x) }, "Use this idea"))))));
    if (m.plan && planner) log.append(el("div", { class: "row", style: "justify-content:flex-start;gap:8px" },
      el("button", { class: "btn primary small", onclick: () => { asstOpen = false; openImport(p, m.text) } }, "Preview and add to plan"),
      el("button", { class: "btn quiet small", onclick: async () => { try { await navigator.clipboard.writeText(m.text); toast("Copied") } catch { toast("Couldn't copy") } } }, "Copy")));
  }
  if (asstBusy) log.append(el("div", { class: "asst-msg ai typing" }, "Thinking…"));
  panel.append(log);
  if (!asstBusy && asstMsgs.length) panel.append(el("div", { class: "asst-chips" },
    asstTplOpen ? null : quick.map(t => el("button", { class: "pchip", onclick: () => useTemplate(t, p) }, tplLabel(t, p))),
    el("button", { class: "pchip", "aria-pressed": String(asstTplOpen), onclick: () => { asstTplOpen = !asstTplOpen; render() } }, asstTplOpen ? "Back to chat" : "All templates")));
  const inp = el("textarea", { id: "asst-input", class: "noteinput", rows: "1", maxlength: "1500", placeholder: "Ask anything about the board…" });
  const send = () => { const v = inp.value.trim(); if (!v || asstBusy) return; inp.value = ""; const w = pendingWrap; pendingWrap = null; runAssistant(v, w ? { prompt: w(v) } : {}) };
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } });
  panel.append(el("div", { class: "chatform" }, inp, el("button", { class: "btn primary", disabled: asstBusy, onclick: send }, "Ask")));
  if (!asstTplOpen && asstMsgs.length) log.scrollTop = log.scrollHeight;
}

/* ----- new versions: tell people when the site has been updated ----- */

let updateShown = false;
async function checkForUpdate() {
  if (updateShown || typeof BUILD_ID === "undefined") return;
  try {
    const html = await (await fetch(location.pathname + "?check=" + Date.now(), { cache: "no-store" })).text();
    const m = html.match(/<meta name="build" content="(\d+)"/);
    if (m && m[1] > BUILD_ID) {
      updateShown = true;
      document.body.append(el("button", { class: "update-bar", onclick: () => location.replace(location.pathname + "?v=" + m[1] + location.hash) }, "New version available \u00b7 tap to update"));
    }
  } catch { }
}
setTimeout(checkForUpdate, 4000);
setInterval(checkForUpdate, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate() });

/* ----- money: each project's Money tab ----- */

let moneyRules = null, fundDoc = null;       // meta/money and meta/fund

/* ----- what's new: tell members about new things (they can turn it off) ----- */
// Built-in notes for new features, newest first. The admin can also post team updates (saved in meta/news).
const WHATS_NEW = [
  { id: "f-look-2", date: "2026-11-10", icon: "🗺️", title: "A new look",
    text: "Plain grey with deep teal buttons, and a faint contour map in the background that lights up as a slow prism scan passes. You can switch the animation off in Me › Settings › Look.", go: "settings" },
  { id: "f-partners-1", date: "2026-11-09", icon: "🌍", title: "Partners",
    text: "A new Partners tab for the people abroad who find clients. Make a group per country, add their Google emails, paste numbers from a sheet, and read their call updates. They only see their own group, never our ideas, projects, chat or money.", go: "partners" },
  { id: "f-dm-1", date: "2026-11-06", icon: "🔒", title: "Private messages",
    text: "Open Chat and tap someone's name at the top to message them privately. Only you two can see it.", go: "chat" },
  { id: "f-ideas-1", date: "2026-11-06", icon: "✺", title: "Get help with ideas",
    text: "Tap ✦ Help me think when pitching, or ✦ Make it stronger on any idea. The assistant brainstorms fresh ideas, and each one has a Use this idea button. You can also add a client, brand or company to an idea (optional).", go: "ideas" },
  { id: "f-templates-1", date: "2026-11-06", icon: "☀", title: "Assistant templates and Morning brief",
    text: "Open ✦ for ready-made templates: Morning brief, End-of-day wrap-up, Plan my week, Team recap, Money brief and more. You can save your own templates too.", go: "me", open: "asst" },
  { id: "f-money-1", date: "2026-11-05", icon: "£", title: "Money: deals, splits and the team fund",
    text: "Every project can track its price, payments and who gets what. The Money page shows what you're owed, the team fund and our money rules. Read them and tap I agree.", go: "money" },
  { id: "f-look-1", date: "2026-11-04", icon: "◐", title: "Light and dark mode, and your own settings",
    text: "Pick light or dark, turn the shooting stars on or off, set your name and photo, and turn on alerts. It's all in Settings.", go: "settings" },
];
let newsDoc = null, newsForm = null, newsIdx = 0;
function allNews() {
  const posted = Object.entries((newsDoc || {}).items || {}).filter(([, v]) => v && v.title).map(([id, v]) => ({ id: "post-" + id, pid: id, date: ymd(new Date(v.at || Date.now())), icon: "✉", title: v.title, text: v.text || "", by: v.by, at: v.at }));
  return [...posted, ...WHATS_NEW].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
}
const newsOff = () => !!(people[me] || {}).newsOff;
const newsSeen = () => (people[me] || {}).newsSeen || {};
// only the latest few count as "new", so someone joining later isn't buried
const unseenNews = () => newsOff() ? [] : allNews().slice(0, 6).filter(n => !newsSeen()[n.id] && !(n.by && n.by === me));
function markNews(ids) {
  const add = Object.fromEntries(ids.map(id => [id, true]));
  people[me] = { ...(people[me] || {}), newsSeen: { ...newsSeen(), ...add } }; render();
  write(() => setDoc(doc(db, "users", me), { newsSeen: add }, { merge: true }));
}
function setNewsOff(off) {
  people[me] = { ...(people[me] || {}), newsOff: off }; render();
  write(() => setDoc(doc(db, "users", me), { newsOff: off }, { merge: true }), off ? "OK, no more news about new things. You can turn it back on in Settings" : "You'll hear about new things");
}
function showNews(n) {
  markNews([n.id]);
  if (n.go && location.hash !== "#" + n.go) location.hash = n.go;
  if (n.open === "asst") { asstOpen = true; alertsOpen = false; asstTplOpen = !!asstMsgs.length; }
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
}
function newsCard() {
  const list = unseenNews(); if (!list.length) return null;
  if (newsIdx >= list.length) newsIdx = 0;
  const n = list[newsIdx];
  return el("section", { class: "newscard" },
    el("div", { class: "row", style: "gap:8px" }, el("span", { class: "news-ico" }, n.icon || "✦"), el("span", { class: "now-label", style: "flex:1 1 auto" }, n.by ? "Update from " + firstName(n.by) : "New in Pitch Room"),
      list.length > 1 ? el("span", { class: "label" }, `${newsIdx + 1} of ${list.length}`) : null),
    el("h3", {}, n.title), n.text ? el("p", {}, n.text) : null,
    el("div", { class: "row", style: "gap:6px" },
      el("button", { class: "linkbtn", onclick: () => setNewsOff(true) }, "Stop telling me"), el("span", { class: "spacer" }),
      list.length > 1 ? el("button", { class: "btn quiet small", onclick: () => { markNews(list.map(x => x.id)); toast("All caught up") } }, "Got all") : null,
      el("button", { class: "btn small", onclick: () => markNews([n.id]) }, "Got it"),
      n.go ? el("button", { class: "btn primary small", onclick: () => showNews(n) }, "Show me") : null));
}
function newsSettings() {
  const off = newsOff(), sec = el("section", { class: "idea", id: "news" }, el("h3", {}, "What's new"),
    el("div", { class: "row" }, el("span", { style: "flex:1 1 200px" }, "Tell me about new things on the site"),
      el("div", { class: "seg seg-sm", role: "group", "aria-label": "Tell me about new things" },
        el("button", { "aria-pressed": String(!off), onclick: () => setNewsOff(false) }, "On"),
        el("button", { "aria-pressed": String(off), onclick: () => setNewsOff(true) }, "Off"))));
  if (isAdmin) {
    if (newsForm) {
      const t = el("input", { id: "news-title", class: "noteinput", maxlength: "80", placeholder: "Title, like “Meeting Friday at 8”" });
      const x = el("textarea", { id: "news-text", class: "noteinput", rows: "3", maxlength: "600", placeholder: "What should everyone know?" });
      sec.append(el("div", { class: "mform" }, t, x, el("div", { class: "row", style: "gap:6px" }, el("span", { class: "spacer" }),
        el("button", { class: "btn quiet small", onclick: () => { newsForm = null; render() } }, "Cancel"),
        el("button", { class: "btn primary small", onclick: () => {
          const title = t.value.trim(), text = x.value.trim(); if (!title) { toast("Give it a title"); return }
          newsForm = null; const id = uid();
          write(() => setDoc(doc(db, "meta", "news"), { items: { [id]: { title, text, by: me, at: Date.now() } } }, { merge: true }), "Posted. Everyone will see it on their Me page and in alerts");
        } }, "Post to everyone"))));
    } else sec.append(el("div", { class: "row" }, el("span", { class: "label", style: "flex:1 1 200px" }, "Post an update for the whole team. It shows on everyone's Me page and bell."),
      el("button", { class: "btn small", onclick: () => { newsForm = {}; render() } }, "+ Post an update")));
  }
  const seen = newsSeen();
  sec.append(el("div", { class: "newslist" }, allNews().slice(0, 12).map(n => el("div", { class: "newsrow" },
    el("span", { class: "news-ico" }, n.icon || "✦"),
    el("div", { style: "flex:1 1 auto;min-width:0" }, el("b", {}, n.title, !seen[n.id] && !off && n.by !== me ? el("span", { class: "newdot" }, " New") : null), el("div", { class: "label" }, fmtDate(n.date) + (n.by ? " · " + firstName(n.by) : ""))),
    n.go ? el("button", { class: "btn quiet small", onclick: () => showNews(n) }, "Show me") : null,
    n.pid && isAdmin ? el("button", { class: "x", "aria-label": "Delete update", onclick: () => write(() => setDoc(doc(db, "meta", "news"), { items: { [n.pid]: DEL() } }, { merge: true }), "Update deleted") }, "✕") : null))));
  return sec;
}
const rulesNow = () => ({ ...MONEY_DEFAULTS, ...(moneyRules || {}) });
const fmtEGP = p => { const v = (p || 0) / 100; return (Math.round(v) === v ? v.toLocaleString("en") : v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " EGP" };
const fmtN = p => fmtEGP(p).replace(" EGP", "");
const thisMonth = () => todayStr().slice(0, 7);
const monthLabel = ym => { if (!ym) return ""; const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }) };
const DEAL_TYPES = [["one", "One-time"], ["monthly", "Monthly"], ["installments", "Paid over months"]];
const STAGES = [["proposal", "Proposal sent"], ["agreed", "Deal agreed"], ["ended", "Ended"]];
const METHODS = ["Cash", "InstaPay", "Vodafone Cash", "Bank transfer", "Other"];
let editDeal = null, moneyForm = null, delMoney = null, shareMonth = null;
const moneyOf = p => computeMoney(p, todayStr(), rulesNow());
const canMoney = p => canPlan(p);

function moneyStatus(p, r) {
  const m = p.money || {};
  if (m.stage === "proposal") return ["Proposal sent", "label"];
  if (m.stage === "ended") return ["Ended", "label"];
  if (r.monthsUnpaid >= rulesNow().pauseAfterLate) return [`${r.monthsUnpaid} months unpaid`, "late"];
  if (r.late.length) return ["Payment late", "late"];
  if (m.type === "one") return r.received >= r.expected && r.expected ? ["Fully paid", "paid"] : r.received ? ["Deposit received", "due"] : ["Waiting for deposit", "due"];
  if (m.type === "installments") return r.received >= r.expected ? ["Fully paid", "paid"] : ["Being paid", "due"];
  return ["Active", "paid"];
}

function renderMoney(box, p) {
  const m = p.money, can = canMoney(p);
  if (!m || editDeal === p.id) {
    if (!can) { box.append(el("div", { class: "empty" }, "No deal set up yet. The project's planners add the money details here.")); return }
    box.append(dealForm(p)); return;
  }
  const r = moneyOf(p), [st, stCls] = moneyStatus(p, r);
  const typeName = (DEAL_TYPES.find(x => x[0] === m.type) || DEAL_TYPES[0])[1];

  /* summary */
  const sum = el("section", { class: "idea money-sum" },
    el("div", { class: "row", style: "gap:6px" }, el("span", { class: "chip" }, typeName), el("span", { class: "mstat " + stCls }, st), m.client ? el("span", { class: "label" }, "Client: " + m.client) : null,
      el("span", { class: "spacer" }), can ? el("button", { class: "btn small", onclick: () => { editDeal = p.id; render() } }, "Edit deal") : null));
  if (m.type === "monthly") {
    sum.append(el("div", { class: "bignum" }, fmtEGP(toP(m.monthlyFee)), el("span", {}, " / month")),
      el("div", { class: "label" }, [toP(m.setupFee) ? "Setup fee " + fmtEGP(toP(m.setupFee)) : null, "since " + monthLabel(m.startMonth), m.endMonth ? "until " + monthLabel(m.endMonth) : "ongoing", "due by day " + (m.dueDay || 5)].filter(Boolean).join(" · ")),
      el("div", { class: "label" }, "Received so far: " + fmtEGP(r.received)));
  } else {
    sum.append(el("div", { class: "bignum" }, fmtEGP(r.received), el("span", {}, " of " + fmtEGP(r.expected))),
      line({ total: 100, done: 0, pct: r.expected ? Math.min(100, Math.round(r.received / r.expected * 100)) : 0 }, "x"),
      el("div", { class: "label" }, r.received >= r.expected ? "Fully paid" : fmtEGP(r.expected - r.received) + " still to come"));
    sum.querySelectorAll(".pmeta").forEach(n => n.remove());
  }
  // schedule
  if (r.schedule.length > 1 || m.type !== "one") {
    const sch = el("div", { class: "schedule" });
    for (const s of r.schedule.slice(-8)) sch.append(el("div", { class: "sched " + s.status },
      el("span", { class: "sched-l" }, s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label),
      el("span", {}, s.status === "paid" ? "✓ " + fmtEGP(s.received) : s.received ? `${fmtEGP(s.received)} of ${fmtEGP(s.expected)}` : fmtEGP(s.expected)),
      el("span", { class: "sched-s" }, { paid: "Paid", late: "Late", due: "Due", upcoming: "Next" }[s.status]),
      can && m.type === "monthly" && s.label.match(/^\d{4}-\d{2}$/) ? el("button", { class: "linkbtn", onclick: () => { shareMonth = p.id + ":" + s.month; render() } }, "Who worked?") : null));
    sum.append(sch);
  }
  box.append(sum);
  if (shareMonth && shareMonth.startsWith(p.id + ":")) box.append(monthShareForm(p, shareMonth.split(":")[1]));

  /* warnings */
  const warn = [];
  if (r.monthsUnpaid >= rulesNow().pauseAfterLate) warn.push(`The client hasn't paid for ${r.monthsUnpaid} months. Our rule: pause the work until they pay.`);
  else if (r.late.length) warn.push(`Late: ${r.late.map(s => s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label).join(", ")}. Remind the client.`);
  if (r.proposal) warn.push("This is a proposal. Nothing is due or late until the client agrees. Change the stage to Deal agreed in Edit deal when they say yes.");
  if (r.costsUnpaid > 0 && !r.pending) warn.push(`${fmtEGP(r.costsUnpaid)} of costs still needs paying back. It comes out of the next payment.`);
  if (r.fundCover > 0) warn.push(`This deal cost more than it earned. The team fund covered ${fmtEGP(r.fundCover)}, so nobody is out of pocket.`);
  if (r.unassigned > 0) warn.push(`${fmtEGP(r.unassigned)} isn't assigned to anyone yet. Set the shares in Edit deal.`);
  if (warn.length) box.append(el("div", { class: "notice", style: "margin:0 0 12px" }, warn.map(w => el("div", {}, w))));

  /* actions */
  if (can) {
    const act = el("div", { class: "row", style: "gap:8px;margin-bottom:12px" },
      el("button", { class: "btn primary small", onclick: () => { moneyForm = { pid: p.id, kind: "pay" }; render() } }, "+ Payment"),
      el("button", { class: "btn small", onclick: () => { moneyForm = { pid: p.id, kind: "cost" }; render() } }, "+ Cost"),
      m.adBudget ? el("button", { class: "btn small", onclick: () => { moneyForm = { pid: p.id, kind: "ads" }; render() } }, "+ Ad money") : null);
    box.append(act);
    if (moneyForm && moneyForm.pid === p.id) box.append(moneyEntryForm(p, r));
  }

  /* who gets what */
  const split = el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "Who gets what"), el("span", { class: "spacer" }),
    el("span", { class: "label" }, `Team fund ${r.fundPct}%` + (r.finderTeam ? ` \u00b7 finder ${r.findPct}% to the team fund` : r.finders.length ? ` \u00b7 finder ${r.findPct}% to ${r.finders.map(firstName).join(" & ")}` : ""))));
  if (r.pending) {
    split.append(el("p", { style: "margin:0;font-size:14px" }, "Split happens when the client has fully paid. If nothing else is spent, it will be:"));
    const pv = r.preview;
    for (const [u, v] of Object.entries(pv.people).sort((a, b) => b[1].earned - a[1].earned)) split.append(el("div", { class: "mrow" }, av(u), el("span", { class: "mname" }, name(u)), el("span", { class: "mval" }, fmtEGP(v.earned))));
    split.append(el("div", { class: "mrow fundrow" }, el("span", { class: "mname" }, "Team fund"), el("span", { class: "mval" }, fmtEGP(pv.fund))));
    if (r.held) split.append(el("p", { class: "label", style: "margin:4px 0 0" }, `${fmtEGP(r.held)} received and waiting to be split.`));
  }
  const people = Object.entries(r.people).filter(([, v]) => v.earned || v.back || v.paid).sort((a, b) => b[1].balance - a[1].balance);
  if (people.length) {
    if (r.pending) split.append(el("div", { class: "tlabel", style: "margin-top:8px" }, "So far"));
    split.append(el("div", { class: "mhead" }, el("span", {}, "In EGP"), el("span", {}, "Earned"), el("span", {}, "Paid to them"), el("span", {}, "Owed")));
    for (const [u, v] of people) split.append(el("div", { class: "mrow4" },
      el("span", { class: "by" }, av(u), el("span", { class: "mname" }, name(u))),
      el("span", { class: "mval" }, fmtN(v.earned + v.back), v.back ? el("small", {}, ` incl. ${fmtN(v.back)} costs`) : null),
      el("span", { class: "mval" }, fmtN(v.paid)),
      el("span", { class: "mval owed" }, fmtN(v.balance), can && v.balance > 0 ? el("button", { class: "linkbtn", onclick: () => { moneyForm = { pid: p.id, kind: "payout", to: u, amount: v.balance / 100 }; render() } }, "Mark paid") : null)));
  }
  if (!r.pending) split.append(el("div", { class: "mrow fundrow" }, el("span", { class: "mname" }, "Team fund"), el("span", { class: "mval" }, fmtEGP(r.fund))));
  const shareTxt = Object.entries(m.shares || {}).filter(([, v]) => Number(v) > 0).map(([u, v]) => `${firstName(u)} ${v}%`).join(" · ");
  if (shareTxt) split.append(el("p", { class: "label", style: "margin:6px 0 0" }, (m.type === "monthly" ? "Setup shares: " : "Shares: ") + shareTxt));
  if (m.type === "monthly") { const ms = Object.entries(m.monthlyShares || m.shares || {}).filter(([, v]) => Number(v) > 0).map(([u, v]) => `${firstName(u)} ${v}%`).join(" · "); if (ms) split.append(el("p", { class: "label", style: "margin:2px 0 0" }, "Monthly shares: " + ms)) }
  box.append(split);

  /* ad money */
  if (m.adBudget || r.ads.in || r.ads.spent) box.append(el("section", { class: "idea", style: "margin-top:12px" },
    el("div", { class: "row" }, el("h3", {}, "Client's ad money"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Not our money, never split")),
    el("div", { class: "adgrid" },
      el("div", {}, el("b", {}, fmtEGP(r.ads.in)), el("span", {}, "received")),
      el("div", {}, el("b", {}, fmtEGP(r.ads.spent)), el("span", {}, "spent on ads")),
      el("div", { class: r.ads.held < 0 ? "late" : "" }, el("b", {}, fmtEGP(r.ads.held)), el("span", {}, r.ads.held < 0 ? "we paid extra" : "left to spend")))));

  /* history */
  const hist = [];
  for (const [id, x] of Object.entries(p.payments || {})) if (x) hist.push({ id, coll: "payments", date: x.date, at: x.at, sign: "+", amount: x.amount, text: `${{ deposit: "Deposit", setup: "Setup fee", monthly: "Monthly fee " + monthLabel(x.month), installment: "Installment" }[x.kind] || "Payment"}${x.method ? " · " + x.method : ""}${x.heldBy ? " · with " + firstName(x.heldBy) : ""}`, note: x.note });
  for (const [id, x] of Object.entries(p.costs || {})) if (x) hist.push({ id, coll: "costs", date: x.date, at: x.at, sign: "−", amount: x.amount, text: `Cost: ${x.what || "spent"}${x.paidBy ? " · paid by " + firstName(x.paidBy) : ""}`, note: x.note });
  for (const [id, x] of Object.entries(p.payouts || {})) if (x) hist.push({ id, coll: "payouts", date: x.date, at: x.at, sign: "→", amount: x.amount, text: `Paid to ${firstName(x.to)}${x.from ? " by " + firstName(x.from) : ""}`, note: x.note });
  for (const [id, x] of Object.entries(p.ads || {})) if (x) hist.push({ id, coll: "ads", date: x.date, at: x.at, sign: x.kind === "spent" ? "−" : "+", amount: x.amount, text: x.kind === "spent" ? "Ad money spent on ads" : "Ad money from client", note: x.note, ad: true });
  hist.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
  if (hist.length) box.append(el("details", { class: "removed", open: hist.length <= 6 }, el("summary", {}, `History (${hist.length})`),
    el("div", { class: "idea", style: "gap:0;margin-top:10px" }, hist.map(h => el("div", { class: "hrow" + (h.ad ? " ad" : "") },
      el("span", { class: "hsign" }, h.sign), el("div", { class: "hmain" }, el("div", {}, h.text), el("div", { class: "label" }, fmtDate(h.date) + (h.note ? " · " + h.note : ""))),
      el("span", { class: "hamt" }, fmtEGP(toP(h.amount))),
      can ? (delMoney === h.id ? el("button", { class: "linkdel sure", onclick: () => { delMoney = null; write(() => upd(p.id, { [h.coll + "." + h.id]: DEL() }), "Removed") } }, "Remove?")
        : el("button", { class: "linkdel", "aria-label": "Remove", onclick: () => { delMoney = h.id; render() } }, "✕")) : null)))));
}

function teamChoices(p) { return [...new Set([...teamOf(p), ...teamIds()])] }
function personSelect(id, value, p, blank) {
  const s = el("select", { class: "mini", id }, blank ? el("option", { value: "" }, blank) : null, teamChoices(p).map(u => el("option", { value: u }, realName(u) || "Someone")));
  s.value = value || ""; return s;
}
function moneyInput(id, value, ph) { const i = el("input", { id, class: "noteinput", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: ph || "0" }); if (value != null && value !== "" && !i.value) i.value = value; return i }
function fieldRow(label, ...kids) { return el("div", { class: "tfield" }, el("span", { class: "tlabel" }, label), el("div", { class: "tval" }, ...kids)) }

function moneyEntryForm(p, r) {
  const m = p.money, f = moneyForm, today = todayStr();
  const amount = moneyInput("mf-amount", f.amount != null ? f.amount : (f.kind === "pay" && m.type === "monthly" ? m.monthlyFee : ""), "Amount in EGP");
  const date = el("input", { id: "mf-date", type: "date", class: "mini", value: today });
  const note = el("input", { id: "mf-note", class: "noteinput", maxlength: "120", placeholder: "Note (optional)" });
  const box = el("section", { class: "idea mform" });
  const close = () => { moneyForm = null; render() };
  let kindSel, monthSel, method, held, what, paidBy, adKind, to, from;
  if (f.kind === "pay") {
    box.append(el("h3", {}, "Payment received"));
    const kinds = m.type === "monthly" ? [["monthly", "Monthly fee"], ["setup", "Setup fee"]] : m.type === "installments" ? [["installment", "Installment"]] : [["deposit", "Deposit"], ["payment", "Payment"]];
    kindSel = el("select", { class: "mini", id: "mf-kind" }, kinds.map(([v, l]) => el("option", { value: v }, l)));
    if (m.type === "one" && r.received > 0) kindSel.value = "payment";
    if (m.type === "monthly") {
      const unpaid = r.schedule.filter(s => s.month && s.label.match(/^\d{4}-\d{2}$/) && s.status !== "paid");
      const opts = [...new Set([...unpaid.map(s => s.month), thisMonth()])].sort();
      monthSel = el("select", { class: "mini", id: "mf-month" }, opts.map(x => el("option", { value: x }, monthLabel(x))));
      monthSel.value = unpaid.length ? unpaid[0].month : thisMonth();
      if (toP(m.setupFee) && !r.schedule.find(s => s.label === "Setup fee" && s.status === "paid") && !f.amount) { kindSel.value = "setup"; amount.value = m.setupFee }
      kindSel.addEventListener("change", () => { monthSel.parentElement.parentElement.hidden = kindSel.value !== "monthly"; amount.value = kindSel.value === "setup" ? m.setupFee || "" : m.monthlyFee || "" });
    }
    method = el("select", { class: "mini", id: "mf-method" }, METHODS.map(x => el("option", { value: x }, x)));
    held = personSelect("mf-held", me, p);
    box.append(fieldRow("Amount", amount), fieldRow("Type", kindSel), monthSel ? fieldRow("For month", monthSel) : null, fieldRow("Date", date), fieldRow("How", method), fieldRow("Who has it", held), note);
    if (monthSel && kindSel.value !== "monthly") monthSel.parentElement.parentElement.hidden = true;
  } else if (f.kind === "cost") {
    box.append(el("h3", {}, "Cost"));
    what = el("input", { id: "mf-what", class: "noteinput", maxlength: "80", placeholder: "What was it? e.g. camera rental" });
    paidBy = personSelect("mf-paidby", me, p);
    box.append(fieldRow("Amount", amount), fieldRow("For", what), fieldRow("Paid by", paidBy), fieldRow("Date", date), note,
      el("p", { class: "label", style: "margin:0" }, "Whoever paid gets it back first, from the next money that comes in."));
  } else if (f.kind === "ads") {
    box.append(el("h3", {}, "Client's ad money"));
    adKind = el("select", { class: "mini", id: "mf-adkind" }, el("option", { value: "in" }, "Received from the client"), el("option", { value: "spent" }, "Spent on ads"));
    box.append(fieldRow("Amount", amount), fieldRow("Type", adKind), fieldRow("Date", date), note);
  } else if (f.kind === "payout") {
    box.append(el("h3", {}, "Money handed over"));
    to = personSelect("mf-to", f.to, p); from = personSelect("mf-from", me, p, "Not recorded");
    box.append(fieldRow("To", to), fieldRow("Amount", amount), fieldRow("From", from), fieldRow("Date", date), note);
  }
  const save = () => {
    const a = Number(amount.value);
    if (!(a > 0)) { toast("Enter an amount bigger than 0"); amount.focus(); return }
    const base = { amount: Math.round(a * 100) / 100, date: date.value || today, note: note.value.trim(), by: me, at: Date.now() };
    let coll, data, ok;
    if (f.kind === "pay") { coll = "payments"; data = { ...base, kind: kindSel.value, method: method.value, heldBy: held.value || null }; if (kindSel.value === "monthly") data.month = monthSel.value; ok = "Payment added" }
    else if (f.kind === "cost") { coll = "costs"; data = { ...base, what: what.value.trim(), paidBy: paidBy.value || null }; ok = "Cost added" }
    else if (f.kind === "ads") { coll = "ads"; data = { ...base, kind: adKind.value }; ok = "Ad money added" }
    else { coll = "payouts"; data = { ...base, to: to.value, from: from.value || null }; ok = `Marked as paid to ${firstName(to.value)}` }
    moneyForm = null;
    write(() => upd(p.id, { [coll + "." + uid()]: data }), ok);
  };
  box.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("button", { class: "btn primary", onclick: save }, "Save")));
  setTimeout(() => { if (!amount.value) amount.focus() }, 0);
  return box;
}

// share editor: percentages that must add up to 100
function sharesEditor(prefix, p, current, suggestBtn) {
  const wrap = el("div", { class: "shares" });
  const ids = teamChoices(p);
  const inputs = {};
  const total = el("span", { class: "label" });
  const upd8 = () => { const t = ids.reduce((s, u) => s + (Number(inputs[u].value) || 0), 0); total.textContent = `Total ${t}%` + (t === 100 ? " ✓" : " (needs to be 100%)"); total.className = "label" + (t === 100 ? " ok" : " bad") };
  for (const u of ids) {
    const i = el("input", { id: `${prefix}-${u}`, class: "mini pct", type: "number", inputmode: "numeric", min: "0", max: "100", step: "1", oninput: upd8 });
    if (!i.value && current && current[u] != null) i.value = current[u];
    inputs[u] = i;
    wrap.append(el("label", { class: "share", for: i.id }, av(u), el("span", { class: "mname" }, realName(u) || "Someone"), i, "%"));
  }
  const tools = el("div", { class: "row", style: "gap:8px" }, total, el("span", { class: "spacer" }),
    suggestBtn ? el("button", { class: "btn small", type: "button", onclick: () => { const sg = suggestShares(tasksOf(p), t => assignees(t)); if (!Object.keys(sg).length) { toast("No one has tasks yet, so there's nothing to go on"); return } for (const u of ids) inputs[u].value = sg[u] || ""; upd8() } }, "Suggest from tasks") : null,
    el("button", { class: "btn small quiet", type: "button", onclick: () => { const who = ids.filter(u => Number(inputs[u].value) > 0); const list = who.length ? who : teamOf(p).length ? teamOf(p) : ids; const each = Math.floor(100 / list.length); ids.forEach(u => inputs[u].value = ""); list.forEach((u, k) => inputs[u].value = each + (k === 0 ? 100 - each * list.length : 0)); upd8() } }, "Split equally"));
  wrap.append(tools); upd8();
  wrap.read = () => { const out = {}; let t = 0; for (const u of ids) { const v = Math.round(Number(inputs[u].value) || 0); if (v > 0) { out[u] = v; t += v } } return { shares: out, total: t } };
  return wrap;
}

let dealTypeDraft = {};
function dealForm(p) {
  const m = p.money || {}, R = rulesNow();
  const type = dealTypeDraft[p.id] || m.type || "one";
  const box = el("section", { class: "idea mform" }, el("h3", {}, m.type ? "Edit the deal" : "Set up the deal"),
    el("p", { style: "margin:0;font-size:14px" }, "How the client pays, and how the money is shared. Everyone on the team can see this."));
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Deal type" }, DEAL_TYPES.map(([v, l]) => el("button", { type: "button", "aria-pressed": String(type === v), onclick: () => { dealTypeDraft[p.id] = v; render() } }, l))));
  box.append(el("p", { class: "label", style: "margin:0" }, { one: "One price, usually a deposit first and the rest at the end. Split when fully paid.", monthly: "A fee every month (like running Google Ads), plus an optional setup fee. Split every month.", installments: "One total price paid in equal monthly payments. Split as each payment arrives." }[type]));
  const client = el("input", { id: "deal-client", class: "noteinput", maxlength: "80", placeholder: "Client name (optional)" }); if (!client.value) client.value = m.client || p.client || "";
  const stage = el("select", { class: "mini", id: "deal-stage" }, STAGES.map(([v, l]) => el("option", { value: v }, l))); stage.value = m.stage || "agreed";
  box.append(fieldRow("Client", client), fieldRow("Stage", stage));
  const price = moneyInput("deal-price", m.price, "Total price in EGP");
  const fee = moneyInput("deal-fee", m.monthlyFee, "Monthly fee in EGP"), setup = moneyInput("deal-setup", m.setupFee, "Setup fee (optional)");
  const months = el("input", { id: "deal-n", class: "mini", type: "number", min: "2", max: "36", step: "1", value: m.installments || 3 });
  const start = el("input", { id: "deal-start", class: "mini", type: "month", value: m.startMonth || thisMonth() });
  const end = el("input", { id: "deal-end", class: "mini", type: "month", value: m.endMonth || "" });
  const dueDay = el("input", { id: "deal-due", class: "mini", type: "number", min: "1", max: "28", step: "1", value: m.dueDay || 5 });
  const ads = el("input", { id: "deal-ads", type: "checkbox", checked: !!m.adBudget });
  if (type === "one") box.append(fieldRow("Price", price));
  if (type === "installments") box.append(fieldRow("Total price", price), fieldRow("Number of months", months), fieldRow("First payment", start), fieldRow("Due by day", dueDay));
  if (type === "monthly") box.append(fieldRow("Monthly fee", fee), fieldRow("Setup fee", setup), fieldRow("Starts", start), fieldRow("Ends", end, el("span", { class: "label" }, "leave empty if ongoing")), fieldRow("Due by day", dueDay),
    el("label", { class: "row", style: "gap:8px;font-size:14px" }, ads, "The client also pays their ad budget through us (tracked separately, never split)"));

  box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, type === "monthly" ? "Who built it (setup fee shares)" : "Who gets what (shares)"));
  const shares = sharesEditor("sh-" + p.id, p, m.shares, true); box.append(shares);
  let mshares = null;
  if (type === "monthly") { box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "Who runs it each month (monthly fee shares)")); mshares = sharesEditor("msh-" + p.id, p, m.monthlyShares || m.shares, false); box.append(mshares, el("p", { class: "label", style: "margin:0" }, "You can change this for a single month later with “Who worked?”.")) }

  const curFinders = new Set(m.finderTeam ? [] : (Array.isArray(m.finders) ? m.finders : (m.finder ? [m.finder] : [])));
  const fMode = el("select", { class: "mini", id: "deal-fmode" }, el("option", { value: "people" }, "These people"), el("option", { value: "team" }, "The team in general (fee goes to the fund)"), el("option", { value: "none" }, "Nobody"));
  fMode.value = m.finderTeam ? "team" : curFinders.size ? "people" : (m.type ? "none" : "people");
  const fBoxes = el("div", { class: "finders" }, teamChoices(p).map(u => el("label", { class: "share" }, el("input", { type: "checkbox", id: "deal-f-" + u, value: u, checked: curFinders.has(u) }), av(u), el("span", { class: "mname" }, realName(u) || "Someone"))));
  const syncF = () => { fBoxes.hidden = fMode.value !== "people" }; fMode.addEventListener("change", syncF); syncF();
  box.append(fieldRow("Who brought the client?", fMode), fBoxes,
    el("p", { class: "label", style: "margin:0" }, `Finder's fee ${m.findCustom && m.findPct != null ? m.findPct : R.findPct}%` + (type === "monthly" ? ` on the setup fee and first ${R.finderMonths} months` : "") + ". If several people brought it in, they share it equally."));
  let fundIn = null, findIn = null;
  if (isAdmin) { fundIn = el("input", { id: "deal-fundpct", class: "mini pct", type: "number", min: "0", max: "80", step: "1", value: m.fundCustom && m.fundPct != null ? m.fundPct : R.fundPct }); findIn = el("input", { id: "deal-findpct", class: "mini pct", type: "number", min: "0", max: "30", step: "1", value: m.findCustom && m.findPct != null ? m.findPct : R.findPct });
    box.append(fieldRow("Team fund %", fundIn, el("span", { class: "label" }, "team rule: " + R.fundPct + "%")), fieldRow("Finder %", findIn, el("span", { class: "label" }, "team rule: " + R.findPct + "%"))) }
  else box.append(el("p", { class: "label", style: "margin:0" }, `Team fund ${m.fundCustom && m.fundPct != null ? m.fundPct : R.fundPct}% \u00b7 finder ${m.findCustom && m.findPct != null ? m.findPct : R.findPct}% (set by ${ADMIN_NAME})`));

  const save = () => {
    // a proposal can be saved before the shares are agreed; a real deal needs them to add up to 100%
    const prop = stage.value === "proposal";
    const s = shares.read(); if (s.total !== 100 && !(prop && s.total === 0)) { toast(prop ? "The shares need to add up to 100%, or leave them all empty for now" : "The shares need to add up to 100%"); return }
    let ms = null; if (mshares) { ms = mshares.read(); if (ms.total !== 100 && !(prop && ms.total === 0)) { toast("The monthly shares need to add up to 100%"); return } }
    const n = x => Math.round((Number(x.value) || 0) * 100) / 100;
    const finders = fMode.value === "people" ? [...fBoxes.querySelectorAll("input:checked")].map(i => i.value) : [];
    if (fMode.value === "people" && !finders.length) { toast("Tick who brought the client, or choose Nobody"); return }
    // a deal only keeps its own % if the admin set one different from the team rule
    const fundV = fundIn ? Number(fundIn.value) : null, findV = findIn ? Number(findIn.value) : null;
    const data = { type, client: client.value.trim(), stage: stage.value, shares: s.shares, finder: null, finders, finderTeam: fMode.value === "team",
      fundCustom: fundIn ? fundV !== R.fundPct : !!m.fundCustom, fundPct: fundIn ? fundV : (m.fundPct != null ? m.fundPct : null),
      findCustom: findIn ? findV !== R.findPct : !!m.findCustom, findPct: findIn ? findV : (m.findPct != null ? m.findPct : null),
      monthShares: m.monthShares || {}, setAt: m.setAt || Date.now(), setBy: m.setBy || me, editedAt: Date.now() };
    if (type === "one") { if (!(n(price) > 0)) { toast("Enter the price"); return } data.price = n(price) }
    if (type === "installments") { if (!(n(price) > 0)) { toast("Enter the total price"); return } Object.assign(data, { price: n(price), installments: Math.max(2, Math.round(Number(months.value) || 3)), startMonth: start.value || thisMonth(), dueDay: Math.min(28, Math.max(1, Number(dueDay.value) || 5)) }) }
    if (type === "monthly") { if (!(n(fee) > 0)) { toast("Enter the monthly fee"); return } Object.assign(data, { monthlyFee: n(fee), setupFee: n(setup), startMonth: start.value || thisMonth(), endMonth: end.value || (stage.value === "ended" ? thisMonth() : ""), dueDay: Math.min(28, Math.max(1, Number(dueDay.value) || 5)), adBudget: ads.checked, monthlyShares: ms.shares }) }
    editDeal = null; delete dealTypeDraft[p.id];
    write(() => upd(p.id, { money: data }), "Deal saved");
  };
  box.append(el("div", { class: "row" }, el("span", { class: "spacer" }),
    p.money ? el("button", { class: "btn quiet", onclick: () => { editDeal = null; delete dealTypeDraft[p.id]; render() } }, "Cancel") : null,
    el("button", { class: "btn primary", onclick: save }, "Save deal")));
  return box;
}

function monthShareForm(p, month) {
  const m = p.money, cur = (m.monthShares || {})[month] || m.monthlyShares || m.shares;
  const ed = sharesEditor(`ms-${p.id}-${month}`, p, cur, false);
  return el("section", { class: "idea mform" }, el("h3", {}, `Who worked in ${monthLabel(month)}?`), ed,
    el("div", { class: "row" }, el("span", { class: "spacer" }),
      (m.monthShares || {})[month] ? el("button", { class: "btn quiet", onclick: () => { shareMonth = null; write(() => upd(p.id, { [`money.monthShares.${month}`]: DEL() }), "Back to the usual shares") } }, "Use usual shares") : null,
      el("button", { class: "btn quiet", onclick: () => { shareMonth = null; render() } }, "Cancel"),
      el("button", { class: "btn primary", onclick: () => { const r = ed.read(); if (r.total !== 100) { toast("Needs to add up to 100%"); return } shareMonth = null; write(() => upd(p.id, { [`money.monthShares.${month}`]: r.shares }), "Saved for " + monthLabel(month)) } }, "Save")));
}

/* ----- money: the team money page (my money, team fund, rules) ----- */

// The team agreed to 40% while we're starting out, reviewed every 2 months. Saved by the admin.
function ensureMoneyRules() {
  if (!isAdmin) return;
  const r = moneyRules || {};
  const plus = (t, n) => { const d = new Date(t); d.setMonth(d.getMonth() + n); return ymd(d) };
  if (r.agreed40 && r.reviewAt) {
    // the review cycle changed from 3 to 2 months: move the next review date (no need to agree again)
    if (r.reviewMonths !== 2 && !r.review2) {
      const data = { reviewMonths: 2, reviewAt: plus(r.setAt || Date.now(), 2), review2: true };
      moneyRules = { ...r, ...data }; setDoc(doc(db, "meta", "money"), data, { merge: true }).catch(() => {});
    }
    return;
  }
  const data = { fundPct: 40, findPct: 5, finderMonths: 3, pauseAfterLate: 2, reviewMonths: 2, version: Math.max(2, (r.version || 1) + (moneyRules ? 1 : 0)),
    holder: r.holder || me, setAt: Date.now(), reviewAt: plus(Date.now(), 2), agreed40: true, review2: true, updatedAt: Date.now() };
  moneyRules = { ...r, ...data };
  setDoc(doc(db, "meta", "money"), data, { merge: true }).catch(() => {});
}

const dealProjects = () => ideas.filter(i => (i.status === "approved" || i.status === "completed") && i.money);
// Fund spending someone paid from their own pocket: the fund owes it back to them until it's marked paid back.
const fundSpendList = () => Object.entries((fundDoc || {}).spends || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
function allMoney() {
  const out = { projects: [], me: { earned: 0, back: 0, paid: 0, balance: 0 }, people: {}, fundIn: 0, month: { expected: 0, received: 0 }, late: [],
    flow: { received: 0, back: 0, fund: 0, earned: 0, waiting: 0, cover: 0 } };
  const nowM = thisMonth();
  const pp = u => out.people[u] || (out.people[u] = { earned: 0, back: 0, paid: 0, balance: 0 });
  for (const p of dealProjects()) {
    const r = moneyOf(p); out.projects.push({ p, r }); out.fundIn += r.fund;
    for (const [u, v] of Object.entries(r.people)) { const t = pp(u); for (const k of ["earned", "back", "paid", "balance"]) t[k] += v[k] }
    if (!r.proposal) {
      for (const s of r.schedule) if (s.month === nowM && s.label !== "Total" && s.status !== "upcoming") { out.month.expected += s.expected; out.month.received += s.received }
      for (const s of r.late) out.late.push({ p, s });
    }
    const f = out.flow; f.received += r.received; f.fund += r.fund; f.waiting += r.held + r.unassigned; f.cover += r.fundCover;
    for (const v of Object.values(r.people)) { f.back += v.back; f.earned += v.earned }
  }
  // the fund paying people back for things they bought for the team
  for (const s of fundSpendList()) if (s.paidBy) { const t = pp(s.paidBy); t.back += toP(s.amount); if (s.repaidAt) t.paid += toP(s.amount); t.balance = t.earned + t.back - t.paid }
  for (const t of Object.values(out.people)) t.balance = t.earned + t.back - t.paid;
  out.me = out.people[me] || out.me;
  return out;
}
const goalState = g => g.doneAt ? "done" : toP(g.target) > 0 ? "saving" : "research";
function fundState(all) {
  const f = fundDoc || {};
  const spends = fundSpendList().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const adj = Object.entries(f.adjust || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
  const spent = spends.reduce((s, x) => s + toP(x.amount), 0), extra = adj.reduce((s, x) => s + toP(x.amount), 0);
  const goals = Object.entries(f.goals || {}).filter(([, v]) => v && v.name).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const subs = Object.entries(f.subs || {}).filter(([, v]) => v && v.name).map(([id, v]) => ({ id, ...v })).sort((a, b) => (!!a.paused - !!b.paused) || (a.nextDue || "").localeCompare(b.nextDue || ""));
  const balance = all.fundIn + extra - spent;
  const owes = spends.filter(s => s.paidBy && !s.repaidAt), owed = owes.reduce((s, x) => s + toP(x.amount), 0);
  const perMonth = subs.filter(s => !s.paused).reduce((s, x) => s + (x.cycle === "year" ? Math.round(toP(x.amount) / 12) : toP(x.amount)), 0);
  return { spends, adj, spent, extra, goals, subs, balance, owes, owed, perMonth, holder: (moneyRules || {}).holder || null };
}
const nextDate = (d, cycle) => { const x = new Date(d + "T12:00"); if (cycle === "year") x.setFullYear(x.getFullYear() + 1); else x.setMonth(x.getMonth() + 1); return ymd(x) };
let fundForm = null, delFund = null, editRules = false, moneyTab = "overview", goalEdit = null, goalOpen = {}, subPay = null, subEdit = null;
const fundWrite = (data, ok) => write(() => setDoc(doc(db, "meta", "fund"), data, { merge: true }), ok);

function moneyRulesText(R) {
  return [
    `Costs come first: anyone who paid for something from their own pocket gets it back first, from the next money that comes in.`,
    `${R.fundPct}% of each project's profit goes to the team fund, to pay our subscriptions and grow (like getting an office). We review this % every ${R.reviewMonths} months.`,
    `Whoever brings a client gets a ${R.findPct}% finder's fee. If several of us brought it in, we share it equally. If the client came through the team in general, it goes to the team fund. On monthly deals it applies to the setup fee and the first ${R.finderMonths} months.`,
    `The rest is split by the shares agreed when the deal is made. The site suggests shares from who has which tasks.`,
    `One-time projects: the deposit pays back costs; the profit is split once the client has fully paid.`,
    `Monthly deals and payments over several months: split every time a payment arrives.`,
    `Monthly deals: the setup fee goes to who built it; each month's fee goes to who ran it that month.`,
    `A proposal isn't a deal yet: nothing is due or late until the client agrees.`,
    `If a monthly client is ${R.pauseAfterLate} months late, we pause the work until they pay.`,
    `A client's ad budget is their money, not ours. It's tracked separately and never split.`,
    `If a project loses money, nobody gets a share from it and the team fund covers what's owed back. The site does this by itself when the deal is over.`,
    `If you pay for something for the team (like a subscription) from your own pocket, the fund owes it back to you.`,
    `Everyone can see all the money. Only ${ADMIN_NAME} and each project's planners can add or change amounts. Anyone can add goals and research them.`,
  ];
}
// What changed since the last version of the rules, so nobody has to compare by hand.
function rulesChanges(R) {
  const pv = R.prev; if (!pv) return [];
  const names = { fundPct: ["Team fund", "%"], findPct: ["Finder's fee", "%"], finderMonths: ["Finder's fee on monthly deals", " months"], pauseAfterLate: ["Pause after", " months late"], reviewMonths: ["Review every", " months"] };
  return Object.entries(names).filter(([k]) => pv[k] != null && pv[k] !== R[k]).map(([k, [l, u]]) => `${l}: ${pv[k]}${u} → ${R[k]}${u}`);
}
const moneyGo = (p) => { projTab = "money"; location.hash = "project-" + p.id };

function renderMoneyPage() {
  const box = $("#money"); box.replaceChildren();
  const all = allMoney(), F = fundState(all), R = rulesNow(), ver = R.version || 1;
  const agreed = ((people[me] || {}).moneyAgreed || {}).version === ver;
  box.append(el("button", { class: "back", onclick: () => { location.hash = "me" } }, "← Me"), el("h2", { class: "sec-h", style: "margin-top:0" }, "Money"));

  if (!agreed) {
    const ch = rulesChanges(R);
    box.append(el("div", { class: "notice agree-note" },
      el("div", { style: "flex:1 1 220px;display:grid;gap:2px" }, el("b", {}, ch.length ? `The money rules changed (version ${ver})` : "Please read and agree to the money rules"),
        ch.length ? el("span", {}, ch.join(" · ")) : null),
      el("button", { class: "btn small", onclick: () => { moneyTab = "rules"; render(); scrollTo(0, 0) } }, "Read and agree")));
  }
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Money", style: "margin-bottom:14px" },
    [["overview", "Overview"], ["fund", "Fund & goals"], ["rules", "Rules" + (agreed ? "" : " •")]].map(([k, l]) => el("button", { "aria-pressed": String(moneyTab === k), onclick: () => { moneyTab = k; render() } }, l))));
  if (moneyTab === "fund") return renderFundTab(box, all, F);
  if (moneyTab === "rules") return renderRulesTab(box, all, F, R, ver, agreed);

  /* my money */
  box.append(el("section", { class: "profile money-hero" },
    el("div", { class: "profile-main", style: "grid-column:1/-1" }, el("div", { class: "hello" }, all.me.balance > 0 ? "You're owed" : "Your balance"), el("h1", {}, fmtEGP(all.me.balance)))),
    el("div", { class: "stats" },
      el("div", { class: "stat" }, el("b", {}, fmtEGP(all.me.earned)), el("span", {}, "earned")),
      el("div", { class: "stat" }, el("b", {}, fmtEGP(all.me.back)), el("span", {}, "paid back to you for costs")),
      el("div", { class: "stat" }, el("b", {}, fmtEGP(all.me.paid)), el("span", {}, "already handed to you"))));

  /* where the money went: every pound the clients paid, in one bar */
  const fl = all.flow;
  if (fl.received > 0) {
    const handed = Object.values(all.people).reduce((s, v) => s + v.paid, 0), stillOwed = Object.values(all.people).reduce((s, v) => s + Math.max(0, v.balance), 0);
    const segs = [["back", "Costs paid back", fl.back], ["fund", "Team fund", Math.max(0, fl.fund)], ["people", "The team's shares", fl.earned], ["wait", "Waiting to be split", fl.waiting]].filter(x => x[2] > 0);
    const tot = segs.reduce((s, x) => s + x[2], 0) || 1;
    box.append(el("section", { class: "idea flowcard" },
      el("div", { class: "row" }, el("h3", {}, "Where the money went"), el("span", { class: "spacer" }), el("span", { class: "label" }, fmtEGP(fl.received) + " from clients")),
      el("div", { class: "flowbar", role: "img", "aria-label": segs.map(x => `${x[1]} ${fmtEGP(x[2])}`).join(", ") }, segs.map(([k, , v]) => el("span", { class: "fs-" + k, style: `flex:${v / tot}` }))),
      el("div", { class: "flowlegend" }, segs.map(([k, l, v]) => el("div", {}, el("i", { class: "fs-" + k }), el("span", {}, l), el("b", {}, fmtEGP(v))))),
      el("p", { class: "label", style: "margin:0" }, `Of what the team earned and spent: ${fmtEGP(handed)} handed over, ${fmtEGP(stillOwed)} still owed.` + (fl.cover ? ` The fund covered ${fmtEGP(fl.cover)} of losses.` : "") + " Client ad money isn't included: it's never ours.")));
  }

  /* this month */
  box.append(el("h2", { class: "sec-h" }, "This month"));
  box.append(el("section", { class: "idea" },
    el("div", { class: "adgrid" },
      el("div", {}, el("b", {}, fmtEGP(all.month.expected)), el("span", {}, "expected from clients")),
      el("div", {}, el("b", {}, fmtEGP(all.month.received)), el("span", {}, "received")),
      el("div", { class: all.late.length ? "late" : "" }, el("b", {}, String(all.late.length)), el("span", {}, all.late.length === 1 ? "late payment" : "late payments"))),
    all.late.length ? el("div", { style: "display:grid;gap:4px" }, all.late.map(({ p, s }) => el("button", { class: "mlink late", onclick: () => moneyGo(p) },
      el("span", { class: "mname" }, p.title + (p.money.client ? " · " + p.money.client : "")), el("span", {}, (s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label) + " · " + fmtEGP(s.expected - s.received))))) : null,
    !all.projects.length ? el("p", { style: "margin:0" }, "No deals yet. Set one up on a project's Money tab.") : null));

  /* deals at a glance */
  if (all.projects.length) box.append(el("h2", { class: "sec-h" }, "Deals"), el("section", { class: "idea", style: "gap:0" },
    all.projects.sort((a, b) => (b.r.late.length - a.r.late.length) || (a.r.proposal - b.r.proposal)).map(({ p, r }) => { const [st, cls] = moneyStatus(p, r), mine = r.people[me];
      return el("button", { class: "mlink", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, p.title), el("span", { class: "row", style: "gap:6px" },
        mine && mine.balance > 0 ? el("span", { class: "label" }, "you're owed " + fmtEGP(mine.balance)) : null, el("span", { class: "mstat " + cls }, st))) })));

  /* everyone's balance (open for trust) */
  const owed = Object.entries(all.people).filter(([, v]) => v.earned || v.back || v.paid).sort((a, b) => b[1].balance - a[1].balance);
  if (owed.length) box.append(el("h2", { class: "sec-h" }, "Everyone"), el("section", { class: "idea", style: "gap:0" },
    el("div", { class: "mhead" }, el("span", {}, "In EGP"), el("span", {}, "Earned"), el("span", {}, "Handed over"), el("span", {}, "Owed")),
    owed.map(([u, v]) => el("div", { class: "mrow4" }, el("span", { class: "by" }, av(u), el("span", { class: "mname" }, name(u))), el("span", { class: "mval" }, fmtN(v.earned + v.back)), el("span", { class: "mval" }, fmtN(v.paid)), el("span", { class: "mval owed" }, fmtN(v.balance))))));
}

function renderFundTab(box, all, F) {
  const today = todayStr();
  /* the fund */
  const runway = F.perMonth > 0 ? Math.floor(Math.max(0, F.balance) / F.perMonth) : null;
  box.append(el("section", { class: "idea fundcard" },
    el("div", { class: "row", style: "align-items:flex-start" },
      el("div", {}, el("div", { class: "label" }, "Team fund"), el("div", { class: "bignum" }, fmtEGP(F.balance)), el("div", { class: "label" }, `Held by ${F.holder ? name(F.holder) : ADMIN_NAME}`)),
      el("span", { class: "spacer" }), isAdmin ? el("button", { class: "btn small", onclick: () => { fundForm = "spend"; render() } }, "Record money in or out") : null),
    el("div", { class: "adgrid" },
      el("div", {}, el("b", {}, fmtEGP(all.fundIn)), el("span", {}, "from projects")),
      el("div", {}, el("b", {}, fmtEGP(F.spent)), el("span", {}, "spent" + (F.extra ? ` \u00b7 ${fmtEGP(F.extra)} added by hand` : ""))),
      el("div", { class: runway != null && runway < 2 ? "late" : "" }, el("b", {}, runway == null ? "–" : runway > 24 ? "24+" : String(runway)), el("span", {}, runway == null ? "no subscriptions" : "months of subscriptions covered")))));
  if (isAdmin && fundForm === "spend") box.append(fundEntryForm(F));

  /* the fund owes people who paid from their own pocket */
  if (F.owes.length) box.append(el("section", { class: "idea", style: "margin-top:12px;gap:0" }, el("div", { class: "row", style: "margin-bottom:6px" }, el("h3", {}, "The fund owes"), el("span", { class: "spacer" }), el("span", { class: "label" }, fmtEGP(F.owed))),
    F.owes.map(s => el("div", { class: "hrow" }, av(s.paidBy), el("div", { class: "hmain" }, el("div", {}, `${name(s.paidBy)} paid for ${s.what || "something"}`), el("div", { class: "label" }, fmtDate(s.date))),
      el("span", { class: "hamt" }, fmtEGP(toP(s.amount))),
      isAdmin ? el("button", { class: "btn small", onclick: () => fundWrite({ spends: { [s.id]: { repaidAt: Date.now(), repaidBy: me } } }, `Marked as paid back to ${firstName(s.paidBy)}`) }, "Paid back") : null))));

  /* goals */
  const goals = F.goals.filter(g => goalState(g) !== "done"), done = F.goals.filter(g => goalState(g) === "done");
  const saving = goals.filter(g => goalState(g) === "saving"), research = goals.filter(g => goalState(g) === "research");
  let left = Math.max(0, F.balance);
  const gsec = el("section", { class: "idea", style: "margin-top:12px" }, el("div", { class: "row" }, el("h3", {}, "Goals"), el("span", { class: "spacer" }),
    el("button", { class: "btn small", onclick: () => { goalEdit = "new"; render() } }, "+ Goal")),
    el("p", { class: "label", style: "margin:0" }, "Big things we want. Add one even if you don't know the price yet, research it, write what you find, then add the price and the fund starts saving for it."));
  if (goalEdit === "new") gsec.append(goalForm(null));
  if (!F.goals.length && goalEdit !== "new") gsec.append(el("p", { style: "margin:0" }, "No goals yet. Office, equipment, a course, a car for client visits: anything big."));
  if (saving.length) {
    gsec.append(el("div", { class: "mgroup" }, el("b", {}, "Saving for"), el("span", { class: "pcount" }, saving.length), el("span", { class: "mhint" }, "The fund fills these in order, top first")));
    saving.forEach((g, k) => { const t = toP(g.target), have = Math.min(left, t); left -= have; gsec.append(goalRow(g, { have, t, k, list: saving })) });
  }
  if (research.length) {
    gsec.append(el("div", { class: "mgroup" }, el("b", {}, "Needs research"), el("span", { class: "pcount" }, research.length), el("span", { class: "mhint" }, "No price yet. Find out what it costs")));
    research.forEach(g => gsec.append(goalRow(g, {})));
  }
  if (done.length) gsec.append(el("details", { class: "removed", style: "margin-top:4px" }, el("summary", {}, `Reached (${done.length})`), done.map(g => goalRow(g, {}))));
  box.append(gsec);

  /* subscriptions */
  const soon = ymd(new Date(Date.now() + 30 * 864e5));
  const active = F.subs.filter(s => !s.paused), dueSoon = active.filter(s => s.nextDue && s.nextDue <= soon).reduce((s, x) => s + toP(x.amount), 0);
  const ssec = el("section", { class: "idea", style: "margin-top:12px" }, el("div", { class: "row" }, el("h3", {}, "Subscriptions"), el("span", { class: "spacer" }),
    isAdmin ? el("button", { class: "btn small", onclick: () => { subEdit = "new"; render() } }, "+ Subscription") : null),
    active.length ? el("p", { class: "label", style: "margin:0" }, `About ${fmtEGP(F.perMonth)} a month (yearly ones spread out)` + (dueSoon ? ` · ${fmtEGP(dueSoon)} due in the next 30 days` : "")) : null);
  if (subEdit === "new") ssec.append(subForm(null));
  if (!F.subs.length && subEdit !== "new") ssec.append(el("p", { style: "margin:0" }, isAdmin ? "Add the tools the team pays for. The fund tracks when each one is due and who paid it." : "No subscriptions yet."));
  for (const s of F.subs) {
    if (subEdit === s.id) { ssec.append(subForm(s)); continue }
    const late = !s.paused && s.nextDue && s.nextDue < today, near = !s.paused && s.nextDue && s.nextDue <= ymd(new Date(Date.now() + 3 * 864e5));
    ssec.append(el("div", { class: "hrow" + (s.paused ? " ad" : "") },
      el("div", { class: "hmain" }, el("div", { class: "mname" }, s.name, s.note ? el("span", { class: "label", style: "font-weight:500" }, " · " + s.note) : null),
        el("div", { class: "due" + (late ? " late" : near ? " soon" : "") }, s.paused ? "Paused" : (late ? "Overdue · " : "Next: ") + fmtDate(s.nextDue))),
      el("span", { class: "hamt" }, fmtEGP(toP(s.amount)) + (s.cycle === "year" ? "/yr" : "/mo")),
      isAdmin && !s.paused ? el("button", { class: "btn small" + (late || near ? " primary" : ""), onclick: () => { subPay = subPay === s.id ? null : s.id; render() } }, "Paid") : null,
      isAdmin ? el("button", { class: "linkdel", "aria-label": "Edit " + s.name, title: "Edit", onclick: () => { subEdit = s.id; render() } }, "✎") : null));
    if (subPay === s.id) ssec.append(subPayChooser(s, today));
  }
  if (dueSoon && dueSoon > F.balance) ssec.append(el("div", { class: "notice" }, `Next 30 days of subscriptions: ${fmtEGP(dueSoon)}. The fund only has ${fmtEGP(F.balance)}.`));
  box.append(ssec);

  /* fund history */
  const hist = [...all.projects.filter(x => x.r.fund).map(({ p, r }) => ({ sign: r.fund < 0 ? "−" : "+", text: (r.fund < 0 ? "Covered a loss on " : "From ") + p.title, amount: Math.abs(r.fund), date: "" })),
    ...F.adj.map(a => ({ sign: toP(a.amount) < 0 ? "−" : "+", text: a.note || "Added to the fund", amount: Math.abs(toP(a.amount)), date: a.date, id: a.id, coll: "adjust" })),
    ...F.spends.map(s => ({ sign: "−", text: (s.what || "Spent") + (s.paidBy ? ` · paid by ${firstName(s.paidBy)}` + (s.repaidAt ? ", paid back" : ", not paid back yet") : ""), amount: toP(s.amount), date: s.date, id: s.id, coll: "spends" }))];
  if (hist.length) box.append(el("details", { class: "removed" }, el("summary", {}, `Fund history (${hist.length})`),
    el("div", { class: "idea", style: "gap:0;margin-top:10px" }, hist.map(h => el("div", { class: "hrow" }, el("span", { class: "hsign" }, h.sign),
      el("div", { class: "hmain" }, el("div", {}, h.text), h.date ? el("div", { class: "label" }, fmtDate(h.date)) : null), el("span", { class: "hamt" }, fmtEGP(h.amount)),
      isAdmin && h.id ? (delFund === h.id ? el("button", { class: "linkdel sure", onclick: () => { delFund = null; fundWrite({ [h.coll]: { [h.id]: DEL() } }, "Removed") } }, "Remove?") : el("button", { class: "linkdel", "aria-label": "Remove", onclick: () => { delFund = h.id; render() } }, "✕")) : null)))));
}

function goalRow(g, { have, t, k, list }) {
  const st = goalState(g), open = goalOpen[g.id] || goalEdit === g.id;
  if (goalEdit === g.id) return goalForm(g);
  const move = d => { const other = list[k + d]; if (!other) return; fundWrite({ goals: { [g.id]: { order: other.order || 0 }, [other.id]: { order: g.order || 0 } } }) };
  const row = el("div", { class: "goalrow" + (st === "done" ? " reached" : "") },
    el("div", { class: "row", style: "gap:8px" },
      el("button", { class: "goalname", "aria-expanded": String(!!open), onclick: () => { goalOpen[g.id] = !goalOpen[g.id]; render() } }, g.name),
      st === "research" ? el("span", { class: "mstat due" }, "Needs research") : st === "done" ? el("span", { class: "mstat paid" }, "✓ Reached " + (g.doneAt ? fmtDay(g.doneAt) : "")) : null,
      el("span", { class: "spacer" }),
      st === "saving" ? el("span", { class: "label" }, `${fmtEGP(have)} of ${fmtEGP(t)}`) : null,
      st === "saving" && isAdmin && list.length > 1 ? el("span", { class: "row", style: "gap:2px" },
        k > 0 ? el("button", { class: "linkdel", "aria-label": "Move up", onclick: () => move(-1) }, "↑") : null,
        k < list.length - 1 ? el("button", { class: "linkdel", "aria-label": "Move down", onclick: () => move(1) }, "↓") : null) : null));
  if (st === "saving") { const tr = line({ total: 100, done: 0, pct: t ? Math.round(have / t * 100) : 0 }, "x"); tr.querySelectorAll(".pmeta").forEach(n => n.remove()); row.append(tr) }
  if (open) {
    row.append(el("div", { class: "goaldetail" },
      g.details ? el("div", { class: "pre" }, linkify(g.details)) : el("p", { class: "label", style: "margin:0" }, "No research written yet."),
      el("div", { class: "label" }, [g.by ? "Added by " + name(g.by) : null, g.editedBy ? "edited by " + name(g.editedBy) + " " + ago(g.editedAt) : null].filter(Boolean).join(" · ")),
      el("div", { class: "row", style: "gap:6px" },
        st !== "done" ? el("button", { class: "btn small", onclick: () => { asstOpen = true; alertsOpen = false; useTemplate({ label: "Research: " + g.name, prompt: goalPrompt(g) }, null) } }, "✦ Research with the assistant") : null,
        el("span", { class: "spacer" }),
        el("button", { class: "btn small quiet", onclick: () => { goalEdit = g.id; render() } }, "Edit"),
        isAdmin && st === "saving" && have >= t ? el("button", { class: "btn small primary", onclick: () => fundWrite({ goals: { [g.id]: { doneAt: Date.now() } }, spends: { [uid()]: { amount: t / 100, what: g.name, date: todayStr(), goal: g.id, by: me, at: Date.now() } } }, `${g.name}: reached and paid from the fund`) }, "Buy it from the fund") : null,
        isAdmin && st !== "done" ? el("button", { class: "btn small quiet", onclick: () => fundWrite({ goals: { [g.id]: { doneAt: Date.now() } } }, "Marked as reached") }, "Mark reached") : null,
        isAdmin && st === "done" ? el("button", { class: "btn small quiet", onclick: () => fundWrite({ goals: { [g.id]: { doneAt: DEL() } } }, "Back in the goals") }, "Not reached") : null,
        isAdmin ? (delFund === g.id ? el("button", { class: "linkdel sure", onclick: () => { delFund = null; fundWrite({ goals: { [g.id]: DEL() } }, "Goal removed") } }, "Remove?") : el("button", { class: "linkdel", "aria-label": "Remove goal", onclick: () => { delFund = g.id; render() } }, "✕")) : null)));
  }
  return row;
}
const goalPrompt = g => `Research this goal for our team: "${g.name}". We are Ardent Studios, a small team in Egypt that sells websites and Google Ads to clients worldwide.${g.details ? " What we know so far: " + g.details : ""}
Give us: 1) what it involves and the realistic options (cheap, middle, best), 2) a cost range in EGP for each option, one-time and monthly, 3) the steps to get it, 4) what to watch out for. Keep it short and practical. End with one line: "Suggested target: <number> EGP".`;
function goalForm(g) {
  const nm = el("input", { id: "gf-name", class: "noteinput", maxlength: "60", placeholder: "e.g. Office in Cairo" });
  const tg = moneyInput("gf-target", g && g.target ? g.target : "", "Price in EGP (leave empty if you don't know yet)");
  const dt = el("textarea", { id: "gf-details", class: "noteinput", rows: "5", maxlength: "5000", placeholder: "Research and details: options, prices you found, links, what it needs…" });
  if (g) { if (!nm.value) nm.value = g.name || ""; if (!dt.value) dt.value = g.details || "" }
  const close = () => { goalEdit = null; render() };
  const save = () => {
    const n = nm.value.trim(); if (!n) { toast("Give the goal a name"); nm.focus(); return }
    const t = Number(tg.value);
    const data = { name: n, target: t > 0 ? Math.round(t * 100) / 100 : null, details: dt.value.trim() };
    if (g) Object.assign(data, { editedBy: me, editedAt: Date.now() }); else Object.assign(data, { order: Date.now(), by: me, at: Date.now() });
    goalEdit = null; if (g) goalOpen[g.id] = true;
    fundWrite({ goals: { [g ? g.id : uid()]: data } }, g ? "Goal saved" : t > 0 ? "Goal added. The fund is saving for it" : "Goal added. Research it and add the price when you know it");
  };
  return el("div", { class: "mform goalform" }, el("h3", { style: "font-size:16px" }, g ? "Edit goal" : "New goal"),
    fieldRow("Goal", nm), fieldRow("Price", tg), fieldRow("Details", dt),
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("button", { class: "btn primary", onclick: save }, g ? "Save" : "Add goal")));
}

function subPayChooser(s, today) {
  const who = personSelect("sp-who-" + s.id, "", { members: {} }, "The fund paid it");
  return el("div", { class: "subpay" }, el("span", {}, `Who paid ${fmtEGP(toP(s.amount))} for ${s.name}?`), who,
    el("button", { class: "btn small quiet", onclick: () => { subPay = null; render() } }, "Cancel"),
    el("button", { class: "btn small primary", onclick: () => { const by = who.value || null; subPay = null;
      fundWrite({ spends: { [uid()]: { amount: s.amount, date: today, what: s.name + " subscription", sub: s.id, paidBy: by, by: me, at: Date.now() } }, subs: { [s.id]: { nextDue: nextDate(s.nextDue || today, s.cycle), lastPaid: today } } },
        by ? `Saved. The fund owes ${firstName(by)} ${fmtEGP(toP(s.amount))}` : `Paid ${s.name} from the fund`) } }, "Save"));
}
function subForm(s) {
  const today = todayStr();
  const nm = el("input", { id: "sf-name", class: "noteinput", maxlength: "60", placeholder: "e.g. Claude, Canva, domain" }), am = moneyInput("sf-amount", s ? s.amount : "", "Cost in EGP");
  const cy = el("select", { class: "mini", id: "sf-cycle" }, el("option", { value: "month" }, "Every month"), el("option", { value: "year" }, "Every year"));
  const nx = el("input", { id: "sf-next", type: "date", class: "mini", value: (s && s.nextDue) || today });
  const nt = el("input", { id: "sf-note", class: "noteinput", maxlength: "80", placeholder: "What we use it for, or the price in dollars (optional)" });
  if (s) { if (!nm.value) nm.value = s.name || ""; cy.value = s.cycle || "month"; if (!nt.value) nt.value = s.note || "" }
  const close = () => { subEdit = null; render() };
  const save = () => {
    if (!nm.value.trim() || !(Number(am.value) > 0)) { toast("Enter a name and a cost"); return }
    subEdit = null;
    fundWrite({ subs: { [s ? s.id : uid()]: { name: nm.value.trim(), amount: Number(am.value), cycle: cy.value, nextDue: nx.value || today, note: nt.value.trim() } } }, s ? "Saved" : "Subscription added");
  };
  return el("div", { class: "mform goalform" }, el("h3", { style: "font-size:16px" }, s ? "Edit " + s.name : "New subscription"),
    fieldRow("Name", nm), fieldRow("Cost", am), fieldRow("How often", cy), fieldRow("Next payment", nx), fieldRow("Note", nt),
    el("div", { class: "row", style: "gap:6px" },
      s ? el("button", { class: "btn small quiet", onclick: () => { subEdit = null; fundWrite({ subs: { [s.id]: { paused: !s.paused } } }, s.paused ? "Resumed" : "Paused. It's not counted until you resume it") } }, s.paused ? "Resume" : "Pause") : null,
      s ? (delFund === s.id ? el("button", { class: "linkdel sure", onclick: () => { delFund = null; subEdit = null; fundWrite({ subs: { [s.id]: DEL() } }, "Removed") } }, "Remove?") : el("button", { class: "btn small quiet danger-quiet", onclick: () => { delFund = s.id; render() } }, "Remove")) : null,
      el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("button", { class: "btn primary", onclick: save }, "Save")));
}

function renderRulesTab(box, all, F, R, ver, agreed) {
  const ch = rulesChanges(R);
  const rules = el("section", { class: "idea", id: "rules" }, el("div", { class: "row" }, el("h3", {}, "Our money rules"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Version " + ver + ((moneyRules || {}).reviewAt ? " · next review " + fmtDate(moneyRules.reviewAt) : ""))),
    ch.length ? el("div", { class: "notice", style: "margin:0" }, el("b", {}, "What changed in this version: "), ch.join(" · ")) : null,
    el("div", { class: "adgrid" },
      el("div", {}, el("b", {}, R.fundPct + "%"), el("span", {}, "team fund")),
      el("div", {}, el("b", {}, R.findPct + "%"), el("span", {}, "finder's fee")),
      el("div", {}, el("b", {}, R.reviewMonths + " mo"), el("span", {}, "review cycle"))),
    el("ol", { class: "rules" }, moneyRulesText(R).map(t => el("li", {}, t))));
  const signed = teamIds().map(u => ({ u, a: (people[u] || {}).moneyAgreed || {} })).map(x => ({ ...x, ok: x.a.version === ver }));
  rules.append(el("div", { class: "tlabel" }, `Agreed ${signed.filter(x => x.ok).length} of ${signed.length}`),
    el("div", { class: "row", style: "gap:6px" }, signed.map(({ u, ok, a }) => el("span", { class: "planner" + (ok ? " agreed" : ""), title: ok && a.at ? "Agreed " + fmtDay(a.at) : "Not yet" }, av(u), name(u), ok ? " ✓" : " …"))));
  if (!agreed) rules.append(el("button", { class: "btn primary", id: "agree-btn", onclick: () => {
    // show it straight away; undo if the save is refused
    const before = (people[me] || {}).moneyAgreed, val = { version: ver, at: Date.now() };
    people[me] = { ...(people[me] || {}), moneyAgreed: val }; toast("Thanks, you agreed to the money rules"); render();
    write(() => setDoc(doc(db, "users", me), { moneyAgreed: val }, { merge: true })).then(ok => { if (!ok) { people[me] = { ...(people[me] || {}), moneyAgreed: before }; render() } });
  } }, "I agree"));
  if (isAdmin) {
    const due = (moneyRules || {}).reviewAt && moneyRules.reviewAt <= todayStr();
    const nextReview = n => { const d = new Date(); d.setMonth(d.getMonth() + n); return ymd(d) };
    if (!editRules) rules.append(el("div", { class: "row", style: "gap:8px" }, due ? el("span", { class: "label", style: "color:var(--warn)" }, "Review is due") : null, el("span", { class: "spacer" }),
      due ? el("button", { class: "btn small", onclick: () => write(() => setDoc(doc(db, "meta", "money"), { reviewAt: nextReview(R.reviewMonths || 2), reviewedAt: Date.now() }, { merge: true }), "Kept the same. Next review in " + (R.reviewMonths || 2) + " months") }, "Keep the same numbers") : null,
      el("button", { class: "btn quiet small", onclick: () => { editRules = true; render() } }, "Change the numbers")));
    else {
      const fp = el("input", { id: "r-fund", class: "mini pct", type: "number", min: "0", max: "70", value: R.fundPct }), fd = el("input", { id: "r-find", class: "mini pct", type: "number", min: "0", max: "30", value: R.findPct });
      const fm = el("input", { id: "r-fm", class: "mini pct", type: "number", min: "0", max: "24", value: R.finderMonths }), pa = el("input", { id: "r-pause", class: "mini pct", type: "number", min: "1", max: "6", value: R.pauseAfterLate });
      const rv = el("input", { id: "r-review", class: "mini pct", type: "number", min: "1", max: "12", value: R.reviewMonths || 2 });
      const holder = personSelect("r-holder", F.holder || me, { members: {} }, null);
      const save = () => {
        const v = { fundPct: Number(fp.value) || 0, findPct: Number(fd.value) || 0, finderMonths: Number(fm.value) || 0, pauseAfterLate: Number(pa.value) || 2, reviewMonths: Math.max(1, Number(rv.value) || 2) };
        if (v.fundPct + v.findPct > 80) { toast("Fund and finder together can't be more than 80%: the people doing the work need a share"); return }
        const changed = ["fundPct", "findPct", "finderMonths", "pauseAfterLate", "reviewMonths"].some(k => v[k] !== R[k]);
        editRules = false;
        // only a change to the numbers needs everyone to agree again; changing who holds the fund doesn't
        write(() => setDoc(doc(db, "meta", "money"), { ...v, holder: holder.value || me, updatedAt: Date.now(),
          ...(changed ? { version: ver + 1, setAt: Date.now(), reviewAt: nextReview(v.reviewMonths), prev: { fundPct: R.fundPct, findPct: R.findPct, finderMonths: R.finderMonths, pauseAfterLate: R.pauseAfterLate, reviewMonths: R.reviewMonths, version: ver } } : {}) }, { merge: true }),
          changed ? "Rules updated. Everyone will be asked to agree again" : "Saved");
      };
      rules.append(el("div", { class: "mform", style: "display:grid;gap:8px" }, fieldRow("Team fund %", fp), fieldRow("Finder %", fd), fieldRow("Finder months (monthly deals)", fm), fieldRow("Pause after months late", pa), fieldRow("Review every (months)", rv), fieldRow("Who holds the fund", holder),
        el("p", { class: "label", style: "margin:0" }, "Changing a number makes a new version, and everyone is asked to agree again. Deals already set up keep their own %."),
        el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: () => { editRules = false; render() } }, "Cancel"), el("button", { class: "btn primary", onclick: save }, "Save rules"))));
    }
  }
  box.append(rules);
}

function fundEntryForm(F) {
  const today = todayStr(), box = el("section", { class: "idea mform", style: "margin-top:12px" }), close = () => { fundForm = null; render() };
  const am = moneyInput("fx-amount", "", "Amount in EGP"), wh = el("input", { id: "fx-what", class: "noteinput", maxlength: "80", placeholder: "What for? e.g. office deposit" });
  const kd = el("select", { class: "mini", id: "fx-kind" }, el("option", { value: "spend" }, "Money spent for the team"), el("option", { value: "add" }, "Money added to the fund"));
  const who = personSelect("fx-who", "", { members: {} }, "From the fund");
  const whoRow = fieldRow("Paid by", who, el("span", { class: "label" }, "If someone paid from their own pocket, the fund owes it back to them"));
  kd.addEventListener("change", () => { whoRow.hidden = kd.value !== "spend" });
  const dt = el("input", { id: "fx-date", type: "date", class: "mini", value: today });
  box.append(el("h3", {}, "Money in or out of the fund"), fieldRow("Type", kd), fieldRow("Amount", am), fieldRow("For", wh), whoRow, fieldRow("Date", dt), el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: close }, "Cancel"),
    el("button", { class: "btn primary", onclick: () => { const a = Number(am.value); if (!(a > 0)) { toast("Enter an amount"); return } fundForm = null;
      fundWrite(kd.value === "spend" ? { spends: { [uid()]: { amount: a, what: wh.value.trim(), date: dt.value || today, paidBy: who.value || null, by: me, at: Date.now() } } } : { adjust: { [uid()]: { amount: a, note: wh.value.trim() || "Added to the fund", date: dt.value || today, by: me, at: Date.now() } } },
        kd.value === "spend" && who.value ? `Saved. The fund owes ${firstName(who.value)} ${fmtEGP(toP(a))}` : "Saved") } }, "Save")));
  return box;
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
$("#asst-btn").onclick = () => { asstOpen = !asstOpen; alertsOpen = false; render(); if (asstOpen) setTimeout(() => { const i = document.getElementById("asst-input"); if (i && matchMedia("(min-width:760px)").matches) i.focus() }, 0) };
$("#brand").onclick = () => { location.hash = "me" };
if (loadCache()) show();
