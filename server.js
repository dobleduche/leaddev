// server.js — ESM
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';

import { stmt } from './db.js';
import { fetchReddit } from './sources/reddit.js';

// ----- ESM-friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- App basics
const app = express();
app.use(cors());

// ----- Env
const {
  PORT = 8080,
  REDDIT_SUBS = 'forhire,jobsforcrypto',
  STRIPE_SECRET,
  PRICE_MONTHLY,
  PRICE_ANNUAL,
  STRIPE_WEBHOOK_SECRET,
  SITE_URL = `http://localhost:${PORT}`
} = process.env;

// ----- Stripe
const stripe = STRIPE_SECRET
  ? new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' })
  : null;

// ----- Health first
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/**
 * IMPORTANT: Stripe webhook must receive the raw body.
 * We register it BEFORE global express.json(), so it isn't pre-parsed.
 */
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).end();
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const { type, data } = event;
    const obj = data?.object ?? {};

    // Handle subscription lifecycle
    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const status = obj.status; // active, trialing, past_due, canceled, etc.
      const customerId = obj.customer;
      if (customerId && status) {
        try {
          stmt.setUserStatusByCustomer.run(status, customerId);
        } catch (e) {
          console.error('DB update error (subscription upsert):', e);
        }
      }
    } else if (type === 'customer.subscription.deleted') {
      const customerId = obj.customer;
      if (customerId) {
        try {
          stmt.setUserStatusByCustomer.run('canceled', customerId);
        } catch (e) {
          console.error('DB update error (subscription delete):', e);
        }
      }
    } else if (type === 'setup_intent.succeeded') {
      // Optional: handle saved payment method if you later need it
      // const pm = obj.payment_method; const customerId = obj.customer;
    }

    res.json({ received: true });
  }
);

// ----- Everything else can be JSON-parsed
app.use(express.json());

// --- Auth-lite: email sign-up to start a trial (3 days clock handled by Stripe once upgraded)
app.post('/api/signup', (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'valid email required' });
  }
  const now = Date.now();
  const user = stmt.upsertUserByEmail.get(email, now);
  res.json({ ok: true, user: { email: user.email, status: user.subscription_status } });
});

app.get('/api/me', (req, res) => {
  const { email } = req.query || {};
  const user = email ? stmt.getUserByEmail.get(email) : null;
  res.json({ user: user ? { email: user.email, status: user.subscription_status } : null });
});

// --- Leads list (paged)
app.get('/api/leads', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  const rows = stmt.latestLeads.all(limit, offset);
  res.json(rows);
});

// --- Stripe Checkout (monthly/annual with 3-day trial configured on the Price in Stripe)
app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const { email, plan } = req.body || {};
  if (!email || !plan || !['monthly', 'annual'].includes(plan)) {
    return res.status(400).json({ error: 'email and plan=monthly|annual required' });
  }

  const price = plan === 'monthly' ? PRICE_MONTHLY : PRICE_ANNUAL;
  if (!price) return res.status(500).json({ error: 'Stripe price IDs missing' });

  try {
    // Create or reuse customer by email
    let customer = (await stripe.customers.list({ email, limit: 1 })).data[0];
    if (!customer) customer = await stripe.customers.create({ email });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price, quantity: 1 }],
      success_url: `${SITE_URL}/?session=success`,
      cancel_url: `${SITE_URL}/?session=cancel`
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return res.status(500).json({ error: 'Checkout failed' });
  }
});

// --- Background fetcher: pull Reddit every 5 minutes and store
async function harvest() {
  try {
    const reddit = await fetchReddit(REDDIT_SUBS); // uses global fetch in Node 18+ / 22
    const insert = stmt.insertLead;
    let newRows = 0;
    for (const lead of reddit) {
      try {
        const info = insert.run(lead);
        if (info.changes > 0) newRows++;
      } catch {
        // ignore duplicates
      }
    }
    if (newRows) console.log(`+${newRows} new leads`);
  } catch (e) {
    console.error('harvest() error:', e);
  }
}
setInterval(harvest, 5 * 60 * 1000);
harvest();


// --- Serve static UI ---
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback for any non-API GET route
// NOTE: Express 5 / path-to-regexp no longer accepts '*' as a path literal.
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ----- Listen
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Freelance Signal SaaS running at http://localhost:${PORT}`);
});
