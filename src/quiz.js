/* ----- the skills quiz: finds what each person is really good at, and the roles that fit them -----
   Five short parts. What people say they like counts, but what they show counts more:
     1. You             what you enjoy and what gives you energy                  (self-view)
     2. Situations      what you'd actually do in real agency moments              (instinct)
     3. Quick tests     small questions with a best answer, two per skill         (proof)
     4. What you've done  things you've really done, tick all that apply           (proof)
     5. Your hidden talent  in your own words, plus what you want to get better at
   Each skill gets a score from 0 to 1: 20% self-view, 20% instinct, 35% tests, 25% what you've done.
   A hidden skill is one where the proof (tests + done) is clearly higher than what the person said about
   themselves: they're better at it than they think. Roles are mixes of skills (see ROLES). */

const QUIZ_VERSION = 2;

// Part 1: what you enjoy (one pick each). Options are [text, skill].
const QZ_LIKE = [
  { q: "A new client signs with us. Which part would you grab first?", a: [
    ["Building their website", "build"], ["Designing their logo and brand", "design"], ["Shooting and editing their videos", "media"],
    ["Writing their posts and ads", "write"], ["Being the one who talks to them", "people"], ["Planning who does what and when", "organize"], ["Studying their market and competitors", "research"]] },
  { q: "Free afternoon, nothing to do. You'd most likely…", a: [
    ["Mess with code, an app or a new tool", "build"], ["Redesign something that looks bad to you", "design"], ["Film or edit something", "media"],
    ["Write: notes, ideas, a post", "write"], ["Call or meet people", "people"], ["Sort out your plans, your room or your money", "organize"], ["Fall down a rabbit hole learning how something works", "research"]] },
  { q: "Which compliment would make your day?", a: [
    ["“How did you even make that work?”", "build"], ["“That looks so clean”", "design"], ["“That video was fire”", "media"],
    ["“You explained that perfectly”", "write"], ["“The client loved talking to you”", "people"], ["“We'd be lost without you keeping us on track”", "organize"], ["“How did you find that?”", "research"]] },
  { q: "After a long day, which work would still feel fun?", a: [
    ["Fixing a bug until it finally works", "build"], ["Playing with colours and layouts", "design"], ["Cutting a video to music", "media"],
    ["Polishing words until they hit", "write"], ["A good call with a client", "people"], ["Turning a messy list into a clear plan", "organize"], ["Digging through numbers or reviews", "research"]] },
  { q: "Which work drains you the most?", drain: true, a: [
    ["Technical setup and fixing things", "build"], ["Making things look nice", "design"], ["Filming and editing", "media"],
    ["Writing long texts", "write"], ["Talking to strangers", "people"], ["Deadlines, lists and follow-ups", "organize"], ["Reading and comparing a lot", "research"]] },
];

// Part 2: real situations (one pick each). Each option shows how you naturally act.
const QZ_SCENE = [
  { q: "The client's website is live, but sales are low. What do you want to do first?", a: [
    ["Check the site speed and if the buttons and forms work", "build"], ["Look at whether the page looks trustworthy and clear", "design"],
    ["Rewrite the headline and the offer", "write"], ["Call the client and ask what customers say", "people"], ["Look at the numbers: where do visitors leave?", "research"]] },
  { q: "We have 3 days to make a launch post for a client. You take…", a: [
    ["The video", "media"], ["The design", "design"], ["The caption and the hook", "write"], ["The plan: who does what, by when", "organize"], ["Finding what worked for similar brands", "research"]] },
  { q: "A partner abroad brings a lead who wants a price today. You…", a: [
    ["Get on a call and find out what they really need", "people"], ["Put together a clear quote with options", "organize"], ["Research their business so we pitch the right thing", "research"],
    ["Write the message that sells it", "write"], ["Make a quick mockup to impress them", "design"]] },
  { q: "The team is stuck and the deadline is tomorrow. You naturally…", a: [
    ["Split what's left into small tasks and hand them out", "organize"], ["Just start building the hardest part", "build"], ["Talk to everyone and calm things down", "people"],
    ["Find a smarter shortcut someone else used", "research"], ["Fix how it looks so it's at least presentable", "design"]] },
  { q: "Someone says “let's do social media for this client”. What's in your head first?", a: [
    ["The look of the page: colours, grid, style", "design"], ["Ideas for reels and shoots", "media"], ["Captions, tone of voice, the story", "write"],
    ["A posting calendar", "organize"], ["What their competitors post and what gets likes", "research"]] },
  { q: "You have to learn a new tool by Friday. You…", a: [
    ["Open it and break things until you get it", "build"], ["Watch tutorials and take notes", "research"], ["Ask someone who knows to show you", "people"],
    ["Make a step-by-step plan for the week", "organize"], ["Learn just enough to make something that looks good", "design"]] },
];

// Part 3: quick tests with a best answer, two per skill. `ok` is the index of the best answer.
const QZ_TEST = [
  { s: "design", q: "Which text is easiest to read on a phone?", ok: 2, a: ["Light grey text on white", "Everything in capitals, centred", "Dark text on a light background, with space between lines", "Three different fonts so it's lively"] },
  { s: "design", q: "A good logo should still work when it's…", ok: 1, a: ["Big and full of detail", "Tiny and in one colour", "Animated", "Only on a dark background"] },
  { s: "write", q: "Best headline for a dentist's ad?", ok: 3, a: ["Welcome to our clinic", "We are the best dentists in Cairo", "Dental services available now", "Smile without fear: same-day check-ups in Nasr City"] },
  { s: "write", q: "Which message to a client is best?", ok: 0, a: ["“The homepage is ready. Here's the link. Can you reply with OK or changes by Thursday?”", "“Hi, hope you are doing well, just wanted to kindly check in regarding the thing we talked about”", "“Pls check”", "“As per our previous correspondence, kindly find attached the deliverable for your review and approval at your earliest convenience”"] },
  { s: "build", q: "A client says their site looks broken, but only on phones. What do you check first?", ok: 1, a: ["The domain name", "How the layout behaves on small screens", "The hosting bill", "The logo file"] },
  { s: "build", q: "What's the safest way to change a live website?", ok: 2, a: ["Edit it directly and hope", "Wait until the client is asleep", "Make the change on a copy, test it, then publish", "Delete it and rebuild"] },
  { s: "research", q: "1,000 people saw an ad and 20 clicked. What's the click rate?", ok: 1, a: ["20%", "2%", "0.2%", "50%"] },
  { s: "research", q: "A supplier says their product is “certified”. What do you do?", ok: 3, a: ["Trust them, it's in writing", "Ask a friend", "Search for a nice review", "Ask for the certificate number and who issued it, then check it with them"] },
  { s: "organize", q: "Due today: a client call in 1 hour that needs prep, a post due tonight, an invoice due Friday. Order?", ok: 0, a: ["Call prep, then the post, then the invoice", "Invoice, post, call", "Post, invoice, call", "Whatever you feel like first"] },
  { s: "organize", q: "A task keeps slipping week after week. Best fix?", ok: 2, a: ["Remind everyone more often", "Make it a bigger task", "Break it into small steps, each with one owner and a date", "Drop it"] },
  { s: "people", q: "A client is angry the design is late. What do you say first?", ok: 1, a: ["“It's not our fault, you sent the files late”", "“You're right, it's late. You'll have it Thursday, and I'll send a preview today”", "Nothing, wait for them to calm down", "“Don't worry about it”"] },
  { s: "people", q: "On a cold call, the owner says “not interested”. Best reply?", ok: 3, a: ["Hang up", "Push the offer harder", "Offer a big discount right away", "Ask one short question about their business to find a real need"] },
  { s: "media", q: "The first 2 seconds of a reel should…", ok: 0, a: ["Show the most interesting moment, or a hook", "Show the logo", "Be a slow intro so it feels calm", "Be text explaining what's coming"] },
  { s: "media", q: "Filming a product with a phone. Best light?", ok: 2, a: ["The phone flash", "A lamp right above it", "Soft light from a window, facing the product", "As dark as possible for mood"] },
];

// Part 4: what you've really done. Tick all that apply. Two per skill.
const QZ_DONE = [
  ["build", "Built a website or app that real people used"], ["build", "Fixed a tech problem for someone else (site, phone, laptop, setup)"],
  ["design", "Designed a logo, poster or post that someone actually used"], ["design", "People ask you to make things look nice for them"],
  ["media", "Edited a video that got real views"], ["media", "Took photos or videos someone posted or paid for"],
  ["write", "Wrote posts, captions or scripts that did well"], ["write", "Wrote something long: a report, an article, a story"],
  ["people", "Sold something or convinced someone to buy"], ["people", "Spoke in front of a group, or handled an upset customer"],
  ["organize", "Organised a trip, event or group project from start to finish"], ["organize", "Kept a budget or tracked money for a group"],
  ["research", "Found a much better deal or supplier by digging"], ["research", "Ran ads or tracked numbers like views, clicks or sales"],
];

// Roles at Ardent Creative Studios, as mixes of skills. A person can fit several.
const ROLES = [
  { id: "web", name: "Web builder", about: "Builds and fixes client websites so they're fast and work on every phone.", w: { build: .65, design: .15, research: .2 } },
  { id: "brand", name: "Brand designer", about: "Logos, brand identities, company profiles and the look of everything we make.", w: { design: .7, media: .1, write: .1, research: .1 } },
  { id: "content", name: "Content maker", about: "Shoots, edits and posts the videos and photos clients need.", w: { media: .6, design: .2, write: .2 } },
  { id: "copy", name: "Copywriter", about: "Writes what clients' customers read: headlines, posts, ads, profiles.", w: { write: .7, research: .15, people: .15 } },
  { id: "ads", name: "Ads & growth", about: "Runs Google Ads, tests what works and reads the numbers.", w: { research: .45, write: .2, organize: .2, build: .15 } },
  { id: "closer", name: "Client closer", about: "Talks to leads and clients, sends quotes and closes deals.", w: { people: .7, organize: .2, write: .1 } },
  { id: "lead", name: "Project lead", about: "Keeps projects on time and everyone moving, and the client in the loop.", w: { organize: .6, people: .25, research: .15 } },
  { id: "strategist", name: "Researcher", about: "Finds what works: markets, competitors, suppliers, the facts behind decisions.", w: { research: .7, write: .15, organize: .15 } },
];
const ROLE = Object.fromEntries(ROLES.map(r => [r.id, r]));
// The skill as a kind of work, for sentences ("you're better at research than you think")
const SKILL_WORD = { build: "building and tech", design: "design", organize: "organising", write: "writing", people: "working with people", research: "research", media: "video and photo" };

// The steps of the quiz, in order.
function quizSteps() {
  return [
    ...QZ_LIKE.map((x, i) => ({ part: 1, kind: "like", i, ...x })),
    ...QZ_SCENE.map((x, i) => ({ part: 2, kind: "scene", i, ...x })),
    ...QZ_TEST.map((x, i) => ({ part: 3, kind: "test", i, ...x })),
    { part: 4, kind: "done" },
    { part: 5, kind: "talent" },
  ];
}
const QUIZ_PARTS = { 1: ["You", "What you enjoy. No wrong answers."], 2: ["Situations", "What you'd really do. Go with your gut."], 3: ["Quick tests", "These have a best answer. Don't overthink it."], 4: ["What you've done", "Tick everything that's true, even small things."], 5: ["Your hidden talent", "In your own words."] };

// Turns the answers into skill scores, roles and a hidden skill.
// ans = { like: [optionIndex...], scene: [...], test: [...], done: [itemIndex...], talent: "", grow: [] }
function scoreQuiz(ans, skillIds) {
  const zero = () => Object.fromEntries(skillIds.map(s => [s, 0]));
  const like = zero(), likeMax = zero(), scene = zero(), sceneMax = zero(), test = zero(), testMax = zero(), done = zero(), doneMax = zero();
  QZ_LIKE.forEach((x, i) => {
    for (const [, s] of x.a) likeMax[s] += 1;
    const n = (ans.like || [])[i]; if (n == null) return;
    const s = x.a[n][1]; if (x.drain) { for (const [, k] of x.a) if (k !== s) like[k] += 1 / (x.a.length - 1) } else like[s] += 1;
  });
  QZ_SCENE.forEach((x, i) => { for (const [, s] of x.a) sceneMax[s] += 1; const n = (ans.scene || [])[i]; if (n != null) scene[x.a[n][1]] += 1 });
  QZ_TEST.forEach((x, i) => { testMax[x.s] += 1; if ((ans.test || [])[i] === x.ok) test[x.s] += 1 });
  QZ_DONE.forEach(([s], i) => { doneMax[s] += 1; if ((ans.done || []).includes(i)) done[s] += 1 });
  const r2 = x => Math.round(x * 100) / 100;
  const norm = (v, mx) => Object.fromEntries(skillIds.map(s => [s, mx[s] ? r2(Math.min(1, v[s] / Math.max(1, mx[s] * (mx === likeMax || mx === sceneMax ? .45 : 1)))) : 0]));
  const L = norm(like, likeMax), S = norm(scene, sceneMax), T = norm(test, testMax), D = norm(done, doneMax);
  const skills = Object.fromEntries(skillIds.map(s => [s, r2(.2 * L[s] + .2 * S[s] + .35 * T[s] + .25 * D[s])]));
  // hidden skill: the proof (tests + what you've done) is clearly ahead of what you said about yourself
  let hidden = null, best = 0;
  for (const s of skillIds) {
    const proof = (T[s] + D[s]) / 2, self = (L[s] + S[s]) / 2, gap = proof - self;
    if (proof >= .5 && gap >= .25 && gap > best) { best = gap; hidden = s }
  }
  // roles: how well each mix of skills fits
  const fit = ROLES.map(r => ({ id: r.id, score: r2(Object.entries(r.w).reduce((a, [s, w]) => a + w * (skills[s] || 0), 0)) })).sort((a, b) => b.score - a.score);
  const top = fit[0].score, roles = fit.filter((x, i) => i === 0 || (x.score >= top - .08 && x.score >= .35) || x.score >= .6).slice(0, 3).map(x => x.id);
  return { v: QUIZ_VERSION, skills, parts: { like: L, scene: S, test: T, done: D }, fit, roles, main: roles[0], hidden };
}

// Why a role fits, in one plain sentence, from the parts that pushed it up.
function roleWhy(res, roleId) {
  const r = ROLE[roleId]; if (!r) return "";
  const main = Object.entries(r.w).sort((a, b) => b[1] - a[1])[0][0], P = res.parts;
  const bits = [];
  if (P.test[main] >= 1) bits.push(`you got both ${SKILL_WORD[main]} tests right`); else if (P.test[main] >= .5) bits.push(`you got a ${SKILL_WORD[main]} test right`);
  if (P.done[main] >= 1) bits.push("you've already done this kind of work"); else if (P.done[main] >= .5) bits.push("you've done some of this before");
  if (P.like[main] >= .6 || P.scene[main] >= .6) bits.push("it's what you reach for first");
  return bits.length ? cap1(bits.join(", ").replace(/, ([^,]*)$/, " and $1")) + "." : "";
}
const cap1 = t => t ? t[0].toUpperCase() + t.slice(1) : t;
