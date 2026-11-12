/* ----- alerts when the site is closed (Web Push) -----
   Each device that turns this on saves its push address in users/{uid}.pushSubs.
   When you do something that would show up in a teammate's bell (a task for them, a reply,
   a private message...), your browser asks the push server to ring their devices.
   The push server (push-server/worker.js, on Cloudflare) checks your sign-in with Firestore,
   so only the team can send. Its address is saved in meta/push by the admin. */

var pushUrl = "", pushKey = null, pushOn = false, pushBusy = false, pushErr = "";
var pushBaseline = null, pushTimer = null;
var PUSH_KINDS = ["ready", "idea", "done", "planner", "task", "help", "note", "goal", "blk", "file", "link", "meet", "start", "news", "dm", "reply", "chat"];

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isHomeScreenApp = () => navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
function pushDeviceId() {
  try { let id = localStorage.getItem("pushDevice"); if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem("pushDevice", id) } return id }
  catch { return "device" }
}
const pushBase = () => (pushUrl || "").replace(/\/+$/, "");
const urlB64ToBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)) };

// Called when meta/push changes and when the team's site starts.
function pushConfig(d) {
  const url = (d && d.url) || "";
  if (url !== pushUrl) { pushUrl = url; pushKey = null }
  pushCheck();
}

// Is this device already set up? If permission is granted and the server is known, quietly make sure the subscription is saved.
async function pushCheck() {
  if (!pushSupported() || !pushBase() || !me) { pushOn = false; return }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== "granted") { pushOn = false; render(); return }
    const key = await pushServerKey();
    const subKey = sub.options && sub.options.applicationServerKey ? btoaUrl(sub.options.applicationServerKey) : null;
    if (key && subKey && subKey !== key) { await sub.unsubscribe(); pushOn = false; await pushEnable(true); return }
    await pushSave(sub);
    pushOn = true; render();
  } catch { }
}
const btoaUrl = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };

async function pushServerKey() {
  if (pushKey) return pushKey;
  const r = await fetch(pushBase() + "/key", { cache: "no-store" });
  const j = await r.json();
  if (!j.key) throw new Error(j.error || "no key");
  return pushKey = j.key;
}

function pushSave(sub) {
  const saved = ((people[me] || {}).pushSubs || {})[pushDeviceId()];
  const now = JSON.stringify(sub.toJSON());
  if (saved === now) return Promise.resolve();
  people[me] = { ...(people[me] || {}), pushSubs: { ...((people[me] || {}).pushSubs || {}), [pushDeviceId()]: now } };
  return setDoc(doc(db, "users", me), { pushSubs: { [pushDeviceId()]: now } }, { merge: true });
}

// Turn on: ask the browser for permission, subscribe, save. quiet = no toasts (used when renewing).
async function pushEnable(quiet) {
  if (pushBusy) return; pushBusy = true; pushErr = ""; render();
  try {
    if (!pushSupported()) throw new Error(isIOS() && !isHomeScreenApp() ? "ios" : "unsupported");
    if (!pushBase()) { await enableDeviceAlerts(); return }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { if (!quiet) toast("Alerts stay off. You can allow them in your browser settings"); return }
    await fbReady;
    const reg = await navigator.serviceWorker.ready;
    const key = await pushServerKey();
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey && btoaUrl(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
    await pushSave(sub);
    pushOn = true;
    if (!quiet) toast("This device will ring for new alerts, even with Pitch Room closed", 3500);
  } catch (e) {
    pushErr = e && e.message === "ios" ? "ios" : "failed";
    if (!quiet) toast(pushErr === "ios" ? "On iPhone, add Pitch Room to your Home Screen first" : "Couldn't turn on alerts on this device. Try again in a moment", 4500);
  } finally { pushBusy = false; render() }
}

async function pushDisable() {
  pushBusy = true; render();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    const subs = { ...((people[me] || {}).pushSubs || {}) }; delete subs[pushDeviceId()];
    people[me] = { ...(people[me] || {}), pushSubs: subs };
    await setDoc(doc(db, "users", me), { pushSubs: { [pushDeviceId()]: DEL() } }, { merge: true });
    pushOn = false; toast("This device won't get alerts when the site is closed");
  } catch { toast("Couldn't turn it off. Try again") }
  finally { pushBusy = false; render() }
}

// On sign out: this device stops ringing for this account.
async function pushForget() {
  if (!pushSupported() || !me) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await setDoc(doc(db, "users", me), { pushSubs: { [pushDeviceId()]: DEL() } }, { merge: true });
  pushOn = false;
}

// Ask the push server to ring people's devices.
async function pushSend(msgs) {
  if (!pushBase() || !msgs.length || !auth || !auth.currentUser) return null;
  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(pushBase() + "/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ msgs }) });
    return await r.json();
  } catch { return null }
}

async function pushTest() {
  const r = await pushSend([{ to: me, title: "Pitch Room", body: "Test alert: this device rings even when the site is closed.", tag: "test-" + Date.now(), go: "settings", force: true }]);
  toast(r && r.sent ? "Sent. Close or hide the site to see it next time" : "The test didn't go through. Check the push server address", 4000);
}

/* What my action means for each teammate. Same wording and keys as their bell (buildAlerts),
   so if their page is open the two pop-ups merge into one. Only things *I* just did. */
function pushAlertsFor(u) {
  const out = [], me1 = (realName(me) || "A friend").split(" ")[0], meFull = realName(me) || "Pitch Room";
  // title = who did it, text = what happened (without repeating the name)
  const add = (key, at, text, go, title) => { if (at) out.push({ key, at, text, go, title: title || meFull }) };
  const uAdmin = ADMINS.includes(((people[u] || {}).email || "").toLowerCase());
  const uPlans = p => uAdmin || p.author === u || !!(p.planners || {})[u];
  for (const p of ideas) {
    if (p.status === "voting" && p.author === me) add("idea:" + p.id, p.createdAt, `Pitched a new idea: ${p.title}`, "ideas");
    if (p.status === "completed" && p.completedBy === me) add("done:" + p.id, p.completedAt, `Marked ${p.title} as completed`, "projects-done");
    const pl = (p.planners || {})[u];
    if (pl && typeof pl === "object" && pl.by === me) add("planner:" + p.id, pl.at, `Made you a planner of ${p.title}`, "plan-" + p.id);
    if (p.status !== "approved") continue;
    for (const t of tasksOf(p)) {
      if (!isAssignee(t, u)) continue;
      if (t.assignedBy === me) add("task:" + t.id + ":" + t.assignedAt, t.assignedAt, `Gave you a task: ${t.text} · ${p.title}`, "me");
      const h = (t.helpers || {})[u];
      if (h && h.by === me) add("help:" + t.id, h.at, `Added you to a task: ${t.text} · ${p.title}`, "me");
      for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by === me) add("note:" + nid, n.at, `Left a note on your task: ${t.text}`, "plan-" + p.id);
      if (!t.done) {
        const w = waitInfo(p, t);
        if (w.deps.length && !w.open.length) {
          const last = w.deps.reduce((a, d) => (d.doneAt || 0) > (a.doneAt || 0) ? d : a, w.deps[0]);
          if (last.doneBy === me) add("ready:" + p.id + ":" + t.id + ":" + (last.doneAt || 0), last.doneAt, `Finished "${last.text}", so you can start "${t.text}"`, "project-" + p.id);
        }
      }
    }
    const inIt = uPlans(p) || !!(p.members || {})[u] || tasksOf(p).some(t => isAssignee(t, u));
    if (!inIt) continue;
    const wk = weekKey(), g = (p.goals || {})[wk];
    if (g && g.text && g.by === me) add("goal:" + p.id + ":" + wk + ":" + g.at, g.at, `New goal this week in ${p.title}: ${g.text}`, "build-" + p.id);
    const c = ((p.checkins || {})[wk] || {})[me];
    if (c && c.blockers) add("blk:" + p.id + ":" + me + ":" + c.at, c.at, `Is blocked in ${p.title}: ${c.blockers}`, "build-" + p.id);
    for (const f of filesOf(p)) if (f.by === me) add("file:" + f.id, f.at, `Added a file to ${p.title}: ${f.name}`, "project-" + p.id);
    for (const [lid, l] of Object.entries(p.links || {})) if (l && l.by === me) add("link:" + lid, l.at, `Added a link to ${p.title}: ${l.label || hostOf(l.url)}`, "project-" + p.id);
    for (const [mid, m] of Object.entries(p.meetings || {})) if (m && m.by === me) add("meet:" + mid, m.at, `Added meeting notes in ${p.title}${m.title ? ": " + m.title : ""}`, "build-" + p.id);
  }
  for (const [pid, a] of Object.entries(activeMap)) { const p = ideas.find(i => i.id === pid); if (p && a && a.by === me && p.status === "approved") add("start:" + pid + ":" + a.at, a.at, `We started building ${p.title}`, "build-" + pid) }
  if (!(people[u] || {}).newsOff) for (const [id, v] of Object.entries((newsDoc || {}).items || {})) if (v && v.title && v.by === me) add("news:post-" + id, v.at, `Posted: ${v.title}`, "me");
  for (const t of dmThreads) if (t.lastBy === me && (t.members || []).includes(u)) add("dm:" + t.id + ":" + t.lastAt, t.lastAt, t.lastText || "Sent you a message", "dm-" + me, `${meFull} · private`);
  for (const m of chat) {
    if (m.by !== me) continue;
    const o = m.replyTo && chat.find(x => x.id === m.replyTo);
    if (o && o.by === u) add("reply:" + m.id, m.at, `Replied: ${msgSummary(m)}`, "chat");
    else add("chat:" + m.id, m.at, msgSummary(m), "chat", `${meFull} · team chat`);
  }
  return out;
}

// After every change on screen, see if I caused something new for a teammate, and ring them.
function pushTick() {
  if (!live || !pushBase() || partnerMode || clientMode) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushRun, 1200);
}
function pushRun() {
  const team = Object.keys(people).filter(u => u !== me);
  if (pushBaseline === null) { pushBaseline = {}; for (const u of team) pushBaseline[u] = new Set(pushAlertsFor(u).map(a => a.key)); return }
  const since = Math.max(pageOpenedAt, Date.now() - 15 * 60e3);
  let sent = {}; try { sent = JSON.parse(localStorage.getItem("pushSent") || "{}") } catch { }
  for (const k of Object.keys(sent)) if (sent[k] < Date.now() - 864e5) delete sent[k];
  const msgs = [];
  for (const u of team) {
    const list = pushAlertsFor(u);
    if (!pushBaseline[u]) { pushBaseline[u] = new Set(list.map(a => a.key)); continue }
    const subs = (people[u] || {}).pushSubs || {};
    for (const a of list) {
      if (pushBaseline[u].has(a.key)) continue;
      pushBaseline[u].add(a.key);
      if (a.at < since || !Object.keys(subs).length || sent[u + "|" + a.key]) continue;
      sent[u + "|" + a.key] = Date.now();   // so a second open tab doesn't send it again
      msgs.push({ to: u, title: a.title || "Pitch Room", body: a.text, tag: a.key, go: a.go, icon: photoUrl(me) });
    }
  }
  try { localStorage.setItem("pushSent", JSON.stringify(sent)) } catch { }
  for (let i = 0; i < msgs.length; i += 40) pushSend(msgs.slice(i, i + 40));
}

// A soft two-note chime (like a small glass bell) when something new arrives while you're looking at the site.
var chimeAt = 0, chimeCtx = null;
function chime() {
  if (document.visibilityState !== "visible" || Date.now() - chimeAt < 1500) return;
  chimeAt = Date.now();
  try {
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (chimeCtx.state === "suspended") chimeCtx.resume();
    const t0 = chimeCtx.currentTime + 0.01, out = chimeCtx.createGain();
    out.gain.value = 0.22; out.connect(chimeCtx.destination);
    [[1046.5, 0], [1568, 0.11]].forEach(([f, d]) => {
      // a pure tone plus a quiet overtone, fading out slowly
      [[f, 1], [f * 2.01, 0.18]].forEach(([hz, vol]) => {
        const o = chimeCtx.createOscillator(), g = chimeCtx.createGain();
        o.type = "sine"; o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(vol, t0 + d + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.9);
        o.connect(g).connect(out); o.start(t0 + d); o.stop(t0 + d + 1);
      });
    });
  } catch { }
}

/* ----- alert cards ----- */
// A photo address short enough to send in a push alert (uploaded photos are stored inline and are too big).
function photoUrl(u) {
  const x = people[u] || {}, src = [x.pic, x.photo].find(v => typeof v === "string" && /^https:\/\//.test(v) && v.length < 400);
  return src || "";
}
// "Omar Ayman gave you a task: …" -> title "Omar Ayman", text "Gave you a task: …"
function splitAlert(a) {
  let text = a.text || "", title = "Pitch Room";
  if (a.who) {
    const full = realName(a.who) || "", first = full.split(" ")[0];
    title = full || "Pitch Room";
    for (const n of [full, first]) if (n && text.startsWith(n + " ")) { text = text.slice(n.length + 1); break }
    text = text.charAt(0).toUpperCase() + text.slice(1);
  } else if (a.key.startsWith("late:")) title = "Payment";
  else if (a.key.startsWith("due:")) title = "Reminder";
  else if (a.key.startsWith("sub:") || a.key.startsWith("review:") || a.key.startsWith("rules:")) title = "Money";
  else if (a.key.startsWith("news:")) title = "What's new";
  return { title, text };
}
var pingSeen = new Set();
const BELL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
// Show one alert: a card in the page if you're looking at it, otherwise the device's own pop-up.
function ping(a) {
  if (a.key && pingSeen.has(a.key)) return;
  if (a.key) pingSeen.add(a.key);
  if (document.visibilityState === "visible") { pingCard(a); chime(); return }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body: a.text, icon: photoUrl(a.who) || "torch-192.png", badge: "torch-badge.png", tag: a.key, silent: false, data: { go: a.go } };
  if (swReg) swReg.showNotification(a.title, opts).catch(() => {});
  else try { new Notification(a.title, opts) } catch { }
}
function pingCard(a) {
  const box = $("#pings"); if (!box) return;
  const ms = 6500;
  const close = () => { if (card.classList.contains("out")) return; card.classList.add("out"); setTimeout(() => card.remove(), 230) };
  const x = el("button", { class: "ping-x", "aria-label": "Dismiss", onclick: e => { e.stopPropagation(); close() } }, "\u2715");
  const ico = a.who ? av(a.who) : el("span", { class: "ping-ico" });
  if (!a.who) ico.innerHTML = BELL_SVG;
  const bar = el("span", { class: "ping-bar" }); bar.style.animationDuration = ms + "ms";
  const card = el("div", { class: "ping", role: "status", tabindex: "0", onclick: () => { close(); if (a.go) location.hash = a.go }, onkeydown: e => { if (e.key === "Enter") card.click() } },
    ico,
    el("span", { class: "ping-main" },
      el("span", { class: "ping-top" }, el("span", { class: "ping-title" }, a.title), el("span", { class: "ping-when" }, a.sub || "now")),
      el("span", { class: "ping-text" }, a.text)),
    x, bar);
  bar.addEventListener("animationend", close);
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) setTimeout(() => { if (!card.matches(":hover")) close() }, ms);
  box.prepend(card);
  [...box.children].slice(3).forEach(c => c.remove());
}

if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "push") chime() });

// Settings: alerts on this device, plus the push server address for the admin.
function pushSettings() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const box = el("section", { class: "idea" }, el("h3", {}, "Alerts on this device"));
  let line, btns = [];
  if (pushOn && perm === "granted") {
    line = "On. This device rings with its alert sound for new tasks, messages and replies, even when Pitch Room is closed.";
    btns = [el("button", { class: "btn small", onclick: pushTest }, "Send a test"), el("button", { class: "btn quiet small", disabled: pushBusy, onclick: pushDisable }, "Turn off")];
  } else if (perm === "denied") line = "Blocked in your browser settings. Allow notifications for this site there, then come back and turn them on.";
  else if (isIOS() && !isHomeScreenApp()) line = "On iPhone and iPad: tap Share, then Add to Home Screen. Open Pitch Room from the new icon and turn alerts on there.";
  else if (!pushSupported()) line = perm === "unsupported" ? "This browser can't show alerts. The bell still works." : "This browser only shows pop-ups while the site is open.";
  else if (!pushBase()) line = perm === "granted" ? "On while the site is open. Ringing when it's closed isn't set up yet." : "Off. Turn on to get pop-ups while the site is open.";
  else { line = "Off. Turn on to get alerts with sound on this phone or computer, even when Pitch Room is closed."; btns = [el("button", { class: "btn primary small", disabled: pushBusy, onclick: () => pushEnable() }, pushBusy ? "Turning on…" : "Turn on")] }
  if (!pushBase() && perm === "default" && pushSupported()) btns = [el("button", { class: "btn primary small", onclick: enableDeviceAlerts }, "Turn on")];
  btns.push(el("button", { class: "btn quiet small", onclick: () => { chimeAt = 0; pingCard({ title: realName(me) || "Pitch Room", who: me, sub: "now", text: "This is how a new alert looks and sounds", go: "" }); chime() } }, "Try it"));
  box.append(el("div", { class: "row", style: "gap:8px" }, el("span", { style: "flex:1 1 220px" }, line), ...btns));
  if (pushOn) box.append(el("p", { style: "font-size:12.5px;color:var(--muted);margin:6px 0 0" }, "Turn it on once on each phone and computer you use. If you hear nothing, check the device isn't on silent or Do Not Disturb, and that your browser is allowed to make notification sounds."));
  if (isAdmin) {
    const inp = el("input", { class: "noteinput", style: "flex:1 1 240px", placeholder: "https://pitch-room-push.yourname.workers.dev", "aria-label": "Push server address", value: pushUrl });
    const save = async () => {
      const v = inp.value.trim().replace(/\/+$/, "");
      if (v && !/^https:\/\/[^\s]+$/.test(v)) { toast("That should start with https://"); return }
      if (v) { try { const j = await (await fetch(v + "/key", { cache: "no-store" })).json(); if (!j.key) throw 0 } catch { toast("Couldn't reach a push server at that address", 4000); return } }
      write(() => setDoc(doc(db, "meta", "push"), { url: v, by: me, at: Date.now() }, { merge: true }), v ? "Push server saved. Now turn on alerts on this device" : "Push server removed");
    };
    box.append(el("div", { class: "row", style: "margin-top:10px;gap:8px" }, el("span", { style: "font-size:13px;color:var(--muted);flex:1 1 100%" }, "Push server (only you see this)"),
      inp, el("button", { class: "btn small", onclick: save }, "Save")));
  }
  return box;
}
