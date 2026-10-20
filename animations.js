function workspaceWidth(){return typeof state!=="undefined"?state.projectWidth||720:720;}
function workspaceHeight(){return typeof state!=="undefined"?state.projectHeight||1280:1280;}
'use strict';
const clamp01=value=>Math.max(0,Math.min(1,value));
function animationRange(clip) {
  if(clip.scene&&!clip.sceneView&&window.SceneEngine){const range=SceneEngine.rangeFor(clip);if(range)return range;}
  return {start:clip.animationStart ?? clip.timelineStart ?? 0,duration:Math.max(0.001,clip.animationDuration ?? (clip.endTime-clip.startTime))};
}
function layerPose(clip) {
  const scale=clip.scale ?? 1;
  return {centerX:(clip.x||0)+(clip.width||clip.baseWidth*scale)/2,centerY:(clip.y||0)+(clip.height||clip.baseHeight*scale)/2,scale,rotation:clip.rotation||0};
}
function manualPose(clip,time) {
  const keys=[...(clip.keyframes||[])].sort((a,b)=>a.time-b.time);
  if(!keys.length) return layerPose(clip);
  const local=time-animationRange(clip).start;
  if(local<=keys[0].time) return {...keys[0]};
  if(local>=keys[keys.length-1].time) return {...keys[keys.length-1]};
  const right=keys.findIndex(k=>k.time>=local),a=keys[right-1],b=keys[right];
  const t=clamp01((local-a.time)/(b.time-a.time));
  const turn=((b.rotation-a.rotation+540)%360)-180;
  return {centerX:a.centerX+(b.centerX-a.centerX)*t,centerY:a.centerY+(b.centerY-a.centerY)*t,scale:a.scale+(b.scale-a.scale)*t,rotation:a.rotation+turn*t};
}
function applyPose(clip,pose) {
  clip.scale=pose.scale;clip.width=clip.baseWidth*pose.scale;clip.height=clip.baseHeight*pose.scale;
  clip.x=pose.centerX-clip.width/2;clip.y=pose.centerY-clip.height/2;clip.rotation=pose.rotation;
  return clip;
}
function groupRange(id,timeline) {
  const members=timeline.filter(c=>c.groupId===id);
  if(!members.length)return {start:0,duration:1};
  const start=Math.min(...members.map(c=>c.timelineStart||0));
  const end=Math.max(...members.map(c=>(c.timelineStart||0)+c.endTime-c.startTime));
  return {start,duration:Math.max(0.001,end-start)};
}
function autoZoomFactor(percent,time,start,duration){return 1+(Number(percent)||0)/100*clamp01((time-start)/Math.max(.001,duration));}
function animatedClip(clip,time,groups={},timeline=[]) {
  const pose=manualPose(clip,time),range=animationRange(clip),local=time-range.start;
  let scale=pose.scale,cx=pose.centerX,cy=pose.centerY,opacity=1;
  if(clip.autoZoom?.enabled) scale*=autoZoomFactor(clip.autoZoom.percent,time,range.start,range.duration);
  if(clip.popUp?.enabled) {
    const edge=Math.min(Math.max(0.05,clip.popUp.duration||0.25),range.duration/2);
    const enter=clamp01(local/edge),exit=clamp01((range.duration-local)/edge);
    let factor=1,travel=1;
    if(enter<1) {const u=enter-1;factor=1+2.70158*u*u*u+1.70158*u*u;travel=1-Math.pow(1-enter,3);opacity=clamp01(enter*4);}
    if(exit<1) {factor=exit*exit;travel=1-Math.pow(clamp01((1-exit-.6)/.4),3);opacity=clamp01(exit*4);}
    const tiny=0.001;
    const distance=Math.hypot(workspaceWidth(),workspaceHeight())+Math.hypot(clip.baseWidth*scale,clip.baseHeight*scale)+Math.hypot(pose.centerX,pose.centerY)+32;
    const radians=pose.rotation*Math.PI/180;
    cx=pose.centerX-Math.sin(radians)*distance*(1-travel);
    cy=pose.centerY+Math.cos(radians)*distance*(1-travel);
    scale*=Math.max(tiny,factor);
  }
  const group=clip.groupId && groups[clip.groupId];
  if(group?.autoZoom?.enabled) {
    const span=groupRange(clip.groupId,timeline);
    const zoom=autoZoomFactor(group.autoZoom.percent,time,span.start,span.duration);
    cx=(group.pivotX??360)+(cx-(group.pivotX??360))*zoom;
    cy=(group.pivotY??640)+(cy-(group.pivotY??640))*zoom;scale*=zoom;
  }
  return {...applyPose({...clip},{centerX:cx,centerY:cy,scale,rotation:pose.rotation}),opacity};
}
function captureLayerKeyframe(clip,time) {
  const range=animationRange(clip),key={time:Math.max(0,Math.min(range.duration,time-range.start)),...layerPose(clip)};
  clip.keyframes=(clip.keyframes||[]).filter(k=>Math.abs(k.time-key.time)>0.001);
  clip.keyframes.push(key);clip.keyframes.sort((a,b)=>a.time-b.time);
}
function updateKeyframeFromEdit(clip) {
  if(clip.keyframes?.length) captureLayerKeyframe(clip,state.currentTime);
}
function prepareLayerEdit(clip) {if(clip.keyframes?.length)applyPose(clip,manualPose(clip,state.currentTime));}
function retainSplitAnimation(original,left,right) {
  const range=animationRange(original);
  for(const clip of [left,right]) {clip.animationStart=range.start;clip.animationDuration=range.duration;clip.keyframes=structuredClone(original.keyframes||[]);if(original.scene)clip.scene={...structuredClone(original.scene),visualSourceOffset:(original.scene.visualSourceOffset||0)+clip.startTime-original.startTime};}
}
function fullHeightPose(width,height) {
  const h=workspaceHeight(),w=h*(width||720)/(height||1280);
  return {x:(workspaceWidth()-w)/2,y:0,baseWidth:w,baseHeight:h,width:w,height:h,scale:1,rotation:0};
}

function initAnimationControls() {
  const panel=document.getElementById('animation-panel'),selected=new Set();
  const active=()=>state.timeline.find(c=>c.id===state.activeClipId);
  const requireActive=()=>{const c=active();if(!c)showToast('Sélectionnez un calque.');return c;};
  const commit=()=>{pushState();renderTimeline();renderCanvasFrame();refreshAnimationPanel();};
  const jump=time=>{pausePlayback();state.currentTime=Math.max(0,time);timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;renderCanvasFrame();updateTimecode();const c=active();if(c)greenScreenProcessor.updateSlidersUI(c);refreshAnimationPanel();};
  document.getElementById('btn-animations').onclick=()=>{panel.open=!panel.open;if(panel.open)refreshAnimationPanel();};
  document.getElementById('add-keyframe').onclick=()=>{
    const c=requireActive();if(!c)return;
    const range=animationRange(c);if(state.currentTime<range.start || state.currentTime>range.start+range.duration)return showToast('Placez le curseur dans le calque.');
    pausePlayback();prepareLayerEdit(c);captureLayerKeyframe(c,state.currentTime);commit();
  };
  document.getElementById('remove-keyframe').onclick=()=>{
    const c=requireActive();if(!c)return;applyPose(c,manualPose(c,state.currentTime));
    const local=state.currentTime-animationRange(c).start;
    c.keyframes=(c.keyframes||[]).filter(k=>Math.abs(k.time-local)>1/30);commit();
  };
  document.getElementById('apply-autozoom').onclick=()=>{
    const c=requireActive();if(!c)return;
    const percent=Number(document.getElementById('autozoom-percent').value);
    if(!Number.isFinite(percent)||percent< -95 || percent>1000)return showToast('Choisissez un zoom entre −95 % et 1000 %.');
    const target=c.groupId&&state.groups[c.groupId] || c;
    target.autoZoom={enabled:document.getElementById('autozoom-enabled').checked,percent};commit();
  };
  document.getElementById('apply-popup').onclick=()=>{
    const c=requireActive();if(!c)return;
    if(!c.aiBackgroundRemoval)return showToast('Activez le détourage sur ce calque vidéo pour le pop-up.');
    const duration=Number(document.getElementById('popup-duration').value);
    if(!Number.isFinite(duration)||duration<0.05||duration>3600)return showToast('Durée entre 0,05 et 3600 secondes.');
    c.popUp={enabled:document.getElementById('popup-enabled').checked,duration};state.editPoseClipId=null;commit();jump(c.timelineStart||0);
  };
  document.getElementById('preview-popup').onclick=async()=>{const c=requireActive();if(!c)return;if(!c.popUp?.enabled)return showToast('Activez le pop-up sur ce calque.');jump(c.timelineStart||0);await startPlayback({stopAt:(c.timelineStart||0)+c.endTime-c.startTime,restartAt:c.timelineStart||0});};
  document.getElementById('edit-layer-pose').onchange=e=>{const c=active();state.editPoseClipId=e.target.checked?c?.id:null;renderCanvasFrame();};
  document.getElementById('center-layer').onclick=()=>{
    const c=requireActive();if(!c)return;prepareLayerEdit(c);c.x=(workspaceWidth()-c.width)/2;c.y=(workspaceHeight()-c.height)/2;updateKeyframeFromEdit(c);greenScreenProcessor.updateSlidersUI(c);commit();
  };
  document.getElementById('fit-layer-height').onclick=()=>{
    const c=requireActive();if(!c)return;prepareLayerEdit(c);c.scale=workspaceHeight()/c.baseHeight;c.width=c.baseWidth*c.scale;c.height=workspaceHeight();c.x=(workspaceWidth()-c.width)/2;c.y=0;updateKeyframeFromEdit(c);greenScreenProcessor.updateSlidersUI(c);commit();
  };
  document.getElementById('merge-layers').onclick=()=>{
    const ids=[...selected].filter(id=>state.timeline.some(c=>c.id===id));
    if(ids.length<2)return showToast('Cochez au moins deux calques à fusionner.');
    const expanded=new Set(ids);for(const c of state.timeline)if(ids.includes(c.id)&&c.groupId)for(const member of state.timeline)if(member.groupId===c.groupId)expanded.add(member.id);
    const groupId='group_'+Date.now().toString(36);
    const members=state.timeline.filter(c=>expanded.has(c.id));
    const xs=members.map(c=>c.x||0),ys=members.map(c=>c.y||0);
    state.groups[groupId]={id:groupId,pivotX:(Math.min(...xs)+Math.max(...members.map(c=>(c.x||0)+c.width)))/2,pivotY:(Math.min(...ys)+Math.max(...members.map(c=>(c.y||0)+c.height)))/2,autoZoom:{enabled:false,percent:15}};
    members.forEach(c=>c.groupId=groupId);state.activeClipId=members[0].id;selected.clear();commit();showToast('Calques fusionnés en groupe éditable. Auto-zoom appliqué sur toute sa durée.');
  };
  document.getElementById('unmerge-layers').onclick=()=>{
    const c=requireActive();if(!c?.groupId)return;const id=c.groupId;
    for(const member of state.timeline)if(member.groupId===id)delete member.groupId;
    delete state.groups[id];commit();
  };
  window.refreshAnimationPanel=()=>{
    if(!panel.open)return;
    const c=active(),target=c?.groupId&&state.groups[c.groupId] || c;
    const span=c?.groupId?groupRange(c.groupId,state.timeline):c?animationRange(c):null;
    document.getElementById('animation-selection').textContent=c?`${c.groupId?'Groupe fusionné':'Calque'} · ${span.duration.toFixed(2)} s`:'Sélectionnez un calque dans la timeline';
    for(const id of ['autozoom-percent','popup-duration'])if(document.activeElement?.id!==id)document.getElementById(id).value=id==='autozoom-percent'?(target?.autoZoom?.percent??15):(c?.popUp?.duration??0.25);
    document.getElementById('autozoom-enabled').checked=!!target?.autoZoom?.enabled;
    document.getElementById('popup-enabled').checked=!!c?.popUp?.enabled;
    document.getElementById('edit-layer-pose').checked=!!c && state.editPoseClipId===c.id;
    const keys=document.getElementById('keyframe-list');keys.replaceChildren();
    for(const k of c?.keyframes||[]) {const b=document.createElement('button');b.type='button';b.textContent=`◆ ${k.time.toFixed(2)} s`;b.dataset.keyTime=k.time;b.onclick=()=>jump(animationRange(c).start+k.time);window.setupKeyframeListButton?.(b,c,k);keys.appendChild(b);}
    window.updateKeyframeHighlight?.();
    const list=document.getElementById('merge-list');list.replaceChildren();
    for(const clip of state.timeline) {
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=selected.has(clip.id);
      input.onchange=()=>{input.checked?selected.add(clip.id):selected.delete(clip.id)};
      label.append(input,document.createTextNode(` L${clip.zIndex||0} ${state.mediaFiles.find(m=>m.id===clip.mediaId)?.file?.name || 'Calque'}${clip.groupId?' [fusionné]':''}`));list.appendChild(label);
    }
  };
  new MutationObserver(()=>refreshAnimationPanel()).observe(document.getElementById('timeline-track'),{childList:true});
  panel.addEventListener('toggle',()=>{
    if(panel.open){document.querySelectorAll('.ai-settings,.export-settings').forEach(el=>el.open=false);const pip=document.getElementById('pip-sliders-panel');if(window.bootstrap&&pip.classList.contains('show'))bootstrap.Collapse.getOrCreateInstance(pip).hide();}
    refreshAnimationPanel();
  });
  document.getElementById('pip-sliders-panel').addEventListener('shown.bs.collapse',()=>{panel.open=false;});
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',initAnimationControls);
