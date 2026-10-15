'use strict';
const CROP_MIN=.001;
function normalizeCrop(value={}){
 const c={};for(const side of ['left','right','top','bottom'])c[side]=Math.max(0,Math.min(99.9,Number(value?.[side])||0));
 for(const [a,b] of [['left','right'],['top','bottom']])if(c[a]+c[b]>99.9){const k=99.9/(c[a]+c[b]);c[a]*=k;c[b]*=k;}
 return c;
}
function cropRectangle(crop){const c=normalizeCrop(crop);return {x:c.left/100,y:c.top/100,w:1-(c.left+c.right)/100,h:1-(c.top+c.bottom)/100};}
function rectangleCrop(r){return normalizeCrop({left:r.x*100,top:r.y*100,right:(1-r.x-r.w)*100,bottom:(1-r.y-r.h)*100});}
function cropAspect(ratio,aspect){if(ratio==='free'||!ratio)return null;if(ratio==='original')return 1;const parts=ratio.split(':').map(Number);return parts.length===2&&parts.every(n=>n>0&&Number.isFinite(n))?(parts[0]/parts[1])/aspect:null;}
function fitCropRatio(crop,ratio,aspect){
 const r=cropRectangle(crop),target=cropAspect(ratio,aspect);if(!target)return normalizeCrop(crop);
 const w=Math.min(r.w,r.h*target),h=w/target;return rectangleCrop({x:r.x+(r.w-w)/2,y:r.y+(r.h-h)/2,w,h});
}
function resizeCrop(crop,handle,dx,dy,ratio='free',aspect=1){
 const r=cropRectangle(crop),cx=r.x+r.w/2,cy=r.y+r.h/2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 if(handle==='move')return rectangleCrop({...r,x:clamp(r.x+dx,0,1-r.w),y:clamp(r.y+dy,0,1-r.h)});
 const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s'),target=cropAspect(ratio,aspect);
 if(!target){
   const left=west?clamp(r.x+dx,0,r.x+r.w-CROP_MIN):r.x,right=east?clamp(r.x+r.w+dx,r.x+CROP_MIN,1):r.x+r.w;
   const top=north?clamp(r.y+dy,0,r.y+r.h-CROP_MIN):r.y,bottom=south?clamp(r.y+r.h+dy,r.y+CROP_MIN,1):r.y+r.h;
   return rectangleCrop({x:left,y:top,w:right-left,h:bottom-top});
 }
 if((west||east)&&(north||south)){
   const anchorX=west?r.x+r.w:r.x,anchorY=north?r.y+r.h:r.y;
   const maxW=west?anchorX:1-anchorX,maxH=north?anchorY:1-anchorY;
   const requested=Math.abs(dx/r.w)>=Math.abs(dy/r.h)?r.w+(west?-dx:dx):(r.h+(north?-dy:dy))*target;
   const cap=Math.min(maxW,maxH*target),w=clamp(requested,Math.min(cap,Math.max(CROP_MIN,CROP_MIN*target)),cap),h=w/target;
   return rectangleCrop({x:west?anchorX-w:anchorX,y:north?anchorY-h:anchorY,w,h});
 }
 if(west||east){
   const anchor=west?r.x+r.w:r.x,cap=Math.min(west?anchor:1-anchor,2*Math.min(cy,1-cy)*target);
   const w=clamp(r.w+(west?-dx:dx),Math.min(cap,Math.max(CROP_MIN,CROP_MIN*target)),cap),h=w/target;
   return rectangleCrop({x:west?anchor-w:anchor,y:cy-h/2,w,h});
 }
 const anchor=north?r.y+r.h:r.y,cap=Math.min(north?anchor:1-anchor,2*Math.min(cx,1-cx)/target);
 const h=clamp(r.h+(north?-dy:dy),Math.min(cap,Math.max(CROP_MIN,CROP_MIN/target)),cap),w=h*target;
 return rectangleCrop({x:cx-w/2,y:north?anchor-h:anchor,w,h});
}
let cropActiveId=null,cropInputDirty=false,cropDrag=null;
function cropActiveClip(){return state.timeline.find(c=>c.id===cropActiveId);}
function cropSourceAspect(clip){return (clip.baseWidth||1)/(clip.baseHeight||1);}
function cropTargets(clip){return clip?.groupId&&state.groups[clip.groupId]?.kind==='sequence'?state.timeline.filter(c=>c.groupId===clip.groupId):[clip];}
function applyCropEdit(crop,ratio,commit=false){
 const clip=cropActiveClip();if(!clip)return;
 let changed=false;
 for(const c of cropTargets(clip)){
   const next=fitCropRatio(crop,ratio,cropSourceAspect(c));
   if(JSON.stringify(normalizeCrop(c.crop))!==JSON.stringify(next)||(c.cropRatio||'free')!==ratio)changed=true;
   c.crop=next;c.cropRatio=ratio;
 }
 cropInputDirty||=changed;greenScreenProcessor.updateSlidersUI(clip);renderCanvasFrame();refreshCrop();
 if(commit)commitCropEdit();
}
function commitCropEdit(){if(!cropInputDirty)return;cropInputDirty=false;pushState();renderTimeline();renderCanvasFrame();}
function finishCropDrag(cancelled=false){
 if(!cropDrag)return;const drag=cropDrag;cropDrag=null;
 if(cancelled){for(const before of drag.before){const c=state.timeline.find(c=>c.id===before.id);if(c){c.crop=before.crop;c.cropRatio=before.ratio;}}cropInputDirty=drag.wasDirty;renderCanvasFrame();refreshCrop();}
 else commitCropEdit();
}
function refreshCrop(){
 const clip=cropActiveClip(),dialog=document.getElementById('tool-dialog'),surface=document.getElementById('crop-surface');
 if(!clip||!dialog?.open||!dialog.contains(surface))return;
 const media=state.mediaFiles.find(m=>m.id===clip.mediaId);if(!media)return;
 const width=media.element.naturalWidth||media.element.videoWidth||clip.baseWidth,height=media.element.naturalHeight||media.element.videoHeight||clip.baseHeight;
 const area=document.getElementById('crop-preview'),k=Math.min(Math.max(1,area.clientWidth-36)/width,Math.max(1,area.clientHeight-36)/height);
 surface.style.width=width*k+'px';surface.style.height=height*k+'px';
 const canvas=document.getElementById('crop-canvas'),factor=Math.min(1,640/Math.max(width,height));
 const cw=Math.max(1,Math.round(width*factor)),ch=Math.max(1,Math.round(height*factor));if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 const source=clip.type==='image'?media.element:getClipVideo(clip,media),ctx=canvas.getContext('2d');ctx.clearRect(0,0,cw,ch);
 if(clip.type==='image'||source.readyState>=2){const drawable=clip.aiBackgroundRemoval?greenScreenProcessor.processFrameFast(source,clip)||source:source;ctx.drawImage(drawable,0,0,cw,ch);}
 const crop=normalizeCrop(clip.crop),r=cropRectangle(crop),box=document.getElementById('crop-box');
 box.style.left=r.x*100+'%';box.style.top=r.y*100+'%';box.style.width=r.w*100+'%';box.style.height=r.h*100+'%';
 const x=r.x*1000,y=r.y*1000,w=r.w*1000,h=r.h*1000;
 document.getElementById('crop-shade').setAttribute('d',`M0 0H1000V1000H0Z M${x} ${y}v${h}h${w}v${-h}Z`);
 for(const button of surface.querySelectorAll('[data-crop-handle]')){
   const handle=button.dataset.cropHandle;button.style.left=(handle.includes('w')?r.x:handle.includes('e')?r.x+r.w:r.x+r.w/2)*100+'%';button.style.top=(handle.includes('n')?r.y:handle.includes('s')?r.y+r.h:r.y+r.h/2)*100+'%';
 }
 for(const side of ['left','right','top','bottom'])for(const prefix of ['slider-crop-','number-crop-']){const input=document.getElementById(prefix+side);if(input!==document.activeElement)input.value=Number(crop[side].toFixed(1));}
 document.getElementById('crop-ratio').value=clip.cropRatio||'free';
 document.getElementById('crop-size').textContent=`Zone conservée : ${Math.max(1,Math.round(width*r.w))} × ${Math.max(1,Math.round(height*r.h))} px source`;
}
window.CropTools={refresh:refreshCrop,finish:finishCropDrag};
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),labels={left:'Gauche',right:'Droite',top:'Haut',bottom:'Bas'},handles={nw:'Coin haut gauche',n:'Bord haut',ne:'Coin haut droit',e:'Bord droit',se:'Coin bas droit',s:'Bord bas',sw:'Coin bas gauche',w:'Bord gauche'};
 for(const [side,label] of Object.entries(labels)){
   const row=document.createElement('label');row.className='crop-control';row.append(document.createTextNode(label+' (%)'));
   const range=document.createElement('input'),number=document.createElement('input');range.type='range';number.type='number';range.id='slider-crop-'+side;number.id='number-crop-'+side;
   for(const input of [range,number]){input.min=0;input.max=99.9;input.step=.1;input.value=0;input.setAttribute('aria-label',label+' en pourcentage');row.appendChild(input);
     input.addEventListener('input',()=>{
       const clip=cropActiveClip(),value=Number(input.value);if(!clip||input.value===''||!Number.isFinite(value))return;
       const crop=normalizeCrop(clip.crop),r=cropRectangle(crop),handle={left:'w',right:'e',top:'n',bottom:'s'}[side],ratio=clip.cropRatio||'free';
       const desired=Math.max(0,Math.min(99.9,value))/100;
       const delta=side==='left'?desired-r.x:side==='right'?1-desired-r.x-r.w:side==='top'?desired-r.y:1-desired-r.y-r.h;
       applyCropEdit(resizeCrop(crop,handle,side==='left'||side==='right'?delta:0,side==='top'||side==='bottom'?delta:0,ratio,cropSourceAspect(clip)),ratio);
     });
     input.addEventListener('change',()=>{commitCropEdit();refreshCrop();});
   }byId('crop-controls').appendChild(row);
 }
 const surface=byId('crop-surface');for(const [handle,label] of Object.entries(handles)){const b=document.createElement('button');b.type='button';b.dataset.cropHandle=handle;b.className='crop-handle';b.setAttribute('aria-label',label+' du rognage');surface.appendChild(b);}
 surface.addEventListener('pointerdown',e=>{
   const target=e.target.closest('[data-crop-handle],#crop-box'),clip=cropActiveClip();if(!target||!clip||cropDrag||e.button!==0)return;e.preventDefault();e.stopPropagation();
   const rect=surface.getBoundingClientRect();cropDrag={id:e.pointerId,handle:target.dataset.cropHandle||'move',crop:normalizeCrop(clip.crop),ratio:clip.cropRatio||'free',x:e.clientX,y:e.clientY,width:rect.width,height:rect.height,wasDirty:cropInputDirty,before:cropTargets(clip).map(c=>({id:c.id,crop:normalizeCrop(c.crop),ratio:c.cropRatio||'free'}))};surface.setPointerCapture(e.pointerId);
 });
 surface.addEventListener('pointermove',e=>{if(!cropDrag||e.pointerId!==cropDrag.id)return;e.preventDefault();const clip=cropActiveClip();if(!clip)return;applyCropEdit(resizeCrop(cropDrag.crop,cropDrag.handle,(e.clientX-cropDrag.x)/cropDrag.width,(e.clientY-cropDrag.y)/cropDrag.height,cropDrag.ratio,cropSourceAspect(clip)),cropDrag.ratio);});
 surface.addEventListener('pointerup',e=>{if(e.pointerId===cropDrag?.id)finishCropDrag();});surface.addEventListener('pointercancel',()=>finishCropDrag(true));
 byId('crop-ratio').onchange=()=>{const c=cropActiveClip();if(c)applyCropEdit(fitCropRatio(c.crop,byId('crop-ratio').value,cropSourceAspect(c)),byId('crop-ratio').value,true);};
 byId('crop-reset').onclick=()=>applyCropEdit({},'free',true);
 byId('crop-btn').onclick=async()=>{
   const c=state.timeline.find(c=>c.id===state.activeClipId);if(!c)return showToast('Sélectionnez une image ou une vidéo à rogner.');pausePlayback();cropActiveId=c.id;cropInputDirty=false;
   if(state.currentTime<(c.timelineStart||0)||state.currentTime>(c.timelineStart||0)+c.endTime-c.startTime){state.currentTime=c.timelineStart||0;timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;}
   window.openPocketCutTool('Rogner le calque',[byId('crop-settings')]);requestAnimationFrame(refreshCrop);
   if(c.type==='video'){try{const media=state.mediaFiles.find(m=>m.id===c.mediaId),video=getClipVideo(c,media);await waitForPreviewData(video);await seekVideo(video,Math.min(c.endTime-.00001,Math.max(c.startTime,c.startTime+state.currentTime-(c.timelineStart||0))));refreshCrop();}catch(e){showToast(e.message);}}
 };
 byId('tool-dialog').addEventListener('close',()=>{if(byId('tool-dialog').open)return;finishCropDrag();commitCropEdit();cropActiveId=null;});
 new ResizeObserver(refreshCrop).observe(byId('crop-preview'));
});
