import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSavedSearchEvidence,loadSavedSearchEvidence,SAVED_SEARCH_QUERY} from '../server/dist/saved-search-evidence.mjs';
import {Operator} from '../server/dist/operator.mjs';
import {LocalStore} from '../server/dist/store.mjs';

const requested={startDate:'2026-10-01',endDate:'2026-10-28'};
function fixture(overrides={}){
  const base={
    source_run_id:'701596f5-8b3e-4380-968f-0e19436411a7',
    collected_at:'2026-10-30T09:50:14.650Z',
    start_date:'2026-10-01',end_date:'2026-10-28',source_status:'partial',
    source_row_count:2,error_code:null,property:'sc-domain:techehealthservices.com',
    fetched_at:'2026-10-30T09:50:14.176Z',row_index:0,query:'clinical operations consulting',
    page:'https://techehealthservices.com/practice-areas/',clicks:0,impressions:12,ctr:0,position:14.4,
    ...overrides
  };
  return JSON.stringify({success:true,results:[base,{...base,row_index:1,query:'consultant clinique',page:'https://techehealthservices.com/fr/',impressions:4}],meta:{changes:0,changed_db:false,rows_written:0}});
}

test('saved Search Console evidence preserves authenticated snapshot provenance without calling it live',()=>{
  const parsed=parseSavedSearchEvidence(fixture(),requested,new Date('2026-10-30T10:00:00Z'));
  assert.equal(parsed.sourceMode,'authenticated_saved_evidence');
  assert.equal(parsed.directLiveApiCall,false);
  assert.equal(parsed.sourceRunId,'701596f5-8b3e-4380-968f-0e19436411a7');
  assert.equal(parsed.coverage,'covers_requested_range');
  assert.equal(parsed.freshness,'current_snapshot');
  assert.equal(parsed.sourceStatus,'partial');
  assert.equal(parsed.rows.length,2);
  assert.match(parsed.sourceSha256,/^[a-f0-9]{64}$/);
  const transportVariant=JSON.parse(fixture());transportVariant.meta.duration=999;
  const repeated=parseSavedSearchEvidence(JSON.stringify(transportVariant),requested,new Date('2026-10-30T10:00:00Z'));
  assert.equal(repeated.sourceSha256,parsed.sourceSha256);
  assert.notEqual(repeated.responseSha256,parsed.responseSha256);
});

test('saved evidence parser rejects wrong scope, writes, malformed lineage, future evidence and no-overlap ranges',()=>{
  const cases=[
    fixture({property:'sc-domain:example.com'}),
    JSON.stringify({success:true,results:JSON.parse(fixture()).results,meta:{changes:1,changed_db:true,rows_written:1}}),
    fixture({source_row_count:3}),
    fixture({fetched_at:'2026-11-01T00:00:00.000Z'}),
    fixture({start_date:'2026-09-01',end_date:'2026-09-02'})
  ];
  for(const value of cases)assert.throws(()=>parseSavedSearchEvidence(value,requested,new Date('2026-10-30T10:00:00Z')));
});

test('saved evidence bridge invokes only fixed read-only Wrangler arguments',async()=>{
  let invocation;
  const result=await loadSavedSearchEvidence(requested,{},async(executable,args,options)=>{
    invocation={executable,args,options};return {stdout:fixture(),stderr:''};
  },new Date('2026-10-30T10:00:00Z'),{
    workspace:'C:\\Users\\tamon\\OneDrive\\Documents\\techehealthservices.com\\cloudflare-growth-intelligence',
    skipWorkspaceValidation:true
  });
  assert.equal(result.rows.length,2);
  assert.equal(invocation.executable,process.execPath);
  assert.ok(invocation.args.includes('teche-growth-intelligence-development'));
  assert.ok(invocation.args.includes('--remote'));
  assert.ok(invocation.args.includes('--env'));
  assert.ok(invocation.args.includes('development'));
  assert.ok(invocation.args.includes(SAVED_SEARCH_QUERY));
  assert.equal(invocation.options.shell,false);
});

test('operator stores saved evidence as partial provenance and exposes it to status and planning',async()=>{
  const store=new LocalStore(await mkdtemp(join(tmpdir(),'teche-saved-test-')));
  const saved=parseSavedSearchEvidence(fixture(),requested,new Date('2026-10-30T10:00:00Z'));
  const operator=new Operator(store,{},undefined,async()=>saved);
  const sync=await operator.call('teche_sync_search_evidence',requested);
  assert.equal(sync.status,'partial');
  assert.equal(sync.sourceMode,'authenticated_saved_evidence');
  assert.equal(sync.directLiveApiCall,false);
  const status=await operator.call('teche_get_status',{});
  assert.equal(status.providers.searchConsoleEvidence.sourceRunId,saved.sourceRunId);
  assert.equal(status.providers.searchConsoleEvidence.status,'partial');
  const plan=await operator.call('teche_build_action_plan',{});
  assert.equal(plan.searchEvidence.sourceMode,'authenticated_saved_evidence');
  assert.equal(plan.searchEvidence.status,'partial');
});
