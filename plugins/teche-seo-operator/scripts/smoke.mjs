import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const installed=process.argv.indexOf('--entry');
const entry=installed>=0?process.argv[installed+1]:resolve('server/dist/index.mjs');
const transport=new StdioClientTransport({command:process.execPath,args:[entry],env:{LOCALAPPDATA:process.env.LOCALAPPDATA,SystemRoot:process.env.SystemRoot,PATH:process.env.PATH},stderr:'inherit'});
const client=new Client({name:'teche-local-smoke',version:'1.0.0'});
try{
 await client.connect(transport);
 const list=await client.listTools();assert.equal(list.tools.length,6);
 console.log(JSON.stringify({tools:list.tools.map(t=>t.name)}));
 const status=await client.callTool({name:'teche_get_status',arguments:{}});assert.ok(!status.isError);console.log(JSON.stringify(status));
 if(process.argv.includes('--live')){
   const result=await client.callTool({name:'teche_run_site_audit',arguments:{maxPages:3}},undefined,{timeout:180000});
   const data=JSON.parse(result.content[0].text);console.log(JSON.stringify({status:data.status,runId:data.runId,qa:data.qa,coverage:data.coverage,artifacts:data.artifacts,reason:data.reason}));
   assert.equal(data.status,'completed');assert.equal(data.qa.ok,true);
 }
}finally{await client.close();}
