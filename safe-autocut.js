'use strict';
const SafeAutoCut=(()=>{
 function intervals(clip,bounds,{mode='last',padding=.15,gap=.6}={}){
  if(!bounds.length)return [{start:clip.startTime,end:clip.endTime}];
  let voiced=bounds.filter(b=>b.end>clip.startTime&&b.start<clip.endTime).map(b=>({start:Math.max(clip.startTime,b.start-.08),end:Math.min(clip.endTime,b.end+padding)})).sort((a,b)=>a.start-b.start);
  if(!voiced.length)return [{start:clip.startTime,end:clip.endTime}];
  if(mode==='last')return [voiced.at(-1)];
  const merged=[];
  for(const b of voiced){const previous=merged.at(-1);if(previous&&b.start-previous.end<gap){previous.end=Math.max(previous.end,b.end);}else merged.push({...b});}
  return merged;
 }
 function takeStart(words,clip){
  const tokens=words.filter(w=>w.end>clip.startTime&&w.start<clip.endTime&&w.end>w.start).map(w=>({...w,token:w.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')})).filter(w=>w.token);
  let restart=null;
  for(let j=1;j<tokens.length;j++)for(let i=Math.max(0,j-45);i<j;i++){
   if(i>3&&tokens[i].start-tokens[i-1].end<.6&&tokens[i].start!==restart)continue;
   let length=0,letters=0;while(i+length<j&&j+length<tokens.length&&tokens[i+length].token===tokens[j+length].token&&length<10){letters+=tokens[i+length].token.length;length++;}
   const shortRestart=length>=2&&letters>=6&&tokens[j].start-tokens[i].start<1.8&&j-i<=length+1;
   if(!(length>=3&&letters>=10)&&!shortRestart)continue;
   if(tokens[j].start<=tokens[i].start+.18||tokens[j].start-tokens[j-1].end<.06)continue;
   // A later matching opening must still have enough words to complete the take.
   if(tokens.length-j<Math.min(j-i,6)||j-i>length+12)continue;
   restart=Math.max(restart??clip.startTime,tokens[j].start);
  }
  return restart;
 }
 function takeInterval(clip,bounds,words,padding=.15){
  if(!bounds.length)return {start:clip.startTime,end:clip.endTime};
  const start=takeStart(words,clip);if(start===null)return intervals(clip,bounds,{mode:'last',padding})[0];
  const spoken=words.filter(w=>w.end>w.start&&w.start>=start-.001&&w.start<clip.endTime),last=spoken.at(-1);
  return {start:Math.max(clip.startTime,start-.08),end:Math.min(clip.endTime,Math.max(last?.end||start,...bounds.filter(b=>b.end>start&&b.start<clip.endTime).map(b=>b.end))+padding)};
 }
 function applyPlan(timeline,plans){
  const result=[];
  for(const c of timeline){const keep=plans.get(c.id);if(!keep){result.push(c);continue;}
   for(const range of keep){const copy=structuredClone(c);copy.id='clip_'+crypto.randomUUID();copy.startTime=range.start;copy.endTime=range.end;copy.timelineStart=(c.timelineStart||0)+range.start-c.startTime;if(copy.scene)copy.scene.visualSourceOffset=(c.scene.visualSourceOffset||0)+range.start-c.startTime;
    const animation=animationRange(c);copy.animationStart=animation.start;copy.animationDuration=animation.duration;result.push(copy);
   }
  }
  return result;
 }
 return {intervals,applyPlan,takeStart,takeInterval};
})();
window.SafeAutoCut=SafeAutoCut;
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),dialog=document.createElement('dialog');dialog.id='clean-dialog';dialog.innerHTML=`
 <header><div><small>VOTRE NARRATION D’ABORD</small><h2>Nettoyer les prises</h2></div><button id="clean-close" aria-label="Fermer le nettoyage">✕</button></header>
 <p>Vérifiez la proposition avant de couper. Les scènes suivent les morceaux conservés.</p>
 <label>Portée<select id="clean-scope"><option value="selected">Clips principaux sélectionnés</option><option value="all">Toute la narration</option></select></label>
 <label>Action<select id="clean-mode"><option value="last">Dernière prise · reconnaître les recommencements</option><option value="silences">Retirer les pauses intérieures · optionnel</option></select></label>
 <div class="scene-grid"><label>Marge après la voix (s)<input id="clean-padding" type="number" min="0" max="2" step=".01" value=".15"></label><label>Pause intérieure à supprimer (s)<input id="clean-gap" type="number" min=".6" max="5" step=".1" value=".6"></label></div>
 <label><input id="clean-recognize" type="checkbox" checked> Reconnaître les phrases recommencées (modèle téléchargé à la première utilisation)</label><p id="clean-warning">Dernière prise : repère les débuts de phrases répétés, puis protège les syllabes de la prise conservée. La voix reste sur cet appareil.</p>
 <button id="clean-analyze" class="scene-cta">Analyser sans modifier</button><div id="clean-results"></div><p id="clean-status" role="status"></p><footer><button id="clean-apply" class="scene-cta" disabled>Appliquer les coupes proposées</button></footer>`;document.body.appendChild(dialog);
 let plans=new Map(),snapshot='',generation=0;
 function open(){byId('clean-mode').value='last';pausePlayback();plans.clear();byId('clean-results').replaceChildren();byId('clean-apply').disabled=true;byId('clean-status').textContent='Aucune coupe ne sera faite avant votre validation.';byId('clean-scope').value=selectedNarration().length?'selected':'all';dialog.showModal();}
 let classicBusy=false;
 async function classic(clips=selectedNarration()){
  if(classicBusy||exporting)return;const targets=clips.filter(c=>c.type==='video');if(!targets.length)return showToast('Sélectionnez une vidéo principale.');
  pausePlayback();classicBusy=true;window.autoCutRecognizing=true;byId('clean-narration-btn').disabled=true;const before=JSON.stringify(state.timeline),proposals=new Map();let cancelled=false,fallbacks=0;
  const panel=document.createElement('aside');panel.id='autocut-progress';panel.setAttribute('role','status');const status=document.createElement('span'),cancel=document.createElement('button');cancel.textContent='Annuler';cancel.onclick=()=>{cancelled=true;TakeRecognition.cancel();};panel.append(status,cancel);document.body.appendChild(panel);
  const entered=Number(byId('clean-padding').value),padding=Number.isFinite(entered)?Math.max(0,Math.min(2,entered)):.15;
  try{
   for(let i=0;i<targets.length;i++){
    if(cancelled)throw new DOMException('AutoCut annulé.','AbortError');const c=targets[i],media=state.mediaFiles.find(m=>m.id===c.mediaId);if(!media)continue;
    status.textContent='AutoCut '+(i+1)+'/'+targets.length+' · '+media.file.name;await analyzeMediaSpeech(media);
    let words=[];
    if(byId('clean-recognize').checked&&media.speechBounds?.length&&!media.audioAbsent)try{words=await TakeRecognition.wordsFor(media,message=>status.textContent='AutoCut '+(i+1)+'/'+targets.length+' · '+message);}catch(e){if(cancelled||e.name==='AbortError')throw e;fallbacks++;}
    proposals.set(c.id,SafeAutoCut.takeInterval(c,media.speechBounds||[],words,padding));
   }
   if(cancelled)throw new DOMException('AutoCut annulé.','AbortError');if(JSON.stringify(state.timeline)!==before)throw Error('Le montage a changé pendant l’analyse : aucune coupe appliquée.');
   let changed=0;for(const c of targets){const r=proposals.get(c.id);if(!r)continue;const delta=r.start-c.startTime;c.startTime=r.start;c.endTime=r.end;if(c.scene)c.scene.visualSourceOffset=(c.scene.visualSourceOffset||0)+delta;changed++;}
   recalculateTimelinePositions();state.currentTime=Math.min(state.currentTime,getTotalDuration());commitMontage();showToast('AutoCut · '+changed+' clip(s) ajustés.'+(fallbacks?' Reconnaissance indisponible sur '+fallbacks+' clip(s) : découpe sonore utilisée.':''));
  }catch(e){showToast(e.name==='AbortError'?'AutoCut annulé · montage conservé.':'AutoCut : '+e.message);}finally{classicBusy=false;window.autoCutRecognizing=false;byId('clean-narration-btn').disabled=false;panel.remove();}
 }
 window.openSafeAutoCut=classic;window.openAutoCutSettings=open;
 const main=byId('clean-narration-btn');main.textContent='✂ AutoCut';main.classList.add('holdable');main.title='Cliquer : conserver la dernière prise · Maintenir : options';let holdTimer,held=false;
 main.onpointerdown=e=>{if(e.button!==0)return;held=false;holdTimer=setTimeout(()=>{held=true;open();},450);};for(const name of ['pointerup','pointercancel','pointerleave'])main.addEventListener(name,()=>clearTimeout(holdTimer));
 main.onclick=()=>{if(held){held=false;return;}classic();};main.oncontextmenu=e=>{e.preventDefault();clearTimeout(holdTimer);held=true;open();};
 byId('clean-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{generation++;pausePlayback();});
 byId('clean-mode').onchange=()=>{byId('clean-warning').textContent=byId('clean-mode').value==='last'?'Recherche des débuts de phrases répétés. Vérifiez la proposition : la reconnaissance peut se tromper.':'Retire les pauses intérieures sans rechercher la dernière prise.';invalidate();};
 function invalidate(){generation++;plans.clear();byId('clean-apply').disabled=true;byId('clean-status').textContent='Paramètres modifiés · relancez l’analyse.';}
 for(const id of ['clean-scope','clean-padding','clean-gap'])byId(id).oninput=invalidate;
 byId('clean-analyze').onclick=async()=>{
  if(classicBusy||exporting)return;
  const token=++generation;byId('clean-analyze').disabled=true;byId('clean-apply').disabled=true;plans=new Map();snapshot=JSON.stringify(state.timeline);
  const targets=(byId('clean-scope').value==='all'?state.timeline:selectedNarration()).filter(c=>clipTrack(c)===0&&c.type==='video');
  const options={mode:byId('clean-mode').value,padding:Number(byId('clean-padding').value),gap:Number(byId('clean-gap').value)};
  try{
   if(!targets.length)throw Error('Sélectionnez une vidéo principale ou choisissez toute la narration.');
   if(!Number.isFinite(options.padding)||options.padding<0||options.padding>2||!Number.isFinite(options.gap)||options.gap<.6||options.gap>5)throw Error('Marge de 0 à 2 s, pause de 0,6 à 5 s.');
   const list=byId('clean-results');list.replaceChildren();let removed=0;
   for(let i=0;i<targets.length;i++){
    if(token!==generation)return;const c=targets[i],m=state.mediaFiles.find(m=>m.id===c.mediaId);if(!m)throw Error('Média manquant.');byId('clean-status').textContent='Analyse '+(i+1)+'/'+targets.length+' · '+m.file.name;
    await analyzeMediaSpeech(m);if(token!==generation)return;
    let words=[];if(options.mode==='last'&&byId('clean-recognize').checked)words=await TakeRecognition.wordsFor(m,message=>byId('clean-status').textContent=message);if(token!==generation)return;
    const ranges=options.mode==='last'?[SafeAutoCut.takeInterval(c,m.speechBounds||[],words,options.padding)]:SafeAutoCut.intervals(c,m.speechBounds||[],options),kept=ranges.reduce((sum,r)=>sum+r.end-r.start,0),cut=SceneEngine.duration(c)-kept;
    if(cut>.005){plans.set(c.id,ranges);removed+=cut;}
    const row=document.createElement('section'),title=document.createElement('strong'),detail=document.createElement('p'),listen=document.createElement('button');
    title.textContent=m.file.name;detail.textContent=(m.speechBounds?.length?cut.toFixed(2)+' s retirées · '+ranges.length+' passage(s) conservé(s)':'Voix non détectée · clip conservé intégralement')+' · '+ranges.map(r=>r.start.toFixed(2)+'–'+r.end.toFixed(2)+' s source').join(' / ');
    listen.textContent='▶ Écouter l’original';listen.onclick=()=>{pausePlayback();state.currentTime=c.timelineStart||0;renderCanvasFrame();startPlayback({stopAt:SceneEngine.end(c)});};row.append(title,detail,listen);list.appendChild(row);
   }
   byId('clean-status').textContent=plans.size?plans.size+' clip(s) proposés · '+removed.toFixed(2)+' s retirées. Vérifiez les intervalles avant d’appliquer.':'Aucune coupe proposée.';byId('clean-apply').disabled=!plans.size;
  }catch(e){byId('clean-status').textContent=e.message;}finally{byId('clean-analyze').disabled=false;}
 };
 byId('clean-apply').onclick=()=>{
  if(JSON.stringify(state.timeline)!==snapshot){invalidate();return;}
  pausePlayback();state.timeline=SafeAutoCut.applyPlan(state.timeline,plans);recalculateTimelinePositions();state.activeClipId=state.timeline.find(c=>clipTrack(c)===0)?.id||null;state.currentTime=Math.min(state.currentTime,getTotalDuration());clearMultiSelection();commitMontage();dialog.close();showToast('Coupes appliquées · Annuler reste disponible.');
 };
 // Capture legacy AutoCut commands so no destructive last-block shortcut remains in V2.
 for(const id of ['btn-autocut-clip','autocut-all'])byId(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();classic(id==='autocut-all'?state.timeline.filter(c=>clipTrack(c)===0):editTargets());},true);
});
