const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'..'),tick=()=>new Promise(r=>setImmediate(r));
function environment(){
 const caches=new Map(),leases=new Set();
 const env={crypto:require('node:crypto').webcrypto,Response,location:{href:'https://pocketcut.test/index.html'},navigator:{userAgent:'Android',storage:{estimate:async()=>({quota:4*1024**3,usage:1024**3})},locks:{request(name,options,callback){if(typeof options==='function'){callback=options;options={};}if(leases.has(name))return Promise.resolve(callback(null));leases.add(name);return Promise.resolve().then(()=>callback({name})).finally(()=>leases.delete(name));}}}};
 env.caches={async open(name){if(!caches.has(name)){const values=new Map();caches.set(name,{async put(k,v){values.set(k,v.clone());},async match(k){return values.get(k)?.clone();},async delete(k){return values.delete(k);}});}return caches.get(name);},async keys(){return [...caches.keys()];},async delete(n){return caches.delete(n);}};
 return {env,caches,leases};
}
const scope={URL,navigator:{},addEventListener(){}};vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(base,'mask-storage.js'),'utf8')+';globalThis.factory=createMaskSpillStore;',scope);
(async()=>{
 const {env,caches,leases}=environment();
 await env.caches.open('pocketcut-projects');await env.caches.open('pocketcut-preview-masks-v1-orphan');await env.caches.open('pocketcut-preview-masks-v1-active');leases.add('pocketcut-preview-masks-v1-active');
 const store=scope.factory(env),original=new Blob([Uint8Array.from([0,5,127,255,19,0])]);const ref=await store.put(original);assert.ok(ref);assert.deepEqual(Buffer.from(await(await store.get(ref)).arrayBuffer()),Buffer.from(await original.arrayBuffer()),'mask bytes remain lossless');await tick();
 assert.ok(caches.has('pocketcut-projects'),'project caches untouched');assert.ok(caches.has('pocketcut-preview-masks-v1-active'),'other open tabs protected');assert.ok(!caches.has('pocketcut-preview-masks-v1-orphan'),'orphan preview cache reclaimed');
 assert.equal(await store.put({size:300*1024**2}),null,'mobile disk budget bounded');await store.remove(ref);assert.equal(await store.get(ref),null);
 const retained=await store.put(original);store.clear();await tick();assert.equal(await store.get(retained),null);assert.ok(!caches.has(retained.session.name),'clear removes only owned preview cache');assert.ok(caches.has('pocketcut-projects'));
 assert.equal(await scope.factory({navigator:{}}).put(original),null,'unsupported storage falls back safely');
 const limited=environment();limited.env.navigator.storage.estimate=async()=>({quota:1000,usage:999});assert.equal(await scope.factory(limited.env).put(original),null,'reserve project storage on quota exhaustion');
 const c={Blob,Map,Set,Date,Promise,DOMException,createImageBitmap:async b=>({data:await b.text(),close(){}}),maskSpillStore:store,window:{},document:{addEventListener(){},getElementById:()=>({value:'fine'})},navigator:{userAgent:''}};
 vm.createContext(c);let code=fs.readFileSync(path.join(base,'mask-cache.js'),'utf8').replace('const MASK_CACHE_LIMIT=(MASK_MOBILE?64:128)*1024*1024;','const MASK_CACHE_LIMIT=10;');vm.runInContext(code+`;globalThis.test={retainCompressedMask,decodeCachedMask,records:cutoutRecords,bytes:()=>maskCacheBytes};`,c);
 const record={entries:new Map(),sorted:[],decoded:new Map(),decoding:new Map(),ranges:[]};c.test.records.set('source',record);
 const a={at:0,blob:new Blob(['abcdef']),duration:1/30},b={at:1/30,blob:new Blob(['ghijkl']),duration:1/30};
 await c.test.retainCompressedMask(record,0,a,0);await c.test.retainCompressedMask(record,1,b,0);assert.ok(c.test.bytes()<=10);assert.equal(a.blob,null,'older compressed mask spills instead of aborting');assert.ok(a.spill);assert.equal((await c.test.decodeCachedMask(record,a)).data,'abcdef','spilled frame decodes unchanged');
 await assert.rejects(c.test.retainCompressedMask(record,2,{blob:new Blob(['mnopqr'])},-1),{name:'AbortError'},'cancelled work cannot enter cache');
 store.clear();await tick();console.log('PASS: lossless spill/read, RAM/disk limits, cancellation, quota fallback, orphan cleanup, active-tab leases and project isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
