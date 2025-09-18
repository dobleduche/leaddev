// /api/index.js
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { stmt } from '../db.js';
import { fetchReddit } from '../sources/reddit.js';

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// auth-lite
app.post('/api/signup', (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'valid email required' });
  const now = Date.now();
  const user = stmt.upsertUserByEmail.get(email, now);
  res.json({ ok: true, user: { email: user.email, status: user.subscription_status } });
});

app.get('/api/me', (req, res) => {
  const { email } = req.query || {};
  const user = email ? stmt.getUserByEmail.get(email) : null;
  res.json({ user: user ? { email: user.email, status: user.subscription_status } : null });
});

// leads
app.get('/api/leads', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  const rows = stmt.latestLeads.all(limit, offset);
  res.json(rows);
});

// checkout
import Stripe from 'stripe';
const {
  STRIPE_SECRET,
  PRICE_MONTHLY,
  PRICE_ANNUAL,
  SITE_URL = 'https://your-domain.vercel.app'
} = process.env;
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' }) : null;

app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  const { email, plan } = req.body || {};
  if (!email || !['monthly','annual'].includes(plan)) return res.status(400).json({ error: 'email and plan=monthly|annual required' });
  const price = plan === 'monthly' ? PRICE_MONTHLY : PRICE_ANNUAL;
  if (!price) return res.status(500).json({ error: 'Stripe price IDs missing' });

  try {
    let customer = (await stripe.customers.list({ email, limit: 1 })).data[0];
    if (!customer) customer = await stripe.customers.create({ email });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price, quantity: 1 }],
      success_url: `${SITE_URL}/?session=success`,
      cancel_url: `${SITE_URL}/?session=cancel`
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// export the handler for Vercel
export default function handler(req, res) {
  return app(req, res);
}
