// Store hostnames only. Page-supplied observations never grant permissions.
export const SOURCE_LIMIT = 300;
export function sourceHost(value) {
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.hostname : null; } catch { return null; }
}
export function mergeSources(previous = [], incoming = []) {
  const map = new Map(previous.map(record => [record.domain, record]));
  for (const source of incoming.slice(0,1000)) {
    if (!source || typeof source.domain !== 'string' || source.domain.length > 253) continue;
    const domain = sourceHost('https://' + source.domain);
    if (!domain || domain !== source.domain || /[^a-z0-9.\-\[\]:]/.test(domain)) continue;
    if (!map.has(domain) && map.size >= SOURCE_LIMIT) continue;
    const record = map.get(domain) || {domain, types:[], evidence:[]};
    for (const type of Array.isArray(source.types) ? source.types : []) if (['document','script','inline','frame','object','worker'].includes(type) && !record.types.includes(type)) record.types.push(type);
    for (const evidence of Array.isArray(source.evidence) ? source.evidence : []) if (['page','request','completed','browser-blocked','csp-blocked'].includes(evidence) && !record.evidence.includes(evidence)) record.evidence.push(evidence);
    map.set(domain, record);
  }
  return [...map.values()].sort((a,b) => a.domain.localeCompare(b.domain));
}
// Self-contained so Chrome can execute this function in each isolated frame.
export function scanDocument() {
  const records = [];
  function add(value, type) {
    try {
      const url = new URL(value, document.baseURI);
      if (['http:','https:'].includes(url.protocol)) records.push({domain:url.hostname,types:[type],evidence:['page']});
    } catch {}
  }
  add(location.href,'document');
  for (const el of document.querySelectorAll('script,iframe,frame,object,embed,link[rel="modulepreload"],link[rel="preload"][as="script"]')) {
    if (records.length >= 1000) break;
    if (el.tagName === 'SCRIPT') add(el.src || location.href,el.src ? 'script' : 'inline');
    else if (['IFRAME','FRAME'].includes(el.tagName)) add(el.src || location.href,'frame');
    else if (el.tagName === 'LINK') add(el.href,'script');
    else add(el.data || el.src,'object');
  }
  return records;
}
