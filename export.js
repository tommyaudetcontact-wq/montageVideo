'use strict';
let exportCancelled = false;
const exportAudioWindows=new Map();
let mediaLibraryPromise;
function loadMediaLibrary() {
  if (!mediaLibraryPromise) mediaLibraryPromise = import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.4/dist/bundles/mediabunny.mjs').catch(e=>{mediaLibraryPromise=null;throw new Error('Impossible de charger le module MP4 depuis le CDN. '+e.message)});
  return mediaLibraryPromise;
}
function exportStatus(message) { document.getElementById('export-status').textContent=message; }
function checkExportCancelled() { if(exportCancelled) throw new Error('Export annulé.'); }
function resolveExportSettings({sourceWidth,sourceHeight,ratio,resolution,mode='mobile',fps=30}) {
  const mobile=mode!=='standard',sourceEdge=Math.min(sourceWidth,sourceHeight);
  const edge=resolution==='720'?720:resolution==='1080'?1080:mobile?Math.min(sourceEdge,1080):sourceEdge;
  const width=Math.ceil((ratio>=1?edge*ratio:edge)/2)*2,height=Math.ceil((ratio>=1?edge:edge/ratio)/2)*2;
  fps=mobile?30:fps;
  const bitrate=mobile?(width*height<=720*1280?7000000:10000000):Math.round(Math.max(12000000,width*height*fps*.24));
  const macroblocks=Math.ceil(width/16)*Math.ceil(height/16),level=macroblocks<=3600?31:macroblocks<=8192?40:macroblocks<=8704?42:macroblocks<=22080?50:52;
  const encoder=mobile?{fullCodecString:'avc1.42e0'+level.toString(16),latencyMode:'realtime',bitrateMode:'constant'}:{};
  return {mobile,width,height,fps,bitrate,encoder,keyframeFrames:mobile?10:Math.max(1,Math.round(fps/3))};
}
function refreshExportOptions(restoring=false) {
  const mode=document.getElementById('export-mode'),fps=document.getElementById('export-fps');if(!mode||!fps)return;
  const mobile=mode.value!=='standard';
  if(mobile&&(!fps.disabled||restoring===true)){fps.dataset.standardValue=fps.value;fps.value='30';}
  if(!mobile&&fps.disabled&&restoring!==true)fps.value=fps.dataset.standardValue||'0';
  fps.disabled=mobile;
  document.querySelector('#export-resolution option[value="source"]').textContent=mobile?'Source · maximum 1080p':'Originale (source)';
  document.getElementById('export-mode-hint').textContent=mobile?'MP4 pour retouches mobile : 30 i/s fixes, H.264 Baseline, images clés tous les 10 frames. En définition source, la sortie est limitée à 1080p.':'MP4 standard : définition et cadence au choix, audio AAC.';
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{document.getElementById('export-mode')?.addEventListener('change',refreshExportOptions);refreshExportOptions();});
async function createExportDestination(B,duration,bitrate){
 // Browsers can expose getDirectory() on file:// while rejecting every call.
 // Keep the file-page export entirely in memory; HTTPS still streams to disk.
 let directory,file,key,writer;
 if(location.protocol!=='file:'&&navigator.storage?.getDirectory){
  try{
   directory=await mediaStorageDirectory();key='export-'+crypto.randomUUID()+'.mp4';
   file=await directory.getFileHandle(key,{create:true});writer=await file.createWritable();
   return {target:new B.StreamTarget(writer,{chunked:true,chunkSize:1024*1024}),directory,file,key,writer};
  }catch(e){
   if(writer)await writer.abort().catch(()=>{});
   if(directory&&key)await directory.removeEntry(key).catch(()=>{});
   if(!['SecurityError','NotAllowedError','NotSupportedError'].includes(e.name))throw e;
  }
 }
 if(/Android|iPhone|iPad/i.test(navigator.userAgent)&&duration*bitrate/8>192*1024*1024)throw Error('Espace de travail privé indisponible : cet export est trop long pour la mémoire du téléphone. Ouvrez la version HTTPS dans Chrome récent.');
 return {target:new B.BufferTarget()};
}
async function exportProject() {
  if(exporting || !state.timeline.length) return showToast('Ajoutez une vidéo.');
  if(!window.VideoEncoder || !window.VideoDecoder) return showToast('Export précis indisponible ici. Ouvrez la page HTTPS dans un navigateur récent compatible WebCodecs.');
  pausePlayback(); exporting=true; exportCancelled=false;
  btnExport.disabled=true; document.body.classList.add('exporting');
  const panel=document.getElementById('export-progress'); panel.hidden=false;
  document.getElementById('cancel-export').textContent='Annuler';
  document.getElementById('export-meter').value=0;
  const project=structuredClone(window.SceneEngine?SceneEngine.expand(state.timeline):state.timeline).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  const exportGroups=structuredClone(state.groups);
  const duration=getTotalDuration(); const inputs=new Map(); let output,videoSource,audioSource,exportFile,exportDirectory,exportFileKey,exportWriter,delivered=false;
  try {
    exportStatus('Sauvegarde et vérification des fichiers source…');
    if(pendingMediaImports.size)throw Error('Attendez la fin de l’importation avant d’exporter.');
    if(!await PocketCutSession.flush())throw lastSaveProblem||Error('La copie locale n’est pas prête.');
    document.getElementById('precache-progress').hidden=true;
    const B=await loadMediaLibrary(); checkExportCancelled();
    for(const c of project.filter(c=>c.type==='video')) {
      if(inputs.has(c.mediaId)) continue;
      const m=state.mediaFiles.find(m=>m.id===c.mediaId);
      exportStatus('Lecture locale · '+m.file.name);
      const stableFile=await getStableMediaFile(m);
      const input=new B.Input({source:makeMediaBlobSource(B,stableFile),formats:B.ALL_FORMATS});
      const item={input}; inputs.set(c.mediaId,item);
      item.track=await input.getPrimaryVideoTrack();
      if(!item.track || !await item.track.canDecode()) throw new Error('Le navigateur ne peut pas décoder précisément '+m.file.name+'.');
      item.first=await item.track.getFirstTimestamp();
      item.sink=new B.CanvasSink(item.track,{poolSize:1});
      item.audioTrack=await input.getPrimaryAudioTrack();
    }
    const primary=project.find(c=>c.type==='video' && !c.aiBackgroundRemoval) || project.find(c=>c.type==='video');
    const ref=primary ? inputs.get(primary.mediaId) : null;
    const sourceWidth=ref?await ref.track.getDisplayWidth():workspaceWidth(),sourceHeight=ref?await ref.track.getDisplayHeight():workspaceHeight();
    const mode=document.getElementById('export-mode')?.value||'mobile';
    let fps=mode==='mobile'?30:Number(document.getElementById('export-fps').value);
    if(!fps) {
      const metrics=ref?await ref.track.computeFrameRateMetrics():null;
      fps=metrics?.bestGuessFrameRate || 30;
      if(!Number.isFinite(fps) || fps<1) fps=30;
    }
    const settings=resolveExportSettings({sourceWidth,sourceHeight,ratio:workspaceWidth()/workspaceHeight(),resolution:document.getElementById('export-resolution').value,mode,fps});
    const {width,height,bitrate}=settings;fps=settings.fps;
    const quality=new B.Quality({bitrate});
    if(!await B.canEncodeVideo('avc',{width,height,frameRate:fps,quality,...settings.encoder})) throw new Error(settings.mobile?`Export retouches mobile H.264 Baseline ${width} × ${height} indisponible sur ce navigateur. Essayez 720p ou choisissez le mode Standard.`:`H.264 ${width} × ${height} à ${fps.toFixed(2)} i/s non pris en charge sur cet appareil. Essayez 720p / 30 i/s.`);
    const audible=project.filter(c=>c.type==='video' && !c.muted && inputs.get(c.mediaId).audioTrack);
    if(audible.length && !await B.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000})) {
      exportStatus('Chargement de l’encodeur audio AAC…');
      const {registerAacEncoder}=await import('https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.61.4/dist/bundles/mediabunny-aac-encoder.mjs');
      registerAacEncoder();
    }
    const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    exportStatus('Préparation du fichier MP4…');
    const destination=await createExportDestination(B,duration,bitrate);
    const target=destination.target;exportDirectory=destination.directory;exportFile=destination.file;exportFileKey=destination.key;exportWriter=destination.writer;
    output=new B.Output({format:new B.Mp4OutputFormat({fastStart:'reserve'}),target});
    videoSource=new B.CanvasSource(canvas,{codec:'avc',quality,...settings.encoder,keyFrameInterval:settings.keyframeFrames/fps});
    output.addVideoTrack(videoSource,{frameRate:fps,maximumPacketCount:Math.ceil(duration*fps)+2});
    if(audible.length){audioSource=new B.AudioSampleSource({codec:'aac',quality:new B.Quality({bitrate:192000})});output.addAudioTrack(audioSource,{maximumPacketCount:Math.ceil(duration*48000/960)+10});}
    await output.start();
    const frameCount=Math.ceil(duration*fps-1e-6); let audioCursor=0;
    const audioTotal=Math.round((settings.mobile?frameCount/fps:duration)*48000);
    for(let index=0;index<frameCount;index++) {
      checkExportCancelled();
      const time=index/fps, frameDuration=settings.mobile?1/fps:Math.min(1/fps,duration-time);
      await renderOfflineFrame(ctx,canvas,project,inputs,time,exportGroups);
      await videoSource.add(time,frameDuration,{keyFrame:index%settings.keyframeFrames===0});
      if(audioSource)await prepareExportAudioWindow(audible,time,frameDuration,inputs,B);
      // Audio follows the same project clock; speed of computation is irrelevant.
      if(audioSource) {
        const until=Math.min(audioTotal,Math.round((time+frameDuration)*48000));
        while(audioCursor<until) {
          const count=Math.min(4096,until-audioCursor);
          const sample=new B.AudioSample({format:'f32-planar',data:mixAudioBlock(audible,audioCursor,count),sampleRate:48000,numberOfChannels:2,timestamp:audioCursor/48000});
          try {await audioSource.add(sample);} finally {sample.close();}
          audioCursor+=count;
        }
      }
      exportStatus(`${width} × ${height} · ${fps.toFixed(2)} i/s · image ${index+1}/${frameCount}`);
      btnExport.textContent=`${Math.floor((index+1)/frameCount*100)} %`;
      document.getElementById('export-meter').value=(index+1)/frameCount;
      // Only expose the finished composition to the preview.
      canvasCtx.clearRect(0,0,mainCanvas.width,mainCanvas.height);canvasCtx.drawImage(canvas,0,0,mainCanvas.width,mainCanvas.height);
      if(index%4===0) await new Promise(r=>setTimeout(r,0));
    }
    videoSource.close();audioSource?.close(); exportStatus('Finalisation du MP4…');
    await output.finalize(); checkExportCancelled();
    exportWriter=null;
    const blob=new Blob([exportFile?await exportFile.getFile():output.target.buffer],{type:'video/mp4'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`pocketcut-${settings.mobile?'retouches-':''}${width}x${height}.mp4`;a.click();
    delivered=true;setTimeout(()=>{URL.revokeObjectURL(url);if(exportDirectory&&exportFileKey)exportDirectory.removeEntry(exportFileKey).catch(()=>{});},60000);
    exportStatus(`MP4 ${settings.mobile?'retouches mobile ':''}prêt · ${width} × ${height} · ${fps.toFixed(2)} i/s · ${frameCount} images`);showToast('Export MP4 terminé.');
  } catch(e) {
    if(output && !['finalized','canceled'].includes(output.state)) await output.cancel().catch(()=>{});
    const message=e.name==='SecurityError'||e.name==='NotReadableError'?'Accès à un fichier interrompu ('+e.name+'). Réessayez après la sauvegarde locale. '+e.message:e.message;exportStatus(message);showToast(message);console.error('Export PocketCut',e);
  } finally {
    if(exportWriter)await exportWriter.abort().catch(()=>{});if(!delivered&&exportDirectory&&exportFileKey)await exportDirectory.removeEntry(exportFileKey).catch(()=>{});
    for(const item of inputs.values()) item.input.dispose();
    exportAudioWindows.clear();
    for(const media of state.mediaFiles){media.audioBuffer=null;delete media.audioBufferStart;}
    exporting=false;btnExport.disabled=false;btnExport.textContent='Exporter';document.body.classList.remove('exporting');renderCanvasFrame();
    document.getElementById('cancel-export').textContent='Fermer';
  }
}
async function renderOfflineFrame(ctx,canvas,project,inputs,time,groups={}) {
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/workspaceWidth(),canvas.height/workspaceHeight());
  ctx.setTransform(scale,0,0,scale,(canvas.width-workspaceWidth()*scale)/2,(canvas.height-workspaceHeight()*scale)/2);
  const frames=new Map();
  for(const c of project) {
    if(time<c.timelineStart || time>=c.timelineStart+c.endTime-c.startTime) continue;
    if(c.hideVisual)continue;
    const m=state.mediaFiles.find(m=>m.id===c.mediaId);let source=m.element;
    if(c.type==='video') {
      const item=inputs.get(c.mediaId);const sourceTime=(window.SceneEngine?SceneEngine.sourceTime(c,time):c.startTime+time-c.timelineStart)+item.first;
      const key=c.mediaId+':'+sourceTime.toFixed(9);
      if(!frames.has(key)) {
        const wrapped=await item.sink.getCanvas(sourceTime);
        if(!wrapped) throw new Error(`Image source absente à ${sourceTime.toFixed(3)} s (${m.file.name}).`);
        // Each layer draws immediately before the pool is reused.
        frames.set(key,wrapped.canvas);
      }
      source=frames.get(key);
      // Another time from the same media can reuse its canvas pool, so consume before the next layer.
      const prepared=c.aiBackgroundRemoval?await greenScreenProcessor.prepareFrame(source,c,{fullResolution:true,time:sourceTime}):null;
      greenScreenProcessor.drawClipToCanvas(ctx,source,c,!!c.aiBackgroundRemoval,prepared,{time,groups,timeline:project,export:true});
      frames.delete(key);
    } else greenScreenProcessor.drawClipToCanvas(ctx,source,c,false,null,{time,groups,timeline:project,export:true});
  }
  ctx.setTransform(1,0,0,1,0,0);
}
function mixAudioBlock(clips,start,count) {
  const result=new Float32Array(count*2);
  for(const c of clips) {
    const windowed=exportAudioWindows.get(c.id),buffer=windowed?.buffer||state.mediaFiles.find(m=>m.id===c.mediaId).audioBuffer;if(!buffer)continue;
    for(let ch=0;ch<2;ch++) {
      const data=buffer.getChannelData(Math.min(ch,buffer.numberOfChannels-1));
      for(let i=0;i<count;i++) {
        const time=(start+i)/48000;
        if(time<c.timelineStart || time>=c.timelineStart+c.endTime-c.startTime) continue;
        const sourceTime=c.startTime+time-c.timelineStart-(c.audioOffset||0);
        const pos=(sourceTime-(windowed?.start||state.mediaFiles.find(m=>m.id===c.mediaId).audioBufferStart||0))*buffer.sampleRate;
        const lo=Math.floor(pos),fraction=pos-lo;
        if(sourceTime>=c.startTime&&sourceTime<c.endTime&&pos>=0&&pos<buffer.length)result[ch*count+i]+=((data[lo]||0)*(1-fraction)+(data[lo+1]||0)*fraction)*(c.volume??1);
      }
    }
  }
  for(let i=0;i<result.length;i++) result[i]=Math.max(-1,Math.min(1,result[i]));
  return result;
}

async function prepareExportAudioWindow(clips,time,frameDuration,inputs,B){
 const needed=new Map();
 for(const c of clips){if(time+frameDuration<c.timelineStart||time>=c.timelineStart+c.endTime-c.startTime)continue;const source=c.startTime+Math.max(time,c.timelineStart)-c.timelineStart-(c.audioOffset||0);if(source<c.startTime||source>=c.endTime)continue;const range=needed.get(c.id)||{mediaId:c.mediaId,start:source,end:source+frameDuration};range.start=Math.min(range.start,source);range.end=Math.max(range.end,source+frameDuration);needed.set(c.id,range);}
 for(const id of exportAudioWindows.keys())if(!needed.has(id))exportAudioWindows.delete(id);
 for(const [id,range] of needed){const media=state.mediaFiles.find(m=>m.id===range.mediaId),windowed=exportAudioWindows.get(id),offset=windowed?.start||0;if(windowed&&offset<=range.start&&offset+windowed.buffer.duration>=range.end)continue;
   const item=inputs.get(range.mediaId),track=item.audioTrack;if(!await track.canDecode())throw Error('Audio non décodable : '+media.file.name);const first=await track.getFirstTimestamp(),start=Math.max(0,range.start-.05),end=Math.min(media.duration,Math.max(range.end,start+2));const parts=[];let rate=48000;
   for await(const part of new B.AudioBufferSink(track).buffers(start+first,end+first)){parts.push(part);rate=part.buffer.sampleRate;}
   const buffer=new AudioBuffer({length:Math.max(1,Math.ceil((end-start)*rate)),sampleRate:rate,numberOfChannels:2});
   for(const part of parts){const at=Math.round((part.timestamp-first-start)*rate),skip=Math.max(0,-at),target=Math.max(0,at),count=Math.min(part.buffer.length-skip,buffer.length-target);if(count<=0)continue;for(let ch=0;ch<2;ch++)buffer.getChannelData(ch).set(part.buffer.getChannelData(Math.min(ch,part.buffer.numberOfChannels-1)).subarray(skip,skip+count),target);}
   exportAudioWindows.set(id,{buffer,start});
 }
}
