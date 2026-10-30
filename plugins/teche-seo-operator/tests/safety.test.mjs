import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {siteUrl,publicAddress,createSiteFetch,withSiteBudget,ORIGIN} from '../server/dist/policy.mjs';
import {Operator,schemas} from '../server/dist/operator.mjs';
import {LocalStore} from '../server/dist/store.mjs';
const fresh=async()=>new LocalStore(await mkdtemp(join(tmpdir(),'teche-test-')));
test('exactly six bounded tools; no arbitrary fields or excess pages',()=>{
 assert.equal(Object.keys(schemas).length,6);
 assert.equal(schemas.teche_get_status.safeParse({shell:'whoami'}).success,false);
 assert.equal(schemas.teche_run_site_audit.safeParse({maxPages:6}).success,false);
});
test('fixed domain and HTTPS, no private IP, administration, query, credentials or fragment',async()=>{
 for(const url of ['https://evil.test','http://techehealthservices.com','https://localhost','https://127.0.0.1','https://[::1]','https://techehealthservices.com.evil.test','https://x:password@techehealthservices.com','https://techehealthservices.com:8443','https://techehealthservices.com/wp-admin','https://techehealthservices.com/%77p-json','https://techehealthservices.com/?a=1','https://techehealthservices.com/#x'])await assert.rejects(()=>siteUrl(url),undefined,url);
 assert.equal(await siteUrl(ORIGIN+'/services/'),ORIGIN+'/services/');
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1','224.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);
});
test('off-host redirects stop before a second request; request and method budgets fail closed',async()=>{
 let requests=0;const fetch=createSiteFetch(async()=>{requests++;return new Response('',{status:302,headers:{location:'https://evil.test'}})});
 await withSiteBudget(async()=>assert.rejects(()=>fetch(ORIGIN)));
 assert.equal(requests,1);
 const ok=createSiteFetch(async()=>new Response('ok'));
 await assert.rejects(()=>ok(ORIGIN));
 await withSiteBudget(async()=>{await ok(ORIGIN);await assert.rejects(()=>ok(ORIGIN));},1);
 await withSiteBudget(async()=>assert.rejects(()=>ok(ORIGIN,{method:'POST'})));
});
test('store refuses concurrent writers and overwrites, preserves complete immutable evidence',async()=>{
 const s=await fresh();await s.locked(async()=>{
   await assert.rejects(()=>new LocalStore(s.root).locked(async()=>{}),/store_busy/);
   await s.append('first',{value:1});await s.append('second',{value:2});
   const id=randomUUID();const a=await s.artifact(id,'audit.md','original');
   await assert.rejects(()=>s.artifact(id,'audit.md','replacement'),/artifact_exists/);
   assert.equal(await readFile(a.path,'utf8'),'original');
 });
 assert.deepEqual((await s.entries()).map(e=>e.kind),['first','second']);
 await writeFile(join(s.root,'writer.lock'),'stale');
 await assert.rejects(()=>s.locked(async()=>{}),/recovery_required/);
});
test('missing providers are unknown, concurrent calls serialize, three attempts halt unchanged lineage',async()=>{
 const unavailableSavedEvidence=async()=>{throw Error('saved evidence unavailable fixture');};
 const s=await fresh(),op=new Operator(s,{},undefined,unavailableSavedEvidence);
 const results=await Promise.all(Array.from({length:3},()=>op.call('teche_measure_ai_visibility',{})));
 assert.ok(results.every(r=>r.status==='unavailable'&&r.observations===null));
 await assert.rejects(()=>op.call('teche_measure_ai_visibility',{}),/retry_limit/);
 const status=await op.call('teche_get_status',{});assert.equal(status.providers.database,'not_required');
 assert.equal(status.providers.dataForSeo,'skipped');
 const search=await op.call('teche_sync_search_evidence',{startDate:'2026-10-01',endDate:'2026-10-02'});
 assert.equal(search.rows,null);assert.equal(search.status,'unavailable');
 await assert.rejects(()=>op.call('teche_sync_search_evidence',{startDate:'2026-02-30',endDate:'2026-03-01'}));
});
test('paid calls reserve budget before transport; per-run/monthly cap and secrets retained safely',async()=>{
 const s=await fresh();let calls=0;
 const env={PERPLEXITY_API_KEY:'secret-fixture',TECHE_PERPLEXITY_RUN_REQUEST_CAP:'1',TECHE_PERPLEXITY_MONTH_REQUEST_CAP:'1',TECHE_PERPLEXITY_RESERVED_USD_PER_REQUEST:'0.1',TECHE_PERPLEXITY_MONTH_USD_CAP:'0.1'};
 const transport=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'Teché secret-fixture'}}]}),{headers:{'content-type':'application/json'}})};
 const op=new Operator(s,env,transport);
 await op.call('teche_measure_ai_visibility',{});await op.call('teche_measure_ai_visibility',{});
 assert.equal(calls,1);const entries=await s.entries();assert.equal(entries.filter(e=>e.kind==='provider_reservation').length,1);
 assert.ok(!JSON.stringify(entries).includes('secret-fixture'));
 const none=new Operator(await fresh(),{PERPLEXITY_API_KEY:'secret'},transport);
 assert.equal((await none.call('teche_measure_ai_visibility',{})).status,'skipped');assert.equal(calls,1);
});
test('verification produces new observations without changing original finding',async()=>{
 const s=await fresh(),id=randomUUID();await s.locked(()=>s.append('result',{tool:'teche_run_site_audit',runId:id,status:'completed',findings:[{status:'FAIL'}]}));
 const before=JSON.stringify(await s.entries());const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response('<html><title>Teché</title><body>Observed</body></html>',{headers:{'content-type':'text/html'}});
 try{const result=await new Operator(s,{}).call('teche_verify_urls',{urls:[ORIGIN+'/'],originalRunId:id});assert.equal(result.originalRunId,id);assert.notEqual(result.runId,id);assert.equal(result.status,'completed');}
 finally{globalThis.fetch=previous;}
 assert.equal(JSON.stringify((await s.entries()).slice(0,1)),before);
});
test('request and dollar caps independently constrain provider attempts; failed calls stay reserved',async()=>{
 for(const scenario of [
  {run:'1',month:'30',usd:'5',expected:1},
  {run:'3',month:'1',usd:'5',expected:1},
  {run:'3',month:'30',usd:'0.1',expected:1},
  {run:'3',month:'30',usd:'5',expected:3}
 ]){
  let calls=0;const s=await fresh();
  const op=new Operator(s,{PERPLEXITY_API_KEY:'fixture',TECHE_PERPLEXITY_RUN_REQUEST_CAP:scenario.run,TECHE_PERPLEXITY_MONTH_REQUEST_CAP:scenario.month,TECHE_PERPLEXITY_RESERVED_USD_PER_REQUEST:'0.1',TECHE_PERPLEXITY_MONTH_USD_CAP:scenario.usd},async()=>{calls++;return new Response('provider failure',{status:503})});
  await op.call('teche_measure_ai_visibility',{});
  assert.equal(calls,scenario.expected);assert.equal((await s.entries()).filter(e=>e.kind==='provider_reservation').length,calls);
 }
});
