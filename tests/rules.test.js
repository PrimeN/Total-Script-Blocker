import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDomains, isAllowed, buildRules} from '../rules.js';
test('domain parsing rejects CSP/filter injection and ambiguous scope', () => {
  assert.deepEqual(normalizeDomains(['Example.COM','https://example.com/','*.cdn.example.com']),['cdn.example.com','example.com']);
  for (const value of ['evil.com/path','evil.com:443',"evil.com 'unsafe-inline'",'user@evil.com','https://evil.com/path','https://evil.com:8443/','<all_urls>','ftp://evil.com/']) assert.throws(() => normalizeDomains([value]),value);
  assert.throws(() => normalizeDomains(Array.from({length:501},(_,i) => `d${i}.example.com`)));
});
test('domain permissions do not match a sibling or suffix attack', () => {
  assert.ok(isAllowed('cdn.example.com',['example.com']));
  assert.equal(isAllowed('example.com.evil.com',['example.com']),false);
  assert.equal(isAllowed('badexample.com',['example.com']),false);
});
test('blocking rules use higher priority than baseline bypass', () => {
  const rules = buildRules([]);
  assert.equal(rules[0].action.type,'allow');
  assert.ok(rules[0].condition.resourceTypes.includes('main_frame'),'main_frame must be explicit: Chrome excludes it by default');
  assert.ok(rules.slice(1).every(r => r.priority > rules[0].priority));
  assert.match(rules[2].action.responseHeaders[0].value,/script-src 'none'/);
  assert.equal(rules[1].condition.excludedRequestDomains,undefined);
});
test('inline permission belongs to the document domain; workers stay disabled', () => {
  const rules = buildRules(['example.com']);
  assert.deepEqual(rules[1].condition.excludedRequestDomains,['example.com']);
  assert.deepEqual(rules[2].condition.excludedRequestDomains,['example.com']);
  assert.deepEqual(rules[3].condition.requestDomains,['example.com']);
  assert.doesNotMatch(rules[2].action.responseHeaders[0].value,/unsafe-inline/);
  assert.match(rules[3].action.responseHeaders[0].value,/unsafe-inline/);
  assert.match(rules[3].action.responseHeaders[0].value,/worker-src 'none'/);
  assert.equal(rules[3].action.responseHeaders[0].operation,'append');
});
test('pause suppresses baseline without adding a blocking rule', () => assert.equal(buildRules([],true).length,1));


test('explicit denials override permanent grants, with temporary exceptions',()=>{
 const rules=buildRules(['example.com','temp.example.com'],false,{blocked:['example.com'],temporary:['temp.example.com']});
 assert.equal(rules.find(r=>r.id===14).priority,30);
 assert.deepEqual(rules.find(r=>r.id===14).condition.excludedRequestDomains,['temp.example.com']);
 assert.deepEqual(rules.find(r=>r.id===15).condition.excludedRequestDomains,['temp.example.com']);
 assert.deepEqual(rules.find(r=>r.id===16).condition.requestDomains,['temp.example.com']);
});
test('same-origin mode is restricted by CSP self and explicit denials',()=>{
 const rules=buildRules([],false,{mode:'same-origin',blocked:['bad.example']});
 assert.equal(rules.find(r=>r.id===11).condition.domainType,'thirdParty');
 assert.match(rules.find(r=>r.id===12).action.responseHeaders[0].value,/script-src 'self' 'unsafe-inline'/);
 assert.match(rules.find(r=>r.id===15).action.responseHeaders[0].value,/script-src 'none'/);
});
test('blocklist mode retains denials; resource opt-outs omit directives',()=>{
 const rules=buildRules([],false,{mode:'blacklist',blocked:['bad.example'],blockFrames:false,blockObjects:false,blockWorkers:false});
 assert.equal(rules.find(r=>r.id===11),undefined);
 assert.deepEqual(rules.find(r=>r.id===14).condition.resourceTypes,['script']);
 assert.doesNotMatch(rules.find(r=>r.id===12).action.responseHeaders[0].value,/frame-src|object-src|worker-src/);
});

test('inline protection and external-script protection can be configured independently',()=>{
 const externalOnly=buildRules([],false,{blockInline:false});
 assert.match(externalOnly.find(r=>r.id===12).action.responseHeaders[0].value,/unsafe-inline/);
 assert.ok(externalOnly.find(r=>r.id===11).condition.resourceTypes.includes('script'));
 const inlineOnly=buildRules([],false,{blockScripts:false,blockInline:true});
 assert.ok(!inlineOnly.find(r=>r.id===11).condition.resourceTypes.includes('script'));
 assert.match(inlineOnly.find(r=>r.id===12).action.responseHeaders[0].value,/script-src \* data: blob:/);
 assert.doesNotMatch(inlineOnly.find(r=>r.id===12).action.responseHeaders[0].value,/unsafe-inline/);
});
