const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const context={structuredClone,crypto,window:{},state:{timeline:[],groups:{},mediaFiles:[{id:'voice',type:'video',element:{videoWidth:720,videoHeight:1280},duration:10},{id:'bg',type:'image',element:{naturalWidth:720,naturalHeight:1280}}]},document:{addEventListener(){}},clipTrack:c=>c.trackIndex??0};
vm.createContext(context);for(const file of ['animations.js','scenes.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function reverse(c,start,duration,edge){
 const pose=context.layerPose(c),angle=pose.rotation*Math.PI/180,axis={x:-Math.sin(angle),y:Math.cos(angle)};
 for(const progress of [0,.1,.25,.5,.75,.9,1]){
  const incoming=context.animatedClip(c,start+edge*progress),outgoing=context.animatedClip(c,start+duration-edge*progress),out=context.layerPose(outgoing);
  near(incoming.width,outgoing.width);near(incoming.height,outgoing.height);near(incoming.x,outgoing.x);near(incoming.y,outgoing.y);near(incoming.opacity,outgoing.opacity);
  const dx=out.centerX-pose.centerX,dy=out.centerY-pose.centerY;
  near(dx*axis.y-dy*axis.x,0);assert(dx*axis.x+dy*axis.y>=-1e-7,'sortie selon l’axe local');
 }
 const early=context.animatedClip(c,start+duration-edge*.8),p=context.layerPose(early);
 assert(Math.hypot(p.centerX-pose.centerX,p.centerY-pose.centerY)>10,'translation visible dès le début du pop-out');
 assert(early.scale>=c.scale,'le sujet commence à se déplacer avant de devenir minuscule');
 const last=context.animatedClip(c,start+duration);assert.equal(last.opacity,0);assert(last.width<c.width*.002);
 const mid=context.animatedClip(c,start+duration/2);near(mid.width,c.width);near(mid.x,c.x);near(mid.y,c.y);
}
for(const rotation of [0,25,-25,45,-45,135,-135,180]){
 const c={id:'a',mediaId:'voice',type:'video',trackIndex:0,startTime:0,endTime:4,timelineStart:2,...context.fullHeightPose(720,1280),rotation,popUp:{enabled:true,duration:.25}};
 const before=JSON.stringify(c);reverse(c,2,4,.25);assert.equal(JSON.stringify(c),before);
}
// Illustrer: one animation over the entire scene, including a technical cut.
const E=context.window.SceneEngine;
for(const layout of ['left','right','straight-left','straight-right','top-left','top-right']){
 context.state.timeline=[{id:'voice',mediaId:'voice',type:'video',trackIndex:0,startTime:0,endTime:4,timelineStart:0,...context.fullHeightPose(720,1280)}];
 const c=E.apply(0,4,{mode:'pip',layout,visualMediaId:'bg',popup:.25})[0];reverse(c,0,4,.25);
 const left={...structuredClone(c),endTime:2},right={...structuredClone(c),id:'right',startTime:2,timelineStart:2};context.retainSplitAnimation(c,left,right);context.state.timeline=[left,right];
 const rendered=E.expand(context.state.timeline).filter(x=>x.scene);
 assert(rendered.every(x=>x.animationStart===0&&x.animationDuration===4));
 const end=context.animatedClip(rendered[1],3.8),pose=context.layerPose(end),original=context.layerPose(c);
 assert(Math.hypot(pose.centerX-original.centerX,pose.centerY-original.centerY)>10,'Illustrer garde la translation après division');
 const middle=context.animatedClip(rendered[1],2);near(middle.scale,c.scale);
}
const short={id:'short',trackIndex:0,startTime:0,endTime:.2,timelineStart:0,...context.fullHeightPose(720,1280),rotation:45,popUp:{enabled:true,duration:.25}};reverse(short,0,.2,.1);
console.log('PASS: pop-out inverse du pop-in (translation, taille, opacité), 8 angles, 6 placements Illustrer, continuité après division, clip court, pose et sources conservées.');
