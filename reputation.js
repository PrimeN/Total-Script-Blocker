import {normalizeDomains} from './rules.js';
export function scorecardURL(domain) {
  return 'https://www.mywot.com/scorecard/' + encodeURIComponent(normalizeDomains([domain])[0]);
}
const number = value => Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
export function parseRating(payload, domain) {
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? Object.values(payload) : [];
  const row = rows.find(row => row && typeof row.target === 'string' && row.target.toLowerCase().replace(/\.$/,'') === domain);
  if (!row) throw new Error('WOT returned no matching domain rating.');
  const safety = row.safety || {};
  return {
    domain,
    status:['SAFE','NOT_SAFE','SUSPICIOUS','UNKNOWN'].includes(safety.status) ? safety.status : 'UNKNOWN',
    score:number(safety.reputations ?? safety.reputation),
    confidence:number(safety.confidence),
    childScore:number(row.childSafety?.reputations ?? row.childSafety?.reputation),
    childConfidence:number(row.childSafety?.confidence),
    categories:(Array.isArray(row.categories) ? row.categories : []).slice(0,20).filter(c=>typeof c?.name === 'string').map(c=>({name:c.name.slice(0,100),confidence:number(c.confidence)})),
    checkedAt:Date.now()
  };
}
export async function fetchRating(domain, config, fetcher = fetch) {
  domain = normalizeDomains([domain])[0];
  if (!domain || !config?.apiKey || !config?.userId) throw new Error('Configure your WOT user ID and API key in Options. Scorecard links need no key.');
  const url = new URL('https://scorecard.api.mywot.com/v3/targets'); url.searchParams.set('t',domain);
  let response;
  try {
    response = await fetcher(url.href,{headers:{'x-user-id':config.userId,'x-api-key':config.apiKey},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});
  } catch { throw new Error('WOT lookup could not connect or timed out.'); }
  if (!response.ok) {
    if ([401,403].includes(response.status)) throw new Error('WOT rejected the credentials or API access.');
    if (response.status === 429) throw new Error('WOT API quota exceeded. Try again later.');
    throw new Error(`WOT lookup unavailable (HTTP ${response.status}).`);
  }
  try { return parseRating(await response.json(),domain); }
  catch { throw new Error('WOT returned an unsupported or missing rating.'); }
}
