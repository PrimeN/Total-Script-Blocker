import {normalizeDomains} from './rules.js';
export function editPermissions(state, changes) {
  if (!Array.isArray(changes) || changes.length > 500) throw new Error('Choose at most 500 permission changes.');
  const next = {...state, allowed:[...state.allowed],blocked:[...state.blocked],temporary:[...state.temporary]};
  for (const change of changes) {
    if (!change || !['allow','temporary','block','default'].includes(change.mode)) throw new Error('Invalid permission.');
    const [domain] = normalizeDomains([change.domain]);
    if (!domain) throw new Error('Choose a valid domain.');
    const overlap = list => list.filter(d=>d!==domain && !domain.endsWith('.'+d) && !d.endsWith('.'+domain));
    const descendants = list => list.filter(d=>d!==domain && !d.endsWith('.'+domain));
    if (change.mode === 'default') {
      // Inherit again without erasing the parent rule or its other children.
      for (const key of ['allowed','blocked','temporary']) next[key]=next[key].filter(d=>d!==domain);
      continue;
    }
    next.allowed=change.mode === 'block' ? descendants(next.allowed) : overlap(next.allowed);
    next.temporary=overlap(next.temporary);
    if (change.mode !== 'temporary') next.blocked=overlap(next.blocked);
    if (change.mode === 'allow') next.allowed.push(domain);
    if (change.mode === 'temporary') next.temporary.push(domain);
    if (change.mode === 'block') next.blocked.push(domain);
  }
  return next;
}
export function explicitPermission(domain, state) {
  if (state.temporary.includes(domain)) return 'temporary';
  if (state.blocked.includes(domain)) return 'block';
  if (state.allowed.includes(domain)) return 'allow';
  return 'default';
}
