'use strict';
function renderedLayer(clip,time=state.currentTime){
 return !state.isPlaying&&state.editPoseClipId===clip.id?{...clip,opacity:1}:animatedClip(clip,time,state.groups,state.timeline);
}
function layerLocalPoint(clip,point){
 const pose=layerPose(clip),angle=-pose.rotation*Math.PI/180,dx=point.x-pose.centerX,dy=point.y-pose.centerY;
 return {u:(dx*Math.cos(angle)-dy*Math.sin(angle))/(clip.width||1)+.5,v:(dx*Math.sin(angle)+dy*Math.cos(angle))/(clip.height||1)+.5};
}
let hitPixelCanvas;
function sampleLayerAlpha(source,u,v){
 if(!source)return 255;
 hitPixelCanvas??=document.createElement('canvas');hitPixelCanvas.width=hitPixelCanvas.height=1;
 const ctx=hitPixelCanvas.getContext('2d',{willReadFrequently:true}),width=source.naturalWidth||source.videoWidth||source.width,height=source.naturalHeight||source.videoHeight||source.height;
 if(!width||!height)return 255;
 try{ctx.drawImage(source,Math.min(width-1,Math.floor(u*width)),Math.min(height-1,Math.floor(v*height)),1,1,0,0,1,1);return ctx.getImageData(0,0,1,1).data[3];}catch{return 255;}
}
function hitTestLayer(point){
 const time=Math.min(state.currentTime,Math.max(0,getTotalDuration()-1e-6));
 const visible=state.timeline.map((clip,index)=>({clip,index})).filter(({clip:c})=>time>=(c.timelineStart||0)&&time<(c.timelineStart||0)+c.endTime-c.startTime).sort((a,b)=>(b.clip.zIndex||0)-(a.clip.zIndex||0)||b.index-a.index);
 for(const {clip} of visible){
   const drawn=renderedLayer(clip,time);if((drawn.opacity??1)<.05)continue;
   const {u,v}=layerLocalPoint(drawn,point),crop=normalizeCrop(clip.crop);
   if(u<(crop.left||0)/100||u>1-(crop.right||0)/100||v<(crop.top||0)/100||v>1-(crop.bottom||0)/100)continue;
   const media=state.mediaFiles.find(m=>m.id===clip.mediaId);if(!media)continue;
   if(clip.aiBackgroundRemoval){
     const sourceTime=clip.startTime+time-(clip.timelineStart||0);
     const mask=window.PocketCutMasks?.preview(clip.mediaId,sourceTime)?.mask||greenScreenProcessor.frames.get(clip.id)?.mask;
     if(mask&&sampleLayerAlpha(mask,u,v)<24)continue;
   }else if(clip.type==='image'&&sampleLayerAlpha(media.element,u,v)<24)continue;
   return clip;
 }
 return null;
}
window.selectLayerAtPoint=point=>{
 const clip=hitTestLayer(point);if(!clip)return null;
 state.activeClipId=clip.id;state.editPoseClipId=null;
 greenScreenProcessor.updateSlidersUI(clip);renderTimeline();window.revealSelectedLayer();renderCanvasFrame();window.refreshAnimationPanel?.();window.PocketCutSession?.remember();return clip;
};
window.revealSelectedLayer=()=>{
 const row=document.querySelector('.clip-wrapper.selected')?.parentElement;if(!row)return;
 const top=row.offsetTop,bottom=top+row.offsetHeight,scroll=timelineScrollContainer;
 if(top<scroll.scrollTop)scroll.scrollTop=top;
 else if(bottom>scroll.scrollTop+scroll.clientHeight)scroll.scrollTop=bottom-scroll.clientHeight;
};
// A previously tapped foreground stays selected when a pinch starts on its transparent margin.
window.retainGestureLayer=(previousId,points)=>{
 const previous=state.timeline.find(c=>c.id===previousId),current=state.timeline.find(c=>c.id===state.activeClipId);
 if(!previous||!current||previous===current)return false;
 const above=(previous.zIndex||0)>(current.zIndex||0)||((previous.zIndex||0)===(current.zIndex||0)&&state.timeline.indexOf(previous)>state.timeline.indexOf(current));
 const time=Math.min(state.currentTime,Math.max(0,getTotalDuration()-1e-6));
 if(!above||time<(previous.timelineStart||0)||time>=(previous.timelineStart||0)+previous.endTime-previous.startTime)return false;
 const drawn=renderedLayer(previous,time);if((drawn.opacity??1)<.05)return false;
 const middle={x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
 const contains=point=>{const {u,v}=layerLocalPoint(drawn,point),crop=normalizeCrop(previous.crop);return u>=(crop.left||0)/100&&u<=1-(crop.right||0)/100&&v>=(crop.top||0)/100&&v<=1-(crop.bottom||0)/100;};
 if(![...points,middle].some(contains))return false;
 state.activeClipId=previous.id;state.editPoseClipId=null;greenScreenProcessor.updateSlidersUI(previous);renderTimeline();window.revealSelectedLayer();renderCanvasFrame();return true;
};
function keyframeNearTime(clip,time,tolerance=1/30){
 const local=time-animationRange(clip).start;
 return (clip.keyframes||[]).filter(k=>Math.abs(k.time-local)<=tolerance+1e-6).sort((a,b)=>Math.abs(a.time-local)-Math.abs(b.time-local))[0]||null;
}
function removeLayerKeyframe(clip,keyTime){
 if(!clip?.keyframes?.some(k=>Math.abs(k.time-keyTime)<1e-6))return;
 pausePlayback();applyPose(clip,manualPose(clip,state.currentTime));clip.keyframes=clip.keyframes.filter(k=>Math.abs(k.time-keyTime)>=1e-6);
 pushState();renderTimeline();renderCanvasFrame();window.refreshAnimationPanel?.();showToast('Keyframe supprimée.');
}
window.updateKeyframeHighlight=()=>{
 for(const node of document.querySelectorAll('.keyframe-marker')){
   const isCurrent=Math.abs(Number(node.dataset.projectTime)-state.currentTime)<=1/30+1e-6;
   node.classList.toggle('is-current',isCurrent);node.setAttribute('aria-current',isCurrent?'true':'false');
 }
 for(const button of document.querySelectorAll('#keyframe-list button')){
   const c=state.timeline.find(c=>c.id===state.activeClipId);
   if(c&&button.dataset.keyTime)button.classList.toggle('is-current',Math.abs(Number(button.dataset.keyTime)+animationRange(c).start-state.currentTime)<=1/30+1e-6);
 }
};
window.setupKeyframeMarkers=()=>{
 for(const marker of document.querySelectorAll('.keyframe-marker')){
   let timer,held=false,start;
   const nearest=e=>{
     if(!e.clientX&&!e.clientY)return marker;
     const wrapper=marker.parentElement,x=e.clientX-wrapper.getBoundingClientRect().left;
     return [...wrapper.querySelectorAll('.keyframe-marker')].sort((a,b)=>Math.abs(parseFloat(a.style.left)-x)-Math.abs(parseFloat(b.style.left)-x))[0]||marker;
   };
   marker.addEventListener('pointerdown',e=>{
     if(e.button!==0)return;e.stopPropagation();held=false;start={x:e.clientX,y:e.clientY};pausePlayback();
     const picked=nearest(e);
     timer=setTimeout(()=>{held=true;window.timelineDragged=true;removeLayerKeyframe(state.timeline.find(c=>c.id===picked.dataset.clipId),Number(picked.dataset.keyTime));},450);
   });
   marker.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)clearTimeout(timer);});
   for(const event of ['pointerup','pointercancel','pointerleave'])marker.addEventListener(event,()=>clearTimeout(timer));
   marker.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();clearTimeout(timer);held=true;const picked=nearest(e);removeLayerKeyframe(state.timeline.find(c=>c.id===picked.dataset.clipId),Number(picked.dataset.keyTime));});
   marker.addEventListener('click',e=>{
     e.stopPropagation();if(held)return;const picked=e.detail?nearest(e):marker;pausePlayback();state.activeClipId=picked.dataset.clipId;state.currentTime=Number(picked.dataset.projectTime);state.editPoseClipId=null;
     timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;renderTimeline();renderCanvasFrame();updateTimecode();window.refreshAnimationPanel?.();
   });
 }
 updateKeyframeHighlight();
};
window.setupKeyframeListButton=(button,clip,key)=>{
 let timer,held=false,start;
 button.classList.add('keyframe-removable');
 button.title='Toucher pour rejoindre · Maintenir pour supprimer';
 button.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=false;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{held=true;removeLayerKeyframe(clip,key.time);},450);});
 button.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)clearTimeout(timer);});
 for(const event of ['pointerup','pointercancel','pointerleave'])button.addEventListener(event,()=>clearTimeout(timer));
 button.addEventListener('click',e=>{if(held){e.stopImmediatePropagation();e.preventDefault();}},true);
 button.addEventListener('contextmenu',e=>{e.preventDefault();clearTimeout(timer);held=true;removeLayerKeyframe(clip,key.time);});
};
// Presets store relative time, centers and displayed height, not source-specific media IDs.
function normalizedPresetPose(clip,pose){return {centerX:pose.centerX/workspaceWidth(),centerY:pose.centerY/workspaceHeight(),height:clip.baseHeight*pose.scale/workspaceHeight(),rotation:pose.rotation};}
function makeClipPreset(clip,name){
 const start=clip.timelineStart||0,duration=Math.max(.001,clip.endTime-clip.startTime),range=animationRange(clip);
 let keys=[];
 if(clip.keyframes?.length){
   keys=[{time:0,...normalizedPresetPose(clip,manualPose(clip,start))},...clip.keyframes.filter(k=>k.time+range.start>start+1e-6&&k.time+range.start<start+duration-1e-6).map(k=>({time:(k.time+range.start-start)/duration,...normalizedPresetPose(clip,k)})),{time:1,...normalizedPresetPose(clip,manualPose(clip,start+duration))}];
 }
 const group=clip.groupId&&state.groups[clip.groupId];
 return {id:globalThis.crypto?.randomUUID?.()||'preset_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2),version:1,name:name.trim(),createdAt:Date.now(),pose:normalizedPresetPose(clip,layerPose(clip)),keyframes:keys,crop:normalizeCrop(clip.crop),cropRatio:clip.cropRatio||'free',autoZoom:structuredClone(group?.autoZoom||clip.autoZoom||{enabled:false,percent:15}),popUp:{enabled:!!clip.popUp?.enabled,fraction:Math.min(clip.popUp?.duration||.25,duration/2)/duration},aiBackgroundRemoval:!!clip.aiBackgroundRemoval,volume:clip.volume??1,muted:!!clip.muted,audioOffset:clip.audioOffset||0};
}
function applyClipPreset(preset,clip,span={start:clip.timelineStart||0,duration:clip.endTime-clip.startTime}){
 const pose=p=>({centerX:p.centerX*workspaceWidth(),centerY:p.centerY*workspaceHeight(),scale:p.height*workspaceHeight()/clip.baseHeight,rotation:p.rotation});
 applyPose(clip,pose(preset.pose));clip.cropRatio=preset.cropRatio||'free';clip.crop=fitCropRatio(preset.crop,clip.cropRatio,clip.baseWidth/clip.baseHeight);clip.keyframes=preset.keyframes.map(k=>({time:k.time*span.duration,...pose(k)}));
 clip.animationStart=span.start;clip.animationDuration=span.duration;
 clip.autoZoom=structuredClone(preset.autoZoom);clip.popUp={enabled:preset.popUp.enabled,duration:Math.max(.05,preset.popUp.fraction*span.duration)};
 clip.aiBackgroundRemoval=clip.type==='video'&&preset.aiBackgroundRemoval;clip.volume=preset.volume;clip.muted=preset.muted;clip.audioOffset=preset.audioOffset;
 return clip;
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('remove-keyframe').onclick=()=>{
   const clip=state.timeline.find(c=>c.id===state.activeClipId),key=clip&&keyframeNearTime(clip,state.currentTime);
   if(!key)return showToast('Placez le curseur sur une keyframe.');removeLayerKeyframe(clip,key.time);
 };
 renderTimeline();
});
