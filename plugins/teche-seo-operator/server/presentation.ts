import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {buildDeepAuditMarkdown,buildDeepAuditPdfFromPayload} from './engines';
import type {DeepAuditReportPayload} from '../../../workers/report/deep-audit-report-payload';
type Issue=DeepAuditReportPayload['allIssues'][number];
const title=(i:Issue)=>i.check??i.checkId??'Observation';
const status=(i:Issue)=>i.status??'NOT_EVALUATED';
export function presentationSections(p:DeepAuditReportPayload){
 const confirmed=p.allIssues.filter(i=>status(i)==='FAIL');
 const warnings=p.allIssues.filter(i=>status(i)==='WARNING'||status(i)==='LOW_CONFIDENCE');
 const unknown=p.allIssues.filter(i=>!['FAIL','PASS','WARNING','LOW_CONFIDENCE'].includes(status(i)));
 const affected=(i:Issue)=>p.pages.filter(page=>page.issuesJson.some(j=>j.checkId===i.checkId&&status(j)===status(i))).map(page=>page.url);
 const cards=(items:Issue[],actions:boolean)=>items.map(i=>({title:`${status(i)} | ${title(i)}`,lines:[
   i.finding??'No finding detail retained.',...(actions&&i.fix?[`Review action: ${i.fix}`]:[]),...affected(i).map(url=>`Observed on: ${url}`)
 ]}));
 return [
  {title:'Scope and evidence',cards:[{title:'Private review copy',lines:[
    `Run ${p.runId} | ${p.generatedAt}`,
    `Bounded HTML sample: ${p.pages.length} pages. Readiness score: ${p.aggregateScore}/100 (${p.aggregateLetterGrade}).`,
    `${p.allIssues.filter(i=>status(i)==='PASS').length} passed; ${confirmed.length} failed; ${warnings.length} warning/low-confidence; ${unknown.length} not evaluated/blocked.`,
    'This is not an indexing, ranking, citation, customer demand or revenue measurement. No browser rendering or LLM assessment was performed.',
    'Search Console and AI visibility are separate evidence tools. Missing provider evidence is unknown.',
    'No public change is authorized by this report. Review affected URLs and intended page purpose with Andere before implementation.'
  ]}]},
  {title:'Confirmed findings for review',cards:confirmed.length?cards(confirmed,true):[{title:'No FAIL observations in this sample',lines:['This does not prove the whole site is free of issues. Warnings and unknown observations are separate below.']}]},
  {title:'Warnings - not confirmed blockers',cards:warnings.length?cards(warnings,false):[{title:'No warnings observed',lines:['Only within this bounded sample.']}]},
  {title:'Not evaluated or blocked - no inferred cause',cards:unknown.length?cards(unknown,false):[{title:'No unknown observations in the retained check set',lines:['Provider and crawl coverage limitations still apply.']}]},
  {title:'Pages observed',cards:p.pages.map(page=>({title:page.url,lines:[`Observed score ${page.score}/100 (${page.letterGrade}).`,'Complete page findings and content hashes are retained in audit.json.']}))}
 ];
}
export function buildPrivateMarkdown(p:DeepAuditReportPayload):string{
 const overview=['# Teché - Private SEO evidence review','',...presentationSections(p).flatMap(section=>[
  `## ${section.title}`,'',...section.cards.flatMap(card=>[`### ${card.title}`,'',...card.lines.flatMap(line=>[line,''])])
 ])];
 // Reuse the canonical check-reference formatter, excluding legacy narratives/actions.
 const canonical=buildDeepAuditMarkdown(p);
 const detail=canonical.split('## Detailed Check Reference\n')[1]?.split('\n## Pages Scanned')[0];
 if(!detail)throw Error('shared_report_contract_changed');
 return overview.join('\n')+'\n## Detailed Check Reference\n'+detail+'\nFull unabridged findings and original scoring inputs are retained in audit.json.\n';
}
function printable(s:string){return s.replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');}
export async function buildPrivatePdf(p:DeepAuditReportPayload){
 // Reuse the engine cover; compose only private presentation pages. Shared defaults are untouched.
 const source=await PDFDocument.load(await buildDeepAuditPdfFromPayload(p));
 const doc=await PDFDocument.create();const [cover]=await doc.copyPages(source,[0]);doc.addPage(cover!);
 const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const width=612,height=792,margin=44,bottom=48,content=width-2*margin;
 let page=doc.addPage([width,height]),y=height-margin;
 const layout:Array<{page:number;top:number;bottom:number}>=[];
 const wrap=(raw:string,size:number,b=false)=>{
  const f=b?bold:font,lines:string[]=[];let line='';
  for(const word of printable(raw).split(/\s+/)){
   if(f.widthOfTextAtSize((line?line+' ':'')+word,size)<=content-24){line+=(line?' ':'')+word;continue;}
   if(line){lines.push(line);line='';}
   for(const char of word){if(f.widthOfTextAtSize(line+char,size)>content-24){lines.push(line);line='';}line+=char;}
  }
  if(line)lines.push(line);return lines;
 };
 const next=()=>{page=doc.addPage([width,height]);y=height-margin;};
 const cardRows=(card:{title:string;lines:string[]})=>[...wrap(card.title,10,true).map(text=>({text,b:true})),...card.lines.flatMap(line=>[...wrap(line,9).map(text=>({text,b:false})),{text:'',b:false}])];
 for(const section of presentationSections(p)){
  const sectionHeight=34+section.cards.reduce((n,card)=>n+cardRows(card).length*13+32,0);
  if(sectionHeight<=height-margin-bottom && sectionHeight>y-bottom)next();
  if(y<bottom+70)next();
  page.drawText(printable(section.title),{x:margin,y,size:13,font:bold,color:rgb(.13,.25,.3)});y-=24;
  for(const card of section.cards){
   const rows=cardRows(card);
   const cardHeight=rows.length*13+20;
   if(cardHeight<=height-margin-bottom&&cardHeight>y-bottom)next();
   while(rows.length){
    if(y<bottom+52)next();
    const chunk=rows.splice(0,Math.max(1,Math.floor((y-bottom-20)/13)));
    const h=chunk.length*13+20;
    page.drawRectangle({x:margin,y:y-h,width:content,height:h,color:rgb(.95,.97,.97)});
    layout.push({page:doc.getPageCount(),top:y,bottom:y-h});let lineY=y-16;
    for(const row of chunk){if(row.text)page.drawText(row.text,{x:margin+12,y:lineY,size:row.b?10:9,font:row.b?bold:font,color:rgb(.14,.18,.2)});lineY-=13;}
    y-=h+12;if(rows.length)next();
   }
   if(y<bottom+40)next();
  }
  y-=10;
 }
 for(let i=1;i<doc.getPageCount();i++)doc.getPage(i).drawText(`Private Teché review | ${p.runId.slice(0,8)} | ${i+1}/${doc.getPageCount()}`,{x:margin,y:24,size:8,font,color:rgb(.35,.4,.43)});
 doc.setTitle('Teché private SEO evidence review');doc.setSubject('Bounded observations; review required before public changes');
 return {bytes:await doc.save(),layout};
}
