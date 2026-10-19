'use strict';
let workspaceSnapGuides=null;
function snapWorkspacePose(clip,resize=false,tolerance=8){
 if(state.workspaceSnap===false){workspaceSnapGuides=null;return;}
 const rotation=(clip.rotation||0)*Math.PI/180,c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation)),crop=normalizeCrop(clip.crop),r=cropRectangle(crop);
 let w=clip.width*r.w,h=clip.height*r.h,bw=w*c+h*s,bh=w*s+h*c;const guides={};
 if(resize){const dw=Math.abs(bw-workspaceWidth()),dh=Math.abs(bh-workspaceHeight());let factor=1;
   if(dw<=tolerance&&(dw<=dh||dh>tolerance)){factor=workspaceWidth()/bw;guides.width=true;}
   else if(dh<=tolerance){factor=workspaceHeight()/bh;guides.height=true;}
   if(factor!==1&&Number.isFinite(factor)){const pose=layerPose(clip);applyPose(clip,{...pose,scale:pose.scale*factor});w=clip.width*r.w;h=clip.height*r.h;bw=w*c+h*s;bh=w*s+h*c;}
 }
 const pose=layerPose(clip),ox=(r.x+r.w/2-.5)*clip.width,oy=(r.y+r.h/2-.5)*clip.height,centerX=pose.centerX+ox*Math.cos(rotation)-oy*Math.sin(rotation),centerY=pose.centerY+ox*Math.sin(rotation)+oy*Math.cos(rotation);
 if(Math.abs(centerX-workspaceWidth()/2)<=tolerance){clip.x+=workspaceWidth()/2-centerX;guides.x=true;}
 if(Math.abs(centerY-workspaceHeight()/2)<=tolerance){clip.y+=workspaceHeight()/2-centerY;guides.y=true;}
 workspaceSnapGuides=guides;return guides;
}
function drawWorkspaceSnap(){if(!workspaceSnapGuides||state.workspaceSnap===false)return;const g=workspaceSnapGuides,ctx=canvasCtx;ctx.save();ctx.strokeStyle='#56ffdc';ctx.lineWidth=Math.max(2,mainCanvas.width/250);ctx.setLineDash([mainCanvas.width/40,mainCanvas.width/60]);ctx.beginPath();if(g.x){ctx.moveTo(mainCanvas.width/2,0);ctx.lineTo(mainCanvas.width/2,mainCanvas.height);}if(g.y){ctx.moveTo(0,mainCanvas.height/2);ctx.lineTo(mainCanvas.width,mainCanvas.height/2);}ctx.stroke();if(g.width||g.height){ctx.setLineDash([]);ctx.strokeRect(3,3,mainCanvas.width-6,mainCanvas.height-6);ctx.fillStyle='#56ffdc';ctx.font=`${Math.round(mainCanvas.width/23)}px sans-serif`;ctx.fillText(g.width?'↔ Largeur alignée':'↕ Hauteur alignée',20,mainCanvas.height-24);}ctx.restore();}
function refreshWorkspaceSnap(){const button=document.getElementById('workspace-snap-btn');if(button){button.setAttribute('aria-pressed',String(state.workspaceSnap!==false));button.textContent=state.workspaceSnap===false?'⊕ Snap scène OFF':'⊕ Snap scène';}}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('workspace-snap-btn').onclick=()=>{state.workspaceSnap=state.workspaceSnap===false;workspaceSnapGuides=null;refreshWorkspaceSnap();renderCanvasFrame();window.PocketCutSession?.schedule();};refreshWorkspaceSnap();});
