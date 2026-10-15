'use strict';
function timelineZoomValue(value){return Math.max(5,Math.min(320,value));}
function timelineDecay(velocity,elapsed){return velocity*Math.exp(-elapsed/280);}
document.addEventListener('DOMContentLoaded',()=>{
 const area=timelineScrollContainer,points=new Map();let drag=null,pinch=null,frame=0,last=0,vx=0,vy=0;
 window.timelineDragged=false;
 function stop(){cancelAnimationFrame(frame);frame=0;vx=vy=0;}
 function label(){document.getElementById('timeline-zoom-value').textContent=Math.round(PIXELS_PER_SECOND/40*100)+'%';}
 function zoom(value,anchor=area.clientWidth/2){
   const offset=anchor-area.clientWidth/2,at=(area.scrollLeft+offset)/PIXELS_PER_SECOND;
   PIXELS_PER_SECOND=timelineZoomValue(value);state.currentTime=Math.max(0,Math.min(getTotalDuration(),at-offset/PIXELS_PER_SECOND));
   const top=area.scrollTop;renderTimeline();area.scrollTop=top;label();renderCanvasFrame();updateTimecode();window.PocketCutSession?.remember();
 }
 function inertia(now){
   if(state.isPlaying||points.size)return stop();
   const dt=Math.min(40,now-last);last=now;const x=area.scrollLeft,y=area.scrollTop;
   area.scrollLeft+=vx*dt;area.scrollTop+=vy*dt;
   if(Math.abs(area.scrollLeft-x)<.1)vx=0;if(Math.abs(area.scrollTop-y)<.1)vy=0;
   vx=timelineDecay(vx,dt);vy=timelineDecay(vy,dt);
   if(Math.hypot(vx,vy)>.025)frame=requestAnimationFrame(inertia);else stop();
 }
 document.getElementById('timeline-zoom-in').onclick=()=>{stop();zoom(PIXELS_PER_SECOND*1.4);};
 document.getElementById('timeline-zoom-out').onclick=()=>{stop();zoom(PIXELS_PER_SECOND/1.4);};
 document.getElementById('play-btn').addEventListener('pointerdown',stop);
 area.addEventListener('wheel',e=>{stop();if(e.ctrlKey||e.metaKey){e.preventDefault();pausePlayback();zoom(PIXELS_PER_SECOND*Math.exp(-e.deltaY*.003),e.clientX-area.getBoundingClientRect().left);}},{passive:false});
 area.addEventListener('pointerdown',e=>{
   stop();if(e.button!==0||e.target.closest('.trim-handle,.keyframe-marker'))return;
   pausePlayback();points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(points.size===1){window.timelineDragged=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:area.scrollLeft,top:area.scrollTop,lastX:e.clientX,lastY:e.clientY,time:performance.now()};}
   else if(points.size===2){const [a,b]=[...points.values()];pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:PIXELS_PER_SECOND};drag=null;window.timelineDragged=true;}
 });
 window.addEventListener('pointermove',e=>{
   if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pinch&&points.size===2){e.preventDefault();const [a,b]=[...points.values()];zoom(pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,(a.x+b.x)/2-area.getBoundingClientRect().left);return;}
   if(!drag||drag.id!==e.pointerId)return;
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y,now=performance.now(),dt=Math.max(1,now-drag.time);
   if(Math.hypot(dx,dy)>6)window.timelineDragged=true;
   if(window.timelineDragged){e.preventDefault();area.scrollLeft=drag.left-dx;area.scrollTop=drag.top-dy;vx=.65*vx+.35*(drag.lastX-e.clientX)/dt;vy=.65*vy+.35*(drag.lastY-e.clientY)/dt;}
   drag.lastX=e.clientX;drag.lastY=e.clientY;drag.time=now;
 },{passive:false});
 function finish(e){
   if(!points.has(e.pointerId))return;points.delete(e.pointerId);
   if(pinch){pinch=null;drag=null;stop();}
   else if(drag?.id===e.pointerId){if(e.type==='pointerup'&&window.timelineDragged&&performance.now()-drag.time<100){last=performance.now();frame=requestAnimationFrame(inertia);}else stop();drag=null;}
   if(!points.size)setTimeout(()=>window.timelineDragged=false,0);
 }
 window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
 window.addEventListener('blur',()=>{stop();points.clear();drag=pinch=null;window.timelineDragged=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 window.PocketCutTimeline={zoom,stop,refresh:label,get scale(){return PIXELS_PER_SECOND;}};label();
});
