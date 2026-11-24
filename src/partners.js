/* ---------- Partners: people abroad who find clients for Ardent Creative Studios ----------
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

// The whole Firestore rules file. build.py copies firestore.rules in here, so there's only one copy to edit. Replace everything in the console with it.
const PARTNER_RULES = `/*RULES*/`;

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
        el("div", { class: "post-meta" }, el("b", {}, p.by === me ? "You" : (p.name || "Someone")), p.team ? el("span", { class: "chip" }, "Ardent Creative Studios") : null, el("span", {}, ago(p.at))),
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
    shown.length ? el("div", { class: "ph-rows", style: "margin-top:10px" }, shown.slice(0, 200).map(phRow)) : el("div", { class: "empty" }, leads.length ? "Nothing here." : "No numbers yet."),
    shown.length > 200 ? el("p", { class: "label" }, `Showing 200 of ${shown.length}. Search to find the rest.`) : null];
}

/* ---------- team side: the Partners tab ---------- */

function partnerTeamSubs() {
  pErr = null;
  const fail = e => { pErr = e && e.code === "permission-denied" ? "rules" : "network"; pLoaded = true; render() };
  const ok = () => { pErr = null; pLoaded = true };
  return [
    onSnapshot(collection(db, "pgroups"), s => { pGroups = s.docs.map(d => ({ id: d.id, ...d.data() })); ok(); renderSoon() }, fail),
    onSnapshot(collection(db, "pmembers"), s => { pMembers = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, fail),
    onSnapshot(collection(db, "pleads"), s => { pLeads = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, fail),
    onSnapshot(collection(db, "pposts"), s => {
      const before = new Set(pPosts.map(p => p.id)), first = !pPosts.length;
      pPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of pPosts) if (!before.has(p.id) && !p.team && route().gid !== p.gid) toast(`${p.name || "A partner"} (${groupName(p.gid)}): ${(p.text || "").slice(0, 60)}`);
      renderSoon();
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
function teamName() { return realName(me) || (myProfile && myProfile.name) || "Ardent Creative Studios" }

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
  const box = $("#partners"); box.replaceChildren(); box.classList.toggle("phub", !gid);
  if (gid) renderPartnerGroupTeam(box, gid); else renderPartnersHub(box);
  renderLeadDrawer();
}

function stats(leads) {
  const c = f => leads.filter(f).length;
  return el("div", { class: "pstats" },
    [["To call", c(l => TO_CALL.includes(l.status || "new"))], ["Interested", c(l => HOT.includes(l.status))], ["Clients", c(l => l.status === "won")], ["Total", leads.length]]
      .map(([k, v]) => el("div", { class: "pstat" }, el("b", {}, v), el("span", {}, k))));
}

function renderPartnerGroupTeam(box, gid) {
  box.append(el("button", { class: "back", onclick: () => { phTab = "countries"; location.hash = "partners" } }, "← Partners"));
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
    box.append(el("div", { class: "chat-who", style: "margin-top:12px" }, el("span", { class: "teamdot big" }, "#"), el("span", { class: "who-n" }, el("b", {}, g.name + " group"), el("span", { class: "label" }, `The Ardent Creative Studios team and the ${people.length} ${people.length === 1 ? "partner" : "partners"} in ${g.name}`))),
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
        el("button", { class: "x", "aria-label": "Remove " + (k.label || ""), onclick: () => write(async () => { await updateDoc(doc(db, "pgroups", gid), { ["links." + k.id]: DEL() }); if (k.file) for (let n = 0; n < k.file.parts; n++) deleteDoc(doc(db, "fileparts", `${k.file.id}_${n}`)).catch(() => {}) }, k.file ? "File removed" : "Link removed") }, "✕")))) : el("p", { class: "label", style: "margin:0" }, "Price lists, a pitch script, your portfolio, a WhatsApp group. PDFs and other files up to 10 MB too."),
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
    renderSoon();
  }, e => { if (e.code === "permission-denied") partnerEnded(u) }));
  partnerGroupSubs(pm.gid);
  partnerProjectSubs(pm.id);
  unsubs.push(onSnapshot(query(collection(db, "dms"), where("members", "array-contains", me)), q => { pDms = q.docs.map(d => ({ id: d.id, ...d.data() })); pDmOff = false; renderSoon() }, () => { pDmOff = true; renderSoon() }));
  if (!["leads", "updates", "info", "projects"].includes(location.hash.slice(1)) && !location.hash.startsWith("#pdm-")) history.replaceState(null, "", "#leads");
  render();
}
function partnerEnded(u) {
  partnerStop(); signOut(auth);
  $("#gate-msg").textContent = `${u.email} doesn't have partner access anymore. Message the Ardent Creative Studios team if you think that's a mistake.`;
}
function partnerGroupSubs(gid) {
  pGroupUnsubs.forEach(f => f()); pGroupUnsubs = []; pGid = gid; pGroup = null; pLeads = []; pPosts = [];
  if (!gid) return;
  const fail = () => { toast("Can't reach your numbers. Check your connection.", 5000) };
  pGroupUnsubs.push(
    onSnapshot(doc(db, "pgroups", gid), s => { pGroup = s.exists() ? { id: s.id, ...s.data() } : null; pGroupGone = !s.exists() && !s.metadata.fromCache; renderSoon() }, fail),
    onSnapshot(query(collection(db, "pleads"), where("gid", "==", gid)), s => { pLeads = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, fail),
    onSnapshot(query(collection(db, "pposts"), where("gid", "==", gid)), s => {
      const before = new Set(pPosts.map(p => p.id)), first = !pPosts.length;
      pPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first) for (const p of pPosts) if (!before.has(p.id) && p.team && location.hash !== "#updates") toast(`${p.name || "Ardent Creative Studios"}: ${(p.text || "").slice(0, 60)}`);
      renderSoon();
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
function renderPortal() { keepPartnerInputs(renderPortalNow); renderLeadDrawer() }
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
  if (!pGroup) { box.append(el("div", { class: "empty" }, pGroupGone ? "Your group was closed. Message the Ardent Creative Studios team." : "Loading your group…")); return }

  if (v === "leads") { box.classList.add("phub"); renderPartnerHome(box) } else box.classList.remove("phub");
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

/* ---------- Partners page (team): one sales board for every country ----------
   Leads from every country in one place (To call, Interested, Meeting set, Client), what we owe partners,
   what needs you, the partners as people, and the countries (each keeps its group chat, info and files). */
const PH_STAGES = [["call", "To call", "var(--ph-call)"], ["hot", "Interested", "var(--ph-hot)"], ["meet", "Meeting set", "var(--fill)"], ["won", "Client", "var(--ph-gr)"]];
const STAGE_TAG = { call: "To call", hot: "Interested", meet: "Meeting set", won: "Client", lost: "Not interested" };
const stageOf = l => { const s = l.status || "new"; return TO_CALL.includes(s) ? "call" : s === "interested" ? "hot" : s === "meeting" ? "meet" : s === "won" ? "won" : "lost" };
const phTag = l => el("span", { class: "ph-st " + stageOf(l) }, STAGE_TAG[stageOf(l)]);
const ISO = [["egypt|مصر", "EG"], ["kenya", "KE"], ["tanzania", "TZ"], ["uganda", "UG"], ["rwanda", "RW"], ["qatar|doha", "QA"], ["sweden|sverige", "SE"], ["saudi|ksa", "SA"], ["uae|emirates|dubai|abu dhabi", "AE"], ["kuwait", "KW"], ["oman", "OM"], ["bahrain", "BH"], ["jordan", "JO"], ["lebanon", "LB"], ["morocco", "MA"], ["tunisia", "TN"], ["nigeria", "NG"], ["ghana", "GH"], ["south africa", "ZA"], ["germany", "DE"], ["france", "FR"], ["spain", "ES"], ["italy", "IT"], ["netherlands|holland", "NL"], ["united kingdom|england|britain|london|^uk$", "GB"], ["united states|america|^usa?$", "US"], ["canada", "CA"], ["turkey|türkiye", "TR"], ["norway", "NO"], ["denmark", "DK"], ["finland", "FI"]];
function ccOf(gid) { const n = groupName(gid), f = ISO.find(([re]) => new RegExp(re, "i").test(n)); return f ? f[1] : (n.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "··") }
const SW_CC = ["KE", "TZ", "UG", "RW"], AR_CC = ["EG", "SA", "AE", "QA", "KW", "OM", "BH", "JO", "LB", "MA", "TN"];
const fName = s => String(s || "").trim().split(/\s+/)[0] || "";
const phMemberByUid = u => u ? pMembers.find(m => m.uid === u) : null;
function leadOwner(l) { if (l.claimBy) { const m = phMemberByUid(l.claimBy); return (m && m.name) || l.claimName || realName(l.claimBy) || "" } return l.toName || "" }
// When a call-back or meeting is due. Kept on the lead, and in its history too (so it works before new rules are published).
function leadDueOf(l) {
  if (!["callback", "meeting"].includes(l.status)) return 0;
  if (l.due) return l.due;
  const h = historyOf(l)[0]; return h && h.s === l.status && h.due ? h.due : 0;
}
const isLate = l => { const d = leadDueOf(l); return !!d && d < Date.now() };
function leadDueText(t) {
  const d = new Date(t), sd = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((sd(d) - sd(new Date())) / 864e5);
  const hm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return diff === 0 ? "Today " + hm : diff === 1 ? "Tomorrow " + hm : diff === -1 ? "Yesterday " + hm : diff > 1 && diff < 7 ? d.toLocaleDateString([], { weekday: "short" }) + " " + hm : fmtDay(t);
}
// late first, then the soonest call-back, then the newest change
const leadOrder = (a, b) => (isLate(b) - isLate(a)) || ((leadDueOf(a) || 9e15) - (leadDueOf(b) || 9e15)) || ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
function leadMatch(l, q) {
  const qq = q.trim().toLowerCase(), qd = leadDigits(q); if (!qq) return true;
  return [l.name, l.biz, l.city, l.note, l.extra, leadOwner(l), groupName(l.gid)].join(" ").toLowerCase().includes(qq) || (qd.length > 2 && leadDigits(l.phone).includes(qd));
}
function phAv(name, photo, cls = "") { return photo ? el("img", { class: "ph-av " + cls, src: photo, alt: "", referrerpolicy: "no-referrer" }) : el("span", { class: "ph-av " + cls }, initials(name)) }

let phTab = "leads", phView = "board", phGid = "", phSt = "", phQ = "", phDelM = null, phMore = {};

function renderPartnersHub(box) {
  const now = Date.now(), wk = 7 * 864e5;
  box.classList.add("phub");
  box.append(el("div", { class: "ph-head" }, el("h1", { class: "ph-h1" }, "Partners"),
    el("span", { class: "ph-sub" }, "People in Egypt and around the world who bring us clients."), el("span", { class: "spacer" }),
    el("div", { class: "ph-acts" },
      el("button", { class: "btn", disabled: !pGroups.length, onclick: () => phSheetNumbers({}) }, nIc("plus"), "Add numbers"),
      el("button", { class: "btn primary", onclick: () => phSheetPartner({}) }, nIc("plus"), "Add a partner"))));
  if (pErr === "rules") { box.append(rulesCard(true)); return }
  if (pErr === "network") box.append(el("p", { class: "status warn" }, "Can't reach the partner area. Check your connection."));
  if (!pLoaded) { box.append(el("div", { class: "empty" }, "Loading…")); return }
  if (!pGroups.length) { box.append(el("div", { class: "ph-card ph-first" }, el("h3", {}, "Start with a country"), el("p", { class: "ph-sub" }, "Each country gets a group: its partners, its numbers to call, a group chat, info and files. Partners only ever see their own country."), phNewCountry())); return }

  const leads = phGid ? pLeads.filter(l => l.gid === phGid) : pLeads;
  const byStage = { call: [], hot: [], meet: [], won: [], lost: [] };
  for (const l of leads) byStage[stageOf(l)].push(l);
  const needsProj = pLeads.filter(l => l.status === "won" && !(l.projectId && ideas.find(i => i.id === l.projectId)));
  const late = pLeads.filter(isLate).sort((a, b) => leadDueOf(a) - leadDueOf(b));
  const lateHere = phGid ? late.filter(l => l.gid === phGid) : late;
  const meetWeek = byStage.meet.filter(l => { const d = leadDueOf(l); return d && d > now - 864e5 && d < now + wk }).length;
  const hotWeek = byStage.hot.filter(l => (l.updatedAt || 0) > now - wk).length;
  const owed = pMembers.reduce((s, m) => s + Math.max(0, ((m.earnings || {}).earned || 0) - ((m.earnings || {}).paid || 0)), 0);
  const hint = { call: lateHere.length ? `${lateHere.length} call-back${lateHere.length > 1 ? "s are" : " is"} late` : "", hot: hotWeek ? `${hotWeek} new this week` : "", meet: meetWeek ? `${meetWeek} this week` : "",
    won: (phGid ? needsProj.filter(l => l.gid === phGid) : needsProj).length ? `${(phGid ? needsProj.filter(l => l.gid === phGid) : needsProj).length} need${needsProj.length > 1 ? "" : "s"} a project` : "" };
  box.append(el("div", { class: "ph-funnel" }, PH_STAGES.map(([s, label]) => el("button", { "aria-pressed": String(phSt === s), onclick: () => { phSt = phSt === s ? "" : s; phTab = "leads"; render() } },
      el("span", { class: "n" }, byStage[s].length), el("span", { class: "l" }, label), el("span", { class: "h" }, hint[s] || " "))),
    el("button", { class: "money", "aria-pressed": "false", onclick: () => { phTab = "people"; render() } }, el("span", { class: "n" }, fmtEGP(owed)), el("span", { class: "l" }, "Owed to partners"), el("span", { class: "h" }, owed ? "Pay out from Money" : "All paid"))));

  // Needs you: new clients without a project, late call-backs, partners who went quiet
  const rows = [];
  for (const l of needsProj) rows.push(["star", [el("b", {}, leadTitle(l)), ` became a client (${[fName(leadOwner(l)), groupName(l.gid)].filter(Boolean).join(", ")})`], "Start a project", () => startProjectFromLead(l)]);
  for (const l of late) rows.push(["clock", [el("b", {}, leadTitle(l)), ` ${l.status === "meeting" ? "meeting" : "call-back"} was due ${leadDueText(leadDueOf(l)).toLowerCase()} (${[fName(leadOwner(l)), groupName(l.gid)].filter(Boolean).join(", ")})`], "Open", () => openLead(l.id)]);
  const lastCall = {}, toCall = {};
  for (const l of pLeads) { if (TO_CALL.includes(l.status || "new")) toCall[l.gid] = (toCall[l.gid] || 0) + 1; for (const [, h] of Object.entries(l.history || {})) if (h && h.by && (h.at || 0) > (lastCall[h.by] || 0)) lastCall[h.by] = h.at }
  for (const m of pMembers) {
    if (!m.uid || m.active === false || !toCall[m.gid]) continue;
    const since = lastCall[m.uid] || m.addedAt || 0, days = Math.floor((now - since) / 864e5);
    if (since && days >= 3) rows.push(["users", [el("b", {}, fName(m.name || m.id)), lastCall[m.uid] ? ` hasn't called anyone in ${days} days (${groupName(m.gid)})` : ` hasn't made a call yet (${groupName(m.gid)})`], "Message", () => { location.hash = "dm-" + m.uid }]);
  }
  if (rows.length) box.append(el("div", { class: "ph-attn" }, el("b", { class: "t" }, "Needs you"),
    rows.slice(0, phMore.attn ? 30 : 4).map(([ic, tx, label, go]) => el("div", { class: "row" }, el("span", { class: "ic" }, nIc(ic)), el("span", { class: "tx" }, tx), el("button", { class: "btn small", onclick: go }, label))),
    rows.length > 4 ? el("button", { class: "more", onclick: () => { phMore.attn = !phMore.attn; render() } }, phMore.attn ? "Show less" : `Show ${rows.length - 4} more`) : null));

  box.append(el("div", { class: "ph-tabs", role: "group", "aria-label": "Show" }, [["leads", "Leads", pLeads.length], ["people", "Partners", pMembers.length], ["countries", "Countries", pGroups.length]]
    .map(([k, label, n]) => el("button", { "aria-pressed": String(phTab === k), onclick: () => { phTab = k; render() } }, label, el("span", { class: "n" }, n)))));
  if (phTab === "leads") phLeads(box, leads);
  if (phTab === "people") phPeople(box);
  if (phTab === "countries") phCountries(box);
}

function phLeads(box, leads) {
  const groups = [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const q = el("input", { id: "ph-q", type: "search", placeholder: "Search name, business, city or number", autocomplete: "off", "aria-label": "Search leads", value: phQ });
  let t = 0; q.addEventListener("input", () => { phQ = q.value; clearTimeout(t); t = setTimeout(render, 120) });
  const lostN = leads.filter(l => stageOf(l) === "lost").length;
  box.append(el("div", { class: "ph-controls" },
    el("label", { class: "ph-search" }, nIc("search"), q), el("div", { class: "ph-viewseg" }, el("button", { "aria-pressed": String(phView === "board"), onclick: () => { phView = "board"; render() } }, nIc("board"), "Board"),
      el("button", { "aria-pressed": String(phView === "list"), onclick: () => { phView = "list"; render() } }, nIc("list"), "List")),
    groups.length > 1 ? el("div", { class: "ph-chips" }, el("button", { class: "ph-chip", "aria-pressed": String(!phGid), onclick: () => { phGid = ""; render() } }, "All countries"),
      groups.map(g => el("button", { class: "ph-chip", "aria-pressed": String(phGid === g.id), onclick: () => { phGid = g.id; render() } }, el("span", { class: "cc" }, ccOf(g.id)), g.name))) : null,
    lostN ? el("button", { class: "ph-chip", "aria-pressed": String(phSt === "lost"), onclick: () => { phSt = phSt === "lost" ? "" : "lost"; render() } }, `Not interested ${lostN}`) : null));
  const shown = leads.filter(l => (!phSt || stageOf(l) === phSt) && leadMatch(l, phQ)).sort(leadOrder);
  if (!leads.length) { box.append(el("div", { class: "ph-card ph-first" }, el("h3", {}, "No numbers yet"), el("p", { class: "ph-sub" }, "Paste them from a sheet and the partners in that country get a fair share."), el("div", {}, el("button", { class: "btn primary", onclick: () => phSheetNumbers({ gid: phGid }) }, nIc("plus"), "Add numbers")))); return }
  if (phView === "board" && phSt !== "lost" && matchMedia("(min-width: 760px)").matches) {
    box.append(el("div", { class: "ph-board" }, PH_STAGES.map(([s, label, col]) => {
      const list = shown.filter(l => stageOf(l) === s), cap = phMore["c-" + s] ? 400 : 30;
      return el("div", { class: "ph-col" }, el("div", { class: "colh" }, el("span", { class: "dot", style: "background:" + col }), label, el("span", { class: "count" }, list.length)),
        list.length ? list.slice(0, cap).map(phCard) : el("span", { class: "ph-sub", style: "padding:6px" }, "Nothing here"),
        list.length > cap ? el("button", { class: "more", onclick: () => { phMore["c-" + s] = true; render() } }, `Show ${list.length - cap} more`) : null);
    })));
    return;
  }
  const cap = phMore.list ? 1000 : 150;
  box.append(shown.length ? el("div", { class: "ph-rows" }, shown.slice(0, cap).map(phRow)) : el("div", { class: "empty" }, "Nothing found."),
    shown.length > cap ? el("button", { class: "more", onclick: () => { phMore.list = true; render() } }, `Show ${shown.length - cap} more`) : null);
}
function phCard(l) {
  const own = leadOwner(l), d = leadDueOf(l), hasP = l.projectId && ideas.find(i => i.id === l.projectId);
  return el("button", { class: "ph-lead" + (l.status === "won" ? " client" : ""), onclick: () => openLead(l.id) },
    el("span", { class: "t" }, el("span", { dir: "auto" }, leadTitle(l))),
    el("span", { class: "m" }, el("span", { class: "cc" }, ccOf(l.gid)), l.city ? el("span", {}, l.city) : null, own ? [el("span", { class: "ph-av xs" }, initials(own)), el("span", {}, fName(own))] : null,
      d ? el("span", { class: "due" + (d < Date.now() ? " late" : "") }, leadDueText(d)) : null),
    l.note ? el("span", { class: "note", dir: "auto" }, l.note) : null,
    l.status === "won" ? el("span", { class: "cta" }, hasP ? "Project started" : "Start a project", nIc("arrow")) : null);
}
function phRow(l) {
  const own = leadOwner(l), d = leadDueOf(l);
  return el("button", { class: "ph-row", onclick: () => openLead(l.id) }, el("span", { class: "ph-av md" }, initials(partnerMode ? leadTitle(l) : own || leadTitle(l))),
    el("span", { class: "tx" }, el("b", { dir: "auto" }, leadTitle(l)),
      el("span", { class: "m" }, partnerMode ? null : el("span", { class: "cc" }, ccOf(l.gid)), [l.city, partnerMode ? "" : fName(own), d ? leadDueText(d) : (l.updatedAt ? ago(l.updatedAt) : "new")].filter(Boolean).join(" · "))),
    d && d < Date.now() ? el("span", { class: "ph-st late" }, "Late") : phTag(l));
}

function phPeople(box) {
  if (!pMembers.length) { box.append(el("div", { class: "ph-card ph-first" }, el("h3", {}, "No partners yet"), el("p", { class: "ph-sub" }, "Add someone by their Google email and pick their country. They sign in on this same link."), el("div", {}, el("button", { class: "btn primary", onclick: () => phSheetPartner({}) }, nIc("plus"), "Add a partner")))); return }
  const calls = {}, worked = {}, hot = {}, won = {};
  for (const l of pLeads) {
    for (const [, h] of Object.entries(l.history || {})) if (h && h.by) { calls[h.by] = (calls[h.by] || 0) + 1; (worked[h.by] = worked[h.by] || new Set()).add(l.id) }
    if (l.claimBy && HOT.includes(l.status)) hot[l.claimBy] = (hot[l.claimBy] || 0) + 1;
    if (l.claimBy && l.status === "won") won[l.claimBy] = (won[l.claimBy] || 0) + 1;
  }
  const list = [...pMembers].sort((a, b) => (won[b.uid] || 0) - (won[a.uid] || 0) || (calls[b.uid] || 0) - (calls[a.uid] || 0) || (a.name || "").localeCompare(b.name || ""));
  box.append(el("div", { class: "ph-grid" }, list.map((m, i) => {
    const e = m.earnings || {}, owe = Math.max(0, (e.earned || 0) - (e.paid || 0)), w = m.uid ? (worked[m.uid] || new Set()).size : 0, cl = m.uid ? won[m.uid] || 0 : 0;
    const online = m.seenAt && Date.now() - m.seenAt < 5 * 60e3, nm = m.name || m.id;
    return el("div", { class: "ph-pcard" }, el("span", { class: "rank" }, "#" + (i + 1)),
      el("div", { class: "top" }, phAv(nm, m.photo, "lg"), el("div", { style: "min-width:0" }, el("div", { class: "nm" }, nm),
        el("div", { class: "ms" }, el("span", { class: "cc" }, ccOf(m.gid)), groupName(m.gid), " · ", el("span", { class: online ? "on" : "off" }), !m.uid ? "Hasn't signed in yet" : online ? "Online" : m.seenAt ? "Last seen " + ago(m.seenAt) : "Signed in"))),
      el("div", { class: "ph-pst" }, [[m.uid ? calls[m.uid] || 0 : 0, "Calls"], [m.uid ? hot[m.uid] || 0 : 0, "Interested"], [cl, "Clients"], [(w ? Math.round(cl / w * 100) : 0) + "%", "Win rate"]].map(([v, k]) => el("div", {}, el("b", {}, v), el("span", {}, k)))),
      el("div", { class: "earn" }, e.earned ? el("span", {}, "Earned ", el("b", {}, fmtEGP(e.earned)), owe ? [" · owed ", el("b", {}, fmtEGP(owe))] : " · all paid") : el("span", {}, "Nothing earned yet"), el("span", { class: "spacer" }),
        m.uid ? el("button", { class: "btn small", "aria-label": "Message " + fName(nm), title: "Private chat", onclick: () => { location.hash = "dm-" + m.uid } }, nIc("chat")) : null,
        el("button", { class: "btn small", onclick: () => phSheetNumbers({ gid: m.gid, to: m.id }) }, "Give numbers")),
      el("div", { class: "foot" }, el("span", { class: "ph-sub" }, m.email || m.id), el("span", { class: "spacer" }),
        phDelM === m.id ? [el("button", { class: "btn quiet small", onclick: () => { phDelM = null; render() } }, "Cancel"), el("button", { class: "btn small danger-btn", onclick: () => { phDelM = null; write(() => deleteDoc(doc(db, "pmembers", m.id)), "Removed. They can't open the partner area anymore") } }, "Yes, remove")]
          : el("button", { class: "btn quiet small", onclick: () => { phDelM = m.id; render() } }, "Remove")));
  })));
}

function phNewCountry(after) {
  const nm = el("input", { class: "noteinput", id: "ph-newc", maxlength: "40", placeholder: "Country, e.g. Qatar" });
  const make = () => phMakeCountry(nm.value).then(id => { if (id) { nm.value = ""; if (after) after(id); else { pgTab = "people"; location.hash = "pg-" + id } } });
  nm.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); make() } });
  return el("div", { class: "addstep" }, nm, el("button", { class: "btn primary", onclick: make }, "Add country"));
}
async function phMakeCountry(name) {
  const n = String(name || "").trim(); if (!n) { toast("Type the country first"); return null }
  const same = pGroups.find(g => (g.name || "").toLowerCase() === n.toLowerCase()); if (same) { toast(n + " is already here"); return same.id }
  const id = uid(); const ok = await write(() => setDoc(doc(db, "pgroups", id), { name: n, info: "", links: {}, createdAt: Date.now(), createdBy: me }), n + " added");
  return ok ? id : null;
}
function phCountries(box) {
  const groups = [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  box.append(el("div", { class: "ph-grid" }, groups.map(g => {
    const ls = pLeads.filter(l => l.gid === g.id), ps = pMembers.filter(m => m.gid === g.id), tot = Math.max(1, ls.length), n = s => ls.filter(l => stageOf(l) === s).length;
    const last = groupFeed(g.id, pPosts, pLeads)[0], unread = partnerUnread(g.id);
    return el("button", { class: "ph-ccard", onclick: () => { pgTab = "updates"; location.hash = "pg-" + g.id } },
      el("div", { class: "top" }, el("span", { class: "code" }, ccOf(g.id)), el("div", { style: "min-width:0;flex:1" }, el("div", { class: "nm" }, g.name), el("div", { class: "ph-sub" }, `${ps.length} ${ps.length === 1 ? "partner" : "partners"} · ${ls.length} ${ls.length === 1 ? "lead" : "leads"}`)),
        unread ? el("span", { class: "pill" }, `${unread} new`) : null),
      el("div", { class: "bar" }, PH_STAGES.map(([s, , col]) => el("i", { style: `width:${n(s) / tot * 100}%;background:${col}` }))),
      el("div", { class: "legend" }, PH_STAGES.map(([s, label, col]) => el("span", {}, el("i", { style: "background:" + col }), `${n(s)} ${label.toLowerCase()}`))),
      el("div", { class: "last" }, nIc("chat"), last ? (last.kind === "post" ? `${last.p.name || "Someone"}: ${last.p.text || ""}` : `${last.h.name || "Someone"} marked ${leadTitle(last.l)} as ${LEAD_NAME[last.h.s] || "updated"}`) + " · " + ago(last.at) : "Group chat, info for partners, price lists and files"));
  }), el("div", { class: "ph-ccard ph-newc" }, el("div", { class: "nm" }, "New country"), el("p", { class: "ph-sub" }, "It gets its own group chat, numbers, info and files."), phNewCountry())));
  if (isAdmin) box.append(el("details", { style: "margin-top:22px" }, el("summary", { class: "label", style: "cursor:pointer" }, "Database rules for partners"), rulesCard(false)));
}

/* ---------- sheets: add numbers, add a partner, add a business (partners) ---------- */
function phSheet(title, build) {
  document.querySelectorAll(".ph-sheet").forEach(x => x.remove());
  const close = () => { wrap.remove(); document.removeEventListener("keydown", esc) };
  const esc = e => { if (e.key === "Escape") close() };
  const card = el("div", { class: "leadpick-card ph-sheetcard", role: "dialog", "aria-modal": "true", "aria-label": title });
  const wrap = el("div", { class: "leadpick ph-sheet", onclick: e => { if (e.target === wrap) close() } }, card);
  document.addEventListener("keydown", esc);
  card.append(el("div", { class: "row" }, el("h2", { style: "margin:0" }, title), el("span", { class: "spacer" }), el("button", { class: "x", "aria-label": "Close", onclick: close }, "✕")));
  build(card, close);
  document.body.append(wrap);
  const f = card.querySelector("input:not([type=checkbox]),textarea,select"); if (f) setTimeout(() => f.focus(), 30);
}
function phCountrySelect(sel, onPick) {
  const s = el("select", { class: "mini", "aria-label": "Country" }, [...pGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(g => el("option", { value: g.id, selected: g.id === sel }, g.name)), el("option", { value: "+" }, "New country…"));
  const nc = el("input", { class: "noteinput", maxlength: "40", placeholder: "Country name", hidden: true });
  s.onchange = () => { nc.hidden = s.value !== "+"; if (!nc.hidden) nc.focus(); onPick && onPick() };
  const get = async () => s.value === "+" ? phMakeCountry(nc.value) : s.value;
  return { s, nc, get };
}
function phSheetNumbers({ gid, to }) {
  phSheet("Add numbers", (card, close) => {
    const pick = phCountrySelect(gid || phGid || lastPickGid || (pGroups[0] || {}).id, () => draw());
    const share = el("select", { class: "mini", "aria-label": "Who calls them" });
    const ta = el("textarea", { class: "noteinput", rows: "5", placeholder: "Paste rows from Google Sheets or Excel, or a typed list.\nName\tPhone\tBusiness\tCity\nAhmed\t+974 5555 1234\tDoha Dental\tDoha" });
    const f = { name: el("input", { class: "noteinput", maxlength: "80", placeholder: "Name" }), phone: el("input", { class: "noteinput", type: "tel", maxlength: "30", placeholder: "Phone, e.g. +974 5555 1234" }),
      biz: el("input", { class: "noteinput", maxlength: "80", placeholder: "Business" }), city: el("input", { class: "noteinput", maxlength: "60", placeholder: "City" }) };
    const info = el("div", { class: "ph-sub" }), add = el("button", { class: "btn primary" });
    let found = { rows: [] };
    const draw = () => {
      const g = pick.s.value, people = pMembers.filter(m => m.gid === g && m.active !== false), cur = share.value || (to ? "to:" + to : people.length > 1 ? "share" : people.length ? "to:" + people[0].id : "any");
      share.replaceChildren(...(people.length > 1 ? [el("option", { value: "share", selected: cur === "share" }, `Share them out between the ${people.length} partners`)] : []),
        ...people.map(m => el("option", { value: "to:" + m.id, selected: cur === "to:" + m.id }, `Give them all to ${m.name || m.id}`)), el("option", { value: "any", selected: cur === "any" }, "Anyone in the country can call them"));
      found = ta.value.trim() ? parseLeads(ta.value, g === "+" ? "" : g) : { rows: [], dupes: 0, noPhone: 0, repeats: [] };
      const one = leadDigits(f.phone.value).length >= 6 ? 1 : 0, n = found.rows.length + one;
      info.textContent = ta.value.trim() ? `Found ${found.rows.length} new ${found.rows.length === 1 ? "number" : "numbers"}` + (found.dupes ? ` · ${found.dupes} repeated, skipped` : "") + (found.noPhone ? ` · ${found.noPhone} without a number skipped` : "") : "";
      add.disabled = !n; add.textContent = n ? `Add ${n} ${n === 1 ? "number" : "numbers"}` : "Add numbers";
    };
    let t = 0; ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, 200) }); f.phone.addEventListener("input", draw);
    add.onclick = async () => {
      const g = await pick.get(); if (!g) return;
      const rows = [...parseLeads(ta.value, g).rows];
      const ph = f.phone.value.trim();
      if (leadDigits(ph).length >= 6) { const w = leadWhere(ph, g); if (w) { toast(`${ph} is repeated. It's ${w}.`, 5000) } else rows.push({ phone: ph, name: f.name.value.trim(), biz: f.biz.value.trim(), city: f.city.value.trim(), extra: "" }) }
      if (!rows.length) return;
      // fair share: each partner in the country gets the next number in turn
      const people = pMembers.filter(m => m.gid === g && m.active !== false), v = share.value;
      const giveTo = v === "share" ? people : v.startsWith("to:") ? people.filter(m => m.id === v.slice(3)) : [];
      if (giveTo.length) rows.forEach((r, i) => { const m = giveTo[i % giveTo.length]; r.to = m.id; r.toName = m.name || m.id });
      add.disabled = true; lastPickGid = g;
      const ok = await write(() => addLeads(g, rows), `Added ${rows.length} ${rows.length === 1 ? "number" : "numbers"} for ${groupName(g)}` + (giveTo.length > 1 ? `, shared between ${giveTo.length} partners` : giveTo.length ? `, given to ${fName(giveTo[0].name || giveTo[0].id)}` : ""));
      if (ok) close(); else add.disabled = false;
    };
    card.append(el("div", { class: "ph-form" },
      el("label", {}, el("span", { class: "lbl" }, "Country"), pick.s, pick.nc),
      el("label", {}, el("span", { class: "lbl" }, "Paste from a sheet"), ta), info,
      el("details", {}, el("summary", {}, "Or add one number by hand"), el("div", { class: "onelead", style: "margin-top:8px" }, f.name, f.phone, f.biz, f.city)),
      el("label", {}, el("span", { class: "lbl" }, "Who calls them"), share)),
      el("div", { class: "row" }, el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("span", { class: "spacer" }), add));
    draw();
  });
}
function phSheetPartner({ gid }) {
  phSheet("Add a partner", (card, close) => {
    const pick = phCountrySelect(gid || phGid || (pGroups[0] || {}).id);
    const nm = el("input", { class: "noteinput", maxlength: "60", placeholder: "Their name" }), em = el("input", { class: "noteinput", type: "email", inputmode: "email", maxlength: "120", placeholder: "Their Google email", autocomplete: "off" });
    const add = el("button", { class: "btn primary" }, "Add partner");
    add.onclick = async () => {
      const e = lower(em.value), n = nm.value.trim();
      if (!emailOk(e)) { toast("That doesn't look like an email address"); em.focus(); return }
      const has = roleOf(e); if (has === "team" || has === "client") { toast(`${e} is already a ${ROLE_NAME[has].toLowerCase()}`); return }
      const g = await pick.get(); if (!g) return;
      const cur = pMembers.find(m => m.id === e); if (cur && cur.gid === g) { toast("Already a partner in " + groupName(g)); return }
      add.disabled = true;
      const ok = await write(() => setDoc(doc(db, "pmembers", e), { email: e, name: n || (cur && cur.name) || e.split("@")[0], gid: g, active: true, addedBy: me, addedAt: Date.now() }, { merge: true }),
        cur ? `${n || cur.name || e} moved to ${groupName(g)}` : `${n || e} is a partner in ${groupName(g)}. Send them the link`);
      if (ok) close(); else add.disabled = false;
    };
    [nm, em].forEach(i => i.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); add.click() } }));
    card.append(el("div", { class: "ph-form" }, el("label", {}, el("span", { class: "lbl" }, "Name"), nm), el("label", {}, el("span", { class: "lbl" }, "Google email"), em),
      el("label", {}, el("span", { class: "lbl" }, "Country"), pick.s, pick.nc),
      el("p", { class: "ph-sub", style: "margin:0" }, "They sign in with Google using exactly this email, on the same link as you:"),
      el("div", { class: "row" }, el("code", { class: "plink" }, SITE_LINK), el("span", { class: "spacer" }), el("button", { class: "btn small", onclick: () => copyText(SITE_LINK, "Link copied") }, "Copy link"))),
      el("div", { class: "row" }, el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("span", { class: "spacer" }), add));
  });
}
function phSheetFound() {
  phSheet("Add a business I found", (card, close) => {
    const f = { biz: el("input", { class: "noteinput", maxlength: "80", placeholder: "Business name" }), name: el("input", { class: "noteinput", maxlength: "80", placeholder: "Who you talk to (optional)" }),
      phone: el("input", { class: "noteinput", type: "tel", maxlength: "30", placeholder: "Phone" }), city: el("input", { class: "noteinput", maxlength: "60", placeholder: "City" }) };
    const add = el("button", { class: "btn primary" }, "Add it");
    add.onclick = async () => {
      const phone = f.phone.value.trim(); if (leadDigits(phone).length < 6) { toast("Type their phone number"); f.phone.focus(); return }
      const k = leadKey(phone); if (pLeads.some(l => leadKey(l.phone) === k)) { toast("That number is already on your list"); return }
      add.disabled = true; const id = uid(), now = Date.now();
      const ok = await write(() => setDoc(doc(db, "pleads", id), { phone, name: f.name.value.trim(), biz: f.biz.value.trim(), city: f.city.value.trim(), extra: "", gid: pGid, status: "new", note: "", createdAt: now, createdBy: me, foundBy: me, claimBy: me, claimName: partnerName(), history: {} }), "Added. If it becomes a client, the commission is yours");
      if (ok) { close(); openLead(id) } else { add.disabled = false; toast("The team needs to update the database rules first. Send them a message.", 5000) }
    };
    card.append(el("p", { class: "ph-sub", style: "margin:0" }, "A business you found yourself. It's yours: if it becomes a client, the commission is yours."),
      el("div", { class: "onelead" }, f.biz, f.name, f.phone, f.city),
      el("div", { class: "row" }, el("button", { class: "btn quiet", onclick: close }, "Cancel"), el("span", { class: "spacer" }), add));
  });
}

/* ---------- one panel per lead: call, WhatsApp with a ready message, what happened, history ---------- */
let leadOpen = null, leadOut = null, leadNote = "", leadDue = "", leadLang = null, leadDel = false;
const OUTS = [["noanswer", "mute", "No answer"], ["callback", "clock", "Call back"], ["interested", "flame", "Interested"], ["meeting", "cal", "Meeting set"], ["won", "star", "Client"], ["lost", "no", "Not interested"]];
function openLead(id) { if (leadOpen !== id) { leadOut = null; leadNote = ""; leadDue = ""; leadLang = null; leadDel = false } leadOpen = id; if (!partnerMode && route().view !== "partners") location.hash = "partners"; render() }
function closeLead() { leadOpen = null; leadDel = false; renderLeadDrawer() }
function pitchText(l, lang) {
  const to = l.name || "", biz = l.biz || l.name || "", from = fName(partnerMode ? partnerName() : realName(me) || teamName());
  if (lang === "ar") return `أهلاً${to ? " " + to : ""}، معاك ${from} من Ardent Creative Studios. بنعمل مواقع وإعلانات جوجل لشركات زي ${biz || "شركتك"}. ممكن أوريك مثالين؟`;
  if (lang === "sw") return `Habari${to ? " " + to : ""}, mimi ni ${from} kutoka Ardent Creative Studios. Tunatengeneza tovuti na matangazo ya Google kwa biashara kama ${biz || "yako"}. Naweza kukuonyesha mifano 2?`;
  return `Hi ${to || "there"}, this is ${from} from Ardent Creative Studios. We build websites and run Google Ads for businesses like ${biz || "yours"}. Could I show you 2 examples?`;
}
// the next number for a partner: a late call-back first, then their own, then new ones
function nextLead(skip) {
  const mine = l => l.to === (pMe && pMe.id) || l.claimBy === me || l.foundBy === me;
  return pLeads.filter(l => l.id !== skip && TO_CALL.includes(l.status || "new") && (!leadDueOf(l) || leadDueOf(l) < Date.now() + 15 * 60e3) && (mine(l) || (!l.to && !l.claimBy)))
    .sort((a, b) => (isLate(b) - isLate(a)) || (mine(b) - mine(a)) || ((a.status === "new") - (b.status === "new")) || ((a.createdAt || 0) - (b.createdAt || 0)))[0] || null;
}
async function saveLeadUpdate(l, status, note, who, due) {
  const hid = uid(), at = Date.now(), ref = doc(db, "pleads", l.id);
  const data = { status, note, updatedAt: at, updatedBy: me, updatedName: who, ["history." + hid]: { s: status, note, by: me, name: who, at, ...(due ? { due } : {}) } };
  if (!l.claimBy) { data.claimBy = me; data.claimName = who }
  if (due) data.due = due; else if (l.due) data.due = DEL();
  return write(async () => {
    try { await updateDoc(ref, data) }
    catch (e) { if (e && e.code === "permission-denied" && "due" in data) { delete data.due; await updateDoc(ref, data) } else throw e }   // works before the new rules are published
  }, "Saved");
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && leadOpen && !document.querySelector(".ph-sheet,.leadpick")) closeLead() });
function renderLeadDrawer() {
  let host = document.getElementById("ld"), scrim = document.getElementById("ld-scrim");
  if (!host) { scrim = el("div", { id: "ld-scrim", class: "ld-scrim", onclick: closeLead }); host = el("aside", { id: "ld", class: "ld", role: "dialog", "aria-label": "Number" }); document.body.append(scrim, host) }
  const onPage = partnerMode ? !$("#partner").hidden : route().view === "partners";
  const l = leadOpen && onPage && pLeads.find(x => x.id === leadOpen);
  if (!l) { leadOpen = null; host.classList.remove("open"); scrim.classList.remove("open"); host.dataset.sig = ""; return }
  // rebuilt only when something on it changed, so typing a note is never interrupted
  const sig = JSON.stringify([l.id, l.status, l.updatedAt, l.projectId, l.due, Object.keys(l.history || {}).length, leadOut, leadLang, leadDel, !!(l.projectId && ideas.find(i => i.id === l.projectId))]);
  host.classList.add("open"); scrim.classList.add("open");
  if (host.dataset.sig === sig) return;
  const act = document.activeElement, actId = act && host.contains(act) ? act.id : null;
  host.dataset.sig = sig;
  const cc = partnerMode ? ccOf(pGid) : ccOf(l.gid), lang = leadLang || (SW_CC.includes(cc) ? "sw" : AR_CC.includes(cc) ? "ar" : "en"), msg = pitchText(l, lang);
  const tel = "tel:" + String(l.phone || "").replace(/[^\d+]/g, ""), own = leadOwner(l), who = partnerMode ? partnerName() : teamName();
  const hasP = l.projectId && ideas.find(i => i.id === l.projectId), hist = historyOf(l), d = leadDueOf(l);
  const note = el("textarea", { class: "ld-in", id: "ld-note", rows: "2", maxlength: "500", dir: "auto", placeholder: "A short note: what did they say?", oninput: e => { leadNote = e.target.value } }); note.value = leadNote;
  const wantsTime = ["callback", "meeting"].includes(leadOut);
  const when = wantsTime ? el("input", { class: "ld-in", id: "ld-due", type: "datetime-local", "aria-label": leadOut === "meeting" ? "When is the meeting" : "When to call back", oninput: e => { leadDue = e.target.value } }) : null;
  if (when) when.value = leadDue;
  const save = async () => {
    const st = leadOut || l.status || "new", n = leadNote.trim().slice(0, 500);
    if (!leadOut && !n) { toast("Pick what happened, or write a note"); return }
    const due = ["callback", "meeting"].includes(st) && leadDue ? new Date(leadDue).getTime() : (["callback", "meeting"].includes(st) && st === l.status ? leadDueOf(l) : 0);
    if (!(await saveLeadUpdate(l, st, n, who, due || 0))) return;
    const next = partnerMode ? nextLead(l.id) : null;
    leadOut = null; leadNote = ""; leadDue = ""; leadLang = null;
    if (next) { leadOpen = next.id; toast("Saved. Next: " + leadTitle(next)) } else leadOpen = null;
    render();
  };
  host.replaceChildren(
    el("div", { class: "ld-head" }, el("b", { dir: "auto" }, leadTitle(l)), phTag(l), el("button", { class: "x", "aria-label": "Close", onclick: closeLead }, nIc("x"))),
    el("div", { class: "ld-body" },
      el("div", { class: "ld-contact" }, el("a", { class: "pn", href: tel, dir: "ltr" }, l.phone || "No number"),
        el("span", { class: "m" }, [l.name && l.biz ? l.name : "", l.city, partnerMode ? "" : groupName(l.gid), !partnerMode && own ? "handled by " + own : ""].filter(Boolean).join(" · ")),
        l.extra ? el("span", { class: "m", dir: "auto" }, l.extra) : null,
        d ? el("span", { class: "due" + (d < Date.now() ? " late" : "") }, (l.status === "meeting" ? "Meeting " : "Call back ") + leadDueText(d).replace(/^T/, "t")) : null),
      el("div", { class: "two" }, el("a", { class: "btn primary big", href: tel }, nIc("phone"), "Call"),
        el("a", { class: "btn big", href: waLink(l.phone) + "?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener" }, nIc("wa"), "WhatsApp")),
      el("div", { class: "ld-tpl" }, el("div", { class: "row" }, el("span", { class: "lbl" }, "Message to send"), el("span", { class: "spacer" }),
        el("span", { class: "langs" }, [["en", "EN"], ["ar", "AR"], ["sw", "SW"]].map(([k, v]) => el("button", { "aria-pressed": String(lang === k), onclick: () => { leadLang = k; renderLeadDrawer() } }, v))),
        el("button", { class: "x", "aria-label": "Copy the message", title: "Copy", onclick: () => copyText(msg, "Message copied") }, nIc("copy"))),
        el("span", { dir: "auto" }, msg)),
      l.status === "won" && !partnerMode ? el("div", { class: "wonbox" }, el("span", {}, hasP ? "Project started for this client." : "This is a client now. Start the project: the partner's 10% is set up for you."),
        hasP ? el("button", { class: "btn small", onclick: () => { leadOpen = null; location.hash = "project-" + l.projectId } }, "Open it") : el("button", { class: "btn small primary", onclick: () => { leadOpen = null; startProjectFromLead(l) } }, "Start a project")) : null,
      l.status === "won" && partnerMode ? el("div", { class: "wonbox" }, el("span", {}, "A client! The team takes it from here, and your commission shows on your home page.")) : null,
      el("span", { class: "lbl" }, "What happened?"),
      el("div", { class: "outs" }, OUTS.map(([k, ic, t]) => el("button", { class: "out", "aria-pressed": String(leadOut === k), onclick: () => { leadOut = leadOut === k ? null : k; renderLeadDrawer(); const w = document.getElementById("ld-due"); if (w && !leadDue) w.focus() } }, nIc(ic), t))),
      when, note,
      el("button", { class: "btn primary big", onclick: save }, partnerMode ? "Save and show the next number" : "Save"),
      hist.length ? [el("span", { class: "lbl" }, "History"), el("div", { class: "ld-hist" }, hist.slice(0, 30).map(h => el("div", {}, el("b", {}, h.by === me ? "You" : h.name || "Someone"), ` · ${LEAD_NAME[h.s] || "Updated"} · ${ago(h.at)}`, h.note ? [el("br"), el("span", { dir: "auto" }, h.note)] : null)))] : null,
      !partnerMode ? el("div", { class: "row" }, el("span", { class: "ph-sub" }, `Added ${l.createdAt ? ago(l.createdAt) : ""}${l.foundBy ? " · found by the partner" : ""}`), el("span", { class: "spacer" }),
        leadDel ? [el("button", { class: "btn quiet small", onclick: () => { leadDel = false; renderLeadDrawer() } }, "Cancel"), el("button", { class: "btn small danger-btn", onclick: () => { leadOpen = null; write(() => deleteDoc(doc(db, "pleads", l.id)), "Number deleted") } }, "Yes, delete")]
          : el("button", { class: "btn quiet small", onclick: () => { leadDel = true; renderLeadDrawer() } }, "Delete number")) : null));
  if (actId) { const n = document.getElementById(actId); if (n) n.focus() }
}

/* ---------- partner home: who to call next, earnings, then their numbers ---------- */
let pnFilter = null;
function renderPartnerHome(box) {
  const nm = fName(partnerName()), now = Date.now(), mine = l => l.to === (pMe && pMe.id) || l.claimBy === me || l.foundBy === me;
  const hasMine = pLeads.some(mine), pool = pLeads.filter(l => mine(l) || (!l.to && !l.claimBy));
  const late = pool.filter(isLate), meets = pool.filter(l => l.status === "meeting"), toCall = pool.filter(l => TO_CALL.includes(l.status || "new"));
  box.append(el("div", { class: "ph-hi" }, el("span", { class: "ph-sub" }, new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })), el("h1", { class: "ph-h1" }, "Hi " + nm)),
    el("div", { class: "ph-today" }, el("div", {}, el("b", {}, toCall.length), el("span", {}, "To call")), el("div", {}, el("b", {}, late.length), el("span", {}, "Call-backs now")), el("div", {}, el("b", {}, meets.length), el("span", {}, "Meetings"))));
  const next = nextLead(null);
  if (next) {
    const why = isLate(next) ? (next.status === "meeting" ? "meeting was due " : "call-back due ") + leadDueText(leadDueOf(next)).toLowerCase() : next.status === "new" ? "new number" : LEAD_NAME[next.status].toLowerCase();
    const tel = "tel:" + String(next.phone || "").replace(/[^\d+]/g, "");
    box.append(el("div", { class: "ph-next" }, el("span", { class: "k" }, nIc("clock"), "Call next · " + why), el("span", { class: "nm", dir: "auto" }, leadTitle(next)),
      el("span", { class: "m" }, [next.name && next.biz ? next.name : "", next.city, next.phone].filter(Boolean).join(" · ")),
      next.note ? el("span", { class: "note", dir: "auto" }, "Last time: " + next.note) : null,
      el("div", { class: "two" }, el("a", { class: "btn primary big", href: tel, onclick: () => openLead(next.id) }, nIc("phone"), "Call"),
        el("button", { class: "btn big", onclick: () => openLead(next.id) }, "Open")))); 
  } else box.append(el("div", { class: "ph-card" }, el("h3", {}, pLeads.length ? "All called" : "No numbers yet"), el("p", { class: "ph-sub", style: "margin:0" }, pLeads.length ? "Nobody is waiting for a call right now. Nice work." : "The team will add numbers for you to call soon.")));
  box.append(earningsCard(), el("button", { class: "btn big ph-found", onclick: phSheetFound }, nIc("plus"), "Add a business I found"));
  // the list
  const F = [["mine", "Mine", mine], ["call", "To call", l => TO_CALL.includes(l.status || "new")], ["hot", "Interested", l => l.status === "interested"], ["meet", "Meetings", l => l.status === "meeting"], ["won", "Clients", l => l.status === "won"], ["lost", "Not interested", l => l.status === "lost"], ["all", "All", () => true]].filter(([k]) => k !== "mine" || hasMine);
  const cur = F.find(f => f[0] === pnFilter) || F[0], q = pQuery.p || "";
  const shown = pLeads.filter(cur[2]).filter(l => leadMatch(l, q)).sort(leadOrder);
  const qi = el("input", { class: "noteinput", id: "plq-p", type: "search", placeholder: "Search name, business or number", autocomplete: "off" });
  let t = 0; qi.addEventListener("input", () => { pQuery.p = qi.value; clearTimeout(t); t = setTimeout(render, 120) });
  box.append(el("h2", { class: "sec-h" }, "My numbers"),
    el("div", { class: "ph-chips" }, F.map(([k, label, f]) => el("button", { class: "ph-chip", "aria-pressed": String(cur[0] === k), onclick: () => { pnFilter = k; render() } }, `${label} ${pLeads.filter(f).length}`))),
    pLeads.length > 8 ? el("div", { style: "margin-top:10px" }, qi) : null,
    shown.length ? el("div", { class: "ph-rows", style: "margin-top:10px" }, shown.slice(0, phMore.p ? 2000 : 150).map(phRow)) : el("div", { class: "empty" }, pLeads.length ? "Nothing here." : "No numbers yet."),
    shown.length > 150 && !phMore.p ? el("button", { class: "more", onclick: () => { phMore.p = true; render() } }, `Show ${shown.length - 150} more`) : null);
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
    if (f.size > MAX_FILE && !f.type.startsWith("image/")) { toast(`${f.name} is too big. The limit is 10 MB per file.`); return }
    const label = (labelInput && labelInput.value.trim()) || f.name.replace(/\.[^.]+$/, "");
    try {
      toast("Uploading " + f.name + "…");
      const prepared = await prepareFile(f);
      const file = await uploadFile(prepared, null, { gid });
      delete file.thumb;
      await updateDoc(doc(db, "pgroups", gid), { ["links." + uid()]: { label, file, at: Date.now() } });
      if (labelInput) labelInput.value = "";
      toast("File added for the group");
    } catch (e) { toast(e && e.message === "too big" ? `${f.name} is too big. The limit is 10 MB per file.` : "That file didn't upload. Check your connection and try again.") }
  };
  document.body.append(inp); inp.click();
}

/* ---------- partner side: chat with the group and private messages with the team ---------- */
function pWatchDm(tid) {
  if (tid === pDmFor) return;
  if (pDmStop) { pDmStop(); pDmStop = null }
  pDmFor = tid; if (!tid) return;
  pDmStop = onSnapshot(query(collection(db, "dms", tid, "msgs"), orderBy("at"), limitToLast(300)), q => { pDmMsgs[tid] = q.docs.map(d => ({ id: d.id, ...d.data() })); renderSoon() }, () => { pDmOff = true; renderSoon() });
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
      threads.length ? el("span", { class: "chipsep" }, "Ardent Creative Studios") : null,
      threads.map(x => { const u = other(x), n = x.lastBy && x.lastBy !== me && (x.lastAt || 0) > ((x.seen || {})[me] || 0) && dmWith !== u;
        return el("button", { class: "pchip", "aria-pressed": String(dmWith === u), onclick: () => { location.hash = "pdm-" + u } }, postAv((x.photos || {})[u]), ((x.names || {})[u] || "Team").split(" ")[0], n ? el("span", { class: "count" }, "1") : null) })));
  if (!dmWith) {
    box.append(el("div", { class: "chat-who" }, el("span", { class: "teamdot big" }, "#"), el("span", { class: "who-n" }, el("b", {}, pGroup.name + " group"), el("span", { class: "label" }, "You, the other partners here and the Ardent Creative Studios team"))),
      chatView(groupChatItems(pGid, p => p.by === me), { onDelete: m => write(() => deleteDoc(doc(db, "pposts", m.id)), "Message deleted"), empty: "No messages yet. Tell the team how it's going: calls today, good leads, questions." }),
      chatComposer("p-msg", "Message the team and your group", txt => write(() => setDoc(doc(db, "pposts", uid()), { gid: pGid, by: me, name: partnerName(), photo: (myProfile && myProfile.photo) || "", team: false, text: txt, at: Date.now() }))),
      ...(threads.length ? [] : [el("p", { class: "label", style: "margin:10px 2px 0;text-transform:none;letter-spacing:0" }, "When someone from the team messages you privately, it shows up here too.")]));
    return;
  }
  if (!t) { box.append(el("div", { class: "empty" }, pDmOff ? "Private messages aren't switched on yet. Ask the team to update the database rules." : "Loading…")); return }
  const nm = (t.names || {})[dmWith] || "Ardent Creative Studios";
  box.append(el("div", { class: "chat-who" }, postAv((t.photos || {})[dmWith]), el("span", { class: "who-n" }, el("b", {}, nm), el("span", { class: "rolebadge" }, "Ardent Creative Studios")), el("span", { class: "who-lock" }, "\u{1F512} only you two see this")));
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
  if (!e || !(e.earned || e.paid)) return el("div", { class: "ph-card" }, el("h3", {}, "Your earnings"),
    el("p", { class: "label", style: "margin:0;text-transform:none;letter-spacing:0" }, "When a client you brought pays, your commission shows here."));
  const owed = Math.max(0, e.earned - e.paid);
  return el("section", { class: "ph-card" }, el("h3", {}, "Your earnings"),
    el("div", { class: "ph-earn" }, el("div", {}, el("b", {}, fmtEGP(e.earned)), el("span", {}, "Earned")), el("div", {}, el("b", {}, fmtEGP(e.paid)), el("span", {}, "Paid to you")), el("div", {}, el("b", {}, fmtEGP(owed)), el("span", {}, "On the way"))),
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
  }, "Project made. Set the price and the shares in its Money tab").then(ok => { if (ok) { projTab = "money"; pendingTab = "money"; location.hash = "project-" + id } });
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
