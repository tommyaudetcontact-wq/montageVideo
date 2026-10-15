'use strict';
let projectSwitching=false;
function emptyNamedProject(name){
 const id='project_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
 const live={timeline:[],groups:{},activeClipId:null,projectWidth:720,projectHeight:1280};
 return {id,name:name.trim(),version:1,savedAt:Date.now(),live,currentTime:0,isSnapping:true,mediaIds:[],historyStack:[JSON.stringify(live)],historyIndex:0,settings:{'ai-threshold':'0.5','ai-softness':'0.12','ai-quality':'balanced','export-resolution':'source','export-fps':'0','workspace-format':'9:16'}};
}
async function openNamedProject(id,skipSave=false){
 if(pendingMediaImports.size){showToast('Attendez la fin de l’importation avant de changer de projet.');return false;}
 if(projectSwitching)return false;projectSwitching=true;
 const overlay=document.getElementById('session-loading');overlay.hidden=false;overlay.textContent='Ouverture du projet…';
 try{
   if(!skipSave&&!await saveLocalProject())throw lastSaveProblem||Error('Sauvegardez le montage actuel avant de changer de projet.');
   const saved=await localRead('projects',id);if(!saved)throw Error('Projet introuvable.');
   localReady=false;clearTimeout(localTimer);clearTimeout(localCursorTimer);
   await restoreProjectSnapshot(saved);
   await localTransaction('meta','readwrite',tx=>tx.objectStore('meta').put(id,'activeProject'));
   localReady=true;document.getElementById('tool-dialog').close();return true;
 }catch(e){localReady=!!currentProjectId;showToast(e.message);return false;}
 finally{projectSwitching=false;overlay.hidden=true;}
}
async function createNamedProject(name){
 if(pendingMediaImports.size)throw Error('Attendez la fin de l’importation avant de créer un projet.');
 if(!name.trim())throw Error('Donnez un nom au nouveau projet.');
 if(!await saveLocalProject())throw lastSaveProblem||Error('La sauvegarde du montage actuel a échoué.');
 const project=emptyNamedProject(name);await localTransaction('projects','readwrite',tx=>tx.objectStore('projects').put(project,project.id));
 await openNamedProject(project.id,true);return project.id;
}
window.PocketCutProjects={list:async()=>(await localAll('projects')).filter(p=>p.id).sort((a,b)=>b.savedAt-a.savedAt),open:openNamedProject,create:createNamedProject,get activeId(){return currentProjectId;},get name(){return currentProjectName;}};
window.initProjectControls=()=>{
 const byId=id=>document.getElementById(id);
 async function refresh(){
   byId('current-project-name').textContent='Projet ouvert : '+currentProjectName;byId('project-name').value=currentProjectName;
   const list=byId('project-list');list.replaceChildren();
   for(const project of await PocketCutProjects.list()){
     const button=document.createElement('button');button.type='button';button.className='project-item';button.dataset.projectId=project.id;
     const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=project.name;
     detail.textContent=(project.id===currentProjectId?'Ouvert · ':'')+(project.live.timeline.length)+' clips · '+new Date(project.savedAt).toLocaleString('fr-CA',{dateStyle:'short',timeStyle:'short'});
     button.append(title,detail);button.onclick=()=>openNamedProject(project.id);list.appendChild(button);
   }
 }
 byId('projects-btn').onclick=async()=>{try{await saveLocalProject();await refresh();window.openPocketCutTool('Mes projets',[byId('project-settings')]);}catch(e){showToast(e.message);}};
 byId('new-project').onclick=async()=>{try{byId('new-project').disabled=true;await createNamedProject(byId('project-name').value);}catch(e){byId('project-status').textContent=e.message;}finally{byId('new-project').disabled=false;}};
 byId('rename-project').onclick=async()=>{
   const name=byId('project-name').value.trim();if(!name)return byId('project-status').textContent='Donnez un nom au projet.';
   const previous=currentProjectName;currentProjectName=name;
   if(!await saveLocalProject()){currentProjectName=previous;return;}
   document.getElementById('projects-btn').title='Projet ouvert : '+name;await refresh();byId('project-status').textContent='Projet renommé et sauvegardé.';
 };
};
