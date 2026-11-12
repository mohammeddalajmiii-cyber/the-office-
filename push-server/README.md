# Pitch Room push server

Rings phones and laptops for new alerts even when Pitch Room is closed. It runs free on Cloudflare Workers (free plan: 100,000 requests a day).

## Set up (once)

1. Sign up at dash.cloudflare.com (free).
2. Go to **Workers & Pages → Create → Create Worker**, name it `pitch-room-push`, click **Deploy**.
3. In Pitch Room: **Me → Settings → Alerts → Set up the alert server → Copy server code** (it comes with a fresh key filled in). In Cloudflare click **Edit code**, delete everything, paste, then **Deploy**.
4. Copy the worker's address (like `https://pitch-room-push.yourname.workers.dev`).
5. Back in **Set up the alert server**, paste it in step 5 and click **Save and test**, then **Turn on**.
6. Each teammate opens Settings on each phone and laptop and taps **Turn on**. On iPhone, they first add Pitch Room to the Home Screen and open it from there.

## How it works

- Each device that turns alerts on saves its push address in `users/{uid}.pushSubs`.
- When you do something that shows in a teammate's bell (a task, a reply, a private or team chat message, a new idea, a note...), your browser sends it to this worker with your Firebase sign-in token.
- The worker reads the teammate's devices from Firestore *using your token*, so the site's security rules decide who can send. People not on the team get "not allowed".
- It encrypts the alert and sends it through the browser's push service (Google, Apple or Mozilla). The service worker (`sw.js`) shows it with the device's alert sound.

## Keys

`worker.js` here has `const VAPID = null`. The Cloudflare copy has the key filled in. Don't commit that copy. If the key is ever lost or leaked, make a new one, paste the new worker into Cloudflare, and everyone taps **Turn on** again (the site notices the new key and re-subscribes by itself the next time it opens).
