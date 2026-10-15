// Also loaded as a script to supply a Blob Worker when index.html uses file://.
function runSegmentWorker() {
let segmenter;
let initialized;
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initialized=(async()=>{
        if(typeof refineMaskAlpha==='undefined') importScripts(data.refinerURL);
        const {FilesetResolver,ImageSegmenter}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
        const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
        segmenter=await ImageSegmenter.createFromOptions(files,{
          baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',delegate:'CPU'},
          runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false
        });
      })();
      await initialized; self.postMessage({type:'ready'}); return;
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

