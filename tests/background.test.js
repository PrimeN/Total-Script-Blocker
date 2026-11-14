import test from 'node:test';
import assert from 'node:assert/strict';
const local = {}, session = {};
let listener, activeRules = [], imports = 0;
const area = data => ({get:async keys => Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,structuredClone(data[k])])),set:async values=>Object.assign(data,structuredClone(values)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},setAccessLevel:async()=>{},getBytesInUse:async()=>JSON.stringify(data).length});
global.chrome = {
 storage:{local:area(local),session:area(session),sync:area({}),onChanged:{addListener(){}}},
 alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener(){}}},
 runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getContexts:async()=>[],sendMessage:async()=>{imports++;return {whitelist:['example.com'],reload:false}},onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
 offscreen:{createDocument:async()=>{},closeDocument:async()=>{}},
 declarativeNetRequest:{getSessionRules:async()=>activeRules,updateSessionRules:async({addRules})=>{activeRules=structuredClone(addRules)}},
 action:{setIcon:async()=>{},setTitle:async()=>{},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},tabs:{onUpdated:{addListener(){}},query:async()=>[],get:async()=>({url:'https://example.com/path'}),reload:async()=>{},onRemoved:{addListener(){}},onActivated:{addListener(){}}},webRequest:{onBeforeRequest:{addListener(){}},onCompleted:{addListener(){}},onErrorOccurred:{addListener(){}}},webNavigation:{getFrame:async()=>({documentId:'current'}),onBeforeNavigate:{addListener(){}}},scripting:{executeScript:async()=>[]},browsingData:{remove:async()=>{}}
};
await import('../background.js');
const request = msg => new Promise(resolve => listener(msg,{id:'test',url:'chrome-extension://test/options.html'},resolve));
test('upgrade migrates once and persists durable settings', async () => {
 const result = await request({type:'state'});
 assert.deepEqual(result.data.allowed,['example.com']);assert.equal(result.data.reload,false);assert.equal(imports,1);
 await request({type:'state'});assert.equal(imports,1);
});
test('temporary permissions survive worker module reload but do not enter durable storage', async () => {
 await request({type:'permission',domain:'temp.example',mode:'temporary'});
 assert.deepEqual(session.temporary,['temp.example']);assert.deepEqual(local.settings.allowed,['example.com']);
 await import('../background.js?restart');
 const response=await request({type:'state'});assert.deepEqual(response.data.temporary,['temp.example']);
 assert.ok(activeRules.some(r=>r.condition.excludedRequestDomains?.includes('temp.example')));
});
test('concurrent writes are serialized and invalid permissions leave rules intact', async () => {
 await Promise.all(['one.example','two.example'].map(domain=>request({type:'permission',domain,mode:'allow'})));
 assert.ok(local.settings.allowed.includes('one.example'));assert.ok(local.settings.allowed.includes('two.example'));
 const previous=structuredClone(activeRules);
 const result=await request({type:'permission',domain:"evil.com/path",mode:'allow'});
 assert.ok(result.error);assert.deepEqual(activeRules,previous);
});
test('blocking a subdomain preserves parent trust; session reset restores blocking', async () => {
 await request({type:'permission',domain:'cdn.example.com',mode:'block'});
 assert.equal(local.settings.allowed.includes('example.com'),true);
 assert.ok(local.settings.blocked.includes('cdn.example.com'));
 await request({type:'pause'});assert.equal(activeRules.length,1);
 delete session.paused;delete session.temporary;
 await import('../background.js?browser-restart');
 await request({type:'state'});assert.ok(activeRules.length>1);
});

test('content scripts can report domains but cannot grant permission or use WOT credentials', async()=>{
 const sender={id:'test',url:'https://example.com/',tab:{id:7}};
 for(const type of ['permission','wot-config','wot-rating','clear-site-data'])assert.equal(listener({type,domain:'evil.example',mode:'allow'},sender,()=>{}),false);
 await new Promise(resolve=>listener({type:'source-report',sources:[{domain:'cdn.example.com',types:['script'],evidence:['page']}]},sender,resolve));
 assert.equal(session['sources:7'].sources[0].domain,'cdn.example.com');
 const sources=await request({type:'sources',tabId:7});assert.equal(sources.data.sources.length,1);
});
test('temporary grant does not erase durable denial, and revoke restores it',async()=>{
 await request({type:'permission',domain:'denied.example',mode:'block'});
 await request({type:'permission',domain:'denied.example',mode:'temporary'});
 assert.ok(local.settings.blocked.includes('denied.example'));
 assert.ok(activeRules.find(r=>r.id===14).condition.excludedRequestDomains.includes('denied.example'));
 await request({type:'revoke-temporary'});
 assert.equal(activeRules.find(r=>r.id===14).condition.excludedRequestDomains,undefined);
});
test('WOT credentials are local-only and absent from returned settings',async()=>{
 const saved=await request({type:'wot-config',userId:'123',apiKey:'private-key',automatic:true});
 assert.equal(saved.data.wot.configured,true);
 assert.equal(JSON.stringify(saved).includes('private-key'),false);
 assert.equal(local.wotConfig.apiKey,'private-key');
 await request({type:'wot-config',clear:true});
 assert.deepEqual(local.wotConfig,{});
});

test('reports from a previous document cannot contaminate current discovery',async()=>{
 const sender={id:'test',url:'https://old.example',tab:{id:42},frameId:0,documentId:'old'};
 await new Promise(resolve=>listener({type:'source-report',sources:[{domain:'old.example',types:['script']}]},sender,resolve));
 assert.equal(session['sources:42'],undefined);
});

test('staged batch applies together and exact session revocation leaves other grants',async()=>{
 const result=await request({type:'permissions-batch',changes:[{domain:'first.example',mode:'temporary'},{domain:'second.example',mode:'temporary'}],reload:false});
 assert.ok(result.data.temporary.includes('first.example'));assert.ok(result.data.temporary.includes('second.example'));
 await request({type:'revoke-temporary',domain:'first.example'});
 assert.ok(!session.temporary.includes('first.example'));assert.ok(session.temporary.includes('second.example'));
});
test('reset recovers corrupt settings and preserves WOT credentials',async()=>{
 await request({type:'wot-config',userId:'123',apiKey:'test-key'});
 local.settings={mode:'corrupt-mode'};
 const result=await request({type:'reset-rules'});
 assert.deepEqual(result.data.allowed,[]);assert.deepEqual(result.data.blocked,[]);assert.deepEqual(result.data.temporary,[]);
 assert.equal(result.data.mode,'whitelist');assert.equal(result.data.paused,false);assert.equal(result.data.wot.configured,true);
});

test('bulk temporary editing validates atomically and keeps permanent rules',async()=>{
 await request({type:'save-temporary',domains:['bulk.test','another.test']});
 assert.deepEqual(session.temporary,['another.test','bulk.test']);assert.deepEqual(local.settings.allowed,[]);
 const before=structuredClone(activeRules);
 const bad=await request({type:'save-temporary',domains:['invalid.test/path']});
 assert.ok(bad.error);assert.deepEqual(activeRules,before);assert.deepEqual(session.temporary,['another.test','bulk.test']);
});
test('timed grants expire and undo cannot resurrect expired trust',async()=>{
 await request({type:'permission',domain:'clock.test',mode:'temporary',duration:5});
 assert.ok(session.expiries['clock.test']>Date.now());
 session.expiries['clock.test']=Date.now()-1;
 const result=await request({type:'state'});assert.ok(!result.data.temporary.includes('clock.test'));
 await request({type:'undo'});assert.ok(!session.temporary.includes('clock.test'));
});
test('website edits are validated and undo restores their previous policy',async()=>{
 await request({type:'permissions-batch',scope:'website',website:'example.com',tabId:1,changes:[{domain:'cdn.test',mode:'allow'}]});
 assert.deepEqual(local.settings.sites['example.com'].allowed,['cdn.test']);
 await request({type:'undo'});assert.deepEqual(local.settings.sites,{});
 const result=await request({type:'permissions-batch',scope:'website',website:'wrong.test',tabId:1,changes:[]});assert.ok(result.error);
});
