import { randomUUID,createHash } from 'node:crypto';
import { z } from 'zod';
import { LocalStore } from './store';
import { DOMAIN,ORIGIN,MAX_PAGES,createSiteFetch,withSiteBudget,siteUrl,secureRequest } from './policy';
import * as engine from './engines';
import {buildPrivateMarkdown,buildPrivatePdf} from './presentation';
import {loadSavedSearchEvidence,savedEvidenceBridgeConfigured,savedEvidenceReason} from './saved-search-evidence';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const urls=z.array(z.string().max(2048)).min(1).max(MAX_PAGES);
export const schemas={
  teche_get_status:z.object({}).strict(),
  teche_run_site_audit:z.object({maxPages:z.number().int().min(1).max(MAX_PAGES).default(3)}).strict(),
  teche_sync_search_evidence:z.object({startDate:date,endDate:date}).strict(),
  teche_measure_ai_visibility:z.object({}).strict(),
  teche_build_action_plan:z.object({}).strict(),
  teche_verify_urls:z.object({urls,originalRunId:z.string().uuid()}).strict()
};
export const descriptions={
  teche_get_status:'Read private local status and provider availability; no network.',
  teche_run_site_audit:'Bounded read-only Teché crawl; retain evidence and QA-gated PDF/Markdown.',
  teche_sync_search_evidence:'Read final Search Console query/page evidence for Teché, at most31 days.',
  teche_measure_ai_visibility:'Run fixed Teché discovery prompts only with existing Perplexity access and caps.',
  teche_build_action_plan:'Build a local review-only action plan from retained evidence, not publication authority.',
  teche_verify_urls:'Store fresh Teché URL evidence separately, linked to an original local audit.'
};
type Tool=keyof typeof schemas;
type Env=Record<string,string|undefined>;
type SavedEvidenceLoader=(args:{startDate:string;endDate:string},env:Env)=>Promise<any>;
const queries=[
  'Which consultants help Quebec clinics select and implement electronic medical records?',
  'Which consultants help Quebec clinics improve clinical operations and workflows?'
];
const noLlm={generate:async()=>{throw Error('llm_disabled');}} as any;
function hash(x:unknown){return createHash('sha256').update(JSON.stringify(x)).digest('hex');}
function clean(value:unknown,env:Env):any{
  let text=JSON.stringify(value);
  for(const [k,v] of Object.entries(env))if(v && /KEY|TOKEN|SECRET|PASSWORD/i.test(k))text=text.split(v).join('[REDACTED]');
  return JSON.parse(text);
}
function cap(env:Env,key:string,max:number){
  const n=Number(env[key]);return Number.isFinite(n)&&n>0?Math.min(n,max):0;
}

export class Operator {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(readonly store=new LocalStore(),readonly env:Env=process.env,
    private readonly providerTransport:typeof secureRequest=secureRequest,
    private readonly savedEvidenceLoader:SavedEvidenceLoader=loadSavedSearchEvidence){}
  call(name:string,input:unknown):Promise<any>{
    const next=this.queue.then(()=>this.store.locked(()=>this.execute(name,input)));
    this.queue=next.catch(()=>{});return next;
  }
  availability(){
    const direct=Boolean(this.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN);
    const saved=savedEvidenceBridgeConfigured(this.env);
    return {
      searchConsole:direct?'direct_live_api_configured_unverified':saved?'saved_evidence_bridge_configured_unverified':'unavailable',
      searchConsoleDirectApi:direct?'configured_unverified':'unavailable',
      searchConsoleSavedEvidence:saved?'configured_unverified':'unavailable',
      perplexity:this.env.PERPLEXITY_API_KEY?'configured_unverified':'unavailable',
      dataForSeo:'skipped',
      dataForSeoReason:'No rank requests in the six-tool v1 contract; paid rank execution cap is zero.',
      database:'not_required'
    };
  }
  private async execute(name:string,raw:unknown){
    if(!(name in schemas))throw Error('unknown_tool');
    const tool=name as Tool;
    const parsed=schemas[tool].safeParse(raw);
    if(!parsed.success)throw Error('invalid_arguments');
    const args:any=parsed.data;
    if(tool==='teche_verify_urls')await Promise.all(args.urls.map(siteUrl));
    if(tool==='teche_sync_search_evidence'){
      const a=Date.parse(args.startDate+'T00:00:00Z'),b=Date.parse(args.endDate+'T00:00:00Z');
      if(!Number.isFinite(a+b)||b<a||b-a>30*86400000||
        new Date(a).toISOString().slice(0,10)!==args.startDate||
        new Date(b).toISOString().slice(0,10)!==args.endDate||b>Date.now())throw Error('date_range_rejected');
    }
    const entries=await this.store.entries();
    if(tool==='teche_get_status')return {
      domain:DOMAIN,providers:{...this.availability(),searchConsoleEvidence:(()=>{
        const latest=entries.filter(e=>e.kind==='result'&&e.data.tool==='teche_sync_search_evidence').at(-1)?.data;
        return latest?{status:latest.status,sourceMode:latest.sourceMode??null,sourceRunId:latest.sourceRunId??null,
          fetchedAt:latest.fetchedAt??null,evidenceRange:latest.evidenceRange??null,coverage:latest.coverage??null,
          freshness:latest.freshness??null}:null;
      })()},entries:entries.length,
      latestRun:(()=>{const latest=entries.filter(e=>e.kind==='result').at(-1)?.data;
        return latest?{runId:latest.runId,tool:latest.tool,status:latest.status,at:latest.at,
          reviewHold:entries.some(e=>e.kind==='review_hold'&&e.data.runId===latest.runId)}:null;})(),
      stateRoot:this.store.root,readOnly:true
    };
    const lineage=hash({tool,args});
    const history=entries.filter(e=>e.data.lineage===lineage);
    let failures=0;
    for(const e of history.slice().reverse()){if(e.kind==='result'&&e.data.status==='completed')break;if(e.kind==='attempt')failures++;}
    if(failures>=3)throw Error('lineage_retry_limit');
    const runId=randomUUID();
    await this.store.append('attempt',{tool,runId,lineage});
    try{
      const result=await withSiteBudget(async()=>{
        if(tool==='teche_run_site_audit')return this.audit(runId,args.maxPages);
        if(tool==='teche_verify_urls')return this.verify(runId,args,entries);
        if(tool==='teche_sync_search_evidence')return this.search(args);
        if(tool==='teche_measure_ai_visibility')return this.visibility(runId);
        return this.plan(entries);
      });
      const safe=clean({tool,runId,lineage,at:new Date().toISOString(),...result},this.env);
      await this.store.append('result',safe);return safe;
    }catch{
      const failure={tool,runId,lineage,status:'failed',reason:'bounded_operation_failed',at:new Date().toISOString()};
      await this.store.append('result',failure);return failure; // no provider bodies, secrets or stack traces
    }
  }
  private async audit(runId:string,maxPages:number){
    const robots=await engine.fetchGateText(ORIGIN+'/robots.txt',{maxBytes:32000,acceptHeader:'text/plain'});
    const llms=await engine.fetchGateText(ORIGIN+'/llms.txt',{maxBytes:32000,acceptHeader:'text/plain'});
    const pages:any[]=[];const evidence:any[]=[];const pending=[ORIGIN+'/'];const visited=new Set<string>();
    while(pending.length && visited.size<maxPages){
      const url=pending.shift()!;if(visited.has(url))continue;visited.add(url);
      const fetched=await engine.fetchPage(url);
      if(!fetched.ok){evidence.push({url,status:'unavailable',reason:'fetch_failed',at:new Date().toISOString()});continue;}
      const scan=await engine.auditPageFromHtml(fetched.finalUrl,fetched.html,noLlm,{
        useLlm:false,robotsTxtContent:robots.ok?robots.text:undefined,
        llmsTxtContent:llms.ok?llms.text:undefined,responseHeaders:fetched.headers
      });
      // Missing side-resource evidence is unknown, not a failed crawler-policy finding.
      const issues=scan.issues.map(i=>(!robots.ok&&i.checkId==='ai-crawler-access')||(!llms.ok&&i.checkId==='llms-txt')
        ? {...i,status:'NOT_EVALUATED',passed:false,finding:'Side resource unavailable; not evaluated.'}:i);
      const pageScore=engine.computeScore(issues.map(i=>({...i,id:i.checkId})) as any);
      pages.push({url:fetched.finalUrl,score:pageScore,letter_grade:engine.letterGrade(pageScore),issues_json:issues});
      evidence.push({url,finalUrl:fetched.finalUrl,redirectChain:fetched.redirectChain,bodySha256:hash(fetched.html),
        at:new Date().toISOString(),status:'observed',issues});
      const candidates=engine.extractSameOriginLinks(fetched.html,fetched.finalUrl,50);
      const safe:string[]=[];
      for(const candidate of candidates){try{const allowed=await siteUrl(candidate);
        if(!/^\/(category|tag|author|feed)\//.test(new URL(allowed).pathname))safe.push(allowed);
      }catch{/* ignore off-policy links */}}
      pending.push(...engine.prioritizeUrlsBySection(ORIGIN+'/',safe,maxPages).filter(u=>!visited.has(u)));
    }
    if(!pages.length)return {status:'unavailable',reason:'no_pages_retrieved',evidence};
    const dedup=new Map<string,any>();
    for(const page of pages)for(const issue of page.issues_json){
      const prior=dedup.get(issue.checkId);
      const severity=(s:string)=>s==='FAIL'?4:s==='WARNING'?3:s==='NOT_EVALUATED'?2:1;
      if(!prior||severity(issue.status)>severity(prior.status))dedup.set(issue.checkId,issue);
    }
    const resolved=engine.resolveReportContradictions([...dedup.values()]);
    const qa=engine.runReportQaGate({issues:resolved.issues});
    const score=Math.round(pages.reduce((n,p)=>n+p.score,0)/pages.length);
    const payload=engine.buildDeepAuditReportPayload({
      scanId:runId,runId,domain:DOMAIN,seedUrl:ORIGIN+'/',aggregateScore:score,aggregateLetterGrade:engine.letterGrade(score),
      pages,allIssues:resolved.issues,
      highlightedIssues:resolved.issues.filter(i=>i.status==='FAIL').slice(0,5),
      coverageSummary:{pages_fetched:pages.length,urls_planned:visited.size,browser_render_enabled:false,
        note:'Bounded deterministic crawl, not full-site indexation or AI visibility. No LLM/provider assessment.',
        gaps:['Search Console and AI visibility are separate evidence tools.']},
    });
    const safePayload=clean(payload,this.env);
    const data=await this.store.artifact(runId,'audit.json',JSON.stringify(clean({payload:safePayload,evidence,qa,resolutions:resolved.resolutions},this.env),null,2));
    if(!qa.ok)return {status:'failed',reason:'report_qa_failed',qa,artifacts:{data}};
    const markdown=await this.store.artifact(runId,'audit.md',buildPrivateMarkdown(safePayload));
    const privatePdf=await buildPrivatePdf(safePayload);
    const pdf=await this.store.artifact(runId,'audit.pdf',privatePdf.bytes);
    return {status:'completed',coverage:{pages:pages.length,attempted:visited.size,maxPages},qa,
      artifacts:{data,markdown,pdf},findings:resolved.issues,providers:{llm:'skipped'},evidence};
  }
  private async verify(runId:string,args:any,entries:any[]){
    const original=entries.find(e=>e.kind==='result'&&e.data.runId===args.originalRunId&&e.data.tool==='teche_run_site_audit');
    if(!original)throw Error('original_audit_not_found');
    const observations=[];
    for(const url of args.urls){
      const result=await engine.fetchPage(url);
      observations.push(result.ok?{url,at:new Date().toISOString(),status:'observed',finalUrl:result.finalUrl,
        bodySha256:hash(result.html),redirectChain:result.redirectChain}:
        {url,at:new Date().toISOString(),status:'unavailable'});
    }
    return {status:observations.every(o=>o.status==='observed')?'completed':'partial',originalRunId:args.originalRunId,
      observations,note:'Fresh reachability/content evidence only; does not itself prove remediation or indexing.'};
  }
  private async search(args:{startDate:string;endDate:string}){
    const token=this.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN;
    if(!token){
      try{
        const saved=await this.savedEvidenceLoader(args,this.env);
        const status=saved.sourceStatus==='completed'&&saved.coverage==='covers_requested_range'&&saved.freshness==='current_snapshot'
          ?'completed':'partial';
        return {status,provider:'search_console',...args,...saved,
          dataForSeo:{status:'skipped',reason:'rank_execution_disabled_zero_cap'}};
      }catch(error){
        return {status:'unavailable',provider:'search_console',sourceMode:'authenticated_saved_evidence',
          directLiveApiCall:false,reason:savedEvidenceReason(error),rows:null};
      }
    }
    const fetcher=(async(input:any,init:any)=>{
      const expected='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent('sc-domain:'+DOMAIN)+'/searchAnalytics/query';
      if(input!==expected)throw Error('provider_endpoint_rejected');
      const response=await this.providerTransport(expected,{...init,signal:AbortSignal.timeout(15000)});
      if(response.status>=300&&response.status<400)throw Error('provider_redirect_rejected');
      return response;
    }) as typeof fetch;
    const rows=await engine.fetchSearchConsoleRows({accessToken:token,siteUrl:'sc-domain:'+DOMAIN,...args,rowLimit:500},fetcher);
    const safe=[];
    for(const row of rows){
      if(row.page){try{await siteUrl(row.page);}catch{continue;}}
      safe.push(row);
    }
    const fetchedAt=new Date().toISOString();
    return {status:'completed',provider:'search_console',property:'sc-domain:'+DOMAIN,...args,rows:safe,
      sourceMode:'direct_live_api',directLiveApiCall:true,sourceRunId:null,sourceStatus:'completed',sourceRowCount:safe.length,
      collectedAt:fetchedAt,fetchedAt,requestedRange:{...args},evidenceRange:{...args},coverage:'covers_requested_range',
      freshness:'current_live_response',limitations:'At most 500 final query/page rows; omitted or anonymized queries are unknown.',
      dataForSeo:{status:'skipped',reason:'rank_execution_disabled_zero_cap'}};
  }
  private async visibility(runId:string){
    if(!this.env.PERPLEXITY_API_KEY)return {status:'unavailable',provider:'perplexity',reason:'existing_host_key_unavailable',observations:null};
    const runCap=Math.floor(cap(this.env,'TECHE_PERPLEXITY_RUN_REQUEST_CAP',3));
    const monthCap=Math.floor(cap(this.env,'TECHE_PERPLEXITY_MONTH_REQUEST_CAP',30));
    const unit=cap(this.env,'TECHE_PERPLEXITY_RESERVED_USD_PER_REQUEST',1);
    const monthlyUsd=cap(this.env,'TECHE_PERPLEXITY_MONTH_USD_CAP',5);
    if(!runCap||!monthCap||!unit||!monthlyUsd)return {status:'skipped',reason:'existing_paid_caps_unavailable',observations:null};
    let used=0;const observations=[];
    const fetcher=async(url:string,init:any)=>{
      if(url!=='https://api.perplexity.ai/chat/completions')throw Error('provider_endpoint_rejected');
      const month=new Date().toISOString().slice(0,7);
      const entries=await this.store.entries();
      const spent=entries.filter(e=>e.kind==='provider_reservation'&&e.data.provider==='perplexity'&&e.at.startsWith(month));
      if(used>=runCap||spent.length>=monthCap||spent.reduce((n,e)=>n+e.data.usd,0)+unit>monthlyUsd)throw Error('provider_cap');
      await this.store.append('provider_reservation',{provider:'perplexity',runId,usd:unit});
      used++;
      const res=await this.providerTransport(url,init);
      if(res.status>=300&&res.status<400)throw Error('provider_redirect_rejected');
      return res;
    };
    const adapter=new engine.OpenAiCompatibleBenchmarkExecutionAdapter('perplexity',{
      provider:'perplexity',apiKey:this.env.PERPLEXITY_API_KEY,model:'sonar',enabledModels:['sonar'],
      endpoint:'https://api.perplexity.ai/chat/completions'
    },fetcher as any,async()=>{});
    for(const [i,text] of queries.entries()){
      if(used>=runCap)break;
      const result=await adapter.executeQuery({id:String(i),query_set_id:'teche-v1',query_key:'teche-'+i,
        query_text:text,intent_type:'discovery',topic:'clinic consulting',weight:1,metadata:{},created_at:new Date().toISOString()},
        {domainId:DOMAIN,canonicalDomain:DOMAIN,siteUrl:ORIGIN,modelId:'sonar',auditorModelId:null,runGroupId:runId,
          runMode:'ungrounded_inference',groundingContext:null});
      observations.push({query:text,status:result.status,executedAt:result.executedAt,
        mention:result.status==='completed'?/techehealthservices\.com|teché|teche health/i.test(result.responseText??''):null,
        responseSha256:result.responseText?hash(result.responseText):null,
        note:'Unverified model response; mention is not citation, endorsement, ranking or qualified demand.'});
      if(result.status!=='completed')break; // stop after adapter's bounded retries; no additional query
    }
    return {status:observations.length===queries.length&&observations.every(o=>o.status==='completed')?'completed':'partial',
      provider:'perplexity',mode:'ungrounded_inference',observations,requestsReserved:used};
  }
  private plan(entries:any[]){
    const held=new Set(entries.filter(e=>e.kind==='review_hold').map(e=>e.data.runId));
    const audit=entries.filter(e=>e.kind==='result'&&e.data.tool==='teche_run_site_audit'&&e.data.status==='completed'&&!held.has(e.data.runId)).at(-1);
    const search=entries.filter(e=>e.kind==='result'&&e.data.tool==='teche_sync_search_evidence'&&
      (e.data.status==='completed'||e.data.status==='partial')&&Array.isArray(e.data.rows)).at(-1);
    const opportunities=search?engine.aggregateSearchConsoleRows(search.data.rows).flatMap(row=>{
      if(/medesync|priorx/i.test(row.query))return [];
      const draft=engine.classifySearchConsoleOpportunity(row);
      return draft?[{...draft,owner:'TJ preparation / website implementation / Andere approval',sourcePage:row.page}]:[];
    }):null;
    return {status:audit||search?'completed':'unavailable',auditRunId:audit?.data.runId??null,searchRunId:search?.data.runId??null,
      searchEvidence:search?{status:search.data.status,sourceMode:search.data.sourceMode??null,sourceRunId:search.data.sourceRunId??null,
        fetchedAt:search.data.fetchedAt??null,evidenceRange:search.data.evidenceRange??null,coverage:search.data.coverage??null,
        freshness:search.data.freshness??null}:null,
      opportunities,technicalFindings:audit?.data.findings?.filter((i:any)=>i.status==='FAIL'||i.status==='WARNING').slice(0,5)??null,
      approvalBoundary:'Review-only. No WordPress, content, redirect, hosting or public change authorized.'};
  }
}

export function installSiteTransport(){globalThis.fetch=createSiteFetch();}
