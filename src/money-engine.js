/* ----- money engine: the split maths (pure functions, no page code) -----
   All amounts are handled in piasters (1 EGP = 100) so totals always add up exactly.

   Order for every bit of money that comes in:
     1. pay back costs people paid from their own pocket (oldest first)
     2. team fund %         (of what's left)
     3. finder's fee %      (to whoever brought the client, when it applies)
     4. the rest is split by the agreed shares
   One-time projects: costs are paid back as money arrives, but the profit is only split
   once the client has fully paid. Monthly and installment deals split every payment. */

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

function computeMoney(p, todayStr, rules) {
  const m = p.money || {}, R = { ...MONEY_DEFAULTS, ...(rules || {}) };
  const fundPct = m.fundCustom && m.fundPct != null ? Number(m.fundPct) : R.fundPct;
  // who brought the client: one or several people share the finder's fee; "the team" puts it in the fund
  const finders = m.finderTeam ? [] : (Array.isArray(m.finders) ? m.finders : (m.finder ? [m.finder] : [])).filter(Boolean);
  const hasFinder = m.finderTeam || finders.length > 0;
  const findPct = hasFinder ? (m.findCustom && m.findPct != null ? Number(m.findPct) : R.findPct) : 0;
  const type = m.type || "one";
  const list = o => Object.entries(o || {}).filter(([, v]) => v && v.amount != null).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.at || 0) - (b.at || 0));
  const payments = list(p.payments), costs = list(p.costs), payouts = list(p.payouts), ads = list(p.ads);

  const res = { type, fundPct, findPct, finders, finderTeam: !!m.finderTeam, received: 0, expected: 0, costsTotal: 0, costsUnpaid: 0, fund: 0, finderAmt: 0,
    people: {}, unassigned: 0, pending: false, held: 0, preview: null, schedule: [], late: [], monthsUnpaid: 0, ads: { in: 0, spent: 0, held: 0 } };
  const person = u => res.people[u] || (res.people[u] = { earned: 0, back: 0, paid: 0, balance: 0 });

  // costs queue: paid back in order
  const queue = costs.map(c => ({ by: c.paidBy, left: toP(c.amount) }));
  res.costsTotal = queue.reduce((s, q) => s + q.left, 0);
  const reimburse = avail => {
    for (const q of queue) { if (avail <= 0) break; const take = Math.min(avail, q.left); if (!take) continue; q.left -= take; avail -= take; if (q.by) person(q.by).back += take; else res.unassigned += take }
    return avail;
  };
  const splitProfit = (amt, shares, withFinder, into) => {
    const t = into || res; if (amt <= 0) return;
    const fund = Math.round(amt * fundPct / 100), find = withFinder && hasFinder ? Math.round(amt * findPct / 100) : 0;
    t.fund += fund; t.finderAmt += find;
    const rest = amt - fund - find, parts = splitByShares(rest, shares);
    const pp = u => (into ? (into.people[u] || (into.people[u] = { earned: 0 })) : person(u));
    if (find && m.finderTeam) t.fund += find;
    else if (find) for (const [u, v] of Object.entries(splitByShares(find, Object.fromEntries(finders.map(u => [u, 1]))))) pp(u).earned += v;
    let given = 0; for (const [u, v] of Object.entries(parts)) { pp(u).earned += v; given += v }
    if (rest - given > 0) t.unassigned += rest - given;   // no shares set yet
  };

  for (const x of payments) res.received += toP(x.amount);

  if (type === "one") {
    res.expected = toP(m.price);
    const avail = reimburse(res.received);
    if (res.expected > 0 && res.received >= res.expected) splitProfit(avail, m.shares, true);
    else {
      res.pending = true; res.held = avail;
      // what it will look like once fully paid (assuming no more costs)
      const pv = { fund: 0, finderAmt: 0, unassigned: 0, people: {} };
      const totalCosts = res.costsTotal;
      splitProfit(Math.max(0, res.expected - totalCosts), m.shares, true, pv);
      res.preview = pv;
    }
  } else {
    const startM = m.startMonth || monthOf(todayStr);
    for (const x of payments) {
      const avail = reimburse(toP(x.amount));
      let shares = m.shares, withFinder = true;
      if (x.kind === "monthly") {
        shares = (m.monthShares || {})[x.month] || m.monthlyShares || m.shares;
        withFinder = monthsBetween(startM, x.month || startM) < R.finderMonths;
      }
      splitProfit(avail, shares, withFinder);
    }
  }
  res.costsUnpaid = queue.reduce((s, q) => s + q.left, 0);

  // payment schedule and late payments
  const nowM = monthOf(todayStr), day = Number((todayStr || "").slice(8, 10)) || 1, dueDay = Number(m.dueDay) || 5;
  const pastDue = mm => mm < nowM || (mm === nowM && day > dueDay);
  if (type === "monthly" && toP(m.monthlyFee) > 0) {
    const fee = toP(m.monthlyFee), startM = m.startMonth || nowM, endM = m.endMonth || "";
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
  } else if (type === "one" && res.expected > 0) {
    res.schedule.push({ label: "Total", month: nowM, expected: res.expected, received: res.received, status: res.received >= res.expected ? "paid" : "due" });
  }
  res.late = res.schedule.filter(s => s.status === "late");
  res.monthsUnpaid = type === "monthly" ? res.late.filter(s => s.label !== "Setup fee").length : 0;

  // payouts: money actually handed to people
  for (const x of payouts) if (x.to) person(x.to).paid += toP(x.amount);
  for (const [u, v] of Object.entries(res.people)) v.balance = v.earned + v.back - v.paid;

  // client's ad money: never profit, just tracked
  for (const a of ads) { if (a.kind === "spent") res.ads.spent += toP(a.amount); else res.ads.in += toP(a.amount) }
  res.ads.held = res.ads.in - res.ads.spent;
  return res;
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
