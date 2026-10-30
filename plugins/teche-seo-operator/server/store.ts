import { mkdir, open, readdir, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export type Entry = { id:string; at:string; kind:string; data:any };
export class LocalStore {
  readonly root:string;
  constructor(root?:string){
    if(!root && !process.env.LOCALAPPDATA) throw Error('localappdata_unavailable');
    this.root=resolve(root ?? join(process.env.LOCALAPPDATA!,'teche-seo-operator'));
  }
  async init(){
    await mkdir(this.root,{recursive:true});
    if((await lstat(this.root)).isSymbolicLink())throw Error('store_link_rejected');
    for(const d of ['events','artifacts']){
      await mkdir(join(this.root,d),{recursive:true});
      if((await lstat(join(this.root,d))).isSymbolicLink())throw Error('store_link_rejected');
    }
  }
  async locked<T>(fn:()=>Promise<T>):Promise<T>{
    await this.init();
    const path=join(this.root,'writer.lock');
    let lock;
    try {lock=await open(path,'wx');}catch{throw Error('store_busy_or_recovery_required');}
    try{await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();return await fn();}
    finally {await lock.close();await unlink(path);}
  }
  async entries():Promise<Entry[]>{
    const names=(await readdir(join(this.root,'events'))).filter(n=>n.endsWith('.json')).sort();
    return Promise.all(names.map(async n=>JSON.parse(await readFile(join(this.root,'events',n),'utf8')) as Entry));
  }
  async append(kind:string,data:unknown):Promise<Entry>{
    const entry={id:randomUUID(),at:new Date().toISOString(),kind,data};
    const sequence=(await readdir(join(this.root,'events'))).filter(n=>n.endsWith('.json')).length;
    await this.atomic(join(this.root,'events',String(sequence).padStart(12,'0')+'-'+entry.id+'.json'),JSON.stringify(entry,null,2));
    return entry;
  }
  async atomic(path:string,bytes:string|Uint8Array){
    const temp=path+'.'+randomUUID()+'.tmp';
    const file=await open(temp,'wx');
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    // Caller uses random, immutable identities; never overwrites an existing evidence artifact.
    try{await lstat(path);throw Error('artifact_exists');}catch(e:any){if(e.code!=='ENOENT')throw e;}
    await rename(temp,path);
  }
  async artifact(runId:string,name:string,bytes:string|Uint8Array){
    if(!/^[a-f0-9-]{36}$/.test(runId)||!/^audit\.(json|md|pdf)$/.test(name))throw Error('artifact_path_rejected');
    const dir=join(this.root,'artifacts',runId);await mkdir(dir,{recursive:true});
    if((await lstat(dir)).isSymbolicLink())throw Error('artifact_link_rejected');
    const path=join(dir,name);await this.atomic(path,bytes);
    return {path,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
}
