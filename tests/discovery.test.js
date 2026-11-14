import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHost,mergeSources,SOURCE_LIMIT} from '../discovery.js';
test('discovery keeps domains only and rejects unsupported protocols',()=>{
 assert.equal(sourceHost('https://cdn.example.com/private/path?token=secret'),'cdn.example.com');
 assert.equal(sourceHost('data:text/html,hello'),null);
 assert.equal(sourceHost('chrome://settings'),null);
});
test('multiple frames and network events merge evidence without changing authority',()=>{
 const rows=mergeSources([{domain:'cdn.example',types:['script'],evidence:['page']}],[{domain:'cdn.example',types:['frame','script'],evidence:['browser-blocked','page']}]);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].types,['script','frame']);assert.deepEqual(rows[0].evidence,['page','browser-blocked']);
 assert.equal(rows[0].allowed,undefined);
});
test('bad and excessive page reports are bounded and sanitized',()=>{
 const rows=mergeSources([],[{domain:'evil.example/path'},{domain:'evil.example',types:{},evidence:{}},...Array.from({length:500},(_,i)=>({domain:`d${i}.example`,types:['script'],evidence:['request']}))]);
 assert.equal(rows.length,SOURCE_LIMIT);assert.ok(!rows.some(r=>r.domain.includes('/')));
});
