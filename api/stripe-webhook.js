// /api/stripe-webhook.js
import 'dotenv/config';
import Stripe from 'stripe';

// Read raw body for Stripe signature verification
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { STRIPE_SECRET, STRIPE_WEBHOOK_SECRET } = process.env;
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    console.error('Webhook env missing (STRIPE_SECRET / STRIPE_WEBHOOK_SECRET)');
    return res.status(400).end();
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing Stripe-Signature header');

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { type, data } = event;
  const obj = data?.object ?? {};

  try {
    const { stmt } = await import('../db.js');

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const status = obj.status;            // active | trialing | past_due | canceled | ...
      const customerId = obj.customer;
      if (customerId && status) {
        await stmt.setUserStatusByCustomer.run(status, customerId);
      }
    } else if (type === 'customer.subscription.deleted') {
      const customerId = obj.customer;
      if (customerId) {
        await stmt.setUserStatusByCustomer.run('canceled', customerId);
      }
    }
    // Optional: capture customer ID on your user after Checkout completes
    else if (type === 'checkout.session.completed') {
      // If you send ?email=... or store a pending signup, you can bind here:
      // const email = obj.customer_details?.email;
      // const customerId = obj.customer;
      // if (email && customerId) await stmt.setUserStripe.run(customerId, 'trialing', email);
    }
  } catch (e) {
    // Don’t fail the webhook for internal DB issues; Stripe will retry on 5xx
    console.error('DB update error in webhook:', e);
  }

  // Stripe only needs a 2xx
  return res.status(200).json({ received: true });
}
