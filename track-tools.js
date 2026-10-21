'use strict';
function shiftSecondaryLayers(clips,direction){
 // Materialize legacy row membership before changing independent visual depth.
 for(const c of state.timeline)c.trackIndex=clipTrack(c);
 for(const c of clips)c.zIndex=(c.zIndex||0)+direction;
}
function shiftUnitTo(unit,start,z){const first=unit[0].timelineStart||0,offsets=unit.map(c=>(c.timelineStart||0)-first);for(const [i,c] of unit.entries()){const at=start+offsets[i],delta=at-(c.timelineStart||0);if(c.animationStart!==undefined)c.animationStart+=delta;c.timelineStart=at;c.trackIndex=z;}}
function insertClipsOnTrack(clips,z,at,snapped=false){
 for(const c of state.timeline)c.trackIndex=clipTrack(c);
 const ids=new Set(clips.map(c=>c.id)),sourcePrimary=clips.some(c=>clipTrack(c)===0),moving=timelineUnits(clips),others=timelineUnits(state.timeline.filter(c=>clipTrack(c)===z&&!ids.has(c.id)));
 let index=others.findIndex(u=>at<(u[0].timelineStart||0)+u.reduce((n,c)=>n+c.endTime-c.startTime,0)/2);if(index<0)index=others.length;
 const units=[...others];units.splice(index,0,...moving);
 for(const c of clips){const old=clipTrack(c);c.trackIndex=z;if(old===0&&z>0)c.zIndex=Math.max(c.zIndex||0,...state.timeline.filter(x=>!ids.has(x.id)).map(x=>x.zIndex||0))+1;}
 if(z===0)placeTimelineUnits(units);
 else {
   // Insert at a capsule boundary. Preserve intentional empty space, push followers.
   let cursor=index?Math.max(...others[index-1].map(c=>(c.timelineStart||0)+c.endTime-c.startTime)):0;
   if(!others.length)cursor=Math.max(0,at);
   else if(snapped)cursor=Math.max(cursor,at);
   else cursor=Math.max(cursor,at);
   for(let i=index;i<units.length;i++){const unit=units[i];shiftUnitTo(unit,cursor,z);cursor=Math.max(...unit.map(c=>c.timelineStart+c.endTime-c.startTime));}
 }
 if(sourcePrimary&&z!==0)recalculateTimelinePositions();
}
function snapMovingClips(moving,at,timeline,pixelsPerSecond,enabled){
 if(!enabled||!moving.length)return {at,snap:null};
 const ids=new Set(moving.map(c=>c.id)),origin=Math.min(...moving.map(c=>c.timelineStart||0));
 const offsets=moving.flatMap(c=>[(c.timelineStart||0)-origin,(c.timelineStart||0)-origin+c.endTime-c.startTime]);
 const targets=[0,...timeline.filter(c=>!ids.has(c.id)).flatMap(c=>[c.timelineStart||0,(c.timelineStart||0)+c.endTime-c.startTime])];
 let best=null;
 for(const edge of offsets)for(const time of targets){const candidate=time-edge,distance=Math.abs(candidate-at)*pixelsPerSecond;if(candidate>=0&&distance<=10&&(!best||distance<best.distance))best={at:candidate,time,distance};}
 return best?{at:best.at,snap:best}:{at,snap:null};
}
let clipMoveMode=false;
function initTrackDrag(){
 const byId=id=>document.getElementById(id);let timer,grab=null,start=null,drop=null,scrollFrame=0;
 const clear=()=>{clearTimeout(timer);cancelAnimationFrame(scrollFrame);scrollFrame=0;};
 byId('clip-move-btn').onclick=()=>{clipMoveMode=!clipMoveMode;byId('clip-move-btn').setAttribute('aria-pressed',String(clipMoveMode));byId('clip-move-btn').textContent=clipMoveMode?'↔ Déplacer · ON':'↔ Déplacer';};
 timelineScrollContainer.addEventListener('dragstart',e=>e.preventDefault());
 function mark(x,y){if(!grab)return;const area=timelineScrollContainer.getBoundingClientRect(),rows=[...document.querySelectorAll('.timeline-layer-row')];if(!rows.length)return;
   const row=rows.find(r=>{const b=r.getBoundingClientRect();return y>=b.top&&y<=b.bottom})||rows.reduce((best,r)=>Math.abs(r.getBoundingClientRect().top+r.clientHeight/2-y)<Math.abs(best.getBoundingClientRect().top+best.clientHeight/2-y)?r:best);
   const z=Number(row.dataset.zIndex),requested=Math.max(0,(x-area.left-timelineScrollContainer.clientWidth/2+timelineScrollContainer.scrollLeft)/PIXELS_PER_SECOND-grab.offset);const aligned=snapMovingClips(grab.moving,requested,state.timeline,PIXELS_PER_SECOND,state.isSnapping),at=aligned.at;drop={z,at,snapped:!!aligned.snap};
   for(const r of rows)r.classList.toggle('track-drop-target',r===row);
   let guide=byId('timeline-reorder-guide');if(!guide){guide=document.createElement('div');guide.id='timeline-reorder-guide';guide.appendChild(document.createElement('span'));byId('timeline-viewport').appendChild(guide);}guide.hidden=false;guide.classList.toggle('move-snapped',!!aligned.snap);guide.style.left=(area.width/2+(aligned.snap?.time??at)*PIXELS_PER_SECOND-timelineScrollContainer.scrollLeft)+'px';guide.style.top=Math.max(0,row.getBoundingClientRect().top-area.top)+'px';guide.style.height=row.clientHeight+'px';guide.style.bottom='auto';guide.querySelector('span').textContent=aligned.snap?'Aimant · bord du clip':z===0?'Insérer · principale':'Déposer · B-roll '+z;
 }
 function beginGrab(e,node){const clip=state.timeline.find(c=>c.id===node.dataset.clipId);if(!clip)return;state.activeClipId=clip.id;pausePlayback();window.PocketCutTimeline?.cancelGesture();const moving=multiSelection&&editTargets().some(c=>c.id===clip.id)?editTargets():selectionUnit(clip);window.clipReorderActive=true;window.timelineDragged=true;const r=timelineScrollContainer.getBoundingClientRect(),pointerTime=(e.clientX-r.left-timelineScrollContainer.clientWidth/2+timelineScrollContainer.scrollLeft)/PIXELS_PER_SECOND;grab={moving,id:e.pointerId,x:e.clientX,y:e.clientY,offset:pointerTime-Math.min(...moving.map(c=>c.timelineStart||0))};try{timelineScrollContainer.setPointerCapture(e.pointerId);}catch{}for(const el of document.querySelectorAll('.clip-wrapper'))el.classList.toggle('clip-grabbed',moving.some(c=>c.id===el.dataset.clipId));mark(e.clientX,e.clientY);navigator.vibrate?.(20);}
 document.addEventListener('pointerdown',e=>{const node=e.target.closest('.clip-wrapper');if(!node||e.target.closest('.trim-handle,.keyframe-marker')||e.button!==0||exporting)return;if(start&&start.id!==e.pointerId){clear();start=null;return;}clear();start={id:e.pointerId,x:e.clientX,y:e.clientY};if(clipMoveMode){e.preventDefault();e.stopPropagation();beginGrab(e,node);}else timer=setTimeout(()=>beginGrab(e,node),450);},true);
 document.addEventListener('pointermove',e=>{if(!start||e.pointerId!==start.id)return;if(!grab){if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>14)clearTimeout(timer);return;}e.preventDefault();grab.x=e.clientX;grab.y=e.clientY;mark(e.clientX,e.clientY);if(!scrollFrame){const scroll=()=>{if(!grab)return;const r=timelineScrollContainer.getBoundingClientRect(),sx=grab.x<r.left+30?-8:grab.x>r.right-30?8:0,sy=grab.y<r.top+20?-5:grab.y>r.bottom-20?5:0;if(sx||sy){timelineScrollContainer.scrollLeft+=sx;timelineScrollContainer.scrollTop+=sy;mark(grab.x,grab.y);}scrollFrame=requestAnimationFrame(scroll);};scrollFrame=requestAnimationFrame(scroll);}},{capture:true,passive:false});
 function finish(e){if(start&&e.pointerId!==start.id)return;clear();try{if(timelineScrollContainer.hasPointerCapture(e.pointerId))timelineScrollContainer.releasePointerCapture(e.pointerId);}catch{}if(grab){if(e.type==='pointerup'&&drop){const followed=grab.moving.find(c=>state.currentTime>=(c.timelineStart||0)&&state.currentTime<(c.timelineStart||0)+c.endTime-c.startTime),offset=followed?state.currentTime-(followed.timelineStart||0):0;insertClipsOnTrack(grab.moving,drop.z,drop.at,drop.snapped);if(followed){state.currentTime=followed.timelineStart+offset;timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;updateTimecode();}commitMontage();}const guide=byId('timeline-reorder-guide');if(guide)guide.hidden=true;window.clipReorderActive=false;window.timelineDragged=true;setTimeout(()=>window.timelineDragged=false,100);renderTimeline();}grab=start=drop=null;}
 document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);window.addEventListener('blur',()=>finish({type:'pointercancel',pointerId:start?.id}));timelineScrollContainer.addEventListener('contextmenu',e=>e.preventDefault());
}
