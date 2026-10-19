'use strict';
document.getElementById('toggle-ai').addEventListener('click',async()=>{
  const clip=state.timeline.find(c=>c.id===state.activeClipId);
  if(!clip || clip.type!=='video') return showToast('Sélectionnez un clip vidéo.');
  pausePlayback();
  clip.aiBackgroundRemoval=!clip.aiBackgroundRemoval;
  greenScreenProcessor.frames.delete(clip.id);
  pushState(); renderTimeline(); renderCanvasFrame();
  if(clip.aiBackgroundRemoval)try{await primeClipCutout(clip);}catch(e){showToast('Détourage : '+e.message);}
  showToast(clip.aiBackgroundRemoval?'Détourage activé.':'Détourage désactivé.');
});
for(const id of ['ai-threshold','ai-softness','ai-quality']) document.getElementById(id).addEventListener('input',()=>{
  pausePlayback();clearCutoutCache();scheduleCutoutPreload();renderCanvasFrame();
});
const observer=new MutationObserver(()=>{document.body.classList.toggle('has-media',state.timeline.length>0);document.body.classList.toggle('has-cutout',state.timeline.some(c=>c.aiBackgroundRemoval));});
observer.observe(document.getElementById('timeline-track'),{childList:true});
document.getElementById('cancel-export').addEventListener('click',()=>{
  if(exporting) {exportCancelled=true;exportStatus('Annulation en cours…');}
  else document.getElementById('export-progress').hidden=true;
});
const definitionObserver=new MutationObserver(()=>{
  const c=state.timeline.find(c=>c.type==='video' && !c.aiBackgroundRemoval);
  const m=c && state.mediaFiles.find(m=>m.id===c.mediaId);
  document.getElementById('source-definition').textContent=m ? `· ${m.element.videoWidth} × ${m.element.videoHeight}` : '· définition source';
});
definitionObserver.observe(document.getElementById('timeline-track'),{childList:true});

document.getElementById('retry-ai').onclick=async()=>{
 const button=document.getElementById('retry-ai');button.disabled=true;
 try{
  clearCutoutCache();const interrupted=new Error('Moteur IA relancé.');
  for(const job of greenScreenProcessor.jobs?.values()||[])job.reject(interrupted);greenScreenProcessor.jobs?.clear();greenScreenProcessor.worker?.terminate();
  for(const slot of cutoutWorkerPool.slots)if(!slot.shared){for(const job of slot.jobs.values())job.reject(interrupted);slot.jobs.clear();slot.worker.terminate();}cutoutWorkerPool.slots=[];cutoutWorkerPool.ready=null;
  greenScreenProcessor.failure=null;greenScreenProcessor.isReady=false;
  greenScreenProcessor.ready=greenScreenProcessor.init();greenScreenProcessor.ready.catch(e=>{greenScreenProcessor.failure=e;greenScreenProcessor.status('IA indisponible : '+e.message);});
  await greenScreenProcessor.ready;scheduleCutoutPreload();
 }catch(e){showToast(e.message);}finally{button.disabled=false;}
};
