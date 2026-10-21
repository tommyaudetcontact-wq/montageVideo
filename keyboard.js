
'use strict';
function pocketCutEditable(target){return !!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog[open]');}
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||pocketCutEditable(e.target)||document.querySelector('dialog[open]')||exporting)return;
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)togglePlay();}
 else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
  e.preventDefault();pausePlayback();window.PocketCutTimeline?.cancelGesture();const step=e.shiftKey?1:1/30;
  state.currentTime=Math.max(0,Math.min(getTotalDuration(),state.currentTime+(e.key==='ArrowLeft'?-step:step)));
  timelineScrollContainer.scrollLeft=state.currentTime*PIXELS_PER_SECOND;updateTimecode();renderCanvasFrame();window.refreshAnimationPanel?.();window.PocketCutSession?.remember();
 }else if((e.key==='Backspace'||e.key==='Delete')&&state.activeClipId){e.preventDefault();if(!e.repeat)document.getElementById('btn-delete').click();}
});
