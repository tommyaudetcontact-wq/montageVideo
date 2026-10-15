'use strict';
function trimSnapTargets(clip,timeline,cursor){
 const targets=[{time:0,label:'Début du montage',kind:'edge'},{time:cursor,label:'Curseur',kind:'cursor'}];
 for(const other of timeline){if(other.id===clip.id||(clip.groupId&&clip.groupId===other.groupId))continue;
   targets.push({time:other.timelineStart||0,label:`Début L${other.zIndex||0}`,kind:'edge'},{time:(other.timelineStart||0)+other.endTime-other.startTime,label:`Fin L${other.zIndex||0}`,kind:'edge'});
 }return targets;
}
function nearestTrimSnap(time,targets,pixelsPerSecond=40,enabled=true){
 if(!enabled)return null;
 const candidates=targets.map(t=>({...t,distance:Math.abs(t.time-time)*pixelsPerSecond})).filter(t=>t.distance<=(t.kind==='voice'?16:8)+1e-6);
 candidates.sort((a,b)=>a.distance-b.distance||(a.kind==='cursor'?-1:b.kind==='cursor'?1:0));return candidates[0]||null;
}
function trimBounds(clip,media,timeline){
 const start=clip.timelineStart||0,end=start+clip.endTime-clip.startTime,others=timeline.filter(c=>c.id!==clip.id&&(c.zIndex||0)===(clip.zIndex||0));
 const previous=Math.max(0,...others.filter(c=>(c.timelineStart||0)+c.endTime-c.startTime<=start+1e-6).map(c=>(c.timelineStart||0)+c.endTime-c.startTime));
 const next=Math.min(Infinity,...others.filter(c=>(c.timelineStart||0)>=end-1e-6).map(c=>c.timelineStart||0));
 return {left:Math.max(previous,clip.type==='image'?0:start-clip.startTime),right:Math.min(next,clip.type==='image'?86400:start+(media?.duration||media?.element?.duration||clip.endTime)-clip.startTime)};
}
function applyTimelineTrim(original,side,edge,bounds,minDuration=.02){
 const clip={...original},start=original.timelineStart||0,end=start+original.endTime-original.startTime;
 if(side==='left'){
   const at=Math.max(bounds.left,Math.min(end-minDuration,edge));clip.timelineStart=at;
   if(clip.type==='image'){clip.startTime=0;clip.endTime=end-at;}else clip.startTime=original.startTime+at-start;
 }else{
   const at=Math.min(bounds.right,Math.max(start+minDuration,edge));clip.endTime=clip.type==='image'?at-start:original.startTime+at-start;
   if(clip.type==='image')clip.startTime=0;
 }return clip;
}
let timelineTrim=null;
function showTimelineSnap(snap){
 const guide=document.getElementById('timeline-snap-guide');if(!guide)return;guide.hidden=!snap;
 if(snap){guide.style.left=timelineScrollContainer.clientWidth/2+(snap.time-state.currentTime)*PIXELS_PER_SECOND+'px';guide.querySelector('span').textContent=snap.label;}
}
function finishTimelineTrim(cancelled=false){
 if(!timelineTrim)return;const drag=timelineTrim;timelineTrim=null;
 window.removeEventListener('pointermove',moveTimelineTrim);window.removeEventListener('pointerup',endTimelineTrim);window.removeEventListener('pointercancel',cancelTimelineTrim);
 const clip=state.timeline.find(c=>c.id===drag.original.id);if(!clip)return;
 if(cancelled)Object.assign(clip,drag.original);else if(JSON.stringify(clip)!==JSON.stringify(drag.original))pushState();
 showTimelineSnap(null);renderTimeline();renderCanvasFrame();
}
function moveTimelineTrim(event){
 const drag=timelineTrim;if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();
 const original=drag.original,clip=state.timeline.find(c=>c.id===original.id);if(!clip)return;
 const origin=(original.timelineStart||0)+(drag.side==='right'?original.endTime-original.startTime:0);
 const requested=origin+(event.clientX-drag.x)/PIXELS_PER_SECOND;
 const lower=drag.side==='left'?drag.bounds.left:(original.timelineStart||0)+drag.minimum;
 const upper=drag.side==='left'?(original.timelineStart||0)+original.endTime-original.startTime-drag.minimum:drag.bounds.right;
 const targets=drag.targets.filter(t=>t.time>=lower-1e-6&&t.time<=upper+1e-6);
 let snap=nearestTrimSnap(requested,targets,PIXELS_PER_SECOND,state.isSnapping&&!event.altKey);
 const trimmed=applyTimelineTrim(original,drag.side,snap?snap.time:requested,drag.bounds,drag.minimum);Object.assign(clip,trimmed);
 const actual=(clip.timelineStart||0)+(drag.side==='right'?clip.endTime-clip.startTime:0);if(snap&&Math.abs(actual-snap.time)>1e-6)snap=null;
 renderTimeline();renderCanvasFrame();
 const handle=document.querySelector(`.trim-handle[data-clip-id="${clip.id}"][data-side="${drag.side}"]`);handle?.classList.toggle('snapped',!!snap);showTimelineSnap(snap);
}
function endTimelineTrim(event){if(event.pointerId===timelineTrim?.pointerId)finishTimelineTrim();}
function cancelTimelineTrim(event){if(event.pointerId===timelineTrim?.pointerId)finishTimelineTrim(true);}
function setupTrimEvents(){
 for(const handle of document.querySelectorAll('.trim-handle'))handle.addEventListener('pointerdown',event=>{
   if(event.button!==0||timelineTrim)return;event.preventDefault();event.stopPropagation();pausePlayback();
   const clip=state.timeline.find(c=>c.id===handle.dataset.clipId);if(!clip)return;const media=state.mediaFiles.find(m=>m.id===clip.mediaId),targets=trimSnapTargets(clip,state.timeline,state.currentTime);
   if(clip.type==='video')for(const segment of media?.speechBounds||[])for(const value of [segment.start,segment.end])if(value>=0&&value<=(media.duration||clip.endTime))targets.push({time:(clip.timelineStart||0)+value-clip.startTime,label:'Voix',kind:'voice'});
   timelineTrim={original:structuredClone(clip),side:handle.dataset.side,x:event.clientX,pointerId:event.pointerId,bounds:trimBounds(clip,media,state.timeline),targets,minimum:Math.min(.02,(clip.endTime-clip.startTime)/2)};
   window.addEventListener('pointermove',moveTimelineTrim,{passive:false});window.addEventListener('pointerup',endTimelineTrim);window.addEventListener('pointercancel',cancelTimelineTrim);
 });
}
window.finishTimelineTrim=finishTimelineTrim;
