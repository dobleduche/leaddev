// db.js  — dual driver: Postgres (prod) or SQLite (dev)
import 'dotenv/config';

const usePg = !!process.env.DATABASE_URL;

if (usePg) {
  // ---------- Postgres path (Vercel / DO Managed PG)
  import pg from 'pg';
  const { Pool } = pg;

  // Reuse a single pool across function invocations (Vercel)
  const globalAny = globalThis;
  const pool = globalAny.__PG_POOL__ ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // DO often requires SSL; adjust as needed
    max: 5, // serverless-friendly
    idleTimeoutMillis: 10_000
  });
  if (!globalAny.__PG_POOL__) globalAny.__PG_POOL__ = pool;

  // Init schema (idempotent)
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      email text unique not null,
      stripe_customer_id text,
      subscription_status text default 'trial',
      trial_start_ts bigint,
      created_ts bigint default (extract(epoch from now()) * 1000)::bigint
    );
    create table if not exists leads (
      id bigserial primary key,
      platform text not null,
      title text not null,
      content text not null,
      author text,
      url text,
      budget text,
      score integer not null,
      created_ts bigint default (extract(epoch from now()) * 1000)::bigint,
      unique (platform, url)
    );
    create index if not exists idx_leads_created_ts on leads (created_ts desc);
    create index if not exists idx_users_email on users (email);
  `);

  // Helpers to mimic better-sqlite3 API
  const one = async (text, params = []) => {
    const r = await pool.query(text, params);
    return r.rows[0] || null;
  };
  const many = async (text, params = []) => {
    const r = await pool.query(text, params);
    return r.rows;
  };
  const exec = async (text, params = []) => {
    const r = await pool.query(text, params);
    return { changes: r.rowCount }; // match .changes in better-sqlite3
  };

  export const stmt = {
    upsertUserByEmail: {
      // note: returns row like better-sqlite3 .get()
      get(email, nowMs) {
        return one(
          `
          insert into users (email, trial_start_ts)
          values ($1, $2)
          on conflict (email)
          do update set email = excluded.email
          returning email, stripe_customer_id, subscription_status, trial_start_ts, created_ts
          `,
          [email, nowMs]
        );
      }
    },
    getUserByEmail: {
      get(email) {
        return one(
          `select email, stripe_customer_id, subscription_status, trial_start_ts, created_ts
           from users where email = $1`,
          [email]
        );
      }
    },
    setUserStripe: {
      run(stripeCustomerId, status, email) {
        return exec(
          `update users
           set stripe_customer_id = $1, subscription_status = $2
           where email = $3`,
          [stripeCustomerId, status, email]
        );
      }
    },
    setUserStatusByCustomer: {
      run(status, customerId) {
        return exec(
          `update users set subscription_status = $1
           where stripe_customer_id = $2`,
          [status, customerId]
        );
      }
    },
    insertLead: {
      // accept object with named fields (same as your code)
      run(lead) {
        return exec(
          `insert into leads (platform, title, content, author, url, budget, score)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (platform, url) do nothing`,
          [
            lead.platform,
            lead.title,
            lead.content,
            lead.author ?? null,
            lead.url ?? null,
            lead.budget ?? null,
            lead.score
          ]
        );
      }
    },
    latestLeads: {
      all(limit, offset) {
        return many(
          `select id, platform, title, content, author, url, budget, score, created_ts
           from leads
           order by created_ts desc
           limit $1 offset $2`,
          [limit, offset]
        );
      }
    }
  };

  export default { pool };
} else {
  // ---------- SQLite path (local dev)
  const { default: Database } = await import('better-sqlite3');
  const db = new Database('data.sqlite');
  db.pragma('journal_mode = wal');

  db.exec(`
  create table if not exists users (
    id integer primary key autoincrement,
    email text unique not null,
    stripe_customer_id text,
    subscription_status text default 'trial',
    trial_start_ts integer,
    created_ts integer default (strftime('%s','now')*1000)
  );
  create table if not exists leads (
    id integer primary key autoincrement,
    platform text not null,
    title text not null,
    content text not null,
    author text,
    url text,
    budget text,
    score integer not null,
    created_ts integer default (strftime('%s','now')*1000),
    unique (platform, url) on conflict ignore
  );
  `);

  export const stmt = {
    upsertUserByEmail: db.prepare(`
      insert into users (email, trial_start_ts) values (?, ?)
      on conflict(email) do update set email = excluded.email
      returning *;
    `),
    getUserByEmail: db.prepare(`select * from users where email = ?`),
    setUserStripe: db.prepare(`
      update users set stripe_customer_id = ?, subscription_status = ?
      where email = ?`),
    setUserStatusByCustomer: db.prepare(`
      update users set subscription_status = ? where stripe_customer_id = ?`),

    insertLead: db.prepare(`
      insert into leads (platform, title, content, author, url, budget, score)
      values (@platform,@title,@content,@author,@url,@budget,@score)
    `),
    latestLeads: db.prepare(`
      select * from leads order by created_ts desc limit ? offset ?
    `)
  };

  export default db;
}
