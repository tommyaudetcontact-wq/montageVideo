// Also loaded as a script to supply a Blob Worker when index.html uses file://.
function runSegmentWorker() {
let segmenter;
let initialized;
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initialized=(async()=>{
        if(typeof refineMaskAlpha==='undefined') importScripts(data.refinerURL);
        const remoteModel='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
        const sources=[];
        if(data.assetBase?.startsWith('http'))sources.push({name:'site',bundle:data.assetBase+'vision_bundle.mjs',wasm:data.assetBase+'wasm',model:data.assetBase+'selfie_segmenter.tflite'});
        for(const host of ['https://cdn.jsdelivr.net/npm/','https://unpkg.com/'])sources.push({name:'CDN',bundle:host+'@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs',wasm:host+'@mediapipe/tasks-vision@0.10.21/wasm',model:remoteModel});
        let last;
        for(const source of sources){
          try{
            self.postMessage({type:'progress',message:'Chargement IA · '+source.name});
            const {FilesetResolver,ImageSegmenter}=await import(source.bundle);
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let bytes;
            try{const response=await fetch(source.model,{signal:controller.signal});if(!response.ok)throw Error('Modèle HTTP '+response.status);bytes=new Uint8Array(await response.arrayBuffer());}finally{clearTimeout(timer);}
            const files=await FilesetResolver.forVisionTasks(source.wasm);
            segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
            self.aiSource=source.name;return;
          }catch(e){last=e;}
        }
        throw Error('Chargement IA impossible : '+(last?.message||'réseau')+'. Vérifiez le dossier assets/ai et la connexion.');
      })();
      await initialized; self.postMessage({type:'ready',source:self.aiSource}); return;
    }
    await initialized;
    const {bitmap,threshold,softness,id,refine}=data;
    try {
      segmenter.segment(bitmap,result=>{
        const mask=result.confidenceMasks[result.confidenceMasks.length>1?1:0];
        const values=mask.getAsFloat32Array();
        const raw=new Uint8ClampedArray(values.length*4);
        for(let i=0;i<values.length;i++) {
          raw[i*4]=raw[i*4+1]=raw[i*4+2]=Math.round(values[i]*255);raw[i*4+3]=255;
        }
        const small=new OffscreenCanvas(mask.width,mask.height);
        small.getContext('2d').putImageData(new ImageData(raw,mask.width,mask.height),0,0);
        const width=bitmap.width,height=bitmap.height;
        const large=new OffscreenCanvas(width,height),lc=large.getContext('2d',{willReadFrequently:true});
        lc.imageSmoothingEnabled=true;lc.imageSmoothingQuality='high';lc.drawImage(small,0,0,width,height);
        const maskPixels=lc.getImageData(0,0,width,height).data;
        lc.drawImage(bitmap,0,0);const rgb=lc.getImageData(0,0,width,height).data;
        let rgba;
        if(refine) rgba=refineMaskAlpha(maskPixels,rgb,width,height,Math.max(3,Math.round(Math.max(width,height)/160)),threshold,softness);
        else {rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++){const t=Math.max(0,Math.min(1,(maskPixels[i*4]/255-threshold+softness)/(2*softness)));rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=255;rgba[i*4+3]=Math.round(t*t*(3-2*t)*255);}}
        if(data.cachePng){
          lc.putImageData(new ImageData(rgba,width,height),0,0);
          lc.canvas.convertToBlob({type:'image/png'}).then(blob=>self.postMessage({type:'mask',id,width,height,blob})).catch(e=>self.postMessage({type:'error',id,message:e.message}));
        } else self.postMessage({type:'mask',id,width,height,rgba},[rgba.buffer]);
      });
    } finally { bitmap.close(); }
  } catch(e) { self.postMessage({type:'error',id:data.id,message:e.message}); }
};
}
if (typeof window === 'undefined') runSegmentWorker();
else window.POCKETCUT_WORKER_SOURCE = '(' + runSegmentWorker.toString() + ')();';

