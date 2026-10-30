import { AsyncLocalStorage } from 'node:async_hooks';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { validateUrl } from './engines';

export const DOMAIN = 'techehealthservices.com';
export const ORIGIN = 'https://' + DOMAIN;
export const MAX_PAGES = 5;
export const MAX_REQUESTS = 24;
export const MAX_BYTES = 1_500_000;
const scope = new AsyncLocalStorage<{ remaining: number }>();

export async function siteUrl(value: string): Promise<string> {
  if(new URL(value).hash)throw Error('url_rejected');
  const v = await validateUrl(value);
  if (!v.ok) throw Error('url_rejected');
  const u = new URL(v.safeUrl);
  if (u.hostname !== DOMAIN || u.search || u.hash ||
      /\/(wp-admin|wp-json|wp-login\.php|xmlrpc\.php)(\/|$)/i.test(decodeURIComponent(u.pathname))) {
    throw Error('url_rejected');
  }
  return u.href;
}

export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

// Pin a validated public DNS address for the actual socket. No second resolver lookup.
export async function secureRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  const addresses = await lookup(u.hostname, { all:true });
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw Error('dns_rejected');
  const pinned = addresses[0]!;
  return new Promise((resolve,reject)=>{
    const req=request(u,{
      method:init.method ?? 'GET',
      headers:Object.fromEntries(new Headers(init.headers).entries()),
      lookup: ((_host: unknown, options: any, cb: any)=>options?.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)) as any,
      signal: init.signal ?? undefined,
    },res=>{
      const parts: Buffer[]=[]; let bytes=0;
      res.on('data',(part:Buffer)=>{
        bytes+=part.length;
        if(bytes>MAX_BYTES){ res.destroy(); req.destroy(Error('response_limit')); return; }
        parts.push(part);
      });
      res.on('error',()=>reject(Error('transport_failed')));
      res.on('end',()=>{
        clearTimeout(timer);
        const h=new Headers();
        // Only public response headers needed by the engines; never cookies or auth.
        for(const name of ['content-type','location','x-robots-tag','content-security-policy','strict-transport-security','x-content-type-options','x-frame-options','referrer-policy','retry-after']){
          const value=res.headers[name]; if(value) h.set(name,Array.isArray(value)?value.join(', '):value);
        }
        const status=res.statusCode ?? 500;
        resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(parts),{status,headers:h}));
      });
    });
    const timer=setTimeout(()=>req.destroy(Error('transport_timeout')),15000);
    req.on('error',()=>{clearTimeout(timer);reject(Error('transport_failed'));});
    if(init.body) {
      if(typeof init.body!=='string'){req.destroy();reject(Error('body_rejected'));return;}
      req.write(init.body);
    }
    req.end();
  });
}

export function createSiteFetch(transport: typeof secureRequest = secureRequest): typeof fetch {
  return (async (input: string | URL | Request, init: RequestInit = {})=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const url=await siteUrl(raw);
    if((init.method ?? 'GET')!=='GET' || init.body) throw Error('method_rejected');
    const budget=scope.getStore();
    if(!budget || budget.remaining<=0) throw Error('request_limit');
    budget.remaining--;
    const response=await transport(url,{...init,redirect:'manual'});
    if(response.status>=300 && response.status<400){
      const location=response.headers.get('location');
      if(!location) throw Error('redirect_rejected');
      await siteUrl(new URL(location,url).href); // refuse before any follow-up request
    }
    return response;
  }) as typeof fetch;
}
export function withSiteBudget<T>(fn:()=>Promise<T>, limit=MAX_REQUESTS):Promise<T>{
  if(!Number.isInteger(limit)||limit<1||limit>MAX_REQUESTS)throw Error('request_limit');
  return scope.run({remaining:limit},fn);
}
