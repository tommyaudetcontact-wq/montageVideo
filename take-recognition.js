'use strict';
const TakeRecognition=(()=>{
 let worker,serial=0,pending=null,idle,generation=0;
 function stop(){generation++;clearTimeout(idle);worker?.terminate();worker=null;if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(new DOMException('Analyse des reprises annulée.','AbortError'));}}
 function recognize(audio,progress){
  if(pending)return Promise.reject(Error('Une analyse de voix est déjà en cours.'));clearTimeout(idle);
  if(!worker){if(location.protocol==='file:'){const url=URL.createObjectURL(new Blob([window.POCKETCUT_TAKE_WORKER],{type:'text/javascript'}));try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}}else worker=new Worker('take-speech-worker.js?v=210');
   worker.onmessage=({data})=>{if(data.id!==pending?.id)return;if(data.type==='progress'){pending.progress?.(data.message);return;}const p=pending;pending=null;clearTimeout(p.timer);idle=setTimeout(stop,60000);data.type==='error'?p.reject(Error(data.message)):p.resolve(data.words);};
   worker.onerror=e=>{if(pending){pending.reject(Error(e.message||'Reconnaissance locale indisponible.'));clearTimeout(pending.timer);pending=null;}worker?.terminate();worker=null;};
  }
  return new Promise((resolve,reject)=>{const id=++serial;pending={id,resolve,reject,progress,timer:setTimeout(()=>{const p=pending;pending=null;worker?.terminate();worker=null;p?.reject(Error('La reconnaissance locale a pris trop de temps.'));},300000)};worker.postMessage({id,audio},[audio.buffer]);});
 }
 async function wordsFor(media,progress){
  clearTimeout(idle);const token=generation,check=()=>{if(token!==generation)throw new DOMException("Analyse annulée.","AbortError");};
  if(media.takeWordVersion===1&&Array.isArray(media.takeWords))return media.takeWords;
  if(!Number.isFinite(media.duration)||media.duration>600)throw Error('Analyse des reprises limitée aux prises de moins de 10 minutes.');
  const B=await loadMediaLibrary(),input=new B.Input({source:makeMediaBlobSource(B,await getStableMediaFile(media)),formats:B.ALL_FORMATS});
  try{
   const track=await input.getPrimaryAudioTrack();if(!track)return [];
   const first=await track.getFirstTimestamp(),audio=new Float32Array(Math.ceil(media.duration*16000));
   for await(const part of new B.AudioBufferSink(track).buffers()){
    check();const buffer=part.buffer,offset=Math.round((part.timestamp-first)*16000),length=Math.ceil(buffer.duration*16000),channels=Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch));
    for(let i=0;i<length;i++){const target=offset+i;if(target<0||target>=audio.length)continue;const at=i*buffer.sampleRate/16000,lo=Math.floor(at),f=at-lo;let value=0;for(const ch of channels)value+=(ch[lo]||0)*(1-f)+(ch[lo+1]||0)*f;audio[target]=value/channels.length;}
   }
   check();const words=await recognize(audio,progress);check();media.takeWords=words.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start);media.takeWordVersion=1;await saveMediaAnalysis(media).catch(()=>{});return media.takeWords;
  }finally{input.dispose();}
 }
 return {wordsFor,cancel:stop};
})();
window.TakeRecognition=TakeRecognition;
