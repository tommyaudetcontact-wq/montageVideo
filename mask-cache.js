'use strict';
// Session-local cache of source-space alpha masks. Transforms never invalidate it.
const cutoutRecords=new Map();
let maskCacheBytes=0,maskCacheGeneration=0,maskPreloadTimer=null,maskPreloadRunning=false,maskPreloadRestart=false;
const MASK_CACHE_LIMIT=128*1024*1024;
function maskSettingsKey() {
  return ['guided-v2',document.getElementById('ai-threshold').value,document.getElementById('ai-softness').value,document.getElementById('ai-quality').value].join('|');
}
function maskRecordKey(mediaId){return mediaId+'|'+maskSettingsKey();}
function maskCacheCovers(clip) {
  const record=cutoutRecords.get(maskRecordKey(clip.mediaId));
  return !!record && record.ranges.some(r=>r.start<=clip.startTime+0.00001 && r.end>=clip.endTime-0.00001);
}
function mergeMaskRanges(ranges,added) {
  const sorted=[...ranges,added].sort((a,b)=>a.start-b.start),merged=[];
  for(const range of sorted){const last=merged[merged.length-1];if(last&&range.start<=last.end+0.00001)last.end=Math.max(last.end,range.end);else merged.push({...range});}
  return merged;
}
function cachedMaskEntry(record,time) {
  if(!record?.sorted.length)return null;
  let low=0,high=record.sorted.length;
  while(low<high){const mid=(low+high)>>1;if(record.sorted[mid].at<=time+0.00001)low=mid+1;else high=mid;}
  const entry=record.sorted[Math.max(0,low-1)];
  // Never use a mask from a later, disconnected cached section.
  return entry.at<=time+0.00001?entry:null;
}
async function decodeCachedMask(record,entry) {
  if(record.decoded.has(entry.at)){const value=record.decoded.get(entry.at);record.decoded.delete(entry.at);record.decoded.set(entry.at,value);return value;}
  if(record.decoding.has(entry.at))return record.decoding.get(entry.at);
  const generation=maskCacheGeneration;
  const job=createImageBitmap(entry.blob).then(bitmap=>{
    if(generation!==maskCacheGeneration){bitmap.close();return null;}
    record.decoded.set(entry.at,bitmap);
    while(record.decoded.size>16){const [key,old]=record.decoded.entries().next().value;record.decoded.delete(key);old.close();}
    return bitmap;
  }).finally(()=>record.decoding.delete(entry.at));
  record.decoding.set(entry.at,job);return job;
}
function previewCachedMask(mediaId,time) {
  const record=cutoutRecords.get(maskRecordKey(mediaId)),entry=cachedMaskEntry(record,time);
  if(!entry)return null;
  const mask=record.decoded.get(entry.at);
  if(mask){record.decoded.delete(entry.at);record.decoded.set(entry.at,mask);}
  if(!mask && record.decoding.size<4)decodeCachedMask(record,entry).then(()=>{if(!state.isPlaying&&!exporting)requestAnimationFrame(renderCanvasFrame)}).catch(()=>{});
  // Prefetch a few PNG masks, without decoding the whole video into RAM.
  const index=record.sorted.indexOf(entry);
  for(let i=index+1;i<Math.min(record.sorted.length,index+7)&&record.decoding.size<4;i++) {
    const next=record.sorted[i];if(!record.decoded.has(next.at))decodeCachedMask(record,next).catch(()=>{});
  }
  return mask?{mask,time:entry.at}:null;
}
async function getCachedMask(mediaId,time,absolute=false) {
  const record=cutoutRecords.get(maskRecordKey(mediaId));
  const entry=cachedMaskEntry(record,absolute?time-(record?.first||0):time);
  if(!entry)return null;
  const mask=await decodeCachedMask(record,entry);return mask?{mask,time:entry.at}:null;
}
async function ensureClipCutout(clip,options={}) {
  if(!clip.aiBackgroundRemoval || clip.type!=='video')return;
  const media=state.mediaFiles.find(m=>m.id===clip.mediaId);if(!media)throw new Error('Média source absent.');
  const generation=maskCacheGeneration,key=maskRecordKey(clip.mediaId);
  let record=cutoutRecords.get(key);
  if(!record){record={first:0,entries:new Map(),sorted:[],decoded:new Map(),decoding:new Map(),ranges:[],job:null};cutoutRecords.set(key,record);}
  if(options.onProgress)record.report=options.onProgress;
  while(record.job){try{await record.job;}catch(e){if(generation!==maskCacheGeneration)throw e;}}
  if(maskCacheCovers(clip))return record;
  const start=clip.startTime,end=clip.endTime;
  const check=()=>{if(generation!==maskCacheGeneration||options.cancelled?.())throw new Error('Préparation du détourage annulée.');};
  const job=(async()=>{
    check();await greenScreenProcessor.ready;const B=await loadMediaLibrary();
    const input=new B.Input({source:new B.BlobSource(media.file),formats:B.ALL_FORMATS});
    try {
      const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error('Vidéo non décodable pour le précalcul.');
      record.first=await track.getFirstTimestamp();const sink=new B.CanvasSink(track,{poolSize:1});let computed=0;
      const pending=[];const scheduled=new Set();
      const consume=async wrapped=>{
        if(!wrapped)return;check();const at=wrapped.timestamp-record.first,stamp=Math.round(at*1e6);
        if(record.entries.has(stamp)||scheduled.has(stamp))return;scheduled.add(stamp);
        // Copy before advancing CanvasSink's reusable surface, then pipeline decode/inference/compression.
        const quality=document.getElementById('ai-quality').value,max=quality==='fine'?1280:quality==='fast'?512:960;
        const factor=Math.min(1,max/Math.max(wrapped.canvas.width,wrapped.canvas.height));
        const copied=document.createElement('canvas');copied.width=Math.round(wrapped.canvas.width*factor);copied.height=Math.round(wrapped.canvas.height*factor);
        const context=copied.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(wrapped.canvas,0,0,copied.width,copied.height);
        const task=(async()=>{const blob=await cutoutWorkerPool.segment(copied);check();
        if(maskCacheBytes+blob.size>MASK_CACHE_LIMIT)throw new Error('Cache de détourage plein (128 Mo). Raccourcissez le montage ou réduisez la qualité du masque.');
        const entry={at,blob};record.entries.set(stamp,entry);maskCacheBytes+=blob.size;computed++;
        record.sorted=[...record.entries.values()].sort((a,b)=>a.at-b.at);
        if(computed===1)await decodeCachedMask(record,entry);
        record.report?.({progress:clamp01((at-start)/Math.max(0.001,end-start)),count:computed,name:media.file.name});
        })();task.catch(()=>{});pending.push(task);
        if(pending.length>=4)await pending.shift();
      };
      // Capture the frame covering a trimmed start, then traverse actual native frames (including VFR).
      await consume(await sink.getCanvas(start+record.first));
      for await(const wrapped of sink.canvases(start+record.first,end+record.first))await consume(wrapped);
      await Promise.all(pending);check();record.ranges=mergeMaskRanges(record.ranges,{start,end});
      record.report?.({progress:1,count:computed,name:media.file.name});return record;
    } finally {input.dispose();}
  })();
  record.job=job;
  try{return await job;}finally{if(record.job===job)record.job=null;}
}
function clearCutoutCache() {
  maskCacheGeneration++;
  for(const record of cutoutRecords.values())for(const mask of record.decoded.values())mask.close();
  cutoutRecords.clear();maskCacheBytes=0;greenScreenProcessor.frames.clear();
}
function scheduleCutoutPreload() {
  if(maskPreloadRunning)maskPreloadRestart=true;
  clearTimeout(maskPreloadTimer);maskPreloadTimer=setTimeout(()=>preloadProjectCutouts().catch(()=>{}),120);
}
async function preloadProjectCutouts() {
  if(maskPreloadRunning||exporting)return;
  const clips=state.timeline.filter(c=>c.aiBackgroundRemoval&&!maskCacheCovers(c));if(!clips.length)return;
  const generation=maskCacheGeneration,panel=document.getElementById('precache-progress'),status=document.getElementById('precache-status'),meter=document.getElementById('precache-meter'),cancel=document.getElementById('cancel-precache');
  maskPreloadRunning=true;panel.hidden=false;cancel.textContent='Annuler';meter.value=0;
  try {
    for(let i=0;i<clips.length;i++) {
      await ensureClipCutout(clips[i],{cancelled:()=>generation!==maskCacheGeneration,onProgress:({progress,count,name})=>{status.textContent=`Détourage ${i+1}/${clips.length} · ${Math.round(progress*100)} % · ${count} masques · ${name}`;meter.value=(i+progress)/clips.length;}});
    }
    status.textContent='Détourage prêt · masques en cache, lecture sans inférence IA.';meter.value=1;
    greenScreenProcessor.status('Détourage prêt · lecture depuis le cache');
    renderCanvasFrame();
  } catch(e){status.textContent=e.message;}
  finally {maskPreloadRunning=false;cancel.textContent='Fermer';if(maskPreloadRestart){maskPreloadRestart=false;scheduleCutoutPreload();}}
}
window.PocketCutMasks={preview:previewCachedMask,get:getCachedMask,ensure:ensureClipCutout,covers:maskCacheCovers};
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('cancel-precache').onclick=()=>{
    if(maskPreloadRunning){maskCacheGeneration++;document.getElementById('precache-status').textContent='Annulation en cours…';}
    else document.getElementById('precache-progress').hidden=true;
  };
  document.getElementById('prepare-cutout').onclick=()=>preloadProjectCutouts();
});
