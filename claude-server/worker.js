// Pitch Room connector for Claude (a free Cloudflare Worker).
//
// Each team member adds this server to their own Claude (Settings › Connectors › Add custom connector) and signs in
// with their Pitch Room account. Claude can then read their projects and tasks and make the changes they ask for,
// as them: Firestore's security rules decide what each person may change, exactly like on the site. Money is never
// read here.
//
// How signing in works (OAuth 2.1 with PKCE, no database needed):
//   1. Claude registers and sends the person to /authorize.
//   2. /authorize sends them to Pitch Room's "Connect Claude" page (Settings › Claude), where they tap Allow.
//   3. The site switches Claude on in users/{uid}.claude and hands this server the person's Firebase sign-in.
//   4. This server gives Claude a code, then tokens. Everything it needs is sealed inside the tokens with SECRET,
//      so nothing is stored here. Disconnecting on the site (or removing someone from the team) stops it at once.
//
// The copy in the repo has no secret. The copy pasted into Cloudflare has SECRET filled in (the site's
// "Copy server code" button does that). Never commit that copy: whoever holds the secret could forge sign-ins.
// You can also leave SECRET as null and add a Secret named SECRET in the Worker's Settings › Variables and Secrets.
const SECRET = null;
const SITE = "https://mohammeddalajmiii-cyber.github.io/the-office-/";
const API_KEY = "AIzaSyCkf1FDjKWwsliO-bUEptyy82FTDSlQRFU";   // the site's public Firebase web key (firebase-config.js)
const FS = "https://firestore.googleapis.com/v1/projects/the-office-ab723/databases/(default)/documents";
const VERSION = "1.0";
const TZ = "Africa/Cairo";
// Only Claude may connect: tokens are only ever sent back to these sites.
const CLAUDE_HOSTS = ["claude.ai", "claude.com", "anthropic.com"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = url.origin, path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const secret = (env && env.SECRET) || SECRET;
    if (path === "/" || path === "/health") return json({ ok: true, app: "pitch-room-claude", version: VERSION, ready: !!secret, mcp: origin + "/mcp" });
    if (!secret) return json({ error: "This server has no secret key yet" }, 500);
    try {
      const K = await keyFor(secret);
      if (path.startsWith("/.well-known/oauth-protected-resource")) return json({ resource: origin + "/mcp", authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Pitch Room" });
      if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) return json(authMeta(origin));
      if (path === "/register" && req.method === "POST") return await register(req, K);
      if (path === "/authorize") return await authorize(url, K);
      if (path === "/approve" && req.method === "POST") return await approve(req, K);
      if (path === "/token" && req.method === "POST") return await token(req, K);
      if (path === "/mcp") return await mcp(req, K, origin);
    } catch (e) {
      return json({ error: "server_error", error_description: String((e && e.message) || e).slice(0, 300) }, 500);
    }
    return json({ error: "Not found" }, 404);
  },
};

/* ---------- sealing: small encrypted tokens (AES-GCM with a key made from SECRET) ---------- */

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
const unb64u = str => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)) };
async function keyFor(secret) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("pitch-room-claude:" + secret));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(K, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, K, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u(out);
}
async function unseal(K, str, type) {
  try {
    const b = unb64u(String(str || "")); if (b.length < 29) return null;
    const o = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, K, b.slice(12))));
    if (!o || (type && o.t !== type) || (o.exp && o.exp < Date.now())) return null;
    return o;
  } catch { return null }
}

/* ---------- OAuth ---------- */

function authMeta(origin) {
  return {
    issuer: origin,
    authorization_endpoint: origin + "/authorize",
    token_endpoint: origin + "/token",
    registration_endpoint: origin + "/register",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["pitchroom"],
    client_id_metadata_document_supported: true,
  };
}
const onHost = (h, list) => list.some(d => h === d || h.endsWith("." + d));
function okRedirect(u) {
  try { const x = new URL(u); return x.protocol === "https:" && onHost(x.hostname, CLAUDE_HOSTS) } catch { return false }
}
function withParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
// The redirect addresses a client may use: a list, null (any of Claude's own), or false (unknown client).
async function clientRedirects(K, id) {
  id = String(id || "");
  if (id.startsWith("https://")) { try { return onHost(new URL(id).hostname, CLAUDE_HOSTS) ? null : false } catch { return false } }
  if (!id.startsWith("pr_")) return false;
  const c = await unseal(K, id.slice(3), "client");
  return c ? c.r : false;
}
async function register(req, K) {
  let b = {}; try { b = await req.json() } catch { }
  const uris = (Array.isArray(b.redirect_uris) ? b.redirect_uris : []).map(String).slice(0, 10);
  if (!uris.length || !uris.every(okRedirect)) return json({ error: "invalid_redirect_uri", error_description: "Only Claude can connect to Pitch Room" }, 400);
  const name = String(b.client_name || "Claude").slice(0, 60);
  const client_id = "pr_" + await seal(K, { t: "client", r: uris, n: name });
  return json({ client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }, 201);
}
async function authorize(url, K) {
  const q = url.searchParams, client = q.get("client_id") || "", redirect = q.get("redirect_uri") || "", state = q.get("state") || "";
  const allowed = await clientRedirects(K, client);
  if (allowed === false || !okRedirect(redirect) || (allowed && !allowed.includes(redirect)))
    return page("This link isn't from Claude", "Pitch Room only connects to Claude. Start again from Claude: Settings, Connectors, Pitch Room, Connect.", 400);
  const back = (error, error_description) => Response.redirect(withParams(redirect, { error, error_description, state }), 302);
  if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only code is supported");
  const cc = q.get("code_challenge") || "";
  if (!cc || q.get("code_challenge_method") !== "S256") return back("invalid_request", "PKCE with S256 is required");
  const ask = await seal(K, { t: "req", c: client, r: redirect, cc, s: state, exp: Date.now() + 20 * 60e3 });
  return Response.redirect(SITE + "?claude=" + encodeURIComponent(ask) + "#settings-claude", 302);
}
// Called by Pitch Room's Connect Claude page after the person taps Allow.
async function approve(req, K) {
  let b = {}; try { b = await req.json() } catch { }
  const ask = await unseal(K, b.req, "req");
  if (!ask) return json({ error: "This request is too old. Start again from Claude: Settings, Connectors, Pitch Room, Connect." }, 400);
  const fb = await firebaseRefresh(String(b.refresh || ""));
  if (!fb) return json({ error: "Couldn't check your Pitch Room sign-in. Sign out of Pitch Room, sign in again, then try." }, 401);
  const r = await fsGet(fb.idToken, "users/" + fb.uid, ["claude", "name"]);
  if (r.status === 401 || r.status === 403) return json({ error: "Only the Pitch Room team can connect Claude." }, 403);
  const cl = r.data && r.data.claude;
  if (!cl || !cl.v) return json({ error: "Claude isn't switched on for your account yet. Tap Allow again." }, 400);
  const code = await seal(K, { t: "code", rt: fb.refresh, uid: fb.uid, v: cl.v, c: ask.c, r: ask.r, cc: ask.cc, exp: Date.now() + 5 * 60e3 });
  return json({ go: withParams(ask.r, { code, state: ask.s }) });
}
async function token(req, K) {
  const type = req.headers.get("content-type") || "";
  const form = type.includes("json") ? new Map(Object.entries(await req.json().catch(() => ({})))) : new URLSearchParams(await req.text());
  const get = k => String(form.get(k) || "");
  const bad = (error, error_description, status = 400) => json({ error, error_description }, status);
  const grant = get("grant_type");
  let who;
  if (grant === "authorization_code") {
    const c = await unseal(K, get("code"), "code");
    if (!c) return bad("invalid_grant", "The code is old or wrong. Connect again");
    if (get("client_id") && get("client_id") !== c.c) return bad("invalid_grant", "This code belongs to another app");
    if (get("redirect_uri") && get("redirect_uri") !== c.r) return bad("invalid_grant", "Wrong redirect address");
    const verifier = get("code_verifier");
    if (!verifier || b64u(await crypto.subtle.digest("SHA-256", enc.encode(verifier))) !== c.cc) return bad("invalid_grant", "The PKCE check failed");
    who = c;
  } else if (grant === "refresh_token") {
    const r = await unseal(K, get("refresh_token"), "rt");
    if (!r) return bad("invalid_grant", "Connect Pitch Room again");
    if (get("client_id") && r.c && get("client_id") !== r.c) return bad("invalid_grant", "This token belongs to another app");
    const live = await liveUser(r);
    if (live.error && live.error !== "down") return bad("invalid_grant", live.text);
    who = r;
  } else return bad("unsupported_grant_type", "Use authorization_code or refresh_token");
  const base = { rt: who.rt, uid: who.uid, v: who.v, c: who.c };
  return json({
    access_token: await seal(K, { t: "at", ...base, exp: Date.now() + 3600e3 }),
    token_type: "Bearer", expires_in: 3600, scope: "pitchroom",
    refresh_token: await seal(K, { t: "rt", ...base }),
  });
}
function page(title, text, status = 200) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#EEF1F2;color:#2B3135;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif">
<main style="background:#fff;border-radius:16px;padding:28px;max-width:420px;margin:16px"><h1 style="font-size:20px;margin:0 0 8px;color:#0D5E63">${esc(title)}</h1><p style="margin:0">${esc(text)}</p></main></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* ---------- the person's Firebase sign-in ---------- */

async function firebaseRefresh(rt) {
  if (!rt || rt.length < 20) return null;
  const r = await fetch("https://securetoken.googleapis.com/v1/token?key=" + API_KEY, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: SITE },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return j.id_token && j.user_id ? { idToken: j.id_token, uid: j.user_id, refresh: j.refresh_token || rt } : null;
}
// A fresh Firebase sign-in for this person, kept for 50 minutes; and a check on every request that Claude is
// still switched on for them in Pitch Room and that they are still on the team.
const sessions = new Map();
async function liveUser(a) {
  const k = a.uid + ":" + a.v;
  let s = sessions.get(k);
  if (!s || s.exp < Date.now()) {
    const fb = await firebaseRefresh(a.rt);
    if (!fb || fb.uid !== a.uid) { sessions.delete(k); return { error: "signin", text: "Your Pitch Room sign-in ended. Connect Pitch Room again in Claude's Connectors" } }
    s = { id: fb.idToken, exp: Date.now() + 50 * 60e3, me: null }; sessions.set(k, s);
  }
  {
    const r = await fsGet(s.id, "users/" + a.uid, ["claude", "name", "nick", "email"]);
    if (r.status === 401 || r.status === 403) { sessions.delete(k); return { error: "team", text: "Only the Pitch Room team can use this. Ask the admin to add you" } }
    if (!r.data && r.status !== 404) return { error: "down", text: "Pitch Room's database didn't answer. Try again in a minute" };
    const cl = r.data && r.data.claude;
    if (!cl || String(cl.v) !== String(a.v)) { sessions.delete(k); return { error: "off", text: "Claude was disconnected in Pitch Room. Connect again in Claude's Connectors" } }
    s.me = r.data;
  }
  return { id: s.id, uid: a.uid, meDoc: s.me };
}

/* ---------- Firestore (REST), always as the signed-in person ---------- */

function fromV(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromV);
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  return null;
}
const fromFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromV(v)]));
function toV(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toV) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toV(v)])) } };
}
const maskQ = (mask, sep) => mask && mask.length ? sep + mask.map(f => "mask.fieldPaths=" + encodeURIComponent(f)).join("&") : "";
async function fsReq(tok, method, path, body) {
  const r = await fetch(FS + "/" + path, { method, headers: { Authorization: "Bearer " + tok, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch { }
  return { status: r.status, ok: r.ok, data };
}
const nope = r => Object.assign(new Error(r.status === 403 ? "Pitch Room's rules didn't allow that for your account" : r.status === 404 ? "That isn't in Pitch Room any more" : "Pitch Room's database said no: " + ((r.data && r.data.error && r.data.error.message) || r.status)), { status: r.status });
async function fsGet(tok, path, mask) {
  const r = await fsReq(tok, "GET", path + maskQ(mask, "?"));
  return { status: r.status, data: r.ok && r.data ? { id: path.split("/").pop(), ...fromFields(r.data.fields) } : null };
}
async function fsList(tok, col, mask) {
  const out = []; let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const r = await fsReq(tok, "GET", `${col}?pageSize=300${maskQ(mask, "&")}${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`);
    if (!r.ok) { if (r.status === 403 || r.status === 401) throw nope(r); break }
    for (const d of (r.data && r.data.documents) || []) out.push({ id: d.name.split("/").pop(), ...fromFields(d.fields) });
    pageToken = r.data && r.data.nextPageToken; if (!pageToken) break;
  }
  return out;
}
// Field paths: a.b.c, with backticks around parts that aren't plain names (like ids starting with a digit).
const seg = s => /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
const fieldPath = p => p.split(".").map(seg).join(".");
// Like the site's updateDoc: set these dotted paths, delete those, leave everything else as it is.
async function fsUpdate(tok, path, sets = {}, dels = []) {
  const root = {};
  for (const [p, val] of Object.entries(sets)) {
    const parts = p.split("."); let o = root;
    for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] && !o[parts[i]].__leaf) ? o[parts[i]] : (o[parts[i]] = {});
    o[parts[parts.length - 1]] = { __leaf: true, v: val };
  }
  const conv = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x.__leaf ? toV(x.v) : { mapValue: { fields: conv(x) } }]));
  const q = [...Object.keys(sets), ...dels].map(p => "updateMask.fieldPaths=" + encodeURIComponent(fieldPath(p))).join("&");
  const r = await fsReq(tok, "PATCH", `${path}?${q}&currentDocument.exists=true`, { fields: conv(root) });
  if (!r.ok) throw nope(r);
}
async function fsCreate(tok, path, obj) {
  const r = await fsReq(tok, "PATCH", `${path}?currentDocument.exists=false`, { fields: toV(obj).mapValue.fields });
  if (!r.ok) throw nope(r);
}

/* ---------- the board, read the way the site reads it ---------- */

const IDEA_FIELDS = ["title", "status", "author", "planners", "members", "tasks", "steps", "phases", "paused", "pitch", "category", "teamV", "votes", "invites", "joinReqs", "createdAt"];
const OLD_PHASES = [["goal", "Goal"], ["research", "Research"], ["design", "Design"], ["build", "Build"], ["test", "Test"], ["launch", "Launch"]];
const SIZES = { S: { name: "Small", pts: 1, time: "up to 2 hours" }, M: { name: "Medium", pts: 3, time: "up to 1 day" }, L: { name: "Large", pts: 8, time: "1 to 3 days" }, XL: { name: "Extra large", pts: 15, time: "3 days to 1 week" } };
const PLANNERS = "planners";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00:00Z").getTime());
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s };
const userErr = text => Object.assign(new Error(text), { user: true });

// Each read costs from Firestore's free daily allowance, so what's read is kept a little while: the people lists
// for 5 minutes, the projects for 15 seconds (and read again right after you change something).
const boards = new Map();
async function loadBoard(u) {
  const now = Date.now(), c = boards.get(u.uid) || {};
  if (!c.people || c.peopleAt < now - 5 * 60e3) {
    c.people = await Promise.all([
      fsList(u.id, "users", ["name", "nick", "email"]),
      fsList(u.id, "pmembers", ["uid"]).catch(() => []),
      fsList(u.id, "cprojects", ["clients", "partners"]).catch(() => []),
      fsGet(u.id, "meta/nicks").then(r => r.data || {}).catch(() => ({})),
    ]); c.peopleAt = now;
  }
  if (!c.ideas || c.ideasAt < now - 15e3) { c.ideas = await fsList(u.id, "ideas", IDEA_FIELDS); c.ideasAt = now }
  boards.set(u.uid, c);
  const [users, pmembers, cprojects, nicks] = c.people, ideas = c.ideas;
  const outsiders = new Set([...pmembers.map(m => m.id.toLowerCase()), ...cprojects.flatMap(c => [...(c.clients || []), ...(c.partners || [])]).map(e => String(e).toLowerCase())]);
  const partnerUids = new Set(pmembers.map(m => m.uid).filter(Boolean));
  const people = {};
  for (const x of users) people[x.id] = { name: (nicks[x.id] || x.nick || x.name || "").trim(), email: String(x.email || "").toLowerCase() };
  const team = Object.keys(people).filter(id => id === u.uid || (!partnerUids.has(id) && !(people[id].email && outsiders.has(people[id].email)))).filter(id => people[id].name);
  const admin = !!(u.meDoc && u.meDoc.claude && u.meDoc.claude.admin);
  return { me: u.uid, admin, people, team, ideas: ideas.filter(i => i.title) };
}
const nameOf = (B, id) => id === B.me ? (B.people[id] && B.people[id].name ? B.people[id].name + " (you)" : "you") : ((B.people[id] && B.people[id].name) || "someone");
const firstOf = (B, id) => id === B.me ? "you" : (((B.people[id] && B.people[id].name) || "someone").split(" ")[0]);
function tasksOf(p) {
  const out = [];
  for (const field of ["tasks", "steps"]) for (const [id, t] of Object.entries(p[field] || {})) if (t && t.text) out.push({ id, field, ...t, phase: t.phase || "build", path: `${field}.${id}` });
  return out.sort((a, b) => (a.order || 0) - (b.order || 0));
}
function getPhases(p) {
  if (p.phases && Object.keys(p.phases).length) return Object.entries(p.phases).filter(([, v]) => v && v.name).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (tasksOf(p).length) return OLD_PHASES.map((ph, n) => ({ id: ph[0], name: ph[1], order: n + 1, due: null, virtual: true }));
  return [];
}
const isProj = p => p.status === "approved" || p.status === "completed";
const plannerIds = p => [...new Set([p.author, ...Object.entries(p.planners || {}).filter(([, v]) => v).map(([k]) => k)].filter(Boolean))];
const canPlan = (B, p) => B.admin || p.author === B.me || !!(p.planners || {})[B.me];
const assignees = t => [...new Set([t.owner, ...Object.entries(t.helpers || {}).filter(([, v]) => v).map(([k]) => k)].filter(Boolean))];
function projTeam(B, p) {
  const set = new Set(Object.entries(p.members || {}).filter(([, v]) => v).map(([k]) => k));
  for (const k of plannerIds(p)) set.add(k);
  if (!p.teamV) for (const t of tasksOf(p)) assignees(t).forEach(k => set.add(k));
  return [...set].filter(k => !B.people[k] || B.team.includes(k));
}
const inTeam = (B, p) => !isProj(p) || B.admin || projTeam(B, p).includes(B.me);
const canWork = (B, p, t) => inTeam(B, p) && (canPlan(B, p) || assignees(t).includes(B.me));
const inCheck = t => !t.done && !!(t.checker && t.review && t.review.at);
const otherPlanners = (B, p) => plannerIds(p).filter(k => k !== B.me);
const needsSend = (B, p, t) => !!t.checker && t.checker !== B.me && !(t.checker === PLANNERS && canPlan(B, p) && !otherPlanners(B, p).length);
const canCheck = (B, p, t) => inCheck(t) && inTeam(B, p) && (canPlan(B, p) || t.checker === B.me) && (t.review.by !== B.me || t.checker === B.me || !otherPlanners(B, p).length);
const stateOf = (B, p, t) => t.done ? "done" : inCheck(t) ? "finished, waiting for a check" : t.status === "doing" ? "in progress" : "not started";
const projState = p => p.status === "voting" ? "idea in the vote" : p.status === "completed" ? "completed" : p.status === "approved" ? (p.paused ? "paused" : "project") : String(p.status || "idea");

function findProject(B, ref) {
  const raw = String(ref || "").trim().replace(/^p:/i, ""), s = norm(raw);
  if (!s) throw userErr("Say which project (its name or its p: id from get_overview)");
  const live = B.ideas.filter(i => ["approved", "voting", "completed"].includes(i.status));
  const hit = B.ideas.find(i => i.id === raw) || live.find(i => norm(i.title) === s);
  if (hit) return hit;
  const some = live.filter(i => norm(i.title).includes(s) || s.includes(norm(i.title)));
  if (some.length === 1) return some[0];
  if (some.length > 1) throw userErr(`More than one project matches "${raw}": ${some.map(i => `${i.title} [p:${i.id}]`).join(", ")}. Which one?`);
  throw userErr(`No project called "${raw}". Use get_overview to see the projects.`);
}
function findTask(p, ref) {
  const raw = String(ref || "").trim().replace(/^t:/i, ""), s = norm(raw), all = tasksOf(p);
  if (!s) throw userErr("Say which task (its t: id from get_project)");
  const hit = all.find(t => t.id === raw) || all.find(t => norm(t.text) === s);
  if (hit) return hit;
  const some = all.filter(t => norm(t.text).includes(s));
  if (some.length === 1) return some[0];
  if (some.length > 1) throw userErr(`More than one task in ${p.title} matches "${raw}": ${some.slice(0, 8).map(t => `${clip(t.text, 50)} [t:${t.id}]`).join(", ")}. Which one?`);
  throw userErr(`No task like "${raw}" in ${p.title}. Use get_project to see its tasks.`);
}
// a person by name, first name or email; "me" is the person talking to Claude
function findPerson(B, ref, pool) {
  const s = norm(ref);
  if (["me", "myself", "i", "you"].includes(s)) return B.me;
  const ids = (pool || B.team);
  const by = f => ids.filter(id => f(norm((B.people[id] || {}).name), (B.people[id] || {}).email || ""));
  for (const list of [by((n, e) => n === s || e === s), by(n => n.split(" ")[0] === s), by((n, e) => n.startsWith(s) || e.split("@")[0] === s), by(n => n.includes(s))]) if (list.length === 1) return list[0];
  return null;
}

/* ---------- what Claude sees ---------- */

function taskLine(B, p, t, withProject) {
  const who = assignees(t).map(k => firstOf(B, k)).join(", ") || "unassigned";
  const bits = [`[t:${t.id}] ${clip(t.text, 140)}`];
  if (withProject) bits.push(`in ${p.title} [p:${p.id}]`);
  bits.push(who, stateOf(B, p, t));
  if (t.due) bits.push("due " + t.due + (!t.done && t.due < today() ? " (LATE)" : ""));
  if (t.priority === "high" || t.priority === "urgent") bits.push("high priority");
  if (SIZES[t.size]) bits.push(`size ${t.size}`);
  if (t.checker && !t.done) bits.push("checked by " + (t.checker === PLANNERS ? "a planner" : firstOf(B, t.checker)));
  const all = tasksOf(p), waits = Object.entries(t.waitFor || {}).filter(([, v]) => v).map(([k]) => all.find(x => x.id === k)).filter(x => x && !x.done);
  if (waits.length) bits.push("waiting for: " + waits.map(x => clip(x.text, 40)).join(", "));
  const steps = Object.values(t.check || {}).filter(c => c && c.text);
  if (steps.length) bits.push(`checklist ${steps.filter(c => c.done).length}/${steps.length}`);
  return "- " + bits.join(" | ");
}
async function overview(u, B) {
  const L = [], me = B.me;
  L.push(`Signed in as ${nameOf(B, me).replace(" (you)", "")}${B.admin ? " (the admin)" : ""}. Today is ${today()} in Cairo.`);
  const mine = [];
  for (const p of B.ideas) if (p.status === "approved" || p.status === "voting") for (const t of tasksOf(p)) if (!t.done && assignees(t).includes(me)) mine.push([p, t]);
  mine.sort((a, b) => ((b[1].priority === "high") - (a[1].priority === "high")) || String(a[1].due || "9").localeCompare(String(b[1].due || "9")));
  L.push(`\nYour open tasks (${mine.length}):`);
  if (!mine.length) L.push("- none");
  mine.slice(0, 40).forEach(([p, t]) => L.push(taskLine(B, p, t, true)));
  const checks = [];
  for (const p of B.ideas) if (isProj(p)) for (const t of tasksOf(p)) if (canCheck(B, p, t)) checks.push([p, t]);
  if (checks.length) { L.push(`\nWaiting for your check (${checks.length}):`); checks.slice(0, 20).forEach(([p, t]) => L.push(taskLine(B, p, t, true))) }
  const todos = await fsList(u.id, `private/${me}/tasks`, ["text", "done", "due"]).catch(() => []);
  const open = todos.filter(x => x.text && !x.done);
  if (open.length) { L.push(`\nYour private to-dos (${open.length}):`); open.slice(0, 15).forEach(x => L.push(`- ${clip(x.text, 120)}${x.due ? " | due " + x.due : ""}`)) }
  const projects = B.ideas.filter(p => p.status === "approved").sort((a, b) => (a.paused ? 1 : 0) - (b.paused ? 1 : 0));
  L.push(`\nProjects (${projects.length}):`);
  for (const p of projects) {
    const ts = tasksOf(p), done = ts.filter(t => t.done).length, team = projTeam(B, p);
    const role = p.author === me || (p.planners || {})[me] ? "you plan it" : team.includes(me) ? "you're on the team" : B.admin ? "admin" : "you're not on the team";
    L.push(`- [p:${p.id}] ${p.title} | ${projState(p)} | ${role} | ${ts.length - done} open, ${done} done | team: ${team.map(k => firstOf(B, k)).join(", ") || "nobody yet"}`);
  }
  const voting = B.ideas.filter(p => p.status === "voting");
  if (voting.length) {
    L.push(`\nIdeas in the vote (${voting.length}):`);
    for (const p of voting) { const v = Object.values(p.votes || {}); L.push(`- [p:${p.id}] ${p.title} | pitched by ${firstOf(B, p.author)} | ${v.filter(x => x === "keep").length} keep, ${v.filter(x => x === "drop").length} drop${(p.votes || {})[me] ? "" : " | you haven't voted"}`) }
  }
  const done = B.ideas.filter(p => p.status === "completed");
  if (done.length) L.push(`\nCompleted projects: ${done.map(p => `${p.title} [p:${p.id}]`).join(", ")}`);
  L.push(`\nTeam: ${B.team.map(k => nameOf(B, k)).join(", ")}`);
  return L.join("\n");
}
function projectText(B, p) {
  const L = [], ts = tasksOf(p), phases = getPhases(p), team = projTeam(B, p);
  L.push(`[p:${p.id}] ${p.title} | ${projState(p)}${p.category ? " | " + p.category : ""}`);
  if (p.pitch) L.push("About: " + clip(p.pitch, 700));
  L.push(`Team: ${team.map(k => nameOf(B, k)).join(", ") || "nobody yet"}`);
  L.push(`Planners: ${plannerIds(p).map(k => nameOf(B, k)).join(", ") || "none"}`);
  L.push(`You: ${canPlan(B, p) ? "may plan it (add, assign, size, check and delete tasks)" : team.includes(B.me) ? "on the team (add tasks, work on your own tasks)" : "not on the team (you can only add notes)"}`);
  const asks = Object.keys(p.joinReqs || {}).filter(k => p.joinReqs[k]), invites = Object.keys(p.invites || {}).filter(k => p.invites[k]);
  if (asks.length) L.push("Asked to join: " + asks.map(k => firstOf(B, k)).join(", "));
  if (invites.length) L.push("Invited: " + invites.map(k => firstOf(B, k)).join(", "));
  if (p.status === "voting") { const v = Object.values(p.votes || {}); L.push(`Vote: ${v.filter(x => x === "keep").length} keep, ${v.filter(x => x === "drop").length} drop (needs 2 keeps, then the person who pitched it confirms it)`) }
  const done = ts.filter(t => t.done).length;
  L.push(`Tasks: ${ts.length - done} open, ${done} done`);
  const groups = phases.length ? phases.map(ph => [ph, ts.filter(t => t.phase === ph.id)]) : [[{ name: "Tasks" }, ts]];
  const placed = new Set(groups.flatMap(([, l]) => l.map(t => t.id))), loose = ts.filter(t => !placed.has(t.id));
  if (loose.length) groups.push([{ name: "Other" }, loose]);
  for (const [ph, list] of groups) {
    if (!list.length && ph.virtual) continue;
    const open = list.filter(t => !t.done), fin = list.filter(t => t.done);
    L.push(`\nPHASE ${ph.name}${ph.due ? " (finish by " + ph.due + ")" : ""}${ph.paused ? " (paused)" : ""}: ${open.length} open, ${fin.length} done`);
    open.slice(0, 40).forEach(t => {
      L.push(taskLine(B, p, t));
      const notes = Object.values(t.notes || {}).filter(n => n && n.text).sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-2);
      notes.forEach(n => L.push(`    note from ${firstOf(B, n.by)}: ${clip(n.text, 160)}`));
    });
    if (fin.length) L.push(`  done: ${fin.slice(-8).map(t => `${clip(t.text, 50)} [t:${t.id}]`).join("; ")}${fin.length > 8 ? ` and ${fin.length - 8} more` : ""}`);
  }
  return L.join("\n");
}

/* ---------- doing things ---------- */

async function addTasks(u, B, a) {
  const p = findProject(B, a.project);
  if (p.status === "completed") throw userErr(`${p.title} is completed. Reopen it on the site first.`);
  if (!inTeam(B, p)) throw userErr(`You're not on the ${p.title} team, so you can't add tasks there. Ask one of its planners (${plannerIds(p).map(k => firstOf(B, k)).join(", ")}) to add you.`);
  const list = (Array.isArray(a.tasks) ? a.tasks : []).filter(x => x && String(x.text || "").trim()).slice(0, 40);
  if (!list.length) throw userErr("Give at least one task with a text.");
  const team = isProj(p) ? projTeam(B, p) : B.team, planner = canPlan(B, p), now = Date.now(), sets = {}, notes = [], made = [];
  const phases = getPhases(p);
  for (const ph of phases) if (ph.virtual) sets["phases." + ph.id] = { name: ph.name, order: ph.order, due: null };
  let order = Math.max(0, ...phases.map(x => x.order || 0)), i = 0;
  const ids = {};
  for (const ph of phases) ids[norm(ph.name)] = ph.id;
  const phaseFor = name => {
    const nm = clip(name, 40) || (phases[0] ? phases[0].name : "Plan"), k = norm(nm);
    if (!ids[k]) { ids[k] = uid() + (i++); sets["phases." + ids[k]] = { name: nm, order: ++order, due: null }; notes.push(`New phase: ${nm}`) }
    return ids[k];
  };
  for (const x of list) {
    const text = clip(x.text, 200), tid = uid() + (i++);
    let who = null;
    if (x.assignee && !/^(nobody|none|no one|unassigned)$/i.test(String(x.assignee).trim())) {
      who = findPerson(B, x.assignee, team);
      if (!who) notes.push(`${x.assignee} isn't on the ${p.title} team, so "${clip(text, 40)}" has nobody yet`);
    }
    const due = x.due && ymdOk(String(x.due)) ? String(x.due) : null;
    if (x.due && !due) notes.push(`"${x.due}" isn't a date like 2026-12-01, so "${clip(text, 40)}" has no due date`);
    const t = { text, phase: phaseFor(x.phase), skill: null, owner: who, assignedBy: who ? B.me : null, assignedAt: who ? now : null, done: false, order: now + i, due, priority: x.high_priority ? "high" : "medium", checker: PLANNERS };
    const size = String(x.size || "").toUpperCase();
    if (SIZES[size]) { if (planner) Object.assign(t, { size, sizeBy: B.me, sizeAt: now }); else notes.push(`Only a planner sets sizes, so "${clip(text, 40)}" has no size yet`) }
    sets["tasks." + tid] = t;
    made.push(`- [t:${tid}] ${text}${who ? " | " + firstOf(B, who) : ""}${due ? " | due " + due : ""}${t.size ? " | size " + t.size : ""}`);
  }
  await fsUpdate(u.id, "ideas/" + p.id, sets);
  return [`Added ${made.length} ${made.length === 1 ? "task" : "tasks"} to ${p.title}:`, ...made, ...(notes.length ? ["", "Notes:", ...notes.map(n => "- " + n)] : [])].join("\n");
}
async function updateTask(u, B, a) {
  const p = findProject(B, a.project), t = findTask(p, a.task), now = Date.now(), sets = {}, dels = [], did = [];
  const work = canWork(B, p, t), planner = canPlan(B, p);
  const need = (ok, why) => { if (!ok) throw userErr(why) };
  const notMine = `"${clip(t.text, 60)}" isn't your task, and you don't plan ${p.title}. Only its people or a planner can change it.`;
  if (a.text != null && String(a.text).trim()) { need(work, notMine); sets[t.path + ".text"] = clip(a.text, 200); did.push("renamed") }
  if (a.due != null) {
    need(work, notMine);
    const d = String(a.due).trim();
    if (!d || /^(none|no|remove|clear)$/i.test(d)) { sets[t.path + ".due"] = null; did.push("due date removed") }
    else { need(ymdOk(d), `"${d}" isn't a date like 2026-12-01`); sets[t.path + ".due"] = d; did.push("due " + d) }
  }
  if (a.high_priority != null) { need(work, notMine); sets[t.path + ".priority"] = a.high_priority ? "high" : "medium"; did.push(a.high_priority ? "high priority" : "normal priority") }
  if (a.assignee != null) {
    need(planner || !t.owner || t.owner === B.me, `Only a planner of ${p.title} can move someone else's task.`);
    const s = String(a.assignee).trim();
    if (/^(nobody|none|no one|unassigned)$/i.test(s)) { sets[t.path + ".owner"] = null; did.push("now nobody's") }
    else {
      const who = findPerson(B, s, isProj(p) ? projTeam(B, p) : B.team);
      need(who, `${s} isn't on the ${p.title} team. Its team: ${projTeam(B, p).map(k => firstOf(B, k)).join(", ")}.`);
      Object.assign(sets, { [t.path + ".owner"]: who, [t.path + ".assignedBy"]: B.me, [t.path + ".assignedAt"]: now }); did.push("given to " + firstOf(B, who));
    }
  }
  if (a.size != null) {
    const z = String(a.size).toUpperCase();
    need(SIZES[z], "Size is S, M, L or XL. Anything longer than a week should be split into smaller tasks.");
    need(planner, `Only a planner of ${p.title} sets sizes. The team then agrees on the site.`);
    Object.assign(sets, { [t.path + ".size"]: z, [t.path + ".sizeBy"]: B.me, [t.path + ".sizeAt"]: now }); dels.push(t.path + ".sizeVotes");
    did.push(`size ${z} (${SIZES[z].time}); the team is asked to agree`);
  }
  if (a.add_step != null && String(a.add_step).trim()) { need(work, notMine); sets[`${t.path}.check.${uid()}`] = { text: clip(a.add_step, 120), done: false, order: now }; did.push("checklist step added") }
  const st = String(a.status || "").toLowerCase().replace(/[\s-]+/g, "_");
  let noteUsed = false;
  if (st) {
    if (st === "start" || st === "in_progress" || st === "doing") {
      need(work, notMine); need(!t.done, "That task is already done.");
      Object.assign(sets, { [t.path + ".status"]: "doing", [t.path + ".startedBy"]: B.me, [t.path + ".startedAt"]: now }); did.push("started");
    } else if (st === "done" || st === "finished" || st === "complete") {
      need(work, notMine); need(!t.done, "That task is already done.");
      if (inCheck(t)) need(false, "It's already finished and waiting for a check. A planner confirms it with status: confirm.");
      if (needsSend(B, p, t)) { Object.assign(sets, { [t.path + ".review"]: { by: B.me, at: now }, [t.path + ".status"]: "doing" }); dels.push(t.path + ".changes"); did.push(`sent for a check (${t.checker === PLANNERS ? "a planner" : firstOf(B, t.checker)} confirms it, then it counts as done)`) }
      else { Object.assign(sets, { [t.path + ".done"]: true, [t.path + ".doneBy"]: B.me, [t.path + ".doneAt"]: now }); did.push("done") }
    } else if (st === "confirm" || st === "checked" || st === "approve") {
      need(inCheck(t), "That task isn't waiting for a check.");
      need(canCheck(B, p, t), "You can't confirm this one: only its checker or a planner can, and nobody checks their own work.");
      Object.assign(sets, { [t.path + ".done"]: true, [t.path + ".doneBy"]: t.review.by || B.me, [t.path + ".doneAt"]: now, [t.path + ".checked"]: { by: B.me, at: now } }); dels.push(t.path + ".review", t.path + ".changes");
      did.push("checked and done");
    } else if (st === "send_back" || st === "needs_changes") {
      if (inCheck(t) && canCheck(B, p, t)) {
        // like "Needs changes" on the site: back to them with a note saying what to fix
        const why = String(a.note || "").trim();
        need(why, "Say in note what needs to change, so they know what to fix.");
        Object.assign(sets, { [t.path + ".status"]: "doing", [t.path + ".changes"]: { by: B.me, at: now, text: clip(why, 1000) }, [`${t.path}.notes.${uid()}`]: { by: B.me, text: "Needs changes: " + clip(why, 1000), at: now } });
        dels.push(t.path + ".review"); noteUsed = true;
        did.push(`sent back to ${t.review.by ? firstOf(B, t.review.by) : "them"} with your note`);
      } else if (inCheck(t) && t.review.by === B.me) { dels.push(t.path + ".review"); did.push("taken back, in progress again") }
      else if (t.done) {
        need(work, notMine);
        Object.assign(sets, { [t.path + ".done"]: false, [t.path + ".status"]: "doing" }); dels.push(t.path + ".doneBy", t.path + ".doneAt", t.path + ".checked"); did.push("reopened");
      } else throw userErr("That task isn't finished or waiting for a check.");
    } else if (st === "not_started") {
      need(work, notMine);
      if (t.done) { sets[t.path + ".done"] = false; dels.push(t.path + ".doneBy", t.path + ".doneAt", t.path + ".checked") }
      if (t.review) dels.push(t.path + ".review");
      sets[t.path + ".status"] = null; did.push("back to not started");
    } else throw userErr("status is one of: start, done, confirm (a planner checks it), send_back, not_started");
  }
  if (!noteUsed && a.note != null && String(a.note).trim()) { sets[`${t.path}.notes.${uid()}`] = { by: B.me, text: clip(a.note, 1000), at: now }; did.push("note added") }
  if (!Object.keys(sets).length && !dels.length) throw userErr("Nothing to change. Say what to change: text, due, assignee, size, high_priority, status, add_step or note.");
  await fsUpdate(u.id, "ideas/" + p.id, sets, dels);
  return `${clip(t.text, 80)} [t:${t.id}] in ${p.title}: ${did.join(", ")}.`;
}
const confirmFirst = (what, details) => [`Not done yet. ${what}`, ...details, "", "Show this to the person and ask if it's right. Only if they say yes, call this tool again with the same details and confirm: true."].join("\n");
async function deleteTask(u, B, a) {
  const p = findProject(B, a.project), t = findTask(p, a.task);
  if (!(canPlan(B, p) || (t.owner === B.me && inTeam(B, p)))) throw userErr(`Only a planner of ${p.title} or the task's owner can delete it.`);
  if (a.confirm !== true) return confirmFirst(`This deletes a task from ${p.title}:`, [taskLine(B, p, t)]);
  await fsUpdate(u.id, "ideas/" + p.id, {}, [t.path]);
  return `Deleted "${clip(t.text, 80)}" from ${p.title}.`;
}
async function postChat(u, B, a) {
  const p = findProject(B, a.project), text = String(a.text || "").trim();
  if (!text) throw userErr("Say what to post.");
  if (isProj(p) && !inTeam(B, p)) throw userErr(`Only the ${p.title} team can write in its chat.`);
  if (a.confirm !== true) return confirmFirst(`This posts in the ${p.title} chat, in your name, for the whole project team to see:`, [clip(text, 1000)]);
  await fsCreate(u.id, `ideas/${p.id}/chat/${uid()}`, { by: B.me, text: clip(text, 1000), at: Date.now() });
  return `Posted in the ${p.title} chat.`;
}
async function addTodo(u, B, a) {
  const text = clip(a.text, 200); if (!text) throw userErr("Say what the to-do is.");
  const due = a.due && ymdOk(String(a.due)) ? String(a.due) : null;
  await fsCreate(u.id, `private/${B.me}/tasks/${uid()}`, { text, done: false, due, priority: "medium", order: Date.now() });
  return `Added to your private to-dos (only you see them): ${text}${due ? " | due " + due : ""}.`;
}
async function pitchIdea(u, B, a) {
  const title = clip(a.title, 80), pitch = clip(a.pitch, 600);
  if (!title) throw userErr("Give the idea a title.");
  if (a.confirm !== true) return confirmFirst("This pitches a new idea to the whole team's vote, in your name:", [`Title: ${title}`, `Category: ${clip(a.category, 40) || "Other"}`, `Pitch: ${pitch || "(none)"}`]);
  const id = uid(), me = B.me;
  await fsCreate(u.id, "ideas/" + id, { title, category: clip(a.category, 40) || "Other", pitch, status: "voting", author: me, votes: { [me]: "keep" }, createdAt: Date.now(), tasks: {}, backers: {} });
  return `Pitched "${title}" [p:${id}]. It needs one more keep vote, then you confirm it into Projects on the site.`;
}

/* ---------- MCP (Streamable HTTP, plain JSON answers) ---------- */

const INSTRUCTIONS = `Pitch Room is the private back office of a small team (the people behind Ardent Creative Studios): ideas, projects, phases and tasks. You act as the signed-in member, with exactly their permissions.
- Start with get_overview, then get_project for details. Use the ids in brackets (p:..., t:...). Never invent ids, people or dates.
- Dates are YYYY-MM-DD. Task sizes: S up to 2 hours, M up to 1 day, L 1 to 3 days, XL 3 days to 1 week. Split anything longer than a week. Only planners set sizes; the team agrees on the site.
- A finished task goes to a planner's check before it counts as done. Nobody checks their own work.
- Money, payouts and the team fund aren't available here: point people to the Money page on the site.
- Deleting a task, posting in a project chat and pitching an idea need the person's yes first: call without confirm, show them the preview, and only then call again with confirm: true.
- Keep task names short and clear, in the language the person uses.`;
const projectArg = { type: "string", description: "The project's name or its p: id" };
const taskArg = { type: "string", description: "The task's t: id (from get_project) or its exact name" };
const TOOLS = [
  { name: "get_overview", title: "Pitch Room overview", description: "Who you are, your open tasks across all projects, tasks waiting for your check, your private to-dos, every project with its team, and ideas in the vote. Call this first.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "get_project", title: "Open a project", description: "One project in full: about, team, planners, phases and every task with its id, person, state, size, due date, check and latest notes.", inputSchema: { type: "object", properties: { project: projectArg }, required: ["project"] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "add_tasks", title: "Add tasks", description: "Add one or more tasks to a project (a new phase is made when a phase name doesn't exist yet). Assignees must be on the project's team. Each task gets the usual planner check.", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: "object", required: ["project", "tasks"], properties: { project: projectArg, tasks: { type: "array", maxItems: 40, items: { type: "object", required: ["text"], properties: {
      text: { type: "string", description: "Short task name" }, phase: { type: "string", description: "Phase name; leave empty for the first phase" }, assignee: { type: "string", description: "First name of someone on the project's team, or me" },
      due: { type: "string", description: "YYYY-MM-DD" }, size: { type: "string", enum: ["S", "M", "L", "XL"], description: "Only for planners" }, high_priority: { type: "boolean" } } } } } } },
  { name: "update_task", title: "Change a task", description: "Change one task: rename it, set or clear its due date, give it to someone, set its size (planners), switch high priority, add a checklist step or a note, or move it: start, done (sends it for a check), confirm (a planner checks a finished task), send_back (a planner sends a checked task back, with a note saying what to fix; or reopens a done task), not_started.", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: "object", required: ["project", "task"], properties: { project: projectArg, task: taskArg, text: { type: "string", description: "New name" }, due: { type: "string", description: "YYYY-MM-DD, or none to clear it" },
      assignee: { type: "string", description: "First name, me, or nobody" }, size: { type: "string", enum: ["S", "M", "L", "XL"] }, high_priority: { type: "boolean" },
      status: { type: "string", enum: ["start", "done", "confirm", "send_back", "not_started"] }, add_step: { type: "string", description: "A checklist step to add" }, note: { type: "string", description: "A note on the task for the team, in your name" } } } },
  { name: "add_private_todo", title: "Add a private to-do", description: "A to-do only you can see, not part of any project.", inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: "delete_task", title: "Delete a task", description: "Delete a task (planners, or the task's owner). Needs the person's yes: first call without confirm to get a preview.", inputSchema: { type: "object", required: ["project", "task"], properties: { project: projectArg, task: taskArg, confirm: { type: "boolean", description: "true only after the person said yes to the preview" } } }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } },
  { name: "post_in_project_chat", title: "Post in a project chat", description: "Post a message in a project's chat in your name. Needs the person's yes: first call without confirm to get a preview.", inputSchema: { type: "object", required: ["project", "text"], properties: { project: projectArg, text: { type: "string" }, confirm: { type: "boolean", description: "true only after the person said yes to the preview" } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: "pitch_idea", title: "Pitch an idea", description: "Pitch a new idea to the team's vote, in your name. Needs the person's yes: first call without confirm to get a preview.", inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, pitch: { type: "string", description: "A few lines: what it is and why" }, category: { type: "string" }, confirm: { type: "boolean", description: "true only after the person said yes to the preview" } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
];
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
async function runTool(name, args, u) {
  const B = await loadBoard(u);
  if (!["get_overview", "get_project"].includes(name)) { const c = boards.get(u.uid); if (c) c.ideasAt = 0 }   // a change: read fresh next time
  switch (name) {
    case "get_overview": return overview(u, B);
    case "get_project": return projectText(B, findProject(B, args.project));
    case "add_tasks": return addTasks(u, B, args);
    case "update_task": return updateTask(u, B, args);
    case "add_private_todo": return addTodo(u, B, args);
    case "delete_task": return deleteTask(u, B, args);
    case "post_in_project_chat": return postChat(u, B, args);
    case "pitch_idea": return pitchIdea(u, B, args);
  }
  throw userErr("Unknown tool: " + name);
}
async function mcp(req, K, origin) {
  const meta = origin + "/.well-known/oauth-protected-resource/mcp";
  const unauthorized = text => new Response(JSON.stringify({ error: "invalid_token", error_description: text || "Sign in to Pitch Room" }), {
    status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${meta}"${text ? `, error="invalid_token", error_description="${text.replace(/"/g, "'")}"` : ""}`, ...CORS } });
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const at = bearer ? await unseal(K, bearer, "at") : null;
  if (!at) return unauthorized("");
  if (req.method === "GET") return new Response(null, { status: 405, headers: { Allow: "POST, DELETE", ...CORS } });
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, DELETE", ...CORS } });
  let body; try { body = await req.json() } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400) }
  const u = await liveUser(at);
  if (u.error === "signin" || u.error === "off") return unauthorized(u.text);
  const list = Array.isArray(body) ? body : [body], out = [];
  for (const m of list) {
    if (!m || m.id === undefined || m.id === null) continue;   // notifications get no answer
    const reply = result => out.push({ jsonrpc: "2.0", id: m.id, result }), fail = (code, message) => out.push({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    const params = m.params || {};
    if (m.method === "initialize") reply({ protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "pitch-room", title: "Pitch Room", version: VERSION }, instructions: INSTRUCTIONS });
    else if (m.method === "ping") reply({});
    else if (m.method === "tools/list") reply({ tools: TOOLS });
    else if (m.method === "tools/call") {
      if (u.error) { reply({ content: [{ type: "text", text: u.text }], isError: true }); continue }
      try { reply({ content: [{ type: "text", text: await runTool(String(params.name || ""), params.arguments || {}, u) }] }) }
      catch (e) { reply({ content: [{ type: "text", text: (e && e.message) || "Something went wrong" }], isError: true }) }
    }
    else if (m.method === "resources/list") reply({ resources: [] });
    else if (m.method === "prompts/list") reply({ prompts: [] });
    else fail(-32601, "Method not found: " + m.method);
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
}
