'use strict';
const previewAudioPlayers=new Map(),previewAudioPresence=new Map();
let previewAudioEpoch=0,previewAudioLookAhead=0;
function releasePreviewAudio(id,item){item.audio.pause();item.audio.removeAttribute('src');item.audio.load();item.node.disconnect();item.gain.disconnect();previewAudioPlayers.delete(id);}
function stopPreviewAudio(){
 previewAudioEpoch++;
 const urls=new Set(state.mediaFiles.map(m=>m.url));
 for(const [id,item] of previewAudioPlayers){item.audio.pause();if(!urls.has(item.url))releasePreviewAudio(id,item);}
 for(const url of previewAudioPresence.keys())if(!urls.has(url))previewAudioPresence.delete(url);
}
function previewAudioTime(clip,time){return clip.startTime+time-(clip.timelineStart||0)-(clip.audioOffset||0);}
async function previewMediaHasAudio(media){
 if(media.audioAbsent)return false;
 if(!previewAudioPresence.has(media.url)){
  const job=(async()=>{let input;try{const B=await loadMediaLibrary();input=new B.Input({source:makeMediaBlobSource(B,media.file),formats:B.ALL_FORMATS});return !!await input.getPrimaryAudioTrack();}catch{return true;}finally{input?.dispose();}})();previewAudioPresence.set(media.url,job);
 }
 return previewAudioPresence.get(media.url);
}
function previewAudioItem(clip,media){
 let item=previewAudioPlayers.get(clip.id);
 if(item&&item.url!==media.url){releasePreviewAudio(clip.id,item);item=null;}
 if(!item){
  const audio=document.createElement('audio'),ctx=getAudioContext();audio.preload='auto';audio.src=media.url;
  const node=ctx.createMediaElementSource(audio),gain=ctx.createGain();node.connect(gain);gain.connect(ctx.destination);
  item={audio,node,gain,url:media.url,preparing:null,starting:null};previewAudioPlayers.set(clip.id,item);audio.load();
 }
 previewAudioPlayers.delete(clip.id);previewAudioPlayers.set(clip.id,item);item.gain.gain.value=clip.volume??1;return item;
}
function waitPreviewAudio(item,target,valid){
 const audio=item.audio;
 return new Promise((resolve,reject)=>{
  let positioned=false;
  const done=error=>{clearTimeout(timer);clearInterval(poll);for(const e of ['loadedmetadata','loadeddata','canplay','seeked'])audio.removeEventListener(e,check);audio.removeEventListener('error',fail);error?reject(error):resolve(item);};
  const fail=()=>done(Error('Lecture audio indisponible.'));
  const check=()=>{
   if(!valid())return done(new DOMException('Lecture annulée.','AbortError'));
   if(audio.error)return fail();
   if(audio.readyState>=1&&!positioned){positioned=true;if(Math.abs(audio.currentTime-target)>.015){audio.currentTime=target;return;}}
   if(positioned&&audio.readyState>=3&&!audio.seeking&&Math.abs(audio.currentTime-target)<.05)done();
  };
  const timer=setTimeout(()=>done(Error('Préparation du son trop longue. Réessayez la lecture.')),15000),poll=setInterval(check,40);
  for(const e of ['loadedmetadata','loadeddata','canplay','seeked'])audio.addEventListener(e,check);audio.addEventListener('error',fail);check();
 });
}
async function preparePreviewAudioClip(clip,time,valid){
 const media=state.mediaFiles.find(m=>m.id===clip.mediaId);if(!media||!await previewMediaHasAudio(media)||!valid())return null;
 const item=previewAudioItem(clip,media),target=Math.max(clip.startTime,Math.min(clip.endTime-.00001,previewAudioTime(clip,time)));
 if(item.preparing)try{await item.preparing;}catch(e){if(e.name!=='AbortError'||!valid())throw e;}
 if(!valid())return null;
 if(!item.preparing){const job=waitPreviewAudio(item,target,valid);item.preparing=job;job.finally(()=>{if(item.preparing===job)item.preparing=null;}).catch(()=>{});}
 await item.preparing;return valid()?item:null;
}
async function preparePreviewAudio(clips,time,valid=()=>true){
 const ctx=getAudioContext();if(ctx.state!=='running')await ctx.resume();
 await Promise.all(clips.filter(c=>c.type==='video'&&!c.muted).map(c=>preparePreviewAudioClip(c,time,valid)));
}
async function playPreviewAudio(item,valid){
 if(item.starting)try{await item.starting;}catch(e){if(e.name!=='AbortError'||!valid())throw e;}
 if(!valid())return;
 if(!item.audio.paused)return Promise.resolve();
 const job=Promise.resolve(item.audio.play()).then(()=>{if(!valid())item.audio.pause();});item.starting=job;
 job.finally(()=>{if(item.starting===job)item.starting=null;}).catch(()=>{});return job;
}
async function startPreviewAudio(clips,time,valid=()=>true){
 await Promise.all(clips.filter(c=>c.type==='video'&&!c.muted).map(c=>{
  const at=previewAudioTime(c,time),item=previewAudioPlayers.get(c.id);return item&&at>=c.startTime&&at<c.endTime?playPreviewAudio(item,valid):null;
 }));
}
function prefetchPreviewAudio(time,wanted){
 if(performance.now()<previewAudioLookAhead)return;previewAudioLookAhead=performance.now()+300;
 const epoch=previewAudioEpoch,project=window.SceneEngine?SceneEngine.expand(state.timeline):state.timeline;
 const ahead=project.filter(c=>c.type==='video'&&!c.muted&&(c.timelineStart||0)>time&&(c.timelineStart||0)<time+2).sort((a,b)=>a.timelineStart-b.timelineStart).slice(0,2);
 for(const clip of ahead)preparePreviewAudioClip(clip,clip.timelineStart,()=>state.isPlaying&&epoch===previewAudioEpoch).catch(()=>{});
 const keep=new Set([...wanted,...ahead.map(c=>c.id)]),limit=Math.max(8,keep.size);
 for(const [id,item] of previewAudioPlayers){if(previewAudioPlayers.size<=limit)break;if(!keep.has(id)&&!item.preparing&&!item.starting)releasePreviewAudio(id,item);}
}
function syncPreviewAudio(clips,time){
 if(!state.isPlaying){const urls=new Set(state.mediaFiles.map(m=>m.url));for(const [id,item] of previewAudioPlayers){if(!urls.has(item.url))releasePreviewAudio(id,item);else if(!item.audio.paused)item.audio.pause();}return;}
 if(typeof isStartingPlayback!=='undefined'&&isStartingPlayback)return;
 const wanted=new Set(),epoch=previewAudioEpoch;
 for(const clip of clips){
  if(clip.type!=='video'||clip.muted)continue;
  const media=state.mediaFiles.find(m=>m.id===clip.mediaId),source=previewAudioTime(clip,time);
  if(!media||media.audioAbsent||source<clip.startTime||source>=clip.endTime)continue;wanted.add(clip.id);
  const item=previewAudioPlayers.get(clip.id);
  if(!item){preparePreviewAudioClip(clip,time,()=>state.isPlaying&&epoch===previewAudioEpoch).then(ready=>{if(ready&&state.isPlaying&&epoch===previewAudioEpoch)syncPreviewAudio(clips,state.currentTime);}).catch(e=>{if(e.name!=='AbortError')showToast(e.message);});continue;}
  item.gain.gain.value=clip.volume??1;
  if(item.preparing||item.starting)continue;
  if(item.audio.seeking)continue;
  if(Math.abs(item.audio.currentTime-source)>.25)item.audio.currentTime=source;
  if(item.audio.paused)playPreviewAudio(item,()=>state.isPlaying&&epoch===previewAudioEpoch).catch(e=>{if(state.isPlaying)showToast(e.message);});
 }
 for(const [id,item] of previewAudioPlayers)if(!wanted.has(id)&&!item.audio.paused)item.audio.pause();
 prefetchPreviewAudio(time,wanted);
}
window.preparePreviewAudio=preparePreviewAudio;window.startPreviewAudio=startPreviewAudio;
