export function scorePost({ content, created_utc }) {
  let score = 0;
  if (/\$[0-9]+|ETH|BTC/i.test(content)) score += 3;
  if (/ASAP|urgent/i.test(content)) score += 2;
  if (/React|Web3|AI|Solidity|Node\.js|Next\.js/i.test(content)) score += 2;
  const ageHours = (Date.now()/1000 - (created_utc || Date.now()/1000)) / 3600;
  if (ageHours < 4) score += 1;
  if (/unpaid|exposure/i.test(content)) score = -999;
  return score;
}
