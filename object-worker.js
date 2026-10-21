// Loaded both as a script and a self-contained Blob worker for file://.
function runObjectRemoverWorker(){
 let session,ort,initialized,tail=Promise.resolve();
 const canvas=new OffscreenCanvas(320,320),ctx=canvas.getContext('2d',{willReadFrequently:true});
 self.onmessage=({data})=>{tail=tail.catch(()=>{}).then(async()=>{
  try{
   if(data.type==='init'){
    initialized=(async()=>{
     if(typeof refineMaskAlpha==='undefined')importScripts(data.refinerURL);
     const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
     ort=await import(base+'ort.wasm.min.mjs');ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
     const urls=[];if(data.assetBase?.startsWith('http'))urls.push(data.assetBase+'object/u2netp.onnx');
     urls.push('https://huggingface.co/skillsafe-ai/u2netp/resolve/33f0c8b5c2429bcf0cfd62bbf48669eeec80c2a2/u2netp.onnx');
     // Pinned local model is preferred; this second mirror supports direct file opening.
     let bytes,last;
     for(const url of urls){try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('Modèle HTTP '+r.status);bytes=await r.arrayBuffer();}finally{clearTimeout(timer);}const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!=='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8')throw Error('Modèle objet non conforme.');break;}catch(e){bytes=null;last=e;}}
     if(!bytes)throw last||Error('Modèle objet inaccessible.');
     session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    })();await initialized;self.postMessage({type:'ready'});return;
   }
   await initialized;const bitmap=data.bitmap;
   try{
    ctx.drawImage(bitmap,0,0,320,320);const pixels=ctx.getImageData(0,0,320,320).data,n=320*320,input=new Float32Array(n*3);
    let max=1;for(let i=0;i<n;i++)for(let c=0;c<3;c++)max=Math.max(max,pixels[i*4+c]);
    const mean=[.485,.456,.406],std=[.229,.224,.225];for(let i=0;i<n;i++)for(let c=0;c<3;c++)input[c*n+i]=(pixels[i*4+c]/max-mean[c])/std[c];
    const tensor=new ort.Tensor('float32',input,[1,3,320,320]);let outputs;
    try{outputs=await session.run({[session.inputNames[0]]:tensor});}finally{tensor.dispose();}
    const prediction=outputs[session.outputNames[0]].data;let lo=Infinity,hi=-Infinity;for(let i=0;i<n;i++){lo=Math.min(lo,prediction[i]);hi=Math.max(hi,prediction[i]);}
    const gray=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){const v=Math.round(255*Math.max(0,Math.min(1,(prediction[i]-lo)/Math.max(1e-6,hi-lo))));gray[i*4]=gray[i*4+1]=gray[i*4+2]=v;gray[i*4+3]=255;}
    for(const value of Object.values(outputs))value.dispose();
    const small=new OffscreenCanvas(320,320);small.getContext('2d').putImageData(new ImageData(gray,320,320),0,0);
    const out=new OffscreenCanvas(bitmap.width,bitmap.height),oc=out.getContext('2d',{willReadFrequently:true});oc.imageSmoothingQuality='high';oc.drawImage(small,0,0,out.width,out.height);
    const mask=oc.getImageData(0,0,out.width,out.height).data;
    if(data.refine){oc.drawImage(bitmap,0,0);const rgb=oc.getImageData(0,0,out.width,out.height).data;oc.putImageData(new ImageData(refineMaskAlpha(mask,rgb,out.width,out.height,Math.max(2,Math.round(Math.max(out.width,out.height)/160)),data.threshold,data.softness),out.width,out.height),0,0);}
    else{for(let i=0;i<out.width*out.height;i++){const t=Math.max(0,Math.min(1,(mask[i*4]/255-data.threshold+data.softness)/(2*Math.max(.01,data.softness))));mask[i*4]=mask[i*4+1]=mask[i*4+2]=255;mask[i*4+3]=Math.round(255*t*t*(3-2*t));}oc.putImageData(new ImageData(mask,out.width,out.height),0,0);}
    const blob=await out.convertToBlob({type:'image/png'});self.postMessage({type:'mask',id:data.id,blob});
   }finally{bitmap.close();}
  }catch(e){self.postMessage({type:'error',id:data.id,message:e.message||String(e)});}
 });};
}
if(typeof window!=='undefined')window.POCKETCUT_OBJECT_WORKER_SOURCE='('+runObjectRemoverWorker.toString()+')();';else runObjectRemoverWorker();
