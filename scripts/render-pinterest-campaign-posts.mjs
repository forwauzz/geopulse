/**
 * Six original GEO-Pulse social graphics based on editorial mechanics observed
 * on the founder-supplied Pinterest marketing-ideas page. No Pinterest imagery
 * or copy is reused. Product facts come from the shipped 24-check audit catalog.
 *
 * Usage: node scripts/render-pinterest-campaign-posts.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'content', 'pinterest-marketing-campaign-2026-08-09', 'images');
const W = 1200;
const H = 1500;
const C = {
  ivory: '#F5F2E8', paper: '#FFFFFF', ink: '#2C3435', soft: '#586162',
  slate: '#565E74', gold: '#B79C60', goldDark: '#8A6D33', blue: '#005BC4',
  paleBlue: '#D5E3FD', line: '#ABB4B5', track: '#E3E9EA', red: '#9F403D',
};

const esc = (s) => String(s).replace(/[<>&'"]/g, (ch) => ({
  '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;',
})[ch]);

function text(lines, { x=84, y=100, size=64, line=1.12, fill=C.ink, weight=700,
  family='Georgia, Cambria, serif', anchor='start', tracking=0 } = {}) {
  return lines.map((value, i) => `<text x="${x}" y="${y + i * size * line}" fill="${fill}" `+
    `font-family="${family}" font-size="${size}" font-weight="${weight}" `+
    `text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`).join('\n');
}

function shell({ eyebrow, headline, subline, art, dark=false }) {
  const bg = dark ? '#182022' : C.ivory;
  const ink = dark ? '#F7F7FF' : C.ink;
  const soft = dark ? '#CBD4D5' : C.soft;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    <text x="84" y="84" fill="${C.gold}" font-family="Georgia, serif" font-size="30" font-weight="700" letter-spacing="5">GEO-PULSE</text>
    <rect x="84" y="108" width="82" height="3" fill="${C.gold}"/>
    ${text([eyebrow], {x:84,y:176,size:21,fill:soft,weight:800,family:'Segoe UI, Arial',tracking:3.2})}
    ${text(headline, {x:84,y:260,size:76,fill:ink,weight:700})}
    ${text(subline, {x:84,y:455,size:29,fill:soft,weight:500,family:'Segoe UI, Arial',line:1.35})}
    ${art}
    <rect x="84" y="1362" width="1032" height="2" fill="${C.gold}" opacity="0.58"/>
    ${text(['Run a free scan'], {x:84,y:1424,size:29,fill:ink,weight:700,family:'Segoe UI, Arial'})}
    ${text(['getgeopulse.com'], {x:1116,y:1424,size:27,fill:C.gold,weight:800,family:'Segoe UI, Arial',anchor:'end',tracking:1.2})}
  </svg>`;
}

function puzzleArt() {
  const parts = [
    {x:102,y:750,label:'ACCESS',n:'5 gates',fill:C.slate},
    {x:414,y:750,label:'UNDERSTAND',n:'14 checks',fill:C.blue},
    {x:726,y:750,label:'HYGIENE',n:'5 checks',fill:C.goldDark},
  ];
  return `<g>${parts.map((p,i)=>`<g>
    <rect x="${p.x}" y="${p.y}" width="286" height="260" rx="28" fill="${p.fill}"/>
    ${i<2?`<circle cx="${p.x+286}" cy="${p.y+130}" r="46" fill="${p.fill}"/>`:''}
    ${i>0?`<circle cx="${p.x}" cy="${p.y+130}" r="47" fill="${bgFor(i)}"/>`:''}
    ${text([p.label],{x:p.x+143,y:p.y+112,size:24,fill:'#fff',weight:800,family:'Segoe UI, Arial',anchor:'middle',tracking:1.8})}
    ${text([p.n],{x:p.x+143,y:p.y+174,size:34,fill:'#fff',weight:700,family:'Segoe UI, Arial',anchor:'middle'})}
  </g>`).join('')}</g>
  ${text(['One chain. Three different jobs.'],{x:600,y:1130,size:38,fill:C.ink,weight:700,family:'Segoe UI, Arial',anchor:'middle'})}`;
}
function bgFor(i){ return i===1?C.slate:C.blue; }

function raceArt() {
  return `<g>
    <rect x="84" y="694" width="1032" height="420" rx="30" fill="#fff" stroke="${C.line}" stroke-opacity=".55"/>
    <path d="M150 822 H1036" stroke="${C.track}" stroke-width="42" stroke-linecap="round"/>
    <path d="M150 982 H1036" stroke="${C.track}" stroke-width="42" stroke-linecap="round"/>
    <path d="M150 822 H770" stroke="${C.slate}" stroke-width="42" stroke-linecap="round"/>
    <path d="M150 982 H896" stroke="${C.blue}" stroke-width="42" stroke-linecap="round"/>
    <circle cx="770" cy="822" r="45" fill="${C.gold}"/><circle cx="896" cy="982" r="45" fill="${C.gold}"/>
    ${text(['CLASSIC SEO'],{x:150,y:765,size:24,fill:C.soft,weight:800,family:'Segoe UI, Arial',tracking:2.2})}
    ${text(['AI READINESS'],{x:150,y:925,size:24,fill:C.soft,weight:800,family:'Segoe UI, Arial',tracking:2.2})}
    ${text(['ranking + performance'],{x:1036,y:765,size:23,fill:C.soft,weight:600,family:'Segoe UI, Arial',anchor:'end'})}
    ${text(['access + extractability + trust'],{x:1036,y:925,size:23,fill:C.soft,weight:600,family:'Segoe UI, Arial',anchor:'end'})}
    ${text(['Use both. Measure different outcomes.'],{x:600,y:1192,size:37,fill:C.ink,weight:700,family:'Segoe UI, Arial',anchor:'middle'})}
  </g>`;
}

function doorArt() {
  const labels=['CRAWLER','ROBOTS','SNIPPET','HTTPS','CANONICAL'];
  return `<g>
    <rect x="354" y="670" width="492" height="520" rx="18" fill="#fff" stroke="${C.line}" stroke-width="3"/>
    <path d="M405 1128 V735 H707 V1128" fill="${C.slate}"/>
    <polygon points="707,735 794,690 794,1175 707,1128" fill="${C.blue}"/>
    <circle cx="680" cy="938" r="13" fill="${C.gold}"/>
    <path d="M794 936 L1080 802 L1080 1070 Z" fill="${C.paleBlue}" opacity=".75"/>
    ${labels.map((label,i)=>`<g><circle cx="${170+i*210}" cy="1244" r="31" fill="${i<5?C.gold:C.track}"/>${text([String(i+1)],{x:170+i*210,y:1255,size:24,fill:'#fff',weight:800,family:'Segoe UI, Arial',anchor:'middle'})}${text([label],{x:170+i*210,y:1314,size:17,fill:C.soft,weight:800,family:'Segoe UI, Arial',anchor:'middle',tracking:1})}</g>`).join('')}
  </g>`;
}

function questionArt() {
  return `<g>
    <rect x="90" y="690" width="1020" height="500" rx="34" fill="#111719"/>
    <circle cx="846" cy="940" r="160" fill="#050708" stroke="${C.gold}" stroke-width="4"/>
    <path d="M218 940 H625" stroke="${C.paleBlue}" stroke-width="18" stroke-linecap="round"/>
    <polygon points="625,910 682,940 625,970" fill="${C.paleBlue}"/>
    ${text(['BUYER QUESTION'],{x:218,y:880,size:24,fill:'#CBD4D5',weight:800,family:'Segoe UI, Arial',tracking:2.4})}
    ${text(['“Who should I hire?”'],{x:218,y:1010,size:43,fill:'#fff',weight:700,family:'Segoe UI, Arial'})}
    ${text(['YOUR BRAND?'],{x:846,y:950,size:25,fill:C.gold,weight:800,family:'Segoe UI, Arial',anchor:'middle',tracking:2})}
    ${text(['No scope → no defensible number.'],{x:600,y:1260,size:37,fill:'#F7F7FF',weight:700,family:'Segoe UI, Arial',anchor:'middle'})}
  </g>`;
}

function magnetArt() {
  const chips=[['SCHEMA',204,735],['ANSWERS',790,720],['TRUST',188,1090],['LINKS',820,1090]];
  return `<g>
    <path d="M470 825 V1005 C470 1170 730 1170 730 1005 V825" fill="none" stroke="${C.slate}" stroke-width="92" stroke-linecap="round"/>
    <path d="M470 825 V918 M730 825 V918" stroke="${C.gold}" stroke-width="92" stroke-linecap="butt"/>
    ${chips.map(([label,x,y])=>`<g><rect x="${x-96}" y="${y-34}" width="192" height="68" rx="34" fill="#fff" stroke="${C.line}"/><text x="${x}" y="${y+9}" fill="${C.ink}" font-family="Segoe UI, Arial" font-size="22" font-weight="800" text-anchor="middle" letter-spacing="1.5">${label}</text></g>`).join('')}
    <path d="M300 760 C390 790 400 815 430 860 M900 755 C815 790 800 820 770 860 M300 1070 C382 1045 405 1035 432 1020 M900 1070 C820 1045 800 1035 768 1020" fill="none" stroke="${C.blue}" stroke-width="5" stroke-dasharray="10 12"/>
    ${text(['Understanding is a system.'],{x:600,y:1260,size:39,fill:C.ink,weight:700,family:'Segoe UI, Arial',anchor:'middle'})}
  </g>`;
}

function clarityArt() {
  return `<g>
    <rect x="86" y="680" width="480" height="520" rx="26" fill="#fff" stroke="${C.line}"/>
    <rect x="634" y="680" width="480" height="520" rx="26" fill="#fff" stroke="${C.gold}" stroke-width="3"/>
    ${text(['BROCHURE'],{x:326,y:750,size:24,fill:C.soft,weight:800,family:'Segoe UI, Arial',anchor:'middle',tracking:2.4})}
    ${text(['ANSWER'],{x:874,y:750,size:24,fill:C.goldDark,weight:800,family:'Segoe UI, Arial',anchor:'middle',tracking:2.4})}
    ${[0,1,2,3,4,5,6,7].map(i=>`<rect x="135" y="${804+i*42}" width="${i%3===0?360:385}" height="15" rx="7" fill="${C.track}"/>`).join('')}
    <rect x="692" y="805" width="360" height="64" rx="10" fill="${C.paleBlue}"/>
    ${text(['What is this?'],{x:716,y:848,size:25,fill:C.ink,weight:800,family:'Segoe UI, Arial'})}
    <rect x="692" y="898" width="360" height="108" rx="10" fill="${C.ivory}"/>
    ${text(['Direct answer.'],{x:716,y:944,size:26,fill:C.ink,weight:800,family:'Segoe UI, Arial'})}
    ${text(['Evidence and context follow.'],{x:716,y:982,size:20,fill:C.soft,weight:500,family:'Segoe UI, Arial'})}
    <rect x="692" y="1035" width="226" height="18" rx="9" fill="${C.gold}"/><rect x="692" y="1070" width="328" height="14" rx="7" fill="${C.track}"/>
    ${text(['Make every section earn its place.'],{x:600,y:1280,size:38,fill:C.ink,weight:700,family:'Segoe UI, Arial',anchor:'middle'})}
  </g>`;
}

const POSTS = [
  {name:'01-crawlable-not-quotable',svg:shell({eyebrow:'READINESS SYSTEM',headline:['CRAWLABLE ≠','QUOTABLE'],subline:['Access is necessary. It is not the whole test.'],art:puzzleArt()})},
  {name:'02-geo-vs-seo',svg:shell({eyebrow:'RELATED, NOT IDENTICAL',headline:['SEO AND AI','READINESS'],subline:['Shared foundations. Different measurement questions.'],art:raceArt()})},
  {name:'03-five-access-gates',svg:shell({eyebrow:'FIX THE FIRST BLOCKER',headline:['FIVE GATES','BEFORE CONTENT'],subline:['Reach the page first. Improve the answer second.'],art:doorArt()})},
  {name:'04-did-your-brand-appear',svg:shell({eyebrow:'MEASURE THE PROBLEM',headline:['BUYER ASKED.','AI ANSWERED.'],subline:['Did your brand appear—and what was measured?'],art:questionArt(),dark:true})},
  {name:'05-schema-not-sufficient',svg:shell({eyebrow:'ONE SIGNAL IS NOT A SYSTEM',headline:['SCHEMA HELPS.','DON’T STOP THERE.'],subline:['Answers, trust, links, and structure still matter.'],art:magnetArt()})},
  {name:'06-clarity-beats-volume',svg:shell({eyebrow:'ANSWER-SHAPED CONTENT',headline:['CLARITY BEATS','VOLUME'],subline:['More copy cannot compensate for a hidden answer.'],art:clarityArt()})},
];

async function main(){
  await mkdir(OUT,{recursive:true});
  for(const post of POSTS){
    const master=await sharp(Buffer.from(post.svg)).png().toBuffer();
    await sharp(master).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(path.join(OUT,`${post.name}-linkedin-1200x1500.jpg`));
    await sharp(master).resize({width:1080}).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(path.join(OUT,`${post.name}-instagram-1080x1350.jpg`));
    console.log(post.name);
  }

  const tiles=[];
  for(let i=0;i<POSTS.length;i+=1){
    const tile=await sharp(path.join(OUT,`${POSTS[i].name}-instagram-1080x1350.jpg`))
      .resize({width:360,height:450,fit:'cover'})
      .toBuffer();
    tiles.push({input:tile,left:(i%3)*360,top:Math.floor(i/3)*450});
  }
  await sharp({create:{width:1080,height:900,channels:3,background:C.ivory}})
    .composite(tiles)
    .jpeg({quality:92,chromaSubsampling:'4:4:4'})
    .toFile(path.join(OUT,'campaign-contact-sheet.jpg'));
}

main().catch((error)=>{console.error(error);process.exit(1);});
