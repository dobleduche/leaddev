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
    // For signup, we rely on Supabase auth. This endpoint is now primarily for creating a profile entry
    // if it doesn't exist, or updating it. The actual user creation is handled by Supabase.
    // We'll need to get the Supabase user ID from the session or a secure context.
    // For now, this endpoint will be simplified as the frontend handles Supabase signup.
    // This endpoint will be updated to fetch/update the profile based on the authenticated user's ID.
    // For the current flow, this endpoint is less relevant as Supabase handles the initial user creation.
    // We'll keep it for now but note its future deprecation or modification.
    res.status(200).json({ ok: true, message: 'Please use Supabase for signup/login. This endpoint will be updated.' });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.get('/api/me', async (req, res) => {
  const { userId } = req.query || {}; // Expecting Supabase user ID
  if (!userId) {
    return res.json({ profile: null });
  }
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: String(userId) },
      select: { id: true, firstName: true, lastName: true, subscriptionStatus: true },
    });
    res.json({ profile: profile ? { id: profile.id, status: profile.subscriptionStatus } : null });
  } catch (e) {
    console.error('Get profile error:', e);
    res.status(500).json({ error: 'Failed to fetch profile' });
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
  const { email, plan, userId } = req.body || {}; // Expecting userId from Supabase
  if (!email || !userId || !['monthly','annual'].includes(plan)) return res.status(400).json({ error: 'email, userId, and plan=monthly|annual required' });
  const price = plan === 'monthly' ? PRICE_MONTHLY : PRICE_ANNUAL;
  if (!price) return res.status(500).json({ error: 'Stripe price IDs missing' });

  try {
    let customer = (await stripe.customers.list({ email, limit: 1 })).data[0];
    if (!customer) customer = await stripe.customers.create({ email });

    // Update profile with stripeCustomerId
    await prisma.profile.update({
      where: { id: userId },
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