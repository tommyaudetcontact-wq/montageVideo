'use strict';
// Keep each binary value below Chromium's large-value threshold; no File/Blob enters IndexedDB.
const LOCAL_CHUNK_BYTES=48*1024,LOCAL_CHUNK_BATCH=64;
async function writeLocalMedia(media){
 const file=media.file;
 const existing=await localRead('media',media.id);
 if(['binary-chunks-v1','opfs-v1'].includes(existing?.storage)&&existing.size===file.size)return;
 if(navigator.storage?.estimate){
   const {quota,usage}=await navigator.storage.estimate();
   if(Number.isFinite(quota)&&Number.isFinite(usage)&&quota-usage<file.size*1.05)throw new DOMException('Espace insuffisant pour enregistrer '+file.name+'.','QuotaExceededError');
 }
 if(navigator.storage?.getDirectory){
   let directory;
   try{directory=await mediaStorageDirectory();}catch(e){if(e.name==='QuotaExceededError')throw e;}
   if(directory){
     const opfsKey=encodeURIComponent(media.id),handle=await directory.getFileHandle(opfsKey,{create:true});let writer;
     try{writer=await handle.createWritable();localStatus('Copie locale · '+file.name);await file.stream().pipeTo(writer);}
     catch(e){try{await writer?.abort();}catch{}throw e;}
     const record=localMediaDescriptor(media,{storage:'opfs-v1',opfsKey});await localTransaction('media','readwrite',tx=>tx.objectStore('media').put(record));return;
   }
 }
 const count=Math.ceil(file.size/LOCAL_CHUNK_BYTES);
 for(let start=0;start<count;start+=LOCAL_CHUNK_BATCH){
   const batch=[];
   const bytes=await file.slice(start*LOCAL_CHUNK_BYTES,Math.min(file.size,(start+LOCAL_CHUNK_BATCH)*LOCAL_CHUNK_BYTES)).arrayBuffer();
   for(let i=start;i<Math.min(count,start+LOCAL_CHUNK_BATCH);i++)batch.push({i,bytes:bytes.slice((i-start)*LOCAL_CHUNK_BYTES,(i-start+1)*LOCAL_CHUNK_BYTES)});
   await localTransaction('mediaChunks','readwrite',tx=>{for(const {i,bytes} of batch)tx.objectStore('mediaChunks').put(bytes,[media.id,i]);});
   localStatus('Enregistrement · '+file.name+' · '+Math.round(Math.min(count,start+batch.length)/Math.max(1,count)*100)+' %');
 }
 const record=localMediaDescriptor(media,{storage:'binary-chunks-v1',chunkCount:count});
 // Publish only after all chunks commit. Retry overwrites partial chunks using stable keys.
 await localTransaction('media','readwrite',tx=>tx.objectStore('media').put(record));
}
async function readLocalMediaFile(record){
 if(record.storage==='opfs-v1'){const directory=await mediaStorageDirectory(),handle=await directory.getFileHandle(record.opfsKey),file=await handle.getFile();if(file.size!==record.size)throw Error('Média local incomplet : '+record.name);return new File([file],record.name,{type:record.mime,lastModified:record.lastModified});}
 if(record.storage!=='binary-chunks-v1'){
   if(!record.file)throw Error('Média local manquant : '+record.name);
   return record.file instanceof File?record.file:new File([record.file],record.name,{type:record.file.type});
 }
 const parts=[];let size=0;
 for(let start=0;start<record.chunkCount;start+=LOCAL_CHUNK_BATCH){
   const batch=await localTransaction('mediaChunks','readonly',(tx,done)=>{
     const buffers=[];for(let i=start;i<Math.min(record.chunkCount,start+LOCAL_CHUNK_BATCH);i++){
       const at=i-start,request=tx.objectStore('mediaChunks').get([record.id,i]);request.onsuccess=()=>{buffers[at]=request.result;};
     }done(buffers);
   });
   for(const buffer of batch){if(!(buffer instanceof ArrayBuffer))throw Error('Média local incomplet : '+record.name);parts.push(buffer);size+=buffer.byteLength;}
 }
 if(size!==record.size)throw Error('Taille du média local incorrecte : '+record.name);
 return new File(parts,record.name,{type:record.mime,lastModified:record.lastModified});
}

async function mediaStorageDirectory(){
 const root=await navigator.storage.getDirectory();let hash=2166136261;for(const c of new URL('.',location.href).pathname)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return root.getDirectoryHandle('pocketcut-v2-media-'+(hash>>>0).toString(16),{create:true});
}
function localMediaDescriptor(media,storage){const file=media.file;return {id:media.id,...storage,size:file.size,mime:file.type,lastModified:file.lastModified,name:file.name,type:media.type,duration:media.duration,thumbnails:media.thumbnails||[],speechBounds:media.speechBounds||[],speechAnalyzed:!!media.speechAnalyzed,audioAbsent:!!media.audioAbsent,takeWords:media.takeWords,takeWordVersion:media.takeWordVersion,sceneBackground:!!media.sceneBackground,waveform:media.waveformPreview?{sampleRate:media.waveformPreview.sampleRate,data:media.waveformPreview.getChannelData(0)}:makeWaveformData(media.audioBuffer)};}
async function saveMediaAnalysis(media){const record=await localRead('media',media.id);if(!record)return;await localTransaction('media','readwrite',tx=>tx.objectStore('media').put({...record,thumbnails:media.thumbnails||record.thumbnails||[],speechBounds:media.speechBounds,speechAnalyzed:!!media.speechAnalyzed,audioAbsent:!!media.audioAbsent,takeWords:media.takeWords,takeWordVersion:media.takeWordVersion,sceneBackground:!!media.sceneBackground,waveform:media.waveformPreview?{sampleRate:media.waveformPreview.sampleRate,data:media.waveformPreview.getChannelData(0)}:record.waveform}));}

const mediaStorageJobs=new Map();
function persistLocalMedia(media){if(mediaStorageJobs.has(media.id))return mediaStorageJobs.get(media.id);const job=writeLocalMedia(media).finally(()=>mediaStorageJobs.delete(media.id));mediaStorageJobs.set(media.id,job);return job;}
async function getStableMediaFile(media){
 await persistLocalMedia(media);const record=await localRead('media',media.id);if(!record)throw Error('Copie locale manquante : '+media.file.name);
 const file=await readLocalMediaFile(record);await file.slice(0,Math.min(16,file.size)).arrayBuffer();return file;
}
function makeMediaBlobSource(B,file){return new B.BlobSource(file,{maxCacheSize:4*1024*1024,useStreamReader:false});}
