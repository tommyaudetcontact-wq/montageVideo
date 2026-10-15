'use strict';
const projectAudioSources=[];
async function prepareProjectAudio(mediaIds=null){
 const ids=mediaIds||state.timeline.filter(c=>c.type==='video'&&!c.muted).map(c=>c.mediaId);
 const missing=[...new Set(ids)].map(id=>state.mediaFiles.find(m=>m.id===id)).filter(m=>m&&!m.audioBuffer&&!m.audioAbsent);
 if(!missing.length)return;
 const B=await loadMediaLibrary();
 for(const media of missing){
   const input=new B.Input({source:new B.BlobSource(media.file),formats:B.ALL_FORMATS});
   try{
     const track=await input.getPrimaryAudioTrack();if(!track){media.audioAbsent=true;continue;}
     if(!await track.canDecode())throw Error('Audio non décodable : '+media.file.name);
     const parts=[];let end=0;for await(const part of new B.AudioBufferSink(track).buffers()){parts.push(part);end=Math.max(end,part.timestamp+part.buffer.duration);}
     if(!parts.length)continue;const rate=parts[0].buffer.sampleRate;
     const buffer=getAudioContext().createBuffer(2,Math.max(1,Math.ceil(end*rate)),rate);
     for(const part of parts)for(let ch=0;ch<2;ch++)buffer.getChannelData(ch).set(part.buffer.getChannelData(Math.min(ch,part.buffer.numberOfChannels-1)),Math.max(0,Math.round(part.timestamp*rate)));
     media.audioBuffer=buffer;
   }finally{input.dispose();}
 }
}
function stopProjectAudio(){for(const node of projectAudioSources.splice(0)){try{node.stop();}catch{}node.disconnect();}}
function startProjectAudio(time){
  stopProjectAudio();const ctx=getAudioContext(),now=ctx.currentTime;
  for(const c of state.timeline){
    const buffer=state.mediaFiles.find(m=>m.id===c.mediaId)?.audioBuffer;
    if(c.muted||!buffer||c.type!=='video')continue;
    const end=c.timelineStart+c.endTime-c.startTime;
    let begin=Math.max(time,c.timelineStart,c.timelineStart+(c.audioOffset||0)),offset=c.startTime+begin-c.timelineStart-(c.audioOffset||0);
    if(offset<0){begin-=offset;offset=0;}
    const duration=Math.min(end-begin,Math.min(buffer.duration,c.endTime)-offset);if(duration<=0)continue;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=c.volume??1;
    source.connect(gain);gain.connect(ctx.destination);source.onended=()=>gain.disconnect();
    source.start(now+begin-time,offset,duration);projectAudioSources.push(source);
  }
}
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),active=()=>state.timeline.find(c=>c.id===state.activeClipId);
 const requireClip=()=>{const c=active();if(!c)showToast('Sélectionnez un calque.');return c;};
 const members=c=>c?.groupId&&state.groups[c.groupId]?.kind==='sequence'?state.timeline.filter(x=>x.groupId===c.groupId):c?[c]:[];
 const commit=()=>{pushState();renderTimeline();renderCanvasFrame();};
 byId('btn-mute').addEventListener('click',e=>{const c=active(),clips=members(c);pausePlayback();if(clips.length<2)return;e.stopImmediatePropagation();const value=!c.muted;for(const x of clips)x.muted=value;commit();},true);
 for(const [id,direction] of [['btn-layer-up',1],['btn-layer-down',-1]])byId(id).addEventListener('click',e=>{
   const c=active(),clips=members(c);if(clips.length<2)return;e.stopImmediatePropagation();pausePlayback();
   const levels=[...new Set(state.timeline.map(x=>x.zIndex||0))].sort((a,b)=>a-b),index=levels.indexOf(c.zIndex||0),target=levels[index+direction];
   if(target===undefined)return;const old=c.zIndex||0;for(const x of state.timeline)if(!clips.includes(x)&&(x.zIndex||0)===target)x.zIndex=old;for(const x of clips)x.zIndex=target;commit();
 },true);
 const dialog=byId('tool-dialog'),content=byId('tool-content');let moved=[];
 function restore(){for(const {node,parent,next} of moved){parent.insertBefore(node,next?.parentNode===parent?next:null);node.hidden=true;}moved=[];}
 function open(title,nodes){
   restore();byId('tool-title').textContent=title;
   for(const node of nodes){moved.push({node,parent:node.parentNode,next:node.nextSibling});content.appendChild(node);node.hidden=false;if(node.tagName==='DETAILS')node.open=true;node.classList.add('show');}
   if(active())greenScreenProcessor.updateSlidersUI(active());refreshAnimationPanel();if(!dialog.open)dialog.showModal();
 }
 window.openPocketCutTool=open;
 byId('close-tool').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{restore();state.editPoseClipId=null;renderCanvasFrame();});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 const animation=byId('animation-panel'),body=animation.querySelector('.animation-body');
 const autoField=byId('autozoom-percent').closest('fieldset'),popField=byId('popup-duration').closest('fieldset'),fusionField=byId('merge-list').closest('fieldset');
 fusionField.hidden=true;
 const keyPanel=document.createElement('section');keyPanel.id='manual-keyframes';
 for(const node of [...body.children])if(node!==autoField&&node!==popField&&node!==fusionField&&node.id!=='animation-selection')keyPanel.appendChild(node);
 body.appendChild(keyPanel);animation.hidden=true;
 const showAnimation=kind=>{
   if(!requireClip())return;
   keyPanel.hidden=kind!=='keys';autoField.hidden=kind!=='auto';popField.hidden=kind!=='pop';
   open(kind==='keys'?'Keyframes':kind==='auto'?'Auto-keyframes · zoom progressif':'Animation · pop-up',[animation]);
 };
 // A hold is intercepted before any existing click listener receives the release click.
 function hold(id,show,click){
   const b=byId(id);let timer,held=false,start;
   b.classList.add('holdable');b.setAttribute('aria-description','Maintenir pour modifier les réglages.');
   b.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=false;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{held=true;show();},450);});
   b.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)clearTimeout(timer);});
   for(const event of ['pointerup','pointercancel','pointerleave'])b.addEventListener(event,()=>clearTimeout(timer));
   b.addEventListener('click',e=>{if(held){e.preventDefault();e.stopImmediatePropagation();held=false;}else if(click){e.preventDefault();e.stopImmediatePropagation();click();}},true);
   b.addEventListener('contextmenu',e=>{e.preventDefault();clearTimeout(timer);held=true;show();});
   b.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.shiftKey){e.preventDefault();show();}});
   b.title='Cliquer : appliquer · Maintenir : réglages · Maj+Entrée : réglages';
 }
 hold('btn-duplicate-pip-ai',()=>{const c=requireClip();if(c){open('PIP · position, zoom et rotation',[byId('pip-sliders-panel')]);pausePlayback();state.editPoseClipId=c.id;renderCanvasFrame();}});
 hold('toggle-ai',()=>open('Affiner le détourage',[document.querySelector('.ai-settings')]));
 byId('btn-animations').onclick=null;
 hold('btn-animations',()=>showAnimation('pop'),()=>{
   const c=requireClip();if(!c)return;if(!c.aiBackgroundRemoval)return showToast('Activez le détourage du calque pour le pop-up.');
   pausePlayback();for(const x of members(c))x.popUp={enabled:true,duration:0.25};state.editPoseClipId=null;commit();showToast('Pop-up appliqué · 0,25 s.');
 });
 byId('keyframes-btn').onclick=()=>showAnimation('keys');byId('auto-keyframes-btn').onclick=()=>showAnimation('auto');
 // Settings apply on input; no checkbox-plus-Apply workflow.
 byId('apply-popup').hidden=true;byId('apply-autozoom').hidden=true;
 const savePop=()=>{const c=requireClip();if(!c)return;const duration=Number(byId('popup-duration').value);if(!Number.isFinite(duration)||duration<0.05||duration>3600)return;
   pausePlayback();for(const x of members(c))x.popUp={enabled:byId('popup-enabled').checked,duration};commit();};
 const saveAuto=()=>{const c=requireClip();if(!c)return;const percent=Number(byId('autozoom-percent').value);if(!Number.isFinite(percent)||percent< -95||percent>1000)return;
   const target=c.groupId&&state.groups[c.groupId]||c;target.autoZoom={enabled:byId('autozoom-enabled').checked,percent};pausePlayback();commit();};
 byId('popup-enabled').onchange=savePop;byId('popup-duration').oninput=()=>{byId('popup-enabled').checked=true;savePop();};
 byId('autozoom-enabled').onchange=saveAuto;byId('autozoom-percent').oninput=()=>{byId('autozoom-enabled').checked=true;saveAuto();};
 byId('volume-btn').onclick=()=>{const c=requireClip();if(!c)return;byId('clip-volume').value=(c.volume??1)*100;byId('clip-volume-number').value=(c.volume??1)*100;open('Volume · amplification',[byId('volume-settings')]);};
 for(const id of ['clip-volume','clip-volume-number'])byId(id).oninput=()=>{
   const c=requireClip(),value=Number(byId(id).value);if(!c||!Number.isFinite(value)||value<0||value>1000)return;
   pausePlayback();for(const x of members(c))x.volume=value/100;
   byId('clip-volume-number').value=value;byId('clip-volume').value=value;commit();
 };
 byId('audio-offset-btn').onclick=()=>{const c=requireClip();if(!c)return;byId('clip-audio-offset').value=c.audioOffset||0;open('Décalage du son',[byId('offset-settings')]);};
 byId('clip-audio-offset').oninput=()=>{const c=requireClip(),value=Number(byId('clip-audio-offset').value);if(!c||!Number.isFinite(value))return;pausePlayback();for(const x of members(c))x.audioOffset=value;commit();};
 byId('quality-btn').onclick=()=>open('Qualité d’export',[document.querySelector('.export-settings')]);
 byId('workspace-btn').onclick=()=>open('Format de la zone de travail',[byId('workspace-settings')]);
 byId('workspace-format').onchange=()=>{
   pausePlayback();const [a,b]=byId('workspace-format').value.split(':').map(Number),oldW=workspaceWidth(),oldH=workspaceHeight();
   const newH=1280,newW=1280*a/b;
   for(const c of state.timeline){const pose=layerPose(c),scale=newH/oldH;c.baseWidth*=scale;c.baseHeight*=scale;
     applyPose(c,{...pose,centerX:pose.centerX/oldW*newW,centerY:pose.centerY/oldH*newH});
     for(const k of c.keyframes||[]){k.centerX=k.centerX/oldW*newW;k.centerY=k.centerY/oldH*newH;}}
   for(const g of Object.values(state.groups)){g.pivotX=(g.pivotX??oldW/2)/oldW*newW;g.pivotY=(g.pivotY??oldH/2)/oldH*newH;}
   state.projectWidth=Math.round(newW);state.projectHeight=newH;mainCanvas.width=state.projectWidth;mainCanvas.height=newH;
   document.querySelector('.player-wrapper').style.aspectRatio=`${a}/${b}`;byId('workspace-btn').textContent='Format '+a+':'+b;commit();
 };
 const picks=new Set();let fusion=false;
 function paintFusion(){for(const el of document.querySelectorAll('.clip-wrapper'))el.classList.toggle('fusion-picked',picks.has(el.dataset.clipId));byId('fusion-status').textContent=picks.size+' clips · sélectionnez une seule rangée';}
 window.pickFusionClip=c=>{if(!fusion)return false;const first=state.timeline.find(x=>x.id===[...picks][0]);if(first&&(first.zIndex||0)!==(c.zIndex||0)){showToast('Choisissez des clips dans la même rangée.');return true;}picks.has(c.id)?picks.delete(c.id):picks.add(c.id);paintFusion();return true;};
 byId('fusion-btn').onclick=()=>{pausePlayback();fusion=true;picks.clear();byId('fusion-bar').hidden=false;paintFusion();};
 const cancelFusion=()=>{fusion=false;picks.clear();byId('fusion-bar').hidden=true;paintFusion();};byId('fusion-cancel').onclick=cancelFusion;
 byId('fusion-ok').onclick=()=>{
   const chosen=state.timeline.filter(c=>picks.has(c.id));if(chosen.length<2)return showToast('Sélectionnez au moins deux clips.');
   const expanded=new Set(chosen);for(const c of chosen)if(c.groupId)for(const x of state.timeline)if(x.groupId===c.groupId)expanded.add(x);
   const clips=[...expanded].sort((a,b)=>a.timelineStart-b.timelineStart);if(new Set(clips.map(c=>c.zIndex||0)).size!==1)return showToast('La fusion exige une seule rangée.');
   const row=state.timeline.filter(c=>(c.zIndex||0)===(clips[0].zIndex||0));
   const start=clips[0].timelineStart,end=clips.at(-1).timelineStart+clips.at(-1).endTime-clips.at(-1).startTime;
   if(row.some(c=>!expanded.has(c)&&c.timelineStart<end&&c.timelineStart+c.endTime-c.startTime>start))return showToast('Sélectionnez aussi les clips situés entre les deux.');
   const id='sequence_'+Date.now().toString(36);state.groups[id]={id,kind:'sequence',pivotX:workspaceWidth()/2,pivotY:workspaceHeight()/2,autoZoom:{enabled:false,percent:15}};
   let cursor=start;for(const c of clips){c.groupId=id;c.timelineStart=cursor;cursor+=c.endTime-c.startTime;}
   state.activeClipId=clips[0].id;cancelFusion();commit();showToast('Fusion terminée. Auto-keyframes couvre toute la capsule.');
 };
 // Desktop and touch drag to scroll, while preserving a stationary tap selection.
 let drag;window.timelineDragged=false;
 timelineScrollContainer.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.trim-handle'))return;pausePlayback();window.timelineDragged=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:timelineScrollContainer.scrollLeft,top:timelineScrollContainer.scrollTop};});
 window.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>6)window.timelineDragged=true;
   if(window.timelineDragged){e.preventDefault();timelineScrollContainer.scrollLeft=drag.left-dx;timelineScrollContainer.scrollTop=drag.top-dy;}},{passive:false});
 const endDrag=()=>{drag=null;setTimeout(()=>window.timelineDragged=false,0);};window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
});
