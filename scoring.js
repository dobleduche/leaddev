export function scorePost({ content, created_utc }) {
  let score = 0;
  const extractedTechStack = new Set();
  let extractedCompany = null;
  let extractedLocation = null;

  // Initial scoring based on keywords
  if (/\$[0-9]+|ETH|BTC/i.test(content)) score += 3;
  if (/ASAP|urgent/i.test(content)) score += 2;

  // Age scoring
  const ageHours = (Date.now()/1000 - (created_utc || Date.now()/1000)) / 3600;
  if (ageHours < 4) score += 1;

  // Negative scoring for "unpaid" or "exposure"
  if (/unpaid|exposure/i.test(content)) {
    score = -999;
    return { score, company: null, location: null, techStack: [] }; // Early exit for negative score
  }

  // Tech stack extraction and scoring
  const techKeywords = ['React', 'Web3', 'AI', 'Solidity', 'Node.js', 'Next.js', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'C#', 'PHP', 'Ruby', 'Vue', 'Angular', 'Svelte', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'PostgreSQL', 'MongoDB', 'GraphQL', 'REST API'];
  for (const keyword of techKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(content)) {
      extractedTechStack.add(keyword);
      score += 1;
    }
  }

  // Company extraction (simple regex, can be improved)
  const companyMatch = content.match(/(?:at|for)\s+([A-Z][a-zA-Z0-9\s.&'-]+(?:Inc|LLC|Corp|Ltd|Co)\.?)/i);
  if (companyMatch) {
    extractedCompany = companyMatch[1].trim();
    score += 1;
  }

  // Location extraction (simple regex, can be improved)
  const locationMatch = content.match(/\b(remote|anywhere|US-only|EU-only|worldwide|london|new york|san francisco|berlin|toronto|sydney)\b/i);
  if (locationMatch) {
    extractedLocation = locationMatch[1].trim();
    score += 1;
  }

  return {
    score,
    company: extractedCompany,
    location: extractedLocation,
    techStack: Array.from(extractedTechStack)
  };
}