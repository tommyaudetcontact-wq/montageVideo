'use strict';
class ObjectRemover {
 constructor(){this.serial=0;this.jobs=new Map();this.tail=Promise.resolve();this.imageMasks=new Map();this.generation=0;}
 init(){return this.ready??=(async()=>{
  const url=URL.createObjectURL(new Blob([(window.POCKETCUT_MASK_SOURCE||'')+window.POCKETCUT_OBJECT_WORKER_SOURCE],{type:'text/javascript'}));this.worker=new Worker(url);URL.revokeObjectURL(url);
  try{await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Chargement Background remover trop long. Vérifiez la connexion.')),120000);
   this.worker.onerror=()=>{clearTimeout(timer);const e=Error('Background remover interrompu. Réessayez.');reject(e);for(const job of this.jobs.values())job.reject(e);this.jobs.clear();this.ready=null;};
   this.worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.id){const job=this.jobs.get(data.id);if(job){this.jobs.delete(data.id);data.type==='error'?job.reject(Error(data.message)):job.resolve(data.blob);}}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));}};
   this.worker.postMessage({type:'init',refinerURL:new URL('mask-refine.js?v=220',location.href).href,assetBase:new URL('assets/ai/',location.href).href});
  });}catch(e){this.worker.terminate();this.ready=null;throw e;}
 })();}
 segment(source,options={}){
  const task=this.tail.catch(()=>{}).then(async()=>{
   await this.init();const max=options.draft?320:(/Android|iPhone|iPad/i.test(navigator.userAgent)?720:960),w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;
   const scale=Math.min(1,max/Math.max(w,h)),bitmap=await createImageBitmap(source,{resizeWidth:Math.max(1,Math.round(w*scale)),resizeHeight:Math.max(1,Math.round(h*scale)),resizeQuality:'high'}),id=++this.serial;
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.jobs.delete(id);this.worker.terminate();this.ready=null;reject(Error('Background remover trop lent. Réessayez.'));},60000);
    this.jobs.set(id,{resolve:blob=>{clearTimeout(timer);resolve(blob);},reject:e=>{clearTimeout(timer);reject(e);}});
    this.worker.postMessage({type:'segment',id,bitmap,threshold:Number(document.getElementById('ai-threshold').value),softness:Number(document.getElementById('ai-softness').value),refine:!options.draft},[bitmap]);
   });
  });this.tail=task;return task;
 }
 async imageMask(source,clip){
  const key=clip.mediaId+'|'+maskSettingsKey();if(this.imageMasks.has(key))return this.imageMasks.get(key);
  const generation=this.generation;const job=this.segment(source).then(async blob=>{if(generation!==this.generation)throw new DOMException('Projet modifié.','AbortError');return createImageBitmap(blob);}).catch(e=>{if(this.imageMasks.get(key)===job)this.imageMasks.delete(key);throw e;});this.imageMasks.set(key,job);
  while(this.imageMasks.size>8){const first=this.imageMasks.keys().next().value;const old=this.imageMasks.get(first);this.imageMasks.delete(first);old.then(m=>m.close()).catch(()=>{});}
  return job;
 }
 clear(){this.generation++;for(const job of this.imageMasks.values())job.then(m=>m.close()).catch(()=>{});this.imageMasks.clear();}
}
const objectRemover=new ObjectRemover();
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('background-remover-btn');button.onclick=async()=>{
  const clips=editTargets().filter(c=>['image','video'].includes(c.type));if(!clips.length)return showToast('Sélectionnez une image ou une vidéo.');pausePlayback();
  const enabled=!clips.every(c=>c.aiBackgroundRemoval&&c.backgroundRemovalMode==='object');
  for(const c of clips){c.aiBackgroundRemoval=enabled;c.backgroundRemovalMode='object';greenScreenProcessor.frames.delete(c.id);greenScreenProcessor.previewSurfaces.delete(c.id);}
  commitMontage();if(!enabled)return;
  button.disabled=true;try{greenScreenProcessor.status('Background remover · chargement du modèle objet…');await objectRemover.init();
   for(const c of clips.filter(c=>c.type==='image')){const m=state.mediaFiles.find(m=>m.id===c.mediaId);await greenScreenProcessor.prepareFrame(m.element,c,{time:0});}
   renderCanvasFrame();scheduleCutoutPreload();showToast('Background remover · objets · traitement sur cet appareil.');
  }catch(e){greenScreenProcessor.status(e.message);showToast(e.message);}finally{button.disabled=false;}
 };
});
