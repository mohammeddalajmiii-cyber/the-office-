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
// date and time formats are made once and reused: making a new one for every message was slow on phones
const dtfCache = new Map(), dtf = o => { const k = JSON.stringify(o); let f = dtfCache.get(k); if (!f) dtfCache.set(k, f = new Intl.DateTimeFormat(undefined, o)); return f };
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }), dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }), fmtMemo = new Map();
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

// The skills quiz lives in quiz.js: questions, roles and how answers become scores.

/* ---------- helpers ---------- */

const $ = s => document.querySelector(s);
const el = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "value") n.value = v; else if (k === "checked" || k === "selected") n[k] = !!v; else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v) } for (const c of kids.flat()) { if (c == null || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(String(c))) } return n };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let toastT;
function toast(m, ms) {
  const t = $("#toast");
  t.replaceChildren(el("span", {}, m));
  // a message about something going wrong gets a "Send to AI" button that explains it and how to fix it
  if (canUseAssistant() && /\b(error|fail(ed|s)?|couldn['’]t|wasn['’]t allowed|denied|went wrong|busy|check your|stuck)\b/i.test(String(m))) {
    t.appendChild(el("button", {
      class: "btn small primary",
      onclick: () => {
        t.hidden = true;
        triggerUniversalProblemAI("this message", `I just got this message on the ${route().view} page: "${m}". Explain why it happened in Pitch Room and how to fix it right away.`);
      }
    }, "⚡ Send to AI"));
    ms = Math.max(ms || 2200, 5000);
  }
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true }, ms || 2200);
}
const status = (m, warn) => { const s = $("#status"); s.textContent = m || ""; s.className = "status" + (warn ? " warn" : "") };
const DEL = () => deleteField();
const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23999'/%3E%3C/svg%3E";
const pctOf = (d, t) => t ? Math.round(d / t * 100) : 0;

/* ---------- routing ---------- */

const VIEWS = ["me", "ideas", "projects", "chat", "partners", "skills", "settings", "money", "project", "agent"];
function route(hash) {
  const h = (hash == null ? location.hash : hash).replace(/^#/, "");
  // the agent: #agent (all chats), #agent-p-<chat> (a private chat), #agent-s-<project>-<chat> (a project team's chat)
  if (h.startsWith("agent-p-")) return { view: "agent", cid: h.slice(8) };
  if (h.startsWith("agent-s-")) { const [pid, cid] = h.slice(8).split("-"); return { view: "agent", pid, cid } }
  if (h === "money-fund" || h === "money-rules") return { view: "money", tab: h.slice(6) };
  if (h.startsWith("settings-")) return { view: "settings", sub: h.slice(9) };
  if (h.startsWith("task-")) { const [id, task] = h.slice(5).split("-"); return { view: "project", id, task } }
  for (const pre of ["project-", "plan-", "build-"]) if (h.startsWith(pre)) return { view: "project", id: h.slice(pre.length) };
  if (h === "projects-done" || h === "current") return { view: "projects" };
  if (h === "new-project") return { view: "projects", sub: "new" };
  if (h === "mine" || h === "notes") return { view: "me" };
  if (h.startsWith("dm-")) return { view: "chat", dm: h.slice(3), ch: "dm:" + h.slice(3) };
  if (h.startsWith("pc-")) return { view: "chat", ch: "p:" + h.slice(3) };
  if (h === "chat-team") return { view: "chat", ch: "team" };
  if (h === "ideas" || h === "chat-ideas") return { view: "chat", ch: "ideas" };
  if (h.startsWith("pg-")) return { view: "partners", gid: h.slice(3) };
  return { view: VIEWS.includes(h) && h !== "project" ? h : "me" };
}
function show() {
  if (partnerMode) { renderPortal(); return }
  if (clientMode) { renderClient(); return }
  const r = route(); const tabView = r.view === "project" ? "projects" : r.view === "skills" ? "me" : r.view;
  for (const b of document.querySelectorAll("#app .tab")) b.setAttribute("aria-selected", b.dataset.view === tabView);
  for (const k of VIEWS) $("#view-" + k).hidden = r.view !== k;
  if (r.tab) moneyTab = r.tab;
  if (r.task) { projTab = "tasks"; taskFilter[r.id] = null; onlyMine = false; openTask = "p:" + r.task; showTaskAt = r.task }
  render();
  if (showTaskAt) { const id = showTaskAt; showTaskAt = null; setTimeout(() => { const c = document.getElementById("c-p:" + id); if (c) { const row = c.closest(".task"); scrollTo({ top: row.getBoundingClientRect().top + scrollY - 96, behavior: "smooth" }); row.classList.add("flash") } }, 80) }
}
let showTaskAt = null;
for (const b of document.querySelectorAll("#app .tab")) b.onclick = () => { location.hash = b.dataset.view };
for (const b of document.querySelectorAll("#partner .tab")) b.onclick = () => { location.hash = b.dataset.pview };
let curHash = location.hash;
/* Smart use: forms, edits and "are you sure?" questions close by themselves when you leave a page or switch a
   project's tab, and a project opens on its Tasks tab (unless a link asked for another tab). Nothing stays half-open. */
let pendingTab = null;
function closeForms() {
  moneyForm = null; editDeal = null; payPlanEdit = null; planDraft = null; phaseDraft = null; priceEdit = null; priceDraft = null; holdDecide = null; shareMonth = null; delMoney = null; confirmDelDeal = null;
  newMeeting = null; editMeeting = null; delMeeting = null; meetTasks = null; editGoal = null;
  planEdit = null; renamingPhase = null; delPhase = null; addingLink = null; delLink = null; delFile = null; delTask = null; doneAnyway = null; waitPick = null; delNote = null; delTaskFile = null;
  confirmDone = null; confirmDelProject = null; confirmDelIdea = null; newCatFor = null; fundForm = null; goalEdit = null; subPay = null; subEdit = null; delFund = null; cvOpen = {};
}
const routeKey = h => { const r = route.call(null, h); return r.view + ":" + (r.id || r.sub || r.ch || r.dm || r.gid || r.cid || "") };
function leavePage() { closeForms(); showSettings = null; openTask = null; openNote = null; editCheckin = null; projTab = pendingTab || "tasks"; pendingTab = null }
addEventListener("hashchange", () => {
  prevHash = curHash; curHash = location.hash;
  if (routeKey(prevHash) !== routeKey(curHash)) leavePage();
  navRender = true; try { show() } finally { navRender = false }
  scrollTo(0, 0);
});
// Escape closes whatever is open on the page
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || e.defaultPrevented || moreOpen || alertsOpen || searchOpen || asstOpen || document.querySelector("#lightbox:not([hidden]), dialog[open]")) return;
  if (openTask) { e.preventDefault(); closeTaskSheet(); return }
  const anyOpen = showSettings || moneyForm || editDeal || payPlanEdit || phaseDraft || priceEdit || holdDecide || newMeeting || editMeeting || editGoal || planEdit || addingLink || confirmDone || confirmDelProject || fundForm || goalEdit || subEdit || Object.keys(cvOpen).some(k => cvOpen[k]);
  if (!anyOpen) return;
  closeForms(); showSettings = null; render();
});

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
let quiz = null;                 // {i, ans:{like,scene,test,done,talent,grow}} while taking the quiz

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
  if (me && me !== u.uid) { ideas = []; people = {}; chat = []; dmThreads = []; dmMsgs = {}; pcMsgs = {}; personal = []; myNotes = []; focusId = null; activeMap = {} }
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
  unsubs.push(onSnapshot(collection(db, "ideas"), s => { ideas = s.docs.map(d => ({ id: d.id, ...d.data() })); live = true; status(""); renderSoon() }, denied));
  unsubs.push(onSnapshot(doc(db, "meta", "focus"), s => { const d = s.exists() ? s.data() : {}; focusId = d.projectId || null; activeMap = d.active || {}; renderSoon() }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "chat"), orderBy("at"), limitToLast(300)), s => {
    const before = chat.length ? chat[chat.length - 1].at : 0;
    chat = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const newest = chat.length ? chat[chat.length - 1] : null;
    const k0 = newest && newest.ch === "ideas" ? "ideas" : "team", lvl = notifyOf(k0), ment = mentionsMe(newest), heard = lvl === "all" || ment;
    if (before && newest && newest.at > before && newest.by !== me && heard) chime();
    if (before && newest && newest.at > before && newest.by !== me && heard && (chatKey() !== k0 || document.hidden)) ping({ key: "chat:" + newest.id, who: newest.by, title: realName(newest.by) || keyTitle(k0), sub: k0 === "ideas" ? "Ideas" : "Team chat", text: (ment ? "Mentioned you: " : "") + msgSummary(newest), go: chatHash(k0), at: newest.at });
    renderSoon();
  }, () => {}));
  // my own "typing…" coming back from the database changes nothing on screen, so it doesn't redraw
  const metaSig = m => JSON.stringify({ ...m, typing: Object.fromEntries(Object.entries(m.typing || {}).map(([k, v]) => [k, Object.keys(v || {}).filter(u => u !== me).sort()])) });
  unsubs.push(onSnapshot(doc(db, "meta", "chat"), s => { const nm = { pins: {}, typing: {}, ...(s.exists() ? s.data() : {}) }, same = metaSig(nm) === metaSig(chatMeta); chatMeta = nm; if (!same) renderSoon() }, () => {}));
  // private messages: the conversations I'm in
  // a partner can start a private chat too, so a brand-new conversation also chimes (just not the ones already there on load)
  let dmFirst = true;
  unsubs.push(onSnapshot(query(collection(db, "dms"), where("members", "array-contains", me)), s => {
    const before = Object.fromEntries(dmThreads.map(t => [t.id, t.lastAt || 0])), first = dmFirst; dmFirst = false;
    const isNew = t => t.lastBy && t.lastBy !== me && (before[t.id] !== undefined ? (t.lastAt || 0) > before[t.id] : !first);
    const dmSig = list => JSON.stringify(list.map(t => ({ ...t, typing: Object.keys(t.typing || {}).filter(u => u !== me).sort() })));
    const sigOld = dmSig(dmThreads);
    dmThreads = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const quiet = dmSig(dmThreads) === sigOld;
    if (dmThreads.some(isNew)) chime();
    for (const t of dmThreads) if (isNew(t) && (route().dm !== otherOf(t) || document.hidden))
      ping({ key: "dm:" + t.id + ":" + t.lastAt, who: t.lastBy, title: realName(t.lastBy) || (t.names || {})[t.lastBy] || "Private message", sub: "Private", text: t.lastText || "", go: "dm-" + t.lastBy, at: t.lastAt });
    if (!quiet) renderSoon();
  }, () => { dmOff = true; renderSoon() }));
  unsubs.push(onSnapshot(collection(db, "users"), s => { people = {}; s.docs.forEach(d => people[d.id] = d.data()); syncLookFromAccount(); crewSoon(); renderSoon() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "money"), s => { moneyRules = s.exists() ? s.data() : null; ensureMoneyRules(); renderSoon(QUIET) }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "fund"), s => { fundDoc = s.exists() ? s.data() : null; renderSoon(QUIET) }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "nicks"), s => { nicks = s.exists() ? Object.fromEntries(Object.entries(s.data()).filter(([, v]) => typeof v === "string" && v)) : {}; crewSoon(); renderSoon() }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "news"), s => { newsDoc = s.exists() ? s.data() : null; renderSoon(QUIET) }, () => {}));
  unsubs.push(onSnapshot(doc(db, "meta", "weekly"), s => { weeklyDoc = s.exists() ? s.data() : {}; maybeWeekly() }, () => {}));
  pushBaseline = null;
  unsubs.push(onSnapshot(doc(db, "meta", "push"), s => { pushConfig(s.exists() ? s.data() : null); renderSoon(QUIET) }, () => {}));
  teamLoaded = false; teamDoc = null;
  unsubs.push(...partnerTeamSubs(), ...clientTeamSubs());
  unsubs.push(onSnapshot(doc(db, "meta", "upgrades"), s => { upgradesDoc = s.exists() ? s.data() : null; renderSoon(QUIET) }, () => {}));
  // everyone on the team reads the team list (the rules allow it), so creators show up for all; only the admin changes it
  unsubs.push(onSnapshot(doc(db, "meta", "team"), s => { teamDoc = s.exists() ? s.data() : null; teamLoaded = true; ensureTeamDoc(); crewSoon(); renderSoon() }, () => { teamLoaded = true; renderSoon() }));
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
  privUnsubs.push(onSnapshot(collection(db, "private", me, "tasks"), s => { privErr = false; personal = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon(QUIET) }, fail));
  privUnsubs.push(onSnapshot(collection(db, "private", me, "notes"), s => {
    privErr = false;
    myNotes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0));
    // Don't redraw while typing in a note, so the cursor doesn't jump.
    const a = document.activeElement; if (!(a && a.classList && a.classList.contains("pnote"))) renderSoon();
  }, fail));
}

/* ---------- saved copy on this device, for instant start ---------- */

const CACHE = "pitchroom-cache-v1";
let cacheT = null;
function saveCache() {
  if (!me || !live) return;
  clearTimeout(cacheT);
  // written when the phone is idle, so it never holds up a tap or scrolling
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 4000 }) : f => setTimeout(f, 0);
  cacheT = setTimeout(() => idle(() => {
    const data = { me, isAdmin, myProfile, ideas, people, focusId, activeMap, personal, chat: chat.slice(-40) };
    try { localStorage.setItem(CACHE, JSON.stringify(data)) }
    catch { try { data.chat = []; localStorage.setItem(CACHE, JSON.stringify(data)) } catch { } }
  }), 1500);
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

// A project's tasks, worked out once per version of the project (each database update brings a new project object)
const tasksMemo = new WeakMap();
function tasksOf(p) {
  let out = p && typeof p === "object" ? tasksMemo.get(p) : null;
  if (!out) {
    out = [];
    for (const [field, phaseDefault] of [["tasks", "build"], ["steps", "build"]]) {
      for (const [id, t] of Object.entries((p && p[field]) || {})) if (t && t.text) out.push({ id, field, ...t, phase: t.phase || phaseDefault, path: `${field}.${id}` });
    }
    out.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (p && typeof p === "object") tasksMemo.set(p, out);
  }
  return out.slice();
}
const progressOf = list => { const d = list.filter(t => t.done).length; return { total: list.length, done: d, pct: pctOf(d, list.length) } };
// The team is only team members: anyone who is a partner or a client never counts, even if they have a profile
// (for example from signing in once before they were added as a partner).
// Speed: these are asked thousands of times per redraw, so each answer is kept until the people, partner or
// client lists change (each database update brings new lists, so a changed list is a new object).
let teamMemo = { deps: [], outsiders: null, uids: new Map() };
const teamDeps = () => [people, pMembers, cProjects, me, partnerMode, clientMode];
const sameDeps = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const teamMemoNow = () => { const d = teamDeps(); if (!sameDeps(d, teamMemo.deps)) teamMemo = { deps: d, outsiders: null, uids: new Map() }; return teamMemo };
const outsiderEmails = () => { const tm = teamMemoNow(); return tm.outsiders || (tm.outsiders = new Set([...pMembers.map(m => (m.id || m.email || "").toLowerCase()), ...cProjects.flatMap(c => [...(c.clients || []), ...(c.partners || [])].map(e => String(e).toLowerCase()))])) };
const isTeamUid = u => {
  if (u === me && !partnerMode && !clientMode) return true;
  const tm = teamMemoNow(); let v = tm.uids.get(u);
  if (v === undefined) { const e = ((people[u] || {}).email || "").toLowerCase(); v = !pMembers.some(m => m.uid === u) && !(e && outsiderEmails().has(e)); tm.uids.set(u, v) }
  return v;
};
const teamIds = () => Object.keys(people).filter(isTeamUid).sort((a, b) => a === me ? -1 : b === me ? 1 : name(a).localeCompare(name(b)));
const topSkills = id => { const s = (people[id] || {}).skills; if (!s) return []; return SKILL_IDS.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0)).slice(0, 2) };

/* ---------- smart helper: who should do what ---------- */

function suggest(p) {
  const tasks = tasksOf(p);
  const open = tasks.filter(t => !t.done && !t.owner);
  const pool = teamOf(p);
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

// Database updates often arrive several at once (especially at start): they share one redraw per screen frame
// ncDirty: the open chat's messages need drawing again. Updates that have nothing to do with chats
// (money, partners, notes…) pass QUIET, so an open chat isn't rebuilt for them.
let renderQ = 0, ncDirty = true;
const QUIET = "quiet", FROM_Q = { q: 1 };
function renderSoon(q) { if (q !== QUIET) ncDirty = true; if (renderQ) return; renderQ = document.hidden ? setTimeout(() => { renderQ = 0; render(FROM_Q) }, 30) : requestAnimationFrame(() => { renderQ = 0; render(FROM_Q) }) }
function render(from) { if (from !== FROM_Q) ncDirty = true; if (renderQ) { cancelAnimationFrame(renderQ); clearTimeout(renderQ); renderQ = 0 } if (!me) return; if (partnerMode) { renderPortal(); return } if (clientMode) { renderClient(); return } keepInputs(renderAll) }

let earnSyncT = null;
function syncPartnerEarnings() {
  if (!isAdmin || !live || !pLoaded) return;
  clearTimeout(earnSyncT);
  earnSyncT = setTimeout(() => {
    const all = allMoney();
    for (const m of pMembers) {
      const x = all.partners[m.id] || { earned: 0, paid: 0, deals: [] };
      const e = { earned: x.earned, paid: x.paid, deals: x.deals.map(d => ({ title: d.title, earned: d.earned, paid: d.paid })) };
      const old = m.earnings ? { earned: m.earnings.earned, paid: m.earnings.paid, deals: m.earnings.deals || [] } : { earned: 0, paid: 0, deals: [] };
      if (JSON.stringify(e) !== JSON.stringify(old)) updateDoc(doc(db, "pmembers", m.id), { earnings: { ...e, at: Date.now() } }).catch(() => {});
    }
  }, 2000);
}
function renderAll() {
  sheetUsed = false;
  syncPartnerEarnings(); if (live) { syncClientPay(); fixOldTeams() } renderSearch(); renderMore(); maybeWeekly();
  const voting = ideas.filter(i => i.status === "voting").sort((a, b) => b.createdAt - a.createdAt);
  const removed = ideas.filter(i => i.status === "removed");
  const projects = ideas.filter(i => i.status === "approved").sort((a, b) => (a.approvedAt || 0) - (b.approvedAt || 0));
  fillComposeCats();
  { const ci = $("#c-ideas"); if (ci) ci.textContent = voting.length } $("#c-projects").textContent = projects.length;
  const r = route();
  if (r.view === "ideas") renderIdeas(voting, removed);
  if (r.view === "projects") renderProjects(projects);
  if (r.view === "project") renderProjectPage(ideas.find(p => p.id === r.id && (p.status === "approved" || p.status === "completed")));
  if (r.view === "skills") renderSkills();
  if (r.view === "settings") renderSettings();
  if (r.view === "money") renderMoneyPage();
  if (r.view === "me") renderMe();
  if (r.view === "agent") { agWire(); renderAgent() } else if (document.documentElement.classList.contains("ag-lock")) { document.documentElement.classList.remove("ag-lock"); $("#view-agent").style.height = "" }
  if (r.view === "partners") renderPartnersTeam(r.gid); else if (leadOpen) renderLeadDrawer();
  { const pu = pGroups.reduce((a, g) => a + partnerUnread(g.id), 0); const pc = $("#c-partners"); pc.hidden = !pu; pc.textContent = pu > 9 ? "9+" : pu }
  { const v = rulesNow().version || 1, need = dealProjects().length && ((people[me] || {}).moneyAgreed || {}).version !== v ? 1 : 0;
    const late = dealProjects().filter(p => canPlan(p) && p.status === "approved").reduce((a, p) => a + moneyOf(p).late.length, 0);
    const mc = $("#c-money"); mc.hidden = !(late + need); mc.textContent = late + need > 9 ? "9+" : late + need; mc.title = [late ? `${late} late payment${late > 1 ? "s" : ""}` : "", need ? "Money rules to agree" : ""].filter(Boolean).join(" · ") }
  const open = myTasks().filter(x => !x.t.done && !x.closed && (x.personal || !isBlocked(x.p, x.t))).length; const mc = $("#c-mine"); mc.hidden = !open; mc.textContent = open;
  renderAlerts();
  pushTick();
  renderAssistant();
  renderUniversalProblemPop();
  const meAv = $("#me-av"); const src = (people[me] || {}).pic || (myProfile && myProfile.photo) || (people[me] || {}).photo || AV; if (meAv.getAttribute("src") !== src) meAv.src = src;
  sheetCleanup();
  saveCache();
  renderChat();
}

/* ----- a project's team board: tasks, this week, meetings ----- */

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const weekKey = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ymd(x) };
const weekLabel = k => k === weekKey() ? "This week" : "Week of " + fmtDate(k);
const teamOf = p => projTeam(p).sort((a, b) => a === me ? -1 : b === me ? 1 : name(a).localeCompare(name(b)));

let projTab = "tasks", showSettings = null, planEdit = null;
const taskFilter = {};   // project id -> person id whose tasks to show

// A project's page, top to bottom: what it is and how it's doing, its stages, what to do now, then the work.
const stageOpen = new Set();   // "<project>:<stage>" stages opened by a tap (finished and later stages start folded)
let onlyMine = false;
function renderProjectPage(p) {
  const box = $("#project"); box.replaceChildren();
  const back = el("button", { class: "pp-back", onclick: () => { location.hash = p && p.status === "completed" ? "projects-done" : "projects" } }, nIc("back"), "Projects");
  if (!p) { box.append(el("div", { class: "pp-top" }, back), el("div", { class: "empty" }, "This project isn't on the board anymore.")); return }
  const tasks = tasksOf(p), team = teamOf(p), joined = team.includes(me), planner = canPlan(p);
  const done = p.status === "completed", st = stageMap(p), h = projHealth(p, st);
  const settingsOpen = showSettings === p.id;
  const asked = !!(p.joinReqs || {})[me], invited = (p.invites || {})[me];

  box.append(el("div", { class: "pp-top" }, back, el("span", { class: "spacer" }),
    p.status === "approved" ? el("button", { class: "pp-ic", title: "Project chat", "aria-label": "Project chat", onclick: () => { location.hash = "pc-" + p.id } }, nIc("chat")) : null,
    planner || joined ? el("button", { class: "pp-ic", title: settingsOpen ? "Close settings" : "Project settings", "aria-label": settingsOpen ? "Close settings" : "Project settings", "aria-expanded": String(settingsOpen), onclick: () => { showSettings = settingsOpen ? null : p.id; render() } }, nIc(settingsOpen ? "x" : "more")) : null));
  const client = clientOf(p);
  box.append(el("header", { class: "pp-head" },
    el("div", { class: "pp-chips" }, typeChip(p), healthChip(h), p.priority === "urgent" || p.priority === "high" ? prioChip(p) : null),
    el("h1", { class: "pp-title" }, p.title),
    client && !String(p.title || "").toLowerCase().includes(client.toLowerCase()) ? el("div", { class: "pp-client" }, "Client · ", el("b", {}, client)) : null,
    p.pitch ? el("p", { class: "pp-pitch" }, p.pitch) : null,
    h.why ? el("p", { class: "pp-why" }, h.why) : null));
  if (done) box.append(el("div", { class: "paused-line pp-line" }, el("span", {}, `Completed ${fmtDay(p.completedAt)}.`), el("span", { class: "spacer" }), planner ? el("button", { class: "btn small", onclick: () => reopenProject(p) }, "Reopen") : null));
  if (isPaused(p)) box.append(el("div", { class: "paused-line pp-line" }, el("span", {}, `On hold since ${fmtDay(p.paused.at)}. Its tasks wait until it's resumed.`), el("span", { class: "spacer" }), planner ? el("button", { class: "btn primary small", onclick: () => resumeProject(p) }, "Resume") : null));
  if (settingsOpen) box.append(projectSettings(p, { planner, joined, done }));
  box.append(...teamNotices(p, { joined, planner, done, asked, invited }));
  if (!done && !joined && !invited) box.append(el("div", { class: "row", style: "margin:0 0 14px" }, el("span", { class: "spacer" }), asked
    ? el("button", { class: "btn quiet", onclick: () => cancelAsk(p) }, "Asked to join · take it back")
    : el("button", { class: "btn primary", onclick: () => askToJoin(p) }, planner ? "Join the team" : "Ask to join the team")));

  const sp = stepper(p, st); if (sp) box.append(sp);
  const now = nowCard(p, st); if (now) box.append(now);

  const meetings = Object.values(p.meetings || {}).filter(Boolean).length;
  const tab = (id, label) => el("button", { "aria-pressed": String(projTab === id), onclick: () => { if (projTab !== id) closeForms(); projTab = id; render() } }, label);
  box.append(el("div", { class: "seg seg-wide pp-tabs", role: "group", "aria-label": "Show" },
    tab("tasks", "Tasks"), tab("money", "Money"), tab("share", "Client" + countNew(p.id)), tab("meet", "Notes" + (meetings ? " " + meetings : ""))));
  if (projTab === "share") { if (!inTeam(p)) { box.append(el("div", { class: "empty" }, "The client view is run by this project's team.")); return } return renderShare(box, p) }
  if (projTab === "week") return renderWeek(box, p, team);
  if (projTab === "meet") return renderMeetings(box, p);
  if (projTab === "money") return renderMoney(box, p);

  const mineCan = joined && tasks.some(t => isAssignee(t, me));
  box.append(planBody(p, { filter: onlyMine && mineCan ? me : null, st, canFilter: mineCan }));
  box.append(el("div", { class: "pp-links" }, linksBlock(p)));
  box.append(teamRow(p, team));
}
const typeChip = p => el("span", { class: "tchip" }, clientOf(p) ? "Client work" : "Our own");
const healthChip = h => el("span", { class: "hchip h-" + h.id }, h.label);
const listNames = us => { const n = us.map(u => u === me ? "you" : cap(firstName(u))); return n.length > 2 ? n.slice(0, -1).join(", ") + " and " + n[n.length - 1] : n.join(" and ") };
function teamRow(p, team) {
  const pls = plannerIds(p).filter(u => people[u] || u === me);
  return el("div", { class: "pp-team" }, el("span", { class: "stack" }, team.slice(0, 6).map(av)),
    el("span", { class: "txt" }, `${team.length} on the team` + (pls.length ? ` · planned by ${listNames(pls)}` : "")),
    canPlan(p) || team.includes(me) ? el("button", { class: "linkbtn", onclick: () => { showSettings = p.id; render(); scrollTo({ top: 0, behavior: "smooth" }) } }, "Team") : null);
}

// Where each stage stands: done (all its tasks done), now (the first one with work left), next (the ones after it)
function stageMap(p) {
  const tasks = tasksOf(p);
  const list = getPhases(p).map((ph, i) => { const ts = tasks.filter(t => t.phase === ph.id); return { ph, i, tasks: ts, total: ts.length, open: ts.filter(t => !t.done).length } });
  const lastWithTasks = list.reduce((m, s) => s.total ? s.i : m, -1);
  const cur = list.find(s => s.open > 0) || list.find(s => !s.total && s.i > lastWithTasks) || null;
  for (const s of list) s.state = !cur || s.i < cur.i ? (s.total ? "done" : "skip") : s === cur ? "now" : "next";
  return { list, cur };
}
// How a project is doing, in one word, and why
function projHealth(p, st = stageMap(p)) {
  if (p.status === "completed") return { id: "done", label: "Completed" };
  if (isPaused(p)) return { id: "hold", label: "On hold" };
  if (!st.list.length) return { id: "new", label: "No plan yet" };
  const today = todayStr(), now = Date.now(), open = tasksOf(p).filter(t => !t.done && !taskHeld(p, t));
  const stale = open.filter(t => inCheck(t) && now - (t.review.at || now) > 2 * 864e5).sort((a, b) => a.review.at - b.review.at)[0];
  if (stale) return { id: "stuck", label: "Stuck", why: `“${stale.text}” has waited ${Math.floor((now - stale.review.at) / 864e5)} days for a check.` };
  const late = open.filter(t => t.due && t.due < today && !inCheck(t));
  if (late.length >= 3) return { id: "stuck", label: "Stuck", why: `${late.length} tasks are late.` };
  if (late.length) return { id: "attn", label: "Needs attention", why: late.length > 1 ? `${late.length} tasks are late.` : `“${late[0].text}” is late.` };
  const cur = st.cur;
  if (cur && cur.ph.due && cur.ph.due < today && cur.open) return { id: "attn", label: "Needs attention", why: `${cur.ph.name} was due ${fmtDate(cur.ph.due)}.` };
  const nobody = cur ? cur.tasks.filter(t => !t.done && !assignees(t).length).length : 0;
  if (nobody) return { id: "attn", label: "Needs attention", why: `${nobody} task${nobody > 1 ? "s" : ""} in ${cur.ph.name} ${nobody > 1 ? "have" : "has"} nobody yet.` };
  if (!cur) return { id: "ok", label: "Ready to deliver" };
  return { id: "ok", label: "On track" };
}
// The next task for someone: theirs, not waiting for anything, earliest stage first
function nextFor(p, u = me) {
  const order = Object.fromEntries(getPhases(p).map((ph, i) => [ph.id, i]));
  return tasksOf(p).filter(t => !t.done && isAssignee(t, u) && !inCheck(t) && !isBlocked(p, t) && !taskHeld(p, t))
    .sort((a, b) => (order[a.phase] ?? 99) - (order[b.phase] ?? 99) || taskPrioRank(a) - taskPrioRank(b) || (a.due || "9999").localeCompare(b.due || "9999") || (a.order || 0) - (b.order || 0))[0] || null;
}
const checksFor = p => tasksOf(p).filter(t => canCheck(p, t) && t.review.by !== me).sort((a, b) => a.review.at - b.review.at);

function stepper(p, st) {
  if (!st.list.length) return null;
  return el("nav", { class: "stepper", "aria-label": "Stages" }, st.list.map(s => el("button", { class: "step " + s.state, "aria-current": s.state === "now" ? "step" : null, title: s.ph.name, onclick: () => openStage(p, s) },
    el("span", { class: "dot" }, s.state === "done" ? nIc("check", "sm") : String(s.i + 1)), el("span", { class: "sl" }, s.ph.name))));
}
function openStage(p, s) {
  if (s.state !== "now") stageOpen.add(p.id + ":" + s.ph.id);
  if (projTab !== "tasks") { closeForms(); projTab = "tasks" }
  onlyMine = false; render();
  setTimeout(() => { const n = document.getElementById("stage-" + s.ph.id); if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }) }, 60);
}

// The Now card: your next task, who's waiting for it, and the checks waiting for you
function nowCard(p, st) {
  if (p.status !== "approved" || isPaused(p) || !inTeam(p) || !st.list.length) return null;
  const t = nextFor(p), checks = checksFor(p), cur = st.cur;
  const card = el("section", { class: "pnow", "aria-label": "Now" },
    el("div", { class: "pnow-h" }, el("span", { class: "pnow-k" }, "Now"), el("span", { class: "spacer" }),
      el("span", { class: "pnow-s" }, cur ? cur.ph.name + (cur.ph.due ? " · due " + fmtDate(cur.ph.due) : "") : "All stages done")));
  if (t) {
    const key = "p:" + t.id;
    const waiters = [...new Set(waitingOn(p, t).filter(x => !x.done).flatMap(assignees))].filter(u => u !== me);
    const inStage = st.list.find(s => s.ph.id === t.phase);
    const sub = waiters.length ? `${listNames(waiters)} ${waiters.length > 1 ? "are" : "is"} waiting for this` : t.due ? dueText(t.due, false) : inStage && inStage !== cur ? "In " + inStage.ph.name : "";
    card.append(el("div", { class: "pnow-main" }, el("span", { class: "pnow-l" }, "Your next task"), el("span", { class: "pnow-t" }, t.text), sub ? el("span", { class: "pnow-l" }, sub) : null),
      el("div", { class: "pnow-acts" },
        el("button", { class: "b1", onclick: () => { openTask = key; delTask = null; waitPick = null; render() } }, "Open task"),
        el("button", { class: "b2", onclick: () => toggleDone(p, t, true, key) }, needsSend(p, t) ? "Done · send for a check" : "Mark done")));
  } else {
    const mineWaiting = tasksOf(p).find(x => !x.done && isAssignee(x, me) && !taskHeld(p, x) && (inCheck(x) || isBlocked(p, x)));
    let head = cur ? "Nothing waiting on you here" : "Every stage is done", sub = "";
    if (mineWaiting) {
      head = "Waiting for others";
      sub = inCheck(mineWaiting) ? `“${mineWaiting.text}” is waiting for ${checkWho(mineWaiting)} to check it` : `“${mineWaiting.text}” waits for ${ownerName(waitInfo(p, mineWaiting).open[0])}`;
    } else if (cur) {
      const busy = cur.tasks.find(x => !x.done && assignees(x).some(u => u !== me));
      const nobody = cur.tasks.filter(x => !x.done && !assignees(x).length).length;
      sub = busy ? `${listNames(assignees(busy).filter(u => u !== me))} ${assignees(busy).filter(u => u !== me).length > 1 ? "are" : "is"} on “${busy.text}”` : nobody ? `${nobody} task${nobody > 1 ? "s" : ""} in ${cur.ph.name} ${nobody > 1 ? "have" : "has"} nobody yet` : "";
    } else if (canPlan(p)) sub = "When it's delivered, mark the project completed in its settings.";
    card.append(el("div", { class: "pnow-main" }, el("span", { class: "pnow-t small" }, head), sub ? el("span", { class: "pnow-l" }, sub) : null));
  }
  if (checks.length) {
    const c = checks[0], key = "p:" + c.id;
    card.append(el("div", { class: "pnow-hr" }),
      el("div", { class: "pnow-chk" }, av(c.review.by), el("div", {}, el("b", {}, c.text), el("span", {}, `${cap(firstName(c.review.by))} finished it. It's yours to check` + (checks.length > 1 ? ` · ${checks.length - 1} more after this` : "")))),
      el("div", { class: "pnow-acts" },
        el("button", { class: "b1", onclick: () => approveCheck(p, c, key) }, "Looks good"),
        el("button", { class: "b2", onclick: () => { changesFor = key; openTask = key; render(); setTimeout(() => { const n = document.getElementById("chg-" + key); if (n) n.focus() }, 80) } }, "Needs changes")));
  }
  return card;
}

// The lines at the top of a project about its team: an invite for you, your request, or people asking to join.
function teamNotices(p, { joined, planner, done, asked, invited }) {
  const out = [];
  if (!joined && invited) out.push(el("div", { class: "notice teamnote" },
    el("span", { style: "flex:1 1 220px" }, `${invited.by === me ? "You were" : name(invited.by) + " invited you"} to join this project's team. On the team you can take tasks, tick them and earn from them.`),
    el("span", { class: "row", style: "gap:6px" }, el("button", { class: "btn small quiet", onclick: () => declineInvite(p) }, "No thanks"), el("button", { class: "btn small primary", onclick: () => acceptInvite(p) }, "Join the team"))));
  else if (!joined && !done && isProj(p)) out.push(el("div", { class: "notice teamnote soft" },
    el("span", {}, asked ? "You asked to join. A planner (" + plannerIds(p).map(firstName).join(", ") + ") will say yes or no. Until then you can look around and leave notes on tasks."
      : "You're not on this project's team. You can look around and leave notes on tasks. To take tasks and earn from it, ask to join.")));
  const reqs = planner ? joinReqsOf(p) : [];
  if (reqs.length) out.push(el("div", { class: "notice teamnote" }, el("b", { style: "flex-basis:100%" }, reqs.length > 1 ? `${reqs.length} people want to join the team` : "Someone wants to join the team"),
    reqs.map(r => el("div", { class: "row", style: "gap:8px;flex-basis:100%" }, av(r.u), el("span", { style: "flex:1" }, name(r.u) + " · asked " + ago(r.at)),
      el("button", { class: "btn small quiet", onclick: () => declineAsk(p, r.u) }, "No"), el("button", { class: "btn small primary", onclick: () => acceptAsk(p, r.u) }, "Accept")))));
  return out;
}

// Project settings, in the order people need them: details, people, status, and deleting last.
function projectSettings(p, { planner, joined, done }) {
  const set = el("section", { class: "idea settings projset" }, el("div", { class: "row" }, el("h3", {}, "Project settings")));
  const group = (title, sub, ...kids) => el("div", { class: "psgroup" }, el("div", { class: "set-h" }, el("h4", {}, title), sub ? el("p", {}, sub) : null), ...kids);
  if (planner) set.append(group("Details", null, renameBlock(p), catSelect(p), prioControl(p)));

  // people: planners shape the plan; the team is who works on it
  const members = teamOf(p), pls = plannerIds(p);
  const boss = isAdmin || p.author === me;
  const inv = invitesOf(p), reqs = joinReqsOf(p);
  const sending = teamIds().filter(u => invSending.has(p.id + ":" + u) && !inv.some(x => x.u === u) && !members.includes(u));
  const others = teamIds().filter(u => !members.includes(u) && !inv.some(x => x.u === u) && !sending.includes(u));
  set.append(group("People", "Planners change the plan, tasks and money, and accept who joins. The team is everyone working on it: only they take tasks and get paid from it.",
    plannersRow(p),
    el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Team:",
      members.map(u => el("span", { class: "planner" }, av(u), name(u), pls.includes(u) ? el("span", { class: "label" }, "planner") : null,
        planner && u !== me && u !== p.author && (!pls.includes(u) || boss) ? el("button", { class: "x", "aria-label": "Take " + name(u) + " off the team", onclick: () => offTeam(p, u, `${name(u)} is off this project's team`) }, "✕") : null)),
      planner && others.length && invitePick !== p.id ? el("button", { class: "btn small", onclick: () => { invitePick = p.id; render() } }, "+ Invite someone") : null),
    planner && others.length && invitePick === p.id ? el("div", { class: "row invpick", style: "gap:6px;font-size:13px;color:var(--muted)" }, "Tap who to invite:",
      others.map(u => el("button", { class: "planner invbtn", onclick: () => inviteToTeam(p, u) }, av(u), name(u), (p.joinReqs || {})[u] ? el("span", { class: "label" }, "asked to join") : null)),
      el("button", { class: "linkbtn", onclick: () => { invitePick = null; render() } }, "Done")) : null,
    inv.length || sending.length ? el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Invited, waiting for them to accept:",
      sending.map(u => el("span", { class: "planner soft" }, av(u), name(u), el("span", { class: "label" }, "sending…"))),
      inv.map(x => el("span", { class: "planner" }, av(x.u), name(x.u), planner ? el("button", { class: "x", "aria-label": "Take back the invite for " + name(x.u), onclick: () => cancelInvite(p, x.u) }, "✕") : null))) : null,
    planner && reqs.length ? el("div", { class: "row", style: "gap:8px;font-size:13px;color:var(--muted)" }, "Asked to join:",
      reqs.map(x => el("span", { class: "planner" }, av(x.u), name(x.u), el("button", { class: "linkbtn", onclick: () => acceptAsk(p, x.u) }, "Accept"), el("button", { class: "x", "aria-label": "Say no to " + name(x.u), onclick: () => declineAsk(p, x.u) }, "✕")))) : null,
    el("div", { class: "row" }, el("span", { class: "spacer" }), joined
      ? (p.author === me ? el("span", { class: "label" }, "You pitched it, so you're always on the team") : el("button", { class: "btn quiet small", onclick: () => offTeam(p, me, "You left the team") }, "Leave the team"))
      : (p.invites || {})[me] ? el("button", { class: "btn small primary", onclick: () => acceptInvite(p) }, "Accept the invite")
      : (p.joinReqs || {})[me] ? el("button", { class: "btn quiet small", onclick: () => cancelAsk(p) }, "Take back my request")
      : el("button", { class: "btn small", onclick: () => askToJoin(p) }, "Ask to join the team"))));

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
  if (p.money) { const r = moneyOf(p); if (r.expected > r.received && !r.proposal) out.push(`The client still owes ${fmtEGP(r.expected - r.received)}.`); const owed = Object.values(r.people).reduce((s, v) => s + Math.max(0, v.balance), 0); if (owed) out.push(`${fmtEGP(owed)} still has to be handed to the team.`); if (r.taskHeld) out.push(`${fmtEGP(r.taskHeld)} is waiting for tasks that aren't ticked done.`) }
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
    for (const t of tasksOf(p)) taskFilesOf(t).forEach(dropFileParts);
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
    write(() => upd(p.id, { title: t, pitch: d, client: c || DEL() }), "Saved").then(ok => { if (ok) { showSettings = null; render() } });
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
  projTab = "tasks"; pendingTab = "tasks"; taskFilter[p.id] = null;
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
  if (!members.includes(me) && !mine) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Check-ins are for this project's team. Ask to join the team to add yours."));
  else if (!mine || editCheckin === p.id) {
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
// Turn the lines of meeting notes into tasks: pick the lines, the phase, and who (guessed from names in the line).
let meetTasks = null;
function meetingTasksForm(p, m) {
  const lines = (m.text || "").split(/\n+/).map(t => t.replace(/^\s*([-*\u2022]|\d+[.)])\s*/, "").trim()).filter(t => t.length > 2).slice(0, 30);
  const bullets = new Set((m.text || "").split(/\n+/).filter(t => /^\s*([-*\u2022]|\d+[.)])\s/.test(t)).map(t => t.replace(/^\s*([-*\u2022]|\d+[.)])\s*/, "").trim()));
  const team = teamOf(p), guess = t => team.find(u => { const f = (realName(u) || "").split(" ")[0]; return f && new RegExp("\\b" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(t) }) || "";
  const phases = getPhases(p);
  const ph = el("select", { class: "mini", "aria-label": "Phase" }, phases.length ? phases.map(x => el("option", { value: x.id }, x.name)) : el("option", { value: "" }, "No phases yet"));
  const rows = lines.map((t, i) => {
    const cb = el("input", { type: "checkbox", id: `mtk-${m.id}-${i}`, checked: bullets.has(t) || bullets.size === 0 });
    const who = el("select", { class: "mini", "aria-label": "Who" }, el("option", { value: "" }, "Who?"), team.map(u => el("option", { value: u, selected: guess(t) === u }, name(u))));
    const tx = el("input", { class: "noteinput", value: t, maxlength: "140", "aria-label": "Task" });
    return { cb, who, tx, el: el("div", { class: "mtrow" }, cb, tx, who) };
  });
  const add = () => {
    const pick = rows.filter(r => r.cb.checked && r.tx.value.trim()); if (!pick.length) { toast("Tick at least one line"); return }
    const now = Date.now(), data = {};
    pick.forEach((r, i) => { data["tasks." + uid()] = { text: r.tx.value.trim(), phase: ph.value || "", skill: null, owner: r.who.value || null, assignedBy: me, assignedAt: now, done: false, order: now + i, due: null, fromMeeting: m.id } });
    meetTasks = null; write(() => upd(p.id, data), `${pick.length} task${pick.length > 1 ? "s" : ""} added to the plan`);
  };
  return el("div", { class: "goalform" }, el("div", { class: "row" }, el("b", {}, "Make tasks"), el("span", { class: "spacer" }), el("label", { class: "row", style: "gap:6px;font-size:13px;color:var(--muted)" }, "Phase", ph)),
    lines.length ? rows.map(r => r.el) : el("p", { class: "label" }, "No lines to turn into tasks."),
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { meetTasks = null; render() } }, "Cancel"), el("button", { class: "btn primary small", onclick: add }, "Add the ticked tasks")));
}
function renderMeetings(box, p) {
  const list = Object.entries(p.meetings || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.at - a.at);
  box.append(el("div", { class: "row", style: "margin-bottom:12px" }, el("p", { style: "margin:0;color:var(--muted);font-size:14px;flex:1 1 220px" }, "Notes from your calls and meetups, so nobody forgets what was decided."),
    newMeeting === p.id || !inTeam(p) ? null : el("button", { class: "btn primary", onclick: () => { newMeeting = p.id; editMeeting = null; render() } }, "New meeting notes")));
  if (newMeeting === p.id) box.append(meetingForm(p, null));
  if (!list.length && newMeeting !== p.id) box.append(el("div", { class: "empty" }, "No meeting notes yet."));
  const wrap = el("div", { class: "list", style: "margin-top:12px" });
  for (const m of list) {
    if (editMeeting === m.id) { wrap.append(meetingForm(p, m)); continue }
    const mine = m.by === me || canPlan(p);
    wrap.append(el("article", { class: "idea" },
      el("div", { class: "row" }, el("span", { class: "chip" }, fmtDay(new Date((m.date || todayStr()) + "T12:00").getTime())), el("span", { class: "spacer" }), el("span", { class: "by" }, av(m.by), name(m.by))),
      m.title ? el("h3", {}, m.title) : null,
      m.text ? el("div", { class: "pre" }, linkify(m.text)) : null,
      meetTasks === m.id ? meetingTasksForm(p, m) : null,
      mine ? el("div", { class: "row" }, canPlan(p) && m.text && meetTasks !== m.id ? el("button", { class: "btn small", onclick: () => { meetTasks = m.id; render() } }, "Make tasks from these notes") : null, el("span", { class: "spacer" }),
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
    // an idea can move once 2 people have voted: the person who pitched it plus one more, so nobody can push one through alone
    const team = Math.max(1, teamIds().length), need = Math.min(2, team), cast = k + d, enough = cast >= need;
    const verdict = el("span", { class: "verdict" + (enough ? (k > d ? " keep" : d > k ? " drop" : "") : "") },
      `${cast} of ${team} voted` + (!enough ? ` \u00b7 needs ${need - cast} more` : k > d ? " \u00b7 keep wins" : d > k ? " \u00b7 drop wins" : " \u00b7 tied"));
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
        el("button", { class: "btn", disabled: !(enough && d > k), title: `Available when at least ${need} of ${team} have voted and more said drop`, onclick: () => write(() => upd(i.id, { status: "removed" }), "Idea removed") }, "Remove"),
        confirmIdeaBtn(i, k, d, enough))));
  }
  const rb = $("#removed"); rb.replaceChildren();
  if (removed.length) {
    rb.append(el("details", { class: "removed" }, el("summary", {}, `Removed ideas (${removed.length})`),
      el("div", { class: "list" }, removed.map(i => el("article", { class: "idea" }, el("h3", {}, i.title), el("div", { class: "row" }, el("span", { class: "by" }, av(i.author), name(i.author)), el("span", { class: "spacer" }),
        ideaDeleteBtn(i),
        el("button", { class: "btn", onclick: () => write(() => upd(i.id, { status: "voting" }), "Back in the vote") }, "Bring back to vote")))))));
  }
}

// Only the person who pitched an idea confirms it to Projects, once enough people voted and Keep is ahead.
// Everyone who voted Keep joins the new project's team straight away, so planners don't have to invite them.
function confirmIdeaBtn(i, k, d, enough) {
  const ready = enough && k > d;
  if (i.author !== me) return ready ? el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, `Keep won. Waiting for ${firstName(i.author)} to confirm it`) : null;
  const joiners = voters(i, "keep").filter(u => u !== i.author && isTeamUid(u));
  return el("button", { class: "btn primary", disabled: !ready, title: ready ? (joiners.length ? `${joiners.map(firstName).join(", ")} voted Keep and join the team` : "") : "Available when enough people have voted and more said keep", onclick: () => confirmIdea(i) }, "Confirm → Projects");
}
function confirmIdea(i) {
  if (i.author !== me) return;
  const now = Date.now(), joiners = voters(i, "keep").filter(u => u !== i.author && isTeamUid(u));
  const data = { status: "approved", approvedAt: now, movedBy: me, teamV: 1 };
  for (const u of joiners) { data["members." + u] = true; data["joined." + u] = { by: me, at: now, vote: true }; data["joinReqs." + u] = DEL(); data["invites." + u] = DEL() }
  write(() => upd(i.id, data), joiners.length ? `It's a project now. ${joiners.map(u => name(u).split(" ")[0]).join(", ")} ${joiners.length > 1 ? "are" : "is"} on the team because they voted Keep` : "It's a project now. Plan it in Projects");
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
// What needs you today across all projects: checks waiting for you, and your tasks due today or late
function needsMe() {
  let checks = 0, due = 0; const today = todayStr();
  for (const p of ideas) {
    if (p.status !== "approved" || isPaused(p)) continue;
    for (const t of tasksOf(p)) {
      if (t.done || taskHeld(p, t)) continue;
      if (inCheck(t)) { if (canCheck(p, t) && t.review.by !== me) checks++ }
      else if (isAssignee(t, me) && t.due && t.due <= today) due++;
    }
  }
  return { checks, due };
}
const HEALTH_ORDER = { stuck: 0, attn: 1, new: 2, ok: 3, hold: 4, done: 5 };
function renderProjects(all) {
  const box = $("#projects"); box.replaceChildren();
  if (route().sub === "new") { catEls.projects.replaceChildren(); renderNewProject(box); return }
  if (location.hash === "#projects-done") projShow = "done";
  const done = ideas.filter(i => i.status === "completed").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const live = all.filter(p => !isPaused(p)), held = all.filter(isPaused);
  const nm = needsMe(), n = nm.checks + nm.due;
  const segBtn = (id, label) => el("button", { "aria-pressed": String(projShow === id), onclick: () => { projShow = id; if (location.hash === "#projects-done" && id !== "done") location.hash = "projects"; else render() } }, label);
  box.append(el("div", { class: "pl-head" },
    el("div", { class: "pl-acts" },
      el("button", { class: "btn primary", onclick: () => { location.hash = "new-project" } }, nIc("plus"), "New client project"),
      el("button", { class: "btn", onclick: () => { location.hash = "chat-ideas" } }, nIc("bulb"), "Pitch an idea")),
    n ? el("button", { class: "needs", onclick: () => { location.hash = "me" } }, nIc("clock"),
      el("span", {}, el("b", {}, "Needs you today"), el("span", { class: "nd" }, [nm.checks ? `${nm.checks} check${nm.checks > 1 ? "s" : ""} waiting` : "", nm.due ? `${nm.due} task${nm.due > 1 ? "s" : ""} due` : ""].filter(Boolean).join(" · "))), nIc("arrow")) : null,
    el("div", { class: "seg seg-wide", role: "group", "aria-label": "Show" }, segBtn("active", `Building ${live.length}`), segBtn("hold", `On hold ${held.length}`), segBtn("done", `Done ${done.length}`))));
  if (projShow === "done") { renderCompleted(box, done); catEls.projects.replaceChildren(); return }
  if (projShow === "hold") {
    catEls.projects.replaceChildren();
    if (!held.length) box.append(el("div", { class: "empty" }, "Nothing on hold. A planner can put a project on hold from its settings."));
    else box.append(el("div", { class: "list pl-list" }, held.map(p => projCard(p))));
    return;
  }
  box.append(catEls.projects);
  const sorted = live.map(p => ({ p, h: projHealth(p) })).sort((a, b) => prioRank(a.p) - prioRank(b.p) || HEALTH_ORDER[a.h.id] - HEALTH_ORDER[b.h.id] || (b.p.approvedAt || 0) - (a.p.approvedAt || 0)).map(x => x.p);
  const shown = catBar("projects", sorted);
  if (live.length && !shown.length) { box.append(el("div", { class: "empty" }, "No projects in this category.")); return }
  if (!shown.length) { box.append(el("div", { class: "empty" }, "No projects yet. Start a client project, or pitch an idea in the Ideas chat.")); return }
  box.append(el("div", { class: "list pl-list" }, shown.map(p => projCard(p))));
}

/* ----- a new client project: no vote (the client already said yes), a ready-made plan, and the team ----- */
const PROJECT_PLANS = [
  { id: "brand", name: "Brand identity · company profile", short: "Company profile", stages: [
    ["Brief", ["Collect the company's info, logo and photos", "Agree on the sections of the profile", ["Moodboard and references", 1]]],
    ["Design", [["Colour palette and fonts", 1], ["Cover page layout", 1], "Inside pages grid", "Icons and graphics"]],
    ["Content", ["Write the texts", "Choose and edit the photos", ["Proofread everything", 1]]],
    ["Print & deliver", ["Client review and changes", ["Final print PDF", 1], "Web PDF for WhatsApp and email", "Send the files to the client"]]] },
  { id: "web", name: "Website for a client", short: "Website", stages: [
    ["Brief", ["Collect the logo, photos and texts", "Agree on the pages", "List 3 websites they like"]],
    ["Design", [["Home page design", 1], ["Inner pages design", 1], "Phone version"]],
    ["Build", ["Build the pages", "Contact form and WhatsApp button", "Speed and Google basics", ["Test on phones and computers", 1]]],
    ["Launch", ["Connect the domain", "Client review and fixes", ["Go live", 1], "Show the client how to use it"]]] },
  { id: "ads", name: "Google Ads", short: "Google Ads", note: "Set up once, then the monthly routine", stages: [
    ["Setup", ["Get access to the client's Google Ads", ["Conversion tracking", 1], "Keywords and negative keywords", ["Write the ads", 1], "Set the budget and go live"]],
    ["This month", ["Check spend and leads every week", "Add negative keywords", "Test a new ad", ["Monthly report", 1], "Send the report to the client"]]] },
  { id: "social", name: "Social media month", short: "Social media", stages: [
    ["Plan", [["Content calendar for the month", 1], "Collect photos and info from the client"]],
    ["Make", [["Design the posts", 1], "Write the captions", "Make the reels"]],
    ["Post", ["Schedule the posts", "Reply to comments and messages", "Month results for the client"]]] },
  { id: "empty", name: "Start empty", short: "Project", stages: [] },
];
let npPlan = "brand", npTeam = new Set(), npBusy = false;
function renderNewProject(box) {
  const plan = PROJECT_PLANS.find(x => x.id === npPlan) || PROJECT_PLANS[0];
  const others = teamIds().filter(u => u !== me && people[u]);
  const client = el("input", { id: "np-client", maxlength: "80", placeholder: "Company or person", autocomplete: "off" });
  const title = el("input", { id: "np-title", maxlength: "80", placeholder: `e.g. ${plan.short}`, autocomplete: "off" });
  client.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); title.focus() } });
  box.append(el("div", { class: "np" },
    el("div", { class: "pp-top" }, el("button", { class: "pp-back", onclick: () => { location.hash = "projects" } }, nIc("back"), "Projects")),
    el("div", { class: "np-intro" }, el("h1", {}, "New client project"), el("p", {}, "The client already said yes, so there's no vote. Pick a plan, and change anything after.")),
    el("div", { class: "np-f" }, el("label", { for: "np-client" }, "Client"), client),
    el("div", { class: "np-f" }, el("label", { for: "np-title" }, "Project name (optional)"), title),
    el("div", { class: "np-f" }, el("span", { class: "np-k", id: "np-plan-l" }, "Ready-made plan"),
      el("div", { class: "np-plans", role: "radiogroup", "aria-labelledby": "np-plan-l" }, PROJECT_PLANS.map(x => el("button", { class: "np-plan", role: "radio", "aria-checked": String(x.id === plan.id), onclick: () => { npPlan = x.id; render() } },
        el("span", { class: "rd", "aria-hidden": "true" }),
        el("span", {}, el("b", {}, x.name), el("span", { class: "s" }, x.stages.length ? x.stages.map(s => s[0]).join(" → ") : "No stages yet. Build your own plan"),
          x.note ? el("span", { class: "s" }, x.note) : null,
          x.id === plan.id && x.stages.length ? el("span", { class: "s ok" }, `${x.stages.reduce((a, s) => a + s[1].length, 0)} tasks ready, with checks on the key ones`) : null))))),
    el("div", { class: "np-f" }, el("span", { class: "np-k" }, "Team"),
      el("div", { class: "np-team" }, el("span", { class: "np-who on" }, av(me), "You"),
        others.map(u => el("button", { class: "np-who", "aria-pressed": String(npTeam.has(u)), onclick: () => { if (npTeam.has(u)) npTeam.delete(u); else npTeam.add(u); render() } }, av(u), cap(firstName(u)))))),
    el("button", { class: "btn primary np-go", disabled: npBusy, onclick: () => createClientProject(client.value, title.value, plan) }, npBusy ? "Creating…" : "Create project")));
}
function createClientProject(clientRaw, titleRaw, plan) {
  const client = String(clientRaw || "").trim().replace(/\s+/g, " ");
  if (!client) { toast("Type the client's name first"); const n = $("#np-client"); if (n) n.focus(); return }
  const title = String(titleRaw || "").trim().replace(/\s+/g, " ") || `${client} · ${plan.short}`;
  const now = Date.now(), id = uid(), team = [me, ...[...npTeam].filter(u => u !== me && isTeamUid(u))];
  const data = { title, pitch: "", client, category: "Client work", categories: ["Client work"], author: me, createdAt: now, status: "approved", approvedAt: now, movedBy: me, teamV: 1,
    votes: { [me]: "keep" }, backers: {}, tasks: {}, phases: {}, members: {}, joined: {} };
  for (const u of team) { data.members[u] = true; data.joined[u] = { by: me, at: now } }
  plan.stages.forEach(([nm, list], i) => {
    const phid = uid() + i; data.phases[phid] = { name: nm, order: i + 1, due: null };
    list.forEach((x, j) => {
      const [text, chk] = Array.isArray(x) ? x : [x, 0];
      data.tasks[uid() + i + "x" + j] = { text, phase: phid, skill: null, owner: null, assignedBy: me, assignedAt: now, done: false, order: now + i * 100 + j, due: null, ...(chk ? { checker: PLANNERS, checkerBy: me } : {}) };
    });
  });
  npBusy = true; render();
  write(() => setDoc(doc(db, "ideas", id), data), plan.stages.length ? "Project created. Now give each task to someone" : "Project created. Add its first stage").then(ok => {
    npBusy = false;
    if (!ok) { render(); return }
    npTeam = new Set(); projTab = "tasks"; pendingTab = "tasks";
    for (const sel of ["#np-client", "#np-title"]) { const n = $(sel); if (n) n.value = "" }
    location.hash = "project-" + id;
  });
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
  const canAdd = inTeam(p) && (p.status !== "completed" || canPlan(p));
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
    if (f.size > (isImg ? MAX_IMAGE_IN : MAX_FILE)) { toast(`${f.name} is too big. The limit is 10 MB per file.`); continue }
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

// "Idea by Omar · Planned by Omar and Ahmed" on every project
function whoseLine(p, small) {
  const pls = plannerIds(p).filter(u => people[u] || u === me);
  if (!p.author && !pls.length) return null;
  const names = us => us.map(u => u === me ? "you" : firstName(u)).join(us.length > 2 ? ", " : " and ");
  return el("div", { class: "whose" + (small ? " small" : "") },
    p.author ? el("span", {}, av(p.author), "Idea by ", el("b", {}, p.author === me ? "you" : name(p.author))) : null,
    pls.length ? el("span", {}, el("span", { class: "stack" }, pls.slice(0, 4).map(av)), "Planned by ", el("b", {}, names(pls))) : null);
}
// A project on the list: what kind it is, how it's doing, which stage it's on, and your next task in it
function projCard(p) {
  const st = stageMap(p), h = projHealth(p, st), team = teamOf(p), cur = st.cur, n = st.list.length;
  const mine = p.status === "approved" && !isPaused(p) && inTeam(p) ? nextFor(p) : null;
  const foot = isPaused(p) ? el("span", { class: "txt" }, `On hold since ${fmtDay(p.paused.at)}`)
    : (h.id === "stuck" || h.id === "attn") && h.why ? el("span", { class: "txt" }, h.why)
    : mine ? el("span", { class: "txt" }, el("span", { class: "mut" }, "Your next: "), el("b", {}, mine.text))
    : el("span", { class: "txt mut" }, `${team.length} on the team`);
  return el("button", { class: "pcard", onclick: () => { location.hash = "project-" + p.id } },
    el("span", { class: "pc-top" }, typeChip(p), p.priority === "urgent" || p.priority === "high" ? prioChip(p) : null, healthChip(h)),
    el("span", { class: "pc-title" }, p.title),
    n ? el("span", { class: "pc-bars", "aria-hidden": "true" }, st.list.map(s => el("span", { class: s.state }))) : null,
    el("span", { class: "pc-line" }, !n ? (canPlan(p) ? "No plan yet · open it to make one" : "No plan yet")
      : cur ? [`Stage ${cur.i + 1} of ${n} · `, el("b", {}, cur.ph.name), cur.ph.due ? " · due " + fmtDate(cur.ph.due) : ""] : "All stages done"),
    el("span", { class: "pc-foot" }, foot, el("span", { class: "stack" }, team.slice(0, 4).map(av))));
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
  showSettings = null;
  write(async () => {
    await upd(p.id, { paused: { by: me, at: Date.now() } });
    if (activeMap[p.id] || focusId === p.id) { const data = { ["active." + p.id]: DEL() }; if (focusId === p.id) data.projectId = null; await updateDoc(doc(db, "meta", "focus"), data).catch(() => {}) }
  }, "Project paused. Its tasks are on hold");
}
function resumeProject(p) { showSettings = null; write(() => upd(p.id, { paused: DEL() }), "Project resumed. It's back in Up next") }
// A single phase can be paused too: its tasks go on hold (like a paused project) until a planner resumes it.
const phasePaused = (p, phid) => { const ph = p && p.phases && p.phases[phid]; return !!(ph && ph.name && ph.paused) };
const taskHeld = (p, t) => isPaused(p) || phasePaused(p, t.phase);
function pausePhase(p, ph) { write(() => phaseWrite(p, { [`phases.${ph.id}.paused`]: { by: me, at: Date.now() } }), `${ph.name} paused. Its tasks are on hold`) }
function resumePhase(p, ph) { write(() => phaseWrite(p, { [`phases.${ph.id}.paused`]: DEL() }), `${ph.name} resumed. Its tasks are back on`) }
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
  confirmDone = null; showSettings = null;
  write(async () => {
    await upd(p.id, { status: "completed", completedAt: Date.now(), completedBy: me });
    if (isAdmin && (activeMap[p.id] || focusId === p.id)) await updateDoc(doc(db, "meta", "focus"), { ["active." + p.id]: DEL(), ...(focusId === p.id ? { projectId: null } : {}) }).catch(() => {});
  }, p.title + " is completed. Well done!");
  celebrate();
  location.hash = "projects-done";
}
function reopenProject(p) { showSettings = null; write(() => upd(p.id, { status: "approved", completedAt: DEL(), completedBy: DEL() }), "Reopened. It's back in Projects") }
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
function fmtDay(at) { return at ? dayFmt.format(new Date(at)) : "" }

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
  const tasks = tasksOf(p), phases = getPhases(p), planner = canPlan(p), st = opts.st || stageMap(p);
  const wrap = el("div", { class: "pstages" });

  if (!phases.length) {
    if (!planner) {
      wrap.append(el("div", { class: "empty" }, el("h3", {}, "No plan yet"),
        el("p", { style: "margin:6px auto 0;max-width:46ch" }, `${name(p.author)} and the planners will add the stages and tasks here.`)));
      return wrap;
    }
    const suggested = templateFor(p.category);
    const card = el("section", { class: "idea", style: "gap:14px" },
      el("h3", {}, "Build the plan"),
      el("p", {}, "Split the project into stages, the big steps it goes through. Then add tasks inside each stage and give each one to someone. Start from scratch, or start from one of these and change anything:"),
      el("div", { class: "row", style: "gap:8px" }, PLAN_TEMPLATES.map(tp => el("button", { class: "btn" + (tp === suggested ? " primary" : ""), title: tp.phases.join(" → "), onclick: () => usePlanTemplate(p, tp) }, tp.name))),
      el("p", { style: "font-size:13px" }, "Each one only adds stage names, like " + suggested.phases.join(" → ") + ". You add the tasks."),
      addPhaseRow(p, phases, "Or type your first stage, e.g. Brainstorm"),
      el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Planned it with Claude or the assistant?"), el("button", { class: "btn small", onclick: () => openImport(p) }, "Import a plan")));
    if ((importState[p.id] || {}).open) wrap.append(importPanel(p));
    wrap.append(card);
    return wrap;
  }

  const editing = planner && planEdit === p.id;
  wrap.append(el("div", { class: "st-bar" }, el("h2", {}, "Stages"), el("span", { class: "spacer" }),
    opts.canFilter && !editing ? el("button", { class: "btn small" + (opts.filter ? " primary" : ""), "aria-pressed": String(!!opts.filter), onclick: () => { onlyMine = !onlyMine; render() } }, "Only mine") : null,
    planner && !opts.filter && !editing ? el("button", { class: "btn small", onclick: () => openImport(p) }, "Import") : null,
    planner && !opts.filter ? el("button", { class: "btn small" + (editing ? " primary" : ""), onclick: () => { planEdit = editing ? null : p.id; render() } }, editing ? "Done editing" : "Edit stages") : null));
  if (planner && (importState[p.id] || {}).open) wrap.append(importPanel(p));
  if (suggestions[p.id]) wrap.append(suggestPanel(p));
  if (planner && !opts.filter) { const rf = reviewFoldBox(p); if (rf) wrap.append(rf) }

  const show = t => !opts.filter || isAssignee(t, opts.filter);
  let fold = null, shown = 0;
  const flush = () => { if (fold) { wrap.append(fold); fold = null } };
  for (const s of st.list) {
    const list = s.tasks.filter(show);
    if (opts.filter && !list.length) continue;
    shown++;
    const k = p.id + ":" + s.ph.id, expanded = editing || !!opts.filter || s.state === "now" || stageOpen.has(k);
    if (expanded) { flush(); wrap.append(phaseCard(p, s.ph, s.i, phases, list, { editing, filtered: !!opts.filter, state: s.state, foldKey: !editing && !opts.filter && s.state !== "now" ? k : null })); continue }
    if (!fold) fold = el("div", { class: "sf" });
    fold.append(stageRow(p, s, k));
  }
  flush();
  const known = new Set(phases.map(ph => ph.id)), loose = tasks.filter(t => !known.has(t.phase) && show(t));
  if (loose.length) wrap.append(phaseCard(p, { id: "__loose", name: "Not in a stage" }, -1, phases, loose, { editing, filtered: !!opts.filter }));
  if (opts.filter && !shown && !loose.length) wrap.append(el("div", { class: "empty" }, "You don't have any tasks in this project yet."));
  if (editing) wrap.append(el("section", { class: "idea addphase" }, el("h3", {}, "Add a stage"), addPhaseRow(p, phases, "Stage name, e.g. Filming")));
  return wrap;
}
// A folded stage: one line, tap to open it
function stageRow(p, s, k) {
  const mp = moneyPhaseFor(p, s.ph.id);
  const bits = s.state === "done" ? [`${s.total} task${s.total > 1 ? "s" : ""} done`] : s.state === "skip" ? ["No tasks"]
    : [s.total ? `${s.total} task${s.total > 1 ? "s" : ""}` : "No tasks yet", s.ph.due ? "due " + fmtDate(s.ph.due) : ""];
  if (mp) bits.push("pays " + mp.name);
  if (s.ph.paused) bits.push("on hold");
  return el("button", { class: "sf-row " + s.state, id: "stage-" + s.ph.id, "aria-expanded": "false", onclick: () => { stageOpen.add(k); render() } },
    el("span", { class: "sd" }, s.state === "done" ? nIc("check", "sm") : String(s.i + 1)),
    el("span", { class: "sm" }, el("b", {}, s.ph.name), el("span", {}, " · " + bits.filter(Boolean).join(" · "))),
    nIc("down"));
}

function phaseCard(p, ph, n, phases, list, mode = {}) {
  const planner = canPlan(p), pr = progressOf(list), loose = ph.id === "__loose", isNow = mode.state === "now";
  const head = el("div", { class: "phase-h" });
  if (renamingPhase === p.id + ph.id) {
    const inp = el("input", { id: "rename-" + ph.id, class: "mini", value: ph.name, maxlength: "40", style: "font-size:15px;padding:6px 8px;flex:1 1 160px" });
    const save = () => { const v = inp.value.trim(); renamingPhase = null; if (v && v !== ph.name) write(() => phaseWrite(p, { [`phases.${ph.id}.name`]: v })); else render() };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } if (e.key === "Escape") { renamingPhase = null; render() } });
    setTimeout(() => { inp.focus(); inp.select() }, 0);
    head.append(inp, el("button", { class: "btn", onclick: save }, "Save"), el("button", { class: "btn quiet", onclick: () => { renamingPhase = null; render() } }, "Cancel"));
  } else {
    head.append(...[
      el("h3", {}, loose ? ph.name : `${n + 1} · ${ph.name}`),
      isNow && !mode.filtered ? el("span", { class: "nowtag" }, "Now") : null,
      ph.paused ? el("span", { class: "pill pill-paused" }, "On hold") : null,
      ph.due ? el("span", { class: "chip" }, "Due " + fmtDate(ph.due)) : null,
      el("span", { class: "spacer" }),
      list.length ? el("span", { class: "label" }, `${pr.done} of ${pr.total} done`) : null,
      mode.foldKey ? el("button", { class: "linkbtn", onclick: () => { stageOpen.delete(mode.foldKey); render() } }, "Fold") : null].filter(Boolean));
  }
  const sec = el("section", { class: "idea phase" + (isNow && !mode.filtered ? " now" : "") + (ph.paused && !loose ? " phase-paused" : ""), id: loose ? null : "stage-" + ph.id }, head);
  if (list.length && !mode.filtered) sec.append(el("div", { class: "ph-bar", "aria-hidden": "true" }, el("span", { style: `width:${pr.pct}%` })));
  const mp = loose ? null : moneyPhaseFor(p, ph.id);
  if (mp && !mode.filtered) sec.append(el("div", { class: "ph-pay" }, `Finishing this stage completes “${mp.name}” in Money.`));
  if (ph.paused && !loose) sec.append(el("div", { class: "paused-line" },
    el("span", {}, `On hold since ${ago(ph.paused.at)}. Its tasks wait until a planner resumes it.`),
    el("span", { class: "spacer" }),
    planner ? el("button", { class: "btn primary small", onclick: () => resumePhase(p, ph) }, "Resume") : null));
  if (planner && mode.editing && !loose && renamingPhase !== p.id + ph.id) {
    const due = el("input", { type: "date", class: "mini", "aria-label": "Finish this stage by", value: ph.due || "", onchange: e => write(() => phaseWrite(p, { [`phases.${ph.id}.due`]: e.target.value || null })) });
    const mph = isPhased(p.money) && canMoney(p) ? (() => { const cur = moneyPhaseFor(p, ph.id);
      const sel = el("select", { class: "mini", "aria-label": "Payment this stage completes", onchange: e => setMoneyPhase(p, ph.id, e.target.value) }, el("option", { value: "" }, "No payment"), (p.money.phases || []).filter(Boolean).map(x => el("option", { value: x.id }, x.name || "Payment")));
      sel.value = cur ? cur.id : ""; return el("label", { class: "row", style: "gap:6px" }, "Completes", sel) })() : null;
    const tools = el("div", { class: "phase-tools" },
      el("label", { class: "row", style: "gap:6px" }, "Finish by", due), mph,
      el("span", { class: "spacer" }),
      n > 0 ? el("button", { class: "linkbtn", "aria-label": "Move stage up", onclick: () => movePhase(p, phases, n, -1) }, "↑ Up") : null,
      n < phases.length - 1 ? el("button", { class: "linkbtn", "aria-label": "Move stage down", onclick: () => movePhase(p, phases, n, 1) }, "↓ Down") : null,
      el("button", { class: "linkbtn", onclick: () => { renamingPhase = p.id + ph.id; render() } }, "Rename"),
      ph.paused ? el("button", { class: "linkbtn", onclick: () => resumePhase(p, ph) }, "Resume")
        : el("button", { class: "linkbtn", title: "Put this stage's tasks on hold until a planner resumes it", onclick: () => pausePhase(p, ph) }, "Put on hold"),
      delPhase === p.id + ph.id
        ? el("button", { class: "linkbtn danger", onclick: () => deletePhase(p, ph, list) }, list.length ? `Delete the stage and its ${list.length} task${list.length > 1 ? "s" : ""}` : "Tap again to delete")
        : el("button", { class: "linkbtn danger", onclick: () => { delPhase = p.id + ph.id; render() } }, "Delete"));
    sec.append(tools);
  }
  if (!list.length) sec.append(el("p", { style: "font-size:14px" }, planner ? "No tasks yet. Add the first one below." : "No tasks yet."));
  // Open tasks first (most important first; ones you can start before ones still waiting). Done ones fold away under "N done".
  const sorted = [...list].sort((a, b) => (isBlocked(p, a) - isBlocked(p, b)) || taskPrioRank(a) - taskPrioRank(b) || (a.order || 0) - (b.order || 0));
  for (const t of sorted.filter(t => !t.done)) sec.append(taskItem(p, t, "p", { people: "always" }));
  const doneList = sorted.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)), dk = p.id + ":" + ph.id;
  if (doneList.length) {
    const keepOpen = shownDone.has(dk) || doneList.some(t => openTask === "p:" + t.id);
    sec.append(el("details", { class: "donefold", open: keepOpen, ontoggle: e => { if (e.target.open) shownDone.add(dk); else shownDone.delete(dk) } },
      el("summary", {}, `✓ ${doneList.length} done`, el("span", { class: "label" }, keepOpen ? "tap to hide" : "tap to see them")),
      doneList.map(t => taskItem(p, t, "p", { people: "always" }))));
  }
  if (planner && !loose && !mode.filtered) sec.append(addTaskRow(p, ph));
  return sec;
}

function addTaskRow(p, ph) {
  const tid = `add-${p.id}-${ph.id}`;
  const inp = el("input", { id: tid, placeholder: "Add a task to " + ph.name, maxlength: "140", "aria-label": "Add a task to " + ph.name });
  const who = el("select", { class: "mini", id: tid + "-who", "aria-label": "Who does it" }, el("option", { value: "" }, "Who?"), teamOf(p).map(u => el("option", { value: u }, name(u))));
  const size = canPlan(p) ? el("select", { class: "mini", id: tid + "-size", "aria-label": "Size" }, el("option", { value: "" }, "Size?"), TASK_SIZES.map(z => el("option", { value: z.id }, `${z.id} · ${ptsText(z.pts)} (${z.time.replace("More than ", "over ").toLowerCase()})`))) : null;
  const add = () => {
    const text = inp.value.trim(); if (!text) return; inp.value = "";
    const sz = size && size.value ? { size: size.value, sizeBy: me, sizeAt: Date.now() } : {};
    write(() => upd(p.id, { ["tasks." + uid()]: { text, phase: ph.id, skill: null, owner: who.value || null, assignedBy: me, assignedAt: Date.now(), done: false, order: Date.now(), due: null, ...sz } }));
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add() } });
  return el("div", { class: "padd", style: "margin:6px 0 0" }, el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, inp, el("button", { class: "btn", onclick: add }, "Add")),
    el("div", { class: "padd-more row", style: "gap:8px;font-size:13px;color:var(--muted)" }, el("label", { for: who.id }, "Who does it?"), who, size ? el("label", { for: size.id }, "Size") : null, size));
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

/* Tidy up: tasks like "Review the logo" that only exist to check another task become a check on that task.
   Their person becomes the checker, their notes and files move over, and tasks that waited for them wait for the original. */
const REVIEW_EN = /^\s*(?:review(?:ing)?|re-?check|double[- ]?check|check(?:ing)?|proof-?read(?:ing)?|qa|test(?:ing)?|approve|give feedback on|feedback on|look over|go over|rag[ae]3|ra2g[ae]3|morag[ae]3a|moraga3a|shayy?ek)\b/i;
const REVIEW_AR = /^\s*(?:مراجع[ةه]|راجع|تشييك|شيك|تأكد|تاكد|اختبار)/;
const isReviewText = s => REVIEW_EN.test(s || "") || REVIEW_AR.test(s || "");
const reviewSkip = new Set(); let reviewFoldOpen = null, reviewFoldHide = new Set();
function reviewCandidates(p) {
  const all = tasksOf(p), m = p.money || {}, priced = new Set(Object.entries(m.prices || {}).filter(([, v]) => Number(v) > 0).map(([id]) => id));
  const norm = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const strip = s => norm(String(s || "").replace(REVIEW_EN, "").replace(REVIEW_AR, "")).replace(/^(?:the|of|on|for|el|al|ال) /, "").trim();
  const out = [], used = new Set();
  for (const r of all) {
    if (!isReviewText(r.text) || priced.has(r.id) || reviewSkip.has(r.id)) continue;
    const person = r.owner || assignees(r)[0], who = person && plannerIds(p).includes(person) ? person : PLANNERS;
    let x = null;
    const deps = waitIds(r).map(id => all.find(y => y.id === id)).filter(Boolean);
    if (deps.length === 1) x = deps[0];
    else if (!deps.length) {
      const rest = strip(r.text);
      if (rest.length >= 4) { const hits = all.filter(y => y.id !== r.id && !isReviewText(y.text) && (norm(y.text).includes(rest) || (norm(y.text).length >= 4 && rest.includes(norm(y.text))))); if (hits.length === 1) x = hits[0] }
    }
    if (!x || isReviewText(x.text) || used.has(x.id) || (x.checker && x.checker !== who)) continue;
    used.add(x.id);
    out.push({ r, x, who, back: x.done && !r.done });
  }
  return out;
}
function foldReviews(p, list) {
  const d = {}, now = Date.now();
  for (const { r, x, who } of list) {
    d[x.path + ".checker"] = who; d[x.path + ".checkerBy"] = me;
    if (r.done && x.done) d[x.path + ".checked"] = { by: r.doneBy || who, at: r.doneAt || now };
    else if (x.done && !r.done) Object.assign(d, { [x.path + ".done"]: false, [x.path + ".doneBy"]: DEL(), [x.path + ".doneAt"]: DEL(), [x.path + ".status"]: "doing", [x.path + ".review"]: { by: x.doneBy || me, at: x.doneAt || now } });
    for (const [nid, n] of Object.entries(r.notes || {})) if (n && n.text) d[`${x.path}.notes.${nid}`] = n;
    for (const f of taskFilesOf(r)) d[`${x.path}.files.${f.id}`] = f;
    const steps = checkList(r).map(c => c.text);
    if (steps.length) d[`${x.path}.notes.${uid()}`] = { by: me, at: now, text: "What to check: " + steps.join("; ") };
    for (const y of waitingOn(p, r)) { d[`${y.path}.waitFor.${r.id}`] = DEL(); if (y.id !== x.id) d[`${y.path}.waitFor.${x.id}`] = true }
    d[r.path] = DEL();
  }
  reviewFoldOpen = null;
  write(() => upd(p.id, d), list.length > 1 ? `${list.length} review tasks are now checks on their tasks` : "The review task is now a check on its task");
}
function reviewFoldBox(p) {
  if (reviewFoldHide.has(p.id)) return null;
  const list = reviewCandidates(p); if (!list.length) return null;
  const open = reviewFoldOpen === p.id;
  const box = el("section", { class: "reviewfold" },
    el("div", { class: "rf-row" }, el("span", {}, `🧹 ${list.length} review task${list.length > 1 ? "s" : ""} can become a check on the task ${list.length > 1 ? "they review" : "it reviews"}. Fewer tasks, same check.`),
      el("span", { class: "spacer" }),
      el("button", { class: "btn small" + (open ? "" : " primary"), onclick: () => { reviewFoldOpen = open ? null : p.id; render() } }, open ? "Hide" : "See them"),
      open ? null : el("button", { class: "linkbtn", onclick: () => { reviewFoldHide.add(p.id); render() } }, "Not now")));
  if (open) {
    for (const c of list) box.append(el("div", { class: "rf-row" },
      el("span", {}, `“${c.r.text}” → ${c.who === PLANNERS ? "a planner checks" : c.who === me ? "you check" : firstName(c.who) + " checks"} “${c.x.text}”` + (c.back ? `. It goes back to waiting for ${c.who === PLANNERS ? "a planner's" : c.who === me ? "your" : firstName(c.who) + "'s"} check` : c.r.done && c.x.done ? " (already checked)" : "")),
      el("span", { class: "spacer" }),
      el("button", { class: "x", "aria-label": "Keep " + c.r.text + " as a task", title: "Keep this one as a task", onclick: () => { reviewSkip.add(c.r.id); render() } }, "✕")));
    box.append(el("div", { class: "rf-row" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Their notes and files move to the task. Tasks that waited for the review now wait for the task. Tap ✕ to keep one as it is."),
      el("span", { class: "spacer" }),
      el("button", { class: "btn small primary", onclick: () => foldReviews(p, list) }, list.length > 1 ? `Turn ${list.length} into checks` : "Turn it into a check")));
  }
  return box;
}

/* Checks: a task can have one person who checks it (instead of a separate "review" task).
   Ticking it sends it to them. It only counts as done (progress, the next task, task money) once they say it looks good. */
const inCheck = t => !t.done && !!(t.checker && t.review && t.review.at);
// Planners check tasks: "planners" means any of the project's planners; a named checker is one planner.
// Any planner can confirm a task that's waiting for its check.
const PLANNERS = "planners";
// Nobody checks their own work: a planner's own task goes to the other planners. Only a project's single planner
// (or a checker who picked themselves) can finish their own checked task in one tick.
const otherPlanners = p => plannerIds(p).filter(u => u !== me);
const canCheck = (p, t) => inCheck(t) && inTeam(p) && (canPlan(p) || t.checker === me) && (t.review.by !== me || t.checker === me || !otherPlanners(p).length);
const isMyCheck = (p, t) => t.checker === me || (t.checker === PLANNERS && canPlan(p));
const needsSend = (p, t) => !!t.checker && t.checker !== me && !(t.checker === PLANNERS && canPlan(p) && !otherPlanners(p).length);
const checkedByName = t => t.checked && t.checked.by ? (t.checked.by === me ? "you" : firstName(t.checked.by)) : "";
const checkWho = t => t.checker === PLANNERS ? "a planner" : t.checker === me ? "you" : firstName(t.checker);
const checkerFull = t => t.checker === PLANNERS ? "Any planner" : name(t.checker);
let changesFor = null;   // "<where>:<taskId>" of the open "Needs changes" box
function sendForCheck(p, t, key) {
  if (key && openTask === key) openNote = "any:" + t.id;
  write(() => upd(p.id, { [t.path + ".review"]: { by: me, at: Date.now() }, [t.path + ".status"]: "doing", [t.path + ".changes"]: DEL() }))
    .then(ok => { if (ok) toast(`Sent to ${checkWho(t)} to check. It counts as done once they say it looks good`, 4500) });
}
function approveCheck(p, t, key) {
  if (!canCheck(p, t)) return;
  if (key) openTask = null;
  changesFor = null;
  const msg = doneMessage(p, t), now = Date.now();
  write(() => upd(p.id, { [t.path + ".done"]: true, [t.path + ".doneBy"]: t.review.by || me, [t.path + ".doneAt"]: now, [t.path + ".checked"]: { by: me, at: now }, [t.path + ".review"]: DEL(), [t.path + ".changes"]: DEL() }))
    .then(ok => { if (ok) toast("Checked ✓ " + msg, 4500) });
}
function askChanges(p, t, text) {
  if (!canCheck(p, t)) return;
  text = String(text || "").trim();
  if (!text) { toast("Say what needs to change, so they know what to fix"); return }
  changesFor = null;
  const now = Date.now(), who = t.review.by;
  write(() => upd(p.id, { [t.path + ".review"]: DEL(), [t.path + ".status"]: "doing", [t.path + ".changes"]: { by: me, at: now, text }, [`${t.path}.notes.${uid()}`]: { by: me, text: "Needs changes: " + text, at: now } }),
    `Sent back to ${who ? firstName(who) : "them"} with your note`);
}
function takeBackCheck(p, t) {
  write(() => upd(p.id, { [t.path + ".review"]: DEL() }), "Taken back. It's in progress again");
}
// The check line on a task card: waiting for a check, changes asked, or who checks it
function checkChips(p, t, key) {
  if (!t.checker) return [];
  if (t.done) return t.checked ? [el("span", { class: "checkedchip", title: `Checked by ${name(t.checked.by)} ${ago(t.checked.at)}` }, nIc("check", "sm"), "Checked by " + checkedByName(t))] : [];
  if (inCheck(t)) return canCheck(p, t)
    ? [el("span", { class: "checkchip mine" }, nIc("search", "sm"), `${t.review.by === me ? "Check it" : firstName(t.review.by) + " finished it. Check it"}`),
       el("button", { class: "btn small primary", onclick: () => approveCheck(p, t, key) }, "Looks good"),
       el("button", { class: "btn small", onclick: () => { changesFor = key; openTask = key; render(); setTimeout(() => { const n = document.getElementById("chg-" + key); if (n) n.focus() }, 0) } }, "Needs changes")]
    : [el("span", { class: "checkchip" }, nIc("search", "sm"), `Waiting for ${t.checker === PLANNERS && t.review.by === me && canPlan(p) ? "another planner" : checkWho(t)} to check`)];
  if (t.changes && t.changes.text) return [el("span", { class: "changechip", title: t.changes.text }, `↩ ${firstName(t.changes.by)} asked for changes`)];
  return [el("span", { class: "label", style: "text-transform:none;letter-spacing:0", title: `${checkerFull(t)} checks this before it counts as done` }, nIc("search", "sm"), "Checked by " + (t.checker === PLANNERS ? "any planner" : checkWho(t)))];
}
// Inside an open task: who checks it, and the check itself
function checkField(p, t, key, field, set) {
  const planner = canPlan(p) && inTeam(p), can = canWork(p, t);
  const kids = [];
  if (planner) {
    const sel = el("select", { class: "mini", "aria-label": "Who checks it", onchange: e => {
      const u = e.target.value || null, d = { [t.path + ".checker"]: u, [t.path + ".checkerBy"]: me };
      if (!u && t.review) d[t.path + ".review"] = DEL();
      set(d, u ? `${u === PLANNERS ? "A planner" : name(u)} checks this before it counts as done` : "No check needed. Tick it when it's done");
    } }, el("option", { value: "" }, "No check needed"), el("option", { value: PLANNERS }, "Any planner"),
      [...new Set([...plannerIds(p), ...(t.checker && t.checker !== PLANNERS ? [t.checker] : [])])].map(u => el("option", { value: u }, name(u) + (plannerIds(p).includes(u) ? " (planner)" : ""))));
    sel.value = t.checker || "";
    kids.push(sel);
  } else kids.push(el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, t.checker ? checkerFull(t) : "No check needed"));
  if (inCheck(t)) {
    kids.push(el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, `Sent by ${t.review.by === me ? "you" : name(t.review.by)} ${ago(t.review.at)}`));
    if (canCheck(p, t)) {
      kids.push(el("button", { class: "btn small primary", onclick: () => approveCheck(p, t, key) }, "Looks good"));
      if (changesFor === key) {
        const ta = el("textarea", { id: "chg-" + key, class: "noteinput", rows: "2", maxlength: "600", placeholder: "What needs to change?" });
        kids.push(el("div", { style: "display:grid;gap:6px;width:100%" }, ta, el("div", { class: "row", style: "gap:6px" },
          el("button", { class: "btn small primary", onclick: () => askChanges(p, t, ta.value) }, "Send back"),
          el("button", { class: "btn small quiet", onclick: () => { changesFor = null; render() } }, "Cancel"))));
      } else kids.push(el("button", { class: "btn small", onclick: () => { changesFor = key; render(); setTimeout(() => { const n = document.getElementById("chg-" + key); if (n) n.focus() }, 0) } }, "Needs changes"));
    } else if (can) kids.push(el("button", { class: "linkbtn", onclick: () => takeBackCheck(p, t) }, "Take it back"));
  } else if (!t.done && t.changes && t.changes.text) kids.push(el("div", { class: "changeline" }, `${name(t.changes.by)} asked for changes ${ago(t.changes.at)}: `, el("b", {}, t.changes.text), ". Tick it again when it's fixed."));
  else if (t.done && t.checked) kids.push(el("span", { class: "label ok", style: "text-transform:none;letter-spacing:0" }, nIc("check", "sm"), `Checked by ${t.checked.by === me ? "you" : name(t.checked.by)} ${ago(t.checked.at)}`));
  return field("Checked by", ...kids);
}

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

// Which payment of the project's payment plan pays for this task (team only: partners and clients never see tasks).
// Who can work on a task: the people on it and the planners, as long as they're on the project's team.
const canWork = (p, t) => inTeam(p) && (canPlan(p) || isAssignee(t, me));
// Task money as it would be by task prices, even while the money is still kept in the fund
const taskMoneyOf = p => { const m = p.money || {}; return m.hold ? computeMoney({ ...p, money: { ...m, hold: null, split: "tasks" } }, todayStr(), rulesNow(), { team: projTeam(p) }) : moneyOf(p) };
/* ----- task sizes and points: a planner sizes a task, the project's team agrees -----
   S 1, M 3, L 8, XL 15 points (TASK_SIZES, in the money engine). Whoever sizes it agrees by sizing it. Each person on
   the project's team taps Agree or suggests another size. Most of the team agreeing settles it; after a day,
   anyone who didn't answer counts as agreeing. A new size from a planner starts the agreeing again. */
const sizeState = (p, t) => {
  if (!sizeOf(t.size)) return null;
  const team = projTeam(p), n = Math.max(1, team.length), votes = t.sizeVotes || {};
  const agree = new Set(Object.entries(votes).filter(([u, v]) => v === "ok" && team.includes(u)).map(([u]) => u));
  if (t.sizeBy && team.includes(t.sizeBy)) agree.add(t.sizeBy);
  const asks = Object.entries(votes).filter(([u, v]) => v !== "ok" && sizeOf(v) && v !== t.size && team.includes(u) && !agree.has(u)).map(([u, v]) => ({ u, size: v }));
  const quiet = Date.now() - (t.sizeAt || 0) > 864e5;
  const agreed = agree.size * 2 > n || (quiet && asks.length * 2 < n);
  return { team, n, agree, asks, agreed, disputed: !agreed && asks.length * 2 >= n, quiet, mine: t.sizeBy === me ? "ok" : votes[me] || null, canVote: inTeam(p) && team.includes(me) && t.sizeBy !== me };
};
const needsMySize = (p, t) => {
  // quick no first: this runs for every task on every redraw
  if (t.done || !t.size || t.sizeBy === me || (t.sizeVotes && t.sizeVotes[me]) || Date.now() - (t.sizeAt || 0) > 864e5) return false;
  const st = sizeState(p, t); return !!st && st.canVote && !st.mine && !st.agreed;
};
const byPointsDeal = p => !!(p && p.money && p.money.split === "points");
const ptsText = n => `${n} pt${n === 1 ? "" : "s"}`;
// The size on a task row: "L · 8 pts", and whether the team agreed
function sizeChip(p, t) {
  const st = sizeState(p, t);
  if (!st) return byPointsDeal(p) && canPlan(p) ? el("span", { class: "tbit sizebit none", title: "Give it a size so its points count" }, "No size yet") : null;
  const sz = sizeOf(t.size), tip = `${sz.name}: ${sz.time.toLowerCase()}`;
  if (st.agreed) return el("span", { class: "tbit sizebit", title: tip + ". The team agreed" }, `${sz.id} · ${ptsText(sz.pts)}`);
  if (needsMySize(p, t)) return el("span", { class: "tbit sizebit strong", title: tip + ". Open it to agree or suggest another size" }, `${sz.id} · ${ptsText(sz.pts)} · Agree?`);
  return el("span", { class: "tbit sizebit", title: tip }, `${sz.id} · ${ptsText(sz.pts)} · ` + (st.disputed ? "size not agreed" : `${st.agree.size} of ${st.n} agree`));
}
let sizeAsk = null;   // "<where>:<taskId>" while picking another size to suggest
function sizeField(p, t, key, field, set) {
  const planner = canPlan(p) && inTeam(p), st = sizeState(p, t), sz = sizeOf(t.size), kids = [];
  const pick = id => { if (id === t.size) return; const z = sizeOf(id); set({ [t.path + ".size"]: id, [t.path + ".sizeBy"]: me, [t.path + ".sizeAt"]: Date.now(), [t.path + ".sizeVotes"]: DEL() }, `${z.name}, ${ptsText(z.pts)}. The team is asked to agree`) };
  if (planner) kids.push(el("div", { class: "sizepick", role: "group", "aria-label": "Task size" }, TASK_SIZES.map(z =>
    el("button", { type: "button", class: "qd", "aria-pressed": String(t.size === z.id), title: z.time, onclick: () => pick(z.id) }, el("b", {}, z.id), " · " + ptsText(z.pts)))));
  kids.push(el("span", { class: "label sizehint" }, sz ? `${sz.name}: ${sz.time.toLowerCase()}` : planner ? "Pick how long it takes. Longer than a week? Split it into smaller tasks" : "No size yet. A planner gives it one"));
  if (sz && byPointsDeal(p) && !p.money.hold) {
    const P = moneyOf(p).points, v = P && (P.estValue || P.value), n = Math.max(1, assignees(t).length);
    if (v) kids.push(el("span", { class: "label sizehint" }, `Worth about ${fmtEGP(Math.floor(v * sz.pts / n))}${n > 1 ? " each" : ""} (1 point ≈ ${fmtEGP(Math.floor(v))}). Points count once it's done${t.checker ? " and checked" : ""}`));
  }
  if (st) {
    const line = st.agreed ? `Agreed${st.agree.size < st.n && st.quiet ? " (the others didn't answer within a day)" : ""}` : st.disputed ? "Not agreed yet: a planner picks another size" : `${st.agree.size} of ${st.n} on the team agree. Most of the team has to agree, or nobody objects within a day`;
    kids.push(el("div", { class: "sizeagree" }, el("span", { class: "stack" }, [...st.agree].slice(0, 5).map(av)), el("span", { class: "label" }, line)));
    for (const a of st.asks) kids.push(el("div", { class: "sizeask" }, av(a.u), el("span", {}, `${a.u === me ? "You suggest" : cap(firstName(a.u)) + " suggests"} `, el("b", {}, `${a.size} · ${ptsText(sizePts(a.size))}`)),
      planner && a.u !== me ? el("button", { class: "btn small", onclick: () => pick(a.size) }, "Change to " + a.size) : null));
    if (st.canVote && !t.done) {
      const vote = v => set({ [`${t.path}.sizeVotes.${me}`]: v }, v === "ok" ? "You agreed on the size" : `You suggested ${v}. A planner can change it`);
      if (st.mine === "ok") kids.push(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label ok" }, nIc("check", "sm"), "You agreed"), el("button", { class: "linkbtn", onclick: () => set({ [`${t.path}.sizeVotes.${me}`]: DEL() }) }, "Take it back")));
      else if (st.mine) kids.push(el("button", { class: "linkbtn", onclick: () => set({ [`${t.path}.sizeVotes.${me}`]: DEL() }) }, "Take back your suggestion"));
      else if (sizeAsk === key) kids.push(el("div", { class: "sizepick" }, TASK_SIZES.filter(z => z.id !== t.size).map(z => el("button", { type: "button", class: "qd", title: z.time, onclick: () => { sizeAsk = null; vote(z.id) } }, el("b", {}, z.id), " · " + ptsText(z.pts))),
        el("button", { class: "linkbtn", onclick: () => { sizeAsk = null; render() } }, "Cancel")));
      else kids.push(el("div", { class: "row", style: "gap:8px" }, el("button", { class: "btn small primary", onclick: () => vote("ok") }, "Agree"), el("button", { class: "btn small", onclick: () => { sizeAsk = key; render() } }, "Suggest another size")));
    }
  }
  return field("Size", ...kids);
}
// A task's price, when the deal shares money by task prices
function priceChip(p, t) {
  const m = p && p.money; if (!m || m.split !== "tasks" || m.type === "monthly") return null;
  const v = Number((m.prices || {})[t.id]) || 0; if (!(v > 0)) return null;
  const r = taskMoneyOf(p), info = r.tasks[t.id], mine = isAssignee(t, me), n = Math.max(1, assignees(t).length);
  const tip = info ? (info.status === "earned" ? "Earned: " + fmtEGP(info.share) : `Worth about ${fmtEGP(info.est)} to ${n > 1 ? "the people on it, shared" : "whoever does it"} once it's done and paid`) : "";
  return el("span", { class: "pricechip" + (info && info.status === "earned" ? " earned" : ""), title: tip }, "\u{1F4B5} " + fmtCur(toP(v), m.currency) + (mine && info && info.est ? " · you ≈ " + fmtN(Math.floor((info.status === "earned" ? info.share : info.est) / n)) : ""));
}
function payChip(p, t) { const s = p && p.money ? planOf(p.money, p).find(x => (x.tasks || []).includes(t.id)) : null; return s ? el("span", { class: "paychip", title: "This task is paid for by: " + s.label }, "\u{1F4B0} " + s.label) : null }
// One task row, the same everywhere: tick it, see who and when, and one line about where it stands. Tap it to open it.
function taskItem(p, t, where, opts = {}) {
  const key = where + ":" + t.id, open = openTask === key;
  const can = canWork(p, t);
  const people = assignees(t), w = t.done ? null : waitInfo(p, t), blocked = !!(w && w.open.length);
  const showPeople = opts.people === "always" || (opts.people !== "never" && (opts.people !== "multi" || people.length > 1));
  const toggle = () => { openTask = open ? null : key; delTask = null; waitPick = null; changesFor = null; render() };
  const checking = inCheck(t), tickable = can || canCheck(p, t), sendsToCheck = needsSend(p, t);
  const late = !t.done && t.due && t.due < todayStr();
  const bit = (text, cls) => el("span", { class: "tbit" + (cls ? " " + cls : "") }, text);
  let status = null;
  if (checking) status = canCheck(p, t) ? bit("Needs your check", "strong") : bit(`Waiting for ${t.checker === PLANNERS && t.review.by === me && canPlan(p) ? "another planner" : checkWho(t)} to check`);
  else if (!t.done && t.changes && t.changes.text) status = bit(`${cap(firstName(t.changes.by))} asked for changes`, "strong");
  else if (blocked) status = bit(w.open.length > 1 ? `Waiting for ${w.open.length} tasks` : `Waiting for ${ownerName(w.open[0])}`);
  else if (!t.done && t.status === "doing") status = bit("In progress");
  else if (t.done && t.checked) status = bit("Checked by " + checkedByName(t));
  if (open) mountSheet(p, t, key);
  return el("div", { class: "task" + (t.done ? " done" : "") + (blocked ? " blocked" : "") + (checking ? " checking" : "") + (isAssignee(t, me) ? " mytask" : "") + (open ? " open" : "") },
    el("input", { type: "checkbox", id: "c-" + key, checked: t.done || checking, disabled: !tickable, "aria-label": (checking ? "Waiting for a check: " : "Done: ") + t.text, title: canCheck(p, t) ? "Tick if it looks good" : checking ? `Waiting for ${checkWho(t)} to check it. Untick to take it back` : !can ? (!inTeam(p) ? "Only this project's team can tick tasks" : "Only the people on this task or a planner can tick it") : sendsToCheck ? `Ticking sends it to ${checkWho(t)} to check` : "", onchange: e => toggleDone(p, t, e.target.checked, key) }),
    el("button", { class: "ttext", "aria-haspopup": "dialog", onclick: toggle }, t.text),
    el("button", { class: "chev", "aria-label": "Open " + t.text, onclick: toggle }, "›"),
    el("div", { class: "meta" },
      opts.project ? el("button", { class: "linkbtn", onclick: () => { location.hash = taskLink(p, t) } }, p.title) : null,
      opts.phase ? bit(opts.phase) : null,
      showPeople ? (people.length ? el("span", { class: "tbit tpeople", title: people.map(name).join(", ") }, el("span", { class: "stack" }, people.slice(0, 3).map(av)), people.length === 1 ? (people[0] === me ? "You" : cap(firstName(people[0]))) : `${people.length} people`) : bit("Nobody yet")) : null,
      status,
      sizeChip(p, t),
      !t.done && t.due ? bit(late ? "Late · " + fmtDate(t.due) : dueText(t.due, false), late ? "strong" : "") : null,
      !t.done && (t.priority === "urgent" || t.priority === "high") ? bit(t.priority === "urgent" ? "Urgent" : "High priority", "strong") : null),
    doneAnyway === key ? el("div", { class: "waitwarn" },
      el("span", {}, `Not done yet: ${w.open.map(d => `“${d.text}” (${ownerName(d)})`).join(", ")}. Mark this one done anyway?`),
      el("span", { class: "row", style: "gap:6px" }, el("button", { class: "btn small quiet", onclick: () => { doneAnyway = null; render() } }, "Not yet"),
        el("button", { class: "btn small primary", onclick: () => toggleDone(p, t, true, key, true) }, "Mark done"))) : null);
}

// An open task slides up as a sheet (centered on a computer), so the list stays where it was.
let sheetUsed = false;
function closeTaskSheet() { openTask = null; delTask = null; waitPick = null; changesFor = null; render() }
function mountSheet(p, t, key) {
  sheetUsed = true;
  let root = document.getElementById("tsheet");
  if (!root) { root = el("div", { id: "tsheet" }); $("#app").append(root) }
  const old = root.querySelector(".tsheet"), same = root.dataset.key === key, top = same && old ? old.scrollTop : 0;
  const ph = getPhases(p).find(x => x.id === t.phase);
  const sheet = el("div", { class: "tsheet" + (same ? "" : " enter"), role: "dialog", "aria-modal": "true", "aria-label": t.text },
    el("div", { class: "ts-grip", "aria-hidden": "true" }),
    el("div", { class: "ts-head" }, el("span", { class: "ts-k" }, [p.title, ph && ph.name].filter(Boolean).join(" · ")), el("button", { class: "pp-ic", "aria-label": "Close", onclick: closeTaskSheet }, nIc("x"))),
    el("h2", { class: "ts-title" }, t.text),
    taskDetail(p, t, key));
  root.replaceChildren(el("div", { class: "ts-scrim", onclick: closeTaskSheet }), sheet);
  root.dataset.key = key;
  if (top) sheet.scrollTop = top;
  document.body.classList.add("sheet-open");
  if (!same) setTimeout(() => { if (!sheet.contains(document.activeElement)) { const b = sheet.querySelector(".ts-head .pp-ic"); if (b) b.focus({ preventScroll: true }) } }, 40);
}
function sheetCleanup() {
  if (sheetUsed) return;
  const r = document.getElementById("tsheet");
  if (r && r.firstChild) { r.replaceChildren(); delete r.dataset.key }
  document.body.classList.remove("sheet-open");
}

function taskDetail(p, t, key) {
  const planner = canPlan(p) && inTeam(p), can = canWork(p, t), phases = getPhases(p);
  const set = (data, ok) => write(() => upd(p.id, typeof data === "function" ? data() : data), ok);
  const box = el("div", { class: "tdetail" });
  const field = (label, ...kids) => el("div", { class: "tfield" }, el("span", { class: "tlabel" }, label), el("div", { class: "tval" }, ...kids));

  box.append(checkField(p, t, key, field, set));

  const solve = hardTaskPopBanner(p, t); if (solve) box.append(solve);

  const people = assignees(t);
  if (planner) {
    const lead = el("select", { class: "mini", "aria-label": "Main person", onchange: e => set({ [t.path + ".owner"]: e.target.value || null, [t.path + ".assignedBy"]: me, [t.path + ".assignedAt"]: Date.now() }, e.target.value ? `Given to ${name(e.target.value)}` : null) },
      el("option", { value: "" }, "Nobody yet"), teamPick(p, [t.owner]).map(u => el("option", { value: u }, name(u))));
    lead.value = t.owner || "";
    const helpers = Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u).filter(u => u !== t.owner);
    const others = teamOf(p).filter(u => u !== t.owner && !helpers.includes(u));
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
    let ph = null;
    if (phases.length > 1) {
      ph = el("select", { class: "mini", "aria-label": "Stage", onchange: e => write(() => phaseWrite(p, { [t.path + ".phase"]: e.target.value })) }, phases.map(x => el("option", { value: x.id }, x.name)));
      ph.value = t.phase;
    }
    box.append(field("Priority", pr));
    if (ph) box.append(field("Stage", ph));
  } else {
    box.append(field("Details", el("span", { class: "row", style: "gap:6px" },
      el("span", { class: "prio prio-" + (t.priority || "medium") }, PRIORITIES.find(x => x.id === (t.priority || "medium")).name), dueChip(t) || el("span", { class: "label" }, "No due date"))));
  }

  box.append(sizeField(p, t, key, field, set));

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

  { const mf = taskMoneyField(p, t); if (mf) box.append(field("Money", mf)) }
  box.append(field("Files", taskFilesBlock(p, t, key)));
  // drop files anywhere on the open task to attach them
  box.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); box.classList.add("dropping") } });
  box.addEventListener("dragleave", e => { if (!box.contains(e.relatedTarget)) box.classList.remove("dropping") });
  box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("dropping"); addTaskFiles(p, t, key, [...e.dataTransfer.files]) });

  box.append(field("Notes", notesBlock(p, t, key)));
  if (!inTeam(p)) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "You can leave notes. To work on tasks, ask to join the team at the top of the project."));

  if (planner) box.append(el("div", { class: "row", style: "justify-content:flex-end" },
    delTask === key
      ? el("button", { class: "linkbtn danger", onclick: () => { delTask = null; openTask = null; deleteTask(p, t) } }, "Tap again to delete this task")
      : el("button", { class: "linkbtn danger", onclick: () => { delTask = key; render() } }, "Delete task")));
  const foot = taskFoot(p, t, key, can);
  if (foot) box.append(foot);
  return box;
}
// The one main action at the bottom of an open task
function taskFoot(p, t, key, can) {
  const foot = el("div", { class: "ts-foot" });
  if (doneAnyway === key) {
    const w = waitInfo(p, t);
    foot.append(el("span", { class: "label" }, `Not done yet: ${w.open.map(d => `“${d.text}” (${ownerName(d)})`).join(", ")}. Mark this one done anyway?`),
      el("button", { class: "btn quiet", onclick: () => { doneAnyway = null; render() } }, "Not yet"),
      el("button", { class: "btn primary", onclick: () => toggleDone(p, t, true, key, true) }, "Mark done"));
    return foot;
  }
  if (t.done) { if (can) foot.append(el("button", { class: "btn quiet", onclick: () => toggleDone(p, t, false, key) }, "Not done yet")); else return null }
  else if (inCheck(t)) {
    if (canCheck(p, t)) return null;   // "Looks good" and "Needs changes" sit at the top, under "Checked by"
    if (can) foot.append(el("span", { class: "label" }, `Waiting for ${checkWho(t)} to check it`), el("button", { class: "btn quiet", onclick: () => takeBackCheck(p, t) }, "Take it back"));
    else return null;
  } else if (can) {
    if (t.status !== "doing") foot.append(el("button", { class: "btn", onclick: () => setTaskStatus(p, t, "doing", key) }, "Start"));
    foot.append(el("button", { class: "btn primary", onclick: () => toggleDone(p, t, true, key) }, needsSend(p, t) ? `Done · send to ${checkWho(t)} to check` : "Mark done"));
  } else return null;
  return foot;
}

/* ----- files on a task (PDFs, docs, photos…), stored in pieces like project and chat files ----- */
const taskFilesOf = t => Object.values((t && t.files) || {}).filter(f => f && f.id && f.parts).sort((a, b) => (a.at || 0) - (b.at || 0));
let taskUpKey = null, taskUpMsg = "", delTaskFile = null;
function pickFiles(onPick) {
  const inp = el("input", { type: "file", multiple: true, hidden: true });
  inp.addEventListener("change", () => { onPick([...inp.files]); inp.remove() });
  document.body.append(inp); inp.click();
}
// Uploads each file and hands it to save(file), which writes it onto the task. Progress shows in the element with id "tup-<key>".
async function uploadFilesTo(key, list, save, where = "the task") {
  list = list.filter(Boolean);
  if (!list.length) return;
  if (taskUpKey) { toast("Wait for the other upload to finish"); return }
  await fbReady;
  taskUpKey = key;
  let added = 0;
  const msg = s => { taskUpMsg = s; const n = document.getElementById("tup-" + key); if (n) n.textContent = s; else render() };
  for (const f of list) {
    const isImg = /^image\/(jpeg|png|webp|heic|heif|bmp)$/.test(f.type);
    if (f.size > (isImg ? MAX_IMAGE_IN : MAX_FILE)) { toast(`${f.name} is too big. The limit is 10 MB per file.`); continue }
    try {
      msg(`Uploading ${f.name}…`);
      const file = await uploadFile(await prepareFile(f), pct => msg(`Uploading ${f.name}… ${pct}%`));
      await save({ ...file, by: me, at: Date.now() });
      added++;
    } catch (e) {
      toast(e.code === "permission-denied" ? `Uploading isn't allowed yet. Ask ${ADMIN_NAME} to update the database rules.` : e.message === "too big" ? `${f.name} is too big, even after shrinking it.` : `${f.name} didn't upload. Check your connection and try again.`);
    }
  }
  taskUpKey = null; taskUpMsg = ""; render();
  if (added) toast(added > 1 ? `${added} files added to ${where}` : `File added to ${where}`);
}
const dropFileParts = f => { if (f.by === me || isAdmin) for (let n = 0; n < f.parts; n++) deleteDoc(doc(db, "fileparts", `${f.id}_${n}`)).catch(() => {}) };
const addTaskFiles = (p, t, key, list) => !inTeam(p) ? toast(NOT_ON_TEAM) : uploadFilesTo(key, list, file => upd(p.id, { [`${t.path}.files.${file.id}`]: file }));
// A row of file chips plus "Attach": tap a file to open it (PDFs and photos open inside the site).
function fileRow(files, key, canRemove, onRemove, onAdd) {
  const row = el("div", { class: "links" });
  for (const f of files) {
    const chip = el("button", { class: "linkchip filechip", title: `${f.name} · ${fmtSize(f.size)}${f.by ? " · added by " + (f.by === me ? "you" : name(f.by)) : ""}`, onclick: () => viewable(f) ? openViewer(f) : downloadFile(f) },
      f.thumb ? el("img", { src: f.thumb, alt: "", class: "fthumb" }) : el("span", { class: "fext" }, extOf(f.name)), el("span", {}, f.name));
    const dk = key + ":" + f.id;
    row.append(!canRemove(f) ? chip : el("span", { class: "linkwrap" }, chip,
      delTaskFile === dk
        ? el("button", { class: "linkdel sure", "aria-label": "Confirm remove " + f.name, onclick: () => { delTaskFile = null; write(() => onRemove(f), "File removed") } }, "Remove?")
        : el("button", { class: "linkdel", "aria-label": "Remove " + f.name, onclick: () => { delTaskFile = dk; render() } }, "✕")));
  }
  if (onAdd) row.append(taskUpKey === key
    ? el("span", { class: "label", id: "tup-" + key, style: "text-transform:none;letter-spacing:0" }, taskUpMsg)
    : el("button", { class: "linkchip addlink", title: "PDFs, documents, photos, anything up to 10 MB", onclick: () => pickFiles(onAdd) }, files.length ? "+ File" : "+ Add a file or PDF"));
  return row;
}
function taskFilesBlock(p, t, key) {
  const files = taskFilesOf(t), planner = canPlan(p), team = inTeam(p);
  return el("div", { style: "display:grid;gap:6px" },
    fileRow(files, key, f => f.by === me || planner, f => upd(p.id, { [`${t.path}.files.${f.id}`]: DEL() }).then(() => dropFileParts(f)), team ? list => addTaskFiles(p, t, key, list) : null),
    files.length ? null : el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "PDFs, briefs, designs, photos. Up to 10 MB each. You can also drop files on this task."));
}

// Deleting a task also takes it off the "waiting for" list of every task that needed it, and removes its files.
function deleteTask(p, t) {
  taskFilesOf(t).forEach(dropFileParts);
  const freed = waitingOn(p, t);
  write(() => upd(p.id, Object.assign({ [t.path]: DEL() }, ...freed.map(x => ({ [`${x.path}.waitFor.${t.id}`]: DEL() })))), "Task deleted");
}

function setTaskStatus(p, t, v, key) {
  if (v === "done") return toggleDone(p, t, true, key);
  if (t.done) { reopenTask(p, t, v); return }
  const data = {};
  if (t.review) data[t.path + ".review"] = DEL();
  if (v === "doing") { data[t.path + ".status"] = "doing"; data[t.path + ".startedBy"] = me; data[t.path + ".startedAt"] = Date.now() }
  else data[t.path + ".status"] = null;
  write(() => upd(p.id, data), v === "doing" ? "Marked as in progress" : null);
}
function reopenTask(p, t, status) {
  if (openNote && openNote.endsWith(":" + t.id)) openNote = null;
  write(() => upd(p.id, { [t.path + ".done"]: false, [t.path + ".doneBy"]: DEL(), [t.path + ".doneAt"]: DEL(), [t.path + ".checked"]: DEL(), [t.path + ".review"]: DEL(), [t.path + ".status"]: status === "todo" ? null : "doing" }), "Back on the to-do list");
}

/* ----- planners & phases ----- */

let renamingPhase = null, delPhase = null;
const shownDone = new Set();   // phases where you opened the done tasks
const canPlan = p => !!p && (isAdmin || p.author === me || !!(p.planners || {})[me]);
const plannerIds = p => [...new Set([p.author, ...Object.entries(p.planners || {}).filter(([, v]) => v).map(([u]) => u)].filter(Boolean))];

/* ----- a project's team: the people who work on it and get paid from it -----
   Its planners are always on it. Anyone else joins by asking (a planner accepts) or by being invited (they accept).
   Someone who isn't on the team can look at everything and leave notes on tasks, but can't change the work.
   Projects from before teams existed count everyone who had a task there, until a planner opens it once (teamV). */
const isProj = p => !!p && (p.status === "approved" || p.status === "completed");
const projTeamMemo = new WeakMap();   // one answer per version of the project and of the people lists
const projTeam = p => {
  if (!p) return [];
  const d = teamDeps(), c = typeof p === "object" ? projTeamMemo.get(p) : null;
  if (c && sameDeps(c.d, d)) return c.r.slice();
  const set = new Set(Object.entries(p.members || {}).filter(([, v]) => v).map(([u]) => u));
  for (const u of plannerIds(p)) set.add(u);
  if (!p.teamV) for (const t of tasksOf(p)) assignees(t).forEach(u => set.add(u));
  const r = [...set].filter(u => !people[u] || isTeamUid(u));
  if (typeof p === "object") projTeamMemo.set(p, { d, r });
  return r.slice();
};
const inTeam = (p, u = me) => !isProj(p) || (u === me && isAdmin) || projTeam(p).includes(u);
const joinReqsOf = p => Object.entries((p && p.joinReqs) || {}).filter(([, v]) => v).map(([u, v]) => ({ u, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
const invitesOf = p => Object.entries((p && p.invites) || {}).filter(([, v]) => v).map(([u, v]) => ({ u, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
const NOT_ON_TEAM = "Only this project's team can do this. Ask to join the team first";
function askToJoin(p) {
  if ((p.invites || {})[me]) return acceptInvite(p);
  if (canPlan(p)) return addToTeam(p, me, "You're on the team now");   // planners don't need to ask
  write(() => upd(p.id, { ["joinReqs." + me]: { at: Date.now() } }), "Asked to join. A planner will say yes or no");
}
const cancelAsk = p => write(() => upd(p.id, { ["joinReqs." + me]: DEL() }), "Request taken back");
const addToTeam = (p, u, ok) => write(() => upd(p.id, { ["members." + u]: true, ["joined." + u]: { by: me, at: Date.now() }, ["joinReqs." + u]: DEL(), ["invites." + u]: DEL() }), ok);
const acceptAsk = (p, u) => addToTeam(p, u, `${firstName(u)} is on the team now`);
const declineAsk = (p, u) => write(() => upd(p.id, { ["joinReqs." + u]: DEL() }), `Said no to ${firstName(u)}`);
let invitePick = null;   // the project whose "who to invite" list is open
const invSending = new Set();   // "<project>:<person>" invites on their way to the database
function inviteToTeam(p, u) {
  if ((p.joinReqs || {})[u]) return acceptAsk(p, u);   // they already asked: just let them in
  const k = p.id + ":" + u; if (invSending.has(k)) return;
  invSending.add(k); render();
  toast(`Invited ${firstName(u)}. They get an alert and join when they accept`);
  write(() => upd(p.id, { ["invites." + u]: { by: me, at: Date.now() } })).then(() => { invSending.delete(k); render() });
}
const cancelInvite = (p, u) => write(() => upd(p.id, { ["invites." + u]: DEL() }), "Invite taken back");
function acceptInvite(p) {
  const iv = (p.invites || {})[me];
  write(() => upd(p.id, { ["members." + me]: true, ["joined." + me]: { by: me, at: Date.now(), ...(iv && iv.by ? { inv: iv.by } : {}) }, ["joinReqs." + me]: DEL(), ["invites." + me]: DEL() }), "You're on the team now");
}
const declineInvite = p => write(() => upd(p.id, { ["invites." + me]: DEL() }), "Invite declined");
// Taking someone off the team (or leaving it) also frees their open tasks, so nothing waits on someone who isn't there.
function offTeam(p, u, ok) {
  const data = { ["members." + u]: DEL(), ["joined." + u]: DEL() };
  if (u !== p.author && (p.planners || {})[u]) data["planners." + u] = DEL();
  let freed = 0;
  for (const t of tasksOf(p)) if (!t.done && isAssignee(t, u)) { freed++; if (t.owner === u) data[t.path + ".owner"] = null; if ((t.helpers || {})[u]) data[`${t.path}.helpers.${u}`] = DEL() }
  write(() => upd(p.id, data), ok + (freed ? `. ${freed} open task${freed > 1 ? "s are" : " is"} free for someone else now` : ""));
}
// Old projects: write down who was already on them (everyone with a task), once, so the team is clear from now on.
const teamFixed = new Set();
function fixOldTeams() {
  for (const p of ideas) {
    if (!isProj(p) || p.teamV || teamFixed.has(p.id) || !canPlan(p)) continue;
    teamFixed.add(p.id);
    const data = { teamV: 1 };
    for (const u of projTeam(p)) if (u !== p.author && !(p.members || {})[u]) data["members." + u] = true;
    upd(p.id, data).catch(() => teamFixed.delete(p.id));
  }
}
// The people a planner can give a task (or a share) to: the project's team.
const teamPick = (p, keep) => [...new Set([...teamOf(p), ...(keep || []).filter(Boolean)])];

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

/* ----- skills & roles: the quiz (questions and scoring are in quiz.js) ----- */
const mainRoleOf = u => { const q = (people[u] || {}).quiz2; return q && q.main ? ROLE[q.main] : null };
const rolesOf = u => { const q = (people[u] || {}).quiz2; return q && q.roles ? q.roles.map(r => ROLE[r]).filter(Boolean) : [] };
function renderSkills() {
  const box = $("#skills"); box.replaceChildren();
  const mine = people[me] || {};
  if (quiz || !mine.skills) box.append(quizCard());
  else box.append(myResults(mine));

  // who does what: every role and the people it fits
  const ids = teamIds(), took = ids.filter(u => (people[u] || {}).quiz2);
  box.append(el("div", { class: "row", style: "margin:26px 0 10px" }, el("h2", {}, "Who does what"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${took.length} of ${ids.length} took the quiz`)));
  if (took.length) box.append(el("section", { class: "idea rolegrid" }, ROLES.map(r => {
    const main = took.filter(u => people[u].quiz2.main === r.id), also = took.filter(u => people[u].quiz2.main !== r.id && (people[u].quiz2.roles || []).includes(r.id));
    return el("div", { class: "rolecell" + (main.length || also.length ? "" : " empty") }, el("b", {}, r.name),
      el("div", { class: "rolepeople" }, main.map(u => el("span", { class: "planner" }, av(u), u === me ? "You" : name(u).split(" ")[0])),
        also.map(u => el("span", { class: "planner soft" }, av(u), (u === me ? "You" : name(u).split(" ")[0]) + " (also)")),
        !main.length && !also.length ? el("span", { class: "label" }, "nobody yet") : null));
  })));
  const grid = el("div", { class: "members" });
  for (const u of ids) {
    const prof = people[u] || {}, q = prof.quiz2, rs = rolesOf(u);
    grid.append(el("article", { class: "idea" + (u === me ? " member me" : "") },
      el("div", { class: "by", style: "color:var(--ink);font-weight:600;font-size:15px" }, av(u), name(u)),
      q ? el("div", { class: "row", style: "gap:6px" }, rs.map((r, i) => el("span", { class: "chip" + (i === 0 ? " rolechip" : "") }, r.name))) : el("p", { style: "margin:0" }, prof.skills ? "Took the old quiz. The new one finds their roles." : "Hasn't taken the quiz yet."),
      q && q.hidden ? el("p", { style: "margin:0;font-size:13.5px" }, "✨ Hidden skill: ", el("b", {}, cap1(SKILL_WORD[q.hidden]))) : null,
      q && q.talent ? el("p", { style: "margin:0;font-size:13.5px;color:var(--muted)" }, "In their words: “" + q.talent + "”") : null,
      prof.skills ? bars(prof.skills, 3) : null,
      prof.grow && prof.grow.length ? el("p", { style: "font-size:13px;margin:0" }, "Wants to get better at: " + prof.grow.map(s => SKILLS[s].name).join(", ")) : null));
  }
  box.append(grid);
}

function quizCard() {
  const steps = quizSteps();
  if (!quiz) quiz = { i: 0, ans: { like: [], scene: [], test: [], done: [], talent: "", grow: ((people[me] || {}).grow || []).slice() } };
  const st = steps[Math.min(quiz.i, steps.length - 1)], A = quiz.ans, [partName, partSub] = QUIZ_PARTS[st.part];
  const card = el("section", { class: "idea quiz", style: "gap:14px" });
  const go = d => { quiz.i = Math.max(0, Math.min(steps.length - 1, quiz.i + d)); render(); scrollTo(0, 0) };
  card.append(
    el("div", { class: "qparts" }, [1, 2, 3, 4, 5].map(n => el("span", { class: n < st.part ? "done" : n === st.part ? "now" : "" }, QUIZ_PARTS[n][0]))),
    el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pctOf(quiz.i, steps.length)}%` })),
    el("div", { class: "qprog" }, el("span", {}, `Part ${st.part} of 5 · ${partName}`), el("span", {}, `${quiz.i + 1} / ${steps.length}`)));
  if (quiz.i === 0) card.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "About 6 minutes. It looks at what you enjoy, what you'd do, what you can show and what you've done, then finds your roles and the skill you might not know you have."));
  if (st.kind === "like" || st.kind === "scene" || st.kind === "test") {
    const list = A[st.kind];
    card.append(el("h2", {}, st.q), el("p", { style: "margin:0" }, partSub),
      el("div", { class: "opts" }, st.a.map((o, n) => el("button", { class: "opt", "aria-pressed": String(list[st.i] === n), onclick: () => { list[st.i] = n; go(1) } }, Array.isArray(o) ? o[0] : o))));
  } else if (st.kind === "done") {
    card.append(el("h2", {}, "Which of these have you really done?"), el("p", { style: "margin:0" }, partSub),
      el("div", { class: "opts" }, QZ_DONE.map(([, text], n) => el("button", { class: "opt check", "aria-pressed": String(A.done.includes(n)), onclick: () => { A.done = A.done.includes(n) ? A.done.filter(x => x !== n) : [...A.done, n]; render() } }, el("span", { class: "tick" }, A.done.includes(n) ? "✓" : ""), text))),
      el("div", { class: "row" }, el("span", { class: "label" }, A.done.length ? `${A.done.length} ticked` : "None of these? That's fine too."), el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: () => go(1) }, "Next")));
  } else {
    const ta = el("textarea", { id: "quiz-talent", class: "noteinput", rows: "3", maxlength: "300", placeholder: "e.g. I can make anyone laugh on a call, I always find the cheapest flights, I can fix any phone, I remember every detail people tell me…", oninput: e => { A.talent = e.target.value } });
    if (!ta.value) ta.value = A.talent || "";
    card.append(el("h2", {}, "What's something you're good at that nobody ever asks you about?"),
      el("p", { style: "margin:0" }, "Everyone has one. It can be small or random: it often turns into a role. The team will see it on your profile."), ta,
      el("h3", { style: "margin-top:6px" }, "What do you want to get better at?"),
      el("p", { style: "margin:0" }, "Pick up to 2. The helper will sometimes give you tasks in these so you can level up."),
      el("div", { class: "opts two" }, SKILL_IDS.map(s => el("button", { class: "opt", "aria-pressed": String(A.grow.includes(s)), onclick: () => {
        if (A.grow.includes(s)) A.grow = A.grow.filter(x => x !== s); else if (A.grow.length < 2) A.grow.push(s); render();
      } }, el("strong", {}, SKILLS[s].name), " · ", SKILLS[s].about))),
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: saveQuiz }, "See my roles")));
  }
  card.append(el("div", { class: "row" },
    quiz.i > 0 ? el("button", { class: "btn quiet", onclick: () => go(-1) }, "← Back") : null, el("span", { class: "spacer" }),
    (people[me] || {}).skills ? el("button", { class: "btn quiet", onclick: () => { quiz = null; render() } }, "Cancel") : null));
  return card;
}

function saveQuiz() {
  const missing = quizSteps().findIndex(st => (st.kind === "like" || st.kind === "scene" || st.kind === "test") && quiz.ans[st.kind][st.i] == null);
  if (missing >= 0) { quiz.i = missing; toast("One question was skipped. Answer it and you're done"); render(); return }
  const A = quiz.ans, res = scoreQuiz(A, SKILL_IDS), grow = A.grow.slice(), talent = (A.talent || "").trim().slice(0, 300);
  const quiz2 = { v: res.v, roles: res.roles, main: res.main, hidden: res.hidden, parts: res.parts, fit: res.fit.slice(0, 5), talent, at: Date.now() };
  quiz = null;
  people[me] = { ...(people[me] || {}), skills: res.skills, grow, quiz2 };
  write(() => setDoc(doc(db, "users", me), { skills: res.skills, grow, quizAt: Date.now(), quiz2 }, { merge: true }), "Your roles are ready");
  scrollTo(0, 0);
}

function myResults(prof) {
  const q = prof.quiz2;
  if (!q) {
    const tops = topSkills(me);
    return el("section", { class: "focus" },
      el("div", { class: "label" }, "Your strengths (old quiz)"), el("div", { class: "role" }, tops.map(s => SKILLS[s].name).join(" + ")), bars(prof.skills),
      el("div", { class: "notice teamnote", style: "margin:0" }, el("span", { style: "flex:1 1 220px" }, "The skills quiz got a big upgrade: real situations, quick tests and what you've done. It finds your roles and your hidden skill. About 6 minutes."),
        el("button", { class: "btn primary small", onclick: () => { quiz = null; quiz = { i: 0, ans: { like: [], scene: [], test: [], done: [], talent: "", grow: (prof.grow || []).slice() } }; render() } }, "Take the new quiz")));
  }
  const res = { parts: q.parts }, main = ROLE[q.main], others = (q.roles || []).slice(1).map(r => ROLE[r]).filter(Boolean);
  const nextUp = (q.fit || []).filter(x => !(q.roles || []).includes(x.id) && x.score >= .4).slice(0, 2).map(x => ROLE[x.id]).filter(Boolean);
  const sec = el("section", { class: "focus quizres" },
    el("div", { class: "label" }, "Your main role"),
    el("div", { class: "role" }, main ? main.name : "—"),
    main ? el("p", { style: "margin:0;opacity:.9;max-width:60ch" }, main.about) : null,
    main ? el("p", { style: "margin:0;opacity:.8;font-size:14px" }, roleWhy(res, main.id)) : null,
    others.length ? el("div", { style: "display:grid;gap:4px" }, el("div", { class: "label" }, "You also fit"), el("div", { class: "row", style: "gap:6px" }, others.map(r => el("span", { class: "chip", title: r.about }, r.name)))) : null,
    nextUp.length ? el("p", { style: "margin:0;font-size:13.5px;opacity:.8" }, "Close behind: " + nextUp.map(r => r.name).join(", ") + ". A few tasks there and they could be yours too.") : null);
  if (q.hidden) {
    const P = q.parts, s = q.hidden, bits = [];
    if (P.test[s] >= 1) bits.push("got both tests right"); else if (P.test[s] >= .5) bits.push("got a test right");
    if (P.done[s] >= .5) bits.push("you've already done it for real");
    sec.append(el("div", { class: "hiddenskill" }, el("b", {}, "✨ Your hidden skill: " + cap1(SKILL_WORD[s])),
      el("span", {}, `You didn't pick it much when talking about yourself, but you ${bits.join(" and ")}. You're better at ${SKILL_WORD[s]} than you think. Ask a planner for a task in it.`)));
  }
  if (q.talent) sec.append(el("p", { style: "margin:0;font-size:14px" }, el("b", {}, "In your words: "), "“" + q.talent + "”"));
  sec.append(bars(prof.skills),
    prof.grow && prof.grow.length ? el("p", { style: "margin:0;opacity:.85" }, "You want to get better at: " + prof.grow.map(s => SKILLS[s].name).join(", ")) : null,
    el("details", { class: "howscored" }, el("summary", {}, "How this was worked out"),
      el("p", { style: "margin:6px 0 0;font-size:13.5px;opacity:.85" }, "Each skill mixes four things: what you enjoy (20%), what you'd do in real situations (20%), the quick tests (35%) and what you've really done (25%). Roles are mixes of skills, like Brand designer = mostly design plus some content and words. A hidden skill is one where your tests and real experience are clearly ahead of how you see yourself.")),
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn", onclick: () => { quiz = { i: 0, ans: { like: [], scene: [], test: [], done: [], talent: q.talent || "", grow: (prof.grow || []).slice() } }; render(); scrollTo(0, 0) } }, "Retake the quiz")));
  return sec;
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
  // waiting for a check: the checker ticks it to say it looks good; the person on it can untick to take it back
  if (inCheck(t)) {
    if (done && canCheck(p, t)) return approveCheck(p, t, key);
    if (!done && canWork(p, t)) return takeBackCheck(p, t);
    toast(done ? `Already sent. Waiting for ${checkWho(t)} to check it` : `Only ${checkWho(t)} or the people on it can change this now`); render(); return;
  }
  if (!canWork(p, t)) { toast(inTeam(p) ? "Only the people on this task or a planner can tick it" : NOT_ON_TEAM); render(); return }
  if (!done) { doneAnyway = null; return reopenTask(p, t, t.status === "doing" ? "doing" : "todo") }
  // Still waiting for someone else's task? Ask first, so nothing gets ticked by mistake.
  if (!force && waitInfo(p, t).open.length) { doneAnyway = key; render(); return }
  doneAnyway = null;
  if (needsSend(p, t)) return sendForCheck(p, t, key);
  // ticked inside an open task: its note box opens to say what was done. Ticked in a list: it just gets done.
  if (key && openTask === key) openNote = "any:" + t.id;
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
    if (i >= 0) return `${phs[i].name} is complete ✓ ` + (phs[i + 1] ? `Next up: ${phs[i + 1].name}` + (phs[i + 1].paused ? " (paused for now)" : "") : "That was the last phase");
  }
  return "Nice! Add a note about what you did";
}
function notesBlock(p, t, where) {
  const key = where + ":" + t.id;
  const isOpen = openNote === key || openNote === "any:" + t.id;
  const notes = Object.entries(t.notes || {}).filter(([, n]) => n && n.text).map(([id, n]) => ({ id, ...n })).sort((a, b) => (a.at || 0) - (b.at || 0));
  const box = el("div", { class: "notes" });
  if (t.done && t.doneBy) box.append(el("div", { class: "note-meta" }, `Done by ${name(t.doneBy)}${t.doneAt ? " · " + ago(t.doneAt) : ""}${t.checked && t.checked.by ? " · checked by " + (t.checked.by === me ? "you" : name(t.checked.by)) : ""}`));
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
  return dtf({ day: "numeric", month: "short" }).format(new Date(at));
}

/* ----- chat ----- */

/* ===================== Chat ===================== */
// One list for every conversation: the team chat (collection "chat"), a chat for each project (ideas/{id}/chat, written by
// the project's team) and private chats (dms/{a_b}/msgs, where a_b are the two people's ids in order; only they can read them).
// A chat's key: "team", "p:<projectId>" or "dm:<uid>". Pins and who's typing (team and project chats) live in meta/chat.
let dmThreads = [], dmMsgs = {}, dmSubFor = null, dmSubStop = null, dmOff = false;
let pcMsgs = {}, pcSubFor = null, pcSubStop = null, pcOff = {};
let chatMeta = { pins: {}, typing: {} };
const dmId = u => [me, u].sort().join("_");
const otherOf = t => (t.members || []).find(x => x !== me) || me;
const dmUnread = t => t.lastBy && t.lastBy !== me && (t.lastAt || 0) > ((t.seen || {})[me] || 0);
const wideChat = () => matchMedia("(min-width: 900px)").matches;
const chatKey = () => { const r = route(); return r.view !== "chat" ? null : r.ch || (wideChat() ? "team" : null) };
const chatWith = () => { const k = chatKey(); return k && k.startsWith("dm:") ? k.slice(3) : null };
const projOfKey = k => k && k.startsWith("p:") ? ideas.find(i => i.id === k.slice(2)) || null : null;
const chatHash = k => k === "team" ? "chat-team" : k === "ideas" ? "chat-ideas" : k.startsWith("dm:") ? "dm-" + k.slice(3) : "pc-" + k.slice(2);
const listOf = k => !k ? [] : k === "team" ? teamMsgs() : k === "ideas" ? ideasTimeline() : k.startsWith("dm:") ? (dmMsgs[dmId(k.slice(3))] || []) : (pcMsgs[k.slice(2)] || []);
const curList = () => listOf(chatKey() || "team");
const chatRef = (k, id) => k === "team" || k === "ideas" ? doc(db, "chat", id) : k.startsWith("dm:") ? doc(db, "dms", dmId(k.slice(3)), "msgs", id) : doc(db, "ideas", k.slice(2), "chat", id);
const msgRef = id => chatRef(chatKey() || "team", id);
const threadOf = u => dmThreads.find(t => t.id === dmId(u));
function watchDm(u) {
  const tid = u ? dmId(u) : null;
  if (tid === dmSubFor) return;
  if (dmSubStop) { dmSubStop(); dmSubStop = null }
  dmSubFor = tid; if (!tid || !db) return;
  dmSubStop = onSnapshot(query(collection(db, "dms", tid, "msgs"), orderBy("at"), limitToLast(300)),
    s => { dmMsgs[tid] = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() },
    () => { dmOff = true; renderSoon() });
}
function watchPc(pid) {
  if (pid === pcSubFor) return;
  if (pcSubStop) { pcSubStop(); pcSubStop = null }
  pcSubFor = pid; if (!pid || !db) return;
  pcSubStop = onSnapshot(query(collection(db, "ideas", pid, "chat"), orderBy("at"), limitToLast(300)),
    s => { pcMsgs[pid] = s.docs.map(d => ({ id: d.id, ...d.data() })); delete pcOff[pid]; renderSoon() },
    () => { pcOff[pid] = true; renderSoon() });
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
// Team chat messages and Ideas chat talk share the "chat" collection; Ideas talk has ch: "ideas"
const teamMsgs = () => chat.filter(m => !m.ch);
const ideaTalk = () => chat.filter(m => m.ch === "ideas");
const voteTally = votes => { const v = Object.values(votes || {}); return { k: v.filter(x => x === "keep").length, d: v.filter(x => x === "drop").length } };
const ideaNeed = () => Math.min(2, Math.max(1, teamIds().length));
const ideaState = i => { const t = voteTally(i.votes), cast = t.k + t.d, enough = cast >= ideaNeed(); return { ...t, cast, enough, won: enough && t.k > t.d, lost: enough && t.d > t.k } };
const fromVote = i => !!i.createdAt && (i.status === "voting" || i.status === "removed" || (isProj(i) && Object.keys(i.votes || {}).length > 0));
// The Ideas chat's timeline: what people wrote, every idea as a card, and short lines saying what happened
function ideasTimeline() {
  const out = ideaTalk();
  for (const i of ideas) {
    if (!fromVote(i)) continue;
    out.push({ id: "idea:" + i.id, by: i.author, at: i.createdAt, idea: i });
    if (i.wonAt) out.push({ id: "won:" + i.id, at: i.wonAt, sys: [["b", i.title], i.status === "voting" ? (i.author === me ? " won the vote. You can confirm it now." : ` won the vote. Waiting for ${firstOf(i.author)} to confirm it.`) : " won the vote."], ic: "check" });
    if (isProj(i) && i.approvedAt) { const j = Object.entries(i.joined || {}).filter(([, v]) => v && v.vote).map(([u]) => firstOf(u));
      out.push({ id: "conf:" + i.id, at: i.approvedAt, sys: [["b", (i.movedBy || i.author) === me ? "You" : firstOf(i.movedBy || i.author)], " confirmed ", ["b", i.title], j.length ? `. It's in Projects now, and ${j.join(" and ")} joined its team.` : ". It's in Projects now."], ic: "arrow" }) }
    if (i.status === "removed" && i.removedAt) out.push({ id: "rem:" + i.id, at: i.removedAt, sys: [["b", i.title], " was removed after the vote."], ic: "x" });
    if (i.backAt) out.push({ id: "back:" + i.id, at: i.backAt, sys: [["b", i.title], " is back in the vote."], ic: "bulb" });
  }
  return out.sort((x, y) => x.at - y.at);
}
const openIdeas = () => ideas.filter(i => i.status === "voting" && i.createdAt).sort((x, y) => (!!(y.votes || {})[me] ? 0 : 1) - (!!(x.votes || {})[me] ? 0 : 1) || y.createdAt - x.createdAt);
const needsMyVote = i => i.status === "voting" && !(i.votes || {})[me];
function ideaVote(i, kind) {
  const votes = { ...(i.votes || {}) }; if (votes[me] === kind) delete votes[me]; else votes[me] = kind;
  const t = voteTally(votes), won = t.k + t.d >= ideaNeed() && t.k > t.d;
  const data = { ["votes." + me]: votes[me] ? kind : DEL() };
  if (won && !i.wonAt) { data.wonAt = Date.now(); data.wonBy = me } else if (!won && i.wonAt) { data.wonAt = DEL(); data.wonBy = DEL() }
  write(() => upd(i.id, data));
}
const removeIdea = i => write(() => upd(i.id, { status: "removed", removedAt: Date.now(), removedBy: me }), "Idea removed");
const bringBackIdea = i => write(() => upd(i.id, { status: "voting", votes: { [i.author]: "keep" }, wonAt: DEL(), wonBy: DEL(), removedAt: DEL(), removedBy: DEL(), backAt: Date.now() }), "Back in the vote");
function ideaCardEl(item) {
  const i = item.idea, s = ideaState(i), mine = (i.votes || {})[me], proj = isProj(i), gone = i.status === "removed", team = Math.max(1, teamIds().length);
  const verdict = proj || gone ? "" : !s.enough ? `${s.cast} of ${team} voted · ${ideaNeed() - s.cast} more needed` : s.won ? "Keep wins" : s.lost ? "Drop wins" : "Tied";
  const stop = fn => e => { e.stopPropagation(); fn() };
  let act = null;
  if (proj) act = [el("span", { class: "wait" }, `Confirmed by ${(i.movedBy || i.author) === me ? "you" : firstOf(i.movedBy || i.author)}`), el("span", { class: "spacer" }),
    el("button", { type: "button", class: "btn small primary", onclick: stop(() => { location.hash = "project-" + i.id }) }, "Open project", nIc("arrow", "sm"))];
  else if (gone) act = [el("span", { class: "wait" }, "Removed after the vote"), el("span", { class: "spacer" }), el("button", { type: "button", class: "btn small", onclick: stop(() => bringBackIdea(i)) }, "Bring back to vote")];
  else if (s.won) act = i.author === me ? [el("span", { class: "wait" }, "Keep won. It's yours to confirm"), el("span", { class: "spacer" }), el("button", { type: "button", class: "btn small primary", onclick: stop(() => confirmIdea(i)) }, "Confirm to Projects", nIc("arrow", "sm"))]
    : [el("span", { class: "wait" }, `Keep won. Waiting for ${firstOf(i.author)} to confirm`)];
  else if (s.lost) act = [el("span", { class: "wait" }, "Drop won"), el("span", { class: "spacer" }), el("button", { type: "button", class: "btn small", onclick: stop(() => removeIdea(i)) }, "Remove it")];
  const vb = (kind, label, n) => el("button", { type: "button", class: "nc-vb " + kind, "aria-pressed": String(mine === kind), onclick: stop(() => ideaVote(i, kind)) }, label, el("b", {}, String(n)));
  return el("div", { class: "nc-idea" + (proj || gone ? " closed" : "") },
    el("div", { class: "itop" }, proj ? el("span", { class: "itag proj" }, nIc("check"), "Now a project") : gone ? el("span", { class: "itag gone" }, "Removed") : el("span", { class: "itag" }, nIc("bulb"), "Idea"),
      catsOf(i).slice(0, 2).map(c => el("span", { class: "icat" }, c)), needsMyVote(i) ? el("span", { class: "ineed" }, "Needs your vote") : null),
    el("div", { class: "ititle", dir: "auto" }, i.title),
    clientOf(i) ? el("div", { class: "iclient" }, "Client ", el("b", {}, clientOf(i))) : null,
    i.pitch ? el("p", { class: "ipitch", dir: "auto", onclick: e => { e.stopPropagation(); e.currentTarget.classList.toggle("open") } }, i.pitch) : null,
    proj ? null : el("div", { class: "ivote" }, vb("keep", "Keep", s.k), vb("drop", "Drop", s.d),
      el("span", { class: "vst" }, Object.keys(i.votes || {}).slice(0, 6).map(u => ncAv(u, "xs", false))), el("span", { class: "iverd" + (s.won ? " win" : "") }, verdict)),
    act ? el("div", { class: "iact" }, act) : null);
}
let ncPitchOpen = false;
function openPitch(on) { ncPitchOpen = on; ncPlusOpen = false; renderPitch(); if (on) setTimeout(() => $("#f-title").focus(), 60) }
function renderPitch() { const s = $("#nc-pitch"); s.hidden = !ncPitchOpen; if (ncPitchOpen) $("#nc-scrim").hidden = false; else if (!ncSheet) $("#nc-scrim").hidden = true }
function renderTray(k) {
  const t = $("#nc-tray");
  if (k !== "ideas") { t.hidden = true; t.replaceChildren(); return }
  const list = openIdeas(); t.hidden = false;
  t.replaceChildren(el("span", { class: "tl" }, "Open ideas ", el("b", {}, String(list.length))),
    ...(list.length ? list.map(i => { const s = ideaState(i), need = needsMyVote(i);
      return el("button", { type: "button", class: "tcard" + (need ? " need" : s.won ? " won" : ""), onclick: () => ncJump("idea:" + i.id) }, el("b", { dir: "auto" }, i.title),
        el("span", {}, need ? "Needs your vote" : s.won ? (i.author === me ? "Keep won · confirm it" : "Keep won") : s.lost ? "Drop won" : `Keep ${s.k} · Drop ${s.d}`)) })
      : [el("span", { class: "tl quiet" }, "All decided. Tap Pitch to post the next one")]));
}
let chatSel = null, chatReply = null, chatEdit = null, chatDel = null, chatReactPick = null, chatEmojiOpen = false;
let ncFilter = "all", ncInfo = false, ncInfoTab = "photos", ncFind = "", ncFindOpen = false, ncForm = null, ncPollN = 2, ncFwd = null, ncPlusOpen = false;
let ncSheet = null, ncCur = null, ncDivider = 0, ncDividerSet = false, ncFlash = null;
const ncDrafts = {};
const seenKey = () => "chatSeen:" + me;
const getSeen = () => { try { return +localStorage.getItem(seenKey()) || 0 } catch { return 0 } };
const setSeen = v => { try { localStorage.setItem(seenKey(), String(v)) } catch { } };
const msgById = id => curList().find(m => m.id === id);
const snippet = t => (t || "").replace(/\s+/g, " ").slice(0, 90) + ((t || "").length > 90 ? "…" : "");
const fmtSecs = s => `${Math.floor((s || 0) / 60)}:${String(Math.round(s || 0) % 60).padStart(2, "0")}`;
const initials = s => String(s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join("").toUpperCase() || "?";
const firstOf = u => (chatName(u) || "").split(" ")[0];
const atName = u => (realName(u) || chatName(u) || "").split(" ")[0];   // the name people type after @ (yours too, not "You")

/* icons: a small set drawn once in the page (see #nc-icons) */
// icons are made once and copied after that (much quicker than reading the SVG text every time)
const nIcCache = {};
const nIcSvg = id => { let t = nIcCache[id]; if (!t) { const h = document.createElement("span"); h.innerHTML = `<svg aria-hidden="true"><use href="#ni-${id}"/></svg>`; t = nIcCache[id] = h.firstChild } return t.cloneNode(true) };
const nIc = (id, cls = "") => { const s = document.createElement("span"); s.className = "nic" + (cls ? " " + cls : ""); s.append(nIcSvg(id)); return s };
// a person's round picture, or their initials on soft teal
function ncAv(u, cls = "", dot = true) {
  const pr = people[u] || {}, pm = pmByUid(u) || {}, ph = pr.pic || pr.photo || pm.photo || "";
  return el("span", { class: "nc-av" + (cls ? " " + cls : ""), title: chatName(u) },
    ph ? el("img", { src: ph, alt: "", referrerpolicy: "no-referrer" }) : initials(realName(u) || chatName(u)),
    dot && u !== me && isOnline(u) ? el("span", { class: "on" }) : null);
}
const keyAv = (k, cls = "") => k === "ideas" ? el("span", { class: "nc-av ideas" + (cls ? " " + cls : "") }, nIc("bulb")) : k === "team" ? el("span", { class: "nc-av team" + (cls ? " " + cls : "") }, "#")
  : k.startsWith("dm:") ? ncAv(k.slice(3), cls) : el("span", { class: "nc-av sq" + (cls ? " " + cls : "") }, initials((projOfKey(k) || {}).title));
const keyTitle = k => k === "ideas" ? "Ideas" : k === "team" ? "Everyone" : k.startsWith("dm:") ? chatName(k.slice(3)) : (projOfKey(k) || {}).title || "Project";
const chatMembers = k => k === "team" || k === "ideas" ? teamIds() : k.startsWith("p:") ? (projOfKey(k) ? teamOf(projOfKey(k)) : []) : [me, k.slice(3)];

/* seen, unread and read ticks: each person's last-seen time per chat is on their profile (users/{uid}.chatSeen) */
const mySeenMap = () => ((people[me] || {}).chatSeen) || {};
const seenOf = (k, u = me) => {
  if (k.startsWith("dm:")) return (((threadOf(k.slice(3)) || {}).seen) || {})[u] || 0;
  const s = ((((people[u] || {}).chatSeen) || {})[k] || {}).at || 0;
  return u === me && k === "team" ? Math.max(s, getSeen()) : s;
};
const seenSent = {};
function markRead(k) {
  if (!k || document.hidden || !db) return;
  if (k.startsWith("dm:")) {
    const t = threadOf(k.slice(3)); if (t && dmUnread(t)) { t.seen = { ...(t.seen || {}), [me]: Date.now() }; setDoc(doc(db, "dms", t.id), { seen: { [me]: Date.now() } }, { merge: true }).catch(() => {}) }
    return;
  }
  const list = listOf(k), p = projOfKey(k), last = Math.max(list.length ? list[list.length - 1].at : 0, p && p.chat && p.chat.last ? p.chat.last.at : 0);
  if (!last || last <= seenOf(k) || (seenSent[k] || 0) >= last) return;
  seenSent[k] = last; if (k === "team") setSeen(last);
  setDoc(doc(db, "users", me), { chatSeen: { [k]: { at: last, n: p ? ((p.chat || {}).n || 0) : list.length } } }, { merge: true }).catch(() => { seenSent[k] = 0 });
}

/* @mentions */
function findMentions(k, text) {
  if (!k || k.startsWith("dm:")) return [];
  const words = new Set((String(text).match(/@([\p{L}\p{N}_]+)/gu) || []).map(w => w.slice(1).toLowerCase()));
  const out = new Set(); if (words.has("everyone") || words.has("all")) out.add("all");
  for (const u of chatMembers(k)) if (u !== me && words.has(atName(u).toLowerCase())) out.add(u);
  return [...out];
}
const mentionsMe = m => !!m && m.by !== me && Array.isArray(m.mentions) && (m.mentions.includes(me) || m.mentions.includes("all"));
// message text: links, and @names in a teal pill (yours in graphite)
function ncText(k, text) {
  const names = new Map(chatMembers(k).map(u => [atName(u).toLowerCase(), u]));
  const out = []; let last = 0;
  String(text).replace(/@([\p{L}\p{N}_]+)/gu, (w, n, i) => {
    const l = n.toLowerCase(), u = names.get(l);
    if (!u && l !== "everyone" && l !== "all") return w;
    out.push(...linkify(text.slice(last, i)));
    out.push(el("span", { class: "nc-mention" + (u === me || l === "everyone" || l === "all" ? " me" : "") }, w));
    last = i + w.length; return w;
  });
  out.push(...linkify(text.slice(last)));
  return el("span", { class: "nc-text", dir: "auto" }, out);
}

/* who gets a phone alert from a chat: every message, only @mentions, or nothing */
const notifyOf = (k, u = me) => ((((people[u] || {}).chatNotify) || {})[k]) || "all";
function setNotify(k, v) {
  write(() => setDoc(doc(db, "users", me), { chatNotify: { [k]: v === "all" ? DEL() : v } }, { merge: true }),
    v === "off" ? "Muted. You still see the unread count" : v === "mentions" ? "You'll only hear about @mentions here" : "You'll hear about every message");
}

/* online: the site says you're here every couple of minutes while it's open */
let activeSentAt = 0;
function heartbeat() {
  if (!me || !db || !live || document.hidden || partnerMode || clientMode) return;
  const now = Date.now(); if (now - activeSentAt < 120e3) return; activeSentAt = now;
  setDoc(doc(db, "users", me), { active: now }, { merge: true }).catch(() => { activeSentAt = 0 });
}
setInterval(heartbeat, 30e3); document.addEventListener("visibilitychange", heartbeat); addEventListener("focus", heartbeat);
const isOnline = u => Date.now() - ((people[u] || {}).active || 0) < 4 * 60e3;
const lastSeenText = u => { const a = (people[u] || {}).active; return a ? "Last seen " + ago(a) : "" };

/* typing: written at most every 4 seconds, and shown for 7 */
let typingSentAt = 0, typingKey = null;
function sendTyping(k) {
  if (!k || !db) return;
  const now = Date.now(); if (typingKey === k && now - typingSentAt < 4000) return;
  if (k.startsWith("dm:") && !threadOf(k.slice(3))) return;
  typingSentAt = now; typingKey = k;
  (k.startsWith("dm:") ? setDoc(doc(db, "dms", dmId(k.slice(3))), { typing: { [me]: now } }, { merge: true }) : setDoc(doc(db, "meta", "chat"), { typing: { [k]: { [me]: now } } }, { merge: true })).catch(() => {});
}
function stopTyping() {
  const k = typingKey; if (!k || !db) return; typingKey = null; typingSentAt = 0;
  (k.startsWith("dm:") ? setDoc(doc(db, "dms", dmId(k.slice(3))), { typing: { [me]: DEL() } }, { merge: true }) : setDoc(doc(db, "meta", "chat"), { typing: { [k]: { [me]: DEL() } } }, { merge: true })).catch(() => {});
}
const typersIn = k => {
  const t = k.startsWith("dm:") ? ((threadOf(k.slice(3)) || {}).typing || {}) : (((chatMeta.typing || {})[k]) || {});
  return Object.entries(t).filter(([u, at]) => u !== me && typeof at === "number" && Date.now() - at < 7000).map(([u]) => u);
};
let typingTimer = null;
const typingWord = (k, us) => k.startsWith("dm:") ? "typing…" : `${us.map(firstOf).join(", ")} ${us.length > 1 ? "are" : "is"} typing…`;

/* pinned message, one per chat */
const pinOf = k => k.startsWith("dm:") ? ((threadOf(k.slice(3)) || {}).pin || null) : (((chatMeta.pins || {})[k]) || null);
function setPin(k, m) {
  const v = m ? { id: m.id, text: (m.text || msgSummary(m)).slice(0, 200), by: me, at: Date.now() } : DEL();
  if (k.startsWith("dm:")) return write(() => setDoc(doc(db, "dms", dmId(k.slice(3))), { pin: v }, { merge: true }), m ? "Pinned for both of you" : "Unpinned");
  return write(() => setDoc(doc(db, "meta", "chat"), { pins: { [k]: v } }, { merge: true }), m ? "Pinned for everyone in this chat" : "Unpinned");
}

/* sending */
let sending = false;
const extraFor = k => { const u = k && k.startsWith("dm:") ? k.slice(3) : null, pm = u ? pmByUid(u) : null; return pm ? { gid: pm.gid } : {} };
async function sendMsg(k, data) {
  const full = { by: me, at: Date.now(), text: "", ...(k === "ideas" ? { ch: "ideas" } : {}), ...data };
  const ok = await write(() => setDoc(chatRef(k, uid()), full));
  if (ok) afterSend(k, full);
  return ok;
}
function afterSend(k, last) {
  stopTyping();
  if (k.startsWith("dm:")) write(() => touchThread(k.slice(3), last));
  else if (k.startsWith("p:")) {
    const p = projOfKey(k); if (!p) return;
    const c = p.chat || {};
    write(() => upd(p.id, { "chat.n": (c.n || 0) + 1, "chat.last": { by: me, at: last.at, text: msgSummary(last).slice(0, 120), ...(last.mentions && last.mentions.length ? { mentions: last.mentions } : {}) } }));
  }
}
async function ncSend() {
  const k = chatKey(); if (!k || sending || rec) return;
  const inp = $("#chat-input"); const text = inp.value.trim();
  if (chatEdit) {
    if (!text) return;
    inp.value = ""; autoGrow(inp); updateSendBtn();
    const id = chatEdit; chatEdit = null;
    const old = msgById(id);
    if (old && old.text !== text) write(() => updateDoc(msgRef(id), { text, edited: Date.now(), mentions: findMentions(k, text) }), "Message edited");
    else render();
    return;
  }
  if (!text && !pending.length) { startRec(); return }
  inp.value = ""; autoGrow(inp); ncDrafts[k] = ""; closeMentions(); if (chatEmojiOpen) $("#chat-emoji").click();
  await fbReady;
  let replyTo = chatReply && msgById(chatReply) ? chatReply : null;
  chatReply = null;
  const files = pending.splice(0); renderAttach();
  if (files.length) {
    sending = true; updateSendBtn();
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadStatus(`Sending ${files.length > 1 ? `file ${i + 1} of ${files.length}` : files[i].f.name}…`);
        const file = await uploadFile(await prepareFile(files[i].f), pct => setUploadStatus(`Sending ${files[i].f.name}… ${pct}%`), extraFor(k));
        await sendMsg(k, { file, ...(replyTo ? { replyTo } : {}) }); replyTo = null;
      }
    } catch (e) {
      status(e && e.code === "permission-denied" ? "Sending files isn't allowed yet. Ask Mohammed to update the database rules." : "A file didn't send. Check your connection and try again.", true);
    }
    sending = false; setUploadStatus("");
  }
  if (text) { const mentions = findMentions(k, text); sendMsg(k, { text, ...(replyTo ? { replyTo } : {}), ...(mentions.length ? { mentions } : {}) }) }
  ncToBottom = true; updateSendBtn(); render();
}
function cancelChatMode() {
  if (chatEdit) $("#chat-input").value = "";
  chatReply = null; chatEdit = null; updateSendBtn(); render();
}

/* voice messages: recorded in the browser, sent like a file (about 1 MB a minute) */
let rec = null;
// The sound is taken straight from the microphone and saved as a plain WAV file that every phone and browser plays.
// (Each browser's own recorder makes its own format, and some browsers can't play the others'.)
// When the microphone is blocked, say exactly where to allow it on this device, so it stops asking.
function micHelp(e) {
  const n = e && e.name;
  if (n === "NotFoundError" || n === "OverconstrainedError") { toast("No microphone was found on this device", 5000); return }
  if (n === "NotReadableError" || n === "AbortError") { toast("Another app is using the microphone. Close it and try again", 6000); return }
  const ua = navigator.userAgent, home = isHomeScreenApp();
  const how = isIOS() ? (home ? "Close Pitch Room fully (swipe it away), open it again and tap Allow when it asks."
      : "Tap “aA” in the address bar, then Website Settings, then Microphone: Allow. Safari stops asking after that.")
    : /Android/.test(ua) ? "Tap the icon left of the web address, then Permissions, then Microphone: Allow."
    : /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? "Open the Safari menu, then Settings for this Website, then Microphone: Allow."
    : "Click the icon left of the web address, set Microphone to Allow, then try again.";
  toast("The microphone is blocked. " + how, 12000);
}
let recStarting = false, recAbort = false;
async function startRec() {
  if (rec || recStarting) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("Voice messages need a newer browser. Try Chrome or Safari"); return }
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null; try { ac = AC ? new AC() : null } catch { }   // made inside the tap, so phones let it run
  let stream;
  recStarting = true; recAbort = false;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) } catch (e) { recStarting = false; try { ac && ac.close() } catch { } micHelp(e); return }
  recStarting = false;
  // let go of the mic before it was ready: nothing to record
  if (recAbort) { recAbort = false; stream.getTracks().forEach(t => t.stop()); try { ac && ac.close() } catch { } return }
  rec = { chunks: [], pcm: [], start: Date.now(), stream, levels: [], lvl: 0 };
  let ok = false;
  if (ac && ac.createScriptProcessor) try {
    if (ac.state === "suspended") await ac.resume();
    const src = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), mute = ac.createGain(); mute.gain.value = 0;
    proc.onaudioprocess = e => { if (!rec || rec.ac !== ac) return; const d = e.inputBuffer.getChannelData(0); rec.pcm.push(new Float32Array(d)); let m = 0; for (let i = 0; i < d.length; i += 16) m = Math.max(m, Math.abs(d[i])); rec.lvl = Math.min(1, m * 2) };
    src.connect(proc); proc.connect(mute); mute.connect(ac.destination);
    Object.assign(rec, { ac, rate: ac.sampleRate, src, proc, mute }); ok = true;
  } catch { }
  if (!ok) {   // very old browsers: use the browser's own recorder
    try { ac && ac.close() } catch { }
    if (!window.MediaRecorder) { stream.getTracks().forEach(t => t.stop()); rec = null; toast("Voice messages need a newer browser. Try Chrome or Safari"); return }
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
    let mr; try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined) } catch { mr = new MediaRecorder(stream) }
    Object.assign(rec, { mr, type: mr.mimeType || type || "audio/webm" });
    mr.ondataavailable = e => { if (e.data && e.data.size) rec && rec.chunks.push(e.data) };
    mr.start(250);
  }
  $("#nc-rec").hidden = false; $("#chatform").hidden = true; closeMentions(); ncPlusOpen = false; renderPlus();
  const wave = $("#nc-recwave"); wave.replaceChildren(...Array.from({ length: 28 }, () => el("i", { style: "height:4px" })));
  rec.timer = setInterval(() => {
    if (!rec) return;
    const s = (Date.now() - rec.start) / 1000; $("#nc-rect").textContent = fmtSecs(s);
    const lvl = rec.ac ? rec.lvl : Math.random() * .5;
    const bars = [...wave.children]; bars.forEach((b, i) => { b.style.height = (i === bars.length - 1 ? 4 + lvl * 20 : parseFloat((bars[i + 1] || b).style.height)) + "px" });
    if (s >= 290) stopRec(true);
  }, 120);
}
function stopRec(send) {
  const r = rec; if (!r) return; rec = null; clearInterval(r.timer);
  $("#nc-rec").hidden = true; $("#chatform").hidden = false;
  const k = chatKey(), secs = Math.max(1, Math.round((Date.now() - r.start) / 1000));
  const done = async () => {
    r.stream.getTracks().forEach(t => t.stop());
    if (r.ac) { try { r.src.disconnect(); r.proc.disconnect(); r.mute.disconnect() } catch { } try { r.ac.close() } catch { } }
    if (!send || !k) { if (!send) toast("Voice message deleted"); return }
    let type, blob, len = secs;
    setUploadStatus("Sending voice message…");
    if (r.ac) {
      if (!r.pcm.length) { setUploadStatus(""); toast("No sound was recorded. Check the microphone and try again"); return }
      const w = pcmToWav(r.pcm, r.rate); blob = w.blob; type = "audio/wav"; len = Math.max(1, Math.round(w.secs));
    } else {
      type = (r.type || "audio/webm").split(";")[0]; blob = new Blob(r.chunks, { type });
      try { const w = await voiceToWav(blob); if (w) { blob = w.blob; type = "audio/wav"; len = Math.max(1, Math.round(w.secs)) } } catch { }
    }
    if (blob.size > MAX_FILE) { setUploadStatus(""); toast("That voice message is too long. Keep it under 5 minutes"); return }
    try { const file = await uploadFile({ blob, name: "Voice message." + (type === "audio/wav" ? "wav" : /mp4|aac/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm"), type }, null, extraFor(k)); file.voice = len; ncToBottom = true; await sendMsg(k, { file }) }
    catch { toast("The voice message didn't send. Check your connection and try again", 5000) }
    setUploadStatus("");
  };
  if (r.mr) { r.mr.onstop = done; try { r.mr.stop() } catch { done() } } else done();
}
// raw microphone sound -> mono 16 kHz WAV (clear for voice, about 2 MB a minute)
function pcmToWav(chunks, rate) {
  const total = chunks.reduce((s, c) => s + c.length, 0), out = 16000, ratio = rate / out, n = Math.max(1, Math.floor(total / ratio)), res = new Float32Array(n);
  let ci = 0, off = 0, acc = 0, cnt = 0, oi = 0, next = ratio, pos = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { acc += c[i]; cnt++; pos++; if (pos >= next && oi < n) { res[oi++] = acc / cnt; acc = 0; cnt = 0; next += ratio } }
  return { blob: wavBlob(res.subarray(0, oi), out), secs: total / rate };
}
// one player for all voice messages, so playing survives the page redrawing
const ncAudio = { a: new Audio(), id: null, rate: 1, loading: null, alt: {} };
ncAudio.a.preload = "auto";
// a tiny silent sound, played in the tap itself: Safari only lets sound start from a tap, and the real file arrives a moment later
const SILENT_WAV = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==";
const waveOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Array.from({ length: 34 }, (_, i) => 5 + Math.round(Math.abs(Math.sin(i * 1.7 + (h % 97))) * 18) + (i % 5)) };
function voiceUi() {
  const { a, id } = ncAudio;
  for (const v of document.querySelectorAll(".nc-voice")) {
    // voice notes from Chrome don't say how long they are, so the length saved with the message is used
    const mine = v.dataset.voice === id, bars = v.querySelectorAll(".nc-wave i"), dur = isFinite(a.duration) && a.duration > 0 ? a.duration : +v.dataset.secs || 0, pct = mine && dur ? Math.min(1, a.currentTime / dur) : 0;
    bars.forEach((b, i) => b.classList.toggle("on", mine && i < Math.round(pct * bars.length)));
    const t = v.querySelector(".nc-vt"); if (t) t.textContent = mine && !a.paused ? fmtSecs(a.currentTime) : fmtSecs(+v.dataset.secs);
    const btn = v.querySelector(".nc-play"); if (btn) { const want = mine && (!a.paused || ncAudio.loading === id) ? "pause" : "play"; if (btn.dataset.ic !== want) { btn.dataset.ic = want; btn.replaceChildren(nIc(want)) } btn.classList.toggle("busy", mine && ncAudio.loading === id) }
  }
}
ncAudio.a.addEventListener("timeupdate", voiceUi); ncAudio.a.addEventListener("pause", voiceUi); ncAudio.a.addEventListener("play", voiceUi);
ncAudio.a.addEventListener("ended", () => { ncAudio.id = null; voiceUi() });
async function toggleVoice(f) {
  const a = ncAudio.a;
  if (ncAudio.id === f.id && !ncAudio.loading) { if (a.paused) a.play().catch(() => {}); else a.pause(); return }
  if (ncAudio.id === f.id && ncAudio.loading) { ncAudio.id = null; ncAudio.loading = null; a.pause(); voiceUi(); return }   // second tap while loading: stop
  a.pause(); ncAudio.id = f.id; ncAudio.loading = f.id;
  try { a.src = SILENT_WAV; a.play().catch(() => {}) } catch { }   // unlocks sound inside the tap
  voiceUi();
  const go = async url => { a.src = url; a.playbackRate = ncAudio.rate; await a.play() };
  let url;
  try { url = ncAudio.alt[f.id] || await loadFile(f) }
  catch { if (ncAudio.id === f.id) { ncAudio.id = null; ncAudio.loading = null; voiceUi(); toast("That voice message didn't load. Check your connection and tap play again") } return }
  try {
    if (ncAudio.id !== f.id) return;
    let why = [];
    try { await go(url) }
    catch (e) {
      if (ncAudio.id !== f.id || (e && e.name === "AbortError")) return;
      why.push("play " + (e && e.name || "?"));
      // 1. the label on the file may be wrong (Safari goes by the label): read the real format from its first bytes
      const buf = await (await fetch(url)).arrayBuffer(), real = soundType(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)));
      why.push("is " + (real || "unknown"));
      let done = false;
      if (real && real !== (f.type || "").split(";")[0]) {
        try { const u2 = URL.createObjectURL(new Blob([buf], { type: real })); await go(u2); ncAudio.alt[f.id] = u2; done = true }
        catch (e2) { if (e2 && e2.name === "AbortError") return; why.push("relabel " + (e2 && e2.name || "?")) }
      }
      // 2. still no: turn it into a plain sound file and play that
      if (!done) {
        if (ncAudio.id !== f.id) return;
        try { ncAudio.alt[f.id] = await toWav(url) } catch (e3) { why.push("convert " + (e3 && e3.name || "?")); throw Object.assign(new Error("format"), { why }) }
        if (ncAudio.id !== f.id) return;
        await go(ncAudio.alt[f.id]);
      }
    }
    ncAudio.loading = null; voiceUi();
  } catch (e) {
    if (ncAudio.id !== f.id) return;
    ncAudio.id = null; ncAudio.loading = null; voiceUi();
    if (e && e.name === "NotAllowedError") { toast("Tap play again to listen"); return }
    const info = [(f.type || "no type"), f.size ? Math.round(f.size / 1024) + " KB" : "", ...((e && e.why) || [e && e.name || "?"]), sndBrowser()].filter(Boolean).join(" · ");
    toast(`This voice message won't play in this browser. Try it on another phone or computer. (${info})`, 9000);
  }
}
// what a sound file really is, from its first bytes
function soundType(b) {
  const s = (o, t) => [...t].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return "audio/webm";
  if (s(4, "ftyp") || s(4, "moof") || s(4, "styp")) return "audio/mp4";
  if (s(0, "RIFF") && s(8, "WAVE")) return "audio/wav";
  if (s(0, "OggS")) return "audio/ogg";
  if (s(0, "ID3") || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return "audio/mpeg";
  if (s(0, "caff")) return "audio/x-caf";
  return "";
}
function sndBrowser() { const u = navigator.userAgent; return /Edg\//.test(u) ? "Edge" : /CriOS|Chrome\//.test(u) ? "Chrome" : /Firefox|FxiOS/.test(u) ? "Firefox" : /Safari\//.test(u) ? (/iPhone|iPad/.test(u) ? "iPhone Safari" : "Safari") : "browser" }
async function decodeSound(buf) {
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  try { return await new Promise((ok, no) => { const p = ac.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no) }) }
  finally { try { ac.close() } catch { } }
}
// a recording as a mono 16 kHz WAV: clear for voice, about 2 MB a minute, plays everywhere
async function voiceToWav(blob) {
  const audio = await decodeSound(await blob.arrayBuffer()), rate = 16000, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC || !audio.duration) return null;
  const off = new OAC(1, Math.max(1, Math.ceil(audio.duration * rate)), rate), src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start(0);
  const out = await new Promise((ok, no) => { off.oncomplete = e => ok(e.renderedBuffer); const p = off.startRendering(); if (p && p.then) p.then(ok, no) });
  return { blob: wavBlob(out.getChannelData(0), rate), secs: audio.duration };
}
async function toWav(url) {
  const audio = await decodeSound(await (await fetch(url)).arrayBuffer());
  return URL.createObjectURL(wavBlob(audio.getChannelData(0), audio.sampleRate));
}
function wavBlob(ch, rate) {
  const n = ch.length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const s = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); s(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 0x7fff, true);
  return new Blob([out], { type: "audio/wav" });
}
// voice notes start loading as soon as they scroll into view, so play starts right away
const voiceIO = "IntersectionObserver" in window ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { voiceIO.unobserve(e.target); const f = e.target._file; if (f && (f.size || 0) < 3e6) (window.requestIdleCallback || setTimeout)(() => loadFile(f).catch(() => {})) } }, { rootMargin: "300px" }) : null;
function watchVoices() { if (!voiceIO) return; voiceIO.disconnect(); for (const v of document.querySelectorAll("#chatlog .nc-voice")) if (v._file) voiceIO.observe(v) }
function cycleRate() { ncAudio.rate = ncAudio.rate === 1 ? 1.5 : ncAudio.rate === 1.5 ? 2 : 1; ncAudio.a.playbackRate = ncAudio.rate; for (const s of document.querySelectorAll(".nc-speed")) s.textContent = ncAudio.rate + "×" }
function voiceEl(f) {
  const v = el("div", { class: "nc-voice", "data-voice": f.id, "data-secs": f.voice || 0 },
    el("button", { type: "button", class: "nc-play", "aria-label": "Play voice message", "data-ic": "play", onclick: e => { e.stopPropagation(); toggleVoice(f) } }, nIc("play")),
    el("span", { class: "nc-wave" }, waveOf(f.id).map(h => el("i", { style: `height:${h}px` }))),
    el("span", { class: "nc-vmeta" }, el("button", { type: "button", class: "nc-speed", onclick: e => { e.stopPropagation(); cycleRate() } }, ncAudio.rate + "×"), el("span", { class: "nc-vt" }, fmtSecs(f.voice))));
  v._file = f; return v;
}

/* polls */
function pollEl(k, m) {
  const votes = (m.poll && m.poll.votes) || {}, opts = (m.poll && m.poll.opts) || [], who = Object.keys(votes), mineV = votes[me];
  const counts = opts.map((_, i) => who.filter(u => votes[u] === i).length);
  const total = Math.max(1, chatMembers(k).length);
  return el("div", { class: "nc-poll" }, el("div", { class: "q", dir: "auto" }, m.poll.q), el("div", { class: "sub" }, `Poll · tap to vote · ${who.length} of ${total} voted`),
    opts.map((t, i) => { const pc = who.length ? Math.round(counts[i] / who.length * 100) : 0, on = mineV === i;
      return el("button", { type: "button", class: "nc-opt" + (on ? " on" : ""), onclick: e => { e.stopPropagation(); write(() => updateDoc(chatRef(k, m.id), { [`poll.votes.${me}`]: on ? DEL() : i })) } },
        el("span", { class: "fill", style: `width:${pc}%` }), el("span", { class: "box" }, on ? nIc("check") : null), el("span", { class: "lab", dir: "auto" }, t),
        el("span", { class: "vs" }, who.filter(u => votes[u] === i).slice(0, 4).map(u => ncAv(u, "xs", false))), el("span", { class: "pc" }, pc + "%")) }));
}
/* a task made from a message: shows the task as it is now */
function taskCardEl(k, m) {
  const p = ideas.find(i => i.id === m.task.pid), t = p ? tasksOf(p).find(x => x.id === m.task.tid) : null;
  return el("div", { class: "nc-taskcard" },
    el("span", { class: "k" }, nIc("task"), t && t.done ? "Task done" : m.task.from ? "Task made from a message" : "New task"),
    el("span", { class: "tt" + (t && t.done ? " done" : ""), dir: "auto" }, t ? t.text : m.task.text),
    t ? el("span", { class: "tm" }, assignees(t).map(u => el("span", { class: "nc-chip" }, ncAv(u, "xs", false), firstOf(u))), t.due ? el("span", { class: "nc-chip" }, "Due " + fmtDate(t.due)) : null, el("span", { class: "nc-chip" }, p.title))
      : el("span", { class: "nc-sub" }, "This task was deleted"),
    el("span", { class: "nc-row2" },
      t ? el("button", { type: "button", class: "btn small primary", onclick: e => { e.stopPropagation(); location.hash = "task-" + p.id + "-" + t.id } }, "Open task") : null,
      m.task.from ? el("button", { type: "button", class: "btn small", onclick: e => { e.stopPropagation(); ncJump(m.task.from) } }, "See the message") : null));
}
function makeTask(k, m) {
  const p = projOfKey(k);
  const text = (m.text || msgSummary(m)).replace(/^(@[\p{L}\p{N}_]+[\s,]*)+/u, "").replace(/\s+/g, " ").trim().slice(0, 140) || "Follow up";
  if (!p || !canPlan(p)) return write(() => setDoc(doc(db, "private", me, "tasks", uid()), { text, done: false, due: null, priority: "medium", order: Date.now() }), "Saved as your own task. Find it in Me");
  const tid = uid(), owner = m.by !== me && teamOf(p).includes(m.by) ? m.by : null, ph = getPhases(p)[0];
  write(async () => {
    await upd(p.id, { ["tasks." + tid]: { text, phase: ph ? ph.id : "build", skill: null, owner, assignedBy: me, assignedAt: Date.now(), done: false, order: Date.now(), due: null } });
    ncToBottom = true; await sendMsg(k, { task: { pid: p.id, tid, text, from: m.id } });
  }, `Task added to ${p.title}`);
}
function askAboutMsg(m) {
  asstOpen = true; alertsOpen = false; render();
  setTimeout(() => { const i = document.getElementById("asst-input"); if (i) { i.value = `About this message from ${chatName(m.by)}: “${(m.text || msgSummary(m)).slice(0, 500)}”\n`; i.focus(); i.dispatchEvent(new Event("input")) } }, 80);
}

/* the list of chats */
function chatRows() {
  const rows = [];
  const itl = ideasTimeline().filter(m => !m.sys), il = itl[itl.length - 1], iSeen = seenOf("ideas"), iNew = itl.filter(m => m.at > iSeen && m.by !== me);
  rows.push({ k: "ideas", kind: "ideas", title: "Ideas", last: il ? { by: il.by, at: il.at, text: msgSummary(il) } : null, unread: iNew.length, mention: iNew.some(mentionsMe), pinned: true, needVote: ideas.filter(needsMyVote).length });
  const tm = teamMsgs(), tl = tm.length ? tm[tm.length - 1] : null, tSeen = seenOf("team"), tNew = tm.filter(m => m.at > tSeen && m.by !== me);
  rows.push({ k: "team", kind: "team", title: "Everyone", last: tl ? { by: tl.by, at: tl.at, text: tl.system ? "Weekly summary" : msgSummary(tl) } : null, unread: tNew.length, mention: tNew.some(mentionsMe), pinned: true });
  for (const p of ideas) {
    if (p.status !== "approved" || !(isAdmin || projTeam(p).includes(me))) continue;
    const k = "p:" + p.id, c = p.chat || {}, last = c.last || null, s = mySeenMap()[k] || {};
    const unread = last && last.by !== me && last.at > (s.at || 0) ? Math.max(1, (c.n || 0) - (s.n || 0)) : 0;
    rows.push({ k, kind: "project", title: p.title, last, unread, at: last ? last.at : 0, mention: !!(unread && last && Array.isArray(last.mentions) && (last.mentions.includes(me) || last.mentions.includes("all"))) });
  }
  const others = teamIds().filter(u => u !== me && people[u]);
  const partners = [...new Set([...pMembers.filter(m => m.uid && m.active !== false).map(m => m.uid), ...dmThreads.filter(t => Object.values(t.roles || {}).includes("partner")).map(otherOf)])].filter(u => u !== me && !others.includes(u));
  for (const u of [...others, ...partners]) { const t = threadOf(u); rows.push({ k: "dm:" + u, kind: "dm", u, partner: isPartnerUid(u), title: chatName(u), last: t && t.lastAt ? { by: t.lastBy, at: t.lastAt, text: t.lastText || "" } : null, unread: t && dmUnread(t) ? 1 : 0 }) }
  if (typeof pGroups !== "undefined") for (const g of pGroups) {
    const items = groupChatItems(g.id, () => false).filter(x => !x.system), l = items[items.length - 1];
    rows.push({ k: "pg:" + g.id, kind: "pgroup", gid: g.id, title: g.name || "Partner group", partner: true, last: l ? { by: l.by, at: l.at, text: l.text || (l.file ? "File" : ""), name: l.name } : null, unread: partnerUnread(g.id) });
  }
  for (const r of rows) { r.muted = notifyOf(r.k) === "off"; r.typers = r.kind === "pgroup" ? [] : typersIn(r.k); if (r.at == null) r.at = r.last ? r.last.at : 0 }
  return rows;
}
function whenShort(t) {
  const d = new Date(t), days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  return days <= 0 ? dtf({ hour: "numeric", minute: "2-digit" }).format(d) : days === 1 ? "Yesterday" : days < 7 ? dtf({ weekday: "short" }).format(d) : dtf({ day: "numeric", month: "short" }).format(d);
}
const PREV_IC = [[/^Idea:/, "bulb"], [/^Voice message/, "mic"], [/^Photo/, "image"], [/^File:/, "file"], [/^Poll:/, "poll"], [/^Task:/, "task"]];
function rowAv(r) { return r.kind === "ideas" ? keyAv("ideas") : r.kind === "team" ? el("span", { class: "nc-av team" }, "#") : r.kind === "dm" ? ncAv(r.u) : el("span", { class: "nc-av sq" + (r.kind === "pgroup" ? " pg" : "") }, initials(r.title)) }
function previewEl(r) {
  if (r.typers.length) return el("span", { class: "nc-cprev typing" }, typingWord(r.k, r.typers));
  const l = r.last;
  if (!l) return el("span", { class: "nc-cprev quiet" }, r.kind === "dm" ? "Say hi" : "No messages yet");
  const mine = l.by === me, who = mine ? "You" : r.kind === "dm" ? "" : (l.name || firstOf(l.by));
  const ic = (PREV_IC.find(([re]) => re.test(l.text || "")) || [])[1];
  const read = mine && r.kind === "dm" && seenOf(r.k, r.u) >= l.at;
  return el("span", { class: "nc-cprev" }, mine && r.kind !== "pgroup" ? el("span", { class: "nc-tick" + (read ? " read" : "") }, nIc(read ? "checks" : "check")) : null,
    who ? el("span", { class: "who" }, who + ":") : null, ic ? nIc(ic) : null, el("span", { class: "tx", dir: "auto" }, l.text || ""));
}
function openRow(r, flash) {
  if (r.kind === "pgroup") { location.hash = "pg-" + r.gid; return }
  ncFlash = flash || null; ncInfo = false;
  const h = chatHash(r.k); if (location.hash === "#" + h) render(); else location.hash = h;
}
function renderChatList(cur, rows) {
  const q = ($("#nc-q").value || "").trim().toLowerCase();
  const unreadN = rows.filter(r => r.unread && !r.muted).length;
  const f = $("#nc-filters"), fk = ncFilter + unreadN;
  if (f.dataset.k !== fk) { f.dataset.k = fk; f.replaceChildren(...[["all", "All"], ["unread", "Unread", unreadN], ["project", "Projects"], ["dm", "People"], ["partner", "Partners"]].map(([v, l, n]) =>
    el("button", { type: "button", "aria-pressed": String(ncFilter === v), onclick: () => { ncFilter = v; render() } }, l, n ? el("span", { class: "n" }, String(n)) : null))) }
  let list = rows.filter(r => ncFilter === "all" || (ncFilter === "unread" ? r.unread : ncFilter === "project" ? r.kind === "project" : ncFilter === "dm" ? r.kind === "dm" && !r.partner : r.partner));
  if (q) list = list.filter(r => r.title.toLowerCase().includes(q) || (r.last && (r.last.text || "").toLowerCase().includes(q)));
  const pinned = list.filter(r => r.pinned), rest = list.filter(r => !r.pinned).sort((a, b) => (b.at || 0) - (a.at || 0) || a.title.localeCompare(b.title));
  const row = r => el("button", { type: "button", class: "nc-row", "aria-current": String(r.k === cur), onclick: () => openRow(r) }, rowAv(r),
    el("span", { class: "nc-rmain" }, el("span", { class: "nc-cname" }, el("span", { class: "t" }, r.title),
      r.kind === "ideas" && r.needVote ? el("span", { class: "nc-tag vote" }, `${r.needVote} to vote`) : r.kind === "project" ? el("span", { class: "nc-tag proj" }, "Project") : r.partner ? el("span", { class: "nc-tag" }, r.kind === "pgroup" ? "Partners" : "Partner") : null), previewEl(r)),
    el("span", { class: "nc-cmeta" + (r.unread && !r.muted ? " unread" : "") }, r.last ? whenShort(r.last.at) : "",
      el("span", { class: "nc-badges" }, r.muted ? nIc("mute") : null, r.pinned ? nIc("pin") : null, r.mention ? el("span", { class: "nc-at" }, "@") : null, r.unread ? el("span", { class: "nc-count" + (r.muted ? " muted" : "") }, String(r.unread)) : null)));
  const out = [];
  out.push(...pinned.map(row));
  if (rest.length) { if (pinned.length) out.push(el("div", { class: "nc-sect" }, "Recent")); out.push(...rest.map(row)) }
  if (q.length > 1) {
    const hits = [];
    const look = (k, list) => { for (const m of list) if (m.text && m.text.toLowerCase().includes(q)) hits.push({ k, m }) };
    look("team", teamMsgs()); look("ideas", ideaTalk()); for (const [pid, l] of Object.entries(pcMsgs)) look("p:" + pid, l); for (const [tid, l] of Object.entries(dmMsgs)) { const u = tid.split("_").find(x => x !== me); if (u) look("dm:" + u, l) }
    hits.sort((a, b) => b.m.at - a.m.at);
    if (hits.length) { out.push(el("div", { class: "nc-sect" }, "Messages"));
      out.push(...hits.slice(0, 8).map(({ k, m }) => el("button", { type: "button", class: "nc-row", onclick: () => openRow({ k, kind: "x" }, m.id) }, keyAv(k),
        el("span", { class: "nc-rmain" }, el("span", { class: "nc-cname" }, el("span", { class: "t" }, keyTitle(k))), el("span", { class: "nc-cprev" }, el("span", { class: "who" }, (m.by === me ? "You" : firstOf(m.by)) + ":"), el("span", { class: "tx", dir: "auto" }, m.text))),
        el("span", { class: "nc-cmeta" }, whenShort(m.at))))) }
  }
  if (!out.length) out.push(el("p", { class: "nc-none" }, q ? `Nothing found for “${$("#nc-q").value.trim()}”.` : ncFilter === "unread" ? "You're all caught up." : "No chats here yet."));
  $("#nc-chats").replaceChildren(...out);
}

/* the open conversation */
function renderHead(k) {
  const typers = typersIn(k), p = projOfKey(k), u = chatWith();
  const sub = typers.length ? typingWord(k, typers) : k === "ideas" ? `Pitch, vote and confirm · ${teamIds().length} team members` : u ? (isPartnerUid(u) ? "Partner · " : "") + (isOnline(u) ? "Online" : lastSeenText(u)) : k === "team" ? `Team chat · ${teamIds().length} team members` : `Project chat · ${p ? teamOf(p).length : 0} people on the team`;
  $("#chat-head").replaceChildren(
    el("button", { type: "button", class: "nc-ib nc-back", "aria-label": "Back to chats", onclick: () => { location.hash = "chat" } }, nIc("back")),
    keyAv(k),
    el("button", { type: "button", class: "nc-ctitle", title: "Chat info", onclick: () => { ncInfo = true; render() } }, el("b", {}, keyTitle(k)), el("span", { class: typers.length ? "typing" : "" }, sub)),
    el("button", { type: "button", class: "nc-ib", "aria-label": "Search in this chat", title: "Search in this chat", onclick: () => toggleFind() }, nIc("search")),
    el("button", { type: "button", class: "nc-ib", "aria-label": "Chat info", title: "Chat info", onclick: () => { ncInfo = !ncInfo; render() } }, nIc("info")));
}
function toggleFind(open = !ncFindOpen) {
  ncFindOpen = open; $("#nc-find").hidden = !open;
  if (open) { if (!wideChat()) ncInfo = false; setTimeout(() => $("#nc-fq").focus(), 0) } else { ncFind = ""; $("#nc-fq").value = "" }
  render();
}
function renderPin(k) {
  const pin = pinOf(k), host = $("#nc-pin");
  host.replaceChildren(...(pin && pin.text ? [el("div", { class: "nc-pinbar" },
    el("button", { type: "button", class: "nc-pinmain", onclick: () => ncJump(pin.id) }, el("span", { class: "bar" }), nIc("pinf"), el("span", { class: "pt" }, el("small", {}, "Pinned"), el("span", { dir: "auto" }, pin.text))),
    el("button", { type: "button", class: "nc-ib sm", "aria-label": "Unpin", title: "Unpin", onclick: () => setPin(k, null) }, nIc("x")))] : []));
}
function ncJump(id) {
  const n = document.getElementById("msg-" + id);
  if (!n) { const k = chatKey(); if (k && listOf(k).some(m => m.id === id)) { ncShow[k] = 1e9; ncFlash = id; render(); return } toast("That message is too old to show here"); return }
  n.scrollIntoView({ block: "center" });   // instant: a smooth scroll gets cut short when new messages redraw the chat
  n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash"); ncLit = { id, at: performance.now() };
}
let ncLit = null;   // the message just jumped to: its highlight carries on through redraws
let ncToBottom = false, ncKeepFromBottom = null;
const ncShow = {};   // how many of the newest messages each chat draws (more load with "Show earlier messages")
function dayLabel(t) {
  const d = new Date(t), days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : dtf({ weekday: "short", day: "numeric", month: "short" }).format(d);
}
let ncNodes = new Map(), ncNodesFor = null;
// a saved piece of the chat, built again only when what it shows changed
function ncKeep(key, sig, make) { const n = ncNodes.get(key); if (n && n._sig === sig) return n; const x = make(); x._sig = sig; ncNodes.set(key, x); return x }
// put the chat's pieces in order, leaving the ones already in place alone (so the browser doesn't lay the whole chat out again)
function ncPatch(box, want) {
  let cur = box.firstChild;
  for (const n of want) { if (n === cur) { cur = cur.nextSibling; continue } box.insertBefore(n, cur) }
  while (cur) { const nx = cur.nextSibling; cur.remove(); cur = nx }
}
function ncSeenBy(put, k, u, others, m) {
  const saw = others.filter(x => seenOf(k, x) >= m.at); if (!saw.length) return;
  const txt = u ? "Seen" : "Seen by " + (saw.length === others.length && others.length > 2 ? "everyone" : saw.map(firstOf).join(", "));
  put(ncKeep("seen", txt + "|" + saw.join(), () => el("div", { class: "nc-seenby" }, txt, u ? null : el("span", { class: "avs" }, saw.slice(0, 5).map(x => ncAv(x, "xs", false))))));
}
function renderLog(k, fresh) {
  const log = $("#chatlog"), all = listOf(k), u = chatWith(), p = projOfKey(k);
  // saved bubbles belong to one chat, and names or photos changing means building them all again
  if (ncNodesFor !== k || ncNodes.size > 1500) { ncNodes = new Map(); ncNodesFor = k }
  // only the newest messages are drawn, so a long chat opens instantly; searching or jumping to an old message loads the rest
  if ((ncFindOpen && ncFind.trim()) || (ncFlash && !all.slice(-(ncShow[k] || 80)).some(m => m.id === ncFlash))) ncShow[k] = 1e9;   // the whole chat
  const start = Math.max(0, all.length - (ncShow[k] || 80)), list = start ? all.slice(start) : all;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80, prevTop = log.scrollTop;
  const out = [], put = (...ns) => { for (const n of ns) if (n) out.push(n) };
  const denied = (u && dmOff) || (p && pcOff[p.id]);
  if (denied) {
    put(el("div", { class: "nc-empty" }, isAdmin
      ? [el("span", {}, (p ? "Project chats" : "Private chats") + " need the latest database rules. Publish them the same way as last time (Cloud Shell), or copy them here and paste them in Firebase › Firestore › Rules."), el("button", { class: "btn small primary", onclick: () => copyText(PARTNER_RULES, "Rules copied. Paste them in Firebase › Firestore › Rules, then Publish") }, "Copy the rules")]
      : `${p ? "Project chats aren't" : "Private chats aren't"} switched on yet. Ask ${ADMIN_NAME} to update the database rules.`));
    ncPatch(log, out); return;
  }
  if (start) put(ncKeep("more", String(start), () => el("button", { type: "button", class: "nc-more", onclick: () => { const l = $("#chatlog"); ncKeepFromBottom = l.scrollHeight - l.scrollTop; ncShow[k] = (ncShow[k] || 80) + 120; render() } }, `Show earlier messages (${start})`)));
  if (!list.length) { put(el("div", { class: "nc-empty" }, k === "ideas" ? "No ideas yet. Tap Pitch to post the first one: the team votes on it right here." : u ? `No messages with ${firstOf(u)} yet. Say hi, only you two will see it.` : p ? `No messages yet. Everyone on ${p.title}'s team is in this chat.` : "No messages yet. Say hi to the team.")); ncPatch(log, out); return }
  const others = chatMembers(k).filter(x => x !== me);
  const lastMine = [...all].reverse().find(m => m.by === me && !m.system && !m.sys && !m.idea);
  const term = ncFindOpen ? ncFind.trim().toLowerCase() : ""; let hits = 0, firstHit = null;
  let lastDay = "", lastBy = "", lastAt = 0, divided = false;
  const react = (m, e, on) => write(() => updateDoc(chatRef(k, m.id), { [`reacts.${emojiKey(e)}.${me}`]: on ? true : DEL() }));
  for (const m of list) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { const dl = dayLabel(m.at); put(ncKeep("d:" + day, dl, () => el("div", { class: "nc-day" }, dl))); lastBy = "" }
    lastDay = day;
    if (m.sys) { put(ncKeep(m.id, JSON.stringify(m.sys), () => el("div", { class: "nc-sys", id: "msg-" + m.id }, nIc(m.ic || "check"), el("span", {}, m.sys.map(x => Array.isArray(x) ? el("b", {}, x[1]) : x))))); lastBy = ""; continue }
    if (m.system === "weekly") { put(ncKeep(m.id, m.text || "", () => el("div", { class: "nc-weekly", id: "msg-" + m.id }, el("div", { class: "h" }, "Weekly summary"), el("div", { class: "pre" }, m.text)))); lastBy = ""; continue }
    if (!divided && ncDivider && m.at > ncDivider && m.by !== me) { put(ncKeep("newdiv", "1", () => el("div", { class: "nc-newdiv", id: "nc-newdiv" }, "New messages"))); divided = true; lastBy = "" }
    const mine = m.by === me, grouped = m.by === lastBy && m.at - lastAt < 5 * 60e3 && !m.replyTo;
    if (!mine && !grouped && !u) { const nm = chatName(m.by), pt = isPartnerUid(m.by); put(ncKeep("n:" + m.id, nm + pt, () => el("div", { class: "nc-mname" }, nm, pt ? el("span", { class: "nc-tag" }, "Partner") : null))) }
    const hit = !!term && (m.text || "").toLowerCase().includes(term); if (hit) { hits++; firstHit = firstHit || m.id }
    const orig = m.replyTo ? all.find(x => x.id === m.replyTo) : null;
    const rich = !!(m.poll || m.task || m.idea), voice = m.file && m.file.voice, emo = isEmojiOnly(m.text) && !m.file && !m.replyTo;
    const seenAll = mine && others.length && others.every(x => seenOf(k, x) >= m.at);
    // a message that hasn't changed keeps its old bubble: only new or changed messages are built again
    const sig = rich ? null : JSON.stringify([m.text, m.edited || 0, m.reacts || 0, m.file ? m.file.id : 0, m.fwd || 0, m.replyTo ? (orig ? [orig.by, msgSummary(orig)] : 1) : 0, mine, grouped, hit, emo, seenAll, !!u, grouped || u || mine ? 0 : [isOnline(m.by), realName(m.by), photoOf(m.by)], m.at]);
    const kept = sig && ncNodes.get(m.id);
    if (kept && kept._sig === sig) { put(kept); lastBy = m.by; lastAt = m.at; if (m === lastMine && others.length) ncSeenBy(put, k, u, others, m); continue }
    const time = timeFmt.format(m.at);
    const b = el("div", { class: "nc-b" + (rich ? " rich" : "") + (hit ? " hl" : "") + (emo ? " emo" : ""), tabindex: "0", role: "button", "aria-label": "Message options",
      onclick: e => { if (String(getSelection()) || e.target.closest("a, button, audio, video")) return; openSheet(m.id) },
      onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(m.id) } } },
      m.fwd ? el("span", { class: "nc-fwd" }, nIc("fwd"), "Forwarded") : null,
      m.replyTo ? el("button", { type: "button", class: "nc-quote", onclick: e => { e.stopPropagation(); if (orig) ncJump(orig.id) } }, el("b", {}, orig ? (orig.by === me ? "You" : firstOf(orig.by)) : "Message"), el("span", { dir: "auto" }, orig ? msgSummary(orig) : "This message was deleted")) : null,
      voice ? voiceEl(m.file) : m.file ? attachmentEl(m.file) : null,
      m.idea ? ideaCardEl(m) : null, m.poll ? pollEl(k, m) : null, m.task ? taskCardEl(k, m) : null,
      m.text ? ncText(k, m.text) : null,
      m.text && chatLeadCount(m.text) ? el("button", { type: "button", class: "msg-leads", onclick: e => { e.stopPropagation(); openLeadPicker(m.text) } }, `Put ${chatLeadCount(m.text)} ${chatLeadCount(m.text) === 1 ? "number" : "numbers"} in a group`) : null,
      el("span", { class: "nc-meta" }, m.edited ? "edited · " : "", time, mine && !m.idea ? el("span", { class: "nc-tick" + (seenAll ? " read" : "") }, nIc(seenAll ? "checks" : "check")) : null));
    const node = el("div", { class: "nc-m" + (mine ? " mine" : "") + (grouped ? " g" : ""), id: "msg-" + m.id, "data-m": m.id },
      mine ? null : el("span", { class: "nc-avs" }, grouped || u ? null : ncAv(m.by, "sm")),
      el("div", { class: "nc-bw" }, el("span", { class: "nc-swipe" }, nIc("reply")),
        el("div", { class: "nc-tools" },
          el("button", { type: "button", "aria-label": "React", title: "React", onclick: e => { e.stopPropagation(); openSheet(m.id) } }, nIc("smile")),
          el("button", { type: "button", "aria-label": "Reply", title: "Reply", onclick: e => { e.stopPropagation(); startReply(m.id) } }, nIc("reply")),
          el("button", { type: "button", "aria-label": "More", title: "More", onclick: e => { e.stopPropagation(); openSheet(m.id) } }, nIc("more"))),
        b, m.idea ? null : reactRow(m, (e, on) => react(m, e, on))));
    if (sig) { node._sig = sig; ncNodes.set(m.id, node) }
    put(node);
    if (m === lastMine && others.length) ncSeenBy(put, k, u, others, m);
    lastBy = m.by; lastAt = m.at;
  }
  const typers = typersIn(k);
  if (typers.length) put(ncKeep("typing", typers.join(), () => el("div", { class: "nc-m" }, el("span", { class: "nc-avs" }, u ? null : ncAv(typers[0], "sm")), el("div", { class: "nc-typing", "aria-label": typingWord(k, typers) }, el("i"), el("i"), el("i")))));
  ncPatch(log, out);
  $("#nc-hits").textContent = term ? (hits ? `${hits} found` : "Not found") : "";
  // where to scroll: a message to show, the first new message, the bottom, or stay put
  if (ncLit) { const ms = performance.now() - ncLit.at, n = ms < 1400 && document.getElementById("msg-" + ncLit.id); if (n && !n.classList.contains("flash")) { n.classList.add("flash"); const b = n.querySelector(".nc-b"); if (b) b.style.animationDelay = -ms + "ms" } else if (ms >= 1400) ncLit = null }
  voiceUi(); watchVoices();
  if (ncKeepFromBottom != null) { log.scrollTop = log.scrollHeight - ncKeepFromBottom; ncKeepFromBottom = null }
  else if (ncFlash && document.getElementById("msg-" + ncFlash)) { const id = ncFlash; ncFlash = null; requestAnimationFrame(() => ncJump(id)) }
  else if (term && firstHit && ncFindJump) { ncFindJump = false; const n = document.getElementById("msg-" + firstHit); if (n) n.scrollIntoView({ block: "center" }) }
  else if (fresh) log.scrollTop = log.scrollHeight;   // a chat always opens at the newest message (the "New messages" line is still there above)
  else if (atBottom || ncToBottom) log.scrollTop = log.scrollHeight;
  else log.scrollTop = prevTop;
  ncToBottom = false;
  $("#nc-jump").hidden = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  // stay at the newest message while photos and videos finish loading (they make the chat taller)
  log._stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  if (!log._stickOn) { log._stickOn = true; log.addEventListener("scroll", () => { log._stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80 }, { passive: true }) }
  for (const m of log.querySelectorAll("img, video")) if (!(m.complete || m.readyState > 0)) m.addEventListener(m.tagName === "IMG" ? "load" : "loadedmetadata", () => { if (log._stick) log.scrollTop = log.scrollHeight }, { once: true });
}
let ncFindJump = false;
function startReply(id) { chatReply = id; chatEdit = null; ncSheet = null; render(); $("#chat-input").focus() }

/* the message box */
function updateSendBtn() {
  const b = $("#chat-send"), has = !!$("#chat-input").value.trim() || pending.length > 0 || !!chatEdit;
  const want = chatEdit ? "check" : has ? "send" : "mic";
  if (b.dataset.ic !== want) { b.dataset.ic = want; b.replaceChildren(nIc(want)) }
  b.setAttribute("aria-label", chatEdit ? "Save" : has ? "Send" : "Record a voice message"); b.title = chatEdit ? "Save" : has ? "Send" : "Record a voice message";
  b.disabled = sending;
}
function renderComposer(k) {
  const p = projOfKey(k), canWrite = !p || inTeam(p), u = chatWith();
  $("#chatform").hidden = !canWrite || !!rec; $("#nc-rec").hidden = !rec;
  const ro = $("#nc-readonly"); ro.hidden = canWrite;
  if (!canWrite) ro.replaceChildren(el("span", {}, `Only ${p.title}'s team can write here. You can read along.`), (p.joinReqs || {})[me] ? el("span", { class: "nc-sub" }, "You asked to join") : el("button", { class: "btn small primary", onclick: () => askToJoin(p) }, "Ask to join the team"));
  $("#chat-input").placeholder = k === "ideas" ? "Talk about the ideas" : u ? "Message " + firstOf(u) : "Message " + keyTitle(k);
  $("#nc-bulb").hidden = k !== "ideas"; renderTray(k); renderPitch();
  if (chatReply && !msgById(chatReply)) chatReply = null;
  if (chatEdit && !msgById(chatEdit)) chatEdit = null;
  const ctx = $("#chat-context"), ctxMsg = msgById(chatEdit || chatReply);
  ctx.hidden = !ctxMsg;
  ctx.replaceChildren(...(ctxMsg ? [el("span", { class: "nc-quote" }, el("b", {}, chatEdit ? "Editing your message" : `Replying to ${ctxMsg.by === me ? "yourself" : firstOf(ctxMsg.by)}`), el("span", { dir: "auto" }, msgSummary(ctxMsg))),
    el("button", { type: "button", class: "nc-ib", title: "Cancel", "aria-label": "Cancel", onclick: cancelChatMode }, nIc("x"))] : []));
  renderForm(k); renderPlus(); updateSendBtn();
}
function renderPlus() {
  const k = chatKey(), p = projOfKey(k), box = $("#nc-plusmenu");
  box.hidden = !ncPlusOpen;
  if (!ncPlusOpen) { box.replaceChildren(); return }
  const touch = matchMedia("(hover: none)").matches;
  const it = (icon, label, sub, fn) => el("button", { type: "button", class: "nc-it", onclick: () => { ncPlusOpen = false; fn(); render() } }, el("span", { class: "ic" }, nIc(icon)), el("span", {}, label, sub ? el("small", {}, sub) : null));
  box.replaceChildren(...[
    k === "ideas" ? it("bulb", "Pitch an idea", "The team votes on it here", () => openPitch(true)) : null,
    it("image", "Photos and videos", "Send several at once", () => $("#chat-photo").click()),
    touch ? it("camera", "Camera", null, () => $("#chat-camera").click()) : null,
    it("file", "File", "PDF, design files, anything up to 10 MB", () => $("#chat-file").click()),
    k && !k.startsWith("dm:") ? it("poll", "Poll", "Let the team vote", () => { ncForm = "poll"; ncPollN = 2; setTimeout(() => { const n = document.getElementById("nc-pq"); if (n) n.focus() }, 0) }) : null,
    p && canPlan(p) ? it("task", "Task", "Give someone a task in this project", () => { ncForm = "task"; setTimeout(() => { const n = document.getElementById("nc-tt"); if (n) n.focus() }, 0) }) : null].filter(Boolean));
}
function renderForm(k) {
  const host = $("#nc-form"), p = projOfKey(k);
  if (ncForm === "task" && !(p && canPlan(p))) ncForm = null;
  if (!ncForm) { host.replaceChildren(); return }
  const close = el("button", { type: "button", class: "nc-ib sm", "aria-label": "Cancel", onclick: () => { ncForm = null; render() } }, nIc("x"));
  if (ncForm === "poll") {
    const opts = Array.from({ length: ncPollN }, (_, i) => el("input", { id: "nc-po" + i, class: "nc-in", placeholder: "Option " + (i + 1), maxlength: "80", dir: "auto" }));
    const send = () => {
      const q = $("#nc-pq").value.trim(), o = opts.map(x => document.getElementById(x.id).value.trim()).filter(Boolean);
      if (!q) { toast("Write the question first"); return } if (o.length < 2) { toast("Add at least 2 options"); return }
      ncForm = null; ncToBottom = true; sendMsg(k, { poll: { q, opts: o, votes: {} } }); render();
    };
    host.replaceChildren(el("div", { class: "nc-formbox" }, el("div", { class: "nc-formh" }, nIc("poll"), el("b", {}, "New poll"), el("span", { class: "spacer" }), close),
      el("input", { id: "nc-pq", class: "nc-in", placeholder: "Ask a question", maxlength: "140", dir: "auto" }), ...opts,
      el("div", { class: "nc-row2" }, ncPollN < 6 ? el("button", { type: "button", class: "btn small", onclick: () => { ncPollN++; render() } }, "Add an option") : null, el("span", { class: "spacer" }), el("button", { type: "button", class: "btn small primary", onclick: send }, "Send poll"))));
  } else {
    const who = el("select", { id: "nc-tw", class: "nc-in", "aria-label": "Who does it" }, el("option", { value: "" }, "Who does it?"), teamOf(p).map(u => el("option", { value: u }, chatName(u))));
    const add = () => {
      const text = $("#nc-tt").value.trim(); if (!text) { toast("Write what needs doing"); return }
      const owner = $("#nc-tw").value || null, due = $("#nc-td").value || null, tid = uid(), ph = getPhases(p)[0];
      ncForm = null; ncToBottom = true;
      write(async () => { await upd(p.id, { ["tasks." + tid]: { text, phase: ph ? ph.id : "build", skill: null, owner, assignedBy: me, assignedAt: Date.now(), done: false, order: Date.now(), due } }); await sendMsg(k, { task: { pid: p.id, tid, text } }) }, `Task added to ${p.title}`);
      render();
    };
    host.replaceChildren(el("div", { class: "nc-formbox" }, el("div", { class: "nc-formh" }, nIc("task"), el("b", {}, "New task in " + p.title), el("span", { class: "spacer" }), close),
      el("input", { id: "nc-tt", class: "nc-in", placeholder: "What needs doing?", maxlength: "140", dir: "auto", onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); add() } } }),
      el("div", { class: "nc-row2" }, who, el("input", { id: "nc-td", type: "date", class: "nc-in", "aria-label": "Due date" }), el("span", { class: "spacer" }), el("button", { type: "button", class: "btn small primary", onclick: add }, "Add task"))));
  }
}
// @ picker: shows the people in this chat while you type @name
let mentionSel = 0, mentionList = [];
function closeMentions() { const b = $("#nc-mentions"); b.hidden = true; b.replaceChildren(); mentionList = [] }
function mentionCheck() {
  const k = chatKey(), ta = $("#chat-input"), before = ta.value.slice(0, ta.selectionStart), mm = before.match(/(^|\s)@([\p{L}\p{N}_]*)$/u);
  if (!k || !mm || k.startsWith("dm:")) { closeMentions(); return }
  const q = mm[2].toLowerCase();
  mentionList = [{ k: "everyone", l: "Everyone", s: "Rings everyone in this chat" }, ...chatMembers(k).filter(u => u !== me).map(u => ({ k: atName(u), l: chatName(u), s: isOnline(u) ? "Online" : lastSeenText(u), u }))]
    .filter(x => x.l.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || x.k.toLowerCase().startsWith(q)).slice(0, 7);
  if (!mentionList.length) { closeMentions(); return }
  mentionSel = Math.min(mentionSel, mentionList.length - 1);
  const b = $("#nc-mentions"); b.hidden = false;
  b.replaceChildren(el("div", { class: "nc-ph" }, "Mention"), ...mentionList.map((x, i) => el("button", { type: "button", class: "nc-it" + (i === mentionSel ? " on" : ""), onmousedown: e => e.preventDefault(), onclick: () => insertMention(x.k) },
    x.u ? ncAv(x.u, "sm") : el("span", { class: "ic" }, nIc("bell")), el("span", {}, x.l, el("small", {}, x.s || "")))));
}
function insertMention(word) {
  const ta = $("#chat-input"), pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@([\p{L}\p{N}_]*)$/u, "@" + word + " ");
  ta.value = before + ta.value.slice(pos); ta.focus(); ta.setSelectionRange(before.length, before.length); closeMentions(); autoGrow(ta); updateSendBtn();
}

/* tap a message: reactions on top, then what you can do with it */
function openSheet(id) { ncSheet = id; chatDel = null; ncFwd = null; chatReactPick = null; ncPlusOpen = false; render() }
function closeSheet() { ncSheet = null; chatDel = null; ncFwd = null; chatReactPick = null; render() }
function renderSheet(k) {
  const sh = $("#nc-sheet"), sc = $("#nc-scrim"), m = ncSheet ? listOf(k).find(x => x.id === ncSheet) : null;
  if (!m) ncSheet = null;
  sh.hidden = !m; sc.hidden = !m && !ncPitchOpen;
  if (!m) { sh.replaceChildren(); return }
  const mine = m.by === me, p = projOfKey(k), has = e => !!(((m.reacts || {})[emojiKey(e)]) || {})[me];
  const react = (e, on) => { closeSheet(); write(() => updateDoc(chatRef(k, m.id), { [`reacts.${emojiKey(e)}.${me}`]: on ? true : DEL() })) };
  if (ncFwd) {
    const rows = chatRows().filter(r => r.kind !== "pgroup" && r.k !== k && (r.kind !== "project" || inTeam(projOfKey(r.k))));
    sh.replaceChildren(el("div", { class: "nc-grab" }), el("div", { class: "nc-sheeth" }, el("button", { type: "button", class: "nc-ib sm", "aria-label": "Back", onclick: () => { ncFwd = null; render() } }, nIc("back")), el("b", {}, "Forward to")),
      el("div", { class: "nc-fwdlist" }, rows.map(r => el("button", { type: "button", class: "nc-row", onclick: async () => {
        const data = { fwd: true, ...(m.idea ? { text: `Idea: ${m.idea.title}${m.idea.pitch ? "\n" + m.idea.pitch : ""}` } : {}), ...(m.text ? { text: m.text } : {}), ...(m.file ? { file: m.file } : {}), ...(m.poll ? { text: "Poll: " + m.poll.q } : {}), ...(m.task ? { text: "Task: " + m.task.text } : {}) };
        closeSheet(); if (await sendMsg(r.k, data)) toast("Forwarded to " + r.title);
      } }, rowAv(r), el("span", { class: "nc-rmain" }, el("span", { class: "nc-cname" }, el("span", { class: "t" }, r.title)))))));
    return;
  }
  const A = (icon, label, fn, sub, cls = "") => el("button", { type: "button", class: cls, onclick: fn }, nIc(icon), label, sub ? el("small", {}, sub) : null);
  if (m.idea) {
    const i = m.idea, own = isAdmin || i.author === me;
    sh.replaceChildren(...[el("div", { class: "nc-grab" }), el("div", { class: "nc-sheeth" }, nIc("bulb"), el("b", { dir: "auto" }, i.title)), el("div", { class: "nc-acts" }, ...[
      A("reply", "Talk about this idea", () => startReply(m.id), "your reply quotes it"),
      canUseAssistant() ? A("sparkle", "Make it stronger", () => { closeSheet(); askAboutIdea(i) }, "with the assistant") : null,
      A("fwd", "Share it in another chat", () => { ncFwd = m.id; render() }),
      isProj(i) ? A("folder", "Open the project", () => { closeSheet(); location.hash = "project-" + i.id }) : null,
      own && i.status !== "approved" && i.status !== "completed" ? el("div", { class: "quietline" }) : null,
      own && i.status !== "approved" && i.status !== "completed" ? (chatDel === m.id
        ? A("trash", "Tap again to delete the idea", () => { closeSheet(); write(() => deleteDoc(doc(db, "ideas", i.id)), "Idea deleted") }, null, "del sure")
        : A("trash", i.author === me ? "Delete my idea" : "Delete the idea", () => { chatDel = m.id; render() }, null, "del")) : null].filter(Boolean))]);
    return;
  }
  const pinned = (pinOf(k) || {}).id === m.id;
  sh.replaceChildren(...[el("div", { class: "nc-grab" }),
    el("div", { class: "nc-emorow" }, QUICK_REACTS.map(e => el("button", { type: "button", class: has(e) ? "on" : "", "aria-label": "React " + e, onclick: () => react(e, !has(e)) }, e)),
      el("button", { type: "button", class: "plus", "aria-label": "More emoji", onclick: () => { chatReactPick = chatReactPick ? null : m.id; render() } }, nIc("plus"))),
    chatReactPick ? el("div", { class: "nc-emopick" }, emojiPanel(e => react(e, !has(e)))) : null,
    el("div", { class: "nc-acts" },
      A("reply", "Reply", () => startReply(m.id), matchMedia("(hover: none)").matches ? "or swipe right" : ""),
      m.text ? A("copy", "Copy", () => { copyText(m.text, "Copied"); closeSheet() }) : null,
      A("task", p && canPlan(p) ? "Make it a task" : "Save as my task", () => { closeSheet(); makeTask(k, m) }),
      A("pin", pinned ? "Unpin" : k.startsWith("dm:") ? "Pin for both of you" : "Pin for everyone", () => { closeSheet(); setPin(k, pinned ? null : m) }),
      A("fwd", "Forward", () => { ncFwd = m.id; render() }),
      canUseAssistant() ? A("sparkle", "Ask the assistant about it", () => { closeSheet(); askAboutMsg(m) }) : null,
      mine ? el("div", { class: "quietline" }) : null,
      mine && m.text && !m.poll ? A("edit", "Edit", () => { chatEdit = m.id; chatReply = null; ncSheet = null; const i = $("#chat-input"); i.value = m.text; autoGrow(i); render(); i.focus(); i.setSelectionRange(i.value.length, i.value.length) }) : null,
      mine ? (chatDel === m.id
        ? A("trash", "Tap again to delete for everyone", () => { const was = m; closeSheet(); if (chatEdit === was.id) { chatEdit = null; $("#chat-input").value = "" } write(() => deleteMessage(was), "Message deleted") }, null, "del sure")
        : A("trash", "Delete for everyone", () => { chatDel = m.id; render() }, null, "del")) : null)].filter(Boolean));
}

/* chat info: notifications, people, and everything shared */
function renderInfo(k) {
  const box = $("#nc-info");
  if (!ncInfo || !k) { box.replaceChildren(); return }
  const p = projOfKey(k), u = chatWith(), list = listOf(k), members = chatMembers(k), level = notifyOf(k);
  const desc = k === "ideas" ? "The whole team. Pitch ideas here, vote Keep or Drop on each card, and the person who pitched a winning idea confirms it to Projects." : p ? "Everyone on this project's team is in this chat automatically. When someone joins or leaves the team, they join or leave the chat."
    : u ? `Only you and ${firstOf(u)} see this chat.` : "The whole team. Partners and clients never see it.";
  const levels = u ? [["all", "Every message", "Your phone rings for each new message"], ["off", "Off", "Still shows the unread count"]]
    : [["all", "Every message", "Your phone rings for each new message"], ["mentions", "Only when someone @mentions me", "And private messages, always"], ["off", "Off", "Still shows the unread count"]];
  const photos = list.filter(m => m.file && m.file.thumb), files = list.filter(m => m.file && !m.file.thumb && !m.file.voice);
  const links = []; for (const m of list) for (const url of String(m.text || "").match(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g) || []) links.push({ url, m });
  const role = x => p ? (plannerIds(p).includes(x) ? ["Planner", " proj"] : ["Team", ""]) : isPartnerUid(x) ? ["Partner", ""] : ["Team", ""];
  let shared;
  if (ncInfoTab === "photos") shared = photos.length ? el("div", { class: "nc-grid3" }, photos.slice(-30).reverse().map(m => el("button", { type: "button", class: "ph", onclick: () => openViewer(m.file) }, el("img", { src: m.file.thumb, alt: m.file.name })))) : el("p", { class: "nc-sub" }, "No photos yet.");
  else if (ncInfoTab === "files") shared = files.length ? el("div", { class: "nc-flist" }, files.slice(-30).reverse().map(m => attachmentEl(m.file))) : el("p", { class: "nc-sub" }, "No files yet.");
  else shared = links.length ? el("div", { class: "nc-flist" }, links.slice(-30).reverse().map(({ url, m }) => el("a", { class: "nc-filecard", href: url, target: "_blank", rel: "noopener noreferrer", onclick: previewClick(url, hostOf(url)) }, el("span", { class: "fileic" }, "URL"), el("span", { class: "fmain" }, el("span", { class: "fn" }, url.replace(/^https?:\/\/(www\.)?/, "")), el("span", { class: "fs" }, `${firstOf(m.by)} · ${whenShort(m.at)}`))))) : el("p", { class: "nc-sub" }, "No links yet.");
  box.replaceChildren(
    el("div", { class: "nc-ihead" }, el("button", { type: "button", class: "nc-ib", "aria-label": "Close chat info", onclick: () => { ncInfo = false; render() } }, nIc("back")), el("b", {}, "Chat info")),
    el("div", { class: "nc-ibody" },
      el("div", { class: "nc-ihero" }, keyAv(k, "lg"), el("h2", {}, keyTitle(k)), el("p", {}, u ? [nIc("lock", "sm"), " " + desc] : desc),
        el("div", { class: "nc-row2" }, p ? el("button", { type: "button", class: "btn small", onclick: () => { location.hash = "project-" + p.id } }, nIc("folder"), "Open project") : null,
          el("button", { type: "button", class: "btn small", onclick: () => toggleFind(true) }, nIc("search"), "Search"))),
      el("div", { class: "nc-card" }, el("h3", {}, "Notifications"), el("div", { class: "nc-notif" }, levels.map(([v, l, s]) => el("label", {},
        el("input", { type: "radio", name: "nc-nt", value: v, checked: level === v, onchange: () => setNotify(k, v) }), el("span", {}, l, el("small", {}, s)))))),
      u ? null : el("div", { class: "nc-card" }, el("h3", {}, `People · ${members.length}`), members.map(x => el("div", { class: "nc-mem" }, ncAv(x), el("span", { class: "nm" }, x === me ? "You" : chatName(x), el("small", {}, x === me || isOnline(x) ? "Online" : lastSeenText(x))), el("span", { class: "nc-tag" + role(x)[1] }, role(x)[0])))),
      el("div", { class: "nc-card" }, el("h3", {}, "Shared in this chat"),
        el("div", { class: "nc-tabs" }, [["photos", "Photos"], ["files", "Files"], ["links", "Links"]].map(([v, l]) => el("button", { type: "button", "aria-pressed": String(ncInfoTab === v), onclick: () => { ncInfoTab = v; render() } }, l))), shared)));
}

/* in-page pop-ups for project chats (team chat and private ones pop up where they load) */
const pcLastPing = {};
function pcPings(rows) {
  for (const r of rows) {
    if (r.kind !== "project" || !r.last) continue;
    const before = pcLastPing[r.k]; pcLastPing[r.k] = r.last.at;
    if (before === undefined || r.last.at <= before || r.last.by === me) continue;
    const lvl = notifyOf(r.k), ment = Array.isArray(r.last.mentions) && (r.last.mentions.includes(me) || r.last.mentions.includes("all"));
    if (lvl === "off" && !ment || lvl === "mentions" && !ment) continue;
    if (chatKey() === r.k && !document.hidden) continue;
    chime(); ping({ key: "pc:" + r.k.slice(2) + ":" + r.last.at, who: r.last.by, title: realName(r.last.by) || r.title, sub: r.title, text: (ment ? "Mentioned you: " : "") + (r.last.text || ""), go: chatHash(r.k), at: r.last.at });
  }
}

// On a computer the Chat tab opens the conversation with the latest message (not always Everyone)
function latestChatKey() {
  let best = "team", at = 0;
  const see = (k, t) => { if (t && t > at) { at = t; best = k } };
  const tm = teamMsgs(); see("team", tm.length ? tm[tm.length - 1].at : 0);
  const it = ideaTalk(); see("ideas", it.length ? it[it.length - 1].at : 0);
  for (const t of dmThreads) { const u = otherOf(t); if (u && u !== me && people[u]) see("dm:" + u, t.lastAt) }
  for (const p of ideas) if (p.status === "approved" && p.chat && p.chat.last && (isAdmin || projTeam(p).includes(me))) see("p:" + p.id, p.chat.last.at);
  return best;
}
function renderChat() {
  heartbeat();
  if (route().view === "chat" && !route().ch && wideChat() && live) history.replaceState(null, "", "#" + chatHash(latestChatKey()));
  const k = chatKey(), onChat = route().view === "chat", rows = chatRows();
  const unread = rows.reduce((s, r) => s + (r.muted ? 0 : r.unread || 0), 0);
  const badge = $("#c-chat"); badge.hidden = !unread; badge.textContent = unread;
  pcPings(rows);
  watchDm(k && k.startsWith("dm:") ? k.slice(3) : null);
  watchPc(k && k.startsWith("p:") ? k.slice(2) : null);
  const nc = $("#nc");
  document.documentElement.classList.toggle("nc-full", onChat && !!k && !wideChat());
  // lock the page while Chat is open so the frame can't be dragged up and down
  const root = document.documentElement;
  if (onChat && !root.classList.contains("nc-lock")) { root.classList.add("nc-lock"); scrollTo(0, 0) }
  else if (!onChat) root.classList.remove("nc-lock");
  ncFit();
  if (!onChat) { if (ncCur) { ncDrafts[ncCur] = $("#chat-input").value; ncCur = null; stopTyping(); if (rec) stopRec(false) } return }
  if (k === "dm:" + me) { location.hash = "chat"; return }
  // switching chats: keep each chat's unfinished message, and remember where "New messages" starts
  let fresh = false;
  if (k !== ncCur) {
    if (ncCur) ncDrafts[ncCur] = $("#chat-input").value;
    if (rec) stopRec(false);
    stopTyping();
    ncCur = k; fresh = true; ncDividerSet = false; ncDivider = 0;
    chatSel = chatReply = chatEdit = chatDel = ncSheet = ncFwd = null; ncForm = null; ncPlusOpen = false; ncFindOpen = false; ncFind = ""; $("#nc-find").hidden = true; $("#nc-fq").value = "";
    const inp = $("#chat-input"); inp.value = (k && ncDrafts[k]) || ""; autoGrow(inp); closeMentions();
    if (!wideChat()) ncInfo = false;
  }
  if (k && listOf(k).length === 0 && ((k.startsWith("p:") && !pcMsgs[k.slice(2)]) || (k.startsWith("dm:") && !dmMsgs[dmId(k.slice(3))]))) fresh = true;   // still loading: decide where to scroll once it's here
  nc.dataset.screen = !k ? "list" : ncInfo && !wideChat() ? "info" : "conv";
  nc.classList.toggle("info-open", !!(k && ncInfo));
  nc.classList.toggle("has-chat", !!k);
  renderChatList(k, rows);
  if (!k) { $("#chat-head").replaceChildren(); $("#chatlog").replaceChildren(); renderInfo(null); return }
  if (!ncDividerSet && people[me]) { ncDivider = seenOf(k); ncDividerSet = true; fresh = true }
  if (!fresh && ncDividerSet) markRead(k);
  renderHead(k); renderPin(k);
  if (fresh || ncDirty || !$("#chatlog").firstChild) renderLog(k, fresh);
  ncDirty = false;
  renderComposer(k); renderSheet(k); renderInfo(k);
  if (fresh && ncDividerSet) markRead(k);
  // redraw when someone stops typing
  clearTimeout(typingTimer); if (rows.some(r => r.typers.length)) typingTimer = setTimeout(render, 3500);
  ncSize();
}
// the chat fills the screen down to the bottom (or to the menu bar on a phone)
function ncSize() {
  const nc = $("#nc"); if (!nc || $("#view-chat").hidden) return;
  if (ncFit()) return;
  const top = nc.getBoundingClientRect().top + scrollY, nav = document.querySelector("#app .nav"), nr = nav && nav.getBoundingClientRect();
  const bottom = nr && nr.top > innerHeight / 2 ? innerHeight - nr.top + 10 : 20;
  nc.style.height = Math.max(300, innerHeight - top - bottom) + "px";
}
addEventListener("resize", () => { if (route().view === "chat") render() });
// A chat that fills a phone's screen stays exactly in the part you can see. On iPhone the keyboard doesn't shrink
// the page, it covers it and slides the view up, which pushed the chat's top bar off the screen and left a gap
// above the keyboard. So the chat follows the visible area instead, and the newest messages stay in view.
function ncFit() {
  const nc = $("#nc"), root = document.documentElement, vv = window.visualViewport, full = root.classList.contains("nc-full");
  root.classList.toggle("kb-open", !!(full && vv && innerHeight - vv.height > 120));
  const moved = full && vv && (innerHeight - vv.height > 1 || vv.offsetTop > 0);
  if (moved) { nc.style.top = Math.max(0, vv.offsetTop) + "px"; nc.style.bottom = "auto"; nc.style.setProperty("height", vv.height + "px", "important") }
  else { nc.style.top = nc.style.bottom = ""; nc.style.removeProperty("height") }
  return full;
}
if (window.visualViewport) {
  let fitQ = 0;
  const onVV = () => {
    if (fitQ || !document.documentElement.classList.contains("nc-full")) return;
    const log = $("#chatlog"), stay = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    fitQ = requestAnimationFrame(() => { fitQ = 0; ncFit(); if (stay) log.scrollTop = log.scrollHeight });
  };
  visualViewport.addEventListener("resize", onVV);
  visualViewport.addEventListener("scroll", onVV);
}

/* the message box and list: set up once */
$("#chatform").addEventListener("submit", e => { e.preventDefault(); ncSend() });
$("#chat-emoji").onclick = () => { chatEmojiOpen = !chatEmojiOpen; const host = $("#chat-emoji-panel"); host.hidden = !chatEmojiOpen; host.replaceChildren(chatEmojiOpen ? emojiPanel(e => { insertAtCursor($("#chat-input"), e); updateSendBtn() }) : "") };
$("#chat-input").addEventListener("input", () => { autoGrow($("#chat-input")); updateSendBtn(); mentionCheck(); if ($("#chat-input").value.trim()) sendTyping(chatKey()) });
$("#chat-input").addEventListener("click", mentionCheck);
$("#chat-input").addEventListener("keydown", e => {
  if (mentionList.length && !$("#nc-mentions").hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mentionSel = (mentionSel + (e.key === "ArrowDown" ? 1 : -1) + mentionList.length) % mentionList.length; mentionCheck(); return }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionList[mentionSel].k); return }
    if (e.key === "Escape") { e.preventDefault(); closeMentions(); return }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) { e.preventDefault(); ncSend() }
  if (e.key === "Escape" && (chatReply || chatEdit)) { e.preventDefault(); cancelChatMode() }
});
$("#chat-input").addEventListener("blur", () => setTimeout(closeMentions, 150));
$("#chat-attach").onclick = e => { e.stopPropagation(); ncPlusOpen = !ncPlusOpen; closeMentions(); renderPlus() };
document.addEventListener("click", e => { if (ncPlusOpen && !e.target.closest("#nc-plusmenu, #chat-attach")) { ncPlusOpen = false; renderPlus() } });
for (const id of ["#chat-file", "#chat-photo", "#chat-camera"]) $(id).onchange = e => { addFiles([...e.target.files]); e.target.value = ""; updateSendBtn() };
$("#chat-input").addEventListener("paste", e => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); updateSendBtn() } });
const chatboxEl = document.querySelector(".nc-conv");
chatboxEl.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); chatboxEl.classList.add("dropping") } });
chatboxEl.addEventListener("dragleave", e => { if (!chatboxEl.contains(e.relatedTarget)) chatboxEl.classList.remove("dropping") });
chatboxEl.addEventListener("drop", e => { e.preventDefault(); chatboxEl.classList.remove("dropping"); addFiles([...e.dataTransfer.files]); updateSendBtn() });
$("#nc-q").addEventListener("input", () => render());
$("#nc-bulb").onclick = () => openPitch(true);
$("#nc-pitch-x").onclick = () => openPitch(false);
$("#compose").addEventListener("submit", () => setTimeout(() => { if (!$("#f-title").value) { openPitch(false); ncToBottom = true; render() } }, 0));
$("#f-help").addEventListener("click", () => openPitch(false));
$("#nc-new").onclick = () => { ncFilter = "dm"; $("#nc-q").value = ""; render(); toast("Pick someone to message") };
$("#nc-fq").addEventListener("input", e => { ncFind = e.target.value; ncFindJump = true; render() });
$("#nc-fq").addEventListener("keydown", e => { if (e.key === "Escape") toggleFind(false) });
$("#nc-fx").onclick = () => toggleFind(false);
$("#nc-jump").onclick = () => { const l = $("#chatlog"); l.scrollTo({ top: l.scrollHeight, behavior: "smooth" }) };
$("#chatlog").addEventListener("scroll", () => { const l = $("#chatlog"); $("#nc-jump").hidden = l.scrollHeight - l.scrollTop - l.clientHeight < 160 });
$("#nc-scrim").onclick = () => { if (ncPitchOpen) openPitch(false); else closeSheet() };
$("#nc-rec-x").onclick = () => stopRec(false);
$("#nc-rec-send").onclick = () => stopRec(true);
/* The mic button, like WhatsApp: hold it to record and let go to send (slide left to cancel),
   or tap it to record hands-free and then tap Send or the bin. Holding never selects text or opens the
   phone's pop-up menu. */
let micG = null, micQuietUntil = 0;
const micBtn = $("#chat-send");
micBtn.addEventListener("contextmenu", e => { if (micBtn.dataset.ic === "mic" || rec) e.preventDefault() });
micBtn.addEventListener("pointerdown", e => {
  if (micBtn.dataset.ic !== "mic" || rec || recStarting || sending || e.button > 0) return;
  e.preventDefault();   // keeps the message box from losing focus and stops long-press selection
  const root = document.documentElement, g = micG = { x: e.clientX, id: e.pointerId, at: Date.now(), hold: false, cancel: false };
  micQuietUntil = Date.now() + 2000;
  root.classList.add("rec-press");
  g.timer = setTimeout(() => { if (micG === g) { g.hold = true; root.classList.add("rec-hold") } }, 280);
  const hint = $("#nc-rechint");
  const move = ev => {
    if (ev.pointerId !== g.id || !g.hold) return;
    const dx = Math.min(0, ev.clientX - g.x); g.cancel = dx < -90;
    root.style.setProperty("--rec-dx", Math.max(-120, dx) + "px"); hint.classList.toggle("go", g.cancel);
  };
  const end = ev => {
    if (ev.pointerId !== g.id) return;
    removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
    clearTimeout(g.timer); micG = null; micQuietUntil = Date.now() + 600;
    root.classList.remove("rec-press", "rec-hold"); root.style.removeProperty("--rec-dx"); hint.classList.remove("go");
    if (!g.hold) return;                       // a tap: keep recording until Send or the bin
    if (ev.type === "pointercancel") return;   // the phone took over the touch (its microphone question): keep recording
    const short = Date.now() - g.at < 700;
    if (!rec) { recAbort = true; if (short) toast("Hold the mic while you talk, then let go to send"); return }
    if (g.cancel) stopRec(false);
    else if (short) { stopRec(false); toast("Hold the mic while you talk, then let go to send") }
    else stopRec(true);
  };
  addEventListener("pointermove", move, { passive: true }); addEventListener("pointerup", end); addEventListener("pointercancel", end);
  startRec();
});
// the tap that started a recording doesn't also count as a click (which would start a second one or press Send)
document.addEventListener("click", e => { if (Date.now() < micQuietUntil && e.target.closest && e.target.closest("#chat-send, #nc-rec")) { e.preventDefault(); e.stopPropagation() } }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && route().view === "chat") { if (ncPitchOpen) openPitch(false); else if (ncSheet) closeSheet(); else if (ncInfo) { ncInfo = false; render() } } });
// swipe a message to the right to reply, like WhatsApp
(() => {
  const log = $("#chatlog"); let sw = null;
  log.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") return; const m = e.target.closest("[data-m]"); if (!m || e.target.closest("button, a")) return; sw = { m, x: e.clientX, y: e.clientY, dx: 0, bw: m.querySelector(".nc-bw"), hint: m.querySelector(".nc-swipe") } });
  const reset = () => { if (!sw) return; sw.bw.style.transition = ""; sw.bw.style.transform = ""; if (sw.hint) sw.hint.style.opacity = ""; sw = null };
  log.addEventListener("pointermove", e => {
    if (!sw) return; const dx = e.clientX - sw.x, dy = Math.abs(e.clientY - sw.y);
    if (dy > 24 && sw.dx < 10) { reset(); return }
    if (dx > 6) { sw.dx = Math.min(dx, 80); sw.bw.style.transition = "none"; sw.bw.style.transform = `translateX(${sw.dx}px)`; if (sw.hint) sw.hint.style.opacity = Math.min(1, sw.dx / 60) }
  });
  log.addEventListener("pointerup", () => { if (sw && sw.dx >= 60) { const id = sw.m.dataset.m; reset(); log.addEventListener("click", ev => { ev.stopPropagation(); ev.preventDefault() }, { capture: true, once: true }); startReply(id); return } reset() });
  log.addEventListener("pointercancel", reset);
})();

/* ----- chat attachments (stored in the database in pieces, since free Firebase has no file storage) ----- */

const MAX_FILE = 10 * 1024 * 1024;    // 10 MB per file (about 12 database pieces)
const MAX_IMAGE_IN = 30 * 1024 * 1024;// big photos (up to 30 MB) are shrunk first
const PART = 900 * 1024;              // one database document holds under 1 MB
let pending = [];                     // files waiting to be sent: {f, key, url}

const fmtSize = n => n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
const extOf = name => ((name || "").split(".").pop() || "file").slice(0, 4).toUpperCase();
function msgSummary(m) {
  if (m.idea) return "Idea: " + m.idea.title;
  if (m.sys) return m.sys.map(x => Array.isArray(x) ? x[1] : x).join("");
  if (m.poll) return "Poll: " + m.poll.q;
  if (m.task) return "Task: " + m.task.text;
  if (m.file && m.file.voice) return "Voice message " + fmtSecs(m.file.voice);
  if (m.text) return snippet(m.text);
  if (m.file) return m.file.thumb ? "Photo" : "File: " + m.file.name;
  return "";
}


function addFiles(fs) {
  for (const f of fs) {
    const isImg = /^image\/(jpeg|png|webp|heic|heif|bmp)$/.test(f.type);
    if (f.size > (isImg ? MAX_IMAGE_IN : MAX_FILE)) { toast(`${f.name} is too big. The limit is 10 MB per file.`); continue }
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
const fileCache = {}, fileBlobs = {};
function loadFile(f) {
  if (!fileCache[f.id]) fileCache[f.id] = (async () => {
    await fbReady;
    const snaps = await Promise.all(Array.from({ length: f.parts }, (_, n) => getDoc(doc(db, "fileparts", `${f.id}_${n}`))));
    if (snaps.some(s => !s.exists())) throw new Error("missing");
    const blob = fileBlobs[f.id] = new Blob(snaps.map(s => s.data().data.toUint8Array()), { type: f.type || "application/octet-stream" });
    return URL.createObjectURL(blob);
  })().catch(e => { delete fileCache[f.id]; throw e });
  return fileCache[f.id];
}
/* Saving a file to the device.
   iPhones and iPads ignore a download link made by the page (above all in the installed app), so there the file goes
   to the phone's share sheet, which has "Save Image" / "Save Video" / "Save to Files". The share sheet only opens
   straight from a tap, so when the file still had to be fetched first, a "Save" button asks for one more tap.
   Other phones and computers download it the usual way. */
const isAppleTouch = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function saveByLink(f, url) {
  const a = el("a", { href: url, download: f.name || "file", rel: "noopener", style: "display:none" });
  document.body.append(a); a.click(); setTimeout(() => a.remove(), 4000);
}
function toastAction(msg, label, fn, ms = 12000) {
  const t = $("#toast");
  t.replaceChildren(el("span", {}, msg), el("button", { class: "btn small primary", onclick: () => { t.hidden = true; fn() } }, label));
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true }, ms);
}
async function downloadFile(f) {
  let url = null; const waited = !fileBlobs[f.id];
  try {
    if (waited) toast("Getting the file\u2026", 20000);
    url = await loadFile(f);
  } catch { toast("That file couldn't be loaded. It may have been deleted."); return }
  const blob = fileBlobs[f.id];
  if (isAppleTouch() && navigator.share && navigator.canShare) {
    const file = new File([blob], f.name || "file", { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      const share = () => navigator.share({ files: [file] }).catch(e => { if (e && e.name !== "AbortError") toast("Couldn't open the save options. Try again.") });
      if (waited) toastAction(isPic(f) ? "The photo is ready." : "The file is ready.", "Save", share);
      else { $("#toast").hidden = true; share() }
      return;
    }
    // too old for the share sheet: open it in a new tab, so it can be saved from there
    if (!window.open(url, "_blank")) saveByLink(f, url);
    return;
  }
  saveByLink(f, url);
  toast(isPic(f) ? "Photo saved to your downloads" : "Saved to your downloads");
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
// Photo viewer gestures, like WhatsApp: pinch or double-tap to zoom, drag to move a zoomed photo, drag a fitted photo down to close
function enableZoom(body, lb, close) {
  body.classList.add("lb-img");
  const pts = new Map(); let s = 1, x = 0, y = 0, base = null, moved = false, downAt = 0, lastTap = 0, dragY = 0;
  const img = () => body.querySelector("img");
  const apply = anim => { const i = img(); if (!i) return; i.style.transition = anim ? "transform .2s ease" : "none"; i.style.transform = `translate(${x}px,${y}px) scale(${s})` };
  const clamp = () => { const i = img(); if (!i) return; const mx = Math.max(0, (i.offsetWidth * s - body.clientWidth) / 2), my = Math.max(0, (i.offsetHeight * s - body.clientHeight) / 2); x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y)) };
  const rel = p => { const r = body.getBoundingClientRect(); return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) } };
  const mid = () => { const a = [...pts.values()]; return a.length > 1 ? { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 } : { x: a[0].x, y: a[0].y } };
  const dist = () => { const a = [...pts.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0 };
  const snap = () => { base = { s, x, y, c: mid(), d: dist() } };
  const zoomAt = (p, ns) => { const r = rel(p); ns = Math.min(5, Math.max(1, ns)); x = r.x - (r.x - x) / s * ns; y = r.y - (r.y - y) / s * ns; s = ns; if (s === 1) { x = 0; y = 0 } clamp() };
  body.addEventListener("lb-reset", () => { s = 1; x = 0; y = 0; dragY = 0; apply(false) });
  body.addEventListener("pointerdown", e => {
    if (e.target.closest("button, a")) return;
    try { body.setPointerCapture(e.pointerId) } catch { }
    if (!pts.size) { moved = false; downAt = Date.now(); dragY = 0 }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); snap();
    if (pts.size > 1) moved = true;
  });
  body.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && base.d) {
      moved = true;
      const c = rel(mid()), c0 = rel(base.c), ns = Math.min(5, Math.max(1, base.s * dist() / base.d));
      x = c.x - (c0.x - base.x) / base.s * ns; y = c.y - (c0.y - base.y) / base.s * ns; s = ns; clamp(); apply(false);
    } else if (pts.size === 1) {
      const c = mid(), dx = c.x - base.c.x, dy = c.y - base.c.y;
      if (Math.hypot(dx, dy) > 8) moved = true;
      if (s > 1) { x = base.x + dx; y = base.y + dy; clamp(); apply(false) }
      else if (moved) { dragY = dy; y = dy; lb.style.opacity = String(1 - Math.min(.6, Math.abs(dy) / 450)); apply(false) }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY }; pts.delete(e.pointerId);
    if (pts.size) { snap(); return }
    if (s < 1.05) { s = 1; x = 0; y = 0 }
    if (s === 1 && Math.abs(dragY) > 110) { close(); return }
    lb.style.opacity = ""; dragY = 0;
    if (s === 1) y = 0;
    if (!moved && Date.now() - downAt < 300 && e.type === "pointerup") {
      if (Date.now() - lastTap < 320) { lastTap = 0; zoomAt(p, s > 1 ? 1 : 2.5); apply(true); return }
      lastTap = Date.now();
    }
    clamp(); apply(true);
  };
  body.addEventListener("pointerup", up); body.addEventListener("pointercancel", up);
  body.addEventListener("wheel", e => { e.preventDefault(); zoomAt({ x: e.clientX, y: e.clientY }, s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); apply(false) }, { passive: false });
}
async function openViewer(f) {
  const lb = $("#lightbox"); lb.hidden = false; lb.style.opacity = "";
  const body = el("div", { class: "lb-body" }, f.thumb ? el("img", { src: f.thumb, alt: f.name, draggable: false }) : el("p", {}, "Loading\u2026"));
  const close = () => { lb.hidden = true; lb.style.opacity = ""; lb.replaceChildren(); document.removeEventListener("keydown", esc) };
  const esc = e => { if (e.key === "Escape") close() };
  document.addEventListener("keydown", esc);
  lb.replaceChildren(el("div", { class: "lb-bar" },
    el("button", { class: "btn lb-x", "aria-label": "Close", title: "Close", onclick: close }, "\u2715"),
    el("span", { class: "lb-name" }, f.name),
    el("button", { class: "btn", onclick: () => downloadFile(f) }, "Download")), body);
  lb.onclick = e => { if (e.target === lb) close() };
  if (isPic(f) && !isPdf(f)) enableZoom(body, lb, close);
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
      : el("img", { src: url, alt: f.name, draggable: false });
    body.replaceChildren(media); body.dispatchEvent(new Event("lb-reset"));
  } catch { body.replaceChildren(el("p", {}, "This file couldn't be shown here. Tap Download to open it on your device.")) }
}
// While the viewer is open the page behind it must not move, scroll or zoom
(() => {
  const lb = document.getElementById("lightbox");
  new MutationObserver(() => document.documentElement.classList.toggle("lb-open", !lb.hidden)).observe(lb, { attributes: true, attributeFilter: ["hidden"] });
  lb.addEventListener("touchmove", e => { if (!e.target.closest(".lb-doc")) e.preventDefault() }, { passive: false });
  lb.addEventListener("gesturestart", e => e.preventDefault());
})();

function jumpTo(id) {
  const n = document.getElementById("msg-" + id); if (!n) return;
  n.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash");
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
// The box grows with the text. Measuring it makes the whole chat re-measure too, so it's only done
// when a new line may have started (or text was deleted), not on every letter.
function autoGrow(ta) {
  const len = ta.value.length, prev = ta._len == null ? -1 : ta._len; ta._len = len;
  if (len > prev && prev >= 0 && ta.scrollHeight <= ta.clientHeight + 2) return;
  ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
}
// reactions under a message: tap one to add or take back yours
function reactRow(m, toggle) {
  const r = Object.entries(m.reacts || {}).map(([k, who]) => ({ e: emojiOf(k), k, n: Object.values(who || {}).filter(Boolean).length, mine: !!(who || {})[me], who: Object.keys(who || {}).filter(u => who[u]) })).filter(x => x.n && x.e);
  if (!r.length) return null;
  return el("div", { class: "reacts" }, r.map(x => el("button", { type: "button", class: "react" + (x.mine ? " mine" : ""), title: x.who.map(u => u === me ? "You" : chatName(u)).join(", "), onclick: e => { e.stopPropagation(); toggle && toggle(x.e, !x.mine) } }, x.e, x.n > 1 ? el("b", {}, x.n) : null)));
}
const msgBody = t => {
  const body = el("span", { class: "msg-text" + (isEmojiOnly(t) ? " big" : "") }, linkify(t));
  const n = chatLeadCount(t); // phone numbers in the message: the team can put them in a partner group
  return n ? [body, el("button", { type: "button", class: "msg-leads", onclick: e => { e.stopPropagation(); openLeadPicker(t) } }, `\u260E Put ${n} ${n === 1 ? "number" : "numbers"} in a group`)] : body;
};

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
    if (day !== lastDay) { log.append(el("div", { class: "day" }, dtf({ weekday: "short", day: "numeric", month: "short" }).format(new Date(m.at)))); lastBy = "" }
    lastDay = day;
    if (m.system) { log.append(el("div", { class: "sysline" }, m.text)); lastBy = ""; continue }
    const mine = m.by === me, grouped = m.by === lastBy && m.at - lastAt < 5 * 60e3;
    if (!mine && !grouped) log.append(el("div", { class: "msg-name" }, m.name || "Someone", m.role === "team" ? el("span", { class: "rolebadge" }, "Ardent Creative Studios") : m.role === "client" ? el("span", { class: "rolebadge client" }, "Client") : el("span", { class: "rolebadge partner" }, "Partner")));
    const time = dtf({ hour: "numeric", minute: "2-digit" }).format(new Date(m.at));
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
  const ta = el("textarea", { id, class: "noteinput", rows: "1", maxlength: "6000", placeholder, "aria-label": "Message" });
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
    for (const t of tasksOf(p)) if (isAssignee(t, me) || (inCheck(t) && isMyCheck(p, t) && t.review.by !== me && p.status === "approved")) { const held = p.status === "approved" && taskHeld(p, t);
      out.push({ p, t, closed: p.status === "completed" || held, held, check: inCheck(t) && isMyCheck(p, t) && t.review.by !== me, phase: (phases.find(ph => ph.id === t.phase) || {}).name || "" }) }
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
    if (x.check) return "check";
    if (!x.personal && (isBlocked(x.p, x.t) || inCheck(x.t))) return "wait";
    if (x.t.status === "doing" || (x.t.due && x.t.due <= soon)) return "now";
    return "next";
  };
  const order = (a, b) => (a.t.done - b.t.done) || taskPrioRank(a.t) - taskPrioRank(b.t) || prioRank(a.p) - prioRank(b.p) || ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : (a.t.due || "9999") > (b.t.due || "9999") ? 1 : 0) || (isActive(a.p) ? -1 : isActive(b.p) ? 1 : 0) || (a.t.order || 0) - (b.t.order || 0);
  const groups = [["check", "To check", "Others finished these. Tap Looks good or Needs changes"], ["now", "Now", "In progress or due by tomorrow"], ["next", "Next", "Ready when you are"], ["wait", "Waiting on others", "Waiting for the task before, or for someone to check yours"]]
    .map(([id, label, hint]) => ({ id, label, hint, list: todo.filter(x => group(x) === id).sort(order) })).filter(g => g.list.length);

  const list = el("section", { class: "idea", style: "gap:0" });
  if (!todo.length) list.append(el("p", { style: "padding:6px 0" }, "All done. Nice work."));
  for (const g of groups) {
    if (groups.length > 1 || g.id === "wait" || g.id === "check") list.append(el("div", { class: "mgroup" + (g.id === "wait" ? " wait" : g.id === "check" ? " check" : "") }, el("b", {}, g.label), el("span", { class: "pcount" }, g.list.length), el("span", { class: "mhint" }, g.hint)));
    g.list.forEach(x => list.append(myTaskRow(x)));
  }
  box.append(list);
  const held = all.filter(x => x.held && !x.t.done);
  if (held.length) {
    // say what's paused: the whole project, or a phase of it
    const why = [...new Set(held.map(x => isPaused(x.p) ? x.p.title : `${x.phase || "a phase"} (${x.p.title})`))];
    box.append(el("p", { class: "label", style: "margin:8px 2px 0" }, `⏸ ${held.length} of your ${held.length === 1 ? "task is" : "tasks are"} on hold because ${why.join(", ")} ${why.length === 1 ? "is" : "are"} paused.`));
  }
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
  const cid = "myp-" + t.id, pkey = "me:" + t.id;
  const ref = () => doc(db, "private", me, "tasks", t.id);   // only when tapped: drawing must work before the database has loaded
  const addP = list => uploadFilesTo(pkey, list, file => setDoc(ref(), { files: { [file.id]: file } }, { merge: true }));
  return el("div", { class: "task" + (t.done ? " done" : " tp-" + (t.priority || "medium")) },
    el("input", { type: "checkbox", id: cid, checked: !!t.done, onchange: e => { const on = e.target.checked; write(() => setDoc(ref(), { done: on, doneAt: on ? Date.now() : null }, { merge: true }), on ? "Done" : "Back on the to-do list") } }),
    el("label", { for: cid, class: "ttext" }, t.text),
    delPTask === t.id
      ? el("button", { class: "linkbtn danger", style: "font-size:12.5px", onclick: () => { delPTask = null; taskFilesOf(t).forEach(dropFileParts); write(() => deleteDoc(ref()), "Task deleted") } }, "Delete?")
      : el("button", { class: "x", title: "Delete task", "aria-label": "Delete task " + t.text, onclick: () => { delPTask = t.id; render(); setTimeout(() => { if (delPTask === t.id) { delPTask = null; render() } }, 4000) } }, "✕"),
    el("div", { class: "meta" },
      el("span", { class: "label" }, "Just for me"),
      t.priority && t.priority !== "medium" && !t.done ? el("span", { class: "prio prio-" + t.priority }, PRIORITIES.find(x => x.id === t.priority).name) : null,
      dueChip(t),
      taskFilesOf(t).length ? null : taskUpKey === pkey ? el("span", { class: "label", id: "tup-" + pkey, style: "text-transform:none;letter-spacing:0" }, taskUpMsg)
        : el("button", { class: "linkbtn", style: "font-size:12.5px", title: "Attach a PDF or file", "aria-label": "Attach a file to " + t.text, onclick: () => pickFiles(addP) }, "Attach")),
    taskFilesOf(t).length ? el("div", { class: "meta" }, fileRow(taskFilesOf(t), pkey, () => true,
      f => setDoc(ref(), { files: { [f.id]: DEL() } }, { merge: true }).then(() => dropFileParts(f)), addP)) : null);
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
    if (p.status === "voting" && p.author !== me) add("idea:" + p.id, p.createdAt, p.author, `${name(p.author)} pitched a new idea: ${p.title}`, "chat-ideas");
    if (p.status === "voting" && p.author === me && p.wonAt && ideaState(p).won) add("ideawon:" + p.id + ":" + p.wonAt, p.wonAt, p.wonBy || null, `“${p.title}” won the vote. Confirm it to Projects`, "chat-ideas");
    if (p.status === "voting" && p.author !== me && !(p.votes || {})[me] && p.createdAt && Date.now() - p.createdAt > 2 * 864e5) add("ideanudge:" + p.id, p.createdAt + 2 * 864e5, p.author, `Still waiting for your vote: ${p.title}`, "chat-ideas");
    if (p.status === "completed" && p.completedBy !== me) add("done:" + p.id, p.completedAt, p.completedBy, `${p.title} is completed`, "projects-done");
    const pl = (p.planners || {})[me];
    if (pl && typeof pl === "object" && pl.by !== me) add("planner:" + p.id, pl.at, pl.by, `${name(pl.by)} made you a planner of ${p.title}`, "plan-" + p.id);
    if (isProj(p)) {
      if (plannerIds(p).includes(me) || isAdmin) for (const r of joinReqsOf(p)) add("ask:" + p.id + ":" + r.u + ":" + r.at, r.at, r.u, `${name(r.u)} wants to join the team of ${p.title}`, "project-" + p.id);
      for (const [u, j] of Object.entries(p.joined || {})) if (j && j.inv === me && u !== me) add("acc:" + p.id + ":" + u + ":" + j.at, j.at, u, `${name(u)} accepted your invite and joined the team of ${p.title}`, "project-" + p.id);
      const iv = (p.invites || {})[me]; if (iv && iv.by !== me) add("inv:" + p.id + ":" + iv.at, iv.at, iv.by, `${name(iv.by)} invited you to join the team of ${p.title}`, "project-" + p.id);
      const jn = (p.joined || {})[me]; if (jn && jn.by !== me) add("in:" + p.id + ":" + jn.at, jn.at, jn.by, (jn.vote ? `${name(jn.by)} made ${p.title} a project. You voted Keep, so you're on its team` : `${name(jn.by)} accepted you onto the team of ${p.title}`), "project-" + p.id);
    }
    if (p.status !== "approved") continue;
    for (const t of tasksOf(p)) {
      const go = taskLink(p, t);
      // checks: something to check, changes asked on yours, or yours was checked
      if (inCheck(t) && isMyCheck(p, t) && t.review.by !== me) add("chk:" + t.id + ":" + t.review.at, t.review.at, t.review.by, `${name(t.review.by)} finished "${t.text}". Please check it (${p.title})`, go);
      if (isAssignee(t, me) && !t.done && !inCheck(t) && t.changes && t.changes.by !== me) add("chg:" + t.id + ":" + t.changes.at, t.changes.at, t.changes.by, `${name(t.changes.by)} asked for changes on "${t.text}": ${t.changes.text}`, go);
      if (isAssignee(t, me) && t.done && t.checked && t.checked.by !== me) add("ok:" + t.id + ":" + t.checked.at, t.checked.at, t.checked.by, `${name(t.checked.by)} checked "${t.text}" ✓ (${p.title})`, go);
      // a size the team is asked to agree on, and suggestions for the planner who sized it
      if (needsMySize(p, t) && t.sizeBy) add("size:" + t.id + ":" + t.sizeAt, t.sizeAt, t.sizeBy, `${name(t.sizeBy)} sized "${t.text}" ${t.size} (${ptsText(sizePts(t.size))}). Do you agree? (${p.title})`, go);
      if (t.sizeBy === me) for (const [u, v] of Object.entries(t.sizeVotes || {})) if (v !== "ok" && sizeOf(v) && v !== t.size) add("sizeask:" + t.id + ":" + u + ":" + v + ":" + t.sizeAt, t.sizeAt, u, `${name(u)} suggests "${t.text}" should be ${v}, not ${t.size} (${p.title})`, go);
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
      if (!t.done && t.due && t.due <= tomorrow && !taskHeld(p, t)) add("due:" + t.id + ":" + today, dayStart(), null, t.due < today ? `Overdue: ${t.text} (${p.title})` : t.due === today ? `Due today: ${t.text} (${p.title})` : `Due tomorrow: ${t.text} (${p.title})`, go);
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
    for (const [lid, e] of Object.entries(p.moneyLog || {})) if (e && e.kind === "deal" && e.by !== me) add("mlog:" + lid, e.at, e.by, `${name(e.by)} changed the deal for ${p.title}: ${e.what}`, "project-" + p.id);
    for (const [mid, m] of Object.entries(p.meetings || {})) if (m && m.by !== me) add("meet:" + mid, m.at, m.by, `${name(m.by)} added meeting notes in ${p.title}${m.title ? ": " + m.title : ""}`, "build-" + p.id);
  }
  for (const p of dealProjects()) {
    if (!canPlan(p) || p.status !== "approved") continue;
    for (const s of moneyOf(p).late) add("late:" + p.id + ":" + s.label + ":" + today, dayStart(), null, `Late payment: ${p.title}${p.money.client ? " (" + p.money.client + ")" : ""}, ${s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label}`, "project-" + p.id);
  }
  if (isAdmin && moneyRules && moneyRules.reviewAt && moneyRules.reviewAt <= today) add("review:" + moneyRules.reviewAt, dayStart(), null, `Time to review the team fund: it's ${rulesNow().fundPct}% since ${fmtDate(ymd(new Date(moneyRules.setAt || Date.now())))}. Keep it or change it on the Money page.`, "money-rules");
  if (isAdmin && fundDoc) for (const [sid, sb] of Object.entries(fundDoc.subs || {})) if (sb && !sb.paused && sb.nextDue && sb.nextDue <= tomorrow) add("sub:" + sid + ":" + sb.nextDue, dayStart(), null, `${sb.name} subscription is due ${sb.nextDue < today ? "(overdue)" : sb.nextDue === today ? "today" : "tomorrow"}`, "money-fund");
  for (const x of upgradeList()) {
    if (amCreator() && x.by !== me && x.at) add("up:" + x.id, x.at, x.by, `${name(x.by)} ${x.kind === "fix" ? "reported a bug" : "has an idea"}: ${(x.text || "").slice(0, 80)}`, "settings-feedback");
    if (x.by === me && x.status === "doing" && x.doer && x.doer !== me) add("updo:" + x.id, x.startedAt || x.at, x.doer, `${name(x.doer)} is working on your request: ${(x.text || "").slice(0, 60)}`, "settings-feedback");
    if (x.by === me && x.status === "done" && x.doneBy !== me) add("updone:" + x.id, x.doneAt || x.at, x.doneBy || null, `Your request is live: ${(x.text || "").slice(0, 60)}`, "settings-feedback");
  }
  for (const n of unseenNews()) add("news:" + n.id, n.at || new Date(n.date + "T09:00").getTime(), n.by || null, (n.by ? `${firstName(n.by)} posted: ` : "New in Pitch Room: ") + n.title, "me");
  { const v = rulesNow().version || 1; if (dealProjects().length && ((people[me] || {}).moneyAgreed || {}).version !== v) add("rules:" + v, (moneyRules || {}).updatedAt || dayStart(), null, rulesChanges(rulesNow()).length ? "The money rules changed: " + rulesChanges(rulesNow()).join(", ") + ". Please read and agree" : "Please read and agree to the team's money rules", "money-rules") }
  for (const [pid, a] of Object.entries(activeMap)) { const p = ideas.find(i => i.id === pid); if (p && a && a.by !== me && p.status === "approved") add("start:" + pid + ":" + a.at, a.at, a.by, `We started building ${p.title}`, "build-" + pid) }
  if (isAdmin && (people[me] || {}).rulesPublished !== RULES_VERSION) add("rulesdb:" + RULES_VERSION, dayStart(), null, "New database rules are ready. Copy and publish them in Settings \u203a Database rules", "settings-rules");
  if (isAdmin && live && Date.now() - ((people[me] || {}).lastBackup || 0) > 30 * 864e5) add("backup:" + thisMonth(), dayStart(), null, "Time for this month's backup: Settings \u203a Backup", "settings-backup");
  for (const t of dmThreads) if (dmUnread(t)) add("dm:" + t.id + ":" + t.lastAt, t.lastAt, people[t.lastBy] ? t.lastBy : null, `${chatName(t.lastBy)}${isPartnerUid(t.lastBy) ? " (partner)" : ""} sent you a private message: ${(t.lastText || "").slice(0, 60)}`, "dm-" + t.lastBy);
  for (const m of chat) { if (m.by === me || !m.replyTo) continue; const o = chat.find(x => x.id === m.replyTo); if (o && o.by === me) add("reply:" + m.id, m.at, m.by, `${name(m.by)} replied to you: ${msgSummary(m)}`, m.ch === "ideas" ? "chat-ideas" : "chat-team") }
  for (const m of chat) if (mentionsMe(m)) add("chat:" + m.id, m.at, m.by, `${name(m.by)} mentioned you in ${m.ch === "ideas" ? "Ideas" : "the team chat"}: ${msgSummary(m)}`, m.ch === "ideas" ? "chat-ideas" : "chat-team");
  for (const p of ideas) { const l = p.status === "approved" && p.chat && p.chat.last; if (l && l.by !== me && Array.isArray(l.mentions) && (l.mentions.includes(me) || l.mentions.includes("all"))) add("pc:" + p.id + ":" + l.at, l.at, l.by, `${name(l.by)} mentioned you in ${p.title}: ${l.text || ""}`, "pc-" + p.id) }
  return out.sort((a, b) => b.at - a.at).slice(0, 50);
}
// Speed: moving between pages changes no data, so the alerts worked out on the last data change are reused then.
let alertsCache = null, navRender = false;
function renderAlerts() {
  const list = navRender && alertsCache && alertsCache.day === todayStr() && alertsCache.me === me ? alertsCache.list : (alertsCache = { list: buildAlerts(), day: todayStr(), me }).list, seen = getAlertsSeen();
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
/* ----- Me: your day at a glance (Nov 2026 redesign) -----
   Top card with today's progress, a week strip, setup in one line, the one thing to do now, checks waiting for you,
   the day you picked, your projects, everything else grouped under Coming up, and a notepad. */
let meDay = null, meOpen = {}, meAdd = false, meSkip = 0, meNotesAll = false;
const meIc = d => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "me2-ic"); s.innerHTML = d; return s };
const ME_IC = { tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', chev: '<path d="m9 6 6 6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', sun: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>' };
// a ring that fills up: done of total
function meRing(done, total, size, label) {
  const C = 163.36, f = total ? done / total : 0;
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 64 64"); s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="7"/><circle class="me2-ringfill" cx="32" cy="32" r="26" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * f).toFixed(1)} ${C}" transform="rotate(-90 32 32)"/>`;
  return el("span", { class: "me2-ring", role: "img", "aria-label": label }, s);
}
function meSetupLine() {
  const prof = people[me] || {}; if (prof.welcomeHidden) return null;
  const ver = rulesNow().version || 1;
  const steps = [
    ["take the skills quiz", !!prof.skills, () => { location.hash = "skills" }],
    ["turn on alerts", pushOn || Object.keys(prof.pushSubs || {}).length > 0, () => { location.hash = "settings-alerts" }],
    ["install the app", isHomeScreenApp() || !!prof.installed, () => { location.hash = "settings-install" }],
    ["agree to the money rules", (prof.moneyAgreed || {}).version === ver, () => { moneyTab = "rules"; location.hash = "money" }],
    ["say hi in the team chat", chat.some(m => m.by === me && !m.system), () => { location.hash = "chat-team" }],
    ["join a project", ideas.some(p => (p.members || {})[me]), () => { location.hash = "projects" }]];
  const n = steps.filter(x => x[1]).length; if (n === steps.length) return null;
  const next = steps.find(x => !x[1]);
  return el("div", { class: "me2-card me2-setup" },
    el("div", { class: "me2-setup-t" }, el("span", {}, el("b", {}, `Setup ${n} of ${steps.length}`), el("span", { class: "mut" }, ` · Next: ${next[0]}`)),
      el("span", { class: "me2-bar" }, el("i", { style: `width:${Math.round(n / steps.length * 100)}%` }))),
    el("button", { class: "btn small", onclick: next[2] }, "Go"),
    el("button", { class: "me2-x", "aria-label": "Hide setup", title: "Hide", onclick: () => write(() => setDoc(doc(db, "users", me), { welcomeHidden: true }, { merge: true })) }, meIc(ME_IC.x)));
}
function renderMe() {
  const box = $("#me"); box.replaceChildren();
  const prof = people[me] || {}, fullName = realName(me) || (myProfile && myProfile.name) || "";
  const today = todayStr(); if (!meDay) meDay = today;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const dayStart = t0.getTime();
  const all = myTasks().filter(x => !x.closed);
  const checks = all.filter(x => x.check);
  const work = all.filter(x => !x.check);
  const waiting = x => !x.personal && (isBlocked(x.p, x.t) || inCheck(x.t));
  const openW = work.filter(x => !x.t.done && !waiting(x)), waitList = work.filter(x => !x.t.done && waiting(x));
  const forDay = (x, d) => d === today ? ((x.t.due && x.t.due <= today) || x.t.status === "doing") : x.t.due === d;
  const doneToday = x => x.t.done && (x.t.doneAt || 0) >= dayStart;
  const order = (a, b) => taskPrioRank(a.t) - taskPrioRank(b.t) || prioRank(a.p) - prioRank(b.p) || ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : (a.t.due || "9999") > (b.t.due || "9999") ? 1 : 0) || (a.t.order || 0) - (b.t.order || 0);
  const todayOpen = openW.filter(x => forDay(x, today)).sort(order);
  const todayDone = work.filter(x => doneToday(x) && (!x.t.due || x.t.due <= today));
  const total = todayOpen.length + todayDone.length;

  // the top card
  const left = todayOpen.length;
  const summary = (left ? `${left} ${left === 1 ? "thing" : "things"} for today` : total ? "Today is done" : "Nothing due today")
    + (checks.length ? `${left || total ? " and" : ","} ${checks.length} ${checks.length === 1 ? "check" : "checks"} waiting for you.` : ".");
  const dateLine = dtf({ weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const avSrc = prof.pic || (myProfile && myProfile.photo) || prof.photo || "";
  const wrapA = el("div", { class: "me2-col me2-a" }), wrapB = el("div", { class: "me2-col me2-b" });
  wrapA.append(el("section", { class: "me2-hero me2-o1" },
    el("div", { class: "me2-hero-top" },
      el("div", { class: "me2-hero-t" }, el("span", { class: "me2-date" }, dateLine),
        el("h1", {}, `${greeting()}, ${fullName.split(" ")[0] || "you"}`), el("span", { class: "me2-sum" }, summary)),
      total ? el("span", { class: "me2-ringbox" }, meRing(todayDone.length, total, 76, `${todayDone.length} of ${total} done today`),
        el("span", { class: "me2-ringtxt" }, el("b", {}, `${todayDone.length}/${total}`), el("small", {}, "today")))
        : el("button", { class: "me2-av", "aria-label": "Your profile and settings", onclick: () => { location.hash = "settings" } }, avSrc ? el("img", { src: avSrc, alt: "", referrerpolicy: "no-referrer" }) : (fullName || "?").slice(0, 1))),
    el("button", { class: "me2-brief", onclick: () => { asstOpen = true; alertsOpen = false; useTemplate(ASST_TEMPLATES[0], null) } }, meIc(ME_IC.sun), "My day in 30 seconds")));

  if (isHomeScreenApp() && !prof.installed && live) setDoc(doc(db, "users", me), { installed: true }, { merge: true }).catch(() => {});
  if (privErr) wrapA.append(el("div", { class: "notice me2-o1" }, privErr === "rules"
    ? "Your personal tasks and notes can't load yet. Mohammed needs to publish the latest database rules in Firebase. This page will try again by itself."
    : "Your personal tasks and notes can't load right now. Check your connection. Trying again…"));

  // the week: Monday to Sunday, dots for what's due
  const mon = new Date(); mon.setHours(12, 0, 0, 0); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
  const week = el("div", { class: "me2-week me2-o2", role: "group", "aria-label": "Pick a day" });
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i); const k = ymd(d), sel = k === meDay, n = openW.filter(x => forDay(x, k)).length;
    week.append(el("button", { class: "me2-day" + (sel ? " on" : "") + (k === today ? " today" : ""), "aria-pressed": String(sel), "aria-label": `${dtf({ weekday: "long", day: "numeric" }).format(d)}, ${n} due`, onclick: () => { meDay = k; meAdd = false; render() } },
      el("span", { class: "wd" }, dtf({ weekday: "short" }).format(d)), el("b", {}, d.getDate()),
      el("span", { class: "dots" }, Array.from({ length: Math.min(n, 3) }, () => el("i")))));
  }
  wrapB.append(week);
  { const s = meSetupLine(); if (s) { s.classList.add("me2-o3"); wrapB.append(s) } }

  // do this now: the most important open task (today first, then anything ready)
  const pool = todayOpen.length ? todayOpen : openW.slice().sort(order);
  if (pool.length) {
    const i = meSkip % pool.length, x = pool[i], t = x.t;
    const due = t.due ? (t.due < today ? "Was due " + fmtDate(t.due) : t.due === today ? "Due today" : "Due " + fmtDate(t.due)) : t.status === "doing" ? "In progress" : "No date";
    const finish = () => { meSkip = 0; if (x.personal) write(() => setDoc(doc(db, "private", me, "tasks", t.id), { done: true, doneAt: Date.now() }, { merge: true }), "Done"); else toggleDone(x.p, t, true, null) };
    wrapA.append(el("section", { class: "me2-focus me2-o4" },
      el("div", { class: "me2-focus-h" }, el("span", { class: "k" }, "Do this now"), el("span", { class: "spacer" }), pool.length > 1 ? el("span", { class: "n" }, `${i + 1} of ${pool.length}`) : null),
      el("button", { class: "me2-focus-t", onclick: () => { if (!x.personal) location.hash = taskLink(x.p, t) } }, t.text),
      el("div", { class: "me2-chips" }, el("span", {}, x.personal ? "Just for you" : x.p.title), el("span", {}, due), t.priority === "high" || t.priority === "urgent" ? el("span", { class: "hi" }, "High priority") : null),
      el("div", { class: "me2-focus-a" }, el("button", { class: "me2-done", onclick: finish }, meIc(ME_IC.tick), "Mark done"),
        pool.length > 1 ? el("button", { class: "me2-later", onclick: () => { meSkip++; render() } }, "Later") : null)));
  } else if (all.length || personal.length) {
    wrapA.append(el("section", { class: "me2-card me2-clear me2-o4" }, el("span", { class: "me2-okc" }, meIc(ME_IC.tick)), el("b", {}, "All clear"), el("span", { class: "mut" }, "Nothing is waiting on you. Take a break, or add something below.")));
  }

  // checks waiting for you
  checks.slice(0, 3).forEach(x => {
    const by = (x.t.review && x.t.review.by) || x.t.doneBy || x.t.owner;
    wrapA.append(el("div", { class: "me2-card me2-check me2-o5" }, el("span", { class: "me2-ava" }, (realName(by) || "?").slice(0, 2).toUpperCase()),
      el("span", { class: "me2-check-t" }, el("b", {}, `${by ? firstName(by) : "Someone"} finished “${x.t.text}”`), el("span", { class: "mut" }, `${x.p.title} · waiting for your check`)),
      el("button", { class: "btn small me2-dark", onclick: () => { location.hash = taskLink(x.p, x.t) } }, "Check")));
  });
  if (checks.length > 3) wrapA.append(el("p", { class: "label me2-o5", style: "margin:0 4px" }, `${checks.length - 3} more ${checks.length - 3 === 1 ? "check" : "checks"} on the Projects page`));

  // the day you picked
  const isToday = meDay === today, tomorrow = plusDays(1);
  const dayList = work.filter(x => isToday ? (forDay(x, today) && !x.t.done && !waiting(x)) || todayDone.includes(x) : x.t.due === meDay).sort((a, b) => (a.t.done - b.t.done) || order(a, b));
  const dayTitle = isToday ? "Today" : meDay === tomorrow ? "Tomorrow" : dtf({ weekday: "long", day: "numeric", month: "short" }).format(new Date(meDay + "T12:00:00"));
  const dayBox = el("section", { class: "me2-card me2-list me2-o6" },
    el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, dayTitle), el("span", { class: "mut" }, dayList.length ? `${dayList.filter(x => !x.t.done).length} left` : ""), el("span", { class: "spacer" }),
      el("button", { class: "btn small me2-add", "aria-expanded": String(meAdd), onclick: () => { meAdd = !meAdd; render(); if (meAdd) setTimeout(() => { const d = $("#ptask-due"); if (d && meDay !== today) d.value = meDay; const n = $("#ptask-text"); if (n) n.focus() }, 0) } }, meIc(meAdd ? ME_IC.x : ME_IC.plus), meAdd ? "Close" : "Add")));
  if (meAdd) dayBox.append(addPersonalTaskRow());
  if (dayList.length) dayList.forEach(x => dayBox.append(myTaskRow(x)));
  else dayBox.append(el("p", { class: "me2-empty" }, isToday ? "Nothing due today." : "Nothing due this day."));
  wrapA.append(dayBox);

  // your projects
  const mine = ideas.filter(p => p.status === "approved" && projTeam(p).includes(me)).sort((a, b) => (isActive(b) ? 1 : 0) - (isActive(a) ? 1 : 0) || prioRank(a) - prioRank(b));
  if (mine.length) {
    const row = el("div", { class: "me2-projs" });
    for (const p of mine) {
      const ts = tasksOf(p), dn = ts.filter(t => t.done).length, pct = ts.length ? Math.round(dn / ts.length * 100) : 0;
      const myLeft = ts.filter(t => !t.done && isAssignee(t, me)).length, st = stageMap(p);
      row.append(el("button", { class: "me2-proj", onclick: () => { location.hash = "project-" + p.id } },
        el("span", { class: "me2-pring" }, meRing(dn, ts.length || 1, 44, `${pct}% done`), el("small", {}, pct + "%")),
        el("b", {}, p.title), el("span", { class: "mut" }, [myLeft ? `${myLeft} yours left` : "Nothing for you", isPaused(p) ? "On hold" : st.cur ? st.cur.ph.name : ""].filter(Boolean).join(" · "))));
    }
    wrapB.append(el("section", { class: "me2-sec me2-o7" }, el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "Your projects"), el("span", { class: "spacer" }), el("a", { href: "#projects", class: "me2-link" }, "All")), row));
  }

  // coming up: everything else, grouped by project
  const later = openW.filter(x => !forDay(x, today) && !(meDay !== today && x.t.due === meDay));
  if (later.length || waitList.length) {
    const groups = {}; later.forEach(x => { const k = x.personal ? "__me" : x.p.id; (groups[k] = groups[k] || { name: x.personal ? "Just for you" : x.p.title, list: [] }).list.push(x) });
    const sec = el("section", { class: "me2-card me2-list me2-o8" }, el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "Coming up"), el("span", { class: "mut" }, `${later.length} ${later.length === 1 ? "task" : "tasks"}`)));
    const grp = (k, nm, list, cls) => {
      const open = !!meOpen[k];
      sec.append(el("button", { class: "me2-grp" + (cls ? " " + cls : ""), "aria-expanded": String(open), onclick: () => { meOpen[k] = !open; render() } }, el("span", { class: "nm" }, nm), el("span", { class: "mut" }, list.length), meIc(open ? ME_IC.down : ME_IC.chev)));
      if (open) list.sort(order).forEach(x => sec.append(myTaskRow(x)));
    };
    Object.entries(groups).sort((a, b) => b[1].list.length - a[1].list.length).forEach(([k, g]) => grp(k, g.name, g.list));
    if (waitList.length) grp("__wait", "Waiting for someone else first", waitList, "wait");
    wrapB.append(sec);
  }

  // notepad
  const np = el("section", { class: "me2-card me2-notes me2-o9" }, el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "Notepad"), el("span", { class: "spacer" }), el("span", { class: "mut me2-only" }, meIc(ME_IC.lock), "Only you")));
  if (meNotesAll) { const b = el("div"); renderNotes(b); np.append(b, el("button", { class: "linkbtn", onclick: () => { meNotesAll = false; render() } }, "Show less")) }
  else {
    const n = myNotes[0];
    if (n) np.append(el("textarea", { class: "pnote me2-pad", id: "pn-" + n.id, rows: "3", placeholder: "Jot something down…", "aria-label": "Your latest note", value: n.text || "", oninput: e => savePrivateNote(n.id, e.target.value) }), el("span", { class: "label", id: "pns-" + n.id }));
    else np.append(el("button", { class: "me2-pad me2-padbtn", onclick: newPrivateNote }, "Jot something down…"));
    np.append(el("div", { class: "row", style: "gap:10px" }, myNotes.length > 1 ? el("button", { class: "linkbtn", onclick: () => { meNotesAll = true; render() } }, `All notes (${myNotes.length})`) : null, el("span", { class: "spacer" }), n ? el("button", { class: "linkbtn", onclick: newPrivateNote }, "New note") : null));
  }
  wrapB.append(np);

  box.append(el("div", { class: "me2" }, wrapA, wrapB));
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
/* ----- creators: team members who can also change Pitch Room itself (its code on GitHub) ----- */
const REPO = "mohammeddalajmiii-cyber/the-office-", REPO_URL = "https://github.com/" + REPO;
const creatorsMap = () => (teamDoc && teamDoc.creators) || {};
const isCreatorEmail = e => !!e && (ADMINS.includes(e) || !!creatorsMap()[e]);
const emailOfUid = u => ((people[u] || {}).email || "").toLowerCase();
const uidOfEmail = e => (Object.entries(people).find(([, x]) => (x.email || "").toLowerCase() === e) || [])[0] || null;
const amCreator = () => isAdmin || isCreatorEmail(((myProfile && myProfile.email) || "").toLowerCase());
function saveCreator(e, on, github, ok) {
  const gh = (github || "").trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\//i, "").replace(/\/.*$/, "").slice(0, 39);
  const val = { github: gh, by: me, at: Date.now() };
  const map = { ...creatorsMap() }; if (on) map[e] = val; else delete map[e];
  teamDoc = { ...(teamDoc || {}), creators: map }; render();
  // keys inside a merged object are taken as plain names, so the dots in an email are fine here
  return write(() => setDoc(doc(db, "meta", "team"), { creators: { [e]: on ? val : DEL() }, updatedAt: Date.now(), updatedBy: me }, { merge: true }), ok);
}
function saveTeam(emails, ok) {
  const list = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  teamDoc = { ...(teamDoc || {}), emails: list }; render();
  write(() => setDoc(doc(db, "meta", "team"), { emails: list, updatedAt: Date.now(), updatedBy: me }, { merge: true }), ok);
}

/* ----- Build Pitch Room: who can change the site, what the team wants changed, and how creators ship it ----- */
let upgradesDoc = null, upKind = "fix", delUpgrade = null, prevHash = "";
const UP_KINDS = { fix: "Something's broken", easier: "Make work easier", feature: "New feature", design: "Look and feel" };
const UP_STATUS = { asked: "Asked", doing: "Being built", done: "Done" };
const upgradeList = () => Object.entries((upgradesDoc && upgradesDoc.items) || {}).filter(([, x]) => x && x.text).map(([id, x]) => ({ id, ...x }))
  .sort((a, b) => (a.status === "done") - (b.status === "done") || (b.status === "doing") - (a.status === "doing") || (b.at || 0) - (a.at || 0));
const saveUpgrade = (id, data, ok) => write(() => setDoc(doc(db, "meta", "upgrades"), { items: { [id]: data } }, { merge: true }), ok);
function buildPage() {
  const wrap = el("div", { style: "display:grid;gap:14px" });
  const card = (...kids) => el("section", { class: "idea", style: "gap:10px" }, ...kids.filter(Boolean));
  const creator = amCreator();

  // who the creators are
  const list = [...new Set([...ADMINS, ...Object.keys(creatorsMap())])];
  wrap.append(card(
    el("div", { class: "row" }, el("h3", {}, "Creators"), el("span", { class: "spacer" }), creator ? el("span", { class: "done-badge" }, "\u{1F6E0}️ You're one") : null),
    el("p", { style: "margin:0;font-size:14px" }, "Creators can change Pitch Room itself: add features, fix problems and change the design. Everyone on the team can ask for an upgrade below."),
    el("div", { style: "display:grid;gap:2px" }, list.map(e => {
      const u = uidOfEmail(e), gh = (creatorsMap()[e] || {}).github;
      return el("div", { class: "teamrow" }, u ? av(u) : null, el("span", { class: "teammail" }, u ? name(u) : e),
        el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, ADMINS.includes(e) ? "Admin" : gh ? "GitHub @" + gh : u ? "" : "Hasn't signed in yet"));
    })),
    isAdmin ? el("div", { class: "row" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Make someone a creator in People and access."), el("span", { class: "spacer" }),
      el("button", { class: "btn small", onclick: () => { accessRole = "creator"; location.hash = "settings-access" } }, "Add a creator")) : null));

  wrap.append(upgradeRequestsCard());


  // how a creator changes the site
  if (creator) {
    const step = (n, title, ...body) => el("div", { class: "teamrow", style: "align-items:flex-start" }, el("span", { class: "chip", style: "flex:none" }, n), el("div", { style: "display:grid;gap:4px;min-width:0" }, el("b", {}, title), ...body));
    const p = t => el("span", { style: "font-size:14px" }, t);
    wrap.append(card(el("h3", {}, "How to change Pitch Room"),
      step("1", "Get the code", p(`The site's code is on GitHub. ${ADMIN_NAME} invites your GitHub account, then you accept the invite once.`),
        el("span", { class: "row", style: "gap:6px" }, el("a", { class: "btn small", href: REPO_URL + "/invitations", target: "_blank", rel: "noopener noreferrer" }, "Accept the invite"), el("a", { class: "btn small", href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, "Open the code"))),
      step("2", "Make the change with Claude", p(`Open Claude Code, pick the ${REPO.split("/")[1]} repository and describe the change in plain words, like "add a dark blue theme". Ask it to run build.py and push to main when you're happy.`),
        el("span", { class: "row", style: "gap:6px" }, el("a", { class: "btn small", href: "https://claude.ai/code", target: "_blank", rel: "noopener noreferrer" }, "Open Claude Code"), el("button", { class: "btn small quiet", onclick: () => copyText(REPO, "Repository name copied") }, "Copy repo name"))),
      step("3", "Where things live", p("src/app.js is most of the site, src/page.html is the layout and styles, and partners.js, clients.js, push.js and money-engine.js are the partner, client, alert and money parts."),
        p("Don't edit index.html by hand: build.py rebuilds it from the src folder. It also copies firestore.rules into the site, so the rules live in that one file."),
        el("button", { class: "btn small quiet", onclick: () => { guideTab = "creators"; location.hash = "settings-guide" } }, "Read the creators' guide")),
      step("4", "Ship it", p("Once the change is on main, the live site updates within a couple of minutes and everyone gets it on their next reload. Then tap “It's live” on the request above.")),
      step("5", "Leave these to " + ADMIN_NAME, p(`Database rules (who can see and change what), the team list, money and the fund. If a change needs new database rules, update firestore.rules and tell ${ADMIN_NAME}: only he can publish them.`))));
  } else {
    wrap.append(el("p", { class: "label", style: "text-transform:none;letter-spacing:0;margin:0" }, `Want to help build Pitch Room yourself? Ask ${ADMIN_NAME} to make you a creator.`));
  }
  return wrap;
}

/* ----- the guide: how Pitch Room works, for members, planners and creators ----- */
let guideTab = null;
function guidePage() {
  const planner = ideas.some(i => isProj(i) && canPlan(i)), creator = amCreator();
  // the creators' part is only for creators (and the admin)
  const tab = guideTab && (guideTab !== "creators" || creator) ? guideTab : (creator && !isAdmin ? "creators" : planner ? "planners" : "everyone");
  const wrap = el("div", { class: "guide" });
  wrap.append(el("p", { class: "lede", style: "margin:0" }, "The small things that make work on Pitch Room faster. Read your part once; come back when you need it."),
    el("div", { class: "seg seg-wide", role: "group", "aria-label": "Guide for" }, [["everyone", "Everyone"], ["planners", "Planners"], ...(creator ? [["creators", "Creators"]] : [])].map(([k, l]) =>
      el("button", { "aria-pressed": String(tab === k), onclick: () => { guideTab = k; render() } }, l))));
  const card = (icon, title, items) => el("section", { class: "idea" }, el("h3", {}, icon + "  " + title), el("ul", {}, items.map(x => el("li", {}, ...(Array.isArray(x) ? [el("b", {}, x[0]), " " + x[1]] : [x])))));
  const R = rulesNow();
  if (tab === "everyone") wrap.append(
    card("\u{1F465}", "Project teams", [
      ["Every project has its own team.", "Only the team takes tasks, ticks them, checks in, adds files and gets paid from the project."],
      ["Not on the team?", "You can still open the project, read everything and leave notes on tasks. Tap Ask to join the team at the top; a planner accepts you."],
      ["Invited?", "You'll get an alert and a Join the team button on the project. You're only on the team once you accept."],
      ["Leaving", "is in the project's Settings › People. Your open tasks are freed for someone else; what you already earned stays yours."]]),
    card("✅", "Tasks: the fast way", [
      ["Tick the first step", "of a task and it starts by itself (In progress). When every step is ticked, you get a Mark done button."],
      ["Leave a note when you finish:", "a link, where the files are, what's left. The person who gave you the task, and whoever is next, get an alert."],
      ["Waiting for…", "on a task means it needs another task done first. You get an alert the moment you can start."],
      ["Drop files", "straight onto an open task to attach them (PDFs, designs, photos, up to 10 MB)."],
      ["Me › My tasks", "shows everything that's yours in Now, Next and Waiting on others. Private to-dos and notes there are only for you."],
      ["Tap someone's photo", "above a project's tasks to see only their tasks."],
      ["Take the skills quiz", "(Me › Skills and team, about 6 minutes). It finds your main role, other roles you fit and your hidden skill, so the right tasks come to you."],
      ["Done tasks fold away", "at the bottom of their phase under ✓ done. Tap it to review them; untick one to bring it back."],
      ["Checks instead of review tasks:", "open a task and pick a planner to check it, or Any planner. Ticking it sends it to them; it only counts as done when a planner taps Looks good. Needs changes sends it back with a note. Things to check show in Me under To check. Planners see a tidy-up box that turns old review tasks into checks."]]),
    card("\u{1F3AF}", "Task sizes and points", [
      ["Every task has a size:", "S (up to 2 hours) 1 point · M (up to 1 day) 3 · L (1 to 3 days) 8 · XL (3 days to a week) 15. Longer than a week gets split into smaller tasks."],
      ["Planners pick the size, the team agrees:", "open the task and tap Agree, or Suggest another size. Most of the team agreeing settles it. If nobody objects within a day, it counts as agreed."],
      ["You earn the points", "once the task is done and a planner has checked it. People on the same task share its points."],
      ["Money by points:", `after costs, the finder's fee (by how the client came: 8%, 18%, 4% or 8%) and the team fund (${R.fundPct}%), the rest is shared by points. Everything that came in is split by the points done so far, so everyone always has their fair part.`]]),
    card("\u{1F4B5}", "Your money", [
      ["Task prices:", "when a project shares money by task prices, a task shows 💵 and what you get (≈). You earn it once the task is ticked done and the client has paid for it."],
      ["Not every task has a price.", "The part that isn't priced is shared by the team, by % or equally."],
      ["Order of the money:", `costs you paid are paid back first, then a partner's commission, then the team fund (${R.fundPct}%), then the finder's fee (${R.findPct}%), then the team.`],
      ["The Money tab", "shows what you're owed, what was handed to you, and every deal. Read and agree to the money rules there once."],
      ["Paid for something yourself?", "Ask a planner to add it as a cost with your name: it's paid back before anything is split."],
      ["Kept in the fund:", "some projects keep their money in the team fund until the team decides how to split it. It's written as that project's money, so nothing gets lost; you'll see it under Money › Fund & goals."]]),
    card("⚡", "Shortcuts", [
      ["Ctrl K or ⌘ K", "searches everything: tasks, projects, chat, notes."],
      ["✦ Assistant:", "tell it what you did (“I finished the logo, here's the link”) and it offers to tick the task and leave the note for you. Write in English, Arabic or Franco. Nothing happens until you tap Do it, and you can undo."],
      ["⚡ Send to AI:", "stuck on a task? Open it and tap Send to AI to solve, and the assistant gives you steps to get it done. A small pop-up also offers help when a task is late, urgent or blocked."],
      ["Weekly check-in", "(Week tab) takes a minute: what you did, what's next, what's blocking you. Blockers alert the team."],
      ["Alerts on your phone:", "Settings › Alerts. Install the site as an app from Settings › Install the app."],
      ["Something looks old?", "Settings › Help and fixes › Reload."],
      ["Found a bug, or an idea to make work easier?", "⋯ › Bugs and ideas. Write what happened and the creators get an alert; you hear back when it's fixed."],
      ["Your idea won the vote?", "Only the person who pitched it confirms it to Projects. Everyone who voted Keep joins its team, no invite needed."]]));
  if (tab === "planners") wrap.append(
    card("\u{1F9ED}", "Your job as a planner", [
      "You're always on the project's team. You shape the plan, the tasks and the money, and you decide who joins.",
      ["Join requests", "show at the top of the project and in your alerts. Accept or say no."],
      ["Invite people:", "Settings › People › + Invite someone. They join once they accept. Only the team can be given tasks."],
      ["Taking someone off the team", "frees their open tasks so they can go to someone else."]]),
    card("\u{1F5C2}️", "Planning fast", [
      ["Import plan:", "plan with the assistant or Claude, paste the text, and every phase and task is added at once."],
      ["Suggest who does what", "gives open tasks to people by their skills and how busy they are. You check it before it saves."],
      ["Meetings › Make tasks from these notes", "turns the lines of your meeting notes into tasks, guessing who from the names."],
      ["Waiting for:", "link tasks that need another one first, so people know what they can start now."],
      ["Pause a phase:", "Edit phases › ⏸ Pause puts that phase's tasks on hold (no reminders, out of people's to-do lists). Tap Resume on the phase whenever you're ready to continue."],
      ["Set a weekly goal", "on the Week tab: one clear thing everyone pushes for."]]),
    card("\u{1F4B0}", "Setting up the money", [
      ["1. Set up the money:", "on a project's Money tab, answer three questions: what the client agreed to pay, how they'll pay it, and how we share it. Everything else (currency, who brought the client, a partner, the team fund %) is in Edit deal › More options."],
      ["2. How the team's money is shared:", "By points (our way now: every task has a size and the money follows the points), by task prices or by % shares. With points, set How the client came in Edit deal › More options, so the finder's fee is right."],
      ["Sizing tasks:", "give every task a size when you add it, or open it and pick S, M, L or XL. The team is asked to agree. When someone suggests another size, you see it on the task with a Change button."],
      ["3. Payment plan:", "split the price into a deposit and the rest, and link the tasks each payment pays for. The plan tells you when it's time to ask the client for the next payment."],
      ["Which tasks finish which money?", "When a deal is in phases, tap Edit phases on the Tasks tab and pick the money phase each task phase finishes. The Tasks tab then shows each money phase with its task phases, and the Money tab knows when to ask for the final payment."],
      ["Client working step by step?", "Split the deal into phases (Money tab › Payment plan). Each money phase has its own price, deposit and final payment. Money phases are separate from task phases: tick the task phases a money phase pays for (one, several or none). When a phase is done and paid, tap + Add the next phase. A phase that's only offered stays Not agreed yet until you tap The client agreed."],
      ["4. Task prices (Money tab, open Task prices):", "give tasks their part of the price. You don't need to price everything: Spread over the rest fills the tasks without a price for you, then fix any by hand. What isn't priced is shared by the team."],
      ["Not sure yet?", "choose Keep it in the fund, decide later. Record payments as they come (say how you got them and pick The team fund under Who has it). When the team agrees, tap Decide the split: it shows what each way would give before you choose."],
      ["5. When money comes in, tap + Money in:", "type the amount, tap what it's for, how they paid and who has it, and attach our quotation and the signed one, or a receipt (each has its own slot). Use + We spent money for costs. You can add files to a payment later from the History list. Mark paid when you hand someone their money, so their balance is right."],
      ["Every change is logged", "on the Money tab, and the team gets an alert when the deal changes."],
      ["Made a test deal, or it fell through?", "Edit deal › Delete the deal, at the bottom. The tasks stay."]]),
    card("\u{1F91D}", "Client and partners", [
      ["Client tab › Client page:", "three steps at the top (add the client's email, check what they see, send the link on WhatsApp), then one line per part of their page with an on/off switch and Change. The live preview next to it is exactly what the client sees. It follows the project by itself: name, progress, stages, payments. Pick which parts of the work they see, and use \u201cUse our next task\u201d to fill the next step."],
      ["Partner tasks:", "give partners on this project their own small tasks; they tick them in their portal."]]));
  if (tab === "creators" && creator) wrap.append(
    card("\u{1F6E0}️", "What creators do", [
      `Creators change Pitch Room itself: new features, fixes and design. The team asks in Settings › Build Pitch Room; tap I'll build it so nobody does it twice, then It's live when it's out.`,
      ["Get the code:", `accept the GitHub invite, then open Claude Code on the ${REPO.split("/")[1]} repository and describe the change in plain words.`],
      ["Ship it:", "ask Claude to run build.py and push to main. The live site updates in a couple of minutes."]]),
    card("\u{1F4C1}", "Where things live", [
      ["src/app.js", "is most of the site; src/page.html is the layout and styles."],
      ["src/money-engine.js", "is all the money maths (costs, partner, fund, finder, shares, task prices). Test changes to it with a few sample deals: the numbers must always add up to what came in."],
      ["partners.js, clients.js, push.js", "are the partner portal, the client portal and phone alerts."],
      ["Never edit index.html by hand:", "build.py makes it from the src folder."]]),
    card("\u{1F6E1}️", "The rules that keep things safe", [
      ["firestore.rules", `decides who can change what in the database: money only by planners, project work only by the project's team, partners and clients only their own things. build.py copies it into the site, so edit only that file.`],
      ["New rules need publishing:", `tell ${ADMIN_NAME} after changing firestore.rules; only he can publish them in Firebase.`],
      ["Project teams:", "when you add a new way to change a project, check it with inTeam(p) (on the team) and canPlan(p) (planner), and say why in plain words when someone can't."],
      ["Keep the words simple.", "Short sentences, no jargon, and say what happens next. Add a What's new entry for anything people should know about."]]));
  return wrap;
}

// Where someone was before opening Bugs and ideas, so a bug report says which page it's about
function upWhere() {
  const h = (prevHash || "").replace(/^#/, ""); if (!h || h.startsWith("settings")) return "";
  const pr = h.match(/^(?:project|plan|build|task)-([^-]+)/), pj = pr ? ideas.find(i => i.id === pr[1]) : null;
  return pj ? `Project: ${pj.title}` + (projTab && projTab !== "tasks" ? ` › ${{ money: "Money", share: "Client", week: "Week", meet: "Meetings" }[projTab] || projTab}` : "") : ({ me: "Me", ideas: "Ideas", projects: "Projects", chat: "Chat", money: "Money", partners: "Partners", skills: "Skills" }[h.split("-")[0]] || h);
}
// The team's bugs and ideas for Pitch Room itself. Everyone can add; creators pick them up.
function upgradeRequestsCard() {
  const card = (...kids) => el("section", { class: "idea", style: "gap:10px" }, ...kids.filter(Boolean));
  const creator = amCreator();
  const items = upgradeList();
  const ta = el("textarea", { id: "up-text", class: "noteinput", rows: "2", maxlength: "600", placeholder: upKind === "fix" ? "What went wrong? What did you tap, and what happened? e.g. The Save button on Money in does nothing on my phone" : upKind === "easier" ? "What takes too long or too many taps? e.g. Let me tick a task straight from the alert" : "What should Pitch Room do? e.g. Let us add files to meeting notes" });
  const add = () => {
    const text = ta.value.trim(); if (!text) { ta.focus(); return }
    ta.value = "";
    saveUpgrade(uid(), { text, kind: upKind, status: "asked", by: me, at: Date.now(), where: upWhere() }, "Sent. The creators get an alert");
  };
  const box = card(el("div", { class: "row" }, el("h3", {}, "Bugs and ideas"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${items.filter(x => x.status !== "done").length} open`)),
    el("div", { class: "seg seg-wide", role: "group", "aria-label": "Kind of request" }, Object.entries(UP_KINDS).map(([k, l]) => el("button", { "aria-pressed": String(upKind === k), onclick: () => { upKind = k; render() } }, l))),
    ta, el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: add }, "Send to the creators")));
  if (!items.length) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "No requests yet."));
  for (const x of items) {
    const st = x.status || "asked";
    const acts = [];
    if (creator && st === "asked") acts.push(el("button", { class: "btn small", onclick: () => saveUpgrade(x.id, { status: "doing", doer: me, startedAt: Date.now() }, "It's yours. Tell the team when it's live") }, "I'll build it"));
    if (creator && st === "doing") acts.push(el("button", { class: "btn small primary", onclick: () => saveUpgrade(x.id, { status: "done", doneBy: me, doneAt: Date.now() }, "Marked done") }, "It's live"));
    if (creator && st !== "asked") acts.push(el("button", { class: "linkbtn", onclick: () => saveUpgrade(x.id, { status: "asked", doer: DEL(), doneBy: DEL(), doneAt: DEL() }, "Back to asked") }, st === "done" ? "Reopen" : "Let it go"));
    if (x.by === me || isAdmin) acts.push(delUpgrade === x.id
      ? el("button", { class: "linkdel sure", onclick: () => { delUpgrade = null; write(() => setDoc(doc(db, "meta", "upgrades"), { items: { [x.id]: DEL() } }, { merge: true }), "Request removed") } }, "Remove?")
      : el("button", { class: "linkdel", "aria-label": "Remove request", onclick: () => { delUpgrade = x.id; render() } }, "✕"));
    box.append(el("div", { class: "teamrow", style: "align-items:flex-start;flex-wrap:wrap" + (st === "done" ? ";opacity:.65" : "") },
      el("div", { style: "flex:1 1 240px;min-width:0;display:grid;gap:3px" },
        el("span", { style: "font-size:14.5px;white-space:pre-wrap;overflow-wrap:anywhere" + (st === "done" ? ";text-decoration:line-through" : "") }, x.text),
        el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, [UP_KINDS[x.kind] || "Request", (x.by === me ? "you" : name(x.by)) + " · " + ago(x.at), x.where ? "on " + x.where : null,
          st === "doing" ? "being built by " + (x.doer === me ? "you" : name(x.doer)) : st === "done" ? "live" + (x.doneBy ? ", built by " + (x.doneBy === me ? "you" : name(x.doneBy)) : "") : null].filter(Boolean).join(" · "))),
      el("span", { class: st === "done" ? "done-badge" : "chip" }, UP_STATUS[st] || st),
      acts.length ? el("span", { class: "row", style: "gap:6px" }, ...acts) : null));
  }
  return box;
}

/* ----- settings: a home page of grouped rows (like a phone's Settings app), each opening its own page ----- */
let setQuery = "";
const SET_PAGES = { feedback: "Bugs and ideas", guide: "How Pitch Room works", build: "Build Pitch Room", profile: "Profile", appearance: "Appearance", language: "Assistant language", alerts: "Alerts", news: "What's new", access: "People and access", nicknames: "Nicknames", rules: "Database rules", backup: "Backup", install: "Install the app", help: "Help and fixes" };
function setIcon(sym, color) { return el("span", { class: "seticon", style: `background:${color}` }, sym) }
function renderSettings() {
  const box = $("#settings"); box.replaceChildren();
  const sub = route().sub || "", prof = people[me] || {};
  if (sub && SET_PAGES[sub]) return settingsPage(box, sub, prof);
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Settings"));
  const q = el("input", { id: "set-search", class: "noteinput setsearch", type: "search", placeholder: "Search settings", autocomplete: "off", value: setQuery,
    oninput: e => { setQuery = e.target.value; filterSet() } });
  box.append(q);
  // profile card on top
  box.append(el("button", { class: "setprofile", onclick: () => { location.hash = "settings-profile" } },
    el("img", { class: "av", src: prof.pic || (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
    el("span", { class: "who-n" }, el("b", {}, realName(me) || (myProfile && myProfile.name) || ""), el("span", { class: "label" }, ((myProfile && myProfile.email) || "") + " · Photo, name")), el("span", { class: "chev2" }, "›")));
  const ver = rulesNow().version || 1, agreed = ((prof.moneyAgreed || {}).version === ver), perm = "Notification" in window ? Notification.permission : "unsupported";
  const themeName = (THEMES.find(t => t[0] === getTheme()) || [, "Dark"])[1];
  const row = (sym, color, title, value, go, keys, danger) => el("button", { class: "setrowbtn" + (danger ? " danger" : ""), "data-k": (title + " " + (keys || "")).toLowerCase(), onclick: go },
    sym ? setIcon(sym, color) : null, el("span", { class: "setrow-name" }, title), value != null ? el("span", { class: "setrow-val" }, value) : null, danger ? null : el("span", { class: "chev2" }, "›"));
  const group = (title, ...rows) => el("section", { class: "setgroup" }, title ? el("div", { class: "setgroup-h" }, title) : null, el("div", { class: "setlist" }, ...rows.filter(Boolean)));
  const goto = k => () => { location.hash = "settings-" + k };
  const partners = pMembers.length, teamN = teamEmails().length || teamIds().length;
  box.append(
    group("Preferences",
      row("\u{1F3A8}", "#7C5CD6", "Appearance", themeName + (getMeteors() ? "" : " · still"), goto("appearance"), "theme dark light pine animation look"),
      row("\u{1F514}", "#E2574C", "Alerts", pushOn && perm === "granted" ? "On" : "Off", goto("alerts"), "notifications push sound phone"),
      row("\u{1F310}", "#2F80ED", "Assistant language", (ASST_LANGS.find(l => l[0] === asstLang()) || [])[1], goto("language"), "assistant ai english arabic franco language"),
      row("✦", "#0D5E63", "What's new", (prof.newsOff ? "Off" : "On"), goto("news"), "updates news post")),
    group("Team",
      isAdmin ? row("\u{1F465}", "#2F80ED", "People and access", `${teamN} team · ${partners} partners`, goto("access"), "add member partner client email invite remove") : null,
      row("\u{1F6E0}️", "#0D5E63", "Build Pitch Room", (() => { const n = upgradeList().filter(x => x.status !== "done").length; return (amCreator() && !isAdmin ? "You're a creator · " : "") + (n ? `${n} request${n > 1 ? "s" : ""}` : "Ask for an upgrade") })(), goto("build"), "creator creators upgrade feature fix bug request code github developer edit site"),
      row("\u{1F3F7}️", "#F2994A", "Nicknames", String(Object.keys(nicks).length || "None"), goto("nicknames"), "names"),
      row("⭐", "#E0B12E", "Skills", topSkills(me).map(s => SKILLS[s].name).join(", ") || "Take the quiz", () => { location.hash = "skills" }, "quiz strengths"),
      row("\u{1F4B0}", "#27AE60", "Money rules", agreed ? `Version ${ver} · agreed ✓` : `Version ${ver} · please agree`, () => { moneyTab = "rules"; location.hash = "money" }, "fund finder shares agreement")),
    isAdmin ? group("Admin",
      row("\u{1F6E1}️", "#4F5B66", "Database rules", prof.rulesPublished === RULES_VERSION ? "Up to date" : "● Publish new rules", goto("rules"), "firebase security"),
      row("\u{1F4BE}", "#56CCF2", "Backup", prof.lastBackup ? "Last: " + fmtDay(prof.lastBackup) : "Never", goto("backup"), "download export"),
      row("\u{1F4E1}", "#9B51E0", "Alert server", pushServerState === "ok" ? "Working" : pushBase() ? "Check" : "Not set up", goto("alerts"), "push cloudflare worker")) : null,
    group("Help",
      row("\u{1F41E}", "#D9534F", "Bugs and ideas", (() => { const n = upgradeList().filter(x => x.status !== "done").length; return n ? `${n} open` : "Tell the creators" })(), goto("feedback"), "bug broken problem idea suggestion feature request improve"),
      row("\u{1F4D6}", "#0D5E63", "How Pitch Room works", "Tips for everyone", goto("guide"), "guide help tips how to planner creator team join money task price"),
      row("\u{1F4F2}", "#219653", "Install the app", isHomeScreenApp() ? "Installed" : "", goto("install"), "home screen dock desktop"),
      row("\u{1F6DF}", "#EB5757", "Help and fixes", "", goto("help"), "reload refresh problem support version"),
      row("\u{1F517}", "#2D9CDB", "Share the site link", "Copy", () => copyText(SITE_LINK, "Link copied"), "url")),
    group(null, row(null, null, "Sign out", null, doSignOut, "log out account", true)),
    el("p", { class: "label setfoot" }, "Pitch Room · Ardent Creative Studios" + (typeof BUILD_ID !== "undefined" ? " · " + BUILD_ID.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).*/, "$3/$2/$1 $4:$5") : "")));
  filterSet();
  function filterSet() {
    const v = setQuery.trim().toLowerCase();
    box.querySelectorAll(".setrowbtn").forEach(b => { b.hidden = !!v && !b.dataset.k.includes(v) });
    box.querySelectorAll(".setgroup").forEach(g => { g.hidden = !!v && !g.querySelector(".setrowbtn:not([hidden])") });
    const p = box.querySelector(".setprofile"); if (p) p.hidden = !!v && !"profile photo name account email".includes(v);
  }
}
function settingsPage(box, sub, prof) {
  box.append(el("button", { class: "back", onclick: () => { location.hash = "settings" } }, "‹ Settings"), el("h2", { class: "sec-h", style: "margin-top:0" }, SET_PAGES[sub]));
  const item = (title, s, ...ctrl) => el("div", { class: "setrow" }, el("div", { class: "setrow-t" }, el("b", {}, title), s ? el("span", {}, s) : null), el("div", { class: "setrow-c" }, ...ctrl));
  const card = (...kids) => el("div", { class: "idea", style: "gap:0" }, ...kids.filter(Boolean));
  if (sub === "profile") {
    const nick = el("input", { id: "set-name", class: "noteinput", maxlength: "40", placeholder: (myProfile && myProfile.name) || "Your name" });
    if (!nick.value) nick.value = prof.nick || "";
    const saveName = () => { const v = nick.value.trim(); write(() => setDoc(doc(db, "users", me), { nick: v }, { merge: true }), v ? "Name saved" : "Using your Google name again") };
    nick.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveName() } });
    box.append(card(
      el("div", { class: "setrow" }, el("img", { class: "av av-lg", src: prof.pic || (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
        el("div", { class: "setrow-t" }, el("b", {}, realName(me) || ""), el("span", {}, (myProfile && myProfile.email) || "")),
        el("div", { class: "setrow-c" }, el("button", { class: "btn small", onclick: pickProfilePhoto }, "Change photo"),
          prof.pic ? el("button", { class: "btn quiet small", onclick: () => write(() => setDoc(doc(db, "users", me), { pic: DEL() }, { merge: true }), "Back to your Google photo") }, "Use Google photo") : null)),
      item("Name the team sees", "Leave it empty to use your Google name.", el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, nick, el("button", { class: "btn primary", onclick: saveName }, "Save"))),
      item("Signed in with Google", (myProfile && myProfile.email) || "", el("button", { class: "btn small", onclick: doSignOut }, "Sign out"))));
  }
  if (sub === "appearance") {
    const theme = getTheme(), meteors = getMeteors();
    const setLook = (t, m) => { applyLook(t, m); render(); write(() => setDoc(doc(db, "users", me), { theme: t, meteors: m }, { merge: true })) };
    box.append(card(
      item("Theme", "Saved to your account, so every device matches.", el("div", { class: "seg", role: "group", "aria-label": "Theme" }, THEMES.map(([v, l]) => el("button", { "aria-pressed": String(theme === v), onclick: () => setLook(v, meteors) }, l === "Match my device" ? "Auto" : l)))),
      item("Background animation", "The slow moving map behind the page.", el("div", { class: "seg seg-sm", role: "group", "aria-label": "Background animation" },
        el("button", { "aria-pressed": String(meteors), onclick: () => setLook(theme, true) }, "On"), el("button", { "aria-pressed": String(!meteors), onclick: () => setLook(theme, false) }, "Off")))));
  }
  if (sub === "language") box.append(card(item("The assistant answers in", "Saved to your account, so every device matches. It understands English, Arabic and Franco whichever you pick."),
    el("div", { class: "langlist" }, ASST_LANGS.map(([v, l, d]) => el("button", { class: "langopt", "aria-pressed": String(asstLang() === v), onclick: () => setAsstLang(v) }, el("b", {}, l), el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, d))))));
  if (sub === "alerts") box.append(pushSettings());
  if (sub === "news") box.append(newsSettings());
  if (sub === "build") box.append(buildPage());
  if (sub === "access") box.append(isAdmin ? accessSection() : el("div", { class: "empty" }, `Only ${ADMIN_NAME} manages who can sign in.`));
  if (sub === "nicknames") {
    const crew = Object.entries(people).filter(([id, x]) => x && x.name && isTeamUid(id)).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
    box.append(el("p", { class: "lede", style: "margin:0 0 12px" }, "Give anyone on the team a nickname. Everyone on the team sees it instead of their name. Leave it empty to remove it."),
      card(el("div", { class: "nicklist" }, crew.map(([id, x]) => {
        const inp = el("input", { class: "noteinput", maxlength: "30", placeholder: x.nick || x.name, "aria-label": "Nickname for " + x.name, value: nicks[id] || "" });
        const save = () => { const v = inp.value.trim(); if (v === (nicks[id] || "")) return; write(() => setDoc(doc(db, "meta", "nicks"), { [id]: v ? v.slice(0, 30) : DEL() }, { merge: true }), v ? `${x.name.split(" ")[0]} is now “${v}”` : "Nickname removed") };
        inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save() } });
        return el("div", { class: "nickrow" }, el("img", { class: "av", src: x.pic || x.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
          el("span", { class: "nickname-real" }, id === me ? x.name + " (you)" : x.name), inp, el("button", { class: "btn small", onclick: save }, "Save"));
      }))));
  }
  if (sub === "rules" && isAdmin) box.append(el("p", { class: "lede", style: "margin:0 0 12px" }, "What the database itself allows: who can see and change what. Publish them again whenever they change."),
    card(item(((prof.rulesPublished === RULES_VERSION) ? "✓ Up to date" : "New rules to publish") + ` (version ${RULES_VERSION})`, "Protects money and the fund so only you and each project's planners can change them, and lets partners into private chats.",
      el("button", { class: "btn small", onclick: () => copyText(PARTNER_RULES, "Rules copied. Paste them in Firebase, then Publish") }, "1. Copy rules"),
      el("a", { class: "btn small", href: "https://console.firebase.google.com/project/the-office-ab723/firestore/rules", target: "_blank", rel: "noopener noreferrer" }, "2. Open Firebase"),
      prof.rulesPublished === RULES_VERSION ? null : el("button", { class: "btn small primary", onclick: () => write(() => setDoc(doc(db, "users", me), { rulesPublished: RULES_VERSION }, { merge: true }), "Thanks. Marked as published") }, "3. I published them")),
      item("How", "In Firebase: delete everything in the Rules box, paste, then press Publish.", null)));
  if (sub === "backup" && isAdmin) box.append(card(item("Download a backup", "Everything on the board in one file: projects, tasks, money, chat, partners and clients. Keep it in Google Drive. Do it once a month." + (prof.lastBackup ? " Last one: " + fmtDay(prof.lastBackup) + "." : ""),
    el("button", { class: "btn small primary", onclick: downloadBackup }, "Download"))));
  if (sub === "guide") box.append(guidePage());
  if (sub === "feedback") box.append(el("p", { class: "lede", style: "margin:0 0 12px" }, `Something broken, or an idea that would make work easier? Write it here. The creators (${[...new Set([...ADMINS, ...Object.keys(creatorsMap())])].map(e => { const u = uidOfEmail(e); return u ? (u === me ? "you" : firstName(u)) : e.split("@")[0] }).join(", ")}) get an alert and pick it up.`), upgradeRequestsCard());
  if (sub === "install") { const g = installGuide(); g.open = true; box.append(card(g)) }
  if (sub === "help") {
    const adminId = Object.entries(people).find(([, x]) => ADMINS.includes((x.email || "").toLowerCase()));
    box.append(card(
      item("Get the latest version", "If a new feature isn't showing up.", el("button", { class: "btn small", onclick: () => location.replace(location.pathname + "?v=" + Date.now() + location.hash) }, "Reload")),
      item("Refresh this device", "If something looks wrong or out of date. Your work is safe: it's all saved online.", el("button", { class: "btn small", onclick: () => { clearCache(); location.replace(location.pathname + "?v=" + Date.now() + "#me") } }, "Refresh")),
      item("Alerts not working?", "Step-by-step fixes for every device.", el("button", { class: "btn small", onclick: () => { location.hash = "settings-alerts" } }, "Open")),
      item("Search everything", "Tasks, projects, chat, numbers, notes. Ctrl K or ⌘ K anywhere.", el("button", { class: "btn small", onclick: () => { searchOpen = true; render() } }, "Search")),
      adminId && adminId[0] !== me ? item("Still stuck?", `Message ${ADMIN_NAME} privately.`, el("button", { class: "btn small", onclick: () => { location.hash = "dm-" + adminId[0] } }, "Message")) : null,
      item("Version", typeof BUILD_ID !== "undefined" ? BUILD_ID : "", null)));
  }
}

/* ----- the ⋯ menu in the top bar: quick way to everything that isn't a tab ----- */
let moreOpen = false;
function renderMore() {
  const box = $("#more"); if (!box) return;
  box.hidden = !moreOpen; if (!moreOpen) return;
  box.replaceChildren();
  const prof = people[me] || {}, go = h => () => { moreOpen = false; location.hash = h; render() };
  const item = (sym, label, fn, danger) => el("button", { class: "moreitem" + (danger ? " danger" : ""), onclick: fn }, el("span", { class: "moreico" }, sym), label);
  box.append(
    el("button", { class: "morehead", onclick: go("me") }, el("img", { class: "av", src: prof.pic || (myProfile && myProfile.photo) || prof.photo || AV, alt: "", referrerpolicy: "no-referrer" }),
      el("span", { class: "who-n" }, el("b", {}, realName(me) || (myProfile && myProfile.name) || ""), el("span", { class: "label" }, (myProfile && myProfile.email) || ""))),
    item("⚙️", "Settings", go("settings")),
    item("\u{1F4B0}", "Money", () => { moneyTab = "overview"; go("money")() }),
    item("\u{1F50D}", "Search", () => { moreOpen = false; searchOpen = true; render() }),
    item("⭐", "Skills and team", go("skills")),
    item("\u{1F4F2}", "Install the app", go("settings-install")),
    item("\u{1F41E}", "Bugs and ideas", go("settings-feedback")),
    item("\u{1F4D6}", "How Pitch Room works", go("settings-guide")),
    item("\u{1F6DF}", "Help and fixes", go("settings-help")),
    el("div", { class: "morediv" }),
    item("↪️", "Sign out", () => { moreOpen = false; doSignOut() }, true));
}
$("#more-btn").onclick = e => { e.stopPropagation(); moreOpen = !moreOpen; alertsOpen = false; searchOpen = false; render() };
document.addEventListener("click", e => { if (moreOpen && !e.target.closest("#more") && !e.target.closest("#more-btn")) { moreOpen = false; render() } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && moreOpen) { moreOpen = false; render() } });

/* ----- assistant (Gemini through Firebase AI Logic) -----
   Fast streaming responses, native Egyptian Franco support, role-based app control,
   and instant "Solve with AI" triggers for hard tasks and app-wide problems. */

const AI_SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
// Gemini models on the free Gemini Developer API, tried in this order; the site remembers which one worked last.
const AI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
let asstOpen = false, asstBusy = false, asstMsgs = [], aiP = null, checkinDraft = null, asstStatus = "";

function loadAI() {
  if (!aiP) aiP = (async () => {
    const [appM, aiM] = await Promise.all([import(AI_SDK + "firebase-app.js"), import(AI_SDK + "firebase-ai.js")]);
    const app = appM.getApps().find(a => a.name === "assistant") || appM.initializeApp(firebaseConfig, "assistant");
    return { aiM, ai: aiM.getAI(app, { backend: new aiM.GoogleAIBackend() }) };
  })().catch(e => { aiP = null; throw e });
  return aiP;
}

async function askAIStream(prompt, system, onChunk) {
  const { aiM, ai } = await loadAI();
  let good = ""; try { good = localStorage.getItem("aiModel") || "" } catch { }
  const order = [...new Set([good, ...AI_MODELS].filter(m => AI_MODELS.includes(m)))];
  let last;
  for (let round = 0; round < 2; round++) {
    if (round) { asstStatus = "Google's AI is busy. Trying again\u2026"; render(); await new Promise(r => setTimeout(r, 1500)) }
    for (const m of order) {
      try {
        const model = aiM.getGenerativeModel(ai, {
          model: m,
          systemInstruction: system,
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
        });
        const res = await model.generateContentStream(prompt);
        let full = "";
        for await (const chunk of res.stream) {
          const part = chunk.text();
          if (part) {
            full += part;
            if (onChunk) onChunk(full);
          }
        }
        try { localStorage.setItem("aiModel", m) } catch { }
        asstStatus = "";
        return full;
      } catch (e) {
        last = e; const k = aiErrorKind(e);
        if (k !== "model" && k !== "busy" && k !== "overloaded") { asstStatus = ""; throw e }
        if (k === "model" && good === m) try { localStorage.removeItem("aiModel") } catch { }
      }
    }
  }
  asstStatus = "";
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
  if (status === 500 || status === 502 || status === 503 || status === 504 || /high demand|overloaded|UNAVAILABLE|\b50[0234]\b|try again later|INTERNAL|deadline exceeded/i.test(t)) return "overloaded";
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET|network error/i.test(t)) return "net";
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(t)) return "load";
  return "other";
}
function aiErrorText(e) {
  const k = aiErrorKind(e);
  if (k === "off") return isAdmin ? "The assistant isn't switched on yet. In Firebase, open AI Logic and turn on the Gemini Developer API." : `The assistant isn't switched on yet. Ask ${ADMIN_NAME} to turn it on.`;
  if (k === "busy") return "The free Gemini limit was reached for now. Try again in a minute (daily limits reset overnight).";
  if (k === "overloaded") return "Google's AI is very busy right now. Tap Try again in a minute.";
  if (k === "model") return "The Gemini models this site uses aren't available on your Firebase project.";
  if (k === "net") return "Couldn't reach the assistant. Check your connection and try again.";
  if (k === "load") return "The assistant couldn't load. Reload the page and try again.";
  return "Something went wrong with the assistant.";
}

// Who the assistant may change things for: the admin can change everything; everyone else only projects and ideas
// they're related to (pitched it, plan it, are on its team, or have a task in it).
function isRelatedToProject(p, uid = me) {
  if (!p || !uid) return false;
  if (uid === me && isAdmin) return true;
  return p.author === uid || plannerIds(p).includes(uid) || !!(p.members || {})[uid] || projTeam(p).includes(uid) || tasksOf(p).some(t => assignees(t).includes(uid));
}
const canModifyProject = (p, uid = me) => isRelatedToProject(p, uid);

// What the assistant is told about the board: only what it needs, never private notes.
let asstRefs = {};   // codes the assistant can use in actions: "T3" -> { pid, tid }, "P2" -> { personal }, "PRJ1" -> { pid }
// The code for one task, added to the board data if it isn't there yet (for "Send to AI" on a task).
function refFor(p, t) {
  for (const [k, v] of Object.entries(asstRefs)) if (v.tid === t.id && v.pid === p.id) return k;
  let i = Object.keys(asstRefs).length + 1; while (asstRefs["T" + i]) i++;
  asstRefs["T" + i] = { pid: p.id, tid: t.id }; return "T" + i;
}
function boardContext(p) {
  const today = new Date(), L = [];
  asstRefs = {}; let n = 0;
  const pCode = proj => { for (const [k, v] of Object.entries(asstRefs)) if (v.pid === proj.id && !v.tid) return k; const k = "PRJ" + (++n); asstRefs[k] = { pid: proj.id }; return k };
  const code = (t, pid) => { for (const [k, v] of Object.entries(asstRefs)) if (v.tid === t.id && v.pid === pid) return k; const k = "T" + (++n); asstRefs[k] = { pid, tid: t.id }; return k };
  const short = (s, len = 110) => (s || "").replace(/\s+/g, " ").slice(0, len);
  const tline = (t, proj, pid) => `- [${code(t, pid)}] ${short(t.text)}${proj ? " [" + proj + "]" : ""} | ${assignees(t).map(u => realName(u) || "someone").join(", ") || "unassigned"} | ${t.done ? "done" : inCheck(t) ? "finished, waiting for " + (t.checker === PLANNERS ? "a planner" : realName(t.checker) || "someone") + " to check" : t.status === "doing" ? "in progress" : "not started"}${t.checker && !t.done && !inCheck(t) ? " | checked by " + (t.checker === PLANNERS ? "any planner" : realName(t.checker) || "someone") + " before it counts as done" : ""}${t.due ? " | due " + t.due : ""}${t.priority && t.priority !== "medium" ? " | " + t.priority : ""}`;
  const wline = (proj, t) => { const w = waitInfo(proj, t); return w.open.length ? ` | waiting for: ${w.open.map(d => short(d.text, 40)).join(", ")}` : "" };
  L.push(`Today is ${ymd(today)} (${today.toLocaleDateString("en", { weekday: "long" })}).`);
  L.push(`Current user: ${realName(me) || "a team member"} | Role: ${isAdmin ? "ADMIN (can change every project, idea, task, money and setting)" : "TEAM MEMBER (can only change projects and ideas marked ALLOWED_TO_MODIFY)"}.`);
  L.push("Team: " + teamIds().map(u => { const s = topSkills(u).map(k => SKILLS[k].name).join(" + "), rs = rolesOf(u).map(r => r.name).join(", "), hid = ((people[u] || {}).quiz2 || {}).hidden; return realName(u) + (rs ? ` (roles: ${rs})` : "") + (s ? ` (strengths: ${s})` : "") + (hid ? ` (hidden skill: ${SKILL_WORD[hid]})` : "") }).join("; "));
  const mine = myTasks().filter(x => !x.closed);
  L.push(`\nMy tasks (${mine.filter(x => !x.t.done).length} open):`);
  mine.slice(0, 50).forEach(x => { if (x.personal) { const k = "P" + (++n); asstRefs[k] = { personal: x.t.id }; L.push(`- [${k}] ${short(x.t.text)} [private]${x.t.done ? " | done" : ""}${x.t.due ? " | due " + x.t.due : ""}`) } else L.push(tline(x.t, x.p.title, x.p.id) + ((x.t.notes && Object.keys(x.t.notes).length) ? ` | ${Object.keys(x.t.notes).length} notes` : "")) });

  // every project and idea, with whether this person may change it; open tasks of the ones they may change
  const STATUS = { voting: "idea in the vote", approved: "project", completed: "completed project" };
  L.push("\nAll projects and ideas (YOUR ACCESS says if you may change it):");
  ideas.filter(i => STATUS[i.status] && (!p || i.id !== p.id)).slice(0, 45).forEach(proj => {
    const allowed = canModifyProject(proj), related = [...new Set([proj.author, ...projTeam(proj)].map(u => realName(u)).filter(Boolean))];
    const extra = proj.status === "approved" ? (isActive(proj) ? ", being built now" : isPaused(proj) ? ", paused" : ", up next") + `, ${prioOf(proj).name} priority` : "";
    L.push(`- [${pCode(proj)}] "${proj.title}" (${STATUS[proj.status]}${extra}) | related people: ${related.join(", ") || "none"} | YOUR ACCESS: ${allowed ? "ALLOWED_TO_MODIFY" : "DENIED_NOT_RELATED"}`);
    if (allowed && proj.status === "approved") tasksOf(proj).filter(t => !t.done).slice(0, 15).forEach(t => L.push("  " + tline(t, null, proj.id) + wline(proj, t)));
  });

  if (p) {
    L.push(`\nTHE PROJECT WE'RE LOOKING AT: [${pCode(p)}] "${p.title}"${catsOf(p).length ? " (" + catsOf(p).join(", ") + ")" : ""}, ${prioOf(p).name} priority, ${p.status === "completed" ? "completed" : isActive(p) ? "being built now" : p.status === "voting" ? "an idea in the vote" : "not started yet"} | YOUR ACCESS: ${canModifyProject(p) ? "ALLOWED_TO_MODIFY" : "DENIED_NOT_RELATED"}`);
    if (p.pitch) L.push("Description: " + short(p.pitch, 500));
    if (clientOf(p)) L.push("Client: " + clientOf(p));
    const g = (p.goals || {})[weekKey()]; if (g && g.text) L.push(`This week's goal: ${g.text}${g.reached ? " (reached)" : ""}`);
    L.push("Team on this project: " + (teamOf(p).map(u => realName(u)).join(", ") || "nobody yet"));
    const phases = getPhases(p), tasks = tasksOf(p);
    if (!phases.length) L.push("It has no plan yet.");
    phases.forEach(ph => { L.push(`PHASE: ${ph.name}${ph.due ? " (finish by " + ph.due + ")" : ""}${ph.paused ? " (paused: its tasks are on hold)" : ""}`); tasks.filter(t => t.phase === ph.id).slice(0, 40).forEach(t => L.push(tline(t, null, p.id) + wline(p, t))) });
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
  if (vot.length) { L.push("\nIdeas in the vote:"); vot.slice(0, 20).forEach(i => { const { k, d } = tally(i), mv = (i.votes || {})[me]; L.push(`- ${i.title}${i.category ? " (" + i.category + ")" : ""}${i.client ? " for client " + i.client : ""}: ${k} keep, ${d} drop${mv ? "" : ", I haven't voted"} | by ${realName(i.author) || "someone"}${i.pitch ? " | " + short(i.pitch, 160) : ""}`) }) }
  // money (everyone on the team can see this on the Money page)
  try {
    const all = allMoney(), F = fundState(all);
    if (all.projects.length || F.subs.length) {
      L.push("\nMoney (EGP):");
      L.push(`- Owed to me: ${fmtEGP(all.me.balance)}. Team fund: ${fmtEGP(F.balance)} (rule: ${rulesNow().fundPct}% of profit).`);
      if (all.month.expected) L.push(`- This month: ${fmtEGP(all.month.received)} received of ${fmtEGP(all.month.expected)} expected.`);
      for (const { p: dp, r: dr } of all.projects) if (dr.planned) L.push(`- Payment plan for ${dp.title}: ` + dr.schedule.map(sc => `${sc.label} ${fmtCur(sc.expected, dr.currency)} ${sc.status === "paid" ? "paid" : sc.received ? fmtCur(sc.received, dr.currency) + " paid, " + fmtCur(sc.expected - sc.received, dr.currency) + " left" : "not paid"}${sc.tasks.length ? ` (covers ${sc.tasks.length} tasks)` : ""}${sc.covers ? ": " + short(sc.covers, 60) : ""}`).join("; "));
      all.late.slice(0, 10).forEach(({ p: lp, s: ls }) => L.push(`- LATE: ${lp.title}${(lp.money || {}).client ? " (" + lp.money.client + ")" : ""}: ${ls.label} ${fmtEGP(ls.expected - ls.received)}`));
      F.subs.slice(0, 8).forEach(sb => L.push(`- Subscription ${sb.name}: ${sb.amount} EGP, next due ${sb.nextDue || "?"}`));
      F.goals.slice(0, 5).forEach(g => L.push(`- Goal ${g.name}: target ${g.target} EGP`));
    }
  } catch { }
  return L.join("\n");
}

// Is this message Egyptian Arabic typed in English letters (Franco)? Clear Franco words count 2, words that could
// also be English or a name count 1, and words with Arabic-sound numbers in them (3ayez, 7elw, 2ally) count 2.
const FRANCO_STRONG = new Set(("msh mesh mish mosh ezay ezzay izay ezayak ezayek izayak keda kda kdh 3ashan 3shan 3lshan 3ayez 3ayza 3ayz 3yz 3yza 3ayzen " +
  "delwa2ty dlw2ty dlwa2ty delwa2ti lessa lesa ba3den ba3d ba3dein bokra embare7 enaharda nharda nhrda ma3lesh m3lsh maalesh mafeesh mafesh mafish " +
  "5alas 5las khalas yalla yallah yla aywa aiwa la2 la2a tayeb tyb tamam tmam tmm mashy mashi mshy awy 2awy awi kaman kman bardo bardu barda " +
  "fen feen fein leh leeh 3amel 3amla 3amlin 3amalt 3amlt 3mlt e3mel e3ml a3mel ha3mel hn3ml ab3at eb3at hab3at ba3at 2ol 2oly 2olly 2olli 2ally 2alli 2oltlak " +
  "ya3ni y3ni ya3nee wallahi walahi wallah 3la 3al 3ala 3aleh 3aleha 3andak 3andek 3andi 3ndy 3ndk bta3 beta3 bta3t beta3t bta3ty bta3y beta3y " +
  "7aga 7agat 7elw 7lw 7ad 7aseb 5od 5ali 5aly sa7 sa7 m3ak ma3ak m3aya ma3aya ezay ehna e7na homa howa heya enti ento entu enta " +
  "momken mumkin bgd begad begd fash5 gamed gamda 3ash nafs 7abibi 7abiby habibi sha8al shaghal sha8ala betshta8al bysht8l " +
  "eih eah ehh 3arfa 3aref 3rf a3raf ta3raf t3raf t3ml ta3mel bey3mel ba3mel hayb2a hyb2a ba2a b2a ba2et wala walla").split(" "));
const FRANCO_WEAK = new Set("da di dah dy eh ana fe fi w el ya bas".split(" "));
const FRANCO_NOT = /^(?:\d+(?:st|nd|rd|th|d|k|s|x|g|gb|mb|kb|px|am|pm|h)|b2b|b2c|mp3|mp4|h264|h265|p2p|w3c|y2k|3d|2d|4k|8k|5g|4g|3g|2fa|g2|a2z|i18n|l10n|covid19)$/;
function isFrancoArabic(text) {
  const s = String(text || "").toLowerCase();
  if (!s || /[؀-ۿ]/.test(s)) return false;
  let score = 0;
  for (const t of s.match(/[a-z0-9']+/g) || []) {
    if (FRANCO_STRONG.has(t)) score += 2;
    else if (FRANCO_WEAK.has(t)) score += 1;
    else if (t.length >= 3 && /[a-z]/.test(t) && /[235789]/.test(t) && !FRANCO_NOT.test(t) && /(?:^|[a-z])[235789](?:[a-z]|$)/.test(t)) score += 2;
    if (score >= 2) return true;
  }
  return false;
}

// The language the assistant talks to you in. Saved to your account, so every device matches.
const ASST_LANGS = [["auto", "Same as I write", "Matches each message: English, Arabic or Franco"], ["en", "English", "Always English"], ["ar", "عربي", "Always Egyptian Arabic, in Arabic letters"], ["franco", "Franco", "Always Egyptian Arabic in English letters and numbers (3, 7, 2…)"]];
const asstLang = () => { const v = (people[me] || {}).asstLang; return ASST_LANGS.some(l => l[0] === v) ? v : "auto" };
function setAsstLang(v) {
  if (v === asstLang()) return;
  people[me] = { ...(people[me] || {}), asstLang: v }; render();   // show it straight away
  const name = (ASST_LANGS.find(l => l[0] === v) || [])[1];
  write(() => setDoc(doc(db, "users", me), { asstLang: v }, { merge: true }), v === "auto" ? "The assistant will answer the way you write" : `The assistant will answer in ${name}`);
}
function languageLine(userText) {
  const keep = " Keep ACTION:, PHASE: and IDEA: lines in their exact English format.\n\n", l = asstLang();
  if (l === "en") return "LANGUAGE FOR THIS TURN: The user chose ENGLISH. Reply only in English, even if they write in Arabic or Franco (you still understand those)." + keep;
  if (l === "ar") return "LANGUAGE FOR THIS TURN: The user chose ARABIC. Reply only in spoken Egyptian Arabic (3ammeya) in Arabic letters, as described in HOW EGYPTIANS TALK AND TYPE, even if they write in English or Franco. Names of people, projects and tasks can stay as they are on the board." + keep;
  if (l === "franco") return "LANGUAGE FOR THIS TURN: The user chose FRANCO. Reply only in real Egyptian Franco, exactly as described in HOW EGYPTIANS TALK AND TYPE, even if they write in English or Arabic letters." + keep;
  return (isFrancoArabic(userText) ? "LANGUAGE FOR THIS TURN: The user wrote in Egyptian Franco. Reply in real Egyptian Franco, as described in HOW EGYPTIANS TALK AND TYPE."
    : /[\u0600-\u06ff]/.test(userText) ? "LANGUAGE FOR THIS TURN: The user wrote in Arabic letters. Reply in spoken Egyptian Arabic (3ammeya), as described in HOW EGYPTIANS TALK AND TYPE."
    : "LANGUAGE FOR THIS TURN: Reply in the user's language and style.") + keep;
}

const ASSISTANT_RULES = `You are the fast assistant inside "Pitch Room", where a small team of friends in Egypt pitch ideas and turn them into real projects that build experience and make money.
Be direct, practical and short. Use people's first names. Base everything on the BOARD DATA; if something isn't on the board, say so instead of guessing. Never claim a task is done unless the board says so.
Plain text only: no markdown headings, no bold, no tables. Short lines and simple dashes are fine.

LANGUAGE (IMPORTANT)
You fully understand Egyptian Arabic written in Franco/Arabizi (with numbers like 2, 3, 5, 7, 8, 9), Egyptian Arabic script, and English. Each person picks the language you answer in, and the "LANGUAGE FOR THIS TURN" line tells you which: always follow it. If they picked "same as I write", answer in the same script and language as their latest message: Franco gets natural Egyptian Franco, Arabic script gets Egyptian Arabic, English gets English. ACTION:, PHASE: and IDEA: lines always stay in this exact English format.

HOW EGYPTIANS TALK AND TYPE (for Franco and Arabic answers)
Sound like a friend from Cairo texting the team on WhatsApp, never like a translation or a textbook.
Franco typing:
- Arabic sounds as numbers: 2 = ء/ق (2ol, 2ally, sa2al, el2a), 3 = ع (3ayez, 3arabeya, ma3lesh), 7 = ح (7elw, 7aga, sa7), 5 = خ (5alas, 5od, 5er), 8 = غ (sha8al, 8ayar) or "gh". sh = ش, g = ج (Egyptian hard g: gamed, ge3t, ragel).
- Lowercase, short lines, light punctuation. "w" for "and", "el" for "the" (el task, el client), "f" or "fe" for "in" (fel meeting, fe el drive).
- Mix in the English work words Egyptians really use: el task, el deadline, el client, el meeting, el budget, el file, el link, el design, el post, e3mel upload, ab3atlak el link, n-update, check, done, ok, sorry.
- Verbs the Egyptian way: b- for now (ba3mel, bey3mel, bteshta8al), ha- for future (ha3mel, hab3at, haykhalas), e- for orders (e3mel, eb3at, eftah, 5alas el task).
Everyday words to use naturally: tamam, mashy, ok, aywa, la2, ah, tab, tayeb, 5alas, yalla, keda, kaman, bardo, lessa, delwa2ty, ba3den, bokra, enaharda, awy, 5ales, msh/mesh, mafeesh, fe (there is), 3ashan, leh, eh, ezay, fen, emta, meen, ya3ni, bas, ma3lesh, mesh moshkela, wala yhemak, sa7, akeed, fe3lan, begad, 7elw awy, gamed, fash5, 3ash ya [name], tamam keda, ezayak/ezayek, 3amel eh, eh el akhbar, el 7amdulelah, in shaa allah, rabena ysahel, bel tawfee2.
Calling people: use their first name, sometimes "ya [name]", or "ya basha", "ya ghaly", "ya m3allem" when friendly. Don't overdo it, and never "7abibi" in work talk.
Never use formal Arabic (fus7a) or other dialects. Say ezay not kayfa, eh not matha, leh not lima, fen not ayna, delwa2ty not al2an, kaman not aydan, kowayes not jayyed, 3ayez not urid, mesh not laysa, el task da not hatha el task. No Gulf or Levantine words (shlon, shu, hek, halla2, kteer, badde, wayed).
Gender: say 3ayez/3amel/enta to a man and 3ayza/3amla/enti to a woman. Tell from how they write about themselves (ana 3ayza = woman) or the name; if you can't tell, use the man's form.
Keep it real and short: a couple of lines, then the steps or tasks as simple dashes. Emojis only now and then (👌 🔥 💪 😂), never in every line.
Example Franco replies:
- "tamam ya Omar, 3alamt 3ala el task 5alas ✅ w sebtelhom note fiha link el drive. el gay 3andak 'el landing page', w di urgent 3ashan el client 3ayezha 2abl el 5ames."
- "la2 m2darsh a3adel fel project da, enta msh fel team beta3o. law 3ayez, dous 'Ask to join' w el planner hayewafe2 3alek."
- "msh mohem ya basha, ma3lesh 😅 el moshkela en el task di mestaneya el design. kalem Youssef y5alas el logo el awel, w ana hazawedlak step 'ab3at el logo l Omar'."
Example Arabic replies (Egyptian, not fus7a):
- "تمام يا عمر، علمت على التاسك خلاص ✅ وسبتلهم نوت فيها لينك الدرايف. اللي عليك بعد كده الـ landing page، ودي مستعجلة عشان الكلاينت عايزها قبل الخميس."
- "معلش مقدرش أعدل في المشروع ده، إنت مش في التيم بتاعه. لو عايز، دوس Ask to join والـ planner هيوافق عليك."

WHO MAY CHANGE WHAT (IMPORTANT)
- Check the current user's Role and each project's "YOUR ACCESS" flag in the BOARD DATA.
- The ADMIN may change any project, idea, task or setting.
- Everyone else may only change projects and ideas marked ALLOWED_TO_MODIFY (they pitched it, plan it, are on its team, or have a task in it).
- If someone who isn't the admin asks to change, add tasks to or delete anything in a project or idea marked DENIED_NOT_RELATED, write NO ACTION lines. Say clearly, in their language, that they aren't part of that project (see the examples under HOW EGYPTIANS TALK AND TYPE; in English: "I can't change this project because you're not on its team."), and suggest asking to join its team.

DOING THINGS FOR THEM
When they clearly say they finished, started or need something, and they're allowed to, end your reply with action lines, one per line, using the exact codes from the board (T4, P2, PRJ3):
ACTION: done | T4 | <a short note for the team with the useful details they told you, or leave it empty>
ACTION: start | T4
ACTION: note | T4 | <a note for the team>
ACTION: step | T4 | <a step to add to the task's checklist>
ACTION: due | T4 | <YYYY-MM-DD>
ACTION: edittask | T4 | <the task's new wording>
ACTION: addtask | PRJ2 | <task> | <first name of who should do it, or leave empty> | <YYYY-MM-DD or leave empty>
ACTION: mytask | <a private to-do for them> | <YYYY-MM-DD or leave empty>
ACTION: chat | <a short message to post in the team chat>
ACTION: ideapitch | <idea title> | <category> | <the pitch in two or three sentences>
Rules: only use codes that are on the board. Only tick or start tasks that are theirs (or that they plan); never tick someone else's task. If you're not sure which task they mean, ask instead of acting. Put details that help teammates (links, decisions, where files are, what's left, what the next person needs) in the note, short and in plain words. Nothing happens until they tap Do it, so say briefly what you'll do ("I'll tick X and add a note for the team"), then tell them what's next for them from the board (their next open tasks, most important first, and anything that's now unblocked).

SOLVING PROBLEMS
When a message starts with SOLVE_PROBLEM, someone is stuck on a hard task or something in the app. Straight away give a clear, practical step-by-step way through it (a fix, a message they can send, or how to split the work), using the board. Add ACTION lines (step, note, mytask or chat) when they help.

PLANS
When you suggest phases or tasks, write them ONLY in this exact format so they can be imported (one task per line):
PHASE: <phase name>
- <task> | <first name of who should do it, or leave out> | due <YYYY-MM-DD> | <urgent, high, medium or low> | skill: <Builder, Designer, Organizer, Writer, Talker, Researcher or Creator> | steps: <step one; step two>
Only use team members' real first names. Due dates must be after today and realistic for friends with school or jobs and little money. Match tasks to people's strengths and spread the work fairly.

EXPLAINING
If they ask what something means (a word, a business or tech idea, or how a part of Pitch Room works), explain it simply in a few lines with a small example from their own work when you can.
How Pitch Room works:
- Ideas: there is no Ideas page any more; ideas live in the Ideas chat (pinned at the top of Chat). Anyone pitches there with the Pitch button, each idea is a card the team votes Keep or Drop on and talks about by replying to it; an idea moves to Projects or gets removed once at least 2 people voted (the pitcher's own Keep counts, so 1 more vote is enough). Keep ahead: only the person who pitched it can confirm it to Projects, and everyone who voted Keep joins the project's team automatically; Drop ahead: it can be removed.
- Bugs and ideas (⋯ menu): anyone reports a bug or suggests what would make work easier; creators get an alert.
- Projects: Building now, Up next (vote for what's next), Paused, Completed. A planner can also pause one phase (its tasks go on hold) and resume it later. Planners (the person who pitched it, the admin and added planners) change the plan and the money.
- Project teams: each project has its own team. Planners are always on it. Others tap "Ask to join the team" and wait for a planner to accept, or a planner invites them and they accept. Someone not on the team can look and leave notes on tasks, but can't take, tick or change tasks, check in or add files. Only the team can be given tasks and get money from the project. Leaving or being taken off frees your open tasks.
- Tasks: status (not started, in progress, done), priority, due date, steps (ticking the first step starts the task), notes for the team, "waiting for" (a task can't start until another is done; finishing one tells the next person), and "checked by" (project planners check tasks: a named planner or "any planner". Ticking it sends it for the check, and it only counts as done once a planner taps Looks good; Needs changes sends it back with a note. Use this instead of separate review tasks). My tasks groups them into To check, Now, Next and Waiting on others.
- Money: for each deal, costs people paid are paid back first, then a partner's commission if a partner abroad brought the client, then the team fund % (40% now), then the finder's fee, then the shares. Deals can be in any currency; each payment saves its rate. Proposals have nothing due. One-time deals can have a payment plan (a deposit, then the rest), and each payment says which tasks it pays for. Every money change is in the project's change log. Everyone agrees to the money rules. Sharing the team's money: by % shares, or by task prices (one-time and paid-over-months deals): a task can have a price (its part of the client's price). Whoever does a priced task earns its share once the task is done and the payment that covers it is in; not every task needs a price, the unpriced part is shared by the % shares or equally by the project's team.
- Points (the team's main way now): every task has a size: S up to 2 hours = 1 point, M up to 1 day = 3, L 1 to 3 days = 8, XL 3 days to 1 week = 15 (1 point is about 2 hours; anything longer than a week is split). A planner sizes the task and the project's team agrees (Agree or Suggest another size; most of the team agreeing settles it, and silence for a day counts as agreeing). Points count once the task is done and checked; people on one task share its points. A points deal goes: costs paid back, then the finder's fee by how the client came (our lead and they closed it 8%; they found the client and closed it 18%; our lead, they set up the meeting and Ardent closed it 4%; they found the client and Ardent closed it 8%; not closed 0%; a partner abroad or team members, shared equally; on monthly deals only the setup fee and the first months), then the team fund %, then the rest by points. One-time deals: everything shared so far is split by the points done so far. Monthly deals: each month's fee by the points finished that month. When planning tasks, suggest a size for each (S, M, L or XL) and split anything longer than a week.
- Team fund: pays subscriptions and saves for goals. Goals can be added without a price, researched, then priced. If someone pays for the team from their own pocket, the fund owes it back.
- Partners: lead finders abroad in country groups. They call numbers, post updates, chat with the team and see their earnings. A number marked Client can become a project with their commission set.
- Clients: see their project's stage, progress, next step, payments and a chat with the team.
- Chat: one list of all chats: the team chat (Everyone), a chat for every project (its team is in it automatically), private chats with team members or partners, and partner groups. In a chat: @mention someone (they get an alert even if muted), voice messages, photos, files, polls, tasks made from a message (planners), pins, forward, reply (tap or swipe right), reactions, edit and delete; read ticks, typing and online; each chat's info has notification choices (every message, only @mentions, off) and the photos, files and links shared. A summary is posted in the team chat every Monday.
- Settings: the \u22EF button at the top right. Alerts setup, install as an app, appearance, help and fixes are there. Search with the magnifier or Ctrl K.`;

async function runAssistant(userText, opts = {}) {
  const p = currentProject();
  asstMsgs.push({ role: "me", text: opts.displayLabel || userText });
  const aiMsg = { role: "ai", text: "…", streaming: true };   // the reply appears in this bubble as it's written
  asstMsgs.push(aiMsg);
  asstBusy = true; render();
  const history = asstMsgs.slice(-7, -2).map(m => (m.role === "me" ? "Team member: " : "Assistant: ") + m.text).join("\n");
  const languageHint = languageLine(userText);
  const board = boardContext(p);
  // "Send to AI" on a task: give that task a code the assistant can use in its actions
  const ref = opts.focus ? refFor(opts.focus.p, opts.focus.t) : "";
  const prompt = `BOARD DATA\n${board}\n\n${history ? "EARLIER IN THIS CHAT\n" + history + "\n\n" : ""}${languageHint}REQUEST\n${(opts.prompt || userText).split("{REF}").join(ref)}`;
  try {
    const raw = await askAIStream(prompt, ASSISTANT_RULES, opts.checkin ? null : partial => {
      aiMsg.text = partial.split("\n").filter(l => !/^\s*ACTION\s*:/i.test(l)).join("\n").trim() || "…";
      const b = document.getElementById("asst-stream"), log = document.getElementById("asst-log");
      if (b) { b.textContent = aiMsg.text; b.classList.remove("typing") }
      if (log) log.scrollTop = log.scrollHeight;
    });
    delete aiMsg.streaming;
    const text = raw.trim();
    if (opts.checkin && p) {
      asstMsgs.pop();
      const j = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      checkinDraft = { pid: p.id, did: String(j.did || ""), next: String(j.next || ""), blockers: String(j.blockers || "") };
      asstMsgs.push({ role: "ai", text: "I drafted your check-in from the board. It's filled in on the project's “This week” tab. Check it, change anything, and tap Save." });
      editCheckin = p.id; projTab = "week"; pendingTab = "week"; asstOpen = false;
    } else {
      const acts = parseActions(text);
      const cleanText = text.split("\n").filter(l => !/^\s*ACTION\s*:/i.test(l)).join("\n").trim();
      if (acts.length) {
        aiMsg.text = cleanText || "Here's what I can do for you:";
        aiMsg.actions = acts;
        aiMsg.actState = "pending";
      } else {
        const found = parseIdeas(cleanText);
        aiMsg.text = found.length ? cleanText.split("\n").filter(l => !/^\s*[-*\d.)\s]*IDEA\s*:/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim() : cleanText;
        aiMsg.ideas = found;
        aiMsg.plan = !found.length && /^\s*PHASE:/im.test(cleanText) && /^\s*-\s+/m.test(cleanText);
      }
    }
  } catch (e) {
    try { console.error("Assistant error", e) } catch { }
    delete aiMsg.streaming;
    const kind = e instanceof SyntaxError ? "" : aiErrorKind(e);
    aiMsg.error = true;
    aiMsg.text = e instanceof SyntaxError ? "I couldn't draft the check-in this time. Try again." : aiErrorText(e);
    aiMsg.detail = e instanceof SyntaxError || kind === "overloaded" || kind === "busy" ? "" : aiErrorRaw(e);
    aiMsg.retry = kind === "overloaded" || kind === "busy" || kind === "net" || e instanceof SyntaxError ? { text: userText, opts } : null;
  }
  asstBusy = false; render();
  const log = document.getElementById("asst-log"); if (log) log.scrollTop = log.scrollHeight;
}

/* ----- "Send to AI": one tap gets the assistant working on a hard task or a problem on the page ----- */
// Dismissed pop-ups stay dismissed on this device.
let problemPopDismissed = (() => { try { return JSON.parse(localStorage.getItem("aiPopDismissed") || "{}") } catch { return {} } })();
const dismissProblemPop = key => { problemPopDismissed[key] = Date.now(); try { const keep = Object.entries(problemPopDismissed).sort((x, y) => y[1] - x[1]).slice(0, 200); localStorage.setItem("aiPopDismissed", JSON.stringify(Object.fromEntries(keep))) } catch { } };
function canUseAssistant() { try { return !!me && !partnerMode && !clientMode } catch { return false } }

function sendProblemToAI(p, t, customBlocker = "") {
  if (!canUseAssistant()) return;
  asstOpen = true; alertsOpen = false;
  const notes = t && t.notes ? Object.values(t.notes).filter(Boolean).map(n => n.text).join(" | ") : "";
  const wait = p && t ? waitInfo(p, t).open.map(d => d.text).join(", ") : "";
  const displayLabel = t ? `⚡ Help me solve: “${t.text}”` : `⚡ Help me solve a blocker on ${p.title}`;
  const fullPrompt = [
    "SOLVE_PROBLEM: I'm stuck on a hard task or a blocker in a project.",
    p ? `Project: "${p.title}"${p.pitch ? " (" + p.pitch.slice(0, 300) + ")" : ""}` : "",
    t ? `Task [{REF}]: "${t.text}" (priority: ${t.priority || "medium"}, status: ${t.done ? "done" : t.status === "doing" ? "in progress" : "not started"}${t.due ? ", due " + t.due : ""})` : "",
    wait ? `It's waiting for: ${wait}` : "",
    notes ? `Notes on the task so far: ${notes.slice(0, 800)}` : "",
    customBlocker ? `What's blocking me: ${customBlocker}` : "",
    t ? "Give me a direct, practical step-by-step way to get this done fast, and add ACTION: step | {REF} | <step> lines for the steps worth putting on the task." : "Give me a direct, practical way through it."
  ].filter(Boolean).join("\n");
  runAssistant(fullPrompt, { displayLabel, focus: t ? { p, t } : null });
}

// The "Send to AI to solve" bar inside an open task. Hard tasks (urgent, high priority, or waiting on others) stand out.
function hardTaskPopBanner(p, t) {
  if (!canUseAssistant() || !t || t.done) return null;
  const isHard = t.priority === "urgent" || t.priority === "high" || waitInfo(p, t).open.length > 0;
  return el("div", { class: "row aisolve" + (isHard ? " hard" : "") },
    isHard ? el("span", { class: "aisolve-tag" }, "⚠ Hard or blocked task") : el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Stuck on this?"),
    el("span", { class: "spacer" }),
    el("button", { class: "btn small" + (isHard ? " primary" : ""), onclick: e => { e.stopPropagation(); sendProblemToAI(p, t) } }, "⚡ Send to AI to solve"));
}

// What looks like a problem on the page you're on (only the first one found).
function detectCurrentScreenProblem() {
  const r = route(), p = currentProject(), today = ymd(new Date());
  if (r.view === "project" && p && p.status === "approved" && !isPaused(p)) {
    // your tasks here (or every task, if you plan this project)
    const tasks = tasksOf(p).filter(t => !t.done && !taskHeld(p, t) && (canPlan(p) || isAssignee(t, me)));
    const urgent = tasks.find(t => t.priority === "urgent" || (t.due && t.due < today));
    if (urgent) return { key: "urg:" + urgent.id, badge: urgent.due && urgent.due < today ? "Overdue task" : "Urgent task", label: `“${short48(urgent.text)}”`,
      context: `Project: "${p.title}"\nUrgent or overdue task: "${urgent.text}" (due: ${urgent.due || "no date"}, people: ${assignees(urgent).map(u => realName(u)).join(", ") || "nobody yet"})` };
    const blocked = tasks.find(t => isAssignee(t, me) && isBlocked(p, t));
    if (blocked) return { key: "blk:" + blocked.id, badge: "Blocked task on " + p.title, label: `“${short48(blocked.text)}” is waiting on other tasks`,
      context: `Project: "${p.title}"\nBlocked task: "${blocked.text}"\nWaiting for: ${waitInfo(p, blocked).open.map(d => d.text).join(", ")}` };
  }
  if (r.view === "me") {
    const stuck = myTasks().find(x => !x.personal && !x.closed && !x.t.done && (isBlocked(x.p, x.t) || x.t.priority === "urgent" || (x.t.due && x.t.due < today)));
    if (stuck) return { key: "me:" + stuck.t.id, badge: "Tough task in your list", label: `“${short48(stuck.t.text)}” (${stuck.p.title})`,
      context: `My task: "${stuck.t.text}" in the project "${stuck.p.title}"${stuck.t.due ? " (due " + stuck.t.due + ")" : ""}${isBlocked(stuck.p, stuck.t) ? "\nIt's waiting for: " + waitInfo(stuck.p, stuck.t).open.map(d => d.text).join(", ") : ""}` };
  }
  if (r.view === "money") {
    try {
      const late = allMoney().late;
      if (late && late.length) { const { p: lp, s: ls } = late[0];
        return { key: "late:" + lp.id + ":" + ls.label, badge: "Late payment", label: `${lp.title}: ${ls.label} (${fmtEGP(ls.expected - ls.received)})`,
          context: `Late payment on "${lp.title}"${(lp.money || {}).client ? " (client: " + lp.money.client + ")" : ""} for "${ls.label}": ${fmtEGP(ls.expected - ls.received)} still owed. Write a polite but firm WhatsApp follow-up for the client and suggest next steps.` } }
    } catch { }
  }
  if (r.view === "chat" && r.ch === "ideas") {
    const mine = ideas.find(i => i.status === "voting" && i.author === me);
    if (mine) return { key: "idea:" + mine.id, badge: "Your idea is in the vote", label: `Make “${short48(mine.title)}” stronger?`,
      context: `My idea in the vote: "${mine.title}"\nPitch: "${mine.pitch || "no pitch yet"}"\nHelp make the pitch stronger, suggest a small first version we could build fast, and say who pays.` };
  }
  if (r.view === "partners" && r.gid) {
    const warm = pLeads.find(l => l.gid === r.gid && ["interested", "meeting", "callback"].includes(l.status));
    if (warm) return { key: "lead:" + warm.id, badge: "Lead to follow up", label: `Close ${leadTitle(warm)}?`,
      context: `Partner lead: ${leadTitle(warm)}${warm.biz ? " (" + warm.biz + ")" : ""}, status: ${LEAD_NAME[warm.status] || warm.status}${warm.note ? ", note: " + warm.note : ""}. Give a short call or WhatsApp script to turn this lead into a client.` };
  }
  return null;
}
const short48 = s => { s = String(s || ""); return s.length > 48 ? s.slice(0, 48) + "…" : s };

function triggerUniversalProblemAI(problemTitle, fullContext) {
  if (!canUseAssistant()) return;
  asstOpen = true; alertsOpen = false;
  const prompt = [
    "SOLVE_PROBLEM (in the app): I'm facing a problem in Pitch Room.",
    `Page I'm on: ${route().view}`,
    fullContext ? `The problem:\n${fullContext}` : "",
    "Give me an immediate, practical way to fix it, fitting my role and the board. Add ACTION lines if they help."
  ].filter(Boolean).join("\n\n");
  runAssistant(prompt, { displayLabel: `⚡ Solve: ${problemTitle}` });
}

// The small pop-up in the corner: "Send to AI to solve immediately". Hidden while the assistant is open.
function renderUniversalProblemPop() {
  let bar = document.getElementById("universal-ai-pop");
  if (!bar) { bar = el("div", { id: "universal-ai-pop", class: "aipop" }); document.body.appendChild(bar) }
  const detected = canUseAssistant() && !asstOpen ? detectCurrentScreenProblem() : null;
  if (!detected || problemPopDismissed[detected.key]) { bar.hidden = true; bar.replaceChildren(); return }
  if (bar.dataset.key === detected.key && !bar.hidden) return;   // already showing this one
  bar.dataset.key = detected.key; bar.hidden = false;
  bar.replaceChildren(el("div", { class: "aipop-card", role: "status" },
    el("div", { class: "row", style: "gap:6px" },
      el("span", { class: "aipop-badge" }, "⚡ " + detected.badge), el("span", { class: "spacer" }),
      el("button", { class: "x", "aria-label": "Dismiss", title: "Dismiss", onclick: () => { dismissProblemPop(detected.key); renderUniversalProblemPop() } }, "✕")),
    el("div", { class: "aipop-text" }, detected.label),
    el("button", { class: "btn primary small", style: "width:100%;justify-content:center", onclick: () => { bar.hidden = true; triggerUniversalProblemAI(detected.badge, detected.context) } }, "Send to AI to solve immediately")));
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
  asstOpen = false; if (location.hash !== "#chat-ideas") location.hash = "chat-ideas"; else render();
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

  const langSel = el("select", { class: "mini asst-lang", "aria-label": "Language the assistant answers in", title: "Language the assistant answers in", onchange: e => setAsstLang(e.target.value) },
    ASST_LANGS.map(([v, l]) => el("option", { value: v }, v === "auto" ? "🌐 Auto" : "🌐 " + l)));
  langSel.value = asstLang();
  panel.append(el("div", { class: "row asst-head" }, el("span", { class: "asst-ico" }, "✦"), el("h3", {}, "Assistant"), el("span", { class: "spacer" }), langSel,
    asstMsgs.length ? el("button", { class: "btn quiet small", onclick: () => { asstMsgs = []; render() } }, "Clear") : null,
    el("button", { class: "x", "aria-label": "Close assistant", onclick: () => { asstOpen = false; render() } }, "✕")));
  const log = el("div", { class: "asst-log", id: "asst-log" });
  if (!asstMsgs.length && !asstTplOpen) log.append(el("div", { class: "asst-langpick" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Talk to me in:"),
    el("div", { class: "seg seg-sm", role: "group", "aria-label": "Language the assistant answers in" }, ASST_LANGS.map(([v, l]) => el("button", { "aria-pressed": String(asstLang() === v), onclick: () => setAsstLang(v) }, v === "auto" ? "Auto" : l)))));
  if (!asstMsgs.length || asstTplOpen) log.append(el("p", { class: "asst-hint" }, p ? `Pick a template or ask about “${p.title}”.` : "Pick a template or ask anything. Open a project for project templates."));
  if (asstTplOpen || !asstMsgs.length) log.append(templateList(p));
  if (!asstMsgs.length) log.append(el("p", { class: "asst-hint small" }, "Tell it what you did (\u201cI finished the assessment, the file is in Drive\u201d) and it ticks the task and leaves a note for the team. Ask it to explain anything. It always shows what it will do first: nothing changes until you tap Do it. Powered by Google Gemini, so don't put passwords here."));
  if (!asstTplOpen) for (const m of asstMsgs) {
    const b = el("div", { class: "asst-msg " + (m.role === "me" ? "mine" : "ai") + (m.error ? " err" : "") + (m.streaming && m.text === "…" ? " typing" : ""), id: m.streaming ? "asst-stream" : null, dir: "auto" }, m.streaming && m.text === "…" ? (asstStatus || "Thinking…") : m.text,
      m.detail ? el("div", { class: "asst-detail" }, "Details: " + m.detail) : null,
      m.error && m.retry && m === asstMsgs[asstMsgs.length - 1] && !asstBusy ? el("div", { style: "margin-top:8px" }, el("button", { class: "btn small primary", onclick: () => { const r = m.retry; asstMsgs.splice(asstMsgs.indexOf(m) - 1, 2); runAssistant(r.text, r.opts) } }, "Try again")) : null);
    log.append(b);
    if (m.actions && m.actions.length) log.append(actionsCard(m));
    if (m.ideas && m.ideas.length) log.append(el("div", { class: "idea-sugs" }, m.ideas.map(x => el("div", { class: "idea-sug" },
      el("div", { class: "row", style: "gap:6px" }, el("b", { style: "flex:1 1 auto;min-width:0" }, x.title), x.category ? el("span", { class: "catchip" }, x.category) : null),
      el("p", {}, x.pitch),
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: () => useIdea(x) }, "Use this idea"))))));
    if (m.plan && planner) log.append(el("div", { class: "row", style: "justify-content:flex-start;gap:8px" },
      el("button", { class: "btn primary small", onclick: () => { asstOpen = false; openImport(p, m.text) } }, "Preview and add to plan"),
      el("button", { class: "btn quiet small", onclick: async () => { try { await navigator.clipboard.writeText(m.text); toast("Copied") } catch { toast("Couldn't copy") } } }, "Copy")));
  }
  if (asstBusy && !(asstMsgs.length && asstMsgs[asstMsgs.length - 1].streaming)) log.append(el("div", { class: "asst-msg ai typing" }, asstStatus || "Thinking…"));
  panel.append(log);
  if (!asstBusy && asstMsgs.length) panel.append(el("div", { class: "asst-chips" },
    asstTplOpen ? null : el("button", { class: "pchip", onclick: () => { const i = document.getElementById("asst-input"); if (i) { i.value = "I finished "; i.focus() } } }, "I finished something"),
    asstTplOpen ? null : quick.map(t => el("button", { class: "pchip", onclick: () => useTemplate(t, p) }, tplLabel(t, p))),
    el("button", { class: "pchip", "aria-pressed": String(asstTplOpen), onclick: () => { asstTplOpen = !asstTplOpen; render() } }, asstTplOpen ? "Back to chat" : "All templates")));
  const inp = el("textarea", { id: "asst-input", class: "noteinput", rows: "1", maxlength: "1500", placeholder: "Ask anything, or tell me what you did\u2026" });
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

/* ----- phones in a browser: suggest opening Pitch Room as an app ----- */
// In Safari the browser's own bar (with the web address) sits over the bottom of the site and above the keyboard.
// Opened from the Home Screen, Pitch Room fills the whole screen like a real app: no browser bars, no address.
// Shown once in a while, never in a chat, and "Not now" hides it for a week.
function installNudge() {
  const ex = document.getElementById("install-nudge");
  const phone = matchMedia("(hover: none) and (pointer: coarse)").matches && innerWidth < 900;
  let later = 0; try { later = +localStorage.getItem("installLater") || 0 } catch { }
  const want = phone && me && !partnerMode && !clientMode && !$("#app").hidden && !isHomeScreenApp() && Date.now() > later && route().view !== "chat" && !route().sub;
  if (!want) { if (ex) ex.remove(); return }
  if (ex) return;
  const hide = () => { try { localStorage.setItem("installLater", String(Date.now() + 7 * 864e5)) } catch { } document.getElementById("install-nudge")?.remove() };
  document.body.append(el("div", { class: "install-nudge", id: "install-nudge", role: "region", "aria-label": "Open as an app" },
    el("img", { src: "torch-192.png", alt: "", width: "40", height: "40" }),
    el("div", { class: "in-t" }, el("b", {}, "Get the Pitch Room app"), el("span", {}, "Full screen, no browser bar")),
    el("button", { class: "btn small primary", onclick: () => { document.getElementById("install-nudge")?.remove(); if (installEvt) { installEvt.prompt(); installEvt = null } else location.hash = "settings-install" } }, "Set up"),
    el("button", { class: "x", "aria-label": "Not now", title: "Not now", onclick: hide }, "✕")));
}
setTimeout(installNudge, 6000);
addEventListener("hashchange", () => setTimeout(installNudge, 0));

/* ----- money: each project's Money tab ----- */

let moneyRules = null, fundDoc = null;       // meta/money and meta/fund

/* ----- what's new: tell members about new things (they can turn it off) ----- */
// Built-in notes for new features, newest first. The admin can also post team updates (saved in meta/news).
const WHATS_NEW = [
  { id: "f-asst-lang-1", date: "2026-11-16", icon: "\u{1F310}", title: "Pick the assistant's language",
    text: "Choose whether the assistant talks to you in English, عربي or Franco, or let it match how you write. Franco and Arabic now sound like real Egyptian chat, not a translation. Tap 🌐 at the top of the assistant, or Settings › Assistant language. It's saved to your account.", go: "settings-language" },
  { id: "f-asst-solve-1", date: "2026-11-16", icon: "⚡", title: "Faster assistant that speaks Franco, and Send to AI",
    text: "The assistant now writes its answer as it thinks, and understands Franco and Egyptian Arabic (it answers the way you write). It can add tasks, rename tasks and pitch ideas for you, only in projects you're part of. Stuck? Open a task and tap ⚡ Send to AI to solve, or tap the pop-up when a task is late, urgent or blocked.", go: "me" },
  { id: "f-phase-pause-1", date: "2026-11-16", icon: "⏸", title: "Pause a phase, continue when you're ready",
    text: "Planners can now pause one phase of a project instead of the whole project: Tasks › Edit phases › ⏸ Pause. Its tasks go on hold (no reminders, and they leave My tasks) until a planner taps Resume.", go: "projects" },
  { id: "f-rules-v3", date: "2026-11-16", icon: "\u{1F4DC}", title: "New money rules: please read and agree",
    text: "The money rules were rewritten to match how money works now: project teams, task prices, phases, keeping money in the fund, papers on payments and the fund's own money. The numbers are the same. Money › Rules.", go: "money-rules" },
  { id: "f-bugs-ideas-1", date: "2026-11-16", icon: "\u{1F41E}", title: "Bugs and ideas, straight to the creators",
    text: "Found something broken, or know what would make work easier? ⋯ › Bugs and ideas. Creators get an alert, and you hear back when it's fixed. Also new: if you pitched an idea and 1 other person voted Keep, you can make it a project yourself.", go: "settings-feedback" },
  { id: "f-client-live-1", date: "2026-11-16", icon: "\u{1F441}", title: "See exactly what the client sees",
    text: "A project's Client tab › Client page shows the client's page live, next to three setup steps and simple on/off switches for each part. The project name, progress, stages and payments update by themselves from the project.", go: "projects" },
  { id: "f-quiz2-1", date: "2026-11-16", icon: "\u2B50", title: "A new skills quiz that finds your roles",
    text: "Real situations, quick tests and what you've actually done, not just what you like. It gives you a main role (like Brand designer or Client closer), other roles you fit, and your hidden skill: something you're better at than you think. About 6 minutes. Skills and team shows who does what.", go: "skills" },
  { id: "f-fund-hands-1", date: "2026-11-16", icon: "\u{1F3E6}", title: "The fund shows its own money and project money apart",
    text: "Fund & goals now shows what's in the fund's hands, its own money and what it keeps for projects. Paying a subscription warns you if the fund's own money isn't enough and it would use project money.", go: "money-fund" },
  { id: "f-easy-money-1", date: "2026-11-16", icon: "\u{1F4B8}", title: "Money made simple",
    text: "Setting up a project's money is now three questions. When the client pays, tap + Money in: type the amount, tap what it's for, how they paid and who has it, attach the signed quotation, done. The details (task prices, who gets what) fold away until you open them.", go: "projects" },
  { id: "f-phases-1", date: "2026-11-16", icon: "\u{1FA9C}", title: "Deals in phases",
    text: "A client working with us step by step? On the Money tab, tap Split the deal into phases. Each phase (like company profile, then social media, then the website) has its own price, deposit and final payment. Money phases are separate from task phases: you can tick which task phases one pays for (one, several or none). When a phase is done and paid, tap + Add the next phase.", go: "projects" },
  { id: "f-hold-1", date: "2026-11-16", icon: "\u{1F3E6}", title: "Keep a project's money in the fund, decide later",
    text: "Not sure how to split a project's money yet? In Edit deal choose Keep it in the fund, decide later. Payments wait in the team fund, written as that project's, until the planners tap Decide the split (it shows what each way gives first). When you add a payment, say how you got it and attach the signed quotation or a receipt. Every project now shows whose idea it is and who's planning it.", go: "projects" },
  { id: "f-teams-prices-1", date: "2026-11-16", icon: "\u{1F465}", title: "Project teams and task prices",
    text: "Each project now has its own team. Ask to join and a planner accepts you, or accept a planner's invite. Only the team works on and earns from a project; anyone can still look and leave notes. Planners can give tasks a price: whoever does a task earns it once it's done and paid for. There's a new guide too: Settings › How Pitch Room works.", go: "settings-guide" },
  { id: "f-money-plan-1", date: "2026-11-15", icon: "\u{1F4B0}", title: "Deposits and payment plans",
    text: "Each project's Money tab now shows the price, what came in and what's left in three plain numbers. Split the price into a deposit and the rest, link the tasks each payment pays for, and see where every pound goes: costs, partner, team fund, finder, and the team.", go: "projects" },
  { id: "f-build-1", date: "2026-11-15", icon: "🛠️", title: "Build Pitch Room with us",
    text: "Some of us are now creators: they can change Pitch Room itself. Anyone can ask for a new feature or a fix in Settings › Build Pitch Room, and see who's building it.", go: "settings-build" },
  { id: "f-taskfiles-1", date: "2026-11-15", icon: "📎", title: "Files on tasks",
    text: "Open any task and attach PDFs, briefs, designs or photos (up to 10 MB each), or just drop them on the task. Your own tasks in Me can have files too.", go: "mine" },
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
// the two number formats are made once and reused (making one each time was slow on phones)
const egpWhole = new Intl.NumberFormat("en"), egpCents = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEGP = p => { const v = (p || 0) / 100; return (Math.round(v) === v ? egpWhole : egpCents).format(v) + " EGP" };
const fmtN = p => fmtEGP(p).replace(" EGP", "");
const thisMonth = () => todayStr().slice(0, 7);
const monthLabel = ym => { if (!ym) return ""; const [y, m] = ym.split("-").map(Number); return dtf({ month: "short", year: "numeric" }).format(new Date(y, m - 1, 1)) };
const DEAL_TYPES = [["one", "One-time"], ["monthly", "Monthly"], ["installments", "Paid over months"]];
const STAGES = [["proposal", "Proposal sent"], ["agreed", "Deal agreed"], ["ended", "Ended"]];
const METHODS = ["Cash", "InstaPay", "Vodafone Cash", "Bank transfer", "Other"];
let editDeal = null, moneyForm = null, delMoney = null, shareMonth = null;
const moneyCache = new WeakMap();   // one sum per project version, so task chips don't redo it for every task
const moneyOf = p => { const k = todayStr() + JSON.stringify(moneyRules || {}) + projTeam(p).join(","), c = moneyCache.get(p); if (c && c.k === k) return c.r; const r = computeMoney(p, todayStr(), rulesNow(), { team: projTeam(p) }); moneyCache.set(p, { k, r }); return r };
const FUND_HOLDER = "__fund";
const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "QAR", "KWD"];
const fmtCur = (v, cur) => !cur || cur === "EGP" ? fmtEGP(v) : fmtN(v) + " " + cur;
// Every money change is logged on the project, so everyone can see who changed what and when.
function moneyUpd(p, data, what, kind, ok) { return write(() => upd(p.id, { ...data, ["moneyLog." + uid()]: { by: me, at: Date.now(), what: String(what || "").slice(0, 200), kind: kind || "entry" } }), ok) }
function sharesDiff(a, b) {
  const ids = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  return ids.filter(u => Number((a || {})[u] || 0) !== Number((b || {})[u] || 0)).map(u => `${firstName(u)} ${Number((a || {})[u] || 0)}% \u2192 ${Number((b || {})[u] || 0)}%`).join(", ");
}
const canMoney = p => canPlan(p);

function moneyStatus(p, r) {
  const m = p.money || {};
  if (m.hold && m.stage !== "proposal") return r.late.length ? ["Payment late", "late"] : ["Kept in the fund", "due"];
  if (m.stage === "proposal") return ["Proposal sent", "label"];
  if (m.stage === "ended") return ["Ended", "label"];
  if (r.monthsUnpaid >= rulesNow().pauseAfterLate) return [`${r.monthsUnpaid} months unpaid`, "late"];
  if (r.late.length) return ["Payment late", "late"];
  if (m.type === "one") {
    if (r.received >= r.expected && r.expected) return ["Fully paid", "paid"];
    if (r.planned) { const paid = r.schedule.filter(s => s.status === "paid"), next = r.schedule.find(s => s.status !== "paid");
      return paid.length ? [`${paid[paid.length - 1].label} paid`, "due"] : r.received ? ["Part paid", "due"] : [`Waiting for the ${(next ? next.label : "deposit").toLowerCase()}`, "due"] }
    return r.received ? ["Deposit received", "due"] : ["Waiting for deposit", "due"];
  }
  if (m.type === "installments") return r.received >= r.expected ? ["Fully paid", "paid"] : ["Being paid", "due"];
  return ["Active", "paid"];
}

function renderMoney(box, p) {
  const m = p.money, can = canMoney(p);
  if (!m || editDeal === p.id) {
    if (!can) { box.append(el("div", { class: "empty" }, "No deal set up yet. The project's planners add the money details here.")); return }
    box.append(m ? dealForm(p) : moneySetup(p)); return;
  }
  const r = moneyOf(p), [st, stCls] = moneyStatus(p, r);
  const typeName = (DEAL_TYPES.find(x => x[0] === m.type) || DEAL_TYPES[0])[1];
  const cur = r.currency, f = v => fmtCur(v, cur);

  /* summary: three plain numbers and one sentence */
  const sum = el("section", { class: "idea money-sum" },
    el("div", { class: "row", style: "gap:6px" }, el("span", { class: "chip" }, typeName), el("span", { class: "mstat " + stCls }, st), m.client ? el("span", { class: "label" }, "Client: " + m.client) : null,
      el("span", { class: "spacer" }), can ? el("button", { class: "btn small quiet", onclick: () => { editDeal = p.id; render() } }, "Edit deal") : null));
  const tile = (label, value, cls, sub) => el("div", { class: "mtile" + (cls ? " " + cls : "") }, el("span", {}, label), el("b", {}, value), sub ? el("small", {}, sub) : null);
  if (m.type === "monthly") {
    const owedNow = r.schedule.filter(s => s.status === "late" || s.status === "due").reduce((a, s) => a + Math.max(0, s.expected - s.received), 0);
    sum.append(el("div", { class: "mtiles" },
      tile("Every month", f(toP(m.monthlyFee))),
      tile("Received so far", f(r.received), "", cur !== "EGP" ? "≈ " + fmtEGP(r.receivedEGP) : null),
      tile("Owed now", f(owedNow), owedNow ? (r.late.length ? "late" : "left") : "ok")),
      el("div", { class: "label" }, [toP(m.setupFee) ? "Setup fee " + f(toP(m.setupFee)) : null, "since " + monthLabel(m.startMonth), m.endMonth ? "until " + monthLabel(m.endMonth) : "ongoing", "due by day " + (m.dueDay || 5), cur !== "EGP" ? `1 ${cur} ≈ ${r.rate} EGP` : null].filter(Boolean).join(" · ")));
  } else {
    const left = Math.max(0, r.expected - r.received);
    sum.append(el("div", { class: "mtiles" },
      tile("Price", f(r.expected)),
      tile("Received", f(r.received), r.received ? "ok" : "", cur !== "EGP" && r.received ? "≈ " + fmtEGP(r.receivedEGP) : null),
      tile("Left to pay", f(left), left ? (r.late.length ? "late" : "left") : "ok")),
      el("div", { class: "track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": r.expected ? Math.min(100, Math.round(r.received / r.expected * 100)) : 0, "aria-label": "Paid so far" },
        el("div", { class: "fill", style: `width:${r.expected ? Math.min(100, Math.round(r.received / r.expected * 100)) : 0}%` })));
  }
  sum.append(el("p", { class: "msay" }, moneySentence(p, r)));
  // monthly and paid-over-months deals: the month-by-month list
  if (m.type !== "one" && r.schedule.length) {
    const sch = el("div", { class: "schedule" });
    for (const s of r.schedule.slice(-8)) sch.append(el("div", { class: "sched " + s.status },
      el("span", { class: "sched-l" }, s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label + (m.type === "installments" ? " · " + monthLabel(s.month) : "")),
      el("span", {}, s.status === "paid" ? "✓ " + f(s.received) : s.received ? `${f(s.received)} of ${f(s.expected)}` : f(s.expected)),
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
  if (r.costsUnpaid > 0 && r.holding) warn.push(`${fmtEGP(r.costsUnpaid)} of costs gets paid back first, once you decide the split.`);
  else if (r.costsUnpaid > 0 && !r.pending) warn.push(`${fmtEGP(r.costsUnpaid)} of costs still needs paying back. It comes out of the next payment.`);
  if (r.fundCover > 0) warn.push(`This deal cost more than it earned. The team fund covered ${fmtEGP(r.fundCover)}, so nobody is out of pocket.`);
  if (r.unassigned > 0) warn.push(r.byTasks ? `${fmtEGP(r.unassigned)} isn't going to anyone yet: a done task has nobody on it, or the project has no team. Give the task to someone, or add people to the team.` : `${fmtEGP(r.unassigned)} isn't assigned to anyone yet. Set the shares in Edit deal.`);
  if (r.byTasks && r.taskHeld > 0) warn.push(`${fmtEGP(r.taskHeld)} is paid for but waiting: its tasks aren't done yet. It goes to the people on them when they tick them done.`);
  if (r.byTasks && r.pricedOver) warn.push("The task prices add up to more than a payment covers, so they're scaled down to fit. Check the prices below.");
  if (r.byPoints) {
    const P = r.points;
    if (P.held > 0) warn.push(`${fmtEGP(P.held)} is waiting: no task with a size is done yet${m.type === "monthly" ? " for that month" : ""}. It's shared by points once tasks are done and checked.`);
    if (P.unsized) warn.push(`${P.unsized} task${P.unsized > 1 ? "s have" : " has"} no size yet, so ${P.unsized > 1 ? "they don't" : "it doesn't"} earn points. A planner gives each task a size.`);
    if (!r.finderCase && (r.finders.length || r.finderTeam || r.partner)) warn.push("Someone brought the client, but how they came isn't set, so there's no finder's fee yet. Pick it in Edit deal.");
  }
  if (warn.length) box.append(el("div", { class: "notice", style: "margin:0 0 12px" }, warn.map(w => el("div", {}, w))));

  /* actions: one big button for money that came in; the rest are smaller */
  if (can) {
    const formOpen = moneyForm && moneyForm.pid === p.id;
    if (!formOpen) box.append(el("div", { class: "moneyacts" },
      el("button", { class: "btn primary moneyin", onclick: () => { moneyForm = { pid: p.id, kind: "pay" }; render() } }, "+ Money in"),
      el("button", { class: "btn small", onclick: () => { moneyForm = { pid: p.id, kind: "cost" }; render() } }, "+ We spent money"),
      m.adBudget ? el("button", { class: "btn small", onclick: () => { moneyForm = { pid: p.id, kind: "ads" }; render() } }, "+ Ad money") : null));
    else box.append(moneyForm.kind === "pay" ? moneyInForm(p, r) : moneyEntryForm(p, r));
  }

  if (r.holding) box.append(holdBlock(p, r));

  /* payment plan: the deposit, what's left, and which tasks each payment pays for */
  if (m.type === "one") box.append(isPhased(m) ? phasesBlock(p, r) : planBlock(p, r));
  if (r.byTasks || (r.holding && m.split === "tasks" && m.type !== "monthly")) {
    const tr = r.holding ? taskMoneyOf(p) : r;
    box.append(fold("tp-" + p.id, "Task prices", tr.priced ? `${fmtCur(tr.priced, cur)} of ${fmtCur(r.expected, cur)} is on tasks` : "no prices yet", taskPricesBlock(p, tr, r.holding), priceEdit === p.id));
  }
  if (r.byPoints) box.append(pointsBlock(p, r));

  /* where the money goes, then who gets what */
  const split = el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "Where the money goes"), el("span", { class: "spacer" }), el("span", { class: "label" }, "In EGP")));
  split.append(flowList(p, r));
  if ((r.pending && r.preview) || ((r.byTasks || r.byPoints) && r.preview && r.received < r.expected)) {
    const pv = r.preview, pe = Object.entries(pv.people).sort((a, b) => b[1].earned - a[1].earned);
    if (pe.length) {
      split.append(el("div", { class: "tlabel", style: "margin-top:10px" }, r.byPoints ? "When it's all paid and every task is done, each person gets about" : r.byTasks ? "When it's all paid and done, each person gets" : "Each person will get"));
      for (const [u, v] of pe) split.append(el("div", { class: "mrow" }, av(u), el("span", { class: "mname" }, name(u)), el("span", { class: "mval" }, fmtEGP(v.earned))));
    }
  }
  const people = Object.entries(r.people).filter(([, v]) => v.earned || v.back || v.paid).sort((a, b) => b[1].balance - a[1].balance);
  if (people.length) {
    split.append(el("div", { class: "tlabel", style: "margin-top:10px" }, r.pending && !r.byPoints ? "So far (costs paid back)" : (r.byTasks || r.byPoints) && r.received < r.expected ? "Earned so far" : "Each person"));
    split.append(el("div", { class: "mhead" }, el("span", {}, "In EGP"), el("span", {}, "Their money"), el("span", {}, "Handed over"), el("span", {}, "Still owed")));
    for (const [u, v] of people) split.append(el("div", { class: "mrow4" },
      el("span", { class: "by" }, av(u), el("span", { class: "mname" }, name(u))),
      el("span", { class: "mval" }, fmtN(v.earned + v.back), v.back ? el("small", {}, ` incl. ${fmtN(v.back)} costs back`) : null),
      el("span", { class: "mval" }, fmtN(v.paid)),
      el("span", { class: "mval owed" }, fmtN(v.balance), can && v.balance > 0 ? el("button", { class: "linkbtn", onclick: () => { moneyForm = { pid: p.id, kind: "payout", to: u, amount: v.balance / 100 }; render() } }, "Mark paid") : null)));
  }
  if (r.partner && (r.partner.earned || r.partner.paid)) { const po = r.partner.earned - r.partner.paid;
    split.append(el("div", { class: "mrow partnerrow" }, el("span", { class: "rolebadge partner" }, "Partner"), el("span", { class: "mname" }, r.partner.name), el("span", { class: "mval" }, `earned ${fmtN(r.partner.earned)} · paid ${fmtN(r.partner.paid)} · owed ${fmtEGP(po)}`,
      can && po > 0 ? el("button", { class: "linkbtn", onclick: () => { moneyForm = { pid: p.id, kind: "payout", toPartner: r.partner.email, amount: po / 100 }; render() } }, "Mark paid") : null))) }
  { const owed = Object.values(r.people).reduce((a, v) => a + Math.max(0, v.balance), 0), mine = r.people[me];
    box.append(fold("split-" + p.id, "Who gets what", [mine && mine.balance > 0 ? "you're owed " + fmtEGP(mine.balance) : null, owed ? fmtEGP(owed) + " still to hand over" : null, r.fund ? "fund " + fmtEGP(r.fund) : null].filter(Boolean).join(" · ") || "where every pound goes", split, false)) }

  /* ad money */
  if (m.adBudget || r.ads.in || r.ads.spent) box.append(el("section", { class: "idea", style: "margin-top:12px" },
    el("div", { class: "row" }, el("h3", {}, "Client's ad money"), el("span", { class: "spacer" }), el("span", { class: "label" }, "Not our money, never split")),
    el("div", { class: "adgrid" },
      el("div", {}, el("b", {}, fmtEGP(r.ads.in)), el("span", {}, "received")),
      el("div", {}, el("b", {}, fmtEGP(r.ads.spent)), el("span", {}, "spent on ads")),
      el("div", { class: r.ads.held < 0 ? "late" : "" }, el("b", {}, fmtEGP(r.ads.held)), el("span", {}, r.ads.held < 0 ? "we paid extra" : "left to spend")))));

  /* history */
  const hist = [];
  for (const [id, x] of Object.entries(p.payments || {})) if (x) hist.push({ id, files: payFilesOf(x), coll: "payments", date: x.date, at: x.at, sign: "+", amount: x.amount, cur, rate: x.rate, text: `${(r.alloc && r.alloc[id] && r.alloc[id].length ? r.alloc[id].map(o => r.alloc[id].length > 1 ? `${o.label} (${fmtCur(o.amount, cur)})` : o.label).join(" + ") : "") || x.stepLabel || { deposit: "Deposit", setup: "Setup fee", monthly: "Monthly fee " + monthLabel(x.month), installment: "Installment" }[x.kind] || "Payment"}${x.method ? " · " + x.method : ""}${x.inFund ? " · in the team fund" : x.heldBy ? " · with " + firstName(x.heldBy) : ""}`, note: [x.source, x.note].filter(Boolean).join(" · ") });
  for (const [id, x] of Object.entries(p.costs || {})) if (x) hist.push({ id, coll: "costs", date: x.date, at: x.at, sign: "−", amount: x.amount, text: `Cost: ${x.what || "spent"}${x.paidBy ? " · paid by " + firstName(x.paidBy) : ""}`, note: x.note });
  for (const [id, x] of Object.entries(p.payouts || {})) if (x) hist.push({ id, coll: "payouts", date: x.date, at: x.at, sign: "→", amount: x.amount, text: x.toPartner ? `Paid to ${(r.partner && r.partner.name) || x.toPartner} (partner)${x.from ? " by " + firstName(x.from) : ""}` : `Paid to ${firstName(x.to)}${x.from ? " by " + firstName(x.from) : ""}`, note: x.note });
  for (const [id, x] of Object.entries(p.ads || {})) if (x) hist.push({ id, coll: "ads", date: x.date, at: x.at, sign: x.kind === "spent" ? "−" : "+", amount: x.amount, text: x.kind === "spent" ? "Ad money spent on ads" : "Ad money from client", note: x.note, ad: true });
  hist.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
  if (hist.length) box.append(el("details", { class: "removed", open: hist.length <= 6 }, el("summary", {}, `History (${hist.length})`),
    el("div", { class: "idea", style: "gap:0;margin-top:10px" }, hist.map(h => el("div", { class: "hrow" + (h.ad ? " ad" : "") },
      el("span", { class: "hsign" }, h.sign), el("div", { class: "hmain" }, el("div", {}, h.text), el("div", { class: "label" }, fmtDate(h.date) + (h.note ? " · " + h.note : "")),
        h.coll === "payments" ? payPapersRow(p, h.id, h.files, can) : null),
      el("span", { class: "hamt" }, fmtCur(toP(h.amount), h.cur), h.cur && h.cur !== "EGP" && h.rate ? el("small", { class: "label", style: "display:block" }, "@ " + h.rate) : null),
      can ? (delMoney === h.id ? el("button", { class: "linkdel sure", onclick: () => { delMoney = null; moneyUpd(p, { [h.coll + "." + h.id]: DEL() }, `Removed: ${h.text} ${fmtCur(toP(h.amount), h.cur)}`, "remove", "Removed") } }, "Remove?")
        : el("button", { class: "linkdel", "aria-label": "Remove", onclick: () => { delMoney = h.id; render() } }, "✕")) : null)))));
  { const lg = moneyLogBlock(p); if (lg) box.append(lg) }
}

// A section that opens and closes, and stays the way you left it.
const folds = {};
function fold(key, title, sub, content, forceOpen) {
  const d = el("details", { class: "fold", open: forceOpen || !!folds[key], ontoggle: e => { folds[key] = e.target.open } },
    el("summary", {}, el("b", {}, title), sub ? el("span", { class: "label" }, sub) : null));
  if (content.tagName === "SECTION") content.classList.add("infold");
  d.append(content); return d;
}

/* ----- setting up the money: three questions, everything else later ----- */
const PAY_WAYS = [
  ["50", "Half now, half at the end", "A 50% deposit before we start, the rest when it's done"],
  ["30", "30% deposit, the rest at the end", "A smaller deposit first"],
  ["100", "All at once", "One payment"],
  ["months", "The same amount every month", "The price split over a few months"]];
let setupDraft = {};
function moneySetup(p) {
  const d = setupDraft[p.id] || (setupDraft[p.id] = { kind: "one", scope: "all", how: "50", split: "tasks", months: 3, cur: "EGP", client: p.client || "", proposal: false });
  if (d.scope === "part" && d.how === "months") d.how = "50";
  const team = teamOf(p), cur = d.cur;
  const box = el("section", { class: "idea mform setup" }, el("h3", {}, "Set up the money"),
    el("p", { style: "margin:0;font-size:14px" }, "Three quick questions. You can change anything later in Edit deal."));
  const q = (n, title, ...kids) => el("div", { class: "setq" }, el("div", { class: "setq-h" }, el("span", { class: "pstep-n" }, String(n)), el("b", {}, title)), ...kids);
  const opt = (on, title, sub, onclick) => el("button", { type: "button", role: "radio", class: "way", "aria-checked": String(on), onclick }, el("span", { class: "waydot" }), el("span", {}, el("b", {}, title), sub ? el("span", { class: "label" }, sub) : null));
  const num = (id, val, ph, set) => el("input", { id, class: "noteinput bigamt", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: ph, value: val || "", oninput: e => set(Number(e.target.value) || 0) });
  // 1. what did the client agree to?
  const one = d.kind === "one";
  box.append(q(1, "What did the client agree to pay?",
    el("div", { class: "seg seg-wide", role: "group" }, [["one", "A price for the work"], ["monthly", "A fee every month"]].map(([v, l]) => el("button", { type: "button", "aria-pressed": String(d.kind === v), onclick: () => { d.kind = v; if (v === "monthly" && d.split === "tasks") d.split = "shares"; render() } }, l))),
    one ? el("div", { class: "tlabel", style: "margin-top:2px" }, "Is this price for the whole project?") : null,
    one ? el("div", { class: "waylist", role: "radiogroup" },
      opt(d.scope === "all", "Yes, the whole project", "One price for all the work", () => { d.scope = "all"; render() }),
      opt(d.scope === "part", "No, just part of it", "The client pays phase by phase. This is the first phase; add the next ones when he agrees to them", () => { d.scope = "part"; render() })) : null,
    one && d.scope === "part" ? el("input", { id: "su-phname", class: "noteinput", maxlength: "50", placeholder: "What's this part? e.g. Company profile", value: d.phName || "", oninput: e => { d.phName = e.target.value } }) : null,
    el("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, one ? num("su-price", d.price, d.scope === "part" ? "Price of this part" : "Price", x => { d.price = x }) : num("su-fee", d.fee, "Every month", x => { d.fee = x }),
      el("select", { class: "mini", style: "min-width:76px", "aria-label": "Currency", onchange: e => { d.cur = e.target.value; render() } }, CURRENCIES.map(c => el("option", { value: c, selected: c === cur }, c)))),
    cur !== "EGP" ? el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, `1 ${cur} =`), el("input", { id: "su-rate", class: "mini", type: "number", min: "0", step: "any", value: d.rate || "", placeholder: "today", oninput: e => { d.rate = Number(e.target.value) || 0 } }), el("span", { class: "label" }, "EGP today")) : null,
    !one ? el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Setup fee (optional)"), el("input", { id: "su-setup", class: "mini", type: "number", min: "0", step: "any", value: d.setup || "", oninput: e => { d.setup = Number(e.target.value) || 0 } })) : null,
    el("input", { id: "su-client", class: "noteinput", maxlength: "80", placeholder: "Client name (optional)", value: d.client, oninput: e => { d.client = e.target.value } })));
  // 2. how will they pay it?
  if (one) box.append(q(2, d.scope === "part" ? "How will they pay for this part?" : "How will they pay it?",
    el("div", { class: "waylist", role: "radiogroup" }, PAY_WAYS.filter(w => d.scope !== "part" || w[0] !== "months").map(([v, l, sub]) => opt(d.how === v, l, sub, () => { d.how = v; render() }))),
    d.how === "months" ? el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Over"), el("input", { id: "su-months", class: "mini", type: "number", min: "2", max: "36", value: d.months, oninput: e => { d.months = Number(e.target.value) || 3 } }), el("span", { class: "label" }, "months, starting this month")) : null,
    null));
  else box.append(q(2, "When do they pay?", el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Every month, starting this month, by the 5th. You can change the day and the start in Edit deal.")));
  // 3. how do we share it?
  const ways = SPLIT_WAYS.filter(w => one || w[0] !== "tasks");
  box.append(q(3, "How do we share the money?",
    el("div", { class: "waylist", role: "radiogroup" }, ways.map(([v, l, sub]) => opt(d.split === v, l + (v === "tasks" ? " (recommended)" : ""), sub, () => { d.split = v; render() })))));
  let shares = null;
  if (d.split === "shares") { shares = sharesEditor("su-sh-" + p.id, p, d.shares || Object.fromEntries(team.map((u, i) => [u, Math.floor(100 / team.length) + (i === 0 ? 100 - Math.floor(100 / team.length) * team.length : 0)])), true); box.append(shares) }
  box.append(el("label", { class: "row", style: "gap:8px;font-size:14px;flex-wrap:nowrap;align-items:flex-start" }, el("input", { type: "checkbox", id: "su-prop", checked: d.proposal, onchange: e => { d.proposal = e.target.checked } }), "It's only an offer for now (nothing is due until the client says yes)"));
  const save = () => {
    const price = one ? Math.round((d.price || 0) * 100) / 100 : 0, fee = one ? 0 : Math.round((d.fee || 0) * 100) / 100;
    if (one && !(price > 0)) { toast(d.scope === "part" ? "Enter the price of this part" : "Enter the price"); document.getElementById("su-price").focus(); return }
    if (!one && !(fee > 0)) { toast("Enter the monthly fee"); document.getElementById("su-fee").focus(); return }
    if (cur !== "EGP" && !(d.rate > 0)) { toast(`Enter how many EGP 1 ${cur} is today`); return }
    let sh = {}; if (shares) { const x = shares.read(); if (x.total !== 100) { toast("The shares need to add up to 100%"); return } sh = x.shares; d.shares = sh }
    const R = rulesNow(), now = Date.now();
    const data = { type: one ? (d.how === "months" ? "installments" : "one") : "monthly", currency: cur, rate: cur === "EGP" ? 1 : d.rate, partner: null, client: d.client.trim(), stage: d.proposal ? "proposal" : "agreed",
      shares: sh, finder: null, finders: [], finderTeam: false, fundCustom: false, fundPct: null, findCustom: false, findPct: null, monthShares: {}, plan: [], prices: {},
      split: d.split === "hold" ? (one ? "tasks" : "shares") : d.split, hold: d.split === "hold" ? { by: me, at: now } : null, setAt: now, setBy: me, editedAt: now };
    if (!one) Object.assign(data, { monthlyFee: fee, setupFee: Math.round((d.setup || 0) * 100) / 100, startMonth: thisMonth(), endMonth: "", dueDay: 5, adBudget: false, monthlyShares: sh });
    else if (d.how === "months") Object.assign(data, { price, installments: Math.max(2, Math.round(d.months || 3)), startMonth: thisMonth(), dueDay: 5 });
    else if (d.scope === "part") Object.assign(data, { price, phases: [{ id: uid(), name: (d.phName || "").trim() || "Phase 1", phases: [], price, agreed: true, steps: presetSteps(price, d.how === "30" ? [30, 70] : d.how === "100" ? [100] : [50, 50]).map(x => ({ ...x, tasks: [] })) }] });
    else Object.assign(data, { price, plan: presetSteps(price, d.how === "30" ? [30, 70] : d.how === "100" ? [100] : [50, 50]).map(x => ({ ...x, tasks: [] })) });
    delete setupDraft[p.id];
    moneyUpd(p, { money: data }, "Deal set up: " + (one ? (d.scope === "part" ? `${(d.phName || "").trim() || "Phase 1"} (first part) ` : "") + fmtCur(toP(price), cur) + " · " + PAY_WAYS.find(w => w[0] === d.how)[1] : fmtCur(toP(fee), cur) + " a month") + " · " + SPLIT_WAYS.find(w => w[0] === d.split)[1], "deal", "Saved. Tap + Money in when the client pays");
  };
  box.append(el("div", { class: "row" }, el("button", { class: "linkbtn", type: "button", onclick: () => { editDeal = p.id; render() } }, "Use the full form instead"), el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: save }, "Save")));
  return box;
}

/* ----- money in: what came in, what it's for, how, and who has it. Taps, not forms ----- */
function moneyInForm(p, r) {
  const m = p.money, f = moneyForm, cur = m.currency || "EGP", today = todayStr();
  const set = (k, v) => { f[k] = v; render() };
  const chip = (on, label, onclick, sub) => el("button", { type: "button", class: "pickchip", "aria-pressed": String(!!on), onclick }, label, sub ? el("small", {}, sub) : null);
  // what it's for: the payments still open, deposit first
  let fors = [];
  if (m.type === "monthly") {
    const unpaid = r.schedule.filter(s => s.status !== "paid");
    fors = unpaid.map(s => s.label === "Setup fee" ? { k: "setup", label: "Setup fee", left: s.expected - s.received } : { k: "monthly:" + s.month, label: monthLabel(s.month), left: s.expected - s.received });
    if (!fors.some(x => x.k === "monthly:" + thisMonth())) fors.push({ k: "monthly:" + thisMonth(), label: monthLabel(thisMonth()), left: toP(m.monthlyFee) });
  } else if (r.planned) fors = r.schedule.filter(s => s.status !== "paid").map(s => ({ k: s.step, label: s.label, left: s.expected - s.received, pn: s.pn }));
  else if (m.type === "installments") fors = [{ k: "installment", label: "Installment", left: (r.schedule.find(s => s.status !== "paid") || {}).expected || 0 }];
  else fors = [{ k: r.received ? "payment" : "deposit", label: r.received ? "Payment" : "Deposit", left: Math.max(0, r.expected - r.received) }];
  if (!fors.length) fors = [{ k: r.planned ? (r.schedule[r.schedule.length - 1] || {}).step : "payment", label: "Extra payment", left: 0 }];
  if (!f.for || !fors.some(x => x.k === f.for)) { f.for = f.step && fors.some(x => x.k === f.step) ? f.step : fors[0].k }
  const chosen = fors.find(x => x.k === f.for) || fors[0];
  if (f.amount == null) f.amount = chosen.left ? chosen.left / 100 : "";
  if (!f.method) f.method = "InstaPay";
  if (f.holder == null) f.holder = m.hold ? FUND_HOLDER : me;
  f.files = f.files || [];
  const box = el("section", { class: "idea mform moneyinform" }, el("div", { class: "row" }, el("h3", {}, "Money in"), el("span", { class: "spacer" }), el("button", { class: "x", "aria-label": "Close", onclick: () => { moneyForm = null; render() } }, "✕")));
  const amt = el("input", { id: "mi-amount", class: "noteinput bigamt", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "How much?", value: f.amount, oninput: e => { f.amount = e.target.value } });
  box.append(el("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, amt, el("b", {}, cur)));
  if (cur !== "EGP") box.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, `1 ${cur} =`), el("input", { id: "mi-rate", class: "mini", type: "number", min: "0", step: "any", value: f.rate || m.rate || "", oninput: e => { f.rate = e.target.value } }), el("span", { class: "label" }, "EGP today")));
  box.append(el("div", { class: "tlabel" }, "What's it for?"), el("div", { class: "pickrow" }, fors.map(x => chip(f.for === x.k, x.label, () => { f.for = x.k; f.amount = x.left ? x.left / 100 : f.amount; render() }, x.left ? fmtCur(x.left, cur) + " left" : null))));
  box.append(el("div", { class: "tlabel" }, "How did they pay?"), el("div", { class: "pickrow" }, METHODS.map(x => chip(f.method === x, x, () => set("method", x)))));
  const who = [...new Set([me, ...teamOf(p)])];
  box.append(el("div", { class: "tlabel" }, "Who has the money now?"), el("div", { class: "pickrow" }, chip(f.holder === me, "Me", () => set("holder", me)), chip(f.holder === FUND_HOLDER, "The team fund", () => set("holder", FUND_HOLDER)),
    who.filter(u => u !== me).map(u => chip(f.holder === u, firstName(u), () => set("holder", u)))));
  const note = el("input", { id: "mi-note", class: "noteinput", maxlength: "160", placeholder: "Anything to remember? e.g. sent by Mr. Li, transfer ref 4471", value: f.note || "", oninput: e => { f.note = e.target.value } });
  const isFirst = chosen.pn === 1 || (!r.planned && !r.received);
  box.append(note, payFilesPicker(f, isFirst));
  const date = el("input", { id: "mi-date", type: "date", class: "mini", value: f.date || today, onchange: e => { f.date = e.target.value } });
  box.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Date"), date));
  if (m.hold) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "This project keeps its money in the team fund until you decide the split."));
  const save = () => {
    const a = Math.round((Number(f.amount) || 0) * 100) / 100;
    if (!(a > 0)) { toast("How much came in?"); amt.focus(); return }
    const rt = cur !== "EGP" ? Number(f.rate || m.rate) : null; if (cur !== "EGP" && !(rt > 0)) { toast(`Enter today's rate: how many EGP for 1 ${cur}`); return }
    const data = { amount: a, date: f.date || today, note: "", source: (f.note || "").trim(), by: me, at: Date.now(), method: f.method, heldBy: f.holder === FUND_HOLDER ? null : f.holder || null, inFund: f.holder === FUND_HOLDER };
    if (rt) { data.rate = rt; data.currency = cur }
    let label;
    if (m.type === "monthly") { if (f.for === "setup") { data.kind = "setup"; label = "Setup fee" } else { data.kind = "monthly"; data.month = f.for.split(":")[1]; label = "Monthly fee " + monthLabel(data.month) } }
    else if (r.planned) { const st = r.schedule.find(x => x.step === f.for) || r.schedule[0]; Object.assign(data, { kind: st.n === 1 ? "deposit" : "payment", step: st.step, stepLabel: st.label }); label = st.label }
    else { data.kind = f.for; label = chosen.label }
    const files = f.files || [], eid = uid();
    moneyForm = null;
    moneyUpd(p, { ["payments." + eid]: data }, `${label} ${fmtCur(toP(a), cur)}` + (rt ? ` @ ${rt}` : "") + (files.length ? ` (with ${files.length} file${files.length > 1 ? "s" : ""})` : ""), "entry", `${fmtCur(toP(a), cur)} added for ${label}`)
      .then(ok => { if (ok !== false && files.length) uploadPayPapers(p, eid, files) });
  };
  box.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: () => { moneyForm = null; render() } }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, f.amount ? `Add ${fmtCur(toP(Number(f.amount) || 0), cur)}` : "Add")));
  setTimeout(() => { const n = document.getElementById("mi-amount"); if (n && document.activeElement === document.body) n.focus() }, 0);
  return box;
}

// One plain sentence that says where the deal stands.
function moneySentence(p, r) {
  const m = p.money, f = v => fmtCur(v, r.currency);
  if (r.proposal) return "Proposal sent. Nothing is due until the client says yes.";
  if (m.type === "monthly") {
    const paid = r.schedule.filter(s => s.status === "paid" && s.label !== "Setup fee").length, late = r.monthsUnpaid;
    if (late) return `${late} month${late > 1 ? "s" : ""} not paid yet. Paid so far: ${paid} month${paid === 1 ? "" : "s"}.`;
    return paid ? `${paid} month${paid === 1 ? "" : "s"} paid. Everything is up to date.` : "No months paid yet.";
  }
  const left = Math.max(0, r.expected - r.received);
  if (r.expected && !left) return r.pending ? "Fully paid." : "Fully paid. The profit is split below.";
  if (r.planned || m.type === "installments") {
    const paid = r.schedule.filter(s => s.status === "paid"), next = r.schedule.find(s => s.status !== "paid");
    const a = paid.length ? `${paid.length > 2 ? paid.length + " payments" : paid.map(s => s.label).join(" and ")} paid (${f(paid.reduce((x, s) => x + s.received, 0))}). ` : r.received ? `${f(r.received)} paid so far. ` : "Nothing paid yet. ";
    const when = next ? (next.date ? fmtDate(next.date) : m.type === "installments" ? monthLabel(next.month) : "") : "";
    const b = next ? `Next: ${next.label}, ${f(next.expected - next.received)}${next.received ? " still to pay" : ""}${when ? (next.status === "late" ? ", was due " : ", due ") + when : ""}. ` : "";
    return a + b + `${f(left)} left in total.`;
  }
  if (!r.received) return "Nothing paid yet. Ask the client for the deposit, or set up a payment plan below.";
  return `${f(r.received)} paid so far. ${f(left)} is left.`;
}

// The payment plan of a one-time deal: each payment (deposit, final payment...) and the work it pays for.
let payPlanEdit = null, planDraft = null;
const pctOfPrice = (part, whole) => whole ? Math.round(part / whole * 100) : 0;
const PLAN_PRESETS = [[[50, 50], "50 / 50"], [[30, 70], "30 / 70"], [[40, 30, 30], "40 / 30 / 30"], [[100], "All upfront"]];
function presetSteps(price, pcts) {
  const n = pcts.length; let given = 0;
  return pcts.map((pc, i) => {
    const a = i === n - 1 ? Math.round((price - given) * 100) / 100 : Math.round(price * pc) / 100; given += a;
    return { id: uid(), label: n === 1 ? "Full payment" : i === 0 ? "Deposit" : i === n - 1 ? "Final payment" : `Payment ${i + 1}`, amount: a, date: "", covers: "" };
  });
}
function openPlanEditor(p) {
  const m = p.money, plan = planOf(m, p);
  const steps = plan.length ? plan.map(s => ({ id: s.id, label: s.label || "", amount: Number(s.amount) || 0, date: s.date || "", covers: s.covers || "" })) : presetSteps(Number(m.price) || 0, [50, 50]);
  const map = {}; for (const s of plan) for (const t of s.tasks || []) map[t] = s.id;
  planDraft = { pid: p.id, v: 0, steps, map }; payPlanEdit = p.id; render();
}
function savePlan(p, steps, map) {
  const cur = (p.money || {}).currency || "EGP";
  const plan = steps.map(s => ({ id: s.id, label: s.label, amount: s.amount, date: s.date || "", covers: (s.covers || "").trim(), tasks: Object.keys(map).filter(k => map[k] === s.id) }));
  const what = (planOf(p.money, p).length ? "Payment plan changed: " : "Payment plan set: ") + plan.map(s => `${s.label} ${fmtCur(toP(s.amount), cur)}${s.tasks.length ? ` (${s.tasks.length} task${s.tasks.length > 1 ? "s" : ""})` : ""}`).join(" · ");
  payPlanEdit = null; planDraft = null;
  moneyUpd(p, { "money.plan": plan }, what, "deal", "Payment plan saved");
}
/* ----- a deal in phases: the client works with us step by step, each phase with its own price and payments ----- */
// Which money phase a task phase finishes (a task phase belongs to one money phase at most).
const moneyPhaseFor = (p, tpid) => { const m = p && p.money; return isPhased(m) ? (m.phases || []).find(ph => ph && linkedPhases(ph).includes(tpid)) || null : null };
function setMoneyPhase(p, tpid, mpid) {
  const m = p.money, tp = getPhases(p).find(x => x.id === tpid), mp = (m.phases || []).find(x => x && x.id === mpid);
  const list = (m.phases || []).filter(Boolean).map(ph => ({ ...ph, phase: null, phases: [...linkedPhases(ph).filter(x => x !== tpid), ...(ph.id === mpid ? [tpid] : [])] }));
  savePhases(p, list, mp ? `Task phase ${tp ? tp.name : ""} finishes the money phase ${mp.name}` : `Task phase ${tp ? tp.name : ""} isn't tied to a money phase anymore`, mp ? `${tp ? tp.name : "It"} now finishes ${mp.name}` : "Unlinked");
}
// The task phases of a money phase, with how far along each one is
function taskPhaseProgress(p, ph) {
  const phs = getPhases(p), all = tasksOf(p);
  return linkedPhases(ph).map(id => phs.find(x => x.id === id)).filter(Boolean).map(tp => { const pr = progressOf(all.filter(t => t.phase === tp.id)); return { tp, pr } });
}
// Top of the Tasks tab: each money phase and the task phases that finish it
function moneyPhaseStrip(p) {
  const m = p.money; if (!isPhased(m)) return null;
  const r = moneyOf(p), can = canMoney(p), list = (m.phases || []).filter(Boolean);
  const box = el("section", { class: "mpstrip" }, el("div", { class: "row" }, el("b", {}, "Money phases"), el("span", { class: "spacer" }), el("button", { class: "linkbtn", onclick: () => { projTab = "money"; render(); scrollTo(0, 0) } }, "Open money")));
  for (const ph of list) {
    const [st, cls] = phaseStatus(ph, r.schedule.filter(x => x.part === ph.id)), tps = taskPhaseProgress(p, ph);
    box.append(el("div", { class: "mprow" + (ph.agreed ? "" : " later") }, el("span", { class: "mpname" }, "\u{1F4B0} " + (ph.name || "Phase")), el("span", { class: "mstat " + cls }, st),
      el("span", { class: "mptasks" }, tps.length ? tps.map(({ tp, pr }) => el("span", { class: "chip" + (pr.total && pr.done === pr.total ? " ok" : "") }, `${tp.name} ${pr.done}/${pr.total}`)) : el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "no task phases yet"))));
  }
  if (can && getPhases(p).some(tp => !moneyPhaseFor(p, tp.id))) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Choose which money phase each task phase finishes: tap Edit phases below, then pick it on each phase."));
  return box;
}
let phaseDraft = null;
const phaseStatus = (ph, steps) => { if (!ph.agreed) return ["Not agreed yet", "later"]; const exp = steps.reduce((a, x) => a + x.expected, 0), got = steps.reduce((a, x) => a + x.received, 0);
  return exp && got >= exp ? ["Fully paid", "paid"] : steps.some(x => x.status === "late") ? ["Payment late", "late"] : got ? ["Part paid", "due"] : ["Waiting for the deposit", "due"] };
// Turn a normal deal into phases: what's there now becomes phase 1, linked to the plan's first phase.
function toPhases(p) {
  const m = p.money, pl = planOf(m, p), phs = getPhases(p), id = uid();
  const steps = pl.length ? pl.map(st => ({ id: st.id, label: st.label || "", amount: Number(st.amount) || 0, date: st.date || "", covers: st.covers || "", tasks: (st.tasks || []).slice() })) : presetSteps(Number(m.price) || 0, [50, 50]).map(st => ({ ...st, tasks: [] }));
  const ph = { id, name: "Phase 1", phases: [], price: Number(m.price) || 0, agreed: true, steps };
  moneyUpd(p, { "money.phases": [ph], "money.plan": DEL() }, `The deal is now in phases. Phase 1: ${ph.name}, ${fmtCur(toP(ph.price), m.currency)}`, "deal", "Done. Add the next phase when the client agrees to it");
}
function savePhases(p, list, what, ok) {
  const m = p.money, price = Math.round(list.filter(ph => ph.agreed).reduce((a, ph) => a + (Number(ph.price) || 0), 0) * 100) / 100;
  phaseDraft = null; moneyUpd(p, { "money.phases": list, "money.price": price }, what, "deal", ok);
}
function phasesBlock(p, r) {
  const m = p.money, can = canMoney(p), f = v => fmtCur(v, r.currency), all = tasksOf(p), phs = getPhases(p), list = (m.phases || []).filter(Boolean);
  if (can && phaseDraft && phaseDraft.pid === p.id) return phaseEditor(p, r);
  const agreedN = list.filter(ph => ph.agreed).length;
  const sec = el("section", { class: "idea mplan" }, el("div", { class: "row" }, el("h3", {}, "Phases"), el("span", { class: "spacer" }), el("span", { class: "label" }, `${f(r.expected)} agreed · ${agreedN} of ${list.length} phase${list.length > 1 ? "s" : ""}`)),
    el("p", { style: "margin:0;font-size:14px" }, "The client works with us step by step. Each money phase has its own price and payments. It's separate from the task phases: you can say which task phases it pays for, or not. Add the next phase when the client agrees to it."));
  list.forEach((ph, i) => {
    const steps = r.schedule.filter(x => x.part === ph.id), [st, cls] = phaseStatus(ph, steps), got = steps.reduce((a, x) => a + x.received, 0);
    const link = taskPhaseProgress(p, ph).map(({ tp, pr }) => `${tp.name} ${pr.done}/${pr.total}${pr.total && pr.done === pr.total ? " ✓" : ""}`);
    const card = el("div", { class: "phasebox" + (ph.agreed ? "" : " later") },
      el("div", { class: "row", style: "gap:8px" }, el("span", { class: "phase-n" }, `${i + 1}/${list.length}`), el("b", { style: "font-size:16px" }, ph.name || "Phase " + (i + 1)), el("span", { class: "mstat " + cls }, st), el("span", { class: "spacer" }), el("b", {}, f(toP(ph.price)))),
      el("div", { class: "label", style: "text-transform:none;letter-spacing:0" }, [link.length ? "Task phases: " + link.join(", ") : null, ph.agreed && got ? `${f(got)} paid · ${f(Math.max(0, toP(ph.price) - got))} left` : null].filter(Boolean).join(" · ")));
    if (ph.agreed) steps.forEach(x => card.append(stepCard(p, r, x, all, ph)));
    else card.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Nothing is due until the client agrees to this phase. It's not part of the price yet."));
    const pt = (r.parts || {})[ph.id];
    if (pt && pt.payments.length) card.append(el("details", { class: "pstep-tasks" }, el("summary", {}, `Money from this phase: ${f(pt.received)} came in`),
      el("div", { style: "display:grid;gap:2px;margin-top:6px" }, pt.payments.map(x => el("div", { class: "hrow" }, el("span", { class: "hsign" }, "+"),
        el("div", { class: "hmain" }, el("div", {}, x.step + (x.source ? " · " + x.source : "")), el("div", { class: "label" }, [fmtDate(x.date), x.method, x.note].filter(Boolean).join(" · "))),
        el("span", { class: "hamt" }, f(x.amount))))),
      el("div", { class: "label", style: "margin-top:6px;text-transform:none;letter-spacing:0" }, [
        pt.fund ? `Team fund ${fmtEGP(pt.fund)}` : null,
        ...Object.entries(pt.people).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([u, v]) => `${u === me ? "You" : firstName(u)} ${fmtEGP(v)}`),
        r.holding ? "kept in the fund, not split yet" : !Object.values(pt.people).some(v => v > 0) && pt.received ? (r.byTasks ? "waiting for its tasks to be done" : "split once this phase is fully paid") : null].filter(Boolean).join(" · "))));
    if (can) card.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }),
      !ph.agreed ? el("button", { class: "btn small primary", onclick: () => savePhases(p, list.map(x => x.id === ph.id ? { ...x, agreed: true, agreedAt: Date.now() } : x), `The client agreed to ${ph.name}: ${f(toP(ph.price))}`, `${ph.name} is agreed. Its deposit is due now`) }, "The client agreed") : null,
      el("button", { class: "btn small", onclick: () => openPhaseEditor(p, ph) }, "Edit phase")));
    sec.append(card);
  });
  if (can) sec.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn small primary", onclick: () => openPhaseEditor(p, null) }, "+ Add the next phase")));
  if (r.planOff) sec.append(el("div", { class: "pstep-hint warn" }, "A phase's payments don't add up to its price. Edit that phase to fix it."));
  return sec;
}
function openPhaseEditor(p, ph) {
  const m = p.money, list = (m.phases || []).filter(Boolean), phs = getPhases(p);
  const base = ph || { id: uid(), name: `Phase ${list.length + 1}`, phases: [], price: 0, agreed: true, steps: [] };
  const steps = (ph && Array.isArray(ph.steps) && ph.steps.length ? ph.steps : presetSteps(Number(base.price) || 0, [50, 50])).map(st => ({ id: st.id, label: st.label || "", amount: Number(st.amount) || 0, date: st.date || "", covers: st.covers || "", tasks: (st.tasks || []).slice() }));
  phaseDraft = { pid: p.id, isNew: !ph, v: 0, id: base.id, name: base.name || "", links: linkedPhases(base).filter(x => phs.some(y => y.id === x)), price: Number(base.price) || 0, agreed: base.agreed !== false, steps };
  render(); scrollTo(0, 0);
}
// A project whose client page has a client on it: what planners name there shows on the client's page, live
function clientLiveFor(p) { const cp = typeof cpOf === "function" ? cpOf(p.id) : null; return cp && (cp.clients || []).length ? cp : null }
function clientSeesNote(p, what) {
  const cp = clientLiveFor(p); if (!cp) return null;
  const text = what === "pay"
    ? "Your client sees these payment names and amounts on their page as soon as you save (when Payments is on). Name them the way you'd say them to the client."
    : "Your client sees these phase names on their page as soon as you save: it shows which phase the team is working on. Name them the way you'd say them to the client.";
  return el("div", { class: "clientsees", role: "note" }, nIc("eye"), el("div", {}, el("b", {}, "The client sees this live"), el("span", {}, text)));
}
function phaseEditor(p, r) {
  const d = phaseDraft, m = p.money, cur = r.currency, f = x => fmtCur(toP(x), cur), phs = getPhases(p), v = d.v, list = (m.phases || []).filter(Boolean);
  const got = r.schedule.filter(x => x.part === d.id).reduce((a, x) => a + x.received, 0);
  const box = el("section", { class: "idea mform mplan" }, el("h3", {}, d.isNew ? "Add the next phase" : "Edit phase"), clientSeesNote(p, "pay"));
  const nm = el("input", { id: `phe-${v}-name`, class: "noteinput", maxlength: "50", placeholder: "e.g. Social media", value: d.name, oninput: e => { d.name = e.target.value } });
  const link = phs.length ? el("div", { class: "finders" }, phs.map(x => el("label", { class: "share" },
    el("input", { type: "checkbox", id: `phe-${v}-l-${x.id}`, checked: d.links.includes(x.id), onchange: e => { d.links = e.target.checked ? [...new Set([...d.links, x.id])] : d.links.filter(y => y !== x.id); render() } }), el("span", { class: "mname" }, x.name))))
    : el("span", { class: "label" }, "The project has no task phases yet");
  const price = el("input", { id: `phe-${v}-price`, class: "noteinput", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "Price of this phase", value: d.price || "", oninput: e => {
    const old = d.price || 0, sum = sumNow(); d.price = Number(e.target.value) || 0;
    // the payments follow the price while they still match it (or are empty): 50/50 stays 50/50
    if (sum === 0 || Math.abs(sum - old) < 0.009) { const n = d.steps.length; let given = 0;
      d.steps.forEach((st, i) => { const a = i === n - 1 ? Math.round((d.price - given) * 100) / 100 : Math.round((sum ? d.price * (Number(st.amount) || 0) / sum : d.price / n) * 100) / 100; given += a; st.amount = a; const inp = document.getElementById(`phe-${v}-${st.id}-a`); if (inp) inp.value = a || "" }) }
    updTotal() } });
  const agreed = el("input", { type: "checkbox", id: `phe-${v}-agreed`, checked: d.agreed, onchange: e => { d.agreed = e.target.checked } });
  box.append(fieldRow("Name", nm), fieldRow("Price", price, el("span", { class: "label" }, cur)),
    el("div", { class: "tlabel", style: "margin-top:4px" }, "Pays for the tasks in (optional)"), link,
    el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Money phases and task phases are separate. Tick any task phases this money pays for (one, several, or none). It only matters for task prices and for showing what each payment covers."),
    el("label", { class: "row", style: "gap:8px;font-size:14px" }, agreed, "The client agreed to this phase (untick if it's only offered: nothing is due yet)"));
  // its payments
  const total = el("div", { class: "label" }), pctEls = {};
  const sumNow = () => Math.round(d.steps.reduce((a, x) => a + (Number(x.amount) || 0), 0) * 100) / 100;
  const updTotal = () => { const t = sumNow(), diff = Math.round(((d.price || 0) - t) * 100) / 100;
    total.textContent = diff === 0 ? `Adds up to ${f(t)} ✓` : diff > 0 ? `${f(diff)} still to place (the phase is ${f(d.price || 0)})` : `${f(-diff)} too much (the phase is ${f(d.price || 0)})`;
    total.className = "label " + (diff === 0 ? "ok" : "bad");
    for (const st of d.steps) if (pctEls[st.id]) pctEls[st.id].textContent = d.price ? pctOfPrice(Number(st.amount) || 0, d.price) + "% of the phase" : "" };
  box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "Its payments"),
    el("div", { class: "row", style: "gap:6px" }, el("span", { class: "label" }, "Quick split:"), PLAN_PRESETS.map(([pc, l]) => el("button", { class: "btn small quiet", type: "button", onclick: () => {
      const ns = presetSteps(d.price || 0, pc); ns.forEach((x, i) => { const old = d.steps[Math.min(i, d.steps.length - 1)]; if (old && i < d.steps.length) x.tasks = old.tasks }); d.steps = ns; d.v++; render() } }, l))));
  d.steps.forEach((st, i) => {
    const sn = el("input", { id: `phe-${v}-${st.id}-n`, class: "noteinput", maxlength: "40", placeholder: i === 0 ? "Deposit" : "Final payment", value: st.label, oninput: e => { st.label = e.target.value } });
    const sa = el("input", { id: `phe-${v}-${st.id}-a`, class: "noteinput", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "Amount", value: st.amount || "", oninput: e => { st.amount = Number(e.target.value) || 0; updTotal() } });
    const sd = el("input", { id: `phe-${v}-${st.id}-d`, type: "date", class: "mini", value: st.date, onchange: e => { st.date = e.target.value } });
    pctEls[st.id] = el("span", { class: "label" });
    box.append(el("div", { class: "pedit" }, el("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, el("span", { class: "pstep-n" }, String(i + 1)), sn,
      d.steps.length > 1 ? el("button", { class: "x", type: "button", "aria-label": "Remove this payment", onclick: () => { d.steps.splice(i, 1); d.v++; render() } }, "✕") : null),
      fieldRow("Amount", sa, el("span", { class: "label" }, cur), pctEls[st.id]), fieldRow("Due by", sd, el("span", { class: "label" }, "optional"))));
  });
  box.append(el("div", { class: "row", style: "gap:8px" }, total, el("span", { class: "spacer" }),
    el("button", { class: "btn small", type: "button", onclick: () => { d.steps.push({ id: uid(), label: "", amount: Math.max(0, Math.round(((d.price || 0) - sumNow()) * 100) / 100), date: "", covers: "", tasks: [] }); d.v++; render() } }, "+ Add a payment")));
  const linkedTasks = d.links.length ? tasksOf(p).filter(t => d.links.includes(t.phase)) : [];
  if (d.links.length) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" },
    `It pays for the ${linkedTasks.length} task${linkedTasks.length === 1 ? "" : "s"} in ${d.links.map(x => "“" + ((phs.find(y => y.id === x) || {}).name || "") + "”").join(", ")} (the last payment covers them). New tasks you add there are included automatically.`));
  const save = () => {
    const n = d.steps.length, name = d.name.trim() || "Phase " + (list.length + 1);
    if (!(d.price > 0)) { toast("Enter the phase's price"); price.focus(); return }
    const steps = d.steps.map((x, i) => ({ id: x.id, label: (x.label || "").trim() || (n === 1 ? "Full payment" : i === 0 ? "Deposit" : i === n - 1 ? "Final payment" : `Payment ${i + 1}`), amount: Math.round((Number(x.amount) || 0) * 100) / 100, date: x.date || "", covers: x.covers || "", tasks: x.tasks || [] }));
    if (steps.some(x => !(x.amount > 0))) { toast("Every payment needs an amount bigger than 0"); return }
    if (Math.abs(sumNow() - d.price) > 0.009) { toast(`The payments need to add up to the phase's price (${f(d.price)})`); return }
    if (!d.agreed && got) { toast("Money already came in for this phase, so it stays agreed"); return }
    const ph = { id: d.id, name, phases: d.links, phase: null, price: Math.round(d.price * 100) / 100, agreed: d.agreed, steps };
    const old = list.find(x => x.id === d.id);
    const nl = old ? list.map(x => x.id === d.id ? { ...x, ...ph } : x) : [...list, { ...ph, addedAt: Date.now(), addedBy: me }];
    savePhases(p, nl, (old ? "Phase changed: " : "New phase: ") + `${name}, ${f(ph.price)}` + (ph.agreed ? "" : " (not agreed yet)") + ` · ${steps.map(x => `${x.label} ${f(x.amount)}`).join(" · ")}`, old ? "Phase saved" : `${name} added`);
  };
  const canDrop = !d.isNew && !got;
  box.append(el("div", { class: "row" },
    canDrop ? el("button", { class: "btn quiet small", type: "button", onclick: () => {
      const nl = list.filter(x => x.id !== d.id);
      if (!nl.length) { phaseDraft = null; moneyUpd(p, { "money.phases": DEL() }, "Phases removed", "deal", "Back to one price"); return }
      savePhases(p, nl, `Phase removed: ${d.name}`, "Phase removed") } }, "Remove this phase") : null,
    el("span", { class: "spacer" }), el("button", { class: "btn quiet", type: "button", onclick: () => { phaseDraft = null; render() } }, "Cancel"), el("button", { class: "btn primary", type: "button", onclick: save }, d.isNew ? "Add the phase" : "Save phase")));
  updTotal();
  return box;
}

// One payment of the plan: what it is, if it's paid, and the tasks it pays for.
function stepCard(p, r, s, all, ph) {
  const m = p.money, can = canMoney(p), f = v => fmtCur(v, r.currency), box = el("div");
  const whole = ph ? toP(ph.price) : r.expected, first = ph ? s.pn === 1 : s.n === 1, last = ph ? s.plast : s.n === r.schedule.length, many = ph ? !(first && last) : r.schedule.length > 1;
  const ts = s.tasks.map(id => all.find(t => t.id === id)).filter(Boolean), done = ts.filter(t => t.done).length;
    const left = s.expected - s.received, open = s.status !== "paid" && !r.proposal;
    const ask = open && ts.length > 0 && done === ts.length, early = open && first && done > 0;
    const [stTxt, stCls] = s.status === "paid" ? ["Paid", "paid"] : s.status === "late" ? ["Late", "late"] : ask ? ["Ask now", "due"] : s.received ? ["Part paid", "due"] : s.status === "due" && !r.proposal ? ["Waiting", "due"] : ["Later", "later"];
    const when = s.date ? `due ${fmtDate(s.date)}` : first && many ? "before we start" : last && many ? "at the end" : "";
    box.append(el("div", { class: "pstep " + s.status },
      el("div", { class: "pstep-top" },
        el("span", { class: "pstep-n" }, s.status === "paid" ? "✓" : String(ph ? s.pn : s.n)),
        el("div", { class: "pstep-main" }, el("b", {}, ph ? s.short : s.label), el("span", { class: "label" }, [`${pctOfPrice(s.expected, whole)}% of the ${ph ? "phase" : "price"}`, when].filter(Boolean).join(" · "))),
        el("div", { class: "pstep-amt" }, el("b", {}, f(s.expected)), s.received && s.status !== "paid" ? el("small", {}, `${f(s.received)} paid · ${f(left)} left`) : s.status !== "paid" ? el("small", {}, "not paid yet") : el("small", {}, "received")),
        el("span", { class: "mstat " + stCls }, stTxt)),
      s.status !== "paid" && s.received ? el("div", { class: "track thin" }, el("div", { class: "fill", style: `width:${pctOfPrice(s.received, s.expected)}%` })) : null,
      s.covers ? el("div", { class: "pstep-covers" }, el("span", { class: "label" }, "Covers "), s.covers) : null,
      ts.length ? el("details", { class: "pstep-tasks", open: s.status !== "paid" && ts.length <= 6 },
        el("summary", {}, `Pays for ${ts.length} task${ts.length > 1 ? "s" : ""} · ${done} done`),
        ts.map(t => el("div", { class: "ptask" + (t.done ? " done" : "") }, el("span", { class: "ptick" }, t.done ? "✓" : "○"), el("span", {}, t.text))))
        : ph && linkedPhases(ph).length && !s.plast ? el("div", { class: "label" }, first ? "Paid before the work on this phase starts." : "A payment along the way for this phase.")
        : null,
      ask ? el("div", { class: "pstep-hint ok" }, "All the work this payment covers is done. Time to ask the client for it.") : null,
      early ? el("div", { class: "pstep-hint warn" }, `${done} of its task${done > 1 ? "s are" : " is"} already done, but this payment hasn't come in yet.`) : null,
      can && open ? el("div", { class: "row" }, el("button", { class: "btn small" + (s.status === "due" || ask || s.status === "late" ? " primary" : ""), onclick: () => { moneyForm = { pid: p.id, kind: "pay", step: s.step, amount: left / 100 }; render(); setTimeout(() => { const n = document.getElementById("mf-amount"); if (n) n.scrollIntoView({ block: "center", behavior: "smooth" }) }, 0) } }, `+ Record ${s.label}`)) : null));
    return box.firstChild;
}
function planBlock(p, r) {
  const m = p.money, can = canMoney(p), f = v => fmtCur(v, r.currency);
  if (payPlanEdit === p.id && planDraft && planDraft.pid === p.id && can) return planEditor(p, r);
  const sec = el("section", { class: "idea mplan" }, el("div", { class: "row" }, el("h3", {}, "Payment plan"), el("span", { class: "spacer" }),
    can && r.planned ? el("button", { class: "btn small", onclick: () => openPlanEditor(p) }, "Edit plan") : null));
  if (!r.planned) {
    sec.append(el("p", { style: "margin:0;font-size:14px" }, "Split the price into payments, like a deposit and a final payment, and say which tasks each one pays for. Then everyone can see what the deposit covers and what's left."));
    if (can && toP(m.price) > 0) sec.append(el("div", { class: "row", style: "gap:8px" },
      el("button", { class: "btn small primary", onclick: () => openPlanEditor(p) }, "Set up the plan"),
      el("button", { class: "btn small", onclick: () => savePlan(p, presetSteps(Number(m.price), [50, 50]), {}) }, "Quick: 50% deposit, 50% at the end")),
      el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Working step by step, each phase with its own price?"), el("span", { class: "spacer" }),
        el("button", { class: "btn small quiet", onclick: () => toPhases(p) }, "Split the deal into phases")));
    else if (!can) sec.append(el("p", { class: "label", style: "margin:0" }, "No payment plan yet. The project's planners set it up."));
    return sec;
  }
  const all = tasksOf(p), linked = new Set();
  for (const s of r.schedule) { s.tasks.forEach(id => linked.add(id)); sec.append(stepCard(p, r, s, all)) }
  if (can) sec.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Is the client working with us step by step?"), el("span", { class: "spacer" }),
    el("button", { class: "btn small quiet", onclick: () => toPhases(p) }, "Split the deal into phases")));
  if (r.planOff) sec.append(el("div", { class: "pstep-hint warn" }, `The plan added up to ${f(r.expected - r.planOff)} but the price is ${f(r.expected)}, so the last payment was changed to match. Edit the plan to fix it.`));
  const un = all.filter(t => !linked.has(t.id));
  if (un.length && all.length) sec.append(el("details", { class: "pstep-tasks" }, el("summary", {}, `${un.length} task${un.length > 1 ? "s aren't" : " isn't"} linked to a payment`),
    un.map(t => el("div", { class: "ptask" + (t.done ? " done" : "") }, el("span", { class: "ptick" }, t.done ? "✓" : "○"), el("span", {}, t.text))),
    can ? el("button", { class: "btn small quiet", style: "margin-top:6px", onclick: () => openPlanEditor(p) }, "Link them") : null));
  return sec;
}
function planEditor(p, r) {
  const d = planDraft, m = p.money, cur = r.currency, price = Number(m.price) || 0, v = d.v, f = x => fmtCur(toP(x), cur);
  const box = el("section", { class: "idea mform mplan" }, el("h3", {}, "Payment plan"),
    el("p", { style: "margin:0;font-size:14px" }, `Split the price (${f(price)}) into payments. For each one, say what it pays for. Money that comes in fills them in order, deposit first.`));
  const applyPreset = pcts => {
    const oldIds = d.steps.map(s => s.id), ns = presetSteps(price, pcts);
    for (const k of Object.keys(d.map)) { const i = oldIds.indexOf(d.map[k]); if (i >= 0) d.map[k] = ns[Math.min(i, ns.length - 1)].id }
    d.steps = ns; d.v++; render();
  };
  box.append(el("div", { class: "row", style: "gap:6px" }, el("span", { class: "label" }, "Quick split:"), PLAN_PRESETS.map(([pc, l]) => el("button", { class: "btn small quiet", type: "button", onclick: () => applyPreset(pc) }, l))));
  const total = el("div", { class: "label" }), pctEls = {};
  const sumNow = () => Math.round(d.steps.reduce((a, x) => a + (Number(x.amount) || 0), 0) * 100) / 100;
  const updTotal = () => {
    const t = sumNow(), diff = Math.round((price - t) * 100) / 100;
    total.textContent = diff === 0 ? `Adds up to ${f(t)} ✓` : diff > 0 ? `${f(diff)} still to place (the price is ${f(price)})` : `${f(-diff)} too much (the price is ${f(price)})`;
    total.className = "label " + (diff === 0 ? "ok" : "bad");
    for (const s of d.steps) if (pctEls[s.id]) pctEls[s.id].textContent = price ? pctOfPrice(Number(s.amount) || 0, price) + "% of the price" : "";
  };
  d.steps.forEach((s, i) => {
    const nm = el("input", { id: `pl-${v}-${s.id}-name`, class: "noteinput", maxlength: "40", placeholder: i === 0 ? "Deposit" : "Final payment", value: s.label, oninput: e => { s.label = e.target.value }, onchange: () => render() });
    const amt = el("input", { id: `pl-${v}-${s.id}-amt`, class: "noteinput", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "Amount", value: s.amount || "", oninput: e => { s.amount = Number(e.target.value) || 0; updTotal() } });
    const pct = pctEls[s.id] = el("span", { class: "label" });
    const date = el("input", { id: `pl-${v}-${s.id}-date`, type: "date", class: "mini", value: s.date, onchange: e => { s.date = e.target.value } });
    const cov = el("input", { id: `pl-${v}-${s.id}-cov`, class: "noteinput", maxlength: "140", placeholder: "What it covers (optional), e.g. brand identity and the profile in English", value: s.covers, oninput: e => { s.covers = e.target.value } });
    box.append(el("div", { class: "pedit" },
      el("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, el("span", { class: "pstep-n" }, String(i + 1)), nm,
        d.steps.length > 1 ? el("button", { class: "x", type: "button", "aria-label": "Remove this payment", onclick: () => { for (const k of Object.keys(d.map)) if (d.map[k] === s.id) d.map[k] = ""; d.steps.splice(i, 1); d.v++; render() } }, "✕") : null),
      fieldRow("Amount", amt, el("span", { class: "label" }, cur), pct),
      fieldRow("Due by", date, el("span", { class: "label" }, "optional; after this date it shows as late")),
      cov));
  });
  box.append(el("div", { class: "row", style: "gap:8px" }, total, el("span", { class: "spacer" }),
    el("button", { class: "btn small", type: "button", onclick: () => { d.steps.push({ id: uid(), label: "", amount: Math.max(0, Math.round((price - sumNow()) * 100) / 100), date: "", covers: "" }); d.v++; render() } }, "+ Add a payment")));
  // which payment pays for each task
  const all = tasksOf(p);
  box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "Which payment pays for each task?"));
  if (!all.length) box.append(el("p", { class: "label", style: "margin:0" }, "This project has no tasks yet. Add them on the Plan tab and link them here later, or just write what each payment covers above."));
  else {
    const list = el("div", { class: "ptasks-edit" });
    const bulk = el("select", { class: "mini", "aria-label": "Link every unlinked task to", onchange: e => { if (!e.target.value) return; for (const t of all) if (!d.map[t.id]) d.map[t.id] = e.target.value; render() } },
      el("option", { value: "" }, "Link all unlinked tasks to…"), d.steps.map((s, i) => el("option", { value: s.id }, s.label || `Payment ${i + 1}`)));
    list.append(el("div", { class: "row", style: "gap:8px;margin-bottom:4px" }, bulk));
    for (const t of all) {
      const sel = el("select", { class: "mini", "aria-label": "Payment for: " + t.text, onchange: e => { d.map[t.id] = e.target.value } },
        el("option", { value: "" }, "Not linked"), d.steps.map((s, i) => el("option", { value: s.id }, s.label || `Payment ${i + 1}`)));
      sel.value = d.steps.some(s => s.id === d.map[t.id]) ? d.map[t.id] : "";
      list.append(el("div", { class: "ptask-edit" + (t.done ? " done" : "") }, el("span", { class: "ptick" }, t.done ? "✓" : "○"), el("span", { class: "ptask-t" }, t.text), sel));
    }
    box.append(list);
  }
  const save = () => {
    const n = d.steps.length;
    const steps = d.steps.map((s, i) => ({ ...s, label: (s.label || "").trim() || (n === 1 ? "Full payment" : i === 0 ? "Deposit" : i === n - 1 ? "Final payment" : `Payment ${i + 1}`), amount: Math.round((Number(s.amount) || 0) * 100) / 100 }));
    if (steps.some(s => !(s.amount > 0))) { toast("Every payment needs an amount bigger than 0"); return }
    if (Math.abs(sumNow() - price) > 0.009) { toast(`The payments need to add up to the price (${f(price)})`); return }
    const map = {}; for (const [k, x] of Object.entries(d.map)) if (x && steps.some(s => s.id === x)) map[k] = x;
    savePlan(p, steps, map);
  };
  box.append(el("div", { class: "row" },
    planOf(m, p).length ? el("button", { class: "btn quiet small", type: "button", onclick: () => { payPlanEdit = null; planDraft = null; moneyUpd(p, { "money.plan": DEL() }, "Payment plan removed", "deal", "Payment plan removed") } }, "Remove the plan") : null,
    el("span", { class: "spacer" }), el("button", { class: "btn quiet", type: "button", onclick: () => { payPlanEdit = null; planDraft = null; render() } }, "Cancel"), el("button", { class: "btn primary", type: "button", onclick: save }, "Save plan")));
  updTotal();
  return box;
}
// Money kept in the team fund for this project, until the team decides how to split it.
let holdDecide = null;
function holdBlock(p, r) {
  const m = p.money, can = canMoney(p), pays = Object.values(p.payments || {}).filter(x => x && x.amount != null).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const sec = el("section", { class: "idea holdcard" },
    el("div", { class: "row" }, el("h3", {}, "Kept in the team fund"), el("span", { class: "spacer" }), el("span", { class: "mstat due" }, "Not split yet")),
    el("div", { class: "bignum" }, fmtEGP(r.holdAmt)),
    el("p", { style: "margin:0;font-size:14px" }, `This money is in the team fund, written down as ${p.title}'s. It isn't the fund's own money and nobody has been paid from it yet. ` + (m.hold && m.hold.by ? `${m.hold.by === me ? "You" : firstName(m.hold.by)} chose to decide the split later${m.hold.at ? ", " + fmtDay(m.hold.at) : ""}.` : "")));
  if (pays.length) sec.append(el("div", { style: "display:grid;gap:2px" }, pays.map(x => el("div", { class: "hrow" }, el("span", { class: "hsign" }, "+"),
    el("div", { class: "hmain" }, el("div", {}, x.source || x.stepLabel || "Payment"), el("div", { class: "label" }, [fmtDate(x.date), x.method, x.inFund ? "in the team fund" : x.heldBy ? "with " + firstName(x.heldBy) : null].filter(Boolean).join(" · ")),
      payFilesOf(x).length ? payPapersRow(p, "hold" + (x.at || 0), payFilesOf(x), false) : null),
    el("span", { class: "hamt" }, fmtCur(toP(x.amount), m.currency))))));
  if (!can) { sec.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "The project's planners decide how it's split.")); return sec }
  if (holdDecide !== p.id) { sec.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: () => { holdDecide = p.id; render() } }, "Decide the split"))); return sec }
  // what each way would give, from the money that came in so far
  const R = rulesNow(), team = projTeam(p);
  const tryWay = v => computeMoney({ ...p, money: { ...m, hold: null, split: v } }, todayStr(), R, { team });
  const hasShares = Object.values(m.shares || {}).some(x => Number(x) > 0);
  sec.append(el("div", { class: "tlabel" }, "How should we split it?"));
  for (const [v, l, d] of SPLIT_WAYS.filter(w => w[0] !== "hold" && !(m.type === "monthly" && w[0] === "tasks"))) {
    const x = tryWay(v), ppl = Object.entries(x.people).filter(([, y]) => y.earned > 0).sort((a, b) => b[1].earned - a[1].earned);
    const now = [x.fund ? `fund ${fmtEGP(x.fund)}` : null, ...ppl.map(([u, y]) => `${firstName(u)} ${fmtEGP(y.earned)}`), x.taskHeld ? `${fmtEGP(x.taskHeld)} waits for tasks` : null, x.byPoints && x.points.held ? `${fmtEGP(x.points.held)} waits for tasks with a size to be done` : null, x.pending && !x.byPoints ? "split once the client has paid everything" : null].filter(Boolean).join(" · ");
    const blocked = v === "shares" && !hasShares;
    sec.append(el("div", { class: "way decide" }, el("span", { style: "flex:1;min-width:0;display:grid;gap:2px" }, el("b", {}, l), el("span", { class: "label" }, d), el("span", { class: "label" }, blocked ? "Set the shares in Edit deal first." : "From what came in so far: " + (now || "nothing yet"))),
      blocked ? el("button", { class: "btn small", onclick: () => { holdDecide = null; editDeal = p.id; dealSplitDraft[p.id] = "shares"; render() } }, "Set shares")
        : el("button", { class: "btn small primary", onclick: () => { holdDecide = null; moneyUpd(p, { "money.hold": DEL(), "money.split": v }, `Decided the split: ${l} (${fmtEGP(r.holdAmt)} was kept in the fund)`, "deal", "Decided. The money is split now") } }, "Use this")));
  }
  sec.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { holdDecide = null; render() } }, "Not yet")));
  return sec;
}

// Task prices: what each task is worth, grouped by the payment that pays for it.
let priceEdit = null, priceDraft = null;
function taskBuckets(p) {
  const m = p.money, plan = planOf(m, p), all = tasksOf(p);
  if (!plan.length) return [{ label: m.type === "installments" ? "The whole price" : "The price", amount: Number(m.price) || 0, tasks: all }];
  const ids = new Set(plan.flatMap(s => s.tasks || [])), later = laterTasks(m, p);
  return plan.map((s, i) => ({ label: s.label || `Payment ${i + 1}`, amount: Number(s.amount) || 0, tasks: all.filter(t => (s.tasks || []).includes(t.id) || (i === plan.length - 1 && !ids.has(t.id) && !later.has(t.id))) }));
}
function taskPricesBlock(p, r, held) {
  const m = p.money, can = canMoney(p), cur = r.currency, f = v => fmtCur(v, cur), all = tasksOf(p);
  const editing = can && priceEdit === p.id && priceDraft;
  const sec = el("section", { class: "idea tprices" }, el("div", { class: "row" }, el("h3", {}, "Task prices"), el("span", { class: "spacer" }),
    can && !editing && all.length ? el("button", { class: "btn small" + (r.priced ? "" : " primary"), onclick: () => { priceEdit = p.id; priceDraft = { ...(m.prices || {}) }; render() } }, r.priced ? "Edit prices" : "Set prices") : null));
  const price = toP(m.price);
  sec.append(el("p", { style: "margin:0;font-size:14px" }, r.priced
    ? `${f(r.priced)} of the ${f(price)} price is on tasks. A task pays whoever does it, once it's done and its payment is in. ${r.priced < price ? "The other " + f(price - r.priced) + " is shared by the team." : ""}`
    : "No task has a price yet, so the team shares everything" + (Object.keys(m.shares || {}).length ? " by the % shares." : " equally.") + (can ? " Give tasks a price so the people who do them earn them." : "")));
  if (held) sec.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "The money is still kept in the fund, so this shows what each task would get if you decide to split by task prices."));
  if (r.taskRate) sec.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, `After costs, the team fund and the finder, a task keeps about ${Math.round(r.taskRate * 100)}% of its price. A 1,000 ${cur} task ≈ ${fmtEGP(Math.round(100000 * r.taskRate))} for the people on it.`));
  if (!all.length) { sec.append(el("p", { class: "label", style: "margin:0" }, "Add tasks on the Tasks tab first.")); return sec }
  const buckets = taskBuckets(p);
  for (const b of buckets) {
    const bw = el("div", { class: "tpbucket" });
    const sumNow = () => b.tasks.reduce((a, t) => a + (Number((editing ? priceDraft : m.prices || {})[t.id]) || 0), 0);
    const head = el("div", { class: "row", style: "gap:8px" }, el("b", {}, b.label), el("span", { class: "label" }, f(toP(b.amount))), el("span", { class: "spacer" }));
    const left = el("span", { class: "label" });
    const updLeft = () => { const d = Math.round((b.amount - sumNow()) * 100) / 100; left.textContent = d > 0 ? `${f(toP(d))} not on a task` : d < 0 ? `${f(toP(-d))} too much` : "all on tasks ✓"; left.className = "label " + (d < 0 ? "bad" : d === 0 ? "ok" : "") };
    head.append(left);
    if (editing) head.append(el("button", { class: "btn small quiet", type: "button", title: "Shares what isn't priced yet equally over the tasks without a price", onclick: () => {
      const un = b.tasks.filter(t => !(Number(priceDraft[t.id]) > 0)); const rest = Math.round((b.amount - sumNow()) * 100) / 100;
      if (!un.length) { toast("Every task here already has a price"); return } if (rest <= 0) { toast("Nothing left to spread: this payment is already on tasks"); return }
      const each = Math.floor(rest / un.length * 100) / 100; un.forEach((t, i) => { priceDraft[t.id] = i === un.length - 1 ? Math.round((rest - each * (un.length - 1)) * 100) / 100 : each }); render() } }, "Spread over the rest"));
    bw.append(head);
    for (const t of b.tasks) {
      const info = r.tasks[t.id], who = assignees(t);
      const st = !info ? (t.done ? "Done · no price" : "") : info.status === "earned" ? "Earned" : info.status === "waiting" ? "Paid · waiting for it to be done" : info.status === "nobody" ? "Done · nobody on it" : t.done ? "Done · waiting for payment" : "Waiting for payment";
      let val;
      if (editing) { val = el("input", { id: `tp-${p.id}-${t.id}`, class: "mini pct", style: "width:90px", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "0", oninput: e => { const v = Number(e.target.value); if (v > 0) priceDraft[t.id] = v; else delete priceDraft[t.id]; updLeft() } });
        if (!val.value && priceDraft[t.id]) val.value = priceDraft[t.id] }
      else val = el("span", { class: "mval" }, info ? f(info.price) : "—");
      bw.append(el("div", { class: "tprow" + (t.done ? " done" : "") }, el("span", { class: "ptick" }, t.done ? "✓" : "○"),
        el("div", { class: "tpmain" }, el("div", {}, t.text), el("div", { class: "label" }, [who.length ? who.map(firstName).join(" & ") : "nobody on it yet", info ? (held ? "would get ≈ " + fmtEGP(info.status === "earned" ? info.share : info.est) : info.status === "earned" ? "got " + fmtEGP(info.share) : "≈ " + fmtEGP(info.est) + " to them") : null, held ? (t.done ? "Done" : "") : st].filter(Boolean).join(" · "))),
        val));
    }
    updLeft();
    sec.append(bw);
  }
  if (editing) sec.append(el("div", { class: "row" }, el("span", { class: "label" }, "Prices are in " + cur + ", as part of the client's price."), el("span", { class: "spacer" }),
    el("button", { class: "btn quiet", onclick: () => { priceEdit = null; priceDraft = null; render() } }, "Cancel"),
    el("button", { class: "btn primary", onclick: () => {
      const clean = {}; for (const [k, v] of Object.entries(priceDraft)) if (Number(v) > 0 && all.some(t => t.id === k)) clean[k] = Math.round(Number(v) * 100) / 100;
      const before = m.prices || {}, ch = all.filter(t => Number(before[t.id] || 0) !== Number(clean[t.id] || 0));
      priceEdit = null; priceDraft = null;
      if (!ch.length) { render(); return }
      moneyUpd(p, { "money.prices": clean }, "Task prices: " + ch.slice(0, 6).map(t => `${t.text.slice(0, 30)} ${clean[t.id] ? fmtCur(toP(clean[t.id]), cur) : "no price"}`).join(" · ") + (ch.length > 6 ? ` and ${ch.length - 6} more` : ""), "deal", "Prices saved");
    } }, "Save prices")));
  return sec;
}
// On a task's details: what it's worth and when the money comes.
function taskMoneyField(p, t) {
  const m = p.money; if (!m || m.split !== "tasks" || m.type === "monthly") return null;
  const r = taskMoneyOf(p), info = r.tasks[t.id], who = assignees(t), n = Math.max(1, who.length), cur = r.currency;
  const go = canMoney(p) ? el("button", { class: "linkbtn", onclick: () => { projTab = "money"; priceEdit = p.id; priceDraft = { ...(m.prices || {}) }; render(); scrollTo(0, 0) } }, info ? "Change the price" : "Give it a price") : null;
  if (!info) return el("span", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "No price. It's part of what the team shares."), go);
  const each = v => n > 1 ? `${fmtEGP(Math.floor(v / n))} each (${n} people)` : fmtEGP(v);
  const say = info.status === "earned" ? `Earned ${each(info.share)}.`
    : info.status === "waiting" ? `The client paid for it: ${each(info.share)} is waiting until it's ticked done.`
    : `Gets about ${each(info.est)} once it's done and the client has paid ${info.step ? "the " + info.step.toLowerCase() : "for it"}.`;
  return el("span", { style: "display:grid;gap:2px" }, el("span", {}, el("b", {}, fmtCur(info.price, cur)), " of the price. ", say), go);
}

// By points: what a point is worth, and everyone's points and money
const fmtPts = v => String(Math.round((v || 0) * 10) / 10);
function pointsBlock(p, r) {
  const P = r.points, m = p.money || {};
  const sec = el("section", { class: "idea" }, el("div", { class: "row" }, el("h3", {}, "Points"), el("span", { class: "spacer" }),
    el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, TASK_SIZES.map(z => `${z.id} ${z.pts}`).join(" · "))));
  const val = el("div", { class: "ptsvalue" });
  if (P.value) val.append(el("span", {}, "1 point ="), el("b", {}, fmtEGP(Math.floor(P.value))), el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, m.type === "monthly" ? "last month paid" : "right now"));
  if (m.type !== "monthly" && P.estValue && r.received < r.expected) val.append(el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, `${P.value ? "· " : ""}about ${fmtEGP(Math.floor(P.estValue))} a point when it's all paid and done`));
  if (!val.childNodes.length) val.append(el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "A point gets its value once money comes in and tasks with a size are done."));
  sec.append(val);
  sec.append(el("p", { class: "label", style: "margin:0 0 10px;text-transform:none;letter-spacing:0" },
    `${fmtPts(P.doneTotal)} of ${fmtPts(P.total)} points done` + (P.unsized ? ` · ${P.unsized} task${P.unsized > 1 ? "s" : ""} without a size` : "") +
    (m.type === "monthly" ? ". Each month's fee is shared by the points of the tasks finished that month." : ". Everything shared so far is split by the points done so far, so everyone always has their fair part.")));
  const rows = Object.entries(P.people).filter(([, v]) => v.pts || v.estPts || v.earned).sort((a, b) => b[1].pts - a[1].pts || b[1].estPts - a[1].estPts);
  if (rows.length) {
    const g = el("div", { class: "ptsgrid" }, el("span", { class: "hd" }, "Person"), el("span", { class: "hd num" }, "Points"), el("span", { class: "hd num" }, "From points (EGP)"));
    for (const [u, v] of rows) g.append(el("span", { class: "who" }, av(u), el("span", { class: "mname" }, name(u))),
      el("span", { class: "num" }, fmtPts(v.pts), v.estPts > v.pts ? el("small", { class: "label", style: "text-transform:none;letter-spacing:0" }, ` +${fmtPts(v.estPts - v.pts)} to do`) : null),
      el("span", { class: "num" }, fmtN(v.earned)));
    sec.append(g);
  } else sec.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Nobody has points yet. Give tasks a size and people, and points count once they're done."));
  if (m.type === "monthly") {
    const months = Object.entries(P.months).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
    if (months.length) sec.append(el("div", { class: "tlabel", style: "margin-top:12px" }, "By month"),
      ...months.map(([mm, x]) => el("div", { class: "mrow" }, el("span", { class: "mname" }, monthLabel(mm)), el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, x.pts ? `${fmtPts(x.pts)} pts · 1 point = ${fmtEGP(Math.floor(x.value))}` : "no points that month yet"), el("span", { class: "mval" }, fmtN(x.pot)))));
  }
  return sec;
}

// Where the money goes, step by step, in the order the rules take it.
function flowList(p, r) {
  const m = p.money, pv = r.pending && !r.byPoints ? r.preview : null, fl = pv ? pv.flow : r.flow, whole = pv ? pv.whole : r.receivedEGP;
  const wrap = el("div", { class: "flow" });
  if (r.byPoints) {
    // by points: costs, then the finder's fee, then the fund, then points
    const prow = (sign, label, sub, amt, cls) => el("div", { class: "frow" + (cls ? " " + cls : "") },
      el("span", { class: "fsign" }, sign), el("div", { class: "fmain" }, el("div", {}, label), sub ? el("div", { class: "label" }, sub) : null),
      el("span", { class: "famt" }, fmtN(amt), whole && sign === "−" ? el("small", {}, ` ${pctOfPrice(amt, whole)}%`) : null));
    const fc = r.finderCase, who = [r.partner ? r.partner.name : null, ...r.finders.map(firstName)].filter(Boolean);
    wrap.append(prow("", "Money in so far", r.currency !== "EGP" ? "at each payment's rate" : null, whole, "fin"));
    if (fl.costs) wrap.append(prow("−", "Costs paid back", "to whoever paid from their own pocket", fl.costs));
    if (fl.finder || fl.partner) wrap.append(prow("−", `Finder's fee (${r.findPct}%)`, (fc ? fc.from + ", " + (fc.closer === "Ardent" ? "Ardent closed it" : "they closed it") : "") + (r.finderTeam && !who.length ? ", goes to the team fund" : who.length ? ", to " + who.join(" & ") : ""), fl.finder + fl.partner));
    wrap.append(prow("−", `Team fund (${r.fundPct}%)`, "of what's left, for the office and our subscriptions", fl.fund));
    wrap.append(prow("=", "Shared by points", r.points && r.points.value ? `1 point = ${fmtEGP(Math.floor(r.points.value))} right now` : "once tasks with a size are done", fl.shares, "fout"));
    return wrap;
  }
  const share = Object.entries((m.type === "monthly" ? m.monthlyShares : null) || m.shares || {}).filter(([, v]) => Number(v) > 0).map(([u, v]) => `${firstName(u)} ${v}%`).join(" · ");
  const finderTo = r.finderTeam ? "goes to the team fund" : r.finders.length ? "to " + r.finders.map(firstName).join(" & ") : "";
  const row = (sign, label, sub, amt, cls) => el("div", { class: "frow" + (cls ? " " + cls : "") },
    el("span", { class: "fsign" }, sign), el("div", { class: "fmain" }, el("div", {}, label), sub ? el("div", { class: "label" }, sub) : null),
    el("span", { class: "famt" }, fmtN(amt), whole && sign === "−" ? el("small", {}, ` ${pctOfPrice(amt, whole)}%`) : null));
  if (pv) wrap.append(el("p", { class: "label", style: "margin:0 0 6px" }, "The profit is split once the client has paid everything. If nothing else is spent, it will go like this:"));
  wrap.append(row("", pv ? "The full price" : "Money in so far", pv ? null : r.currency !== "EGP" ? "at each payment's rate" : null, whole, "fin"));
  if (fl.costs) wrap.append(row("−", "Costs paid back", "to whoever paid from their own pocket", fl.costs));
  if (fl.partner) wrap.append(row("−", `Partner: ${r.partner ? r.partner.name : "partner"}`, r.partner && r.partner.mode === "fixed" ? `fixed ${fmtEGP(toP(r.partner.value))} for bringing the client` : `${r.partner ? r.partner.value : ""}% for bringing the client`, fl.partner));
  if (fl.fund || !fl.shares) wrap.append(row("−", `Team fund (${r.fundPct}%)`, "saved for the office and our subscriptions", fl.fund));
  if (fl.finder) wrap.append(row("−", `Finder's fee (${r.findPct}%)`, "for bringing the client" + (finderTo ? ", " + finderTo : ""), fl.finder));
  if (r.holding) { wrap.append(row("=", "Kept in the team fund for this project", "not split yet: the planners decide how", r.holdAmt, "fout")); return wrap }
  const restBy = share ? "the rest by shares: " + share : "the rest equally by the project's team";
  if (r.byFund) { wrap.append(row("=", "To the team fund", "this project's money all goes to the fund", fl.fund, "fout")); return wrap }
  wrap.append(row("=", "Shared by the team", r.byTasks ? (r.priced ? `by task prices (${fmtCur(r.priced, r.currency)} of the price is priced), ${restBy}` : "by task prices: no task has a price yet, so " + restBy.replace("the rest ", "")) : share ? "by shares: " + share : "no shares set yet", fl.shares, "fout"));
  if (pv && r.received) wrap.append(el("p", { class: "label", style: "margin:8px 0 0" }, `So far: ${fmtEGP(r.receivedEGP)} came in.` + (r.flow.costs ? ` ${fmtEGP(r.flow.costs)} paid back costs.` : "") + (r.held ? ` ${fmtEGP(r.held)} is waiting to be split.` : "")));
  return wrap;
}

function moneyLogBlock(p) {
  const log = Object.entries(p.moneyLog || {}).filter(([, v]) => v && v.at).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at);
  if (!log.length) return null;
  return el("details", { class: "removed" }, el("summary", {}, `Change log (${log.length})`),
    el("div", { class: "idea", style: "gap:0;margin-top:10px" }, log.slice(0, 60).map(x => el("div", { class: "hrow" + (x.kind === "deal" ? " logdeal" : "") }, av(x.by),
      el("div", { class: "hmain" }, el("div", {}, x.what), el("div", { class: "label" }, `${name(x.by)} \u00b7 ${ago(x.at)}`))))));
}
function teamChoices(p) { return [...new Set([...teamOf(p), ...teamIds()])] }   // finders can be anyone on the team; shares only the project's team
function personSelect(id, value, p, blank) {
  const s = el("select", { class: "mini", id }, blank ? el("option", { value: "" }, blank) : null, teamChoices(p).map(u => el("option", { value: u }, realName(u) || "Someone")));
  s.value = value || ""; return s;
}
function moneyInput(id, value, ph) { const i = el("input", { id, class: "noteinput", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: ph || "0" }); if (value != null && value !== "" && !i.value) i.value = value; return i }
function fieldRow(label, ...kids) { return el("div", { class: "tfield" }, el("span", { class: "tlabel" }, label), el("div", { class: "tval" }, ...kids)) }

function moneyEntryForm(p, r) {
  const m = p.money, f = moneyForm, today = todayStr();
  const cur = m.currency || "EGP";
  const amount = moneyInput("mf-amount", f.amount != null ? f.amount : (f.kind === "pay" && m.type === "monthly" ? m.monthlyFee : ""), f.kind === "pay" ? "Amount in " + cur : "Amount in EGP");
  const rate = f.kind === "pay" && cur !== "EGP" ? moneyInput("mf-rate", m.rate || "", "EGP for 1 " + cur) : null;
  const date = el("input", { id: "mf-date", type: "date", class: "mini", value: today });
  const note = el("input", { id: "mf-note", class: "noteinput", maxlength: "120", placeholder: "Note (optional)" });
  const box = el("section", { class: "idea mform" });
  const close = () => { moneyForm = null; render() };
  let kindSel, monthSel, method, held, source, whatIn, paidBy, adKind, to, from;
  if (f.kind === "pay") {
    box.append(el("h3", {}, "Payment received"));
    const kinds = m.type === "monthly" ? [["monthly", "Monthly fee"], ["setup", "Setup fee"]] : m.type === "installments" ? [["installment", "Installment"]] : r.planned ? r.schedule.map(s => [s.step, `${s.label} (${fmtCur(s.expected - s.received, cur)} left)`]) : [["deposit", "Deposit"], ["payment", "Payment"]];
    kindSel = el("select", { class: "mini", id: "mf-kind" }, kinds.map(([v, l]) => el("option", { value: v }, l)));
    if (r.planned) {
      const first = r.schedule.find(s => s.status !== "paid") || r.schedule[r.schedule.length - 1];
      kindSel.value = f.step && r.schedule.some(s => s.step === f.step) ? f.step : first.step;
      if (!f.amount && first && !amount.value) amount.value = (first.expected - first.received) / 100 || "";
      kindSel.addEventListener("change", () => { const s = r.schedule.find(x => x.step === kindSel.value); if (s) amount.value = (s.expected - s.received) / 100 || "" });
    } else if (m.type === "one" && r.received > 0) kindSel.value = "payment";
    if (m.type === "monthly") {
      const unpaid = r.schedule.filter(s => s.month && s.label.match(/^\d{4}-\d{2}$/) && s.status !== "paid");
      const opts = [...new Set([...unpaid.map(s => s.month), thisMonth()])].sort();
      monthSel = el("select", { class: "mini", id: "mf-month" }, opts.map(x => el("option", { value: x }, monthLabel(x))));
      monthSel.value = unpaid.length ? unpaid[0].month : thisMonth();
      if (toP(m.setupFee) && !r.schedule.find(s => s.label === "Setup fee" && s.status === "paid") && !f.amount) { kindSel.value = "setup"; amount.value = m.setupFee }
      kindSel.addEventListener("change", () => { monthSel.parentElement.parentElement.hidden = kindSel.value !== "monthly"; amount.value = kindSel.value === "setup" ? m.setupFee || "" : m.monthlyFee || "" });
    }
    method = el("select", { class: "mini", id: "mf-method" }, METHODS.map(x => el("option", { value: x }, x)));
    held = personSelect("mf-held", m.hold ? FUND_HOLDER : me, p);
    held.prepend(el("option", { value: FUND_HOLDER }, "The team fund")); held.value = m.hold ? FUND_HOLDER : me;
    source = el("input", { id: "mf-source", class: "noteinput", maxlength: "160", placeholder: "How we got it, e.g. deposit from Mr. Li for the brand identity, sent to Mohammed's InstaPay" });
    box.append(fieldRow("Amount", amount, cur !== "EGP" ? el("span", { class: "label" }, cur) : null), rate ? fieldRow("Rate today", el("span", { class: "label" }, `1 ${cur} =`), rate, el("span", { class: "label" }, "EGP")) : null,
      fieldRow(r.planned ? "For" : "Type", kindSel), monthSel ? fieldRow("For month", monthSel) : null, fieldRow("Date", date), fieldRow("How", method), fieldRow("Who has it", held), source, note,
      fieldRow("Papers", payFilesPicker(f, (() => { const st = r.planned ? r.schedule.find(x => x.step === (f.step || (r.schedule.find(y => y.status !== "paid") || {}).step)) : null; return st ? st.pn === 1 : !r.received })())),
      m.hold ? el("p", { class: "label", style: "margin:0" }, "This project keeps its money in the team fund until you decide the split. It's written down as this project's money, not the fund's own.") : null);
    if (monthSel && kindSel.value !== "monthly") monthSel.parentElement.parentElement.hidden = true;
  } else if (f.kind === "cost") {
    box.append(el("h3", {}, "We spent money"));
    whatIn = el("input", { id: "mf-what", class: "noteinput", maxlength: "80", placeholder: "What was it? e.g. camera rental" });
    paidBy = personSelect("mf-paidby", me, p);
    box.append(fieldRow("Amount", amount, el("span", { class: "label" }, "EGP")), fieldRow("For", whatIn), fieldRow("Paid by", paidBy), fieldRow("Date", date), note,
      el("p", { class: "label", style: "margin:0" }, "Whoever paid gets it back first, from the next money that comes in."));
  } else if (f.kind === "ads") {
    box.append(el("h3", {}, "Client's ad money"));
    adKind = el("select", { class: "mini", id: "mf-adkind" }, el("option", { value: "in" }, "Received from the client"), el("option", { value: "spent" }, "Spent on ads"));
    box.append(fieldRow("Amount", amount), fieldRow("Type", adKind), fieldRow("Date", date), note);
  } else if (f.kind === "payout" && f.toPartner) {
    box.append(el("h3", {}, "Commission paid to the partner"));
    from = personSelect("mf-from", me, p, "Not recorded");
    box.append(fieldRow("To", el("b", {}, ((m.partner || {}).name || f.toPartner) + " (partner)")), fieldRow("Amount", amount, el("span", { class: "label" }, "EGP")), fieldRow("From", from), fieldRow("Date", date), note);
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
    let what;
    if (f.kind === "pay") { coll = "payments"; data = { ...base, kind: kindSel.value, method: method.value, heldBy: held.value === FUND_HOLDER ? null : held.value || null, inFund: held.value === FUND_HOLDER, source: source.value.trim() }; if (kindSel.value === "monthly") data.month = monthSel.value; ok = "Payment added";
      if (r.planned) { const s = r.schedule.find(x => x.step === kindSel.value) || r.schedule[0]; Object.assign(data, { kind: s.n === 1 ? "deposit" : "payment", step: s.step, stepLabel: s.label }); ok = s.label + " added" }
      if (rate) { const rt = Number(rate.value); if (!(rt > 0)) { toast(`Enter today's rate: how many EGP for 1 ${cur}`); rate.focus(); return } data.rate = rt; data.currency = cur }
      what = `${data.stepLabel || "Payment"} ${fmtCur(toP(a), cur)}` + (rate ? ` @ ${data.rate}` : "") }
    else if (f.kind === "cost") { coll = "costs"; data = { ...base, what: whatIn.value.trim(), paidBy: paidBy.value || null }; ok = "Cost added"; what = `Cost ${fmtEGP(toP(a))}: ${data.what || "spent"}` }
    else if (f.kind === "ads") { coll = "ads"; data = { ...base, kind: adKind.value }; ok = "Ad money added"; what = `Ad money ${adKind.value === "spent" ? "spent" : "received"} ${fmtCur(toP(a), cur)}` }
    else if (f.toPartner) { coll = "payouts"; data = { ...base, toPartner: f.toPartner, from: from.value || null }; ok = "Marked as paid to the partner"; what = `Paid ${fmtEGP(toP(a))} to the partner` }
    else { coll = "payouts"; data = { ...base, to: to.value, from: from.value || null }; ok = `Marked as paid to ${firstName(to.value)}`; what = `Paid ${fmtEGP(toP(a))} to ${firstName(to.value)}` }
    const files = f.kind === "pay" ? (f.files || []) : [], eid = uid();
    if (files.length) data.files = {};
    moneyForm = null;
    moneyUpd(p, { [coll + "." + eid]: data }, what + (files.length ? ` (with ${files.length} file${files.length > 1 ? "s" : ""})` : ""), "entry", ok)
      .then(okd => { if (okd !== false && files.length) uploadPayPapers(p, eid, files) });
  };
  box.append(el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("button", { class: "btn primary", onclick: save }, "Save")));
  setTimeout(() => { if (!amount.value) amount.focus() }, 0);
  return box;
}

// The papers that go with a payment: the signed quotation with the deposit, a receipt, a transfer screenshot.
const PAPER_KINDS = [["quote", "Our quotation", "The one we sent"], ["signed", "Signed quotation", "Signed by the client"], ["receipt", "Receipt / other", "Transfer screenshot, receipt…"]];
const paperKind = f => PAPER_KINDS.some(k => k[0] === f.kind) ? f.kind : "receipt";
function payFilesPicker(f, first) {
  f.files = (f.files || []).map(x => x && x.file ? x : { file: x, kind: "receipt" });
  const wrap = el("div", { class: "papers" });
  for (const [k, label, sub] of PAPER_KINDS) {
    const mine = f.files.map((x, i) => ({ ...x, i })).filter(x => x.kind === k);
    wrap.append(el("div", { class: "paperslot" + (mine.length ? " has" : "") }, el("b", {}, label), el("span", { class: "label" }, sub),
      el("div", { class: "links" }, mine.map(x => el("span", { class: "linkwrap" }, el("span", { class: "linkchip filechip", title: x.file.name }, el("span", { class: "fext" }, extOf(x.file.name)), el("span", {}, x.file.name)),
        el("button", { class: "linkdel", type: "button", "aria-label": "Remove " + x.file.name, onclick: () => { f.files.splice(x.i, 1); render() } }, "✕"))),
        el("button", { class: "linkchip addlink", type: "button", onclick: () => pickFiles(list => { f.files.push(...list.map(file => ({ file, kind: k }))); render() }) }, mine.length ? "+ Another" : "+ Add"))));
  }
  return el("div", { style: "display:grid;gap:6px" }, el("div", { class: "tlabel" }, first ? "Papers: the quotation we sent and the one he signed" : "Papers (optional)"), wrap,
    el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "PDFs or photos, up to 10 MB each."));
}
// Upload a payment's papers one kind after another, each file remembering which kind it is.
async function uploadPayPapers(p, eid, list) {
  for (const [k] of PAPER_KINDS) {
    const files = list.filter(x => (x.kind || "receipt") === k).map(x => x.file || x);
    if (files.length) await uploadFilesTo("pay-" + eid, files, file => upd(p.id, { [`payments.${eid}.files.${file.id}`]: { ...file, kind: k } }), "the payment");
  }
}
// A payment's papers, by kind. Planners can add more later.
function payPapersRow(p, pid, files, can) {
  const row = el("div", { class: "paperrow" });
  for (const [k, label] of PAPER_KINDS) {
    const mine = files.filter(f => paperKind(f) === k);
    if (!mine.length && !can) continue;
    row.append(el("div", { class: "papergroup" }, el("span", { class: "label" }, label),
      fileRow(mine, "pay-" + pid + "-" + k, f => can && (f.by === me || isAdmin), f => upd(p.id, { [`payments.${pid}.files.${f.id}`]: DEL() }).then(() => dropFileParts(f)),
        can ? list => uploadFilesTo("pay-" + pid + "-" + k, list, file => upd(p.id, { [`payments.${pid}.files.${file.id}`]: { ...file, kind: k } }), "the payment") : null)));
  }
  return row.childNodes.length ? row : null;
}
const payFilesOf = x => Object.values((x && x.files) || {}).filter(f => f && f.id && f.parts).sort((a, b) => (a.at || 0) - (b.at || 0));

// share editor: percentages that must add up to 100
function sharesEditor(prefix, p, current, suggestBtn, optional) {
  const wrap = el("div", { class: "shares" });
  const ids = teamPick(p, Object.keys(current || {}).filter(u => Number((current || {})[u]) > 0));
  const inputs = {};
  const total = el("span", { class: "label" });
  const upd8 = () => { const t = ids.reduce((s, u) => s + (Number(inputs[u].value) || 0), 0); if (optional && !t) { total.textContent = "Empty: shared equally by the team"; total.className = "label ok"; return } total.textContent = `Total ${t}%` + (t === 100 ? " ✓" : " (needs to be 100%)"); total.className = "label" + (t === 100 ? " ok" : " bad") };
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

let dealTypeDraft = {}, dealCurDraft = {}, dealSplitDraft = {}, dealCaseDraft = {}, moreOptsOpen = {};
const SPLIT_WAYS = [
  ["points", "By points", "Every task has a size: S 1, M 3, L 8, XL 15 points. Whoever does it earns its points once it's done and checked. After costs, the finder's fee and the team fund, the money is shared by points."],
  ["tasks", "By task prices", "Whoever does a priced task earns it once it's done and paid for. The unpriced part is shared by the team."],
  ["shares", "By % shares", "Each person on the project's team gets the % you type."],
  ["fund", "All to the team fund", "After costs, the partner and the finder, everything goes to the team fund."],
  ["hold", "Keep it in the fund, decide later", "The money waits in the team fund, written as this project's. Nobody is paid from it until you decide how to split it."]];
function dealForm(p) {
  const m = p.money || {}, R = rulesNow();
  const type = dealTypeDraft[p.id] || m.type || "one";
  const box = el("section", { class: "idea mform" }, el("h3", {}, m.type ? "Edit the deal" : "Set up the deal"),
    el("p", { style: "margin:0;font-size:14px" }, "How the client pays, and how the money is shared. Everyone on the team can see this."));
  box.append(el("div", { class: "seg seg-wide", role: "group", "aria-label": "Deal type" }, DEAL_TYPES.map(([v, l]) => el("button", { type: "button", "aria-pressed": String(type === v), onclick: () => { dealTypeDraft[p.id] = v; render() } }, l))));
  box.append(el("p", { class: "label", style: "margin:0" }, { one: "One price, usually a deposit first and the rest at the end. With % shares it's split when fully paid; with task prices, task by task as each payment comes in.", monthly: "A fee every month (like running Google Ads), plus an optional setup fee. Split every month.", installments: "One total price paid in equal monthly payments. Split as each payment arrives." }[type]));
  const client = el("input", { id: "deal-client", class: "noteinput", maxlength: "80", placeholder: "Client name (optional)" }); if (!client.value) client.value = m.client || p.client || "";
  const stage = el("select", { class: "mini", id: "deal-stage" }, STAGES.map(([v, l]) => el("option", { value: v }, l))); stage.value = m.stage || "agreed";
  const more = el("details", { class: "moreopts", open: !!moreOptsOpen[p.id], ontoggle: e => { moreOptsOpen[p.id] = e.target.open } }, el("summary", {}, "More options: client, stage, currency, who brought it, partner, team fund"));
  more.append(fieldRow("Client", client), fieldRow("Stage", stage));
  const cur = dealCurDraft[p.id] || m.currency || "EGP";
  const curSel = el("select", { class: "mini", id: "deal-cur", onchange: e => { dealCurDraft[p.id] = e.target.value; render() } }, CURRENCIES.map(c => el("option", { value: c, selected: c === cur }, c)));
  const rateIn = cur !== "EGP" ? moneyInput("deal-rate", m.rate || "", "EGP for 1 " + cur) : null;
  more.append(fieldRow("Currency", curSel, rateIn ? el("span", { class: "label" }, `1 ${cur} =`) : null, rateIn, rateIn ? el("span", { class: "label" }, "EGP (today's rate; each payment saves its own)") : el("span", { class: "label" }, "The client pays in this")));
  const price = moneyInput("deal-price", m.price, "Total price in " + cur);
  const fee = moneyInput("deal-fee", m.monthlyFee, "Monthly fee in " + cur), setup = moneyInput("deal-setup", m.setupFee, "Setup fee (optional)");
  const months = el("input", { id: "deal-n", class: "mini", type: "number", min: "2", max: "36", step: "1", value: m.installments || 3 });
  const start = el("input", { id: "deal-start", class: "mini", type: "month", value: m.startMonth || thisMonth() });
  const end = el("input", { id: "deal-end", class: "mini", type: "month", value: m.endMonth || "" });
  const dueDay = el("input", { id: "deal-due", class: "mini", type: "number", min: "1", max: "28", step: "1", value: m.dueDay || 5 });
  const ads = el("input", { id: "deal-ads", type: "checkbox", checked: !!m.adBudget });
  if (type === "one" && isPhased(m)) box.append(fieldRow("Price", el("b", {}, fmtCur(toP(phasesPrice(m)), cur)), el("span", { class: "label" }, "from the agreed phases. Change prices on the Money tab, in each phase.")));
  else if (type === "one") box.append(fieldRow("Price", price), el("p", { class: "label", style: "margin:0" }, "After saving, set up the payment plan on the Money tab: the deposit, the rest, and which tasks each one pays for. Working step by step? Split the deal into phases there."));
  if (type === "installments") box.append(fieldRow("Total price", price), fieldRow("Number of months", months), fieldRow("First payment", start), fieldRow("Due by day", dueDay));
  if (type === "monthly") box.append(fieldRow("Monthly fee", fee), fieldRow("Setup fee", setup), fieldRow("Starts", start), fieldRow("Ends", end, el("span", { class: "label" }, "leave empty if ongoing")), fieldRow("Due by day", dueDay),
    el("label", { class: "row", style: "gap:8px;font-size:14px" }, ads, "The client also pays their ad budget through us (tracked separately, never split)"));

  // how the team's money is shared: by task prices, by % shares, all to the fund, or kept in the fund until we decide
  let split = dealSplitDraft[p.id] || (m.hold ? "hold" : m.split) || (m.type ? "shares" : "points");
  if (type === "monthly" && split === "tasks") split = "shares";
  box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "How the team's money is shared"),
    el("div", { class: "waylist", role: "radiogroup", "aria-label": "How the team's money is shared" }, SPLIT_WAYS.filter(w => !(type === "monthly" && w[0] === "tasks")).map(([v, l, d]) =>
      el("button", { type: "button", role: "radio", class: "way", "aria-checked": String(split === v), onclick: () => { dealSplitDraft[p.id] = v; render() } }, el("span", { class: "waydot" }), el("span", {}, el("b", {}, l), el("span", { class: "label" }, d))))));
  const sharesOptional = split !== "shares", byPts = split === "points";
  const shLabel = el("div", { class: "tlabel", style: "margin-top:6px" }, type === "monthly" ? "Who built it (setup fee shares)" : split === "tasks" ? "Shares for the unpriced part (optional)" : split === "shares" ? "Who gets what (shares)" : "Shares (optional, for later)");
  const shares = sharesEditor("sh-" + p.id, p, m.shares, true, sharesOptional);
  // by points, nobody types shares: the points decide. (Old shares are kept, in case the deal changes back.)
  if (byPts) box.append(el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, type === "monthly"
    ? "The setup fee is shared by all the points; each month's fee by the points of the tasks finished that month. Planners give each task a size, and the team agrees on it."
    : "Everything that comes in is shared by the points done so far. Planners give each task a size, and the team agrees on it."));
  else box.append(shLabel, shares);
  let mshares = null;
  if (type === "monthly") { mshares = sharesEditor("msh-" + p.id, p, m.monthlyShares || m.shares, false, byPts); if (!byPts) box.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "Who runs it each month (monthly fee shares)"), mshares, el("p", { class: "label", style: "margin:0" }, "You can change this for a single month later with “Who worked?”.")) }
  // the finder's fee by how the client came (points deals)
  const caseOf = el("div", { class: "casetable waylist", role: "radiogroup", "aria-label": "How the client came" });
  let caseV = dealCaseDraft[p.id] !== undefined ? dealCaseDraft[p.id] : (m.finderCase || 0);
  const drawCases = () => caseOf.replaceChildren(...[...FINDER_CASES, { id: 0, from: "Nobody brought it, or the deal wasn't closed", closer: "", pct: 0 }].map(c =>
    el("button", { type: "button", role: "radio", class: "way", "aria-checked": String(caseV === c.id), onclick: () => { caseV = dealCaseDraft[p.id] = c.id; drawCases() } },
      el("span", { class: "waydot" }), el("span", {}, el("b", {}, `${c.pct}% · ${c.from}`), el("span", { class: "label" }, c.closer ? (c.closer === "Ardent" ? "Ardent closed the deal" : "They closed the deal themselves") : "No finder's fee")))));
  drawCases();

  const curFinders = new Set(m.finderTeam ? [] : (Array.isArray(m.finders) ? m.finders : (m.finder ? [m.finder] : [])));
  const fMode = el("select", { class: "mini", id: "deal-fmode" }, el("option", { value: "people" }, "These people"), el("option", { value: "team" }, "The team in general (fee goes to the fund)"), el("option", { value: "none" }, "Nobody"));
  fMode.value = m.finderTeam ? "team" : curFinders.size ? "people" : (m.type ? "none" : "people");
  const fBoxes = el("div", { class: "finders" }, teamChoices(p).map(u => el("label", { class: "share" }, el("input", { type: "checkbox", id: "deal-f-" + u, value: u, checked: curFinders.has(u) }), av(u), el("span", { class: "mname" }, realName(u) || "Someone"))));
  const syncF = () => { fBoxes.hidden = fMode.value !== "people" }; fMode.addEventListener("change", syncF); syncF();
  more.append(fieldRow("Who brought the client?", fMode), fBoxes,
    byPts ? el("p", { class: "label", style: "margin:0" }, "With points, the finder's fee depends on how the client came (below). It comes off first, before the team fund" + (type === "monthly" ? `, on the setup fee and the first ${R.finderMonths} months` : "") + ". If several people brought it in (a partner counts too), they share it equally.")
      : el("p", { class: "label", style: "margin:0" }, `Finder's fee ${m.findCustom && m.findPct != null ? m.findPct : R.findPct}%` + (type === "monthly" ? ` on the setup fee and first ${R.finderMonths} months` : "") + ". If several people brought it in, they share it equally."));
  // a partner abroad who brought the client: their commission comes first, before the fund and the shares
  const pm0 = (m.partner || {}).email || "";
  const paSel = el("select", { class: "mini", id: "deal-partner" }, el("option", { value: "" }, "No partner"), [...pMembers].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(x => el("option", { value: x.id, selected: x.id === pm0 }, `${x.name || x.id} (${groupName(x.gid)})`)));
  const paMode = el("select", { class: "mini", id: "deal-pmode" }, el("option", { value: "pct" }, "% of the profit"), el("option", { value: "fixed" }, "Fixed amount (EGP)")); paMode.value = (m.partner || {}).mode || "pct";
  const paVal = moneyInput("deal-pval", (m.partner || {}).value != null ? m.partner.value : 10, "10");
  const paBox = el("div", { class: "row", style: "gap:8px" }, paMode, paVal);
  const syncPa = () => { paBox.hidden = !paSel.value }; paSel.addEventListener("change", syncPa); syncPa();
  if (byPts) paBox.style.display = "none";
  more.append(fieldRow("Partner who brought it", paSel), paBox, el("p", { class: "label", style: "margin:0" }, byPts ? "A partner who brought the client gets the finder's fee for how the client came (below)." : "Their commission is taken first, after costs. A % applies like the finder's fee; a fixed amount is paid from the first money until it's done."));
  if (byPts) more.append(el("div", { class: "tlabel", style: "margin-top:6px" }, "How the client came (the finder's fee)"), caseOf);
  let fundIn = null, findIn = null;
  if (isAdmin) { fundIn = el("input", { id: "deal-fundpct", class: "mini pct", type: "number", min: "0", max: "80", step: "1", value: m.fundCustom && m.fundPct != null ? m.fundPct : R.fundPct }); findIn = el("input", { id: "deal-findpct", class: "mini pct", type: "number", min: "0", max: "30", step: "1", value: m.findCustom && m.findPct != null ? m.findPct : R.findPct });
    more.append(fieldRow("Team fund %", fundIn, el("span", { class: "label" }, "team rule: " + R.fundPct + "%")), fieldRow("Finder %", findIn, el("span", { class: "label" }, "team rule: " + R.findPct + "%"))) }
  else more.append(el("p", { class: "label", style: "margin:0" }, `Team fund ${m.fundCustom && m.fundPct != null ? m.fundPct : R.fundPct}% \u00b7 finder ${m.findCustom && m.findPct != null ? m.findPct : R.findPct}% (set by ${ADMIN_NAME})`));
  box.append(more);

  const save = () => {
    // a proposal can be saved before the shares are agreed; a real deal needs them to add up to 100%
    const prop = stage.value === "proposal";
    const s = shares.read(); if (s.total !== 100 && !((prop || sharesOptional) && s.total === 0)) { toast(prop ? "The shares need to add up to 100%, or leave them all empty for now" : "The shares need to add up to 100%"); return }
    let ms = null; if (mshares) { ms = mshares.read(); if (ms.total !== 100 && !((prop || sharesOptional) && ms.total === 0)) { toast("The monthly shares need to add up to 100%"); return } }
    const n = x => Math.round((Number(x.value) || 0) * 100) / 100;
    const finders = fMode.value === "people" ? [...fBoxes.querySelectorAll("input:checked")].map(i => i.value) : [];
    if (fMode.value === "people" && !finders.length) { toast("Tick who brought the client, or choose Nobody"); return }
    if (byPts && !caseV && (finders.length || fMode.value === "team" || paSel.value) && !prop) { more.open = moreOptsOpen[p.id] = true; toast("Pick how the client came, so the finder's fee is right"); caseOf.scrollIntoView({ block: "center" }); return }
    // a deal only keeps its own % if the admin set one different from the team rule
    const fundV = fundIn ? Number(fundIn.value) : null, findV = findIn ? Number(findIn.value) : null;
    const pmx = paSel.value ? pMembers.find(x => x.id === paSel.value) : null, pv = Number(paVal.value) || 0;
    if (pmx && !(pv > 0)) { toast("Enter the partner's commission"); paVal.focus(); return }
    if (pmx && paMode.value === "pct" && pv > 50) { toast("A partner's % can't be more than 50"); return }
    const rt = rateIn ? Number(rateIn.value) : 1; if (rateIn && !(rt > 0)) { toast(`Enter how many EGP 1 ${cur} is today`); rateIn.focus(); return }
    const data = { type, currency: cur, rate: rt, partner: pmx ? { email: pmx.id, name: pmx.name || pmx.id, gid: pmx.gid || "", mode: paMode.value, value: pv } : null, client: client.value.trim(), stage: stage.value, shares: s.shares, finder: null, finders, finderTeam: fMode.value === "team",
      fundCustom: fundIn ? fundV !== R.fundPct : !!m.fundCustom, fundPct: fundIn ? fundV : (m.fundPct != null ? m.fundPct : null),
      findCustom: findIn ? findV !== R.findPct : !!m.findCustom, findPct: findIn ? findV : (m.findPct != null ? m.findPct : null),
      monthShares: m.monthShares || {}, plan: Array.isArray(m.plan) ? m.plan : [], split: split === "hold" ? (m.split || (type === "monthly" ? "shares" : "tasks")) : split, hold: split === "hold" ? (m.hold || { by: me, at: Date.now() }) : null, prices: m.prices || {}, finderCase: byPts ? (caseV || null) : (m.finderCase || null), setAt: m.setAt || Date.now(), setBy: m.setBy || me, editedAt: Date.now() };
    if (type === "one" && isPhased(m)) { data.phases = m.phases; data.price = phasesPrice(m) }
    else if (type === "one") { if (!(n(price) > 0)) { toast("Enter the price"); return } data.price = n(price) }
    if (type === "installments") { if (!(n(price) > 0)) { toast("Enter the total price"); return } Object.assign(data, { price: n(price), installments: Math.max(2, Math.round(Number(months.value) || 3)), startMonth: start.value || thisMonth(), dueDay: Math.min(28, Math.max(1, Number(dueDay.value) || 5)) }) }
    if (type === "monthly") { if (!(n(fee) > 0)) { toast("Enter the monthly fee"); return } Object.assign(data, { monthlyFee: n(fee), setupFee: n(setup), startMonth: start.value || thisMonth(), endMonth: end.value || (stage.value === "ended" ? thisMonth() : ""), dueDay: Math.min(28, Math.max(1, Number(dueDay.value) || 5)), adBudget: ads.checked, monthlyShares: ms.shares }) }
    editDeal = null; delete dealTypeDraft[p.id]; delete dealCurDraft[p.id]; delete dealSplitDraft[p.id]; delete dealCaseDraft[p.id];
    // log what changed, in words, so nobody is surprised by a new split
    const ch = [];
    if (!m.type) ch.push("Deal set up");
    else {
      const sd = sharesDiff(m.shares, data.shares); if (sd) ch.push("Shares: " + sd);
      if (data.monthlyShares) { const md = sharesDiff(m.monthlyShares || m.shares, data.monthlyShares); if (md) ch.push("Monthly shares: " + md) }
      for (const [k, l] of [["price", "Price"], ["monthlyFee", "Monthly fee"], ["setupFee", "Setup fee"]]) if (data[k] != null && Number(m[k] || 0) !== Number(data[k] || 0)) ch.push(`${l}: ${m[k] || 0} \u2192 ${data[k]} ${cur}`);
      if ((m.hold ? "hold" : m.split || "shares") !== split) ch.push("Money: " + SPLIT_WAYS.find(w => w[0] === split)[1]);
      if ((m.currency || "EGP") !== cur) ch.push(`Currency: ${m.currency || "EGP"} \u2192 ${cur}`);
      if ((m.stage || "agreed") !== data.stage) ch.push("Stage: " + (STAGES.find(x => x[0] === data.stage) || [, data.stage])[1]);
      if (JSON.stringify(m.partner || null) !== JSON.stringify(data.partner)) ch.push(data.partner ? `Partner: ${data.partner.name} ${data.partner.mode === "fixed" ? data.partner.value + " EGP" : data.partner.value + "%"}` : "Partner removed");
      if (data.fundCustom && Number(m.fundPct) !== Number(data.fundPct)) ch.push(`Team fund: ${data.fundPct}%`);
      if ((m.finderCase || null) !== data.finderCase) { const fc = finderCase(data.finderCase); ch.push(fc ? `Finder's fee: ${fc.pct}% (${fc.from.toLowerCase()}, ${fc.closer === "Ardent" ? "Ardent closed it" : "they closed it"})` : "No finder's fee") }
    }
    moneyUpd(p, { money: data }, ch.join(" \u00b7 ") || "Deal saved (no changes)", ch.length ? "deal" : "entry", "Deal saved");
  };
  box.append(el("div", { class: "row" }, el("span", { class: "spacer" }),
    p.money ? el("button", { class: "btn quiet", onclick: () => { editDeal = null; delete dealTypeDraft[p.id]; render() } }, "Cancel") : null,
    el("button", { class: "btn primary", onclick: save }, "Save deal")));
  if (p.money) box.append(deleteDealBlock(p));
  return box;
}

// Deleting a deal: for a test or a deal that fell through. Takes the deal, payments, costs, payouts and ad money away.
let confirmDelDeal = null;
function deleteDealBlock(p) {
  const n = k => Object.values(p[k] || {}).filter(Boolean).length;
  const parts = [["payments", "payment"], ["costs", "cost"], ["payouts", "payout"], ["ads", "ad money entry"]].map(([k, w]) => n(k) ? `${n(k)} ${w}${n(k) > 1 ? "s" : ""}` : null).filter(Boolean);
  const box = el("div", { class: "danger", style: "margin-top:6px" });
  if (confirmDelDeal !== p.id) {
    box.append(el("div", { class: "row" }, el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, "Was this a test, or did the deal fall through?"), el("span", { class: "spacer" }),
      el("button", { class: "btn danger-btn small", onclick: () => { confirmDelDeal = p.id; render() } }, "Delete the deal")));
    return box;
  }
  box.append(el("p", { class: "danger-text" }, `Delete the deal on “${p.title}”? ` + (parts.length ? `This also deletes its ${parts.join(", ")}, ` : "") + "and nobody's balance counts it anymore. The tasks stay. This can't be undone."),
    el("div", { class: "row", style: "gap:8px" }, el("span", { class: "spacer" }),
      el("button", { class: "btn quiet", onclick: () => { confirmDelDeal = null; render() } }, "Cancel"),
      el("button", { class: "btn danger-btn", onclick: () => {
        confirmDelDeal = null; editDeal = null;
        for (const x of Object.values(p.payments || {})) for (const f of payFilesOf(x)) dropFileParts(f);
        moneyUpd(p, { money: DEL(), payments: DEL(), costs: DEL(), payouts: DEL(), ads: DEL() }, "Deal deleted" + (parts.length ? ` (with ${parts.join(", ")})` : ""), "deal", "Deal deleted");
      } }, "Yes, delete the deal")));
  return box;
}

function monthShareForm(p, month) {
  const m = p.money, cur = (m.monthShares || {})[month] || m.monthlyShares || m.shares;
  const ed = sharesEditor(`ms-${p.id}-${month}`, p, cur, false);
  return el("section", { class: "idea mform" }, el("h3", {}, `Who worked in ${monthLabel(month)}?`), ed,
    el("div", { class: "row" }, el("span", { class: "spacer" }),
      (m.monthShares || {})[month] ? el("button", { class: "btn quiet", onclick: () => { shareMonth = null; write(() => upd(p.id, { [`money.monthShares.${month}`]: DEL() }), "Back to the usual shares") } }, "Use usual shares") : null,
      el("button", { class: "btn quiet", onclick: () => { shareMonth = null; render() } }, "Cancel"),
      el("button", { class: "btn primary", onclick: () => { const r = ed.read(); if (r.total !== 100) { toast("Needs to add up to 100%"); return } shareMonth = null; moneyUpd(p, { [`money.monthShares.${month}`]: r.shares }, `Shares for ${monthLabel(month)}: ${sharesDiff(cur, r.shares) || "same"}`, "deal", "Saved for " + monthLabel(month)) } }, "Save")));
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
    // the rules were rewritten: a new version that everyone agrees to again (the numbers stay the same)
    if ((r.textV || 0) < RULES_TEXT_V) {
      const data = { textV: RULES_TEXT_V, version: (r.version || 1) + 1, updatedAt: Date.now(),
        prev: { fundPct: r.fundPct, findPct: r.findPct, finderMonths: r.finderMonths, pauseAfterLate: r.pauseAfterLate, reviewMonths: r.reviewMonths, version: r.version || 1, note: RULES_TEXT_NOTE } };
      moneyRules = { ...r, ...data }; setDoc(doc(db, "meta", "money"), data, { merge: true }).catch(() => {});
    }
    return;
  }
  const data = { fundPct: 40, findPct: 5, finderMonths: 3, pauseAfterLate: 2, reviewMonths: 2, textV: RULES_TEXT_V, version: Math.max(2, (r.version || 1) + (moneyRules ? 1 : 0)),
    holder: r.holder || me, setAt: Date.now(), reviewAt: plus(Date.now(), 2), agreed40: true, review2: true, updatedAt: Date.now() };
  moneyRules = { ...r, ...data };
  setDoc(doc(db, "meta", "money"), data, { merge: true }).catch(() => {});
}

const dealProjects = () => ideas.filter(i => (i.status === "approved" || i.status === "completed") && i.money);
// Fund spending someone paid from their own pocket: the fund owes it back to them until it's marked paid back.
const fundSpendList = () => Object.entries((fundDoc || {}).spends || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }));
function allMoney() {
  const out = { projects: [], partners: {}, me: { earned: 0, back: 0, paid: 0, balance: 0 }, people: {}, fundIn: 0, month: { expected: 0, received: 0 }, late: [],
    flow: { received: 0, back: 0, fund: 0, earned: 0, waiting: 0, cover: 0, kept: 0 }, kept: [] };
  const nowM = thisMonth();
  const pp = u => out.people[u] || (out.people[u] = { earned: 0, back: 0, paid: 0, balance: 0 });
  for (const p of dealProjects()) {
    const r = moneyOf(p); out.projects.push({ p, r }); out.fundIn += r.fund;
    for (const [u, v] of Object.entries(r.people)) { const t = pp(u); for (const k of ["earned", "back", "paid", "balance"]) t[k] += v[k] }
    if (!r.proposal) {
      for (const s of r.schedule) if (s.month === nowM && s.label !== "Total" && s.status !== "upcoming") { out.month.expected += Math.round(s.expected * r.rate); out.month.received += Math.round(s.received * r.rate) }
      for (const s of r.late) out.late.push({ p, s });
    }
    if (r.partner) { const x = out.partners[r.partner.email] || (out.partners[r.partner.email] = { name: r.partner.name, earned: 0, paid: 0, deals: [] }); x.earned += r.partner.earned; x.paid += r.partner.paid; x.deals.push({ title: p.title, earned: r.partner.earned, paid: r.partner.paid }) }
    if (r.holding && r.holdAmt) { out.kept.push({ p, amt: r.holdAmt }); out.flow.kept += r.holdAmt }
    const f = out.flow; f.received += r.receivedEGP; f.partner = (f.partner || 0) + (r.partner ? r.partner.earned : 0); f.fund += r.fund; f.waiting += r.held + r.unassigned; f.cover += r.fundCover;
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

// The money rules, in groups. Changing the wording here means bumping RULES_TEXT_V, so everyone agrees again.
const RULES_TEXT_V = 3;
const RULES_TEXT_NOTE = "Rewritten for how money works now: project teams, task prices, phases, keeping money in the fund, papers on payments, and the fund's own money kept apart from project money.";
function moneyRulesText(R) {
  return [
    ["Who gets paid", [
      `Only the people on a project's team get money from it. You join by asking (a planner accepts) or by being invited (you accept). Leaving a team never takes away what you already earned.`,
      `Each project's planners set up its deal, record the money and choose how it's shared.`]],
    ["The order every payment follows", [
      `1. Costs: whoever paid for something from their own pocket gets it back first, oldest first.`,
      `2. The partner: if a partner abroad brought the client, their commission (a % or a fixed amount).`,
      `3. The team fund: ${R.fundPct}% of what's left.`,
      `4. The finder: ${R.findPct}% to whoever on the team brought the client (shared equally if several of us did; to the fund if it came through the team in general). On monthly deals it applies to the setup fee and the first ${R.finderMonths} months.`,
      `5. The rest goes to the people on the project, the way the deal says it's shared.`]],
    ["How the team's part is shared (each deal picks one)", [
      `By points (our main way): every task has a size, S 1 point (up to 2 hours), M 3 (up to 1 day), L 8 (1 to 3 days), XL 15 (3 days to a week). Longer tasks are split. A planner sizes each task and the project's team agrees. Points count once the task is done and checked. On these deals the finder's fee comes first, by how the client came: 8% our lead and they closed it, 18% they found the client and closed it, 4% our lead and they set up the meeting for Ardent to close, 8% they found the client and Ardent closed it, 0% if the deal wasn't closed. Then the team fund's % of what's left, then the rest by points: everything shared so far is split by the points done so far (monthly deals: each month's fee by that month's points).`,
      `By task prices: a task can have a price, its part of the client's price. Whoever does it earns its share once the task is done and the payment that covers it has come in. People on the same task share it equally. Not every task needs a price: the unpriced part goes by the % shares, or equally to the project's team.`,
      `By % shares: each person on the project's team gets the % agreed. One-time deals are split once the client has paid everything (in phases: once each phase is fully paid). Monthly deals and deals paid over months are split as each payment comes in; each month's fee goes to who ran it that month.`,
      `All to the team fund: after costs, the partner and the finder, everything goes to the fund.`,
      `Keep it in the fund, decide later: the money waits in the fund, written down as that project's money. Nobody is paid from it, and costs aren't paid back, until the planners decide how to split it. It is not the fund's own money and can't be spent on subscriptions or goals.`]],
    ["Deals and payments", [
      `A deal is one price, a fee every month, or one price paid over a few months. It can be in any currency: each payment saves that day's rate, and everything is shared in EGP.`,
      `The price can be split into a deposit and the rest, or into phases the client agrees to one at a time, each with its own price and payments. Money fills the payments in order: deposit first, then phase by phase.`,
      `Every payment says how it came (cash, InstaPay…), who has it now, and keeps its papers: our quotation, the signed one, and any receipt.`,
      `A proposal isn't a deal yet, and a phase that's only offered isn't part of the price: nothing is due or late until the client agrees.`,
      `If a monthly client is ${R.pauseAfterLate} months late, we pause the work until they pay.`,
      `A client's ad budget is their money, not ours. It's tracked separately and never split.`]],
    ["The team fund", [
      `The fund pays our subscriptions and saves for our goals (like an office). We review its % every ${R.reviewMonths} months.`,
      `The fund's own money is shown apart from money it keeps for projects. Subscriptions and goals use only its own money; if project money ever has to be used, the site shows it, and it's paid back as projects are split.`,
      `If a project loses money, the fund covers the costs still owed back, so nobody is out of pocket. The site does this by itself when the deal is over.`,
      `If you pay for something for the team from your own pocket, the fund owes it back to you.`]],
    ["Open for trust", [
      `Everyone on the team can see all the money: every project, every phase, every payment, and everyone's balance.`,
      `Only ${ADMIN_NAME} and each project's planners can add or change amounts. Every change is logged with who made it and when.`,
      `Handing money to someone is recorded (Mark paid), so balances are always right.`,
      `${ADMIN_NAME} sets the fund's numbers and these rules. Any change makes a new version, and everyone is asked to agree again.`]],
  ];
}
// What changed since the last version of the rules, so nobody has to compare by hand.
function rulesChanges(R) {
  const pv = R.prev; if (!pv) return [];
  if (pv.note) return [pv.note];
  const names = { fundPct: ["Team fund", "%"], findPct: ["Finder's fee", "%"], finderMonths: ["Finder's fee on monthly deals", " months"], pauseAfterLate: ["Pause after", " months late"], reviewMonths: ["Review every", " months"] };
  return Object.entries(names).filter(([k]) => pv[k] != null && pv[k] !== R[k]).map(([k, [l, u]]) => `${l}: ${pv[k]}${u} → ${R[k]}${u}`);
}
const moneyGo = (p) => { pendingTab = "money"; projTab = "money"; location.hash = "project-" + p.id };

function renderMoneyPage() {
  const box = $("#money"); box.replaceChildren();
  const all = allMoney(), F = fundState(all), R = rulesNow(), ver = R.version || 1;
  const agreed = ((people[me] || {}).moneyAgreed || {}).version === ver;
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Money"));

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
    const segs = [["back", "Costs paid back", fl.back], ["partner", "Partners' commission", fl.partner || 0], ["fund", "Team fund", Math.max(0, fl.fund)], ["people", "The team's shares", fl.earned], ["wait", "Waiting to be split", fl.waiting], ["kept", "Kept in the fund for projects", fl.kept || 0]].filter(x => x[2] > 0);
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
      el("span", { class: "mname" }, p.title + (p.money.client ? " · " + p.money.client : "")), el("span", {}, (s.label.match(/^\d{4}-\d{2}$/) ? monthLabel(s.label) : s.label) + " · " + fmtCur(s.expected - s.received, p.money.currency))))) : null,
    !all.projects.length ? el("p", { style: "margin:0" }, "No deals yet. Set one up on a project's Money tab.") : null));

  /* every deal, phase by phase: what came in, what went to the fund, and what's yours */
  if (all.projects.length) {
    const sec = el("section", { class: "idea", style: "gap:0" });
    sec.append(el("div", { class: "mhead bypart" }, el("span", {}, "Project · phase"), el("span", {}, "Came in"), el("span", {}, "To the fund"), el("span", {}, "Yours")));
    for (const { p, r } of all.projects.slice().sort((a, b) => b.r.receivedEGP - a.r.receivedEGP)) {
      const parts = Object.values(r.parts || {}), cur = r.currency, mine = (r.people[me] || {}).earned || 0;
      sec.append(el("button", { class: "mlink bypart top", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, p.title + (p.money.client ? " · " + p.money.client : "")),
        el("span", {}, fmtEGP(r.receivedEGP)), el("span", {}, r.holding ? "kept: " + fmtEGP(r.holdAmt) : fmtEGP(r.fund)), el("span", {}, fmtEGP(mine))));
      for (const pt of parts) sec.append(el("button", { class: "mlink bypart sub" + (pt.agreed ? "" : " later"), onclick: () => moneyGo(p) },
        el("span", { class: "mname" }, "↳ " + pt.name + (pt.agreed ? (pt.received >= pt.price && pt.price ? " · paid" : ` · ${fmtN(pt.received)} of ${fmtCur(pt.price, cur)}`) : " · not agreed yet")),
        el("span", {}, fmtEGP(pt.receivedEGP)), el("span", {}, r.holding ? "–" : fmtEGP(pt.fund)), el("span", {}, fmtEGP(pt.people[me] || 0))));
    }
    box.append(el("h2", { class: "sec-h" }, "By project and phase"), sec);
  }

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
  // money in hand = the fund's own money + money it keeps for projects. Spending should only use the fund's own.
  if (all.kept.length || F.balance < 0) box.append(el("div", { class: "notice" + (F.balance < 0 ? "" : " teamnote soft"), style: "margin:12px 0 0" },
    el("div", {}, `In the fund's hands: ${fmtEGP(Math.max(0, F.balance) + all.flow.kept + Math.min(0, F.balance))}. The fund's own money: ${fmtEGP(F.balance)}. Kept for projects: ${fmtEGP(all.flow.kept)}.`),
    F.balance < 0 ? el("div", {}, `The fund spent ${fmtEGP(-F.balance)} more than its own money, so that came out of money kept for projects. It's paid back automatically as projects are split and their share reaches the fund.`) : null));
  { const src = all.projects.filter(({ r }) => r.fund > 0);
    if (src.length) box.append(el("details", { class: "removed", style: "margin-top:12px" }, el("summary", {}, `Where the fund's money came from (${src.length} project${src.length > 1 ? "s" : ""})`),
      el("section", { class: "idea", style: "gap:0;margin-top:8px" }, src.flatMap(({ p, r }) => [
        el("button", { class: "mlink", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, p.title), el("span", {}, fmtEGP(r.fund))),
        ...Object.values(r.parts || {}).filter(pt => pt.fund).map(pt => el("button", { class: "mlink sub", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, "↳ " + pt.name), el("span", { class: "label" }, fmtEGP(pt.fund))))])))) }
  if (all.kept.length) box.append(el("section", { class: "idea", style: "margin-top:12px;gap:0" },
    el("div", { class: "row", style: "margin-bottom:4px" }, el("h3", {}, "Kept for projects"), el("span", { class: "spacer" }), el("span", { class: "label" }, fmtEGP(all.flow.kept))),
    el("p", { class: "label", style: "margin:0 0 6px;text-transform:none;letter-spacing:0" }, "Money the fund is holding for a project until its team decides the split. It's not in the fund's balance above and can't be spent on goals."),
    all.kept.flatMap(({ p, amt }) => { const r = moneyOf(p); return [el("button", { class: "mlink", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, p.title + (p.money.client ? " · " + p.money.client : "")), el("span", {}, fmtEGP(amt))),
      ...Object.values(r.parts || {}).filter(pt => pt.receivedEGP).map(pt => el("button", { class: "mlink sub", onclick: () => moneyGo(p) }, el("span", { class: "mname" }, "↳ " + pt.name), el("span", { class: "label" }, fmtEGP(pt.receivedEGP))))] })));

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
const goalPrompt = g => `Research this goal for our team: "${g.name}". We are Ardent Creative Studios, a small team in Egypt that sells websites and Google Ads to clients worldwide.${g.details ? " What we know so far: " + g.details : ""}
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
  const own = fundState(allMoney()).balance, short = toP(s.amount) - Math.max(0, own);
  return el("div", { class: "subpay" }, el("span", {}, `Who paid ${fmtEGP(toP(s.amount))} for ${s.name}?`), who,
    short > 0 ? el("span", { class: "label", style: "flex-basis:100%;text-transform:none;letter-spacing:0;color:var(--warn)" }, `If the fund pays: it only has ${fmtEGP(Math.max(0, own))} of its own, so ${fmtEGP(short)} would come from money kept for projects.`) : null,
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
    ...moneyRulesText(R).map(([h, list]) => { const steps = list.every(t => /^\d+\. /.test(t));
      return el("div", { class: "rulegroup" }, el("h4", {}, h), el(steps ? "ol" : "ul", { class: "rules" }, list.map(t => el("li", {}, steps ? t.replace(/^\d+\. /, "") : t)))) }));
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
          ...(changed ? { version: ver + 1, setAt: Date.now(), reviewAt: nextReview(v.reviewMonths), prev: { fundPct: R.fundPct, findPct: R.findPct, finderMonths: R.finderMonths, pauseAfterLate: R.pauseAfterLate, reviewMonths: R.reviewMonths, version: ver, note: null } } : {}) }, { merge: true }),
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

function fmtDate(d) { let v = fmtMemo.get(d); if (v === undefined) { try { v = dateFmt.format(new Date(d + "T00:00")) } catch { v = d } if (fmtMemo.size > 2000) fmtMemo.clear(); fmtMemo.set(d, v) } return v }

function line(pr, unit) {
  const t = el("div", { class: "track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": pr.pct, "aria-label": "Progress" }, el("div", { class: "fill", style: `width:${pr.pct}%` }));
  if (pr.total <= 30) for (let i = 1; i < pr.total; i++) t.append(el("span", { class: "tick", style: `left:calc(${i / pr.total * 100}% - 1px)` }));
  return el("div", { style: "display:grid;gap:6px" }, t, el("div", { class: "pmeta" }, el("span", {}, pr.total ? `${pr.done} of ${pr.total} ${unit} done` : `No ${unit} yet`), el("span", {}, pr.pct + "%")));
}

$("#me-btn").onclick = () => { location.hash = "me" };
$("#bell").onclick = e => { e.stopPropagation(); toggleAlerts() };
// the ✦ button opens the agent (the small assistant panel still opens for the morning brief and "Solve with AI")
$("#asst-btn").onclick = () => { asstOpen = false; alertsOpen = false; location.hash = route().view === "agent" && route().cid ? "agent" : (route().view === "agent" ? location.hash : "agent"); render() };
$("#brand").onclick = () => { location.hash = "me" };

/* ----- backup: everything on the board in one file ----- */
const RULES_VERSION = "2026-11-24b";
function downloadBackup() {
  const strip = o => { const x = { ...o }; delete x.pushSubs; return x };
  const data = { app: "Pitch Room", at: new Date().toISOString(), by: myProfile && myProfile.email,
    ideas, people: Object.fromEntries(Object.entries(people).map(([k, v]) => [k, strip(v)])), chat, meta: { money: moneyRules, fund: fundDoc, news: newsDoc, nicks, team: teamDoc, upgrades: upgradesDoc, focus: { projectId: focusId, active: activeMap } },
    partners: { groups: pGroups, members: pMembers, numbers: pLeads, posts: pPosts }, clients: { projects: cProjects, posts: cPosts, tasks: cTasks }, mine: { tasks: personal, notes: myNotes } };
  const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })), download: `pitch-room-backup-${todayStr()}.json` });
  document.body.append(a); a.click(); a.remove();
  write(() => setDoc(doc(db, "users", me), { lastBackup: Date.now() }, { merge: true }), "Backup downloaded. Keep it somewhere safe, like Google Drive");
}

/* ----- the Monday summary, posted in the team chat once a week from the board's own numbers ----- */
let weeklyDoc = null, weeklyBusy = false;
function weeklyText() {
  const end = new Date(weekKey() + "T00:00").getTime(), start = end - 7 * 864e5, today = todayStr(), weekEnd = ymd(new Date(end + 6 * 864e5));
  const done = {}, late = [], dueWeek = [];
  for (const p of ideas.filter(i => i.status === "approved" || i.status === "completed")) for (const t of tasksOf(p)) {
    if (t.done && (t.doneAt || 0) >= start && (t.doneAt || 0) < end && t.doneBy) done[t.doneBy] = (done[t.doneBy] || 0) + 1;
    if (!t.done && p.status === "approved" && !taskHeld(p, t) && t.due) { if (t.due < today) late.push({ t, p }); else if (t.due <= weekEnd) dueWeek.push({ t, p }) }
  }
  let inEGP = 0; for (const p of dealProjects()) { const m = p.money || {}, rate = (m.currency || "EGP") === "EGP" ? 1 : Number(m.rate) || 1;
    for (const x of Object.values(p.payments || {})) if (x && x.date && new Date(x.date + "T12:00").getTime() >= start && new Date(x.date + "T12:00").getTime() < end) inEGP += Math.round(toP(x.amount) * ((m.currency || "EGP") === "EGP" ? 1 : Number(x.rate) || rate)) }
  const all = allMoney(), building = activeProjects();
  const fin = Object.entries(done).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${firstName(u) === "you" ? (realName(u) || "").split(" ")[0] : firstName(u)} ${n}`).join(" · ");
  return [`\u{1F4CB} Week of ${fmtDate(weekKey())}: the summary`,
    `✅ Finished last week: ${fin || "nothing ticked off"}`,
    late.length ? `⚠️ Late: ${late.length} task${late.length > 1 ? "s" : ""} (${late.slice(0, 3).map(x => `${x.t.text}${x.t.owner ? " – " + (realName(x.t.owner) || "").split(" ")[0] : ""}`).join(", ")}${late.length > 3 ? "…" : ""})` : "✨ Nothing late",
    `\u{1F4C5} Due this week: ${dueWeek.length} task${dueWeek.length === 1 ? "" : "s"}`,
    `\u{1F4B0} Money in last week: ${fmtEGP(inEGP)}` + (all.late.length ? ` · ${all.late.length} late payment${all.late.length > 1 ? "s" : ""}` : ""),
    building.length ? `\u{1F3AF} Building: ${building.map(p => `${p.title} (${progressOf(tasksOf(p)).pct}%)`).join(", ")}` : null].filter(Boolean).join("\n");
}
function maybeWeekly() {
  if (weeklyDoc === null || !live || weeklyBusy || partnerMode || clientMode) return;
  if (weeklyDoc.week === weekKey()) return;
  weeklyBusy = true;
  // wait a moment and look again, so two people opening the site together don't both post it
  setTimeout(async () => {
    try {
      if (weeklyDoc.week === weekKey()) return;
      await fbReady;
      weeklyDoc = { ...weeklyDoc, week: weekKey() };
      await setDoc(doc(db, "meta", "weekly"), { week: weekKey(), by: me, at: Date.now() }, { merge: true });
      await setDoc(doc(db, "chat", "weekly-" + weekKey()), { by: me, system: "weekly", text: weeklyText(), at: Date.now() });
    } catch { } finally { weeklyBusy = false }
  }, 2000 + Math.random() * 4000);
}

/* ----- search: one box for everything ----- */
let searchOpen = false, searchQ = "";
function searchResults(q) {
  const n = q.trim().toLowerCase(); if (n.length < 2) return [];
  const has = t => String(t || "").toLowerCase().includes(n), digits = n.replace(/\D/g, ""), out = [];
  const push = (kind, title, sub, go, then) => out.length < 60 && out.push({ kind, title, sub, go, then });
  for (const p of ideas) {
    if (has(p.title) || has(p.pitch) || has(clientOf(p))) push(p.status === "voting" ? "Idea" : "Project", p.title, clientOf(p) || p.pitch || "", p.status === "voting" ? "chat-ideas" : "project-" + p.id);
    for (const t of tasksOf(p)) {
      if (has(t.text)) push("Task", t.text, p.title + (t.owner ? " · " + name(t.owner) : ""), taskLink(p, t));
      for (const x of Object.values(t.notes || {})) if (x && has(x.text)) push("Task note", x.text.slice(0, 90), `${t.text} · ${p.title}`, taskLink(p, t));
    }
    for (const [mid, m] of Object.entries(p.meetings || {})) if (m && (has(m.title) || has(m.text))) push("Meeting", m.title || (m.text || "").slice(0, 60), p.title, "project-" + p.id, () => { projTab = "meet" });
    for (const f of filesOf(p)) if (has(f.name)) push("File", f.name, p.title, "project-" + p.id);
    for (const l of linksOf(p)) if (has(l.label) || has(l.url)) push("Link", l.label || hostOf(l.url), p.title, "project-" + p.id);
  }
  // chat messages open the right chat and scroll to the message
  const inChat = (k, label, list) => { for (const m of list) if (m && !m.system && !m.sys && has(m.text)) push(label, m.text.slice(0, 90), (realName(m.by) || m.name || "") + " · " + ago(m.at), chatHash(k), () => { ncFlash = m.id; ncInfo = false }) };
  inChat("team", "Team chat", teamMsgs());
  inChat("ideas", "Ideas chat", ideaTalk());
  for (const [pid, list] of Object.entries(pcMsgs)) { const p = ideas.find(x => x.id === pid); if (p) inChat("p:" + pid, "Project chat", list || []) }
  for (const [tid, list] of Object.entries(dmMsgs)) { const u = tid.split("_").find(x => x !== me); if (u) inChat("dm:" + u, "Private chat", list || []) }
  for (const l of pLeads) if (has(l.name) || has(l.biz) || has(l.city) || (digits.length > 3 && leadDigits(l.phone).includes(digits))) push("Number", leadTitle(l), `${l.phone || ""} · ${groupName(l.gid)} · ${LEAD_NAME[l.status] || "New"}`, "partners", () => { phTab = "leads"; leadOut = null; leadNote = ""; leadDue = ""; leadLang = null; leadDel = false; leadOpen = l.id });
  for (const m of pMembers) if (has(m.name) || has(m.id)) push("Partner", m.name || m.id, groupName(m.gid), "partners", () => { phTab = "people" });
  for (const g of (fundDoc && fundDoc.goals ? Object.values(fundDoc.goals) : [])) if (g && (has(g.name) || has(g.details))) push("Goal", g.name, "Team fund goal", "money", () => { moneyTab = "fund" });
  for (const x of myNotes) if (has(x.text)) push("My note", x.text.slice(0, 90), "Only you see this", "me", () => { meNotesAll = true });
  for (const t of personal) if (has(t.text)) push("My task", t.text, "Just for me", "me", () => { meTab = "tasks" });
  return out;
}
function closeSearch() { searchOpen = false; const b = $("#search"); if (b) b.replaceChildren(); render() }
function renderSearch() {
  const box = $("#search"); if (!box) return;
  box.hidden = !searchOpen; if (!searchOpen) return;
  if (!box.firstChild) {
    const inp = el("input", { id: "search-input", class: "noteinput", type: "search", placeholder: "Search tasks, projects, chat, numbers, notes…", autocomplete: "off", "aria-label": "Search" });
    let t = 0;
    inp.addEventListener("input", () => { searchQ = inp.value; clearTimeout(t); t = setTimeout(drawSearch, 60) });   // waits for a pause in typing, so typing never stutters
    inp.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); closeSearch() }
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); drawSearch(); const f = box.querySelector(".sres"); if (f) f.click() }
      if (e.key === "ArrowDown") { e.preventDefault(); const f = box.querySelector(".sres"); if (f) f.focus() }
    });
    box.addEventListener("keydown", e => {
      const r = e.target.closest && e.target.closest(".sres"); if (!r) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const all = [...box.querySelectorAll(".sres")], i = all.indexOf(r) + (e.key === "ArrowDown" ? 1 : -1); (i < 0 ? inp : all[Math.min(i, all.length - 1)]).focus() }
      if (e.key === "Escape") { e.preventDefault(); closeSearch(); $("#search-btn").focus() }
    });
    box.append(el("div", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, inp, el("button", { class: "x", "aria-label": "Close search", onclick: closeSearch }, "✕")), el("div", { class: "sresults", id: "sresults" }));
    inp.value = searchQ; setTimeout(() => inp.focus(), 0);
  }
  drawSearch();
}
function drawSearch() {
  const host = document.getElementById("sresults"); if (!host) return;
  const res = searchResults(searchQ);
  host.replaceChildren(...(searchQ.trim().length < 2 ? [el("p", { class: "alert-empty" }, "Type at least 2 letters. Tip: Ctrl K or ⌘ K opens search from anywhere.")]
    : !res.length ? [el("p", { class: "alert-empty" }, "Nothing found for “" + searchQ.trim() + "”.")]
    : res.map(r => el("button", { class: "sres", onclick: () => { searchOpen = false; $("#search").replaceChildren(); if (r.then) r.then(); if (location.hash === "#" + r.go) render(); else location.hash = r.go } }, el("span", { class: "skind" }, r.kind), el("span", { class: "stext" }, el("b", {}, r.title), r.sub ? el("span", {}, r.sub) : null)))));
}
$("#search-btn").onclick = e => { e.stopPropagation(); alertsOpen = false; asstOpen = false; if (searchOpen) closeSearch(); else { searchOpen = true; render() } };
document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && me && !partnerMode && !clientMode) { e.preventDefault(); if (searchOpen) { const i = $("#search-input"); if (i) { i.focus(); i.select() } return } searchOpen = true; alertsOpen = false; asstOpen = false; render() } });
document.addEventListener("click", e => { if (searchOpen && e.target.isConnected && !e.target.closest("#search") && !e.target.closest("#search-btn")) closeSearch() });

/* ----- getting started: a checklist for new team members ----- */
function welcomeCard() {
  const prof = people[me] || {}; if (prof.welcomeHidden) return null;
  const ver = rulesNow().version || 1;
  const steps = [
    ["Take the skills quiz", "So tasks go to the right people", !!prof.skills, () => { location.hash = "skills" }],
    ["Turn on alerts", "On your phone and your computer", pushOn || Object.keys(prof.pushSubs || {}).length > 0, () => { location.hash = "settings-alerts" }],
    ["Install the app", "Home Screen, Dock or desktop", isHomeScreenApp() || !!prof.installed, () => { location.hash = "settings-install" }],
    ["Agree to the money rules", "How we share what we earn", ((prof.moneyAgreed || {}).version === ver), () => { moneyTab = "rules"; location.hash = "money" }],
    ["Say hi in the team chat", "", chat.some(m => m.by === me && !m.system), () => { location.hash = "chat-team" }],
    ["Join a project", "Open one and tap Ask to join the team", ideas.some(p => (p.members || {})[me]), () => { location.hash = "projects" }],
  ];
  const n = steps.filter(x => x[2]).length; if (n === steps.length) return null;
  return el("section", { class: "idea welcome" }, el("div", { class: "row" }, el("h3", {}, "Getting started"), el("span", { class: "label" }, `${n} of ${steps.length}`), el("span", { class: "spacer" }),
    el("button", { class: "btn quiet small", onclick: () => write(() => setDoc(doc(db, "users", me), { welcomeHidden: true }, { merge: true })) }, "Hide")),
    el("div", { class: "track", style: "height:6px" }, el("div", { class: "fill", style: `width:${Math.round(n / steps.length * 100)}%` })),
    el("div", { class: "chklist" }, steps.map(([t, sub, ok, go]) => el("div", { class: "chk " + (ok ? "ok" : "wait") }, el("span", { class: "chk-i" }, ok ? "✓" : "•"),
      el("div", { class: "chk-t" }, el("b", {}, t), sub ? el("span", {}, sub) : null), ok ? null : el("div", { class: "chk-a" }, el("button", { class: "btn small", onclick: go }, "Go"))))));
}

// Start: returning visitors see their saved copy right away (this runs last, once everything above is ready).
if (loadCache()) show();

/* ----- the assistant doing things: it prepares the actions, you tap Do it, and you can undo ----- */
function parseActions(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = line.match(/^\s*ACTION\s*:\s*(.+)$/i); if (!m) continue;
    const [kind0, a = "", b = "", c = "", d = ""] = m[1].split("|").map(x => x.trim());
    const kind = (kind0 || "").toLowerCase();

    if (kind === "mytask") { if (a) out.push({ kind, text: a.slice(0, 200), date: /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : "" }); continue; }
    if (kind === "chat") { if (a) out.push({ kind, text: a.slice(0, 600) }); continue; }
    if (kind === "ideapitch") { if (a) out.push({ kind, title: a.slice(0, 80), category: b, pitch: c.slice(0, 600) }); continue; }

    const pMatch = a.match(/PRJ\d+/i);
    if (pMatch) {
      const pRef = asstRefs[pMatch[0].toUpperCase()];
      const proj = pRef && ideas.find(i => i.id === pRef.pid);
      if (!proj || !canModifyProject(proj) || !inTeam(proj)) continue;
      if (kind === "addtask" && b) {
        // only someone on this project's team can be given the task; no name means nobody yet
        const pool = isProj(proj) ? projTeam(proj) : teamIds(), who = c.toLowerCase();
        const assigneeId = (who && pool.find(u => (realName(u) || "").toLowerCase().startsWith(who))) || "";
        out.push({ kind, p: proj, text: b.slice(0, 200), assignee: assigneeId, date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "" });
      }
      continue;
    }

    const ref = asstRefs[(a.match(/[TP]\d+/i) || [""])[0].toUpperCase()];
    if (!ref) continue;
    if (ref.personal) {
      const t = personal.find(x => x.id === ref.personal);
      if (t && kind === "done") out.push({ kind: "pdone", t });
      continue;
    }

    const p = ideas.find(i => i.id === ref.pid);
    const t = p && tasksOf(p).find(x => x.id === ref.tid);
    if (!p || !t) continue;

    // Only the admin or people related to the project, and only what the app itself lets them change:
    // ticking, starting and editing need the task to be theirs (or that they plan it); notes need them to be related.
    if (!canModifyProject(p)) continue;
    if (kind !== "note" && !canWork(p, t)) continue;

    if (kind === "done" && !t.done) out.push({ kind, p, t, text: b.slice(0, 1000) });
    else if (kind === "start" && !t.done && t.status !== "doing") out.push({ kind, p, t });
    else if (kind === "note" && b) out.push({ kind, p, t, text: b.slice(0, 1000) });
    else if (kind === "step" && b) out.push({ kind, p, t, text: b.slice(0, 120) });
    else if (kind === "due" && /^\d{4}-\d{2}-\d{2}$/.test(b)) out.push({ kind, p, t, date: b });
    else if (kind === "edittask" && b) out.push({ kind, p, t, text: b.slice(0, 200) });
  }
  return out.slice(0, 12);
}

const actLabel = a => ({
  done: () => [`✓ Mark done: ${a.t.text}`, a.text ? "Note for the team: " + a.text : ""],
  pdone: () => [`✓ Mark done: ${a.t.text}`, "Private task"],
  start: () => [`▶ Start: ${a.t.text}`, "Marks it in progress"],
  note: () => [`📝 Add a note to: ${a.t.text}`, a.text],
  step: () => [`➕ Add a step to: ${a.t.text}`, a.text],
  due: () => [`📅 Due ${fmtDate(a.date)}: ${a.t.text}`, a.t.due ? "Was " + fmtDate(a.t.due) : ""],
  edittask: () => [`✏️ Rename task to: ${a.text}`, `Was: ${a.t.text}`],
  addtask: () => [`➕ Add task to ${a.p.title}: ${a.text}`, a.assignee ? `Assign to ${realName(a.assignee)}` : ""],
  mytask: () => [`➕ Private to-do: ${a.text}`, a.date ? "Due " + fmtDate(a.date) : "Only you see it"],
  chat: () => [`💬 Post in the team chat`, a.text],
  ideapitch: () => [`💡 Pitch idea: ${a.title}`, a.pitch],
})[a.kind]();

async function doActions(m) {
  if (m.actState !== "pending") return;
  m.actState = "working"; render();
  const undo = [], msgs = [];
  const run = async (fn, back) => { await fbReady; await fn(); if (back) undo.push(back) };
  try {
    for (const a of m.actions.filter(x => !x.skip)) {
      const now = Date.now(), nid = uid();
      if (a.kind === "done" && needsSend(a.p, a.t) && !a.t.done) {
        msgs.push(`Sent “${a.t.text}” to ${checkWho(a.t)} to check`);
        await run(() => upd(a.p.id, { [a.t.path + ".review"]: { by: me, at: now }, [a.t.path + ".status"]: "doing", ...(a.text ? { [`${a.t.path}.notes.${nid}`]: { by: me, text: a.text, at: now } } : {}) }),
          () => upd(a.p.id, { [a.t.path + ".review"]: DEL(), ...(a.text ? { [`${a.t.path}.notes.${nid}`]: DEL() } : {}) }));
      } else if (a.kind === "done") {
        msgs.push(doneMessage(a.p, a.t));
        await run(() => upd(a.p.id, { [a.t.path + ".done"]: true, [a.t.path + ".doneBy"]: me, [a.t.path + ".doneAt"]: now, ...(a.text ? { [`${a.t.path}.notes.${nid}`]: { by: me, text: a.text, at: now } } : {}) }),
          () => upd(a.p.id, { [a.t.path + ".done"]: false, [a.t.path + ".doneBy"]: DEL(), [a.t.path + ".doneAt"]: DEL(), ...(a.text ? { [`${a.t.path}.notes.${nid}`]: DEL() } : {}) }));
      } else if (a.kind === "pdone") await run(() => setDoc(doc(db, "private", me, "tasks", a.t.id), { done: true, doneAt: now }, { merge: true }), () => setDoc(doc(db, "private", me, "tasks", a.t.id), { done: false, doneAt: null }, { merge: true }));
      else if (a.kind === "start") { const prev = a.t.status || null; await run(() => upd(a.p.id, { [a.t.path + ".status"]: "doing", [a.t.path + ".startedBy"]: me, [a.t.path + ".startedAt"]: now }), () => upd(a.p.id, { [a.t.path + ".status"]: prev })) }
      else if (a.kind === "note") await run(() => upd(a.p.id, { [`${a.t.path}.notes.${nid}`]: { by: me, text: a.text, at: now } }), () => upd(a.p.id, { [`${a.t.path}.notes.${nid}`]: DEL() }));
      else if (a.kind === "step") await run(() => upd(a.p.id, { [`${a.t.path}.check.${nid}`]: { text: a.text, done: false, order: now } }), () => upd(a.p.id, { [`${a.t.path}.check.${nid}`]: DEL() }));
      else if (a.kind === "due") { const prev = a.t.due || null; await run(() => upd(a.p.id, { [a.t.path + ".due"]: a.date }), () => upd(a.p.id, { [a.t.path + ".due"]: prev })) }
      else if (a.kind === "edittask") {
        const prev = a.t.text;
        await run(() => upd(a.p.id, { [a.t.path + ".text"]: a.text }), () => upd(a.p.id, { [a.t.path + ".text"]: prev }));
      } else if (a.kind === "addtask") {
        const tid = uid(), phaseId = (getPhases(a.p)[0] || {}).id || "build";
        await run(() => upd(a.p.id, {
          [`tasks.${tid}`]: { text: a.text, phase: phaseId, skill: null, owner: a.assignee || null, assignedBy: a.assignee ? me : null, assignedAt: a.assignee ? now : null, done: false, order: now, due: a.date || null, priority: "medium" }
        }), () => upd(a.p.id, { [`tasks.${tid}`]: DEL() }));
      } else if (a.kind === "ideapitch") {
        await run(() => setDoc(doc(db, "ideas", nid), {
          title: a.title, category: cleanCat(a.category) || "Other", pitch: a.pitch, status: "voting", author: me, votes: { [me]: "keep" }, createdAt: now, tasks: {}, backers: {}
        }), () => deleteDoc(doc(db, "ideas", nid)));
      } else if (a.kind === "mytask") await run(() => setDoc(doc(db, "private", me, "tasks", nid), { text: a.text, done: false, due: a.date || null, priority: "medium", order: now }), () => deleteDoc(doc(db, "private", me, "tasks", nid)));
      else if (a.kind === "chat") await run(() => setDoc(doc(db, "chat", nid), { by: me, text: a.text, at: now }), () => deleteDoc(doc(db, "chat", nid)));
      a.ok = true;
    }
    m.actState = "done"; m.undo = undo;
    const unlocked = msgs.find(x => /can start|is complete/.test(x));
    toast(unlocked || "Done", unlocked ? 4500 : 2200);
  } catch (e) {
    m.actState = "pending"; m.undo = undo;
    toast(e && e.code === "permission-denied" ? "That wasn't allowed by the site's rules" : "Something didn't save. Check your connection and try again", 4500);
  }
  render();
}
async function undoActions(m) {
  if (m.actState !== "done") return;
  m.actState = "working"; render();
  try { await fbReady; for (const f of (m.undo || []).reverse()) await f(); m.actState = "undone"; toast("Undone") }
  catch { m.actState = "done"; toast("Couldn't undo. Try again") }
  render();
}
function actionsCard(m) {
  const st = m.actState;
  return el("div", { class: "actcard" + (st === "done" ? " ok" : st === "undone" ? " off" : "") },
    el("div", { class: "actcard-h" }, st === "done" ? "✓ Done" : st === "undone" ? "Undone" : st === "working" ? "Working…" : "I can do this for you"),
    m.actions.map((a, i) => { const [t, d] = actLabel(a); return el("div", { class: "actrow" + (a.skip ? " skip" : "") }, el("div", { class: "actrow-t" }, el("b", {}, t), d ? el("span", {}, d) : null),
      st === "pending" ? el("button", { class: "x", "aria-label": a.skip ? "Keep this" : "Leave this out", title: a.skip ? "Keep this" : "Leave this out", onclick: () => { a.skip = !a.skip; render() } }, a.skip ? "↺" : "✕") : null) }),
    st === "pending" ? el("div", { class: "row", style: "gap:6px" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { m.actState = "undone"; render() } }, "Not now"),
      el("button", { class: "btn primary small", disabled: !m.actions.some(a => !a.skip), onclick: () => doActions(m) }, "Do it")) : null,
    st === "done" ? el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => undoActions(m) }, "Undo")) : null);
}
