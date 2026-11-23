// Bible Stories MVP server: static PWA + JSON-file API + Stripe one-time Checkout (demo mode when unconfigured)
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8787', 10);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_REMOVE_ADS = process.env.STRIPE_PRICE_REMOVE_ADS || ''; // optional Stripe Price id (one-time)
const REMOVE_ADS_AMOUNT_CENTS = parseInt(process.env.REMOVE_ADS_AMOUNT_CENTS || '499', 10); // used when no price id
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || ''; // optional; otherwise derived from request
const AD_EVERY = parseInt(process.env.AD_EVERY || '4', 10);
const CURRENCY = process.env.CURRENCY || 'usd';
const DEMO_MODE = !STRIPE_SECRET_KEY;
const stripe = DEMO_MODE ? null : require('stripe')(STRIPE_SECRET_KEY);

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const VIDEOS = require('./data/videos.json');
const VIDEO_IDS = new Set(VIDEOS.map(v => v.id));

// ---------- tiny JSON "database" ----------
let db = { likes: {}, saves: {}, comments: {}, entitlements: {}, payments: {}, demoSessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (_) {}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
const setOf = (obj, key) => (obj[key] = obj[key] || []);
const validUid = u => typeof u === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(u);

function grant(uid, info) {
  if (!validUid(uid)) return;
  db.entitlements[uid] = { adFree: true, grantedAt: new Date().toISOString(), ...info };
  persist();
}
function recordPayment(session) {
  db.payments[session.id] = {
    kind: session.metadata && session.metadata.kind, uid: session.metadata && session.metadata.uid,
    amount: session.amount_total, currency: session.currency, status: session.payment_status, at: new Date().toISOString(),
  };
  if (session.payment_status === 'paid' && session.metadata && session.metadata.kind === 'remove_ads') {
    grant(session.metadata.uid, { source: DEMO_MODE ? 'demo' : 'stripe', sessionId: session.id });
  }
  persist();
}

const app = express();
app.disable('x-powered-by');

// ---------- Stripe webhook (raw body; must be before express.json) ----------
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    if (stripe && STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } else if (DEMO_MODE) {
      event = JSON.parse(req.body.toString('utf8') || '{}'); // demo: accept unsigned for local testing
    } else {
      return res.status(400).send('STRIPE_WEBHOOK_SECRET not set');
    }
  } catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    recordPayment(event.data.object);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '20kb' }));

function baseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ---------- API ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({
  demoMode: DEMO_MODE, adEvery: AD_EVERY, currency: CURRENCY,
  removeAdsPriceLabel: STRIPE_PRICE_REMOVE_ADS && !DEMO_MODE ? null : `$${(REMOVE_ADS_AMOUNT_CENTS / 100).toFixed(2)}`,
  donationPresets: [300, 500, 1000],
}));

function decorate(v, uid) {
  const likes = db.likes[v.id] || [];
  return { ...v, likeCount: likes.length + (v.baseLikes || 0), liked: likes.includes(uid),
    saved: (db.saves[uid] || []).includes(v.id), commentCount: (db.comments[v.id] || []).length };
}
app.get('/api/videos', (req, res) => res.json(VIDEOS.map(v => decorate(v, req.query.uid))));
app.get('/api/saved', (req, res) => {
  const ids = db.saves[req.query.uid] || [];
  res.json(VIDEOS.filter(v => ids.includes(v.id)).map(v => decorate(v, req.query.uid)));
});

function guard(req, res) {
  const { uid } = req.body || {};
  if (!VIDEO_IDS.has(req.params.id)) { res.status(404).json({ error: 'unknown video' }); return null; }
  if (!validUid(uid)) { res.status(400).json({ error: 'bad uid' }); return null; }
  return uid;
}
app.post('/api/videos/:id/like', (req, res) => {
  const uid = guard(req, res); if (!uid) return;
  const arr = setOf(db.likes, req.params.id); const i = arr.indexOf(uid);
  const want = typeof req.body.like === 'boolean' ? req.body.like : i < 0;
  if (want && i < 0) arr.push(uid); if (!want && i >= 0) arr.splice(i, 1);
  persist();
  const v = VIDEOS.find(x => x.id === req.params.id);
  res.json({ liked: want, likeCount: arr.length + (v.baseLikes || 0) });
});
app.post('/api/videos/:id/save', (req, res) => {
  const uid = guard(req, res); if (!uid) return;
  const arr = setOf(db.saves, uid); const i = arr.indexOf(req.params.id);
  const want = typeof req.body.save === 'boolean' ? req.body.save : i < 0;
  if (want && i < 0) arr.push(req.params.id); if (!want && i >= 0) arr.splice(i, 1);
  persist(); res.json({ saved: want });
});
app.get('/api/videos/:id/comments', (req, res) => {
  if (!VIDEO_IDS.has(req.params.id)) return res.status(404).json({ error: 'unknown video' });
  res.json((db.comments[req.params.id] || []).slice().reverse());
});
app.post('/api/videos/:id/comments', (req, res) => {
  const uid = guard(req, res); if (!uid) return;
  const text = String(req.body.text || '').trim().slice(0, 500);
  const name = String(req.body.name || '').trim().slice(0, 40) || 'Pilgrim';
  if (!text) return res.status(400).json({ error: 'empty comment' });
  const c = { id: crypto.randomUUID(), uid, name, text, at: new Date().toISOString() };
  setOf(db.comments, req.params.id).push(c); persist();
  res.json(c);
});

// ---------- Entitlements & Checkout (one-time payments only; no subscriptions) ----------
app.get('/api/entitlement', (req, res) => {
  const e = db.entitlements[req.query.uid];
  res.json({ adFree: !!(e && e.adFree), source: e ? e.source : null });
});

async function createCheckout(req, kind, uid, amountCents) {
  const base = baseUrl(req);
  const success = `${base}/?checkout=success&kind=${kind}&session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${base}/?checkout=cancel&kind=${kind}`;
  if (DEMO_MODE) {
    const id = 'demo_cs_' + crypto.randomBytes(8).toString('hex');
    db.demoSessions[id] = { id, kind, uid, amount_total: amountCents, currency: CURRENCY, payment_status: 'unpaid', metadata: { kind, uid } };
    persist();
    return { url: `${base}/demo-checkout.html?session_id=${id}`, demo: true };
  }
  const line_items = kind === 'remove_ads' && STRIPE_PRICE_REMOVE_ADS
    ? [{ price: STRIPE_PRICE_REMOVE_ADS, quantity: 1 }]
    : [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: amountCents,
        product_data: { name: kind === 'remove_ads' ? 'Remove Ads (one-time)' : 'Donation — thank you!' } } }];
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', line_items, success_url: success, cancel_url: cancel,
    client_reference_id: uid, metadata: { kind, uid }, submit_type: kind === 'donation' ? 'donate' : 'pay',
  });
  return { url: session.url, demo: false };
}

app.post('/api/checkout/remove-ads', async (req, res) => {
  const { uid } = req.body || {}; if (!validUid(uid)) return res.status(400).json({ error: 'bad uid' });
  try { res.json(await createCheckout(req, 'remove_ads', uid, REMOVE_ADS_AMOUNT_CENTS)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.post('/api/checkout/donate', async (req, res) => {
  const { uid } = req.body || {}; if (!validUid(uid)) return res.status(400).json({ error: 'bad uid' });
  const cents = Math.round(Number(req.body.amountCents));
  if (!Number.isFinite(cents) || cents < 100 || cents > 100000) return res.status(400).json({ error: 'amount must be $1–$1000' });
  try { res.json(await createCheckout(req, 'donation', uid, cents)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Demo-only: simulate the hosted checkout "Pay" button
app.post('/api/checkout/demo-complete', (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'not in demo mode' });
  const s = db.demoSessions[req.body && req.body.session_id];
  if (!s) return res.status(404).json({ error: 'unknown session' });
  s.payment_status = 'paid'; persist();
  res.json({ ok: true, redirect: `/?checkout=success&kind=${s.kind}&session_id=${s.id}` });
});
app.get('/api/checkout/session', (req, res) => {
  if (!DEMO_MODE) return res.status(404).end();
  const s = db.demoSessions[req.query.session_id]; if (!s) return res.status(404).json({ error: 'unknown session' });
  res.json({ id: s.id, kind: s.kind, amount_total: s.amount_total, currency: s.currency, payment_status: s.payment_status });
});

// Verify after redirect (source of truth = Checkout Session, not the URL)
app.get('/api/checkout/verify', async (req, res) => {
  const id = String(req.query.session_id || '');
  try {
    let session;
    if (DEMO_MODE) { session = db.demoSessions[id]; if (!session) return res.status(404).json({ error: 'unknown session' }); }
    else session = await stripe.checkout.sessions.retrieve(id);
    if (session.payment_status === 'paid') recordPayment(session);
    const uid = session.metadata && session.metadata.uid;
    res.json({ paid: session.payment_status === 'paid', kind: session.metadata && session.metadata.kind,
      amount: session.amount_total, adFree: !!(db.entitlements[uid] && db.entitlements[uid].adFree), demo: DEMO_MODE });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- static ----------
app.use('/videos', express.static(path.join(ROOT, 'public', 'videos'), { maxAge: '7d', acceptRanges: true }));
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res, p) {
    if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    if (p.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
  },
}));

app.listen(PORT, '0.0.0.0', () => console.log(`Bible Stories on :${PORT} ${DEMO_MODE ? '(DEMO payments mode — no Stripe key)' : '(Stripe live/test keys loaded)'}`));
