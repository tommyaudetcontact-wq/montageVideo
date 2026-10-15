'use strict';
const PROJECT_SETTINGS=['ai-threshold','ai-softness','ai-quality','export-resolution','export-fps','workspace-format'];
let localDatabase,localReady=false,localSaving=false,localDirty=false,localTimer,localCursorTimer;
const localMediaWritten=new Set();
const localStatus=message=>{const el=document.getElementById('autosave-status');if(el)el.textContent=message;};
function makeWaveformData(buffer){
 if(!buffer)return null;const data=buffer.getChannelData(0),bins=Math.ceil(buffer.duration*30),peaks=new Float32Array(bins*2);
 for(let i=0;i<bins;i++){
   const start=Math.floor(i*buffer.sampleRate/30),end=Math.min(data.length,Math.floor((i+1)*buffer.sampleRate/30));let lo=0,hi=0;
   for(let at=start;at<end;at++){lo=Math.min(lo,data[at]);hi=Math.max(hi,data[at]);}peaks[i*2]=lo;peaks[i*2+1]=hi;
 }return {sampleRate:60,data:peaks};
}
function openLocalDatabase(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('pocketcut-studio:'+new URL('.',location.href).pathname,1);
 request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('projects');db.createObjectStore('media',{keyPath:'id'});db.createObjectStore('presets',{keyPath:'id'});};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Fermez les autres onglets PocketCut pour ouvrir la sauvegarde.'));
});}
function localRead(store,key){return new Promise((resolve,reject)=>{const req=localDatabase.transaction(store,'readonly').objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function localAll(store){return new Promise((resolve,reject)=>{const req=localDatabase.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function projectCheckpoint(){
 const settings={};for(const id of PROJECT_SETTINGS)settings[id]=document.getElementById(id).value;
 return {version:1,savedAt:Date.now(),live:{timeline:structuredClone(state.timeline),groups:structuredClone(state.groups),activeClipId:state.activeClipId,projectWidth:workspaceWidth(),projectHeight:workspaceHeight()},currentTime:state.currentTime,isSnapping:state.isSnapping,historyStack:[...historyStack],historyIndex,settings,mediaIds:state.mediaFiles.map(m=>m.id)};
}
async function saveLocalProject(){
 if(!localReady)return;
 clearTimeout(localTimer);clearTimeout(localCursorTimer);localDirty=true;if(localSaving)return;
 localSaving=true;
 try{
   while(localDirty){
     localDirty=false;const checkpoint=projectCheckpoint(),unwritten=state.mediaFiles.filter(m=>!localMediaWritten.has(m.id));localStatus('Enregistrement…');
     await new Promise((resolve,reject)=>{
       const tx=localDatabase.transaction(['projects','media'],'readwrite');
       tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Sauvegarde interrompue.'));
       const mediaStore=tx.objectStore('media');
       for(const m of unwritten)mediaStore.put({id:m.id,file:m.file,name:m.file.name,type:m.type,duration:m.duration,thumbnails:m.thumbnails||[],speechBounds:m.speechBounds||[],audioAbsent:!!m.audioAbsent,waveform:makeWaveformData(m.audioBuffer)});
       tx.objectStore('projects').put(checkpoint,'current');
     });
     for(const m of unwritten)localMediaWritten.add(m.id);localStatus('✓ Sauvegardé localement');
   }
 }catch(e){localStatus('⚠ Sauvegarde impossible');showToast(e.name==='QuotaExceededError'?'Stockage local plein : les dernières modifications ne sont pas sauvegardées.':'Sauvegarde locale : '+e.message);}
 finally{localSaving=false;}
}
window.PocketCutSession={
 schedule(){if(!localReady)return;localDirty=true;clearTimeout(localTimer);localTimer=setTimeout(saveLocalProject,0);},
 remember(){if(!localReady)return;clearTimeout(localCursorTimer);localCursorTimer=setTimeout(saveLocalProject,700);},
 flush:saveLocalProject,
 get ready(){return localReady;},get saving(){return localSaving;}
};
async function restoreLocalMedia(record){
 const file=record.file instanceof File?record.file:new File([record.file],record.name,{type:record.file.type}),url=URL.createObjectURL(file);
 const element=record.type==='image'?new Image():document.createElement('video');
 if(record.type==='video'){element.playsInline=true;element.preload='metadata';element.muted=true;}
 try{await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Restauration du média trop longue : '+record.name)),20000);
   element.addEventListener(record.type==='image'?'load':'loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});element.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Média local illisible : '+record.name));},{once:true});element.src=url;
 });}catch(e){URL.revokeObjectURL(url);throw e;}
 const waveformPreview=record.waveform?{sampleRate:record.waveform.sampleRate,getChannelData:()=>record.waveform.data}:null;
 return {...record,file,url,element,audioBuffer:null,waveformPreview,used:false};
}
async function initLocalSession(){
 try{
   localDatabase=await openLocalDatabase();localDatabase.onversionchange=()=>{localDatabase.close();localReady=false;localStatus('Rechargez pour rouvrir la sauvegarde');};
   const saved=await localRead('projects','current');
   if(saved){
     if(saved.version!==1)throw Error('Version du projet local non prise en charge.');
     const records=await Promise.all(saved.mediaIds.map(id=>localRead('media',id)));if(records.some(r=>!r?.file))throw Error('Un média manque dans la sauvegarde locale.');
     const restored=await Promise.all(records.map(restoreLocalMedia));
     state.mediaFiles=restored;for(const m of restored)localMediaWritten.add(m.id);
     for(const [id,value] of Object.entries(saved.settings||{})){const el=document.getElementById(id);if(el)el.value=value;}
     historyStack=saved.historyStack;historyIndex=saved.historyIndex;state.currentTime=saved.currentTime||0;state.isSnapping=saved.isSnapping!==false;
     snapToggleBtn.classList.toggle('btn-info',state.isSnapping);snapToggleBtn.classList.toggle('btn-outline-info',!state.isSnapping);snapToggleBtn.setAttribute('aria-pressed',String(state.isSnapping));
     restoreState(JSON.stringify(saved.live));state.currentTime=Math.min(state.currentTime,getTotalDuration());renderTimeline();window.revealSelectedLayer?.();renderCanvasFrame();
     scheduleCutoutPreload();localStatus('✓ Projet local restauré');
   }else localStatus('✓ Sauvegarde locale active');
   localReady=true;
   await initPresetControls();
 }catch(e){localStatus('⚠ Sauvegarde indisponible');showToast('Projet local : '+e.message);}
 finally{document.getElementById('session-loading').hidden=true;}
}
async function storePreset(preset){return new Promise((resolve,reject)=>{
 const tx=localDatabase.transaction('presets','readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);tx.objectStore('presets').put(preset);
});}
async function initPresetControls(){
 const byId=id=>document.getElementById(id);let presets=[];
 const active=()=>state.timeline.find(c=>c.id===state.activeClipId);
 async function refresh(selected){
   presets=(await localAll('presets')).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
   const list=byId('preset-list');list.replaceChildren();
   if(!presets.length){const option=document.createElement('option');option.textContent='Aucun préréglage enregistré';option.value='';list.appendChild(option);}
   for(const p of presets){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;list.appendChild(option);}
   if(selected)list.value=selected;byId('apply-preset').disabled=!presets.length;byId('rename-preset').disabled=!presets.length;
 }
 const fail=e=>{byId('preset-status').textContent='Enregistrement impossible : '+e.message;};
 byId('presets-btn').onclick=async()=>{try{await refresh();window.openPocketCutTool('Mes préréglages',[byId('preset-settings')]);byId('preset-status').textContent='Les préréglages restent disponibles après fermeture du projet.';}catch(e){fail(e);}};
 byId('save-preset').onclick=async()=>{
   const c=active(),name=byId('preset-name').value.trim();if(!c)return showToast('Sélectionnez un calque à enregistrer.');if(!name)return byId('preset-status').textContent='Donnez un nom au préréglage.';
   try{const preset=makeClipPreset(c,name);await storePreset(preset);await refresh(preset.id);byId('preset-status').textContent='« '+name+' » enregistré localement.';}catch(e){fail(e);}
 };
 byId('apply-preset').onclick=()=>{
   const c=active(),preset=presets.find(p=>p.id===byId('preset-list').value);if(!c)return showToast('Sélectionnez un calque.');if(!preset)return;
   pausePlayback();const group=c.groupId&&state.groups[c.groupId],clips=group?.kind==='sequence'?state.timeline.filter(x=>x.groupId===c.groupId):[c];
   const span=clips.length>1?groupRange(c.groupId,state.timeline):{start:c.timelineStart||0,duration:c.endTime-c.startTime};
   for(const x of clips){applyClipPreset(preset,x,span);greenScreenProcessor.frames.delete(x.id);}
   if(clips.length>1){group.autoZoom=structuredClone(preset.autoZoom);for(const x of clips)x.autoZoom={enabled:false,percent:15};}
   state.editPoseClipId=null;pushState();renderTimeline();renderCanvasFrame();greenScreenProcessor.updateSlidersUI(c);byId('preset-status').textContent='« '+preset.name+' » appliqué · durée adaptée.';
 };
 byId('rename-preset').onclick=async()=>{
   const preset=presets.find(p=>p.id===byId('preset-list').value),name=byId('preset-name').value.trim();if(!preset||!name)return byId('preset-status').textContent='Choisissez un préréglage et saisissez son nouveau nom.';
   try{await storePreset({...preset,name});await refresh(preset.id);byId('preset-status').textContent='Préréglage renommé.';}catch(e){fail(e);}
 };
 await refresh();
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('presets-btn').onclick=()=>showToast('Le stockage local n’est pas disponible dans ce navigateur.');
 for(const id of PROJECT_SETTINGS)document.getElementById(id).addEventListener('change',()=>window.PocketCutSession.schedule());
 initLocalSession();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveLocalProject();});
window.addEventListener('pagehide',()=>saveLocalProject());
