/* ----- money engine: the split maths (pure functions, no page code) -----
   All amounts are handled in piasters (1 EGP = 100) so totals always add up exactly.

   Order for every bit of money that comes in:
     1. pay back costs people paid from their own pocket (oldest first)
     2. the partner's commission, when a partner abroad brought the client (a % or a fixed amount)
     3. team fund %         (of what's left)
     4. finder's fee %      (to whoever on the team brought the client, when it applies)
     5. the rest is split by the agreed shares
   Currencies: a deal can be priced in any currency. Each payment records the rate to EGP on the day,
   and everything that's shared (costs, commission, fund, shares) is in EGP, so the split is exact.
   One-time projects: costs are paid back as money arrives, but the profit is only split
   once the client has fully paid. Monthly and installment deals split every payment.
   A deal that's only a proposal has no payments due yet, so nothing can be late.
   When a deal is over (a one-time project fully paid, or any deal marked Ended) and costs
   are still owed back, the team fund covers them: nobody stays out of pocket.
   Payment plan (one-time deals): the price can be split into steps, like a deposit and a final payment.
   Each step says which tasks it pays for. Money that comes in fills the steps in order.

   Two ways to share step 5 (the team's money):
     - By % shares (money.split is not "tasks"): the planner types each person's %.
     - By task prices (money.split === "tasks", one-time and paid-over-months deals): a task can have a price,
       its part of the client's price (money.prices[taskId], in the deal's currency). Money that comes in fills
       the payments in order (deposit first); each payment's team money goes to the tasks that payment covers,
       in proportion to their prices. A task's money is earned once the task is done, by the people on it
       (shared equally). Money not covered by a priced task goes by the % shares, or equally to the
       project's team when there are none. Tasks not linked to a payment are paid by the last one.
       Nobody has to price every task: unpriced work is simply the shared part.
     - All to the team fund (money.split === "fund"): costs, partner and finder as usual, the rest goes to the fund.
   Keep it in the fund, decide later (money.hold): the money that came in sits in the team fund, written down as this
   project's, and nothing is split yet (not even costs). It isn't the fund's own money. When the team decides,
   the hold comes off and the chosen way runs over every payment, as if it had been chosen from the start. */

const MONEY_DEFAULTS = { fundPct: 40, findPct: 5, finderMonths: 3, pauseAfterLate: 2, reviewMonths: 2, version: 2 };
const toP = x => Math.round((Number(x) || 0) * 100);
const monthOf = d => (d || "").slice(0, 7);
function addMonths(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
function monthsBetween(a, b) { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1) }

// Split an amount by percentage shares; leftover piasters go to the biggest share so nothing is lost.
function splitByShares(amount, shares) {
  const ids = Object.keys(shares || {}).filter(u => Number(shares[u]) > 0);
  const total = ids.reduce((s, u) => s + Number(shares[u]), 0);
  const out = {};
  if (!ids.length || amount <= 0) return out;
  let given = 0;
  for (const u of ids) { out[u] = Math.floor(amount * Number(shares[u]) / total); given += out[u] }
  const biggest = ids.slice().sort((a, b) => Number(shares[b]) - Number(shares[a]))[0];
  out[biggest] += amount - given;
  return out;
}

function computeMoney(p, todayStr, rules, opts) {
  const m0 = p.money || {}, R = { ...MONEY_DEFAULTS, ...(rules || {}) };
  // a deal in phases (one-time only): the price is the agreed phases added up, the plan is their payments in order
  const phased = isPhased(m0), m = phased ? { ...m0, price: phasesPrice(m0) } : m0;
  const fundPct = m.fundCustom && m.fundPct != null ? Number(m.fundPct) : R.fundPct;
  // who brought the client: one or several people share the finder's fee; "the team" puts it in the fund
  const finders = m.finderTeam ? [] : (Array.isArray(m.finders) ? m.finders : (m.finder ? [m.finder] : [])).filter(Boolean);
  const hasFinder = m.finderTeam || finders.length > 0;
  const findPct = hasFinder ? (m.findCustom && m.findPct != null ? Number(m.findPct) : R.findPct) : 0;
  const type = m.type || "one";
  const list = o => Object.entries(o || {}).filter(([, v]) => v && v.amount != null).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.at || 0) - (b.at || 0));
  const payments = list(p.payments), costs = list(p.costs), payouts = list(p.payouts), ads = list(p.ads);
  const cur = m.currency || "EGP", dealRate = cur === "EGP" ? 1 : Number(m.rate) || 1;
  const egp = x => Math.round(toP(x.amount) * (cur === "EGP" ? 1 : Number(x.rate) || dealRate));   // a payment in EGP
  // the partner abroad who brought the client: a % of each split, or a fixed amount taken until it's paid in full
  const pa = m.partner && m.partner.email ? m.partner : null;
  const paMode = pa ? (pa.mode === "fixed" ? "fixed" : "pct") : null, paVal = pa ? Number(pa.value) || 0 : 0;
  let paLeft = paMode === "fixed" ? toP(paVal) : 0;

  const proposal = m.stage === "proposal", ended = m.stage === "ended";
  const holding = !!m.hold, byFund = m.split === "fund" && !holding;
  const byTasks = m.split === "tasks" && type !== "monthly" && !holding, team = ((opts || {}).team || []).filter(Boolean);
  const res = { type, currency: cur, rate: dealRate, receivedEGP: 0, partner: pa ? { email: pa.email, name: pa.name || pa.email, mode: paMode, value: paVal, earned: 0, paid: 0 } : null, proposal, ended, fundPct, findPct, finders, finderTeam: !!m.finderTeam, received: 0, expected: 0, costsTotal: 0, costsUnpaid: 0, fund: 0, finderAmt: 0, fundCover: 0,
    people: {}, unassigned: 0, pending: false, held: 0, preview: null, schedule: [], late: [], monthsUnpaid: 0, ads: { in: 0, spent: 0, held: 0 },
    flow: { costs: 0, partner: 0, fund: 0, finder: 0, shares: 0 }, planned: false, planOff: 0,
    byTasks, byFund, holding, holdAmt: 0, tasks: {}, taskHeld: 0, priced: 0, pricedOver: false };
  const person = u => res.people[u] || (res.people[u] = { earned: 0, back: 0, paid: 0, balance: 0 });

  // costs queue: paid back in order
  const queue = costs.map(c => ({ by: c.paidBy, left: toP(c.amount) }));
  res.costsTotal = queue.reduce((s, q) => s + q.left, 0);
  const reimburse = avail => {
    for (const q of queue) { if (avail <= 0) break; const take = Math.min(avail, q.left); if (!take) continue; q.left -= take; avail -= take; res.flow.costs += take; if (q.by) person(q.by).back += take; else res.unassigned += take }
    return avail;
  };
  const commission = (amt, withPartner, into) => {
    if (!pa || amt <= 0 || (paMode === "pct" && !withPartner)) return 0;   // a fixed amount keeps being paid until it's done
    let c = 0;
    if (paMode === "pct") c = Math.round(amt * paVal / 100);
    else { c = Math.min(amt, into ? toP(paVal) : paLeft); if (!into) paLeft -= c }
    if (into) into.partner = (into.partner || 0) + c; else res.partner.earned += c;
    return c;
  };
  const splitProfit = (amt, shares, withFinder, into, sink) => {
    const t = into || res; if (amt <= 0) return;
    const c = commission(amt, withFinder, into); t.flow.partner += c; amt -= c; if (amt <= 0) return;
    const fund = Math.round(amt * fundPct / 100), find = withFinder && hasFinder ? Math.round(amt * findPct / 100) : 0;
    t.fund += fund; t.finderAmt += find;
    const rest = amt - fund - find, parts = splitByShares(rest, shares);
    t.flow.fund += fund; t.flow.finder += find; t.flow.shares += rest;
    const pp = u => (into ? (into.people[u] || (into.people[u] = { earned: 0 })) : person(u));
    if (find && m.finderTeam) t.fund += find;
    else if (find) for (const [u, v] of Object.entries(splitByShares(find, Object.fromEntries(finders.map(u => [u, 1]))))) pp(u).earned += v;
    if (sink) { sink(rest); return }   // task prices: the caller shares it out
    if (byFund) { t.fund += rest; t.flow.fund += rest; t.flow.shares -= rest; return }   // all to the team fund
    let given = 0; for (const [u, v] of Object.entries(parts)) { pp(u).earned += v; given += v }
    if (rest - given > 0) t.unassigned += rest - given;   // no shares set yet
  };


  // ---- sharing by task prices ----
  // the money that isn't covered by a priced task: by the % shares, or equally to the project's team
  const shareRest = (amt, people) => {
    if (amt <= 0) return;
    const sh = Object.values(m.shares || {}).some(v => Number(v) > 0) ? m.shares : team.length ? Object.fromEntries(team.map(u => [u, 1])) : null;
    if (!sh) { if (people === res.people) res.unassigned += amt; else people.__none = (people.__none || 0) + amt; return }
    for (const [u, v] of Object.entries(splitByShares(amt, sh))) { const x = people[u] || (people[u] = { earned: 0, back: 0, paid: 0, balance: 0 }); x.earned += v }
  };
  function taskSplit() {
    const prices = m.prices || {}, tmap = {};
    for (const field of ["tasks", "steps"]) for (const [id, t] of Object.entries(p[field] || {})) if (t && t.text)
      tmap[id] = { id, text: t.text, done: !!t.done, who: [...new Set([t.owner, ...Object.entries(t.helpers || {}).filter(([, v]) => v).map(([u]) => u)].filter(Boolean))] };
    const plan = planOf(m, p), total = toP(m.price);
    const buckets = plan.length ? plan.map(st => ({ label: st.label || "", amt: toP(st.amount), tasks: (st.tasks || []).filter(id => tmap[id]) })) : [{ label: "", amt: total, tasks: [] }];
    if (plan.length) { const off = total - buckets.reduce((a, b) => a + b.amt, 0); buckets[buckets.length - 1].amt = Math.max(0, buckets[buckets.length - 1].amt + off) }
    const linked = new Set(buckets.flatMap(b => b.tasks)), lastB = buckets[buckets.length - 1], later = laterTasks(m, p);
    for (const id of Object.keys(tmap)) if (!linked.has(id) && !later.has(id)) lastB.tasks.push(id);
    for (const b of buckets) { b.pot = 0; b.got = 0; b.priced = b.tasks.reduce((a, id) => a + Math.max(0, toP(prices[id])), 0) }
    res.priced = buckets.reduce((a, b) => a + b.priced, 0);
    res.pricedOver = buckets.some(b => b.priced > b.amt);
    // each payment fills the payments of the plan in order; its team money goes to that payment's tasks
    for (const x of payments) {
      const amt = toP(x.amount), inEGP = egp(x); if (amt <= 0) continue;
      let left = amt; const takes = [];
      buckets.forEach((b, i) => { if (left <= 0) return; const take = i === buckets.length - 1 ? left : Math.min(left, Math.max(0, b.amt - b.got)); if (take > 0) { b.got += take; left -= take; takes.push([b, take]) } });
      let used = 0;
      takes.forEach(([b, take], i) => {
        const part = i === takes.length - 1 ? inEGP - used : Math.round(inEGP * take / amt); used += part;
        const withFinder = true;
        splitProfit(reimburse(part), null, withFinder, null, rest => { b.pot += rest });
      });
    }
    // what each task gets from its payment's money
    const shareOf = (b, pot, v) => { const base = Math.max(b.amt, b.priced); return base ? Math.floor(pot * v / base) : 0 };
    for (const b of buckets) {
      let given = 0;
      for (const id of b.tasks) {
        const v = Math.max(0, toP(prices[id])), t = tmap[id]; if (!v) continue;
        const share = shareOf(b, b.pot, v); given += share;
        const info = res.tasks[id] = { price: v, share, est: 0, step: b.label, done: t.done, who: t.who, status: "" };
        if (!share) info.status = "unpaid";
        else if (t.done && t.who.length) { info.status = "earned"; for (const [u, a] of Object.entries(splitByShares(share, Object.fromEntries(t.who.map(u => [u, 1]))))) person(u).earned += a }
        else if (t.done) { info.status = "nobody"; res.unassigned += share }
        else { info.status = "waiting"; res.taskHeld += share }
      }
      shareRest(b.pot - given, res.people);
    }
    res.held = res.taskHeld;
    // what it looks like when the client has paid everything and every task is done (assuming no more costs)
    const pv = { fund: 0, finderAmt: 0, unassigned: 0, people: {}, flow: { costs: 0, partner: 0, fund: 0, finder: 0, shares: 0 } };
    const whole = Math.round(total * dealRate); pv.whole = whole; pv.flow.costs = Math.min(whole, res.costsTotal);
    let net = 0; splitProfit(Math.max(0, whole - res.costsTotal), null, true, pv, rest => { net = rest });
    const sumAmt = buckets.reduce((a, b) => a + b.amt, 0) || 1;
    for (const b of buckets) {
      const pot = Math.floor(net * b.amt / sumAmt); let given = 0;
      for (const id of b.tasks) {
        const v = Math.max(0, toP(prices[id])), t = tmap[id]; if (!v) continue;
        const est = shareOf(b, pot, v); given += est; if (res.tasks[id]) res.tasks[id].est = est;
        if (t.who.length) for (const [u, a] of Object.entries(splitByShares(est, Object.fromEntries(t.who.map(u => [u, 1]))))) { const x = pv.people[u] || (pv.people[u] = { earned: 0 }); x.earned += a }
        else pv.unassigned += est;
      }
      shareRest(pot - given, pv.people);
    }
    if (pv.people.__none) { pv.unassigned += pv.people.__none; delete pv.people.__none }
    res.preview = pv;
    res.taskRate = total ? net / total : 0;   // EGP piasters a task gets for each piaster of its price, when all is paid
  }

  for (const x of payments) { res.received += toP(x.amount); res.receivedEGP += egp(x) }

  if (holding) {
    // kept in the fund for this project: nothing is split until the team decides
    if (type !== "monthly") res.expected = toP(m.price);
    res.holdAmt = res.receivedEGP;
  } else if (byTasks) {
    res.expected = toP(m.price);
    taskSplit();
  } else if (byFund) {
    res.expected = type === "monthly" ? 0 : toP(m.price);
    for (const x of payments) splitProfit(reimburse(egp(x)), null, true);
  } else if (type === "one" && phased) {
    // in phases, by % shares: each phase's money is split once that phase is fully paid
    res.expected = toP(m.price);
    const parts = m.phases.filter(ph => ph && ph.agreed).map(ph => ({ id: ph.id, amt: toP(ph.price), got: 0, pot: 0 }));
    if (!parts.length) parts.push({ id: "", amt: 0, got: 0, pot: 0 });
    for (const x of payments) {
      const amt = toP(x.amount), inEGP = egp(x); if (amt <= 0) continue;
      let left = amt, used = 0; const takes = [];
      parts.forEach((b, i) => { if (left <= 0) return; const take = i === parts.length - 1 ? left : Math.min(left, Math.max(0, b.amt - b.got)); if (take > 0) { b.got += take; left -= take; takes.push([b, take]) } });
      takes.forEach(([b, take], i) => { const part = i === takes.length - 1 ? inEGP - used : Math.round(inEGP * take / amt); used += part; splitProfit(reimburse(part), null, true, null, rest => { b.pot += rest }) });
    }
    for (const b of parts) {
      if (b.amt > 0 && b.got >= b.amt) { let given = 0; for (const [u, v] of Object.entries(splitByShares(b.pot, m.shares))) { person(u).earned += v; given += v } res.unassigned += b.pot - given }
      else { res.held += b.pot; if (b.pot || b.amt) res.pending = true }
    }
    if (res.pending) {
      const pv = { fund: 0, finderAmt: 0, unassigned: 0, people: {}, flow: { costs: 0, partner: 0, fund: 0, finder: 0, shares: 0 } };
      const whole = Math.round(res.expected * dealRate); pv.whole = whole; pv.flow.costs = Math.min(whole, res.costsTotal);
      splitProfit(Math.max(0, whole - res.costsTotal), m.shares, true, pv);
      res.preview = pv;
    }
  } else if (type === "one") {
    res.expected = toP(m.price);
    const avail = reimburse(res.receivedEGP);
    if (res.expected > 0 && res.received >= res.expected) splitProfit(avail, m.shares, true);
    else {
      res.pending = true; res.held = avail;
      // what it will look like once fully paid (assuming no more costs)
      const pv = { fund: 0, finderAmt: 0, unassigned: 0, people: {}, flow: { costs: 0, partner: 0, fund: 0, finder: 0, shares: 0 } };
      const totalCosts = res.costsTotal, whole = Math.round(res.expected * dealRate);
      pv.whole = whole; pv.flow.costs = Math.min(whole, totalCosts);
      splitProfit(Math.max(0, whole - totalCosts), m.shares, true, pv);
      res.preview = pv;
    }
  } else {
    const startM = m.startMonth || monthOf(todayStr);
    for (const x of payments) {
      const avail = reimburse(egp(x));
      let shares = m.shares, withFinder = true;
      if (x.kind === "monthly") {
        shares = (m.monthShares || {})[x.month] || m.monthlyShares || m.shares;
        withFinder = monthsBetween(startM, x.month || startM) < R.finderMonths;
      }
      splitProfit(avail, shares, withFinder);
    }
  }
  // The deal is over and some costs were never earned back: the team fund pays them, so the person isn't out of pocket.
  const over = !holding && (ended || (type === "one" && res.expected > 0 && res.received >= res.expected));
  if (over) for (const q of queue) if (q.left > 0) { res.fundCover += q.left; res.fund -= q.left; res.flow.fund -= q.left; res.flow.costs += q.left; if (q.by) person(q.by).back += q.left; else res.unassigned += q.left; q.left = 0 }
  res.costsUnpaid = queue.reduce((s, q) => s + q.left, 0);

  // payment schedule and late payments
  const nowM = monthOf(todayStr), day = Number((todayStr || "").slice(8, 10)) || 1, dueDay = Number(m.dueDay) || 5;
  const pastDue = mm => mm < nowM || (mm === nowM && day > dueDay);
  if (type === "monthly" && toP(m.monthlyFee) > 0) {
    const fee = toP(m.monthlyFee), startM = m.startMonth || nowM;
    // an ended deal stops at its end month, or else the last month the client paid for
    const paidMonths = payments.filter(x => x.kind === "monthly" && x.month).map(x => x.month).sort();
    const endM = m.endMonth || (ended ? m.endedMonth || paidMonths[paidMonths.length - 1] || startM : "");
    if (toP(m.setupFee) > 0) {
      const got = payments.filter(x => x.kind === "setup").reduce((s, x) => s + toP(x.amount), 0);
      res.schedule.push({ label: "Setup fee", month: startM, expected: toP(m.setupFee), received: got, status: got >= toP(m.setupFee) ? "paid" : pastDue(startM) ? "late" : "due" });
    }
    const last = endM && endM < addMonths(nowM, 1) ? endM : addMonths(nowM, 1);
    for (let mm = startM, i = 0; mm <= last && i < 120; mm = addMonths(mm, 1), i++) {
      if (m.status === "ended" && m.endedMonth && mm > m.endedMonth) break;
      const got = payments.filter(x => x.kind === "monthly" && x.month === mm).reduce((s, x) => s + toP(x.amount), 0);
      res.schedule.push({ label: mm, month: mm, expected: fee, received: got, status: got >= fee ? "paid" : pastDue(mm) ? "late" : mm === nowM ? "due" : "upcoming" });
    }
    res.expected = res.schedule.filter(s => s.status !== "upcoming").reduce((s, x) => s + x.expected, 0);
  } else if (type === "installments" && toP(m.price) > 0) {
    const n = Math.max(1, Number(m.installments) || 1), total = toP(m.price), each = Math.floor(total / n), startM = m.startMonth || nowM;
    let pool = payments.reduce((s, x) => s + toP(x.amount), 0);
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? total - each * (n - 1) : each, mm = addMonths(startM, i), got = Math.min(pool, amt); pool -= got;
      res.schedule.push({ label: `Payment ${i + 1} of ${n}`, month: mm, expected: amt, received: got, status: got >= amt ? "paid" : pastDue(mm) ? "late" : mm === nowM ? "due" : "upcoming" });
    }
    res.expected = total;
  } else if (type === "one" && res.expected > 0 && planOf(m, p).length) {
    // the payment plan: money fills the steps in order (deposit first)
    const plan = planOf(m, p), amts = plan.map(st => toP(st.amount));
    res.planOff = res.expected - amts.reduce((s, x) => s + x, 0);
    amts[amts.length - 1] = Math.max(0, amts[amts.length - 1] + res.planOff);   // the last step takes any difference, so the plan always matches the price
    let pool = res.received, open = false;
    plan.forEach((st, i) => {
      const amt = amts[i], got = Math.min(pool, amt); pool -= got;
      const status = got >= amt ? "paid" : st.date && st.date < todayStr ? "late" : !open ? "due" : "upcoming";
      if (status !== "paid") open = true;
      res.schedule.push({ label: st.label || `Payment ${i + 1}`, short: st.short || st.label || `Payment ${i + 1}`, part: st.part || "", month: st.date ? monthOf(st.date) : "", date: st.date || "", expected: amt, received: got, status, step: st.id, tasks: Array.isArray(st.tasks) ? st.tasks : [], covers: st.covers || "", n: i + 1, pn: st.pn || i + 1, plast: st.plast != null ? st.plast : i === plan.length - 1 });
    });
    res.planned = true;
  } else if (type === "one" && res.expected > 0) {
    res.schedule.push({ label: "Total", month: nowM, expected: res.expected, received: res.received, status: res.received >= res.expected ? "paid" : "due" });
  }
  // a proposal hasn't been agreed yet: nothing is due or late, and nothing is expected this month
  if (proposal) for (const s of res.schedule) if (s.status === "late" || s.status === "due") s.status = "upcoming";
  if (proposal && type === "monthly") res.expected = 0;
  if (ended) for (const s of res.schedule) if (s.status === "upcoming" || s.status === "due") s.status = s.received >= s.expected ? "paid" : "late";
  res.late = res.schedule.filter(s => s.status === "late");
  res.monthsUnpaid = type === "monthly" ? res.late.filter(s => s.label !== "Setup fee").length : 0;

  // payouts: money actually handed to people
  for (const x of payouts) { if (x.toPartner) { if (res.partner) res.partner.paid += toP(x.amount) } else if (x.to) person(x.to).paid += toP(x.amount) }
  for (const [u, v] of Object.entries(res.people)) v.balance = v.earned + v.back - v.paid;

  // client's ad money: never profit, just tracked
  for (const a of ads) { if (a.kind === "spent") res.ads.spent += toP(a.amount); else res.ads.in += toP(a.amount) }
  res.ads.held = res.ads.in - res.ads.spent;
  return res;
}

// The payment plan of a one-time deal: steps like Deposit and Final payment, each with the tasks it pays for.
// A deal in phases (money.phases) makes its plan from the agreed phases, in order. Each phase pays for the tasks
// in the project phase it's linked to (its last payment does), unless a task was linked to a payment by hand.
const isPhased = m => !!m && m.type !== "monthly" && m.type !== "installments" && Array.isArray(m.phases) && m.phases.some(Boolean);
const phasesPrice = m => Math.round((m.phases || []).filter(ph => ph && ph.agreed).reduce((a, ph) => a + (Number(ph.price) || 0), 0) * 100) / 100;
function phaseSteps(ph) { return Array.isArray(ph.steps) && ph.steps.length ? ph.steps : [{ id: ph.id + "-all", label: "Full payment", amount: Number(ph.price) || 0, tasks: [] }] }
// Tasks in a plan phase whose money phase isn't agreed yet: they wait for that phase, not the current one.
function laterTasks(m, p) {
  const out = new Set(); if (!isPhased(m) || !p) return out;
  const later = new Set(m.phases.filter(ph => ph && !ph.agreed && ph.phase).map(ph => ph.phase));
  for (const f of ["tasks", "steps"]) for (const [id, t] of Object.entries(p[f] || {})) if (t && t.text && later.has(t.phase || "build")) out.add(id);
  return out;
}
function planOf(m, p) {
  if (!m || m.type === "monthly" || m.type === "installments") return [];
  if (!isPhased(m)) return (Array.isArray(m.plan) ? m.plan : []).filter(st => st && toP(st.amount) >= 0);
  const agreed = m.phases.filter(ph => ph && ph.agreed), out = [];
  const byHand = new Set(agreed.flatMap(ph => phaseSteps(ph).flatMap(st => st.tasks || [])));
  for (const ph of agreed) {
    const steps = phaseSteps(ph);
    const auto = p && ph.phase ? [...Object.entries(p.tasks || {}), ...Object.entries(p.steps || {})].filter(([id, t]) => t && t.text && (t.phase || "build") === ph.phase && !byHand.has(id)).map(([id]) => id) : [];
    steps.forEach((st, i) => out.push({ ...st, label: `${ph.name || "Phase"} · ${st.label || "Payment " + (i + 1)}`, short: st.label || "Payment " + (i + 1), part: ph.id, pn: i + 1, plast: i === steps.length - 1,
      tasks: [...(st.tasks || []), ...(i === steps.length - 1 ? auto : [])] }));
  }
  return out.filter(st => toP(st.amount) >= 0);
}

// Shares suggested from who has which tasks (bigger checklists count a bit more).
function suggestShares(tasks, people) {
  const w = {};
  for (const t of tasks) {
    const who = people(t); if (!who.length) continue;
    const weight = 1 + Math.min(3, Object.keys(t.check || {}).length * 0.25) + (t.priority === "urgent" ? 0.5 : t.priority === "high" ? 0.25 : 0);
    for (const u of who) w[u] = (w[u] || 0) + weight / who.length;
  }
  const total = Object.values(w).reduce((s, x) => s + x, 0); if (!total) return {};
  const out = {}; let given = 0; const ids = Object.keys(w).sort((a, b) => w[b] - w[a]);
  for (const u of ids) { out[u] = Math.floor(w[u] / total * 100); given += out[u] }
  out[ids[0]] += 100 - given;
  return out;
}
