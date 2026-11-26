/* ===================== The agent (Nov 2026) =====================
   A teammate you chat with about a project. Every chat belongs to one project (or to planning a new one) and
   remembers what was decided. Private chats are only yours (stored with your private notes); shared chats belong to
   a project's team, and the agent answers there when someone writes @Agent.
   It does small things straight away (with Undo) and asks before big ones (a plan, a new project, deleting,
   posting for you, inviting someone). It never sees or changes money.
   The brain is free Gemini for now; agentBrain() is the one place to switch it to Claude later. */

let agPrivate = [], agShared = {}, agSharedErr = "", agMsgs = [], agMsgKey = "", agMsgStop = null, agUnsubs = [], agWatchKey = "";
let agBusy = false, agStream = "", agErr = null, agNew = null, agMemOpen = false, agMemEdit = null, agDelAsk = false, agCallAgent = true;
const agUndo = new Map();   // message id + action index -> how to undo it (only during this visit)
const AG_IC = { spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>', team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>' };

/* ----- where chats live ----- */
// private: private/{me}/agentChats/{cid} (+ /msgs) — shared: ideas/{pid}/agent/{cid} (+ /msgs), project memory: ideas/{pid}/agent/_memory
const agChatRef = c => c.shared ? doc(db, "ideas", c.pid, "agent", c.id) : doc(db, "private", me, "agentChats", c.id);
const agMsgsCol = c => c.shared ? collection(db, "ideas", c.pid, "agent", c.id, "msgs") : collection(db, "private", me, "agentChats", c.id, "msgs");
const agMemRef = pid => doc(db, "ideas", pid, "agent", "_memory");
const agAllChats = () => [...agPrivate, ...Object.values(agShared).flatMap(x => x.chats)].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
const agProjMemory = pid => (agShared[pid] && agShared[pid].memory) || "";
function agFind(r) {
  if (!r.cid) return null;
  return r.pid ? ((agShared[r.pid] || {}).chats || []).find(c => c.id === r.cid) || null : agPrivate.find(c => c.id === r.cid) || null;
}
const agHash = c => c.shared ? `agent-s-${c.pid}-${c.id}` : `agent-p-${c.id}`;
// projects you can open a shared chat in: the ones you're on the team of
const agMyProjects = () => ideas.filter(p => (p.status === "approved" || p.status === "voting") && (isAdmin || (p.status === "voting" ? p.author === me : projTeam(p).includes(me))))
  .sort((a, b) => (b.status === "approved") - (a.status === "approved") || (a.title || "").localeCompare(b.title || ""));

function agWatch() {
  if (!live || !me) return;
  const pids = ideas.filter(p => p.status === "approved" && (isAdmin || projTeam(p).includes(me))).map(p => p.id).sort();
  const key = me + "|" + pids.join(",");
  if (key === agWatchKey) return;
  agWatchKey = key; agUnsubs.forEach(f => f()); agUnsubs = [];
  agUnsubs.push(onSnapshot(collection(db, "private", me, "agentChats"), s => {
    agPrivate = s.docs.map(d => ({ id: d.id, ...d.data(), shared: false })); render();
  }, () => { }));
  const keep = {}; for (const pid of pids) keep[pid] = agShared[pid] || { chats: [], memory: "" };
  agShared = keep;
  for (const pid of pids) agUnsubs.push(onSnapshot(collection(db, "ideas", pid, "agent"), s => {
    const all = s.docs.map(d => ({ id: d.id, ...d.data() }));
    agShared[pid] = { chats: all.filter(c => !c.id.startsWith("_")).map(c => ({ ...c, pid, shared: true })), memory: ((all.find(c => c.id === "_memory") || {}).text) || "" };
    agSharedErr = ""; render();
  }, e => { if (e && e.code === "permission-denied") { agSharedErr = "rules"; render() } }));
}
function agWatchMsgs(c) {
  const key = c ? (c.shared ? c.pid + "/" : "") + c.id : "";
  if (key === agMsgKey) return;
  if (agMsgStop) { agMsgStop(); agMsgStop = null }
  agMsgKey = key; agMsgs = []; agStream = ""; agMemOpen = false; agMemEdit = null; agDelAsk = false;
  if (!c) return;
  agMsgStop = onSnapshot(query(agMsgsCol(c), orderBy("at"), limitToLast(200)), s => { agMsgs = s.docs.map(d => ({ id: d.id, ...d.data() })); render() },
    e => { if (e && e.code === "permission-denied" && c.shared) { agSharedErr = "rules"; render() } });
}

/* ----- the brain ----- */
const AGENT_BRAIN = "gemini";   // later: "claude" (through the site's small server, so the key stays secret)
let agSchemaP = null;
function agSchema(aiM) {
  if (agSchemaP) return agSchemaP;
  const S = aiM.Schema, str = d => S.string({ description: d });
  const taskItem = S.object({ properties: { text: str("the task"), phase: str("phase name"), who: str("first name or empty"), date: str("YYYY-MM-DD or empty") }, optionalProperties: ["phase", "who", "date"] });
  const action = S.object({
    properties: {
      type: str("start, done, note, step, due, rename, priority, assign, addtask, mytask, plan, newproject, deletetask, post or invite"),
      task: str("task code like T4"), project: str("project code like PRJ2"), text: str("text for the action"), who: str("a team member's first name"),
      date: str("YYYY-MM-DD"), phase: str("phase name"), title: str("new project title"), category: str("new project category"), pitch: str("new project pitch, 2-3 sentences"),
      tasks: S.array({ items: taskItem })
    },
    optionalProperties: ["task", "project", "text", "who", "date", "phase", "title", "category", "pitch", "tasks"]
  });
  agSchemaP = S.object({
    properties: { reply: str("what you say to the person"), actions: S.array({ items: action }), memory: str("updated notes for this chat, or empty"), projectMemory: str("facts the project team should remember, or empty"), title: str("2-5 word chat name, or empty") },
    optionalProperties: ["actions", "memory", "projectMemory", "title"], propertyOrdering: ["reply", "actions", "memory", "projectMemory", "title"]
  });
  return agSchemaP;
}
// pull the "reply" text out of half-written JSON, so it can show as it's written
function agPartialReply(s) {
  const m = s.match(/"reply"\s*:\s*"/); if (!m) return "";
  let out = "", i = m.index + m[0].length;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\"") break;
    if (ch === "\\") {
      const n = s[i + 1]; if (n === undefined) break;
      if (n === "u") { const h = s.slice(i + 2, i + 6); if (h.length < 4) break; out += String.fromCharCode(parseInt(h, 16)); i += 6; continue }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n; i += 2; continue;
    }
    out += ch; i++;
  }
  return out;
}
// Which models: Flash-Lite answers almost every message (fastest, ~500 free a day each); the bigger Flash model is kept
// for real planning (only ~20 free a day), and falls back to Flash-Lite the moment it's busy or used up.
const AG_FAST = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
const AG_SMART = ["gemini-3.8-flash"];
const agWantsSmart = (text, c) => !c.pid || /\bplan|break (it )?down|organi[sz]e|roadmap|schedule|launch|new project|assign (all|every)|خط[ةه]|نظ[ّ]?م|قس[ّ]?م|مشروع جديد|5[a6]a?t?a|5e6a/i.test(text);
// how much "thinking" before answering: as little as each model allows, for speed (a model that refuses gets none)
function agThinking(m) {
  if (/^gemini-2\.5-flash-lite/.test(m)) return { thinkingBudget: 0 };
  if (/flash-lite/.test(m)) return { thinkingLevel: "MINIMAL" };
  if (/^gemini-3/.test(m)) return { thinkingLevel: "LOW" };
  return null;
}
let agWarm = false;
// open the AI connection (and get the App Check pass) as soon as the Agent page opens, so the first answer starts fast
function agWarmUp() { if (agWarm) return; agWarm = true; loadAI().catch(() => { agWarm = false }) }
async function agentBrain(system, prompt, onReply, smart) {
  if (AGENT_BRAIN !== "gemini") throw new Error("brain not set up");
  const { aiM, ai } = await loadAI();
  const schema = agSchema(aiM);
  let good = ""; try { good = localStorage.getItem("agentModel") || "" } catch { }
  const order = [...new Set([...(smart ? AG_SMART : []), ...(AG_FAST.includes(good) ? [good] : []), ...AG_FAST])];
  let last, noThink = {};
  for (let i = 0; i < order.length; i++) {
    const m = order[i];
    try {
      const generationConfig = { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: "application/json", responseSchema: schema };
      const th = !noThink[m] && agThinking(m);
      if (th) { if (th.thinkingLevel && aiM.ThinkingLevel && aiM.ThinkingLevel[th.thinkingLevel]) th.thinkingLevel = aiM.ThinkingLevel[th.thinkingLevel]; generationConfig.thinkingConfig = th }
      const model = aiM.getGenerativeModel(ai, { model: m, systemInstruction: system, generationConfig });
      const res = await model.generateContentStream(prompt);
      let full = "";
      for await (const chunk of res.stream) { let part = ""; try { part = chunk.text() } catch { } if (part) { full += part; if (onReply) onReply(agPartialReply(full)) } }
      if (AG_FAST.includes(m)) try { localStorage.setItem("agentModel", m) } catch { }
      if (!full.trim()) throw Object.assign(new Error("empty answer"), { agEmpty: true });
      try { return JSON.parse(full.replace(/^\s*```(?:json)?|```\s*$/g, "").trim()) } catch { return { reply: agPartialReply(full) || full, actions: [] } }
    } catch (e) {
      last = e; const k = e && e.agEmpty ? "overloaded" : aiErrorKind(e);
      if (k === "thinking" && !noThink[m]) { noThink[m] = true; i--; continue }   // try the same model again without the thinking setting
      if (k !== "model" && k !== "busy" && k !== "overloaded") throw e;
      if (good === m) try { localStorage.removeItem("agentModel") } catch { }
    }
  }
  throw last;
}

const AGENT_RULES = () => `You are the Pitch Room agent: a sharp, friendly teammate (not a chatbot) for a small creative agency team in Egypt (Ardent Creative Studios: websites, Google Ads, branding). You live in one chat that belongs to one project, or to planning a new project.

HOW YOU WORK
- Think like a strong project lead: understand the goal, read the BOARD DATA, notice what's late, blocked, unassigned or missing, and suggest concrete next steps with a person and a date.
- Be short and direct. Plain text, short lines, simple dashes. No markdown headings, bold or tables.
- Use first names. Only use facts from BOARD DATA, MEMORY and the chat. If something isn't there, say so or ask one clear question.
- Keep going from the MEMORY and the recent messages: never start over or repeat yourself.
- You can't see or change money. If asked, point them to the Money page.
- In a shared chat several people talk and each message is labelled with a name. Answer the person who called you and keep the team in mind.

DOING THINGS (put them in "actions"; the app does them)
Small changes happen straight away (the person can undo them):
- start {task} | done {task, text: a short note for the team or empty} (only their own task, or a project they plan)
- note {task, text} | step {task, text} | due {task, date} | rename {task, text} | priority {task, text: "high" or "normal"}
- assign {task, who} | addtask {project, text, who, date, phase} | mytask {text, date} (a private to-do)
Big changes wait for approval (the app shows an Approve button):
- plan {project, tasks: [{text, phase, who, date}]} for several tasks or new phases at once
- newproject {title, category, pitch, tasks: [...]} pitches a new project with a ready plan; the team votes on it
- deletetask {task} | post {project, text} (a message in the project's chat in their name) | invite {project, who}
Rules: only act when they asked for it or clearly agreed. Use the exact codes from the BOARD DATA (T4, PRJ2); never invent codes. If you're not sure which task they mean, ask instead of acting. Never change projects marked DENIED_NOT_RELATED unless the user is the ADMIN. Only people on a project's team can get its tasks. Dates are YYYY-MM-DD, after today, realistic for friends with jobs or school. Match tasks to people's strengths and spread the work fairly. Split anything longer than a week.
In "reply", say in a line what you did or what's waiting for approval, then what's next.

MEMORY
- "memory": the full updated notes for this chat: goals, decisions, plans, who does what, preferences, open questions. At most 12 short lines; keep old notes that still matter. Empty if nothing changed.
- "projectMemory": only in a shared chat: decisions the whole project team should remember. Empty if nothing new.
- "title": a 2-5 word name for this chat, only when the chat has no name yet.

LANGUAGE
${ASSISTANT_RULES.slice(ASSISTANT_RULES.indexOf("You fully understand"), ASSISTANT_RULES.indexOf("WHO MAY CHANGE WHAT")).replace(/ACTION:, PHASE: and IDEA: lines always stay in this exact English format\./, "Task codes, dates and action types always stay in English.")}`;

function agLanguage(text) {
  const l = asstLang();
  if (l === "en") return "Reply only in English.";
  if (l === "ar") return "Reply only in spoken Egyptian Arabic (3ammeya) in Arabic letters.";
  if (l === "franco") return "Reply only in real Egyptian Franco.";
  return isFrancoArabic(text) ? "They wrote in Egyptian Franco: reply in real Egyptian Franco." : /[؀-ۿ]/.test(text) ? "They wrote in Arabic letters: reply in spoken Egyptian Arabic." : "Reply in their language and style.";
}
// What the agent sees: short and focused (a smaller prompt answers faster). This chat's project in full, your own open
// tasks, the team's strengths, and other projects by name only. Never money. Codes ([T4], [PRJ2]) are what actions use.
function agBoard(p) {
  const L = [], today = new Date(); asstRefs = {}; let n = 0;
  const short = (s, len = 100) => String(s || "").replace(/\s+/g, " ").slice(0, len);
  const pCode = proj => { for (const [k, v] of Object.entries(asstRefs)) if (v.pid === proj.id && !v.tid) return k; const k = "PRJ" + (++n); asstRefs[k] = { pid: proj.id }; return k };
  const tCode = (t, pid) => { const k = "T" + (++n); asstRefs[k] = { pid, tid: t.id }; return k };
  const who = t => assignees(t).map(u => realName(u) || "someone").join(", ") || "unassigned";
  const state = t => t.done ? "done" : inCheck(t) ? "finished, waiting for a check" : t.status === "doing" ? "in progress" : "not started";
  const tline = (proj, t, withProj) => `- [${tCode(t, proj.id)}] ${short(t.text)}${withProj ? ` [${proj.title}]` : ""} | ${who(t)} | ${state(t)}${t.due ? " | due " + t.due + (t.due < ymd(today) && !t.done ? " (LATE)" : "") : ""}${t.priority === "high" || t.priority === "urgent" ? " | high priority" : ""}${(() => { const w = waitInfo(proj, t); return w.open.length ? " | waiting for: " + w.open.map(d => short(d.text, 40)).join(", ") : "" })()}`;
  L.push(`Today: ${ymd(today)} (${dtf({ weekday: "long" }).format(today)}). You're talking with ${realName(me) || "a team member"}${isAdmin ? " (the ADMIN: may change any project)" : ""}.`);
  L.push("Team strengths: " + teamIds().map(u => { const s = topSkills(u).map(k => SKILLS[k].name).join(" + "); return realName(u) + (s ? ` (${s})` : "") }).join("; "));
  if (p) {
    const allowed = canModifyProject(p), tasks = tasksOf(p), phases = getPhases(p);
    L.push(`\nTHIS CHAT'S PROJECT: [${pCode(p)}] "${p.title}" | ${p.status === "voting" ? "an idea in the team vote" : p.status === "completed" ? "completed" : isActive(p) ? "being built now" : isPaused(p) ? "paused" : "not started yet"} | ${prioOf(p).name} priority | ${allowed ? "you may change it" : "DENIED_NOT_RELATED: you may not change it"}`);
    if (p.pitch) L.push("About: " + short(p.pitch, 400));
    L.push(`Team: ${projTeam(p).map(u => realName(u)).join(", ") || "nobody yet"} | Planners: ${plannerIds(p).map(u => realName(u)).join(", ") || "none"}`);
    const open = tasks.filter(t => !t.done), done = tasks.length - open.length;
    L.push(`Tasks: ${open.length} open, ${done} done${phases.length ? "" : " | no plan yet"}`);
    if (phases.length) phases.forEach(ph => {
      const pts = open.filter(t => t.phase === ph.id).slice(0, 25);
      L.push(`PHASE ${ph.name}${ph.due ? " (finish by " + ph.due + ")" : ""}${ph.paused ? " (paused)" : ""}: ${tasks.filter(t => t.phase === ph.id && t.done).length} done, ${tasks.filter(t => t.phase === ph.id && !t.done).length} open`);
      pts.forEach(t => L.push(tline(p, t)));
    });
    else open.slice(0, 40).forEach(t => L.push(tline(p, t)));
  }
  const mine = myTasks().filter(x => !x.closed && !x.t.done && !x.personal && (!p || x.p.id !== p.id)).slice(0, 12);
  if (mine.length) { L.push("\nYour open tasks in other projects:"); mine.forEach(x => L.push(tline(x.p, x.t, true))) }
  const pers = myTasks().filter(x => x.personal && !x.t.done).slice(0, 8);
  if (pers.length) { L.push("\nYour private to-dos:"); pers.forEach(x => { const k = "P" + (++n); asstRefs[k] = { personal: x.t.id }; L.push(`- [${k}] ${short(x.t.text)}${x.t.due ? " | due " + x.t.due : ""}`) }) }
  const others = ideas.filter(i => (i.status === "approved" || i.status === "voting") && (!p || i.id !== p.id)).slice(0, 30);
  if (others.length) L.push("\nOther projects and ideas: " + others.map(i => `[${pCode(i)}] ${i.title} (${i.status === "voting" ? "idea" : isActive(i) ? "building" : isPaused(i) ? "paused" : "project"}${canModifyProject(i) ? "" : ", DENIED_NOT_RELATED"})`).join("; "));
  return L.join("\n");
}

/* ----- one turn: send what someone wrote, get the agent's answer, do the small things, hold the big ones ----- */
async function agTurn(c, text) {
  if (agBusy) return;
  agBusy = c.id; agStream = ""; agErr = null; render(); agScroll(true);
  try { await agTurnInner(c, text) }
  catch (e) { agErr = { chat: c.id, text: aiErrorText(e), retry: text } }
  finally { agBusy = false; agStream = ""; render(); agScroll() }
}
async function agTurnInner(c, text) {
  const p = c.pid ? ideas.find(x => x.id === c.pid) : null;
  const who = realName(me) || "Team member";
  const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s };
  const recent = agMsgs.filter(m => !String(m.id).startsWith("local-")).slice(-12).map(m => m.by === "agent" ? `Agent: ${clip(m.text, 500)}${(m.acts || []).length ? " (" + m.acts.map(a => `${a.label} [${a.state}]`).join("; ") + ")" : ""}` : `${realName(m.by) || "Someone"}: ${clip(m.text, 600)}`).join("\n");
  const prompt = [
    `THIS CHAT: ${c.shared ? `a SHARED chat of the "${p ? p.title : "project"}" team` : `a PRIVATE chat with ${who}`}${p ? ` about the project "${p.title}"` : " about planning something new (no project yet)"}. Chat name: ${c.title || "(none yet)"}.`,
    `BOARD DATA\n${agBoard(p)}`,
    p && agProjMemory(p.id) ? `PROJECT MEMORY (the team's decisions)\n${agProjMemory(p.id)}` : "",
    c.memory ? `CHAT MEMORY\n${c.memory}` : "",
    recent ? `RECENT MESSAGES (oldest first)\n${recent}` : "",
    `LANGUAGE: ${agLanguage(text)}`,
    `NEW MESSAGE from ${who}:\n${text}`
  ].filter(Boolean).join("\n\n");
  const out = await agentBrain(AGENT_RULES(), prompt, partial => {
    agStream = partial; const b = document.getElementById("ag-stream");
    if (b && partial) { b.classList.remove("ag-typing"); b.textContent = partial; agScroll() }
  }, agWantsSmart(text, c));
  const acts = [];
  for (const a of (out.actions || []).slice(0, 25)) { const r = agResolve(a, c, p); if (r) acts.push(r) }
  const mid = uid(), now = Date.now();
  // small things: done right away by whoever called the agent, with their own permissions
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i]; if (a.state !== "do") continue;
    try { const back = await agRun(a); a.state = "done"; if (back) agUndo.set(mid + ":" + i, back) }
    catch (e) { a.state = "failed"; a.why = e && e.code === "permission-denied" ? "the site's rules didn't allow it" : "it didn't save" }
  }
  const reply = String(out.reply || "").trim() || (acts.length ? "Here's what I did." : "…");
  try {
    await fbReady;
    await setDoc(doc(agMsgsCol(c), mid), { by: "agent", text: reply.slice(0, 6000), at: now, for: me, acts: acts.map(a => ({ ...a, state: a.state === "do" ? "done" : a.state })) });
    const upd = { updatedAt: now, last: { by: "agent", text: reply.slice(0, 140), at: now } };
    if (out.memory && String(out.memory).trim()) upd.memory = String(out.memory).trim().slice(0, 2000);
    if (!c.title && out.title) upd.title = String(out.title).trim().slice(0, 60);
    await setDoc(agChatRef(c), upd, { merge: true });
    if (c.shared && out.projectMemory && String(out.projectMemory).trim()) {
      const old = agProjMemory(c.pid);
      await setDoc(agMemRef(c.pid), { text: (old ? old + "\n" : "") + String(out.projectMemory).trim().slice(0, 800), at: now, by: me }, { merge: true });
    }
  } catch (e) { toast(e && e.code === "permission-denied" ? "The agent's answer couldn't be saved (the site's rules)" : "The agent's answer couldn't be saved. Check your connection", 5000) }
}

/* ----- actions: turn what the agent asked for into something checked and ready ----- */
const AG_SMALL = ["start", "done", "note", "step", "due", "rename", "priority", "assign", "addtask", "mytask"];
const AG_BIG = ["plan", "newproject", "deletetask", "post", "invite"];
function agResolve(a, c, chatP) {
  const type = String(a.type || "").toLowerCase().trim();
  if (!AG_SMALL.includes(type) && !AG_BIG.includes(type)) return null;
  const txt = s => String(s || "").trim(), date = d => ymdOk(txt(d)) ? txt(d) : "";
  const out = { type, state: AG_BIG.includes(type) ? "ask" : "do" };
  const block = why => Object.assign(out, { state: "blocked", why });
  const person = (w, pool) => { const m = txt(w) ? matchPerson(txt(w)) : { id: null }; return m.id && (!pool || pool.includes(m.id)) ? m.id : null };
  // which task and which project
  let p = null, t = null;
  const tref = asstRefs[txt(a.task).toUpperCase()];
  if (tref && tref.personal) {
    const pt = personal.find(x => x.id === tref.personal);
    if (pt && type === "done") return Object.assign(out, { type: "pdone", tid: pt.id, label: `Marked done: ${pt.text}` });
    return null;
  }
  if (tref) { p = ideas.find(i => i.id === tref.pid); t = p && tasksOf(p).find(x => x.id === tref.tid) }
  const pref = asstRefs[txt(a.project).toUpperCase()];
  if (!p && pref && pref.pid) p = ideas.find(i => i.id === pref.pid);
  if (!p && chatP && type !== "newproject" && type !== "mytask") p = chatP;
  const needTask = ["start", "done", "note", "step", "due", "rename", "priority", "assign", "deletetask"].includes(type);
  if (needTask && !t) return null;
  if (type === "mytask") { if (!txt(a.text)) return null; return Object.assign(out, { text: txt(a.text).slice(0, 200), date: date(a.date), label: `Private to-do: ${txt(a.text).slice(0, 80)}` }) }
  if (type === "newproject") {
    if (!txt(a.title)) return null;
    return Object.assign(out, { title: txt(a.title).slice(0, 80), category: txt(a.category), pitch: txt(a.pitch).slice(0, 600), tasks: agTasks(a.tasks, null), label: `Pitch a new project: ${txt(a.title).slice(0, 60)}`, detail: `${(a.tasks || []).length} ${(a.tasks || []).length === 1 ? "task" : "tasks"} in its plan. The team votes on it` });
  }
  if (!p) return null;
  Object.assign(out, { pid: p.id, ptitle: p.title });
  if (t) Object.assign(out, { tid: t.id, ttext: t.text });
  if (!isAdmin && !canModifyProject(p)) return block(`you're not on the ${p.title} team`);
  const team = isProj(p) ? projTeam(p) : teamIds();
  switch (type) {
    case "start": if (!canWork(p, t)) return block("it isn't your task"); if (t.done || t.status === "doing") return null; out.label = `Started: ${t.text}`; break;
    case "done": if (!canWork(p, t)) return block("it isn't your task"); if (t.done) return null; out.text = txt(a.text).slice(0, 1000); out.label = needsSend(p, t) ? `Sent for a check: ${t.text}` : `Marked done: ${t.text}`; break;
    case "note": if (!txt(a.text)) return null; out.text = txt(a.text).slice(0, 1000); out.label = `Note on: ${t.text}`; out.detail = out.text; break;
    case "step": if (!canWork(p, t)) return block("it isn't your task"); if (!txt(a.text)) return null; out.text = txt(a.text).slice(0, 120); out.label = `Step added to: ${t.text}`; out.detail = out.text; break;
    case "due": if (!canWork(p, t)) return block("it isn't your task"); out.date = date(a.date); if (!out.date) return null; out.prev = t.due || null; out.label = `Due ${fmtDate(out.date)}: ${t.text}`; break;
    case "rename": if (!canWork(p, t)) return block("it isn't your task"); if (!txt(a.text)) return null; out.text = txt(a.text).slice(0, 200); out.label = `Renamed to: ${out.text}`; out.detail = "Was: " + t.text; break;
    case "priority": if (!canWork(p, t)) return block("it isn't your task"); out.high = /high|urgent|yes/i.test(txt(a.text)); out.label = `${out.high ? "High priority" : "Normal priority"}: ${t.text}`; break;
    case "assign": {
      if (!(canPlan(p) || !t.owner || t.owner === me)) return block("only a planner can move someone else's task");
      const u = person(a.who, team); if (!u) return block(`${txt(a.who) || "that person"} isn't on the ${p.title} team`);
      out.who = u; out.prev = t.owner || null; out.label = `Gave ${firstName(u) === "you" ? "you" : firstName(u)}: ${t.text}`; break;
    }
    case "addtask": {
      if (!inTeam(p)) return block(`you're not on the ${p.title} team`);
      if (!txt(a.text)) return null;
      Object.assign(out, { text: txt(a.text).slice(0, 200), who: person(a.who, team), date: date(a.date), phase: txt(a.phase) });
      out.label = `New task in ${p.title}: ${out.text}`; out.detail = [out.who ? "For " + realName(out.who) : "", out.date ? "Due " + fmtDate(out.date) : ""].filter(Boolean).join(" · "); break;
    }
    case "plan": out.tasks = agTasks(a.tasks, team); if (!out.tasks.length) return null; out.label = `Add a plan to ${p.title}`; out.detail = `${out.tasks.length} ${out.tasks.length === 1 ? "task" : "tasks"}${[...new Set(out.tasks.map(x => x.phase).filter(Boolean))].length ? " in " + [...new Set(out.tasks.map(x => x.phase).filter(Boolean))].join(", ") : ""}`; break;
    case "deletetask": out.label = `Delete task: ${t.text}`; break;
    case "post": if (!txt(a.text)) return null; out.text = txt(a.text).slice(0, 1000); out.label = `Post in the ${p.title} chat`; out.detail = out.text; break;
    case "invite": { const u = person(a.who, teamIds()); if (!u) return null; if (projTeam(p).includes(u)) return null; out.who = u; out.label = `Invite ${realName(u)} to the ${p.title} team`; break }
  }
  return out;
}
function agTasks(list, team) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(x => {
    const m = x && x.who ? matchPerson(String(x.who)) : { id: null };
    return { text: String((x && x.text) || "").trim().slice(0, 140), phase: String((x && x.phase) || "").trim().slice(0, 40), who: m.id && (!team || team.includes(m.id)) ? m.id : null, date: x && ymdOk(String(x.date || "")) ? String(x.date) : "" };
  }).filter(x => x.text);
}
// who may approve a big change: in a private chat its owner; in a shared chat the project's planners (and the admin)
function agCanApprove(c, a) {
  if (a.type === "newproject") return !c.shared || a.for === me || isAdmin;
  const p = ideas.find(x => x.id === a.pid);
  if (!c.shared) return true;
  return !!p && canPlan(p);
}
// do one action; returns how to undo it
async function agRun(a) {
  await fbReady;
  const p = a.pid ? ideas.find(x => x.id === a.pid) : null, t = p && a.tid ? tasksOf(p).find(x => x.id === a.tid) : null, now = Date.now(), nid = uid();
  if (a.pid && !p) throw new Error("gone");
  if (a.tid && !t && a.type !== "pdone") throw new Error("gone");
  switch (a.type) {
    case "pdone": { const r = doc(db, "private", me, "tasks", a.tid); await setDoc(r, { done: true, doneAt: now }, { merge: true }); return () => setDoc(r, { done: false, doneAt: null }, { merge: true }) }
    case "mytask": { const r = doc(db, "private", me, "tasks", nid); await setDoc(r, { text: a.text, done: false, due: a.date || null, priority: "medium", order: now }); return () => deleteDoc(r) }
    case "start": { const prev = t.status || null; await upd(p.id, { [t.path + ".status"]: "doing", [t.path + ".startedBy"]: me, [t.path + ".startedAt"]: now }); return () => upd(p.id, { [t.path + ".status"]: prev }) }
    case "done": {
      const note = a.text ? { [`${t.path}.notes.${nid}`]: { by: me, text: a.text, at: now } } : {}, noteBack = a.text ? { [`${t.path}.notes.${nid}`]: DEL() } : {};
      if (needsSend(p, t)) { await upd(p.id, { [t.path + ".review"]: { by: me, at: now }, [t.path + ".status"]: "doing", ...note }); return () => upd(p.id, { [t.path + ".review"]: DEL(), ...noteBack }) }
      await upd(p.id, { [t.path + ".done"]: true, [t.path + ".doneBy"]: me, [t.path + ".doneAt"]: now, ...note });
      return () => upd(p.id, { [t.path + ".done"]: false, [t.path + ".doneBy"]: DEL(), [t.path + ".doneAt"]: DEL(), ...noteBack });
    }
    case "note": await upd(p.id, { [`${t.path}.notes.${nid}`]: { by: me, text: a.text, at: now } }); return () => upd(p.id, { [`${t.path}.notes.${nid}`]: DEL() });
    case "step": await upd(p.id, { [`${t.path}.check.${nid}`]: { text: a.text, done: false, order: now } }); return () => upd(p.id, { [`${t.path}.check.${nid}`]: DEL() });
    case "due": { const prev = t.due || null; await upd(p.id, { [t.path + ".due"]: a.date }); return () => upd(p.id, { [t.path + ".due"]: prev }) }
    case "rename": { const prev = t.text; await upd(p.id, { [t.path + ".text"]: a.text }); return () => upd(p.id, { [t.path + ".text"]: prev }) }
    case "priority": { const prev = t.priority || "medium"; await upd(p.id, { [t.path + ".priority"]: a.high ? "high" : "medium" }); return () => upd(p.id, { [t.path + ".priority"]: prev }) }
    case "assign": {
      const prev = { o: t.owner || null, by: t.assignedBy || null, at: t.assignedAt || null };
      await upd(p.id, { [t.path + ".owner"]: a.who, [t.path + ".assignedBy"]: me, [t.path + ".assignedAt"]: now });
      return () => upd(p.id, { [t.path + ".owner"]: prev.o, [t.path + ".assignedBy"]: prev.by, [t.path + ".assignedAt"]: prev.at });
    }
    case "addtask": {
      const phases = getPhases(p), ph = phases.find(x => a.phase && x.name.toLowerCase() === a.phase.toLowerCase()) || phases[0];
      await upd(p.id, { [`tasks.${nid}`]: { text: a.text, phase: ph ? ph.id : "build", skill: null, owner: a.who || null, assignedBy: a.who ? me : null, assignedAt: a.who ? now : null, done: false, order: now, due: a.date || null, priority: "medium" } });
      return () => upd(p.id, { [`tasks.${nid}`]: DEL() });
    }
    case "plan": {
      const data = {}, made = [], existing = getPhases(p); let order = Math.max(0, ...existing.map(x => x.order || 0)), i = 0;
      const phaseIds = {};
      for (const x of a.tasks) {
        const nm = x.phase || (existing[0] ? existing[0].name : "Plan"), key = nm.toLowerCase();
        if (!phaseIds[key]) { const ex = existing.find(e => e.name.toLowerCase() === key); if (ex) phaseIds[key] = ex.id; else { const id = uid() + (i++); phaseIds[key] = id; data["phases." + id] = { name: nm.slice(0, 40), order: ++order, due: null }; made.push("phases." + id) } }
        const tid = uid() + (i++); made.push("tasks." + tid);
        data["tasks." + tid] = { text: x.text, phase: phaseIds[key], owner: x.who || null, assignedBy: x.who ? me : null, assignedAt: x.who ? now : null, due: x.date || null, priority: "medium", skill: null, done: false, order: now + i };
      }
      await phaseWrite(p, data);
      return () => upd(p.id, Object.fromEntries(made.map(k => [k, DEL()])));
    }
    case "newproject": {
      const tasks = {}, phases = {}, ids = {}; let order = 0, i = 0;
      for (const x of a.tasks || []) {
        const nm = x.phase || "Plan", key = nm.toLowerCase();
        if (!ids[key]) { ids[key] = uid() + (i++); phases[ids[key]] = { name: nm.slice(0, 40), order: ++order, due: null } }
        tasks[uid() + (i++)] = { text: x.text, phase: ids[key], owner: x.who || null, assignedBy: x.who ? me : null, assignedAt: x.who ? now : null, due: x.date || null, priority: "medium", skill: null, done: false, order: now + i };
      }
      const r = doc(db, "ideas", nid);
      await setDoc(r, { title: a.title, category: cleanCat(a.category) || "Other", pitch: a.pitch || "", status: "voting", author: me, votes: { [me]: "keep" }, createdAt: now, tasks, phases, backers: {} });
      a.newPid = nid;
      return () => deleteDoc(r);
    }
    case "deletetask": {
      if (!canPlan(p) && t.owner !== me) throw Object.assign(new Error("no"), { code: "permission-denied" });
      const raw = ((p[t.field] || {})[t.id]) || null;
      await upd(p.id, { [t.path]: DEL() });
      return raw ? () => upd(p.id, { [t.path]: raw }) : null;
    }
    case "post": { const r = doc(db, "ideas", p.id, "chat", nid); await setDoc(r, { by: me, text: a.text, at: now }); return () => deleteDoc(r) }
    case "invite": {
      if (!canPlan(p)) throw Object.assign(new Error("no"), { code: "permission-denied" });
      await upd(p.id, { ["invites." + a.who]: { by: me, at: now } }); return () => upd(p.id, { ["invites." + a.who]: DEL() });
    }
  }
  return null;
}
// approve or cancel the big changes in one answer
async function agDecide(c, m, ok) {
  const acts = (m.acts || []).map(a => ({ ...a }));
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i]; if (a.state !== "ask") continue;
    if (!ok) { a.state = "cancelled"; a.decidedBy = me; continue }
    if (!agCanApprove(c, { ...a, for: m.for })) continue;
    try { const back = await agRun(a); a.state = "done"; a.decidedBy = me; if (back) agUndo.set(m.id + ":" + i, back) }
    catch (e) { a.state = "failed"; a.why = e && e.code === "permission-denied" ? "the site's rules didn't allow it" : "it didn't save" }
  }
  try {
    await updateDoc(doc(agMsgsCol(c), m.id), { acts });
    // a new project made from a chat with no project: the chat now belongs to it
    const np = acts.find(a => a.type === "newproject" && a.state === "done" && a.newPid);
    if (np && !c.pid && !c.shared) await setDoc(agChatRef(c), { pid: np.newPid }, { merge: true });
  } catch { toast("Couldn't save that. Try again", 4000) }
}
async function agUndoAct(c, m, i) {
  const f = agUndo.get(m.id + ":" + i); if (!f) return;
  try { await f(); agUndo.delete(m.id + ":" + i); const acts = (m.acts || []).map((a, k) => k === i ? { ...a, state: "undone" } : a); await updateDoc(doc(agMsgsCol(c), m.id), { acts }); toast("Undone") }
  catch { toast("Couldn't undo. Try again", 4000) }
}

/* ----- sending ----- */
async function agSend(c) {
  const box = $("#ag-input"); const text = (box.value || "").trim(); if (!text || agBusy) return;
  // in a shared chat the agent answers while "Agent on" is set (the default), or when someone writes @Agent
  const callAgent = !c.shared || agCallAgent || /@agent\b/i.test(text);
  box.value = ""; agGrow(box); agSyncComposer(c);
  const now = Date.now();
  // show it straight away, before the database answers
  const mine = { id: "local-" + now, by: me, text, at: now };
  agMsgs = [...agMsgs, mine]; render(); agScroll(true);
  try {
    await fbReady;
    await setDoc(doc(agMsgsCol(c), uid()), { by: me, text: text.slice(0, 4000), at: now });
    await setDoc(agChatRef(c), { updatedAt: now, last: { by: me, text: text.slice(0, 140), at: now } }, { merge: true });
  } catch (e) { toast(e && e.code === "permission-denied" ? agRulesText() : "Couldn't send. Check your connection", 6000); return }
  if (callAgent) agTurn(c, text.replace(/@agent\b/ig, "").trim() || text);
}
const agRulesText = () => isAdmin ? "Shared agent chats need the new database rules. Publish firestore.rules from Cloud Shell (steps in the chat with Claude)." : `Shared agent chats aren't switched on yet. Ask ${ADMIN_NAME} to publish the new database rules.`;
async function agCreate(n) {
  await fbReady;
  const id = uid(), now = Date.now(), p = n.pid ? ideas.find(x => x.id === n.pid) : null, shared = !!(n.shared && p);
  const c = { id, pid: p ? p.id : null, shared, owner: me, title: "", createdAt: now, updatedAt: now, memory: "" };
  try { await setDoc(agChatRef(c), { pid: c.pid, owner: me, title: "", createdAt: now, updatedAt: now, memory: "", shared }) }
  catch (e) { toast(e && e.code === "permission-denied" ? agRulesText() : "Couldn't start the chat. Check your connection", 6000); return }
  if (shared) { agShared[p.id] = agShared[p.id] || { chats: [], memory: "" }; if (!agShared[p.id].chats.some(x => x.id === id)) agShared[p.id].chats.push(c) } else if (!agPrivate.some(x => x.id === id)) agPrivate.push(c);
  agNew = null; location.hash = agHash(c);
}
async function agDelete(c) {
  agDelAsk = false;
  try { await deleteDoc(agChatRef(c)); location.hash = "agent"; toast("Chat deleted") } catch { toast("Couldn't delete it. Try again", 4000) }
}

/* ----- the page ----- */
const agScroll = force => { const log = document.getElementById("ag-log"); if (log && (force || log.scrollHeight - log.scrollTop - log.clientHeight < 160)) log.scrollTop = log.scrollHeight };
function agGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px" }
function agSyncComposer(c) {
  const f = $("#ag-form"), i = $("#ag-input"), b = $("#ag-call");
  f.hidden = !c;
  if (!c) return;
  i.placeholder = c.shared ? (agCallAgent ? "Message the team and agent…" : "Message the team…") : "Message the agent…";
  b.hidden = !c.shared; b.setAttribute("aria-pressed", String(agCallAgent)); b.textContent = agCallAgent ? "Agent on" : "Agent off";
  b.title = agCallAgent ? "The agent answers your messages. Tap to talk to the team only" : "Only the team sees your messages. Tap to let the agent answer";
  $("#ag-send").disabled = !!agBusy;
}
function agWhen(at) { if (!at) return ""; const d = new Date(at), today = new Date(); return d.toDateString() === today.toDateString() ? timeFmt.format(d) : dateFmt.format(d) }

function renderAgent() {
  const box = $("#agent"); if (!box) return;
  agWatch(); agWarmUp();
  const r = route(), c = agFind(r);
  if (r.cid && !c && (agPrivate.length || Object.keys(agShared).length)) { /* chat not loaded yet or deleted */ }
  agWatchMsgs(c);
  agSyncComposer(c);
  document.getElementById("view-agent").classList.toggle("ag-in", !!c);
  const keepTop = box.querySelector("#ag-log") ? box.querySelector("#ag-log").scrollTop : null;
  const nearBottom = (() => { const l = box.querySelector("#ag-log"); return !l || l.scrollHeight - l.scrollTop - l.clientHeight < 160 })();
  box.replaceChildren();
  if (!c) { box.append(agListView(r)); return }
  box.append(agChatView(c));
  agSize();
  const log = $("#ag-log");
  if (log) { if (nearBottom || keepTop == null) log.scrollTop = log.scrollHeight; else log.scrollTop = keepTop }
}
// an open chat fills the screen down to the menu: the page stays still, only the messages scroll
function agSize() {
  const v = $("#view-agent"), root = document.documentElement, on = v.classList.contains("ag-in") && !v.hidden;
  root.classList.toggle("ag-lock", on);
  if (!on) { v.style.height = ""; return }
  if (scrollY) scrollTo(0, 0);
  const vv = window.visualViewport, H = vv ? vv.height + vv.offsetTop : innerHeight;
  const nav = document.querySelector("#app > .nav"), nr = nav && nav.getBoundingClientRect();
  const below = nr && nr.top > innerHeight / 2 ? innerHeight - nr.top : 0;   // phones: the menu bar sits at the bottom
  const kb = vv && innerHeight - vv.height > 120;   // keyboard open: use the space right above it
  v.style.height = Math.max(280, (kb ? H : H - below) - v.getBoundingClientRect().top - 10) + "px";
}

function agListView(r) {
  const wrap = el("div", { class: "ag-list" });
  wrap.append(el("div", { class: "ag-top" },
    el("div", { class: "ag-top-t" }, el("h1", {}, "Agent"), el("p", { class: "mut" }, "Plan and run your projects with an assistant that remembers. It does small things for you and asks before big ones.")),
    el("button", { class: "btn primary", onclick: () => { agNew = agNew ? null : { pid: (agMyProjects()[0] || {}).id || "", shared: false }; render() } }, agNew ? "Close" : "New chat")));
  if (agNew) wrap.append(agNewCard());
  if (agSharedErr === "rules") wrap.append(el("div", { class: "notice" }, isAdmin ? "Shared chats need the new database rules. Publish firestore.rules from Cloud Shell; private chats already work." : `Shared chats aren't switched on yet (${ADMIN_NAME} needs to publish the new database rules). Private chats already work.`));
  const all = agAllChats();
  if (!all.length && !agNew) wrap.append(el("div", { class: "ag-empty" },
    el("b", {}, "Start your first chat"),
    el("span", { class: "mut" }, "Pick a project, or plan a new one. Try: “What's late in this project and who should take it?” or “Plan the launch for next week.”"),
    el("button", { class: "btn primary", onclick: () => { agNew = { pid: (agMyProjects()[0] || {}).id || "", shared: false }; render() } }, "New chat")));
  const shared = all.filter(c => c.shared), priv = all.filter(c => !c.shared);
  const row = c => {
    const p = c.pid ? ideas.find(x => x.id === c.pid) : null;
    return el("a", { class: "ag-row", href: "#" + agHash(c) },
      el("span", { class: "ag-ic" + (c.shared ? " sh" : "") }, meIc(c.shared ? AG_IC.team : AG_IC.spark)),
      el("span", { class: "ag-row-t" },
        el("span", { class: "ag-row-h" }, el("b", {}, c.title || (p ? p.title : "New chat")), el("span", { class: "mut" }, agWhen(c.updatedAt))),
        el("span", { class: "mut ag-row-s" }, [p ? p.title : "No project yet", c.last ? (c.last.by === "agent" ? "Agent: " : c.last.by === me ? "You: " : firstName(c.last.by) + ": ") + c.last.text : ""].filter(Boolean).join(" · "))));
  };
  if (shared.length) wrap.append(el("section", { class: "me2-card ag-sec" }, el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "With your teams"), el("span", { class: "mut" }, shared.length)), shared.map(row)));
  if (priv.length) wrap.append(el("section", { class: "me2-card ag-sec" }, el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "Private"), el("span", { class: "mut" }, "Only you")), priv.map(row)));
  wrap.append(el("p", { class: "label ag-foot" }, "Runs on Google's free Gemini for now: it can get busy, has a daily limit, and Google may use the chats to improve its AI. Money and client contacts are never sent to it."));
  return wrap;
}
function agNewCard() {
  const ps = agMyProjects(), n = agNew;
  const p = n.pid ? ideas.find(x => x.id === n.pid) : null, canShare = !!p && p.status === "approved";
  if (!canShare) n.shared = false;
  const sel = el("select", { id: "ag-new-p", "aria-label": "Project", onchange: e => { n.pid = e.target.value; render() } },
    ps.map(x => el("option", { value: x.id, selected: x.id === n.pid }, x.title + (x.status === "voting" ? " (idea)" : ""))),
    el("option", { value: "", selected: !n.pid }, "A new project (plan it with the agent)"));
  return el("section", { class: "me2-card ag-new" },
    el("label", { for: "ag-new-p", class: "ag-lbl" }, "What's it about?"), sel,
    el("span", { class: "ag-lbl" }, "Who's in it?"),
    el("div", { class: "seg seg-wide", role: "group", "aria-label": "Who's in it" },
      el("button", { "aria-pressed": String(!n.shared), onclick: () => { n.shared = false; render() } }, "Just me"),
      el("button", { "aria-pressed": String(n.shared), disabled: !canShare, title: canShare ? "" : "Pick a project to share a chat with its team", onclick: () => { n.shared = true; render() } }, "The project team")),
    el("p", { class: "mut ag-hint" }, n.shared ? "Everyone on the team sees it and can talk to the agent. Big changes wait for a planner's OK." : "Only you see it. The agent answers every message."),
    el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: () => agCreate(n) }, "Start chat")));
}
function agChatView(c) {
  const p = c.pid ? ideas.find(x => x.id === c.pid) : null;
  const wrap = el("div", { class: "ag-chat" });
  wrap.append(el("div", { class: "ag-head" },
    el("a", { class: "ag-back", href: "#agent", "aria-label": "All chats" }, el("span", { "aria-hidden": "true" }, "‹")),
    el("div", { class: "ag-head-t" }, el("b", {}, c.title || (p ? p.title : "New chat")),
      el("span", { class: "mut" }, [p ? p.title : "No project yet", c.shared ? "Shared with the team" : "Private"].join(" · "))),
    el("button", { class: "btn small", "aria-expanded": String(agMemOpen), onclick: () => { agMemOpen = !agMemOpen; agDelAsk = false; render() } }, "Memory")));
  if (agMemOpen) wrap.append(agMemoryPanel(c, p));
  if (agSharedErr === "rules" && c.shared) wrap.append(el("div", { class: "notice" }, agRulesText()));
  const log = el("div", { class: "ag-log", id: "ag-log", "aria-live": "polite" });
  const busyHere = agBusy === c.id;
  if (!agMsgs.length && !busyHere) log.append(el("div", { class: "ag-hello" },
    el("b", {}, p ? `Let's work on ${p.title}` : "Let's plan something new"),
    el("span", { class: "mut" }, c.shared ? "The team and the agent, together. Turn the agent off at the bottom when you only want to talk to the team." : "Ask anything about the project. The agent can add and move tasks, set dates and plan whole phases."),
    el("div", { class: "ag-sugs" }, (p ? ["What should we do next?", "What's late or stuck?", "Plan the next phase", "Give the open tasks to the right people"] : ["I have a new client and want to plan the project", "Help me turn an idea into a plan"]).map(s =>
      el("button", { class: "ag-sug", onclick: () => { const i = $("#ag-input"); i.value = (c.shared && !agCallAgent ? "@Agent " : "") + s; agSend(c) } }, s)))));
  for (const m of agMsgs) log.append(agBubble(c, m));
  if (busyHere) log.append(el("div", { class: "ag-msg ag-ai" }, el("span", { class: "ag-name" }, "Agent"),
    agStream ? el("div", { class: "ag-b", id: "ag-stream" }, agStream) : el("div", { class: "ag-b ag-typing", id: "ag-stream", "aria-label": "The agent is writing" }, el("i"), el("i"), el("i"))));
  if (!busyHere && agErr && agErr.chat === c.id) log.append(el("div", { class: "ag-msg ag-ai ag-err" }, el("span", { class: "ag-name" }, "Agent"),
    el("div", { class: "ag-b" }, agErr.text),
    el("div", { class: "row", style: "gap:8px" }, el("button", { class: "btn small primary", onclick: () => { const t = agErr.retry; agErr = null; agTurn(c, t) } }, "Try again"),
      el("button", { class: "btn small quiet", onclick: () => { agErr = null; render() } }, "Dismiss"))));
  wrap.append(log);
  return wrap;
}
function agMemoryPanel(c, p) {
  const box = el("section", { class: "me2-card ag-mem" });
  const editing = agMemEdit !== null;
  box.append(el("div", { class: "me2-h" }, el("span", { class: "kick" }), el("h2", {}, "What the agent remembers"), el("span", { class: "spacer" }),
    editing ? null : el("button", { class: "linkbtn", onclick: () => { agMemEdit = c.memory || ""; render() } }, "Edit")));
  if (editing) {
    const ta = el("textarea", { id: "ag-mem-edit", rows: "6", class: "me2-pad", value: agMemEdit, oninput: e => { agMemEdit = e.target.value } });
    box.append(ta, el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { agMemEdit = null; render() } }, "Cancel"),
      el("button", { class: "btn primary small", onclick: async () => { const v = agMemEdit; agMemEdit = null; try { await setDoc(agChatRef(c), { memory: v.slice(0, 2000) }, { merge: true }); toast("Saved") } catch { toast("Couldn't save. Try again") } } }, "Save")));
  } else box.append(el("p", { class: "ag-memtext" + (c.memory ? "" : " mut") }, c.memory || "Nothing yet. As you talk, the agent keeps short notes here: decisions, plans and who does what."));
  if (c.shared && p) box.append(el("div", { class: "ag-lbl" }, "The team's decisions for " + p.title), el("p", { class: "ag-memtext" + (agProjMemory(p.id) ? "" : " mut") }, agProjMemory(p.id) || "Nothing yet."));
  const mineToDelete = !c.shared || c.owner === me || (p && canPlan(p));
  if (mineToDelete) box.append(agDelAsk
    ? el("div", { class: "row" }, el("span", {}, "Delete this chat and its messages?"), el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => { agDelAsk = false; render() } }, "Keep"), el("button", { class: "btn small danger-btn", onclick: () => agDelete(c) }, "Delete"))
    : el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "linkbtn", onclick: () => { agDelAsk = true; render() } }, "Delete this chat")));
  return box;
}
function agBubble(c, m) {
  const ai = m.by === "agent", mine = !ai && m.by === me;
  const b = el("div", { class: "ag-msg " + (ai ? "ag-ai" : mine ? "ag-me" : "ag-them") },
    ai ? el("span", { class: "ag-name" }, "Agent") : !mine ? el("span", { class: "ag-name" }, realName(m.by) || "Someone") : null,
    el("div", { class: "ag-b" }, m.text),
    el("span", { class: "ag-time" }, (ai && c.shared && m.for ? `for ${firstName(m.for) === "you" ? "you" : firstName(m.for)} · ` : "") + agWhen(m.at)));
  const acts = m.acts || [];
  if (ai && acts.length) {
    const ask = acts.filter(a => a.state === "ask"), can = ask.some(a => agCanApprove(c, { ...a, for: m.for }));
    const card = el("div", { class: "ag-acts" });
    acts.forEach((a, i) => {
      const st = a.state, undo = st === "done" && agUndo.has(m.id + ":" + i);
      card.append(el("div", { class: "ag-act s-" + st },
        el("span", { class: "ag-dot", "aria-hidden": "true" }),
        el("span", { class: "ag-act-t" }, el("b", {}, a.label || a.type),
          a.detail ? el("span", { class: "mut" }, a.detail) : null,
          a.tasks && a.tasks.length && st === "ask" ? el("span", { class: "ag-plan" }, a.tasks.slice(0, 12).map(x => el("span", {}, `${x.phase ? x.phase + ": " : ""}${x.text}${x.who ? " · " + realName(x.who) : ""}${x.date ? " · " + fmtDate(x.date) : ""}`)), a.tasks.length > 12 ? el("span", { class: "mut" }, `and ${a.tasks.length - 12} more`) : null) : null,
          el("span", { class: "ag-st" }, { done: "Done", ask: "Waiting for approval", cancelled: "Cancelled", undone: "Undone", failed: "Didn't work: " + (a.why || "try again"), blocked: "Not done: " + (a.why || "not allowed") }[st] || "")),
        undo ? el("button", { class: "linkbtn", onclick: () => agUndoAct(c, m, i) }, "Undo") : null));
    });
    if (ask.length) card.append(can
      ? el("div", { class: "row ag-approve" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => agDecide(c, m, false) }, "Cancel"), el("button", { class: "btn primary small", onclick: () => agDecide(c, m, true) }, ask.length > 1 ? `Approve ${ask.length}` : "Approve"))
      : el("p", { class: "mut ag-wait" }, "A planner of this project needs to approve this."));
    b.append(card);
  }
  return b;
}

// the composer lives outside the part of the page that redraws, so typing never gets interrupted
function agWire() {
  const f = $("#ag-form"), i = $("#ag-input");
  if (!f || f.dataset.wired) return; f.dataset.wired = "1";
  f.addEventListener("submit", e => { e.preventDefault(); const c = agFind(route()); if (c) agSend(c) });
  i.addEventListener("input", () => agGrow(i));
  i.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches) { e.preventDefault(); f.requestSubmit() } });
  $("#ag-call").addEventListener("click", () => { agCallAgent = !agCallAgent; agSyncComposer(agFind(route())); i.focus() });
  const fit = () => { if (route().view === "agent") { agSize(); agScroll() } };
  addEventListener("resize", fit);
  if (window.visualViewport) visualViewport.addEventListener("resize", fit);
}
