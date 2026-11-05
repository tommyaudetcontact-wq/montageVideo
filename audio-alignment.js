'use strict';
// Audio offsets use the same sign and full source bounds as preview/export.
const AudioAlignmentMath={
 clamp:(v,d)=>Math.max(-d,Math.min(d,Math.round(v*1000)/1000)),
 fromDrag:(initial,delta,pixelsPerSecond,duration)=>AudioAlignmentMath.clamp(initial+delta/pixelsPerSecond,duration),
 sourceTime:(clip,local,offset)=>clip.startTime+local-offset,
 audible:(clip,local,offset,sourceDuration=Infinity)=>local>=0&&local<clip.endTime-clip.startTime&&AudioAlignmentMath.sourceTime(clip,local,offset)>=0&&AudioAlignmentMath.sourceTime(clip,local,offset)<sourceDuration
};
window.AudioAlignmentMath=AudioAlignmentMath;
document.addEventListener('DOMContentLoaded',()=>{
 const dialog=document.createElement('dialog');dialog.id='audio-align-dialog';dialog.innerHTML=`
 <header><h2>Décalage du son</h2><button type="button" id="audio-align-close" aria-label="Fermer le décalage son">✕</button></header>
 <p id="audio-align-name"></p><video id="audio-align-video" muted playsinline preload="metadata"></video>
 <p>Glissez la forme d’onde : à gauche pour avancer le son, à droite pour le retarder. Les images restent fixes.</p>
 <div class="audio-align-toolbar"><button id="audio-align-play" type="button">▶ Écouter / voir</button><label>Zoom<input id="audio-align-zoom" type="range" min="1" max="32" step="1" value="1"></label><output id="audio-align-zoom-label">×1</output></div>
 <div id="audio-align-scroll"><div id="audio-align-surface"><canvas id="audio-align-canvas" aria-label="Images fixes et forme d’onde audio à déplacer"></canvas><i id="audio-align-cursor"></i></div></div>
 <label>Déplacer la vue<input id="audio-align-pan" type="range" min="0" max="1" step=".001" value="0"></label>
 <label>Position de préécoute dans le clip<input id="audio-align-seek" type="range" min="0" step=".001" value="0"></label>
 <div class="audio-align-toolbar"><button type="button" data-audio-nudge="-frame">−1 image</button><button type="button" data-audio-nudge="-.01">−10 ms</button><button type="button" data-audio-nudge=".01">+10 ms</button><button type="button" data-audio-nudge="frame">+1 image</button></div>
 <label>Décalage précis (millisecondes)<input id="audio-align-offset" type="number" step="1" value="0"></label><output id="audio-align-direction"></output>
 <p id="audio-align-status" role="status"></p><footer><button type="button" id="audio-align-reset">Remettre à zéro</button><button type="button" id="audio-align-cancel">Annuler</button><button type="button" id="audio-align-apply">Appliquer au clip</button></footer>`;
 document.body.appendChild(dialog);
 const el=id=>document.getElementById(id),video=el('audio-align-video'),canvas=el('audio-align-canvas'),scroll=el('audio-align-scroll');
 let clip,media,draft=0,duration=0,local=0,pps=1,zoom=1,drag=null,playing=false,request=0,raf=0,drawFrame=0,source=null,gain=null,audioInput=null,fine=null;
 const thumbImages=[];
 const status=t=>el('audio-align-status').textContent=t;
 function stop(){request++;playing=false;cancelAnimationFrame(raf);video.pause();try{source?.stop();}catch{}source?.disconnect();gain?.disconnect();source=gain=null;el('audio-align-play').textContent='▶ Écouter / voir';}
 function cleanup(){stop();drag=null;audioInput?.dispose();audioInput=null;fine=null;video.removeAttribute('src');video.load();cancelAnimationFrame(drawFrame);thumbImages.length=0;}
 function cursor(){el('audio-align-cursor').style.left=(local*pps)+'px';el('audio-align-seek').value=local;}
 function paint(){
  drawFrame=0;if(!clip||!dialog.open)return;const ctx=canvas.getContext('2d'),w=canvas.width;ctx.clearRect(0,0,w,180);ctx.fillStyle='#073465';ctx.fillRect(0,0,w,180);
  const step=[.01,.02,.05,.1,.2,.5,1,2,5,10,30,60,300].find(t=>t*pps>=65)||600;
  ctx.font='12px system-ui';ctx.fillStyle='#d7f6ff';ctx.strokeStyle='#6fc8e555';
  for(let t=0;t<=duration;t+=step){const x=t*pps;ctx.fillText(t.toFixed(step<1?2:1)+' s',x+3,15);ctx.beginPath();ctx.moveTo(x,20);ctx.lineTo(x,180);ctx.stroke();}
  const thumbs=thumbImages.filter(im=>im.complete&&im.naturalWidth);if(thumbs.length)for(let x=0;x<w;x+=80){const im=thumbs[Math.min(thumbs.length-1,Math.floor(x/Math.max(1,w)*thumbs.length))];ctx.drawImage(im,x,26,80,48);}
  ctx.fillStyle='#94dbc7';ctx.fillText('IMAGE · fixe',5,91);ctx.fillStyle='#062547';ctx.fillRect(0,100,w,80);
  const data=(media.waveformPreview||media.audioBuffer)?.getChannelData(0),rate=media.waveformPreview?.sampleRate||media.audioBuffer?.sampleRate,raw=!media.waveformPreview;
  ctx.strokeStyle='#69ffe1';ctx.beginPath();
  for(let x=0;x<w;x++){
   const t=x/pps,at=AudioAlignmentMath.sourceTime(clip,t,draft);if(!AudioAlignmentMath.audible(clip,t,draft,media.duration||media.element?.duration||Infinity))continue;
   let lo=0,hi=0;
   if(fine&&at>=fine.start&&at<fine.end){const a=fine.buffer.getChannelData(0),start=Math.max(0,Math.floor((at-fine.start)*fine.buffer.sampleRate)),end=Math.min(a.length,Math.ceil((at-fine.start+1/pps)*fine.buffer.sampleRate));for(let n=start;n<end;n+=Math.max(1,Math.floor((end-start)/40))){lo=Math.min(lo,a[n]);hi=Math.max(hi,a[n]);}}
   else if(data){if(raw){const start=Math.floor(at*rate),end=Math.min(data.length,Math.ceil((at+1/pps)*rate));for(let n=start;n<end;n+=Math.max(1,Math.floor((end-start)/30))){lo=Math.min(lo,data[n]);hi=Math.max(hi,data[n]);}}else{const start=Math.max(0,Math.floor(at*rate/2)*2),end=Math.min(data.length,Math.ceil((at+1/pps)*rate/2)*2+2);for(let n=start;n<end;n+=2){lo=Math.min(lo,data[n]);hi=Math.max(hi,data[n+1]||0);}}}
   ctx.moveTo(x,140+lo*35);ctx.lineTo(x,140+Math.max(.015,hi)*35);
  }ctx.stroke();ctx.fillStyle='#e8ffff';ctx.fillText('SON · glisser ↔',5,115);cursor();
 }
 function repaint(){if(!drawFrame)drawFrame=requestAnimationFrame(paint);}
 function resize(){if(!duration)return;const old=pps;pps=Math.min(12000,Math.max(320,scroll.clientWidth)*zoom)/duration;canvas.width=Math.ceil(duration*pps);canvas.height=180;el('audio-align-surface').style.width=canvas.width+'px';scroll.scrollLeft=local*pps-(local*old-scroll.scrollLeft);el('audio-align-zoom-label').value='×'+zoom;paint();}
 function value(v){if(!Number.isFinite(v))return;stop();draft=AudioAlignmentMath.clamp(v,media.duration||media.element?.duration||duration);el('audio-align-offset').value=Math.round(draft*1000);el('audio-align-direction').value=draft===0?'Son synchronisé avec l’image':draft>0?'Son retardé de '+Math.round(draft*1000)+' ms':'Son avancé de '+Math.round(-draft*1000)+' ms';repaint();}
 async function seek(t){stop();local=Math.max(0,Math.min(duration-.001,t));cursor();try{await seekVideo(video,clip.startTime+local);}catch(e){status(e.message);}}
 async function decode(start,end,token){
  if(media.audioBuffer)return {buffer:media.audioBuffer,start:media.audioBufferStart||0,end:(media.audioBufferStart||0)+media.audioBuffer.duration};
  const B=await loadMediaLibrary();if(token!==request||!dialog.open)return null;
  const file=await getStableMediaFile(media);if(token!==request||!dialog.open)return null;
  const input=new B.Input({source:makeMediaBlobSource(B,file),formats:B.ALL_FORMATS});audioInput=input;
  try{const track=await input.getPrimaryAudioTrack();if(!track||!await track.canDecode())throw Error('Ce clip ne contient pas de son décodable.');const first=await track.getFirstTimestamp(),parts=[];
   for await(const part of new B.AudioBufferSink(track).buffers(first+start,first+end)){if(token!==request||!dialog.open)return null;parts.push(part);}
   if(!parts.length)throw Error('Aucun son à cet endroit du clip.');const rate=parts[0].buffer.sampleRate,buffer=getAudioContext().createBuffer(Math.min(2,parts[0].buffer.numberOfChannels),Math.max(1,Math.ceil((end-start)*rate)),rate);
   for(const part of parts){const at=Math.round((part.timestamp-first-start)*rate),skip=Math.max(0,-at),dest=Math.max(0,at),count=Math.min(part.buffer.length-skip,buffer.length-dest);if(count>0)for(let ch=0;ch<buffer.numberOfChannels;ch++)buffer.getChannelData(ch).set(part.buffer.getChannelData(ch).subarray(skip,skip+count),dest);}
   return {buffer,start,end};
  }finally{input.dispose();if(audioInput===input)audioInput=null;}
 }
 async function play(){
  if(playing){stop();return;}stop();const token=request;if(local>=duration-.02)local=0;
  const begin=local,end=Math.min(duration,begin+10),audioBegin=Math.max(begin,draft-clip.startTime),sourceStart=clip.startTime+audioBegin-draft,sourceEnd=Math.min(media.duration||media.element?.duration||Infinity,clip.startTime+end-draft);
  el('audio-align-play').disabled=true;status('Préparation de la préécoute…');
  try{
   await waitForPreviewData(video);if(token!==request||!dialog.open)return;await seekVideo(video,clip.startTime+begin);
   let sound=null;if(audioBegin<end&&sourceEnd>sourceStart)sound=await decode(Math.max(0,sourceStart),sourceEnd,token);
   if(token!==request||!dialog.open)return;const ctx=getAudioContext();await ctx.resume();if(token!==request||!dialog.open)return;
   if(sound){fine=sound;repaint();source=ctx.createBufferSource();gain=ctx.createGain();source.buffer=sound.buffer;gain.gain.value=clip.muted?0:(clip.volume??1);source.connect(gain);gain.connect(ctx.destination);}
   // Await image playback readiness before starting the independent sound clock.
   await video.play();if(token!==request||!dialog.open){video.pause();return;}
   const now=ctx.currentTime;if(source)source.start(now+audioBegin-begin,sourceStart-sound.start,Math.min(sourceEnd-sourceStart,sound.buffer.duration-(sourceStart-sound.start)));
   playing=true;el('audio-align-play').textContent='⏸ Pause';status(clip.muted?'Clip muet : la préécoute respecte son réglage Mute.':'Préécoute de 10 s maximum · réglage appliqué seulement à la validation.');
   const tick=()=>{if(!playing)return;local=Math.min(end,Math.max(begin,video.currentTime-clip.startTime));cursor();if(local>=end-.015||video.ended){stop();return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
  }catch(e){if(token===request){stop();status('Préécoute : '+e.message);}}finally{el('audio-align-play').disabled=false;}
 }
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=canvas.getBoundingClientRect();if(e.clientY-r.top<100){seek((e.clientX-r.left)/pps);return;}stop();drag={id:e.pointerId,x:e.clientX,offset:draft,scroll:scroll.scrollLeft};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;value(AudioAlignmentMath.fromDrag(drag.offset,e.clientX-drag.x+scroll.scrollLeft-drag.scroll,pps,media.duration||media.element?.duration||duration));});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
 el('audio-align-zoom').oninput=e=>{zoom=Number(e.target.value);resize();};el('audio-align-pan').oninput=e=>{scroll.scrollLeft=Number(e.target.value)*(canvas.width-scroll.clientWidth);};
 el('audio-align-seek').oninput=e=>seek(Number(e.target.value));el('audio-align-offset').oninput=e=>{if(e.target.value.trim()!=='')value(Number(e.target.value)/1000);};
 for(const b of dialog.querySelectorAll('[data-audio-nudge]'))b.onclick=()=>value(draft+(b.dataset.audioNudge==='frame'?1/30:b.dataset.audioNudge==='-frame'?-1/30:Number(b.dataset.audioNudge)));
 el('audio-align-reset').onclick=()=>value(0);el('audio-align-play').onclick=play;
 el('audio-align-cancel').onclick=el('audio-align-close').onclick=()=>dialog.close();dialog.addEventListener('close',cleanup);
 el('audio-align-apply').onclick=()=>{const target=state.timeline.find(c=>c.id===clip?.id);if(target!==clip)return status('Le clip a changé. Rouvrez cette fenêtre.');stop();if((target.audioOffset||0)!==draft){target.audioOffset=draft;commitMontage();}dialog.close();};
 window.addEventListener('resize',()=>{if(dialog.open)resize();});
 window.openAudioAlignment=async()=>{
  const c=state.timeline.find(c=>c.id===state.activeClipId),m=c&&state.mediaFiles.find(m=>m.id===c.mediaId);
  if(!c||c.type!=='video'||!m||c.freezeAt!==undefined)return showToast('Sélectionnez un clip vidéo avec du son.');
  pausePlayback();cleanup();clip=c;media=m;duration=c.endTime-c.startTime;if(duration<=0)return;local=0;zoom=1;el('audio-align-zoom').value=1;el('audio-align-pan').value=0;el('audio-align-seek').max=duration;el('audio-align-offset').min=-Math.round((m.duration||m.element?.duration||duration)*1000);el('audio-align-offset').max=Math.round((m.duration||m.element?.duration||duration)*1000);el('audio-align-name').textContent=c.label||m.file?.name||'Clip sélectionné';
  for(const url of m.thumbnails||[]){const image=new Image();image.onload=repaint;image.src=url;thumbImages.push(image);}
  video.src=m.url;dialog.showModal();value(c.audioOffset||0);resize();status('Le son avant et après la coupe est récupéré dans la vidéo source. Annuler conserve le réglage précédent.');
  const token=request;try{await waitForPreviewData(video);if(token===request&&dialog.open)await seekVideo(video,c.startTime);}catch(e){if(dialog.open)status(e.message);}
 };
 el('audio-offset-btn').onclick=()=>window.openAudioAlignment();
});
