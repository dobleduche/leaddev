import fetch from 'node-fetch';
import { scorePost } from '../scoring.js';

const BASE = 'https://www.reddit.com/r';

export async function fetchReddit(subsCsv) {
  const subs = (subsCsv || '').split(',').map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const sub of subs) {
    const url = `${BASE}/${encodeURIComponent(sub)}/new.json?limit=50`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'freelance-signal/1.0' }});
      if (!r.ok) continue;
      const j = await r.json();
      const posts = (j.data?.children || []).map(c => c.data);
      for (const p of posts) {
        const content = [p.title, p.selftext].filter(Boolean).join(' — ');
        const { score, company, location, techStack } = scorePost({ content, created_utc: p.created_utc });
        if (score > 0) { // Only include leads with a positive score
          results.push({
            platform: 'Reddit',
            title: p.title?.slice(0, 180) || 'Untitled',
            content: p.selftext?.slice(0, 2000) || '',
            author: p.author || 'unknown',
            url: `https://reddit.com${p.permalink}`,
            budget: (content.match(/\$[0-9][0-9,]*/)?.[0]) || '',
            score: score,
            company: company,
            location: location,
            techStack: techStack,
          });
        }
      }
    } catch (e) {
      console.error('reddit fetch failed', sub, e.message);
    }
  }
  return results;
}