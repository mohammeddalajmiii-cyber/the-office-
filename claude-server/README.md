# Pitch Room connector for Claude

Lets each team member add Pitch Room to their own Claude. They can then ask Claude things like "what's due this week?", "add 3 tasks to the website project for Omar" or "mark the logo task done". It works in the Claude apps on the web, desktop and phone, on any Claude plan. The free plan allows one custom connector. The connector itself runs free on Cloudflare Workers.

## Set up (once, admin)

1. In Pitch Room: **Settings › Claude › Set up the connector**.
2. In Cloudflare: **Workers & Pages › Create › Create Worker**, name it `pitch-room-claude`, click **Deploy**.
3. Back in Pitch Room, click **Copy connector code**. It comes with a fresh secret key filled in. In Cloudflare, click **Edit code**, delete everything, paste it, then click **Deploy**.
4. Copy the Worker's address (like `https://pitch-room-claude.yourname.workers.dev`), paste it in step 5 in Pitch Room, and click **Save and test**.
5. Connect your own Claude (below), then click **Copy setup message** and send it to the team.

## Connect (each member)

1. In Claude: **Settings › Connectors › Add custom connector**.
2. Name: `Pitch Room`. Server address: the one shown in **Settings › Claude** (it ends in `/mcp`).
3. Click **Connect**. Pitch Room opens. Check it's your account and tap **Allow**.
4. Try it: "What are my open tasks in Pitch Room?"

## What Claude can do

| Tool | What it does |
|---|---|
| `get_overview` | Your open tasks, tasks waiting for your check, private to-dos, projects and ideas in the vote |
| `get_project` | One project in full: team, planners, phases, tasks |
| `add_tasks` | Add tasks (and new phases). Each one gets the usual planner check |
| `update_task` | Rename, due date, assign, size (planners), high priority, checklist step, note, start / done / confirm / send back |
| `add_private_todo` | A to-do only you see |
| `delete_task`, `post_in_project_chat`, `pitch_idea` | These show a preview first and only happen after you say yes |

Claude never sees money: the connector doesn't read money fields at all.

## How it works

- It's a small MCP server with OAuth sign-in. When you tap **Allow**, the site saves `users/{uid}.claude` and gives the connector your Firebase sign-in. The connector seals it inside the tokens it gives Claude, using the secret key, so nothing is stored on Cloudflare.
- Every request reads and writes Firestore **as you**, with your sign-in, so the database rules decide what you can change, exactly like on the site. Partners and clients can't connect.
- Only Claude (claude.ai and claude.com) can receive the tokens. The site only sends your sign-in to the address saved in `meta/team.claudeUrl`, and only the admin can change that.
- **Disconnect** in **Settings › Claude** removes `users/{uid}.claude`, which stops the connector for you at once. Removing someone from the team stops it too.

## Keys

`worker.js` here has `const SECRET = null`. The Cloudflare copy has the secret filled in. Don't commit that copy. Instead of filling it in, you can add a Secret named `SECRET` in the Worker's **Settings › Variables and Secrets**. If the secret is ever lost or leaked, copy the code again on another device to get a new one, paste it and Deploy. Everyone then clicks **Connect** again in Claude.
