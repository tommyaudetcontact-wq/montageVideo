'use strict';
// Preserve composited RGB code values; explicitly convert to limited-range BT.709 I420.
// Never relabel RGB bytes as YUV or change the source video's range flags.
function rgbaToRec709I420(rgba,width,height,out=new Uint8Array(width*height*3/2)){
 if(width%2||height%2||rgba.length!==width*height*4||out.length!==width*height*3/2)throw Error('Dimensions I420 invalides.');
 const n=width*height,uv=n/4;
 for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
  let rsum=0,gsum=0,bsum=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const at=(y+dy)*width+x+dx,p=at*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];rsum+=r;gsum+=g;bsum+=b;
   out[at]=Math.max(16,Math.min(235,Math.round(16+.182586*r+.614231*g+.062007*b)));
  }
  const i=(y/2)*(width/2)+x/2,r=rsum/4,g=gsum/4,b=bsum/4;
  out[n+i]=Math.max(16,Math.min(240,Math.round(128-.100644*r-.338572*g+.439216*b)));
  out[n+uv+i]=Math.max(16,Math.min(240,Math.round(128+.439216*r-.398942*g-.040274*b)));
 }
 return out;
}
function createExportSample(B,ctx,width,height,time,duration,buffer){
 const rgba=ctx.getImageData(0,0,width,height,{colorSpace:'srgb'}).data;
 return new B.VideoSample(rgbaToRec709I420(rgba,width,height,buffer),{format:'I420',codedWidth:width,codedHeight:height,timestamp:time,duration,colorSpace:{primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false}});
}
