'use strict';
const multiClipIds=new Set();let multiSelection=false,autoCutBusy=false;
function editTargets(clip=state.timeline.find(c=>c.id===state.activeClipId)){
 const chosen=multiSelection?state.timeline.filter(c=>multiClipIds.has(c.id)):clip?[clip]:[];
 const groups=new Set(chosen.map(c=>c.groupId).filter(Boolean));return state.timeline.filter(c=>chosen.includes(c)||(groups.has(c.groupId)&&state.groups[c.groupId]?.kind==='sequence'));
}
function selectionUnit(c){return c?.groupId&&state.groups[c.groupId]?.kind==='sequence'?state.timeline.filter(x=>x.groupId===c.groupId):c?[c]:[];}
function clearMultiSelection(){multiClipIds.clear();multiSelection=false;paintMultiSelection();}
function paintMultiSelection(){
 const targets=editTargets(),ids=new Set(targets.map(c=>c.id));
 for(const node of document.querySelectorAll('.clip-wrapper')){const c=state.timeline.find(c=>c.id===node.dataset.clipId);node.classList.toggle('multi-picked',multiSelection&&selectionUnit(c).some(x=>ids.has(x.id)));node.setAttribute('aria-selected',String(multiSelection?selectionUnit(c).some(x=>ids.has(x.id)):c?.id===state.activeClipId));}
 const button=document.getElementById('multi-select-btn');if(button){button.setAttribute('aria-pressed',String(multiSelection));button.textContent=multiSelection?'☑ Multi · '+targets.length:'☑ Multi';}
 const bar=document.getElementById('multi-selection-bar');if(bar){bar.hidden=!multiSelection;document.getElementById('multi-selection-status').textContent=targets.length+' clips sélectionnés';}
}
function ensureMultiClip(c){if(!multiSelection)return;for(const x of selectionUnit(c))multiClipIds.add(x.id);paintMultiSelection();}
function pickMultiClip(c){if(!multiSelection)return false;const unit=selectionUnit(c),remove=unit.every(x=>multiClipIds.has(x.id));for(const x of unit)remove?multiClipIds.delete(x.id):multiClipIds.add(x.id);state.activeClipId=remove?(editTargets()[0]?.id||null):c.id;renderTimeline();renderCanvasFrame();paintMultiSelection();const active=state.timeline.find(x=>x.id===state.activeClipId);if(active)greenScreenProcessor.updateSlidersUI(active);return true;}
function timelineUnits(row){const units=[];for(const c of [...row].sort((a,b)=>(a.timelineStart||0)-(b.timelineStart||0))){let unit=c.groupId&&units.find(u=>u[0].groupId===c.groupId);if(!unit){unit=[];units.push(unit);}unit.push(c);}return units;}
function placeTimelineUnits(units){let cursor=0;for(const unit of units)for(const c of unit){const delta=cursor-(c.timelineStart||0);if(c.animationStart!==undefined)c.animationStart+=delta;c.timelineStart=cursor;cursor+=c.endTime-c.startTime;}}
function mediaAge(c){const file=state.mediaFiles.find(m=>m.id===c.mediaId)?.file;return file?.lastModified>0?file.lastModified:Infinity;}
function organizeTimeline(){pausePlayback();const units=timelineUnits(state.timeline.filter(c=>clipTrack(c)===0));units.sort((a,b)=>{const aa=Math.min(...a.map(mediaAge)),bb=Math.min(...b.map(mediaAge));return aa===bb?0:aa-bb;});placeTimelineUnits(units);commitMontage();showToast('Piste principale organisée · plus ancienne → plus récente.');}
function commitMontage(){pushState();renderTimeline();renderCanvasFrame();paintMultiSelection();window.refreshAnimationPanel?.();}
function toggleSelectedKeyframes(){
 const targets=editTargets().filter(c=>state.currentTime>=(c.timelineStart||0)-1e-6&&state.currentTime<=(c.timelineStart||0)+c.endTime-c.startTime+1e-6);if(!targets.length)return showToast('Placez le curseur dans le clip sélectionné.');pausePlayback();
 for(const c of targets){const key=keyframeNearTime(c,state.currentTime);prepareLayerEdit(c);if(key)c.keyframes=c.keyframes.filter(k=>k!==key);else captureLayerKeyframe(c,state.currentTime);}commitMontage();
}
async function analyzeMediaSpeech(media){
 if(media.speechAnalyzed||media.audioAbsent)return;if(media.analysisTask)return media.analysisTask;
 media.analysisTask=(async()=>{
 const B=await loadMediaLibrary(),file=await getStableMediaFile(media),input=new B.Input({source:makeMediaBlobSource(B,file),formats:B.ALL_FORMATS});
 try{const track=await input.getPrimaryAudioTrack();if(!track){media.audioAbsent=true;media.speechBounds=[];return;}const first=await track.getFirstTimestamp(),energies=[],peaks=[];let yielded=performance.now();
 for await(const part of new B.AudioBufferSink(track).buffers()){
   if(window.waitMediaVisualIdle)await waitMediaVisualIdle(mediaVisualGeneration);if(performance.now()-yielded>8){await new Promise(r=>setTimeout(r,0));yielded=performance.now();}
   const data=part.buffer.getChannelData(0),rate=part.buffer.sampleRate,step=Math.max(1,Math.round(rate*.015));
   for(let i=0;i<data.length;i+=step){let sum=0,lo=0,hi=0,n=Math.min(step,data.length-i);for(let j=i;j<i+n;j++){const v=data[j];sum+=v*v;lo=Math.min(lo,v);hi=Math.max(hi,v);}const at=Math.max(0,Math.floor((part.timestamp-first+i/rate)/.015));energies[at]=Math.max(energies[at]||0,Math.sqrt(sum/n));peaks[at*2]=Math.min(peaks[at*2]||0,lo);peaks[at*2+1]=Math.max(peaks[at*2+1]||0,hi);}
 }
 let max=0;for(const value of energies)max=Math.max(max,value||0);const threshold=Math.max(.001,max*.10),segments=[];let current=null;
 for(let i=0;i<energies.length;i++){if((energies[i]||0)>threshold){if(!current)current={start:i*.015};current.end=(i+1)*.015;}else if(current&&(i*.015-current.end)>.6){segments.push(current);current=null;}}if(current)segments.push(current);
 media.speechBounds=segments;const values=Float32Array.from(peaks,v=>v||0);media.waveformPreview={sampleRate:2/.015,getChannelData:()=>values};media.speechAnalyzed=true;await saveMediaAnalysis(media).catch(()=>{});
 }finally{input.dispose();}
 })();try{await media.analysisTask;}finally{media.analysisTask=null;}
}
async function runAutoCut(clips){
 if(window.openSafeAutoCut)return window.openSafeAutoCut(clips);
 if(autoCutBusy)return;const targets=[...new Set(clips)].filter(c=>c.type==='video');if(!targets.length)return showToast('Sélectionnez des vidéos.');pausePlayback();autoCutBusy=true;
 const status=document.getElementById('autocut-status'),button=document.getElementById('btn-autocut-clip'),padding=Math.max(0,Math.min(2,Number(document.getElementById('autocut-padding').value)||0));button.disabled=true;let changed=0,failed=0;
 try{for(let i=0;i<targets.length;i++){const clip=targets[i],media=state.mediaFiles.find(m=>m.id===clip.mediaId);status.textContent=`Analyse ${i+1}/${targets.length} · ${media?.file.name||''}`;button.textContent=`AutoCut ${i+1}/${targets.length}`;
   try{if(!media)continue;await analyzeMediaSpeech(media);const bounds=(media.speechBounds||[]).filter(b=>b.end>clip.startTime&&b.start<clip.endTime),last=bounds.at(-1);if(last){clip.startTime=Math.max(clip.startTime,last.start-.08);clip.endTime=Math.min(clip.endTime,last.end+padding);changed++;}}catch(e){failed++;status.textContent=e.message;}
 }if(changed){recalculateTimelinePositions();commitMontage();}status.textContent=`${changed} clips ajustés · marge de fin ${padding.toFixed(2)} s${failed?' · '+failed+' analyses impossibles':''}`;showToast(status.textContent);
 }finally{autoCutBusy=false;button.disabled=false;button.textContent='✳ AutoCut';}
}
function propagateSelectionPose(active,before){
 if(!multiSelection)return;const after=layerPose(active),factor=after.scale/before.scale;
 for(const c of editTargets(active)){if(c===active)continue;prepareLayerEdit(c);const pose=layerPose(c);applyPose(c,{centerX:pose.centerX+after.centerX-before.centerX,centerY:pose.centerY+after.centerY-before.centerY,scale:pose.scale*factor,rotation:pose.rotation+after.rotation-before.rotation});updateKeyframeFromEdit(c);}
}
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id);byId('multi-select-btn').onclick=()=>{multiSelection=!multiSelection;multiClipIds.clear();if(multiSelection&&state.activeClipId)multiClipIds.add(state.activeClipId);paintMultiSelection();};
 byId('selection-all').onclick=()=>{for(const c of state.timeline)multiClipIds.add(c.id);state.activeClipId=state.timeline[0]?.id||null;renderTimeline();paintMultiSelection();};
 byId('selection-none').onclick=()=>{multiClipIds.clear();state.activeClipId=null;renderTimeline();paintMultiSelection();};
 byId('selection-done').onclick=clearMultiSelection;
 byId('to-primary-btn').onclick=()=>{const clips=editTargets();if(!clips.length)return showToast('Sélectionnez un clip.');pausePlayback();insertClipsOnTrack(clips,0,state.currentTime);commitMontage();};
 byId('organize-timeline-btn').onclick=organizeTimeline;byId('autocut-all').onclick=()=>runAutoCut(state.timeline.filter(c=>clipTrack(c)===0));
 byId('add-keyframe').onclick=toggleSelectedKeyframes;
 document.addEventListener('click',e=>{
   if(window.suppressToolClick)return;const id=e.target.closest('button')?.id;if(!multiSelection)return;
   if(!editTargets().length&&['toggle-ai','btn-mute','btn-layer-up','btn-layer-down','btn-delete','btn-duplicate-pip-ai','btn-split','center-layer','fit-layer-height','remove-keyframe'].includes(id)){e.preventDefault();e.stopImmediatePropagation();showToast('Sélectionnez au moins un clip.');return;}
   if(editTargets().length<2)return;
   const supported=['toggle-ai','btn-mute','btn-layer-up','btn-layer-down','btn-delete','btn-duplicate-pip-ai','btn-split','center-layer','fit-layer-height','remove-keyframe'];if(!supported.includes(id))return;
   if(window.heldTool===id){window.heldTool=null;return;}e.preventDefault();e.stopImmediatePropagation();pausePlayback();const clips=editTargets(),first=clips[0];
   if(id==='toggle-ai'){const value=first.backgroundRemovalMode==='object'||!first.aiBackgroundRemoval;for(const c of clips.filter(c=>c.type==='video')){c.aiBackgroundRemoval=value;c.backgroundRemovalMode='human';greenScreenProcessor.frames.delete(c.id);if(value)window.primeClipCutout?.(c).catch(e=>showToast(e.message));}}
   if(id==='btn-mute'){const value=!first.muted;for(const c of clips)c.muted=value;}
   if(id==='btn-layer-up'||id==='btn-layer-down'){shiftSecondaryLayers(clips,id==='btn-layer-up'?1:-1);}
   if(id==='center-layer')for(const c of clips){prepareLayerEdit(c);c.x=(workspaceWidth()-c.width)/2;c.y=(workspaceHeight()-c.height)/2;updateKeyframeFromEdit(c);}
   if(id==='fit-layer-height')for(const c of clips){prepareLayerEdit(c);applyPose(c,{...layerPose(c),scale:workspaceHeight()/c.baseHeight,centerX:workspaceWidth()/2,centerY:workspaceHeight()/2});updateKeyframeFromEdit(c);}
   if(id==='remove-keyframe')for(const c of clips){const key=keyframeNearTime(c,state.currentTime);if(key){prepareLayerEdit(c);c.keyframes=c.keyframes.filter(k=>k!==key);}}
   if(id==='btn-split'){for(const c of clips){const local=state.currentTime-(c.timelineStart||0);if(local<=0||local>=c.endTime-c.startTime)continue;const at=c.startTime+local,left={...structuredClone(c),id:'clip_'+crypto.randomUUID(),endTime:at},right={...structuredClone(c),id:'clip_'+crypto.randomUUID(),startTime:at,timelineStart:state.currentTime};retainSplitAnimation(c,left,right);state.timeline.splice(state.timeline.indexOf(c),1,left,right);multiClipIds.delete(c.id);multiClipIds.add(left.id);multiClipIds.add(right.id);state.activeClipId=right.id;}recalculateTimelinePositions();}
   if(id==='btn-delete'){const ids=new Set(clips.map(c=>c.id));state.timeline=state.timeline.filter(c=>!ids.has(c.id));multiClipIds.clear();state.activeClipId=state.timeline[0]?.id||null;recalculateTimelinePositions();}
   if(id==='btn-duplicate-pip-ai'){for(const c of clips.filter(c=>c.type==='video')){const media=state.mediaFiles.find(m=>m.id===c.mediaId),copy={...structuredClone(c),...fullHeightPose(media.element.videoWidth,media.element.videoHeight),id:'pip_'+crypto.randomUUID(),trackIndex:nextPipTrack(),zIndex:Math.max(1,...state.timeline.map(x=>(x.zIndex||0)+1)),muted:true,aiBackgroundRemoval:true,keyframes:[],crop:{},cropRatio:'free'};delete copy.groupId;delete copy.scene;state.timeline.push(copy);}}
   commitMontage();
 },true);
 initTrackDrag();
});
