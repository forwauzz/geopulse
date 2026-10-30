import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Operator,schemas,descriptions,installSiteTransport } from './operator';
installSiteTransport();
const operator=new Operator();
const server=new McpServer({name:'teche-seo-operator',version:'0.1.2'});
for(const [name,schema] of Object.entries(schemas)){
  server.registerTool(name,{description:descriptions[name as keyof typeof descriptions],
    inputSchema:schema,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
    async(args:unknown)=>{
      try{return {content:[{type:'text' as const,text:JSON.stringify(await operator.call(name,args))}]};}
      catch{return {isError:true,content:[{type:'text' as const,text:'Request rejected by local policy or store availability.'}]};}
    });
}
await server.connect(new StdioServerTransport());
