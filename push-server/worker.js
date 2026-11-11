// Pitch Room push server (a free Cloudflare Worker).
// It sends alerts to phones and laptops even when the site is closed.
//
// The copy in the repo has no keys. The copy pasted into Cloudflare has the
// VAPID key filled in below. Never commit that copy: the private key ("d")
// lets whoever holds it send alerts to the team.
const VAPID = null; // { kty, crv, x, y, d } — filled in only in the Cloudflare copy
const CONTACT = "mailto:mohammedd.alajmiii@gmail.com";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/the-office-ab723/databases/(default)/documents";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (!VAPID) return json({ error: "This server has no key yet" }, 500);
    const url = new URL(req.url);
    // The site asks for the public key before a device subscribes.
    if (req.method === "GET") return json({ ok: true, key: publicKey() });
    if (req.method !== "POST" || url.pathname !== "/send") return json({ error: "Not found" }, 404);

    // Who is asking: their Firebase sign-in token. Firestore checks it against the
    // site's security rules, so only the team can read the devices to alert.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);
    let body; try { body = await req.json() } catch { return json({ error: "Bad request" }, 400) }
    const msgs = Array.isArray(body.msgs) ? body.msgs.slice(0, 40) : [];
    if (!msgs.length) return json({ sent: 0 });

    const devices = {};
    const results = [];
    for (const m of msgs) {
      const to = String(m.to || "");
      if (!/^[A-Za-z0-9]{10,64}$/.test(to)) continue;
      if (!(to in devices)) {
        const r = await fetch(`${FIRESTORE}/users/${to}?mask.fieldPaths=pushSubs`, { headers: { Authorization: "Bearer " + token } });
        if (r.status === 401 || r.status === 403) return json({ error: "Not allowed" }, 403);
        devices[to] = r.ok ? subsFrom(await r.json()) : [];
      }
      const payload = JSON.stringify({
        title: String(m.title || "Pitch Room").slice(0, 80),
        body: String(m.body || "").slice(0, 300),
        tag: String(m.tag || "").slice(0, 120),
        go: String(m.go || "me").slice(0, 80),
        icon: /^https:\/\/[^\s"]{1,400}$/.test(m.icon || "") ? m.icon : "",
        force: !!m.force,
      });
      for (const s of devices[to]) {
        try { const st = await sendPush(s, payload); results.push({ to, status: st }) }
        catch (e) { results.push({ to, status: 0, error: String(e && e.message || e) }) }
      }
    }
    return json({ sent: results.filter(r => r.status >= 200 && r.status < 300).length, results });
  },
};

// users/{uid}.pushSubs is a map of device id -> JSON text of the browser's push subscription
function subsFrom(docJson) {
  const f = (((docJson.fields || {}).pushSubs || {}).mapValue || {}).fields || {};
  const out = [];
  for (const v of Object.values(f)) {
    try {
      const s = JSON.parse(v.stringValue || "");
      if (s && typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.keys && s.keys.p256dh && s.keys.auth) out.push(s);
    } catch { }
  }
  return out;
}

/* ---------- Web Push (RFC 8291 encryption + RFC 8292 VAPID) ---------- */

const enc = new TextEncoder();
const b64u = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
const unb64u = str => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)) };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length } return out };
const publicKey = () => b64u(concat(new Uint8Array([4]), unb64u(VAPID.x), unb64u(VAPID.y)));

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

async function vapidHeader(endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const key = await crypto.subtle.importKey("jwk", { ...VAPID, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + claims));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${publicKey()}`;
}

async function encryptPayload(sub, text) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(text), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length; header.set(asPublic, 21);
  return concat(header, cipher);
}

async function sendPush(sub, text) {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: await encryptPayload(sub, text),
  });
  return r.status;
}
