// A lazy, single-threaded speech worker: only model files are downloaded; audio stays on-device.
function runTakeSpeechWorker(){
 let transcriber;
 self.onmessage=async({data})=>{
  try{
   if(!transcriber){
    self.postMessage({id:data.id,type:'progress',message:'Chargement de la reconnaissance locale des reprises…'});
    const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
    env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
    transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-base',{device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress')self.postMessage({id:data.id,type:'progress',message:'Modèle de voix · '+Math.round(p.progress||0)+' %'});}});
   }
   self.postMessage({id:data.id,type:'progress',message:'Recherche des phrases recommencées…'});
   const result=await transcriber(data.audio,{language:'french',task:'transcribe',return_timestamps:'word',chunk_length_s:25,stride_length_s:4});
   self.postMessage({id:data.id,type:'result',words:(result.chunks||[]).map(c=>({text:c.text,start:c.timestamp?.[0],end:c.timestamp?.[1]}))});
  }catch(e){self.postMessage({id:data.id,type:'error',message:e.message});}
 };
}
if(typeof window==='undefined')runTakeSpeechWorker();else window.POCKETCUT_TAKE_WORKER='('+runTakeSpeechWorker.toString()+')();';
