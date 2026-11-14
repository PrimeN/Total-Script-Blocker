// Enforcement is browser-owned: it continues while the service worker is asleep.
export function normalizeDomains(values) {
  if (!Array.isArray(values)) throw new Error('Expected a list of domains.');
  const domains = values.filter(v => typeof v === 'string' && v.trim()).map(value => {
    value = value.trim();
    let host = value.toLowerCase().replace(/^\*\./, '');
    if (host.includes('://')) {
      const url = new URL(host);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Use domains without paths or ports.');
      host = url.hostname;
    }
    host = new URL('https://' + host).hostname;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host) || /[\/:?#@\s]/.test(value.replace(/^https?:\/\//, '').replace(/\/$/, ''))) throw new Error('Invalid domain: ' + value);
    return host;
  });
  const result = [...new Set(domains)].sort();
  if (result.length > 500) throw new Error('At most 500 domains are supported.');
  return result;
}
export function isAllowed(host, domains) {
  return domains.some(domain => host === domain || host.endsWith('.' + domain));
}

export const DEFAULT_SETTINGS = {
  allowed:[], blocked:[], reload:true, mode:'whitelist',
  blockScripts:true, blockInline:true, blockFrames:true, blockObjects:true, blockWorkers:true, showBadge:true
};
export function normalizeSettings(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid settings.');
  const result = {...DEFAULT_SETTINGS};
  for (const key of ['allowed','blocked']) result[key] = normalizeDomains(settings[key] ?? []);
  if (settings.mode !== undefined && !['whitelist','same-origin','blacklist'].includes(settings.mode)) throw new Error('Invalid blocking mode.');
  result.mode = settings.mode || 'whitelist';
  for (const key of ['reload','blockScripts','blockInline','blockFrames','blockObjects','blockWorkers','showBadge']) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') throw new Error(`Invalid ${key} preference.`);
    result[key] = settings[key] ?? result[key];
  }
  return result;
}
export function domainPermission(domain, settings) {
  if (settings.paused) return 'paused';
  if (isAllowed(domain,settings.temporary || [])) return 'temporary';
  if (isAllowed(domain,settings.blocked || [])) return 'blocked';
  if (isAllowed(domain,settings.allowed || [])) return 'allowed';
  return settings.mode === 'blacklist' ? 'allowed' : settings.mode === 'same-origin' ? 'same-origin' : 'blocked';
}
function cspRule(id, condition, policy) {
  return {id, priority:20, action:{type:'modifyHeaders', responseHeaders:[{header:'content-security-policy', operation:'append', value:policy}]}, condition:{resourceTypes:['main_frame','sub_frame'], ...condition}};
}
export function buildRules(allowed, paused = false, options = {}) {
  const settings = normalizeSettings({...options,allowed});
  const domains = settings.allowed, denied = settings.blocked;
  const temporary = normalizeDomains(options.temporary || []);
  const rules = [{id:10, priority:10, action:{type:'allow'}, condition:{resourceTypes:['main_frame','sub_frame','script','object']}}];
  if (paused) return rules;
  const types = [];
  if (settings.blockScripts) types.push('script');
  if (settings.blockFrames) types.push('sub_frame');
  if (settings.blockObjects) types.push('object');
  if (types.length && settings.mode !== 'blacklist') rules.push({id:11, priority:20, action:{type:'block'}, condition:{resourceTypes:types,...(settings.mode === 'same-origin' ? {domainType:'thirdParty'} : {}), ...(domains.length ? {excludedRequestDomains:domains} : {})}});
  if (types.length && denied.length) rules.push({id:14,priority:30,action:{type:'block'},condition:{resourceTypes:types,requestDomains:denied,...(temporary.length ? {excludedRequestDomains:temporary} : {})}});
  const hosts = domains.flatMap(d => [`http://${d}:*`, `https://${d}:*`, `http://*.${d}:*`, `https://*.${d}:*`]).join(' ');
  function policy(trusted, blockedDocument = false) {
    const sources = blockedDocument ? "'none'" : settings.mode === 'blacklist' ? '* data: blob:' : [settings.mode === 'same-origin' ? "'self'" : '',hosts].filter(Boolean).join(' ') || "'none'";
    const directives = [];
    if (settings.blockObjects) directives.push(`object-src ${sources}`);
    if (settings.blockFrames) directives.push(`frame-src ${sources}`);
    if (settings.blockWorkers) directives.push("worker-src 'none'");
    if (settings.blockScripts || settings.blockInline) {
      const scriptSources=settings.blockScripts ? sources : '* data: blob:';
      const permitInline=!settings.blockInline || (trusted && !blockedDocument);
      directives.push(`script-src ${scriptSources}${permitInline ? " 'unsafe-inline' 'unsafe-eval'" : ''}`);
    }
    return directives.join('; ');
  }
  const exclusions = [...new Set([...domains,...denied])];
  const defaultPolicy = policy(settings.mode !== 'whitelist');
  if (defaultPolicy) rules.push(cspRule(12,exclusions.length ? {excludedRequestDomains:exclusions} : {},defaultPolicy));
  const permanent = domains.filter(d=>!temporary.includes(d));
  const permanentExclusions = [...new Set([...denied,...temporary])];
  if (permanent.length && policy(true)) rules.push(cspRule(13,{requestDomains:permanent,...(permanentExclusions.length ? {excludedRequestDomains:permanentExclusions} : {})},policy(true)));
  if (temporary.length && policy(true)) rules.push(cspRule(16,{requestDomains:temporary},policy(true)));
  if (denied.length && policy(false,true)) rules.push(cspRule(15,{requestDomains:denied,...(temporary.length ? {excludedRequestDomains:temporary} : {})},policy(false,true)));
  return rules;
}
