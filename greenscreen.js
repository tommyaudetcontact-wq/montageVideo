class GreenScreenProcessor {
  constructor() {
    this.isReady = false;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.frames = new Map();
    this.previewSurfaces = new Map();
    this.queue = Promise.resolve();
    this.pending = new Set();
    this.failure = null;
    this.ready = this.init();
    this.ready.catch(e => { this.failure = e; this.status('IA indisponible : '+e.message); });
  }
  status(message) {
    const el=document.getElementById('ai-status'); if(el && el.textContent!==message) el.textContent=message;
  }
  async init() {
    if (location.protocol === 'file:') {
      if (!window.POCKETCUT_WORKER_SOURCE) throw new Error('Fichier segment-worker.js manquant. Extrayez tout le ZIP.');
      const workerURL = URL.createObjectURL(new Blob([(window.POCKETCUT_MASK_SOURCE || '')+window.POCKETCUT_WORKER_SOURCE], {type:'text/javascript'}));
      try { this.worker = new Worker(workerURL); }
      finally { URL.revokeObjectURL(workerURL); }
    } else {
      this.worker=new Worker('segment-worker.js?v=14');
    }
    this.jobs=new Map(); this.serial=0;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Chargement IA trop long. Rechargez la page.')),60000);
      this.worker.onerror=()=>{clearTimeout(timer); const message=location.protocol==='file:' ? 'Ouverture directe bloquée par ce navigateur : ouvrez la version GitHub Pages en HTTPS. Internet est nécessaire pour les CDN.' : 'Impossible de charger le moteur IA. Vérifiez la connexion aux CDN.'; this.failure=new Error(message); this.isReady=false; this.status(message); reject(this.failure); this.jobs.forEach(j=>j.reject(this.failure)); this.jobs.clear();};
      this.worker.onmessage=({data})=>{
        if(data.type==='ready') {clearTimeout(timer); resolve();}
        else if(data.type==='error') {const job=this.jobs.get(data.id); if(job){this.jobs.delete(data.id); job.reject(new Error(data.message));} else {clearTimeout(timer); reject(new Error(data.message));}}
        else {const job=this.jobs.get(data.id); if(job){this.jobs.delete(data.id); job.resolve(data);}}
      };
      this.worker.postMessage({type:'init',refinerURL:new URL('mask-refine.js?v=6',location.href).href});
    });
    this.isReady=true; this.status('IA prête · traitement sur cet appareil');
  }
  prepareFrame(video, clip, options = {}) {
    const task=this.queue.catch(()=>{}).then(async()=>{
      await this.ready;
      if(video.readyState !== undefined && video.readyState<2) throw new Error('Image vidéo indisponible.');
      const time=options.time ?? video.currentTime;
      const cached=!options.maskOnly && window.PocketCutMasks ? await PocketCutMasks.get(clip.mediaId,time,!!options.fullResolution) : null;
      const source=document.createElement('canvas');
      const width=video.videoWidth || video.width, height=video.videoHeight || video.height;
      const quality=document.getElementById('ai-quality')?.value || 'balanced';
      const maxAnalysis=options.fullResolution ? (quality==='fine'?1280:quality==='fast'?512:960) : (quality==='fine'?720:quality==='fast'?256:480);
      const scale=options.maskOnly ? Math.min(1,maxAnalysis/Math.max(width,height)) : options.fullResolution ? 1 : Math.min(1,1280/Math.max(width,height));
      source.width=Math.round(width*scale); source.height=Math.round(height*scale);
      source.getContext('2d').drawImage(video,0,0,source.width,source.height);
      let mask=cached?.mask;
      if(!mask) {
      const analysis=document.createElement('canvas');
      const factor=Math.min(1,maxAnalysis/Math.max(source.width,source.height));
      analysis.width=Math.round(source.width*factor); analysis.height=Math.round(source.height*factor);
      analysis.getContext('2d').drawImage(source,0,0,analysis.width,analysis.height);
      const bitmap=await createImageBitmap(analysis); const id=++this.serial;
      const result=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.jobs.delete(id);reject(new Error('Détourage trop lent : rechargez la page.'));},20000);
        this.jobs.set(id,{resolve:d=>{clearTimeout(timer);resolve(d)},reject:e=>{clearTimeout(timer);reject(e)}});
        this.worker.postMessage({type:'segment',id,bitmap,threshold:Number(document.getElementById('ai-threshold').value),softness:Number(document.getElementById('ai-softness').value),refine:document.getElementById('ai-quality')?.value!=='fast'},[bitmap]);
      });
      mask=document.createElement('canvas'); mask.width=result.width; mask.height=result.height;
      mask.getContext('2d').putImageData(new ImageData(result.rgba,result.width,result.height),0,0);
      }
      if(options.maskOnly)return mask;
      const output=document.createElement('canvas'); output.width=source.width; output.height=source.height;
      const oc=output.getContext('2d'); oc.imageSmoothingEnabled=true;oc.imageSmoothingQuality='high';oc.drawImage(mask,0,0,output.width,output.height);
      oc.globalCompositeOperation='source-in'; oc.drawImage(source,0,0);
      if(!options.fullResolution) {
        const safeMask=document.createElement('canvas');safeMask.width=mask.width;safeMask.height=mask.height;safeMask.getContext('2d').drawImage(mask,0,0);
        this.frames.set(clip.id,{canvas:output,mask:safeMask,time});
      }
      this.status(cached?'Détourage précalculé · lecture depuis le cache':'Détourage actif · personne');
      return output;
    });
    this.queue=task; return task;
  }
  processFrameFast(video, clip) {
    if(video.readyState<2) return null;
    const cached=window.PocketCutMasks?.preview(clip.mediaId,video.currentTime);
    if(cached && this.frames.get(clip.id)?.time!==cached.time) {
      const old=this.frames.get(clip.id),mask=old?.mask instanceof HTMLCanvasElement?old.mask:document.createElement('canvas');
      if(mask.width!==cached.mask.width||mask.height!==cached.mask.height){mask.width=cached.mask.width;mask.height=cached.mask.height;}
      const ctx=mask.getContext('2d');ctx.clearRect(0,0,mask.width,mask.height);ctx.drawImage(cached.mask,0,0);this.frames.set(clip.id,{mask,time:cached.time});
    }
    const frame=this.frames.get(clip.id);
    if(!window.PocketCutMasks && !video.seeking && !this.pending.has(clip.id) && !this.failure && (!frame || Math.abs(frame.time-video.currentTime)>0.025)) {
      this.pending.add(clip.id);
      this.prepareFrame(video,clip).then(()=>{
        if(!state.isPlaying && typeof renderCanvasFrame==='function') requestAnimationFrame(renderCanvasFrame);
      }).catch(e=>{ this.failure=e; this.status(e.message); }).finally(()=>this.pending.delete(clip.id));
    }
    if(!frame || (!state.isPlaying && Math.abs(frame.time-video.currentTime)>=0.25)) return null;
    // The mask is inferred asynchronously; video pixels advance on every render.
    // Never freeze the foreground at the inference cadence.
    let surface=this.previewSurfaces.get(clip.id);
    if(!surface){const canvas=document.createElement('canvas');surface={canvas,ctx:canvas.getContext('2d')};this.previewSurfaces.set(clip.id,surface);}
    const factor=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
    const width=Math.round(video.videoWidth*factor),height=Math.round(video.videoHeight*factor);
    if(surface.canvas.width!==width||surface.canvas.height!==height){surface.canvas.width=width;surface.canvas.height=height;}
    const ctx=surface.ctx;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,width,height);
    ctx.drawImage(video,0,0,width,height);ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(frame.mask,0,0,width,height);ctx.globalCompositeOperation='source-over';
    return surface.canvas;
  }

  drawClipToCanvas(ctx, sourceElement, clip, isAiProcessed = false, preparedSource = null, renderOptions = {}) {
    const time=renderOptions.time ?? state.currentTime;
    const editing=!renderOptions.export && !state.isPlaying && state.editPoseClipId===clip.id;
    if(!editing) clip=animatedClip(clip,time,renderOptions.groups || state.groups,renderOptions.timeline || state.timeline);
    if(clip.opacity===0) {if(isAiProcessed&&!renderOptions.export&&!preparedSource)this.processFrameFast(sourceElement,clip);return;}
    const posX = clip.x || 0;
    const posY = clip.y || 0;
    const width = clip.width || 720;
    const height = clip.height || 1280;
    const rotation = clip.rotation || 0;

    ctx.save();
    ctx.globalAlpha*=clip.opacity ?? 1;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';

    ctx.translate(posX + width / 2, posY + height / 2);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    const drawX = -width / 2;
    const drawY = -height / 2;

    const crop=clip.crop || {};
    const left=(crop.left||0)/100*width, top=(crop.top||0)/100*height;
    const cw=Math.max(0,width-left-(crop.right||0)/100*width);
    const ch=Math.max(0,height-top-(crop.bottom||0)/100*height);
    ctx.beginPath(); ctx.rect(drawX+left,drawY+top,cw,ch); ctx.clip();
    if (isAiProcessed) {
      const processed = preparedSource || this.processFrameFast(sourceElement, clip);
      if (processed) {
        ctx.drawImage(processed, drawX, drawY, width, height);
      } else if (sourceElement.readyState >= 2) {
        // Preserve the layer while loading or after a failure; never hide it.
        ctx.drawImage(sourceElement, drawX, drawY, width, height);
      }
    } else {
      ctx.drawImage(sourceElement, drawX, drawY, width, height);
    }

    ctx.restore();
  }

  attachCanvasInteractions(canvas, getClip, render) {
    canvas.style.touchAction='none';
    const pointers=new Map(); let initial=null,changed=false,gestureSelection=null;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    const reset=()=>{
      const c=getClip(),ps=[...pointers.values()];
      if(!c||!ps.length){initial=null;return;}
      initial={x:c.x||0,y:c.y||0,w:c.width,h:c.height,scale:c.scale||1,rotation:c.rotation||0,px:ps[0].x,py:ps[0].y};
      if(ps.length>1) Object.assign(initial,{d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),angle:Math.atan2(ps[1].y-ps[0].y,ps[1].x-ps[0].x),mx:(ps[0].x+ps[1].x)/2,my:(ps[0].y+ps[1].y)/2});
    };
    canvas.addEventListener('pointerdown',e=>{
      if(exporting)return;pausePlayback();
      if(!pointers.size){changed=false;gestureSelection=getClip()?.id;window.selectLayerAtPoint?.(point(e));}
      let c=getClip();if(c)prepareLayerEdit(c);canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,point(e));
      if(pointers.size===2&&window.retainGestureLayer?.(gestureSelection,[...pointers.values()])){c=getClip();if(c)prepareLayerEdit(c);}
      reset();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId)||!initial)return;
      pointers.set(e.pointerId,point(e));const c=getClip();if(!c)return;const ps=[...pointers.values()];
      changed=true;
      if(ps.length===1){c.x=initial.x+ps[0].x-initial.px;c.y=initial.y+ps[0].y-initial.py;}
      else if(initial.d){
        const distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
        c.scale=Math.max(0.01,Math.min(10,initial.scale*distance/initial.d));const factor=c.scale/initial.scale;
        const angle=Math.atan2(ps[1].y-ps[0].y,ps[1].x-ps[0].x)-initial.angle;
        c.rotation=((initial.rotation+angle*180/Math.PI+180)%360+360)%360-180;
        c.width=c.baseWidth*c.scale;c.height=c.baseHeight*c.scale;
        const dx=initial.x+initial.w/2-initial.mx,dy=initial.y+initial.h/2-initial.my;
        c.x=(ps[0].x+ps[1].x)/2+(dx*Math.cos(angle)-dy*Math.sin(angle))*factor-c.width/2;
        c.y=(ps[0].y+ps[1].y)/2+(dx*Math.sin(angle)+dy*Math.cos(angle))*factor-c.height/2;
      }
      updateKeyframeFromEdit(c);this.updateSlidersUI(c);render();
    });
    const end=e=>{pointers.delete(e.pointerId);reset();if(!pointers.size){if(changed)pushState();renderTimeline();if(window.refreshAnimationPanel)refreshAnimationPanel();}};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }

  updateSlidersUI(clip) {
    if (!clip) return;
    clip=applyPose({...clip},manualPose(clip,state.currentTime));
    const sliderX = document.getElementById('slider-pip-x');
    const sliderY = document.getElementById('slider-pip-y');
    const sliderScale = document.getElementById('slider-pip-scale');
    const sliderRotation = document.getElementById('slider-pip-rotation');

    if (sliderX) {sliderX.min=Math.min(-720,Math.floor((clip.x||0)-720));sliderX.max=Math.max(1440,Math.ceil((clip.x||0)+720));sliderX.value=clip.x||0;}
    if (sliderY) {sliderY.min=Math.min(-1280,Math.floor((clip.y||0)-1280));sliderY.max=Math.max(2560,Math.ceil((clip.y||0)+1280));sliderY.value=clip.y||0;}
    if (sliderScale) sliderScale.value = clip.scale || 1.0;
    if (sliderRotation) sliderRotation.value = clip.rotation || 0;
    const top=document.getElementById('slider-crop-top'),bottom=document.getElementById('slider-crop-bottom');
    if(top)top.value=clip.crop?.top||0;if(bottom)bottom.value=clip.crop?.bottom||0;
  }

  bindSliders(getActiveClipFn, renderCallback) {
    const sliderX = document.getElementById('slider-pip-x');
    const sliderY = document.getElementById('slider-pip-y');
    const sliderScale = document.getElementById('slider-pip-scale');
    const sliderRotation = document.getElementById('slider-pip-rotation');
    const sliderCropTop = document.getElementById('slider-crop-top');
    const sliderCropBottom = document.getElementById('slider-crop-bottom');

    const onChange = () => {
      const clip = getActiveClipFn();
      if (!clip) return;

      pausePlayback();
      prepareLayerEdit(clip);
      if (sliderX) clip.x = parseFloat(sliderX.value);
      if (sliderY) clip.y = parseFloat(sliderY.value);
      if (sliderScale) {
        const previousWidth=clip.width,previousHeight=clip.height;
        clip.scale = parseFloat(sliderScale.value);
        clip.width = (clip.baseWidth || 720) * clip.scale;
        clip.height = (clip.baseHeight || 1280) * clip.scale;
        clip.x+=(previousWidth-clip.width)/2;clip.y+=(previousHeight-clip.height)/2;
      }
      if (sliderRotation) clip.rotation = parseFloat(sliderRotation.value);

      if (!clip.crop) clip.crop = { top: 0, bottom: 0, left: 0, right: 0 };
      if (sliderCropTop) clip.crop.top = parseFloat(sliderCropTop.value);
      if (sliderCropBottom) clip.crop.bottom = parseFloat(sliderCropBottom.value);

      updateKeyframeFromEdit(clip);
      this.updateSlidersUI(clip);
      renderCallback();
    };

    [sliderX, sliderY, sliderScale, sliderRotation, sliderCropTop, sliderCropBottom].forEach(el => {
      if (el) { el.addEventListener('input', onChange); el.addEventListener('change', () => { if(typeof pushState==='function'){pushState();renderTimeline();if(window.refreshAnimationPanel)refreshAnimationPanel();} }); }
    });
  }
}

window.GreenScreenProcessor = GreenScreenProcessor;
