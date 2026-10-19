'use strict';
// Session-local cache of source-space alpha masks. Transforms never invalidate it.
const cutoutRecords=new Map();
let maskCacheBytes=0,maskCacheGeneration=0,maskPreloadTimer=null,maskPreloadRunning=false,maskPreloadRestart=false;
const MASK_MOBILE=typeof navigator!=='undefined'&&(/Android|iPhone|iPad/i.test(navigator.userAgent)||navigator.userAgentData?.mobile);
const MASK_CACHE_LIMIT=(MASK_MOBILE?64:128)*1024*1024;
function maskSettingsKey() {
  return ['guided-v4-final',document.getElementById('ai-threshold').value,document.getElementById('ai-softness').value,document.getElementById('ai-quality').value].join('|');
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
    while(record.decoded.size>(MASK_MOBILE?3:8)){const candidate=[...record.decoded].find(([key])=>key!==record.previewAt);if(!candidate)break;const [key,old]=candidate;record.decoded.delete(key);old.close();}
    boundDecodedMasks(bitmap);return bitmap;
  }).finally(()=>record.decoding.delete(entry.at));
  record.decoding.set(entry.at,job);return job;
}
function previewCachedMask(mediaId,time) {
  const key=maskRecordKey(mediaId);let record=cutoutRecords.get(key),entry=cachedMaskEntry(record,time),final=true;
  if(!maskEntryMatches(entry,time)){final=false;record=cutoutRecords.get(key+'|draft');entry=cachedMaskEntry(record,time);if(!maskEntryMatches(entry,time))return null;}
  record.previewAt=entry.at;record.previewAccess=Date.now();
  const mask=record.decoded.get(entry.at);
  if(mask){record.decoded.delete(entry.at);record.decoded.set(entry.at,mask);}
  if(!mask && record.decoding.size<4)decodeCachedMask(record,entry).then(()=>{if(!state.isPlaying&&!exporting)requestAnimationFrame(renderCanvasFrame)}).catch(()=>{});
  // Prefetch a few PNG masks, without decoding the whole video into RAM.
  const index=record.sorted.indexOf(entry);
  for(let i=index+1;i<Math.min(record.sorted.length,index+(MASK_MOBILE?3:7))&&record.decoding.size<4;i++) {
    const next=record.sorted[i];if(!record.decoded.has(next.at))decodeCachedMask(record,next).catch(()=>{});
  }
  return mask?{mask,time:entry.at,duration:entry.duration,final}:null;
}
async function getCachedMask(mediaId,time,absolute=false) {
  const record=cutoutRecords.get(maskRecordKey(mediaId));const at=absolute?time:time;
  const entry=cachedMaskEntry(record,at);if(!maskEntryMatches(entry,at))return null;
  const mask=await decodeCachedMask(record,entry);return mask?{mask,time:entry.at,duration:entry.duration,final:true}:null;
}
async function ensureClipCutout(clip,options={}) {
  if(!clip.aiBackgroundRemoval || clip.type!=='video')return;
  const media=state.mediaFiles.find(m=>m.id===clip.mediaId);if(!media)throw new Error('Média source absent.');
  const generation=maskCacheGeneration,key=maskRecordKey(clip.mediaId)+(options.draft?'|draft':'');
  let record=cutoutRecords.get(key);
  if(!record){record={first:0,entries:new Map(),sorted:[],decoded:new Map(),decoding:new Map(),ranges:[],job:null};cutoutRecords.set(key,record);}
  if(options.onProgress)record.report=options.onProgress;
  while(record.job){try{await record.job;}catch(e){if(generation!==maskCacheGeneration)throw e;}}
  if(record.ranges.some(r=>r.start<=clip.startTime+.00001&&r.end>=clip.endTime-.00001))return record;
  const start=clip.startTime,end=clip.endTime;
  const check=()=>{if(generation!==maskCacheGeneration||options.cancelled?.())throw new Error('Préparation du détourage annulée.');};
  const job=(async()=>{
    check();await greenScreenProcessor.ready;const B=await loadMediaLibrary();
    const input=new B.Input({source:makeMediaBlobSource(B,await getStableMediaFile(media)),formats:B.ALL_FORMATS});
    try {
      const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error('Vidéo non décodable pour le précalcul.');
      record.first=await track.getFirstTimestamp();const sink=new B.CanvasSink(track,{poolSize:1});let computed=0;
      const pending=[];const scheduled=new Set();
      const consume=async wrapped=>{
        if(!wrapped)return;check();
        while(options.background&&(exporting||state.isPlaying||document.hidden)){await new Promise(r=>setTimeout(r,150));check();}
        const at=wrapped.timestamp,stamp=Math.round(at*1e6);
        if(record.entries.has(stamp)||scheduled.has(stamp))return;scheduled.add(stamp);
        // Copy before advancing CanvasSink's reusable surface, then pipeline decode/inference/compression.
        const quality=document.getElementById('ai-quality').value,max=options.draft?256:quality==='fine'?1280:quality==='fast'?512:960;
        const factor=Math.min(1,max/Math.max(wrapped.canvas.width,wrapped.canvas.height));
        const copied=document.createElement('canvas');copied.width=Math.round(wrapped.canvas.width*factor);copied.height=Math.round(wrapped.canvas.height*factor);
        const context=copied.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(wrapped.canvas,0,0,copied.width,copied.height);
        const task=(async()=>{const blob=await cutoutWorkerPool.segment(copied,{draft:options.draft});check();
        if(maskCacheBytes+blob.size>MASK_CACHE_LIMIT)throw new Error('Cache IA rempli · aperçu rapide disponible ; qualité finale calculée à l’export.');
        const entry={at,blob,duration:wrapped.duration||1/30};record.entries.set(stamp,entry);maskCacheBytes+=blob.size;computed++;
        insertMaskEntry(record,entry);
        if(computed===1)await decodeCachedMask(record,entry);
        record.report?.({progress:clamp01((at-record.first-start)/Math.max(0.001,end-start)),count:computed,name:media.file.name});
        })();task.catch(()=>{});pending.push(task);
        if(pending.length>=(MASK_MOBILE?1:2))await pending.shift();
        if(options.background)await new Promise(r=>setTimeout(r,MASK_MOBILE?8:0));
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
  const clips=state.timeline.filter(c=>c.aiBackgroundRemoval&&!maskCacheCovers(c)).sort((a,b)=>{const rank=c=>c.id===state.activeClipId?-1:(c.timelineStart||0)>=state.currentTime?(c.timelineStart||0)-state.currentTime:1e9+(c.timelineStart||0);return rank(a)-rank(b);});if(!clips.length)return;
  const generation=maskCacheGeneration,panel=document.getElementById('precache-progress'),status=document.getElementById('precache-status'),meter=document.getElementById('precache-meter'),cancel=document.getElementById('cancel-precache');
  maskPreloadRunning=true;panel.hidden=false;cancel.textContent='Annuler';meter.value=0;
  try {
    for(const draft of [true,false])for(let i=0;i<clips.length;i++) {
      await ensureClipCutout(clips[i],{draft,background:true,cancelled:()=>generation!==maskCacheGeneration,onProgress:({progress,count,name})=>{status.textContent=`Détourage ${draft?'rapide':'affiné'} ${i+1}/${clips.length} · ${Math.round(progress*100)} % · ${count} masques · ${name}`;meter.value=(i+progress)/clips.length;}});
    }
    status.textContent='Détourage prêt · masques en cache, lecture sans inférence IA.';meter.value=1;
    greenScreenProcessor.status('Détourage prêt · lecture depuis le cache');
    renderCanvasFrame();
  } catch(e){status.textContent=e.message;}
  finally {maskPreloadRunning=false;cancel.textContent='Fermer';if(maskPreloadRestart){maskPreloadRestart=false;scheduleCutoutPreload();}}
}
function hasFinalMask(mediaId,time){return maskEntryMatches(cachedMaskEntry(cutoutRecords.get(maskRecordKey(mediaId)),time),time);}
window.PocketCutMasks={hasFinal:hasFinalMask,preview:previewCachedMask,get:getCachedMask,ensure:ensureClipCutout,covers:maskCacheCovers};
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('cancel-precache').onclick=()=>{
    if(maskPreloadRunning){maskCacheGeneration++;document.getElementById('precache-status').textContent='Annulation en cours…';}
    else document.getElementById('precache-progress').hidden=true;
  };
  document.getElementById('prepare-cutout').onclick=()=>preloadProjectCutouts();
});

function insertMaskEntry(record,entry){const last=record.sorted.at(-1);if(!last||last.at<=entry.at)record.sorted.push(entry);else{let lo=0,hi=record.sorted.length;while(lo<hi){const mid=(lo+hi)>>1;if(record.sorted[mid].at<entry.at)lo=mid+1;else hi=mid;}record.sorted.splice(lo,0,entry);}}
function boundDecodedMasks(protectedMask){const limit=MASK_MOBILE?8:24;let count=0;for(const record of cutoutRecords.values())count+=record.decoded.size;for(const record of cutoutRecords.values())for(const [key,mask] of record.decoded){if(count<=limit)return;if(mask===protectedMask||(key===record.previewAt&&Date.now()-(record.previewAccess||0)<250))continue;record.decoded.delete(key);mask.close();count--;}}

function maskEntryMatches(entry,time){const at=entry?.at??entry?.time;return Number.isFinite(at)&&time>=at-.00001&&time<at+(entry.duration||1/30)-.000001;}
