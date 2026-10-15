const PIXELS_PER_SECOND = 40;
const pendingMediaImports=new Set();

let state = {
  mediaFiles: [], 
  timeline: [],
  groups: {},
  editPoseClipId: null,   
  activeClipId: null,
  currentTime: 0,
  isPlaying: false,
  isSnapping: true
};

let historyStack = [];
let historyIndex = -1;
let animFrameId = null;
let playbackTimestamp = null;
let exporting = false;
let isStartingPlayback=false;
let playbackRequest=0;

const greenScreenProcessor = new window.GreenScreenProcessor();

const mainCanvas = document.getElementById('main-canvas');
const canvasCtx = mainCanvas ? mainCanvas.getContext('2d') : null;

const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const playText = document.getElementById('play-text');
const videoInput = document.getElementById('video-input');
const imagePipInput = document.getElementById('image-pip-input');
const mediaList = document.getElementById('media-list');
const timelineScrollContainer = document.getElementById('timeline-scroll-container');
const timelineTrack = document.getElementById('timeline-track');
const timecodeDisplay = document.getElementById('timecode-display');
const snapToggleBtn = document.getElementById('snap-toggle-btn');

const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const btnSplit = document.getElementById('btn-split');
const btnAutoCutClip = document.getElementById('btn-autocut-clip');
const btnDelete = document.getElementById('btn-delete');
const btnDuplicatePipAi = document.getElementById('btn-duplicate-pip-ai');
const btnMute = document.getElementById('btn-mute');
const btnLayerUp = document.getElementById('btn-layer-up');
const btnLayerDown = document.getElementById('btn-layer-down');
const btnExport = document.getElementById('export-btn');

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

if (mainCanvas) {
  greenScreenProcessor.attachCanvasInteractions(
    mainCanvas,
    () => state.timeline.find(c => c.id === state.activeClipId),
    () => renderCanvasFrame()
  );

  greenScreenProcessor.bindSliders(
    () => state.timeline.find(c => c.id === state.activeClipId),
    () => renderCanvasFrame()
  );
}

function updateTimelinePaddings() {
  if (!timelineScrollContainer || !timelineTrack) return;
  const containerWidth = timelineScrollContainer.clientWidth;
  const halfWidth = containerWidth / 2;
  timelineTrack.style.paddingLeft = `${halfWidth}px`;
  timelineTrack.style.paddingRight = `${halfWidth}px`;
  const durationWidth=getTotalDuration()*PIXELS_PER_SECOND;
  timelineTrack.style.width=`${durationWidth+containerWidth}px`;
  timelineTrack.style.minWidth=`${durationWidth+containerWidth}px`;
  timelineTrack.querySelectorAll('.timeline-layer-row').forEach(row=>row.style.width=`${durationWidth}px`);
  const head=document.querySelector('.playhead-line');if(head)head.style.left=`${halfWidth}px`;
  timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;
}
window.addEventListener('resize', updateTimelinePaddings);

function recalculateTimelinePositions() {
  const zIndices = [...new Set(state.timeline.map(c => c.zIndex || 0))].sort((a, b) => a - b);

  zIndices.forEach(zIndex => {
    const layerClips = state.timeline
      .filter(c => (c.zIndex || 0) === zIndex)
      .sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));

    let accumulatedStart = 0;
    layerClips.forEach(clip => {
      if (zIndex !== 0) return;
      clip.timelineStart = accumulatedStart;
      const duration = clip.endTime - clip.startTime;
      accumulatedStart += duration;
    });
  });
}

function pushState() {
  if(typeof clipPlayers!=='undefined') clipPlayers.forEach((v,id)=>{
    if(!state.timeline.some(c=>c.id===id)){v.pause();v.removeAttribute('src');v.load();clipPlayers.delete(id);greenScreenProcessor.frames.delete(id);greenScreenProcessor.previewSurfaces.delete(id);}
  });
  if(typeof scheduleCutoutPreload==='function')scheduleCutoutPreload();
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(JSON.stringify({ timeline: state.timeline, groups: state.groups, activeClipId: state.activeClipId,projectWidth:state.projectWidth||720,projectHeight:state.projectHeight||1280 }));
  historyIndex++;
  updateUndoRedoUI();
  window.PocketCutSession?.schedule();
}

function updateUndoRedoUI() {
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    if (historyIndex > 0) {
      historyIndex--;
      restoreState(historyStack[historyIndex]);
    }
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      restoreState(historyStack[historyIndex]);
    }
  });
}

function restoreState(jsonString) {
  const saved = JSON.parse(jsonString);
  state.timeline = saved.timeline;
  state.groups = saved.groups || {};
  state.projectWidth=saved.projectWidth||720;state.projectHeight=saved.projectHeight||1280;
  mainCanvas.width=state.projectWidth;mainCanvas.height=state.projectHeight;
  document.querySelector('.player-wrapper').style.aspectRatio=`${state.projectWidth}/${state.projectHeight}`;
  const format=state.projectWidth===720?'9:16':state.projectWidth===1280?'1:1':state.projectWidth>1280?'16:9':'4:5';
  document.getElementById('workspace-btn').textContent='Format '+format;
  document.getElementById('workspace-format').value=format;
  state.editPoseClipId = null;
  state.activeClipId = saved.activeClipId;
  syncMediaStatus();
  renderMediaLibrary();
  
  const currentScroll = timelineScrollContainer ? timelineScrollContainer.scrollLeft : 0;
  renderTimeline();
  if (timelineScrollContainer) timelineScrollContainer.scrollLeft = currentScroll;
  updateUndoRedoUI();
  renderCanvasFrame();
  window.PocketCutSession?.schedule();
}

// RENDU OPTIMISÉ - SANS SACCADE AUDIO
function renderCanvasFrame() {
  if (exporting) return;
  if (!canvasCtx) return;
  canvasCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  const previewTime=Math.min(state.currentTime,Math.max(0,getTotalDuration()-0.000001));

  const activeClips = state.timeline
    .filter(clip => {
      const clipStart = clip.timelineStart || 0;
      const clipDur = clip.endTime - clip.startTime;
      return previewTime >= clipStart && previewTime < clipStart + clipDur;
    })
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Met en pause les éléments non affichés sur l'écran
  state.mediaFiles.forEach(m => {
    if (m.element && m.type === 'video') {
      const isCurrentlyActive = activeClips.some(c => c.mediaId === m.id);
      if (!isCurrentlyActive && !m.element.paused) {
        m.element.pause();
      }
    }
  });

  const usedPlayers=new Set(),syncedPlayers=new Set();
  activeClips.forEach(clip => {
    const media = state.mediaFiles.find(m => m.id === clip.mediaId);
    if (!media || !media.element) return;

    const clipStart = clip.timelineStart || 0;
    const progress = previewTime - clipStart;
    const targetTime = clip.startTime + progress;

    if (clip.type === 'image') {
      greenScreenProcessor.drawClipToCanvas(canvasCtx, media.element, clip, false);
    } else if (clip.type === 'video') {
      const owner=getPreviewOwner(clip,activeClips);
      const vid=getClipVideo(owner,media);usedPlayers.add(vid);
      if(!syncedPlayers.has(vid)) {
      syncedPlayers.add(vid);vid.muted=!!media.audioBuffer || !!owner.muted;

      // RECALAGE AUDIO/VIDÉO NON-DESTRUCTIF : On ajuste currentTime seulement lors d'un gros décalage ou en pause
      if ((!state.isPlaying && Math.abs(vid.currentTime - targetTime) > 0.015) || Math.abs(vid.currentTime - targetTime) > 0.4) {
        vid.currentTime = targetTime;
      }

      if (state.isPlaying && vid.paused) {
        vid.play().catch(() => {});
      }

      }
      greenScreenProcessor.drawClipToCanvas(canvasCtx, vid, clip, !!clip.aiBackgroundRemoval);
    }
  });
  clipPlayers.forEach(v=>{if(!usedPlayers.has(v))v.pause();});
  window.CropTools?.refresh();
}

// LECTURE SANS PERTE DE SYNCHRO
async function togglePlay() {
  if (state.isPlaying || isStartingPlayback) {
    pausePlayback();
  } else {
    await startPlayback();
  }
}

async function startPlayback(options={}) {
  if(!state.timeline.length || isStartingPlayback)return;
  getAudioContext();
  if(state.currentTime>=getTotalDuration())state.currentTime=0;
  const request=++playbackRequest;isStartingPlayback=true;
  state.editPoseClipId=null;state.previewStopTime=options.stopAt??null;state.previewRestartTime=options.restartAt??0;
  if(window.refreshAnimationPanel)refreshAnimationPanel();
  if(playText)playText.textContent='Préparation…';
  try {
    await prepareProjectAudio();if(request!==playbackRequest)return;
    const cutouts=state.timeline.filter(c=>c.aiBackgroundRemoval && (!options.stopAt || ((c.timelineStart||0)<options.stopAt && (c.timelineStart||0)+c.endTime-c.startTime>state.currentTime)));
    for(let i=0;i<cutouts.length;i++) {
      await PocketCutMasks.ensure(cutouts[i],{cancelled:()=>request!==playbackRequest,onProgress:({progress})=>{if(playText)playText.textContent=`Préparation ${i+1}/${cutouts.length} · ${Math.round(progress*100)} %`;}});
      if(request!==playbackRequest)return;
    }
    const active=state.timeline.filter(c=>state.currentTime>=(c.timelineStart||0)&&state.currentTime<(c.timelineStart||0)+c.endTime-c.startTime);
    const synced=new Set();
    for(const clip of active.filter(c=>c.type==='video')) {
      const media=state.mediaFiles.find(m=>m.id===clip.mediaId),owner=getPreviewOwner(clip,active),v=getClipVideo(owner,media);
      if(!synced.has(v)) {
        synced.add(v);v.pause();v.muted=!!media.audioBuffer || !!owner.muted;
        await waitForPreviewData(v);await seekVideo(v,clip.startTime+state.currentTime-(clip.timelineStart||0));
      }
      if(clip.aiBackgroundRemoval && !greenScreenProcessor.failure) {
        await PocketCutMasks.ensure(clip,{cancelled:()=>request!==playbackRequest,onProgress:({progress})=>{if(playText)playText.textContent=`Préparation ${Math.round(progress*100)} %`;}});
        await greenScreenProcessor.queue.catch(()=>{});
        const cached=greenScreenProcessor.frames.get(clip.id);
        if(!cached || Math.abs(cached.time-v.currentTime)>0.025)await greenScreenProcessor.prepareFrame(v,clip);
      }
      if(request!==playbackRequest)return;
    }
    if(request!==playbackRequest)return;
    state.isPlaying=true;playbackTimestamp=null;
    if(playIcon)playIcon.className='bi bi-pause-fill fs-6';if(playText)playText.textContent='Pause';
    // All readers begin together after the first mask is ready.
    await Promise.all([...synced].map(v=>v.play().catch(()=>{})));
    if(request!==playbackRequest)return;
    startProjectAudio(state.currentTime);playbackTimestamp=performance.now();
    if(animFrameId)cancelAnimationFrame(animFrameId);animFrameId=requestAnimationFrame(playbackLoop);
  } catch(e) {if(request===playbackRequest){pausePlayback();showToast(e.message);}}
  finally {if(request===playbackRequest)isStartingPlayback=false;}
}
function getPreviewOwner(clip,active) {
  if(!clip.aiBackgroundRemoval)return clip;
  const offset=clip.startTime-(clip.timelineStart||0);
  return active.find(c=>c.type==='video'&&!c.aiBackgroundRemoval&&c.mediaId===clip.mediaId&&Math.abs(c.startTime-(c.timelineStart||0)-offset)<0.0001)||clip;
}
function waitForPreviewData(v) {
  if(v.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const done=error=>{clearTimeout(timer);v.removeEventListener('loadeddata',ok);v.removeEventListener('error',fail);error?reject(error):resolve();};
    const ok=()=>done(),fail=()=>done(new Error('Vidéo indisponible.'));
    const timer=setTimeout(()=>done(new Error('Chargement vidéo trop long.')),15000);
    v.addEventListener('loadeddata',ok,{once:true});v.addEventListener('error',fail,{once:true});
  });
}

function pausePlayback() {
  if(typeof stopProjectAudio==='function')stopProjectAudio();
  playbackRequest++;isStartingPlayback=false;state.previewStopTime=null;state.previewRestartTime=0;
  state.isPlaying = false;
  if (playIcon) playIcon.className = "bi bi-play-fill fs-6";
  if (playText) playText.innerText = "Lire";

  state.mediaFiles.forEach(m => {
    if (m.element && m.type === 'video') {
      m.element.pause();
    }
  });

  clipPlayers.forEach(v => v.pause());
  if (animFrameId) cancelAnimationFrame(animFrameId);
}

if (playBtn) playBtn.addEventListener('click', togglePlay);

function playbackLoop(now) {
  if (!state.isPlaying) return;

  // Avancement fluide du temps
  state.currentTime += playbackTimestamp === null ? 0 : (now - playbackTimestamp) / 1000;
  playbackTimestamp = now;
  const total = state.previewStopTime ?? getTotalDuration();

  if (state.currentTime >= total) {
    pausePlayback();
    state.currentTime = total;
  }

  if (timelineScrollContainer) {
    timelineScrollContainer.scrollLeft = state.currentTime * PIXELS_PER_SECOND;
  }

  renderCanvasFrame();
  updateTimecode();
  if(state.isPlaying)animFrameId = requestAnimationFrame(playbackLoop);
}

if (timelineScrollContainer) {
  timelineScrollContainer.addEventListener('scroll', () => {
    if (state.isPlaying) return;
    state.currentTime = Math.min(getTotalDuration(),Math.max(0,timelineScrollContainer.scrollLeft / PIXELS_PER_SECOND));
    renderCanvasFrame();
    updateTimecode();
  });
}

// GESTION DU PIP
if (btnDuplicatePipAi) {
  btnDuplicatePipAi.addEventListener('click', () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip || activeClip.type !== 'video') return showToast("Sélectionnez un clip vidéo.");
    pausePlayback();

    const maxZ = Math.max(0, ...state.timeline.map(c => c.zIndex || 0));

    const newPip = {
      ...JSON.parse(JSON.stringify(activeClip)),
      id: 'clip_' + Math.random().toString(36).substr(2, 9),
      zIndex: maxZ + 1,
      muted: true, // Le double est mâté par défaut pour éviter l'écho
      aiBackgroundRemoval: true,
      ...fullHeightPose(activeClip.baseWidth,activeClip.baseHeight),
      keyframes: [], autoZoom: null, popUp: null, groupId: null,
      animationStart: null, animationDuration: null,
      crop: { top: 0, bottom: 0, left: 0, right: 0 }, cropRatio:'free'
    };

    state.timeline.push(newPip);
    state.activeClipId = newPip.id;

    pushState();
    renderTimeline();
    renderCanvasFrame();
    greenScreenProcessor.updateSlidersUI(newPip);
    showToast("PIP avec découpe IA ajouté !");
  });
}

if (btnMute) {
  btnMute.addEventListener('click', () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return showToast("Sélectionnez un clip.");
    activeClip.muted = !activeClip.muted;
    pushState();
    renderTimeline();
    renderCanvasFrame();
    showToast(activeClip.muted ? "Son coupé." : "Son activé.");
  });
}

// INVERSION RELATIVE DES CALQUES
if (btnLayerUp) {
  btnLayerUp.addEventListener('click', () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return;

    const currentZ = activeClip.zIndex || 0;
    const sortedZ = [...new Set(state.timeline.map(c => c.zIndex || 0))].sort((a, b) => a - b);
    const currentIndex = sortedZ.indexOf(currentZ);

    if (currentIndex < sortedZ.length - 1) {
      const targetZ = sortedZ[currentIndex + 1];
      state.timeline.forEach(c => {
        if ((c.zIndex || 0) === targetZ) c.zIndex = currentZ;
        else if (c.id === activeClip.id) c.zIndex = targetZ;
      });
      pushState();
      renderTimeline();
      renderCanvasFrame();
    }
  });
}

if (btnLayerDown) {
  btnLayerDown.addEventListener('click', () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return;

    const currentZ = activeClip.zIndex || 0;
    const sortedZ = [...new Set(state.timeline.map(c => c.zIndex || 0))].sort((a, b) => a - b);
    const currentIndex = sortedZ.indexOf(currentZ);

    if (currentIndex > 0) {
      const targetZ = sortedZ[currentIndex - 1];
      state.timeline.forEach(c => {
        if ((c.zIndex || 0) === targetZ) c.zIndex = currentZ;
        else if (c.id === activeClip.id) c.zIndex = targetZ;
      });
      pushState();
      renderTimeline();
      renderCanvasFrame();
    }
  });
}

function renderTimeline() {
  if (!timelineTrack) return;
  timelineTrack.innerHTML = '';
  updateTimelinePaddings();

  const zIndices = [...new Set(state.timeline.map(c => c.zIndex || 0))].sort((a, b) => a - b);
  if (zIndices.length === 0) zIndices.push(0);

  zIndices.forEach(zIndex => {
    const row = document.createElement('div');
    row.className = 'timeline-layer-row';

    const clipsInLayer = state.timeline.filter(c => (c.zIndex || 0) === zIndex);

    const shownGroups=new Set();
    clipsInLayer.forEach(clip => {
      const sequence=clip.groupId&&state.groups[clip.groupId]?.kind==='sequence';
      if(sequence&&shownGroups.has(clip.groupId))return;
      if(sequence)shownGroups.add(clip.groupId);
      const members=sequence?clipsInLayer.filter(c=>c.groupId===clip.groupId).sort((a,b)=>a.timelineStart-b.timelineStart):[clip];
      if(sequence)clip=members[0];
      const selected=members.some(c=>c.id===state.activeClipId);
      const span=sequence?groupRange(clip.groupId,state.timeline):null;
      const media = state.mediaFiles.find(m => m.id === clip.mediaId);
      const clipDuration = span?span.duration:clip.endTime - clip.startTime;
      const clipWidth = clipDuration * PIXELS_PER_SECOND;
      const leftPos = (clip.timelineStart || 0) * PIXELS_PER_SECOND;

      const wrapper = document.createElement('div');
      wrapper.className = 'clip-wrapper'+(selected?' selected':'');
      wrapper.dataset.clipId=clip.id;
      wrapper.style.width = `${clipWidth}px`;
      wrapper.style.left = `${leftPos}px`;

      const clipEl = document.createElement('div');
      clipEl.className = `timeline-clip ${selected ? 'active' : ''} ${clip.zIndex > 0 ? 'pip-mode' : ''}`;
      clipEl.dataset.id = clip.id;

      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'clip-thumbnails-container';
      if (media && media.thumbnails) {
        const thumbnails=members.flatMap(c=>state.mediaFiles.find(m=>m.id===c.mediaId)?.thumbnails||[]);
        thumbnails.forEach(src => {
          const img = document.createElement('img');
          img.src = src;
          img.className = 'clip-thumb';
          thumbContainer.appendChild(img);
        });
      }

      const canvasWave = document.createElement('canvas');
      canvasWave.className = 'clip-waveform';
      canvasWave.width = clipWidth;
      canvasWave.height = 20;
      if (media && (media.audioBuffer||media.waveformPreview)) {
        if(!sequence)drawWaveform(canvasWave, media.audioBuffer||media.waveformPreview, clip.startTime, clip.endTime);
        else for(const member of members){
          const m=state.mediaFiles.find(x=>x.id===member.mediaId);if(!m?.audioBuffer&&!m?.waveformPreview)continue;
          const part=document.createElement('canvas');part.width=Math.max(1,Math.round((member.endTime-member.startTime)*PIXELS_PER_SECOND));part.height=20;
          drawWaveform(part,m.audioBuffer||m.waveformPreview,member.startTime,member.endTime);canvasWave.getContext('2d').drawImage(part,(member.timelineStart-clip.timelineStart)*PIXELS_PER_SECOND,0);
        }
      }

      const label = (media?.file?.name || 'Clip').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      clipEl.innerHTML = `
        <div class="p-1 text-truncate text-white fw-semibold" style="font-size: 0.6rem; z-index: 10;">
          L${clip.zIndex || 0} ${clip.groupId ? '[G]' : ''} ${clip.keyframes?.length ? '◆' : ''} ${clip.aiBackgroundRemoval ? '[IA]' : ''} ${clip.muted ? '[MUTE]' : ''} ${label}
        </div>
      `;

      clipEl.appendChild(thumbContainer);
      clipEl.appendChild(canvasWave);
      for(const {key,owner} of members.flatMap(owner=>(owner.keyframes||[]).map(key=>({key,owner})))) {
        const keyProjectTime=animationRange(owner).start+key.time;
        if(keyProjectTime<(owner.timelineStart||0)-1e-6||keyProjectTime>(owner.timelineStart||0)+owner.endTime-owner.startTime+1e-6)continue;
        const at=keyProjectTime-(clip.timelineStart||0);
        if(at<0 || at>clipDuration) continue;
        const marker=document.createElement('button');marker.type='button';marker.className='keyframe-marker';marker.textContent='◆';
        marker.dataset.clipId=owner.id;marker.dataset.keyTime=key.time;marker.dataset.projectTime=keyProjectTime;
        marker.setAttribute('aria-label',`Keyframe à ${keyProjectTime.toFixed(2)} secondes. Maintenir pour supprimer.`);
        marker.style.left=`${at*PIXELS_PER_SECOND}px`;wrapper.appendChild(marker);
      }


      const handleLeft = document.createElement('div');
      handleLeft.className = 'trim-handle trim-handle-left';
      handleLeft.dataset.side = 'left';
      handleLeft.dataset.clipId = clip.id;

      const handleRight = document.createElement('div');
      handleRight.className = 'trim-handle trim-handle-right';
      handleRight.dataset.side = 'right';
      handleRight.dataset.clipId = members[members.length-1].id;

      if(selected)wrapper.appendChild(handleLeft);
      wrapper.appendChild(clipEl);
      if(selected)wrapper.appendChild(handleRight);

      wrapper.addEventListener('click', (e) => {
        if (e.target.classList.contains('trim-handle') || window.timelineDragged) return;
        if(window.pickFusionClip?.(clip))return;
        state.activeClipId = clip.id;
        state.editPoseClipId = null;
        if(window.refreshAnimationPanel) refreshAnimationPanel();
        greenScreenProcessor.updateSlidersUI(clip);
        document.querySelectorAll('.timeline-clip').forEach(el => {
          el.classList.toggle('active', el.dataset.id === clip.id);
        });
        renderTimeline();
      });

      row.appendChild(wrapper);
    });

    timelineTrack.appendChild(row);
  });

  setupTrimEvents();
  window.setupKeyframeMarkers?.();
  updateTimelinePaddings();
  updateTimecode();
}

function extractAllSpeechBounds(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.015);
  const blocksCount = Math.floor(channelData.length / windowSize);

  let energies = [];
  let maxEnergy = 0;

  for (let i = 0; i < blocksCount; i++) {
    let sum = 0;
    const offset = i * windowSize;
    for (let j = 0; j < windowSize; j++) {
      const val = channelData[offset + j] || 0;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / windowSize);
    energies.push(rms);
    if (rms > maxEnergy) maxEnergy = rms;
  }

  const threshold = maxEnergy * 0.14;
  let rawSegments = [];
  let current = null;

  for (let i = 0; i < energies.length; i++) {
    const time = (i * windowSize) / sampleRate;
    if (energies[i] > threshold) {
      if (!current) current = { start: time };
    } else {
      if (current) {
        current.end = time;
        rawSegments.push(current);
        current = null;
      }
    }
  }

  if (current) {
    current.end = audioBuffer.duration;
    rawSegments.push(current);
  }

  let mergedSegments = [];
  if (rawSegments.length > 0) {
    let activeSeg = { ...rawSegments[0] };
    for (let i = 1; i < rawSegments.length; i++) {
      const nextSeg = rawSegments[i];
      if (nextSeg.start - activeSeg.end <= 0.60) {
        activeSeg.end = nextSeg.end;
      } else {
        mergedSegments.push(activeSeg);
        activeSeg = { ...nextSeg };
      }
    }
    mergedSegments.push(activeSeg);
  }

  return mergedSegments;
}

if (snapToggleBtn) {
  snapToggleBtn.addEventListener('click', () => {
    state.isSnapping = !state.isSnapping;
    snapToggleBtn.classList.toggle('btn-info', state.isSnapping);
    snapToggleBtn.classList.toggle('btn-outline-info', !state.isSnapping);
    snapToggleBtn.setAttribute('aria-pressed',String(state.isSnapping));
    window.PocketCutSession?.schedule();
    showToast(`Aimant vocal ${state.isSnapping ? 'activé' : 'désactivé'}`);
  });
}

function findNearestSpeechSnapPoint(bounds, targetTime, thresholdSeconds = 0.40) {
  if (!state.isSnapping || !bounds) return null;
  const closest=bounds.flatMap(seg=>[seg.start,seg.end]).filter(time=>Math.abs(targetTime-time)<=thresholdSeconds).sort((a,b)=>Math.abs(a-targetTime)-Math.abs(b-targetTime))[0];
  return closest===undefined?null:{snappedTime:closest};
}


function syncMediaStatus() {
  state.mediaFiles.forEach(m => {
    m.used = state.timeline.some(c => c.mediaId === m.id);
  });
}

if (videoInput) {
  videoInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    e.target.value='';
    if (files.length === 0) return;

    files.forEach((file) => {
      const importToken={};pendingMediaImports.add(importToken);
      const id = 'vid_' + Math.random().toString(36).substr(2, 9);
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = url;
      vid.playsInline = true;

      showToast(`Importation de ${file.name}...`);

      vid.onerror = () => { pendingMediaImports.delete(importToken);URL.revokeObjectURL(url); showToast("Impossible de lire cette vidéo."); };
      vid.onloadedmetadata = async () => {
        try{
        let videoDuration=vid.duration;
        try {
          const B=await loadMediaLibrary();
          const input=new B.Input({source:new B.BlobSource(file),formats:B.ALL_FORMATS});
          try {const track=await input.getPrimaryVideoTrack(); if(track) videoDuration=(await track.computeDuration())-(await track.getFirstTimestamp());}
          finally {input.dispose();}
        } catch(e) {console.warn('Métadonnées vidéo :',e.message);}
        let audioBuffer = null;
        let speechBounds = [];

        try {
          const arrayBuffer = await file.arrayBuffer();
          const ctx = getAudioContext();
          audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          speechBounds = extractAllSpeechBounds(audioBuffer);
        } catch (err) {
          console.warn("Analyse audio ignorée:", err);
        }

        const thumbnails = await generateThumbnails(url);

        state.mediaFiles.push({
          id,
          file,
          url,
          element: vid,
          duration: videoDuration,
          used: true,
          audioBuffer,
          thumbnails,
          speechBounds,
          type: 'video'
        });

        const newClip = {
          id: 'clip_' + Math.random().toString(36).substr(2, 9),
          mediaId: id,
          type: 'video',
          startTime: 0,
          endTime: Number.isFinite(videoDuration) && videoDuration>0 ? videoDuration : 10,
          timelineStart: primaryTrackEnd(),
          zIndex: 0,
          muted: false,
          aiBackgroundRemoval: false,
          ...fitMedia(vid.videoWidth, vid.videoHeight)
        };

        state.timeline.push(newClip);
        state.activeClipId = newClip.id;

    
        syncMediaStatus();
        renderMediaLibrary();
        renderTimeline();
        renderCanvasFrame();
        pushState();
        showToast("Vidéo ajoutée !");
        }catch(e){showToast("Importation : "+e.message);}finally{pendingMediaImports.delete(importToken);}
      };
    });
  });
}

if (imagePipInput) {
  imagePipInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value='';

    const importToken={};pendingMediaImports.add(importToken);
    const id = 'img_' + Math.random().toString(36).substr(2, 9);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;

    img.onerror=()=>{pendingMediaImports.delete(importToken);URL.revokeObjectURL(url);showToast("Image illisible.");};
    img.onload = () => {
      pendingMediaImports.delete(importToken);
      state.mediaFiles.push({ id, file, url, element: img, type: 'image', used: true });
      const maxZ = Math.max(0, ...state.timeline.map(c => c.zIndex || 0));

      const newClip = {
        id: 'clip_' + Math.random().toString(36).substr(2, 9),
        mediaId: id,
        type: 'image',
        startTime: 0,
        endTime: getTotalDuration()>state.currentTime ? getTotalDuration()-state.currentTime : 5,
        timelineStart: state.currentTime,
        zIndex: maxZ + 1,
        muted: true,
        ...fullHeightPose(img.naturalWidth,img.naturalHeight)
      };

      state.timeline.push(newClip);
      state.activeClipId = newClip.id;
  
      pushState();
      renderTimeline();
      renderCanvasFrame();
      syncMediaStatus();renderMediaLibrary();
      greenScreenProcessor.updateSlidersUI(newClip);
      showToast("Image PIP ajoutée.");
    };
  });
}

async function generateThumbnails(videoUrl) {
  return new Promise((resolve) => {
    const tempVideo = document.createElement('video');
    tempVideo.src = videoUrl;
    tempVideo.muted = true;
    
    tempVideo.onloadeddata = async () => {
      const thumbs = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 80;
      canvas.height = 45;

      const count = 4;
      const interval = (tempVideo.duration || 4) / count;

      for (let i = 0; i < count; i++) {
        await seekVideo(tempVideo, i * interval);
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
      }
      resolve(thumbs);
    };
    tempVideo.onerror = () => resolve([]);
  });
}

function renderMediaLibrary() {
  if (!mediaList) return;
  if (state.mediaFiles.length === 0) {
    mediaList.innerHTML = `<p class="text-muted small my-auto py-1">Aucun média importé.</p>`;
    return;
  }

  mediaList.innerHTML = '';
  state.mediaFiles.forEach(media => {
    const card = document.createElement('div');
    card.className = `media-card ${media.used ? 'used' : ''}`;
    card.innerHTML = `
      ${media.type==='image'?`<img src="${media.url}" class="w-100 h-100" style="object-fit:cover" alt="Image importée">`:`<video src="${media.url}" class="w-100 h-100" style="object-fit:cover" muted playsinline></video>`}
      ${media.used ? `<div class="badge-used text-white"><i class="bi bi-check-circle-fill fs-6 mb-1"></i> PRIS</div>` : ''}
    `;
    card.addEventListener('click', () => addMediaToTimeline(media.id));
    mediaList.appendChild(card);
  });
}

function addMediaToTimeline(mediaId) {
  const media = state.mediaFiles.find(m => m.id === mediaId);
  if (!media || !media.element) return;

  const fullDuration = media.duration || media.element.duration || 5;
  const newClip = {
    id: 'clip_' + Math.random().toString(36).substr(2, 9),
    mediaId: media.id,
    type: media.type,
    startTime: 0,
    endTime: fullDuration,
    timelineStart: media.type === 'image' ? state.currentTime : primaryTrackEnd(),
    zIndex: media.type === 'image' ? Math.max(0,...state.timeline.map(c=>c.zIndex))+1 : 0,
    muted: false,
    ...fullHeightPose(media.element.videoWidth || media.element.naturalWidth,media.element.videoHeight || media.element.naturalHeight)
  };

  state.timeline.push(newClip);
  state.activeClipId = newClip.id;
  

  syncMediaStatus();
  renderMediaLibrary();
  renderTimeline();
  renderCanvasFrame();
  pushState();
}

function drawWaveform(canvas, audioBuffer, startTime, endTime) {
  if (!audioBuffer) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.75)';

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const totalSamples = endSample - startSample;
  for (let i = 0; i < width; i++) {
    let min = 0;
    let max = 0;
    const first=Math.floor(startSample+i*totalSamples/width),last=Math.max(first+1,Math.floor(startSample+(i+1)*totalSamples/width));
    for (let j = Math.max(0,first); j < Math.min(channelData.length,last); j++) {
      const sample = channelData[j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    const y1 = ((1 + min) * height) / 2;
    const y2 = ((1 + max) * height) / 2;
    ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
  }
}

if (btnSplit) {
  btnSplit.addEventListener('click', () => {
    let clipIndex = -1;
    let splitOffset = 0;

    for (let i = 0; i < state.timeline.length; i++) {
      const clip = state.timeline[i];
      const start = clip.timelineStart || 0;
      const dur = clip.endTime - clip.startTime;
      if (state.currentTime > start && state.currentTime < start + dur) {
        clipIndex = i;
        splitOffset = state.currentTime - start;
        break;
      }
    }

    if (clipIndex !== -1) {
      const active=state.timeline.find(c=>c.id===state.activeClipId);
      const selected = state.timeline.findIndex(c => (c.id === state.activeClipId || (active?.groupId && active.groupId===c.groupId)) && state.currentTime > c.timelineStart && state.currentTime < c.timelineStart + c.endTime - c.startTime);
      if (selected >= 0) { clipIndex = selected; splitOffset = state.currentTime - state.timeline[selected].timelineStart; }
      const orig = state.timeline[clipIndex];
      const splitTime = orig.startTime + splitOffset;

      const left = { ...orig, id: 'clip_' + Math.random().toString(36).substr(2, 9), endTime: splitTime };
      const right = { ...orig, id: 'clip_' + Math.random().toString(36).substr(2, 9), startTime: splitTime, timelineStart: state.currentTime };
      retainSplitAnimation(orig,left,right);
      if(state.isSnapping) {
        const bounds=state.mediaFiles.find(m=>m.id===orig.mediaId)?.speechBounds||[];
        if(!bounds.some(b=>b.start<splitTime&&b.end>splitTime)) {
          const before=bounds.filter(b=>b.end<=splitTime&&b.end>orig.startTime).at(-1);
          const after=bounds.find(b=>b.start>=splitTime&&b.start<orig.endTime);
          if(before)left.endTime=before.end;
          if(after)right.startTime=after.start;
          right.timelineStart=left.timelineStart+left.endTime-left.startTime;
        }
      }
      state.activeClipId=right.id;

      const currentScroll = timelineScrollContainer ? timelineScrollContainer.scrollLeft : 0;
      state.timeline.splice(clipIndex, 1, left, right);
      
      recalculateTimelinePositions();
      renderTimeline();
      if (timelineScrollContainer) timelineScrollContainer.scrollLeft = currentScroll;
      pushState();
      showToast("Clip divisé !");
    } else {
      showToast("Alignez la ligne blanche sur un clip à diviser.");
    }
  });
}

if (btnAutoCutClip) {
  btnAutoCutClip.addEventListener('click', async () => {
    const activeClip = state.timeline.find(c => c.id === state.activeClipId);
    if (!activeClip) return showToast("Sélectionnez un clip d'abord.");

    const media = state.mediaFiles.find(m => m.id === activeClip.mediaId);
    if (!media) return showToast("Piste audio indisponible.");

    btnAutoCutClip.disabled = true;
    btnAutoCutClip.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Cut...`;

    try {
      if(!media.speechBounds?.length){
        if(!media.audioBuffer)await prepareProjectAudio([media.id]);
        if(!media.audioBuffer)return showToast('Piste audio indisponible.');
        media.speechBounds=extractAllSpeechBounds(media.audioBuffer);
      }
      const bounds = media.speechBounds.filter(s => s.end > activeClip.startTime && s.start < activeClip.endTime);
      
      if (bounds.length > 0) {
        const lastTake = bounds[bounds.length - 1];
        activeClip.startTime = Math.max(activeClip.startTime, lastTake.start);
        activeClip.endTime = Math.min(activeClip.endTime, lastTake.end);
        
        recalculateTimelinePositions();
        
        const currentScroll = timelineScrollContainer ? timelineScrollContainer.scrollLeft : 0;
        renderTimeline();
        if (timelineScrollContainer) timelineScrollContainer.scrollLeft = currentScroll;
        pushState();
        showToast("AutoCut appliqué !");
      } else {
        showToast("Aucune phrase vocale distincte trouvée.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      btnAutoCutClip.disabled = false;
      btnAutoCutClip.innerHTML = `<i class="bi bi-magic me-1"></i> AutoCut`;
    }
  });
}

if (btnDelete) {
  btnDelete.addEventListener('click', () => {
    if (!state.activeClipId) return;
    const selectedClip=state.timeline.find(c=>c.id===state.activeClipId);
    const group=selectedClip?.groupId&&state.groups[selectedClip.groupId]?.kind==='sequence'?selectedClip.groupId:null;
    state.timeline = state.timeline.filter(c => c.id !== state.activeClipId&&(!group||c.groupId!==group));
    state.activeClipId = state.timeline[0]?.id || null;
    
    recalculateTimelinePositions();
    syncMediaStatus();
    renderMediaLibrary();
    
    const currentScroll = timelineScrollContainer ? timelineScrollContainer.scrollLeft : 0;
    renderTimeline();
    if (timelineScrollContainer) timelineScrollContainer.scrollLeft = currentScroll;
    pushState();
    renderCanvasFrame();
    showToast("Clip supprimé.");
  });
}

if (btnExport) btnExport.addEventListener('click', exportProject);
const clipPlayers = new Map();
function getClipVideo(clip, media) {
  if (!clipPlayers.has(clip.id)) {
    const v = document.createElement('video');
    v.src = media.url; v.playsInline = true; v.preload = 'auto';
    clipPlayers.set(clip.id, v);
    v.addEventListener('seeked', () => { if (!state.isPlaying && !exporting) renderCanvasFrame(); });
    v.addEventListener('loadeddata', () => { if (!exporting) renderCanvasFrame(); });
  }
  return clipPlayers.get(clip.id);
}
function seekVideo(v, time) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Décodage vidéo trop lent.')), 15000);
    const done = error => { clearTimeout(timer); v.removeEventListener('seeked', ok); v.removeEventListener('error', fail); error ? reject(error) : resolve(); };
    const ok = () => done(); const fail = () => done(new Error('Vidéo illisible.'));
    if (v.readyState >= 2 && Math.abs(v.currentTime - time) < 0.001) return done();
    v.addEventListener('seeked', ok, {once:true}); v.addEventListener('error', fail, {once:true});
    v.currentTime = time;
  });
}

function getTotalDuration() {
  return state.timeline.reduce((acc, c) => Math.max(acc, (c.timelineStart || 0) + (c.endTime - c.startTime)), 0);
}

function updateTimecode() {
  window.updateKeyframeHighlight?.();
  if(!state.isPlaying)window.PocketCutSession?.remember();
  if(!state.isPlaying && state.activeClipId){const selected=state.timeline.find(c=>c.id===state.activeClipId);if(selected)greenScreenProcessor.updateSlidersUI(selected);}
  if (timecodeDisplay) {
    timecodeDisplay.innerText = `${formatTime(state.currentTime)} / ${formatTime(getTotalDuration())}`;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
}

function showToast(msg) {
  const toastMsg = document.getElementById('toast-message');
  const toastEl = document.getElementById('app-toast');
  if (toastMsg && toastEl) {
    toastMsg.innerText = msg;
    if(window.bootstrap) new bootstrap.Toast(toastEl,{delay:4000}).show();
    else {toastEl.style.display='block'; setTimeout(()=>toastEl.style.display='none',4000);}
  }
}
pushState();
updateTimelinePaddings();

function fitMedia(w,h,maxW=workspaceWidth(),maxH=workspaceHeight()) {
  w=w||720; h=h||1280; const k=Math.min(maxW/w,maxH/h); const width=w*k,height=h*k;
  return {x:(workspaceWidth()-width)/2,y:(workspaceHeight()-height)/2,baseWidth:width,baseHeight:height,width,height,scale:1,rotation:0};
}

new ResizeObserver(updateTimelinePaddings).observe(timelineScrollContainer);

function primaryTrackEnd(){return Math.max(0,...state.timeline.filter(c=>(c.zIndex||0)===0).map(c=>(c.timelineStart||0)+c.endTime-c.startTime));}
