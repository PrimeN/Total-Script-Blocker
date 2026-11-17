import test from 'node:test';
import assert from 'node:assert/strict';
import {scorecardURL,parseRating,fetchRating} from '../reputation.js';
const fixture=[{target:'example.com',safety:{status:'NOT_SAFE',reputations:27,confidence:8},childSafety:{},categories:[{name:'phishing',confidence:51}]}];
test('official WOT v3 scores retain confidence and unknown child scores',()=>{
 const r=parseRating(fixture,'example.com');assert.equal(r.score,27);assert.equal(r.confidence,8);assert.equal(r.childScore,null);assert.equal(r.status,'NOT_SAFE');
 assert.equal(r.categories[0].name,'phishing');
});
test('unknown and invalid scores never become a safe classification',()=>{
 const r=parseRating([{target:'example.com',safety:{status:'nonsense',reputation:-1,confidence:1000}}],'example.com');
 assert.equal(r.status,'UNKNOWN');assert.equal(r.score,null);assert.equal(r.confidence,null);
 assert.throws(()=>parseRating(fixture,'different.example'));
 assert.equal(scorecardURL('example.com'),'https://www.mywot.com/scorecard/example.com');
});
test('WOT requests use official HTTPS endpoint, domain only and credentials in headers',async()=>{
 const result=await fetchRating('example.com',{apiKey:'key',userId:'123'},async(url,options)=>{
   assert.equal(url,'https://scorecard.api.mywot.com/v3/targets?t=example.com');
   assert.equal(options.headers['x-api-key'],'key');assert.equal(options.headers['x-user-id'],'123');
   assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
   return {ok:true,json:async()=>fixture};
 });assert.equal(result.score,27);
});
test('missing credentials, quota, network, auth and malformed responses are explicit',async()=>{
 await assert.rejects(fetchRating('example.com',{}),/Configure/);
 for(const [status,pattern]of [[403,/credentials/],[429,/quota/],[500,/unavailable/]])await assert.rejects(fetchRating('example.com',{apiKey:'key',userId:'123'},async()=>({ok:false,status})),pattern);
 await assert.rejects(fetchRating('example.com',{apiKey:'key',userId:'123'},async()=>{throw Error('key=secret')}),/could not connect/);
 await assert.rejects(fetchRating('example.com',{apiKey:'key',userId:'123'},async()=>({ok:true,json:async()=>({})})),/unsupported/);
});
