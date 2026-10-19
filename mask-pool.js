'use strict';
// Two independent CPU models. PNG encoding stays in the worker, off the UI thread.
class CutoutWorkerPool {
 constructor(){this.slots=[];this.cursor=0;this.ready=null;}
 init(){return this.ready??=(async()=>{
   await greenScreenProcessor.ready;
   this.slots.push({worker:greenScreenProcessor.worker,jobs:greenScreenProcessor.jobs,shared:true,tail:Promise.resolve()});
   const mobile=navigator.userAgentData?.mobile||/Android|iPhone|iPad/i.test(navigator.userAgent);
   const count=mobile?1:navigator.hardwareConcurrency>=8?3:navigator.hardwareConcurrency>=4?2:1;
   await Promise.allSettled(Array.from({length:count-1},()=>this.create()));
 })();}
 async create(){
   let url=location.protocol==='file:'?URL.createObjectURL(new Blob([(window.POCKETCUT_MASK_SOURCE||'')+window.POCKETCUT_WORKER_SOURCE],{type:'text/javascript'})):'segment-worker.js?v=25';
   const worker=new Worker(url);if(location.protocol==='file:')URL.revokeObjectURL(url);
   const slot={worker,jobs:new Map(),serial:0,tail:Promise.resolve()};
   try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chargement du worker IA trop long.')),120000);
    worker.onerror=()=>{clearTimeout(timer);reject(Error('Worker de précalcul indisponible.'));for(const j of slot.jobs.values())j.reject(Error('Worker interrompu.'));slot.jobs.clear();};
    worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.id){const j=slot.jobs.get(data.id);if(j){slot.jobs.delete(data.id);clearTimeout(j.timer);data.type==='error'?j.reject(Error(data.message)):j.resolve(data.blob);}}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));}};
    worker.postMessage({type:'init',refinerURL:new URL('mask-refine.js?v=25',location.href).href,assetBase:new URL('assets/ai/',location.href).href});
   });}catch(e){worker.terminate();throw e;}this.slots.push(slot);return slot;
 }
 async segment(canvas,options={}){
   await this.init();const slot=this.slots[this.cursor++%this.slots.length];
   const quality=document.getElementById('ai-quality').value,max=options.draft?256:quality==='fine'?1280:quality==='fast'?512:960;
   const factor=Math.min(1,max/Math.max(canvas.width,canvas.height));
   const bitmap=await createImageBitmap(canvas,{resizeWidth:Math.max(1,Math.round(canvas.width*factor)),resizeHeight:Math.max(1,Math.round(canvas.height*factor)),resizeQuality:'high'});
   const threshold=Number(document.getElementById('ai-threshold').value),softness=Number(document.getElementById('ai-softness').value);
   const task=slot.tail.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
     const id=slot.shared?++greenScreenProcessor.serial:++slot.serial,timer=setTimeout(()=>{slot.jobs.delete(id);reject(Error('Détourage trop lent.'));},30000);
     slot.jobs.set(id,{resolve:data=>{clearTimeout(timer);resolve(slot.shared?data.blob:data);},reject:e=>{clearTimeout(timer);reject(e);},timer});slot.worker.postMessage({type:'segment',id,bitmap,threshold,softness,refine:!options.draft,cachePng:true},[bitmap]);
   }));slot.tail=task;return task;
 }
}
const cutoutWorkerPool=new CutoutWorkerPool();
