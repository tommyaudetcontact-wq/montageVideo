'use strict';
let mediaVisualRunning=false,mediaVisualTimer,mediaVisualGeneration=0,mediaVisualRestart=false;
function scheduleMediaVisuals(){if(mediaVisualRunning)mediaVisualRestart=true;clearTimeout(mediaVisualTimer);mediaVisualTimer=setTimeout(()=>prepareMediaVisuals().catch(e=>console.warn('Aperçus médias :',e.message)),400);}
async function waitMediaVisualIdle(generation){if(generation!==mediaVisualGeneration)throw Error('Aperçus interrompus.');while(exporting||state.isPlaying||window.clipReorderActive||window.timelineDragged||pendingMediaImports.size||document.hidden){if(generation!==mediaVisualGeneration)throw Error('Aperçus interrompus.');await new Promise(r=>setTimeout(r,200));}}
async function prepareMediaVisuals(){
 if(mediaVisualRunning)return;mediaVisualRunning=true;const generation=mediaVisualGeneration;
 try{const media=state.mediaFiles.filter(m=>m.type==='video'),active=state.timeline.find(c=>c.id===state.activeClipId)?.mediaId;media.sort((a,b)=>(b.id===active)-(a.id===active));
 for(const m of media){if(!state.mediaFiles.includes(m))continue;await waitMediaVisualIdle(generation);
   if(!m.thumbnails?.length)try{const B=await loadMediaLibrary(),file=await getStableMediaFile(m),input=new B.Input({source:makeMediaBlobSource(B,file),formats:B.ALL_FORMATS});try{const track=await input.getPrimaryVideoTrack();if(track&&await track.canDecode()){const first=await track.getFirstTimestamp(),sink=new B.CanvasSink(track,{poolSize:1,width:120,height:68,fit:'cover'});m.thumbnails=[];for(const fraction of [.02,.5,.9]){await waitMediaVisualIdle(generation);const frame=await sink.getCanvas(first+Math.max(0,Math.min(m.duration-.001,m.duration*fraction)));if(frame)m.thumbnails.push(frame.canvas.toDataURL('image/jpeg',.65));}}}finally{input.dispose();}if(state.mediaFiles.includes(m)){renderTimeline();await saveMediaAnalysis(m);}}catch(e){console.warn('Vignettes : '+m.file.name,e.message);}
 }
 for(const m of media){if(!state.mediaFiles.includes(m))continue;await waitMediaVisualIdle(generation);if(!m.waveformPreview&&!m.audioAbsent)try{await analyzeMediaSpeech(m);if(state.mediaFiles.includes(m))renderTimeline();}catch(e){console.warn('Forme d’onde : '+m.file.name,e.message);}}
 }finally{mediaVisualRunning=false;if(mediaVisualRestart){mediaVisualRestart=false;scheduleMediaVisuals();}}
}
