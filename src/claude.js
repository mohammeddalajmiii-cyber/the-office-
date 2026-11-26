/* ----- Claude: each team member can add Pitch Room to their own Claude (Settings › Claude) -----
   The connector (claude-server/worker.js, a free Cloudflare Worker) lets Claude read your projects and tasks and
   make the changes you ask for, as you: the database rules decide what you may change, like on the site.
   Its address is saved by the admin in meta/team.claudeUrl. Only the admin can change meta/team, so nobody can
   swap in another server and collect sign-ins.
   Connecting: in Claude you add the connector and click Connect. Claude opens this site at ?claude=… and you tap
   Allow. That switches Claude on in users/{uid}.claude and hands the connector your sign-in, then you go back to
   Claude. Disconnect removes users/{uid}.claude, which stops the connector for you at once. */

var claudeReq = (() => {
  try {
    const q = new URLSearchParams(location.search).get("claude");
    if (q) { sessionStorage.setItem("claudeReq", q); history.replaceState(null, "", location.pathname + "#settings-claude") }
    return sessionStorage.getItem("claudeReq") || "";
  } catch { return "" }
})();
var claudeBusy = false, claudeSrvState = "", claudeCodeBusy = false;
const claudeBase = () => String((teamDoc && teamDoc.claudeUrl) || "").replace(/\/+$/, "");
const claudeMcp = () => claudeBase() + "/mcp";
const claudeOn = () => !!(((people[me] || {}).claude || {}).v);

async function claudeServerCheck() {
  const base = claudeBase();
  if (!base) { claudeSrvState = "none"; return }
  claudeSrvState = "checking";
  try { const j = await (await fetch(base + "/health", { cache: "no-store" })).json(); claudeSrvState = j.app !== "pitch-room-claude" ? "wrong" : j.ready ? "ok" : "nokey" }
  catch { claudeSrvState = "down" }
  render();
}
function claudeForget() { claudeReq = ""; try { sessionStorage.removeItem("claudeReq") } catch { } }

// "Allow": switch Claude on for your account, give the connector your sign-in, then go back to Claude
async function claudeAllow() {
  const base = claudeBase();
  if (!base || !claudeReq || claudeBusy) return;
  claudeBusy = true; render();
  try {
    await fbReady;
    const user = auth && auth.currentUser, refresh = user && user.refreshToken;
    if (!refresh) throw new Error("Sign in to Pitch Room first, then tap Allow again");
    const old = (people[me] || {}).claude || {};
    await setDoc(doc(db, "users", me), { claude: { v: old.v || Date.now(), at: Date.now(), admin: !!isAdmin } }, { merge: true });
    const r = await fetch(base + "/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ req: claudeReq, refresh }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.go) throw new Error(j.error || "The connector didn't answer. Try again in a minute");
    claudeForget();
    toast("Connected. Taking you back to Claude…", 4000);
    location.href = j.go;
  } catch (e) {
    toast(String((e && e.message) || e), 6000);
  } finally { claudeBusy = false; render() }
}
function claudeCancel() { claudeForget(); toast("Cancelled. Nothing was connected"); render() }
function claudeDisconnect() {
  write(() => setDoc(doc(db, "users", me), { claude: DEL() }, { merge: true }), "Claude is disconnected. You can also remove Pitch Room in Claude's Connectors");
}
const claudeTeamMessage = () => `Pitch Room now works with Claude. You can ask Claude to add tasks, check what's due or mark things done, right from the Claude app.\n\nSet it up once (2 minutes): open Pitch Room › Settings › Claude and follow the 4 steps.\n${location.origin + location.pathname}#settings-claude`;

async function claudeWorkerCode() {
  const src = await (await fetch("claude-server/worker.js?v=" + Date.now(), { cache: "no-store" })).text();
  if (!src.includes("const SECRET = null;")) throw new Error("bad code");
  let key = ""; try { key = localStorage.getItem("claudeSecret") || "" } catch { }
  if (!key) {
    const b = crypto.getRandomValues(new Uint8Array(32)); key = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem("claudeSecret", key) } catch { }
  }
  return src.replace("const SECRET = null;", `const SECRET = "${key}";`);
}

function claudeSettings() {
  const base = claudeBase(), on = claudeOn(), box = el("div", { style: "display:grid;gap:12px" });
  if (base && !claudeSrvState) setTimeout(claudeServerCheck, 0);
  const card = (...kids) => el("section", { class: "idea" }, ...kids.filter(Boolean));
  const plain = "margin:0;text-transform:none;letter-spacing:0";

  // Claude sent you here to connect
  if (claudeReq) {
    box.append(card(
      el("div", { class: "row" }, el("h3", {}, "Connect Claude to your account?")),
      el("p", { class: "lede", style: "margin:0" }, "Claude will use Pitch Room as you. It sees the projects and tasks you see, and makes the changes you ask for, like adding tasks or marking them done. It can't see money."),
      el("p", { class: "label", style: plain }, "Only tap Allow if you just pressed Connect in your own Claude. Never for a link someone sent you."),
      !base ? el("p", { class: "label", style: plain }, isAdmin ? "Set up the connector first (below), then press Connect in Claude again." : `The connector isn't set up yet. Ask ${ADMIN_NAME}.`) : null,
      el("div", { class: "row", style: "gap:8px" },
        el("button", { class: "btn primary", disabled: claudeBusy || !base, onclick: claudeAllow }, claudeBusy ? "Connecting…" : "Allow"),
        el("button", { class: "btn quiet", disabled: claudeBusy, onclick: claudeCancel }, "Cancel"))));
  }

  // where you stand
  box.append(card(
    el("div", { class: "row" }, el("h3", {}, "Claude"), el("span", { class: "spacer" }), el("span", { class: "mstat " + (on ? "paid" : "due") }, on ? "✓ Connected" : "Not connected")),
    el("p", { class: "lede", style: "margin:0" }, "Ask Claude to do things in Pitch Room for you, from the Claude app on your phone or computer. For example: “What's due this week?”, “Add 3 tasks to the website project for Omar” or “Mark the logo task done”."),
    on ? el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: plain + ";flex:1 1 200px" }, `Connected ${fmtDay(((people[me] || {}).claude || {}).at || Date.now())}. Claude asks you before it deletes or posts anything.`),
      el("button", { class: "btn quiet small", onclick: claudeDisconnect }, "Disconnect")) : null));

  // how to connect your own Claude
  if (base && claudeSrvState !== "none") {
    box.append(el("details", { class: "setdetails", open: !on }, el("summary", {}, el("b", {}, "How to connect"), el("span", { class: "label" }, "Once, about 2 minutes")),
      el("ol", { class: "setsteps" },
        el("li", {}, el("b", {}, "Open Claude's connectors"), el("span", {}, "Best on a computer. In Claude: Settings › Connectors › Add custom connector."),
          el("a", { class: "btn small", href: "https://claude.ai/settings/connectors", target: "_blank", rel: "noopener noreferrer" }, "Open Claude")),
        el("li", {}, el("b", {}, "Fill it in"), el("span", {}, "Name: Pitch Room. Server address:"), copyBox(claudeMcp(), "Address copied. Paste it in Claude"), el("span", {}, "Then click Add.")),
        el("li", {}, el("b", {}, "Click Connect"), el("span", {}, "Pitch Room opens. Check it's your account and tap Allow. You go back to Claude by yourself.")),
        el("li", {}, el("b", {}, "Try it"), el("span", {}, "In a new Claude chat: “What are my open tasks in Pitch Room?” It works in the Claude phone app too."))),
      el("p", { class: "label", style: plain }, "On Claude's free plan you can add one custom connector, so Pitch Room uses that one. Pro has no limit.")));
  } else if (!isAdmin) box.append(el("p", { class: "label", style: plain }, `Not set up yet. ${ADMIN_NAME} sets it up once for everyone.`));

  if (base && (isAdmin || on)) box.append(el("div", { class: "row", style: "gap:8px" }, el("span", { class: "label", style: plain + ";flex:1 1 200px" }, "Tell the team:"),
    el("button", { class: "btn small", onclick: () => copyText(claudeTeamMessage(), "Message copied. Paste it in WhatsApp or the team chat") }, "Copy setup message")));

  // the one-time server setup (admin only)
  if (isAdmin) {
    const srv = claudeSrvState;
    const inp = el("input", { class: "noteinput", style: "flex:1 1 240px", placeholder: "https://pitch-room-claude.yourname.workers.dev", "aria-label": "Connector address", value: base });
    const save = async () => {
      let v = inp.value.trim().replace(/\/+$/, "").replace(/\/mcp$/, ""); if (v && !/^https?:\/\//.test(v)) v = "https://" + v;
      if (v && !/^https:\/\/[^\s/]+$/.test(v)) { toast("That should look like https://pitch-room-claude.yourname.workers.dev"); return }
      if (v) {
        try { const j = await (await fetch(v + "/health", { cache: "no-store" })).json(); if (j.app !== "pitch-room-claude") { toast("That address answered, but it isn't the Claude connector", 5000); return } if (!j.ready) { toast("The connector has no secret key. Copy the code from step 3 again, paste it and Deploy", 6000); return } }
        catch { toast("Couldn't reach a connector at that address. Check it was deployed, and copy the address exactly", 5000); return }
      }
      await write(() => setDoc(doc(db, "meta", "team"), { claudeUrl: v, updatedAt: Date.now(), updatedBy: me }, { merge: true }), v ? "Connector saved. Now connect your own Claude above" : "Connector removed");
      claudeSrvState = ""; render();
    };
    const getCode = async () => { if (claudeCodeBusy) return; claudeCodeBusy = true; render();
      try { await copyText(await claudeWorkerCode(), "Connector code copied. Paste it in Cloudflare (step 4)") }
      catch { toast("Couldn't make the code. Check your internet and try again", 4500) } finally { claudeCodeBusy = false; render() } };
    const dl = async () => { try { const code = await claudeWorkerCode(); const a = el("a", { href: URL.createObjectURL(new Blob([code], { type: "text/javascript" })), download: "pitch-room-claude-worker.js" }); document.body.append(a); a.click(); a.remove() } catch { toast("Couldn't make the file") } };
    box.append(el("details", { class: "setdetails", open: !base || srv === "nokey" || srv === "wrong" }, el("summary", {}, el("b", {}, "Set up the connector"), el("span", { class: "label" }, srv === "ok" ? "Working ✓ · only you see this" : srv === "down" ? "Not answering · only you see this" : "Once, for the whole team · only you see this")),
      el("ol", { class: "setsteps" },
        el("li", {}, el("b", {}, "Open Cloudflare"), el("span", {}, "The same free account as the alert server."), el("a", { class: "btn small", href: "https://dash.cloudflare.com", target: "_blank", rel: "noopener noreferrer" }, "Open Cloudflare")),
        el("li", {}, el("b", {}, "Create a Worker"), el("span", {}, "Workers & Pages › Create › Create Worker (Start with Hello World). Name it:"), copyBox("pitch-room-claude", "Name copied"), el("span", {}, "Then click Deploy.")),
        el("li", {}, el("b", {}, "Copy the connector code"), el("span", {}, "It comes with your own secret key filled in. Don't share it or put it on GitHub."),
          el("div", { class: "row", style: "gap:6px" }, el("button", { class: "btn small primary", disabled: claudeCodeBusy, onclick: getCode }, claudeCodeBusy ? "Making it…" : "Copy connector code"), el("button", { class: "btn small quiet", onclick: dl }, "Download it instead"))),
        el("li", {}, el("b", {}, "Paste it into the Worker"), el("span", {}, "Click Edit code, select everything and delete it, paste, then click Deploy.")),
        el("li", {}, el("b", {}, "Paste the Worker's address here"), el("span", {}, "It's on the Worker's page, like https://pitch-room-claude.yourname.workers.dev"),
          el("div", { class: "row", style: "gap:8px" }, inp, el("button", { class: "btn small primary", onclick: save }, "Save and test"))),
        el("li", {}, el("b", {}, "Connect your own Claude, then tell the team"), el("span", {}, "Follow How to connect above, then send the setup message."))),
      el("p", { class: "label", style: plain }, "Copying the code again on this device gives the same key. On another device you get a new key: paste it and Deploy, and everyone connects again in Claude.")));
  }
  return box;
}
