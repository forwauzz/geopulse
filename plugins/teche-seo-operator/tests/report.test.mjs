import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateMarkdown,buildPrivatePdf,presentationSections} from '../server/dist/presentation.mjs';
import {buildDeepAuditReportPayload,buildDeepAuditMarkdown,runReportQaGate} from '../server/dist/engines.mjs';
const payload=issues=>buildDeepAuditReportPayload({scanId:'fixture',runId:'fixture',domain:'techehealthservices.com',seedUrl:'https://techehealthservices.com/',aggregateScore:81,aggregateLetterGrade:'B-',pages:[],allIssues:issues,highlightedIssues:issues,coverageSummary:{pages_fetched:0}});
test('warnings and unknown evidence never become blocked-access recommendations; default report unchanged',()=>{
 for(const status of ['WARNING','NOT_EVALUATED','BLOCKED']){
  const p=payload([{checkId:'ai-crawler-access',check:'AI retrieval agent access (robots.txt)',weight:10,status,passed:false,finding:'Policy observation; access not established.'},{checkId:'llms-txt',check:'Optional llms.txt',status:'NOT_EVALUATED',finding:'Optional resource unavailable.'}]);
  const frozen=JSON.stringify(p),shared=buildDeepAuditMarkdown(p),md=buildPrivateMarkdown(p);
  assert.ok(!md.includes('Allow AI crawlers to fetch'));assert.ok(!md.includes('Top blocker'));assert.ok(!md.includes('resolve the access question'));
  assert.ok(md.includes('Not evaluated or blocked - no inferred cause'));assert.ok(md.includes('Optional resource unavailable.'));
  assert.equal(presentationSections(p)[1].cards[0].title,'No FAIL observations in this sample');
  if(status==='WARNING')assert.ok(shared.includes('Top blocker'));
  assert.equal(buildDeepAuditMarkdown(p),shared);assert.equal(JSON.stringify(p),frozen);
  assert.equal(runReportQaGate({issues:p.allIssues}).ok,true);
 }
});
test('long findings/actions paginate without overlapping cards or leaving page bounds',async()=>{
 const p=payload(Array.from({length:3},(_,i)=>({checkId:'fixture-'+i,check:'Confirmed finding '+i,status:'FAIL',passed:false,weight:5,finding:'A detailed observed finding needs review. '.repeat(90),fix:'Review the affected page and verify the intended behavior. '.repeat(50)})));
 const {bytes,layout}=await buildPrivatePdf(p);
 assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');assert.ok(layout.length>3);
 for(const [i,card] of layout.entries()){
  assert.ok(card.bottom>=48&&card.top<=748);
  if(i&&layout[i-1].page===card.page)assert.ok(layout[i-1].bottom>card.top);
 }
});
