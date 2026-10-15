'use strict';
let exportCancelled = false;
let mediaLibraryPromise;
function loadMediaLibrary() {
  if (!mediaLibraryPromise) mediaLibraryPromise = import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.4/dist/bundles/mediabunny.mjs').catch(e=>{mediaLibraryPromise=null;throw new Error('Impossible de charger le module MP4 depuis le CDN. '+e.message)});
  return mediaLibraryPromise;
}
function exportStatus(message) { document.getElementById('export-status').textContent=message; }
function checkExportCancelled() { if(exportCancelled) throw new Error('Export annulé.'); }
async function exportProject() {
  if(exporting || !state.timeline.length) return showToast('Ajoutez une vidéo.');
  if(!window.VideoEncoder || !window.VideoDecoder) return showToast('Export précis indisponible ici. Ouvrez la page HTTPS dans un navigateur récent compatible WebCodecs.');
  pausePlayback(); exporting=true; exportCancelled=false;
  btnExport.disabled=true; document.body.classList.add('exporting');
  const panel=document.getElementById('export-progress'); panel.hidden=false;
  document.getElementById('cancel-export').textContent='Annuler';
  document.getElementById('export-meter').value=0;
  const project=structuredClone(state.timeline).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  const exportGroups=structuredClone(state.groups);
  const duration=getTotalDuration(); const inputs=new Map(); let output,videoSource,audioSource;
  try {
    exportStatus('Préparation des fichiers source…');
    document.getElementById('precache-progress').hidden=true;
    for(const clip of project.filter(c=>c.aiBackgroundRemoval))await PocketCutMasks.ensure(clip,{cancelled:()=>exportCancelled,onProgress:({progress,name})=>exportStatus(`Précalcul du détourage ${Math.round(progress*100)} % · ${name}`)});
    const B=await loadMediaLibrary(); checkExportCancelled();
    for(const c of project.filter(c=>c.type==='video')) {
      if(inputs.has(c.mediaId)) continue;
      const m=state.mediaFiles.find(m=>m.id===c.mediaId);
      const input=new B.Input({source:new B.BlobSource(m.file),formats:B.ALL_FORMATS});
      const item={input}; inputs.set(c.mediaId,item);
      item.track=await input.getPrimaryVideoTrack();
      if(!item.track || !await item.track.canDecode()) throw new Error('Le navigateur ne peut pas décoder précisément '+m.file.name+'.');
      item.first=await item.track.getFirstTimestamp();
      item.sink=new B.CanvasSink(item.track,{poolSize:1});
      item.audioTrack=await input.getPrimaryAudioTrack();
    }
    const primary=project.find(c=>c.type==='video' && !c.aiBackgroundRemoval) || project.find(c=>c.type==='video');
    const ref=primary ? inputs.get(primary.mediaId) : null;
    let width=ref?await ref.track.getDisplayWidth():1080;
    let height=ref?await ref.track.getDisplayHeight():1920;
    const ratio=workspaceWidth()/workspaceHeight();
    if(state.projectWidth || document.getElementById('export-resolution').value==='1080') {
      const edge=document.getElementById('export-resolution').value==='1080'?1080:Math.min(width,height);
      width=ratio>=1?edge*ratio:edge;height=ratio>=1?edge:edge/ratio;
    }
    // AVC uses even dimensions. Never silently reduce an unsupported resolution.
    width=Math.ceil(width/2)*2; height=Math.ceil(height/2)*2;
    let fps=Number(document.getElementById('export-fps').value);
    if(!fps) {
      const metrics=ref?await ref.track.computeFrameRateMetrics():null;
      fps=metrics?.bestGuessFrameRate || 30;
      if(!Number.isFinite(fps) || fps<1) fps=30;
    }
    const bitrate=Math.round(Math.max(12000000,width*height*fps*0.24));
    const quality=new B.Quality({bitrate});
    if(!await B.canEncodeVideo('avc',{width,height,frameRate:fps,quality})) throw new Error(`H.264 ${width} × ${height} à ${fps.toFixed(2)} i/s non pris en charge sur cet appareil. Essayez 1080 × 1920 / 30 i/s.`);
    const audible=project.filter(c=>c.type==='video' && !c.muted && inputs.get(c.mediaId).audioTrack);
    for(const c of audible) {
      const m=state.mediaFiles.find(m=>m.id===c.mediaId);
      if(!m.audioBuffer) {
        // decodeAudioData does not understand every container. Decode the actual audio track.
        const track=inputs.get(c.mediaId).audioTrack;
        if(!await track.canDecode()) throw new Error('Audio non décodable : '+m.file.name);
        const sink=new B.AudioBufferSink(track); const buffers=[];
        let end=0; for await(const wrapped of sink.buffers()){buffers.push(wrapped);end=Math.max(end,wrapped.timestamp+wrapped.buffer.duration);}
        const rate=buffers[0]?.buffer.sampleRate || 48000;
        const merged=new AudioBuffer({length:Math.max(1,Math.ceil(end*rate)),sampleRate:rate,numberOfChannels:2});
        for(const {buffer,timestamp} of buffers) for(let ch=0;ch<2;ch++) merged.getChannelData(ch).set(buffer.getChannelData(Math.min(ch,buffer.numberOfChannels-1)),Math.max(0,Math.round(timestamp*rate)));
        m.audioBuffer=merged;
      }
    }
    if(audible.length && !await B.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000})) {
      exportStatus('Chargement de l’encodeur audio AAC…');
      const {registerAacEncoder}=await import('https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.61.4/dist/bundles/mediabunny-aac-encoder.mjs');
      registerAacEncoder();
    }
    const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    output=new B.Output({format:new B.Mp4OutputFormat({fastStart:'in-memory'}),target:new B.BufferTarget()});
    videoSource=new B.CanvasSource(canvas,{codec:'avc',quality,keyFrameInterval:2});
    output.addVideoTrack(videoSource,{frameRate:fps});
    if(audible.length){audioSource=new B.AudioSampleSource({codec:'aac',quality:new B.Quality({bitrate:192000})});output.addAudioTrack(audioSource);}
    await output.start();
    const frameCount=Math.ceil(duration*fps-1e-6); let audioCursor=0;
    const audioTotal=Math.round(duration*48000);
    for(let index=0;index<frameCount;index++) {
      checkExportCancelled();
      const time=index/fps, frameDuration=Math.min(1/fps,duration-time);
      await renderOfflineFrame(ctx,canvas,project,inputs,time,exportGroups);
      await videoSource.add(time,frameDuration,{keyFrame:index===0});
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
    const blob=new Blob([output.target.buffer],{type:'video/mp4'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`pocketcut-${width}x${height}.mp4`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    exportStatus(`MP4 prêt · ${width} × ${height} · ${frameCount} images`);showToast('Export MP4 terminé.');
  } catch(e) {
    if(output && !['finalized','canceled'].includes(output.state)) await output.cancel().catch(()=>{});
    exportStatus(e.message);showToast(e.message);
  } finally {
    for(const item of inputs.values()) item.input.dispose();
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
    const m=state.mediaFiles.find(m=>m.id===c.mediaId);let source=m.element;
    if(c.type==='video') {
      const item=inputs.get(c.mediaId);const sourceTime=c.startTime+time-c.timelineStart+item.first;
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
    const buffer=state.mediaFiles.find(m=>m.id===c.mediaId).audioBuffer;
    for(let ch=0;ch<2;ch++) {
      const data=buffer.getChannelData(Math.min(ch,buffer.numberOfChannels-1));
      for(let i=0;i<count;i++) {
        const time=(start+i)/48000;
        if(time<c.timelineStart || time>=c.timelineStart+c.endTime-c.startTime) continue;
        const pos=(c.startTime+time-c.timelineStart-(c.audioOffset||0))*buffer.sampleRate;
        const lo=Math.floor(pos),fraction=pos-lo;
        if(pos>=c.startTime*buffer.sampleRate&&pos<Math.min(buffer.length,c.endTime*buffer.sampleRate))result[ch*count+i]+=((data[lo]||0)*(1-fraction)+(data[lo+1]||0)*fraction)*(c.volume??1);
      }
    }
  }
  for(let i=0;i<result.length;i++) result[i]=Math.max(-1,Math.min(1,result[i]));
  return result;
}
