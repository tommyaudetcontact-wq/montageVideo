function clipTrack(c){return c.trackIndex ?? c.zIndex ?? 0;}
function findImportedMedia(file){return state.mediaFiles.find(m=>m.file?.name===file.name&&m.file?.size===file.size&&m.file?.lastModified===file.lastModified);}
function nextPipTrack(){const used=new Set(state.timeline.map(clipTrack));for(let i=1;i<=6;i++)if(!used.has(i))return i;return Math.max(6,...used)+1;}
let PIXELS_PER_SECOND = 40;
let videoImportQueue=Promise.resolve();
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
  const zIndices = [...new Set(state.timeline.map(c => clipTrack(c)))].sort((a, b) => a - b);

  zIndices.forEach(zIndex => {
    const layerClips = state.timeline
      .filter(c => clipTrack(c) === zIndex)
      .sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));

    let accumulatedStart = 0;
    layerClips.forEach(clip => {
      if (zIndex !== 0) return;
      if(clip.animationStart!==undefined)clip.animationStart+=accumulatedStart-(clip.timelineStart||0);
      clip.timelineStart = accumulatedStart;
      const duration = clip.endTime - clip.startTime;
      accumulatedStart += duration;
    });
  });
}

function pushState() {
  window.syncSceneEdits?.();
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
  window.SceneEngine?.upgrade();
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

  const activeClips = (window.SceneEngine?SceneEngine.expand(state.timeline):state.timeline)
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

  greenScreenProcessor.awaitingCutout=false;
  const usedPlayers=new Set(),syncedPlayers=new Set();
  activeClips.forEach(clip => {
    if(clip.hideVisual)return;
    const media = state.mediaFiles.find(m => m.id === clip.mediaId);
    if (!media || !media.element) return;

    const clipStart = clip.timelineStart || 0;
    const progress = previewTime - clipStart;
    const targetTime = window.SceneEngine?SceneEngine.sourceTime(clip,previewTime):clip.startTime+progress;

    if (clip.type === 'image') {
      greenScreenProcessor.drawClipToCanvas(canvasCtx, media.element, clip, !!clip.aiBackgroundRemoval);
    } else if (clip.type === 'video') {
      const owner=getPreviewOwner(clip,activeClips);
      const vid=getClipVideo(owner,media);usedPlayers.add(vid);
      if(!syncedPlayers.has(vid)) {
      syncedPlayers.add(vid);vid.muted=true;

      // RECALAGE AUDIO/VIDÉO NON-DESTRUCTIF : On ajuste currentTime seulement lors d'un gros décalage ou en pause
      if ((!state.isPlaying && Math.abs(vid.currentTime - targetTime) > 0.015) || Math.abs(vid.currentTime - targetTime) > 0.4) {
        vid.currentTime = targetTime;
      }

      if(clip.freezeAt!=null)vid.pause();
      if (state.isPlaying && vid.paused && clip.freezeAt==null) {
        vid.play().catch(() => {});
      }

      }
      greenScreenProcessor.drawClipToCanvas(canvasCtx, vid, clip, !!clip.aiBackgroundRemoval);
    }
  });
  for(const [id,v] of clipPlayers)if(!usedPlayers.has(v)){v.pause();if(clipPlayers.size>4){v.removeAttribute('src');v.load();clipPlayers.delete(id);greenScreenProcessor.previewSurfaces.delete(id);greenScreenProcessor.frames.delete(id);}}
  window.syncPreviewAudio?.(activeClips,previewTime);
  window.drawWorkspaceSnap?.();
  const badge=document.getElementById('cutout-loading-badge');if(badge){badge.hidden=!greenScreenProcessor.awaitingCutout;badge.textContent=greenScreenProcessor.failure?'IA indisponible · Réessayer IA':'Détourage en préparation…';}
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
    const active=(window.SceneEngine?SceneEngine.expand(state.timeline):state.timeline).filter(c=>state.currentTime>=(c.timelineStart||0)&&state.currentTime<(c.timelineStart||0)+c.endTime-c.startTime);
    const synced=new Set(),frozenPlayers=new Set();
    for(const clip of active.filter(c=>c.type==='video'&&!c.hideVisual)) {
      const media=state.mediaFiles.find(m=>m.id===clip.mediaId),owner=getPreviewOwner(clip,active),v=getClipVideo(owner,media);
      if(!synced.has(v)) {
        synced.add(v);v.pause();v.muted=true;
        await waitForPreviewData(v);await seekVideo(v,(window.SceneEngine?SceneEngine.sourceTime(clip,state.currentTime):clip.startTime+state.currentTime-(clip.timelineStart||0)));
      }
      if(clip.freezeAt!=null)frozenPlayers.add(v);
      if(request!==playbackRequest)return;
      if(clip.aiBackgroundRemoval)await greenScreenProcessor.prepareFrame(v,clip,{draft:true,time:(window.SceneEngine?SceneEngine.sourceTime(clip,state.currentTime):clip.startTime+state.currentTime-(clip.timelineStart||0))});
      if(request!==playbackRequest)return;
    }
    if(request!==playbackRequest)return;
    state.isPlaying=true;playbackTimestamp=null;
    if(playIcon)playIcon.className='bi bi-pause-fill fs-6';if(playText)playText.textContent='Pause';
    // All readers begin together after the first mask is ready.
    await Promise.all([...synced].filter(v=>!frozenPlayers.has(v)).map(v=>v.play().catch(()=>{})));
    if(request!==playbackRequest)return;
    window.syncPreviewAudio?.(active,state.currentTime);playbackTimestamp=performance.now();
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
  if(typeof stopProjectAudio==='function')stopProjectAudio();window.stopPreviewAudio?.();
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
      zIndex: Math.max(0,...state.timeline.map(c=>c.zIndex||0))+1,
      trackIndex: nextPipTrack(),
      muted: true, // Le double est mâté par défaut pour éviter l'écho
      aiBackgroundRemoval: true,
      ...fullHeightPose(activeClip.baseWidth,activeClip.baseHeight),
      keyframes: [], autoZoom: null, popUp: null, groupId: null,
      animationStart: null, animationDuration: null,
      crop: { top: 0, bottom: 0, left: 0, right: 0 }, cropRatio:'free'
    };

    delete newPip.scene;
    state.timeline.push(newPip);
    state.activeClipId = newPip.id;

    pushState();
    renderTimeline();
    renderCanvasFrame();
    greenScreenProcessor.updateSlidersUI(newPip);
    window.primeClipCutout?.(newPip).catch(e=>showToast(e.message));showToast("PIP avec découpe IA ajouté !");
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

// Visual layer controls are registered in blades.js and montage-tools.js.
function renderTimeline() {
  if (!timelineTrack) return;
  timelineTrack.innerHTML = '';
  window.renderSceneStrip?.();
  document.body.classList.toggle('v2-has-secondary',state.timeline.some(c=>clipTrack(c)>0));
  updateTimelinePaddings();

  const highest=Math.max(6,...state.timeline.map(c=>clipTrack(c)));
  const zIndices=Array.from({length:highest+1},(_,i)=>i).reverse();

  zIndices.forEach(zIndex => {
    const row = document.createElement('div');
    row.className = 'timeline-layer-row';row.dataset.zIndex=zIndex;
    const rowLabel=document.createElement('span');rowLabel.className='timeline-row-label';rowLabel.textContent=zIndex===0?'Principale':'B-roll '+zIndex;row.appendChild(rowLabel);

    const clipsInLayer = state.timeline.filter(c => clipTrack(c) === zIndex);
    row.classList.toggle('empty-secondary',zIndex>0&&!clipsInLayer.length);

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
      wrapper.dataset.clipId=clip.id;wrapper.draggable=false;wrapper.setAttribute('role','button');wrapper.tabIndex=0;
      wrapper.style.width = `${clipWidth}px`;
      wrapper.style.left = `${leftPos}px`;

      const clipEl = document.createElement('div');
      clipEl.className = `timeline-clip ${selected ? 'active' : ''} ${clipTrack(clip) > 0 ? 'pip-mode' : ''}`;
      clipEl.dataset.id = clip.id;

      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'clip-thumbnails-container';
      if (media) {
        const thumbnails=members.flatMap(c=>{const m=state.mediaFiles.find(m=>m.id===c.mediaId);return m?.type==='image'?[m.url]:m?.thumbnails||[];});
        thumbnails.forEach(src => {
          const img = document.createElement('img');
          img.src = src;
          img.className = 'clip-thumb';img.draggable=false;
          thumbContainer.appendChild(img);
        });
      }

      const canvasWave = document.createElement('canvas');
      canvasWave.className = 'clip-waveform';
      canvasWave.width = Math.max(1,Math.min(2048,Math.ceil(clipWidth)));
      canvasWave.height = 20;
      if (members.some(c=>{const m=state.mediaFiles.find(x=>x.id===c.mediaId);return m&&(m.audioBuffer||m.waveformPreview);})) {
        if(!sequence)drawWaveform(canvasWave, media.audioBuffer||media.waveformPreview, clip.startTime, clip.endTime);
        else for(const member of members){
          const m=state.mediaFiles.find(x=>x.id===member.mediaId);if(!m?.audioBuffer&&!m?.waveformPreview)continue;
          const part=document.createElement('canvas');part.width=Math.max(1,Math.min(2048,Math.round((member.endTime-member.startTime)*PIXELS_PER_SECOND)));part.height=20;
          drawWaveform(part,m.audioBuffer||m.waveformPreview,member.startTime,member.endTime);canvasWave.getContext('2d').drawImage(part,(member.timelineStart-clip.timelineStart)*PIXELS_PER_SECOND*canvasWave.width/Math.max(1,clipWidth),0,(member.endTime-member.startTime)*PIXELS_PER_SECOND*canvasWave.width/Math.max(1,clipWidth),20);
        }
      }

      const label = (clip.label || media?.file?.name || 'Clip').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      clipEl.innerHTML = `
        <div class="p-1 text-truncate text-white fw-semibold" style="font-size: 0.6rem; z-index: 10;">
          P${clipTrack(clip)} ${clip.scene ? '[SCÈNE]' : ''} ${clip.groupId ? '[G]' : ''} ${clip.keyframes?.length ? '◆' : ''} ${clip.aiBackgroundRemoval ? '[IA]' : ''} ${clip.muted ? '[MUTE]' : ''} ${label}
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
        if(window.pickMultiClip?.(clip))return;
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
  window.paintMultiSelection?.();
  window.setupKeyframeMarkers?.();
  updateTimelinePaddings();
  window.paintMultiSelection?.();
  if(!window.clipReorderActive)window.revealSelectedLayer?.();
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
    showToast(`Aimant timeline ${state.isSnapping ? 'activé' : 'désactivé'}`);
  });
}

function findNearestSpeechSnapPoint(bounds, targetTime, thresholdSeconds = 0.40) {
  if (!state.isSnapping || !bounds) return null;
  const closest=bounds.flatMap(seg=>[seg.start,seg.end]).filter(time=>Math.abs(targetTime-time)<=thresholdSeconds).sort((a,b)=>Math.abs(a-targetTime)-Math.abs(b-targetTime))[0];
  return closest===undefined?null:{snappedTime:closest};
}


function syncMediaStatus() {
  state.mediaFiles.forEach(m => {
    m.used = state.timeline.some(c => c.mediaId === m.id||c.scene?.visualMediaId===m.id);
  });
}

function importVideoFiles(inputFiles,asPip=false) {
    const files = Array.from(inputFiles).sort((a,b)=>{
      const dateA=Number.isFinite(a.lastModified)&&a.lastModified>0?a.lastModified:Infinity;
      const dateB=Number.isFinite(b.lastModified)&&b.lastModified>0?b.lastModified:Infinity;
      return dateA===dateB?0:dateA-dateB;
    });
    if (files.length === 0) return;

    files.forEach((file) => {
      const importToken={};pendingMediaImports.add(importToken);
      videoImportQueue=videoImportQueue.then(()=>new Promise(resolveImport=>{
      const existing=findImportedMedia(file);if(existing){addMediaToTimeline(existing.id,asPip);showToast('✓ Déjà importé · source réutilisée.');pendingMediaImports.delete(importToken);resolveImport();return;}
      const id = 'vid_' + Math.random().toString(36).substr(2, 9);
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = url;
      vid.playsInline = true;vid.preload="metadata";vid.muted=true;

      showToast(`Importation de ${file.name}...`);

      vid.onerror = () => { pendingMediaImports.delete(importToken);URL.revokeObjectURL(url); showToast("Impossible de lire cette vidéo.");resolveImport(); };
      vid.onloadedmetadata = async () => {
        try{
        let videoDuration=vid.duration;
        if(!Number.isFinite(videoDuration)||videoDuration<=0){
          const B=await loadMediaLibrary(),input=new B.Input({source:new B.BlobSource(file),formats:B.ALL_FORMATS});
          try{const track=await input.getPrimaryVideoTrack();videoDuration=(await track.computeDuration())-(await track.getFirstTimestamp());}finally{input.dispose();}
        }
        const audioBuffer=null,speechBounds=[],thumbnails=[];
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
          timelineStart: asPip ? state.currentTime : primaryTrackEnd(),
          trackIndex: asPip ? nextPipTrack() : 0,
          zIndex: asPip ? Math.max(0,...state.timeline.map(c=>c.zIndex||0))+1 : 0,
          muted: false,
          aiBackgroundRemoval: false,
          ...(asPip?fullHeightPose(vid.videoWidth,vid.videoHeight):fitMedia(vid.videoWidth,vid.videoHeight))
        };

        state.timeline.push(newClip);
        state.activeClipId = newClip.id;

    
        syncMediaStatus();
        renderMediaLibrary();
        renderTimeline();
        renderCanvasFrame();
        pushState();
        window.scheduleMediaVisuals?.();showToast("Vidéo ajoutée !");
        }catch(e){showToast("Importation : "+e.message);}finally{pendingMediaImports.delete(importToken);resolveImport();}
      };
      })).catch(e=>{pendingMediaImports.delete(importToken);showToast("Importation : "+e.message);});
    });
}
if(videoInput)videoInput.addEventListener('change',e=>{importVideoFiles(e.target.files);e.target.value='';});

if (imagePipInput) {
  imagePipInput.addEventListener('change', (e) => {
    const picked=Array.from(e.target.files);
    importVideoFiles(picked.filter(f=>f.type.startsWith('video/')),true);
    const files=picked.filter(f=>!f.type.startsWith('video/'));
    e.target.value='';
    for(const file of files){
    const existing=findImportedMedia(file);if(existing){addMediaToTimeline(existing.id,true);showToast('✓ Déjà importé · source réutilisée.');continue;}
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
        trackIndex: nextPipTrack(),
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
    }
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
      ${media.type==='image'?`<img src="${media.url}" class="w-100 h-100" style="object-fit:cover" alt="Image importée">`:`<span class="media-video-label">▶</span>`}
      ${media.used ? `<div class="badge-used text-white"><i class="bi bi-check-circle-fill fs-6 mb-1"></i> PRIS</div>` : ''}
    `;
    card.addEventListener('click', () => addMediaToTimeline(media.id));
    mediaList.appendChild(card);
  });
}

function addMediaToTimeline(mediaId,asPip=false) {
  const media = state.mediaFiles.find(m => m.id === mediaId);
  if (!media || !media.element) return;

  const fullDuration = media.duration || media.element.duration || 5;
  const newClip = {
    id: 'clip_' + Math.random().toString(36).substr(2, 9),
    mediaId: media.id,
    type: media.type,
    startTime: 0,
    endTime: fullDuration,
    timelineStart: media.type === 'image'||asPip ? state.currentTime : primaryTrackEnd(),
    trackIndex: media.type === 'image'||asPip ? nextPipTrack() : 0,
    zIndex: media.type === 'image'||asPip ? Math.max(0,...state.timeline.map(c=>c.zIndex||0))+1 : 0,
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
  ctx.fillStyle = '#66ffe4';

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

if(btnAutoCutClip)btnAutoCutClip.addEventListener('click',()=>window.runAutoCut?.(window.editTargets?.()||[]));

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
    if(v.requestVideoFrameCallback){const trackFrame=(now,metadata)=>{v.pocketFrameTime=metadata.mediaTime;if(clipPlayers.get(clip.id)===v)v.requestVideoFrameCallback(trackFrame);};v.requestVideoFrameCallback(trackFrame);}v.addEventListener('seeking',()=>{delete v.pocketFrameTime;});
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

function primaryTrackEnd(){return Math.max(0,...state.timeline.filter(c=>clipTrack(c)===0).map(c=>(c.timelineStart||0)+c.endTime-c.startTime));}
