import test from 'node:test';
import assert from 'node:assert/strict';
import {editPermissions,explicitPermission} from '../permissions.js';
const state=()=>({allowed:['example.com'],blocked:[],temporary:[],paused:false});
test('blocking a child adds an exception and preserves parent and sibling grants',()=>{
 const next=editPermissions(state(),[{domain:'cdn.example.com',mode:'block'}]);
 assert.deepEqual(next.allowed,['example.com']);assert.deepEqual(next.blocked,['cdn.example.com']);
});
test('inherit removes the exact exception without deleting its parent rule',()=>{
 const next=editPermissions({...state(),blocked:['cdn.example.com']},[{domain:'cdn.example.com',mode:'default'}]);
 assert.deepEqual(next.allowed,['example.com']);assert.deepEqual(next.blocked,[]);
 assert.equal(explicitPermission('cdn.example.com',next),'default');
});
test('invalid staged batch is rejected without mutating original permissions',()=>{
 const original=state();
 assert.throws(()=>editPermissions(original,[{domain:'one.example',mode:'allow'},{domain:'evil.example/path',mode:'allow'}]));
 assert.deepEqual(original,state());
});
test('temporary override retains durable denial and can be restored on revoke',()=>{
 const next=editPermissions({...state(),blocked:['denied.example']},[{domain:'denied.example',mode:'temporary'}]);
 assert.deepEqual(next.blocked,['denied.example']);assert.deepEqual(next.temporary,['denied.example']);
});
