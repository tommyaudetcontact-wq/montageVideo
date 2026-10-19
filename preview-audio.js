'use strict';
const previewAudioPlayers=new Map();
function stopPreviewAudio(){for(const item of previewAudioPlayers.values()){item.audio.pause();item.audio.removeAttribute('src');item.audio.load();item.node.disconnect();item.gain.disconnect();}previewAudioPlayers.clear();}
function syncPreviewAudio(clips,time){
 const wanted=new Set();
 if(!state.isPlaying){stopPreviewAudio();return;}
 for(const clip of clips){
   if(clip.type!=='video'||clip.muted)continue;
   const media=state.mediaFiles.find(m=>m.id===clip.mediaId),source=clip.startTime+time-(clip.timelineStart||0)-(clip.audioOffset||0);
   if(!media||source<clip.startTime||source>=clip.endTime)continue;wanted.add(clip.id);
   let item=previewAudioPlayers.get(clip.id);
   if(!item||item.url!==media.url){if(item){item.audio.pause();item.node.disconnect();item.gain.disconnect();}const audio=document.createElement('audio');audio.src=media.url;audio.preload='metadata';const ctx=getAudioContext(),node=ctx.createMediaElementSource(audio),gain=ctx.createGain();node.connect(gain);gain.connect(ctx.destination);item={audio,node,gain,url:media.url};previewAudioPlayers.set(clip.id,item);}
   item.gain.gain.value=clip.volume??1;
   if(item.audio.paused||Math.abs(item.audio.currentTime-source)>.25)item.audio.currentTime=source;
   if(item.audio.paused)item.audio.play().catch(()=>{});
 }
 for(const [id,item] of previewAudioPlayers)if(!wanted.has(id)){item.audio.pause();item.audio.removeAttribute('src');item.audio.load();item.node.disconnect();item.gain.disconnect();previewAudioPlayers.delete(id);}
}
