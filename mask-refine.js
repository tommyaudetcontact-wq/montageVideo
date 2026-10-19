'use strict';
// Linear-time box mean with cropped windows at image borders.
function maskBoxMean(values,width,height,radius) {
  const temp=new Float32Array(values.length),out=new Float32Array(values.length);
  for(let y=0;y<height;y++) {
    let sum=0;for(let x=0;x<=Math.min(radius,width-1);x++)sum+=values[y*width+x];
    for(let x=0;x<width;x++) {temp[y*width+x]=sum/(Math.min(width-1,x+radius)-Math.max(0,x-radius)+1);if(x-radius>=0)sum-=values[y*width+x-radius];if(x+radius+1<width)sum+=values[y*width+x+radius+1];}
  }
  for(let x=0;x<width;x++) {
    let sum=0;for(let y=0;y<=Math.min(radius,height-1);y++)sum+=temp[y*width+x];
    for(let y=0;y<height;y++) {out[y*width+x]=sum/(Math.min(height-1,y+radius)-Math.max(0,y-radius)+1);if(y-radius>=0)sum-=temp[(y-radius)*width+x];if(y+radius+1<height)sum+=temp[(y+radius+1)*width+x];}
  }
  return out;
}
// Grayscale guided filter: refine the soft mask using real image edges.
function refineMaskAlpha(mask,rgb,width,height,radius,threshold,softness) {
  const n=width*height,I=new Float32Array(n),p=new Float32Array(n),II=new Float32Array(n),Ip=new Float32Array(n);
  for(let i=0;i<n;i++){I[i]=(rgb[i*4]*0.2126+rgb[i*4+1]*0.7152+rgb[i*4+2]*0.0722)/255;p[i]=mask[i*4]/255;II[i]=I[i]*I[i];Ip[i]=I[i]*p[i];}
  const meanI=maskBoxMean(I,width,height,radius),meanP=maskBoxMean(p,width,height,radius),corrI=maskBoxMean(II,width,height,radius),corrIp=maskBoxMean(Ip,width,height,radius);
  const a=new Float32Array(n),b=new Float32Array(n);
  for(let i=0;i<n;i++){a[i]=(corrIp[i]-meanI[i]*meanP[i])/(Math.max(0,corrI[i]-meanI[i]*meanI[i])+0.002);b[i]=meanP[i]-a[i]*meanI[i];}
  const ma=maskBoxMean(a,width,height,radius),mb=maskBoxMean(b,width,height,radius),rgba=new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++){const guided=Math.max(0,Math.min(1,ma[i]*I[i]+mb[i]));const confidence=p[i]>=.8?Math.max(p[i],guided):p[i]<=.2?Math.min(p[i],guided):Math.max(p[i]-.1,Math.min(p[i]+.1,guided));const t=Math.max(0,Math.min(1,(confidence-threshold+softness)/(2*Math.max(0.01,softness))));rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=255;rgba[i*4+3]=Math.round(t*t*(3-2*t)*255);}
  return cleanMaskIslands(rgba,width,height);
}
// Remove only tiny disconnected alpha islands; never keep just the largest person.
// Eight-connected components preserve diagonal hairs and narrow connected fingers.
function cleanMaskIslands(rgba,width,height) {
  const n=width*height,seen=new Uint8Array(n),queue=new Int32Array(n);
  const minimum=Math.max(4,Math.floor(n*.00006));
  for(let seed=0;seed<n;seed++){
    if(seen[seed]||rgba[seed*4+3]<12)continue;
    let head=0,tail=1;queue[0]=seed;seen[seed]=1;
    while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
        const next=yy*width+xx;if(!seen[next]&&rgba[next*4+3]>=12){seen[next]=1;queue[tail++]=next;}
      }
    }
    if(tail<minimum)for(let i=0;i<tail;i++)rgba[queue[i]*4+3]=0;
  }
  return rgba;
}
if(typeof window!=='undefined') window.POCKETCUT_MASK_SOURCE=maskBoxMean.toString()+';'+cleanMaskIslands.toString()+';'+refineMaskAlpha.toString()+';';
