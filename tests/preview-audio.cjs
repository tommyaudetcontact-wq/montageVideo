const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),audios=[];let resumeCalls=0;
class Audio extends EventTarget{
 constructor(){super();this.readyState=0;this.seeking=false;this.paused=true;this._time=0;this.loads=0;this.plays=0;this.seeks=0;}
 load(){this.loads++;if(!this.src)return;setTimeout(()=>{this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'));},5);setTimeout(()=>{this.readyState=4;this.dispatchEvent(new Event('loadeddata'));this.dispatchEvent(new Event('canplay'));},35);}
 set currentTime(t){this.seeks++;this._time=t;this.seeking=true;setTimeout(()=>{this.seeking=false;this.dispatchEvent(new Event('seeked'));},8);}get currentTime(){return this._time;}
 play(){this.plays++;this.paused=false;return new Promise(r=>setTimeout(r,25));}pause(){this.paused=true;}removeAttribute(){this.src='';}
}
const audioContext={state:'suspended',destination:{},async resume(){resumeCalls++;await sleep(12);this.state='running';},createMediaElementSource(){return{connect(){},disconnect(){}};},createGain(){return{gain:{value:1},connect(){},disconnect(){}};}};
const state={mediaFiles:[{id:'m',url:'blob:source',file:{}}],timeline:[],isPlaying:false,currentTime:0};
const ctx={Map,Set,Promise,Error,DOMException,setTimeout,clearTimeout,setInterval,clearInterval,performance:{now:()=>0},state,getAudioContext:()=>audioContext,loadMediaLibrary:async()=>({Input:class{async getPrimaryAudioTrack(){return state.mediaFiles[0].silent?null:{};}dispose(){}},ALL_FORMATS:[]}),makeMediaBlobSource:()=>({}),document:{createElement(){const a=new Audio();audios.push(a);return a;}},window:{},showToast(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../preview-audio.js'),'utf8'),ctx);
(async()=>{
 const c={id:'clip',mediaId:'m',type:'video',startTime:.25,endTime:2,timelineStart:0,volume:1.5};state.timeline=[c];
 let ready=false;const prep=ctx.preparePreviewAudio([c],0).then(()=>ready=true);await sleep(15);assert.equal(ready,false,'do not start while audio is loading');await prep;assert(resumeCalls>0);assert.equal(audios[0].preload,'auto');assert.equal(audios[0].currentTime,.25,'start at trimmed source position');
 state.isPlaying=true;let played=false;const playing=ctx.startPreviewAudio([c],0).then(()=>played=true);await sleep(5);assert.equal(played,false,'await actual play promise before timeline clock');const seeks=audios[0].seeks;ctx.syncPreviewAudio([c],.01);ctx.syncPreviewAudio([c],.02);assert.equal(audios[0].seeks,seeks,'never repeatedly seek a pending play');await playing;
 state.isPlaying=false;ctx.stopPreviewAudio();const count=audios.length,loads=audios[0].loads;await ctx.preparePreviewAudio([c],0);assert.equal(audios.length,count,'reuse audio node after pause');assert.equal(audios[0].loads,loads,'do not reload the file after pause');
 c.audioOffset=.5;state.isPlaying=true;const plays=audios[0].plays;await ctx.startPreviewAudio([c],0);assert.equal(audios[0].plays,plays,'preserve intentional audio delay');c.audioOffset=0;
 state.isPlaying=false;let valid=true;const cancelled=ctx.preparePreviewAudio([{...c,id:'cancel'}],0,()=>valid);await sleep(10);valid=false;await assert.rejects(()=>cancelled,e=>e.name==='AbortError');
 ctx.stopPreviewAudio();state.mediaFiles=[{id:'m',url:'blob:silent',file:{},silent:true}];const total=audios.length;await ctx.preparePreviewAudio([{...c,id:'silent'}],0);assert.equal(audios.length,total,'silent videos do not block playback');
 console.log('PASS: delayed decode/context/play readiness, exact trimmed start, no reseek while starting, pause reuse, intended offsets, cancellation and silent videos.');
 // Exercise the application's startPlayback clock barrier independently.
 let releaseAudio,releasePlay,visualStarts=0,clockStarts=0;
 const control={state:{timeline:[{type:'video',id:'v',mediaId:'m',timelineStart:0,startTime:0,endTime:2}],mediaFiles:[{id:'m'}],currentTime:0},isStartingPlayback:false,playbackRequest:0,playbackTimestamp:null,getAudioContext(){},getTotalDuration:()=>2,playText:{},playIcon:{},window:{preparePreviewAudio:()=>new Promise(r=>releaseAudio=r),startPreviewAudio:()=>new Promise(r=>releasePlay=r)},getPreviewOwner:c=>c,getClipVideo:()=>({pause(){},play(){visualStarts++;return Promise.resolve();}}),waitForPreviewData:async()=>{},seekVideo:async()=>{},greenScreenProcessor:{},performance:{now:()=>100},Promise,requestAnimationFrame(){clockStarts++;return 1;},cancelAnimationFrame(){},animFrameId:0,playbackLoop(){},showToast:e=>{throw Error(e)},pausePlayback(){}};
 vm.createContext(control);const src=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');vm.runInContext(src.slice(src.indexOf('async function startPlayback('),src.indexOf('function getPreviewOwner(')),control);
 const start=control.startPlayback();await sleep(0);assert.equal(visualStarts,0);assert.equal(clockStarts,0);releaseAudio();await sleep(0);assert.equal(visualStarts,1);assert.equal(clockStarts,0);releasePlay();await start;assert.equal(clockStarts,1);assert.equal(control.state.currentTime,0);assert.equal(control.playbackTimestamp,100);
 console.log('PASS: picture waits for audio readiness; timeline starts only after audio and video play promises complete.');
})().catch(e=>{console.error(e);process.exitCode=1;});
