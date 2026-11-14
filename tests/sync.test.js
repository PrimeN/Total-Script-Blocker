import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSnapshot,decodeSnapshot,createSync} from '../sync.js';
import {normalizeSettings} from '../rules.js';
const HEAD='tsb.sync.head';
function area(initial={}){
  const data=structuredClone(initial);
  return {data,async get(keys){return structuredClone(keys==null?data:Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,data[k]])));},async set(values){Object.assign(data,structuredClone(values));},async getBytesInUse(){return JSON.stringify(data).length;}};
}
function device(shared=area(),settings={}){
  const local=area({settings:normalizeSettings(settings)}),alarms=[];
  const api={storage:{local,sync:shared},alarms:{async create(name){alarms.push(name);},async clear(){}}};
  return {local,shared,api,alarms,sync:createSync(api,async settings=>local.set({settings}))};
}
async function publish(shared,settings){const s=await encodeSnapshot(settings);await shared.set({...s.parts,[HEAD]:s.head});return s;}
test('large sync snapshots round-trip within per-item quota and exclude device data',async()=>{
  const allowed=Array.from({length:500},(_,i)=>`domain-${i}.example.com`);
  const snapshot=await encodeSnapshot({allowed,temporary:['secret.test'],wotConfig:{apiKey:'secret'},paused:true});
  const data={...snapshot.parts,[HEAD]:snapshot.head};
  assert.ok(snapshot.head.count>1);
  for(const [key,value]of Object.entries(data))assert.ok(new TextEncoder().encode(key+JSON.stringify(value)).length<8192);
  assert.deepEqual((await decodeSnapshot(data)).settings,normalizeSettings({allowed}));
  assert.ok(!JSON.stringify(data).includes('secret'));
});
test('missing, mixed and corrupted snapshots never become settings',async()=>{
  const s=await encodeSnapshot({allowed:['trusted.test']});
  await assert.rejects(decodeSnapshot({[HEAD]:s.head}),/Waiting/);
  const data={...s.parts,[HEAD]:s.head};data['tsb.sync.part.0'].data+=' ';
  await assert.rejects(decodeSnapshot(data),/incomplete/);
  await assert.rejects(decodeSnapshot({[HEAD]:{version:2}}),/Unsupported/);
});
test('sync is opt-in and local upload can be consumed by another device with backup',async()=>{
  const a=device(undefined,{allowed:['one.test']});const b=device(a.shared,{allowed:['two.test']});
  await a.sync.changed();await a.sync.reconcile();assert.deepEqual(a.shared.data,{});
  await a.sync.configure('local');await b.sync.reconcile();assert.deepEqual(b.local.data.settings.allowed,['two.test']);
  await b.sync.configure('remote');assert.deepEqual(b.local.data.settings.allowed,['one.test']);
  assert.deepEqual(b.local.data.syncBackup.settings.allowed,['two.test']);
  await b.sync.restore();assert.deepEqual(b.local.data.settings.allowed,['two.test']);assert.equal((await b.sync.status()).enabled,false);
});
test('pending local edits conflict with remote edits and require explicit resolution',async()=>{
  const a=device();await a.sync.configure('local');
  await a.local.set({settings:normalizeSettings({allowed:['local.test']})});await a.sync.changed();
  await publish(a.shared,{allowed:['remote.test']});await a.sync.reconcile();
  assert.equal((await a.sync.status()).conflict,true);assert.deepEqual(a.local.data.settings.allowed,['local.test']);
  await a.sync.configure('remote');assert.deepEqual(a.local.data.settings.allowed,['remote.test']);
});
test('interrupted upload resumes after service-worker restart',async()=>{
  const a=device();await a.sync.configure('local');
  await a.local.set({settings:normalizeSettings({allowed:['new.test']})});await a.sync.changed();
  const set=a.shared.set.bind(a.shared);let fail=true;
  a.shared.set=async values=>{if(values[HEAD]&&fail){fail=false;throw new Error('quota retry');}await set(values);};
  await a.sync.reconcile();assert.match((await a.sync.status()).error,/quota/);assert.ok(a.alarms.length);
  const restarted=createSync(a.api,async settings=>a.local.set({settings}));
  await restarted.reconcile();assert.equal((await restarted.status()).pending,false);
  assert.deepEqual((await decodeSnapshot(a.shared.data)).settings.allowed,['new.test']);
});
test('incomplete incoming data preserves local protection until the remaining parts arrive',async()=>{
  const a=device(undefined,{allowed:['old.test']});await a.sync.configure('local');
  const s=await encodeSnapshot({allowed:['new.test']});await a.shared.set({[HEAD]:s.head});
  await a.sync.reconcile();assert.deepEqual(a.local.data.settings.allowed,['old.test']);
  await a.shared.set(s.parts);await a.sync.reconcile();assert.deepEqual(a.local.data.settings.allowed,['new.test']);
});
test('oversized settings remain local with a visible sync error',async()=>{
  const a=device();await a.sync.configure('local');
  const allowed=Array.from({length:500},(_,i)=>`${'a'.repeat(200)}${i}.test`);
  await a.local.set({settings:normalizeSettings({allowed})});await a.sync.changed();await a.sync.reconcile();
  assert.match((await a.sync.status()).error,/capacity/);assert.equal(a.local.data.settings.allowed.length,500);
});
