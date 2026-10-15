'use strict';
let localOpening=null;
function openLocalDatabase(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('pocketcut-studio:'+new URL('.',location.href).pathname,2);
 let settled=false;const timer=setTimeout(()=>{settled=true;reject(Error('Ouverture du stockage local bloquée. Fermez les autres onglets PocketCut puis réessayez.'));},30000);
 request.onupgradeneeded=()=>{
   const db=request.result,tx=request.transaction;
   for(const name of ['projects','media','presets','meta'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,name==='media'||name==='presets'?{keyPath:'id'}:undefined);
   const legacy=tx.objectStore('projects').get('current');legacy.onsuccess=()=>{if(legacy.result&&!legacy.result.id){const id='project_migrated_'+Date.now().toString(36);tx.objectStore('projects').put({...legacy.result,id,name:'Mon premier montage'},id);tx.objectStore('meta').put(id,'activeProject');}};
 };
 request.onsuccess=()=>{
   clearTimeout(timer);const db=request.result;if(settled){db.close();return;}
   db.onversionchange=()=>{db.close();if(localDatabase===db)localDatabase=null;};
   db.onclose=()=>{if(localDatabase===db)localDatabase=null;};resolve(db);
 };
 request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error);};
 request.onblocked=()=>localStatus('Stockage occupé · fermez les autres onglets PocketCut');
});}
async function ensureLocalDatabase(){
 if(localDatabase)return localDatabase;
 if(!localOpening)localOpening=openLocalDatabase().then(db=>(localDatabase=db)).finally(()=>localOpening=null);
 return localOpening;
}
async function localTransaction(stores,mode,run){
 for(let attempt=0;attempt<3;attempt++){
   const db=await ensureLocalDatabase();
   try{return await new Promise((resolve,reject)=>{
     let result;const tx=db.transaction(stores,mode);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new DOMException('Transaction interrompue.','AbortError'));run(tx,value=>{result=value;});
   });}catch(e){
     const reconnect=['InvalidStateError','UnknownError','AbortError'].includes(e?.name)||/connection.*clos|database.*clos/i.test(e?.message||'');
     if(!reconnect||attempt===2)throw e;
     if(localDatabase===db)localDatabase=null;try{db.close();}catch{}
     await new Promise(r=>setTimeout(r,100*(attempt+1)));
   }
 }
}
function localRead(store,key){return localTransaction(store,'readonly',(tx,done)=>{const request=tx.objectStore(store).get(key);request.onsuccess=()=>done(request.result);});}
function localAll(store){return localTransaction(store,'readonly',(tx,done)=>{const request=tx.objectStore(store).getAll();request.onsuccess=()=>done(request.result);});}
function storePreset(preset){return localTransaction('presets','readwrite',tx=>tx.objectStore('presets').put(preset));}
