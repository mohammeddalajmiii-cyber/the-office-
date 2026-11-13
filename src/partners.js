/* ---------- Partners: people abroad who find clients for Ardent Studios ----------
   Partners sign in on the same link, but they never load the team's data.
   They only get their own group: its leads (numbers to call), its updates and its info.
   The team gets a Partners tab to make groups, add people, hand out numbers and read updates.
   The real lock is the database rules in PARTNER_RULES: the site only hides what the rules already block. */

const SITE_LINK = "https://mohammeddalajmiii-cyber.github.io/the-office-/";

const LEAD_ST = [
  ["new", "New"], ["noanswer", "No answer"], ["callback", "Call back"],
  ["interested", "Interested"], ["meeting", "Meeting set"], ["won", "Became a client"], ["lost", "Not interested"],
];
const LEAD_NAME = Object.fromEntries(LEAD_ST);
const TO_CALL = ["new", "noanswer", "callback"];
const HOT = ["interested", "meeting"];

// The whole Firestore rules file (same as firestore.rules). Replace everything in the console with it.
const PARTNER_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- who is who ----------
    function signedIn() { return request.auth != null && request.auth.token.email_verified == true; }
    function myEmail() { return request.auth.token.email.lower(); }
    function isAdmin() { return signedIn() && myEmail() == "mohammedd.alajmiii@gmail.com"; }
    function isTeam() {
      return isAdmin() || (signedIn() && myEmail() in get(/databases/$(database)/documents/meta/team).data.emails);
    }
    function partnerDoc() { return get(/databases/$(database)/documents/pmembers/$(myEmail())).data; }
    function isPartner() {
      return signedIn() && exists(/databases/$(database)/documents/pmembers/$(myEmail())) && partnerDoc().active == true;
    }
    function myGroup() { return partnerDoc().gid; }

    // ---------- the team's own site: only the team ----------
    // money on a project (deal, payments, costs, payouts, ad money, its change log) can only be changed by the admin
    // or the project's planners; anyone on the team can still do everything else
    function moneyTouched() {
      return request.resource.data.diff(resource.data).affectedKeys().hasAny(["money", "payments", "costs", "payouts", "ads", "moneyLog"]);
    }
    function plansIt() {
      return resource.data.author == request.auth.uid || (resource.data.get("planners", {}).keys().hasAny([request.auth.uid]));
    }
    match /ideas/{id} {
      allow read, create: if isTeam();
      allow update: if isTeam() && (!moneyTouched() || isAdmin() || plansIt());
      allow delete: if isAdmin() || (isTeam() && resource.data.author == request.auth.uid);
    }
    match /chat/{id} {
      allow read, write: if isTeam();
    }
    // the team list, the money rules and the fund's money are the admin's; anyone on the team can add and research goals
    match /meta/{name} {
      allow read: if isTeam();
      allow write: if isAdmin() || (isTeam() && !(name in ["team", "money", "fund"]));
      allow create: if isTeam() && name == "fund" && request.resource.data.keys().hasOnly(["goals"]);
      allow update: if isTeam() && name == "fund" && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["goals"]);
    }
    match /users/{uid} {
      allow read: if isTeam();
      allow write: if isTeam() && request.auth.uid == uid;
    }
    // private messages: only the two people in the conversation (two team members, or a team member and a partner)
    match /dms/{tid} {
      allow read: if (isTeam() || isPartner()) && (request.auth.uid in tid.split("_") || request.auth.uid in resource.data.members);
      allow write: if (isTeam() || isPartner()) && request.auth.uid in tid.split("_");
      match /msgs/{mid} {
        allow read, write: if (isTeam() || isPartner()) && request.auth.uid in tid.split("_");
      }
    }
    // files sent in chat, stored in pieces
    match /fileparts/{id} {
      allow read: if isTeam() || (isPartner() && resource.data.gid == myGroup());
      allow create: if isTeam() && request.resource.data.by == request.auth.uid;
      allow delete: if isTeam() && (resource.data.by == request.auth.uid || isAdmin());
    }
    // your own tasks and notes: only you
    match /private/{uid}/{rest=**} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }

    // ---------- partners (lead finders): only their own group ----------
    match /pmembers/{email} {
      allow read: if isTeam() || (signedIn() && myEmail() == email);
      allow write: if isTeam();
      allow update: if isPartner() && myEmail() == email
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["uid", "photo", "seenAt"]);
    }
    match /pgroups/{gid} {
      allow read: if isTeam() || (isPartner() && myGroup() == gid);
      allow write: if isTeam();
    }
    match /pleads/{lid} {
      allow read: if isTeam() || (isPartner() && resource.data.gid == myGroup());
      allow create, delete: if isTeam();
      allow update: if isTeam() || (isPartner() && resource.data.gid == myGroup()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(["status", "note", "claimBy", "claimName", "updatedAt", "updatedBy", "updatedName", "history"]));
    }
    match /pposts/{pid} {
      allow read: if isTeam() || (isPartner() && resource.data.gid == myGroup());
      allow create: if isTeam() || (isPartner() && request.resource.data.gid == myGroup()
        && request.resource.data.by == request.auth.uid && request.resource.data.team == false);
      allow update: if isTeam();
      allow delete: if isTeam() || (isPartner() && resource.data.by == request.auth.uid);
    }

    // ---------- clients and per-project partners: only the projects they are listed on ----------
    function cpOf(pid) { return get(/databases/$(database)/documents/cprojects/$(pid)).data; }
    function seesProject(d) { return signedIn() && (myEmail() in d.clients || myEmail() in d.partners); }
    match /cprojects/{pid} {
      allow read: if isTeam() || seesProject(resource.data);
      allow write: if isTeam();
    }
    match /cposts/{id} {
      allow read: if isTeam() || seesProject(cpOf(resource.data.pid));
      allow create: if isTeam() || (signedIn() && myEmail() in cpOf(request.resource.data.pid).clients
        && request.resource.data.by == request.auth.uid && request.resource.data.team == false);
      allow update, delete: if isTeam();
    }
    match /ptasks/{id} {
      allow read: if isTeam() || (signedIn() && resource.data.email == myEmail());
      allow create, delete: if isTeam();
      allow update: if isTeam() || (signedIn() && resource.data.email == myEmail()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["done", "doneAt"]));
    }
  }
}
`;

/* ---------- shared state ---------- */

let partnerMode = false;          // true when the signed-in person is a partner, not on the team
let pGroups = [], pMembers = [], pLeads = [], pPosts = [];
let pDms = [], pDmOff = false, pDmMsgs = {}, pDmStop = null, pDmFor = null;   // a partner's private chats with team members
let pErr = null, pLoaded = false;
let pMe = null, pGroup = null, pGroupGone = false, pGroupUnsubs = [], pGid = null;
let pgTab = "updates", plFilter = {}, pQuery = {}, pSel = {}, pDelGroup = null, pDelMember = null, pImport = {}, pImportText = {}, pImportOpen = {};

const leadDigits = s => String(s || "").replace(/\D/g, "");
// The same number can be written many ways: "+46 72 877 32 83", "0046728773283" and "072-877 32 83" all end in the same 9 digits.
const leadKey = s => { const d = leadDigits(s); return d.length > 9 ? d.slice(-9) : d.replace(/^0+/, "") };
// Where a number already is on the board, or "" if it's new. Team members see every group, so this checks all of them.
function leadWhere(phone, gid) {
  const k = leadKey(phone), l = k && pLeads.find(x => leadKey(x.phone) === k);
  return !l ? "" : l.gid === gid ? "already in this group" : "already in the " + groupName(l.gid) + " group";
}
const waLink = s => "https://wa.me/" + leadDigits(s);
const stPill = s => el("span", { class: "st " + (s || "new") }, LEAD_NAME[s] || "New");
const groupName = gid => (pGroups.find(g => g.id === gid) || (pGroup && pGroup.id === gid ? pGroup : null) || {}).name || "a group";
const leadTitle = l => l.name || l.biz || l.phone || "No name";
const pseenKey = gid => `pseen:${me}:${gid}`;
const pGetSeen = gid => { try { return Number(localStorage.getItem(pseenKey(gid)) || 0) } catch { return 0 } };
const pSetSeen = gid => { try { localStorage.setItem(pseenKey(gid), String(Date.now())) } catch { } };
const historyOf = l => Object.entries(l.history || {}).filter(([, h]) => h).map(([id, h]) => ({ id, ...h })).sort((a, b) => (b.at || 0) - (a.at || 0));
const postAv = src => el("img", { class: "av", src: src || AV, alt: "", referrerpolicy: "no-referrer" });

// Everything that happened in a group, newest first: messages, and calls the partners logged.
function groupFeed(gid, posts, leads) {
  const out = [];
  for (const p of posts) if (p.gid === gid) out.push({ kind: "post", at: p.at || 0, p });
  for (const l of leads) if (l.gid === gid) for (const h of historyOf(l)) out.push({ kind: "call", at: h.at || 0, l, h });
  return out.sort((a, b) => b.at - a.at);
}
function groupChatItems(gid, canDelete) {
  const out = [];
  for (const p of pPosts) if (p.gid === gid) out.push({ id: p.id, by: p.by, name: p.by === me ? "You" : (p.name || "Someone"), photo: p.photo, role: p.team ? "team" : "partner", text: p.text || "", at: p.at || 0, canDelete: canDelete(p), ref: p });
  for (const l of pLeads) if (l.gid === gid) for (const h of historyOf(l)) out.push({ system: true, at: h.at || 0, text: `\u260E ${h.by === me ? "You" : (h.name || "Someone")} marked ${leadTitle(l)} as ${LEAD_NAME[h.s] || "updated"}${h.note ? ": " + h.note : ""}` });
  return out.sort((a, b) => a.at - b.at).slice(-250);
}
function feedItem(it, { canDelete } = {}) {
  if (it.kind === "post") {
    const p = it.p;
    return el("article", { class: "post" + (p.team ? " team" : "") },
      postAv(p.photo),
      el("div", { class: "post-body" },
        el("div", { class: "post-meta" }, el("b", {}, p.by === me ? "You" : (p.name || "Someone")), p.team ? el("span", { class: "chip" }, "Ardent team") : null, el("span", {}, ago(p.at))),
        el("div", { class: "post-text" }, p.text)),
      canDelete && canDelete(p) ? el("button", { class: "x", "aria-label": "Delete message", onclick: () => write(() => deleteDoc(doc(db, "pposts", p.id)), "Message deleted") }, "✕") : null);
  }
  const { l, h } = it;
  return el("article", { class: "post call" },
    el("span", { class: "call-dot" }, "☎"),
    el("div", { class: "post-body" },
      el("div", { class: "post-meta" }, el("b", {}, h.by === me ? "You" : (h.name || "Someone")), el("span", {}, "updated " + leadTitle(l)), el("span", {}, ago(h.at))),
      el("div", { class: "row", style: "gap:8px" }, stPill(h.s), h.note ? el("span", { class: "post-text" }, h.note) : null)));
}

/* ---------- reading numbers pasted from a sheet ---------- */

function csvSplit(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur.trim()); cur = "" } else cur += c;
  }
  out.push(cur.trim()); return out;
}
// Finds the phone number inside a line of plain text, and splits what's left on dashes, bars or tabs.
// The list number at the start ("1.", "12)") is dropped.
function looseLead(line) {
  const found = (String(line || "").match(/\+?\(?\d[\d\s().\-\/]{5,}\d/g) || []).filter(x => leadDigits(x).length >= 7 && !/^\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*$/.test(x));
  if (!found.length) return null;
  const phone = found.sort((a, b) => leadDigits(b).length - leadDigits(a).length)[0].trim();
  const parts = String(line).replace(phone, " ").replace(/^\s*\d{1,3}\s*[.)]\s*/, "")
    .split(/\s*[–—|·\t]\s*|\s+-\s+/).map(x => x.trim().replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")).filter(Boolean);
  return { phone, parts };
}
// Works with rows copied from Google Sheets or Excel (tabs), or CSV, or a plain typed list with one number per line.
// A header row is used when there is one.
function parseLeads(text, gid, checkBoard = true) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], noPhone: 0, dupes: 0, repeats: [], skipped: [] };
  const sep = lines[0].includes("\t") ? "\t" : (lines[0].includes(";") && !lines[0].includes(",")) ? ";" : ",";
  const cells = lines.map(l => sep === "," ? csvSplit(l) : l.split(sep).map(x => x.trim()));
  const isPhone = v => leadDigits(v).length >= 7 && /^[\d\s+()\-./]+$/.test(String(v).trim());
  const H = cells[0].map(x => x.toLowerCase());
  const hasHeader = !cells[0].some(isPhone) && !looseLead(lines[0]) && H.some(h => /phone|number|mobile|tel|whats|رقم|هاتف|موبايل|جوال/.test(h));
  const ix = { phone: -1, biz: -1, name: -1, city: -1 };
  if (hasHeader) {
    const find = (re, not = []) => H.findIndex((h, n) => re.test(h) && !not.includes(n));
    ix.phone = find(/phone|number|mobile|tel|whats|رقم|هاتف|موبايل|جوال/);
    ix.biz = find(/business|company|shop|store|brand|clinic|restaurant|شركة|نشاط|محل/, [ix.phone]);
    ix.name = find(/name|contact|client|owner|person|اسم|عميل/, [ix.phone, ix.biz]);
    ix.city = find(/city|area|location|country|address|مدينة|منطقة|عنوان/, [ix.phone, ix.biz, ix.name]);
  }
  const seen = new Set(); // numbers met earlier in this same paste
  const rows = [], repeats = [], skipped = []; let noPhone = 0, dupes = 0;
  for (const r of hasHeader ? cells.slice(1) : cells) {
    let phone, name = "", biz = "", city = "", extra = [];
    if (hasHeader) {
      phone = r[ix.phone] || ""; name = ix.name >= 0 ? r[ix.name] || "" : ""; biz = ix.biz >= 0 ? r[ix.biz] || "" : ""; city = ix.city >= 0 ? r[ix.city] || "" : "";
      r.forEach((v, n) => { if (v && ![ix.phone, ix.name, ix.biz, ix.city].includes(n)) extra.push((cells[0][n] ? cells[0][n] + ": " : "") + v) });
    } else {
      const pi = r.findIndex(isPhone);
      if (pi >= 0) {
        phone = r[pi];
        const rest = r.filter((v, n) => n !== pi && v); name = rest[0] || ""; biz = rest[1] || ""; extra = rest.slice(2);
      } else {
        // a line typed as a list, like "1. Shop name – City – +46 72 877 32 83": the shop comes first, then the city
        const lo = looseLead(r.join(" – "));
        phone = lo ? lo.phone : ""; biz = lo ? lo.parts[0] || "" : ""; city = lo ? lo.parts[1] || "" : ""; extra = lo ? lo.parts.slice(2) : [];
      }
    }
    const d = leadDigits(phone);
    if (d.length < 6) { noPhone++; skipped.push(r.filter(Boolean).join(" ").replace(/^\s*\d{1,3}\s*[.)]\s*/, "").slice(0, 60)); continue }
    const k = leadKey(phone), where = seen.has(k) ? "twice in what you pasted" : checkBoard ? leadWhere(phone, gid) : "";
    if (where) { dupes++; repeats.push({ phone: phone.trim(), title: biz || name || "", why: where }); continue }
    seen.add(k);
    rows.push({ phone: phone.trim(), name: name.slice(0, 80), biz: biz.slice(0, 80), city: city.slice(0, 60), extra: extra.join(" · ").slice(0, 400) });
  }
  return { rows, noPhone, dupes, repeats, skipped };
}
async function addLeads(gid, rows) {
  await fbReady;
  for (let i = 0; i < rows.length; i += 400) {
    const b = writeBatch(db);
    rows.slice(i, i + 400).forEach((r, n) => b.set(doc(db, "pleads", uid() + n), { ...r, gid, status: "new", note: "", createdAt: Date.now() + i + n, createdBy: me, history: {} }));
    await b.commit();
  }
}

// One update on a lead, from a partner or the team. It is kept in the lead's history so the team sees every call.
function saveLeadUpdate(l, status, note, who) {
  const hid = uid(), at = Date.now();
  const data = { status, note, updatedAt: at, updatedBy: me, updatedName: who, ["history." + hid]: { s: status, note, by: me, name: who, at } };
  if (!l.claimBy) { data.claimBy = me; data.claimName = who }
  return write(() => updateDoc(doc(db, "pleads", l.id), data), "Saved");
}

function leadCard(l, { team, who }) {
  const cur = pSel[l.id] || l.status || "new";
  const sel = el("select", { class: "mini", id: "pls-" + l.id, "aria-label": "What happened", onchange: e => { pSel[l.id] = e.target.value } }, LEAD_ST.map(([k, v]) => el("option", { value: k, selected: k === cur }, v)));
  const note = el("textarea", { class: "noteinput", id: "pln-" + l.id, rows: "1", maxlength: "500", placeholder: "What did they say? When to call back?" });
  const hist = historyOf(l);
  const phone = l.phone || "";
  return el("article", { class: "idea lead" },
    el("div", { class: "row", style: "gap:8px;align-items:flex-start" },
      el("div", { style: "min-width:0;flex:1" },
        el("h3", {}, leadTitle(l)),
        [l.name && l.biz ? l.biz : null, l.city].filter(Boolean).length ? el("div", { class: "label" }, [l.name && l.biz ? l.biz : null, l.city].filter(Boolean).join(" · ")) : null),
      stPill(l.status),
      team ? el("button", { class: "x", "aria-label": "Delete " + leadTitle(l), title: "Delete this number", onclick: () => write(() => deleteDoc(doc(db, "pleads", l.id)), "Number deleted") }, "✕") : null),
    el("div", { class: "row", style: "gap:8px" },
      el("a", { class: "lphone", href: "tel:" + phone.replace(/[^\d+]/g, "") }, phone),
      el("span", { class: "spacer" }),
      el("a", { class: "btn small", href: "tel:" + phone.replace(/[^\d+]/g, "") }, "Call"),
      el("a", { class: "btn small", href: waLink(phone), target: "_blank", rel: "noopener" }, "WhatsApp")),
    l.extra ? el("p", { class: "label", style: "margin:0;overflow-wrap:anywhere" }, l.extra) : null,
    l.note ? el("div", { class: "note" }, el("span", { class: "note-body" }, l.note), el("span", { class: "note-meta" }, (l.updatedBy === me ? "You" : l.updatedName || "") + (l.updatedAt ? " · " + ago(l.updatedAt) : ""))) : null,
    l.claimBy ? el("div", { class: "label" }, l.claimBy === me ? "You're handling this one" : `${l.claimName || "Someone"} is handling this one`) : null,
    team && l.status === "won" ? el("div", { class: "wonbar" }, l.projectId && ideas.find(i => i.id === l.projectId)
      ? [el("span", {}, "\u2713 Project started"), el("button", { class: "btn small", onclick: () => { location.hash = "project-" + l.projectId } }, "Open it")]
      : [el("span", {}, "\u{1F389} This is a client now."), el("button", { class: "btn small primary", onclick: () => startProjectFromLead(l) }, "Start a project for them")]) : null,
    el("div", { class: "lead-edit" }, sel, note,
      el("button", { class: "btn primary small", onclick: () => { const n = document.getElementById("pln-" + l.id); saveLeadUpdate(l, sel.value, (n.value || "").trim().slice(0, 500), who); delete pSel[l.id]; n.value = "" } }, "Save")),
    hist.length ? el("details", { class: "lead-hist" }, el("summary", {}, `History (${hist.length})`),
      el("ul", {}, hist.map(h => el("li", {}, stPill(h.s), el("span", {}, `${h.by === me ? "You" : h.name || "Someone"} · ${ago(h.at)}`), h.note ? el("span", { class: "post-text" }, h.note) : null)))) : null);
}

function leadFilters(leads, key, opts) {
  const cur = plFilter[key] || opts[0][0];
  const count = f => leads.filter(f).length;
  return { cur, bar: el("div", { class: "catbar" }, opts.map(([k, label, f]) => el("button", { class: "cat", "aria-pressed": String(cur === k), onclick: () => { plFilter[key] = k; render() } }, `${label} ${count(f)}`))) };
}
const FILTERS = [
  ["call", "To call", l => TO_CALL.includes(l.status || "new")],
  ["hot", "Interested", l => HOT.includes(l.status)],
  ["won", "Clients", l => l.status === "won"],
  ["lost", "Not interested", l => l.status === "lost"],
  ["all", "All", () => true],
];
function leadList(leads, key, cardOpts) {
  const { cur, bar } = leadFilters(leads, key, FILTERS);
  const q = pQuery[key] || "";
  const f = (FILTERS.find(x => x[0] === cur) || FILTERS[0])[2];
  const qq = q.trim().toLowerCase(), qd = leadDigits(q);
  const shown = leads.filter(f).filter(l => !qq || [l.name, l.biz, l.city, l.note, l.extra].join(" ").toLowerCase().includes(qq) || (qd.length > 2 && leadDigits(l.phone).includes(qd)))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const search = el("input", { class: "noteinput", id: "plq-" + key, type: "search", placeholder: "Search name, business or number", oninput: e => { pQuery[key] = e.target.value; render() } });
  return [bar, leads.length > 8 || q ? el("div", { style: "margin-top:10px" }, search) : null,
    el("div", { class: "list" }, shown.length ? shown.slice(0, 200).map(l => leadCard(l, cardOpts)) : el("div", { class: "empty" }, leads.length ? "Nothing here." : "No numbers yet.")),
    shown.length > 200 ? el("p", { class: "label" }, `Showing 200 of ${shown.length}. Search to find the rest.`) : null];
}

/* ---------- team side: the Partners tab ---------- */

function partnerTeamSubs() {
  pErr = null;
  const fail = e => { pErr = e && e.code === "permission-denied" ? "rules" : "network"; pLoaded = true; render() };
  const ok = () => { pErr = null; pLoaded = true };
  return [
    onSnapshot(collection(db, "pgroups"), s => { pGroups = s.docs.map(d => ({ id: d.id, ...d.data() })); ok(); render() }, fail),
    onSnapshot(collection(db, "pmembers"), s => { pMembers = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, fail),
    onSnapshot(collection(db, "pleads"), s => { pLeads = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, fail),
    onSnapshot(collection(db, "pposts"), s => {
      const before = new Set(pPosts.map(p => p.id)), first = !pPosts.length;
      pPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of pPosts) if (!before.has(p.id) && !p.team && route().gid !== p.gid) toast(`${p.name || "A partner"} (${groupName(p.gid)}): ${(p.text || "").slice(0, 60)}`);
      render();
    }, fail),
  ];
}
function partnerUnread(gid) {
  const seen = pGetSeen(gid);
  return groupFeed(gid, pPosts, pLeads).filter(it => it.at > seen && (it.kind === "post" ? !it.p.team : it.h.by !== me)).length;
}
function partnerAlerts(add) {
  if (partnerMode) return;
  for (const p of pPosts) if (!p.team) add("ppost:" + p.id, p.at, null, `${p.name || "A partner"} (${groupName(p.gid)}): ${(p.text || "").slice(0, 80)}`, "pg-" + p.gid);
  for (const l of pLeads) for (const h of historyOf(l)) if (h.by !== me && (HOT.includes(h.s) || h.s === "won"))
    add("plead:" + l.id + ":" + h.id, h.at, null, `${h.name || "A partner"} (${groupName(l.gid)}): ${leadTitle(l)} is ${LEAD_NAME[h.s].toLowerCase()}`, "pg-" + l.gid);
}
function teamName() { return realName(me) || (myProfile && myProfile.name) || "Ardent team" }

function rulesCard(open) {
  const ta = el("textarea", { class: "rulesbox", readonly: true, "aria-label": "Rules to paste" }, PARTNER_RULES);
  return el("section", { class: "idea", style: "margin-top:14px" },
    el("h3", {}, open ? "One step left: lock the partner area" : "Database rules for partners"),
    el("p", { class: "label", style: "margin:0" }, "The site hides your projects from partners, but the database rules are what actually block them. Do this once:"),
    el("ol", { class: "rules", style: "margin:0;padding-left:20px;font-size:14px" },
      el("li", {}, "Tap Open Firebase rules (or console.firebase.google.com \u203a the-office project \u203a Firestore Database \u203a Rules)."),
      el("li", {}, "Delete everything there and paste the text below."),
      el("li", {}, "Press Publish, then reload this page.")),
    ta,
    el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("a", { class: "btn small", href: "https://console.firebase.google.com/project/the-office-ab723/firestore/rules", target: "_blank", rel: "noopener noreferrer" }, "Open Firebase rules"),
      el("button", { class: "btn primary small", onclick: () => copyText(PARTNER_RULES, "Rules copied. Paste them in Firebase, then Publish") }, "Copy rules")));
}

function renderPartnersTeam(gid) {
  const box = $("#partners"); box.replaceChildren();
  if (gid) return renderPartnerGroupTeam(box, gid);
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Partners"),
    el("p", { class: "lede", style: "margin-top:-4px" }, "People abroad who find clients for Ardent Studios. Each country gets a group. They sign in on this same link, but they only see their own group's numbers, updates and info. Never your ideas, projects, chat, money or team."));
  if (pErr === "rules") { box.append(rulesCard(true)); return }
  if (pErr === "network") box.append(el("p", { class: "status warn" }, "Can't reach the partner area. Check your connection."));
  const nm = el("input", { class: "noteinput", id: "pg-new", maxlength: "40", placeholder: "Country or group, e.g. Qatar" });
  const make = () => { const n = nm.value.trim(); if (!n) { nm.focus(); return } nm.value = ""; const id = uid();
    write(() => setDoc(doc(db, "pgroups", id), { name: n, info: "", links: {}, createdAt: Date.now(), createdBy: me }), "Group made").then(ok => { if (ok) { pgTab = "people"; location.hash = "pg-" + id } }) };
  nm.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); make() } });
  box.append(el("div", { class: "compose", style: "margin-top:16px" }, el("h3", {}, "New group"), el("div", { class: "addstep" }, nm, el("button", { class: "btn primary", onclick: make }, "Make group"))));

  const groups = [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const list = el("div", { class: "list" });
  if (!pLoaded) list.append(el("div", { class: "empty" }, "Loading…"));
  else if (!groups.length) list.append(el("div", { class: "empty" }, "No groups yet. Make one for each country, then add the partners there."));
  for (const g of groups) {
    const leads = pLeads.filter(l => l.gid === g.id), people = pMembers.filter(m => m.gid === g.id);
    const last = groupFeed(g.id, pPosts, pLeads)[0], unread = partnerUnread(g.id);
    list.append(el("button", { class: "idea pgroup", onclick: () => { location.hash = "pg-" + g.id } },
      el("div", { class: "row" }, el("h3", {}, g.name), unread ? el("span", { class: "pill" }, `${unread} new`) : null, el("span", { class: "spacer" }), el("span", { class: "label" }, `${people.length} ${people.length === 1 ? "partner" : "partners"}`)),
      stats(leads),
      el("div", { class: "label" }, last ? (last.kind === "post" ? `${last.p.name || "Someone"}: ${(last.p.text || "").slice(0, 90)}` : `${last.h.name || "Someone"} marked ${leadTitle(last.l)} as ${LEAD_NAME[last.h.s]}`) + " · " + ago(last.at) : "No updates yet")));
  }
  box.append(el("h2", { class: "sec-h" }, "Groups"), list);

  const feed = pGroups.flatMap(g => groupFeed(g.id, pPosts, pLeads).filter(it => it.kind === "post" ? !it.p.team : it.h.by !== me).slice(0, 15).map(it => ({ ...it, g })))
    .sort((a, b) => b.at - a.at).slice(0, 15);
  if (feed.length) box.append(el("h2", { class: "sec-h" }, "Latest from partners"),
    el("div", { class: "pfeed" }, feed.map(it => el("button", { class: "feedlink", onclick: () => { pgTab = "updates"; location.hash = "pg-" + it.g.id } }, el("span", { class: "chip" }, it.g.name), feedItem(it)))));
  if (isAdmin) box.append(el("details", { style: "margin-top:22px" }, el("summary", { class: "label", style: "cursor:pointer" }, "Database rules for partners"), rulesCard(false)));
}

function stats(leads) {
  const c = f => leads.filter(f).length;
  return el("div", { class: "pstats" },
    [["To call", c(l => TO_CALL.includes(l.status || "new"))], ["Interested", c(l => HOT.includes(l.status))], ["Clients", c(l => l.status === "won")], ["Total", leads.length]]
      .map(([k, v]) => el("div", { class: "pstat" }, el("b", {}, v), el("span", {}, k))));
}

function renderPartnerGroupTeam(box, gid) {
  box.append(el("button", { class: "back", onclick: () => { location.hash = "partners" } }, "← Partners"));
  const g = pGroups.find(x => x.id === gid);
  if (!g) { box.append(el("div", { class: "empty" }, pLoaded ? "This group isn't here anymore." : "Loading…")); return }
  const leads = pLeads.filter(l => l.gid === gid), people = pMembers.filter(m => m.gid === gid);
  if (pgTab === "updates") pSetSeen(gid);
  const unread = partnerUnread(gid);
  box.append(el("div", { class: "row" }, el("h2", {}, g.name), el("span", { class: "spacer" }), el("span", { class: "label" }, `${people.length} ${people.length === 1 ? "partner" : "partners"} · ${leads.length} numbers`)));
  const tabs = [["updates", "Updates" + (unread ? ` (${unread})` : "")], ["leads", "Numbers"], ["people", "People"], ["info", "Info"], ["settings", "Settings"]];
  box.append(el("div", { class: "seg seg-wide", style: "margin:14px 0 4px" }, tabs.map(([k, v]) => el("button", { "aria-pressed": String(pgTab === k), onclick: () => { pgTab = k; render() } }, v))));

  if (pgTab === "updates") {
    pSetSeen(gid);
    box.append(el("div", { class: "chat-who", style: "margin-top:12px" }, el("span", { class: "teamdot big" }, "#"), el("span", { class: "who-n" }, el("b", {}, g.name + " group"), el("span", { class: "label" }, `The Ardent team and the ${people.length} ${people.length === 1 ? "partner" : "partners"} in ${g.name}`))),
      chatView(groupChatItems(gid, () => true), { onDelete: m => write(() => deleteDoc(doc(db, "pposts", m.id)), "Message deleted"), empty: "No messages yet. Say hi to the partners in " + g.name + "." }),
      chatComposer("pgmsg-" + gid, `Message everyone in ${g.name}`, t => write(() => setDoc(doc(db, "pposts", uid()), { gid, by: me, name: teamName(), photo: photoOf(me) === AV ? "" : photoOf(me), team: true, text: t, at: Date.now() }))),
      ...(people.filter(m => m.uid).length ? [el("div", { class: "row", style: "gap:6px;margin-top:10px" }, el("span", { class: "label" }, "Message privately:"),
        people.filter(m => m.uid).map(m => el("button", { class: "pchip partnerchip", onclick: () => { location.hash = "dm-" + m.uid } }, postAv(m.photo), (m.name || m.email).split(" ")[0])))] : []));
  }

  if (pgTab === "leads") {
    box.append(el("div", { style: "margin-top:12px" }, stats(leads)));
    const ta = el("textarea", { class: "noteinput", id: "pgpaste-" + gid, rows: "5", placeholder: "Paste rows from Google Sheets or Excel here.\nName\tPhone\tBusiness\tCity\nAhmed\t+974 5555 1234\tDoha Dental\tDoha" });
    // Typing or pasting only refreshes the preview below the box, so nothing you type gets wiped.
    ta.value = pImportText[gid] || "";
    const preview = el("div", { style: "display:grid;gap:8px" });
    const addBtn = el("button", { class: "btn primary", disabled: true }, "Add numbers");
    const showPrev = () => {
      const prev = pImport[gid]; const n = prev ? prev.rows.length : 0;
      preview.replaceChildren(...[
        prev && ta.value.trim() ? el("p", { class: "label", style: "margin:0" }, `Found ${n} new ${n === 1 ? "number" : "numbers"}` + (prev.dupes ? ` · ${prev.dupes} repeated` : "") + (prev.noPhone ? ` · ${prev.noPhone} ${prev.noPhone === 1 ? "line" : "lines"} without a number skipped` : "")) : null,
        prev && ta.value.trim() && prev.skipped && prev.skipped.length ? el("p", { class: "label", style: "margin:0" }, "Skipped, no number: " + prev.skipped.slice(0, 6).join(", ") + (prev.skipped.length > 6 ? ` and ${prev.skipped.length - 6} more` : "")) : null,
        n ? el("div", { class: "pimport" }, prev.rows.slice(0, 5).map(r => el("div", {}, el("b", {}, r.name || r.biz || "No name"), " ", r.phone, r.biz && r.name ? " · " + r.biz : "", r.city ? " · " + r.city : "")),
          n > 5 ? el("div", { class: "label" }, `…and ${n - 5} more`) : null) : null,
        prev && ta.value.trim() && prev.repeats && prev.repeats.length ? el("div", { class: "pimport prepeat" },
          el("b", {}, prev.repeats.length === 1 ? "This number is repeated, so it won't be added:" : `These ${prev.repeats.length} numbers are repeated, so they won't be added:`),
          prev.repeats.map(r => el("div", {}, r.phone, r.title ? " · " + r.title : "", el("span", { class: "label" }, " — " + r.why)))) : null].filter(Boolean));
      addBtn.disabled = !n; addBtn.textContent = n ? `Add ${n} ${n === 1 ? "number" : "numbers"}` : "Add numbers";
    };
    const check = () => { pImportText[gid] = ta.value; pImport[gid] = parseLeads(ta.value, gid); showPrev() };
    ta.addEventListener("input", () => { pImportText[gid] = ta.value; clearTimeout(check.t); check.t = setTimeout(check, 250) });
    addBtn.onclick = async () => {
      const rows = (pImport[gid] || {}).rows || []; if (!rows.length) return;
      delete pImport[gid]; delete pImportText[gid]; ta.value = ""; showPrev();
      await write(() => addLeads(gid, rows), `Added ${rows.length} ${rows.length === 1 ? "number" : "numbers"} for ${g.name}`);
    };
    if (ta.value) check();
    // One number at a time, typed in by hand
    const f = { name: el("input", { class: "noteinput", maxlength: "80", placeholder: "Name" }), phone: el("input", { class: "noteinput", type: "tel", maxlength: "30", placeholder: "Phone, e.g. +974 5555 1234" }),
      biz: el("input", { class: "noteinput", maxlength: "80", placeholder: "Business" }), city: el("input", { class: "noteinput", maxlength: "60", placeholder: "City" }) };
    const addOne = async () => {
      const phone = f.phone.value.trim(), d = leadDigits(phone);
      if (d.length < 6) { toast("Type a phone number first"); f.phone.focus(); return }
      const where = leadWhere(phone, gid);
      if (where) { toast(`${phone} is repeated. It's ${where}, so it wasn't added.`, 5000); return }
      const row = { phone, name: f.name.value.trim(), biz: f.biz.value.trim(), city: f.city.value.trim(), extra: "" };
      Object.values(f).forEach(i => i.value = "");
      await write(() => addLeads(gid, [row]), "Number added");
    };
    Object.values(f).forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addOne() } }));
    box.append(el("div", { class: "idea", style: "margin-top:12px;gap:8px" }, el("h3", {}, "Add a number"),
      el("div", { class: "onelead" }, f.name, f.phone, f.biz, f.city),
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: addOne }, "Add number"))));
    box.append(el("details", { class: "idea", style: "margin-top:12px", open: !leads.length || pImportOpen[gid] || (pImportText[gid] || "").trim() ? true : false, ontoggle: e => { pImportOpen[gid] = e.target.open } },
      el("summary", { style: "cursor:pointer;font-weight:600" }, "Add many numbers from a sheet"),
      el("p", { class: "label", style: "margin:0" }, "Copy the rows from Google Sheets or Excel (with the header row) and paste. Columns called name, phone, business and city are picked up. A typed list works too, one per line, like \"1. Shop name – City – +46 72 877 32 83\". Numbers already in this group are skipped."),
      ta, preview, el("div", { class: "row" }, el("span", { class: "spacer" }), addBtn)));
    // Copies of one number already sitting in this group (written two ways, or added before repeats were checked).
    // Remove keeps the copy with the most calls on it, or the oldest one.
    const byKey = {}; leads.forEach(l => { const k = leadKey(l.phone); if (k) (byKey[k] = byKey[k] || []).push(l) });
    const extras = Object.values(byKey).filter(a => a.length > 1)
      .flatMap(a => [...a].sort((x, y) => historyOf(y).length - historyOf(x).length || (x.createdAt || 0) - (y.createdAt || 0)).slice(1));
    if (extras.length) box.append(el("div", { class: "wonbar", style: "margin-top:12px" },
      el("span", {}, `${extras.length === 1 ? "This number is" : extras.length + " numbers are"} repeated in this group: ${[...new Set(extras.map(l => l.phone))].join(", ")}`),
      el("button", { class: "btn small primary", onclick: () => write(async () => { for (const l of extras) await deleteDoc(doc(db, "pleads", l.id)) }, `Removed ${extras.length} repeated ${extras.length === 1 ? "number" : "numbers"}`) }, "Remove repeats")));
    const waiting = leads.filter(l => l.status === "won" && !(l.projectId && ideas.find(i => i.id === l.projectId)));
    if (waiting.length) box.append(el("div", { class: "wonbar", style: "margin-top:12px" }, el("span", {}, `\u{1F389} ${waiting.length} new client${waiting.length > 1 ? "s" : ""} from partners need${waiting.length > 1 ? "" : "s"} a project`),
      el("button", { class: "btn small primary", onclick: () => { plFilter["t-" + gid] = "won"; render() } }, "Show " + (waiting.length > 1 ? "them" : "it"))));
    box.append(...leadList(leads, "t-" + gid, { team: true, who: teamName() }).filter(Boolean));
  }

  if (pgTab === "people") {
    // add a partner to this group right here
    const em = el("input", { class: "noteinput", id: "pgadd-email-" + gid, type: "email", inputmode: "email", maxlength: "120", placeholder: "Their Google email", autocomplete: "off" });
    const nm = el("input", { class: "noteinput", id: "pgadd-name-" + gid, maxlength: "60", placeholder: "Their name" });
    const addP = () => {
      const e = lower(em.value), n = nm.value.trim();
      if (!emailOk(e)) { toast("That doesn't look like an email address"); em.focus(); return }
      const has = roleOf(e);
      if (has === "team" || has === "client") { toast(`${e} is already a ${ROLE_NAME[has].toLowerCase()}`); return }
      const cur = pMembers.find(m => m.id === e);
      if (cur && cur.gid === gid) { toast("Already in this group"); return }
      em.value = ""; nm.value = "";
      write(() => setDoc(doc(db, "pmembers", e), { email: e, name: n || (cur && cur.name) || e.split("@")[0], gid, active: true, addedBy: me, addedAt: Date.now() }, { merge: true }),
        cur ? `${n || cur.name || e} moved to ${g.name}` : `${n || e} is a partner in ${g.name}. Send them the link`);
    };
    [em, nm].forEach(i => i.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); addP() } }));
    box.append(el("div", { class: "idea", style: "margin-top:12px;gap:8px" }, el("h3", {}, "Add a partner"),
      el("div", { class: "onelead" }, nm, em),
      el("div", { class: "row" }, el("span", { class: "label", style: "flex:1 1 200px;text-transform:none;letter-spacing:0" }, "They sign in with Google using exactly this email, on the same link as you."), el("button", { class: "btn primary", onclick: addP }, "Add partner")),
      el("div", { class: "row" }, el("code", { class: "plink" }, SITE_LINK), el("span", { class: "spacer" }),
        el("button", { class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(SITE_LINK); toast("Link copied") } catch { toast(SITE_LINK, 5000) } } }, "Copy link"))));
    const list = el("div", { class: "list" });
    if (!people.length) list.append(el("div", { class: "empty" }, "Nobody in this group yet."));
    for (const m of [...people].sort((a, b) => (a.name || "").localeCompare(b.name || ""))) {
      const did = pLeads.filter(l => l.gid === gid && historyOf(l).some(h => m.uid && h.by === m.uid)).length;
      const won = pLeads.filter(l => l.gid === gid && l.status === "won" && m.uid && l.claimBy === m.uid).length;
      list.append(el("article", { class: "idea", style: "gap:6px" },
        el("div", { class: "row" }, postAv(m.photo), el("b", {}, m.name || m.email), el("span", { class: "spacer" }),
          pDelMember === m.id
            ? el("button", { class: "btn small danger-btn", onclick: () => { pDelMember = null; write(() => deleteDoc(doc(db, "pmembers", m.id)), "Removed. They can't open the partner area anymore") } }, "Yes, remove")
            : el("button", { class: "btn quiet small", onclick: () => { pDelMember = m.id; render() } }, "Remove")),
        el("div", { class: "label" }, m.email),
        el("div", { class: "label" }, (m.uid ? "Signed in" + (m.seenAt ? " · last seen " + ago(m.seenAt) : "") : "Hasn't signed in yet") + ` · worked on ${did} ${did === 1 ? "number" : "numbers"} · ${won} ${won === 1 ? "client" : "clients"}`)));
    }
    box.append(el("h2", { class: "sec-h" }, "People in " + g.name), list);
  }

  if (pgTab === "info") {
    const info = el("textarea", { class: "noteinput", id: "pginfo-" + gid, rows: "8", maxlength: "5000", placeholder: "What partners need to know: what we sell, prices, what to say on the call, what they earn per client, who to message." });
    info.value = g.info || "";
    box.append(el("div", { class: "compose", style: "margin-top:12px" }, el("h3", {}, "Info for partners"),
      el("p", { class: "label", style: "margin:0" }, "Partners in this group see this on their Info page."), info,
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: () => {
        const v = document.getElementById("pginfo-" + gid).value; write(() => updateDoc(doc(db, "pgroups", gid), { info: v.slice(0, 5000), infoAt: Date.now() }), "Info saved") } }, "Save info"))));
    const links = Object.entries(g.links || {}).filter(([, v]) => v).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
    const lab = el("input", { class: "noteinput", id: "pgl-label-" + gid, maxlength: "60", placeholder: "Name, e.g. Price list" });
    const url = el("input", { class: "noteinput", id: "pgl-url-" + gid, type: "url", maxlength: "500", placeholder: "https://…" });
    box.append(el("div", { class: "compose", style: "margin-top:12px" }, el("h3", {}, "Files and links"),
      links.length ? el("ul", { class: "plinks" }, links.map(k => el("li", {}, linkOrFile(k),
        el("button", { class: "x", title: "Rename", "aria-label": "Rename " + (k.label || ""), onclick: e => {
          const li = e.currentTarget.closest("li"), inp = el("input", { class: "noteinput", maxlength: "60", value: k.label || (k.file && k.file.name) || "" });
          const save = () => { const t = inp.value.trim(); if (!t || t === k.label) { renderPartnersTeam(gid); return } write(() => updateDoc(doc(db, "pgroups", gid), { ["links." + k.id + ".label"]: t }), "Renamed") };
          inp.onkeydown = ev => { if (ev.key === "Enter") save(); if (ev.key === "Escape") renderPartnersTeam(gid) };
          li.replaceChildren(inp, el("button", { class: "btn primary small", onclick: save }, "Save"), el("button", { class: "btn quiet small", onclick: () => renderPartnersTeam(gid) }, "Cancel")); inp.focus(); inp.select() } }, "✎"),
        el("button", { class: "x", "aria-label": "Remove " + (k.label || ""), onclick: () => write(async () => { await updateDoc(doc(db, "pgroups", gid), { ["links." + k.id]: DEL() }); if (k.file) for (let n = 0; n < k.file.parts; n++) deleteDoc(doc(db, "fileparts", `${k.file.id}_${n}`)).catch(() => {}) }, k.file ? "File removed" : "Link removed") }, "✕")))) : el("p", { class: "label", style: "margin:0" }, "Price lists, a pitch script, your portfolio, a WhatsApp group. PDFs and other files up to 5 MB too."),
      lab, url,
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn", onclick: () => {
        let u = url.value.trim(); const t = lab.value.trim(); if (!u) { url.focus(); return } if (!/^https?:\/\//i.test(u)) u = "https://" + u;
        lab.value = ""; url.value = ""; write(() => updateDoc(doc(db, "pgroups", gid), { ["links." + uid()]: { label: t, url: u, at: Date.now() } }), "Link added") } }, "Add link"),
        el("button", { class: "btn primary", onclick: () => pickGroupFile(gid, lab) }, "Attach a file"))));
  }

  if (pgTab === "settings") {
    const rn = el("input", { class: "noteinput", id: "pgrn-" + gid, maxlength: "40", placeholder: g.name });
    const row = (title, sub, ...ctrl) => el("div", { class: "setrow" }, el("div", { class: "setrow-t" }, el("b", {}, title), sub ? el("span", {}, sub) : null), el("div", { class: "setrow-c" }, ...ctrl));
    box.append(el("div", { class: "idea", style: "margin-top:12px;gap:0" },
      row("Group name", "Partners see it at the top of their page.", el("div", { class: "addtask", style: "margin:0;flex-wrap:nowrap" }, rn, el("button", { class: "btn", onclick: () => { const v = rn.value.trim(); if (!v || v === g.name) return; rn.value = ""; write(() => updateDoc(doc(db, "pgroups", gid), { name: v }), "Renamed") } }, "Rename"))),
      row("Link for partners", SITE_LINK, el("button", { class: "btn small", onclick: async () => { try { await navigator.clipboard.writeText(SITE_LINK); toast("Link copied") } catch { toast(SITE_LINK, 5000) } } }, "Copy")),
      row("In this group", `${people.length} ${people.length === 1 ? "partner" : "partners"} · ${leads.length} numbers · made ${g.createdAt ? fmtDay(g.createdAt) : ""}`, el("button", { class: "btn small quiet", onclick: () => { pgTab = "people"; render() } }, "Manage people")),
      row("Delete group", "Removes its partners' access, all its numbers and updates. This can't be undone.",
        pDelGroup === gid
          ? el("span", { class: "row", style: "gap:6px" }, el("button", { class: "btn quiet small", onclick: () => { pDelGroup = null; render() } }, "Cancel"),
              el("button", { class: "btn small danger-btn", onclick: async () => { pDelGroup = null; await write(() => deleteGroup(gid), "Group deleted"); location.hash = "partners" } }, "Yes, delete everything"))
          : el("button", { class: "btn small danger-btn", onclick: () => { pDelGroup = gid; render() } }, "Delete group"))));
  }
}
async function deleteGroup(gid) {
  await fbReady;
  const refs = [...pMembers.filter(m => m.gid === gid).map(m => doc(db, "pmembers", m.id)), ...pLeads.filter(l => l.gid === gid).map(l => doc(db, "pleads", l.id)),
    ...pPosts.filter(p => p.gid === gid).map(p => doc(db, "pposts", p.id)), doc(db, "pgroups", gid)];
  for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit() }
}

/* ---------- partner side: their own small site ---------- */

async function partnerCheck(email) {
  try { await fbReady; const s = await getDoc(doc(db, "pmembers", email)); return s.exists() && s.data().active !== false ? { id: s.id, ...s.data() } : null }
  catch { return null }
}
function partnerStop() {
  pGroupUnsubs.forEach(f => f()); pGroupUnsubs = []; pGid = null; pGroup = null; pMe = null;
  pLeads = []; pPosts = []; pDms = []; pDmMsgs = {}; if (pDmStop) { pDmStop(); pDmStop = null; pDmFor = null } partnerMode = false; $("#partner").hidden = true; partnerProjectsStop();
}
function startPartner(u, pm) {
  partnerMode = true; isAdmin = false; pMe = pm;
  myProfile = { name: u.displayName || u.email, email: u.email, photo: u.photoURL || "" };
  $("#boot").hidden = true; $("#gate").hidden = true; $("#app").hidden = true; $("#partner").hidden = false;
  updateDoc(doc(db, "pmembers", pm.id), { uid: me, photo: u.photoURL || "", seenAt: Date.now() }).catch(() => {});
  unsubs.push(onSnapshot(doc(db, "pmembers", pm.id), s => {
    if (!s.exists() || s.data().active === false) { partnerEnded(u); return }
    pMe = { id: s.id, ...s.data() };
    if (pMe.gid !== pGid) partnerGroupSubs(pMe.gid);
    render();
  }, e => { if (e.code === "permission-denied") partnerEnded(u) }));
  partnerGroupSubs(pm.gid);
  partnerProjectSubs(pm.id);
  unsubs.push(onSnapshot(query(collection(db, "dms"), where("members", "array-contains", me)), q => { pDms = q.docs.map(d => ({ id: d.id, ...d.data() })); pDmOff = false; render() }, () => { pDmOff = true; render() }));
  if (!["leads", "updates", "info", "projects"].includes(location.hash.slice(1)) && !location.hash.startsWith("#pdm-")) history.replaceState(null, "", "#leads");
  render();
}
function partnerEnded(u) {
  partnerStop(); signOut(auth);
  $("#gate-msg").textContent = `${u.email} doesn't have partner access anymore. Message the Ardent Studios team if you think that's a mistake.`;
}
function partnerGroupSubs(gid) {
  pGroupUnsubs.forEach(f => f()); pGroupUnsubs = []; pGid = gid; pGroup = null; pLeads = []; pPosts = [];
  if (!gid) return;
  const fail = () => { toast("Can't reach your numbers. Check your connection.", 5000) };
  pGroupUnsubs.push(
    onSnapshot(doc(db, "pgroups", gid), s => { pGroup = s.exists() ? { id: s.id, ...s.data() } : null; pGroupGone = !s.exists() && !s.metadata.fromCache; render() }, fail),
    onSnapshot(query(collection(db, "pleads"), where("gid", "==", gid)), s => { pLeads = s.docs.map(d => ({ id: d.id, ...d.data() })); render() }, fail),
    onSnapshot(query(collection(db, "pposts"), where("gid", "==", gid)), s => {
      const before = new Set(pPosts.map(p => p.id)), first = !pPosts.length;
      pPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of pPosts) if (!before.has(p.id) && p.team && location.hash !== "#updates") toast(`${p.name || "Ardent team"}: ${(p.text || "").slice(0, 60)}`);
      render();
    }, fail));
}
const partnerName = () => (pMe && pMe.name) || (myProfile && myProfile.name) || "Partner";

function keepPartnerInputs(fn) {
  const root = $("#partner"), vals = {};
  root.querySelectorAll("input[id], textarea[id]").forEach(n => vals[n.id] = n.value);
  const act = document.activeElement, actId = act && act.id; let sel = null;
  try { sel = act && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null } catch { }
  fn();
  for (const [id, v] of Object.entries(vals)) { const n = document.getElementById(id); if (n && v) n.value = v }
  if (actId) { const n = document.getElementById(actId); if (n && n !== document.activeElement) { n.focus(); try { if (sel) n.setSelectionRange(sel[0], sel[1]) } catch { } } }
}
function renderPortal() { keepPartnerInputs(renderPortalNow) }
function renderPortalNow() {
  let v = location.hash.slice(1), dmWith = null;
  if (v.startsWith("pdm-")) { dmWith = v.slice(4); v = "updates" }
  if (!["leads", "updates", "info", "projects"].includes(v)) v = "leads";
  const open = myPTasks.filter(t => !t.done).length, cpj = $("#pc-projects"); if (cpj) { cpj.hidden = !open; cpj.textContent = open }
  for (const b of document.querySelectorAll("#partner .tab")) b.setAttribute("aria-selected", b.dataset.pview === v);
  const seen = pGetSeen("p-updates");
  const dmUnreadN = pDms.filter(t => t.lastBy && t.lastBy !== me && (t.lastAt || 0) > ((t.seen || {})[me] || 0)).length;
  const unread = pPosts.filter(p => p.team && (p.at || 0) > seen).length + dmUnreadN;
  const cu = $("#pc-updates"); cu.hidden = !unread || v === "updates"; cu.textContent = unread;
  const callN = pLeads.filter(l => TO_CALL.includes(l.status || "new")).length;
  const cl = $("#pc-leads"); cl.hidden = !callN; cl.textContent = callN > 99 ? "99+" : callN;
  $("#p-group").textContent = pGroup ? pGroup.name : "";
  const box = $("#pv"); box.replaceChildren();
  const first = partnerName().split(" ")[0];
  if (v === "projects") { renderPartnerProjects(box); return }
  if (!pGroup) { box.append(el("div", { class: "empty" }, pGroupGone ? "Your group was closed. Message the Ardent Studios team." : "Loading your group…")); return }

  if (v === "leads") {
    box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, `Hi ${first}`),
      el("p", { class: "lede", style: "margin-top:-4px" }, `These are the numbers to call for ${pGroup.name}. After each call, pick what happened and add a short note. The team sees it right away.`),
      el("div", { style: "margin-top:14px" }, stats(pLeads)), earningsCard());
    box.append(...leadList(pLeads, "p", { team: false, who: partnerName() }).filter(Boolean));
  }
  if (v === "updates") renderPartnerChat(box, dmWith);
  if (v === "info") {
    const links = Object.entries(pGroup.links || {}).filter(([, x]) => x).map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.at || 0) - (b.at || 0));
    box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Info"),
      el("div", { class: "idea" }, pGroup.info ? el("div", { class: "post-text" }, pGroup.info) : el("p", { class: "label", style: "margin:0" }, "The team hasn't added info for your group yet.")),
      links.length ? el("div", { class: "idea", style: "margin-top:12px" }, el("h3", {}, "Files and links"), el("ul", { class: "plinks" }, links.map(k => el("li", {}, linkOrFile(k))))) : null,
      el("div", { class: "idea", style: "margin-top:12px;gap:6px" }, el("div", { class: "label" }, "Signed in as"), el("b", {}, partnerName()), el("div", { class: "label" }, (myProfile && myProfile.email) || ""),
        el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn quiet small", onclick: () => doSignOut() }, "Sign out"))));
  }
}

/* ---------- files for a partner group: PDFs, price lists, scripts (stored in pieces, tagged with the group) ---------- */
function linkOrFile(k) {
  if (!k.file) return el("a", { href: k.url, target: "_blank", rel: "noopener", onclick: previewClick(k.url, k.label || k.url) }, k.label || k.url);
  return el("button", { class: "filelink", onclick: () => openGroupFile(k.file) }, el("span", { class: "att-ext" }, extOf(k.file.name)),
    el("span", {}, k.label || k.file.name), el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, fmtSize(k.file.size)));
}
async function openGroupFile(f) {
  // PDFs, pictures, videos and text open inside the site; anything else downloads
  viewable(f) ? openViewer(f) : downloadFile(f);
}
function pickGroupFile(gid, labelInput) {
  const inp = el("input", { type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.html,.htm,image/*", hidden: true });
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    if (f.size > MAX_FILE && !f.type.startsWith("image/")) { toast(`${f.name} is too big. The limit is 5 MB per file.`); return }
    const label = (labelInput && labelInput.value.trim()) || f.name.replace(/\.[^.]+$/, "");
    try {
      toast("Uploading " + f.name + "…");
      const prepared = await prepareFile(f);
      const file = await uploadFile(prepared, null, { gid });
      delete file.thumb;
      await updateDoc(doc(db, "pgroups", gid), { ["links." + uid()]: { label, file, at: Date.now() } });
      if (labelInput) labelInput.value = "";
      toast("File added for the group");
    } catch (e) { toast(e && e.message === "too big" ? `${f.name} is too big. The limit is 5 MB per file.` : "That file didn't upload. Check your connection and try again.") }
  };
  document.body.append(inp); inp.click();
}

/* ---------- partner side: chat with the group and private messages with the team ---------- */
function pWatchDm(tid) {
  if (tid === pDmFor) return;
  if (pDmStop) { pDmStop(); pDmStop = null }
  pDmFor = tid; if (!tid) return;
  pDmStop = onSnapshot(query(collection(db, "dms", tid, "msgs"), orderBy("at"), limitToLast(300)), q => { pDmMsgs[tid] = q.docs.map(d => ({ id: d.id, ...d.data() })); render() }, () => { pDmOff = true; render() });
}
function renderPartnerChat(box, dmWith) {
  const other = t => (t.members || []).find(x => x !== me) || me;
  const t = dmWith ? pDms.find(x => other(x) === dmWith) : null;
  pWatchDm(t ? t.id : null);
  if (!dmWith) pSetSeen("p-updates");
  if (t && t.lastBy !== me && (t.lastAt || 0) > ((t.seen || {})[me] || 0)) setDoc(doc(db, "dms", t.id), { seen: { [me]: Date.now() } }, { merge: true }).catch(() => {});
  const seenG = pGetSeen("p-updates"), gUnread = pPosts.filter(p => p.team && (p.at || 0) > seenG).length;
  const threads = [...pDms].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Chat"),
    el("div", { class: "pchips chat-people" },
      el("button", { class: "pchip", "aria-pressed": String(!dmWith), onclick: () => { location.hash = "updates" } }, el("span", { class: "teamdot" }, "#"), pGroup.name, gUnread && dmWith ? el("span", { class: "count" }, gUnread) : null),
      threads.length ? el("span", { class: "chipsep" }, "Ardent team") : null,
      threads.map(x => { const u = other(x), n = x.lastBy && x.lastBy !== me && (x.lastAt || 0) > ((x.seen || {})[me] || 0) && dmWith !== u;
        return el("button", { class: "pchip", "aria-pressed": String(dmWith === u), onclick: () => { location.hash = "pdm-" + u } }, postAv((x.photos || {})[u]), ((x.names || {})[u] || "Team").split(" ")[0], n ? el("span", { class: "count" }, "1") : null) })));
  if (!dmWith) {
    box.append(el("div", { class: "chat-who" }, el("span", { class: "teamdot big" }, "#"), el("span", { class: "who-n" }, el("b", {}, pGroup.name + " group"), el("span", { class: "label" }, "You, the other partners here and the Ardent Studios team"))),
      chatView(groupChatItems(pGid, p => p.by === me), { onDelete: m => write(() => deleteDoc(doc(db, "pposts", m.id)), "Message deleted"), empty: "No messages yet. Tell the team how it's going: calls today, good leads, questions." }),
      chatComposer("p-msg", "Message the team and your group", txt => write(() => setDoc(doc(db, "pposts", uid()), { gid: pGid, by: me, name: partnerName(), photo: (myProfile && myProfile.photo) || "", team: false, text: txt, at: Date.now() }))),
      ...(threads.length ? [] : [el("p", { class: "label", style: "margin:10px 2px 0;text-transform:none;letter-spacing:0" }, "When someone from the team messages you privately, it shows up here too.")]));
    return;
  }
  if (!t) { box.append(el("div", { class: "empty" }, pDmOff ? "Private messages aren't switched on yet. Ask the team to update the database rules." : "Loading…")); return }
  const nm = (t.names || {})[dmWith] || "Ardent team";
  box.append(el("div", { class: "chat-who" }, postAv((t.photos || {})[dmWith]), el("span", { class: "who-n" }, el("b", {}, nm), el("span", { class: "rolebadge" }, "Ardent team")), el("span", { class: "who-lock" }, "\u{1F512} only you two see this")));
  const msgs = (pDmMsgs[t.id] || []).map(m => ({ id: m.id, by: m.by, name: m.by === me ? "You" : (t.names || {})[m.by] || nm, photo: (t.photos || {})[m.by], role: (t.roles || {})[m.by] || "team", text: m.text || "", at: m.at || 0, file: m.file }));
  box.append(chatView(msgs, { empty: "No messages yet." }),
    chatComposer("pdm-" + dmWith, "Message " + nm.split(" ")[0], txt => {
      const at = Date.now();
      write(async () => {
        await setDoc(doc(db, "dms", t.id, "msgs", uid()), { by: me, text: txt, at });
        await setDoc(doc(db, "dms", t.id), { lastAt: at, lastBy: me, lastText: txt.slice(0, 120), seen: { [me]: at }, names: { [me]: partnerName() }, roles: { [me]: "partner" }, photos: { [me]: (myProfile && myProfile.photo && myProfile.photo.length < 400) ? myProfile.photo : "" } }, { merge: true });
      });
    }));
}

// What a partner has earned from clients they brought (kept up to date by the team's site)
function earningsCard() {
  const e = (pMe && pMe.earnings) || null;
  if (!e || !(e.earned || e.paid)) return el("div", { class: "idea", style: "margin-top:12px;gap:4px" }, el("h3", {}, "Your earnings"),
    el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "When a client you brought pays, your commission shows here."));
  const owed = Math.max(0, e.earned - e.paid);
  return el("section", { class: "idea", style: "margin-top:12px" }, el("h3", {}, "Your earnings"),
    el("div", { class: "adgrid" }, el("div", {}, el("b", {}, fmtEGP(e.earned)), el("span", {}, "earned")), el("div", {}, el("b", {}, fmtEGP(e.paid)), el("span", {}, "paid to you")), el("div", {}, el("b", {}, fmtEGP(owed)), el("span", {}, "to come"))),
    (e.deals || []).length ? el("div", { style: "display:grid;gap:2px" }, e.deals.map(d => el("div", { class: "mrow" }, el("span", { class: "mname" }, d.title), el("span", { class: "mval" }, fmtEGP(d.earned))))) : null);
}

// A partner's number became a client: make the project, with the client's details and the partner's commission ready.
function startProjectFromLead(l) {
  const won = historyOf(l).find(h => h.s === "won"), byUid = (won && won.by) || l.claimBy;
  const pm = pMembers.find(m => m.uid === byUid) || pMembers.find(m => m.gid === l.gid && m.uid === l.claimBy) || null;
  const client = l.biz || l.name || "New client", id = uid(), now = Date.now();
  const pitch = [`Client found by ${pm ? pm.name || pm.id : "a partner"} in ${groupName(l.gid)}.`, l.name && l.biz ? `Contact: ${l.name}.` : "", l.phone ? `Phone: ${l.phone}.` : "", l.city ? `City: ${l.city}.` : "", l.note ? `Notes: ${l.note}` : ""].filter(Boolean).join(" ");
  const money = { type: "one", stage: "proposal", client, shares: {}, finders: [], finderTeam: false, currency: "EGP", rate: 1, setAt: now, setBy: me,
    partner: pm ? { email: pm.id, name: pm.name || pm.id, gid: pm.gid || "", mode: "pct", value: 10 } : null };
  write(async () => {
    await setDoc(doc(db, "ideas", id), { title: client, pitch: pitch.slice(0, 600), category: "Business", categories: ["Business"], client, author: me, createdAt: now, status: "approved", approvedAt: now,
      votes: { [me]: "keep" }, tasks: {}, backers: {}, money, fromLead: { id: l.id, gid: l.gid }, moneyLog: { [uid()]: { by: me, at: now, what: `Deal started from ${groupName(l.gid)}: partner ${pm ? pm.name || pm.id : "unknown"} at 10% (change it in Edit deal)`, kind: "deal" } } });
    await updateDoc(doc(db, "pleads", l.id), { projectId: id, projectAt: now });
  }, "Project made. Set the price and the shares in its Money tab").then(ok => { if (ok) { projTab = "money"; location.hash = "project-" + id } });
}


/* ---------- numbers pasted in a chat: the team can put them in partner groups ---------- */
// Only the team gets this. Partners and clients never see the list of groups.
const chatLeadCache = new Map();
function chatLeadCount(text) {
  if (partnerMode || clientMode || !text || !/\d{3}/.test(text)) return 0;
  if (!chatLeadCache.has(text)) chatLeadCache.set(text, parseLeads(text, "", false).rows.length);
  return chatLeadCache.get(text);
}
let lastPickGid = "";
// Guess the group from the country code: a +46 number goes to a group called Sweden, if there is one.
const DIAL = { 1: "usa|united states|america|canada", 20: "egypt|مصر", 27: "south africa", 30: "greece", 31: "netherlands|holland", 32: "belgium", 33: "france", 34: "spain", 39: "italy", 41: "switzerland", 43: "austria", 44: "uk|united kingdom|england|britain|london", 45: "denmark", 46: "sweden|sverige", 47: "norway", 48: "poland", 49: "germany", 61: "australia", 90: "turkey|türkiye", 212: "morocco", 216: "tunisia", 351: "portugal", 353: "ireland", 358: "finland", 961: "lebanon", 962: "jordan", 965: "kuwait", 966: "saudi|ksa", 968: "oman", 971: "uae|emirates|dubai|abu dhabi", 973: "bahrain", 974: "qatar|doha" };
function groupForPhone(phone, groups) {
  const t = String(phone || "").trim(); if (!/^(\+|00)/.test(t)) return "";
  const d = leadDigits(t).replace(/^00/, "");
  for (const len of [3, 2, 1]) {
    const names = DIAL[d.slice(0, len)]; if (!names) continue;
    const re = new RegExp(names, "i"), g = groups.find(x => re.test(x.name || ""));
    return g ? g.id : "";
  }
  return "";
}
function openLeadPicker(text) {
  document.querySelectorAll(".leadpick").forEach(x => x.remove());
  const found = parseLeads(text, "", false);
  const groups = [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const close = () => { wrap.remove(); document.removeEventListener("keydown", esc) };
  const esc = e => { if (e.key === "Escape") close() };
  const card = el("div", { class: "leadpick-card", role: "dialog", "aria-modal": "true", "aria-label": "Put numbers in a group" });
  const wrap = el("div", { class: "leadpick", onclick: e => { if (e.target === wrap) close() } }, card);
  document.addEventListener("keydown", esc);
  const head = el("div", { class: "row" }, el("h2", { style: "margin:0" }, "Put numbers in a group"), el("span", { class: "spacer" }), el("button", { class: "x", "aria-label": "Close", onclick: close }, "✕"));
  if (!groups.length) {
    card.append(head, el("p", { class: "lede" }, "There are no partner groups yet. Make a group for the country first, then come back to this message."),
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary", onclick: () => { close(); location.hash = "partners" } }, "Go to Partners")));
    document.body.append(wrap); return;
  }
  const gid0 = groups.some(g => g.id === lastPickGid) ? lastPickGid : groups[0].id;
  const pick = found.rows.map(r => ({ r, gid: groupForPhone(r.phone, groups) || gid0 }));
  const opts = sel => [...groups.map(g => el("option", { value: g.id, selected: g.id === sel }, g.name)), el("option", { value: "", selected: !sel }, "Don't add")];
  const list = el("div", { class: "lp-list" });
  const addBtn = el("button", { class: "btn primary" });
  const draw = () => {
    let n = 0;
    list.replaceChildren(...pick.map(it => {
      const where = it.gid ? leadWhere(it.r.phone, it.gid) : "";
      if (it.gid && !where) n++;
      const s = el("select", { class: "mini", "aria-label": "Group for " + it.r.phone, onchange: e => { it.gid = e.target.value; draw() } }, opts(it.gid));
      return el("div", { class: "lp-row" + (where || !it.gid ? " off" : "") },
        el("div", { style: "min-width:0" }, el("b", {}, it.r.biz || it.r.name || it.r.phone), " ", el("span", { class: "label" }, [it.r.biz || it.r.name ? it.r.phone : "", it.r.city].filter(Boolean).join(" · ")),
          where ? el("div", { class: "lp-why" }, `Repeated, ${where}. It won't be added.`) : null), s);
    }));
    addBtn.disabled = !n; addBtn.textContent = n ? `Add ${n} ${n === 1 ? "number" : "numbers"}` : "Nothing new to add";
  };
  const most = pick.reduce((c, it) => (c[it.gid] = (c[it.gid] || 0) + 1, c), {});
  const top = Object.keys(most).sort((a, b) => most[b] - most[a])[0] || gid0;
  const all = el("select", { class: "mini", "aria-label": "Put all in", onchange: e => { lastPickGid = e.target.value; pick.forEach(it => it.gid = e.target.value); draw() } }, groups.map(g => el("option", { value: g.id, selected: g.id === top }, g.name)));
  addBtn.onclick = async () => {
    const by = {};
    for (const it of pick) if (it.gid && !leadWhere(it.r.phone, it.gid)) (by[it.gid] = by[it.gid] || []).push(it.r);
    const gids = Object.keys(by), total = gids.reduce((t, g) => t + by[g].length, 0); if (!total) return;
    addBtn.disabled = true;
    const ok = await write(async () => { for (const g of gids) await addLeads(g, by[g]) },
      `Added ${total} ${total === 1 ? "number" : "numbers"} to ` + gids.map(groupName).join(" and "));
    if (ok === false) { addBtn.disabled = false; return }
    close();
    if (gids.length === 1) { pgTab = "leads"; location.hash = "pg-" + gids[0] }
  };
  card.append(head,
    el("p", { class: "label", style: "margin:0" }, `Found ${found.rows.length} ${found.rows.length === 1 ? "number" : "numbers"} in this message.` +
      (found.dupes ? ` ${found.dupes} ${found.dupes === 1 ? "was" : "were"} written twice and only counted once.` : "") +
      (found.skipped.length ? ` Skipped, no number: ${found.skipped.slice(0, 4).join(", ")}${found.skipped.length > 4 ? ` and ${found.skipped.length - 4} more` : ""}.` : "")),
    el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label" }, "Put all in"), all, el("span", { class: "label" }, "or pick a group for each number below.")),
    list, el("div", { class: "row" }, el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("span", { class: "spacer" }), addBtn));
  draw();
  document.body.append(wrap);
}
