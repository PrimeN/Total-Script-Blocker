import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
const root = new URL('../',import.meta.url);
test('MV3 manifest references packaged files and fail-closed baseline', async () => {
 const m=JSON.parse(await readFile(new URL('manifest.json',root)));
 assert.equal(m.manifest_version,3);assert.equal(m.background.type,'module');
 assert.equal(m.browser_action,undefined);assert.equal(m.incognito,'not_allowed');
 const files=[m.background.service_worker,m.action.default_popup,m.options_page,...Object.values(m.icons),...m.declarative_net_request.rule_resources.map(r=>r.path)];
 await Promise.all(files.map(file=>access(new URL(file,root))));
 const baseline=JSON.parse(await readFile(new URL('rules/baseline.json',root)));
 assert.ok(baseline.some(r=>r.action.type==='block'));
 assert.ok(baseline.some(r=>r.action.responseHeaders?.some(h=>h.value.includes("script-src 'none'"))));
});
