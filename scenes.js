'use strict';
// Narration is canonical. Illustration clips are derived views, never duplicate voice takes.
const SceneEngine=(()=>{
 const duration=c=>Math.max(0,c.endTime-c.startTime);
 const end=c=>(c.timelineStart||0)+duration(c);
 const uid=prefix=>prefix+'_'+crypto.randomUUID();
 const defaults={placementVersion:2,mode:'pip',layout:'right',zoom:35,faceY:.47,faceHeight:.30,popup:.25,visualAudio:false,narrationAudio:true,shortVideo:'freeze',bgX:.5,bgY:.5,bgOffsetX:0,bgOffsetY:0,bgZoom:100};
 function runs(timeline){
  const result=[];
  for(const c of [...timeline].sort((a,b)=>clipTrack(a)-clipTrack(b)||(a.timelineStart||0)-(b.timelineStart||0))){
   if(!c.scene)continue;
   const last=result.at(-1);
   if(last&&clipTrack(last.clips[0])===clipTrack(c)&&last.id===c.scene.id&&Math.abs(last.end-(c.timelineStart||0))<.025){last.clips.push(c);last.end=end(c);}
   else result.push({id:c.scene.id,start:c.timelineStart||0,end:end(c),clips:[c]});
  }
  return result;
 }
 function cover(media,rect,x=.5,y=.5){
  const el=media?.element,w=el?.videoWidth||el?.naturalWidth||1080,h=el?.videoHeight||el?.naturalHeight||1920;
  const factor=Math.max(rect.width/w,rect.height/h),width=w*factor,height=h*factor;
  return {x:rect.x+(rect.width-width)*x,y:rect.y+(rect.height-height)*y,width,height,baseWidth:width,baseHeight:height,scale:1,rotation:0};
 }
 function layoutSubject(c,settings){
  const w=workspaceWidth(),h=workspaceHeight(),rect={x:0,y:0,width:w,height:h};
  const media=state.mediaFiles.find(m=>m.id===c.mediaId);
  delete c.viewRect;c.crop={};c.cropRatio='free';c.keyframes=[];delete c.animationStart;delete c.animationDuration;
  c.autoZoom={enabled:false,from:0,percent:35};c.popUp={enabled:settings.mode==='pip',duration:settings.popup};
  c.aiBackgroundRemoval=settings.mode==='pip'&&c.type==='video';c.backgroundRemovalMode='human';
  if(settings.mode==='split'){
   const top={...rect,height:h*(settings.faceHeight??.30)},pose=cover(media,top);pose.y=top.height/2-(settings.faceY??.47)*pose.height;Object.assign(c,pose);c.viewRect=top;
  }else if(settings.mode==='pip'){
   const pose=fullHeightPose(media?.element?.videoWidth||media?.element?.naturalWidth,media?.element?.videoHeight||media?.element?.naturalHeight);Object.assign(c,pose);
   const layout=settings.layout||'right',upper=layout.startsWith('top-'),left=layout.includes('left'),straight=layout.startsWith('straight-');
   const height=(upper?.50:layout==='large'?.76:.58)*h,scale=height/c.baseHeight,width=c.baseWidth*scale;
   const rotation=upper?(left?135:-135):straight||layout==='center'||layout==='large'?0:left?25:-25;
   const radians=rotation*Math.PI/180,bleed=h*.025;
   const centerY=upper?-Math.cos(radians)*height/2-bleed:h-Math.cos(radians)*height/2+Math.abs(Math.sin(radians))*width/2+bleed;
   const headX=w*(layout==='center'||layout==='large'?.5:left?.23:.77);
   const centerX=upper?(left?-bleed:w+bleed)+Math.sin(radians)*height/2:headX;
   applyPose(c,{centerX,centerY,scale,rotation});
  }else Object.assign(c,cover(media,rect));
 }
 function upgrade(){
  const w=workspaceWidth(),h=workspaceHeight();
  for(const c of state.timeline){if(!c.scene||c.scene.placementVersion===2)continue;
   const layout=c.scene.layout,pose=layerPose(c),oldPip=c.scene.mode==='pip'&&['left','right'].includes(layout)&&Math.abs(c.height-h*.46)<1&&Math.abs(pose.centerX-w*(layout==='left'?.24:.76))<1&&Math.abs(pose.centerY-h*.77)<1&&Math.abs(pose.rotation-(layout==='left'?15:-15))<.1;
   const oldSplit=c.scene.mode==='split'&&Math.abs((c.viewRect?.height||0)-h*.5)<1&&Math.abs(pose.rotation)<.1;
   if((oldPip||oldSplit)&&!c.keyframes?.length){const temp=structuredClone(c);layoutSubject(temp,{...defaults,...c.scene});for(const key of ['x','y','width','height','baseWidth','baseHeight','scale','rotation','viewRect']){if(temp[key]===undefined)delete c[key];else c[key]=temp[key];}}
   c.scene.placementVersion=2;
  }
 }
 function splitAt(timeline,time,track=0){
  const index=timeline.findIndex(c=>clipTrack(c)===track&&time>(c.timelineStart||0)+.001&&time<end(c)-.001);
  if(index<0)return;
  const original=timeline[index],offset=time-(original.timelineStart||0),left=structuredClone(original),right=structuredClone(original);
  left.id=uid('clip');right.id=uid('clip');left.endTime=original.startTime+offset;right.startTime=left.endTime;right.timelineStart=time;
  retainSplitAnimation(original,left,right);timeline.splice(index,1,left,right);
 }
 function apply(from,to,settings,existingId=null,track=0){
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to-from<.02)throw Error('Choisissez un passage d’au moins 0,02 s.');
  const overlapping=state.timeline.filter(c=>clipTrack(c)===track&&end(c)>from+.001&&(c.timelineStart||0)<to-.001);
  if(!overlapping.length)throw Error('Ce passage ne contient pas de narration sur la piste principale.');
  if(existingId){const prior=runs(state.timeline).find(r=>r.id===existingId&&r.end>from&&r.start<to);if(!prior||Math.abs(prior.start-from)>.001||Math.abs(prior.end-to)>.001)existingId=null;}
  const cfg={...defaults,...settings};
  if(!['pip','split','excerpt','face'].includes(cfg.mode))throw Error('Composition inconnue.');
  if(cfg.mode!=='face'&&!state.mediaFiles.some(m=>m.id===cfg.visualMediaId))throw Error('Choisissez une image ou une vidéo pour le fond.');
  splitAt(state.timeline,from,track);splitAt(state.timeline,to,track);
  const targets=state.timeline.filter(c=>clipTrack(c)===track&&(c.timelineStart||0)>=from-.001&&end(c)<=to+.001);
  const id=existingId||uid('scene');
  for(const c of targets){
   const same=c.scene?.id===existingId&&c.scene.mode===cfg.mode&&c.scene.layout===cfg.layout&&(cfg.mode!=='split'||c.scene.faceY===cfg.faceY&&c.scene.faceHeight===cfg.faceHeight);
   if(cfg.mode==='face'){
    if(c.scene?.originalPose){const original=structuredClone(c.scene.originalPose);for(const k of ['x','y','width','height','baseWidth','baseHeight','scale','rotation','crop','cropRatio','keyframes','autoZoom','popUp','aiBackgroundRemoval','backgroundRemovalMode','animationStart','animationDuration'])delete c[k];Object.assign(c,original);}else layoutSubject(c,{...cfg,mode:'face'});
    delete c.scene;delete c.viewRect;continue;
   }
   const originalPose=c.scene?.originalPose||Object.fromEntries(['x','y','width','height','baseWidth','baseHeight','scale','rotation','crop','cropRatio','keyframes','autoZoom','popUp','aiBackgroundRemoval','backgroundRemovalMode','animationStart','animationDuration'].filter(k=>c[k]!==undefined).map(k=>[k,structuredClone(c[k])]));
   if(!same)layoutSubject(c,cfg);
   else c.popUp={enabled:cfg.mode==='pip',duration:cfg.popup};
   const visualSourceOffset=existingId&&c.scene?.visualMediaId===cfg.visualMediaId?(c.scene.visualSourceOffset??((c.timelineStart||0)-from)):(c.timelineStart||0)-from;
   c.scene={...structuredClone(cfg),id,originalPose,visualSourceOffset};
  }
  state.activeClipId=targets[0]?.id||null;
  return targets;
 }
 function sourceTime(c,time){return c.freezeAt??(c.startTime+time-(c.timelineStart||0));}
 function background(c,run,timeline){
  const scene=c.scene,media=state.mediaFiles.find(m=>m.id===scene.visualMediaId);if(!media)return [];
  const w=workspaceWidth(),h=workspaceHeight(),rect=scene.mode==='split'?{x:0,y:h*(scene.faceHeight??.30),width:w,height:h*(1-(scene.faceHeight??.30))}:{x:0,y:0,width:w,height:h};
  const pose=cover(media,rect,scene.bgX,scene.bgY),zoom=Math.max(.1,Math.min(5,(scene.bgZoom??100)/100));applyPose(pose,{centerX:pose.x+pose.width/2+(scene.bgOffsetX||0)*rect.width,centerY:pose.y+pose.height/2+(scene.bgOffsetY||0)*rect.height,scale:zoom,rotation:0});const base={...pose,mediaId:media.id,type:media.type,trackIndex:1,zIndex:(c.zIndex||0)-.5,muted:!scene.visualAudio,volume:scene.visualVolume??1,sceneOwner:c.id,viewRect:rect,crop:{},keyframes:[],autoZoom:{enabled:!!scene.zoom,percent:scene.zoom},animationStart:run.start,animationDuration:run.end-run.start};
  // A replacement background follows the whole scene clock, across technical audio cuts.
  const at=c.timelineStart||0,span=duration(c),offset=scene.visualSourceOffset??(at-run.start);
  if(media.type==='image')return [{...base,id:c.id+'~fond',startTime:0,endTime:span,timelineStart:at}];
  const length=media.duration||media.element?.duration;
  if(!Number.isFinite(length)||length<=.001)return [];
  if(scene.freezeVisual)return [{...base,id:c.id+'~gel-fond',startTime:0,endTime:span,timelineStart:at,freezeAt:scene.shortVideo==='loop'?offset%length:Math.min(offset,Math.max(0,length-.04)),muted:true}];
  const result=[];let elapsed=0;
  while(elapsed<span-.000001){
   const source=offset+elapsed,loop=scene.shortVideo==='loop',remaining=Math.max(0,length-source);
   if(!loop&&remaining<=.00001){result.push({...base,id:c.id+'~gel',startTime:0,endTime:span-elapsed,timelineStart:at+elapsed,freezeAt:Math.max(0,length-Math.min(.04,length/2)),muted:true});break;}
   const start=loop?source%length:source,chunk=Math.min(span-elapsed,length-start);
   if(chunk<.000001)break;
   result.push({...base,id:c.id+'~fond'+result.length,startTime:start,endTime:start+chunk,timelineStart:at+elapsed});elapsed+=chunk;
  }
  return result;
 }
 function subjectRuns(timeline){
  const result=[];let previous=null;
  for(const c of [...timeline].sort((a,b)=>clipTrack(a)-clipTrack(b)||(a.timelineStart||0)-(b.timelineStart||0))){
   const last=result.at(-1),samePose=previous&&['x','y','width','height','rotation'].every(k=>Math.abs((previous[k]||0)-(c[k]||0))<.001);
   const linked=previous&&clipTrack(previous)===clipTrack(c)&&previous.scene?.mode==='pip'&&c.scene?.mode==='pip'&&(previous.scene.id===c.scene.id||(c.scene.continuous&&samePose));
   if(last&&linked&&Math.abs(last.end-(c.timelineStart||0))<.025){last.clips.push(c);last.end=end(c);}else result.push({start:c.timelineStart||0,end:end(c),clips:[c]});previous=c;
  }
  return result;
 }
 function rangeFor(c,timeline=state.timeline){const r=subjectRuns(timeline).find(r=>r.clips.some(x=>x.id===c.id));return r?{start:r.start,duration:r.end-r.start}:null;}
 function expand(timeline){
  const byClip=new Map();for(const run of runs(timeline))for(const c of run.clips)byClip.set(c.id,run);
  const subjectSpans=new Map();for(const r of subjectRuns(timeline))for(const c of r.clips)subjectSpans.set(c.id,r);
  const output=[];
  for(const c of timeline){const run=byClip.get(c.id);if(!run){output.push(c);continue;}
   const scene=c.scene,drawn={...c,muted:c.muted||scene.narrationAudio===false};
   const subjectSpan=subjectSpans.get(c.id)||run;drawn.sceneView=true;drawn.animationStart=subjectSpan.start;drawn.animationDuration=subjectSpan.end-subjectSpan.start;
   if(scene.mode==='excerpt')drawn.hideVisual=true;
   output.push(...background(c,run,timeline),drawn);
  }
  return output;
 }
 function composition(c,name){
  if(!c?.scene)throw Error('Sélectionnez une scène illustrée.');
  const {id,visualMediaId,originalPose,visualSourceOffset,freezeVisual,...settings}=c.scene;
  const run=runs(state.timeline).find(r=>r.clips.some(x=>x.id===c.id));
  const virtual=run?{...c,sceneView:true,timelineStart:run.start,startTime:0,endTime:run.end-run.start,animationStart:run.start,animationDuration:run.end-run.start}:c;
  return {id:uid('composition'),kind:'scene-v2',version:1,name:name.trim(),createdAt:Date.now(),settings,subject:makeClipPreset(virtual,name)};
 }
 function applyComposition(record,targets){
  const from=Math.min(...targets.map(c=>c.timelineStart||0)),to=Math.max(...targets.map(end));
  for(const c of targets){const old=c.scene;if(!old)continue;c.scene={...old,...structuredClone(record.settings)};layoutSubject(c,c.scene);applyClipPreset(record.subject,c,{start:from,duration:to-from});c.scene.originalPose=old.originalPose;c.scene.popup=c.popUp?.duration||c.scene.popup;}
 }
 return {defaults,upgrade,runs,subjectRuns,rangeFor,cover,apply,expand,sourceTime,composition,applyComposition,duration,end};
})();
window.SceneEngine=SceneEngine;
window.syncSceneEdits=()=>{
 const active=state.timeline.find(c=>c.id===state.activeClipId);if(!active?.scene)return;
 const pose=layerPose(active),settings=active.scene;
 if(active.popUp)settings.popup=active.popUp.duration;
 for(const c of state.timeline){if(c===active||c.scene?.id!==settings.id||clipTrack(c)!==clipTrack(active))continue;
  const original=c.scene.originalPose,visualSourceOffset=c.scene.visualSourceOffset,freezeVisual=c.scene.freezeVisual;c.scene={...structuredClone(settings),originalPose:original,visualSourceOffset,freezeVisual};
  applyPose(c,{...pose,scale:pose.scale*active.baseHeight/c.baseHeight});
  for(const key of ['crop','cropRatio','popUp','autoZoom'])if(active[key]!==undefined)c[key]=structuredClone(active[key]);
  c.keyframes=(active.keyframes||[]).map(k=>({...structuredClone(k),scale:k.scale*active.baseHeight/c.baseHeight}));
  if(c.type==='video'){c.aiBackgroundRemoval=active.aiBackgroundRemoval;c.backgroundRemovalMode=active.backgroundRemovalMode;}
 }
};
