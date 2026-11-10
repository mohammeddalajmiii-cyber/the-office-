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
    match /ideas/{id} {
      allow read, write: if isTeam();
    }
    match /chat/{id} {
      allow read, write: if isTeam();
    }
    match /meta/{name} {
      allow read: if isTeam();
      allow write: if (isTeam() && name != "team") || isAdmin();
    }
    match /users/{uid} {
      allow read: if isTeam();
      allow write: if isTeam() && request.auth.uid == uid;
    }
    // private messages: only the two people in the conversation
    match /dms/{tid} {
      allow read, write: if isTeam() && request.auth.uid in tid.split("_");
      match /msgs/{mid} {
        allow read, write: if isTeam() && request.auth.uid in tid.split("_");
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
let pErr = null, pLoaded = false;
let pMe = null, pGroup = null, pGroupGone = false, pGroupUnsubs = [], pGid = null;
let pgTab = "updates", plFilter = {}, pQuery = {}, pSel = {}, pDelGroup = null, pDelMember = null, pImport = {}, pImportOpen = {};

const leadDigits = s => String(s || "").replace(/\D/g, "");
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
// Works with rows copied from Google Sheets or Excel (tabs), or CSV. A header row is used when there is one.
function parseLeads(text, gid) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], noPhone: 0, dupes: 0 };
  const sep = lines[0].includes("\t") ? "\t" : (lines[0].includes(";") && !lines[0].includes(",")) ? ";" : ",";
  const cells = lines.map(l => sep === "," ? csvSplit(l) : l.split(sep).map(x => x.trim()));
  const isPhone = v => leadDigits(v).length >= 7 && /^[\d\s+()\-./]+$/.test(String(v).trim());
  const H = cells[0].map(x => x.toLowerCase());
  const hasHeader = !cells[0].some(isPhone) && H.some(h => /phone|number|mobile|tel|whats|رقم|هاتف|موبايل|جوال/.test(h));
  const ix = { phone: -1, biz: -1, name: -1, city: -1 };
  if (hasHeader) {
    const find = (re, not = []) => H.findIndex((h, n) => re.test(h) && !not.includes(n));
    ix.phone = find(/phone|number|mobile|tel|whats|رقم|هاتف|موبايل|جوال/);
    ix.biz = find(/business|company|shop|store|brand|clinic|restaurant|شركة|نشاط|محل/, [ix.phone]);
    ix.name = find(/name|contact|client|owner|person|اسم|عميل/, [ix.phone, ix.biz]);
    ix.city = find(/city|area|location|country|address|مدينة|منطقة|عنوان/, [ix.phone, ix.biz, ix.name]);
  }
  const existing = new Set(pLeads.filter(l => l.gid === gid).map(l => leadDigits(l.phone)));
  const rows = []; let noPhone = 0, dupes = 0;
  for (const r of hasHeader ? cells.slice(1) : cells) {
    let phone, name = "", biz = "", city = "", extra = [];
    if (hasHeader) {
      phone = r[ix.phone] || ""; name = ix.name >= 0 ? r[ix.name] || "" : ""; biz = ix.biz >= 0 ? r[ix.biz] || "" : ""; city = ix.city >= 0 ? r[ix.city] || "" : "";
      r.forEach((v, n) => { if (v && ![ix.phone, ix.name, ix.biz, ix.city].includes(n)) extra.push((cells[0][n] ? cells[0][n] + ": " : "") + v) });
    } else {
      const pi = r.findIndex(isPhone); phone = pi >= 0 ? r[pi] : "";
      const rest = r.filter((v, n) => n !== pi && v); name = rest[0] || ""; biz = rest[1] || ""; extra = rest.slice(2);
    }
    const d = leadDigits(phone);
    if (d.length < 6) { noPhone++; continue }
    if (existing.has(d)) { dupes++; continue }
    existing.add(d);
    rows.push({ phone: phone.trim(), name: name.slice(0, 80), biz: biz.slice(0, 80), city: city.slice(0, 60), extra: extra.join(" · ").slice(0, 400) });
  }
  return { rows, noPhone, dupes };
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
      el("li", {}, "Open console.firebase.google.com → the-office project → Firestore Database → Rules."),
      el("li", {}, "Delete everything there and paste the text below."),
      el("li", {}, "Press Publish, then reload this page.")),
    ta,
    el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("button", { class: "btn primary small", onclick: async () => { try { await navigator.clipboard.writeText(PARTNER_RULES); toast("Rules copied") } catch { ta.select(); toast("Select all and copy") } } }, "Copy rules")));
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
  const tabs = [["updates", "Updates" + (unread ? ` (${unread})` : "")], ["leads", "Numbers"], ["people", "People"], ["info", "Info"]];
  box.append(el("div", { class: "seg seg-wide", style: "margin:14px 0 4px" }, tabs.map(([k, v]) => el("button", { "aria-pressed": String(pgTab === k), onclick: () => { pgTab = k; render() } }, v))));

  if (pgTab === "updates") {
    pSetSeen(gid);
    const ta = el("textarea", { class: "noteinput", id: "pgmsg-" + gid, rows: "2", maxlength: "1000", placeholder: `Message everyone in ${g.name}: news, a new offer, tips` });
    box.append(el("div", { class: "compose", style: "margin-top:12px" }, ta, el("div", { class: "row" }, el("span", { class: "spacer" }),
      el("button", { class: "btn primary", onclick: () => { const t = ta.value.trim(); if (!t) return; ta.value = "";
        write(() => setDoc(doc(db, "pposts", uid()), { gid, by: me, name: teamName(), photo: photoOf(me) === AV ? "" : photoOf(me), team: true, text: t, at: Date.now() }), "Sent to " + g.name) } }, "Send"))));
    const feed = groupFeed(gid, pPosts, pLeads);
    box.append(el("div", { class: "pfeed", style: "margin-top:14px" }, feed.length ? feed.slice(0, 150).map(it => feedItem(it, { canDelete: () => true })) : el("div", { class: "empty" }, "No updates yet. When partners post or log calls, it shows up here.")));
  }

  if (pgTab === "leads") {
    box.append(el("div", { style: "margin-top:12px" }, stats(leads)));
    const ta = el("textarea", { class: "noteinput", id: "pgpaste-" + gid, rows: "5", placeholder: "Paste rows from Google Sheets or Excel here.\nName\tPhone\tBusiness\tCity\nAhmed\t+974 5555 1234\tDoha Dental\tDoha" });
    const prev = pImport[gid];
    const check = () => { pImport[gid] = parseLeads(ta.value, gid); render() };
    ta.addEventListener("input", () => { clearTimeout(check.t); check.t = setTimeout(check, 250) });
    box.append(el("details", { class: "idea", style: "margin-top:12px", open: !leads.length || pImportOpen[gid] || (prev && prev.rows.length) ? true : false, ontoggle: e => { pImportOpen[gid] = e.target.open } },
      el("summary", { style: "cursor:pointer;font-weight:600" }, "Add numbers from a sheet"),
      el("p", { class: "label", style: "margin:0" }, "Copy the rows (with the header row) and paste. Columns called name, phone, business and city are picked up. Anything else is kept with the number. Numbers already in this group are skipped."),
      ta,
      prev ? el("p", { class: "label", style: "margin:0" }, `Found ${prev.rows.length} new ${prev.rows.length === 1 ? "number" : "numbers"}` + (prev.dupes ? ` · ${prev.dupes} already here` : "") + (prev.noPhone ? ` · ${prev.noPhone} rows without a phone` : "")) : null,
      prev && prev.rows.length ? el("div", { class: "pimport" }, prev.rows.slice(0, 5).map(r => el("div", {}, el("b", {}, r.name || r.biz || "No name"), " ", r.phone, r.biz && r.name ? " · " + r.biz : "", r.city ? " · " + r.city : "")),
        prev.rows.length > 5 ? el("div", { class: "label" }, `…and ${prev.rows.length - 5} more`) : null) : null,
      el("div", { class: "row" }, el("span", { class: "spacer" }),
        el("button", { class: "btn primary", disabled: !(prev && prev.rows.length), onclick: async () => {
          const rows = pImport[gid].rows; delete pImport[gid]; ta.value = "";
          const el2 = document.getElementById("pgpaste-" + gid); if (el2) el2.value = "";
          await write(() => addLeads(gid, rows), `Added ${rows.length} numbers for ${g.name}`);
        } }, prev && prev.rows.length ? `Add ${prev.rows.length} numbers` : "Add numbers"))));
    box.append(...leadList(leads, "t-" + gid, { team: true, who: teamName() }).filter(Boolean));
  }

  if (pgTab === "people") {
    box.append(el("div", { class: "idea", style: "margin-top:12px" }, el("p", { style: "margin:0" }, "To add a partner to this group, go to Me \u203a Settings \u203a People and access, choose Partner, and pick " + g.name + "."),
      isAdmin ? el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn primary small", onclick: () => { location.hash = "settings" } }, "Open Settings")) : null));
    box.append(el("div", { class: "idea", style: "margin-top:12px" },
      el("div", { class: "label" }, "Send them this link. They sign in with Google using the email you added:"),
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
        el("button", { class: "x", "aria-label": "Remove " + (k.label || ""), onclick: () => write(async () => { await updateDoc(doc(db, "pgroups", gid), { ["links." + k.id]: DEL() }); if (k.file) for (let n = 0; n < k.file.parts; n++) deleteDoc(doc(db, "fileparts", `${k.file.id}_${n}`)).catch(() => {}) }, k.file ? "File removed" : "Link removed") }, "✕")))) : el("p", { class: "label", style: "margin:0" }, "Price lists, a pitch script, your portfolio, a WhatsApp group. PDFs and other files up to 5 MB too."),
      lab, url,
      el("div", { class: "row" }, el("span", { class: "spacer" }), el("button", { class: "btn", onclick: () => {
        let u = url.value.trim(); const t = lab.value.trim(); if (!u) { url.focus(); return } if (!/^https?:\/\//i.test(u)) u = "https://" + u;
        lab.value = ""; url.value = ""; write(() => updateDoc(doc(db, "pgroups", gid), { ["links." + uid()]: { label: t, url: u, at: Date.now() } }), "Link added") } }, "Add link"),
        el("button", { class: "btn primary", onclick: () => pickGroupFile(gid, lab) }, "Attach a file"))));
    const rn = el("input", { class: "noteinput", id: "pgrn-" + gid, maxlength: "40", placeholder: g.name });
    box.append(el("div", { class: "compose", style: "margin-top:12px" }, el("h3", {}, "Group"),
      el("div", { class: "addstep" }, rn, el("button", { class: "btn", onclick: () => { const v = rn.value.trim(); if (!v) return; rn.value = ""; write(() => updateDoc(doc(db, "pgroups", gid), { name: v }), "Renamed") } }, "Rename")),
      el("div", { class: "row" }, el("span", { class: "label" }, "Deleting removes its partners, numbers and updates."), el("span", { class: "spacer" }),
        pDelGroup === gid
          ? el("button", { class: "btn small danger-btn", onclick: async () => { pDelGroup = null; await write(() => deleteGroup(gid), "Group deleted"); location.hash = "partners" } }, "Yes, delete everything")
          : el("button", { class: "btn quiet small", onclick: () => { pDelGroup = gid; render() } }, "Delete group"))));
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
  pLeads = []; pPosts = []; partnerMode = false; $("#partner").hidden = true; partnerProjectsStop();
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
  if (!["leads", "updates", "info", "projects"].includes(location.hash.slice(1))) history.replaceState(null, "", "#leads");
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
  let v = location.hash.slice(1); if (!["leads", "updates", "info", "projects"].includes(v)) v = "leads";
  const open = myPTasks.filter(t => !t.done).length, cpj = $("#pc-projects"); if (cpj) { cpj.hidden = !open; cpj.textContent = open }
  for (const b of document.querySelectorAll("#partner .tab")) b.setAttribute("aria-selected", b.dataset.pview === v);
  const seen = pGetSeen("p-updates");
  const unread = pPosts.filter(p => p.team && (p.at || 0) > seen).length;
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
      el("div", { style: "margin-top:14px" }, stats(pLeads)));
    box.append(...leadList(pLeads, "p", { team: false, who: partnerName() }).filter(Boolean));
  }
  if (v === "updates") {
    pSetSeen("p-updates");
    const ta = el("textarea", { class: "noteinput", id: "p-msg", rows: "3", maxlength: "1000", placeholder: "Tell the team how it's going: calls today, good leads, questions" });
    box.append(el("h2", { class: "sec-h", style: "margin-top:0" }, "Updates"),
      el("div", { class: "compose" }, ta, el("div", { class: "row" }, el("span", { class: "label" }, "Only the Ardent Studios team and your group see this."), el("span", { class: "spacer" }),
        el("button", { class: "btn primary", onclick: () => { const t = ta.value.trim(); if (!t) return; ta.value = "";
          write(() => setDoc(doc(db, "pposts", uid()), { gid: pGid, by: me, name: partnerName(), photo: (myProfile && myProfile.photo) || "", team: false, text: t, at: Date.now() }), "Sent to the team") } }, "Send"))));
    const feed = groupFeed(pGid, pPosts, pLeads);
    box.append(el("div", { class: "pfeed", style: "margin-top:14px" }, feed.length ? feed.slice(0, 150).map(it => feedItem(it, { canDelete: p => p.by === me })) : el("div", { class: "empty" }, "No updates yet.")));
  }
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
  if (!k.file) return el("a", { href: k.url, target: "_blank", rel: "noopener" }, k.label || k.url);
  return el("button", { class: "filelink", onclick: () => openGroupFile(k.file) }, el("span", { class: "att-ext" }, extOf(k.file.name)),
    el("span", {}, k.label || k.file.name), el("span", { class: "label", style: "text-transform:none;letter-spacing:0" }, fmtSize(k.file.size)));
}
async function openGroupFile(f) {
  // PDFs and pictures open in a new tab; anything else downloads
  if (/^(application\/pdf|image\/)/.test(f.type)) {
    const w = window.open("", "_blank");
    try { const url = await loadFile(f); if (w) w.location.href = url; else downloadFile(f) } catch { if (w) w.close(); toast("That file couldn't be loaded. It may have been deleted.") }
  } else downloadFile(f);
}
function pickGroupFile(gid, labelInput) {
  const inp = el("input", { type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.html,.htm,image/*" });
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
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
  inp.click();
}
