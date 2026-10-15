'use strict';
// Keep each binary value below Chromium's large-value threshold; no File/Blob enters IndexedDB.
const LOCAL_CHUNK_BYTES=48*1024,LOCAL_CHUNK_BATCH=16;
async function persistLocalMedia(media){
 const file=media.file;
 const existing=await localRead('media',media.id);
 if(existing?.storage==='binary-chunks-v1'&&existing.size===file.size)return;
 if(navigator.storage?.estimate){
   const {quota,usage}=await navigator.storage.estimate();
   if(Number.isFinite(quota)&&Number.isFinite(usage)&&quota-usage<file.size*1.05)throw new DOMException('Espace insuffisant pour enregistrer '+file.name+'.','QuotaExceededError');
 }
 const count=Math.ceil(file.size/LOCAL_CHUNK_BYTES);
 for(let start=0;start<count;start+=LOCAL_CHUNK_BATCH){
   const batch=[];
   for(let i=start;i<Math.min(count,start+LOCAL_CHUNK_BATCH);i++)batch.push({i,bytes:await file.slice(i*LOCAL_CHUNK_BYTES,(i+1)*LOCAL_CHUNK_BYTES).arrayBuffer()});
   await localTransaction('mediaChunks','readwrite',tx=>{for(const {i,bytes} of batch)tx.objectStore('mediaChunks').put(bytes,[media.id,i]);});
   localStatus('Enregistrement · '+file.name+' · '+Math.round(Math.min(count,start+batch.length)/Math.max(1,count)*100)+' %');
 }
 const record={id:media.id,storage:'binary-chunks-v1',chunkCount:count,size:file.size,mime:file.type,lastModified:file.lastModified,name:file.name,type:media.type,duration:media.duration,thumbnails:media.thumbnails||[],speechBounds:media.speechBounds||[],audioAbsent:!!media.audioAbsent,waveform:makeWaveformData(media.audioBuffer)};
 // Publish only after all chunks commit. Retry overwrites partial chunks using stable keys.
 await localTransaction('media','readwrite',tx=>tx.objectStore('media').put(record));
}
async function readLocalMediaFile(record){
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
