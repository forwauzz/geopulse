import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
await mkdir('server/dist', {recursive:true});
const result = await build({
  entryPoints: ['server/index.ts', 'server/operator.ts', 'server/policy.ts', 'server/store.ts', 'server/presentation.ts', 'server/engines.ts', 'server/saved-search-evidence.ts'],
  outdir:'server/dist', outExtension:{'.js':'.mjs'}, bundle:true, platform:'node', format:'esm',
  target:'node22', nodePaths:[resolve('node_modules')],
  banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"},
  metafile:true, sourcemap:false
});
const inputs=Object.keys(result.metafile.inputs);
if(inputs.some(p=>/supabase|stripe|next\/|autonomous-seo-agent|run-deep-audit/.test(p))) throw Error('Forbidden runtime dependency');
for(const output of Object.values(result.metafile.outputs))for(const dependency of output.imports){
  if(dependency.external&&!builtinModules.includes(dependency.path.replace(/^node:/,'')))throw Error('Unbundled runtime dependency: '+dependency.path);
}
await writeFile('server/dist/engine-inputs.json',JSON.stringify(inputs,null,2));
