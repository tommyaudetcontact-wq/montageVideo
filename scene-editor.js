'use strict';
let sceneMediaBusy=false,sceneZoomFocus=null,sceneFocusGeneration=0;
function selectedNarration(){
 const chosen=typeof editTargets==='function'?editTargets():[];
 const active=state.timeline.find(c=>c.id===state.activeClipId);return chosen.filter(c=>clipTrack(c)===0||(active?.scene&&clipTrack(c)===clipTrack(active)));
}
function renderSceneStrip(){
 const strip=document.getElementById('scene-strip');if(!strip||!window.SceneEngine)return;
 strip.replaceChildren();
 const labels={pip:'Moi + fond',split:'Écran partagé',excerpt:'Extrait seul'};
 for(const run of SceneEngine.runs(state.timeline)){
  const button=document.createElement('button');button.type='button';button.className='scene-pill';button.dataset.sceneId=run.id;
  button.textContent=(labels[run.clips[0].scene.mode]||'Scène')+' · '+run.start.toFixed(1)+'–'+run.end.toFixed(1)+' s';
  button.classList.toggle('selected',run.clips.some(c=>c.id===state.activeClipId));
  button.onclick=()=>{pausePlayback();state.activeClipId=run.clips[0].id;state.currentTime=run.start;renderTimeline();renderCanvasFrame();openSceneEditor();};const item=document.createElement('div');item.setAttribute('role','listitem');item.appendChild(button);strip.appendChild(item);
 }
 if(!strip.children.length){const hint=document.createElement('span');hint.textContent=state.timeline.length?'Sélectionnez un passage, puis « Illustrer ».':'1. Importer vos prises  →  2. Nettoyer  →  3. Illustrer';strip.appendChild(hint);}
}
window.renderSceneStrip=renderSceneStrip;
async function importSceneMedia(file){
 const existing=findImportedMedia(file);
 if(existing){existing.reusedFromGallery=true;existing.sceneBackground=true;saveMediaAnalysis(existing).catch(()=>{});return existing;}
 const token={};pendingMediaImports.add(token);const url=URL.createObjectURL(file),type=file.type.startsWith('video/')?'video':'image';
 const element=type==='video'?document.createElement('video'):new Image();
 try{
  if(type==='video'){element.muted=true;element.playsInline=true;element.preload='metadata';}
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Le média ne répond pas.')),30000);element.addEventListener(type==='video'?'loadedmetadata':'load',()=>{clearTimeout(timer);resolve();},{once:true});element.onerror=()=>{clearTimeout(timer);reject(Error('Ce fichier ne peut pas être lu.'));};element.src=url;});
  if(type==='video'&&(!Number.isFinite(element.duration)||element.duration<=0))throw Error('La durée de ce fond vidéo est inconnue. Choisissez un autre fichier.');
  const media={id:'media_'+crypto.randomUUID(),type,file,url,element,used:false,sceneBackground:true,duration:type==='video'?element.duration:undefined,thumbnails:[],speechBounds:[]};state.mediaFiles.push(media);window.scheduleMediaVisuals?.();return media;
 }catch(e){URL.revokeObjectURL(url);throw e;}finally{pendingMediaImports.delete(token);}
}
let editingSceneId=null,sceneComposition=null,sceneRecords=[],sceneSubjectGeneration=0;
async function prepareSceneSubjectThumbnail(media,clip,canvas,generation){
 let source=media.element,video;
 try{
  if(media.type==='video'){
   video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.src=media.url;
   await waitForPreviewData(video);const at=Math.min(clip.endTime-.001,Math.max(clip.startTime,clip.startTime+Math.max(.3,state.currentTime-(clip.timelineStart||0))));await seekVideo(video,at);
   source=await greenScreenProcessor.prepareFrame(video,{...clip,id:clip.id+'~galerie',aiBackgroundRemoval:true},{time:at,draft:false});
  }
  if(generation!==sceneSubjectGeneration||!canvas.isConnected)return;
  const ctx=canvas.getContext('2d'),w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;ctx.clearRect(0,0,120,180);const scale=Math.min(120/w,180/h);ctx.drawImage(source,(120-w*scale)/2,(180-h*scale)/2,w*scale,h*scale);
 }finally{if(video){video.pause();video.removeAttribute('src');video.load();}greenScreenProcessor.frames.delete(clip.id+'~galerie');}
}
const sceneById=id=>document.getElementById(id);
function sceneConfig(){return {zoomFocus:sceneZoomFocus?{...sceneZoomFocus}:null,mode:sceneById('scene-mode').value,layout:sceneById('scene-layout').value,visualMediaId:sceneById('scene-media').value,faceY:Number(sceneById('scene-face-y').value)/100,faceHeight:Number(sceneById('scene-face-height').value)/100,zoom:Number(sceneById('scene-zoom').value),popup:Number(sceneById('scene-popup').value),shortVideo:sceneById('scene-short').value,visualAudio:sceneById('scene-visual-audio').checked,continuous:sceneById('scene-continuity').checked,narrationAudio:sceneById('scene-voice').checked,bgZoom:Number(sceneById('scene-bg-zoom').value),bgOffsetX:Number(sceneById('scene-bg-offset-x').value)/100,bgOffsetY:Number(sceneById('scene-bg-offset-y').value)/100,bgX:Number(sceneById('scene-bg-x').value)/100,bgY:Number(sceneById('scene-bg-y').value)/100};}
function fillSceneConfig(settings){
 const s={...SceneEngine.defaults,...settings};sceneZoomFocus=s.zoomFocus?{...s.zoomFocus}:null;closeSceneFocus();
 for(const [id,value] of Object.entries({'scene-face-y':s.faceY*100,'scene-face-height':s.faceHeight*100,'scene-mode':s.mode,'scene-layout':s.layout,'scene-zoom':s.zoom,'scene-popup':s.popup,'scene-short':s.shortVideo,'scene-bg-zoom':s.bgZoom,'scene-bg-offset-x':s.bgOffsetX*100,'scene-bg-offset-y':s.bgOffsetY*100,'scene-bg-x':s.bgX*100,'scene-bg-y':s.bgY*100}))sceneById(id).value=value;
 sceneById('scene-continuity').checked=!!s.continuous;sceneById('scene-visual-audio').checked=s.visualAudio;sceneById('scene-voice').checked=s.narrationAudio;sceneById('scene-media').value=s.visualMediaId||'';
}
function closeSceneFocus(){
 sceneFocusGeneration++;const panel=sceneById('scene-focus-panel');if(panel)panel.hidden=true;
 const button=sceneById('scene-focus');if(button)button.textContent=sceneZoomFocus?'◎ Modifier le point de zoom':'◎ Cibler le zoom sur le fond';
}
async function openSceneFocus(){
 const media=state.mediaFiles.find(m=>m.id===sceneById('scene-media').value);
 if(!media)return sceneById('scene-status').textContent='Choisissez d’abord une image ou une vidéo de fond.';
 const canvas=sceneById('scene-focus-canvas'),generation=++sceneFocusGeneration;
 sceneById('scene-focus-panel').hidden=false;sceneById('scene-status').textContent='Touchez le détail du fond vers lequel zoomer. Le pourcentage reste inchangé.';
 let source=media.element,video;
 try{
  if(media.type==='video'){video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.src=media.url;await waitForPreviewData(video);source=video;}
  if(generation!==sceneFocusGeneration)return;
  const {rect,pose}=SceneEngine.backgroundFrame(sceneConfig()),factor=Math.min(360/rect.width,420/rect.height);
  canvas.width=Math.round(rect.width*factor);canvas.height=Math.round(rect.height*factor);
  const snapshot=document.createElement('canvas');snapshot.width=canvas.width;snapshot.height=canvas.height;const preview=snapshot.getContext('2d');preview.drawImage(source,(pose.x-rect.x)*factor,(pose.y-rect.y)*factor,pose.width*factor,pose.height*factor);
  const ctx=canvas.getContext('2d');
  const draw=()=>{
   ctx.fillStyle='#0b1726';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(snapshot,0,0);
   if(sceneZoomFocus){const x=(pose.x+sceneZoomFocus.x*pose.width-rect.x)*factor,y=(pose.y+sceneZoomFocus.y*pose.height-rect.y)*factor;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.moveTo(x-17,y);ctx.lineTo(x+17,y);ctx.moveTo(x,y-17);ctx.lineTo(x,y+17);ctx.stroke();}
  };
  canvas.onclick=e=>{const b=canvas.getBoundingClientRect(),x=rect.x+(e.clientX-b.left)/b.width*rect.width,y=rect.y+(e.clientY-b.top)/b.height*rect.height;sceneZoomFocus={x:Math.max(0,Math.min(1,(x-pose.x)/pose.width)),y:Math.max(0,Math.min(1,(y-pose.y)/pose.height))};sceneById('scene-focus').textContent='◎ Modifier le point de zoom';draw();sceneById('scene-status').textContent='Point choisi · appliquez au passage pour enregistrer.';};draw();sceneById('scene-focus-panel').scrollIntoView({block:'center',behavior:'smooth'});
 }catch(e){sceneById('scene-status').textContent='Aperçu indisponible : '+e.message;}finally{if(video){video.pause();video.removeAttribute('src');video.load();}}
}
function sceneBackgroundMedia(selected=''){
 return state.mediaFiles.filter(m=>m.type==='image'||m.sceneBackground||m.id===selected||state.timeline.some(c=>c.scene?.visualMediaId===m.id));
}
function sceneMediaOptions(selected=''){
 const list=sceneById('scene-media');list.replaceChildren();const empty=new Option('Choisir un média ou importer…','');list.add(empty);list.add(new Option('＋ Ajouter depuis la galerie…','__gallery__'));
 for(const m of sceneBackgroundMedia(selected)){const option=new Option((m.type==='video'?'Vidéo · ':'Image · ')+(m.file?.name||m.name||'Média'),m.id);list.add(option);}list.value=selected;list.dataset.previous=selected;renderSceneGallery(selected);
}
function renderSceneGallery(selected=''){
 closeSceneFocus();
 const grid=sceneById('scene-gallery');if(!grid)return;const add=sceneById('scene-add-media')||document.createElement('button');grid.replaceChildren();
 add.id='scene-add-media';add.type='button';add.className='scene-gallery-add';add.textContent='＋ Ajouter';add.setAttribute('aria-label','Ajouter depuis la galerie photo ou vidéo');add.onclick=()=>sceneById('scene-import').click();grid.appendChild(add);
 const active=state.timeline.find(c=>c.id===state.activeClipId),subject=active&&state.mediaFiles.find(m=>m.id===active.mediaId);
 if(subject){const card=document.createElement('div');card.className='scene-gallery-card scene-gallery-subject';card.dataset.subjectId=subject.id;
 const canvas=document.createElement('canvas');canvas.width=120;canvas.height=180;canvas.setAttribute('aria-label','Aperçu du sujet détouré');card.appendChild(canvas);
 const label=document.createElement('span');label.className='scene-gallery-name';label.textContent='Votre sujet détouré';card.appendChild(label);grid.appendChild(card);
 const generation=++sceneSubjectGeneration;
 prepareSceneSubjectThumbnail(subject,active,canvas,generation).catch(()=>{});
 }
 for(const m of sceneBackgroundMedia(selected)){
  const count=state.timeline.filter(c=>c.mediaId===m.id).length+new Set(state.timeline.filter(c=>c.scene?.visualMediaId===m.id).map(c=>c.scene.id)).size;
  const card=document.createElement('button');card.type='button';card.className='scene-gallery-card';card.classList.toggle('chosen',m.id===selected);card.dataset.mediaId=m.id;
  const thumbnail=m.type==='image'?m.url:m.thumbnails?.[0];if(thumbnail){const img=document.createElement('img');img.src=thumbnail;img.alt='';card.appendChild(img);}else{const icon=document.createElement('span');icon.className='scene-gallery-icon';icon.textContent=m.type==='video'?'▶':'▧';card.appendChild(icon);}
  const title=document.createElement('span');title.className='scene-gallery-name';title.textContent=m.file?.name||'Média';
  const badge=document.createElement('small');badge.className='scene-gallery-badge';badge.textContent=count?'✓ Utilisé · '+count:'✓ Déjà importé';card.append(title,badge);
  card.onclick=()=>{sceneById('scene-media').value=m.id;sceneById('scene-media').dataset.previous=m.id;renderSceneGallery(m.id);};grid.appendChild(card);
 }
}
async function refreshScenePresets(){
 sceneRecords=(await localAll('presets')).filter(p=>p.kind==='scene-v2').sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 const list=sceneById('scene-presets');list.replaceChildren(new Option('Composition personnelle…',''));
 for(const p of sceneRecords)list.add(new Option(p.name,p.id));
}
async function openSceneEditor(){
 const active=state.timeline.find(c=>c.id===state.activeClipId),selected=selectedNarration();
 if(!selected.length)return showToast('Sélectionnez une vidéo de la piste principale.');
 pausePlayback();sceneComposition=null;
 const run=active?.scene&&SceneEngine.runs(state.timeline).find(r=>r.clips.some(c=>c.id===active.id));
 const clips=run?.clips||selected;editingSceneId=run?.id||null;
 sceneById('scene-from').value=Math.min(...clips.map(c=>c.timelineStart||0)).toFixed(3);sceneById('scene-to').value=Math.max(...clips.map(SceneEngine.end)).toFixed(3);
 sceneMediaOptions(active?.scene?.visualMediaId||'');fillSceneConfig(active?.scene||{});sceneById('scene-status').textContent='Les réglages s’appliquent au passage indiqué ci-dessus.';
 sceneById('scene-composition-name').value='';
 sceneById('scene-dialog').showModal();
 try{await refreshScenePresets();}catch(e){sceneById('scene-status').textContent='Compositions locales indisponibles : '+e.message;}
}
window.openSceneEditor=openSceneEditor;
document.addEventListener('DOMContentLoaded',()=>{
 document.body.classList.add('v2-guided');
 const library=document.getElementById('media-list').previousElementSibling,libraryButton=document.createElement('button');libraryButton.id='v2-library-btn';libraryButton.textContent='Ouvrir';libraryButton.setAttribute('aria-expanded','false');libraryButton.onclick=()=>{const visible=document.body.classList.toggle('v2-media');libraryButton.textContent=visible?'Réduire':'Ouvrir';libraryButton.setAttribute('aria-expanded',String(visible));};library.appendChild(libraryButton);
 sceneById('v2-import').onchange=e=>{importVideoFiles(e.target.files);e.target.value='';};
 const dialog=document.createElement('dialog');dialog.id='scene-dialog';dialog.innerHTML=`
 <header><div><small>COMPOSER UN PASSAGE</small><h2>Illustrer</h2></div><button id="scene-close" aria-label="Fermer les scènes">✕</button></header>
 <p>Votre voix reste synchronisée. Le fond et votre personnage forment une seule scène.</p>
 <div class="scene-grid"><label>Du début (s)<input id="scene-from" type="number" min="0" step=".01"></label><label>À la fin (s)<input id="scene-to" type="number" min=".02" step=".01"></label></div>
 <label>Présentation<select id="scene-mode"><option value="pip">Fond + moi détouré</option><option value="split">Écran partagé · moi en haut</option><option value="excerpt">Extrait seul</option><option value="face">Face caméra · retirer l’illustration</option></select></label>
 <label>Illustration<select id="scene-media"></select></label><div id="scene-gallery" aria-label="Galerie du projet"></div><button type="button" id="scene-add-media" class="scene-import">＋ Ajouter · galerie photo / vidéo</button><input id="scene-import" type="file" accept="image/*,video/*" hidden>
 <div class="scene-grid"><label>Placement du sujet<select id="scene-layout"><option value="right">En bas à droite · incliné</option><option value="left">En bas à gauche · incliné</option><option value="top-left">En haut à gauche · incliné</option><option value="top-right">En haut à droite · incliné</option><option value="straight-left">Droit en bas à gauche</option><option value="straight-right">Droit en bas à droite</option><option value="center">En bas au centre</option><option value="large">Réaction grand format</option></select></label><label>Zoom du fond (%)<input id="scene-zoom" type="number" min="0" max="100" step="1" value="35"></label><label>Pop-up entrée / sortie (s)<input id="scene-popup" type="number" min=".05" max="3" step=".05" value=".25"></label><label>Fond vidéo trop court<select id="scene-short"><option value="freeze">Geler la dernière image</option><option value="loop">Boucler la vidéo</option></select></label></div>
 <button type="button" id="scene-focus">◎ Cibler le zoom sur le fond</button><div id="scene-focus-panel" hidden><p>Touchez le point à garder comme centre du zoom.</p><canvas id="scene-focus-canvas" aria-label="Touchez le point du fond vers lequel zoomer"></canvas></div><button type="button" id="scene-focus-reset">Revenir au zoom centré</button>
 <label class="scene-check"><input id="scene-continuity" type="checkbox"> Continuer le PIP précédent si sa pose est identique</label><details><summary>Options avancées · cadrage et audio</summary><div class="scene-grid"><label>Position X du fond (%)<input id="scene-bg-offset-x" type="number" min="-100" max="100" step="1" value="0"></label><label>Position Y du fond (%)<input id="scene-bg-offset-y" type="number" min="-100" max="100" step="1" value="0"></label><label>Taille du fond (%)<input id="scene-bg-zoom" type="number" min="10" max="500" step="1" value="100"></label></div><p>0 / 0 centre le fond. 100 % remplit le cadre ; l’auto zoom s’ajoute à ce cadrage.</p><label>Position verticale du visage · écran partagé<input id="scene-face-y" type="range" min="10" max="75" value="47"></label><label>Hauteur de la bande visage (%)<input id="scene-face-height" type="range" min="20" max="50" value="30"></label><label>Cadrage horizontal du fond<input id="scene-bg-x" type="range" min="0" max="100" value="50"></label><label>Cadrage vertical du fond<input id="scene-bg-y" type="range" min="0" max="100" value="50"></label><label class="scene-check"><input id="scene-voice" type="checkbox" checked> Garder ma voix</label><label class="scene-check"><input id="scene-visual-audio" type="checkbox"> Entendre le fond vidéo / l’extrait</label><p>Activez seulement l’extrait si vous voulez l’écouter sans votre narration. Un gel de fin est silencieux.</p></details>
 <details><summary>Mes compositions · disponibles dans tous mes projets V2</summary><select id="scene-presets" aria-label="Compositions personnelles"></select><button id="scene-load-preset">Utiliser cette composition</button><label>Nom de ma composition<input id="scene-composition-name" maxlength="100" placeholder="Moi incliné à gauche"></label><button id="scene-save-preset">Enregistrer la scène sélectionnée</button><p>Placez d’abord votre sujet avec les doigts ou « Modifier clip », puis enregistrez. Le prochain passage peut avoir une autre durée.</p></details>
 <p id="scene-status" role="status"></p><footer><button id="scene-apply" class="scene-cta">Appliquer au passage</button></footer>`;document.body.appendChild(dialog);
 sceneById('scene-focus').onclick=openSceneFocus;
 sceneById('scene-focus-reset').onclick=()=>{sceneZoomFocus=null;closeSceneFocus();sceneById('scene-status').textContent='Zoom centré rétabli · pourcentage inchangé.';};
 dialog.addEventListener('close',closeSceneFocus);
 for(const id of ['scene-mode','scene-face-height','scene-bg-zoom','scene-bg-offset-x','scene-bg-offset-y','scene-bg-x','scene-bg-y'])sceneById(id).addEventListener('input',closeSceneFocus);
 sceneById('scene-close').onclick=()=>dialog.close();sceneById('illustrate-btn').onclick=openSceneEditor;
 sceneById('scene-advanced-btn').onclick=()=>{const advanced=document.body.classList.toggle('v2-advanced');sceneById('scene-advanced-btn').setAttribute('aria-expanded',String(advanced));sceneById('scene-advanced-btn').textContent=advanced?'Masquer les outils':'Tous les outils';};
 sceneById('scene-media').onchange=e=>{if(e.target.value==='__gallery__'){e.target.value=e.target.dataset.previous||'';sceneById('scene-import').click();}else{e.target.dataset.previous=e.target.value;renderSceneGallery(e.target.value);}};
 sceneById('scene-add-media').onclick=()=>sceneById('scene-import').click();
 sceneById('scene-import').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||sceneMediaBusy)return;sceneMediaBusy=true;sceneById('scene-apply').disabled=true;sceneById('scene-status').textContent='Lecture du média…';
  try{const media=await importSceneMedia(file);sceneMediaOptions(media.id);sceneById('scene-status').textContent=media.reusedFromGallery?'✓ Déjà importé · média existant sélectionné, aucun doublon ajouté.':'Média prêt · appliquez la scène pour le lier à votre narration.';}catch(err){sceneById('scene-status').textContent=err.message;}finally{sceneMediaBusy=false;sceneById('scene-apply').disabled=false;}
 };
 sceneById('scene-apply').onclick=()=>{
  try{const config=sceneConfig();if(!Number.isFinite(config.zoom)||config.zoom<0||config.zoom>100||!Number.isFinite(config.popup)||config.popup<.05||config.popup>3)throw Error('Zoom entre 0 et 100 %, pop-up entre 0,05 et 3 s.');
   if(!Number.isFinite(config.bgZoom)||config.bgZoom<10||config.bgZoom>500||![config.bgOffsetX,config.bgOffsetY].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))throw Error('Taille du fond : 10 à 500 %, positions : −100 à 100 %.');const targets=SceneEngine.apply(Number(sceneById('scene-from').value),Number(sceneById('scene-to').value),config,editingSceneId,clipTrack(selectedNarration()[0]||{trackIndex:0}));
   if(sceneComposition)SceneEngine.applyComposition({...sceneComposition,settings:{...sceneComposition.settings,...config}},targets);
   clearMultiSelection();syncMediaStatus();renderMediaLibrary();commitMontage();state.currentTime=Number(sceneById('scene-from').value);renderCanvasFrame();dialog.close();
   const ai=targets.find(c=>c.aiBackgroundRemoval);if(ai)primeClipCutout(ai).catch(e=>showToast(e.message));showToast(config.mode==='face'?'Retour face caméra.':'Scène liée à votre narration.');
  }catch(e){sceneById('scene-status').textContent=e.message;}
 };
 sceneById('scene-face-btn').onclick=()=>{
  const clips=selectedNarration();if(!clips.length)return showToast('Sélectionnez un passage de la piste principale.');pausePlayback();
  for(const c of clips){const run=c.scene&&SceneEngine.runs(state.timeline).find(r=>r.clips.some(x=>x.id===c.id));const targets=run?.clips||[c];for(const part of targets)SceneEngine.apply(part.timelineStart,SceneEngine.end(part),{mode:'face'},null,clipTrack(part));}
  commitMontage();
 };
 sceneById('scene-save-preset').onclick=async()=>{
  try{const name=sceneById('scene-composition-name').value.trim();if(!name)throw Error('Donnez un nom à la composition.');const c=state.timeline.find(c=>c.id===state.activeClipId);await storePreset(SceneEngine.composition(c,name));await refreshScenePresets();sceneById('scene-status').textContent='Composition « '+name+' » enregistrée localement.';}catch(e){sceneById('scene-status').textContent=e.message;}
 };
 sceneById('scene-load-preset').onclick=()=>{const p=sceneRecords.find(x=>x.id===sceneById('scene-presets').value);if(!p)return;const media=sceneById('scene-media').value;fillSceneConfig({...p.settings,visualMediaId:media});sceneComposition=p;sceneById('scene-status').textContent='« '+p.name+' » sera adaptée à ce passage, avec votre illustration actuelle.';};
 renderSceneStrip();
});
