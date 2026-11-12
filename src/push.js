/* ----- alerts when the site is closed (Web Push) -----
   Each device that turns this on saves its push address in users/{uid}.pushSubs.
   When you do something that would show up in a teammate's bell (a task for them, a reply,
   a private message...), your browser asks the push server to ring their devices.
   The push server (push-server/worker.js, on Cloudflare) checks your sign-in with Firestore,
   so only the team can send. Its address is saved in meta/push by the admin. */

var pushUrl = "", pushKey = null, pushOn = false, pushBusy = false, pushErr = "";
var pushBaseline = null, pushTimer = null;
var PUSH_KINDS = ["fin", "ready", "idea", "done", "planner", "task", "help", "note", "goal", "blk", "file", "link", "meet", "start", "news", "dm", "reply", "chat"];

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
  if (url !== pushUrl) { pushUrl = url; pushKey = null; pushServerState = "" }
  pushCheck();
}

// Is this device already set up? If permission is granted and the server is known, quietly make sure the subscription is saved.
async function pushCheck() {
  if (!pushSupported() || !pushBase() || !me) { pushOn = false; return }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (Notification.permission !== "granted") { pushOn = false; render(); return }
    // still allowed, but the browser dropped the connection (cleared data, an update): reconnect by itself
    if (!sub) { if ((people[me] || {}).pushSubs && ((people[me] || {}).pushSubs || {})[pushDeviceId()]) await pushEnable(true); else { pushOn = false; render() } return }
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
  const r = await pushSend([{ to: me, title: "Pitch Room", body: "Test alert: this device rings even when the site is closed.", tag: "test-" + Date.now(), go: "settings-alerts", force: true }]);
  if (!r) return toast("Couldn't reach the alert server. Check your internet" + (isAdmin ? ", and the server address below" : `, or tell ${ADMIN_NAME}`), 5000);
  if (r.error) return toast(r.error === "Not allowed" ? "The server said you're not allowed. Sign out and in again" : "The alert server had a problem: " + r.error, 5000);
  if (r.sent) return toast("Sent! It should pop up now. Next time, close the site to see how alerts arrive", 4500);
  // nothing delivered: this device's connection is missing or expired, so make a fresh one
  await pushReconnect();
  toast(pushOn ? "This device's connection had expired. Fixed: send the test again" : "Couldn't deliver to this device. Open Something not working? below", 5000);
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
      if (!isAssignee(t, u)) {
        // a task they gave out: tell them when I finish it or leave a note
        if (t.assignedBy !== u || !isAssignee(t, me)) continue;
        if (t.done && t.doneBy === me) add("fin:" + t.id + ":" + (t.doneAt || 0), t.doneAt, `Finished "${t.text}" (${p.title})`, taskLink(p, t));
        for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by === me) add("note:" + nid, n.at, `Left a note on a task you gave out: ${t.text}`, taskLink(p, t));
        continue;
      }
      if (t.assignedBy === me) add("task:" + t.id + ":" + t.assignedAt, t.assignedAt, `Gave you a task: ${t.text} · ${p.title}`, taskLink(p, t));
      const h = (t.helpers || {})[u];
      if (h && h.by === me) add("help:" + t.id, h.at, `Added you to a task: ${t.text} · ${p.title}`, taskLink(p, t));
      for (const [nid, n] of Object.entries(t.notes || {})) if (n && n.by === me) add("note:" + nid, n.at, `Left a note on your task: ${t.text}`, taskLink(p, t));
      if (!t.done) {
        const w = waitInfo(p, t);
        if (w.deps.length && !w.open.length) {
          const last = w.deps.reduce((a, d) => (d.doneAt || 0) > (a.doneAt || 0) ? d : a, w.deps[0]);
          if (last.doneBy === me) add("ready:" + p.id + ":" + t.id + ":" + (last.doneAt || 0), last.doneAt, `Finished "${last.text}", so you can start "${t.text}"`, taskLink(p, t));
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
  const team = teamIds().filter(u => u !== me);   // team alerts only ever go to team members
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

// Settings: a guided setup for alerts on this device, with fixes for the usual problems and
// copy buttons for anything that has to be pasted. The admin also gets the one-time server setup.
var pushServerState = "", pushGuide = null, pushFix = null, pushCodeBusy = false;
const SETUP_LINK = "https://mohammeddalajmiii-cyber.github.io/the-office-/";
const devKind = () => { const ua = navigator.userAgent;
  if (isIOS()) return "ios"; if (/Android/i.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return "macsafari";
  return "computer" };
const browserName = () => { const ua = navigator.userAgent; return /Edg\//.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "your browser" };
async function copyText(t, ok) { try { await navigator.clipboard.writeText(t); toast(ok || "Copied") } catch { const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand("copy"); toast(ok || "Copied") } catch { toast("Couldn't copy. Select it and copy by hand", 4000) } ta.remove() } }
const copyBox = (text, label) => el("div", { class: "copybox" }, el("code", {}, text), el("button", { class: "btn small", onclick: () => copyText(text, (label || "Copied")) }, "Copy"));

// Is the team's alert server answering? Checked once per visit to Settings.
async function pushServerCheck() {
  if (!pushBase()) { pushServerState = "none"; return }
  pushServerState = "checking";
  try { pushKey = null; await pushServerKey(); pushServerState = "ok" }
  catch (e) { pushServerState = /no key/i.test(String(e && e.message)) ? "nokey" : "down" }
  render();
}
// Turn this device off and on again: fixes an expired or broken connection.
async function pushReconnect() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe() } catch { }
  pushOn = false; await pushEnable(true);
}
// Only this device keeps getting alerts for my account (old phones and browsers stop).
async function pushOnlyThisDevice() {
  const mine = ((people[me] || {}).pushSubs || {})[pushDeviceId()];
  const others = Object.keys((people[me] || {}).pushSubs || {}).filter(k => k !== pushDeviceId());
  if (!others.length) { toast("Only this device is connected"); return }
  await write(() => setDoc(doc(db, "users", me), { pushSubs: Object.fromEntries(others.map(k => [k, DEL()])) }, { merge: true }), `Removed ${others.length} old device${others.length > 1 ? "s" : ""}. Turn alerts on again on any device you still use`);
  people[me] = { ...(people[me] || {}), pushSubs: mine ? { [pushDeviceId()]: mine } : {} };
}
// The server code with a fresh key filled in, ready to paste into Cloudflare. The key stays on this device so copying again gives the same one.
async function pushWorkerCode() {
  let jwk = null; try { jwk = JSON.parse(localStorage.getItem("pushVapid") || "null") } catch { }
  if (!jwk) {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const j = await crypto.subtle.exportKey("jwk", k.privateKey); jwk = { kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d };
    try { localStorage.setItem("pushVapid", JSON.stringify(jwk)) } catch { }
  }
  const src = await (await fetch("push-server/worker.js?v=" + Date.now(), { cache: "no-store" })).text();
  if (!src.includes("const VAPID = null;")) throw new Error("template");
  return src.replace("const VAPID = null;", "const VAPID = " + JSON.stringify(jwk) + ";   // secret: don't share this code");
}
function teamSetupMessage() {
  return `Turn on Pitch Room alerts (2 minutes, do it on your phone AND your laptop):
1. Open ${SETUP_LINK}
   iPhone: open it in Safari, tap Share > Add to Home Screen, then open Pitch Room from the new icon.
   Android: open it in Chrome (menu > Add to Home screen is best).
   Laptop: open it in Chrome or Edge.
2. Tap ⋯ (top right) > Settings > Alerts, then Turn on and Allow.
3. Tap Send a test. You should hear it ring.
Stuck? Settings > Alerts > Something not working? has a fix for every problem.`;
}

const STEPS_FN = () => ({
  ios: { name: "iPhone or iPad", steps: [
    ["Open the site in Safari", "Alerts on iPhone only work from the Home Screen app, and it has to be added from Safari.", copyBox(SETUP_LINK, "Link copied. Paste it in Safari")],
    ["Add it to your Home Screen", "Tap the Share button (the square with an arrow), scroll down, tap Add to Home Screen, then Add."],
    ["Open Pitch Room from the new icon", "Not from Safari. It opens full screen, like an app."],
    ["Turn on alerts", "Come back here (Me › Settings › Alerts), tap Turn on, then Allow."],
    ["Send a test", "Then lock the phone. Alerts arrive with your iPhone's sound."]],
    note: "Needs iOS 16.4 or newer (Settings › General › About)." },
  android: { name: "Android", steps: [
    ["Open the site in Chrome", "Other browsers on Android often don't ring.", copyBox(SETUP_LINK, "Link copied. Paste it in Chrome")],
    ["Add it to your Home screen (best)", "Tap ⋮ at the top right, then Add to Home screen or Install app."],
    ["Turn on alerts", "Tap Turn on below, then Allow."],
    ["Send a test", "Then close the app. Alerts ring with your phone's notification sound."]] },
  computer: { name: "Computer (Chrome or Edge)", steps: [
    ["Open the site in Chrome or Edge", "They ring even with every Pitch Room tab closed, as long as the browser is running.", copyBox(SETUP_LINK, "Link copied")],
    ["Turn on alerts", "Tap Turn on below, then Allow in the box near the address bar."],
    ["Send a test", "Then close the tab. Windows and Mac show it in the corner with a sound."],
    ["Keep it in the background", "Chrome: Settings › System › Continue running background apps when Chrome is closed: on."]] },
  macsafari: { name: "Mac (Safari)", steps: [
    ["Open the site in Safari", "Needs macOS 13 or newer. Chrome on Mac works too.", copyBox(SETUP_LINK, "Link copied")],
    ["Best: add it to the Dock", "File › Add to Dock. It then rings even when Safari is closed."],
    ["Turn on alerts", "Tap Turn on below, then Allow."],
    ["Send a test", "Alerts show at the top right of the screen."]] },
});
function blockedFix(kind) {
  const b = browserName();
  if (kind === "ios") return el("ol", { class: "fixsteps" }, el("li", {}, "Open the iPhone Settings app › Notifications › Pitch Room."), el("li", {}, "Turn on Allow Notifications, Sounds and Lock Screen."),
    el("li", {}, "Not in the list? Delete the Pitch Room icon from your Home Screen, add it again from Safari, open it and tap Turn on."));
  if (kind === "android") return el("ol", { class: "fixsteps" }, el("li", {}, "In Chrome, tap the icon left of the address › Permissions › Notifications › Allow."),
    el("li", {}, "Or: phone Settings › Apps › Chrome (or Pitch Room) › Notifications › turn everything on."), el("li", {}, "Come back and tap Turn on."));
  if (kind === "macsafari") return el("ol", { class: "fixsteps" }, el("li", {}, "Safari › Settings › Websites › Notifications."), el("li", {}, "Find mohammeddalajmiii-cyber.github.io and set it to Allow."), el("li", {}, "Reload this page and tap Turn on."));
  const url = b === "Edge" ? "edge://settings/content/notifications" : b === "Firefox" ? "about:preferences#privacy" : "chrome://settings/content/notifications";
  return el("ol", { class: "fixsteps" }, el("li", {}, "Click the icon left of the address bar (ⓘ or the sliders) › Notifications › Allow, then reload."),
    el("li", {}, `Or paste this in a new ${b} tab and move this site from Not allowed to Allowed:`, copyBox(url, "Copied. Paste it in the address bar")),
    el("li", {}, "Reload this page and tap Turn on."));
}
function soundFix(kind) {
  return el("ol", { class: "fixsteps" }, ...({
    ios: ["Settings › Notifications › Pitch Room: Sounds on, style Banners.", "Turn off Focus or Do Not Disturb (swipe down from the top right), or allow Pitch Room in it.", "Check the ring/silent switch on the side of the phone."],
    android: ["Settings › Apps › Chrome (or Pitch Room) › Notifications: set the sound and Pop on screen.", "Turn off Do Not Disturb.", "Settings › Apps › Chrome › Battery: Unrestricted, so the phone doesn't put it to sleep."],
    macsafari: ["System Settings › Notifications › Safari (or Pitch Room): Allow notifications, style Alerts, Play sound on.", "Turn off Focus / Do Not Disturb in the menu bar."],
    computer: navigator.platform.startsWith("Win") ? ["Windows Settings › System › Notifications: on, and on for " + browserName() + ", with sound.", "Turn off Do not disturb (Focus) in the same place.", "Keep " + browserName() + " running in the background."] :
      ["System Settings › Notifications › " + (browserName() === "Edge" ? "Microsoft Edge" : "Google Chrome") + ": Allow notifications, style Alerts, Play sound on.", "Turn off Focus / Do Not Disturb.", "Keep " + browserName() + " running in the background."],
  }[kind]).map(t => el("li", {}, t)));
}

function pushSettings() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const kind = devKind(), showKind = pushGuide || kind, iosNeedsApp = kind === "ios" && !isHomeScreenApp();
  if (!pushServerState) setTimeout(pushServerCheck, 0);
  const box = el("section", { class: "idea alertsetup" }, el("div", { class: "row" }, el("h3", {}, "Alerts on this device"), el("span", { class: "spacer" }),
    el("span", { class: "mstat " + (pushOn && perm === "granted" ? "paid" : "due") }, pushOn && perm === "granted" ? "✓ On" : "Off")));

  // the checklist: each line says what's wrong and the one thing to do about it
  const srv = pushServerState, check = (ok, title, sub, ...act) => el("div", { class: "chk " + (ok === true ? "ok" : ok === false ? "bad" : "wait") },
    el("span", { class: "chk-i" }, ok === true ? "✓" : ok === false ? "!" : "•"), el("div", { class: "chk-t" }, el("b", {}, title), sub ? el("span", {}, sub) : null), act.length ? el("div", { class: "chk-a" }, ...act) : null);
  const list = el("div", { class: "chklist" });
  list.append(check(srv === "ok" ? true : srv === "checking" || !srv ? null : false, "Alert server",
    srv === "ok" ? "Working. It rings phones and computers when the site is closed." : srv === "checking" || !srv ? "Checking…" : srv === "none" ? (isAdmin ? "Not set up yet. It's free and takes 5 minutes: see Set up the alert server below." : `Not set up yet. ${ADMIN_NAME} sets it up once for everyone.`)
      : srv === "nokey" ? (isAdmin ? "The server has no key. Copy the server code again (step 3 below) and deploy it." : `The server needs fixing. Tell ${ADMIN_NAME}.`) : "Not answering right now. Check your internet, then try again.",
    srv === "down" ? el("button", { class: "btn small", onclick: () => { pushServerState = ""; render() } }, "Check again") : null));
  list.append(check(pushSupported() ? true : false, "This " + (kind === "ios" ? (isHomeScreenApp() ? "Home Screen app" : "browser") : "browser"),
    pushSupported() ? browserName() + " can get alerts." : iosNeedsApp ? "On iPhone, alerts only work from the Home Screen app. Follow the iPhone steps below." : "This browser can't get alerts. Use Chrome or Edge (or Safari on iPhone and Mac)."));
  list.append(check(perm === "granted" ? true : perm === "denied" ? false : null, "Permission",
    perm === "granted" ? "Allowed." : perm === "denied" ? "Blocked. See Blocked by mistake below to allow it again." : "Not asked yet. Tap Turn on and choose Allow."));
  const devs = Object.keys((people[me] || {}).pushSubs || {}).length;
  list.append(check(pushOn ? true : null, "This device", pushOn ? `Connected. ${devs > 1 ? `You get alerts on ${devs} devices.` : "Do the same on your other phone or computer."}` : "Not connected yet.",
    pushOn ? el("button", { class: "btn small primary", onclick: pushTest }, "Send a test")
      : pushSupported() && perm !== "denied" && srv !== "none" ? el("button", { class: "btn small primary", disabled: pushBusy, onclick: () => pushEnable() }, pushBusy ? "Turning on…" : "Turn on") : null));
  box.append(list);
  box.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: "flex:1 1 200px;text-transform:none;letter-spacing:0" }, "Turn it on once on each phone and computer you use."),
    el("button", { class: "btn quiet small", onclick: () => { chimeAt = 0; pingCard({ title: realName(me) || "Pitch Room", who: me, sub: "now", text: "This is how a new alert looks and sounds", go: "" }); chime() } }, "Preview"),
    pushOn ? el("button", { class: "btn quiet small", disabled: pushBusy, onclick: pushDisable }, "Turn off") : null));

  // step by step for this kind of device (switchable, to help someone else)
  const STEPS = STEPS_FN(), g = STEPS[showKind];
  box.append(el("details", { class: "setdetails", open: !pushOn }, el("summary", {}, el("b", {}, "How to set it up"), el("span", { class: "label" }, g.name)),
    el("div", { class: "seg seg-sm", role: "group", "aria-label": "Device", style: "margin-bottom:10px;flex-wrap:wrap" }, Object.entries(STEPS).map(([k, v]) => el("button", { "aria-pressed": String(showKind === k), onclick: () => { pushGuide = k; render() } }, v.name.replace(" (Chrome or Edge)", "").replace(" or iPad", "")))),
    el("ol", { class: "setsteps" }, g.steps.map(([t, d, extra]) => el("li", {}, el("b", {}, t), el("span", {}, d), extra || null))),
    g.note ? el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, g.note) : null));

  // fixes for what usually goes wrong
  const fixes = [
    ["blocked", "Blocked by mistake", () => blockedFix(kind)],
    ["test", "The test didn't arrive", () => el("ol", { class: "fixsteps" }, el("li", {}, "Tap Reconnect this device. It fixes an expired connection."), el("li", {}, "Send the test again, then close or hide the site."),
      el("li", {}, "Still nothing? Check sound and Focus below.", el("div", { class: "row", style: "margin-top:6px" }, el("button", { class: "btn small primary", disabled: pushBusy, onclick: async () => { await pushReconnect(); if (pushOn) toast("Reconnected. Send a test now") } }, "Reconnect this device"))))],
    ["sound", "It arrives but makes no sound", () => soundFix(kind)],
    ["stopped", "It worked before, then stopped", () => el("ol", { class: "fixsteps" }, el("li", {}, "Open Pitch Room once: it reconnects by itself when it can."), el("li", {}, "If not, tap Reconnect this device in The test didn't arrive."),
      el("li", {}, "Getting alerts on an old phone you don't use? Keep only this device, then turn alerts on again on the others.", el("div", { class: "row", style: "margin-top:6px" }, el("button", { class: "btn small", onclick: pushOnlyThisDevice }, "Keep only this device"))))],
    ["ios", "iPhone: there's no Turn on button", () => el("ol", { class: "fixsteps" }, el("li", {}, "You're in Safari, not the Home Screen app. Follow the iPhone steps above."), el("li", {}, "Update iOS if it's older than 16.4."))],
  ];
  box.append(el("details", { class: "setdetails" }, el("summary", {}, el("b", {}, "Something not working?"), el("span", { class: "label" }, "Quick fixes")),
    el("div", { class: "fixlist" }, fixes.map(([k, t, body]) => el("div", { class: "fix" + (pushFix === k ? " open" : "") },
      el("button", { class: "fix-h", "aria-expanded": String(pushFix === k), onclick: () => { pushFix = pushFix === k ? null : k; render() } }, t), pushFix === k ? body() : null)))));

  // who on the team gets alerts, so nobody silently misses them
  const crew = teamIds().filter(u => (people[u] || {}).email);
  if (crew.length > 1) box.append(el("details", { class: "setdetails" }, el("summary", {}, el("b", {}, "Who gets alerts"), el("span", { class: "label" }, `${crew.filter(u => Object.keys((people[u] || {}).pushSubs || {}).length).length} of ${crew.length} people`)),
    el("div", { style: "display:grid;gap:4px" }, crew.map(u => { const n = Object.keys((people[u] || {}).pushSubs || {}).length;
      return el("div", { class: "teamrow" }, av(u), el("span", { class: "teammail" }, name(u)), el("span", { class: n ? "done-badge" : "label" }, n ? `${n} device${n > 1 ? "s" : ""}` : "Not on yet")) })),
    el("div", { class: "row", style: "margin-top:8px" }, el("span", { class: "label", style: "flex:1 1 200px;text-transform:none;letter-spacing:0" }, "Send this to anyone who isn't on yet:"),
      el("button", { class: "btn small", onclick: () => copyText(teamSetupMessage(), "Message copied. Paste it in WhatsApp or the chat") }, "Copy setup message"))));

  // the one-time server setup (admin only)
  if (isAdmin) {
    const inp = el("input", { class: "noteinput", style: "flex:1 1 240px", placeholder: "https://pitch-room-push.yourname.workers.dev", "aria-label": "Alert server address", value: pushUrl });
    const save = async () => {
      let v = inp.value.trim().replace(/\/+$/, ""); if (v && !/^https?:\/\//.test(v)) v = "https://" + v;
      if (v && !/^https:\/\/[^\s]+$/.test(v)) { toast("That should start with https://"); return }
      if (v) { try { const j = await (await fetch(v + "/key", { cache: "no-store" })).json(); if (!j.key) { toast(j.error === "This server has no key yet" ? "The server has no key. Copy the code from step 3 again, paste it and Deploy" : "That address answered, but it isn't the alert server", 5000); return } } catch { toast("Couldn't reach a server at that address. Check it was deployed, and copy the address exactly", 5000); return } }
      await write(() => setDoc(doc(db, "meta", "push"), { url: v, by: me, at: Date.now() }, { merge: true }), v ? "Alert server connected. Now tap Turn on" : "Alert server removed");
      pushServerState = ""; render();
    };
    const getCode = async () => { if (pushCodeBusy) return; pushCodeBusy = true; render();
      try { const code = await pushWorkerCode(); await copyText(code, "Server code copied. Paste it in Cloudflare (step 4)") }
      catch { toast("Couldn't make the code. Check your internet and try again", 4500) } finally { pushCodeBusy = false; render() } };
    const dl = async () => { try { const code = await pushWorkerCode(); const a = el("a", { href: URL.createObjectURL(new Blob([code], { type: "text/javascript" })), download: "pitch-room-push-worker.js" }); document.body.append(a); a.click(); a.remove() } catch { toast("Couldn't make the file") } };
    box.append(el("details", { class: "setdetails", open: srv === "none" || srv === "nokey" }, el("summary", {}, el("b", {}, "Set up the alert server"), el("span", { class: "label" }, srv === "ok" ? "Done ✓ · only you see this" : "Once, for the whole team · only you see this")),
      el("ol", { class: "setsteps" },
        el("li", {}, el("b", {}, "Make a free Cloudflare account"), el("span", {}, "Free plan is plenty (100,000 alerts a day)."), el("a", { class: "btn small", href: "https://dash.cloudflare.com/sign-up", target: "_blank", rel: "noopener noreferrer" }, "Open Cloudflare")),
        el("li", {}, el("b", {}, "Create a Worker"), el("span", {}, "Workers & Pages › Create › Create Worker (Start with Hello World). Name it:"), copyBox("pitch-room-push", "Name copied"), el("span", {}, "Then click Deploy.")),
        el("li", {}, el("b", {}, "Copy the server code"), el("span", {}, "It comes with your own secret key already filled in. Don't share it or put it on GitHub."),
          el("div", { class: "row", style: "gap:6px" }, el("button", { class: "btn small primary", disabled: pushCodeBusy, onclick: getCode }, pushCodeBusy ? "Making it…" : "Copy server code"), el("button", { class: "btn small quiet", onclick: dl }, "Download it instead"))),
        el("li", {}, el("b", {}, "Paste it into the Worker"), el("span", {}, "Click Edit code, select everything and delete it, paste, then click Deploy.")),
        el("li", {}, el("b", {}, "Paste the Worker's address here"), el("span", {}, "It's shown on the Worker's page, like https://pitch-room-push.yourname.workers.dev"),
          el("div", { class: "row", style: "gap:8px" }, inp, el("button", { class: "btn small primary", onclick: save }, "Save and test"))),
        el("li", {}, el("b", {}, "Turn it on and tell the team"), el("span", {}, "Tap Turn on above, send a test, then copy the setup message in Who gets alerts and send it to everyone."))),
      el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "Copying the code again on this device gives the same key. If you copy it on another device, everyone's alerts reconnect by themselves the next time they open the site.")));
  }
  return box;
}

/* ----- put Pitch Room on the Home Screen, the Dock or the desktop, like an app ----- */
var installEvt = null, installGuideKind = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; try { render() } catch { } });
window.addEventListener("appinstalled", () => { installEvt = null; toast("Pitch Room is installed. Open it from your apps"); try { render() } catch { } });
const INSTALL = () => ({
  ios: ["iPhone or iPad", [
    ["Open the site in Safari", "It has to be Safari for this step.", copyBox(SETUP_LINK, "Link copied. Paste it in Safari")],
    ["Tap the Share button", "The square with an arrow: at the bottom on iPhone, at the top on iPad."],
    ["Tap Add to Home Screen, then Add", "Scroll down the list if you don't see it."],
    ["Open Pitch Room from the new icon", "From now on, always open it from there. It's also the only way alerts work on iPhone."]]],
  android: ["Android", [
    ["Open the site in Chrome", "", copyBox(SETUP_LINK, "Link copied. Paste it in Chrome")],
    ["Tap ⋮ (top right), then Add to Home screen", "Some phones say Install app. Choose Install."],
    ["Open Pitch Room from the new icon", "It opens full screen, without the browser bars."]]],
  windows: ["Windows", [
    ["Open the site in Chrome or Edge", "", copyBox(SETUP_LINK, "Link copied")],
    ["Install it", "Chrome: ⋮ › Cast, save and share › Install page as app › Install. Edge: ⋯ › Apps › Install this site as an app."],
    ["Pin it", "It opens in its own window and is in the Start menu. Right-click its icon on the taskbar › Pin to taskbar."],
    ["Just want a desktop shortcut?", "Make the browser window smaller, then drag the icon left of the address onto your desktop."]]],
  mac: ["Mac", [
    ["Safari (macOS 14 or newer)", "Open the site, then File › Add to Dock › Add.", copyBox(SETUP_LINK, "Link copied")],
    ["Or Chrome", "⋮ › Cast, save and share › Install page as app › Install. It goes in your Applications folder."],
    ["Keep it in the Dock", "While it's open, right-click its Dock icon › Options › Keep in Dock."]]],
});
function installGuide() {
  const kind = installGuideKind || (devKind() === "ios" ? "ios" : devKind() === "android" ? "android" : /Mac/.test(navigator.platform) ? "mac" : "windows");
  const all = INSTALL(), [label, steps] = all[kind];
  const installed = isHomeScreenApp();
  return el("details", { class: "setdetails", open: false }, el("summary", {}, el("b", {}, "Install Pitch Room as an app"), el("span", { class: "label" }, installed ? "Done ✓ you're using the app" : "Home Screen, Dock or desktop")),
    installEvt && !installed ? el("div", { class: "row", style: "margin-bottom:10px" }, el("span", { style: "flex:1 1 200px;font-size:14px" }, "Your browser can install it in one tap."), el("button", { class: "btn primary small", onclick: async () => { const e = installEvt; installEvt = null; e.prompt(); try { await e.userChoice } catch { } render() } }, "Install now")) : null,
    el("div", { class: "seg seg-sm", role: "group", "aria-label": "Device", style: "margin-bottom:10px;flex-wrap:wrap" }, Object.entries(all).map(([k, v]) => el("button", { "aria-pressed": String(kind === k), onclick: () => { installGuideKind = k; render() } }, v[0].replace(" or iPad", "")))),
    el("ol", { class: "setsteps" }, steps.map(([t, d, extra]) => el("li", {}, el("b", {}, t), d ? el("span", {}, d) : null, extra || null))),
    el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, `Installed or not, it's the same Pitch Room: everything stays in sync. Share it with: ${SETUP_LINK}`));
}
