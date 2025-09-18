// /api/index.js
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { fetchReddit } from '../sources/reddit.js';
import Stripe from 'stripe';
import { prisma } from 'db'; // Import Prisma client

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// auth-lite
app.post('/api/signup', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'valid email required' });
  const now = new Date();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { updatedAt: now },
      create: { email, trialStartTs: now, subscriptionStatus: 'trial' },
    });
    res.json({ ok: true, user: { email: user.email, status: user.subscriptionStatus } });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.get('/api/me', async (req, res) => {
  const { email } = req.query || {};
  if (!email) {
    return res.json({ user: null });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email) },
      select: { email: true, subscriptionStatus: true },
    });
    res.json({ user: user ? { email: user.email, status: user.subscriptionStatus } : null });
  } catch (e) {
    console.error('Get user error:', e);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// leads
app.get('/api/leads', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  try {
    const leads = await prisma.lead.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch (e) {
    console.error('Fetch leads error:', e);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// checkout
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

    // Update user with stripeCustomerId
    await prisma.user.updateMany({
      where: { email },
      data: { stripeCustomerId: customer.id },
    });

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