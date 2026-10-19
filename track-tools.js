'use strict';
function shiftSecondaryLayers(clips,direction){
 // Materialize legacy row membership before changing independent visual depth.
 for(const c of state.timeline)c.trackIndex=clipTrack(c);
 for(const c of clips)c.zIndex=(c.zIndex||0)+direction;
}
function shiftUnitTo(unit,start,z){const first=unit[0].timelineStart||0;for(const c of unit){const at=start+(c.timelineStart||0)-first,delta=at-(c.timelineStart||0);if(c.animationStart!==undefined)c.animationStart+=delta;c.timelineStart=at;c.trackIndex=z;}}
function insertClipsOnTrack(clips,z,at){
 for(const c of state.timeline)c.trackIndex=clipTrack(c);
 const ids=new Set(clips.map(c=>c.id)),sourcePrimary=clips.some(c=>clipTrack(c)===0),moving=timelineUnits(clips),others=timelineUnits(state.timeline.filter(c=>clipTrack(c)===z&&!ids.has(c.id)));
 let index=others.findIndex(u=>at<(u[0].timelineStart||0)+u.reduce((n,c)=>n+c.endTime-c.startTime,0)/2);if(index<0)index=others.length;
 const units=[...others];units.splice(index,0,...moving);
 for(const c of clips){const old=clipTrack(c);c.trackIndex=z;if(old!==z)c.zIndex=z;}
 if(z===0)placeTimelineUnits(units);
 else {
   // Insert at a capsule boundary. Preserve intentional empty space, push followers.
   let cursor=index?Math.max(...others[index-1].map(c=>(c.timelineStart||0)+c.endTime-c.startTime)):0;
   if(!others.length)cursor=Math.max(0,at);
   else if(index<others.length)cursor=Math.max(cursor,others[index][0].timelineStart||0);
   for(let i=index;i<units.length;i++){const unit=units[i];shiftUnitTo(unit,cursor,z);cursor=Math.max(...unit.map(c=>c.timelineStart+c.endTime-c.startTime));}
 }
 if(sourcePrimary&&z!==0)recalculateTimelinePositions();
}
let clipMoveMode=false;
function initTrackDrag(){
 const byId=id=>document.getElementById(id);let timer,grab=null,start=null,drop=null,scrollFrame=0;
 const clear=()=>{clearTimeout(timer);cancelAnimationFrame(scrollFrame);scrollFrame=0;};
 byId('clip-move-btn').onclick=()=>{clipMoveMode=!clipMoveMode;byId('clip-move-btn').setAttribute('aria-pressed',String(clipMoveMode));byId('clip-move-btn').textContent=clipMoveMode?'↔ Déplacer · ON':'↔ Déplacer';};
 timelineScrollContainer.addEventListener('dragstart',e=>e.preventDefault());
 function mark(x,y){if(!grab)return;const area=timelineScrollContainer.getBoundingClientRect(),rows=[...document.querySelectorAll('.timeline-layer-row')];if(!rows.length)return;
   const row=rows.find(r=>{const b=r.getBoundingClientRect();return y>=b.top&&y<=b.bottom})||rows.reduce((best,r)=>Math.abs(r.getBoundingClientRect().top+r.clientHeight/2-y)<Math.abs(best.getBoundingClientRect().top+best.clientHeight/2-y)?r:best);
   const z=Number(row.dataset.zIndex),at=Math.max(0,(x-area.left-timelineScrollContainer.clientWidth/2+timelineScrollContainer.scrollLeft)/PIXELS_PER_SECOND-grab.offset);drop={z,at};
   for(const r of rows)r.classList.toggle('track-drop-target',r===row);
   let guide=byId('timeline-reorder-guide');if(!guide){guide=document.createElement('div');guide.id='timeline-reorder-guide';guide.appendChild(document.createElement('span'));byId('timeline-viewport').appendChild(guide);}guide.hidden=false;guide.style.left=(area.width/2+at*PIXELS_PER_SECOND-timelineScrollContainer.scrollLeft)+'px';guide.style.top=Math.max(0,row.getBoundingClientRect().top-area.top)+'px';guide.style.height=row.clientHeight+'px';guide.style.bottom='auto';guide.querySelector('span').textContent=z===0?'Insérer · principale':'Déposer · B-roll '+z;
 }
 function beginGrab(e,node){const clip=state.timeline.find(c=>c.id===node.dataset.clipId);if(!clip)return;state.activeClipId=clip.id;pausePlayback();window.PocketCutTimeline?.cancelGesture();const moving=multiSelection&&editTargets().some(c=>c.id===clip.id)?editTargets():selectionUnit(clip);window.clipReorderActive=true;window.timelineDragged=true;const r=timelineScrollContainer.getBoundingClientRect(),pointerTime=(e.clientX-r.left-timelineScrollContainer.clientWidth/2+timelineScrollContainer.scrollLeft)/PIXELS_PER_SECOND;grab={moving,id:e.pointerId,x:e.clientX,y:e.clientY,offset:pointerTime-Math.min(...moving.map(c=>c.timelineStart||0))};try{timelineScrollContainer.setPointerCapture(e.pointerId);}catch{}for(const el of document.querySelectorAll('.clip-wrapper'))el.classList.toggle('clip-grabbed',moving.some(c=>c.id===el.dataset.clipId));mark(e.clientX,e.clientY);navigator.vibrate?.(20);}
 document.addEventListener('pointerdown',e=>{const node=e.target.closest('.clip-wrapper');if(!node||e.target.closest('.trim-handle,.keyframe-marker')||e.button!==0||exporting)return;if(start&&start.id!==e.pointerId){clear();start=null;return;}clear();start={id:e.pointerId,x:e.clientX,y:e.clientY};if(clipMoveMode){e.preventDefault();e.stopPropagation();beginGrab(e,node);}else timer=setTimeout(()=>beginGrab(e,node),450);},true);
 document.addEventListener('pointermove',e=>{if(!start||e.pointerId!==start.id)return;if(!grab){if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>14)clearTimeout(timer);return;}e.preventDefault();grab.x=e.clientX;grab.y=e.clientY;mark(e.clientX,e.clientY);if(!scrollFrame){const scroll=()=>{if(!grab)return;const r=timelineScrollContainer.getBoundingClientRect(),sx=grab.x<r.left+30?-8:grab.x>r.right-30?8:0,sy=grab.y<r.top+20?-5:grab.y>r.bottom-20?5:0;if(sx||sy){timelineScrollContainer.scrollLeft+=sx;timelineScrollContainer.scrollTop+=sy;mark(grab.x,grab.y);}scrollFrame=requestAnimationFrame(scroll);};scrollFrame=requestAnimationFrame(scroll);}},{capture:true,passive:false});
 function finish(e){if(start&&e.pointerId!==start.id)return;clear();try{if(timelineScrollContainer.hasPointerCapture(e.pointerId))timelineScrollContainer.releasePointerCapture(e.pointerId);}catch{}if(grab){if(e.type==='pointerup'&&drop){insertClipsOnTrack(grab.moving,drop.z,drop.at);commitMontage();}const guide=byId('timeline-reorder-guide');if(guide)guide.hidden=true;window.clipReorderActive=false;window.timelineDragged=true;setTimeout(()=>window.timelineDragged=false,100);renderTimeline();}grab=start=drop=null;}
 document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);window.addEventListener('blur',()=>finish({type:'pointercancel',pointerId:start?.id}));timelineScrollContainer.addEventListener('contextmenu',e=>e.preventDefault());
}
