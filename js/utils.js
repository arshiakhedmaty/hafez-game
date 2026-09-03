/* utils.js : small helpers used everywhere */
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a=1,b=0)=>b+Math.random()*(a-b);
const rndi=(a,b)=>Math.floor(rnd(b+1,a));
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
const aabb=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const approach=(v,t,d)=>v<t?Math.min(v+d,t):Math.max(v-d,t);
const easeOut=t=>1-Math.pow(1-t,3);
const easeIn=t=>t*t*t;
const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const fmtTime=s=>{const m=Math.floor(s/60),r=s-m*60;return m+':'+(r<10?'0':'')+r.toFixed(2);};

/* rounded rect path */
function rr(c,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  c.beginPath();
  c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}
/* filled + inked shape helper (cel-shaded look) */
function ink(c,fill,lw=2,stroke=PAL.ink){
  if(fill){c.fillStyle=fill;c.fill();}
  if(lw>0){c.lineWidth=lw;c.strokeStyle=stroke;c.lineJoin='round';c.stroke();}
}
function ell(c,x,y,rx,ry,rot=0){c.beginPath();c.ellipse(x,y,Math.abs(rx),Math.abs(ry),rot,0,Math.PI*2);}
function poly(c,pts){c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();}

/* deterministic pseudo-random from a seed (stable scenery) */
function srand(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

/* text helpers -------------------------------------------------- */
function txt(c,s,x,y,{size=20,font=FONT.body,align='center',base='middle',fill=PAL.parch,stroke=null,lw=4,shadow=0,letter=0}={}){
  c.save();
  c.font=size+'px '+font;c.textAlign=align;c.textBaseline=base;
  if(c.letterSpacing!==undefined)c.letterSpacing=letter+'px';
  if(shadow){c.fillStyle='rgba(0,0,0,0.5)';c.fillText(s,x+shadow,y+shadow);}
  if(stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.lineJoin='round';c.strokeText(s,x,y);}
  c.fillStyle=fill;c.fillText(s,x,y);
  c.restore();
}
const FONT={
  title:'"Rye","Smokum",Georgia,serif',
  wood :'"Rye",Georgia,serif',
  body :'"Special Elite","Courier New",monospace',
  ui   :'"Special Elite","Courier New",monospace'
};
