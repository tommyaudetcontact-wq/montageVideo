'use strict';
// A small JSON manifest followed by uncompressed original files. Blob/File slices
// keep multi-GB projects off the JS heap; only the manifest is decoded as text.
const PROJECT_FILE_MAGIC='POCKETCUT-PROJECT-1\n';
const PROJECT_MANIFEST_LIMIT=32*1024*1024;
let projectFileBusy=false;
function projectFileName(name){return (name||'Mon montage').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100)+'.pocketcut';}
async function buildProjectFile(){
 const project=projectCheckpoint(),media=[...state.mediaFiles],files=[],descriptors=[];
 for(const [i,m] of media.entries()){
  projectFileStatus('Préparation '+(i+1)+'/'+media.length+' · '+m.file.name);
  // Prefer the browser's durable copy, but allow an external backup even when
  // quota exhaustion prevented autosave of a freshly imported source.
  const record=await localRead('media',m.id),file=record?await readLocalMediaFile(record):m.file;
  if(!file?.size)throw Error('Média vide ou inaccessible : '+m.file.name);
  await file.slice(0,16).arrayBuffer();await file.slice(-16).arrayBuffer();
  const descriptor=localMediaDescriptor({...m,file},{});
  if(descriptor.waveform)descriptor.waveform={...descriptor.waveform,data:Array.from(descriptor.waveform.data)};
  descriptors.push(descriptor);files.push(file);
 }
 const manifest=new TextEncoder().encode(JSON.stringify({format:'pocketcut-project',version:1,project,media:descriptors}));
 if(manifest.length>PROJECT_MANIFEST_LIMIT)throw Error('Historique trop volumineux pour cette sauvegarde.');
 const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,manifest.length,true);
 return new Blob([PROJECT_FILE_MAGIC,size,manifest,...files],{type:'application/x-pocketcut-project'});
}
async function readProjectFile(file){
 const prefix=new TextEncoder().encode(PROJECT_FILE_MAGIC),start=prefix.length+4;
 if(file.size<start)throw Error('Ce fichier n’est pas un projet PocketCut.');
 const header=new Uint8Array(await file.slice(0,start).arrayBuffer());
 if(!prefix.every((b,i)=>header[i]===b))throw Error('Format de projet PocketCut inconnu.');
 const size=new DataView(header.buffer).getUint32(prefix.length,true);
 if(!size||size>PROJECT_MANIFEST_LIMIT||start+size>file.size)throw Error('Sauvegarde incomplète ou invalide.');
 let manifest;try{manifest=JSON.parse(await file.slice(start,start+size).text());}catch{throw Error('Informations du projet illisibles.');}
 validateProjectManifest(manifest);
 let offset=start+size;const media=manifest.media.map(m=>{
  const end=offset+m.size;if(!Number.isSafeInteger(end)||end>file.size)throw Error('Sauvegarde incomplète : '+m.name);
  const source=new File([file.slice(offset,end)],m.name,{type:m.mime,lastModified:m.lastModified});offset=end;return {...m,file:source};
 });
 if(offset!==file.size)throw Error('La taille du fichier ne correspond pas au projet.');
 return {project:manifest.project,media};
}
function validateProjectManifest(m){
 if(m?.format!=='pocketcut-project'||m.version!==1||m.project?.version!==1||!Array.isArray(m.media)||m.media.length>10000)throw Error('Version de sauvegarde non prise en charge.');
 const ids=new Set();
 for(const media of m.media){if(typeof media.id!=='string'||ids.has(media.id)||!['image','video'].includes(media.type)||!Number.isSafeInteger(media.size)||media.size<=0||typeof media.name!=='string')throw Error('Liste des médias invalide.');ids.add(media.id);}
 const p=m.project;
 const checkLive=live=>{
  if(!live||!Array.isArray(live.timeline)||!live.groups||typeof live.groups!=='object'||!Number.isFinite(live.projectWidth)||!Number.isFinite(live.projectHeight)||live.projectWidth<=0||live.projectHeight<=0)throw Error('Montage invalide.');
  for(const c of live.timeline){if(!ids.has(c.mediaId)||!Number.isFinite(c.startTime)||!Number.isFinite(c.endTime)||c.endTime<c.startTime||(c.scene?.visualMediaId&&!ids.has(c.scene.visualMediaId)))throw Error('Un clip référence un média absent ou une durée invalide.');}
 };
 checkLive(p.live);
 if(!Array.isArray(p.mediaIds)||p.mediaIds.length!==ids.size||new Set(p.mediaIds).size!==ids.size||p.mediaIds.some(id=>!ids.has(id))||!Array.isArray(p.historyStack)||!p.historyStack.length||!Number.isInteger(p.historyIndex)||p.historyIndex<0||p.historyIndex>=p.historyStack.length)throw Error('Historique du projet invalide.');
 for(const s of p.historyStack){try{checkLive(JSON.parse(s));}catch{throw Error('Historique du projet endommagé.');}}
}
function remapProjectMedia(project,map){
 const walk=value=>{
  if(Array.isArray(value))return value.map(walk);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(k==='mediaId'||k==='visualMediaId')&&map.has(v)?map.get(v):walk(v)]));
  return value;
 };
 const p=structuredClone(project);p.id='project_'+crypto.randomUUID();p.savedAt=Date.now();if(typeof PROJECT_SETTINGS!=='undefined')p.settings=Object.fromEntries(Object.entries(p.settings||{}).filter(([id])=>PROJECT_SETTINGS.includes(id)));p.live=walk(p.live);p.mediaIds=p.mediaIds.map(id=>map.get(id));p.historyStack=p.historyStack.map(s=>JSON.stringify(walk(JSON.parse(s))));return p;
}
function projectFileStatus(text){const el=document.getElementById('project-file-status');if(el)el.textContent=text;}
async function importProjectFile(file){
 if(projectFileBusy||projectSwitching||pendingMediaImports.size||exporting)throw Error('Attendez la fin de l’opération en cours.');
 projectFileBusy=true;let imported=null,opened=false;const created=[];
 try{
  const contents=await readProjectFile(file);
  if(!await saveLocalProject())throw lastSaveProblem||Error('Sauvegardez le projet actuel avant d’en ouvrir un autre.');
  projectSwitching=true;localReady=false;clearTimeout(localTimer);clearTimeout(localCursorTimer);pausePlayback();
  const map=new Map(contents.media.map(m=>[m.id,'media_'+crypto.randomUUID()]));imported=remapProjectMedia(contents.project,map);
  for(const [i,m] of contents.media.entries()){
   const media={...m,id:map.get(m.id),waveformPreview:m.waveform?{sampleRate:m.waveform.sampleRate,getChannelData:()=>new Float32Array(m.waveform.data)}:null};
   created.push(media.id);projectFileStatus('Importation '+(i+1)+'/'+contents.media.length+' · '+m.name);await persistLocalMedia(media);
  }
  await localTransaction('projects','readwrite',tx=>tx.objectStore('projects').put(imported,imported.id));
  await restoreProjectSnapshot(imported);opened=true;
  await localTransaction('meta','readwrite',tx=>tx.objectStore('meta').put(imported.id,'activeProject'));
  document.getElementById('tool-dialog').close();showToast('Projet restauré · médias, montage et annuler/rétablir disponibles.');return imported.id;
 }catch(e){
  if(!opened){if(imported)await localTransaction('projects','readwrite',tx=>tx.objectStore('projects').delete(imported.id)).catch(()=>{});
   for(const id of created)await removeImportedProjectMedia(id).catch(()=>{});
  }throw e;
 }finally{localReady=!!currentProjectId;projectSwitching=false;projectFileBusy=false;}
}
async function removeImportedProjectMedia(id){
 const r=await localRead('media',id);
 if(navigator.storage?.getDirectory)await(await mediaStorageDirectory()).removeEntry(r?.opfsKey||encodeURIComponent(id)).catch(()=>{});
 await localTransaction(['media','mediaChunks'],'readwrite',tx=>{tx.objectStore('media').delete(id);tx.objectStore('mediaChunks').delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]));});
}
window.PocketCutProjectFiles={build:buildProjectFile,read:readProjectFile,import:importProjectFile};
document.addEventListener('DOMContentLoaded',()=>{
 const box=document.createElement('fieldset');box.innerHTML='<legend>Sauvegarde transportable</legend><p>Le fichier .pocketcut contient le montage, les médias originaux et tout l’historique. Ouvrez-le sur un autre appareil ou conservez-le en sauvegarde.</p><div class="animation-row"><button id="save-project-file" type="button" class="btn">↓ Sauvegarder le projet</button><button id="open-project-file" type="button" class="btn">↑ Ouvrir un projet</button><input id="project-file-input" type="file" accept=".pocketcut,application/x-pocketcut-project" hidden></div><p id="project-file-status" role="status"></p>';
 document.getElementById('project-settings').prepend(box);
 const save=document.getElementById('save-project-file'),open=document.getElementById('open-project-file'),input=document.getElementById('project-file-input');
 save.onclick=async()=>{if(projectFileBusy||pendingMediaImports.size||exporting)return showToast('Attendez la fin de l’opération en cours.');projectFileBusy=true;save.disabled=open.disabled=true;
  try{const name=projectFileName(currentProjectName),blob=await buildProjectFile(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),600000);projectFileStatus('Téléchargement lancé · '+name+' · '+(blob.size/1048576).toFixed(1)+' Mo');}
  catch(e){projectFileStatus(e.message);}finally{projectFileBusy=false;save.disabled=open.disabled=false;}
 };
 open.onclick=()=>input.click();input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;save.disabled=open.disabled=true;try{await importProjectFile(file);}catch(e){projectFileStatus(e.message);}finally{save.disabled=open.disabled=false;}};
});
