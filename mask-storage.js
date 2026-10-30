'use strict';
// Disposable compressed masks only. Project/media storage is never opened or deleted here.
function createMaskSpillStore(env=globalThis){
 const prefix='pocketcut-preview-masks-v1-',limit=(env.navigator?.userAgent?.includes('Android')?256:512)*1024*1024;
 let epoch=0,opening=null,session=null;
 async function open(){
  if(opening)return opening;
  if(!env.caches||!env.navigator?.locks)return null;
  const token=epoch,name=prefix+env.crypto.randomUUID();
  opening=new Promise(resolve=>{
   env.navigator.locks.request(name,async()=>{
    let release;const hold=new Promise(r=>release=r);
    try{
     let budget=limit;const estimate=await env.navigator.storage?.estimate?.().catch(()=>null);
     if(estimate?.quota)budget=Math.min(budget,Math.max(0,Math.floor((estimate.quota-(estimate.usage||0))* .2)));
     if(token!==epoch||budget<1024*1024){resolve(null);return;}
     const cache=await env.caches.open(name);if(token!==epoch){resolve(null);return;}session={name,cache,bytes:0,next:0,budget,release,token};resolve(session);
     // A held lease protects every other open tab; crashed/closed tabs release leases automatically.
     for(const old of await env.caches.keys())if(old.startsWith(prefix)&&old!==name){
      env.navigator.locks.request(old,{ifAvailable:true},async lease=>{if(lease)await env.caches.delete(old);}).catch(()=>{});
     }
     await hold;
    }catch{resolve(null);}finally{await env.caches.delete(name).catch(()=>{});}
   }).catch(()=>resolve(null));
  });
  return opening;
 }
 return {
  async put(blob){
   const s=await open();if(!s||s.token!==epoch||s.bytes+blob.size>s.budget)return null;
   const key=new URL('__pocketcut_mask_cache__/'+s.name+'/'+s.next++,env.location.href).href;
   s.bytes+=blob.size;try{await s.cache.put(key,new env.Response(blob));if(s.token!==epoch){s.bytes-=blob.size;await s.cache.delete(key);return null;}return {session:s,key,size:blob.size};}catch{s.bytes-=blob.size;return null;}
  },
  async get(ref){if(!ref||ref.session.token!==epoch)return null;try{return await(await ref.session.cache.match(ref.key))?.blob()||null;}catch{return null;}},
  async remove(ref){if(!ref)return;try{if(await ref.session.cache.delete(ref.key))ref.session.bytes=Math.max(0,ref.session.bytes-ref.size);}catch{}},
  clear(){epoch++;session?.release();session=null;opening=null;}
 };
}
const maskSpillStore=createMaskSpillStore();
if(typeof addEventListener==='function')addEventListener('pagehide',()=>maskSpillStore.clear());
