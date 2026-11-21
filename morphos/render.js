/* MORPHOS: hand-drawn, entirely procedural microscopy in Canvas 2D. */
(() => {
 'use strict';
 const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const rnd=n=>{let x=Math.imul(n^0x45d9f3b,0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return((x^(x>>>16))>>>0)/4294967296;};
 const rgba=(a,o=1)=>`rgba(${a[0]|0},${a[1]|0},${a[2]|0},${o})`;
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const idNumber=value=>{if(typeof value==='number')return value|0;let h=2166136261;for(const ch of String(value||'')){h=Math.imul(h^ch.charCodeAt(0),16777619);}return h|0;};
 const biomeIndex=value=>clamp(Math.floor(Number(value)||0),0,2);
 const palettes=[
  {deep:[5,24,29],light:[15,57,55],fluid:[87,161,130],plant:[58,133,102],edge:[105,220,174]},
  {deep:[20,26,31],light:[51,57,44],fluid:[157,150,89],plant:[151,133,66],edge:[236,193,108]},
  {deep:[17,15,35],light:[43,28,67],fluid:[113,85,164],plant:[109,55,137],edge:[198,139,232]}
 ];
 const creatureColours={grazer:[139,211,119],prey:[98,194,218],hunter:[237,110,103],armoured:[227,182,98],apex:[231,109,155],swarmer:[246,124,150],sentinel:[226,214,158],jelly:[164,184,246]};
 function smoothBlob(c,r,t,phase=0,stretch=1,rough=.06,points=16,lobes=3){
  const pts=[];
  for(let i=0;i<points;i++){const a=i/points*TAU,k=1+rough*Math.sin(a*lobes+t*1.1+phase)+rough*.6*Math.sin(a*(lobes+2)-t*.73+phase*1.8);pts.push([Math.cos(a)*r*k*stretch,Math.sin(a)*r*k]);}
  c.beginPath();c.moveTo((pts[0][0]+pts[points-1][0])*.5,(pts[0][1]+pts[points-1][1])*.5);
  for(let i=0;i<points;i++){const p=pts[i],q=pts[(i+1)%points];c.quadraticCurveTo(p[0],p[1],(p[0]+q[0])*.5,(p[1]+q[1])*.5);}c.closePath();
 }
 // One line-weight rule for every drawing: thicker for bigger bodies, but slower than their size grows.
 function ink(r){return 1.1*Math.pow(Math.max(4,r)/22,.7);}
 function ellipse(c,x,y,rx,ry,a=0){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),a,0,TAU);}
 function polygon(c,n,r,angle=0){c.beginPath();for(let i=0;i<n;i++){const a=angle+i*TAU/n;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();}
 function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 // However small or oddly shaped the screen, the view always reaches at least this far around you (in world units at
 // 1 cell; it grows with your body, as the camera does). Big screens already see further and keep their zoom.
 const MIN_SIGHT=260;
 class MorphosRenderer {
  constructor(canvas,alpha=false){
   this.reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
   this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha});
   if(!this.ctx)throw new Error('Canvas 2D is unavailable.');
   this.width=1;this.height=1;this.dpr=1;this.camera={x:0,y:0,zoom:1};this.started=false;this.manualZoomOut=false;this.lastWall=0;this.lastGameTime=0;this.seed='';this.biome=0;this.paletteWeights=[1,0,0];this.currentPalette=null;this.sceneFocus=0;this.decorDensity=1;this.moteDensity=1;this.glows=new Map();this.foodSprites={};this.decorSprites=new Map();
   for(const kind of ['algae','protein','mineral'])this.foodSprites[kind]=this.createFood(kind);
   this.grain=this.createGrain();this.cull={left:0,right:0,top:0,bottom:0};
  }
  resize(w,h,dpr=1){this.width=Math.max(1,w);this.height=Math.max(1,h);this.dpr=clamp(dpr,.5,2);this.canvas.width=Math.round(w*this.dpr);this.canvas.height=Math.round(h*this.dpr);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';}
  resetView(){this.started=false;}
  screenToWorld(x,y){return{x:this.camera.x+(x-this.width*.5)/this.camera.zoom,y:this.camera.y+(y-this.height*.5)/this.camera.zoom};}
  // Pictures made once and reused every frame (see the background's light pools and the vignette).
  _grad(c,key,make){const m=this._grads||(this._grads=new Map());if(this._gradCtx!==c){m.clear();this._gradCtx=c;}let g=m.get(key);if(!g){if(m.size>600){let n=120;for(const k of m.keys()){m.delete(k);if(--n<=0)break;}}g=make();m.set(key,g);}return g;}
  _poolSprite(col){
    const key=(Math.round(col[0]/24)<<16)|(Math.round(col[1]/24)<<8)|Math.round(col[2]/24),cache=this._pools||(this._pools=new Map());let cv=cache.get(key);if(cv)return cv;
    if(cache.size>=12){const [oldKey,old]=cache.entries().next().value;cache.delete(oldKey);cv=old;cv.getContext('2d').clearRect(0,0,128,128);}else{cv=document.createElement('canvas');cv.width=cv.height=128;}const g=cv.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,rgba(col,.055));gr.addColorStop(.5,rgba(col,.018));gr.addColorStop(1,rgba(col,0));g.fillStyle=gr;g.fillRect(0,0,128,128);cache.set(key,cv);return cv;
  }
  _vignetteSprite(w,h){
    const v=this._vig;if(v&&v.w===w&&v.h===h)return v.cv;const sw=Math.max(8,Math.round(w/6)),sh=Math.max(8,Math.round(h/6)),cv=v?v.cv:document.createElement('canvas');cv.width=sw;cv.height=sh;const g=cv.getContext('2d'),k=sw/w,gr=g.createRadialGradient(sw*.5,sh*.48,Math.min(w,h)*.27*k,sw*.5,sh*.5,Math.max(w,h)*.7*k);
    gr.addColorStop(0,'rgba(0,4,10,0)');gr.addColorStop(1,'rgba(0,4,10,.36)');g.fillStyle=gr;g.fillRect(0,0,sw,sh);this._vig={w,h,cv};return cv;
  }
  worldToScreen(x,y){return{x:this.width*.5+(x-this.camera.x)*this.camera.zoom,y:this.height*.5+(y-this.camera.y)*this.camera.zoom};}
  playRect(area){
   if(!area||!['left','top','width','height'].every(key=>Number.isFinite(area[key]))||area.width<=0||area.height<=0)return null;
   const left=clamp(area.left,0,this.width),top=clamp(area.top,0,this.height),right=clamp(area.left+area.width,0,this.width),bottom=clamp(area.top+area.height,0,this.height);
   return right-left>=40&&bottom-top>=40?{left,top,width:right-left,height:bottom-top}:null;
  }
  limitZoomOut(state,zoom,baseline,x,y,frame){
   if(zoom>=baseline)return zoom;
   const world=state.world;if(!world||!Number.isFinite(world.chunkX)||!Number.isFinite(world.chunkY)||!Number.isFinite(world.chunkSize)||world.chunkSize<=0)return baseline;
   const p=state.player,w=this.width,h=this.height,pad=p.r+12;
   const bounds=z=>{let cx=x,cy=y;if(frame){cx-=(frame.left+frame.width*.5-w*.5)/z;cy-=(frame.top+frame.height*.5-h*.5)/z;const xMin=p.x+pad+(w*.5-frame.left-frame.width)/z,xMax=p.x-pad+(w*.5-frame.left)/z,yMin=p.y+pad+(h*.5-frame.top-frame.height)/z,yMax=p.y-pad+(h*.5-frame.top)/z;cx=xMin<=xMax?clamp(cx,xMin,xMax):p.x-(frame.left+frame.width*.5-w*.5)/z;cy=yMin<=yMax?clamp(cy,yMin,yMax):p.y-(frame.top+frame.height*.5-h*.5)/z;}return{left:cx-w*.5/z,right:cx+w*.5/z,top:cy-h*.5/z,bottom:cy+h*.5/z};};
   const initial=bounds(baseline),size=world.chunkSize,allowed={left:Math.min((world.chunkX-2)*size,initial.left),right:Math.max((world.chunkX+3)*size,initial.right),top:Math.min((world.chunkY-2)*size,initial.top),bottom:Math.max((world.chunkY+3)*size,initial.bottom)};
   // Forced encounter framing may already cross a streamed edge. Only refuse
   // extra exposure from the preference; never tighten that necessary framing.
   const fits=z=>{const v=bounds(z);return v.left>=allowed.left-1e-7&&v.right<=allowed.right+1e-7&&v.top>=allowed.top-1e-7&&v.bottom<=allowed.bottom+1e-7;};
   if(fits(zoom))return zoom;let low=zoom,high=baseline;for(let i=0;i<18;i++){const middle=(low+high)*.5;if(fits(middle))high=middle;else low=middle;}return high;
  }
  visible(o,pad=80){const r=(o.r||0)+pad,v=this.cull;return o.x+r>v.left&&o.x-r<v.right&&o.y+r>v.top&&o.y-r<v.bottom;}
  createGrain(){const cv=makeCanvas(128,128),c=cv.getContext('2d'),im=c.createImageData(128,128);for(let i=0;i<im.data.length;i+=4){const v=rnd(i+81)*255;im.data[i]=v;im.data[i+1]=v;im.data[i+2]=v;im.data[i+3]=Math.round(rnd(i+71)*14);}c.putImageData(im,0,0);return cv;}
  glow(colour){const key=colour.map(x=>Math.round(x/12)*12).join(',');if(this.glows.has(key))return this.glows.get(key);let cv;if(this.glows.size>=48){const k0=this.glows.keys().next().value;cv=this.glows.get(k0);this.glows.delete(k0);cv.getContext('2d').clearRect(0,0,128,128);}else cv=makeCanvas(128,128);const c=cv.getContext('2d'),g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,rgba(colour,.45));g.addColorStop(.2,rgba(colour,.19));g.addColorStop(.55,rgba(colour,.055));g.addColorStop(1,rgba(colour,0));c.fillStyle=g;c.fillRect(0,0,128,128);this.glows.set(key,cv);return cv;}
  createFood(kind){
   const cv=makeCanvas(64,64),c=cv.getContext('2d'),co=kind==='algae'?[130,241,154]:kind==='protein'?[244,160,161]:[241,211,137];
   const g=c.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,rgba(co,.36));g.addColorStop(.35,rgba(co,.13));g.addColorStop(1,rgba(co,0));c.fillStyle=g;c.fillRect(0,0,64,64);c.translate(32,32);
   if(kind==='mineral'){polygon(c,6,10,Math.PI/6);c.fillStyle=rgba(co,.22);c.fill();c.strokeStyle=rgba(co,.84);c.lineWidth=1;c.stroke();polygon(c,3,5,.2);c.fillStyle=rgba(co,.7);c.fill();}
   else {ellipse(c,0,0,kind==='algae'?10:9,kind==='algae'?8:10,.3);const gg=c.createRadialGradient(-3,-4,1,0,0,11);gg.addColorStop(0,rgba(mix(co,[255,255,230],.55),.86));gg.addColorStop(.5,rgba(co,.58));gg.addColorStop(1,rgba(co,.13));c.fillStyle=gg;c.fill();c.strokeStyle=rgba(co,.75);c.lineWidth=.8;c.stroke();c.strokeStyle=rgba([5,36,35],.55);c.lineWidth=1.2;for(let i=-1;i<2;i++){c.beginPath();c.moveTo(-5,i*3);c.quadraticCurveTo(0,i*3-2,5,i*3);c.stroke();}}
   return cv;
  }
  decor(kind,biome,variant){
   const key=kind+biome+variant;if(this.decorSprites.has(key)){const hit=this.decorSprites.get(key);this.decorSprites.delete(key);this.decorSprites.set(key,hit);return hit;}
   let cv;if(this.decorSprites.size>=40){const [old,oc]=this.decorSprites.entries().next().value;this.decorSprites.delete(old);cv=oc;const x=cv.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,260,260);x.globalAlpha=1;}else cv=makeCanvas(260,260);
   const c=cv.getContext('2d'),co=palettes[biome].plant;c.translate(130,130);
   if(kind==='spire'){
    // A stand of glass spires: tall, thin, faintly lit shards leaning out from one root.
    const glass=mix(co,[190,232,246],.7);for(let j=0;j<6;j++){const lean=(j-2.5)*.2+rnd(j+variant*17)*.12,len=62+rnd(j*3+variant*29)*52,w=5+rnd(j*7+variant)*5;c.save();c.rotate(lean);c.beginPath();c.moveTo(-w,34);c.lineTo(0,34-len-28);c.lineTo(w,34);c.closePath();c.fillStyle=rgba(glass,.07);c.fill();c.strokeStyle=rgba(glass,.3);c.lineWidth=1.1;c.stroke();c.beginPath();c.moveTo(0,34);c.lineTo(0,34-len-22);c.strokeStyle=rgba([240,252,255],.16);c.lineWidth=.7;c.stroke();c.restore();}
    ellipse(c,0,40,46,10);c.fillStyle=rgba(glass,.06);c.fill();
   }else if(kind==='tube'){
    // A cluster of tube-dwellers: pale stalks with a soft plume at the mouth of each.
    const stalk=mix(co,[226,206,190],.6),plume=mix(co,[244,150,150],.55);for(let j=0;j<7;j++){const x=-54+j*18+rnd(j+variant*13)*8,h=58+rnd(j*5+variant*7)*70,bend=(rnd(j*11+variant)-.5)*26;c.beginPath();c.moveTo(x,70);c.quadraticCurveTo(x+bend,70-h*.5,x+bend*.6,70-h);c.strokeStyle=rgba(stalk,.3);c.lineWidth=7;c.lineCap='round';c.stroke();c.strokeStyle=rgba(stalk,.16);c.lineWidth=3;c.stroke();ellipse(c,x+bend*.6,70-h-5,7,9);c.fillStyle=rgba(plume,.24);c.fill();ellipse(c,x+bend*.6,70-h-5,3,4);c.fillStyle=rgba(plume,.4);c.fill();}
   }else if(kind==='rib'){
    // The ribs of something vast, long dead: a curved spine with pairs of arching bones.
    const bone=mix(co,[226,220,204],.72);c.rotate((variant%4)*.35);c.beginPath();c.moveTo(-104,0);c.quadraticCurveTo(0,-22,104,0);c.strokeStyle=rgba(bone,.3);c.lineWidth=5;c.lineCap='round';c.stroke();
    for(let j=-4;j<=4;j++){const x=j*22,y0=-22*(1-(j*j)/25)*.9,len=74-Math.abs(j)*9;for(const s of [-1,1]){c.beginPath();c.moveTo(x,y0);c.quadraticCurveTo(x+12,y0+s*len*.55,x-6,y0+s*len);c.strokeStyle=rgba(bone,.24);c.lineWidth=3;c.stroke();}}
   }else if(kind==='diatom'){
    c.rotate((variant%4)*.2);ellipse(c,0,0,40,112);c.fillStyle=rgba(co,.065);c.fill();c.strokeStyle=rgba(mix(co,[248,223,150],.4),.22);c.lineWidth=2;c.stroke();ellipse(c,0,0,32,104);c.lineWidth=1;c.stroke();
    c.beginPath();c.moveTo(0,-111);c.lineTo(0,111);c.stroke();
    for(let i=-12;i<=12;i++){const y=i*8,k=Math.sqrt(Math.max(0,1-y*y/(111*111)))*37;c.beginPath();c.moveTo(-k,y);c.quadraticCurveTo(0,y+5,k,y);c.stroke();for(let j=-2;j<=2;j++){ellipse(c,j*k*.26,y,1.1,1.1);c.fillStyle=rgba(co,.23);c.fill();}}
   }else if(biome===2){
    // The bloom grows suspended spore sacs and branching membranes, not leaves.
    const edge=mix(co,[214,179,228],.43);
    if(kind==='fibre'){
     for(let j=0;j<5;j++){const x=-89+j*43,y=55+rnd(j+variant*43)*41;c.beginPath();c.moveTo(x-18,-116);c.bezierCurveTo(x+47,-61,x-38,9,x,y);c.strokeStyle=rgba(edge,.20);c.lineWidth=1.2;c.stroke();c.beginPath();c.moveTo(x-12,-111);c.bezierCurveTo(x+54,-57,x-28,15,x+8,y);c.strokeStyle=rgba(co,.20);c.lineWidth=.65;c.stroke();ellipse(c,x+4,y,11+j%2*4,18+j%3*3,-.12+j*.08);c.fillStyle=rgba(co,.13);c.fill();c.strokeStyle=rgba(edge,.30);c.lineWidth=.8;c.stroke();ellipse(c,x+3,y-3,4,8,-.15);c.strokeStyle=rgba(edge,.15);c.stroke();}
    }else{
     for(let j=0;j<7;j++){const a=j*2.399+variant*.45,len=40+rnd(j+variant*91)*64,x=Math.cos(a)*len,y=Math.sin(a)*len;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(x*.25-y*.28,y*.25+x*.28,x,y);c.strokeStyle=rgba(edge,.23);c.lineWidth=1.2;c.stroke();c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(-17,-8);c.bezierCurveTo(-7,-26,19,-23,22,-3);c.bezierCurveTo(24,19,-1,26,-17,8);c.closePath();c.fillStyle=rgba(co,.12);c.fill();c.strokeStyle=rgba(edge,.28);c.lineWidth=.85;c.stroke();for(let k=-1;k<=1;k++){c.beginPath();c.moveTo(-13,k*5);c.quadraticCurveTo(0,k*12,17,k*4);c.strokeStyle=rgba(edge,.13);c.lineWidth=.55;c.stroke();}c.restore();}
    }
   }else if(kind==='fibre'){
    for(let j=0;j<4;j++){c.beginPath();c.moveTo(-120,-75+j*20);c.bezierCurveTo(-20,-130+j*24,20,120-j*8,126,65-j*20);c.strokeStyle=rgba(co,.1-j*.017);c.lineWidth=11-j*2;c.stroke();c.strokeStyle=rgba(mix(co,[175,219,179],.3),.1);c.lineWidth=.8;c.stroke();}
   }else{
    for(let branch=0;branch<7;branch++){
     const a=branch*2.399+variant*.67,len=48+rnd(branch+variant*91)*70;c.save();c.rotate(a);c.strokeStyle=rgba(co,.23);c.lineWidth=1.5;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(14,-len*.5,0,-len);c.stroke();
     for(let j=1;j<6;j++){const y=-len*j/6,k=(1-j/7)*17;for(const s of [-1,1]){c.beginPath();c.moveTo(3,y+7);c.quadraticCurveTo(s*k*2,y-3,s*k,y-18);c.quadraticCurveTo(s*k*.12,y-8,3,y+7);c.fillStyle=rgba(co,.15);c.fill();c.strokeStyle=rgba(mix(co,[157,209,128],.3),.17);c.lineWidth=.7;c.stroke();}}c.restore();
    }
   }
   this.decorSprites.set(key,cv);return cv;
  }
  background(state,time){
   const c=this.ctx,w=this.width,h=this.height,pal=this.currentPalette||palettes[biomeIndex(state.biome)],cam=this.camera,z=Math.max(.1,cam.zoom);
   const g=c.createLinearGradient(0,0,w*.7,h);g.addColorStop(0,rgba(pal.light));g.addColorStop(.5,rgba(pal.deep));g.addColorStop(1,rgba(mix(pal.deep,pal.light,.24)));c.fillStyle=g;c.fillRect(0,0,w,h);
   const left=cam.x-w*.5/z,right=cam.x+w*.5/z,top=cam.y-h*.5/z,bottom=cam.y+h*.5/z;
   c.save();c.translate(w*.5,h*.5);c.scale(z,z);c.translate(-cam.x,-cam.y);
   // Every pool of light and caustic belongs to a world coordinate, including negative chunks.
   const tile=700,gx0=Math.floor(left/tile)-1,gy0=Math.floor(top/tile)-1,nx=Math.min(24,Math.ceil((right-left)/tile)+3),ny=Math.min(20,Math.ceil((bottom-top)/tile)+3);
   {const M=.15,L=this._poolLayer||(this._poolLayer={cv:document.createElement('canvas'),n:0,cx:0,cy:0,z:0,pk:''}),lw=Math.max(8,Math.round(w*(1+2*M)/4)),lh=Math.max(8,Math.round(h*(1+2*M)/4)),pk=pal.fluid.map(v=>Math.round(v/6)).join(',')+'|'+(state.seedNumber||0);
    if(L.cv.width!==lw||L.cv.height!==lh){L.cv.width=lw;L.cv.height=lh;L.z=0;}
    L.n++;if(!L.z||Math.abs(L.z-z)>z*.005||Math.abs((L.cx-cam.x)*z)>w*M*.5||Math.abs((L.cy-cam.y)*z)>h*M*.5||L.n%4===0||L.pk!==pk){
      const lc=L.cv.getContext('2d'),sx=lw/(w*(1+2*M)),sy=lh/(h*(1+2*M)),hw=w*(.5+M)/z,hh=h*(.5+M)/z,lgx0=Math.floor((cam.x-hw)/tile)-1,lgy0=Math.floor((cam.y-hh)/tile)-1,lnx=Math.min(26,Math.ceil(2*hw/tile)+3),lny=Math.min(22,Math.ceil(2*hh/tile)+3),sprite=this._poolSprite(pal.fluid);
      lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,lw,lh);lc.setTransform(sx*z,0,0,sy*z,sx*(w*(.5+M)-cam.x*z),sy*(h*(.5+M)-cam.y*z));
      for(let ix=0;ix<lnx;ix++)for(let iy=0;iy<lny;iy++){const gx=lgx0+ix,gy=lgy0+iy,key=(gx*73856093)^(gy*19349663)^(state.seedNumber||0),phase=rnd(key)*TAU,x=(gx+.2+rnd(key+41)*.65)*tile,y=(gy+.2+rnd(key+17)*.65)*tile+Math.sin(time*.025+phase)*10,rr=tile*(.38+rnd(key+29)*.27);lc.drawImage(sprite,x-rr,y-rr,rr*2,rr*2);}
      L.cx=cam.x;L.cy=cam.y;L.z=z;L.pk=pk;}
    c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);c.drawImage(L.cv,-w*M+(L.cx-cam.x)*z,-h*M+(L.cy-cam.y)*z,w*(1+2*M),h*(1+2*M));c.restore();}
   c.lineWidth=1;c.strokeStyle=rgba(pal.fluid,.047);
   const row0=Math.floor(top/190)-1,col0=Math.floor(left/150)-1,rows=Math.min(60,Math.ceil((bottom-top)/190)+3),cols=Math.min(100,Math.ceil((right-left)/150)+3);
   for(let j=0;j<rows;j++){const row=row0+j,phase=rnd(row^0x51c35a)*TAU;c.beginPath();for(let i=0;i<=cols;i++){const x=(col0+i)*150,y=row*190+Math.sin(x*.006+time*.045+phase)*38+Math.sin(x*.013+phase*3.1)*12;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
   c.restore();c.save();const ox=((cam.x*z)%128+128)%128,oy=((cam.y*z)%128+128)%128;c.translate(-ox,-oy);c.globalAlpha=.13;if(!this._grainPat||this._grainCtx!==c){this._grainPat=c.createPattern(this.grain,'repeat');this._grainCtx=c;}c.fillStyle=this._grainPat;c.fillRect(ox,oy,w,h);c.restore();
  }
  waterMotes(state,time){
   const c=this.ctx,v=this.cull,cell=240,pal=this.currentPalette||palettes[biomeIndex(state.biome)];
   const x0=Math.floor(v.left/cell)-1,x1=Math.ceil(v.right/cell)+1,y0=Math.floor(v.top/cell)-1,y1=Math.ceil(v.bottom/cell)+1;
   c.save();c.globalAlpha=1-this.sceneFocus*.45;
   for(let ix=0;ix<Math.min(70,x1-x0);ix++)for(let iy=0;iy<Math.min(50,y1-y0);iy++)for(let j=0;j<2;j++){
    const gx=x0+ix,gy=y0+iy;
    const key=(gx*73856093)^(gy*19349663)^(j*83492791);if(rnd(key^0x57a39e)>this.moteDensity)continue;const phase=rnd(key)*TAU;
    const x=(gx+rnd(key+3))*cell+Math.sin(time*.04+phase)*17,y=(gy+rnd(key+8))*cell+Math.cos(time*.055+phase)*12;
    const r=1.2+rnd(key+7)*4;c.save();c.translate(x,y);c.rotate(phase+time*.015);ellipse(c,0,0,r*1.8,r);c.strokeStyle=rgba(pal.fluid,.09+rnd(key+6)*.09);c.lineWidth=.6;c.stroke();c.restore();
   }c.restore();
  }
  drawScenery(state,time){
   const c=this.ctx;
   for(const s of state.scenery||[]){if(!this.visible(s,150)||rnd(idNumber(s.id)^0x712b5d)>this.decorDensity)continue;const bi=biomeIndex(s.biome===undefined?state.biome:s.biome),variant=(idNumber(s.id)>>>0)%4;c.save();c.translate(s.x,s.y);c.rotate((s.angle||0)+.015*Math.sin(time*.08+(s.phase||0)));const r=(s.r||80)*1.8;c.globalAlpha=.6*(1-this.sceneFocus*.45);c.drawImage(this.decor(s.kind,bi,variant),-r,-r,r*2,r*2);c.restore();}
  }
  // A hermit: a large, slow, bearded ciliate that sits off-centre in its sanctuary. A gold mark shows when it has a task for you.
  drawHermit(c,l,r,time,state){
   // Every hermit is its own colony: colour, beard, eyes and the shell it carries come from its sanctuary.
   const key=idNumber(l.id),hues=[[214,206,170],[196,178,226],[170,214,200],[228,190,160],[180,206,232],[226,200,212]],co=hues[Math.floor(rnd(key+3)*hues.length)],beard=6+Math.floor(rnd(key+5)*6),eyes=1+Math.floor(rnd(key+7)*3),shell=rnd(key+9)<.6,hr=Math.min(46,r*.3),x=r*.42,y=-r*.18,ph=Number.isFinite(l.phase)?l.phase:0,sway=Math.sin(time*.6+ph)*.12;
   c.save();c.translate(x,y);c.rotate(sway);c.lineCap='round';
   if(shell){c.save();c.translate(hr*.55,hr*.35);c.rotate(.5);c.beginPath();for(let i=0;i<=40;i++){const a=i/40*TAU*1.6,rr=hr*.62*(1-i/48);if(i)c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.strokeStyle=rgba(mix(co,[120,100,80],.4),.8);c.lineWidth=hr*.12;c.stroke();c.restore();}
   for(let i=0;i<beard;i++){const a=Math.PI/2+(i-(beard-1)/2)*.13,len=hr*(1.1+.35*rnd(key+i)+.2*Math.sin(time*1.3+i));c.beginPath();c.moveTo(Math.cos(a)*hr*.8,Math.sin(a)*hr*.8);c.quadraticCurveTo(Math.cos(a)*hr*1.3+Math.sin(time*2+i)*4,Math.sin(a)*hr*1.4,Math.cos(a)*(hr+len),Math.sin(a)*(hr+len));c.strokeStyle=rgba(co,.5);c.lineWidth=2;c.stroke();}
   smoothBlob(c,hr,time*.3,ph,1,.05,16,3);c.fillStyle=rgba(co,.2);c.fill();c.strokeStyle=rgba(co,.8);c.lineWidth=2.2;c.stroke();
   ellipse(c,0,-hr*.05,hr*.34,hr*.3);c.fillStyle=rgba(mix(co,[90,80,60],.5),.45);c.fill();
   for(let i=0;i<eyes;i++){const ex=(i-(eyes-1)/2)*hr*.34,ey=-hr*.42-(eyes===3&&i===1?hr*.1:0);ellipse(c,ex,ey,hr*.1,hr*.08);c.fillStyle='rgba(245,238,214,.85)';c.fill();ellipse(c,ex+hr*.02,ey+hr*.01,hr*.04,hr*.05);c.fillStyle='rgba(30,26,18,.9)';c.fill();}
   if(!state.portrait){const tasks=state.tasks||[],mine=tasks.find(z=>z.from===l.id),mark=mine?(mine.done?'✓':'…'):tasks.length<(MorphosGame.MAX_TASKS||3)&&state.player.stage>=2&&!((state.stats.helped||{})[l.id]>=(MorphosGame.HERMIT_TASKS||3))?'!':'';if(mark){c.translate(0,-hr*1.7);c.rotate(-sway);c.fillStyle=mark==='…'?'rgba(214,206,170,.8)':'rgba(240,212,140,.95)';if(mark==='✓'){const q=hr*.32;c.beginPath();c.moveTo(-q,0);c.lineTo(-q*.3,q*.7);c.lineTo(q,-q*.75);c.lineCap='round';c.lineJoin='round';c.strokeStyle='rgba(240,212,140,.95)';c.lineWidth=Math.max(2,hr*.12);c.stroke();}else{c.font=`700 ${Math.round(hr*.8)}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(mark,0,0);}}}
   c.restore();
  }
  // Task things: a lost relative that follows you home, a glowing relic, a beacon on the tracked target, and an arrow at the screen edge.
  drawTasks(state,time){
   const c=this.ctx,z=this.camera.zoom,tasks=state.tasks||[];if(!tasks.length)return;const tracked=tasks.find(x=>x.target===state.trackedTask)||tasks[0];
   for(const t of tasks){
    if(t.kind==='rescue'&&!t.done&&Number.isFinite(t.fx)&&this.visible({x:t.fx,y:t.fy},60)){const r=16,co=[226,216,170];c.save();c.translate(t.fx,t.fy);c.drawImage(this.glow(co),-r*2.4,-r*2.4,r*4.8,r*4.8);smoothBlob(c,r,time*.8,1,1,.06,14,3);c.fillStyle=rgba(co,.25);c.fill();c.strokeStyle=rgba(co,.85);c.lineWidth=1.6;c.stroke();ellipse(c,0,-r*.3,r*.1,r*.1);c.fillStyle='rgba(30,26,18,.9)';c.fill();ellipse(c,r*.28,-r*.3,r*.1,r*.1);c.fill();c.restore();}
    if(t.kind==='fetch'&&!t.carried&&this.visible(t,60)){const co=[250,232,170],s=10+Math.sin(time*3)*1.5;c.save();c.translate(t.x,t.y);c.drawImage(this.glow(co),-s*5,-s*5,s*10,s*10);c.rotate(time*.8);c.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6;c.lineTo(Math.cos(a)*s,Math.sin(a)*s);}c.closePath();c.fillStyle='rgba(255,244,200,.9)';c.fill();c.restore();}
    if(t.kind==='fetch'&&t.carried&&!t.claimedShown){const p=state.player,a=time*2.2,rr=p.r+14;c.save();c.translate(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr);c.beginPath();for(let i=0;i<6;i++){const b=i*TAU/6;c.lineTo(Math.cos(b)*6,Math.sin(b)*6);}c.closePath();c.fillStyle='rgba(255,244,200,.9)';c.fill();c.restore();}
   }
   if(!tracked)return;const pt=MorphosGame.taskPoint(tracked);if(!pt||!Number.isFinite(pt.x))return;
   if(this.visible(pt,40)){const pulse=(time*.7)%1;c.save();c.translate(pt.x,pt.y);for(const u of [pulse,(pulse+.5)%1]){c.beginPath();c.arc(0,0,(60+u*140)/z*Math.min(1.6,z*1.2),0,TAU);c.strokeStyle=`rgba(240,212,140,${.5*(1-u)})`;c.lineWidth=2/z;c.stroke();}c.scale(1/z,1/z);c.translate(0,-70);if(pt.home||tracked.done){c.beginPath();c.moveTo(-10,0);c.lineTo(-3,7);c.lineTo(10,-7.5);c.lineCap='round';c.lineJoin='round';c.strokeStyle='rgba(8,20,18,.8)';c.lineWidth=7;c.stroke();c.strokeStyle='rgba(240,212,140,.95)';c.lineWidth=4;c.stroke();}else{c.rotate(Math.PI/4);c.fillStyle='rgba(240,212,140,.95)';c.fillRect(-7,-7,14,14);}c.restore();return;}
   const cull=this.cull;if(!cull)return;const cx=(cull.left+cull.right)/2,cy=(cull.top+cull.bottom)/2,a=Math.atan2(pt.y-cy,pt.x-cx),hw=(cull.right-cull.left)/2-50/z,hh=(cull.bottom-cull.top)/2-80/z,k=Math.min(hw/Math.abs(Math.cos(a)||1e-6),hh/Math.abs(Math.sin(a)||1e-6));
   let ax=cx+Math.cos(a)*k,ay=cy+Math.sin(a)*k;const f=this.playArea;if(f){ax=clamp(ax,cull.left+(f.left+30)/z,cull.left+(f.left+f.width-30)/z);ay=clamp(ay,cull.top+(f.top+30)/z,cull.top+(f.top+f.height-30)/z);}
   c.save();c.translate(ax,ay);c.rotate(a);c.scale(1/z,1/z);c.beginPath();c.moveTo(18,0);c.lineTo(-8,-12);c.lineTo(-2,0);c.lineTo(-8,12);c.closePath();c.fillStyle='rgba(240,212,140,.92)';c.fill();c.strokeStyle='rgba(20,24,18,.6)';c.lineWidth=1.5;c.stroke();c.restore();
  }
  // The eight wonders, each drawn once and unlike anything else in the pond.
  drawWonder(c,l,r,time,p){
   const done=!!l.claimed,act=!!l.active&&!done;c.lineCap='round';c.lineJoin='round';
   if(l.type==='wonderBell'){const co=[214,196,160];c.drawImage(this.glow(co),-r*1.4,-r*1.4,r*2.8,r*2.8);c.save();c.rotate(l.angle+Math.PI/2);
     c.beginPath();c.moveTo(-r*.25,-r*.78);c.bezierCurveTo(-r*.3,-r*.95,r*.3,-r*.95,r*.25,-r*.78);c.bezierCurveTo(r*.42,-r*.4,r*.45,r*.25,r*.82,r*.62);c.quadraticCurveTo(0,r*.82,-r*.82,r*.62);c.bezierCurveTo(-r*.45,r*.25,-r*.42,-r*.4,-r*.25,-r*.78);c.closePath();
     c.fillStyle=rgba(co,.16);c.fill();c.strokeStyle=rgba(co,.75);c.lineWidth=3;c.stroke();
     for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(i*r*.06,-r*.84);c.quadraticCurveTo(i*r*.12,r*.1,i*r*.24,r*.68);c.strokeStyle=rgba(co,.22);c.lineWidth=1.4;c.stroke();}
     ellipse(c,0,r*.66,r*.7,r*.13);c.fillStyle='rgba(8,10,14,.7)';c.fill();c.strokeStyle=rgba(co,.6);c.lineWidth=2;c.stroke();
     for(let i=0;i<14;i++){const a=i*2.4,d=r*(.2+.5*((i*.37)%1));ellipse(c,Math.cos(a)*d*.45,-r*.3+Math.sin(a)*d*.6,r*.03,r*.025);c.fillStyle=rgba(mix(co,[255,255,255],.3),.35);c.fill();}
     if(done){ellipse(c,0,r*.55,r*.12,r*.12);c.fillStyle='rgba(255,236,170,.7)';c.fill();}c.restore();}
   else if(l.type==='wonderLanterns'){const co=[150,200,170],lit=l.lit||0;
     for(let j=0;j<11;j++){const a=j*TAU/11+.3,len=r*(.4+.2*Math.sin(j*1.7));c.save();c.rotate(a);c.beginPath();c.moveTo(r*.1,0);c.bezierCurveTo(len*.4,-len*.2,len*.7,len*.15,len,0);c.strokeStyle=rgba(co,.35);c.lineWidth=4;c.stroke();for(const sd of [-1,1]){c.beginPath();c.moveTo(len*.6,0);c.quadraticCurveTo(len*.75,sd*len*.2,len*.9,sd*len*.22);c.strokeStyle=rgba(co,.25);c.lineWidth=2;c.stroke();}c.restore();}
     c.beginPath();c.arc(0,0,r*.8,0,TAU);c.setLineDash([6,10]);c.strokeStyle=rgba([246,226,150],.18);c.lineWidth=1.5;c.stroke();c.setLineDash([]);
     for(let i=0;i<6;i++){const a=l.angle+i*TAU/6,x=Math.cos(a)*r*.8,y=Math.sin(a)*r*.8,on=done||!!(lit&(1<<i));c.beginPath();c.moveTo(x*.86,y*.86);c.quadraticCurveTo(x*.95,y*.95-14,x,y-6);c.strokeStyle=rgba(co,.55);c.lineWidth=2.4;c.stroke();
       if(on)c.drawImage(this.glow([246,226,150]),x-70,y-76,140,140);ellipse(c,x,y-6,15,19);c.fillStyle=on?'rgba(255,240,170,.92)':'rgba(40,52,46,.8)';c.fill();c.strokeStyle=on?'rgba(255,250,210,.9)':'rgba(170,200,180,.6)';c.lineWidth=2;c.stroke();}}
   else if(l.type==='wonderRibs'){const co=[226,214,190];c.save();c.rotate(l.angle);
     c.beginPath();c.moveTo(-r*.95,0);c.quadraticCurveTo(0,-r*.08,r*.85,0);c.strokeStyle=rgba(co,.6);c.lineWidth=r*.05;c.stroke();
     for(let i=0;i<8;i++){const x=-r*.7+i*r*.2,h=r*(.62-Math.abs(i-3.5)*.06);for(const sd of [-1,1]){c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+r*.05,sd*h*.5,x+r*.2,sd*h*.95,x+r*.06,sd*h);c.strokeStyle=rgba(co,.55);c.lineWidth=r*.035;c.stroke();}ellipse(c,x,0,r*.03,r*.03);c.fillStyle=rgba(co,.7);c.fill();}
     ellipse(c,r*.92,0,r*.2,r*.14);c.fillStyle=rgba(co,.18);c.fill();c.strokeStyle=rgba(co,.65);c.lineWidth=2.2;c.stroke();ellipse(c,r*.96,-r*.05,r*.045,r*.035);c.fillStyle='rgba(10,8,6,.85)';c.fill();c.restore();}
   else if(l.type==='wonderPool'){const co=[170,214,226];c.beginPath();c.arc(0,0,r,0,TAU);c.fillStyle=rgba([10,30,40],.35);c.fill();
     for(let i=1;i<5;i++){c.beginPath();c.arc(0,0,r*i/4.4,0,TAU);c.strokeStyle=rgba(co,.12);c.lineWidth=1.2;c.stroke();}
     for(let i=0;i<9;i++){const a=i*2.3,d=r*(.2+.65*((i*.31)%1));ellipse(c,Math.cos(a)*d,Math.sin(a)*d,r*.06,r*.045,a);c.fillStyle=rgba([120,170,140],.18);c.fill();c.strokeStyle=rgba([150,200,170],.3);c.lineWidth=1;c.stroke();}
     c.beginPath();c.arc(0,0,r,0,TAU);c.strokeStyle=rgba(co,.5);c.lineWidth=2;c.stroke();
     if(!done)for(const [lx,ly] of l.lights||[]){const x=lx-l.x,y=ly-l.y;c.drawImage(this.glow([244,240,200]),x-110,y-110,220,220);ellipse(c,x,y,90,90);c.strokeStyle='rgba(244,240,200,.22)';c.lineWidth=1.5;c.setLineDash([5,7]);c.stroke();c.setLineDash([]);ellipse(c,x,y,9,9);c.fillStyle='rgba(255,252,220,.95)';c.fill();}}
   else if(l.type==='wonderMaelstrom'){const co=[140,196,230],spin=time*(done?.25:.8);c.drawImage(this.glow([90,140,190]),-r*1.2,-r*1.2,r*2.4,r*2.4);
     for(let j=0;j<6;j++){c.beginPath();for(let i=0;i<=26;i++){const u=i/26,rr=r*(1-u*.94),a=spin+j*TAU/6+u*3.4;if(i)c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.strokeStyle=rgba(co,.18+.1*(j%2));c.lineWidth=2+(j%3);c.stroke();}
     c.beginPath();c.arc(0,0,r*.16,0,TAU);c.setLineDash([4,6]);c.strokeStyle='rgba(240,250,255,.5)';c.lineWidth=1.5;c.stroke();c.setLineDash([]);
     if(!done){c.save();c.rotate(time*2);c.beginPath();c.moveTo(0,-14);c.lineTo(9,0);c.lineTo(0,14);c.lineTo(-9,0);c.closePath();c.fillStyle='rgba(255,248,210,.95)';c.fill();c.restore();c.drawImage(this.glow([255,240,190]),-50,-50,100,100);}}
   else if(l.type==='wonderSpire'){const co=[170,226,240];c.drawImage(this.glow(co),-r*1.3,-r*1.3,r*2.6,r*2.6);
     const shards=[[0,1,.95],[.9,.6,.7],[-1,.65,.75],[2.2,.5,.6],[-2.3,.55,.6],[3.1,.45,.5],[1.6,.4,.45]];
     for(const [a,len,w0] of shards){c.save();c.rotate(a+l.angle);const L=r*len,W=r*.13*w0;c.beginPath();c.moveTo(0,-W);c.lineTo(L*.85,-W);c.lineTo(L,0);c.lineTo(L*.85,W);c.lineTo(0,W);c.closePath();c.fillStyle=rgba(co,done?.12:.2);c.fill();c.strokeStyle=rgba(mix(co,[255,255,255],.4),.85);c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(L*.1,-W*.4);c.lineTo(L*.8,-W*.4);c.strokeStyle='rgba(255,255,255,.4)';c.lineWidth=1.4;c.stroke();c.restore();}
     ellipse(c,0,0,r*.16,r*.16);c.fillStyle=rgba(mix(co,[255,255,255],.5),.5);c.fill();}
   else if(l.type==='wonderDrowned'){const co=[176,160,200];
     for(let i=0;i<16;i++){const a=i*2.399,d=r*.82*Math.sqrt((i+.5)/16),x=Math.cos(a)*d,y=Math.sin(a)*d,cr=r*(.13+.04*((i*7)%3)),gap=.6+((i*5)%4)*.35;c.beginPath();c.arc(x,y,cr,a+gap,a+TAU-.2);c.strokeStyle=rgba(co,.42);c.lineWidth=3;c.stroke();ellipse(c,x+cr*.2,y,cr*.25,cr*.22);c.fillStyle=rgba(co,.12);c.fill();}
     c.beginPath();c.arc(0,0,r*.98,0,TAU);c.setLineDash([18,14]);c.strokeStyle=rgba(co,.35);c.lineWidth=2;c.stroke();c.setLineDash([]);}
   else if(l.type==='wonderEye'){const co=[230,150,120],open=done?0:act?1:.35+.1*Math.sin(time*.7),W=r*.62,H=r*.32*open+r*.02;c.drawImage(this.glow([200,80,70]),-r*1.2,-r*1.2,r*2.4,r*2.4);
     if(act)for(let i=0;i<3;i++){const b=(l.beam||0)+i*TAU/3;c.save();c.rotate(b);c.beginPath();c.moveTo(r*.14,-10);c.lineTo(r,-28);c.lineTo(r,28);c.lineTo(r*.14,10);c.closePath();c.fillStyle='rgba(255,120,90,.18)';c.fill();c.strokeStyle='rgba(255,170,140,.55)';c.lineWidth=1.5;c.stroke();c.restore();}
     c.beginPath();c.moveTo(-W,0);c.quadraticCurveTo(0,-H*2,W,0);c.quadraticCurveTo(0,H*2,-W,0);c.closePath();c.fillStyle='rgba(30,10,12,.85)';c.fill();c.strokeStyle=rgba(co,.8);c.lineWidth=3;c.stroke();
     if(open>.1){c.save();c.clip();const dx=p.x-l.x,dy=p.y-l.y,dd=Math.hypot(dx,dy)||1,ox=dx/dd*W*.3,oy=dy/dd*H*.4;ellipse(c,ox,oy,r*.24,r*.24);c.fillStyle='rgba(230,160,60,.9)';c.fill();ellipse(c,ox,oy,r*.05,r*.18);c.fillStyle='rgba(10,4,4,.95)';c.fill();c.restore();}
     c.beginPath();c.arc(0,0,r,0,TAU);c.strokeStyle='rgba(230,140,120,.25)';c.setLineDash([10,12]);c.lineWidth=2;c.stroke();c.setLineDash([]);}
  }
  drawLandmarks(state,time,labels=true){
   const c=this.ctx,p=state.player,rest=labels?MorphosGame.sanctuaryStatus(state):null;
   for(const l of state.landmarks||[]){
    if(!Number.isFinite(l.x)||!Number.isFinite(l.y)||!this.visible(l,220))continue;
    const r=clamp(l.r||130,35,650),key=idNumber(l.id),phase=Number.isFinite(l.phase)?l.phase:rnd(key)*TAU,spent=!!l.claimed&&(l.type==='fossil'||l.type==='vault'||l.type==='smoker'||l.type==='geneCache'||l.type==='nest'||l.type==='sanctum'||l.type==='carcass'||l.type==='garden');
    const refuge=l.type==='sanctuary',restHere=refuge&&rest&&rest.id===l.id?rest:null,restProgress=restHere&&restHere.phase!=='blocked'?clamp(restHere.progress/Math.max(.01,restHere.required),0,1):0,restComplete=restHere&&restHere.phase==='complete';
    c.save();c.translate(l.x,l.y);c.globalAlpha=spent?.58:1;
    if(l.type==='bloom'){
     const co=[130,211,128];c.drawImage(this.glow(co),-r*1.6,-r*1.6,r*3.2,r*3.2);
     // A branching chloroplast grove, with recognisable veins and nutrient pearls.
     const branches=7+(key>>>0)%4;
     for(let j=0;j<branches;j++){const a=j*TAU/branches+phase*.2+Math.sin(time*.16+j)*.025,len=r*(.58+rnd(key+j*97)*.38);c.save();c.rotate(a);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(len*.25,-len*.22,len*.69,len*.12,len,0);c.strokeStyle=rgba(co,.36);c.lineWidth=2.1;c.stroke();
      for(let n=1;n<=3;n++){const u=n/4,x=len*u,leaf=len*(.21-u*.07);for(const s of [-1,1]){c.beginPath();c.moveTo(x,0);c.quadraticCurveTo(x-leaf*.1,s*leaf*1.2,x+leaf*.75,s*leaf*.95);c.quadraticCurveTo(x+leaf*.8,s*leaf*.25,x,0);c.fillStyle=rgba(co,.09);c.fill();c.strokeStyle=rgba(mix(co,[216,239,150],.35),.34);c.lineWidth=.8;c.stroke();c.beginPath();c.moveTo(x,0);c.lineTo(x+leaf*.58,s*leaf*.74);c.strokeStyle=rgba(co,.19);c.stroke();}}
      ellipse(c,len,0,r*.035,r*.046,0);c.fillStyle='rgba(220,245,154,.63)';c.fill();c.restore();
     }
     for(let j=0;j<5;j++){const a=j*2.399+phase;ellipse(c,Math.cos(a)*r*.18,Math.sin(a)*r*.18,r*.11,r*.08,a);c.fillStyle=rgba(co,.13);c.fill();c.strokeStyle=rgba(co,.37);c.lineWidth=.8;c.stroke();}
    }else if(l.type==='sanctuary'){
     const co=restComplete?[177,231,199]:[133,218,206];c.drawImage(this.glow(co),-r*1.8,-r*1.8,r*3.6,r*3.6);
     // An open, overlapping glass flower creates a restful hollow in the pond.
     for(let j=0;j<6;j++){const a=j*TAU/6+phase*.13;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.19,-r*.15);c.bezierCurveTo(r*.6,-r*.58,r*1.02,-r*.42,r*.98,0);c.bezierCurveTo(r*1.02,r*.42,r*.6,r*.58,r*.19,r*.15);c.closePath();const g=this._grad(c,'p'+Math.round(r)+'|'+co.map(x=>Math.round(x/6)).join(',')+'|'+Math.round(restProgress*20),()=>{const q=c.createLinearGradient(r*.2,0,r,0);q.addColorStop(0,rgba(co,.025));q.addColorStop(.75,rgba(co,.12+restProgress*.04));q.addColorStop(1,rgba([210,244,215],.2));return q;});c.fillStyle=g;c.fill();c.strokeStyle=rgba(co,.43+restProgress*.16);c.lineWidth=1.1;c.stroke();for(let k=0;k<3;k++){c.beginPath();c.moveTo(r*.28,0);c.quadraticCurveTo(r*.58,(k-1)*r*.16,r*.88,(k-1)*r*.13);c.strokeStyle=rgba(co,.16);c.lineWidth=.6;c.stroke();}c.restore();}
     c.strokeStyle='rgba(188,238,220,.31)';c.lineWidth=1;for(let j=0;j<4;j++){const a=time*.08+j*TAU/4;c.beginPath();c.arc(0,0,r*.27,a,a+.8);c.stroke();}
     ellipse(c,0,0,r*.12,r*.12);c.fillStyle='rgba(182,239,216,.13)';c.fill();
     if(restHere){const rr=r*.56,z=this.camera.zoom;c.lineWidth=1/z;c.strokeStyle='rgba(177,231,209,.18)';ellipse(c,0,0,rr,rr);c.stroke();if(restProgress>0){if(restComplete)ellipse(c,0,0,rr,rr);else{c.beginPath();c.arc(0,0,rr,-Math.PI/2,-Math.PI/2+TAU*restProgress);}c.strokeStyle=rgba([197,246,214],restComplete?.72:.58);c.lineWidth=2/z;c.stroke();}if(restComplete){c.beginPath();c.moveTo(-4/z,-rr);c.lineTo(-1/z,-rr+3/z);c.lineTo(5/z,-rr-4/z);c.strokeStyle='rgba(218,251,223,.92)';c.lineWidth=1.5/z;c.stroke();}else if(restHere.phase==='resting'){const a=-Math.PI/2+TAU*restProgress;ellipse(c,Math.cos(a)*rr,Math.sin(a)*rr,2.3/z,2.3/z);c.fillStyle='rgba(216,250,228,.84)';c.fill();}}
    }else if(l.type==='geneCache'){
     const co=spent?[139,154,142]:[226,193,119];c.drawImage(this.glow(co),-r*1.45,-r*1.45,r*2.9,r*2.9);c.rotate(phase*.13);
     // A double helix suspended in a fractured, needle-like silicate capsule.
     c.beginPath();c.moveTo(0,-r*.92);c.lineTo(r*.46,-r*.44);c.lineTo(r*.48,r*.41);c.lineTo(0,r*.94);c.lineTo(-r*.48,r*.41);c.lineTo(-r*.46,-r*.44);c.closePath();c.fillStyle=rgba(co,.045);c.fill();c.strokeStyle=rgba(co,.43);c.lineWidth=1.2;c.stroke();
     for(const s of [-1,1]){c.beginPath();c.moveTo(0,-r*.92);c.lineTo(s*r*.25,-r*.36);c.lineTo(s*r*.25,r*.35);c.lineTo(0,r*.94);c.strokeStyle=rgba(co,.16);c.lineWidth=.7;c.stroke();}
     if(!spent){for(let strand=0;strand<2;strand++){c.beginPath();for(let k=0;k<=38;k++){const u=k/38,x=Math.sin(u*TAU*1.6+time*.45+strand*Math.PI)*r*.24,y=(u-.5)*r*1.30;if(k===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=strand?rgba([163,223,212],.65):rgba(co,.8);c.lineWidth=2;c.stroke();}
      for(let k=0;k<12;k++){const u=(k+.5)/12,x=Math.sin(u*TAU*1.6+time*.45)*r*.24,y=(u-.5)*r*1.3;c.beginPath();c.moveTo(-x,y);c.lineTo(x,y);c.strokeStyle=rgba(co,.29);c.lineWidth=1;c.stroke();}}
     for(let j=0;j<6;j++){const a=j*TAU/6+phase*.1;c.save();c.rotate(a);c.translate(r*.84,0);polygon(c,3,r*(.12+rnd(key+j)*.06),0);c.fillStyle=rgba(co,.07);c.fill();c.strokeStyle=rgba(co,.38);c.lineWidth=.8;c.stroke();c.restore();}
    }else if(l.type==='nest'){
     const co=spent?[116,141,134]:[211,101,122];c.drawImage(this.glow(co),-r*1.65,-r*1.65,r*3.3,r*3.3);
     // A thorned mat of fibres and enclosed egg chambers, visibly unlike safe flora.
     for(let j=0;j<9;j++){const a=j*2.399+phase*.2;c.save();c.rotate(a);c.beginPath();c.moveTo(-r*.35,-r*.18);c.bezierCurveTo(r*.4,-r*.54,r*.66,r*.32,r*.98,0);c.strokeStyle=rgba(co,.27);c.lineWidth=2.5;c.stroke();c.beginPath();c.moveTo(r*.55,-r*.05);c.lineTo(r*.77,-r*.33);c.lineTo(r*.66,-r*.03);c.strokeStyle=rgba(co,.48);c.lineWidth=1;c.stroke();c.restore();}
     for(let j=0;j<7;j++){const a=j*2.399+phase,rr=r*(.18+.06*(j%4)),x=Math.cos(a)*rr,y=Math.sin(a)*rr,er=r*(.13+.025*(j%3));ellipse(c,x,y,er,er*.78,a);c.fillStyle=rgba(co,spent?.035:.15);c.fill();c.strokeStyle=rgba(co,.52);c.lineWidth=.9;c.stroke();if(!spent){ellipse(c,x+er*.13,y-er*.12,er*.3,er*.25,a);c.fillStyle=rgba([248,165,148],.43);c.fill();}}
     if(!spent){c.strokeStyle='rgba(240,135,141,.6)';c.lineWidth=1.2;for(let j=0;j<3;j++){const a=j*TAU/3-time*.04;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.82,-r*.055);c.lineTo(r*.91,0);c.lineTo(r*.82,r*.055);c.stroke();c.restore();}}
    }else if(l.type==='sanctum'){
     const kind=l.bossType||'brood',co=spent?[139,170,153]:kind==='glass'?[224,206,157]:kind==='undertow'?[105,220,224]:[230,128,154];
     c.drawImage(this.glow(co),-r*1.6,-r*1.6,r*3.2,r*3.2);c.lineWidth=1.1;c.strokeStyle=rgba(co,.25);
     for(let j=0;j<6;j++){const a=j*TAU/6+phase*.08;c.beginPath();c.arc(0,0,r*.96,a+.08,a+.75);c.stroke();}
     if(kind==='glass'){for(let j=0;j<8;j++){const a=j*TAU/8+phase*.12;c.save();c.rotate(a);c.translate(r*.77,0);c.beginPath();c.moveTo(-r*.13,0);c.lineTo(0,-r*.048);c.lineTo(r*.24,0);c.lineTo(0,r*.048);c.closePath();c.fillStyle=rgba(co,.07);c.fill();c.strokeStyle=rgba(co,.35);c.stroke();c.beginPath();c.moveTo(-r*.13,0);c.lineTo(r*.24,0);c.strokeStyle=rgba(co,.16);c.stroke();c.restore();}}
     else if(kind==='undertow'){for(let j=0;j<5;j++){c.beginPath();for(let k=0;k<=22;k++){const u=k/22,a=j*TAU/5+u*2.25+phase*.08,rr=r*(.25+u*.74),x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(k===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=rgba(co,.25);c.lineWidth=1.2;c.stroke();}}
     else{for(let j=0;j<8;j++){const a=j*TAU/8+phase*.1,x=Math.cos(a)*r*.81,y=Math.sin(a)*r*.81;c.beginPath();c.moveTo(Math.cos(a+.3)*r*.36,Math.sin(a+.3)*r*.36);c.quadraticCurveTo(x*.65-y*.15,y*.65+x*.15,x,y);c.strokeStyle=rgba(co,.21);c.stroke();ellipse(c,x,y,r*.10,r*.065,a);c.fillStyle=rgba(co,.09);c.fill();c.strokeStyle=rgba(co,.36);c.stroke();if(!spent){ellipse(c,x,y,r*.027,r*.027);c.fillStyle=rgba(co,.44);c.fill();}}}
     if(spent){c.strokeStyle='rgba(189,225,180,.45)';c.lineWidth=1.5;c.beginPath();c.moveTo(-r*.055,0);c.lineTo(-r*.01,r*.045);c.lineTo(r*.075,-r*.055);c.stroke();}
    }else if(l.type==='carcass'){
     // A collapsed giant cell: a torn, deflated membrane spilling organelles. Picked clean once claimed.
     const co=spent?[128,128,124]:[196,150,146],eaten=clamp(l.progress||0,0,1);c.drawImage(this.glow(spent?co:[214,128,128]),-r*1.5,-r*1.5,r*3,r*3);c.rotate(phase*.2);
     smoothBlob(c,r*.88,0,phase,1.18,.16,22,5);c.fillStyle=rgba(co,spent?.03:.08*(1-eaten*.6));c.fill();c.setLineDash([r*.22,r*.07,r*.05,r*.09]);c.strokeStyle=rgba(co,.55);c.lineWidth=1.6;c.stroke();c.setLineDash([]);
     smoothBlob(c,r*.74,0,phase+1,1.1,.2,18,4);c.strokeStyle=rgba(co,.22);c.lineWidth=.8;c.stroke();
     ellipse(c,-r*.12,r*.05,r*.24,r*.19,.4);c.fillStyle=rgba([92,82,120],spent?.08:.22);c.fill();c.strokeStyle=rgba(mix(co,[171,160,210],.5),.4);c.stroke();
     if(!spent)for(let j=0;j<9;j++){const a=j*2.399+phase,rr=r*(.3+.45*rnd(key+j)),size=r*(.05+.04*rnd(key+j*7));c.save();c.translate(Math.cos(a)*rr,Math.sin(a)*rr);c.rotate(a);ellipse(c,0,0,size*1.7,size);c.fillStyle=rgba([228,166,150],.2);c.fill();c.strokeStyle=rgba([238,183,166],.45);c.lineWidth=.7;c.stroke();c.restore();}
     for(let j=0;j<5;j++){const a=j*TAU/5+phase;c.beginPath();c.moveTo(Math.cos(a)*r*.86,Math.sin(a)*r*.86);c.quadraticCurveTo(Math.cos(a+.2)*r*1.05,Math.sin(a+.2)*r*1.05,Math.cos(a+.1)*r*1.22,Math.sin(a+.1)*r*1.22);c.strokeStyle=rgba(co,.3);c.lineWidth=1;c.stroke();}
    }else if(l.type==='garden'){
     // A dense frond bed at the heart, inside a faint violet boundary; the toxins themselves are drawn as hazards.
     const co=spent?[120,150,128]:[150,214,120],edge=[196,136,226];c.drawImage(this.glow(co),-r*.9,-r*.9,r*1.8,r*1.8);
     c.setLineDash([4,10]);ellipse(c,0,0,r,r);c.strokeStyle=rgba(edge,.28);c.lineWidth=1;c.stroke();c.setLineDash([]);
     for(let j=0;j<11;j++){const a=j*TAU/11+phase*.2+Math.sin(time*.3+j)*.04,len=r*(.28+rnd(key+j*31)*.18);c.save();c.rotate(a);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(len*.5,-len*.2,len,0);c.strokeStyle=rgba(co,.38);c.lineWidth=1.4;c.stroke();for(const sd of [-1,1]){c.beginPath();c.moveTo(len*.45,0);c.quadraticCurveTo(len*.6,sd*len*.22,len*.85,sd*len*.12);c.strokeStyle=rgba(co,.28);c.lineWidth=.8;c.stroke();}c.restore();}
     ellipse(c,0,0,r*.08,r*.08);c.fillStyle=rgba(co,.3);c.fill();
    }else if(l.type==='current'){
     const co=[118,197,225],direction=Number.isFinite(l.angle)?l.angle:phase;c.rotate(direction);c.drawImage(this.glow(co),-r*1.8,-r,r*3.6,r*2);
     // A visible corridor of parallel water ribbons points along the mechanical flow.
     for(let j=-4;j<=4;j++){const off=j*r*.13;c.beginPath();for(let k=0;k<=22;k++){const u=k/22,x=(u-.5)*r*2.5,y=off+Math.sin(u*TAU+phase+j*.28)*r*.1;if(k===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=rgba(co,.17-Math.abs(j)*.018);c.lineWidth=Math.abs(j)%2?1:1.7;c.stroke();
      if(j%2===0){const u=((time*.20+j*.17)%1+1)%1,x=(u-.5)*r*2.5,y=off+Math.sin(u*TAU+phase+j*.28)*r*.1;c.beginPath();c.moveTo(x-r*.04,y-r*.035);c.lineTo(x,y);c.lineTo(x-r*.04,y+r*.035);c.strokeStyle=rgba(co,.5);c.lineWidth=.9;c.stroke();}}
     for(const s of [-1,1]){c.beginPath();c.moveTo(-r*.84,s*r*.57);c.bezierCurveTo(-r*.23,s*r*.87,r*.23,s*r*.87,r*.84,s*r*.57);c.strokeStyle=rgba(co,.19);c.lineWidth=1;c.stroke();}
    }else if(l.type==='vault'){
     // A ring of glass columns around a sealed core; the columns light one by one as it opens.
     const co=spent?[140,156,160]:[176,226,244],k=spent?1:clamp((l.progress||0)/(l.goal||3),0,1);c.drawImage(this.glow(co),-r*1.5,-r*1.5,r*3,r*3);c.rotate(phase*.15);
     for(let j=0;j<8;j++){const a=j*TAU/8,lit=!spent&&j/8<k,x=Math.cos(a)*r*.82,y=Math.sin(a)*r*.82;c.save();c.translate(x,y);c.rotate(a+Math.PI/2);c.beginPath();c.moveTo(-r*.09,r*.2);c.lineTo(0,-r*.34);c.lineTo(r*.09,r*.2);c.closePath();c.fillStyle=rgba(co,lit?.4:.1);c.fill();c.strokeStyle=rgba(co,lit?.9:.45);c.lineWidth=1.4;c.stroke();c.restore();}
     ellipse(c,0,0,r*.3,r*.3);c.fillStyle=rgba(co,spent?.05:.1+.14*k);c.fill();c.strokeStyle=rgba(co,.6);c.lineWidth=1.6;c.stroke();
     if(!spent){c.beginPath();for(let j=0;j<6;j++){const a=j*TAU/6+time*.3;c.moveTo(Math.cos(a)*r*.12,Math.sin(a)*r*.12);c.lineTo(Math.cos(a)*r*.26,Math.sin(a)*r*.26);}c.strokeStyle=rgba([236,250,255],.35+.4*k);c.lineWidth=1;c.stroke();}
    }else if(l.type==='smoker'){
     // A dark mineral chimney with a slow plume rising from its mouth.
     const co=spent?[120,118,112]:[226,176,112];c.drawImage(this.glow(spent?co:[240,170,90]),-r*1.4,-r*1.4,r*2.8,r*2.8);
     for(let j=0;j<9;j++){const a=j*TAU/9+phase,rr=r*(.44+.1*Math.sin(j*2.1+phase));c.beginPath();c.moveTo(Math.cos(a)*r*.2,Math.sin(a)*r*.2);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);c.strokeStyle='rgba(40,34,30,.6)';c.lineWidth=r*.1;c.lineCap='round';c.stroke();c.strokeStyle=rgba(co,.22);c.lineWidth=1.2;c.stroke();}
     ellipse(c,0,0,r*.24,r*.24);c.fillStyle='rgba(16,12,12,.85)';c.fill();c.strokeStyle=rgba(co,.6);c.lineWidth=2;c.stroke();
     if(!spent)for(let j=0;j<5;j++){const u=((time*.22+j/5)%1),a=phase*3+j*1.9,x=Math.cos(a)*r*.1*u*3,y=Math.sin(a)*r*.1*u*3-u*r*.5;ellipse(c,x,y,r*(.06+.1*u),r*(.06+.1*u));c.fillStyle=`rgba(210,170,130,${.26*(1-u)})`;c.fill();}
    }else if(l.type==='fossil'){
     // A spiralled, chambered shell set in pale rock, glowing faintly while unclaimed.
     const co=spent?[150,150,140]:[236,214,170];c.drawImage(this.glow(spent?co:[250,220,150]),-r*1.5,-r*1.5,r*3,r*3);c.rotate(phase*.2);
     c.beginPath();for(let k=0;k<=120;k++){const u=k/120,a=u*TAU*3.2,rr=r*.08+u*r*.82;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(k===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=rgba(co,.7);c.lineWidth=2;c.stroke();
     for(let k=6;k<40;k+=2){const u=k/40,a=u*TAU*3.2,r1=r*.08+u*r*.82,r2=r*.08+Math.max(0,u-1/3.2)*r*.82;c.beginPath();c.moveTo(Math.cos(a)*r1,Math.sin(a)*r1);c.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);c.strokeStyle=rgba(co,.3);c.lineWidth=.8;c.stroke();}
     if(!spent){const k=clamp((l.progress||0)/(l.goal||3),0,1);c.beginPath();c.arc(0,0,r*1.05,-Math.PI/2,-Math.PI/2+k*TAU);c.strokeStyle='rgba(255,230,170,.75)';c.lineWidth=2;c.stroke();}
    }else if(l.type.startsWith('wonder')){this.drawWonder(c,l,r,time,p);
    }else if(l.type==='shell'){
     // A large, empty bivalve shell lying open: ribbed valves with a dark hollow between them.
     const co=[198,186,214];c.rotate(phase*.3);ellipse(c,0,0,r*.8,r*.5);c.fillStyle='rgba(6,10,20,.55)';c.fill();
     for(const sd of [-1,1]){c.beginPath();c.moveTo(-r*.95,0);c.quadraticCurveTo(-r*.2,sd*r*1.05,r*.95,sd*r*.18);c.quadraticCurveTo(0,sd*r*.42,-r*.95,0);c.closePath();c.fillStyle=rgba(co,.12);c.fill();c.strokeStyle=rgba(co,.6);c.lineWidth=1.4;c.stroke();
      for(let i=1;i<7;i++){const u=i/7;c.beginPath();c.moveTo(-r*.95,0);c.quadraticCurveTo(-r*.2+u*r*.1,sd*r*(.42+.6*u),r*(.95-u*.1),sd*r*.18*(1+u*.4));c.strokeStyle=rgba(co,.18);c.lineWidth=.7;c.stroke();}}
     if(l.active&&Math.hypot(l.x-p.x,l.y-p.y)<l.r*.72){c.beginPath();c.arc(0,0,r*.85,0,TAU);c.strokeStyle='rgba(200,190,240,.35)';c.setLineDash([4,6]);c.stroke();c.setLineDash([]);}
    }
    if(refuge&&MorphosGame.hermitOf(l.id))this.drawHermit(c,l,r,time,state);
    c.restore();
    const dist=Math.hypot(l.x-p.x,l.y-p.y),labelY=l.y+r*1.02+20/this.camera.zoom,screen=this.worldToScreen(l.x,labelY);
    if(labels&&dist<r+285&&screen.y>90&&screen.y<this.height-115){const z=this.camera.zoom;c.save();c.translate(l.x,labelY);c.textAlign='center';c.font=`${10/z}px "Helvetica Neue",Arial,sans-serif`;c.lineWidth=3/z;c.strokeStyle='rgba(3,14,20,.65)';c.fillStyle=spent?'rgba(153,174,161,.7)':'rgba(214,229,208,.82)';const title=String(l.name||l.type).slice(0,38)+(refuge&&MorphosGame.hermitOf(l.id)?' · '+MorphosGame.hermitOf(l.id):'');c.strokeText(title,0,0);c.fillText(title,0,0);
     if(l.type.startsWith('wonder')&&!l.claimed){const w=(MorphosGame.WONDERS||[]).find(x=>x.type===l.type);c.font=`600 ${10/z}px "Helvetica Neue",Arial,sans-serif`;c.lineWidth=2/z;if(l.active){const amount=clamp((l.progress||0)/l.goal,0,1);c.fillStyle='rgba(240,212,140,.2)';c.fillRect(-45/z,8/z,90/z,3/z);c.fillStyle='rgba(240,212,140,.9)';c.fillRect(-45/z,8/z,90/z*amount,3/z);}}
     else if(refuge){const note=!restHere?'REST TO SET CHECKPOINT':restComplete?'REST COMPLETE':restHere.phase==='resting'?'RESTING':String(restHere.reason||'Stay still to rest').toUpperCase();c.font=`${10/z}px "Helvetica Neue",Arial,sans-serif`;c.lineWidth=2/z;c.fillStyle=restComplete?'rgba(210,246,211,.86)':restHere?'rgba(171,224,210,.8)':'rgba(160,205,190,.65)';c.strokeText(note,0,13/z);c.fillText(note,0,13/z);}else if(l.goal>0&&l.active&&!l.claimed){const amount=clamp((l.progress||0)/l.goal,0,1);c.fillStyle='rgba(177,210,183,.18)';c.fillRect(-35/z,8/z,70/z,2/z);c.fillStyle='rgba(195,231,176,.7)';c.fillRect(-35/z,8/z,70/z*amount,2/z);}else if(l.claimed){c.font=`${10/z}px "Helvetica Neue",Arial,sans-serif`;c.fillStyle='rgba(160,192,173,.5)';c.fillText(spent?'CLEARED':'DISCOVERED',0,11/z);}c.restore();}
   }
  }
  drawHazard(o,time){
   if(!this.visible(o))return;const c=this.ctx,r=o.r,phase=o.phase||0,vent=o.kind==='vent',cycle=time*.9+phase,sine=Math.sin(cycle),activity=Number.isFinite(o.active)?clamp(o.active,0,1):vent?Math.max(0,sine):.8+.2*Math.sin(time*.75+phase),danger=activity>.45,warning=vent&&!danger&&Math.cos(cycle)>0?clamp((sine+.32)/.77,0,1):0,co=vent?(danger?[245,183,104]:warning?[219,178,113]:[116,136,126]):[180,121,218];
   c.save();c.translate(o.x,o.y);c.globalAlpha=vent&&!danger&&!warning?.5:1;c.drawImage(this.glow(co),-r*1.35,-r*1.35,r*2.7,r*2.7);
   smoothBlob(c,r*.75,time*.3,phase,1,.06,16);c.fillStyle=rgba(co,danger?.075:.015+warning*.035);c.fill();c.strokeStyle=rgba(co,danger?.62:.18+warning*.28);c.lineWidth=danger?1.5:.8;if(!danger)c.setLineDash([3,8]);c.stroke();c.setLineDash([]);
   if(vent){
    for(let j=0;j<8;j++){const a=j*TAU/8+phase*.1;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.31,-r*.10);c.lineTo(r*.54,-r*.12);c.lineTo(r*.65,0);c.lineTo(r*.46,r*.13);c.closePath();c.fillStyle=rgba(co,danger?.14:.06);c.fill();c.strokeStyle=rgba(co,danger?.52:.27);c.lineWidth=.8;c.stroke();c.restore();}
    ellipse(c,0,0,r*.24,r*.19);c.fillStyle='rgba(3,14,18,.78)';c.fill();c.strokeStyle=rgba(co,danger?.8:.32+warning*.37);c.lineWidth=1.6;c.stroke();
    if(warning>0){for(let j=0;j<8;j++){const a=j*TAU/8;c.beginPath();c.arc(0,0,r*.9,a+.08,a+.54);c.strokeStyle=rgba(co,j/8<warning?.62:.10);c.lineWidth=1.5;c.stroke();}}
    if(danger){for(let j=0;j<6;j++){const u=(time*.65+j/6)%1,a=j*2.399+phase,rr=r*(.14+u*.43);ellipse(c,Math.cos(a)*rr,Math.sin(a)*rr,r*(.025+u*.035),r*(.036+u*.045),a);c.fillStyle=rgba([255,213,151],(1-u)*.24);c.fill();c.strokeStyle=rgba(co,(1-u)*.52);c.lineWidth=.75;c.stroke();}}
   }else{
    for(let j=0;j<7;j++){const a=phase+j*2.399+time*.07,k=.16+.075*(j%5),x=Math.cos(a)*r*k,y=Math.sin(a)*r*k;ellipse(c,x,y,r*(.08+.015*(j%3)),r*(.12+.015*(j%3)),a);c.fillStyle=rgba(co,.11);c.fill();c.strokeStyle=rgba(co,.30);c.lineWidth=.7;c.stroke();}
    c.strokeStyle=rgba(co,.36);c.lineWidth=.9;for(let j=0;j<5;j++){const a=j*TAU/5+phase;c.beginPath();c.arc(0,0,r*.88,a,a+.45);c.stroke();}
   }c.restore();
  }
  // Attack warnings for the apex bosses: the line or area an attack will cover, brightening as it comes.
  drawBossTelegraph(state,time){
   const b=state.bossEncounter;if(!b||b.hp<=0||!this.visible(b,b.r*7))return;
   const c=this.ctx,r=b.r,z=this.camera.zoom,warn=[255,214,168],k=b.attackKind||'';
   const line=(a,len,width,progress)=>{c.save();c.translate(b.x,b.y);c.rotate(a);c.fillStyle=rgba(warn,.05+.12*progress);c.fillRect(r*.5,-width,len,width*2);c.strokeStyle=rgba(warn,.25+.5*progress);c.lineWidth=1.4/z;c.setLineDash([10/z,8/z]);c.strokeRect(r*.5,-width,len,width*2);c.setLineDash([]);c.restore();};
   if(b.mode==='windup'){const progress=1-clamp(b.windup/Math.max(.01,b.windupMax),0,1),a=b.attackAngle;
    if(k==='engulf')line(a,r*2.7,r*.7,progress);else if(k==='grab')line(a,r*4.7,r*.16,progress);else if(k==='dash')line(a,r*3.6,r*.38,progress);else if(k==='charge')line(a,r*4.4,r*.7,progress);else if(k==='slam')line(a,r*1.7,r*.6,progress);
    else if(k==='sweep'){c.save();c.translate(b.x,b.y);c.beginPath();c.moveTo(0,0);c.arc(0,0,r*2,a-.8,a+.8);c.closePath();c.fillStyle=rgba(warn,.05+.12*progress);c.fill();c.strokeStyle=rgba(warn,.3+.5*progress);c.lineWidth=1.4/z;c.stroke();c.restore();}
    else if(k==='vortex'){const m={x:b.x+Math.cos(b.angle)*r*.72,y:b.y+Math.sin(b.angle)*r*.72};c.save();c.translate(m.x,m.y);for(let i=0;i<3;i++){const u=((time*.8+i/3)%1);c.beginPath();c.arc(0,0,r*3.8*(1-u*progress*.8),0,TAU);c.strokeStyle=rgba(warn,.12+.3*progress*(1-u));c.lineWidth=1.2/z;c.stroke();}c.restore();}
    else{c.save();c.translate(b.x,b.y);c.beginPath();c.arc(0,0,r*(1.05+.12*progress),0,TAU);c.strokeStyle=rgba(warn,.2+.5*progress);c.lineWidth=2/z;c.stroke();c.restore();}}
   if(k==='vortex'&&b.mode==='act'){const m={x:b.x+Math.cos(b.angle)*r*.72,y:b.y+Math.sin(b.angle)*r*.72};c.save();c.translate(m.x,m.y);c.strokeStyle=rgba([170,210,235],.22);c.lineWidth=1.3/z;
    for(let j=0;j<8;j++){const a0=j*TAU/8-time*1.4;c.beginPath();for(let i=0;i<=20;i++){const u=i/20,rr=r*3.8*(1-u),a=a0+u*2.4;if(i===0)c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();}c.restore();}
   for(const h of b.heads||[])if(h.mode==='windup'){const progress=clamp(1-h.t/.7,0,1);c.save();c.translate(b.x,b.y);c.rotate(h.aim);c.strokeStyle=rgba(warn,.25+.5*progress);c.lineWidth=Math.max(1,r*.32*2*progress*.15)/z;c.setLineDash([8/z,7/z]);c.beginPath();c.moveTo(r*1.15,0);c.lineTo(r*2.75,0);c.stroke();c.setLineDash([]);c.restore();}
  }
  drawBroodLinks(state,time){
   const b=state.bossEncounter;if(!b||b.type!=='brood'||b.hp<=0)return;
   const c=this.ctx,guards=(state.organisms||[]).filter(o=>o.bossId===b.id&&!o.dead&&o.hp>0).slice(0,4),co=[241,171,166];
   for(let i=0;i<guards.length;i++){const o=guards[i];if(!this.visible(b,900)&&!this.visible(o,900))continue;const dx=o.x-b.x,dy=o.y-b.y,d=Math.hypot(dx,dy)||1,ax=dx/d,ay=dy/d,sx=b.x+ax*b.r*.71,sy=b.y+ay*b.r*.71,ex=o.x-ax*o.r*1.08,ey=o.y-ay*o.r*1.08,bend=Math.sin(time*.65+i*1.7)*Math.min(24,d*.09),cx=(sx+ex)*.5-ay*bend,cy=(sy+ey)*.5+ax*bend;
    c.save();c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(cx,cy,ex,ey);c.strokeStyle=rgba(co,b.mode==='transform'?.25:.48);c.lineWidth=1/this.camera.zoom;c.stroke();
    for(let j=0;j<2;j++){const u=(time*.46+i*.19+j*.5)%1,v=1-u,x=v*v*ex+2*v*u*cx+u*u*sx,y=v*v*ey+2*v*u*cy+u*u*sy;ellipse(c,x,y,1.7/this.camera.zoom,1.7/this.camera.zoom);c.fillStyle=rgba([255,212,174],.78);c.fill();}
    c.strokeStyle=rgba(co,.61);c.lineWidth=.9/this.camera.zoom;for(let j=0;j<3;j++){const a=j*TAU/3+time*.07;c.beginPath();c.arc(o.x,o.y,o.r*1.14,a+.12,a+1.48);c.stroke();}ellipse(c,sx,sy,2.3/this.camera.zoom,2.3/this.camera.zoom);c.fillStyle=rgba(co,.78);c.fill();c.restore();
   }
  }
  // The apex bosses, drawn in the same style as every other creature: membranes, cells, jaws and cilia.
  drawBoss(state,time){
   const b=state.bossEncounter;if(!b||b.hp<=0)return;
   if(!this.visible(b,b.r*1.6)){this.drawBossPointer(b,state.player);return;}
   const c=this.ctx,r=b.r,z=this.camera.zoom,base={gulper:[200,217,143],brood:[228,165,198],pike:[196,233,240],hydra:[159,211,170],undertow:[134,182,218],kraken:[210,166,220]}[b.type]||[220,220,200];
   const co=mix(base,[255,250,240],clamp((b.flash||0)*3,0,.6)),winding=b.mode==='windup',progress=winding?1-clamp(b.windup/Math.max(.01,b.windupMax),0,1):0,k=b.attackKind,open=b.mode==='recover';
   if(b.type==='hydra')for(const h of b.heads||[]){c.save();const sx=b.x+Math.cos(h.aim)*r*.7,sy=b.y+Math.sin(h.aim)*r*.7,mx=(sx+h.tipX)/2+Math.cos(h.aim+1.57)*r*.25*Math.sin(time*1.5+h.off*3),my=(sy+h.tipY)/2+Math.sin(h.aim+1.57)*r*.25*Math.sin(time*1.5+h.off*3),pale=mix(co,[235,255,235],.4);
     // a segmented neck
     c.lineCap='round';c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(mx,my,h.tipX,h.tipY);c.strokeStyle=rgba(co,.55);c.lineWidth=r*.22;c.stroke();c.strokeStyle=rgba(mix(co,[20,40,30],.45),.6);c.lineWidth=r*.13;c.stroke();
     for(let j=1;j<7;j++){const u=j/7,v=1-u,x=v*v*sx+2*v*u*mx+u*u*h.tipX,y=v*v*sy+2*v*u*my+u*u*h.tipY,sr=r*.1*(1-u*.3);ellipse(c,x,y,sr,sr);c.strokeStyle=rgba(pale,.4);c.lineWidth=1.3;c.stroke();}
     // a long skull with glowing eyes and fanged jaws that gape before it snaps
     const hr=r*.3,gape=h.mode==='windup'?.6:h.mode==='strike'?.12:.22;c.translate(h.tipX,h.tipY);c.rotate(h.aim);c.drawImage(this.glow(co),-hr*2,-hr*2,hr*4,hr*4);
     for(const s of [-1,1]){c.save();c.rotate(s*gape*.7);c.beginPath();c.moveTo(-hr*.7,0);c.quadraticCurveTo(-hr*.3,s*hr*.8,hr*.55,s*hr*.42);c.quadraticCurveTo(hr*1.2,s*hr*.2,hr*1.4,s*hr*.03);c.lineTo(-hr*.3,s*hr*.04);c.closePath();c.fillStyle=rgba(co,.24);c.fill();c.strokeStyle=rgba(pale,.85);c.lineWidth=1.8;c.stroke();
       for(let j=0;j<5;j++){const x=hr*(-.05+j*.28),y=s*hr*(.06+.02*j);c.beginPath();c.moveTo(x-hr*.07,y);c.lineTo(x,y-s*hr*.2);c.lineTo(x+hr*.07,y);c.closePath();c.fillStyle=rgba([245,250,235],.85);c.fill();}c.restore();}
     for(const s of [-1,1]){ellipse(c,-hr*.2,s*hr*.45,hr*.14,hr*.1);c.fillStyle='rgba(250,238,150,.92)';c.fill();ellipse(c,-hr*.17,s*hr*.45,hr*.04,hr*.08);c.fillStyle='rgba(20,14,8,.9)';c.fill();}
     c.restore();}
   if(b.type==='undertow'){const tr=this._bossTrail&&this._bossTrail.id===b.id?this._bossTrail:(this._bossTrail={id:b.id,pts:[]});const last=tr.pts[0];if(!last||Math.hypot(last.x-b.x,last.y-b.y)>r*.22)tr.pts.unshift({x:b.x,y:b.y});tr.pts.length=Math.min(tr.pts.length,14);
     for(let i=tr.pts.length-1;i>=1;i--){const q=tr.pts[i],w=r*(1-i/16)*.85;c.save();c.translate(q.x,q.y);smoothBlob(c,w,time,i*.7,1,.05,14,3);c.fillStyle=rgba(co,.07);c.fill();c.strokeStyle=rgba(co,.32);c.lineWidth=1.4;c.stroke();c.restore();}}
   c.save();c.translate(b.x,b.y);c.rotate(b.angle);c.drawImage(this.glow(co),-r*2,-r*2,r*4,r*4);
   if((b.healFlash||0)>0){c.beginPath();c.arc(0,0,r*1.12,0,TAU);c.strokeStyle=rgba([170,240,150],.35*b.healFlash);c.lineWidth=4/z;c.stroke();}
   if(b.type==='gulper'){
     // A giant predatory amoeba: grasping arms reaching ahead, a ragged mouth, and its last meals still inside it.
     const gape=k==='engulf'&&(winding||b.mode==='act')?(winding?progress:1):0,spread=1+gape*.55,reachK=1+gape*.35,pale=mix(co,[255,250,230],.45);c.lineJoin='round';c.lineCap='round';
     for(const [ang,len,ph] of [[-1.15,1.2,0],[-.45,1.38,1.7],[.45,1.38,3.1],[1.15,1.2,4.4]]){
       const aa=ang*spread*(.88+.12*Math.sin(time*1.3+ph)),L=r*len*reachK*(1+.06*Math.sin(time*2+ph)),w=r*.24,bx=Math.cos(aa)*r*.55,by=Math.sin(aa)*r*.55,tx=Math.cos(aa)*L,ty=Math.sin(aa)*L,nx=-Math.sin(aa),ny=Math.cos(aa),bend=Math.sin(time*1.6+ph)*r*.12;
       c.beginPath();c.moveTo(bx+nx*w,by+ny*w);c.quadraticCurveTo((bx+tx)/2+nx*(w*.8+bend),(by+ty)/2+ny*(w*.8+bend),tx+nx*w*.35,ty+ny*w*.35);c.quadraticCurveTo(tx+Math.cos(aa)*w*.6,ty+Math.sin(aa)*w*.6,tx-nx*w*.35,ty-ny*w*.35);c.quadraticCurveTo((bx+tx)/2-nx*(w*.8-bend),(by+ty)/2-ny*(w*.8-bend),bx-nx*w,by-ny*w);c.closePath();
       c.fillStyle=rgba(co,.13);c.fill();c.strokeStyle=rgba(co,.62);c.lineWidth=2;c.stroke();
       for(const s of [-1,1]){c.beginPath();c.moveTo(tx+nx*s*w*.25,ty+ny*s*w*.25);c.lineTo(tx+Math.cos(aa+s*.55)*w*1.1,ty+Math.sin(aa+s*.55)*w*1.1);c.strokeStyle=rgba(pale,.65);c.lineWidth=1.8;c.stroke();}}
     c.save();c.translate(-r*.12,0);smoothBlob(c,r,time*.5,0,1.08,.12,26,5);c.fillStyle=rgba(co,.15);c.fill();c.strokeStyle=rgba(co,.72);c.lineWidth=2.6;c.stroke();
     smoothBlob(c,r*.86,time*.5,1.3,1.08,.1,22,4);c.strokeStyle=rgba(co,.25);c.lineWidth=1.2;c.stroke();
     for(let i=0;i<Math.min(5,2+(b.meals||0));i++){const aa=i*2.3+time*.12,d=r*(.22+.2*((i*.41)%1)),pr=r*(.1+.03*(i%2));c.save();c.translate(Math.cos(aa)*d-r*.1,Math.sin(aa)*d);c.rotate(aa*1.7);ellipse(c,0,0,pr*1.35,pr);c.fillStyle=rgba(mix(co,[220,150,160],.55),.24);c.fill();c.strokeStyle=rgba(mix(co,[230,170,170],.5),.5);c.lineWidth=1;c.stroke();ellipse(c,pr*.25,0,pr*.38,pr*.34);c.fillStyle='rgba(90,40,60,.38)';c.fill();c.beginPath();c.moveTo(-pr*1.3,0);c.quadraticCurveTo(-pr*1.8,pr*.4,-pr*2.1,0);c.strokeStyle=rgba(mix(co,[230,170,170],.5),.4);c.stroke();c.restore();}
     for(let i=0;i<6;i++){const aa=i*1.05+1;ellipse(c,Math.cos(aa)*r*.55,Math.sin(aa)*r*.48,r*.045,r*.045);c.fillStyle=rgba(pale,.25);c.fill();}
     ellipse(c,-r*.45,r*.05,r*.2,r*.17);c.fillStyle=rgba(mix(co,[60,70,40],.5),.5);c.fill();c.strokeStyle=rgba(co,.5);c.lineWidth=1.2;c.stroke();c.restore();
     const mo=.25+gape*.75,mx=r*.7,mrx=r*(.14+.14*mo),mry=r*(.16+.34*mo);ellipse(c,mx,0,mrx,mry);c.fillStyle='rgba(10,16,12,.78)';c.fill();c.strokeStyle=rgba(pale,.8);c.lineWidth=2;c.stroke();
     for(let i=0;i<16;i++){const aa=i/16*TAU;c.beginPath();c.moveTo(mx+Math.cos(aa)*mrx,Math.sin(aa)*mry);c.lineTo(mx+Math.cos(aa)*mrx*.62,Math.sin(aa)*mry*.62);c.strokeStyle=rgba(pale,.7);c.lineWidth=1.4;c.stroke();}
     if(k==='sweep'&&winding){c.save();c.rotate(-.8+progress*.4);ellipse(c,r*1.1,0,r*.5*progress+r*.1,r*.16);c.fillStyle=rgba(co,.18);c.fill();c.strokeStyle=rgba(co,.6);c.stroke();c.restore();}}
   else if(b.type==='brood'){
     // An armoured queen: a swollen, segmented abdomen full of young, a plated head, spiny legs and great pincers.
     const swell=k==='birth'&&winding?1+progress*.16:1,grip=k==='slam'&&winding?progress:.3,pale=mix(co,[255,235,240],.45),dark=mix(co,[60,20,40],.5);c.lineCap='round';c.lineJoin='round';
     for(const s of [-1,1])for(let i=0;i<3;i++){const sw=Math.sin(time*3+i*2.1+(s>0?1:0))*.18,x0=r*(.3-i*.4),y0=s*r*.6,kx=x0+r*(.1+sw*.6),ky=s*r*1.02,fx=x0+r*(-.08+sw),fy=s*r*1.32;
       c.beginPath();c.moveTo(x0,y0);c.lineTo(kx,ky);c.lineTo(fx,fy);c.strokeStyle=rgba(co,.6);c.lineWidth=r*.065;c.stroke();c.strokeStyle=rgba(pale,.5);c.lineWidth=r*.018;c.stroke();
       for(let j=1;j<3;j++){const u=j/3,sx=x0+(kx-x0)*u,sy=y0+(ky-y0)*u;c.beginPath();c.moveTo(sx,sy);c.lineTo(sx-r*.09,sy+s*r*.05);c.strokeStyle=rgba(pale,.55);c.lineWidth=1.3;c.stroke();}}
     c.save();c.translate(-r*.3,0);c.scale(swell,swell);
     this.cilia(c,r*.86,time,0,co,32,r*.06);
     ellipse(c,0,0,r*.94,r*.76);c.fillStyle=rgba(co,.14);c.fill();c.strokeStyle=rgba(co,.72);c.lineWidth=2.4;c.stroke();
     for(let i=1;i<5;i++){const x=-r*.94+i*r*.376,h=r*.76*Math.sqrt(Math.max(0,1-Math.pow(x/(r*.94),2)));c.beginPath();c.ellipse(x,0,r*.1,h,0,-Math.PI/2,Math.PI/2);c.strokeStyle=rgba(co,.32);c.lineWidth=1.2;c.stroke();}
     const lit=k==='birth'&&winding?progress:.2;for(let i=0;i<13;i++){const aa=i*2.399,d=r*.6*Math.sqrt((i+.5)/13),x=Math.cos(aa)*d*1.18,y=Math.sin(aa)*d*.92,er=r*(.085+.015*Math.sin(time*2+i));
       ellipse(c,x,y,er,er);c.fillStyle=rgba(mix(co,[255,200,220],.45),.16+.3*lit);c.fill();c.strokeStyle=rgba(pale,.5);c.lineWidth=1;c.stroke();c.beginPath();c.arc(x,y,er*.45,aa,aa+3.6);c.strokeStyle=rgba(dark,.8);c.lineWidth=er*.32;c.stroke();}
     c.restore();
     const hx=r*.62;for(const s of [-1,1]){const o=.25+grip*.75,B=[hx+r*.22,s*r*.2],T=[hx+r*1.02,s*r*(.06+.2*o)];c.beginPath();c.moveTo(B[0],B[1]);c.quadraticCurveTo(hx+r*.72,s*r*(.6+.28*o),T[0],T[1]);c.quadraticCurveTo(hx+r*.7,s*r*(.3+.18*o),B[0]+r*.05,s*r*.08);c.closePath();c.fillStyle=rgba(mix(co,[120,60,80],.3),.4);c.fill();c.strokeStyle=rgba(pale,.85);c.lineWidth=2;c.stroke();
       for(let j=1;j<4;j++){const u=j/4,x=B[0]+(T[0]-B[0])*u,y=s*r*(.12+.2*o)*(1-Math.abs(u-.6));c.beginPath();c.moveTo(x-r*.04,y);c.lineTo(x,y-s*r*.07);c.lineTo(x+r*.04,y);c.fillStyle=rgba(pale,.8);c.fill();}}
     ellipse(c,hx,0,r*.4,r*.35);c.fillStyle=rgba(mix(co,[90,50,70],.3),.38);c.fill();c.strokeStyle=rgba(pale,.8);c.lineWidth=2.2;c.stroke();
     for(const s of [-1,1]){c.beginPath();c.arc(hx-r*.08,0,r*.26,s>0?.35:-1.25,s>0?1.25:-.35);c.strokeStyle=rgba(pale,.45);c.lineWidth=1.4;c.stroke();ellipse(c,hx+r*.2,s*r*.16,r*.06,r*.06);c.fillStyle='rgba(30,10,24,.92)';c.fill();ellipse(c,hx+r*.22,s*r*.16-r*.02,r*.018,r*.018);c.fillStyle='rgba(255,240,245,.9)';c.fill();}}
   else if(b.type==='pike'){
     // An arrow worm made of glass: a long clear body, fins and a spade tail, and fans of grasping hooks that flare before it dashes.
     const flare=k==='dash'&&(winding||b.mode==='act')?(winding?progress:1):0,pale=mix(co,[255,255,255],.35),L=r*1.5,W=r*.3,wig=Math.sin(time*6)*r*.04;c.lineCap='round';c.lineJoin='round';
     for(const [fx,fl] of [[-L*.15,.9],[-L*.62,.7]])for(const s of [-1,1]){c.beginPath();c.moveTo(fx+r*.3,s*W*.85);c.lineTo(fx-r*.1,s*(W+r*.42*fl));c.lineTo(fx-r*.45,s*W*.75);c.closePath();c.fillStyle=rgba(co,.1);c.fill();c.strokeStyle=rgba(pale,.5);c.lineWidth=1.2;c.stroke();
       for(let j=1;j<4;j++){const u=j/4;c.beginPath();c.moveTo(fx+r*.3-r*.75*u,s*W*.8);c.lineTo(fx+r*.3-r*.4*u-r*.1*u,s*(W+r*.42*fl*(1-Math.abs(u-.45))));c.strokeStyle=rgba(pale,.25);c.lineWidth=1;c.stroke();}}
     c.beginPath();c.moveTo(-L*.92,wig);c.lineTo(-L*1.3,-r*.3+wig);c.quadraticCurveTo(-L*1.18,wig,-L*1.3,r*.3+wig);c.closePath();c.fillStyle=rgba(co,.12);c.fill();c.strokeStyle=rgba(pale,.6);c.lineWidth=1.4;c.stroke();
     c.beginPath();c.moveTo(L,0);c.bezierCurveTo(L*.9,-W*1.1,L*.2,-W*1.15,-L*.3,-W*.8);c.quadraticCurveTo(-L*.8,-W*.45+wig,-L,wig);c.quadraticCurveTo(-L*.8,W*.45+wig,-L*.3,W*.8);c.bezierCurveTo(L*.2,W*1.15,L*.9,W*1.1,L,0);c.closePath();
     c.fillStyle=rgba(co,.13);c.fill();c.strokeStyle=rgba(pale,.85);c.lineWidth=2;c.stroke();
     c.beginPath();c.moveTo(L*.75,0);c.lineTo(-L*.9,wig*.5);c.strokeStyle=rgba(mix(co,[255,220,190],.3),.42);c.lineWidth=r*.05;c.stroke();
     for(let i=0;i<5;i++){ellipse(c,L*(.5-i*.3),0,r*.05,r*.035);c.fillStyle='rgba(255,232,205,.4)';c.fill();}
     c.beginPath();c.moveTo(L*.7,-W*.6);c.quadraticCurveTo(L*.2,-W*.95,-L*.3,-W*.62);c.strokeStyle='rgba(255,255,255,.4)';c.lineWidth=1.6;c.stroke();
     for(const s of [-1,1]){ellipse(c,L*.74,s*W*.38,r*.045,r*.045);c.fillStyle='rgba(12,20,26,.95)';c.fill();
       for(let i=0;i<5;i++){const aa=s*(.28+i*.17)*(1+flare*1.3)+s*.05*Math.sin(time*3+i),len=r*(.46-.05*i)*(1+flare*.3),bx=L*.92,by=s*W*.22,cx=bx+Math.cos(aa)*len,cy=by+Math.sin(aa)*len,hk=aa-s*(1.5-flare*.6);
         c.beginPath();c.moveTo(bx,by);c.quadraticCurveTo(cx,cy,cx+Math.cos(hk)*len*.32,cy+Math.sin(hk)*len*.32);c.strokeStyle=rgba(pale,.9);c.lineWidth=r*.035;c.stroke();}}}
   else if(b.type==='hydra'){
     // An armoured crown of plates around a toothed central maw; its heads are drawn on their necks above.
     const pale=mix(co,[235,255,235],.4);
     if(b.phase===1){for(let i=0;i<8;i++){const aa=Math.PI+(i-3.5)*.3;c.beginPath();c.moveTo(Math.cos(aa)*r*.9,Math.sin(aa)*r*.9);c.quadraticCurveTo(Math.cos(aa)*r*1.4,Math.sin(aa)*r*1.4+Math.sin(time+i)*r*.1,Math.cos(aa)*r*1.7,Math.sin(aa)*r*1.7);c.strokeStyle=rgba(co,.35);c.lineWidth=2;c.stroke();}}
     c.save();c.rotate(time*.05);for(let i=0;i<7;i++){c.save();c.rotate(i*TAU/7);c.beginPath();c.moveTo(r*.35,-r*.33);c.quadraticCurveTo(r*.95,-r*.42,r*1.08,0);c.quadraticCurveTo(r*.95,r*.42,r*.35,r*.33);c.closePath();c.fillStyle=rgba(co,.17);c.fill();c.strokeStyle=rgba(pale,.62);c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(r*.45,0);c.lineTo(r*.96,0);c.strokeStyle=rgba(co,.38);c.lineWidth=1.2;c.stroke();c.restore();}c.restore();
     ellipse(c,0,0,r*.62,r*.62);c.fillStyle=rgba(co,.2);c.fill();c.strokeStyle=rgba(pale,.75);c.lineWidth=2.2;c.stroke();
     ellipse(c,0,0,r*.3,r*.3);c.fillStyle='rgba(8,18,12,.85)';c.fill();for(let i=0;i<12;i++){const aa=i*TAU/12+time*.2;c.beginPath();c.moveTo(Math.cos(aa)*r*.3,Math.sin(aa)*r*.3);c.lineTo(Math.cos(aa+.13)*r*.16,Math.sin(aa+.13)*r*.16);c.lineTo(Math.cos(aa+.26)*r*.3,Math.sin(aa+.26)*r*.3);c.fillStyle=rgba(pale,.75);c.fill();}}
   else if(b.type==='undertow'){
     // An abyssal gulper eel: a cavern of a mouth lined with needle teeth, a glowing lure, light organs and trailing fin frills.
     const gape=k==='vortex'&&(b.mode==='act'||winding)?(winding?.35+progress*.65:1):.25,pale=mix(co,[240,250,255],.45),wav=Math.sin(time*2)*r*.06,ja=.22+gape*.42;c.lineCap='round';c.lineJoin='round';
     for(const s of [-1,1]){c.beginPath();for(let i=0;i<=12;i++){const u=i/12,x=r*.15-u*r*1.75,y=s*(r*(.74-u*.5)+r*.2*(1-u*.6)*(.6+.4*Math.sin(time*4+i*.9)))+wav*u;if(i)c.lineTo(x,y);else c.moveTo(x,y);}c.strokeStyle=rgba(co,.5);c.lineWidth=1.4;c.stroke();
       for(let i=0;i<12;i++){const u=i/12,x=r*.15-u*r*1.75;c.beginPath();c.moveTo(x,s*r*(.74-u*.5)*.86+wav*u);c.lineTo(x-r*.04,s*(r*(.74-u*.5)+r*.2*(1-u*.6)*(.6+.4*Math.sin(time*4+i*.9)))+wav*u);c.strokeStyle=rgba(co,.25);c.lineWidth=1;c.stroke();}}
     c.beginPath();c.moveTo(r*.3,-r*.8);c.bezierCurveTo(-r*.4,-r*.86,-r*1.1,-r*.42,-r*1.75,wav);c.bezierCurveTo(-r*1.1,r*.42,-r*.4,r*.86,r*.3,r*.8);c.fillStyle=rgba(co,.13);c.fill();c.strokeStyle=rgba(co,.7);c.lineWidth=2.4;c.stroke();
     for(const s of [-1,1])for(let i=0;i<7;i++){const u=i/7;ellipse(c,r*.2-u*r*1.55,s*r*(.6-u*.4)*.72+wav*u,r*.035,r*.035);c.fillStyle=rgba([170,230,255],.5+.35*Math.sin(time*3+i));c.fill();}
     const hx=r*.12,hr=r*.86;c.beginPath();c.moveTo(hx,0);c.arc(hx,0,hr,ja,TAU-ja);c.closePath();c.fillStyle=rgba(mix(co,[10,24,34],.62),.94);c.fill();c.fillStyle=rgba(co,.14);c.fill();c.strokeStyle=rgba(pale,.75);c.lineWidth=2.4;c.stroke();
     c.beginPath();c.moveTo(hx,0);c.arc(hx,0,hr,-ja,ja);c.closePath();c.fillStyle='rgba(5,9,18,.88)';c.fill();
     for(const s of [-1,1])for(let i=0;i<7;i++){const d=hr*(.32+i*.1),x=hx+Math.cos(s*ja)*d,y=Math.sin(s*ja)*d,n=s*ja-s*Math.PI/2,len=r*(.12+.06*((i*7)%3));c.beginPath();c.moveTo(x+Math.cos(s*ja)*r*.025,y+Math.sin(s*ja)*r*.025);c.lineTo(x+Math.cos(n)*len,y+Math.sin(n)*len);c.lineTo(x-Math.cos(s*ja)*r*.025,y-Math.sin(s*ja)*r*.025);c.closePath();c.fillStyle='rgba(235,245,255,.9)';c.fill();}
     for(const s of [-1,1]){c.beginPath();c.arc(hx-r*.2,0,r*.48,s*.55,s*1.25,s<0);c.strokeStyle=rgba(pale,.35);c.lineWidth=1.6;c.stroke();c.beginPath();c.arc(hx-r*.28,0,r*.48,s*.5,s*1.2,s<0);c.stroke();for(let i=0;i<4;i++){const aa=s*(ja+.18+i*.22),d=hr*.8;ellipse(c,hx+Math.cos(aa)*d,Math.sin(aa)*d,r*.03,r*.03);c.fillStyle=rgba([170,230,255],.55+.35*Math.sin(time*3+i+s));c.fill();}}ellipse(c,hx-r*.05,-r*.42,r*.07,r*.07);c.fillStyle='rgba(230,245,255,.85)';c.fill();ellipse(c,hx-r*.04,-r*.42,r*.03,r*.05);c.fillStyle='rgba(5,10,18,.95)';c.fill();
     const lx=hx+r*.85+Math.sin(time*1.7)*r*.08,ly=-r*1.12+Math.cos(time*1.3)*r*.05;c.beginPath();c.moveTo(hx-r*.1,-r*.82);c.quadraticCurveTo(hx+r*.5,-r*1.45,lx,ly);c.strokeStyle=rgba(co,.6);c.lineWidth=r*.03;c.stroke();
     c.drawImage(this.glow([170,230,255]),lx-r*.35,ly-r*.35,r*.7,r*.7);ellipse(c,lx,ly,r*.07,r*.07);c.fillStyle='rgba(215,245,255,.95)';c.fill();}
   else if(b.type==='kraken'){
     // A giant squid facing its prey: arms and two long tentacles reaching ahead, a long finned mantle behind, and two great eyes.
     const reach=winding?1.25:b.mode==='act'?1.1:1,spread=k==='slam'&&winding?1.5:k==='vortex'&&(winding||b.mode==='act')?1.8:1,pale=mix(co,[255,240,255],.45);
     c.lineCap='round';
     for(let i=0;i<8;i++){const side=(i-3.5)/3.5,a0=side*.5*spread,len=r*(1.05+.25*Math.cos(i*1.7))*reach,wave=Math.sin(time*2.1+i*1.3)*r*.14,x0=r*.5,y0=side*r*.34,x1=x0+Math.cos(a0)*len,y1=y0+Math.sin(a0)*len+wave;
       c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo(x0+Math.cos(a0)*len*.5,y0+Math.sin(a0)*len*.5-wave*1.4,x1,y1);c.strokeStyle=rgba(co,.5);c.lineWidth=r*.085;c.stroke();c.strokeStyle=rgba(pale,.5);c.lineWidth=r*.022;c.stroke();
       for(let j=1;j<5;j++){const u=j/5,sx=x0+(x1-x0)*u,sy=y0+(y1-y0)*u-wave*1.4*(1-Math.abs(u-.5)*2)*.5;ellipse(c,sx,sy,r*.017,r*.017);c.fillStyle=rgba(pale,.55);c.fill();}}
     for(const side of [-1,1]){const len=r*1.75*reach,wave=Math.sin(time*1.4+side)*r*.2,x0=r*.45,y0=side*r*.16,x1=x0+len,y1=y0+side*r*.22*spread+wave;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo(x0+len*.55,y0-wave,x1,y1);c.strokeStyle=rgba(co,.45);c.lineWidth=r*.05;c.stroke();ellipse(c,x1,y1,r*.13,r*.07,Math.atan2(y1-y0,len));c.fillStyle=rgba(co,.3);c.fill();c.strokeStyle=rgba(pale,.6);c.lineWidth=1.6;c.stroke();}
     // mantle and fins
     c.save();c.translate(-r*.42,0);c.scale(1.5,.74);smoothBlob(c,r*.78,time*.4,0,1.06,.035,20,3);c.fillStyle=rgba(co,.14);c.fill();c.strokeStyle=rgba(co,.7);c.lineWidth=2.2;c.stroke();c.restore();
     for(const side of [-1,1]){c.beginPath();c.moveTo(-r*1.25,side*r*.3);c.quadraticCurveTo(-r*1.75,side*r*(.95+.06*Math.sin(time*2+side)),-r*.85,side*r*.56);c.closePath();c.fillStyle=rgba(co,.1);c.fill();c.strokeStyle=rgba(co,.5);c.lineWidth=1.6;c.stroke();}
     for(let i=0;i<5;i++){ellipse(c,-r*(.15+i*.24),0,r*(.09-.01*i),r*.05);c.fillStyle=rgba(pale,.22);c.fill();}
     // eyes: they glow, and they are what you can see when the water is black
     for(const side of [-1,1]){const ex=r*.36,ey=side*r*.36,er=r*.17;ellipse(c,ex,ey,er,er);c.fillStyle='rgba(250,236,170,.9)';c.fill();c.strokeStyle=rgba(pale,.8);c.lineWidth=1.8;c.stroke();ellipse(c,ex+er*.2,ey,er*.42,er*.72);c.fillStyle='rgba(12,8,20,.95)';c.fill();}}
   c.restore();
   if(b.type==='kraken'&&b.mode==='act'&&b.grab){const G=b.grab,mx=b.x+Math.cos(b.angle)*r*.72,my=b.y+Math.sin(b.angle)*r*.72,dx=G.tipX-mx,dy=G.tipY-my,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,wave=Math.sin(time*9)*r*.08;
     c.save();c.lineCap='round';c.beginPath();c.moveTo(mx,my);c.quadraticCurveTo((mx+G.tipX)/2+nx*wave,(my+G.tipY)/2+ny*wave,G.tipX,G.tipY);c.strokeStyle=rgba(co,.75);c.lineWidth=r*.09;c.stroke();c.strokeStyle=rgba(mix(co,[255,240,255],.45),.7);c.lineWidth=r*.025;c.stroke();
     for(let j=1;j<7;j++){const u=j/7;ellipse(c,mx+dx*u+nx*wave*4*u*(1-u),my+dy*u+ny*wave*4*u*(1-u),r*.02,r*.02);c.fillStyle='rgba(250,230,255,.7)';c.fill();}
     ellipse(c,G.tipX,G.tipY,r*.16,r*.1,Math.atan2(dy,dx));c.fillStyle=rgba(co,.45);c.fill();c.strokeStyle=rgba(mix(co,[255,240,255],.5),.85);c.lineWidth=2/z;c.stroke();
     if(G.stage==='hold'){c.beginPath();c.arc(G.tipX,G.tipY,state.player.r*1.35,0,TAU);c.strokeStyle='rgba(240,140,200,.8)';c.lineWidth=3/z;c.setLineDash([5/z,5/z]);c.stroke();c.setLineDash([]);}
     c.restore();}
   c.save();c.translate(b.x,b.y);c.rotate(b.angle);
   if(open){c.beginPath();c.arc(0,0,r*1.08,0,TAU);c.setLineDash([6/z,8/z]);c.strokeStyle=rgba([255,236,190],.45);c.lineWidth=2/z;c.stroke();c.setLineDash([]);}
   c.restore();
  }
  // An arrow at the edge of the view pointing to a boss that is out of sight, brighter as it gets close.
  // Another player: their body, their name, and an arrow at the edge of the screen when they are out of view.
  drawPeer(q,p,time){
   const c=this.ctx,z=this.camera.zoom,cull=this.cull;if(!cull||!Number.isFinite(q.x)||!q.r)return;const colour=q.colour||'#d6eda2',font='600 12px "Helvetica Neue",Arial,sans-serif';
   if(q.brood&&q.brood.length){const co=mix(this.playerColour(q),[245,214,140],.35);for(const b of q.brood)if(this.visible(b,30))this.drawBroodling(b,co,time);c.globalAlpha=1;}
   if(this.visible(q,q.r*2)){
    // Drawn exactly as my own cell is, swimming and all. The renderer keeps a little animation memory for the
    // one player it normally draws; each friend gets their own copy of it, swapped in for the moment they are drawn.
    const KEYS=['_playerSnap','_morphFrom','_swim','_swimAt','_swimTarget','_settleAt','_edge'],mine={},theirs=(this._peerAnim||(this._peerAnim=new Map())).get(q.peer)||{};
    for(const k of KEYS){mine[k]=this[k];this[k]=theirs[k];}
    try{this.drawPlayer(q.down>0?{...q,stealth:.75,invulnerable:0,sprinting:false}:q,time);}finally{for(const k of KEYS){theirs[k]=this[k];this[k]=mine[k];}this._peerAnim.set(q.peer,theirs);}
    c.globalAlpha=1;
    if(q.down>0){
     // Down: a red ring empties as their time runs out; a green ring fills while someone revives them.
     const R=q.r+10/z;c.save();c.lineCap='round';c.lineWidth=3/z;c.strokeStyle='rgba(255,139,145,.25)';c.beginPath();c.arc(q.x,q.y,R,0,TAU);c.stroke();c.strokeStyle='rgba(255,139,145,.95)';c.beginPath();c.arc(q.x,q.y,R,-Math.PI/2,-Math.PI/2+TAU*clamp(q.down/(MorphosGame.COOP_DOWN_SECONDS||60),0,1));c.stroke();
     if(q.reviveShown>0){c.strokeStyle='rgba(190,240,150,.95)';c.lineWidth=4/z;c.beginPath();c.arc(q.x,q.y,R+6/z,-Math.PI/2,-Math.PI/2+TAU*clamp(q.reviveShown,0,1));c.stroke();}
     c.restore();}
    c.save();c.translate(q.x,q.y-q.r-12/z);c.scale(1/z,1/z);c.font=font;c.textAlign='center';c.fillStyle='rgba(4,20,24,.6)';const w=c.measureText(q.name||'').width+14;c.beginPath();c.roundRect(-w/2,-15,w,20,10);c.fill();c.fillStyle=q.active===false?'rgba(200,210,200,.6)':colour;c.fillText(q.name||'',0,0);c.restore();
    // Resting (their pause screen is open): a pale shell, untouchable.
    if(q.active===false&&!(q.down>0)){c.save();c.strokeStyle='rgba(226,232,214,.5)';c.lineWidth=2/z;c.setLineDash([6/z,5/z]);c.beginPath();c.arc(q.x,q.y,q.r+7/z,0,TAU);c.stroke();c.restore();}
    return;}
   const cx=(cull.left+cull.right)/2,cy=(cull.top+cull.bottom)/2,a=Math.atan2(q.y-cy,q.x-cx),hw=(cull.right-cull.left)/2-46/z,hh=(cull.bottom-cull.top)/2-70/z,t=Math.min(hw/Math.abs(Math.cos(a)||1e-6),hh/Math.abs(Math.sin(a)||1e-6));let x=cx+Math.cos(a)*t,y=cy+Math.sin(a)*t;
   // Keep the arrow inside the part of the screen the HUD leaves free.
   const f=this.playArea;if(f){x=clamp(x,cull.left+(f.left+24)/z,cull.left+(f.left+f.width-24)/z);y=clamp(y,cull.top+(f.top+24)/z,cull.top+(f.top+f.height-24)/z);}
   c.save();c.translate(x,y);c.scale(1/z,1/z);c.save();c.rotate(a);c.beginPath();c.moveTo(15,0);c.lineTo(-7,-9);c.lineTo(-3,0);c.lineTo(-7,9);c.closePath();c.fillStyle=colour;c.globalAlpha=.85;c.fill();c.restore();c.font=font;c.textAlign='center';c.fillStyle=colour;c.globalAlpha=.85;c.fillText(q.name||'',-Math.cos(a)*34,-Math.sin(a)*22+4);c.restore();
  }
  drawBossPointer(b,p){
   const c=this.ctx,z=this.camera.zoom,cull=this.cull;if(!cull)return;const cx=(cull.left+cull.right)/2,cy=(cull.top+cull.bottom)/2,a=Math.atan2(b.y-cy,b.x-cx),hw=(cull.right-cull.left)/2-40/z,hh=(cull.bottom-cull.top)/2-60/z;
   const t=Math.min(hw/Math.abs(Math.cos(a)||1e-6),hh/Math.abs(Math.sin(a)||1e-6)),x=cx+Math.cos(a)*t,y=cy+Math.sin(a)*t,d=Math.hypot(b.x-p.x,b.y-p.y),near=clamp(1-(d-b.r)/(b.r*10),0,1),pulse=.6+.4*Math.sin(performance.now()/1000*(3+near*6));
   c.save();c.translate(x,y);c.rotate(a);c.scale(1/z,1/z);c.beginPath();c.moveTo(16,0);c.lineTo(-8,-11);c.lineTo(-3,0);c.lineTo(-8,11);c.closePath();c.fillStyle=rgba([255,190,170],(.35+.5*near)*pulse);c.fill();c.restore();
  }
  drawStatus(o,time){
   const poison=Number(o.poison)||0,slow=Number(o.slowTime)||0;if(poison<=0&&slow<=0)return;const c=this.ctx,r=o.r||20,key=idNumber(o.id);c.save();c.translate(o.x,o.y);
   if(poison>0){const fade=Math.min(1,poison);for(let j=0;j<3;j++){const u=(time*.34+j/3+rnd(key))%1,a=j*2.399+rnd(key+7)*TAU,rr=r*(.68+u*.27),size=Math.max(1.8,r*.045)*(1-u*.35);ellipse(c,Math.cos(a)*rr,Math.sin(a)*rr,size,size);c.fillStyle=rgba([173,226,116],fade*.20*(1-u*.45));c.fill();c.strokeStyle=rgba([198,242,143],fade*.72*(1-u*.45));c.lineWidth=.85/this.camera.zoom;c.stroke();}}
   if(slow>0){c.strokeStyle=rgba([137,220,239],Math.min(1,slow)*.57);c.lineWidth=.85/this.camera.zoom;for(let j=0;j<3;j++){const a=j*TAU/3+.3;c.beginPath();c.arc(0,0,r*1.08,a,a+.64);c.stroke();const x=Math.cos(a+.32)*r*1.08,y=Math.sin(a+.32)*r*1.08;c.beginPath();c.moveTo(x-2,y-3);c.lineTo(x+2,y+3);c.stroke();}}c.restore();
  }
  cellBody(c,r,time,phase,co,detail=1,stretch=1,rough=.05,lobes=3,clarity=0){
   smoothBlob(c,r,time,phase,stretch,rough,18,lobes);
   // The body's fill depends only on its size, colour and clarity, so it is made once and reused (a new gradient for every
   // creature every frame was over a thousand a second in busy water).
   const g=this._grad(c,'b'+Math.round(r*2)+'|'+co.map(x=>Math.round(x/6)).join(',')+'|'+Math.round(clarity*10),()=>{const q=c.createRadialGradient(-r*.28,-r*.3,r*.02,0,0,r*1.15);q.addColorStop(0,rgba(mix(co,[237,255,244],.5),.25+clarity*.08));q.addColorStop(.35,rgba(co,.16+clarity*.04));q.addColorStop(.7,rgba(co,.09+clarity*.03));q.addColorStop(.91,rgba(co,.21+clarity*.05));q.addColorStop(1,rgba(co,.045));return q;});c.fillStyle=g;c.fill();c.strokeStyle=rgba(mix(co,[232,255,244],.55),.66+clarity*.14);c.lineWidth=Math.max(.65,r*.023,clarity*.85/Math.max(.1,this.camera.zoom));c.stroke();
   smoothBlob(c,r*.934,time,phase+.1,stretch,rough*.95,18,lobes);c.strokeStyle=rgba(co,.26);c.lineWidth=Math.max(.4,r*.012);c.stroke();
   // Cytoplasm: bounded organelles, a double nuclear envelope and a folded Golgi body.
   const nr=r*.26,nx=-r*.1+Math.sin(time*.4+phase)*r*.027,ny=r*.07;
   ellipse(c,nx,ny,nr,nr*.9,phase*.1);{const ng=this._grad(c,'n'+Math.round(nr*2)+'|'+co.map(x=>Math.round(x/6)).join(','),()=>{const q=c.createRadialGradient(-nr*.3,-nr*.3,0,0,0,nr);q.addColorStop(0,'rgba(118,122,180,.43)');q.addColorStop(.6,'rgba(63,76,128,.44)');q.addColorStop(1,rgba(co,.2));return q;});c.save();c.translate(nx,ny);c.fillStyle=ng;c.fill();c.restore();}c.strokeStyle=rgba(mix(co,[171,168,220],.6),.68);c.lineWidth=Math.max(.55,r*.016);c.stroke();ellipse(c,nx,ny,nr*.82,nr*.73,phase*.1);c.strokeStyle=rgba(co,.18);c.lineWidth=.5;c.stroke();
   ellipse(c,nx+nr*.22,ny-nr*.12,nr*.27,nr*.23);c.fillStyle='rgba(216,210,237,.45)';c.fill();
   const count=(detail>1?9:detail>0?5:3)+(Math.floor(phase*7)%3);
   for(let i=0;i<count;i++){
    const a=i*2.399+phase*.7+Math.sin(time*.2+i)*.08,rr=r*(.43+rnd(i+Math.floor(phase*41))*.23),x=Math.cos(a)*rr*stretch,y=Math.sin(a)*rr;
    const size=r*(.052+rnd(i*13+91)*.034);c.save();c.translate(x,y);c.rotate(a+.5);ellipse(c,0,0,size*1.6,size);c.fillStyle=i%3===0?'rgba(221,184,108,.25)':rgba(co,.22);c.fill();c.strokeStyle=i%3===0?'rgba(243,211,137,.45)':rgba(mix(co,[209,250,203],.3),.4);c.lineWidth=Math.max(.4,r*.009);c.stroke();
    if(detail>0&&r>17){c.beginPath();c.moveTo(-size,0);c.quadraticCurveTo(-size*.4,-size*.6,0,0);c.quadraticCurveTo(size*.4,size*.6,size,0);c.stroke();}c.restore();
   }
   if(detail>0){c.save();c.translate(r*.31,-r*.14);c.rotate(.45);c.strokeStyle=rgba(co,.42);c.lineWidth=Math.max(.55,r*.015);for(let j=0;j<4;j++){c.beginPath();c.ellipse(0,0,r*(.15+j*.033),r*(.08+j*.026),0,-1.2,1.2);c.stroke();}c.restore();}
   // A soft, asymmetric membrane glint is enough to make the surface feel wet.
   c.beginPath();for(let i=0;i<=16;i++){const a=3.65+1.3*i/16,k=(1+rough*Math.sin(a*lobes+time*1.1+phase)+rough*.6*Math.sin(a*(lobes+2)-time*.73+phase*1.8))*.88,x=Math.cos(a)*r*k*stretch,y=Math.sin(a)*r*k;if(i)c.lineTo(x,y);else c.moveTo(x,y);}c.strokeStyle='rgba(224,255,242,.28)';c.lineWidth=Math.max(.7,r*.032);c.stroke();
  }
  cilia(c,r,time,phase,co,count=18,length=8,stretch=1,sweep=0,edge=null){
   c.strokeStyle=rgba(co,.38);c.lineWidth=ink(r)*.55;
   for(let i=0;i<count;i++){const base=i/count*TAU+phase*.1,er=edge?edge(base):r,x=Math.cos(base)*er*stretch,y=Math.sin(base)*er,turn=Math.atan2(Math.sin(Math.PI-base),Math.cos(Math.PI-base)),a=base+turn*sweep*.8,ca=Math.cos(a),sa=Math.sin(a),w=Math.sin(time*(4+sweep*8)+phase+i*.9)*(1-sweep*.65),len=length*(1+sweep*.5); c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+ca*len*.5-sa*w*len*.26,y+sa*len*.5+ca*w*len*.26,x+ca*len-sa*w*len*.35,y+sa*len+ca*w*len*.35);c.stroke();}
  }
  tails(c,r,time,co,count=1,strength=1){
   for(let j=0;j<count;j++){const off=(j-(count-1)/2)*r*.24,len=r*(1.5+strength*.5);c.beginPath();c.moveTo(-r*.78,off);for(let k=1;k<=12;k++){const u=k/12,x=-r*.78-u*len,y=off+Math.sin(u*8-time*6+j)*r*.15*(.3+u);c.lineTo(x,y);}c.strokeStyle=rgba(co,.15);c.lineWidth=ink(r)*2.6;c.stroke();c.strokeStyle=rgba(mix(co,[245,255,247],.4),.55);c.lineWidth=ink(r)*.85;c.stroke();}
  }
  jaws(c,r,time,co,level=1,openness){
   const gap=Number.isFinite(openness)?clamp(openness,.06,.65):.23+.035*Math.sin(time*2.5),len=r*(.32+level*.075);c.strokeStyle=rgba(mix(co,[255,223,190],.3),.8);c.fillStyle=rgba(co,.17);c.lineWidth=ink(r)*1.05;
   for(const s of [-1,1]){c.beginPath();c.moveTo(r*.62,s*r*.5);c.quadraticCurveTo(r*1.06,s*r*.65,r+len,s*r*gap);c.lineTo(r*1.01,s*r*.29);c.lineTo(r*.84,s*r*.45);c.closePath();c.fill();c.stroke();}
  }
  // Venomist: acid sacs along the flanks and a short spitting lip at the front. More sacs with rank.
  venomSacs(c,r,time,co,level=1){
   const acid=mix(co,[190,240,100],.45),n=Math.min(3,1+Math.floor(level/2));
   for(let i=0;i<n;i++)for(const s of [-1,1]){const a=s*(2.3-i*.45),pulse=1+.07*Math.sin(time*3+i*1.3+s),rr=r*(.17+level*.022-i*.025)*pulse,er=this._edge?this._edge(a)*.98:r*.97,x=Math.cos(a)*er,y=Math.sin(a)*er;
    c.beginPath();c.ellipse(x,y,rr*1.18,rr,a,0,TAU);c.fillStyle=rgba(acid,.2);c.fill();c.strokeStyle=rgba(acid,.7);c.lineWidth=ink(r)*.85;c.stroke();
    c.beginPath();c.ellipse(x+Math.cos(a)*rr*.12,y+Math.sin(a)*rr*.12,rr*.52,rr*.42,a,0,TAU);c.fillStyle=rgba(acid,.42);c.fill();}
   c.beginPath();c.moveTo(r*.9,-r*.12);c.quadraticCurveTo(r*(1.1+level*.03),0,r*.9,r*.12);c.strokeStyle=rgba(acid,.75);c.lineWidth=ink(r)*1.05;c.stroke();
  }
  // Brood: daughter cells budding from the back of the membrane. More buds with rank.
  buds(c,r,time,co,level=1){
   const honey=mix(co,[245,214,140],.4),n=Math.min(5,1+level);
   for(let i=0;i<n;i++){const a=Math.PI+(i-(n-1)/2)*.6,w=1+.06*Math.sin(time*2.4+i*1.7),rr=r*(.18+level*.018)*w,d=(this._edge?this._edge(a)+rr*.35:r)*(1+.05*Math.sin(time*1.3+i)),x=Math.cos(a)*d,y=Math.sin(a)*d;
    c.beginPath();c.arc(x,y,rr,0,TAU);c.fillStyle=rgba(honey,.2);c.fill();c.strokeStyle=rgba(honey,.75);c.lineWidth=ink(r)*.85;c.stroke();
    c.beginPath();c.arc(x+Math.cos(a)*rr*.15,y+Math.sin(a)*rr*.15,rr*.32,0,TAU);c.fillStyle=rgba(mix(honey,[120,90,40],.3),.55);c.fill();}
  }
  // A broodling: a small daughter cell in the player's colours.
  drawBroodling(b,co,time){
   const c=this.ctx,r=b.r,a=Math.atan2(b.vy||0,b.vx||1);c.save();c.translate(b.x,b.y);c.rotate(a);c.globalAlpha=b.life>0?Math.min(1,.5+b.life*.15):1;
   this.cilia(c,r*.92,time,b.phase||0,co,10,r*.35);c.beginPath();c.arc(0,0,r,0,TAU);c.fillStyle=rgba(co,.22);c.fill();c.strokeStyle=rgba(mix(co,[255,240,200],.3),.8);c.lineWidth=1;c.stroke();
   c.beginPath();c.arc(-r*.1,0,r*.38,0,TAU);c.fillStyle=rgba(mix(co,[90,70,40],.35),.6);c.fill();
   if(b.hp<b.maxHp){c.beginPath();c.arc(0,0,r*1.25,-Math.PI/2,-Math.PI/2+TAU*clamp(b.hp/b.maxHp,0,1));c.strokeStyle=rgba(co,.4);c.lineWidth=1.2;c.stroke();}
   c.restore();
  }
  armour(c,r,co,level=1,opening=0){
   const count=6+level*2,open=clamp(opening,0,1),inner=r*(1.035+open*.17),outer=r*(1.12+open*.25);c.lineWidth=1.2;
   for(let i=0;i<count;i++){const a=i/count*TAU,w=.18*(1-open*.45);c.beginPath();c.arc(0,0,inner,a-w,a+w);c.lineTo(Math.cos(a+w)*outer,Math.sin(a+w)*outer);c.arc(0,0,outer,a+w,a-w,true);c.closePath();c.fillStyle=rgba(co,.15-open*.06);c.fill();c.strokeStyle=rgba(mix(co,[255,230,167],.45),.65-open*.15);c.stroke();if(level>1){c.beginPath();c.moveTo(Math.cos(a)*(outer-r*.01),Math.sin(a)*(outer-r*.01));const tip=r*(1.17+.035*level+open*.25);c.lineTo(Math.cos(a)*tip,Math.sin(a)*tip);c.stroke();}}
  }
  leaves(c,r,time,co,level=1,fold=1){
   const count=5+level*2;for(let i=0;i<count;i++){const a=i/count*TAU+.1*Math.sin(time*.6+i),len=r*(.27+level*.045)*fold;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.85,-r*.07*fold);c.quadraticCurveTo(r+len*.7,-len*.55,r+len,0);c.quadraticCurveTo(r+len*.7,len*.55,r*.85,r*.07*fold);c.closePath();c.fillStyle=rgba(co,.14);c.fill();c.strokeStyle=rgba(mix(co,[180,244,132],.5),.55);c.lineWidth=.8;c.stroke();c.beginPath();c.moveTo(r*.94,0);c.lineTo(r+len*.87,0);c.strokeStyle=rgba(co,.35);c.stroke();c.restore();}
  }
  veil(c,r,time,co,level=1){
   // A stalker is a low, scalloped, almost leaf-like animal with delicate wing membranes.
   for(const s of [-1,1]){c.beginPath();c.moveTo(r*.75,s*r*.13);c.quadraticCurveTo(r*.14,s*r*(1.38+level*.035),-r*.52,s*r*1.10);c.quadraticCurveTo(-r*.42,s*r*.75,-r*.97,s*r*.52);c.quadraticCurveTo(-r*.57,s*r*.42,-r*.84,s*r*.08);c.closePath();c.fillStyle=rgba(co,.08);c.fill();c.strokeStyle=rgba(mix(co,[203,230,236],.45),.48);c.lineWidth=ink(r)*.7;c.stroke();
    for(let j=0;j<5;j++){const u=j/5;c.beginPath();c.moveTo(r*(.42-u*.18),s*r*.16);c.quadraticCurveTo(r*(.23-u*.69),s*r*(.49+u*.4),r*(.18-u*.82),s*r*(.91+.15*Math.sin(u*3)));c.strokeStyle=rgba(co,.19);c.lineWidth=ink(r)*.45;c.stroke();}
   }
   c.strokeStyle=rgba(co,.28);c.lineWidth=ink(r)*.5;
   for(let i=0;i<8+level*2;i++){const a=i*2.399+time*.06,rr=r*(.48+.24*rnd(i+61));c.save();c.translate(Math.cos(a)*rr,Math.sin(a)*rr*.72);c.rotate(a);polygon(c,5,r*.07,.4);c.stroke();c.restore();}
  }
  // Glass rays fade in only up close; a murk is barely visible while its ink hangs about it.
  speciesAlpha(o,state){
   const sees=(state.player.mutations||[]).includes('eyespot');
   // Pit organ: a poisoned creature cannot hide from you.
   if(((o.venomStacks||0)>0||(o.poison||0)>0)&&(state.player.mutations||[]).includes('pitOrgan'))return 1;
   if(o.species==='glassray'||o.species==='lurker'){if(sees)return 1;if((o.windup||0)>0||(o.lungeTime||0)>0||(o.flash||0)>0)return 1;const p=state.player,d=Math.hypot(o.x-p.x,o.y-p.y);return clamp((380-d)/220,.12,1);}
   if((o.cloak||0)>0)return sees?.7:.22;return 1;
  }
  // Bodies drawn from scratch. Returns false for species that use their base creature's body plus an overlay.
  drawSpecies(c,o,spec,r,time,co,phase,shape,v2,jawGap,recovering,progress){
   const k=o.species;
   if(k==='shardling'){
    // A narrow glass dart with a bright spine.
    this.tails(c,r*.9,time*2.4,co,1,.7);c.save();c.scale(1.9,.5);this.cellBody(c,r,time,phase,co,.5,1,.03,2);c.restore();c.beginPath();c.moveTo(-r*1.2,0);c.lineTo(r*1.7,0);c.strokeStyle=rgba(mix(co,[255,255,255],.6),.75);c.lineWidth=ink(r)*.9;c.stroke();return true;}
   if(k==='ironhide'){
    // A broad, heavily plated body with a small jaw.
    c.save();c.scale(1.12,.92);this.cellBody(c,r*.9,time,phase,co,1,1,.04,4);c.restore();this.armour(c,r*.96,co,4);this.armour(c,r*.7,mix(co,[255,255,255],.25),2);this.jaws(c,r*.72,time,co,1,jawGap);return true;}
   if(k==='lurker'){
    // A long shadowed hunter under a trailing veil.
    this.tails(c,r*.95,time*1.2,co,2,.9);this.veil(c,r*.95,time,co,2);c.save();c.scale(1.5,.66);this.cellBody(c,r,time,phase,co,.7,1,.06,3);c.restore();this.jaws(c,r*.8,time,co,2,jawGap);return true;}
   if(k==='sporemother'){
    // A swollen body ringed with spore sacs.
    this.cellBody(c,r*.95,time,phase,co,1,1.08,.1,5);for(let i=0;i<6;i++){const a=i*TAU/6+time*.2,rr=r*.86,beat=.5+.5*Math.sin(time*2+i);c.fillStyle=rgba(mix(co,[255,236,255],.4),.3+.3*beat);ellipse(c,Math.cos(a)*rr,Math.sin(a)*rr,r*.17,r*.17);c.fill();c.strokeStyle=rgba(co,.7);c.lineWidth=ink(r)*.7;c.stroke();}return true;}
   if(k==='ripjaw'){
    // A lean, fast body behind oversized jaws.
    this.tails(c,r*.85,time*1.8,co,2,.8);c.save();c.scale(1.4,.7);this.cellBody(c,r,time,phase,co,.8,1,.05,3);c.restore();this.jaws(c,r*1.05,time*1.4,co,3.4,jawGap);return true;}
   if(k==='voidling'){
    // A small dark body with a ring of hooks at the mouth.
    this.tails(c,r*.9,time*2,co,3,.6);this.cellBody(c,r*.9,time,phase,co,.6,1,.08,3);c.strokeStyle=rgba(mix(co,[255,210,255],.5),.8);c.lineWidth=ink(r)*.8;for(let i=-2;i<=2;i++){const a=i*.28;c.beginPath();c.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);c.lineTo(Math.cos(a)*r*1.2,Math.sin(a)*r*1.05);c.stroke();}return true;}
   if(k==='skimmer'){this.tails(c,r*1.15,time*2.2,co,2,.5);c.save();c.scale(1.55,.62);this.cellBody(c,r,time,phase,co,.6,1,.05,2);c.restore();ellipse(c,r*.55,0,r*.18,r*.18);c.fillStyle=rgba(mix(co,[255,255,255],.6),.7);c.fill();return true;}
   if(k==='needlefish'){this.tails(c,r*.9,time*1.4,co,1,.9);c.save();c.scale(2.1,.42);this.cellBody(c,r,time,phase,co,.6,1,.03,2);c.restore();c.beginPath();c.moveTo(r*1.9,0);c.lineTo(r*3,0);c.strokeStyle=rgba(mix(co,[255,240,220],.4),.8);c.lineWidth=1.3;c.stroke();this.jaws(c,r*.7,time,co,1,jawGap);return true;}
   if(k==='puffer'){const swell=1+(o.windup>0?progress*.22:0);this.cellBody(c,r*swell,time,phase,co,1,1,.04,5);c.strokeStyle=rgba(co,.6);c.lineWidth=1;for(let i=0;i<14;i++){const a=i*TAU/14+phase;c.beginPath();c.moveTo(Math.cos(a)*r*swell*.95,Math.sin(a)*r*swell*.95);c.lineTo(Math.cos(a)*r*swell*1.32,Math.sin(a)*r*swell*1.32);c.stroke();}for(const sd of [-1,1]){ellipse(c,-r*.15,sd*r*.42,r*.22,r*.15);c.fillStyle=rgba(mix(co,[255,190,230],.4),.35);c.fill();}return true;}
   if(k==='murk'){this.tails(c,r*.9,time,co,3,.8);this.veil(c,r*.9,time,co,1);c.save();c.scale(1.1,.8);this.cellBody(c,r*.8,time,phase,co,.8,1,.1,4);c.restore();this.jaws(c,r*.8,time,co,1,jawGap);ellipse(c,r*.3,-r*.2,r*.1,r*.1);c.fillStyle='rgba(240,230,255,.8)';c.fill();return true;}
   if(k==='leech'){for(let i=3;i>=0;i--){const w=Math.sin(time*6+i*1.2+phase)*r*.18;c.save();c.translate(-i*r*.7,w);this.cellBody(c,r*(.62-i*.07),time,phase+i,co,.4,1.1,.04,2);c.restore();}c.beginPath();c.arc(r*.55,0,r*.32,0,TAU);c.strokeStyle=rgba(mix(co,[255,200,210],.4),.8);c.lineWidth=1.3;c.stroke();for(let i=0;i<6;i++){const a=i*TAU/6;c.beginPath();c.moveTo(r*.55+Math.cos(a)*r*.15,Math.sin(a)*r*.15);c.lineTo(r*.55+Math.cos(a)*r*.3,Math.sin(a)*r*.3);c.stroke();}return true;}
   if(k==='lasher'){c.strokeStyle=rgba(co,.5);c.lineWidth=2.2;c.beginPath();c.moveTo(-r*.6,0);c.quadraticCurveTo(-r*1.3,Math.sin(time+phase)*r*.4,-r*1.9,0);c.stroke();ellipse(c,-r*1.95,0,r*.28,r*.4);c.fillStyle=rgba(co,.25);c.fill();
    this.cellBody(c,r*.85,time,phase,co,1,1.05,.06,3);for(let i=0;i<3;i++){const a=(i-1)*.7,len=r*(1+.2*Math.sin(time*1.7+i));c.beginPath();c.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);c.quadraticCurveTo(Math.cos(a)*len*1.2,Math.sin(a)*len*1.2+Math.sin(time*2+i)*r*.3,Math.cos(a)*len*1.6,Math.sin(a)*len*1.4);c.strokeStyle=rgba(mix(co,[230,255,200],.3),.6);c.lineWidth=1.4;c.stroke();}this.jaws(c,r*.75,time,co,1.5,jawGap);return true;}
   if(k==='glassray'){for(const sd of [-1,1]){c.beginPath();c.moveTo(r*.7,0);c.quadraticCurveTo(r*.1,sd*r*1.9,-r*.9,sd*r*1.25+Math.sin(time*2.2+phase)*sd*r*.18);c.quadraticCurveTo(-r*.5,sd*r*.45,-r*.8,0);c.closePath();c.fillStyle=rgba(co,.1);c.fill();c.strokeStyle=rgba(mix(co,[255,255,255],.5),.65);c.lineWidth=1;c.stroke();}
    c.beginPath();c.moveTo(-r*.8,0);c.quadraticCurveTo(-r*1.8,Math.sin(time*3+phase)*r*.3,-r*2.6,Math.sin(time*2.4+phase)*r*.2);c.strokeStyle=rgba(co,.45);c.lineWidth=1.1;c.stroke();this.cellBody(c,r*.5,time,phase,co,.4,1.3,.03,2,.6);this.jaws(c,r*.6,time,co,1.2,jawGap);return true;}
   if(k==='wanderer'){c.drawImage(this.glow(co),-r*1.6,-r*1.6,r*3.2,r*3.2);this.cilia(c,r,time*.5,phase,co,48,r*.09);this.cellBody(c,r,time*.4,phase,co,1,1.15,.05,5);for(let i=0;i<9;i++){const a=i*2.4+phase,rr=r*(.25+.45*rnd(i+5));ellipse(c,Math.cos(a)*rr,Math.sin(a)*rr*.8,r*.08,r*.06,a);c.fillStyle=rgba(mix(co,[190,240,150],.5),.35);c.fill();}return true;}
   if(k==='maw'){c.drawImage(this.glow(co),-r*1.8,-r*1.8,r*3.6,r*3.6);this.cellBody(c,r,time*.5,phase,co,1,1,.07,6);const open=o.vortexTime>0?1:o.vortexWind>0?.6:.35+.08*Math.sin(time*1.4);
    ellipse(c,0,0,r*.62*open+r*.1,r*.62*open+r*.1);c.fillStyle='rgba(8,4,16,.88)';c.fill();for(let ring=0;ring<3;ring++){const rr=r*(.38+ring*.13)*open+r*.12,n=14+ring*4;for(let i=0;i<n;i++){const a=i*TAU/n+ring*.2+time*.05*(ring%2?-1:1);c.beginPath();c.moveTo(Math.cos(a-.08)*rr,Math.sin(a-.08)*rr);c.lineTo(Math.cos(a)*(rr-r*.12),Math.sin(a)*(rr-r*.12));c.lineTo(Math.cos(a+.08)*rr,Math.sin(a+.08)*rr);c.fillStyle=rgba(mix(co,[240,230,250],.6),.75-ring*.15);c.fill();}}return true;}
   return false;
  }
  // Extra features on top of a base body.
  speciesOverlay(c,o,spec,r,time,co,phase,shape,recovering){
   const k=o.species;
   if(k==='shellback'){this.armour(c,r*.96,co,2,0);}
   else if(k==='splitter'){c.beginPath();c.moveTo(-r*.9,0);for(let i=1;i<=8;i++)c.lineTo(-r*.9+i*r*.225,(i%2?1:-1)*r*.08);c.strokeStyle=rgba(mix(co,[255,230,200],.4),.6);c.lineWidth=1;c.stroke();if(!o.split){for(const sd of [-1,1]){ellipse(c,0,sd*r*.35,r*.14,r*.14);c.fillStyle=rgba(co,.35);c.fill();}}}
   else if(k==='thornback'){c.strokeStyle=rgba(mix(co,[255,236,190],.35),recovering?.35:.85);c.lineWidth=1.6;for(let i=0;i<18;i++){const a=i*TAU/18+phase*.2,len=recovering?.12:.38+.06*Math.sin(i*1.7);c.beginPath();c.moveTo(Math.cos(a)*r*.9,Math.sin(a)*r*.9);c.lineTo(Math.cos(a)*r*(.95+len),Math.sin(a)*r*(.95+len));c.stroke();}}
   else if(k==='siren'){for(let i=0;i<3;i++){const rr=r*(1.15+i*.28+((time*.35+i/3)%1)*.3);c.beginPath();c.arc(r*.2,0,rr,-1.1,1.1);c.strokeStyle=rgba(co,.18-i*.04);c.lineWidth=1.2;c.stroke();}}
   else if(k==='broodcarrier'){for(let i=0;i<5;i++){const a=Math.PI*.6+i*.2*Math.PI,x=Math.cos(a)*r*.62,y=Math.sin(a)*r*.62,sw=1+.08*Math.sin(time*3+i);ellipse(c,x,y,r*.2*sw,r*.17*sw);c.fillStyle=rgba(mix(co,[255,210,230],.3),.4);c.fill();c.strokeStyle=rgba(co,.6);c.lineWidth=.8;c.stroke();for(let j=0;j<3;j++){ellipse(c,x+(j-1)*r*.06,y,r*.03,r*.03);c.fillStyle=rgba(co,.8);c.fill();}}}
   else if(k==='stormdiatom'){c.strokeStyle='rgba(255,246,190,.7)';c.lineWidth=1;for(let i=0;i<4;i++){const a=i*TAU/4+time*1.7+phase;c.beginPath();let x=Math.cos(a)*r*1.05,y=Math.sin(a)*r*.75;c.moveTo(x,y);for(let j=0;j<4;j++){x+=Math.cos(a)*r*.12+Math.sin(time*23+j*7+i)*r*.08;y+=Math.sin(a)*r*.12+Math.cos(time*19+j*5+i)*r*.08;c.lineTo(x,y);}c.stroke();}}
   else if(k==='crowned'){c.fillStyle=rgba([255,214,130],.75);c.strokeStyle=rgba([255,236,190],.9);c.lineWidth=.9;for(let i=-2;i<=2;i++){const y=i*r*.2;c.beginPath();c.moveTo(-r*.25,y-r*.07);c.lineTo(-r*.55,y);c.lineTo(-r*.25,y+r*.07);c.closePath();c.fill();c.stroke();}c.drawImage(this.glow([255,200,120]),-r*1.4,-r*1.4,r*2.8,r*2.8);}
   else if(k==='leviathan'){for(let i=1;i<=3;i++){c.save();c.translate(-r*(.6+i*.42),Math.sin(time*1.3+i+phase)*r*.14);this.cellBody(c,r*(.42-i*.07),time,phase+i*2,co,.6,1.1,.04,3);c.restore();}for(const sd of [-1,1]){ellipse(c,r*.35,sd*r*.3,r*.07,r*.07);c.fillStyle='rgba(255,236,170,.85)';c.fill();}}
  }
  organismCue(o,p){
   const hostile=MorphosGame.isHostile(o),edible=o.kind!=='apex'&&o.kind!=='jelly'&&o.kind!=='sentinel'&&o.r<p.r*(((p.mutations||[]).includes('devourerGullet')?.95:.78)+(p.traits.predator||0)*.035)&&((o.kind==='prey'||o.kind==='grazer')||o.hp<=o.maxHp*.4)&&!p.sprinting;
   return edible?'edible':hostile?'danger':'';
  }
  drawOrganismTelegraph(o,co,state){
   const c0=this.ctx,p=state&&state.player;
   if(p&&o.attackKind==='tether'&&o.windup>0){const k=1-o.windup/(o.windupMax||.7),a=Math.atan2(p.y-o.y,p.x-o.x);c0.save();c0.translate(o.x,o.y);c0.rotate(a);c0.beginPath();c0.moveTo(o.r*.8,0);for(let i=1;i<=10;i++){const u=i/10;c0.lineTo(o.r*.8+u*o.r*1.6*k,Math.sin(u*9+k*6)*o.r*.25*(1-u));}c0.strokeStyle=rgba(co,.35+k*.5);c0.lineWidth=1.4+k*1.4;c0.stroke();c0.restore();}
   if(p&&o.tetherTime>0){const d=Math.hypot(p.x-o.x,p.y-o.y)||1,a=Math.atan2(p.y-o.y,p.x-o.x),t=performance.now()/1000;c0.save();c0.translate(o.x,o.y);c0.rotate(a);c0.beginPath();c0.moveTo(o.r*.8,0);for(let i=1;i<=16;i++){const u=i/16;c0.lineTo(o.r*.8+u*(d-o.r*.8-p.r*.6),Math.sin(u*12-t*9)*5*(1-u*.6));}c0.strokeStyle=rgba(mix(co,[255,255,230],.3),.85);c0.lineWidth=2.4;c0.stroke();c0.restore();}
   if(o.vortexWind>0||o.vortexTime>0){const t=performance.now()/1000,winding=o.vortexWind>0,k=winding?1-o.vortexWind/1.3:1;c0.save();c0.translate(o.x,o.y);for(let i=0;i<6;i++){c0.beginPath();for(let j=0;j<=40;j++){const u=j/40,rr=o.r*.5+u*(winding?o.r*(.6+k*1.6):560-o.r*.5),a=i*TAU/6+u*3.2-t*(winding?1.5:4.5);c0.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c0.strokeStyle=rgba(co,winding?.12+k*.25:.32);c0.lineWidth=winding?1:2;c0.stroke();}c0.restore();}
   if(o.attackKind==='shards'&&o.windup>0){
    // Eight silica needles push out of the frustule along the lines the shards will travel.
    const c=this.ctx,progress=1-o.windup/o.windupMax;c.save();c.translate(o.x,o.y);c.rotate(o.attackAngle);c.drawImage(this.glow(co),-o.r*2.2,-o.r*2.2,o.r*4.4,o.r*4.4);
    for(let i=0;i<8;i++){const a=i*TAU/8;c.beginPath();c.moveTo(Math.cos(a)*o.r*.9,Math.sin(a)*o.r*.9);c.lineTo(Math.cos(a)*o.r*(1.1+progress*.75),Math.sin(a)*o.r*(1.1+progress*.75));c.strokeStyle=rgba(mix(co,[255,250,220],.5),.35+progress*.55);c.lineWidth=1+progress*1.6;c.stroke();}
    c.restore();return;
   }
   if((o.attackKind==='lunge'||o.attackKind==='bite')&&o.windup>0){
    // About to bite: the mouth gapes and flushes as the creature rears, facing the way it will lunge.
    const c=this.ctx,k=1-o.windup/(o.windupMax||.3);c.save();c.translate(o.x,o.y);c.rotate(o.attackAngle);c.globalAlpha=.35+.5*k;c.drawImage(this.glow(co),o.r*.25,-o.r*.75,o.r*1.5,o.r*1.5);c.globalAlpha=1;
    for(const s of [-1,1]){c.beginPath();c.moveTo(o.r*.72,s*o.r*.16);c.quadraticCurveTo(o.r*(1.02+.22*k),s*o.r*(.24+.32*k),o.r*(1.22+.2*k),s*o.r*(.04+.3*k));c.strokeStyle=rgba(mix(co,[255,236,226],.55),.4+k*.55);c.lineWidth=(1.2+k*1.8)*Math.max(1,o.r/45);c.stroke();}
    c.restore();return;
   }
   // Spore sacs swell on the body, without corridors, cones or countdowns.
   if(o.attackKind!=='spores'||!(o.windup>0))return;
   const c=this.ctx,progress=1-o.windup/o.windupMax;c.save();c.translate(o.x,o.y);c.rotate(o.attackAngle);
   for(const side of [-1,1]){c.beginPath();c.ellipse(o.r*.35,side*o.r*.5,o.r*(.12+.16*progress),o.r*(.1+.1*progress),0,0,TAU);c.fillStyle=rgba(co,.2+progress*.35);c.fill();}c.restore();
  }
  drawOrganism(o,state,time){
   const windup=Number(o.windup)||0,lunge=Number(o.lungeTime)||0,recovering=(Number(o.recoverTime)||0)>0,reach=windup>0||lunge>0?clamp(Number(o.attackRange)||0,0,1000)+80:80;
   if(o.dead||!this.visible(o,reach))return;
   const c=this.ctx,r=o.r,key=Math.imul(idNumber(o.id),3571)^((state.seedNumber||0)>>>0),v=rnd(key),v2=rnd(key+87),shape=Math.floor(v*3),elite=o.elite==='lancer',spec=o.species?MorphosGame.SPECIES[o.species]:null,baseCo=elite?[248,169,106]:mix(spec?spec.colour:creatureColours[o.kind]||creatureColours.prey,[196,225,196],v2*.13),co=recovering?mix(baseCo,[170,211,199],.28):baseCo,phase=Number.isFinite(o.phase)?o.phase:rnd(key+71)*TAU,progress=1-clamp(windup/Math.max(.01,o.windupMax||.8),0,1),jawGap=windup>0?.3+progress*.25:lunge>0?.07:recovering?.42:undefined;
   // Biological preparation remains on the body.
   this.drawOrganismTelegraph(o,baseCo,state);
   c.save();c.translate(o.x,o.y);c.rotate((windup>0||lunge>0)&&Number.isFinite(o.attackAngle)?o.attackAngle:(o.angle||0));
   // Squeezing through the nest's mouth: long and thin at the mouth, springing back to shape as it comes free (the reverse going in).
   if(o.denT){const k=1-Math.min(1,Math.abs(o.denT)/MorphosGame.DEN_TIME),wob=this.reducedMotion?0:Math.sin(k*Math.PI*3)*.08*(1-k);c.scale(1.75-.75*k+wob,.28+.72*k-wob);c.globalAlpha*=.35+.65*k;}
   if(spec)c.globalAlpha=this.speciesAlpha(o,state);
   if(spec&&this.drawSpecies(c,o,spec,r,time,co,phase,shape,v2,jawGap,recovering,progress)){}
   else if(o.kind==='apex'){
    c.drawImage(this.glow(creatureColours.apex),-r*2,-r*1.6,r*4,r*3.2);this.tails(c,r,time,co,2+shape,1.8);
    const segments=shape===0?3:shape===1?4:5;
    for(let i=segments-1;i>=0;i--){c.save();c.translate(r*.42-i*r*(.95/(segments-1)),Math.sin(i+phase)*r*.08);this.cellBody(c,r*(.65-i*.065),time,phase+i,co,1,1.12,.035,3+shape);c.restore();}
    this.jaws(c,r*.83,time,co,2+shape,jawGap);this.armour(c,r*.88,co,2+shape%2);
   }else if(o.kind==='hunter'){
    this.tails(c,r*.8,time,co,1+shape%2,.6);c.save();c.scale(1.03+v*.15,.76+v2*.2);this.cellBody(c,r,time,phase,co,1,1,shape===2?.16:.07,2+shape);c.restore();this.jaws(c,r*.9,time,co,1+shape*.65,jawGap);
    c.strokeStyle=rgba(co,.55);c.lineWidth=1;for(const side of [-1,1])for(let i=0;i<3;i++){const x=-r*.55+i*r*.4;c.beginPath();c.moveTo(x,side*r*.76);c.lineTo(x-r*.12,side*r*(1.12-i*.05));c.stroke();}
    if(elite){c.strokeStyle='rgba(255,221,163,.8)';c.fillStyle='rgba(245,170,104,.13)';c.lineWidth=1.1;for(const side of [-1,1]){c.beginPath();c.moveTo(-r*.8,side*r*.45);c.lineTo(-r*.32,side*r*1.22);c.lineTo(r*.12,side*r*.73);c.lineTo(r*.7,side*r*.5);c.lineTo(r*1.48,side*r*.16);c.lineTo(r*.7,side*r*.24);c.stroke();}for(let i=0;i<3;i++){c.save();c.translate((i-1)*r*.43,0);polygon(c,4,r*.13,0);c.fill();c.stroke();c.restore();}}
   }else if(o.kind==='swarmer'){
    // A small barbed dart: one whipping tail, a pointed body and a hooked mouth. Read as a pack, not an individual.
    this.tails(c,r*.9,time*1.6,co,1,.7);c.save();c.scale(1.35,.72);this.cellBody(c,r,time,phase,co,0,1,.05,2);c.restore();this.jaws(c,r*.85,time*1.5,co,1,jawGap);
    ellipse(c,r*.35,-r*.18,r*.12,r*.12);c.fillStyle=rgba(mix(co,[255,236,210],.5),.75);c.fill();
   }else if(o.kind==='sentinel'){
    // A pennate diatom: a ribbed silica frustule whose girdle plates open only while it recovers.
    const open=recovering?1:0;c.drawImage(this.glow(co),-r*1.7,-r*1.7,r*3.4,r*3.4);
    ellipse(c,0,0,r*1.12,r*.72);c.fillStyle=rgba(co,.09);c.fill();c.strokeStyle=rgba(mix(co,[255,246,214],.4),.7);c.lineWidth=1.4;c.stroke();
    ellipse(c,0,0,r*.98,r*.6);c.strokeStyle=rgba(co,.35);c.lineWidth=.8;c.stroke();c.beginPath();c.moveTo(-r*1.08,0);c.lineTo(r*1.08,0);c.stroke();
    for(let i=-6;i<=6;i++){const x=i*r*.15,k=Math.sqrt(Math.max(0,1-x*x/(r*r*1.2)))*r*.66;c.beginPath();c.moveTo(x,-k);c.quadraticCurveTo(x+r*.04,0,x,k);c.strokeStyle=rgba(co,.22);c.lineWidth=.7;c.stroke();}
    ellipse(c,0,0,r*.16,r*.16);c.fillStyle=rgba(mix(co,[124,118,170],.5),.45);c.fill();
    this.armour(c,r*.78,co,2,open);
   }else if(o.kind==='jelly'){
    // A drifting bell with long trailing tentacles: the tentacles, not the bell, are what sting.
    c.drawImage(this.glow(co),-r*1.9,-r*1.9,r*3.8,r*3.8);const pulse=.92+.08*Math.sin(time*1.8+phase);
    for(let j=0;j<7;j++){const off=(j-3)*r*.2;c.beginPath();c.moveTo(-r*.35,off*.8);for(let k=1;k<=14;k++){const u=k/14;c.lineTo(-r*.35-u*r*2.3,off*(1+u*.4)+Math.sin(u*7-time*2.2+j+phase)*r*.16*u);}c.strokeStyle=rgba(co,.18+(j%2)*.12);c.lineWidth=j%2?1.1:.7;c.stroke();}
    c.beginPath();c.moveTo(-r*.35,-r*.95*pulse);c.bezierCurveTo(r*1.25,-r*1.05*pulse,r*1.25,r*1.05*pulse,-r*.35,r*.95*pulse);c.quadraticCurveTo(-r*.1,0,-r*.35,-r*.95*pulse);c.closePath();
    const g=this._grad(c,'o'+Math.round(r*2)+'|'+co.map(x=>Math.round(x/6)).join(','),()=>{const q=c.createRadialGradient(r*.3,-r*.2,r*.05,r*.15,0,r*1.1);q.addColorStop(0,rgba(mix(co,[240,244,255],.6),.32));q.addColorStop(.6,rgba(co,.12));q.addColorStop(1,rgba(co,.05));return q;});c.fillStyle=g;c.fill();c.strokeStyle=rgba(mix(co,[240,244,255],.4),.62);c.lineWidth=1.1;c.stroke();
    for(let j=0;j<4;j++){const a=-1.1+j*.73;ellipse(c,r*.25+Math.cos(a)*r*.32,Math.sin(a)*r*.48,r*.1,r*.06,a);c.fillStyle=rgba(co,.28);c.fill();}
   }else if(o.kind==='armoured'){
    c.save();if(shape===1)c.scale(.72,1.08);this.cellBody(c,r*.9,time,phase,co,.5,1,.012);this.armour(c,r*.92,co,1+shape,recovering?1:0);c.strokeStyle=rgba(co,.18);c.lineWidth=.8;for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(-r*.65,i*r*.2);c.quadraticCurveTo(0,i*r*.2+r*.12,r*.65,i*r*.2);c.stroke();}if(shape===2){polygon(c,3,r*1.13,0);c.strokeStyle=rgba(co,.42);c.lineWidth=1.1;c.stroke();}c.restore();
   }else if(o.kind==='grazer'){
    this.cilia(c,r,time,phase,co,14+shape*7,r*(.13+v2*.17));this.cellBody(c,r,time,phase,co,1,1,shape===2?.13:.07,3+shape);
    for(let i=0;i<4;i++){const a=i*1.56+phase;c.save();c.translate(Math.cos(a)*r*.56,Math.sin(a)*r*.56);c.rotate(a);ellipse(c,0,0,r*.19,r*.11);c.fillStyle='rgba(112,202,109,.26)';c.fill();c.strokeStyle='rgba(183,236,128,.6)';c.lineWidth=.65;c.stroke();c.restore();}
   }else{
    this.tails(c,r,time,co,shape===1?3:2,.3);if(shape===2){for(const s of [-1,1]){c.save();c.translate(s*r*.32,0);this.cellBody(c,r*.66,time,phase+s,co,.6,1.04,.055);c.restore();}}else{c.save();c.scale(1,.78+v2*.2);this.cellBody(c,r,time,phase,co,.6,1.03+v*.13,shape===1?.13:.035,shape===1?2:3);c.restore();}
   }
   if(spec)this.speciesOverlay(c,o,spec,r,time,co,phase,shape,recovering);
   if((o.flash||0)>0){smoothBlob(c,r,time,phase,1,.04);c.fillStyle=`rgba(255,240,215,${clamp(o.flash,0,.65)})`;c.fill();}
   if(lunge>0){c.strokeStyle=rgba(co,elite?.48:.35);c.lineWidth=1.3;for(const side of [-1,1]){c.beginPath();c.moveTo(-r*.8,side*r*.5);c.quadraticCurveTo(-r*1.6,side*r*.6,-r*(elite?3.1:2.3),side*r*.9);c.stroke();}}
   c.restore();
   this.drawStatus(o,time);
   const p=state.player,dist=Math.hypot(o.x-p.x,o.y-p.y),cue=this.organismCue(o,p);
   if(o.elder){
    // An elder wears a slow gold halo, and shows its name and its health from a distance.
    const z=this.camera.zoom,spin=this.reducedMotion?0:time*.35;c.save();c.strokeStyle='rgba(243,201,105,.55)';c.lineWidth=1.6/z;c.setLineDash([10/z,7/z]);c.lineDashOffset=-spin*20/z;c.beginPath();c.arc(o.x,o.y,r+10/z,0,TAU);c.stroke();c.setLineDash([]);
    if(dist<1500){const width=Math.max(70/z,r*1.5),y=o.y-r-22/z;c.textAlign='center';c.font=`600 ${11/z}px "Helvetica Neue",Arial,sans-serif`;c.lineWidth=3/z;c.strokeStyle='rgba(3,14,20,.7)';c.fillStyle='rgba(248,214,132,.95)';const label=String(o.elderName||'Elder').toUpperCase();c.strokeText(label,o.x,y-9/z);c.fillText(label,o.x,y-9/z);
     c.fillStyle='rgba(1,9,13,.82)';c.fillRect(o.x-width*.5-1/z,y-1/z,width+2/z,5/z);c.fillStyle='rgba(243,201,105,.92)';c.fillRect(o.x-width*.5,y,width*clamp(o.hp/o.maxHp,0,1),3/z);}
    c.restore();}
   else if(cue==='edible'&&dist<230){c.strokeStyle='rgba(174,234,178,.52)';c.lineWidth=1/this.camera.zoom;for(let i=0;i<4;i++){c.beginPath();c.arc(o.x,o.y,r+7,i*TAU/4+.18,i*TAU/4+.8);c.stroke();}}
   else if(spec&&(spec.rarity==='rare'||spec.rarity==='legendary')&&dist<(spec.rarity==='legendary'?900:520)&&this.speciesAlpha(o,state)>.5){c.save();c.translate(o.x,o.y-r-15);c.font=`${(spec.rarity==='legendary'?10:8)/this.camera.zoom}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillStyle=rgba(spec.rarity==='legendary'?[236,196,255]:[250,218,150],.9);c.fillText(spec.name.toUpperCase(),0,0);c.restore();}
   else if(o.mother&&dist<900&&!o.denT){c.save();c.translate(o.x,o.y-r-15);c.font=`600 ${10/this.camera.zoom}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillStyle='rgba(244,150,160,.92)';c.fillText('NEST MOTHER',0,0);c.restore();}
   else if(elite&&dist<500){c.save();c.translate(o.x,o.y-r-15);c.font=`${10/this.camera.zoom}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillStyle=rgba(co,.87);c.fillText('LANCER',0,0);c.strokeStyle=rgba(co,.65);c.lineWidth=.8;for(const side of [-1,1]){c.beginPath();c.moveTo(side*29/this.camera.zoom,-3/this.camera.zoom);c.lineTo(side*34/this.camera.zoom,-3/this.camera.zoom);c.stroke();}c.restore();}
   else if(dist<430&&cue==='danger'){c.save();c.translate(o.x,o.y-r-13);c.scale(1/this.camera.zoom,1/this.camera.zoom);c.strokeStyle=rgba(co,.86);c.lineWidth=1.2;const marks=o.kind==='apex'?3:o.r>p.r*.93?2:1;for(let j=0;j<marks;j++){c.beginPath();c.moveTo(-4,4-j*5);c.lineTo(0,-j*5);c.lineTo(4,4-j*5);c.stroke();}c.restore();}
   if(!o.elder&&o.hp<o.maxHp&&o.hp>0){const z=this.camera.zoom,width=Math.max(18/z,r*1.2),height=2/z,y=o.y-r-7/z;c.fillStyle='rgba(1,9,13,.82)';c.fillRect(o.x-width*.5-1/z,y-1/z,width+2/z,height+2/z);c.fillStyle=rgba(co,.88);c.fillRect(o.x-width*.5,y,width*clamp(o.hp/o.maxHp,0,1),height);}
  }
  playerColour(p){const t=p.traits||{},sum=(t.venomist||0)+(t.predator||0)+(t.riptide||0)+(t.summoner||0)+(t.stalker||0);if(!sum)return[133,235,211];let co=[0,0,0];for(const [key,colour]of Object.entries({venomist:[157,224,135],predator:[240,164,126],riptide:[119,216,238],summoner:[226,204,143],stalker:[174,172,231]})){const w=(t[key]||0)/sum;co=co.map((n,i)=>n+colour[i]*w);}return co;}
  dominant(p){const t=p.traits||{},keys=['venomist','predator','riptide','summoner','stalker'];let best='venomist',rank=-1;for(const key of keys)if((t[key]||0)>rank){best=key;rank=t[key]||0;}return best;}
  // The body plan: every class packs its cells into its own outline (round, streamlined, flat or broad-fronted),
  // always within radius r, so the organs that sit on r line up with the membrane at any cell count.
  bodyPlan(dominant,classed){
   if(!classed)return{ax:.95,ay:.95,shape:()=>1};
   return({
    venomist:{ax:.97,ay:.86,shape:x=>1+.06*x},
    predator:{ax:1,ay:.84,shape:x=>1+.14*x},
    riptide:{ax:1,ay:.6,shape:x=>.86+.18*x},
    stalker:{ax:1,ay:.66,shape:x=>1-.32*x*x},
    summoner:{ax:.94,ay:.94,shape:()=>1}
   })[dominant];
  }
  playerNodes(p){
   const n=clamp(Math.round(p.cellCount||1),1,30),r=p.r,t=p.traits||{},classed=Object.values(t).some(v=>v>0),plan=this.bodyPlan(this.dominant(p),classed);
   if(n===1)return[{x:0,y:0,r:r*.9}];
   // Unit-disc layouts: small counts as rings, larger ones as a sunflower spiral, which packs evenly at any count.
   let pts=[],cr;
   if(n===2){pts=[[-.5,0],[.5,0]];cr=.5;}
   else if(n===3){for(let i=0;i<3;i++){const a=i*TAU/3;pts.push([Math.cos(a)*.54,Math.sin(a)*.54]);}cr=.47;}
   else if(n===4){for(let i=0;i<4;i++){const a=i*TAU/4;pts.push([Math.cos(a)*.58,Math.sin(a)*.58]);}cr=.42;}
   else if(n===5){for(let i=0;i<5;i++){const a=i*TAU/5;pts.push([Math.cos(a)*.62,Math.sin(a)*.62]);}cr=.37;}
   else if(n<=7){pts.push([0,0]);for(let i=0;i<n-1;i++){const a=i*TAU/(n-1)+(n===6?Math.PI/5:0);pts.push([Math.cos(a)*.66,Math.sin(a)*.66]);}cr=.34;}
   else{cr=.95/Math.sqrt(n);const reach=1-cr*.9;for(let i=0;i<n;i++){const a=i*2.3999632297,rr=Math.sqrt((i+.5)/n)*reach;pts.push([Math.cos(a)*rr,Math.sin(a)*rr]);}}
   const R=r*.9,size=cr*R*Math.sqrt(plan.ax*plan.ay)*1.06;
   return pts.map(([x,y])=>({x:x*plan.ax*R,y:y*plan.ay*R*plan.shape(x),r:size}));
  }
  // One membrane around the whole colony: its outline follows the outermost cells in every direction.
  bodyEdge(nodes,pad){
   const N=40,e=new Array(N);
   for(let i=0;i<N;i++){const a=i/N*TAU,ca=Math.cos(a),sa=Math.sin(a);let m=0;for(const q of nodes)m=Math.max(m,q.x*ca+q.y*sa+q.r);e[i]=m+pad;}
   let s=e;for(let k=0;k<3;k++)s=s.map((v,i)=>(s[(i+N-1)%N]+v*2+s[(i+1)%N])/4);
   return a=>{const u=((a/TAU)%1+1)%1*N,i=Math.floor(u)%N,f=u-Math.floor(u);return s[i]*(1-f)+s[(i+1)%N]*f;};
  }
  edgePath(c,edge,time,phase,rough=.02){
   const N=32,pts=[];for(let i=0;i<N;i++){const a=i/N*TAU,k=1+rough*Math.sin(a*3+time*1.1+phase)+rough*.6*Math.sin(a*5-time*.73+phase*1.8),d=edge(a)*k;pts.push([Math.cos(a)*d,Math.sin(a)*d]);}
   c.beginPath();c.moveTo((pts[0][0]+pts[N-1][0])*.5,(pts[0][1]+pts[N-1][1])*.5);
   for(let i=0;i<N;i++){const p=pts[i],q=pts[(i+1)%N];c.quadraticCurveTo(p[0],p[1],(p[0]+q[0])*.5,(p[1]+q[1])*.5);}c.closePath();
  }
  colonyFill(c,r,co){return this._grad(c,'f'+Math.round(r*2)+'|'+co.map(x=>Math.round(x/6)).join(','),()=>{const g=c.createRadialGradient(-r*.3,-r*.32,r*.05,0,0,r);g.addColorStop(0,rgba(mix(co,[237,255,244],.5),.3));g.addColorStop(.6,rgba(co,.14));g.addColorStop(1,rgba(co,.26));return g;});}
  // A colony cell: a clear membrane, a nucleus and one glint. Many of them read as tissue rather than clutter.
  colonyCell(c,r,time,phase,co,fill){
   smoothBlob(c,r,time*.7,phase,1,.035,10);
   c.fillStyle=fill||this.colonyFill(c,r,co);c.fill();
   c.strokeStyle=rgba(mix(co,[232,255,244],.5),.62);c.lineWidth=ink(r)*.55;c.stroke();
   const nx=-r*.12+Math.sin(time*.5+phase)*r*.04,ny=r*.08;c.beginPath();c.arc(nx,ny,r*.3,0,TAU);c.fillStyle='rgba(92,100,156,.45)';c.fill();
   c.beginPath();c.arc(-r*.04,-r*.04,r*.78,3.7,4.9);c.strokeStyle='rgba(224,255,242,.26)';c.lineWidth=ink(r)*.5;c.stroke();
  }
  mutationOrgans(c,p,time){
   const r=p.r,mutations=Array.isArray(p.mutations)?p.mutations:[];
   // Equipped mutations add distinct, bounded structures to the living body.
   for(const key of mutations){
    c.save();c.lineWidth=Math.max(.65,r*.013);const tier=(p.mutationTiers&&Number.isFinite(p.mutationTiers[key]))?p.mutationTiers[key]:2;
    if(key==='jaws'){
     // The weapon you bite with: hooked jaws ahead of the body, larger for a better copy.
     this.jaws(c,r,time,[236,150,122],1+tier*.6);
    }else if(key==='needleSpine'){
     // A long hollow spine lying along the body, tip forward.
     const len=r*(1.5+tier*.08);c.strokeStyle='rgba(200,214,255,.85)';c.lineWidth=Math.max(.8,r*.03);c.beginPath();c.moveTo(-r*.35,0);c.lineTo(len,0);c.stroke();
     c.fillStyle='rgba(226,234,255,.9)';c.beginPath();c.moveTo(len+r*.16,0);c.lineTo(len-r*.06,-r*.05);c.lineTo(len-r*.06,r*.05);c.closePath();c.fill();
    }else if(key==='spitGland'){
     // A swollen gland at the front holding a bead of venom.
     const beat=.5+.5*Math.sin(time*3.2);c.fillStyle='rgba(166,226,130,.28)';c.strokeStyle='rgba(190,240,150,.8)';ellipse(c,r*.86,0,r*.2,r*.16);c.fill();c.stroke();
     c.fillStyle='rgba(206,250,160,'+(.55+.35*beat)+')';ellipse(c,r*1.06,0,r*(.05+.02*beat+tier*.006),r*(.05+.02*beat+tier*.006));c.fill();
    }else if(key==='spikeBattery'){
     // A short battery of spike tubes at the front, one more for a better copy.
     const n=3+Math.min(2,Math.floor(tier/2));c.strokeStyle='rgba(160,224,250,.85)';c.fillStyle='rgba(210,244,255,.9)';c.lineWidth=Math.max(.8,r*.035);for(let i=0;i<n;i++){const y=(i-(n-1)/2)*r*.16;c.beginPath();c.moveTo(r*.72,y);c.lineTo(r*1.12,y);c.stroke();ellipse(c,r*1.13,y,r*.03,r*.03);c.fill();}
    }else if(key==='sporeSac'){
     // A cluster of swollen spore sacs at the front.
     const beat=.5+.5*Math.sin(time*2.6);c.fillStyle='rgba(250,214,140,.3)';c.strokeStyle='rgba(250,214,140,.8)';c.lineWidth=Math.max(.7,r*.025);for(const [dx,dy,k] of [[.88,0,1],[.8,-.17,.8],[.8,.17,.8],[.98,-.1,.7],[.98,.1,.7]]){const rr=r*(.08+.015*beat)*k*(1+tier*.04);ellipse(c,r*dx,r*dy,rr,rr);c.fill();c.stroke();}
    }else if(key==='leechLining'){
     // A ring of small hooked teeth just inside the mouth.
     c.strokeStyle='rgba(240,138,150,.8)';c.fillStyle='rgba(240,138,150,.22)';c.beginPath();c.arc(0,0,r*.9,-.52,.52);c.stroke();
     for(let i=-2;i<=2;i++){const a=i*.21,x=Math.cos(a)*r*.9,y=Math.sin(a)*r*.9;c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(0,-r*.045);c.lineTo(-r*.13,r*.02);c.lineTo(0,r*.045);c.closePath();c.fill();c.stroke();c.restore();}
    }else if(key==='bloodScent'){
     // Two fine antennae with beaded tips, tasting the water ahead.
     c.strokeStyle='rgba(246,150,140,.75)';c.fillStyle='rgba(250,180,170,.8)';
     for(const s of [-1,1]){const sway=Math.sin(time*2.2+s)*r*.05,x0=r*.78,y0=s*r*.5,x1=r*1.32,y1=s*r*.62+sway;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo(r*1.05,s*r*.78,x1,y1);c.stroke();ellipse(c,x1,y1,r*.045,r*.045);c.fill();ellipse(c,r*1.12,s*r*.72+sway*.5,r*.028,r*.028);c.fill();}
    }else if(key==='causticGland'){
     // A bubbling acid sac beside the strike organ.
     const gx=r*.42,gy=r*.42;ellipse(c,gx,gy,r*.2,r*.15,.5);c.fillStyle='rgba(190,240,100,.2)';c.fill();c.strokeStyle='rgba(205,245,125,.78)';c.stroke();
     c.fillStyle='rgba(214,250,140,.7)';for(let i=0;i<3;i++){const u=(time*.6+i/3)%1;ellipse(c,gx+(i-1)*r*.07,gy+r*.08-u*r*.16,r*.022*(1-u*.4),r*.022*(1-u*.4));c.globalAlpha*=1-u*.6;c.fill();c.globalAlpha/=1-u*.6;}
    }else if(key==='broodPheromone'){
     // A scent trail: dotted rings drifting outward from the nucleus.
     c.strokeStyle='rgba(245,214,140,.6)';c.setLineDash([r*.03,r*.09]);
     for(let i=0;i<3;i++){const u=(time*.25+i/3)%1;c.globalAlpha*=(1-u)*.9;c.beginPath();c.arc(-r*.1,0,r*(1.08+u*.42),0,TAU);c.stroke();c.globalAlpha/=(1-u)*.9||1;}c.setLineDash([]);
    }else if(key==='keelFin'){
     // Two swept fins at the rear.
     c.strokeStyle='rgba(150,225,240,.78)';c.fillStyle='rgba(119,216,238,.14)';
     for(const s of [-1,1]){c.beginPath();c.moveTo(-r*.3,s*r*.86);c.quadraticCurveTo(-r*.8,s*r*1.28,-r*1.12,s*r*1.16);c.quadraticCurveTo(-r*.86,s*r*.92,-r*.72,s*r*.62);c.closePath();c.fill();c.stroke();c.beginPath();c.moveTo(-r*.52,s*r*.86);c.lineTo(-r*.98,s*r*1.12);c.globalAlpha*=.5;c.stroke();c.globalAlpha*=2;}
    }else if(key==='mimicSkin'){
     // Mottled patches that drift across the membrane.
     c.fillStyle='rgba(174,172,231,.18)';c.strokeStyle='rgba(196,194,240,.36)';
     for(let i=0;i<6;i++){const a=i*2.399+time*.08,d=r*(.34+rnd(i+33)*.4),x=Math.cos(a)*d,y=Math.sin(a)*d;c.save();c.translate(x,y);c.rotate(a*1.7);polygon(c,5+i%2,r*(.09+rnd(i+71)*.06),0);c.fill();c.stroke();c.restore();}
    }else if(key==='echoChamber'){
     // Resonant arcs behind the nucleus.
     c.strokeStyle='rgba(226,204,143,.7)';for(let i=0;i<3;i++){const pulse=.75+.25*Math.sin(time*3-i*.9);c.globalAlpha*=pulse*(1-i*.22);c.beginPath();c.arc(-r*.12,0,r*(.2+i*.12),Math.PI-.75,Math.PI+.75);c.stroke();c.globalAlpha/=pulse*(1-i*.22);}
    }else if(key==='barbedShell'){
     c.strokeStyle='rgba(247,224,161,.64)';c.fillStyle='rgba(235,200,135,.1)';
     for(let i=0;i<8;i++){const a=i*TAU/8+.22;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.98,-r*.07);c.lineTo(r*1.21,-r*.035);c.lineTo(r*1.11,r*.10);c.lineTo(r*1.04,r*.06);c.closePath();c.fill();c.stroke();c.restore();}
    }else if(key==='keenEdge'){
     c.strokeStyle='rgba(255,225,171,.83)';c.fillStyle='rgba(247,179,110,.15)';
     for(let i=-1;i<=1;i++){c.save();c.rotate(i*.29);c.beginPath();c.moveTo(r*.64,-r*.055);c.lineTo(r*(1.18-Math.abs(i)*.08),0);c.lineTo(r*.64,r*.055);c.closePath();c.fill();c.stroke();c.restore();}
    }else if(key==='scavenger'){
     for(let i=0;i<3;i++){const a=2+i*1.65,x=Math.cos(a)*r*.49,y=Math.sin(a)*r*.49;ellipse(c,x,y,r*.12,r*.09,a);c.fillStyle='rgba(238,154,132,.17)';c.fill();c.strokeStyle='rgba(242,195,156,.59)';c.stroke();ellipse(c,x,y,r*.035,r*.035);c.fillStyle='rgba(246,221,174,.64)';c.fill();}
    }else if(key==='secondWind'){
     const charge=clamp((p.energy||0)/Math.max(1,p.maxEnergy||100),0,1);
     for(let i=0;i<4;i++){const a=2.25+i*.6,x=Math.cos(a)*r*.71,y=Math.sin(a)*r*.71;ellipse(c,x,y,r*.10,r*.13,a);c.fillStyle=rgba([124,218,239],.06+charge*.25);c.fill();c.strokeStyle=rgba([181,241,246],.32+charge*.35);c.stroke();}
    }else if(key==='shadowMetabolism'){
     const ready=(p.shadowMetabolismCooldown||0)<=0;for(let i=0;i<3;i++){const a=2.3+i*.84,x=Math.cos(a)*r*.59,y=Math.sin(a)*r*.59;c.beginPath();c.moveTo(x*.65,y*.65);c.quadraticCurveTo(x*.55-y*.17,y*.55+x*.17,x,y);c.strokeStyle='rgba(201,180,239,.28)';c.stroke();ellipse(c,x,y,r*.105,r*.075,a);c.fillStyle=rgba([187,151,225],ready?.23:.09);c.fill();c.strokeStyle=rgba([225,208,249],ready?.72:.38);c.stroke();c.beginPath();c.ellipse(x,y,r*.055,r*.035,a,.3,2.8);c.stroke();}
    }else if(key==='chainPulse'){
     c.strokeStyle='rgba(204,181,250,.46)';c.beginPath();
     for(let i=0;i<3;i++){const a=-1.8+i*.74,x=Math.cos(a)*r*.66,y=Math.sin(a)*r*.66;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
     for(let i=0;i<3;i++){const a=-1.8+i*.74,x=Math.cos(a)*r*.66,y=Math.sin(a)*r*.66;ellipse(c,x,y,r*.058,r*.058);c.fillStyle='rgba(225,204,255,.65)';c.fill();}
    }else if(key==='photosynthesis'){
     const still=!!p.photosynthesising;
     for(let i=0;i<3;i++){const a=1+i*2.1;c.save();c.rotate(a);ellipse(c,r*.55,0,r*.19,r*.078,.25);c.fillStyle=rgba([158,226,119],still?.32:.15);c.fill();c.strokeStyle='rgba(193,239,146,.66)';c.stroke();c.beginPath();c.moveTo(r*.42,0);c.lineTo(r*.68,0);c.stroke();c.restore();}
    }else if(key==='undertow'){
     c.strokeStyle='rgba(151,236,213,.5)';
     for(const side of [-1,1]){c.beginPath();c.moveTo(r*.47,side*r*.66);c.bezierCurveTo(r*.94,side*r*1.23,r*1.45,side*r*.97,r*1.31,side*r*.62);c.bezierCurveTo(r*1.20,side*r*.38,r*.99,side*r*.56,r*1.13,side*r*.71);c.stroke();ellipse(c,r*1.13,side*r*.71,r*.035,r*.035);c.fillStyle='rgba(188,249,220,.7)';c.fill();}
    }else if(key==='fissionHeart'){
     for(const side of [-1,1]){ellipse(c,-r*.16,side*r*.17,r*.12,r*.15,side*.45);c.fillStyle='rgba(242,133,163,.24)';c.fill();c.strokeStyle='rgba(255,197,198,.78)';c.stroke();ellipse(c,-r*.14,side*r*.17,r*.035,r*.04);c.fillStyle='rgba(255,230,205,.75)';c.fill();}ellipse(c,-r*.16,0,r*.23,r*.39);c.strokeStyle='rgba(245,181,186,.32)';c.stroke();
    }else if(key==='storedImpact'){
     const charge=clamp((p.impactCharge||0)/40,0,1);for(let j=0;j<3;j++){c.save();c.translate(-r*.47+j*r*.44,-r*.59);polygon(c,6,r*.12,Math.PI/6);c.fillStyle=rgba([244,211,132],.10+charge*.40);c.fill();c.strokeStyle=rgba([253,228,163],.48+charge*.48);c.stroke();c.beginPath();c.moveTo(-r*.07,0);c.lineTo(0,-r*.04);c.lineTo(r*.07,0);c.stroke();c.restore();}
    }else if(key==='serratedJaws'){
     c.strokeStyle='rgba(255,196,170,.8)';for(let i=0;i<7;i++){const a=-.6+i*.2;c.beginPath();c.moveTo(Math.cos(a)*r*.95,Math.sin(a)*r*.95);c.lineTo(Math.cos(a)*r*1.12,Math.sin(a)*r*1.12);c.lineTo(Math.cos(a+.1)*r*.97,Math.sin(a+.1)*r*.97);c.stroke();}
    }else if(key==='devourerGullet'){
     c.strokeStyle='rgba(206,182,240,.55)';for(const sd of [-1,1]){c.beginPath();c.arc(r*.55,0,r*.42,sd*.4,sd*1.3,sd<0);c.stroke();}ellipse(c,r*.35,0,r*.18,r*.12);c.fillStyle='rgba(150,120,200,.25)';c.fill();
    }else if(key==='chitinPlates'){
     c.strokeStyle='rgba(232,196,120,.6)';c.fillStyle='rgba(222,180,100,.08)';for(let i=0;i<10;i++){const a=i*TAU/10;c.save();c.rotate(a);c.beginPath();c.arc(0,0,r*1.03,-.24,.24);c.arc(0,0,r*.9,.22,-.22,true);c.closePath();c.fill();c.stroke();c.restore();}
    }else if(key==='mirrorMembrane'){
     c.strokeStyle='rgba(214,243,250,.55)';c.lineWidth=1;c.beginPath();c.arc(0,0,r*1.1,0,TAU);c.stroke();c.strokeStyle='rgba(255,255,255,.35)';c.beginPath();c.arc(0,0,r*1.1,-2.4+time*.3,-1.6+time*.3);c.lineWidth=2;c.stroke();
    }else if(key==='whipFlagellum'){
     c.strokeStyle='rgba(149,218,250,.6)';c.lineWidth=1.3;c.beginPath();c.moveTo(-r*.95,0);for(let i=1;i<=16;i++){const u=i/16;c.lineTo(-r*.95-u*r*1.5,Math.sin(u*9-time*9)*r*.18*u);}c.stroke();
    }else if(key==='jetSac'){
     for(const sd of [-1,1]){ellipse(c,-r*.7,sd*r*.42,r*.2,r*.12);c.fillStyle='rgba(140,214,242,.22)';c.fill();c.strokeStyle='rgba(170,230,250,.6)';c.stroke();}
    }else if(key==='staticCharge'){
     const n=(p.staticCount||0);for(let j=0;j<3;j++){c.save();c.rotate(j*TAU/3+time*.6);ellipse(c,r*.62,0,r*.08,r*.08);c.fillStyle=`rgba(246,234,160,${j<n?.85:.25})`;c.fill();c.restore();}
    }else if(key==='sporeGland'){
     for(const sd of [-1,1]){ellipse(c,r*.2,sd*r*.78,r*.16,r*.12);c.fillStyle='rgba(227,179,238,.3)';c.fill();c.strokeStyle='rgba(227,179,238,.7)';c.stroke();}
    }else if(key==='twinNucleus'){
     for(const sd of [-1,1]){ellipse(c,sd*r*.14,0,r*.16,r*.16);c.fillStyle='rgba(126,132,190,.35)';c.fill();}
    }else if(key==='fedHeart'){
     ellipse(c,-r*.25,r*.3,r*.13,r*.11);c.fillStyle='rgba(183,239,145,.35)';c.fill();c.strokeStyle='rgba(183,239,145,.7)';c.stroke();
    }else if(key==='abyssalHeart'){
     ellipse(c,0,0,r*.2,r*.2);c.fillStyle='rgba(30,16,48,.75)';c.fill();c.strokeStyle='rgba(196,170,240,.75)';c.stroke();
    }else if(key==='eyespot'){
     ellipse(c,r*.6,-r*.25,r*.09,r*.09);c.fillStyle='rgba(250,200,100,.9)';c.fill();
    }else if(key==='lateralLine'){
     c.strokeStyle='rgba(185,172,235,.5)';c.setLineDash([r*.06,r*.06]);for(const sd of [-1,1]){c.beginPath();c.moveTo(r*.6,sd*r*.5);c.quadraticCurveTo(0,sd*r*.72,-r*.7,sd*r*.45);c.stroke();}c.setLineDash([]);
    }else if(key==='phaseMembrane'){
     c.strokeStyle='rgba(149,243,240,.48)';c.lineWidth=.8;for(const side of [-1,1]){c.beginPath();c.ellipse(0,0,r*1.06,r*1.14,0,side<0?Math.PI+.3:.3,side<0?TAU-.3:Math.PI-.3);c.stroke();}for(let j=0;j<5;j++){const a=j*TAU/5+time*.05;ellipse(c,Math.cos(a)*r*.99,Math.sin(a)*r*.99,r*.035,r*.035);c.fillStyle='rgba(184,255,249,.7)';c.fill();}
    }
    c.restore();
   }
  }
  drawSpecimen(player,options={}){
   if(!player||!Number.isFinite(player.r)||player.r<=0)return null;
   const c=this.ctx,w=this.width,h=this.height,time=Number.isFinite(options.time)?options.time:0,r=player.r,t={...player.traits},source=Array.isArray(options.previewMutations)?options.previewMutations:Array.isArray(player.mutations)?player.mutations:[],mutations=[...new Set(source)].filter(key=>Object.hasOwn(MorphosGame.MUTATIONS,key));
   // A neutral anatomical pose uses the actual body and stored organ charges,
   // without temporary concealment, fatigue, damage flashes or active powers.
   const specimen={...player,traits:t,mutations,x:0,y:0,angle:0,vx:0,vy:0,stealth:0,sneaking:false,sprinting:false,exhausted:false,invulnerable:0,hurt:0,evolution:0};
   // Reserve every mutation's small envelope so trying one on never changes
   // the apparent size of the same body. Long flagella still get their full fit.
   const ciliary=.93+.11*1.1,radial=Math.max(1.28,ciliary,t.venomist?1.22:0,t.summoner?1.27:0),vertical=Math.max(1.3,radial,t.stalker?1.38+t.stalker*.035:0);
   let left=-r*radial,right=r*Math.max(1.5,radial,t.predator?1.32+t.predator*.075:0),top=-r*vertical,bottom=r*vertical;
   for(const node of this.playerNodes(specimen)){left=Math.min(left,node.x-node.r*1.1);right=Math.max(right,node.x+node.r*1.1);top=Math.min(top,node.y-node.r*1.1);bottom=Math.max(bottom,node.y+node.r*1.1);}
   if(t.riptide)left=Math.min(left,-r*(2.58+t.riptide*.3));
   const edge=Math.max(2,r*.025);left-=edge;right+=edge;top-=edge;bottom+=edge;
   // Facing north: the body is turned a quarter turn anticlockwise, so its front points up.
   const north=!!options.north;if(north)[left,right,top,bottom]=[top,bottom,-right,-left];
   const margin=Math.min(20,Math.min(w,h)*.08),footer=Math.min(14,h*.07),scale=Math.min(Math.max(1,w-margin*2)/(right-left),Math.max(1,h-margin*2-footer)/(bottom-top)),x=w*.5-(left+right)*scale*.5,y=(h-footer)*.5-(top+bottom)*scale*.5,bounds={left:x+left*scale,top:y+top*scale,right:x+right*scale,bottom:y+bottom*scale},camera=this.camera,biome=this.biome;
   c.save();
   try{
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    if(options.bare)c.clearRect(0,0,w,h);else{
    const field=c.createLinearGradient(0,0,w,h);field.addColorStop(0,'#10282e');field.addColorStop(1,'#07171f');c.fillStyle=field;c.fillRect(0,0,w,h);
    const halo=c.createRadialGradient(w*.5,h*.45,0,w*.5,h*.45,Math.max(w,h)*.63);halo.addColorStop(0,'rgba(120,174,158,.065)');halo.addColorStop(1,'rgba(120,174,158,0)');c.fillStyle=halo;c.fillRect(0,0,w,h);
    const rr=Math.min(w,h)*.42;c.strokeStyle='rgba(178,210,193,.11)';c.lineWidth=.7;ellipse(c,w*.5,(h-footer)*.5,rr,rr);c.stroke();
    c.beginPath();for(let i=0;i<24;i++){const a=i*TAU/24,length=i%3===0?4:2;c.moveTo(w*.5+Math.cos(a)*rr,(h-footer)*.5+Math.sin(a)*rr);c.lineTo(w*.5+Math.cos(a)*(rr+length),(h-footer)*.5+Math.sin(a)*(rr+length));}c.stroke();
    c.strokeStyle='rgba(186,218,202,.23)';c.lineWidth=.75;c.beginPath();for(const side of [-1,1]){const xx=side<0?margin:w-margin,yy=margin;c.moveTo(xx,yy+6);c.lineTo(xx,yy);c.lineTo(xx-side*6,yy);}c.stroke();
    }
    this.camera={x:0,y:0,zoom:scale};this.biome=0;c.save();c.translate(x,y);c.scale(scale,scale);if(north)c.rotate(-Math.PI/2);this._specimenMorph=options.morph||null;
    // A division in the menu: a soft ring spreads from the body while it grows into its new shape.
    if(this._specimenMorph){const k=this._specimenMorph.k;c.beginPath();c.arc(0,0,r*(1+k*1.6),0,Math.PI*2);c.strokeStyle=`rgba(176,255,219,${(1-k)*.55})`;c.lineWidth=2/scale;c.stroke();}
    this.drawPlayer(specimen,time,false,true);this._specimenMorph=null;c.restore();
    // A heading mark and a bar spanning the nominal core diameter, without
    // pretending that the game's world units are physical micrometres.
    if(!options.bare){const baseline=h-Math.max(7,margin*.6),core=r*scale;c.strokeStyle='rgba(185,219,204,.29)';c.lineWidth=.8;c.beginPath();c.moveTo(x-core,baseline);c.lineTo(x+core,baseline);for(const end of [-1,1]){c.moveTo(x+end*core,baseline-3);c.lineTo(x+end*core,baseline+3);}c.stroke();
    const ax=w-margin-15,ay=margin+3;c.strokeStyle='rgba(199,229,211,.42)';c.beginPath();if(north){c.moveTo(ax-6,ay+12);c.lineTo(ax-6,ay);c.lineTo(ax-9,ay+4);c.moveTo(ax-6,ay);c.lineTo(ax-3,ay+4);}else{c.moveTo(ax-12,ay);c.lineTo(ax,ay);c.lineTo(ax-4,ay-3);c.moveTo(ax,ay);c.lineTo(ax-4,ay+3);}c.stroke();}
   }finally{this.camera=camera;this.biome=biome;c.restore();}
   return{mutations:[...mutations],scale,bounds,centre:{x,y,r:r*scale}};
  }
  // Growth morph: when the player divides or gains a rank, the body grows from the old shape to the new one over the first
  // ~1.8 s of the sim's evolution timer (p.evolution, 3.2 s at division; it only runs while the pond runs).
  _morph(p){
   const lv=(p.stage||0)+Object.values(p.traits||{}).reduce((n,v)=>n+v,0)+Object.values(p.mastery||{}).reduce((n,v)=>n+v,0);
   const cur={stage:p.stage||0,lv,traits:{...(p.traits||{})},r:p.r,cellCount:p.cellCount||1,cellExponent:p.cellExponent},snap=this._playerSnap;this._playerSnap=cur;
   if(!snap||cur.lv<snap.lv){this._morphFrom=null;return null;}
   if(cur.lv>snap.lv)this._morphFrom=(p.evolution||0)>0?(this._morphFrom||snap):null;
   if(!this._morphFrom)return null;
   const k=clamp((3.2-(p.evolution||0))/1.8,0,1);if(k>=1||(p.evolution||0)<=0){this._morphFrom=null;return null;}
   return{k:k*k*(3-2*k),from:this._morphFrom};
  }
  // 0..1: how much the body is in fast-swim shape. Eases in quickly and out more slowly; when a fast swim ends
  // the membrane gets a short, damped wobble as it settles (skipped with reduced motion).
  swimBlend(p,time){if(this._swimAt===time)return this._swim||0;const dt=clamp(time-(this._swimAt??time),0,.1),target=p.sprinting||(p.slipstreamTime||0)>0?1:0,was=this._swim||0;
   this._swim=target>was?Math.min(1,was+dt/.14):Math.max(0,was-dt/.3);if((this._swimTarget||0)===1&&target===0&&was>=.6)this._settleAt=time;this._swimTarget=target;this._swimAt=time;return this._swim;}
  settleWobble(time){if(this.reducedMotion||this._settleAt===undefined)return 0;const u=time-this._settleAt;return u<0||u>.9?0:Math.exp(-u*5.5)*Math.sin(u*24)*.07;}
  // 0..1: how hardened the body is right now. Sets in 0.06 s, holds, then softens over the last third of the block.
  hardness(p){const left=p.parryTime||0;if(left<=0)return 0;const win=Math.max(.01,p.parryWindow||.45),age=win-left;return clamp(age/.06,0,1)*clamp(left/(win*.35),0,1);}
  drawPlayer(p,time,menu=false,specimen=false){
   const m=!menu&&!specimen?this._morph(p):specimen?this._specimenMorph||null:null,k=m?m.k:1,r=m?m.from.r+(p.r-m.from.r)*k:p.r;
   const c=this.ctx,t=p.traits||{},base=m?mix(this.playerColour({...p,traits:m.from.traits}),this.playerColour(p),k):this.playerColour(p),stealth=clamp(p.stealth||0,0,1),fatigue=p.exhausted?.48:0,hard=!menu&&!specimen?this.hardness(p):0,co=mix(mix(mix(base,palettes[this.biome||0].fluid,stealth*.35),[143,158,154],fatigue),[184,174,150],hard*.8),phase=.7;c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);if(hard)c.scale(1-.05*hard,1-.05*hard);const swim=!menu&&!specimen?this.swimBlend(p,time):0,wob=!menu&&!specimen?this.settleWobble(time):0;if(swim||wob)c.scale(1+.13*swim+wob,1-.08*swim-wob*.8);
   const inv=(p.invulnerable||0)>0?(.64+.36*Math.cos(time*20)):1;c.globalAlpha=inv*(1-stealth*.61);
   c.drawImage(this.glow(base),-r*2,-r*2,r*4,r*4);
   let nodes=this.playerNodes(m?{...p,r}:p);
   // Each new cell buds from the nearest cell of the old body, so a division reads as the body splitting apart.
   if(m){const old=this.playerNodes({...p,r,cellCount:m.from.cellCount,traits:m.from.traits});nodes=nodes.map(q=>{let o=old[0],bd=Infinity;for(const e of old){const d=(e.x-q.x)**2+(e.y-q.y)**2;if(d<bd){bd=d;o=e;}}return{x:o.x+(q.x-o.x)*k,y:o.y+(q.y-o.y)*k,r:o.r+(q.r-o.r)*k};});}
   const many=nodes.length>1,edge=many?this.bodyEdge(nodes,r*.07):()=>r*.93;
   this.cilia(c,r*.93,time,phase,co,many?26:18,r*.11*(1-swim*.25)*(1-hard*.8),1,swim,edge);
   // A family that ranked up fades its old organs out while the new ones grow outward from inside the membrane.
   const organ=(fam,fn)=>{const now=t[fam]||0,was=m?(m.from.traits[fam]||0):now;if(!m||was===now){if(now)fn(now);return;}
     if(was){c.save();c.globalAlpha*=1-k;fn(was);c.restore();}if(now){c.save();c.globalAlpha*=k;const s=.45+.55*k;c.scale(s,s);fn(now);c.restore();}};
   organ('riptide',n=>this.tails(c,r,time,co,Math.min(3,Math.ceil(n/1.4)),.6+n*.6+(p.sprinting?.8:0)));
   this._edge=many?edge:null;organ('venomist',n=>this.venomSacs(c,r,time,co,n));this._edge=null;
   organ('stalker',n=>this.veil(c,r,time,co,n));
   if(many){this.edgePath(c,edge,time,phase);const g=this._grad(c,'c'+Math.round(r*2)+'|'+co.map(x=>Math.round(x/6)).join(','),()=>{const q=c.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r*1.05);q.addColorStop(0,rgba(mix(co,[237,255,244],.4),.12));q.addColorStop(.75,rgba(co,.07));q.addColorStop(1,rgba(co,.16));return q;});c.fillStyle=g;c.fill();c.strokeStyle=rgba(mix(co,[232,255,244],.5),.62);c.lineWidth=ink(r)*.9;c.stroke();}
   // Colony cells share one size, so one gradient (in each cell's own coordinates) serves them all.
   const simple=nodes.length>4,fill=simple&&!m?this.colonyFill(c,nodes[0].r,co):null;
   for(let i=0;i<nodes.length;i++){const q=nodes[i];c.save();c.translate(q.x,q.y);if(simple)this.colonyCell(c,q.r,time,phase+i*.64,co,fill);else this.cellBody(c,q.r,time,phase+i*.64,co,menu?2:nodes.length>2?0:1,1,.035,3,menu?0:.65);c.restore();}
   if(many){c.beginPath();for(let i=0;i<=14;i++){const a=3.75+1.1*i/14,rr=edge(a)*.9;if(i)c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.strokeStyle='rgba(224,255,242,.22)';c.lineWidth=ink(r)*.8;c.stroke();}
   this.mutationOrgans(c,p,time);this._edge=many?edge:null;
   // Jaws are a weapon now: they are drawn when the Jaws mutation is equipped (see mutationOrgans), not by Predator rank.
   organ('summoner',n=>this.buds(c,r,time,co,n));this._edge=null;
   if((p.hurt||0)>0){smoothBlob(c,r,time,phase,1,.05);c.fillStyle=`rgba(255,103,112,${Math.min(.45,p.hurt*.5)})`;c.fill();}
   if((p.evolution||0)>0){c.strokeStyle=rgba([220,255,216],clamp(p.evolution*.4,0,.6));c.lineWidth=2;c.beginPath();c.arc(0,0,r*(1.1+(.5-Math.sin(time*3)*.5)*.3),0,TAU);c.stroke();}
   c.restore();
   if(!menu&&!specimen)this.drawPlayerMarker(p,time);
  }
  drawPlayerMarker(p,time){
   const c=this.ctx,z=Math.max(.1,this.camera.zoom),r=p.r,ring=r*1.42,span=clamp(5/(ring*z),.22,.52),stealth=clamp(p.stealth||0,0,1),angle=p.angle||0,ca=Math.cos(angle),sa=Math.sin(angle);
   c.save();c.translate(p.x,p.y);c.beginPath();
   for(let i=0;i<4;i++){const a=i*TAU/4+.48;c.moveTo(Math.cos(a)*ring,Math.sin(a)*ring);c.arc(0,0,ring,a,a+span);}
   const base=ring+1/z,tip=ring+6/z,side=3/z;c.moveTo(ca*base-sa*side,sa*base+ca*side);c.lineTo(ca*tip,sa*tip);c.lineTo(ca*base+sa*side,sa*base-ca*side);
   c.lineCap='round';c.strokeStyle='rgba(3,15,21,.8)';c.lineWidth=3/z;c.stroke();c.strokeStyle=p.exhausted?'rgba(244,190,158,.83)':'rgba(224,248,194,.82)';c.lineWidth=1.2/z;c.stroke();
   if(stealth>.1){c.strokeStyle=rgba([191,195,242],stealth*.3);c.lineWidth=.8/z;c.setLineDash([2/z,6/z]);ellipse(c,0,0,r*1.22,r*1.22);c.stroke();c.setLineDash([]);}
   if(p.exhausted){const charge=clamp((p.energy||0)/Math.max(1,p.maxEnergy||100),0,1),rr=r*1.30;ellipse(c,0,0,rr,rr);c.strokeStyle='rgba(224,154,133,.18)';c.lineWidth=1.6/z;c.stroke();c.beginPath();c.arc(0,0,rr,-Math.PI/2,-Math.PI/2+TAU*charge);c.strokeStyle=rgba([244,184,151],.48+.13*Math.sin(time*4));c.stroke();}
   if(time<10&&!this._peerDraw){c.fillStyle='rgba(231,249,198,.88)';c.font=`${10/z}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillText('YOU',0,ring+15/z);}
   c.restore();
  }
  // Long-press Venom aim (touch): the volley's fan of dotted lines in the Predator colour, same spread and count as the shot.
  drawVenomAim(state,aim){
   // Touch aiming for Venom volley (a fan, one line per glob) and Pounce (a single line to its reach).
   const p=state.player,c=this.ctx,z=this.camera.zoom,which=aim[2]||'venomist',rank=(p.traits||{})[which]||0,a=Math.atan2(aim[1]-p.y,aim[0]-p.x);
   const count=which==='predator'||which==='strike'?1:(rank?3:2)+(((p.forks||{}).venomist2==='a'&&rank>=2)?2:0),len=which==='strike'?(p.strikeReach||p.pulseRadius||120):which==='predator'?(260+rank*30)*(rank?1:.8):400*(1.2+rank*.1)*.75;
   c.save();c.translate(p.x,p.y);c.strokeStyle=which==='strike'?'rgba(225,244,206,.7)':which==='predator'?'rgba(243,170,132,.6)':'rgba(186,222,134,.6)';c.lineWidth=1.4/z;c.setLineDash([3/z,7/z]);
   for(let i=0;i<count;i++){const d=a+(i-(count-1)/2)*.13;c.beginPath();c.moveTo(Math.cos(d)*(p.r+8),Math.sin(d)*(p.r+8));c.lineTo(Math.cos(d)*len,Math.sin(d)*len);c.stroke();}
   c.setLineDash([]);c.restore();
  }
  // Aim guides for evolved Strikes: a ring for Spine burst, twin rails for the lash, an arrow for Surge, a dotted line for darts and Needle.
  drawStrikeGuide(state,aim){
   const p=state.player,c=this.ctx,z=this.camera.zoom,ready=!p.exhausted&&p.energy>=p.pulseCost&&p.pulseCooldown<=0,angle=MorphosGame.pulseAngle(p,aim?.[0],aim?.[1]),co=ready?[172,233,206]:[157,174,171];
   const nearby=(state.organisms||[]).some(o=>!o.dead&&Math.hypot(o.x-p.x,o.y-p.y)<(p.strikeReach||p.pulseRadius||200)+o.r+120)||!!state.bossEncounter;
   c.save();c.translate(p.x,p.y);c.strokeStyle=rgba(co,ready?(nearby?.26:.13):.07);c.lineWidth=.9/z;
   if(p.strike==='predator'){const R=p.strikeReach,r0=p.r+6,half=.75;for(const s of [-1,1]){c.save();c.rotate(angle+s*half*.8);c.beginPath();c.moveTo(r0,0);c.quadraticCurveTo(R*.72,s*R*.2,R,s*R*.03);c.stroke();c.restore();}}
   else if(p.strike==='spores'){const half=.5;c.setLineDash([4/z,6/z]);c.beginPath();c.arc(0,0,p.strikeReach,angle-half,angle+half);c.stroke();c.beginPath();for(const side of [-1,1]){const e=angle+side*half;c.moveTo(Math.cos(e)*(p.strikeReach-5/z),Math.sin(e)*(p.strikeReach-5/z));c.lineTo(Math.cos(e)*(p.strikeReach+2/z),Math.sin(e)*(p.strikeReach+2/z));}c.stroke();}
   else{
    c.rotate(angle);const start=p.r+6,end=p.strike==='riptide'?p.r+p.strikeReach:(p.strikeReach||p.pulseRadius);
    if(p.strike==='riptide'){c.beginPath();c.moveTo(start,0);c.lineTo(end,0);c.stroke();}
    else{c.setLineDash([2/z,8/z]);c.beginPath();c.moveTo(start,0);c.lineTo(end,0);c.stroke();c.setLineDash([]);}
    c.beginPath();c.moveTo(end-6/z,-4/z);c.lineTo(end,0);c.lineTo(end-6/z,4/z);c.stroke();
   }
   c.restore();
  }
  // A dropped mutation: a small bright core in its tier's colour, a slow halo and a thin beam so it can be seen from afar.
  drawDrops(state,time){
   const c=this.ctx,z=this.camera.zoom;
   for(const d of state.drops||[]){if(!this.visible(d,200))continue;const co=MorphosGame.TIER_COLOURS[d.tier]||'#cfdcc4',fade=Math.min(1,d.life/4),pulse=.5+.5*Math.sin(time*3+d.id),R=(9+d.tier*2.2)/Math.sqrt(z);
    c.save();c.translate(d.x,d.y);c.globalAlpha=fade;
    const g=c.createRadialGradient(0,0,0,0,0,R*3.4);g.addColorStop(0,co);g.addColorStop(.18,co+'aa');g.addColorStop(.5,co+'2a');g.addColorStop(1,co+'00');c.fillStyle=g;c.beginPath();c.arc(0,0,R*3.4,0,Math.PI*2);c.fill();
    const beam=c.createLinearGradient(0,0,0,-R*(9+d.tier*4));beam.addColorStop(0,co+'88');beam.addColorStop(1,co+'00');c.strokeStyle=beam;c.lineWidth=(1.5+d.tier*.5)/z;c.beginPath();c.moveTo(0,0);c.lineTo(0,-R*(9+d.tier*4));c.stroke();
    c.strokeStyle=co;c.lineWidth=1.4/z;c.globalAlpha=fade*(.5+.5*pulse);c.beginPath();c.arc(0,0,R*(1.5+pulse*.5),0,Math.PI*2);c.stroke();
    c.globalAlpha=fade;c.rotate(time*.8+d.id);c.fillStyle='#fffdf0';c.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2;c.lineTo(Math.cos(a)*R,Math.sin(a)*R);c.lineTo(Math.cos(a+Math.PI/4)*R*.38,Math.sin(a+Math.PI/4)*R*.38);}c.closePath();c.fill();c.restore();}
  }
  drawCombatGuide(state,aim){
   const p=state.player;if(!p.alive||!Number.isFinite(p.pulseRadius))return;
   this.drawStrikeGuide(state,aim);
  }
  drawAbilities(state,time){
   const c=this.ctx,p=state.player,r=p.r;
   // Frenzy: short red marks around the cell, one per stack. Momentum: cyan chevrons behind it.
   if((p.frenzy||0)>0){c.save();c.translate(p.x,p.y);c.rotate(time*.8);const n=p.frenzy;for(let i=0;i<n;i++){const a=i*TAU/n;c.beginPath();c.arc(0,0,r*1.32,a-.12,a+.12);c.strokeStyle=rgba([240,120,100],.55);c.lineWidth=2.2;c.stroke();}c.restore();}
   if((p.momentum||0)>0){c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);for(let i=0;i<p.momentum;i++){const x=-r*(1.25+i*.28);c.beginPath();c.moveTo(x-r*.12,-r*.22);c.lineTo(x+r*.05,0);c.lineTo(x-r*.12,r*.22);c.strokeStyle=rgba([140,220,246],.6-i*.08);c.lineWidth=1.6;c.stroke();}c.restore();}
   for(const q of state.pools||[]){if(!this.visible(q,q.r))continue;const f=Math.min(1,q.life*2,((q.maxLife||3)-q.life)*6);c.save();c.globalAlpha=.32*f;c.fillStyle='#9fd67a';c.beginPath();c.arc(q.x,q.y,q.r,0,TAU);c.fill();c.globalAlpha=.6*f;c.strokeStyle='#c9f08f';c.lineWidth=1.2/this.camera.zoom;c.stroke();c.restore();}
   for(const v of state.vortices||[]){if(!this.visible(v,v.R))continue;const z=this.camera.zoom,fade=Math.min(1,((v.maxLife||1)-v.life)*4)*Math.min(1,v.life*3),spin=this.reducedMotion?0:(v.spin||0);c.save();c.translate(v.x,v.y);c.strokeStyle='#95dafa';c.lineWidth=1.6/z;c.globalAlpha=.5*fade;
    for(let i=0;i<4;i++){const a0=spin*2.4+i*Math.PI/2;c.beginPath();for(let t=0;t<=1.001;t+=.05){const a=a0+t*2.6,rr=v.R*(1-t*.85);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();}
    c.globalAlpha=.22*fade;c.setLineDash([6/z,10/z]);c.beginPath();c.arc(0,0,v.R,spin*.8,spin*.8+TAU);c.stroke();c.setLineDash([]);c.restore();}
   for(const d of state.decoys||[]){if(!this.visible(d,70))continue;const life=clamp(d.life/(d.maxLife||1),0,1),co=[173,179,233];c.save();c.translate(d.x,d.y);c.rotate(d.angle||0);c.globalAlpha=Math.min(.44,life*1.4);this.veil(c,d.r,time,co,1);this.cilia(c,d.r,time,d.phase||0,co,18,d.r*.17);this.cellBody(c,d.r*.9,time,d.phase||0,co,1,1,.07);c.strokeStyle=rgba(co,.65);c.lineWidth=.8;c.setLineDash([2,5]);ellipse(c,0,0,d.r*1.25,d.r*1.25);c.stroke();c.setLineDash([]);c.restore();}
  }
  drawShell(p,time){
   const c=this.ctx,r=p.r;
   // Block: the whole body has turned to stone (see hardness() in drawPlayer). Over it: a stony grain, a few
   // hairline cracks and a hard rim that catches the light as it sets.
   const hard=this.hardness(p);if(hard>0){c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);const rr=r*(1-.05*hard);
    c.beginPath();c.arc(0,0,rr*.97,0,TAU);c.fillStyle=rgba([150,140,118],.28*hard);c.fill();c.clip();
    for(let i=0;i<26;i++){const a=i*2.399,d=Math.sqrt((i*.618)%1)*rr*.92;ellipse(c,Math.cos(a)*d,Math.sin(a)*d,rr*(.035+(i%3)*.012),rr*(.025+(i%2)*.01),a);c.fillStyle=rgba(i%2?[96,88,72]:[222,212,186],.32*hard);c.fill();}
    c.strokeStyle=rgba([82,74,60],.45*hard);c.lineWidth=Math.max(.6,r*.022);for(let k=0;k<4;k++){const a=k*1.57+.5;c.beginPath();c.moveTo(Math.cos(a)*rr*.98,Math.sin(a)*rr*.98);c.lineTo(Math.cos(a+.18)*rr*.66,Math.sin(a+.18)*rr*.66);c.lineTo(Math.cos(a-.1)*rr*.42,Math.sin(a-.1)*rr*.42);c.stroke();}
    c.restore();c.save();c.translate(p.x,p.y);const set=p.parryTime>0?clamp((1-p.parryTime/Math.max(.01,p.parryWindow||.45))/.2,0,1):1;
    c.beginPath();c.arc(0,0,rr,0,TAU);c.strokeStyle=rgba([236,226,198],(.55+.4*(1-set))*hard);c.lineWidth=Math.max(1.2,r*.07)*(1+.6*(1-set));c.stroke();c.restore();}
   if((p.fissionShieldTime||0)>0){c.save();c.translate(p.x,p.y);const alpha=Math.min(1,p.fissionShieldTime*2);c.strokeStyle=rgba([255,177,196],alpha*.78);c.fillStyle=rgba([243,137,167],alpha*.035);c.lineWidth=1.5;for(let j=0;j<2;j++){ellipse(c,(j===0?-1:1)*r*.13,0,r*1.15,r*1.24,j===0?-.17:.17);c.fill();c.stroke();}c.restore();}
   if((p.phaseShieldTime||0)>0){c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);const alpha=Math.min(1,p.phaseShieldTime*5);c.strokeStyle=rgba([166,255,244],alpha*.8);c.lineWidth=1.2;for(let j=0;j<3;j++){c.beginPath();c.ellipse(-j*r*.22,0,r*(1.18+j*.05),r*(1.12+j*.08),0,.4,TAU-.4);c.globalAlpha=1-j*.25;c.stroke();}c.restore();}
   if(p.slipstreamCharged){c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);c.strokeStyle='rgba(166,239,254,.65)';c.lineWidth=1/this.camera.zoom;for(let j=-1;j<=1;j++){const a=j*.3;c.beginPath();c.arc(0,0,r*1.2,a-.055,a+.055);c.stroke();c.beginPath();c.arc(0,0,r*1.32,a-.035,a+.035);c.stroke();}c.restore();}
   if(p.specialActiveTrait==='predator'&&(p.specialTime||0)>0){c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);c.globalAlpha=Math.min(1,p.specialTime*2);c.strokeStyle='rgba(211,231,130,.5)';c.lineWidth=.9;for(const s of [-1,0,1]){c.beginPath();c.moveTo(r*.8,s*r*.12);c.quadraticCurveTo(r*1.3,s*r*.4,r*1.8,s*r*.6);c.stroke();}c.restore();}
  }
  drawCounterShot(shot){
   const warning=(Number(shot.warningTime)||0)>0,speed=Math.hypot(shot.vx||0,shot.vy||0),range=speed*Math.max(0,Number(shot.life)||0);if(!this.visible(shot,warning?range+12:20))return;
   const c=this.ctx,z=this.camera.zoom,r=shot.r||8,progress=1-clamp((shot.warningTime||0)/Math.max(.01,shot.warningMax||.7),0,1),co=[247,204,132];c.save();c.translate(shot.x,shot.y);c.rotate(Math.atan2(shot.vy||0,shot.vx||0));
   if(warning){c.beginPath();c.moveTo(0,0);c.lineTo(range,0);c.strokeStyle=rgba(co,.2+progress*.13);c.lineWidth=.8/z;c.setLineDash([4/z,9/z]);c.stroke();c.setLineDash([]);if(range>12/z){c.beginPath();c.moveTo(range-5/z,-3/z);c.lineTo(range,0);c.lineTo(range-5/z,3/z);c.stroke();}const rr=r+(4+(1-progress)*10)/z;c.lineWidth=1/z;c.strokeStyle=rgba(co,.53+progress*.25);for(let j=0;j<4;j++){const a=j*TAU/4+.35;c.beginPath();c.arc(0,0,rr,a,a+.64);c.stroke();}if(progress>0){c.beginPath();c.arc(0,0,r+4/z,-Math.PI/2,-Math.PI/2+TAU*progress);c.lineWidth=.85/z;c.strokeStyle=rgba(co,.55);c.stroke();}}
   const size=r*(warning?.65+progress*.35:1);c.beginPath();c.moveTo(size,0);c.lineTo(0,-size*.76);c.lineTo(-size,0);c.lineTo(0,size*.76);c.closePath();c.fillStyle=rgba(co,warning?.24+progress*.46:1);c.fill();c.strokeStyle='rgba(2,12,19,.85)';c.lineWidth=2.5/z;c.stroke();c.strokeStyle=rgba([255,233,189],warning?.66+progress*.24:.9);c.lineWidth=.9/z;c.stroke();c.beginPath();c.moveTo(-size*.5,0);c.lineTo(size*.6,0);c.strokeStyle='rgba(57,43,38,.65)';c.lineWidth=.8/z;c.stroke();
   if(!warning){c.strokeStyle=rgba(co,.44);c.lineWidth=.85/z;for(const side of [-1,1]){c.beginPath();c.moveTo(-r*.6,side*r*.65);c.lineTo(-r*2.2,side*r*.36);c.stroke();}}c.restore();
  }
  drawEffects(state,time){
   const c=this.ctx;
   for(const ef of state.effects||[]){if(!this.visible(ef,ef.maxR||80))continue;const alpha=clamp(ef.life/(ef.maxLife||1),0,1),r=Math.max(1,ef.r||5);c.save();if(ef.self&&state.player)c.translate(state.player.x,state.player.y);else c.translate(ef.x,ef.y);c.strokeStyle=ef.colour||`rgba(153,239,224,${alpha})`;c.globalAlpha=alpha;
    if(ef.kind==='bite'){
     // Bite: two slender mandibles swing out from the body and snap shut on the centre line.
     const a=ef.angle,R=ef.maxR||r,B=Math.min(ef.body||R*.3,R*.7),k=1-alpha,z=this.camera.zoom,co=ef.colour||'#efba8d';
     const shut=k<.34?Math.pow(k/.34,2.2):1,open=(ef.halfAngle||.75)*.62*(1-shut),fade=k<.5?1:1-(k-.5)/.5,L=R-B*.55,th=Math.max(1.6/z,L*.035);
     c.rotate(a);c.globalAlpha=fade;c.lineJoin='round';
     for(const s of [-1,1]){c.save();c.translate(B*.55,s*B*.36);c.rotate(s*open);
      // A curved blade: thick at the hinge, bowed outward, tapering to a point on the centre line.
      const ty=-s*B*.36,bow=s*L*.2;
      c.beginPath();c.moveTo(0,s*th*.9);c.quadraticCurveTo(L*.5,bow+s*th*.6,L,ty);c.quadraticCurveTo(L*.55,bow-s*th*1.1,0,-s*th*.9);c.closePath();
      c.fillStyle=co;c.globalAlpha=fade*.28;c.fill();c.globalAlpha=fade;c.strokeStyle=co;c.lineWidth=1.5/z;c.stroke();
      c.fillStyle=co;for(let i=0;i<3;i++){const u=.5+i*.14,x=L*u,y=2*(1-u)*u*(bow-s*th*1.1)+u*u*ty-(1-u)*(1-u)*s*th*.9,tw=L*.022;c.beginPath();c.moveTo(x-tw,y);c.lineTo(x+tw*.3,y-s*L*.04);c.lineTo(x+tw,y);c.closePath();c.globalAlpha=fade*.95;c.fill();}
      c.restore();}
     // The snap: a short flash where the tips meet.
     if(k>.3&&k<.62){const u=(k-.3)/.32,x=R*.97;c.globalAlpha=(1-u)*.9;c.strokeStyle='#fff3df';c.lineWidth=1.4/z;for(const s of [-1,1]){c.beginPath();c.moveTo(x+R*.02,s*R*.03);c.lineTo(x+R*(.05+.07*u),s*R*(.07+.08*u));c.stroke();}}
    }
    else if(ef.kind==='command'){
     // Command: a narrow signal travels out along your aim, like a call, and fades at its reach.
     const a=ef.angle,R=ef.maxR||r,B=Math.min(ef.body||R*.2,R*.6),k=1-alpha,z=this.camera.zoom;c.strokeStyle=ef.colour||'#f3d48c';c.rotate(a);c.lineCap='round';
     for(let i=0;i<3;i++){const u=clamp(k*1.5-i*.16,0,1);if(u<=0)continue;const rr=B*1.15+(R-B*1.15)*u,w=.2+.16*u;c.globalAlpha=alpha*(1-i*.28)*Math.min(1,u*5);c.beginPath();c.arc(0,0,rr,-w,w);c.lineWidth=(1.9-i*.45)/z;c.stroke();}
    }
    else if(ef.kind==='mark'){
     // A creature marked for the brood: four brackets close in on it and turn slowly.
     const k=1-alpha,R=(ef.maxR||r)*(1-.45*Math.min(1,k*2)),z=this.camera.zoom;c.strokeStyle=ef.colour||'#f3d48c';c.globalAlpha=Math.min(1,alpha*1.6);c.rotate(k*1.2);c.lineWidth=1.8/z;
     for(let i=0;i<4;i++){const q=i*Math.PI/2;c.beginPath();c.arc(0,0,R,q-.32,q+.32);c.stroke();}
    }
    else if(ef.kind==='pulse'){
     // Jab: the membrane bulges into a blunt pseudopod, punches out to its reach and draws back in.
     const a=ef.angle,R=ef.maxR||r,B=Math.min(ef.body||R*.25,R*.8),k=1-alpha,z=this.camera.zoom,co=ef.colour||'#b5f6e5';
     const e=k<.3?1-Math.pow(1-k/.3,3):Math.pow(1-(k-.3)/.7,1.6),tip=B*.86+(R-B*.86)*e,w=Math.min(B*(.3+.24*e),(R-B)*.28+B*.2),base=B*.62,ang=.72;
     c.rotate(a);const bx=Math.cos(ang)*B*.93,by=Math.sin(ang)*B*.93;
     c.beginPath();c.moveTo(bx,-by);c.bezierCurveTo(bx+base*.7,-by*.5,tip-w*3,-w*.5,tip-w,-w);c.arc(tip-w,0,w,-Math.PI/2,Math.PI/2);c.bezierCurveTo(tip-w*3,w*.5,bx+base*.7,by*.5,bx,by);
     const g=c.createLinearGradient(B*.6,0,tip,0);g.addColorStop(0,'rgba(181,246,229,0)');g.addColorStop(.35,'rgba(181,246,229,.16)');g.addColorStop(1,'rgba(214,255,240,.34)');c.globalAlpha=Math.min(1,alpha*2.2+.15);c.fillStyle=g;c.fill();
     c.strokeStyle=co;c.lineWidth=1.5/z;c.stroke();
     // A wet glint along the lobe.
     c.globalAlpha*=.55;c.beginPath();c.arc(tip-w,0,w*.62,-1.25,-.2);c.lineWidth=1/z;c.stroke();
    }
    else if(ef.kind==='lash'&&Number.isFinite(ef.x2)){const dx=ef.x2-ef.x,dy=ef.y2-ef.y,d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d,w=(ef.width||30)*.5;c.beginPath();c.moveTo(0,0);for(let j=1;j<=16;j++){const u=j/16,wave=Math.sin(u*9-alpha*6)*w*.35*(1-u*.5);c.lineTo(dx*u+nx*wave,dy*u+ny*wave);}c.lineWidth=Math.max(1,w*.45*alpha);c.globalAlpha=alpha*.35;c.stroke();c.lineWidth=1.4/this.camera.zoom;c.globalAlpha=alpha;c.stroke();}
    else if(ef.kind==='burst'){c.lineWidth=1.3/this.camera.zoom;for(let j=0;j<18;j++){const a=j*TAU/18;c.beginPath();c.moveTo(Math.cos(a)*r*.55,Math.sin(a)*r*.55);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}c.globalAlpha=alpha*.5;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.globalAlpha=alpha*.06;c.fillStyle=ef.colour||'#efd18c';c.fill();}
    else if(ef.kind==='surge'&&Number.isFinite(ef.x2)){const dx=ef.x2-ef.x,dy=ef.y2-ef.y;for(let j=0;j<3;j++){const o=(j-1)*6;const d=Math.hypot(dx,dy)||1;c.beginPath();c.moveTo(-dy/d*o,dx/d*o);c.lineTo(dx-dy/d*o*.3,dy+dx/d*o*.3);c.lineWidth=(j===1?2:1)/this.camera.zoom;c.globalAlpha=alpha*(j===1?.8:.4);c.stroke();}}
    else if(ef.kind==='division'){for(let j=0;j<3;j++){c.beginPath();c.arc(0,0,r*(1-j*.16),0,TAU);c.lineWidth=1.3-j*.3;c.stroke();}}
    else if(ef.kind==='bossDeath'){for(let j=0;j<2;j++){c.beginPath();c.arc(0,0,r*(1-j*.2),0,TAU);c.lineWidth=2-j*.6;c.stroke();}for(let j=0;j<12;j++){const a=j*2.399,rr=r*(.46+(j%4)*.13),size=Math.max(2,8*alpha);c.save();c.translate(Math.cos(a)*rr,Math.sin(a)*rr);c.rotate(a+time*.25);polygon(c,j%2?3:6,size,0);c.lineWidth=.9;c.stroke();c.restore();}c.globalAlpha=alpha*.045;c.fillStyle=ef.colour||'#c8f0d2';ellipse(c,0,0,r*.8,r*.8);c.fill();}
    else if(ef.kind==='dash'){c.lineWidth=1.4;ellipse(c,0,0,r,r*.45,time*.3);c.stroke();}
    else if(ef.kind==='critical'){c.lineWidth=1.5;for(let j=0;j<4;j++){const a=j*TAU/4+.45;c.beginPath();c.moveTo(Math.cos(a)*r*.38,Math.sin(a)*r*.38);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}c.beginPath();c.arc(0,0,r*.55,0,TAU);c.lineWidth=.75;c.stroke();if(alpha>.3){const z=this.camera.zoom;c.font=`${10/z}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillStyle=ef.colour||'#ffe3a8';c.fillText('CRITICAL',0,-r*.7-8/z);}}
    else if(ef.kind==='reflect'){c.lineWidth=1.5;for(let j=0;j<6;j++){const a=j*TAU/6;c.save();c.rotate(a);c.beginPath();c.moveTo(r*.66,-r*.12);c.lineTo(r,0);c.lineTo(r*.66,r*.12);c.stroke();c.restore();}}
    else if(ef.kind==='parry'||ef.kind==='parryReflect'){const reflected=ef.kind==='parryReflect';c.lineWidth=1.4/this.camera.zoom;for(let j=0;j<5;j++){const a=j*TAU/5+.15;c.beginPath();c.moveTo(Math.cos(a)*r*.48,Math.sin(a)*r*.48);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}c.beginPath();c.arc(0,0,r*.46,0,TAU);c.lineWidth=.8/this.camera.zoom;c.stroke();if(alpha>.4){c.font=`${10/this.camera.zoom}px "Helvetica Neue",Arial,sans-serif`;c.textAlign='center';c.fillStyle=ef.colour||(reflected?'#ffe0a0':'#c7ffe3');c.fillText(reflected?'RETURNED':'PARRIED',0,-r-7/this.camera.zoom);}}
    else if(ef.kind==='chain'){if(Number.isFinite(ef.x2)&&Number.isFinite(ef.y2)){const dx=ef.x2-ef.x,dy=ef.y2-ef.y,d=Math.hypot(dx,dy)||1;c.beginPath();c.moveTo(0,0);for(let j=1;j<9;j++){const u=j/9,w=Math.sin(j*2.7+ef.x)*9*alpha;c.lineTo(dx*u-dy/d*w,dy*u+dx/d*w);}c.lineTo(dx,dy);c.lineWidth=1.5;c.stroke();c.globalAlpha=alpha*.22;c.lineWidth=6;c.stroke();c.globalAlpha=alpha;}c.beginPath();c.arc(0,0,r*.8,0,TAU);c.lineWidth=.8;c.stroke();}
    else if(ef.kind==='exhausted'){c.lineWidth=1.1;c.setLineDash([3,7]);c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.setLineDash([]);}
    else if(ef.kind==='secondWind'||ef.kind==='recovered'){c.lineWidth=1.25;for(let j=0;j<2;j++){c.beginPath();c.arc(0,0,r*(1-j*.22),0,TAU);c.stroke();}}
    else if(ef.kind==='shadowMetabolism'){c.lineWidth=1.15/this.camera.zoom;for(let j=0;j<3;j++){const a=j*TAU/3+.3;c.beginPath();c.arc(0,0,r*.72,a,a+.7);c.stroke();ellipse(c,Math.cos(a+.35)*r*.72,Math.sin(a+.35)*r*.72,1.8/this.camera.zoom,1.8/this.camera.zoom);c.fillStyle=ef.colour||'#d9b9f4';c.fill();}}
    else if(ef.kind==='mutation'){c.lineWidth=.95;for(let j=0;j<7;j++){const a=j*TAU/7+time*.1;c.save();c.rotate(a);c.translate(r,0);polygon(c,6,Math.max(2,r*.07),time*.3);c.stroke();c.restore();}}
    else if(ef.kind==='special'){
     // An ability firing: the membrane flashes once, close to the body, and is gone.
     const z=this.camera.zoom,rr=(ef.maxR||r)*(.36+.3*(1-alpha));c.globalAlpha=alpha*alpha*.9;c.lineWidth=1.4/z;c.beginPath();c.arc(0,0,rr,0,TAU);c.stroke();c.globalAlpha=alpha*alpha*.16;c.lineWidth=5/z;c.stroke();}
    else {c.lineWidth=1;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();}
    c.restore();
   }
   for(const p of state.particles||[]){if(!this.visible(p,4))continue;const alpha=clamp(p.life/(p.maxLife||1),0,1);c.globalAlpha=alpha;c.fillStyle=p.colour||'#a7eacb';ellipse(c,p.x,p.y,Math.max(.3,p.r||1),Math.max(.3,(p.r||1)*.7),(p.vx||0)*.02);c.fill();}c.globalAlpha=1;
   for(const p of state.projectiles||[]){if(p.kind==='glassCounter'&&p.owner==='enemy'){this.drawCounterShot(p);continue;}if(!this.visible(p,12))continue;const r=p.r||4,colour=p.colour||'#b8ffdb';c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy||0,p.vx||0));
    if(p.owner==='enemy'){ellipse(c,0,0,r*1.12,r);c.fillStyle=colour;c.fill();c.strokeStyle='rgba(2,12,19,.85)';c.lineWidth=2.5/this.camera.zoom;c.stroke();c.strokeStyle='rgba(255,230,213,.85)';c.lineWidth=.85/this.camera.zoom;c.stroke();ellipse(c,-r*.12,0,r*.36,r*.38);c.fillStyle='rgba(22,28,39,.72)';c.fill();c.strokeStyle=colour;c.globalAlpha=.43;c.lineWidth=.85/this.camera.zoom;for(const side of [-1,1]){c.beginPath();c.moveTo(-r*.75,side*r*.67);c.lineTo(-r*2.1,side*r*.41);c.stroke();}}
    else if(p.strike&&p.strike.shape==='stalker'){const z=this.camera.zoom;c.beginPath();c.moveTo(-28/z,0);c.lineTo(6/z,0);c.strokeStyle=colour;c.globalAlpha=.25;c.lineWidth=5/z;c.stroke();c.globalAlpha=1;c.lineWidth=1.4/z;c.stroke();c.beginPath();c.moveTo(9/z,0);c.lineTo(2/z,-2.2/z);c.lineTo(2/z,2.2/z);c.closePath();c.fillStyle='rgba(240,236,255,.95)';c.fill();}
    else if(p.strike&&p.strike.shape==='spikes'){const z=this.camera.zoom;c.beginPath();c.moveTo(-12/z,0);c.lineTo(r*1.4,0);c.strokeStyle=colour;c.globalAlpha=.3;c.lineWidth=3/z;c.stroke();c.globalAlpha=1;c.lineWidth=1.3/z;c.stroke();}
    else if(p.strike&&p.strike.shape==='spores'){ellipse(c,0,0,r,r);c.fillStyle=colour;c.globalAlpha=.75;c.fill();c.globalAlpha=1;c.strokeStyle='rgba(255,244,210,.8)';c.lineWidth=.8/this.camera.zoom;c.stroke();}
    else if(p.strike&&p.strike.shape==='predator'){c.beginPath();c.moveTo(r*2.4,0);c.quadraticCurveTo(0,-r*1.1,-r*1.4,-r*.5);c.lineTo(-r*.9,0);c.lineTo(-r*1.4,r*.5);c.quadraticCurveTo(0,r*1.1,r*2.4,0);c.fillStyle=colour;c.fill();c.strokeStyle='rgba(255,240,225,.7)';c.lineWidth=.7/this.camera.zoom;c.stroke();}
    else{c.fillStyle=colour;ellipse(c,0,0,r*1.9,r*.59);c.fill();c.strokeStyle='rgba(234,255,226,.48)';c.lineWidth=.55/this.camera.zoom;c.beginPath();c.moveTo(-r*.65,0);c.lineTo(r*1.55,0);c.stroke();c.globalAlpha=.23;ellipse(c,-r*2.1,0,r*2.8,r*.40);c.fill();}c.restore();
   }
  }
  pointer(aim,p,time){
   if(!aim||!Number.isFinite(aim[0])||!Number.isFinite(aim[1]))return;const c=this.ctx,d=Math.hypot(aim[0]-p.x,aim[1]-p.y);if(d<p.r*1.3)return;const co=this.playerColour(p),screen=this.worldToScreen(aim[0],aim[1]);if(screen.y<100||screen.y>this.height-110)return;c.save();c.translate(aim[0],aim[1]);c.strokeStyle=rgba(co,.27);c.lineWidth=.9/this.camera.zoom;const radius=5/this.camera.zoom;for(let i=0;i<4;i++){const a=i*TAU/4+.18;c.beginPath();c.arc(0,0,radius,a,a+.65);c.stroke();}c.restore();
  }
  menuSpecimen(state,time){
   const c=this.ctx,w=this.width,h=this.height,small=w<760,r=Math.min(small?94:148,w*(small?.24:.135),h*.22),x=w*(small?.5:.70),y=h*(small?.28:.48);
   const p={...state.player,x,y,r,angle:-.18+Math.sin(time*.12)*.08,cellCount:1,traits:{venomist:0,predator:0,riptide:0,summoner:0},mutations:[],exhausted:false,sprinting:false,invulnerable:0,hurt:0,evolution:0};
   c.save();c.globalAlpha=.28;const shade=c.createLinearGradient(0,0,w,0);shade.addColorStop(0,'#020e15');shade.addColorStop(.55,'#020e1500');c.fillStyle=shade;c.fillRect(0,0,w,h);c.restore();
   // Diffraction rings and faint annotation rules frame a single living specimen.
   c.strokeStyle='rgba(143,213,191,.13)';c.lineWidth=.7;c.beginPath();c.arc(x,y,r*1.52,.15,2.7);c.stroke();c.beginPath();c.arc(x,y,r*1.52,3.3,5.8);c.stroke();
   for(let i=0;i<36;i++){const a=i*TAU/36,rr=r*1.52,len=i%3===0?5:2;c.beginPath();c.moveTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);c.lineTo(x+Math.cos(a)*(rr+len),y+Math.sin(a)*(rr+len));c.stroke();}
   this.drawPlayer(p,time,true);
   if(!small){c.strokeStyle='rgba(165,227,207,.23)';c.beginPath();c.moveTo(x+r*.83,y+r*.20);c.lineTo(x+r*1.18,y+r*.39);c.lineTo(x+r*1.7,y+r*.39);c.stroke();c.font='11px "Helvetica Neue",Arial,sans-serif';c.fillStyle='rgba(184,225,210,.5)';{const label='A LIFE, JUST BEGINNING';c.fillText(label,Math.min(x+r*1.18,w-16-c.measureText(label).width),y+r*.39+15);}}
  }
  draw(state,options={}){
   if(!state||!state.player)return;
   const c=this.ctx,w=this.width,h=this.height,p=state.player,wall=options.time||0,dt=clamp(wall-this.lastWall,0,.08);this.lastWall=wall;this.biome=biomeIndex(state.biome);
   const menu=!!options.menu,frozen=!menu&&(!!options.paused||!!state.paused||!!state.pendingEvolution),time=menu?wall:state.time,quality=clamp(Number.isFinite(options.quality)?options.quality:1,.5,1);
   const reset=!this.started||this.seed!==state.seed||state.time<this.lastGameTime-.1;this.lastGameTime=state.time;this.seed=state.seed;
   const level=Math.max(0,Number(p.colonyLevel===undefined?p.stage:p.colonyLevel)||0),growth=Math.pow(Math.max(22,p.r||22)/22,.55),normalZoom=menu?.98:Math.min(clamp(Math.pow(Math.min(w,h)/780,.12),.85,1.15)*1.23/growth,Math.min(w,h)*.5/(MIN_SIGHT*growth)),viewZoom=!menu&&Number.isFinite(options.viewZoom)?clamp(options.viewZoom,.85,1.20):1,preferredZoom=normalZoom*viewZoom;let zoom=preferredZoom,baselineZoom=normalZoom;
   if(reset)this.manualZoomOut=viewZoom<1;else if(viewZoom<1)this.manualZoomOut=true;
   // The camera is always centred on you: no lead towards the aim, and no shift towards a boss (both made mouse aim drift).
   let tx=p.x,ty=p.y;
   const boss=!menu&&state.bossEncounter&&state.bossEncounter.hp>0&&Math.hypot(state.bossEncounter.x-p.x,state.bossEncounter.y-p.y)<state.bossEncounter.r*2.6+500?state.bossEncounter:null;let frame=!menu?this.playRect(options.playArea):null;
   if(boss){
    if(!frame){const top=h<550?Math.min(155,h*.34):w<=760?315:280,bottom=h<550?Math.min(145,h*.31):w<=760?185:180;frame={left:30,top,width:Math.max(80,w-60),height:Math.max(72,h-top-bottom)};}
    const margin=25;
    const bossRadius=boss.r*1.35,hx=Math.max(p.r,Math.abs(boss.x-p.x)+bossRadius)+margin,hy=Math.max(p.r,Math.abs(boss.y-p.y)+bossRadius)+margin;let left=p.x-hx,right=p.x+hx,upper=p.y-hy,lower=p.y+hy;
    // The boss fight frames you and the boss only; the Broodmother's young come and go and would keep moving the camera.
    const fit=Math.min(normalZoom,frame.width/(right-left),frame.height/(lower-upper)),minZoom=h<550?.28:.4;
    baselineZoom=Math.min(normalZoom,Math.max(minZoom,fit));zoom=Math.min(baselineZoom,preferredZoom,Math.max(minZoom,Math.min(preferredZoom,frame.width/(right-left),frame.height/(lower-upper))));
   }
   else if(frame){const minZoom=h<550?.28:.4,pad=p.r+12,bodyLimit=Math.max(minZoom,Math.min(frame.width,frame.height)/(pad*2));baselineZoom=Math.min(normalZoom,bodyLimit);zoom=Math.min(preferredZoom,bodyLimit);}
   if(!menu&&zoom<baselineZoom)zoom=this.limitZoomOut(state,zoom,baselineZoom,tx,ty,frame);
   if(!menu){const offX=Math.abs(tx-p.x)+(frame?Math.abs(frame.left+frame.width*.5-w*.5):0)/zoom,offY=Math.abs(ty-p.y)+(frame?Math.abs(frame.top+frame.height*.5-h*.5):0)/zoom;
    this.viewHalf=[w*.5/zoom+offX,h*.5/zoom+offY];
    const reach=Number(options.reach);if(reach>0){const need=Math.max((w*.5)/Math.max(1,reach-offX-60),(h*.5)/Math.max(1,reach-offY-60));if(zoom<need)zoom=need;}}
   if(frame){tx-=(frame.left+frame.width*.5-w*.5)/zoom;ty-=(frame.top+frame.height*.5-h*.5)/zoom;}
   const focus=!menu&&(!!boss||(p.hurt||0)>.03||(state.organisms||[]).some(o=>!o.dead&&MorphosGame.isHostile(o)&&(o.chasing||o.windup>0||o.lungeTime>0)&&Math.hypot(o.x-p.x,o.y-p.y)<400+o.r))?1:0;
   if(reset)this.sceneFocus=focus;else if(!frozen)this.sceneFocus+=(focus-this.sceneFocus)*(1-Math.exp(-dt*3));
   const detail=(quality-.5)*2;this.decorDensity=(.45+.55*detail)*(1-this.sceneFocus*.2);this.moteDensity=(.45+.55*detail)*(1-this.sceneFocus*.5);
   if(reset){this.camera.x=tx;this.camera.y=ty;this.camera.zoom=zoom;this.started=true;this.paletteWeights=[0,0,0];this.paletteWeights[this.biome]=1;}else if(!frozen){this.camera.x=tx;this.camera.y=ty;this.camera.zoom+=(zoom-this.camera.zoom)*(1-Math.exp(-dt*(boss&&zoom<this.camera.zoom?5.5:2.4)));const blend=1-Math.exp(-dt*.8);for(let i=0;i<3;i++)this.paletteWeights[i]+=((i===this.biome?1:0)-this.paletteWeights[i])*blend;}
   // Easing can lag behind a moving streamed edge. Limit the actual additional
   // zoom-out too, while retaining the same world point in the usable area.
   if(!menu&&this.manualZoomOut&&(reset||!frozen)&&this.camera.zoom<baselineZoom){const current=this.camera,z=current.zoom,ox=frame?frame.left+frame.width*.5-w*.5:0,oy=frame?frame.top+frame.height*.5-h*.5:0,limited=this.limitZoomOut(state,z,baselineZoom,current.x+ox/z,current.y+oy/z,frame);if(limited>z){current.x+=ox*(1/z-1/limited);current.y+=oy*(1/z-1/limited);current.zoom=limited;}}
   if(viewZoom>=1&&this.camera.zoom>=baselineZoom-1e-6)this.manualZoomOut=false;
   // The HUD and renderer share one usable rectangle; the player's whole body takes priority.
   if(frame&&(reset||!frozen)){const z=this.camera.zoom,pad=p.r+12,xMin=p.x+pad+(w*.5-frame.left-frame.width)/z,xMax=p.x-pad+(w*.5-frame.left)/z,yMin=p.y+pad+(h*.5-frame.top-frame.height)/z,yMax=p.y-pad+(h*.5-frame.top)/z;this.camera.x=xMin<=xMax?clamp(this.camera.x,xMin,xMax):p.x-(frame.left+frame.width*.5-w*.5)/z;this.camera.y=yMin<=yMax?clamp(this.camera.y,yMin,yMax):p.y-(frame.top+frame.height*.5-h*.5)/z;}
   this.playArea=frame;
   this.currentPalette={};for(const key of ['deep','light','fluid','plant','edge'])this.currentPalette[key]=[0,1,2].map(channel=>palettes.reduce((sum,pal,i)=>sum+pal[key][channel]*this.paletteWeights[i],0));
   const cam=this.camera;this.cull={left:cam.x-w*.5/cam.zoom,right:cam.x+w*.5/cam.zoom,top:cam.y-h*.5/cam.zoom,bottom:cam.y+h*.5/cam.zoom};
   c.setTransform(this.dpr,0,0,this.dpr,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';this.background(state,time);
   c.save();c.translate(w*.5,h*.5);c.scale(cam.zoom,cam.zoom);c.translate(-cam.x,-cam.y);
   this.drawScenery(state,time);this.drawLandmarks(state,time,!menu);if(!menu)this.drawTasks(state,time);this.waterMotes(state,time);
   for(const hazard of state.hazards||[])this.drawHazard(hazard,time);
   const foodGrow=Math.pow(Math.max(1,(state.player&&state.player.sizeScale)||1),.45);const born=this._foodBorn||(this._foodBorn=new Map());if(born.size>6000){const keep=new Map();for(const f of state.foods||[])if(born.has(f.id))keep.set(f.id,born.get(f.id));this._foodBorn=keep;}
   for(const f of state.foods||[]){let b0=this._foodBorn.get(f.id);if(b0===undefined||b0>time){b0=time;this._foodBorn.set(f.id,b0);}if(!this.visible(f,15*foodGrow))continue;const r=(f.r||4)*3.2*foodGrow*Math.min(1,.15+(time-b0)/.45),drift=Math.sin(time*1.3+(f.phase||0))*.7;c.drawImage(this.foodSprites[f.kind]||this.foodSprites.algae,f.x-r,f.y-r+drift,r*2,r*2);}
   if(!menu){this.drawAbilities(state,time);this.drawCombatGuide(state,options.aim);if(options.venomAim)this.drawVenomAim(state,options.venomAim);this.drawBroodLinks(state,time);this.drawBossTelegraph(state,time);}
   for(const o of state.organisms||[]){this.drawOrganism(o,state,time);if(o.quakeWind>0&&this.visible(o,o.r*3)){const z=this.camera.zoom,reach=o.r+170*Math.sqrt(o.scale||1),k=clamp(1-o.quakeWind/1.15,0,1),c=this.ctx;c.save();c.beginPath();c.arc(o.x,o.y,reach,0,TAU);c.fillStyle=`rgba(255,214,168,${.04+.1*k})`;c.fill();c.strokeStyle=`rgba(255,214,168,${.3+.5*k})`;c.lineWidth=(1.4+2*k)/z;c.setLineDash([10/z,8/z]);c.stroke();c.setLineDash([]);c.beginPath();c.arc(o.x,o.y,o.r+(reach-o.r)*(1-k),0,TAU);c.strokeStyle=`rgba(255,214,168,${.5*k})`;c.lineWidth=2/z;c.stroke();c.restore();}}
   if(!menu&&(state.brood||[]).length){const co=mix(this.playerColour(p),[245,214,140],.35);for(const b of state.brood)if(this.visible(b,30))this.drawBroodling(b,co,time);}
   if(!menu)for(const o of state.organisms||[]){if(o.dead||!(o.venomStacks>0)||!this.visible(o,30))continue;const n=o.venomStacks,w=Math.min(o.r*1.6,n*7);for(let i=0;i<n;i++){const x=o.x-w/2+(n>1?i*w/(n-1):w/2),y=o.y-o.r-9;c.beginPath();c.arc(x,y,2.2,0,TAU);c.fillStyle='rgba(190,240,100,.85)';c.fill();}}
   // A creature big enough to swallow you whole carries a flashing red mark: one bite from it ends you.
   if(!menu)for(const o of state.organisms||[]){if(o.dead||!MorphosGame.canSwallow(o,p)||!this.visible(o,40))continue;const z=this.camera.zoom,beat=this.reducedMotion?1:.5+.5*Math.sin(wall*7),s=1+.12*beat;c.save();c.translate(o.x,o.y);c.scale(s/z,s/z);c.globalAlpha=.55+.45*beat;c.beginPath();c.arc(0,0,11,0,TAU);c.fillStyle='rgba(60,10,16,.85)';c.fill();c.lineWidth=1.5;c.strokeStyle='#ff8b91';c.stroke();c.fillStyle='#ffb3b0';c.font='700 15px "Helvetica Neue",Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('!',0,1);c.restore();}
   if(!menu){this.drawBoss(state,time);this._peerDraw=true;for(const q of options.peers||[]){c.save();try{this.drawPeer(q,p,time);}catch{}c.restore();c.globalAlpha=1;}this._peerDraw=false;this.drawPlayer(p,time);this.drawShell(p,time);}
   this.drawDrops(state,time);this.drawEffects(state,time);if(!menu)this.pointer(options.aim,p,time);
   c.restore();
   // Gentle lens falloff keeps the arena luminous and the HUD readable.
   c.drawImage(this._vignetteSprite(w,h),0,0,w,h);
   // Dark water and an approaching legendary close the light in from the edges.
   // The deeper the water, the less light reaches it: the edges of the view close in from The Reaches down to The Trench.
   if(!menu){let dark=Math.max(state.pondEvent&&state.pondEvent.type==='darkwater'?.62:0,clamp((MorphosGame.waterLevel(p.x,p.y)-5)*.02,0,.5));for(const o of state.organisms){if(o.dead||!o.species||MorphosGame.SPECIES[o.species]?.rarity!=='legendary')continue;dark=Math.max(dark,clamp((2000-Math.hypot(o.x-p.x,o.y-p.y))/1200,0,1)*.42);}
    this._dark=(this._dark||0)+(dark-(this._dark||0))*.04;if(this._dark>.01){const dl=Math.hypot(p.x,p.y),depthK=clamp((MorphosGame.waterLevel(p.x,p.y)-5)*.04,0,1),tx=dl>1?-p.x/dl*depthK:0,ty=dl>1?-p.y/dl*depthK:0;this._ux=(this._ux||0)+(tx-(this._ux||0))*.05;this._uy=(this._uy||0)+(ty-(this._uy||0))*.05;const ux=this._ux,uy=this._uy,cx=w*.5+ux*w*.2,cy=h*.5+uy*h*.2,g=c.createRadialGradient(cx,cy,Math.min(w,h)*.16,cx,cy,Math.max(w,h)*.62);g.addColorStop(0,'rgba(1,5,10,0)');g.addColorStop(1,`rgba(1,5,10,${this._dark})`);c.fillStyle=g;c.fillRect(0,0,w,h);
     // A faint wash of light from the side the shallows lie on.
     const ex=w*.5+ux*w*.5,ey=h*.5+uy*h*.5,lg=c.createLinearGradient(ex,ey,w*.5,h*.5);lg.addColorStop(0,`rgba(150,215,200,${(.11*Math.min(this._dark,.5)/.5*Math.hypot(ux,uy)).toFixed(3)})`);lg.addColorStop(1,'rgba(150,215,200,0)');c.fillStyle=lg;c.fillRect(0,0,w,h);}}
   // The Kraken's ink: the water goes black beyond a short distance from you, and its eyes glow through the dark.
   if(!menu){const kb=state.bossEncounter,target=kb&&kb.inkTime>0?Math.min(1,kb.inkTime/1.2):0;this._ink=(this._ink||0)+(target-(this._ink||0))*.08;
    if(this._ink>.01){const z=this.camera.zoom,px=(p.x-this.camera.x)*z+w*.5,py=(p.y-this.camera.y)*z+h*.5,near=Math.max(90,p.r*z*2.6),g=c.createRadialGradient(px,py,near,px,py,near*2.6);g.addColorStop(0,'rgba(4,3,9,0)');g.addColorStop(1,`rgba(4,3,9,${.97*this._ink})`);c.fillStyle=g;c.fillRect(0,0,w,h);
     if(kb&&kb.hp>0){const ca=Math.cos(kb.angle||0),sa=Math.sin(kb.angle||0);for(const side of [-1,1]){const ex=kb.x+ca*kb.r*.36-sa*side*kb.r*.36,ey=kb.y+sa*kb.r*.36+ca*side*kb.r*.36,sx=(ex-this.camera.x)*z+w*.5,sy=(ey-this.camera.y)*z+h*.5,er=Math.max(4,kb.r*z*.13),eg=c.createRadialGradient(sx,sy,0,sx,sy,er*2.2);eg.addColorStop(0,`rgba(252,238,170,${.95*this._ink})`);eg.addColorStop(.45,`rgba(250,226,140,${.5*this._ink})`);eg.addColorStop(1,'rgba(250,226,140,0)');c.fillStyle=eg;c.fillRect(sx-er*2.2,sy-er*2.2,er*4.4,er*4.4);}}}}
   if(menu)this.menuSpecimen(state,wall);
   if((p.hurt||0)>.03&&!menu){c.fillStyle=`rgba(189,53,77,${clamp(p.hurt*.05,0,.07)})`;c.fillRect(0,0,w,h);}
  }
 }
 MorphosRenderer.PEER_COLOURS=['#d6eda2','#84d9e8','#f3aa84','#c5aceb','#f0d48c','#f29bc1','#9fb4ff','#8fe3b0'];
 window.MorphosRenderer=MorphosRenderer;
})();
