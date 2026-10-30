import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {z} from 'zod';

const PROPERTY='sc-domain:techehealthservices.com';
const DATABASE='teche-growth-intelligence-development';
const DATABASE_ID='54b5723c-66c9-4373-b0b1-fd96ac729c74';
const ENVIRONMENT='development';
const MAX_ROWS=1000;
const FUTURE_TOLERANCE_MS=5*60*1000;
const CURRENT_SNAPSHOT_MS=48*60*60*1000;

export const SAVED_SEARCH_QUERY=`WITH latest AS (
  SELECT r.id AS source_run_id, r.collected_at, r.start_date, r.end_date,
    r.status AS source_status, r.row_count AS source_row_count, r.error_code,
    json_extract(i.report_json, '$.searchConsole.property') AS property,
    json_extract(i.report_json, '$.searchConsole.fetchedAt') AS fetched_at
  FROM gsc_runs r
  INNER JOIN intelligence_reports i ON i.gsc_run_id = r.id
  WHERE json_extract(i.report_json, '$.searchConsole.property') = '${PROPERTY}'
  ORDER BY r.collected_at DESC
  LIMIT 1
)
SELECT latest.*, g.row_index, g.query, g.page, g.clicks, g.impressions,
  g.ctr, g.average_position AS position
FROM latest
INNER JOIN gsc_rows g ON g.run_id = latest.source_run_id
ORDER BY g.row_index ASC
LIMIT ${MAX_ROWS}`;

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rowSchema=z.object({
  source_run_id:z.string().uuid(),collected_at:z.string().min(1),start_date:date,end_date:date,
  source_status:z.enum(['complete','partial','failed']),source_row_count:z.number().int().min(1).max(MAX_ROWS),
  error_code:z.string().min(1).max(128).nullable(),property:z.literal(PROPERTY),fetched_at:z.string().min(1),
  row_index:z.number().int().min(0).max(MAX_ROWS-1),query:z.string().min(1).max(2048),
  page:z.string().min(1).max(4096),clicks:z.number().finite().min(0),
  impressions:z.number().finite().min(0),ctr:z.number().finite().min(0).max(1),
  position:z.number().finite().min(0)
}).strict();
const responseSchema=z.object({
  success:z.literal(true),results:z.array(rowSchema).min(1).max(MAX_ROWS),
  meta:z.object({changes:z.number().int().max(0),rows_written:z.number().int().max(0),changed_db:z.boolean().optional()}).passthrough()
}).passthrough();

export class SavedEvidenceError extends Error{
  constructor(readonly code:string){super(code);this.name='SavedEvidenceError';}
}

type RequestedRange={startDate:string;endDate:string};
type ExecResult={stdout:string|Buffer;stderr:string|Buffer};
type ExecOptions={cwd:string;timeout:number;maxBuffer:number;windowsHide:boolean;shell:false};
export type SavedEvidenceRunner=(executable:string,args:string[],options:ExecOptions)=>Promise<ExecResult>;

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const timestamp=Date.parse(value+'T00:00:00.000Z');
  return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
function dateNumber(value:string){return Date.parse(value+'T00:00:00.000Z');}
function parseTimestamp(value:string,now:Date){
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp)||timestamp>now.getTime()+FUTURE_TOLERANCE_MS)throw new SavedEvidenceError('saved_evidence_timestamp_rejected');
  return timestamp;
}
function pageAllowed(value:string){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname==='techehealthservices.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash;
  }catch{return false;}
}
function unwrap(value:unknown){
  if(Array.isArray(value)){
    if(value.length!==1)throw new SavedEvidenceError('saved_evidence_shape_rejected');
    return value[0];
  }
  return value;
}
function sameMetadata(a:z.infer<typeof rowSchema>,b:z.infer<typeof rowSchema>){
  return a.source_run_id===b.source_run_id&&a.collected_at===b.collected_at&&
    a.start_date===b.start_date&&a.end_date===b.end_date&&a.source_status===b.source_status&&
    a.source_row_count===b.source_row_count&&a.error_code===b.error_code&&
    a.property===b.property&&a.fetched_at===b.fetched_at;
}

export function savedEvidenceFreshness(fetchedAt:string,now=new Date()){
  const timestamp=Date.parse(fetchedAt);
  if(!Number.isFinite(timestamp)||timestamp>now.getTime()+FUTURE_TOLERANCE_MS)return 'unknown';
  return now.getTime()-timestamp<=CURRENT_SNAPSHOT_MS?'current_snapshot':'stale_snapshot';
}

export function parseSavedSearchEvidence(raw:string,requested:RequestedRange,now=new Date()){
  if(!validDate(requested.startDate)||!validDate(requested.endDate)||dateNumber(requested.endDate)<dateNumber(requested.startDate)){
    throw new SavedEvidenceError('saved_evidence_requested_range_rejected');
  }
  let decoded:unknown;
  try{decoded=JSON.parse(raw);}catch{throw new SavedEvidenceError('saved_evidence_json_rejected');}
  const parsed=responseSchema.safeParse(unwrap(decoded));
  if(!parsed.success)throw new SavedEvidenceError('saved_evidence_schema_rejected');
  if(parsed.data.meta.changes!==0||parsed.data.meta.rows_written!==0||parsed.data.meta.changed_db===true){
    throw new SavedEvidenceError('saved_evidence_write_detected');
  }
  const rows=parsed.data.results;
  const first=rows[0];
  if(!first)throw new SavedEvidenceError('saved_evidence_schema_rejected');
  if(first.source_status==='failed'||first.error_code!==null)throw new SavedEvidenceError('saved_evidence_source_failed');
  if(rows.length!==first.source_row_count)throw new SavedEvidenceError('saved_evidence_row_count_rejected');
  if(!validDate(first.start_date)||!validDate(first.end_date)||dateNumber(first.end_date)<dateNumber(first.start_date)){
    throw new SavedEvidenceError('saved_evidence_range_rejected');
  }
  const collectedAt=parseTimestamp(first.collected_at,now);
  const fetchedAt=parseTimestamp(first.fetched_at,now);
  if(fetchedAt>collectedAt+FUTURE_TOLERANCE_MS)throw new SavedEvidenceError('saved_evidence_lineage_rejected');
  for(const [index,row] of rows.entries()){
    if(!sameMetadata(first,row)||row.row_index!==index||!pageAllowed(row.page)){
      throw new SavedEvidenceError('saved_evidence_lineage_rejected');
    }
  }
  const sourceStart=dateNumber(first.start_date),sourceEnd=dateNumber(first.end_date);
  const requestedStart=dateNumber(requested.startDate),requestedEnd=dateNumber(requested.endDate);
  if(sourceEnd<requestedStart||sourceStart>requestedEnd)throw new SavedEvidenceError('saved_evidence_out_of_range');
  const coverage=sourceStart<=requestedStart&&sourceEnd>=requestedEnd?'covers_requested_range':'partial_overlap';
  const freshness=savedEvidenceFreshness(first.fetched_at,now);
  const evidenceRows=rows.map(row=>({
    query:row.query,page:row.page,clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position
  }));
  const sourceSha256=createHash('sha256').update(JSON.stringify({
    sourceRunId:first.source_run_id,sourceStatus:first.source_status,sourceRowCount:first.source_row_count,errorCode:first.error_code,
    collectedAt:first.collected_at,fetchedAt:first.fetched_at,property:first.property,
    evidenceRange:{startDate:first.start_date,endDate:first.end_date},rows:evidenceRows
  })).digest('hex');
  return {
    sourceMode:'authenticated_saved_evidence' as const,directLiveApiCall:false,
    sourceRunId:first.source_run_id,sourceStatus:first.source_status,sourceRowCount:first.source_row_count,
    collectedAt:first.collected_at,fetchedAt:first.fetched_at,property:first.property,
    requestedRange:{...requested},evidenceRange:{startDate:first.start_date,endDate:first.end_date},
    coverage,freshness,errorCode:first.error_code,rows:evidenceRows,sourceSha256,
    responseSha256:createHash('sha256').update(raw).digest('hex'),
    database:DATABASE,databaseEnvironment:ENVIRONMENT,readOnlyQuery:true,
    limitations:'Authenticated saved snapshot; not a new Google API call. Source status, date coverage, freshness and stored-row limits remain explicit.'
  };
}

function defaultWorkspace(){return join(homedir(),'OneDrive','Documents','techehealthservices.com','cloudflare-growth-intelligence');}
export function savedEvidenceBridgeConfigured(env:Record<string,string|undefined>=process.env){
  const workspace=resolve(env.TECHE_GROWTH_INTELLIGENCE_DIR?.trim()||defaultWorkspace());
  return existsSync(join(workspace,'wrangler.jsonc'))&&existsSync(join(workspace,'node_modules','wrangler','bin','wrangler.js'));
}
async function validateWorkspace(workspace:string){
  const root=await realpath(workspace);
  const configPath=join(root,'wrangler.jsonc');
  const script=await realpath(join(root,'node_modules','wrangler','bin','wrangler.js'));
  if(!script.startsWith(root+sep))throw new SavedEvidenceError('saved_evidence_workspace_rejected');
  const config=await readFile(configPath,'utf8');
  const required=[DATABASE,DATABASE_ID,PROPERTY,'teche-growth-intelligence-development'];
  if(required.some(value=>!config.includes(value)))throw new SavedEvidenceError('saved_evidence_workspace_rejected');
  return {root,script};
}
const defaultRunner:SavedEvidenceRunner=(executable,args,options)=>new Promise((resolvePromise,reject)=>{
  execFile(executable,args,options,(error,stdout,stderr)=>error?reject(error):resolvePromise({stdout,stderr}));
});

export async function loadSavedSearchEvidence(
  requested:RequestedRange,
  env:Record<string,string|undefined>=process.env,
  runner:SavedEvidenceRunner=defaultRunner,
  now=new Date(),
  testOptions?:{workspace?:string;skipWorkspaceValidation?:boolean}
){
  const configured=env.TECHE_GROWTH_INTELLIGENCE_DIR?.trim();
  const workspace=resolve(testOptions?.workspace||configured||defaultWorkspace());
  let root=workspace,script=join(workspace,'node_modules','wrangler','bin','wrangler.js');
  if(!testOptions?.skipWorkspaceValidation){
    try{({root,script}=await validateWorkspace(workspace));}
    catch(error){if(error instanceof SavedEvidenceError)throw error;throw new SavedEvidenceError('saved_evidence_bridge_unavailable');}
  }
  const args=[script,'d1','execute',DATABASE,'--remote','--env',ENVIRONMENT,'--command',SAVED_SEARCH_QUERY,'--json'];
  try{
    const result=await runner(process.execPath,args,{cwd:root,timeout:30_000,maxBuffer:2_000_000,windowsHide:true,shell:false});
    return parseSavedSearchEvidence(String(result.stdout),requested,now);
  }catch(error){
    if(error instanceof SavedEvidenceError)throw error;
    throw new SavedEvidenceError('saved_evidence_read_unavailable');
  }
}

export function savedEvidenceReason(error:unknown){
  return error instanceof SavedEvidenceError?error.code:'saved_evidence_read_unavailable';
}
