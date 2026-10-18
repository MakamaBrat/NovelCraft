/* Unity 2D Editor — Web Player. Самостоятельный рантайм для экспортированной игры (без зависимостей).
   Блоки отрисовки текста и градиента подставляются сборщиком (tools/build_player.py) из text.js и gradient.js редактора — вид идентичен. */
(()=>{
'use strict';
const TAU=Math.PI/180,PPU=100;
const rd=v=>Math.round(v*1000)/1000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const $=s=>document.querySelector(s);

/* ================= данные ================= */
let G=null,objs=[],omap=new Map(),kids=new Map(),roots=[];
const amap=new Map(),CL=new Map(),CT=new Map();
const ast=id=>amap.get(id),get=id=>omap.get(id);
const ppuOf=a=>((a&&a.parent?ast(a.parent):a)||{}).ppu||PPU;

/* ================= подставляемый код редактора ================= */
{
const DEF='"Segoe UI",Arial,sans-serif',PX=PPU;       // 1 юнит сцены = PPU пикселей текста
const mc=document.createElement('canvas').getContext('2d');

window.mkText=()=>({str:'New Text',font:null,size:32,style:'normal',lsp:1,ls:0,ha:'center',va:'middle',
  rich:true,wrap:true,trunc:true,fit:false,min:10,max:40,color:'#ffffff',alpha:1,ol:false,olc:'#000000',olw:2,w:3,h:1});

const famOf=t=>{const a=t.font!=null&&ast(t.font);return a&&a.font?`"${a.family}",${DEF}`:DEF};
const fontStr=(t,sz,b,i)=>`${i||/italic/.test(t.style)?'italic ':''}${b||/bold/.test(t.style)?'bold ':''}${sz}px ${famOf(t)}`;
const setLS=(c,t)=>{try{c.letterSpacing=(+t.ls||0)+'px'}catch(e){}};

/* ---------- Rich Text: <b> <i> <color=#rrggbb[aa] | red> <size=40 | 150%> (как в Unity) ---------- */
const NAMED={aqua:'#00ffff',black:'#000000',blue:'#0000ff',brown:'#a52a2a',cyan:'#00ffff',darkblue:'#0000a0',fuchsia:'#ff00ff',green:'#008000',grey:'#808080',gray:'#808080',
  lightblue:'#add8e6',lime:'#00ff00',magenta:'#ff00ff',maroon:'#800000',navy:'#000080',olive:'#808000',orange:'#ffa500',purple:'#800080',red:'#ff0000',silver:'#c0c0c0',teal:'#008080',white:'#ffffff',yellow:'#ffff00'};
function parseCol(v){
  v=String(v||'').trim().replace(/^["']|["']$/g,'').toLowerCase();
  if(NAMED[v])return NAMED[v];
  const m=/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);if(!m)return null;
  let h=m[1];if(h.length<=4)h=h.replace(/./g,c=>c+c);
  if(h.length==6)return'#'+h;
  return`rgba(${parseInt(h.substr(0,2),16)},${parseInt(h.substr(2,2),16)},${parseInt(h.substr(4,2),16)},${Math.round(parseInt(h.substr(6,2),16)/255*1000)/1000})`}
// строка -> [{s,st}], st = {b,i,sz,szp,col}; неизвестные/незакрытые теги остаются обычным текстом
function parseRich(src,rich){
  src=String(src==null?'':src);const base={b:false,i:false,sz:null,szp:null,col:null};
  if(!rich)return[{s:src,st:base}];
  const out=[],stack=[],re=/<(\/?)(b|i|color|size)(?:=([^<>]*))?>/iy;let cur=base,i=0,buf='';
  const flush=()=>{if(buf){out.push({s:buf,st:cur});buf=''}};
  const open=(tag,patch,len)=>{flush();stack.push({tag,prev:cur});cur={...cur,...patch};i+=len};
  while(i<src.length){
    if(src[i]=='<'){re.lastIndex=i;const m=re.exec(src);
      if(m){const tag=m[2].toLowerCase(),val=m[3],len=m[0].length;
        if(m[1]){if(val===undefined){const k=stack.map(x=>x.tag).lastIndexOf(tag);if(k>=0){flush();cur=stack[k].prev;stack.length=k;i+=len;continue}}}
        else if(tag=='b'||tag=='i'){if(val===undefined){open(tag,{[tag]:true},len);continue}}
        else if(tag=='color'){const c=val!==undefined&&parseCol(val);if(c){open(tag,{col:c},len);continue}}
        else if(val!==undefined){const n=parseFloat(val);if(n>0&&/^\s*[\d.]+\s*%?\s*$/.test(val)){open(tag,/%/.test(val)?{szp:n,sz:null}:{sz:n,szp:null},len);continue}}}}
    buf+=src[i++]}
  flush();return out}

/* ---------- раскладка (по сегментам с разным стилем) ---------- */
const LC=new WeakMap();
function layout(t){
  const key=[t.str,t.rich,t.wrap,t.fit,t.min,t.max,t.size,t.style,t.lsp,t.ls,t.w,t.h,famOf(t)].join('\u0001'),c=LC.get(t);if(c&&c.key===key)return c.r;
  const r=layout_(t);LC.set(t,{key,r});return r}
function layout_(t){
  const W=Math.max(1,t.w*PX),H=Math.max(1,t.h*PX),ls=t.lsp==null?1:+t.lsp,bs=Math.max(1,+t.size||1),runs=parseRich(t.str,t.rich!==false);
  const run=sz=>{
    const wrap=t.wrap||t.fit,k=t.fit?sz/bs:1,                       // при Best Fit размеры из <size=N> масштабируются вместе со шрифтом
      szOf=st=>st.szp!=null?sz*st.szp/100:st.sz!=null?Math.max(1,st.sz*k):sz,cache=new Map();
    const mw=(s,st)=>{const f=fontStr(t,szOf(st),st.b,st.i),key=f+'\u0001'+s;let w=cache.get(key);
      if(w===undefined){mc.font=f;setLS(mc,t);w=mc.measureText(s).width;cache.set(key,w)}return w};
    // слова (могут состоять из нескольких сегментов: Hel<b>lo</b>), пробелы и переводы строк
    const items=[];let word=null;const pushWord=()=>{if(word){items.push(word);word=null}};
    for(const r of runs){let seg='';
      const fs=()=>{if(seg){(word||(word={t:'w',segs:[]})).segs.push({s:seg,st:r.st});seg=''}};
      for(const ch of r.s){if(ch=='\r')continue;
        if(ch=='\n'){fs();pushWord();items.push({t:'nl'})}
        else if(ch==' '){fs();pushWord();items.push({t:'sp',st:r.st})}
        else seg+=ch}
      fs()}
    pushWord();
    const lines=[];let line={segs:[],w:0,wr:false};
    const add=(s,st,w)=>{const l=line.segs[line.segs.length-1];if(l&&l.st===st){l.s+=s;l.w+=w}else line.segs.push({s,st,w});line.w+=w};
    const trim=()=>{let l;while((l=line.segs[line.segs.length-1])&&!l.s.trim())line.segs.pop();if(l)l.s=l.s.replace(/ +$/,'');line.w=line.segs.reduce((a,x)=>a+mw(x.s,x.st),0)};
    const end=wr=>{trim();lines.push(line);line={segs:[],w:0,wr:!!wr}};
    for(const it of items){
      if(it.t=='nl'){end();continue}
      if(it.t=='sp'){if(!(line.wr&&!line.segs.length))add(' ',it.st,mw(' ',it.st));continue}
      const ww=it.segs.reduce((a,x)=>a+mw(x.s,x.st),0);
      if(!wrap||line.w+ww<=W+1e-6){it.segs.forEach(x=>add(x.s,x.st,mw(x.s,x.st)));continue}
      trim();if(line.segs.length)end(true);
      if(ww<=W){it.segs.forEach(x=>add(x.s,x.st,mw(x.s,x.st)));continue}
      for(const x of it.segs)for(const ch of x.s){const cw=mw(ch,x.st);if(line.segs.length&&line.w+cw>W)end(true);add(ch,x.st,cw)}}   // слишком длинное слово — по символам
    end();
    let total=0;
    lines.forEach(l=>{l.w=0;l.sz=sz;let mx=0;
      l.segs.forEach(q=>{q.w=mw(q.s,q.st);l.w+=q.w;mx=Math.max(mx,szOf(q.st))});
      if(mx)l.sz=mx;l.lh=l.sz*1.2*ls;total+=l.lh});
    return{size:sz,L:lines,total,szOf}};
  if(!t.fit)return run(bs);
  let a=Math.max(1,Math.floor(Math.min(t.min,t.max))),b=Math.max(a,Math.floor(Math.max(t.min,t.max))),best=a;
  while(a<=b){const m=(a+b)>>1,q=run(m);if(q.total<=H){best=m;a=m+1}else b=m-1}
  return run(best)}

/* ---------- рисование (вызывается из render() в локальных осях объекта, y вниз, единицы сцены) ---------- */
window.drawText=(g,t,v)=>{
  g.scale(1/PX,1/PX);                                // дальше — пиксели текста
  const W=t.w*PX,H=t.h*PX,r=layout(t);let L=r.L;
  if(!t.fit&&t.trunc){let acc=0,n=0;for(const l of L){if(acc+l.lh>H+1e-3*l.lh)break;acc+=l.lh;n++}L=L.slice(0,n)}
  if(!L.length)return;
  const block=L.reduce((a,l)=>a+l.lh,0),top=t.va=='top'?-H/2:t.va=='bottom'?H/2-block:-block/2;
  g.textAlign='left';g.textBaseline='middle';g.lineJoin='round';
  const alpha=v.alpha==null?1:v.alpha,out=t.ol&&t.olw>0;let y=top;
  for(const l of L){
    const baseY=y+l.lh/2+.35*l.sz;                   // общая базовая линия: куски разного размера выравниваются по ней
    let x=t.ha=='left'?-W/2:t.ha=='right'?W/2-l.w:-l.w/2;
    for(const q of l.segs){
      const sz=r.szOf(q.st),yy=baseY-.35*sz;
      g.font=fontStr(t,sz,q.st.b,q.st.i);setLS(g,t);g.globalAlpha=alpha;
      if(out){g.strokeStyle=t.olc;g.lineWidth=t.olw*2;g.strokeText(q.s,x,yy)}
      g.fillStyle=q.st.col||v.color||'#fff';g.fillText(q.s,x,yy);x+=q.w}
    y+=l.lh}
  g.globalAlpha=1};


}
{
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hex=h=>{h=/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';return[1,3,5].map(i=>parseInt(h.substr(i,2),16))};
const rgba=(c,a)=>{const[r,g,b]=hex(c);return`rgba(${r},${g},${b},${rd(clamp(a==null?1:a,0,1))})`};

window.mkGrad=()=>({type:'linear',angle:90,w:2,h:2,alpha:1,
  stops:[{p:0,c:'#ff4081',a:.85},{p:1,c:'#3d5afe',a:.25}],
  pattern:'none',pmode:'cut',pscale:.25,pangle:0,pthick:.5,pstr:1,pcol:'#ffffff',pinv:false});

const PATTERNS=[['none','None'],['stripes','Stripes (полосы)'],['dots','Dots (точки)'],['checker','Checker (шахматка)'],['grid','Grid (сетка)'],
  ['waves','Waves (волны)'],['diamonds','Diamonds (ромбы)'],['triangles','Triangles (треугольники)'],['plus','Plus (кресты)']];

/* ---------- узоры: Path2D из НЕперекрывающихся фигур (чтобы работали Invert и even-odd) ---------- */
const pcache=new Map();
function buildPath(kind,w,h,s,ang,th){
  const R=Math.hypot(w,h)/2+s,P=new Path2D(),n=Math.ceil(R/s)+1,t=clamp(th,.05,.95);
  const rect=(x,y,a,b)=>P.rect(x,y,a,b);
  const poly=pts=>{P.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)P.lineTo(pts[i][0],pts[i][1]);P.closePath()};
  if(kind=='stripes'){for(let i=-n;i<=n;i++)rect(-R,i*s,2*R,s*t)}
  else if(kind=='dots'){const r=s*t/2;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;P.moveTo(x+r,y);P.arc(x,y,r,0,Math.PI*2)}}
  else if(kind=='checker'){for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++)if(((i+j)&1)==0)rect(i*s,j*s,s,s)}
  else if(kind=='grid'){const lw=Math.max(s*t*.5,s*.02),gap=s-lw;                     // горизонтали на всю ширину, вертикали — только между ними (без наложения)
    for(let j=-n;j<=n;j++){rect(-R,j*s,2*R,lw);for(let i=-n;i<=n;i++)rect(i*s,j*s+lw,lw,gap)}}
  else if(kind=='waves'){const amp=s*.25,step=Math.max(s/8,.004),len=Math.ceil(2*R/step);
    for(let j=-n;j<=n;j++){const y0=j*s,f=x=>y0+Math.sin(x/s*Math.PI*2)*amp,top=[],bot=[];
      for(let k=0;k<=len;k++){const x=-R+k*step;top.push([x,f(x)]);bot.push([x,f(x)+s*t])}
      poly(top.concat(bot.reverse()))}}
  else if(kind=='diamonds'){const r=s*t/2;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;poly([[x,y-r],[x+r,y],[x,y+r],[x-r,y]])}}
  else if(kind=='triangles'){const b=s*t;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;poly([[x,y-b/2],[x+b/2,y+b/2],[x-b/2,y+b/2]])}}
  else if(kind=='plus'){const a=s*t/2,c=a/3;for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*s+s/2,y=j*s+s/2;
    poly([[x-c,y-a],[x+c,y-a],[x+c,y-c],[x+a,y-c],[x+a,y+c],[x+c,y+c],[x+c,y+a],[x-c,y+a],[x-c,y+c],[x-a,y+c],[x-a,y-c],[x-c,y-c]])}}
  const out=new Path2D();out.addPath(P,new DOMMatrix().rotate(ang));return out}
function patPath(G,w,h){
  // не даём создать слишком много фигур
  const R=Math.hypot(w,h)/2,s=Math.max(+G.pscale||.25,R/45),key=[G.pattern,rd(w),rd(h),rd(s),rd(+G.pangle||0),rd(G.pthick)].join('|');
  let p=pcache.get(key);
  if(!p){if(pcache.size>40)pcache.clear();p=buildPath(G.pattern,w,h,s,+G.pangle||0,G.pthick==null?.5:G.pthick);pcache.set(key,p)}
  return p}

/* ---------- заливка ---------- */
function paint(g,G,w,h){
  const st=(G.stops&&G.stops.length?G.stops.slice():[{p:0,c:'#ffffff',a:1},{p:1,c:'#ffffff',a:0}]).sort((a,b)=>a.p-b.p);
  const a=(+G.angle||0)*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a);let gr;
  if(G.type=='radial')gr=g.createRadialGradient(0,0,0,0,0,Math.max(Math.hypot(w,h)/2,1e-6));
  else if(G.type=='conic'&&g.createConicGradient)gr=g.createConicGradient(a,0,0);
  else{const L=(Math.abs(w*dx)+Math.abs(h*dy))/2;gr=g.createLinearGradient(-dx*L,-dy*L,dx*L,dy*L)}
  st.forEach(s=>gr.addColorStop(clamp(s.p,0,1),rgba(s.c,s.a)));return gr}

// вызывается из render() в локальных осях объекта (y вниз, единицы сцены)
window.drawGrad=(g,G,w,h)=>{
  const A=clamp(G.alpha==null?1:G.alpha,0,1);if(A<=0)return;
  const x=-w/2,y=-h/2,fill=paint(g,G,w,h),pat=G.pattern&&G.pattern!='none'?patPath(G,w,h):null,str=clamp(G.pstr==null?1:G.pstr,0,1);
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle=fill;
  if(!pat){g.globalAlpha=A;g.fillRect(x,y,w,h)}
  else{
    const inv=new Path2D();inv.rect(x-1e3,y-1e3,w+2e3,h+2e3);inv.addPath(pat);        // «всё, кроме узора» (even-odd)
    const inside=G.pinv?inv:pat,outside=G.pinv?pat:inv;
    if(G.pmode=='over'){                                                                // узор поверх градиента
      g.globalAlpha=A;g.fillRect(x,y,w,h);
      g.globalAlpha=A*str;g.fillStyle=G.pcol||'#ffffff';g.fill(inside,G.pinv?'evenodd':'nonzero')}
    else{                                                                               // градиент проступает сквозь узор
      g.save();g.clip(inside,G.pinv?'evenodd':'nonzero');g.globalAlpha=A;g.fillRect(x,y,w,h);g.restore();
      if(str<1){g.save();g.clip(outside,G.pinv?'nonzero':'evenodd');g.globalAlpha=A*(1-str);g.fillRect(x,y,w,h);g.restore()}}}
  g.restore();g.globalAlpha=1};


}

/* ================= матрицы (как в редакторе) ================= */
const pureMask=o=>!!(!o.img&&!o.text&&!o.grad&&!o.screen&&(o.scrollv||o.mask||o.layout));
const locM=o=>{const nsc=pureMask(o),X=nsc?1:o.sx,Y=nsc?1:o.sy,c=Math.cos(o.r*TAU),s=Math.sin(o.r*TAU),rx=(o.rx||0)*TAU,ry=(o.ry||0)*TAU,cx=Math.cos(rx),cy=Math.cos(ry),k=Math.sin(rx)*Math.sin(ry);
  return[c*cy*X-s*k*X,s*cy*X+c*k*X,-s*cx*Y,c*cx*Y,o.x,o.y]};
const mulM=(P,L)=>[P[0]*L[0]+P[2]*L[1],P[1]*L[0]+P[3]*L[1],P[0]*L[2]+P[2]*L[3],P[1]*L[2]+P[3]*L[3],P[0]*L[4]+P[2]*L[5]+P[4],P[1]*L[4]+P[3]*L[5]+P[5]];
const invM=M=>{const det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-12)return null;const a=M[3]/det,b=-M[1]/det,c=-M[2]/det,d=M[0]/det;return[a,b,c,d,-(a*M[4]+c*M[5]),-(b*M[4]+d*M[5])]};
const apM=(M,x,y)=>({x:M[0]*x+M[2]*y+M[4],y:M[1]*x+M[3]*y+M[5]});
function wmat(o,dep){dep=dep||0;const p=o.parent!=null&&dep<64?get(o.parent):null;return p?mulM(wmat(p,dep+1),locM(o)):locM(o)}
const worldPos=o=>{const M=wmat(o);return{x:M[4],y:M[5]}};
function toLocal(o,wx,wy){const p=o.parent!=null?get(o.parent):null;if(!p)return{x:wx,y:wy};const I=invM(wmat(p));return I?apM(I,wx,wy):{x:wx,y:wy}}
function order(){const out=[],seen=new Set();
  const walk=(o,d,act,PM)=>{if(seen.has(o.id))return;seen.add(o.id);const on=act&&o.active!==false,lm=PMV.loc(o,locM(o)),M=pinM(o,PM?mulM(PM,lm):lm);out.push({o,d,on,M});const k=kids.get(o.id);if(k)for(const c of k)walk(c,d+1,on,M)};
  for(const o of roots)walk(o,0,true,null);return out}
function subtree(id){const r=[],st=[id],seen=new Set();while(st.length){const i=st.pop();if(seen.has(i))continue;seen.add(i);const o=get(i);if(!o)continue;r.push(o);const k=kids.get(i);if(k)for(const c of k)st.push(c.id)}return r}
function size(o,im){im=im||o.img;if(o.gif&&!o.img&&!o.text&&!o.grad)return GIFX.size(o);if(o.video&&!o.img&&!o.text&&!o.grad)return VIDX.size(o);if(o.webv&&!o.img&&!o.text&&!o.grad)return WEBV.size(o);if(o.reflect&&!o.img&&!o.text&&!o.grad&&!o.scrollv&&!o.mask&&!o.layout)return[Math.max(.1,+o.reflect.w||8),Math.max(.1,+o.reflect.h||4)];if(o.scrollv&&!o.img&&!o.text&&!o.grad)return[Math.max(.1,+o.scrollv.vw||3),Math.max(.1,+o.scrollv.vh||4)];{const r=!o.img&&!o.text&&!o.grad&&(o.mask||o.layout);if(r)return[Math.max(.1,+r.w||3),Math.max(.1,+r.h||3)]}
  if(!o.img&&!o.text&&o.grad)return[Math.max(.01,o.grad.w),Math.max(.01,o.grad.h)];
  if(!o.img&&o.text)return[Math.max(.01,o.text.w),Math.max(.01,o.text.h)];
  const a=im&&im.sprite&&ast(im.sprite);return a&&a.img?[a.img.width/ppuOf(a),a.img.height/ppuOf(a)]:im?[1,1]:[.3,.3]}

/* ================= свойства (анимация пишет сюда) ================= */
const gim=o=>o.img||o.text||o.grad;
const pget=(o,k)=>k=='sprite'?(o.img?o.img.sprite:undefined):k=='fill'?(o.img?(o.img.fa==null?1:o.img.fa):undefined):k=='color'||k=='alpha'?(gim(o)?gim(o)[k]:undefined):(k=='rx'||k=='ry')?(o[k]||0):o[k];
const pset=(o,k,v)=>{if(k=='fill'){if(o.img)o.img.fa=v}else if(k=='sprite'){if(o.img)o.img.sprite=v}else if(k=='color'||k=='alpha'){if(gim(o))gim(o)[k]=v}else o[k]=v};

/* ================= тонированные спрайты (кэш ограничен) ================= */
const tc=new Map();
function tint(a,col){if(col=='#ffffff')return a.img;const k=a.id+col;let c=tc.get(k);if(c)return c;
  if(tc.size>96)tc.clear();
  c=document.createElement('canvas');c.width=a.img.width;c.height=a.img.height;const x=c.getContext('2d');x.drawImage(a.img,0,0);
  x.globalCompositeOperation='multiply';x.fillStyle=col;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';x.drawImage(a.img,0,0);tc.set(k,c);return c}

/* ================= Image: Simple / Filled (общий код с редактором: imgfill.js) ================= */
/*IMGFILL-BEGIN*/
const FILL_OR={h:['Left','Right'],v:['Bottom','Top'],r90:['Bottom Left','Top Left','Top Right','Bottom Right'],r180:['Bottom','Left','Top','Right'],r360:['Bottom','Right','Top','Left']};
/* Область заливки в локальных координатах объекта (ось Y вниз, прямоугольник −w/2…w/2 × −h/2…h/2) → clip.
   false — заливать нечего (Fill Amount = 0). Радиальные: «клин» от точки-источника, обрезается самой картинкой. */
function fillClip(gx,w,h,im){
  const a=Math.max(0,Math.min(1,im.fa==null?1:im.fa)),m=FILL_OR[im.fm]?im.fm:'h',n=FILL_OR[m].length,o=(im.fo|0)>=0&&(im.fo|0)<n?(im.fo|0):0,cw=im.fc!==false,hw=w/2,hh=h/2;
  if(a<=0)return false;
  gx.beginPath();
  if(a>=1){gx.rect(-hw,-hh,w,h);gx.clip();return true}
  if(m=='h'){const q=w*a;o?gx.rect(hw-q,-hh,q,h):gx.rect(-hw,-hh,q,h)}
  else if(m=='v'){const q=h*a;o?gx.rect(-hw,-hh,w,q):gx.rect(-hw,hh-q,w,q)}
  else{
    // углы на экране: 0° — вправо, 90° — вниз, угол растёт по часовой стрелке
    let ox,oy,t0,rg;
    if(m=='r90'){[ox,oy]=[[-hw,hh],[-hw,-hh],[hw,-hh],[hw,hh]][o];t0=[-90,0,90,180][o];rg=90}
    else if(m=='r180'){[ox,oy]=[[0,hh],[-hw,0],[0,-hh],[hw,0]][o];t0=[180,-90,0,90][o];rg=180}
    else{ox=oy=0;t0=[90,0,-90,180][o];rg=360}
    if(!cw&&m!='r360')t0+=rg;                      // против часовой: начинаем с другого ребра сектора
    const D=Math.PI/180,R=Math.hypot(w,h)*2,s0=t0*D,s1=s0+(cw?1:-1)*a*rg*D;
    gx.moveTo(ox,oy);gx.lineTo(ox+Math.cos(s0)*R,oy+Math.sin(s0)*R);gx.arc(ox,oy,R,s0,s1,!cw);gx.closePath()}
  gx.clip();return true}
/* Нарисовать Image (Simple или Filled) в локальных координатах объекта */
function drawImg(gx,im,w,h){
  const a=im.sprite&&ast(im.sprite),fl=im.type=='filled';
  if(fl){gx.save();if(!fillClip(gx,w,h,im)){gx.restore();return}}
  gx.globalAlpha=im.alpha;
  if(a&&a.img)gx.drawImage(tint(a,im.color),-w/2,-h/2,w,h);else{gx.fillStyle=im.color;gx.fillRect(-w/2,-h/2,w,h)}
  gx.globalAlpha=1;if(fl)gx.restore()}
/*IMGFILL-END*/

/* ================= Animator (порт логики редактора) ================= */
const EPS=5e-4;let C=null,RMAP=null;
const base=new Map();
const colHex=h=>/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';
const rgb=h=>{h=colHex(h);return[1,3,5].map(i=>parseInt(h.substr(i,2),16))};
const lerpCol=(a,b,u)=>{const A=rgb(a),B=rgb(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*u).toString(16).padStart(2,'0')).join('')};
const clipOf=s=>s&&s.clip!=null?CL.get(s.clip):null;
const def=()=>{const t=C.tr.find(t=>t.f=='entry');return t&&t.t};
const nd=id=>C.st.find(n=>n.id==id);
function evalTrack(tr,t){
  const K=tr.keys;if(!K.length)return undefined;
  if(t<=K[0].t)return K[0].v;
  const L=K[K.length-1];if(t>=L.t)return L.v;
  let i=0;while(K[i+1].t<=t)i++;
  const a=K[i],b=K[i+1];
  if(tr.k=='sprite'||a.i=='c')return a.v;
  let u=(t-a.t)/(b.t-a.t);if(a.i=='s')u=u*u*(3-2*u);
  return tr.k=='color'?lerpCol(a.v,b.v,u):a.v+(b.v-a.v)*u}
const splitK=key=>{const i=key.indexOf('.');return{o:get(+key.slice(0,i)),k:key.slice(i+1)}};
function put(o,k,v){const cu=pget(o,k);if(cu===undefined||v===undefined||(typeof v=='number'&&isNaN(v)))return;
  const key=o.id+'.'+k;if(!base.has(key))base.set(key,cu);pset(o,k,k=='alpha'?clamp(v,0,1):v)}
function poseOfClip(c,t){const m=new Map();c.tracks.forEach(tr=>{let oid=tr.o;if(RMAP){const r=RMAP.get(tr.o);if(r!==undefined)oid=r;if(oid<0)return}
  const v=evalTrack(tr,t);if(v!==undefined)m.set(oid+'.'+tr.k,v)});return m}
const clipT=(c,el)=>c.loop?(c.len>0?((el%c.len)+c.len)%c.len:0):clamp(el,0,c.len);
const poseOf=(s,el)=>{const c=clipOf(s);return c?poseOfClip(c,clipT(c,el)):new Map()};
const mix=(k,a,b,w)=>k=='sprite'?(w<.5?a:b):k=='color'?lerpCol(a,b,w):a+(b-a)*w;
function applyPose(A,B,w,own){
  const keys=new Set(A.keys());if(B)B.forEach((_,k)=>keys.add(k));
  keys.forEach(key=>{const{o,k}=splitK(key);if(!o)return;let v=A.get(key);
    if(B){let b=B.get(key);const d=()=>base.has(key)?base.get(key):pget(o,k);
      if(v===undefined)v=d();if(b===undefined)b=d();if(v===undefined||b===undefined)return;v=mix(k,v,b,w)}
    put(o,k,v)});
  own.forEach(key=>{if(keys.has(key))return;own.delete(key);const{o,k}=splitK(key);if(o&&base.has(key))pset(o,k,base.get(key))});
  keys.forEach(key=>own.add(key))}
const chk=c=>{const p=C.pa.find(p=>p.name==c.p);if(!p)return false;if(p.type=='Trigger')return !!p.val;const a=p.type=='Bool'?+!!p.val:+p.val,b=+c.v;return c.op=='>'?a>b:c.op=='<'?a<b:c.op=='=='?a==b:a!=b};
const spd=s=>s.sp==null?1:s.sp;
const stEl=(s,t0,now)=>(now-t0)/1000*spd(s);
const stLen=s=>{const c=clipOf(s);return c?Math.max(c.len,.001):1};
function tickP(p,now){
  let s=nd(p.cur);if(!s)return false;
  if(p.x){const x=p.x,d=nd(x.to);
    if(!d)p.x=null;
    else{const w=x.du>0?(now-x.t0)/1000/x.du:1;
      if(w<1){applyPose(poseOf(s,stEl(s,p.t0,now)),poseOf(d,stEl(d,x.t0,now)),w,p.own);
        const nt=stEl(s,p.t0,now)/stLen(s),c=clipOf(s);p.p=c&&c.loop?((nt%1)+1)%1:clamp(nt,0,1);p.w=w;return true}
      p.cur=x.to;p.t0=x.t0;p.x=null;s=d}}
  p.w=0;
  const el=stEl(s,p.t0,now),nt=el/stLen(s),c=clipOf(s);
  p.p=c&&c.loop?((nt%1)+1)%1:clamp(nt,0,1);
  const ok=t=>{const hasEx=t.hx||!t.cd.length;return(!hasEx||nt>=(t.ex==null?1:t.ex))&&(!t.cd.length||t.cd.every(chk))};
  const t=C.tr.find(t=>t.f!='entry'&&(t.f==p.cur||t.f=='any')&&t.t!=p.cur&&ok(t));
  applyPose(poseOf(s,el),null,0,p.own);
  if(t){t.cd.forEach(c=>{const q=C.pa.find(q=>q.name==c.p);if(q&&q.type=='Trigger')q.val=false});
    const dest=t.t=='exit'?def():t.t;
    if(dest){if(t.du>0)p.x={to:dest,t0:now,du:t.du};else{p.cur=dest;p.t0=now}}}
  return true}
// контроллер может быть вложен под объектом-владельцем: клипы переназначаются на детей владельца по пути в иерархии
const childrenOf=o=>kids.get(o.id)||[];
function rootOf(t,ctlId){for(let o=get(t),g=0;o&&g<64;g++,o=o.parent!=null?get(o.parent):null)if(o.animator&&o.animator.ctl==ctlId)return o;return null}
function pathUnder(root,t){const p=[];let o=get(t),g=0;
  while(o&&o!==root&&g++<64){const par=o.parent!=null?get(o.parent):null;if(!par)return null;p.unshift(childrenOf(par).indexOf(o));o=par}
  return o===root?p:null}
function walkPath(root,p){let o=root;for(const i of p){o=childrenOf(o)[i];if(!o)return null}return o}
function buildRemap(ctl,ownerId){
  const owner=get(ownerId);if(!owner)return null;
  const ids=new Set();ctl.st.forEach(s=>{const c=clipOf(s);if(c)c.tracks.forEach(tr=>{if(get(tr.o))ids.add(tr.o)})});
  if(!ids.size)return null;
  const mine=new Set(subtree(ownerId).map(o=>o.id));
  for(const t of ids)if(mine.has(t))return null;
  const m=new Map();
  ids.forEach(t=>{const r=rootOf(t,ctl.id);if(!r||r===owner)return;
    const path=pathUnder(r,t),x=path&&walkPath(owner,path);m.set(t,x?x.id:-1)});
  return m.size?m:null}
function rtMake(ctl,owner){
  const view={st:ctl.st,tr:ctl.tr,pa:ctl.pa.map(q=>({name:q.name,type:q.type,val:q.type=='Trigger'?false:q.val}))};
  const prev=C;C=view;let d;try{d=def()}finally{C=prev}
  if(!d&&ctl.st.length)d=(ctl.st.find(s=>clipOf(s))||ctl.st[0]).id;
  return{ctl,view,cur:d||null,t0:performance.now(),p:0,x:null,w:0,own:new Set(),map:owner!=null?buildRemap(ctl,owner):null}}
function rtTick(p,now){if(!p.cur)return true;const prev=C,pm=RMAP;C=p.view;RMAP=p.map||null;try{return tickP(p,now)}finally{C=prev;RMAP=pm}}
function rtPlay(p,name){
  const s=p.view.st.find(s=>s.name==name)||p.view.st.find(s=>{const c=clipOf(s);return c&&c.name==name});
  if(!s)return false;p.cur=s.id;p.t0=performance.now();p.x=null;p.w=0;return true}
function rtSet(p,name,val){const q=p.view.pa.find(q=>q.name==name);if(!q)return false;
  q.val=q.type=='Trigger'?true:q.type=='Bool'?!!val:q.type=='Int'?Math.round(+val||0):(+val||0);return true}

// OnDisable: плеер переключается на состояние sid БЕЗ переходов и доигрывает клип один раз
function rtDisable(p,sid,now){
  const s=p.view.st.find(x=>x.id==sid);if(!s)return false;
  p.view={st:p.view.st,tr:[],pa:p.view.pa};
  p.cur=s.id;p.t0=now;p.x=null;p.w=0;p.dis=true;return true}
function rtDone(p,now){
  if(!p.dis)return true;
  const prev=C;C=p.view;
  try{const s=nd(p.cur);if(!s)return true;const c=clipOf(s);if(!c||spd(s)<=0)return true;return stEl(s,p.t0,now)>=Math.max(c.len,0)}
  finally{C=prev}}

/* ================= состояние выполнения ================= */
const PIN=new Map();let PS=null;
function buildPins(){PIN.clear();const P=view.pins;if(!P)return;const AX={l:-1,c:0,r:1},AY={t:1,m:0,b:-1};
  const ST=view.stretch||{};
  for(const k in P){const a=AX[k[1]],b=AY[k[0]];if(a===undefined||b===undefined||!Array.isArray(P[k]))continue;P[k].forEach(id=>PIN.set(id,{x:a,y:b,st:ST[id]=='w'||ST[id]=='h'?ST[id]:null}))}}
/* сдвиг к точке видимой области + (опционально) равномерное растяжение: st 'w' — во сколько раз видимая ширина больше кадра, 'h' — высота.
   Растяжение идёт от точки привязки, пропорции объекта сохраняются; дети едут вместе с родителем через матрицу. */
const pinM=(o,M)=>{const p=PS&&PIN.get(o.id);if(!p)return M;const s=p.st=='w'?PS.sw:p.st=='h'?PS.sh:1;
  if(!p.x&&!p.y&&s==1)return M;M=M.slice();
  if(s==1){M[4]+=p.x*PS.x;M[5]+=p.y*PS.y;return M}
  const ax=view.x+p.x*view.w/2,ay=view.y+p.y*view.h/2;
  M[0]*=s;M[1]*=s;M[2]*=s;M[3]*=s;M[4]=ax+p.x*PS.x+s*(M[4]-ax);M[5]=ay+p.y*PS.y+s*(M[5]-ay);return M};
const run={pl:new Map(),hover:null,down:null};
const ctlOf=t=>t&&t.animator?CT.get(t.animator.ctl):null;
function player(o){
  if(o.active===false||!o.animator)return null;const ctl=ctlOf(o);if(!ctl)return null;
  let p=run.pl.get(o.id);if(!p||p.ctl!==ctl){p=rtMake(ctl,o.id);run.pl.set(o.id,p)}return p}
const setWorld=(o,wx,wy)=>{const L=toLocal(o,wx,wy);o.x=rd(L.x);o.y=rd(L.y)};
/* ---------- SetActive с OnDisable-анимациями (как в редакторе, play.js) ----------
   Объект и его дети выключаются только после того, как доиграют On Disable-состояния всех Animator'ов поддерева. */
/* ---------- компонент Disable FX (ядро — как в редакторе, disfx.js) ---------- */
/*DFXC-BEGIN*/
const DFXC=E=>{
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,d)=>(v!==null&&v!==''&&isFinite(+v))?+v:d;
  const EASES=['bez','lin','in','out','io','back'];
  // 'bez' — своя кривая: es — «разгон» (замедление в начале), ee — «торможение» (замедление в конце), 0..1.
  // Это cubic-bezier с ручками: 0 = ручка лежит на прямой (линейно), 1 = длинная горизонтальная ручка (самое плавное).
  const bez=(es,ee,u)=>{const Ls=.33+.47*es,Le=.33+.47*ee,x1=Ls,y1=Ls*(1-es),x2=1-Le,y2=1-Le*(1-ee);
    let lo=0,hi=1,t=u;for(let i=0;i<22;i++){t=(lo+hi)/2;const m=1-t,x=3*m*m*t*x1+3*m*t*t*x2+t*t*t;if(x<u)lo=t;else hi=t}
    const m=1-t;return 3*m*m*t*y1+3*m*t*t*y2+t*t*t};
  const ease=(k,t,c)=>{t=clamp(t,0,1);if(k=='bez'){const q=c||{};return bez(clamp(num(q.es,.5),0,1),clamp(num(q.ee,.5),0,1),t)}if(k=='in')return t*t*t;if(k=='out')return 1-Math.pow(1-t,3);if(k=='io')return t<.5?4*t*t*t:1-Math.pow(2-2*t,3)/2;if(k=='back'){const c=1.70158;return t*t*((c+1)*t-c)}return t};
  // ease для ПОЯВЛЕНИЯ: обычное направление (Out — быстро в начале, Back — перелёт и возврат)
  const easeE=(k,t,c)=>{t=clamp(t,0,1);if(k=='back'){const a=1.70158,u=t-1;return 1+(a+1)*u*u*u+a*u*u}return ease(k,t,c)};
  // a..b — окно эффекта внутри длительности (доли 0..1): эффекты можно сдвигать друг относительно друга
  const DEF=k=>({on:true,st:false,dur:.3,delay:0,ease:k=='in'?'out':'in',es:.5,ee:.5,sc:{on:true,to:.6,y:.6,lk:true,a:0,b:1},al:{on:true,to:0,a:0,b:1},mv:{on:false,mode:'edge',dir:180,d:3,a:0,b:1}});
  const norm=(c,k0)=>{
    const d=DEF(k0);if(!c||typeof c!='object')c={};
    if(c.on===undefined)c.on=true;c.st=!!c.st;
    c.dur=clamp(num(c.dur,d.dur),0,10);c.delay=clamp(num(c.delay,0),0,10);if(!EASES.includes(c.ease))c.ease=d.ease;c.es=clamp(num(c.es,.5),0,1);c.ee=clamp(num(c.ee,.5),0,1);
    ['sc','al','mv'].forEach(k=>{const w=(c[k]&&typeof c[k]=='object')?c[k]:(c[k]={}),s=d[k];
      for(const q in s)if(w[q]===undefined)w[q]=s[q];
      w.on=!!w.on;w.a=clamp(num(w.a,0),0,.95);w.b=clamp(num(w.b,1),w.a+.05,1)});
    c.sc.to=clamp(num(c.sc.to,.6),0,5);c.sc.y=clamp(num(c.sc.y,c.sc.to),0,5);c.sc.lk=c.sc.lk!==false;
    c.al.to=clamp(num(c.al.to,0),0,1);
    c.mv.dir=((num(c.mv.dir,180)%360)+360)%360;c.mv.d=clamp(num(c.mv.d,3),0,200);c.mv.mode=c.mv.mode=='dist'?'dist':'edge';
    return c};
  const VIS=o=>!!(o.img||o.text||o.grad||o.screen||o.gif||o.video||o.webv||o.scrollv||o.reflect);
  // расстояние, на которое надо сдвинуть прямоугольник b вдоль (ux,uy), чтобы он полностью ушёл за прямоугольник экрана R (оси Y — вверх)
  const edgeDist=(b,R,ux,uy)=>{const c=[];
    if(ux>1e-6)c.push((R.x1-b.x0)/ux);else if(ux<-1e-6)c.push((b.x1-R.x0)/-ux);
    if(uy>1e-6)c.push((R.y1-b.y0)/uy);else if(uy<-1e-6)c.push((b.y1-R.y0)/-uy);
    return c.length?Math.max(0,Math.min(...c))+.05:0};
  // мировой габарит видимых частей поддерева ids; при включённом Scale раздувается от точки объекта (запас на увеличение)
  function bbox(o,ids,c){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const pv=E.wmat(o),px=pv[4],py=pv[5];
    const k=(c&&c.sc&&c.sc.on)?Math.max(1,Math.abs(c.sc.to),c.sc.lk?0:Math.abs(c.sc.y)):1;
    const add=(x,y)=>{x=px+(x-px)*k;y=py+(y-py)*k;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y};
    ids.forEach(x=>{if(!VIS(x))return;const M=E.wmat(x),s=E.size(x),w=s[0]/2,h=s[1]/2;
      [[-w,-h],[w,-h],[w,h],[-w,h]].forEach(q=>{const p=E.apM(M,q[0],q[1]);add(p.x,p.y)})});
    if(x0>x1)add(px,py);
    return{x0,y0,x1,y1}}
  // объекты поддерева (включая root), которые сейчас видны и имеют компонент Disable FX
  function collect(root,key){
    key=key||'dfx';
    const kids=new Map();E.objs.forEach(c=>{if(c.parent!=null){let a=kids.get(c.parent);if(!a)kids.set(c.parent,a=[]);a.push(c)}});
    const out=[],seen=new Set(),walk=o=>{if(seen.has(o.id)||o.active===false)return;seen.add(o.id);if(o[key]&&o[key].on!==false)out.push(o);(kids.get(o.id)||[]).forEach(walk)};
    walk(root);return out}
  // запуск эффекта объекта o: запоминает стартовые значения и считает сдвиг (для «до края экрана» — по видимой области на момент запуска)
  function mk(o,force,kind){
    const key=kind=='in'?'efx':'dfx',c=norm(o[key],kind=='in'?'in':'out');if(!force&&c.on===false)return null;
    if(!c.sc.on&&!c.al.on&&!c.mv.on)return null;
    const ids=E.subtree(o.id).filter(x=>x.active!==false);
    const e={o,c,rev:kind=='in',tot:c.delay+c.dur*Math.max(...['sc','al','mv'].filter(q=>c[q].on).map(q=>c[q].b)),x0:E.pget(o,'x'),y0:E.pget(o,'y'),sx0:E.pget(o,'sx'),sy0:E.pget(o,'sy'),a0:new Map(),mvx:0,mvy:0};
    if(c.al.on)ids.forEach(x=>{const a=E.pget(x,'alpha');if(a!==undefined)e.a0.set(x.id,a)});
    if(c.mv.on){
      const an=c.mv.dir*Math.PI/180,ux=Math.cos(an),uy=Math.sin(an);
      const d=c.mv.mode=='dist'?c.mv.d:edgeDist(bbox(o,ids,c),E.rect(),ux,uy);
      const vx=ux*d,vy=uy*d,P=o.parent!=null?E.get(o.parent):null,I=P?E.invM(E.wmat(P)):null;
      e.mvx=I?I[0]*vx+I[2]*vy:vx;e.mvy=I?I[1]*vx+I[3]*vy:vy}   // мировой вектор -> локальный (родитель может быть повёрнут/масштабирован)
    if(!e.rev){const fz=(k)=>{const w=c[k];let u=1;for(let i=0;i<=100;i++){if(ease(c.ease,i/100,c)>=.995){u=i/100;break}}return c.delay+c.dur*(w.a+u*(w.b-w.a))};e.tot=Math.max(...['sc','al','mv'].filter(k=>c[k].on).map(fz))}
    return e}
  // прогресс эффекта w в момент el (сек от старта): задержка, окно a..b, easing
  const uW=(c,w,el)=>((el-c.delay)/Math.max(1e-4,c.dur)-w.a)/Math.max(1e-3,w.b-w.a);
  // win — доля «ушедшего» (исчезновение 0→1); winR — доля «ещё не пришедшего» (появление 1→0), формулы дальше общие
  const win=(c,w,el)=>ease(c.ease,uW(c,w,el),c),winR=(c,w,el)=>1-easeE(c.ease,uW(c,w,el),c);
  const alphaMul=(e,el)=>1+(e.c.al.to-1)*(e.rev?winR:win)(e.c,e.c.al,el);
  function apply(e,el,put){
    const c=e.c,o=e.o;
    if(c.sc.on){const f=(e.rev?winR:win)(c,c.sc,el);put(o,'sx',e.sx0*(1+(c.sc.to-1)*f));put(o,'sy',e.sy0*(1+((c.sc.lk?c.sc.to:c.sc.y)-1)*f))}
    if(c.mv.on){const f=(e.rev?winR:win)(c,c.mv,el);put(o,'x',e.x0+e.mvx*f);put(o,'y',e.y0+e.mvy*f)}}
  // list: [{e, el}] — применить все эффекты за кадр; прозрачность перекрывающихся эффектов (родитель+ребёнок) перемножается
  function run(list,put){
    const mul=new Map(),a0=new Map();
    list.forEach(({e,el})=>{apply(e,el,put);
      if(e.c.al.on){const m=alphaMul(e,el);e.a0.forEach((v,id)=>{mul.set(id,(mul.has(id)?mul.get(id):1)*m);if(!a0.has(id))a0.set(id,v)})}});
    mul.forEach((m,id)=>{const x=E.get(id);if(x)put(x,'alpha',clamp(a0.get(id)*m,0,1))})}
  return{EASES,bez,ease,easeE,winR,DEF,norm,VIS,edgeDist,bbox,collect,mk,win,apply,alphaMul,run}};
/*DFXC-END*/
const DFX=DFXC({get,get objs(){return objs},subtree,wmat,apM,invM,size:o=>size(o),pget:(o,k)=>pget(o,k),
  rect:()=>{const z=cam.z||100,hw=CW/z/2,hh=CH/z/2;return{x0:cam.x-hw,x1:cam.x+hw,y0:cam.y-hh,y1:cam.y+hh}}});
const fxPut=(x,k,v)=>{const key=x.id+'.'+k;if(!base.has(key))base.set(key,pget(x,k));pset(x,k,v)};
const dying=new Map();
const resetIds=ids=>{base.forEach((bv,key)=>{const i=key.indexOf('.'),oid=+key.slice(0,i);if(!ids.has(oid))return;const x=get(oid);if(x)pset(x,key.slice(i+1),bv);base.delete(key)});ids.forEach(id=>run.pl.delete(id))};
const effOn=o=>{for(let q=o,n=0;q&&n<64;q=q.parent!=null?get(q.parent):null,n++)if(q.active===false)return false;return true};
function disAnims(root){
  const kids=new Map();objs.forEach(c=>{if(c.parent!=null){let a=kids.get(c.parent);if(!a)kids.set(c.parent,a=[]);a.push(c)}});
  const out=[],seen=new Set(),walk=o=>{if(seen.has(o.id)||o.active===false)return;seen.add(o.id);if(o.animator&&o.animator.dis)out.push(o);(kids.get(o.id)||[]).forEach(walk)};
  walk(root);return out}
const goIsOn=o=>!!o&&o.active!==false&&!dying.has(o.id);
function goBlocked(o){for(let q=o,n=0;q&&n<64;q=q.parent!=null?get(q.parent):null,n++)if(dying.has(q.id))return true;return false}
function goCancel(id){const d=dying.get(id);if(!d)return;dying.delete(id);resetIds(d.ids)}
// ---- Enable FX: появление при включении (общий код редактора и плеера) ----
const entering=new Map();   // id корня -> {fx:[{e,el,last}], own:Set ключей base, которые завели мы, ids:Set}
const enPut=d=>(x,k,v)=>{const key=x.id+'.'+k,b=base;if(!d.orig.has(key)){const cur=pget(x,k);d.orig.set(key,b.has(key)?b.get(key):cur);if(!b.has(key)){b.set(key,cur);d.own.add(key)}}pset(x,k,v)};
function goEndEnter(id,rest){const d=entering.get(id);if(!d)return;entering.delete(id);const b=base;
  d.orig.forEach((val,key)=>{if(rest&&val!==undefined){const i=key.indexOf('.'),x=get(+key.slice(0,i));if(x)pset(x,key.slice(i+1),val)}if(d.own.has(key))b.delete(key)})}   // плееры Animator не трогаем
function enBegin(rootId,list,now){
  if(entering.has(rootId))goEndEnter(rootId,true);{const sub=new Set(subtree(rootId).map(x=>x.id));sub.delete(rootId);entering.forEach((q,id)=>{if(sub.has(id))goEndEnter(id,true)})}
  const d={fx:[],own:new Set(),orig:new Map(),ids:new Set(subtree(rootId).map(x=>x.id))};
  list.forEach(x=>{const e=DFX.mk(x,false,'in');if(e)d.fx.push({e,el:0,last:now})});
  if(!d.fx.length)return;
  entering.set(rootId,d);DFX.run(d.fx,enPut(d))}   // стартовая поза сразу — без вспышки готового объекта на один кадр
function goEnter(o,now){if(DFX)enBegin(o.id,DFX.collect(o,'efx').filter(effOn),now)}
function goStart(){if(!DFX)return;const now=performance.now();
  objs.forEach(o=>{if(o.efx&&o.efx.st&&o.efx.on!==false&&o.active!==false&&effOn(o))enBegin(o.id,[o],now)})}
function enTick(now){
  entering.forEach((d,id)=>{const o=get(id);if(!o||!effOn(o)){goEndEnter(id,true);return}
    d.fx.forEach(f=>{f.el+=Math.min(.1,Math.max(0,(now-f.last)/1000));f.last=now});DFX.run(d.fx,enPut(d));
    if(d.fx.every(f=>f.el>=f.e.tot))goEndEnter(id,false)})}   // к концу позы уже ровно нормальные — просто забываем
function goSetActive(o,v){
  if(!o)return;
  if(v){const was=o.active===false||dying.has(o.id);if(dying.has(o.id))goCancel(o.id);o.active=true;if(was&&effOn(o))goEnter(o,performance.now());return}
  if(o.active===false||dying.has(o.id))return;
  const sub=new Set(subtree(o.id).map(x=>x.id));entering.forEach((d,id)=>{if(sub.has(id))goEndEnter(id,true)});
  if(!effOn(o)){o.active=false;return}
  const now=performance.now(),ents=[],fx=[];
  disAnims(o).forEach(x=>{const p=player(x);if(!p)return;if(p.dis||rtDisable(p,x.animator.dis,now))ents.push(x.id)});
  DFX.collect(o).forEach(x=>{const e=DFX.mk(x);if(e)fx.push({e,el:0,last:now})});
  if(!ents.length&&!fx.length){o.active=false;return}
  dying.set(o.id,{ents,fx,ids:new Set(subtree(o.id).map(x=>x.id))})}
function goTick(now){
  enTick(now);
  dying.forEach((d,id)=>{const o=get(id);if(!o){dying.delete(id);return}
    if(d.fx&&d.fx.length){d.fx.forEach(f=>{f.el+=Math.min(.1,Math.max(0,(now-f.last)/1000));f.last=now});DFX.run(d.fx,fxPut)}
    if((!d.fx||d.fx.every(f=>f.el>=f.e.tot))&&d.ents.every(eid=>{const p=run.pl.get(eid);return !p||rtDone(p,now)})){dying.delete(id);o.active=false;resetIds(d.ids)}})}
const MTH={
 'go.active':(o,a)=>{goSetActive(o,!!a[0])},
 'go.toggle':o=>{goSetActive(o,!goIsOn(o))},
 'tf.setpos':(o,a)=>setWorld(o,+a[0]||0,+a[1]||0),
 'tf.move':(o,a)=>{const w=worldPos(o);setWorld(o,w.x+(+a[0]||0),w.y+(+a[1]||0))},
 'tf.setrot':(o,a)=>{o.r=+a[0]||0},
 'tf.setrot3':(o,a)=>{o.rx=+a[0]||0;o.ry=+a[1]||0;o.r=+a[2]||0},
 'tf.rot3':(o,a)=>{o.rx=rd((o.rx||0)+(+a[0]||0));o.ry=rd((o.ry||0)+(+a[1]||0));o.r=rd(o.r+(+a[2]||0))},
 'tf.rot':(o,a)=>{o.r=rd(o.r+(+a[0]||0))},
 'tf.setscale':(o,a)=>{o.sx=+a[0]||0;o.sy=+a[1]||0},
 'img.color':(o,a)=>{if(o.img)o.img.color=a[0]||'#ffffff'},
 'img.alpha':(o,a)=>{if(o.img)o.img.alpha=Math.max(0,Math.min(1,+a[0]||0))},
 'img.fill':(o,a)=>{if(o.img)o.img.fa=Math.max(0,Math.min(1,+a[0]||0))},
 'img.sprite':(o,a)=>{if(o.img)o.img.sprite=a[0]==null?null:a[0]},
 'an.play':(o,a)=>{const p=player(o);if(p&&a[0])rtPlay(p,a[0])},
 'an.trig':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],true)},
 'an.bool':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],!!a[1])},
 'an.float':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'an.int':(o,a)=>{const p=player(o);if(p&&a[0])rtSet(p,a[0],a[1])},
 'mc.open':(o,a)=>mcOpen(o,+a[0]||0),
 'mc.close':o=>mcClose(o),
 'btn.inter':(o,a)=>{if(o.btn)o.btn.interactable=!!a[0]},
 'sv.to':(o,a)=>SV.to(o,+a[0]||0,+a[1]||0,+a[2]||0),
 'sv.start':(o,a)=>SV.start(o,+a[0]||0),
 'sv.end':(o,a)=>SV.end(o,+a[0]||0),
 'sv.item':(o,a)=>SV.item(o,+a[0]||0,+a[1]||0),
 'sv.on':(o,a)=>SV.setOn(o,!!a[0]),
 'ps.play':o=>PFX.play(o),
 'ps.stop':o=>PFX.stop(o),
 'ps.burst':(o,a)=>PFX.burst(o,+a[0]||0),
 'ps.clear':o=>PFX.clear(o),
 'gif.play':o=>GIFX.play(o),
 'gif.pause':o=>GIFX.pause(o),
 'gif.stop':o=>GIFX.stop(o),
 'gif.frame':(o,a)=>GIFX.setFrame(o,+a[0]||0),
 'gif.speed':(o,a)=>GIFX.setSpeed(o,+a[0]),
 'vid.play':o=>VIDX.play(o),
 'vid.pause':o=>VIDX.pause(o),
 'vid.stop':o=>VIDX.stop(o),
 'vid.seek':(o,a)=>VIDX.seek(o,+a[0]||0,true),
 'vid.vol':(o,a)=>VIDX.setVolume(o,+a[0]),
 'vid.mute':o=>VIDX.setMuted(o,true),
 'vid.unmute':o=>VIDX.setMuted(o,false),
 'web.play':o=>WEBV.play(o),
 'web.pause':o=>WEBV.pause(o),
 'web.stop':o=>WEBV.stop(o),
 'web.seek':(o,a)=>WEBV.seek(o,+a[0]||0),
 'web.vol':(o,a)=>WEBV.setVolume(o,+a[0]),
 'web.mute':o=>WEBV.setMuted(o,true),
 'web.unmute':o=>WEBV.setMuted(o,false),
 'web.next':o=>WEBV.next(o),
 'web.prev':o=>WEBV.prev(o),
 'web.goto':(o,a)=>WEBV.goto(o,(+a[0]||1)-1),
 'aud.play':o=>AUD.play(o),
 'aud.pause':o=>AUD.pause(o),
 'aud.stop':o=>AUD.stop(o),
 'aud.oneshot':o=>AUD.oneShot(o),
 'aud.vol':(o,a)=>AUD.setVolume(o,a[0]),
 'aud.pitch':(o,a)=>AUD.setPitch(o,a[0]),
 'aud.mute':o=>AUD.setMuted(o,true),
 'aud.unmute':o=>AUD.setMuted(o,false),
 'aud.fade':(o,a)=>AUD.fade(o,a[0],a[1]),
 'aud.fadestop':(o,a)=>AUD.fadeStop(o,a[0]),
 'web.url':(o,a)=>{WEBV.setUrl(o,a[0]);WEBV.restart(o)}};
function exec(E){const t=get(E.t),m=MTH[E.m];if(!t||!m)return;try{m(t,E.a||[])}catch(err){console.warn('OnClick:',err)}}
/* ================= MenuController: массив окон + массив кнопок (как в редакторе, menu.js) ================= */
const mcNorm=M=>{if(!Array.isArray(M.wins))M.wins=[];if(!Array.isArray(M.btns))M.btns=[];return M};
const mcIds=M=>{const s=new Set();M.wins.forEach(id=>{if(get(id))subtree(id).forEach(x=>s.add(x.id))});return s};
function mcReset(ids){   // исходные позы + остановка Animator'ов: анимации окон играются заново, как в первый раз
  base.forEach((bv,key)=>{const i=key.indexOf('.'),oid=+key.slice(0,i);if(!ids.has(oid))return;const x=get(oid);if(x)pset(x,key.slice(i+1),bv);base.delete(key)});
  ids.forEach(id=>run.pl.delete(id))}
const mcPend=new Map();   // id MenuController -> {o, idx}: ждёт, пока закроются (OnDisable) старые окна
function mcOpenNow(M,t){mcReset(mcIds(M));M.wins.forEach(id=>{const w=get(id);if(w)w.active=false});goSetActive(t,true)}
function mcOpen(o,idx){const M=o&&o.menu;if(!M)return;mcNorm(M);idx=Math.round(+idx);
  const t=M.wins[idx]!=null?get(M.wins[idx]):null;if(!t){console.warn('MenuController: нет окна с индексом',idx);return}
  {const sn=M.snd!=null?get(M.snd):null;if(sn&&sn.audio)AUD.oneShot(sn)}   // Transition Sound: звук перехода при каждом открытии окна
  const others=M.wins.map(id=>id!=null?get(id):null).filter(w=>w&&w!==t);
  others.forEach(w=>{if(w.active!==false)goSetActive(w,false)});   // сначала играются On Disable старых окон
  if(dying.has(t.id))goCancel(t.id);
  if(others.some(w=>dying.has(w.id))){mcPend.set(o.id,{o,idx});return}   // новое окно включится после закрытия всех старых (последний клик побеждает)
  mcPend.delete(o.id);mcOpenNow(M,t)}
function mcTick(){
  if(!mcPend.size)return;
  mcPend.forEach((q,id)=>{const M=q.o&&q.o.menu;if(!M){mcPend.delete(id);return}mcNorm(M);
    if(M.wins.some(w=>w!=null&&dying.has(w)))return;
    mcPend.delete(id);const t=M.wins[q.idx]!=null?get(M.wins[q.idx]):null;if(t)mcOpenNow(M,t)})}
function mcClose(o){const M=o&&o.menu;if(!M)return;mcNorm(M);mcPend.delete(o.id);
  M.wins.forEach(id=>{const w=id!=null?get(id):null;if(w&&w.active!==false)goSetActive(w,false)});
  const ids=new Set();M.wins.forEach(id=>{if(id!=null&&get(id)&&!dying.has(id))subtree(id).forEach(x=>ids.add(x.id))});
  mcReset(ids)}
const mcClick=b=>{for(const m of objs){const M=m.menu;if(!M)continue;mcNorm(M);M.btns.forEach((id,i)=>{if(id===b.id)mcOpen(m,i)})}};
const fire=o=>{if(!o.btn||o.btn.interactable===false)return;if(goBlocked(o))return;(o.btn.onClick||[]).slice().forEach(exec);mcClick(o)};

/* ================= Button: вид и попадание ================= */
const mulCol=(a,b)=>{const p=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16)),A=p(a),B=p(b);return'#'+A.map((v,i)=>Math.round(v*B[i]/255).toString(16).padStart(2,'0')).join('')};
function btnView(o){
  const im=o.img||o.text,b=o.btn;if(!im||!b||b.trans=='none')return im;
  const s=b.interactable===false?'dis':(run.down==o.id&&run.hover==o.id)?'pr':run.hover==o.id?'hi':'nm';
  if(s=='nm')return im;
  if(!o.img)return b.trans=='tint'?Object.assign({},im,{color:mulCol(im.color,b.tint[s]),alpha:s=='dis'?im.alpha*.5:im.alpha}):im;
  if(b.trans=='sprite')return ast(b[s])?Object.assign({},im,{sprite:b[s]}):im;
  return Object.assign({},im,{color:mulCol(im.color,b.tint[s]),alpha:s=='dis'?im.alpha*.5:im.alpha})}
function rayHit(w){const L=order();
  for(let i=L.length-1;i>=0;i--){const{o,on,M}=L[i];if(!on||!(o.img||o.text||o.grad))continue;
    const I=invM(M);if(!I)continue;const p=apM(I,w.x,w.y),[sw,sh]=size(o,o.img?btnView(o):null);
    if(Math.abs(p.x)<=sw/2&&Math.abs(p.y)<=sh/2&&SV.clipOK(o,w))return o}
  return null}
const handler=o=>{for(let q=o,n=0;q&&n<64;q=q.parent!=null?get(q.parent):null,n++)if(q.btn)return q;return null};
const live=o=>o&&o.btn&&o.btn.interactable!==false;

/* ================= Scroll View (общее ядро с редактором: scrollview.js) ================= */
/*SVCORE-BEGIN*/
function makeScroll(E){
const D={en:true,hor:false,ver:true,move:'elastic',elast:.1,inertia:true,decel:.135,wheel:.6,smoothWheel:true,smooth:.12,thresh:6,
  snap:'none',snapSize:1,snapDur:.45,snapEase:'out',bars:'auto',barW:.07,barDelay:1,barFade:.35,barCol:'#ffffff',barAlpha:.6,
  pad:0,startX:0,startY:0,vw:3,vh:4,content:null};
const mk=()=>Object.assign({},D),norm=s=>{for(const k in D)if(s[k]===undefined)s[k]=D[k];return s};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,EPS=1e-4;
const EASE={out:u=>1-Math.pow(1-u,3),inout:u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2,back:u=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2)}};
// пружина без перерегулирования (как Mathf.SmoothDamp в Unity): smooth — время выхода к цели
function smoothDamp(cur,target,vel,smooth,dt){
  smooth=Math.max(1e-4,smooth);const om=2/smooth,x=om*dt,e=1/(1+x+.48*x*x+.235*x*x*x),ch=cur-target,tmp=(vel+om*ch)*dt;
  let nv=(vel-om*tmp)*e,out=target+(ch+tmp)*e;
  if((target-cur>0)===(out>target)){out=target;nv=dt>0?(out-target)/dt:0}
  return[out,nv]}
// «резинка» на краях: чем дальше за край, тем тяжелее тянуть (формула iOS / Unity)
const rubber=(o,v)=>Math.sign(o)*(1-1/(Math.abs(o)*.55/v+1))*v;

/* ---------- состояние (живёт только в Play / в игре) ---------- */
const S=new Map();
const st=o=>{let s=S.get(o.id);if(!s)S.set(o.id,s={v:[0,0],tw:[null,null],wt:[null,null],sp:[null,null],acc:[0,0],lock:0,drag:null,lp:[0,0],lm:0,ba:1,idle:0,init:false,snapOK:[false,false]});return s};
let P=null,last=0,any=true,SVM=new Map(),selSet=new Set(),cleanF=false;

/* ---------- геометрия ---------- */
const kidsOf=q=>E.kids(q.id)||[];
const isDesc=(c,o)=>{for(let p=c,n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++)if(p.parent===o.id)return true;return false};
function contentOf(o){const c=o.scrollv.content!=null?E.get(o.scrollv.content):null;return(c&&c.id!==o.id&&isDesc(c,o))?c:(kidsOf(o)[0]||null)}
// матрица родителя Content относительно Scroll View (null — Content прямой ребёнок)
function parentM(o,c){let M=null;const ch=[];for(let p=c.parent!=null?E.get(c.parent):null,n=0;p&&p!==o&&n<64;p=p.parent!=null?E.get(p.parent):null,n++)ch.push(p);
  for(let i=ch.length-1;i>=0;i--){const L=E.locM(ch[i]);M=M?E.mulM(M,L):L}return M}
// прямоугольник объединения видимых объектов поддерева q в локальных осях SV (PM — матрица родителя q относительно SV, null если q — прямой ребёнок)
function bounds(q0,PM0){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,got=false;
  const walk=(q,PM)=>{if(q.active===false)return;const M=PM?E.mulM(PM,E.locM(q)):E.locM(q);
    if(q.img||q.text||q.grad){const sz=E.size(q),hw=sz[0]/2,hh=sz[1]/2;
      for(const c of[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){const px=M[0]*c[0]+M[2]*c[1]+M[4],py=M[1]*c[0]+M[3]*c[1]+M[5];
        if(px<x0)x0=px;if(px>x1)x1=px;if(py<y0)y0=py;if(py>y1)y1=py}got=true}
    for(const k of kidsOf(q))walk(k,M)};
  walk(q0,PM0);return got?{x0,y0,x1,y1}:null}
// метрики осей: a[i] — на сколько уже прокручено (0 = начало: слева / сверху), L[i] — длина прокрутки
function axes(o){const sc=o.scrollv,c=contentOf(o);if(!c)return null;const pm=parentM(o,c),b=bounds(c,pm);if(!b)return null;
  const sz=E.size(o),vw=sz[0],vh=sz[1],hw=vw/2,hh=vh/2,p=+sc.pad||0;
  return{c,pm,b,vw,vh,hw,hh,p,a:[-hw-(b.x0-p),(b.y1+p)-hh],L:[Math.max(0,b.x1-b.x0+2*p-vw),Math.max(0,b.y1-b.y0+2*p-vh)]}}
const put=(A,i,na)=>{const d=na-A.a[i];if(i==0)A.c.x-=d;else A.c.y+=d;A.a[i]=na};
const inView=(p,w)=>{const I=E.invM(E.wmat(p));if(!I)return false;const q=E.apM(I,w.x,w.y),sz=E.size(p);return Math.abs(q.x)<=sz[0]/2&&Math.abs(q.y)<=sz[1]/2};
const depth=o=>{let n=0;for(let p=o;p&&p.parent!=null&&n<64;p=E.get(p.parent))n++;return n};
const unclipped=p=>{if(E.playing()||cleanF)return false;if(selSet.has(p.id))return true;const q=p.parent!=null?E.get(p.parent):null;return!!(q&&q.scrollv&&selSet.has(q.id))};
const maskSpr=p=>p.mask&&p.mask.sprite!=null&&E.spr?E.spr(p.mask.sprite):null;   // спрайт-форма маски (или null — прямоугольник)   // в редакторе у выделенного Scroll View (и его содержимого) обрезка выключена — удобно раскладывать
const active=()=>E.order().filter(e=>e.on&&e.o.scrollv&&e.o.scrollv.en!==false);

/* ---------- привязка (Snap) ---------- */
const snapStep=(sc,A,i)=>sc.snap=='pages'?Math.max(.01,i?A.vh:A.vw):Math.max(.01,+sc.snapSize||1);
function snapTo(sc,s,A,i,p,v){
  const L=A.L[i],step=snapStep(sc,A,i);let t;
  if(sc.snap=='pages'){const pg=clamp(p,0,L)/step;t=Math.abs(v)>step*.6?(v>0?Math.ceil(pg-.05):Math.floor(pg+.05)):Math.round(pg);t*=step}
  else t=Math.round(clamp(p+v*.2,0,L)/step)*step;
  const q=clamp(p+v*.2,0,L);if(Math.abs(L-q)<Math.abs(q-t))t=L;t=clamp(t,0,L);
  const d=Math.abs(t-p);s.snapOK[i]=true;if(d<.0005){s.v[i]=0;return}
  if(sc.snapEase=='spring'){s.sp[i]=t;s.v[i]=v}
  else{s.v[i]=0;s.tw[i]={from:p,to:t,t:0,dur:Math.max(.08,(+sc.snapDur||.4)*Math.min(1,.4+d/step)),ease:sc.snapEase}}}

/* ---------- кадр физики ---------- */
function stepSV(o,s,dt){
  const sc=norm(o.scrollv),A=axes(o);if(!A)return;const on=[sc.hor,sc.ver];let busy=false;
  if(!s.init){s.init=true;[[0,sc.startX],[1,sc.startY]].forEach(([i,n])=>{if(on[i]&&A.L[i]>EPS){put(A,i,clamp(+n||0,0,1)*A.L[i]);s.snapOK[i]=true}})}   // стартовая позиция (только если есть что прокручивать)
  for(let i=0;i<2;i++){
    const L=A.L[i];if(!on[i]||L<=EPS){s.v[i]=0;s.tw[i]=s.wt[i]=s.sp[i]=null;continue}
    let p=A.a[i],v=s.v[i];
    if(s.drag){const nv=(p-s.lp[i])/dt;v=lerp(v,nv,Math.min(1,dt*10));s.lp[i]=p;s.v[i]=v;busy=true;continue}
    const tw=s.tw[i];
    if(tw){tw.t+=dt;const u=tw.dur>0?Math.min(1,tw.t/tw.dur):1,np=tw.from+(tw.to-tw.from)*(EASE[tw.ease]||EASE.out)(u);v=(np-p)/dt;p=np;if(u>=1){p=tw.to;v=0;s.tw[i]=null}busy=true}
    else if(s.sp[i]!=null){const tg=s.sp[i],r=smoothDamp(p,tg,v,Math.max(.05,(+sc.snapDur||.4)*.5),dt);p=r[0];v=r[1];busy=true;if(Math.abs(p-tg)<.0005&&Math.abs(v)<.01){p=tg;v=0;s.sp[i]=null}}
    else if(s.wt[i]!=null){const tg=s.wt[i],np=p+(tg-p)*(1-Math.exp(-dt/Math.max(.01,+sc.smooth||.1)));v=(np-p)/dt;p=np;busy=true;if(Math.abs(tg-p)<.0015){p=tg;v=0;s.wt[i]=null}}
    else{
      const out=p<0?p:p>L?p-L:0;
      if(out!==0&&sc.move=='elastic'){const tg=p<0?0:L,r=smoothDamp(p,tg,v,Math.max(.01,+sc.elast||.1),dt);p=r[0];v=r[1];busy=true;if(Math.abs(p-tg)<.0005&&Math.abs(v)<.01){p=tg;v=0}}
      else if(sc.inertia&&Math.abs(v)>.01){p+=v*dt;v*=Math.pow(clamp(+sc.decel||.135,.0001,.9999),dt);busy=true;if(sc.move=='clamped'&&(p<0||p>L)){p=clamp(p,0,L);v=0}}
      else{v=0;if(sc.move=='clamped'&&out!==0)p=clamp(p,0,L)}
      // остановились и нужна привязка → доводим до ближайшей точки
      if(sc.snap!='none'&&!s.snapOK[i]&&Math.abs(v)<.3&&p>=-EPS&&p<=L+EPS){snapTo(sc,s,A,i,p,v);v=s.v[i];busy=true}}
    s.v[i]=v;if(p!==A.a[i])put(A,i,p)}
  if(busy||s.drag||s.hover)s.idle=0;else s.idle+=dt;
  const tgt=sc.bars=='always'?1:sc.bars=='hidden'?0:(s.idle<(+sc.barDelay||0)?1:0);
  s.ba=tgt>s.ba?Math.min(1,s.ba+dt/.08):Math.max(0,s.ba-dt/Math.max(.02,+sc.barFade||.3))}
function step(L){
  const play=E.playing(),now=E.now();
  if(!play){if(S.size)S.clear();P=null;last=now;return}
  let dt=(now-last)/1000;last=now;if(E.paused()||!(dt>0))return;dt=Math.min(dt,.05);
  for(const e of(L||E.order())){const o=e.o;if(!e.on||!o.scrollv||o.scrollv.en===false){if(o.scrollv)S.delete(o.id);continue}stepSV(o,st(o),dt)}}

/* ---------- ввод: перетаскивание, колесо ---------- */
function cands(w){return active().map(e=>e.o).filter(o=>inView(o,w)&&clipOK(o,w)).sort((a,b)=>depth(b)-depth(a))}
function down(w,px,py){E.frame&&E.frame();const list=cands(w);P=list.length?{px,py,list,cur:null}:null}
// true — идёт перетаскивание Scroll View (вызывающий отменяет клик по кнопке под пальцем)
function move(w,px,py){
  if(!P)return false;
  if(!P.cur){
    const dx=px-P.px,dy=py-P.py;if(Math.hypot(dx,dy)<Math.max(0,+P.list[0].scrollv.thresh||0))return false;
    const hz=Math.abs(dx)>Math.abs(dy),o=P.list.find(q=>{const sc=norm(q.scrollv),A=axes(q);return A&&(hz?(sc.hor&&A.L[0]>EPS):(sc.ver&&A.L[1]>EPS))});
    if(!o){P=null;return false}
    const A=axes(o),s=st(o);s.drag=true;s.tw=[null,null];s.wt=[null,null];s.sp=[null,null];s.v=[0,0];s.snapOK=[false,false];s.lp=A.a.slice();s.lm=E.now();
    P.cur={o,s,a0:A.a.slice(),w0:{x:w.x,y:w.y}};return true}
  const{o,s,a0,w0}=P.cur,A=axes(o),I=E.invM(E.wmat(o));if(!A||!I)return true;
  const p0=E.apM(I,w0.x,w0.y),p1=E.apM(I,w.x,w.y),d=[p1.x-p0.x,p1.y-p0.y],sc=o.scrollv,on=[sc.hor,sc.ver];
  for(let i=0;i<2;i++){if(!on[i]||A.L[i]<=EPS)continue;
    const raw=a0[i]+(i?d[1]:-d[0]),L=A.L[i],vs=i?A.vh:A.vw;let p;
    if(sc.move=='free')p=raw;else if(sc.move=='clamped')p=clamp(raw,0,L);else{const c=clamp(raw,0,L),ov=raw-c;p=c+(ov?rubber(ov,vs):0)}
    put(A,i,p)}
  s.lm=E.now();s.idle=0;return true}
function up(){
  const q=P;P=null;if(!q||!q.cur)return;const{o,s}=q.cur;s.drag=null;
  const sc=norm(o.scrollv),A=axes(o);if(!A)return;const stale=E.now()-s.lm>90;
  [sc.hor,sc.ver].forEach((on,i)=>{if(!on||A.L[i]<=EPS)return;const v=stale?0:s.v[i];
    if(sc.snap!='none')snapTo(sc,s,A,i,A.a[i],v);else s.v[i]=sc.inertia?v:0})}
// колесо: nx / ny — «щелчки» (вниз / вправо — вперёд). true — прокрутка обработана
function wheel(w,nx,ny,shift){
  E.frame&&E.frame();let used=false;
  for(const o of cands(w)){
    const sc=norm(o.scrollv),A=axes(o);if(!A)continue;const s=st(o);
    let n=[sc.hor?nx:0,sc.ver?ny:0];if(sc.hor&&(shift||!sc.ver)&&!nx)n=[ny,0];
    for(let i=0;i<2;i++){
      if(!n[i]||A.L[i]<=EPS)continue;used=true;
      const L=A.L[i],base=s.wt[i]!=null?s.wt[i]:A.a[i];let t;
      if(sc.snap!='none'){   // один щелчок — один шаг / одна страница
        const step=snapStep(sc,A,i);s.acc[i]+=n[i];if(Math.abs(s.acc[i])<.5||E.now()<s.lock)continue;
        const k=Math.sign(s.acc[i]);s.acc[i]=0;s.lock=E.now()+130;t=clamp(Math.round(base/step)*step+k*step,0,L)}
      else t=clamp(base+n[i]*(+sc.wheel||.6),0,L);
      s.v[i]=0;s.tw[i]=null;s.sp[i]=null;s.snapOK[i]=sc.snap!='none';
      if(sc.smoothWheel)s.wt[i]=t;else{s.wt[i]=null;put(A,i,t)}
      s.idle=0}
    if(used)break}
  return used}

/* ---------- методы (On Click): плавная прокрутка в нужное место ---------- */
function goTo(o,i,tgt,dur){
  const sc=norm(o.scrollv),A=axes(o);if(!A||!(i?sc.ver:sc.hor)||A.L[i]<=EPS)return;
  const s=st(o),t=clamp(tgt,0,A.L[i]);s.wt[i]=null;s.sp[i]=null;s.v[i]=0;s.snapOK[i]=true;
  if(!(dur>0)){s.tw[i]=null;put(A,i,t)}else s.tw[i]={from:A.a[i],to:t,t:0,dur,ease:'inout'}}
function to(o,nx,ny,dur){const A=o&&o.scrollv&&axes(o);if(!A)return;[nx,ny].forEach((n,i)=>{if(n!=null&&!isNaN(n))goTo(o,i,clamp(+n,0,1)*A.L[i],+dur)})}
function item(o,idx,dur){
  const sc=o&&o.scrollv;if(!sc)return;const A=axes(o);if(!A)return;
  const ks=kidsOf(A.c).filter(k=>k.active!==false),k=ks[clamp(Math.round(+idx||0),0,ks.length-1)];if(!k)return;
  const b=bounds(k,A.pm?E.mulM(A.pm,E.locM(A.c)):E.locM(A.c));if(!b)return;
  if(sc.ver)goTo(o,1,A.a[1]+(A.hh-A.p)-b.y1,+dur);
  if(sc.hor)goTo(o,0,A.a[0]+b.x0-(-A.hw+A.p),+dur)}
const setOn=(o,v)=>{if(o&&o.scrollv)o.scrollv.en=!!v};

/* ---------- отрисовка: обрезка по рамке и скроллбары ---------- */
function begin(L,clean){cleanF=!!clean;E.frame&&E.frame();selSet=E.selSet();SVM.clear();any=false;
  const play=E.playing();
  for(const e of L){const o=e.o;
    // миграция: раньше обрезка была опцией Scroll View (scrollv.mask) — теперь это отдельный компонент Mask
    if(!play&&o.scrollv&&o.scrollv.mask!==undefined){if(o.scrollv.mask===true&&!o.mask)o.mask={w:3,h:3};delete o.scrollv.mask}
    if(o.scrollv||o.mask){any=true;SVM.set(o.id,e)}}
  if(any)step(L)}
// включает обрезку для объекта o (если он внутри объекта с компонентом Mask); возвращает true → после рисования вызвать g.restore()
let LAY=null;
const layerOf=g=>{const c=g.canvas;if(!LAY||LAY.width!=c.width||LAY.height!=c.height){LAY=document.createElement('canvas');LAY.width=c.width;LAY.height=c.height}return LAY};
// Возвращает false (обрезки нет), true (прямоугольная: после рисования g.restore()) или {ctx,…} (форма из спрайта: рисуем в ctx, затем endClip)
function clip(g,o,sx,sy){
  if(!any||o.parent==null)return false;const ch=[];
  for(let p=E.get(o.parent),n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++){
    if(p.mask&&!unclipped(p)){const e=SVM.get(p.id);if(e&&e.on)ch.push(e)}}
  if(!ch.length)return false;
  const quad=e=>{const M=e.M,sz=E.size(e.o),hw=sz[0]/2,hh=sz[1]/2;return[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(c=>[sx(M[0]*c[0]+M[2]*c[1]+M[4]),sy(M[1]*c[0]+M[3]*c[1]+M[5])])};
  const path=(ctx,e)=>{ctx.beginPath();quad(e).forEach((q,j)=>j?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath()};
  const sp=ch.filter(e=>maskSpr(e.o));
  if(!sp.length){g.save();for(let k=ch.length-1;k>=0;k--){path(g,ch[k]);g.clip()}return true}
  const T=g.getTransform(),L=layerOf(g),l=L.getContext('2d'),Q=quad(ch[0]);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[x,y]of Q){const X=T.a*x+T.c*y+T.e,Y=T.b*x+T.d*y+T.f;x0=Math.min(x0,X);x1=Math.max(x1,X);y0=Math.min(y0,Y);y1=Math.max(y1,Y)}
  const bx=Math.max(0,Math.floor(x0)-2),by=Math.max(0,Math.floor(y0)-2),bw=Math.max(0,Math.min(L.width,Math.ceil(x1)+2)-bx),bh=Math.max(0,Math.min(L.height,Math.ceil(y1)+2)-by);
  l.setTransform(1,0,0,1,0,0);l.globalAlpha=1;l.globalCompositeOperation='source-over';l.clearRect(bx,by,bw,bh);
  l.save();l.setTransform(T);for(let k=ch.length-1;k>=0;k--){path(l,ch[k]);l.clip()}
  return{ctx:l,sp,T,bx,by,bw,bh,sx,sy}}
// после рисования объекта: вырезаем форму спрайтом и накладываем слой на сцену
function endClip(g,h){
  if(h===true){g.restore();return}
  const l=h.ctx;l.restore();
  l.save();l.globalCompositeOperation='destination-in';
  for(const e of h.sp){const img=maskSpr(e.o);if(!img)continue;
    const M=e.M,sz=E.size(e.o),hw=sz[0]/2,hh=sz[1]/2,ap=(x,y)=>[h.sx(M[0]*x+M[2]*y+M[4]),h.sy(M[1]*x+M[3]*y+M[5])],p0=ap(0,0),p1=ap(1,0),p2=ap(0,1);
    l.save();l.setTransform(h.T);l.transform(p1[0]-p0[0],p1[1]-p0[1],p2[0]-p0[0],p2[1]-p0[1],p0[0],p0[1]);l.scale(1,-1);
    l.drawImage(img,-hw,-hh,sz[0],sz[1]);l.restore()}
  l.restore();
  if(h.bw>0&&h.bh>0){g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(l.canvas,h.bx,h.by,h.bw,h.bh,h.bx,h.by,h.bw,h.bh);g.restore()}}
// можно ли «попасть» в o в точке w (скрытое обрезкой содержимое не кликается и не выделяется)
function clipOK(o,w){
  if(!any)return true;
  for(let p=o.parent!=null?E.get(o.parent):null,n=0;p&&n<64;p=p.parent!=null?E.get(p.parent):null,n++){
    if(p.mask&&!unclipped(p)&&!inView(p,w))return false}
  return true}
// после рисования всего содержимого: рамка Scroll View / Mask (в редакторе) и скроллбары
function bars(g,o,M,sx,sy,cam,clean){
  const sc=o.scrollv;if(!sc&&!o.mask)return;if(sc)norm(sc);const play=E.playing(),A=sc?axes(o):null,sz=E.size(o),vw=sz[0],vh=sz[1],hw=vw/2,hh=vh/2;
  g.save();g.transform(M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,sx(M[4]),sy(M[5]));g.scale(1,-1);
  const px=1/(cam.z*Math.max(.001,Math.hypot(M[0],M[1])));
  const showM=!o.mask||o.mask.show!==false;   // Mask ▸ Show In Editor
  if(!play&&!clean&&!E.expMode()&&(sc||showM)){g.setLineDash([6*px,4*px]);g.lineWidth=1.2*px;g.strokeStyle=sc?'rgba(120,200,255,.6)':'rgba(255,190,90,.75)';g.strokeRect(-hw,-hh,vw,vh);g.setLineDash([]);
    const ms=o.mask&&showM&&maskSpr(o);if(ms&&unclipped(o)){g.globalAlpha=.3;g.drawImage(ms,-hw,-hh,vw,vh);g.globalAlpha=1}}
  if(A&&sc.bars!='hidden'){
    const s=play?S.get(o.id):null,al=play?(s?s.ba:1):1;
    if(al>.01){
      const th=Math.max(.01,+sc.barW||.07),ins=th*.6,both=sc.hor&&sc.ver&&A.L[0]>EPS&&A.L[1]>EPS;
      const rr=(x,y,w,h,a)=>{g.globalAlpha=a*al;g.fillStyle=sc.barCol||'#fff';g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,Math.min(w,h)/2);else g.rect(x,y,w,h);g.fill()};
      for(let i=0;i<2;i++){
        if(!(i?sc.ver:sc.hor)||A.L[i]<=EPS)continue;
        const vs=i?vh:vw,cs=vs+A.L[i],tl=Math.max(th,vs-2*ins-(both?th+ins:0)),p=A.a[i],ov=p<0?-p:p>A.L[i]?p-A.L[i]:0;
        let hl=clamp(tl*vs/cs,Math.min(tl,th*2),tl);hl*=clamp(1-ov/vs*1.5,.35,1);       // за краем ручка «сплющивается»
        const pos=ov?(p<0?0:tl-hl):clamp(p/A.L[i],0,1)*(tl-hl);
        if(i==1){const x=hw-ins-th,y0=-hh+ins;rr(x,y0,th,tl,.14);rr(x,y0+pos,th,hl,+sc.barAlpha||.6)}
        else{const y=hh-ins-th,x0=-hw+ins;rr(x0,y,tl,th,.14);rr(x0+pos,y,hl,th,+sc.barAlpha||.6)}}}}
  g.restore()}
return{mk,norm,D,step,begin,clip,endClip,clipOK,bars,down,move,up,wheel,to,item,setOn,axes,state:st,
  start:(o,d)=>to(o,0,0,d),end:(o,d)=>to(o,1,1,d)}}
/*SVCORE-END*/

/* ================= Particle System (общее ядро с редактором: particles.js) ================= */
/*PFXCORE-BEGIN*/
function makeParticles(E){
const TAU=Math.PI*2,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const D={sprites:[],shape:'soft',flip:false,
  mode:'stream',rate:30,count:40,rep:false,every:1.5,loop:true,dur:5,awake:true,
  em:'point',ew:1,eh:1,out:false,
  dir:90,spread:40,smin:1,smax:3,lmin:.6,lmax:1.2,
  zmin:.3,zmax:.6,zend:.2,
  grav:0,drag:0,turb:0,tsc:1,spmin:0,spmax:0,rmin:0,rmax:0,stretch:0,face:false,
  stops:[{c:'#ffffff',a:1},{c:'#ffffff',a:.8},{c:'#ffffff',a:0}],mid:true,fade:.05,
  wind:0,wdir:0,gust:0,gsp:.5,swa:0,swf:.4,twk:0,twf:3,pop:false,hue:0,pre:0,
  glow:false,space:'world',max:400,seed:0,preview:true};
const st3=(a,b,c)=>[{c:a[0],a:a[1]},{c:b[0],a:b[1]},{c:c[0],a:c[1]}];
/* Пресеты: только то, что отличается от D. dir: 90 = вверх, 0 = вправо, 270 = вниз */
const PRESETS=[
 {k:'explosion',n:'Explosion',ico:'💥',d:{mode:'burst',count:110,rep:true,every:2,em:'circle',ew:.12,dir:90,spread:360,smin:2.5,smax:8,lmin:.3,lmax:.85,zmin:.5,zmax:1.1,zend:.2,drag:3.4,grav:-.5,turb:.8,tsc:1.2,fade:0,glow:true,shape:'soft',stops:st3(['#fff6c4',1],['#ff8a24',.9],['#3a2420',0])}},
 {k:'fire',n:'Fire',ico:'🔥',d:{mode:'stream',rate:60,em:'circle',ew:.28,dir:90,spread:18,smin:.7,smax:1.5,lmin:.6,lmax:1.3,zmin:.34,zmax:.62,zend:.12,grav:-2.2,turb:1.6,tsc:1.4,fade:.08,glow:true,shape:'soft',stops:st3(['#ffd86a',.75],['#ff6a12',.7],['#4a1208',0])}},
 {k:'smoke',n:'Smoke',ico:'💨',d:{mode:'stream',rate:14,em:'circle',ew:.2,dir:90,spread:30,smin:.35,smax:.85,lmin:2.2,lmax:3.6,zmin:.4,zmax:.7,zend:2.6,grav:-.25,drag:.3,turb:.7,tsc:.8,spmin:-25,spmax:25,rmin:0,rmax:360,fade:.2,glow:false,shape:'smoke',stops:st3(['#c4c4c4',.5],['#8a8a8a',.35],['#4a4a4a',0])}},
 {k:'water',n:'Water',ico:'💧',d:{mode:'stream',rate:100,em:'point',dir:90,spread:16,smin:4.2,smax:6.5,lmin:1.1,lmax:1.6,zmin:.14,zmax:.24,zend:.7,grav:9,turb:0,fade:.02,face:true,glow:false,shape:'drop',stops:st3(['#d6f1ff',.95],['#5db4ff',.85],['#2a6fd6',0])}},
 {k:'noise',n:'Noise',ico:'📺',d:{mode:'stream',rate:260,em:'rect',ew:6,eh:4,dir:0,spread:360,smin:0,smax:.3,lmin:.15,lmax:.5,zmin:.04,zmax:.1,zend:1,grav:0,turb:2.5,tsc:4,fade:.25,glow:true,shape:'square',max:900,stops:st3(['#ffffff',.9],['#cfd8ff',.6],['#ffffff',0])}},
 {k:'sparks',n:'Sparks',ico:'⚡',d:{mode:'burst',count:34,rep:true,every:1.2,em:'point',dir:90,spread:80,smin:3,smax:7.5,lmin:.35,lmax:.9,zmin:.3,zmax:.55,zend:.35,grav:8,drag:.5,stretch:1.1,face:true,fade:0,glow:true,shape:'streak',stops:st3(['#fff7b0',1],['#ffb43a',.95],['#ff3d00',0])}},
 {k:'snow',n:'Snow',ico:'❄️',d:{mode:'stream',rate:36,em:'rect',ew:8,eh:.2,dir:270,spread:20,smin:.3,smax:.8,lmin:6,lmax:9,zmin:.07,zmax:.16,zend:1,grav:0,turb:.9,tsc:.6,fade:.1,glow:false,shape:'soft',max:600,stops:st3(['#ffffff',.95],['#eaf4ff',.9],['#ffffff',0])}},
 {k:'rain',n:'Rain',ico:'🌧️',d:{mode:'stream',rate:170,em:'rect',ew:8,eh:.2,dir:256,spread:4,smin:9,smax:12,lmin:.55,lmax:.85,zmin:.28,zmax:.42,zend:1,grav:0,turb:0,fade:0,face:true,glow:false,shape:'streak',max:700,stops:st3(['#b8d4ff',.55],['#a8c8ff',.55],['#a8c8ff',0])}},
 {k:'abstract',n:'Abstract',ico:'🌌',d:{mode:'stream',rate:5,em:'rect',ew:19,eh:11,dir:90,spread:360,smin:.05,smax:.25,lmin:9,lmax:15,zmin:2.4,zmax:5.5,zend:1.25,drag:.1,turb:.35,tsc:.35,swa:.35,swf:.07,spmin:-4,spmax:4,rmin:0,rmax:360,fade:.3,glow:true,shape:'blob',hue:90,pre:14,max:120,stops:st3(['#7b5cff',0],['#ff5ca8',.42],['#2fc7ff',0])}},
 {k:'bokeh',n:'Bokeh',ico:'🔮',d:{mode:'stream',rate:7,em:'rect',ew:17,eh:10,dir:90,spread:360,smin:.1,smax:.45,lmin:5,lmax:9,zmin:.4,zmax:1.3,zend:1.1,grav:-.1,turb:.2,tsc:.5,swa:.25,swf:.12,twk:.35,twf:.6,fade:.25,glow:true,shape:'bokeh',hue:150,pre:9,max:160,stops:st3(['#ffd27a',0],['#ff7ac8',.55],['#7ab8ff',0])}},
 {k:'shapes',n:'Shapes',ico:'🔷',d:{mode:'stream',rate:4.5,em:'rect',ew:18,eh:2,dir:90,spread:50,smin:.3,smax:.8,lmin:10,lmax:16,zmin:.5,zmax:1.5,zend:1,drag:.05,turb:.15,tsc:.3,swa:.15,swf:.1,spmin:-30,spmax:30,rmin:0,rmax:360,fade:.15,glow:false,shape:'mix',hue:90,pre:12,max:140,stops:st3(['#5b7cff',0],['#9b6bff',.6],['#ff6bd5',0])}},
 {k:'wind',n:'Wind',ico:'🍃',d:{mode:'stream',rate:22,em:'rect',ew:.4,eh:10,dir:0,spread:14,smin:5,smax:9,lmin:2,lmax:3.4,zmin:1.6,zmax:3.2,zend:1,drag:.2,turb:1.6,tsc:.45,wind:4,wdir:0,gust:.8,gsp:.3,face:true,stretch:.7,fade:.3,glow:true,shape:'wisp',max:200,pre:2,stops:st3(['#ffffff',0],['#dff0ff',.8],['#ffffff',0])}},
 {k:'sparkle',n:'Sparkle',ico:'✨',d:{mode:'stream',rate:22,em:'circle',ew:3,dir:90,spread:360,smin:0,smax:.35,lmin:.8,lmax:1.7,zmin:.3,zmax:.85,zend:.6,grav:-.4,drag:.4,turb:.5,tsc:1.4,spmin:-90,spmax:90,rmin:0,rmax:90,pop:true,twk:.55,twf:6,fade:0,glow:true,shape:'star',max:200,stops:st3(['#ffffff',1],['#fff2b0',.95],['#ffd34a',0])}},
 {k:'shine',n:'Shine',ico:'💫',d:{mode:'burst',count:1,rep:true,every:1.5,em:'point',dir:90,spread:0,smin:0,smax:0,lmin:.9,lmax:.9,zmin:2.2,zmax:2.2,zend:1,spmin:25,spmax:25,pop:true,fade:0,glow:true,shape:'flare',max:8,stops:st3(['#ffffff',1],['#fff6d0',1],['#ffe08a',0])}},
 {k:'rays',n:'Light Rays',ico:'🌤️',d:{mode:'stream',rate:2.2,em:'point',dir:0,spread:0,smin:0,smax:0,lmin:5,lmax:9,zmin:7,zmax:12,zend:1.05,spmin:-2.5,spmax:2.5,rmin:235,rmax:305,pop:true,twk:.25,twf:.5,fade:0,glow:true,shape:'ray',max:30,pre:8,stops:st3(['#fff3c4',.6],['#ffe9a8',.5],['#fff3c4',0])}},
 {k:'light',n:'Light',ico:'💡',d:{mode:'stream',rate:3.5,em:'point',dir:90,spread:0,smin:0,smax:0,lmin:2.6,lmax:3.4,zmin:3,zmax:3.6,zend:1.15,pop:true,twk:.18,twf:1.1,fade:0,glow:true,shape:'soft',max:30,pre:3,stops:st3(['#ffe2a8',.5],['#ffc874',.5],['#ff9a3c',0])}}];
const SHAPES=[['soft','Soft Glow'],['circle','Circle'],['square','Square'],['star','Sparkle'],['flare','Lens Flare'],['ring','Ring'],['smoke','Smoke Puff'],['drop','Water Drop'],['streak','Streak'],
  ['blob','Soft Blob'],['bokeh','Bokeh'],['triangle','Triangle'],['hex','Hexagon'],['diamond','Diamond'],['mix','Geometric Mix'],['ray','Light Ray'],['wisp','Wind Wisp']];
const MIX=['triangle','hex','diamond','ring','square'],HB=7;   // Geometric Mix: набор форм; HB — число «корзин» оттенка (Hue Variation)
const clone=v=>JSON.parse(JSON.stringify(v));
const mk=k=>{const p=PRESETS.find(x=>x.k==k);return clone(Object.assign({},D,p?p.d:{}))};
function norm(c){for(const k in D)if(c[k]===undefined)c[k]=clone(D[k]);if(!Array.isArray(c.sprites))c.sprites=[];
  while(c.stops.length<3)c.stops.push({c:'#ffffff',a:c.stops.length?0:1});return c}
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

/* ---------- цвет по жизни: Start → (Middle) → End ---------- */
const hcache=new Map(),hex=h=>{let r=hcache.get(h);if(!r){h=/^#[0-9a-f]{6}$/i.test(h||'')?h:'#ffffff';r=[1,3,5].map(i=>parseInt(h.substr(i,2),16));if(hcache.size>256)hcache.clear();hcache.set(h,r)}return r};
const segOf=(c,t)=>{const a=c.mid?[c.stops[0],c.stops[1],c.stops[2]]:[c.stops[0],c.stops[2]],n=a.length-1,f=clamp(t,0,1)*n,i=Math.min(n-1,Math.floor(f));return[a[i],a[i+1],f-i]};
const alphaAt=(c,t)=>{const[A,B,u]=segOf(c,t);return lerp(A.a,B.a,u)};
const colAt=(c,t)=>{const[A,B,u]=segOf(c,t),x=hex(A.c),y=hex(B.c);return[0,1,2].map(i=>Math.round(lerp(x[i],y[i],u)))};
const tinted=c=>{const s=c.mid?c.stops:[c.stops[0],c.stops[2]];return s.some(q=>String(q.c).toLowerCase()!='#ffffff')};

/* ---------- встроенные формы (белые, красятся цветом эффекта) ---------- */
const BI={},cvs=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function builtin(k){if(k=='mix')k='diamond';if(BI[k])return BI[k];let c,x;
  if(k=='circle'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.arc(32,32,30,0,TAU);x.fill()}
  else if(k=='square'){c=cvs(32,32);x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(2,2,28,28)}
  else if(k=='star'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,2);x.quadraticCurveTo(32,32,62,32);x.quadraticCurveTo(32,32,32,62);x.quadraticCurveTo(32,32,2,32);x.quadraticCurveTo(32,32,32,2);x.fill();
    const r=x.createRadialGradient(32,32,0,32,32,12);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=r;x.fillRect(16,16,32,32)}
  else if(k=='ring'){c=cvs(64,64);x=c.getContext('2d');x.strokeStyle='#fff';x.lineWidth=7;x.beginPath();x.arc(32,32,26,0,TAU);x.stroke()}
  else if(k=='smoke'){c=cvs(96,96);x=c.getContext('2d');for(let i=0;i<9;i++){const a=i*2.4,d=i?20*(.5+.5*Math.sin(i*1.7)):0,px=48+Math.cos(a)*d,py=48+Math.sin(a)*d,r0=22+6*Math.sin(i*2.3);
      const g=x.createRadialGradient(px,py,0,px,py,r0);g.addColorStop(0,'rgba(255,255,255,.42)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,96,96)}}
  else if(k=='drop'){c=cvs(64,40);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(62,20);x.quadraticCurveTo(36,6,22,4);x.arc(22,20,16,-Math.PI/2,Math.PI/2,true);x.quadraticCurveTo(36,34,62,20);x.fill()}
  else if(k=='streak'){c=cvs(64,12);x=c.getContext('2d');const g=x.createLinearGradient(0,0,64,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.8,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,1)');x.fillStyle=g;x.fillRect(0,2,62,8);x.fillStyle='#fff';x.beginPath();x.arc(58,6,4,0,TAU);x.fill()}
  else if(k=='blob'){c=cvs(128,128);x=c.getContext('2d');[[64,64,60,.55],[46,54,34,.4],[82,72,38,.4],[70,42,28,.3]].forEach(([px,py,r,a])=>{const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128)})}
  else if(k=='bokeh'){c=cvs(96,96);x=c.getContext('2d');const g=x.createRadialGradient(48,48,0,48,48,46);g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(.78,'rgba(255,255,255,.45)');g.addColorStop(.9,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.arc(48,48,46,0,TAU);x.fill()}
  else if(k=='triangle'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,5);x.lineTo(60,56);x.lineTo(4,56);x.closePath();x.fill()}
  else if(k=='hex'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;i?x.lineTo(32+Math.cos(a)*29,32+Math.sin(a)*29):x.moveTo(32+Math.cos(a)*29,32+Math.sin(a)*29)}x.closePath();x.fill()}
  else if(k=='diamond'){c=cvs(64,64);x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.moveTo(32,3);x.lineTo(58,32);x.lineTo(32,61);x.lineTo(6,32);x.closePath();x.fill()}
  else if(k=='flare'){c=cvs(128,128);x=c.getContext('2d');x.translate(64,64);
    const sp=(len,w,ang,a)=>{x.save();x.rotate(ang);const g=x.createLinearGradient(-len,0,len,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${a})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(-len,0);x.quadraticCurveTo(0,-w,len,0);x.quadraticCurveTo(0,w,-len,0);x.fill();x.restore()};
    sp(62,5,0,1);sp(62,5,Math.PI/2,1);sp(34,3,Math.PI/4,.7);sp(34,3,-Math.PI/4,.7);
    const r=x.createRadialGradient(0,0,0,0,0,26);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=r;x.fillRect(-64,-64,128,128)}
  else if(k=='ray'){c=cvs(256,64);x=c.getContext('2d');const g=x.createLinearGradient(0,0,256,0);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.35,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(0,29);x.lineTo(256,2);x.lineTo(256,62);x.lineTo(0,35);x.closePath();x.fill();
    x.globalCompositeOperation='destination-in';const v=x.createLinearGradient(0,0,0,64);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(.5,'rgba(0,0,0,1)');v.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=v;x.fillRect(0,0,256,64)}
  else if(k=='wisp'){c=cvs(128,24);x=c.getContext('2d');const g=x.createLinearGradient(0,0,128,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.25,'rgba(255,255,255,.9)');g.addColorStop(.7,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');x.strokeStyle=g;x.lineCap='round';x.lineWidth=3.4;x.beginPath();x.moveTo(2,15);x.bezierCurveTo(30,3,48,21,72,12);x.bezierCurveTo(92,5,108,9,126,7);x.stroke()}
  else{c=cvs(64,64);x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64)}
  return BI[k]=c}

/* ---------- текстуры частиц: спрайт (или форма) → уменьшенная копия → «рампа» окрашенных копий по жизни ---------- */
const MAXTEX=128,STEPS=16,TC=new Map();
const sigOf=c=>c.sprites.join(',')+'|'+c.shape+'|'+(tinted(c)?c.stops[0].c+c.stops[1].c+c.stops[2].c+(c.mid?'m':'-')+'|'+(c.hue||0):'w');
/* поворот оттенка (как feColorMatrix hueRotate) */
const hueRot=(c,deg)=>{if(!deg)return c;const a=deg*DEG,co=Math.cos(a),si=Math.sin(a),[r,g,b]=c,q=v=>clamp(Math.round(v),0,255);
  return[q((.213+co*.787-si*.213)*r+(.715-co*.715-si*.715)*g+(.072-co*.072+si*.928)*b),q((.213-co*.213+si*.143)*r+(.715+co*.285+si*.14)*g+(.072-co*.072-si*.283)*b),q((.213-co*.213-si*.787)*r+(.715-co*.715+si*.715)*g+(.072+co*.928+si*.072)*b)]};
const hbOf=p=>{const f=p.sd*13.37/TAU;return Math.floor((f-Math.floor(f))*HB)%HB};   // «корзина» оттенка частицы — из её же случайного числа (последовательность random не меняется)
function entry(c){const k=sigOf(c);let e=TC.get(k);if(!e){if(TC.size>=24)TC.delete(TC.keys().next().value);e={b:[],r:new Map(),tint:tinted(c),steps:c.sprites.length>8?8:STEPS};TC.set(k,e)}return e}
function baseTex(c,e,idx){
  if(e.b[idx]!==undefined)return e.b[idx];
  let res=null,waiting=false;
  if(c.sprites.length){const a=E.ast(c.sprites[idx%c.sprites.length]),im=a&&a.img;
    if(im&&im.width>0){const sc=Math.min(1,MAXTEX/Math.max(im.width,im.height)),w=Math.max(1,Math.round(im.width*sc)),h=Math.max(1,Math.round(im.height*sc)),cv=cvs(w,h);cv.getContext('2d').drawImage(im,0,0,w,h);res=cv}
    else if(a)waiting=true}                      // ассет есть, но картинка ещё грузится — пока рисуем форму, не кэшируем
  if(!res)res=builtin(c.shape=='mix'?MIX[idx%MIX.length]:c.shape);
  if(!waiting)e.b[idx]=res;return res}
function tex(c,e,idx,step,bk){
  const b=baseTex(c,e,idx);if(!e.tint)return b;
  const key=((bk||0)*1024+idx)*64+step;let t=e.r.get(key);if(t)return t;
  const col=hueRot(colAt(c,(step+.5)/e.steps),c.hue>0?((bk||0)/(HB-1)-.5)*c.hue:0);t=cvs(b.width,b.height);const x=t.getContext('2d');
  x.drawImage(b,0,0);x.globalCompositeOperation='multiply';x.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;x.fillRect(0,0,t.width,t.height);
  x.globalCompositeOperation='destination-in';x.drawImage(b,0,0);
  if(e.b[idx]!==undefined)e.r.set(key,t);return t}

/* ---------- состояние эмиттеров (живёт только в Play / в игре / в предпросмотре) ---------- */
const ST=new Map();
function fresh(o){const c=o.particles||D;return{ps:[],t:0,acc:0,bd:false,bt:0,pend:0,idle:0,last:E.now()/1000,pl:!!E.playing(),prev:null,
  on:!E.playing()||c.awake!==false,rnd:rng(c.seed>0?c.seed:(Math.random()*1e9|0)+1)}}
const stOf=o=>{let s=ST.get(o.id);if(!s){s=fresh(o);ST.set(o.id,s)}return s};

function spawn(st,c,tf,k){
  const R=st.rnd,local=c.space=='local',P=st.ps,lo=Math.min,hi=Math.max,cth=Math.cos(tf.th),sth=Math.sin(tf.th);
  for(let n=0;n<k&&P.length<c.max;n++){
    let ox=0,oy=0;
    if(c.em=='circle'){const a=R()*TAU,r=c.ew*Math.sqrt(R());ox=Math.cos(a)*r;oy=Math.sin(a)*r}
    else if(c.em=='line'){ox=(R()-.5)*c.ew}
    else if(c.em=='rect'){ox=(R()-.5)*c.ew;oy=(R()-.5)*c.eh}
    const base=c.out&&(ox||oy)?Math.atan2(oy,ox)/DEG:c.dir,ang=(base+(R()-.5)*c.spread)*DEG,sp=lerp(lo(c.smin,c.smax),hi(c.smin,c.smax),R()),
      life=lerp(lo(c.lmin,c.lmax),hi(c.lmin,c.lmax),R()),s0=lerp(lo(c.zmin,c.zmax),hi(c.zmin,c.zmax),R()),
      p={age:0,life:Math.max(.02,life),s:s0,rot:lerp(lo(c.rmin,c.rmax),hi(c.rmin,c.rmax),R()),sp:lerp(lo(c.spmin,c.spmax),hi(c.spmin,c.spmax),R()),
         sd:R()*TAU,si:Math.floor(R()*Math.max(1,c.sprites.length)),k:tf.sc,x:0,y:0,vx:0,vy:0};
    if(local){p.x=ox;p.y=oy;p.vx=Math.cos(ang)*sp;p.vy=Math.sin(ang)*sp}
    else{const sc=tf.sc,wa=ang+tf.th;p.x=tf.x+sc*(cth*ox-sth*oy);p.y=tf.y+sc*(sth*ox+cth*oy);p.vx=Math.cos(wa)*sp*sc;p.vy=Math.sin(wa)*sp*sc}
    P.push(p)}}

function advance(c,st,tf,dt){
  const local=c.space=='local',sth=Math.sin(tf.th),cth=Math.cos(tf.th),gx=-c.grav*sth,gy=-c.grav*cth,
    n=Math.max(1,Math.ceil(dt*60)),h=dt/n,P=st.ps,far=st.prev&&Math.hypot(tf.x-st.prev[0],tf.y-st.prev[1])>20;
  const wd=c.wdir*DEG,wx0=Math.cos(wd),wy0=Math.sin(wd),wx=local?wx0*cth+wy0*sth:wx0,wy=local?-wx0*sth+wy0*cth:wy0;   // направление ветра в системе частиц
  for(let j=0;j<n;j++){
    const f=(j+1)/n,e={x:st.prev&&!far?lerp(st.prev[0],tf.x,f):tf.x,y:st.prev&&!far?lerp(st.prev[1],tf.y,f):tf.y,th:tf.th,sc:tf.sc};
    st.t+=h;
    if(st.on){
      if(c.mode=='burst'){
        if(!st.bd){spawn(st,c,e,c.count);st.bd=true;st.bt=0}
        else if(c.rep){st.bt+=h;if(st.bt>=Math.max(.05,c.every)){spawn(st,c,e,c.count);st.bt=0}}}
      else if(c.loop||st.t<=c.dur){st.acc+=c.rate*h;const k=st.acc|0;if(k){st.acc-=k;spawn(st,c,e,k)}}}
    if(st.pend>0){spawn(st,c,e,st.pend);st.pend=0}
    let w=0;
    for(let i=0;i<P.length;i++){const p=P[i];p.age+=h;if(p.age>=p.life)continue;
      let ax=0,ay=0;if(local){ax=gx;ay=gy}else ay=-c.grav*p.k;
      if(c.turb){const X=p.x*c.tsc,Y=p.y*c.tsc,T=st.t,q=p.sd,kk=local?1:p.k;
        ax+=(Math.sin(X*1.3+T*1.1+q)+.5*Math.sin(Y*2.1-T*.7+q*1.7))*c.turb*kk;ay+=(Math.cos(Y*1.2-T*.9+q*2.3)+.5*Math.sin(X*1.9+T*1.3+q*.4))*c.turb*kk}
      if(c.wind){const gm=1+c.gust*Math.sin(st.t*c.gsp*TAU-(p.x*wx+p.y*wy)*.45+p.sd*.15),fw=c.wind*gm*(local?1:p.k);ax+=wx*fw;ay+=wy*fw}   // порывы бегут по направлению ветра
      if(c.drag>0){const d=Math.exp(-c.drag*h);p.vx*=d;p.vy*=d}
      p.vx+=ax*h;p.vy+=ay*h;
      let ux=p.vx,uy=p.vy;if(c.swa){const q=c.swa*(local?1:p.k),ph=st.t*c.swf*TAU+p.sd;ux+=Math.sin(ph)*q;uy+=Math.cos(ph*.83+p.sd*.7)*q}   // Sway: плавное покачивание поверх движения
      p.x+=ux*h;p.y+=uy*h;p.rot+=p.sp*h;P[w++]=p}
    P.length=w;
    if(!st.pl){   // предпросмотр в редакторе: когда эффект доиграл — через паузу запускается снова
      const can=c.mode=='burst'?(!st.bd||c.rep):(c.loop||st.t<=c.dur);
      if(!can&&!P.length){st.idle+=h;if(st.idle>.7){st.t=0;st.bd=false;st.acc=0;st.bt=0;st.idle=0;st.on=true}}else st.idle=0}}
  st.prev=[tf.x,tf.y]}

/* ---------- рисование: вызывается из render() на месте объекта в иерархии ---------- */
function draw(g,o,M,sx,sy,cam,W,H){
  const c=o.particles;if(!c)return;norm(c);
  const pl=!!E.playing();if(!pl&&c.preview===false)return;
  const sc=Math.hypot(M[0],M[1]);if(!(sc>1e-4))return;
  const tf={x:M[4],y:M[5],th:Math.atan2(M[1],M[0]),sc},now=E.now()/1000,paused=pl&&E.paused&&E.paused();
  let st=stOf(o);
  if(st.pl!==pl||(now-st.last>.5&&!paused)){st=fresh(o);ST.set(o.id,st)}   // Play начался / объект был выключен — эффект стартует заново
  let dt=now-st.last;st.last=now;
  if(c.pre>0&&!st.pw&&st.on&&!paused){st.pw=true;st.prev=[tf.x,tf.y];const k=Math.min(900,Math.ceil(c.pre*30));for(let i=0;i<k;i++)advance(c,st,tf,1/30)}   // Prewarm: эффект сразу «уже идёт» (фон, лучи)
  if(!paused&&dt>0)advance(c,st,tf,Math.min(dt,.1));else if(!st.prev)st.prev=[tf.x,tf.y];
  st.tf=tf;
  const P=st.ps;if(!P.length)return;
  W=W||1e9;H=H||1e9;
  const e=entry(c),anch=!c.sprites.length&&c.shape=='ray',local=c.space=='local',cth=Math.cos(tf.th),sth=Math.sin(tf.th),nsp=c.sprites.length,
    useM=typeof g.getTransform=='function',B=useM?g.getTransform():null,op=g.globalCompositeOperation;
  g.globalCompositeOperation=c.glow?'lighter':'source-over';
  for(let i=0;i<P.length;i++){const p=P[i],t=p.age/p.life;
    let al=alphaAt(c,t);if(c.fade>0&&t<c.fade)al*=t/c.fade;
    if(c.twk)al*=1-c.twk+c.twk*(.5+.5*Math.sin(p.age*c.twf*TAU+p.sd));   // Twinkle
    if(al<=.004)continue;
    const kk=local?sc:p.k;let s=p.s*Math.max(0,1+(c.zend-1)*t)*kk*cam.z;if(c.pop)s*=Math.sin(Math.PI*Math.min(1,t));if(s<.6)continue;
    let wx=p.x,wy=p.y;if(local){wx=tf.x+sc*(cth*p.x-sth*p.y);wy=tf.y+sc*(sth*p.x+cth*p.y)}
    const X=sx(wx),Y=sy(wy),m=s*(1+c.stretch*2);if(X<-m||X>W+m||Y<-m||Y>H+m)continue;
    let ang=p.rot*DEG,len=1;
    if(c.face||c.stretch){const vx=local?p.vx*cth-p.vy*sth:p.vx,vy=local?p.vx*sth+p.vy*cth:p.vy,sp=Math.hypot(vx,vy);
      if(c.face&&sp>1e-4)ang+=Math.atan2(vy,vx);else if(local)ang+=tf.th;if(c.stretch)len=1+c.stretch*sp*.12}
    else if(local)ang+=tf.th;
    const idx=nsp>1&&c.flip?Math.min(nsp-1,Math.floor(t*nsp)):(!nsp&&c.shape=='mix'?hbOf({sd:p.sd*3.7})%MIX.length:p.si),step=e.tint?Math.min(e.steps-1,Math.floor(t*e.steps)):0,
      im=tex(c,e,idx,step,c.hue>0&&e.tint?hbOf(p):0),mx=Math.max(im.width,im.height)||1,dw=s*im.width/mx*len,dh=s*im.height/mx,ax0=anch?0:-dw/2;
    g.globalAlpha=al>1?1:al;
    if(!ang&&len==1){g.drawImage(im,X+ax0,Y-dh/2,dw,dh)}
    else{const rr=-ang,co=Math.cos(rr),si=Math.sin(rr);
      if(useM){g.setTransform(B.a*co+B.c*si,B.b*co+B.d*si,-B.a*si+B.c*co,-B.b*si+B.d*co,B.a*X+B.c*Y+B.e,B.b*X+B.d*Y+B.f);g.drawImage(im,ax0,-dh/2,dw,dh)}
      else{g.save();g.translate(X,Y);g.rotate(rr);g.drawImage(im,ax0,-dh/2,dw,dh);g.restore()}}}
  if(useM)g.setTransform(B);g.globalAlpha=1;g.globalCompositeOperation=op}

/* ---------- управление (On Click / редактор) ---------- */
const finished=(c,st)=>c.mode=='burst'?(st.bd&&!c.rep):(!c.loop&&st.t>c.dur);
const api={mk,norm,draw,PRESETS,SHAPES,D,builtin,
  busy(){if(E.playing())return false;let any=false;const L=E.objs();for(const o of L)if(o.particles&&o.active!==false&&o.particles.preview!==false){any=true;break}
    if(ST.size>64){const ids=new Set(L.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}return any},
  play(o){const c=o.particles;if(!c)return;const st=ST.get(o.id);if(st&&st.on&&!finished(norm(c),st))return;const f=fresh(o);f.on=true;f.pl=!!E.playing();ST.set(o.id,f)},
  stop(o){const st=ST.get(o.id);if(st)st.on=false},
  burst(o,n){if(!o.particles)return;const st=stOf(o);st.pend+=Math.max(0,Math.round(+n||0))},
  clear(o){const st=ST.get(o.id);if(st)st.ps.length=0},
  restart(o){ST.delete(o.id)},
  alive(o){const st=ST.get(o.id);return st?st.ps.length:0},
  reset(){ST.clear()}};
return api}
/*PFXCORE-END*/

/* ================= Reflection (общее ядро с редактором: reflection.js) ================= */
/*RFXCORE-BEGIN*/
function makeReflection(E){
const TAU=Math.PI*2,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const D={mode:'floor',w:8,h:4,axis:'h',flip:false,split:.5,gap:0,depth:1,
  alpha:.7,fade:.75,blur:0,tint:'#6fb4ff',tamt:0,glow:false,feather:.06,
  wave:0,wfreq:6,wspd:1,shim:0,
  sheen:0,shw:.22,shspd:.25,shang:35,border:0,horizon:0,
  seg:8,rot:0,spin:0,zoom:1,round:true,cols:3,rows:3,shrink:true,cx:.5,
  quality:1,preview:true};
const LIM={w:[.1,100],h:[.1,100],split:[0,1],gap:[0,20],depth:[.1,3],alpha:[0,1],fade:[0,1],blur:[0,60],tamt:[0,1],feather:[0,.5],
  wave:[0,2],wfreq:[0,60],wspd:[-20,20],shim:[0,1],sheen:[0,1],shw:[.02,1],shspd:[-5,5],shang:[-360,360],border:[0,1],horizon:[0,1],
  seg:[2,64],rot:[-720,720],spin:[-720,720],zoom:[.1,8],cols:[1,24],rows:[1,24],cx:[0,1],quality:[.25,1]};
const PLANE={mirror:1,floor:1,water:1,glass:1};
const MODES=[['mirror','Mirror'],['floor','Floor'],['water','Water'],['glass','Glass'],['quad','Quad (4-way)'],['kaleido','Kaleidoscope'],['tiles','Mirror Tiles']];
/* Пресеты: только то, что отличается от D */
const PRESETS=[
 {k:'mirror',n:'Mirror',ico:'🪞',d:{mode:'mirror',alpha:1,fade:0,blur:0,depth:1,horizon:.55,border:.25,feather:.03}},
 {k:'floor',n:'Floor',ico:'🏛️',d:{mode:'floor',alpha:.62,fade:.85,blur:10,depth:.92,horizon:.3,feather:.08}},
 {k:'water',n:'Water',ico:'🌊',d:{mode:'water',alpha:.78,fade:.55,blur:3,depth:.88,tint:'#3f9bff',tamt:.3,wave:.07,wfreq:8,wspd:1.3,shim:.65,horizon:.35,feather:.08}},
 {k:'glass',n:'Glass',ico:'🔍',d:{mode:'glass',alpha:.6,fade:.9,blur:5,depth:1,tint:'#bfe4ff',tamt:.1,sheen:.55,shw:.2,shspd:.18,shang:32,border:.7,glow:false,feather:.03}},
 {k:'quad',n:'Quad',ico:'🔲',d:{mode:'quad',w:6,h:4,alpha:1,round:false,feather:.02}},
 {k:'kaleido',n:'Kaleido',ico:'🔮',d:{mode:'kaleido',w:4,h:4,seg:8,spin:14,zoom:1,round:true,alpha:1,feather:.12,border:.35}},
 {k:'tiles',n:'Mirror Tiles',ico:'🔳',d:{mode:'tiles',w:6,h:4,cols:3,rows:3,shrink:true,alpha:1,feather:0}}];
const mk=key=>{const p=PRESETS.find(x=>x.k==key)||PRESETS[1];return Object.assign({},D,p.d)};
const HEX=/^#[0-9a-f]{6}$/i;
function norm(c){
  for(const k in D)if(c[k]===undefined||c[k]===null)c[k]=D[k];
  for(const k in LIM){const v=+c[k];c[k]=isFinite(v)?clamp(v,LIM[k][0],LIM[k][1]):D[k]}
  if(!HEX.test(c.tint))c.tint=D.tint;
  c.seg=Math.max(2,Math.round(c.seg/2)*2);c.cols=Math.round(c.cols);c.rows=Math.round(c.rows);
  if(!PLANE[c.mode]&&c.mode!='quad'&&c.mode!='kaleido'&&c.mode!='tiles')c.mode='floor';
  if(c.axis!='v')c.axis='h';return c}
const rgb=(h,a)=>`rgba(${[1,3,5].map(i=>parseInt(h.substr(i,2),16)).join(',')},${a})`;
const animated=c=>(c.wave>0&&c.wspd!=0)||c.shim>0&&PLANE[c.mode]||(c.sheen>0&&c.shspd!=0)||(c.mode=='kaleido'&&c.spin!=0);
const hash=n=>{n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n)};

/* ---------- буферы (общие, переиспользуются между кадрами) ---------- */
const POOL={};
function slot(k,w,h){let s=POOL[k];if(!s){const c=document.createElement('canvas');s=POOL[k]={c,x:c.getContext('2d')}}
  if(s.c.width!==w||s.c.height!==h){s.c.width=w;s.c.height=h}
  else{s.x.setTransform(1,0,0,1,0,0);s.x.globalAlpha=1;s.x.globalCompositeOperation='source-over';s.x.clearRect(0,0,w,h)}
  s.x.imageSmoothingEnabled=true;return s}
const HAS_FILTER=(()=>{try{return'filter'in document.createElement('canvas').getContext('2d')}catch(e){return false}})();
const MC=new Map();
/* маска мягких краёв: непрозрачная в центре, прозрачная к краям (top=false — верхний край у линии зеркала остаётся целым) */
function featherMask(PW,PH,f,round,top){
  const key=PW+'x'+PH+':'+f.toFixed(3)+(round?'r':'')+(top?'t':'');let m=MC.get(key);if(m)return m;
  m=document.createElement('canvas');m.width=PW;m.height=PH;const x=m.getContext('2d');
  if(round){x.translate(PW/2,PH/2);x.scale(PW/2,PH/2);const g=x.createRadialGradient(0,0,0,0,0,1),i=clamp(1-f*2,0,.99);
    g.addColorStop(0,'#000');g.addColorStop(i,'#000');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(-1,-1,2,2)}
  else{x.fillStyle='#000';x.fillRect(0,0,PW,PH);x.globalCompositeOperation='destination-out';const fp=Math.max(1,f*Math.min(PW,PH));
    const edge=(x0,y0,x1,y1,rx,ry,rw,rh)=>{const g=x.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(rx,ry,rw,rh)};
    edge(0,0,fp,0,0,0,fp,PH);edge(PW,0,PW-fp,0,PW-fp,0,fp,PH);edge(0,PH,0,PH-fp,0,PH-fp,PW,fp);if(top)edge(0,0,0,fp,0,0,PW,fp)}
  if(MC.size>8)MC.delete(MC.keys().next().value);MC.set(key,m);return m}

/* размытие: ctx.filter, а если его нет — уменьшение/увеличение */
function blurInto(x,src,px,PW,PH){
  if(HAS_FILTER){x.filter=`blur(${px.toFixed(2)}px)`;x.drawImage(src,0,0);x.filter='none'}
  else{const f=Math.max(2,Math.round(px*1.2)),sw=Math.max(1,Math.ceil(PW/f)),sh=Math.max(1,Math.ceil(PH/f)),t=slot('b2',sw,sh);
    t.x.drawImage(src,0,0,sw,sh);x.imageSmoothingEnabled=true;x.drawImage(t.c,0,0,sw,sh,0,0,PW,PH)}}

/* ---------- состояние (время) ---------- */
const ST=new Map();
const stOf=o=>{let s=ST.get(o.id);if(!s){s={t:0,last:E.now()};ST.set(o.id,s)}return s};

/* ---------- рисование ---------- */
function draw(gx,o,M,sx,sy,cam,W,H){
  const c=o.reflect;if(!c)return;norm(c);
  const live=!!E.playing()||c.preview!==false,st=stOf(o),now=E.now(),dt=clamp((now-st.last)/1000,0,.1);st.last=now;
  if(live&&!E.paused())st.t+=dt;else if(!live)st.t=0;
  const t=st.t,mode=c.mode,plane=!!PLANE[mode],vert=plane&&c.axis=='v',w=c.w,h=c.h;
  const T=gx.getTransform().multiply(new DOMMatrix([M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,sx(M[4]),sy(M[5])])).scale(1,-1);   // локальные оси объекта, y вниз, единицы сцены → пиксели canvas
  if(!isFinite(T.a+T.b+T.c+T.d+T.e+T.f))return;
  /* вне экрана — пропускаем */
  {const cw=gx.canvas.width,ch=gx.canvas.height;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
   for(const[a,b]of[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]){const p=T.transformPoint(new DOMPoint(a,b));x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}
   if(x1<0||x0>cw||y1<0||y0>ch)return}
  const inv=T.inverse();if(!isFinite(inv.a+inv.d+inv.e+inv.f))return;
  /* «нормализованная» рамка: линия зеркала всегда горизонтальна, источник сверху, отражение снизу */
  const nw=vert?h:w,nh=vert?w:h,lx=Math.hypot(T.a,T.b),ly=Math.hypot(T.c,T.d),kx=vert?ly:lx,ky=vert?lx:ly;
  let R=new DOMMatrix();if(vert)R=new DOMMatrix([0,1,-1,0,0,0]);if(plane&&c.flip)R=new DOMMatrix([1,0,0,-1,0,0]).multiply(R);
  const cap=mode=='kaleido'?1100:1400;let PW=Math.ceil(nw*kx*c.quality),PH=Math.ceil(nh*ky*c.quality);const f=Math.min(1,cap/Math.max(PW,PH,1));
  PW=Math.max(2,Math.round(PW*f));PH=Math.max(2,Math.round(PH*f));if(PW<4||PH<4)return;
  const ppu=PW/nw;   // пикселей слоя на единицу сцены
  /* 1) снимок того, что уже нарисовано под рамкой */
  const src=slot('src',PW,PH),S=new DOMMatrix().scale(PW/nw,PH/nh).translate(nw/2,nh/2);
  src.x.setTransform(S.multiply(R).multiply(inv));src.x.drawImage(gx.canvas,0,0);src.x.setTransform(1,0,0,1,0,0);
  /* 2) строим слой с отражением */
  let cur=slot('lay',PW,PH),X=cur.x,y0r=0,sp=0;
  const sLine=(c.flip?1-c.split:c.split)*PH;
  if(plane){
    const gp=c.gap*ppu;y0r=Math.min(PH-1,sLine+gp);
    X.save();X.beginPath();X.rect(0,y0r,PW,PH-y0r);X.clip();
    X.translate(0,y0r);X.scale(1,-c.depth);X.translate(0,-sLine);X.drawImage(src.c,0,0);X.restore()}
  else if(mode=='quad'){
    const cxp=Math.round(c.cx*PW),syp=Math.round(c.split*PH);
    for(let fx=0;fx<2;fx++)for(let fy=0;fy<2;fy++){
      X.save();X.beginPath();X.rect(fx?cxp:0,fy?syp:0,fx?PW-cxp:cxp,fy?PH-syp:syp);X.clip();
      X.translate(fx?2*cxp:0,fy?2*syp:0);X.scale(fx?-1:1,fy?-1:1);X.drawImage(src.c,0,0);X.restore()}}
  else if(mode=='tiles'){
    const cols=c.cols,rows=c.rows;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const a0=Math.round(i*PW/cols),a1=Math.round((i+1)*PW/cols),b0=Math.round(j*PH/rows),b1=Math.round((j+1)*PH/rows),tw=a1-a0,th=b1-b0;if(tw<1||th<1)continue;
      X.save();X.translate(i&1?a1:a0,j&1?b1:b0);X.scale(i&1?-1:1,j&1?-1:1);
      if(c.shrink)X.drawImage(src.c,0,0,PW,PH,0,0,tw,th);else X.drawImage(src.c,a0,b0,tw,th,0,0,tw,th);X.restore()}}
  else{   // kaleido
    const n=c.seg,a=TAU/n,rad=Math.hypot(PW,PH),rot=(c.rot+t*c.spin)*DEG;
    X.save();X.translate(PW/2,PH/2);
    for(let i=0;i<n;i++){X.save();
      if(i%2==0)X.rotate(i*a);else{X.rotate((i+1)*a);X.scale(1,-1)}
      X.beginPath();X.moveTo(0,0);X.lineTo(rad,0);X.arc(0,0,rad,0,a+.004);X.closePath();X.clip();
      X.rotate(rot);X.scale(c.zoom,c.zoom);X.drawImage(src.c,-PW/2,-PH/2);X.restore()}
    X.restore()}
  const y0=plane?y0r:0,span=Math.max(1,PH-y0);
  /* 3) волны — смещение строк по горизонтали (сильнее вдали от линии) */
  if(c.wave>0){
    const out=slot('tmp',PW,PH),bh=Math.max(2,Math.round(PH/170)),amp=c.wave*ppu;
    for(let y=Math.floor(y0);y<PH;y+=bh){const u=clamp((y-y0)/span,0,1),ph=TAU*(c.wfreq*Math.pow(u,.8))-t*c.wspd*TAU*.4,
        dx=amp*(.35+.9*u)*(Math.sin(ph)+.45*Math.sin(ph*2.3+1.7-t*c.wspd));
      out.x.drawImage(cur.c,0,y,PW,Math.min(bh,PH-y),dx,y,PW,Math.min(bh,PH-y))}
    cur=out;X=cur.x}
  /* 4) оттенок */
  if(c.tamt>0){X.globalCompositeOperation='source-atop';X.fillStyle=rgb(c.tint,c.tamt);X.fillRect(0,0,PW,PH);X.globalCompositeOperation='source-over'}
  /* 5) блики на воде */
  if(c.shim>0&&plane){
    X.globalCompositeOperation='source-atop';const N=Math.round(10+c.shim*34);
    for(let i=0;i<N;i++){const u=Math.pow(hash(i+.5),1.25),y=y0+u*span,len=PW*(.03+.12*hash(i*5.3)),
        xx=((hash(i*3.1)+t*.012*(hash(i*7.7)-.4)*4)%1+1)%1*(PW+len)-len,
        a=c.shim*(.2+.55*hash(i*2.9))*(.5+.5*Math.sin(t*(1.4+3*hash(i*9.1))+i*2)),th=Math.max(1,PH*.0035*(.6+u*1.4));
      X.fillStyle=`rgba(255,255,255,${a.toFixed(3)})`;X.fillRect(xx,y,len,th)}
    X.globalCompositeOperation='source-over'}
  /* 6) размытие и затухание */
  const bpx=Math.min(40,c.blur*ppu*.01);
  if(bpx>=.6){
    const B=slot('blr',PW,PH);blurInto(B.x,cur.c,bpx,PW,PH);
    if(plane){   // резко у линии → размыто вдали
      X.globalCompositeOperation='destination-in';let g=X.createLinearGradient(0,y0,0,y0+span*.9);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');X.fillStyle=g;X.fillRect(0,0,PW,PH);
      B.x.globalCompositeOperation='destination-in';g=B.x.createLinearGradient(0,y0,0,y0+span*.9);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');B.x.fillStyle=g;B.x.fillRect(0,0,PW,PH);
      X.globalCompositeOperation='source-over';X.drawImage(B.c,0,0)}
    else{X.clearRect(0,0,PW,PH);X.drawImage(B.c,0,0)}}
  if(plane&&c.fade>0){
    X.globalCompositeOperation='destination-in';const g=X.createLinearGradient(0,y0,0,PH);
    g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.45,`rgba(0,0,0,${1-c.fade*.55})`);g.addColorStop(1,`rgba(0,0,0,${1-c.fade})`);X.fillStyle=g;X.fillRect(0,0,PW,PH);X.globalCompositeOperation='source-over'}
  /* 7) мягкие края */
  if(c.feather>0){const rd=!plane&&c.round&&mode!='tiles';X.globalCompositeOperation='destination-in';X.drawImage(featherMask(PW,PH,c.feather,rd,!plane),0,0);X.globalCompositeOperation='source-over'}
  else if(!plane&&c.round&&mode!='tiles'){X.globalCompositeOperation='destination-in';X.drawImage(featherMask(PW,PH,.002,true,true),0,0);X.globalCompositeOperation='source-over'}
  /* 8) на сцену */
  const Rinv=R.inverse();
  gx.save();
  gx.setTransform(T.multiply(Rinv).translate(-nw/2,-nh/2).scale(nw/PW,nh/PH));
  gx.imageSmoothingEnabled=true;gx.globalAlpha=clamp(c.alpha,0,1);gx.globalCompositeOperation=c.glow?'lighter':'source-over';
  gx.drawImage(cur.c,0,0);
  gx.restore();
  /* 9) надстройки: линия горизонта, блик-«шторка», рамка */
  const lw=Math.max(1.2/ppu,.008);
  if(plane&&c.horizon>0){
    gx.save();gx.setTransform(T.multiply(Rinv));gx.globalCompositeOperation='lighter';
    const ay=(sLine/PH)*nh-nh/2,g=gx.createLinearGradient(-nw/2,0,nw/2,0);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.15,'rgba(255,255,255,1)');g.addColorStop(.85,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');
    gx.fillStyle=g;gx.globalAlpha=clamp(c.horizon*.25,0,1);gx.fillRect(-nw/2,ay-lw*3.5,nw,lw*7);
    gx.globalAlpha=clamp(c.horizon,0,1);gx.fillRect(-nw/2,ay-lw*.6,nw,lw*1.2);gx.restore()}
  if(c.sheen>0||c.border>0){
    gx.save();gx.setTransform(T);gx.globalCompositeOperation='lighter';
    const rnd=!plane&&c.round&&mode!='tiles',shape=()=>{gx.beginPath();if(rnd)gx.ellipse(0,0,w/2,h/2,0,0,TAU);else gx.rect(-w/2,-h/2,w,h)};
    if(c.sheen>0){
      gx.save();shape();gx.clip();
      const L=Math.hypot(w,h),bw=c.shw*L,a=c.shang*DEG,dx=Math.cos(a),dy=-Math.sin(a),pos=c.shspd==0?.4:(((t*c.shspd)%1)+1)%1,off=(pos*2-1)*(L/2+bw),
        px=dx*off,py=dy*off,g=gx.createLinearGradient(px-dx*bw/2,py-dy*bw/2,px+dx*bw/2,py+dy*bw/2);
      g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${clamp(c.sheen,0,1)})`);g.addColorStop(1,'rgba(255,255,255,0)');
      gx.fillStyle=g;gx.globalAlpha=.55;gx.fillRect(-w/2,-h/2,w,h);gx.restore()}
    if(c.border>0){
      shape();gx.lineJoin='round';gx.strokeStyle='rgba(255,255,255,1)';
      gx.lineWidth=lw*5;gx.globalAlpha=.1*c.border;gx.stroke();gx.lineWidth=lw*1.6;gx.globalAlpha=.6*c.border;gx.stroke()}
    gx.restore()}
  gx.globalAlpha=1;gx.globalCompositeOperation='source-over'}

const api={mk,norm,draw,PRESETS,MODES,D,LIM,PLANE,
  busy(){if(E.playing())return false;const L=E.objs();let any=false;for(const o of L)if(o.reflect&&o.active!==false&&o.reflect.preview!==false&&animated(norm(o.reflect))){any=true;break}
    if(ST.size>64){const ids=new Set(L.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}return any},
  restart(o){ST.delete(o.id)},
  reset(){ST.clear()}};
return api}
/*RFXCORE-END*/

/* ================= Line Boil (общее ядро с редактором: boil.js) ================= */
/*BOILCORE-BEGIN*/
function makeBoil(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const D={on:true,amp:.03,scale:.5,fps:8,frames:3,seed:1,contour:.7,cw:.12,shake:0,tilt:0,sync:false,preview:true};
const LIM={amp:[0,1],scale:[.05,5],fps:[1,60],frames:[2,8],seed:[1,999],contour:[0,1],cw:[.01,1],shake:[0,.5],tilt:[0,15]};
const PRESETS=[
 {k:'disney',n:'Disney',ico:'✏️',d:{amp:.03,scale:.5,fps:8,frames:3,contour:.7,cw:.12,shake:0,tilt:0}},
 {k:'pencil',n:'Pencil',ico:'✎',d:{amp:.015,scale:.2,fps:12,frames:4,contour:1,cw:.08,shake:0,tilt:0}},
 {k:'wobbly',n:'Wobbly',ico:'🌀',d:{amp:.07,scale:1.2,fps:6,frames:3,contour:0,cw:.12,shake:0,tilt:0}},
 {k:'jitter',n:'Jitter',ico:'⚡',d:{amp:.02,scale:.4,fps:10,frames:3,contour:.5,cw:.1,shake:.02,tilt:1.2}}];
const mk=key=>Object.assign({},D,(PRESETS.find(p=>p.k==key)||PRESETS[0]).d);
function norm(c){
  for(const k in D)if(c[k]===undefined||c[k]===null)c[k]=D[k];
  for(const k in LIM){const v=+c[k];c[k]=isFinite(v)?clamp(v,LIM[k][0],LIM[k][1]):D[k]}
  c.frames=Math.round(c.frames);c.seed=Math.round(c.seed);c.on=c.on!==false;c.sync=!!c.sync;c.preview=c.preview!==false;return c}

/* ---------- шум ---------- */
function hash(a,b,c){let h=Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^Math.imul(c|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
/* гладкое поле значений [-1,1] размером W×H: два слоя value-noise (крупные и мелкие волны) */
function field(W,H,cell,sa,sb){
  const out=new Float32Array(W*H),octs=[[cell,1],[cell*.47,.5]];
  octs.forEach(([cs0,wt],oi)=>{
    const cs=Math.max(2,cs0),nx=Math.ceil(W/cs)+3,ny=Math.ceil(H/cs)+3,lat=new Float32Array(nx*ny);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)lat[j*nx+i]=hash(i,j,sa+oi*7919+sb*104729)*2-1;
    const xi=new Int32Array(W),xf=new Float32Array(W);
    for(let x=0;x<W;x++){const gx=x/cs,i=Math.floor(gx),f=gx-i;xi[x]=i;xf[x]=f*f*(3-2*f)}
    for(let y=0;y<H;y++){
      const gy=y/cs,j=Math.floor(gy),fy0=gy-j,fy=fy0*fy0*(3-2*fy0),r0=j*nx,r1=r0+nx,o=y*W;
      for(let x=0;x<W;x++){const i=xi[x],fx=xf[x],a=lat[r0+i]+(lat[r0+i+1]-lat[r0+i])*fx,b=lat[r1+i]+(lat[r1+i+1]-lat[r1+i])*fx;
        out[o+x]+=(a+(b-a)*fy)*wt}}});
  for(let i=0;i<out.length;i++)out[i]/=1.5;
  return out}
/* «близость к контуру» 0..1: размытая альфа b → 4·b·(1−b) (максимум на самом краю, внутри и далеко снаружи — 0) */
function edgeMask(sd,W,H,r){
  const n=W*H,a=new Float32Array(n),t=new Float32Array(n),w=2*r+1;
  for(let i=0;i<n;i++)a[i]=sd[i*4+3]/255;
  for(let y=0;y<H;y++){const o=y*W;let s=0;for(let x=0;x<=Math.min(r,W-1);x++)s+=a[o+x];
    for(let x=0;x<W;x++){t[o+x]=s/w;const ad=x+r+1,sb=x-r;if(ad<W)s+=a[o+ad];if(sb>=0)s-=a[o+sb]}}
  for(let x=0;x<W;x++){let s=0;for(let y=0;y<=Math.min(r,H-1);y++)s+=t[y*W+x];
    for(let y=0;y<H;y++){const b=s/w;a[y*W+x]=4*b*(1-b);const ad=y+r+1,sb=y-r;if(ad<H)s+=t[ad*W+x];if(sb>=0)s-=t[sb*W+x]}}
  return a}
/* искажение пикселей: sd — исходные RGBA (W×H), ppu — пикселей на unit, f — номер варианта. Возвращает новый RGBA-массив */
function warp(sd,W,H,ppu,c,f){
  const od=new Uint8ClampedArray(W*H*4),cell=Math.max(2,c.scale*ppu),amp=c.amp*ppu,sa=c.seed*131+f*977;
  const fx=field(W,H,cell,sa,1),fy=field(W,H,cell,sa,2),ct=c.contour,em=ct>0?edgeMask(sd,W,H,clamp(Math.round(c.cw*ppu),1,48)):null;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x,p=i*4,k=em?1+(em[i]-1)*ct:1;
    if(k<.003||amp<=0){od[p]=sd[p];od[p+1]=sd[p+1];od[p+2]=sd[p+2];od[p+3]=sd[p+3];continue}
    const px=x+fx[i]*amp*k,py=y+fy[i]*amp*k,x0=Math.floor(px),y0=Math.floor(py),tx=px-x0,ty=py-y0;
    let A=0,R=0,G=0,B=0;
    for(let q=0;q<4;q++){
      const xx=x0+(q&1),yy=y0+(q>>1);if(xx<0||yy<0||xx>=W||yy>=H)continue;
      const wgt=((q&1)?tx:1-tx)*((q>>1)?ty:1-ty),s=(yy*W+xx)*4,al=sd[s+3]*wgt;
      A+=al;R+=sd[s]*al;G+=sd[s+1]*al;B+=sd[s+2]*al}
    if(A>.5){od[p]=R/A;od[p+1]=G/A;od[p+2]=B/A;od[p+3]=A}}
  return od}

/* ---------- кеш вариантов ---------- */
const C=new Map(),MAXPX=640;let fpsMax=0,lastT=0,tick=0,scratch=null;
const SC=()=>scratch||(scratch=document.createElement('canvas'));
const visual=o=>!!(o.img||o.text||o.grad||o.gif||o.video);
/* настройки, действующие на объект: свои или ближайшего родителя; null — эффекта нет (или у объекта нечего рисовать) */
function of(o){
  if(!o||!visual(o)||(o.webv&&!o.img&&!o.text&&!o.grad))return null;
  let p=o;for(let n=0;p&&n<64;n++){if(p.boil)return p.boil.on===false?null:p.boil;p=p.parent!=null&&E.get?E.get(p.parent):null}
  return null}
const active=o=>!!of(o);
/* gx — контекст в локальных осях объекта (y вниз, units); src(ctx) — рисует объект обычным способом; camZ/M — масштаб на экране; sig — подпись содержимого (для кеша).
   Возвращает true, если нарисовал сам; false — нужно рисовать как обычно. */
function draw(gx,o,w,h,src,camZ,M,sig,cfg){
  try{
    cfg=cfg||of(o);if(!cfg)return false;
    const c=norm(cfg),live=!!E.playing()||c.preview!==false,paused=E.paused&&E.paused(),now=E.now();
    const t=paused?lastT:(lastT=now),N=c.frames;
    const pad=c.amp*1.6+c.shake+.02,tw=w+2*pad,th=h+2*pad;
    let ppu=camZ*Math.max(Math.hypot(M[0],M[1]),Math.hypot(M[2],M[3]))*(E.dpr?E.dpr():1);
    ppu=Math.pow(2,Math.round(Math.log2(Math.max(ppu,1e-3))*2)/2);ppu=Math.min(clamp(ppu,6,512),MAXPX/Math.max(tw,th));
    if(!(ppu>=1.5))return false;
    const W=Math.max(2,Math.ceil(tw*ppu)),H=Math.max(2,Math.ceil(th*ppu)),dyn=!!(o.gif||o.video);
    const step=live&&c.fps>0?Math.floor(t/1000*c.fps):0,phase=c.sync?0:Math.floor(hash(o.id|0,c.seed,3)*N),f=live?(((step+phase)%N)+N)%N:0;
    const key=JSON.stringify([c.amp,c.scale,N,c.seed,c.contour,c.cw,w,h,W,H,sig])+(dyn?'|'+step:'');
    let e=C.get(o.id);
    if(!e||e.key!==key){e={key,fr:new Array(N).fill(null),used:0};C.set(o.id,e)}
    e.used=++tick;
    if(!e.fr[f]){
      const sc=SC();if(sc.width!==W||sc.height!==H){sc.width=W;sc.height=H}
      const x=sc.getContext('2d',{willReadFrequently:true});
      x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.clearRect(0,0,W,H);
      x.setTransform(W/tw,0,0,H/th,W/2,H/2);src(x);x.setTransform(1,0,0,1,0,0);
      const id=x.getImageData(0,0,W,H),od=warp(id.data,W,H,Math.sqrt((W/tw)*(H/th)),c,f);
      const oc=document.createElement('canvas');oc.width=W;oc.height=H;
      const ox=oc.getContext('2d'),oi=ox.createImageData(W,H);oi.data.set(od);ox.putImageData(oi,0,0);e.fr[f]=oc}
    if(C.size>48){let old=null;for(const[k,v]of C)if(!old||v.used<old[1].used)old=[k,v];if(old&&old[0]!==o.id)C.delete(old[0])}
    gx.save();
    if(c.shake>0||c.tilt>0){const a=hash(f,c.seed,17)*2-1,b=hash(f,c.seed,29)*2-1,r=hash(f,c.seed,41)*2-1;
      gx.translate(a*c.shake,b*c.shake);gx.rotate(r*c.tilt*Math.PI/180)}
    gx.imageSmoothingEnabled=true;gx.drawImage(e.fr[f],-tw/2,-th/2,tw,th);gx.restore();
    if(live&&c.fps>0&&!paused)fpsMax=Math.max(fpsMax,c.fps);
    return true}
  catch(err){return false}}
return{D,LIM,PRESETS,mk,norm,draw,active,of,warp,
  begin(){fpsMax=0},                                                    // в начале кадра: сбросить «что-то анимируется»
  delay(){return fpsMax?Math.max(8,1000/fpsMax-(lastT%(1000/fpsMax))+1):0},  // через сколько мс нужен следующий кадр (для редактора)
  restart(o){C.delete(o.id)},reset(){C.clear()}}}
/*BOILCORE-END*/
/* ================= Parallax Mover (общее ядро с редактором: parallax.js) ================= */
/*PMVCORE-BEGIN*/
function makePMV(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const D={on:true,preview:false,mx:.8,my:0,ms:1,center:true,dur:4,hold:0,delay:0,phase:0,lag:0,ease:'sine',mode:'pingpong',depth:1};
const LIM={mx:[-20,20],my:[-20,20],ms:[.1,5],dur:[.1,60],hold:[0,30],delay:[0,60],phase:[0,1],lag:[0,1],depth:[0,5]};
const EASES=[['linear','Linear'],['sine','Smooth (Sine)'],['quad','Soft (Quad)'],['cubic','Strong (Cubic)'],['smooth','Smoother'],['back','Overshoot']];
const MODES=[['pingpong','Ping-Pong ⇄'],['loop','Loop ↻'],['once','Once →']];
const PRESETS=[
 {k:'float',n:'Float',ico:'🎈',d:{mx:0,my:.25,ms:1,center:true,dur:2.2,hold:0,lag:0,ease:'sine',mode:'pingpong'}},
 {k:'drift',n:'Drift',ico:'☁️',d:{mx:.8,my:0,ms:1,center:true,dur:4,hold:0,lag:0,ease:'sine',mode:'pingpong'}},
 {k:'breathe',n:'Breathe',ico:'🫧',d:{mx:0,my:0,ms:1.08,center:true,dur:2.6,hold:0,lag:0,ease:'sine',mode:'pingpong'}},
 {k:'dolly',n:'Dolly',ico:'🎬',d:{mx:.3,my:.1,ms:1.25,center:false,dur:5,hold:.5,lag:0,ease:'smooth',mode:'pingpong'}},
 {k:'orbit',n:'Orbit',ico:'🪐',d:{mx:.35,my:.35,ms:1,center:true,dur:3,hold:0,lag:.25,ease:'sine',mode:'pingpong'}},
 {k:'bounce',n:'Bounce',ico:'⛹️',d:{mx:0,my:.5,ms:1,center:false,dur:.55,hold:.08,lag:0,ease:'quad',mode:'pingpong'}}];
const mk=key=>Object.assign({},D,(PRESETS.find(p=>p.k==key)||PRESETS[0]).d);
function norm(c){
  for(const k in D)if(c[k]===undefined||c[k]===null)c[k]=D[k];
  for(const k in LIM){const v=+c[k];c[k]=isFinite(v)?clamp(v,LIM[k][0],LIM[k][1]):D[k]}
  if(!EASES.some(e=>e[0]==c.ease))c.ease=D.ease;if(!MODES.some(m=>m[0]==c.mode))c.mode=D.mode;
  c.on=c.on!==false;c.center=!!c.center;c.preview=c.preview!==false;return c}

/* ---------- математика ---------- */
const EZ={
  linear:s=>s,
  sine:s=>(1-Math.cos(Math.PI*s))/2,
  quad:s=>s<.5?2*s*s:1-Math.pow(-2*s+2,2)/2,
  cubic:s=>s<.5?4*s*s*s:1-Math.pow(-2*s+2,3)/2,
  smooth:s=>s*s*s*(s*(6*s-15)+10),
  back:s=>{const c1=1.70158,c2=c1*1.525;return s<.5?(Math.pow(2*s,2)*((c2+1)*2*s-c2))/2:(Math.pow(2*s-2,2)*((c2+1)*(2*s-2)+c2)+2)/2}};
const period=c=>c.mode=='pingpong'?2*(c.dur+c.hold):c.mode=='loop'?c.dur+c.hold:c.dur;
/* t — секунды от начала цикла → s∈[0,1]: «сколько пути пройдено» (до применения ease) */
function prog(c,t){
  if(c.mode=='once')return clamp(t/c.dur,0,1);
  const per=c.dur+c.hold,T=c.mode=='loop'?per:per*2;let ph=((t%T)+T)%T;
  if(c.mode=='loop')return ph<c.dur?ph/c.dur:1;
  if(ph<per)return ph<c.dur?ph/c.dur:1;
  ph-=per;return 1-(ph<c.dur?ph/c.dur:1)}
/* состояние в момент clock (секунды): {dx,dy} — смещение в units (в пространстве родителя), k — множитель масштаба */
function sample(c,clock){
  const T=period(c),ctr=c.center&&c.mode!='once',f=EZ[c.ease]||EZ.sine,dep=c.depth;
  const t=Math.max(0,clock-c.delay)+c.phase*T+(ctr?c.dur/2:0);   // центрированный путь стартует из середины, т.е. ровно «на своём месте»
  const fx=ctr?f(prog(c,t))-.5:f(prog(c,t)),fy=ctr?f(prog(c,t+c.lag*T))-.5:f(prog(c,t+c.lag*T));
  return{dx:fx*c.mx*dep,dy:fy*c.my*dep,k:Math.max(.01,1+fx*(c.ms-1)*dep)}}

/* ---------- часы и состояние кадра ---------- */
let clock=0,last=0,wasPlay=false,armed=false,anyBusy=false;
function begin(){   // в начале кадра: двинуть часы и выяснить, нужен ли следующий кадр
  const now=E.now(),pl=E.playing(),raw=(now-last)/1000;last=now;
  if(pl!==wasPlay){wasPlay=pl;clock=0}                        // Play / Stop — цикл всегда начинается с начала
  if(E.paused())return void(anyBusy=false);
  if(raw>0&&raw<.25)clock+=raw;                                // долгие паузы (вкладка спала) не перематываем
  anyBusy=false;for(const o of E.objs()){const c=o.pmv;if(c&&c.on!==false&&o.active!==false&&(pl||c.preview!==false)){anyBusy=true;break}}}
/* применить к локальной матрице объекта L=[a,b,c,d,e,f]: смещение — в e,f; масштаб — в a,b,c,d (вокруг центра объекта) */
function loc(o,L){
  const c=o.pmv;if(!c||o.screen)return L;
  const pl=E.playing();if(!(armed||pl)||c.on===false||(!pl&&c.preview===false)||(E.hold&&E.hold()))return L;
  const s=sample(norm(c),clock);if(!s.dx&&!s.dy&&s.k===1)return L;
  return[L[0]*s.k,L[1]*s.k,L[2]*s.k,L[3]*s.k,L[4]+s.dx,L[5]+s.dy]}
return{D,LIM,PRESETS,EASES,MODES,mk,norm,sample,period,loc,begin,
  arm(v){armed=!!v},busy(){return anyBusy},clock(){return clock},reset(){clock=0}}}
/*PMVCORE-END*/


/* ================= Gif (общее ядро с редактором: gif.js) ================= */
/*GIFCORE-BEGIN*/
function makeGif(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const D={frames:[],fps:12,dl:null,loop:true,pp:false,rev:false,speed:1,awake:true,color:'#ffffff',alpha:1,fx:false,fy:false,preview:true};
const LIM={fps:[.5,120],speed:[0,10],alpha:[0,1]};
const HEX=/^#[0-9a-f]{6}$/i;
const mk=()=>JSON.parse(JSON.stringify(D));
function norm(c){
  for(const k in D)if(c[k]===undefined||c[k]===null)c[k]=JSON.parse(JSON.stringify(D[k]));
  if(!Array.isArray(c.frames))c.frames=[];
  for(const k in LIM){const v=+c[k];c[k]=isFinite(v)?clamp(v,LIM[k][0],LIM[k][1]):D[k]}
  if(!HEX.test(c.color))c.color='#ffffff';
  if(c.dl&&(!Array.isArray(c.dl)||c.dl.length!==c.frames.length))c.dl=null;
  return c}
/* порядок показа кадров (ping-pong / reverse) и время начала каждого */
function seqOf(c){const n=c.frames.length,s=[];for(let i=0;i<n;i++)s.push(i);
  if(c.pp&&n>2){for(let i=n-2;i>0;i--)s.push(i);if(!c.loop)s.push(0)}
  if(c.rev)s.reverse();return s}
const q=v=>Math.round(v*1e6)/1e6;   // округление до микросекунд — без «дрожи» float на границах кадров
const durOf=(c,i)=>q(c.dl&&c.dl[i]>0?Math.max(.01,c.dl[i]/1000):1/c.fps);
function timeline(c){const s=seqOf(c);let T=0;const st=s.map(i=>{const a=T;T=q(T+durOf(c,i));return a});return{s,st,T}}
function frameAt(c,t){
  const L=timeline(c);if(!L.s.length)return{i:0,k:0,end:true,L};
  t=q(t);let end=false;if(c.loop){t=q(t%L.T);if(t<0)t=q(t+L.T)}else if(t>=L.T-1e-9){t=L.T;end=true}
  let k=L.s.length-1;if(!end){k=0;for(let j=L.s.length-1;j>=0;j--)if(t+1e-9>=L.st[j]){k=j;break}}
  return{i:L.s[k],k,end,L}}

/* ---------- состояние (время проигрывания) ---------- */
const ST=new Map();
function stOf(o){
  const c=o.gif,pl=!!E.playing();let s=ST.get(o.id);
  if(!s||s.pl!==pl){s={t:0,on:pl?c.awake!==false:true,last:E.now(),pl,manual:false,f:-1};ST.set(o.id,s)}
  return s}
const live=(c,s)=>!!E.playing()||s.manual;   // в редакторе — только после кнопки ▶ в компоненте; в Play / игре — всегда

function size(o){const c=norm(o.gif);for(const id of c.frames){const d=E.dim(id);if(d)return d}return[1,1]}

/* ---------- рисование (локальные оси объекта, y вниз; w × h — размер в единицах сцены) ---------- */
function draw(gx,o,w,h){
  const c=o.gif;if(!c)return;norm(c);
  const st=stOf(o),now=E.now(),dt=clamp((now-st.last)/1000,0,.1);st.last=now;
  if(c.frames.length>1&&live(c,st)&&st.on&&!E.paused()){
    st.t+=dt*c.speed;const T=timeline(c).T;
    if(!c.loop&&st.t>=T){st.t=T;st.on=false}}
  const fa=frameAt(c,st.t);st.f=fa.i;
  const id=c.frames[fa.i],a=id!=null&&E.ast(id);
  if(a&&a.img){
    gx.save();if(c.fx||c.fy)gx.scale(c.fx?-1:1,c.fy?-1:1);
    E.drawImg(gx,{sprite:id,color:c.color,alpha:c.alpha},w,h);gx.restore()}
  else if(E.editor&&!E.playing()){   // пустой Gif — рамка-заглушка
    gx.save();gx.strokeStyle='#9ab';gx.fillStyle='#9ab';gx.lineWidth=.02;gx.setLineDash([.06,.05]);gx.strokeRect(-w/2,-h/2,w,h);gx.setLineDash([]);
    gx.globalAlpha=.7;gx.font=Math.max(.08,Math.min(w,h)*.28)+'px sans-serif';gx.textAlign='center';gx.textBaseline='middle';gx.fillText('GIF',0,0);gx.restore()}
  if(E.onFrame)E.onFrame(o,st,fa)}

const api={mk,norm,draw,size,D,LIM,frameAt,timeline,seqOf,
  busy(){if(E.playing())return false;let any=false;const L=E.objs();
    for(const o of L){if(!o.gif||o.active===false)continue;const c=norm(o.gif),s=ST.get(o.id);
      if(c.frames.length>1&&s&&s.manual&&s.on){any=true;break}}
    if(ST.size>64){const ids=new Set(L.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}return any},
  state(o){return o.gif?stOf(o):null},
  play(o){if(!o.gif)return;const c=norm(o.gif),s=stOf(o),L=timeline(c);if(!c.loop&&s.t>=L.T-1e-6)s.t=0;s.on=true;s.manual=!E.playing();s.last=E.now()},
  pause(o){if(!o.gif)return;stOf(o).on=false},
  stop(o){if(!o.gif)return;const s=stOf(o);s.t=0;s.on=false;s.manual=false},
  setFrame(o,n){if(!o.gif)return;const c=norm(o.gif),s=stOf(o),L=timeline(c);if(!L.s.length)return;
    let k=L.s.indexOf(clamp(Math.round(+n||0),0,c.frames.length-1));if(k<0)k=0;s.t=L.st[k]+1e-4;s.on=false;s.manual=false},
  setSpeed(o,x){if(!o.gif)return;norm(o.gif).speed=clamp(+x||0,0,10)},
  restart(o){ST.delete(o.id)},
  reset(){ST.clear()}};
return api}
/*GIFCORE-END*/

/* ================= Video (общее ядро с редактором: video.js) ================= */
/*VIDCORE-BEGIN*/
function makeVideo(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=v=>Math.round(v*1e6)/1e6;
const D={src:null,clips:null,aclips:null,volume:1,muted:false,loop:false,awake:true,alpha:1,fx:false,fy:false};
let cid=1;const newId=()=>'k'+(cid++)+Math.random().toString(36).slice(2,6);
const mk=src=>{const c=JSON.parse(JSON.stringify(D));c.src=src==null?null:src;return c};
const dur=c=>{const a=E.ast(c.src);return a&&a.vd&&a.vd.dur>0?a.vd.dur:0};
const clipDef=(a,b)=>({id:newId(),a,b,sp:1});                                                    // кусок картинки (дорожка V1)
const audDef=(a,b,lk)=>({id:newId(),a,b,sp:1,vol:1,fi:0,fo:0,mute:false,lk:lk||null,off:0,at:0});  // кусок звука (дорожка A1)
function fitSrc(k,dd){k.a=Math.max(0,+k.a||0);if(dd)k.a=Math.min(k.a,Math.max(0,dd-.04));
  k.b=+k.b>k.a+.02?+k.b:k.a+.02;if(dd)k.b=Math.min(k.b,dd);if(k.b<=k.a)k.a=Math.max(0,k.b-.02)}
/* Модель: clips — картинка, идёт подряд (ripple). aclips — звук, у каждого куска своя позиция:
   • lk=id видеокуска → звук СВЯЗАН: стоит в (начало видеокуска + off) и ездит вместе с ним;
   • lk=null → звук СВОБОДЕН: стоит в at (секунды на таймлайне), двигается сам по себе. */
function norm(c){
  for(const k in D)if(c[k]===undefined)c[k]=D[k];
  c.volume=clamp(+c.volume||0,0,1);c.alpha=clamp(isFinite(+c.alpha)?+c.alpha:1,0,1);
  const dd=dur(c);
  if(!Array.isArray(c.clips)){if(dd){c.clips=[clipDef(0,dd)];c.aclips=null}else return c}   // длина ещё неизвестна — кусок появится, когда ролик прочитается
  if(!Array.isArray(c.aclips))   // миграция проектов до v80: звук жил внутри видеокусков (vol/fi/fo/mute) — выделяем в связанные аудиокуски
    c.aclips=c.clips.map(k=>{const u=audDef(k.a,k.b,k.id);u.sp=+k.sp||1;if(k.vol!==undefined)u.vol=k.vol;u.fi=+k.fi||0;u.fo=+k.fo||0;u.mute=!!k.mute;return u});
  const ids=new Set();
  for(const k of c.clips){
    if(!k.id)k.id=newId();ids.add(k.id);
    k.sp=clamp(+k.sp||1,.25,4);fitSrc(k,dd);delete k.vol;delete k.fi;delete k.fo;delete k.mute}
  for(const u of c.aclips){
    if(!u.id)u.id=newId();
    u.sp=clamp(+u.sp||1,.25,4);u.vol=clamp(isFinite(+u.vol)?+u.vol:1,0,1);fitSrc(u,dd);
    const d=(u.b-u.a)/u.sp;u.fi=clamp(+u.fi||0,0,d);u.fo=clamp(+u.fo||0,0,d);u.mute=!!u.mute;
    u.off=isFinite(+u.off)?+u.off:0;u.at=Math.max(0,isFinite(+u.at)?+u.at:0);
    if(!u.lk||!ids.has(u.lk))u.lk=null}
  return c}
/* таймлайн: видеокуски идут подряд (st/du, vT — конец картинки); as/ad — где стоит каждый звук; T — общая длина (картинка + звук) */
function tl(c){const n=c.clips||[],st=[],du=[],ix=new Map();let T=0;
  for(const k of n){ix.set(k.id,st.length);st.push(T);const d=q((k.b-k.a)/k.sp);du.push(d);T=q(T+d)}
  const as=[],ad=[];let TT=T;
  for(const u of (c.aclips||[])){const d=q((u.b-u.a)/u.sp),j=u.lk!=null?ix.get(u.lk):undefined;
    let s=j!==undefined?q(st[j]+(+u.off||0)):(+u.at||0);if(s<0)s=0;as.push(s);ad.push(d);if(s+d>TT)TT=q(s+d)}
  return{st,du,T:TT,vT:T,as,ad}}
function at(c,t){const n=(c.clips||[]).length,L=tl(c);if(!n)return{k:-1,L,s:0};t=clamp(t,0,L.vT);let k=n-1;
  for(let j=n-1;j>=0;j--)if(t+1e-9>=L.st[j]){k=j;break}
  const cl=c.clips[k];return{k,L,s:clamp(cl.a+(t-L.st[k])*cl.sp,cl.a,cl.b)}}
function gain(c,i,t,L){const u=c.aclips[i];if(!u)return 0;const lo=t-L.as[i],rem=L.ad[i]-lo;let g=u.mute?0:u.vol;
  if(u.fi>0)g*=clamp(lo/u.fi,0,1);if(u.fo>0)g*=clamp(rem/u.fo,0,1);return clamp(g*(c.muted?0:c.volume),0,1)}

/* ---------- состояние проигрывания ----------
   Часы — собственные (s.t идёт по времени), а не по ролику: так звук и картинка независимы и звук может играть без картинки.
   Картинка: один <video> (всегда без звука). Звук: по <audio> на каждый играющий аудиокуск (+ подгрузка за 1 с до старта, чтобы стык не заикался). */
const ST=new Map(),PRE=1;
function killEl(el){try{if(el){el.pause();el.removeAttribute('src');el.load()}}catch(e){}}
function dispose(s){killEl(s.v);if(s.au){s.au.forEach(x=>killEl(x.el));s.au.clear()}}
function stOf(o){const pl=!!E.playing();let s=ST.get(o.id);
  if(s&&s.pl!==pl){dispose(s);ST.delete(o.id);s=null}
  if(!s){s={v:null,src:null,t:0,k:0,vk:-1,on:pl?o.video.awake!==false:false,pl,manual:false,seen:0,go:true,tw:0,resync:false,au:new Map()};ST.set(o.id,s)}
  return s}
let unlocked=false;
if(typeof addEventListener=='function'){const un=()=>{unlocked=true;ST.forEach(s=>{s.au.forEach(x=>{if(x.force){x.el.muted=false;x.force=false}})})};
  ['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,un,{capture:true,passive:true}))}
function mkEl(s,url){
  dispose(s);const v=document.createElement('video');v.playsInline=true;v.preload='auto';v.muted=true;v.setAttribute('playsinline','');
  v.addEventListener('seeked',()=>E.redraw&&E.redraw());v.addEventListener('loadeddata',()=>E.redraw&&E.redraw());
  v.src=url;s.v=v;s.src=url;s.vk=-1;s.go=true}
function mkAud(url){const el=document.createElement('audio');el.preload='auto';el.src=url;return{el,src:url,force:false,live:false,pre:false,last:0}}
function startAud(x){const p=x.el.play();if(p&&p.catch)p.catch(err=>{if(err&&err.name=='NotAllowedError'&&!unlocked){x.el.muted=true;x.force=true;x.el.play().catch(()=>{})}})}
function seekEl(el,t){try{el.currentTime=t}catch(e){}}
function audDrive(c,s,L,run,now){
  const a=E.ast(c.src),url=a&&E.srcOf(a),seen=new Set();
  if(run&&url)c.aclips.forEach((u,i)=>{
    const s0=L.as[i],e0=s0+L.ad[i];if(s.t>=e0||s.t<s0-PRE)return;
    seen.add(u.id);let x=s.au.get(u.id);
    if(!x||x.src!==url){if(x)killEl(x.el);x=mkAud(url);s.au.set(u.id,x)}
    x.last=now;
    if(s.t<s0){   // подготовка: поставить на начало и ждать
      if(!x.pre){x.pre=true;x.live=false;seekEl(x.el,u.a)}
      if(!x.el.paused)x.el.pause();x.el.volume=0;return}
    const want=u.a+(s.t-s0)*u.sp;
    if(x.el.playbackRate!==u.sp){x.el.playbackRate=u.sp;try{x.el.preservesPitch=true}catch(e){}}
    if(!x.live||s.resync){x.live=true;x.pre=false;if(Math.abs(x.el.currentTime-want)>.05)seekEl(x.el,want)}
    else if(Math.abs(x.el.currentTime-want)>.25)seekEl(x.el,want);
    if(x.el.paused&&!x.el.ended)startAud(x);
    x.el.volume=gain(c,i,s.t,L);if(!x.force)x.el.muted=false});
  s.au.forEach((x,id)=>{if(seen.has(id))return;if(!x.el.paused)x.el.pause();x.live=false;x.pre=false;if(now-x.last>3000){killEl(x.el);s.au.delete(id)}})}
function drive(o,c,s,v){
  const L=tl(c),now=E.now(),run=(!!E.playing()||s.manual)&&s.on&&!E.paused();
  if(!run){
    s.tw=now;s.resync=false;if(v&&!v.paused)v.pause();
    const w=at(c,s.t);if(w.k>=0){s.k=w.k;if(v&&v.readyState>0&&!v.seeking&&Math.abs(v.currentTime-w.s)>.02)v.currentTime=w.s}
    audDrive(c,s,L,false,now);return}
  let dt=s.tw?(now-s.tw)/1000:0;s.tw=now;
  if(s.go){s.go=false;dt=0;s.resync=true}if(dt<0||dt>.6)dt=0;
  s.t=q(s.t+dt);
  if(s.t>=L.T-1e-4){
    if(c.loop&&L.T>0){s.t=0;s.resync=true}
    else{s.t=L.T;s.on=false;s.manual=false;s.resync=false;if(v&&!v.paused)v.pause();audDrive(c,s,L,false,now);if(E.onEnd)E.onEnd(o);return}}
  if(v){
    const w=at(c,s.t);
    if(w.k>=0&&s.t<L.vT-1e-4){
      const cl=c.clips[w.k],chg=s.vk!==w.k||s.resync;s.k=w.k;s.vk=w.k;v.muted=true;
      if(v.playbackRate!==cl.sp){v.playbackRate=cl.sp;try{v.preservesPitch=true}catch(e){}}
      if(chg){if(Math.abs(v.currentTime-w.s)>(s.resync?.02:.08))v.currentTime=w.s}
      else if(!v.seeking&&Math.abs(v.currentTime-w.s)>.3)v.currentTime=w.s;
      if(v.paused&&!v.ended&&!v.seeking){const p=v.play();if(p&&p.catch)p.catch(()=>{})}}
    else{s.vk=-1;if(!v.paused)v.pause()}}   // картинка кончилась, а звук ещё идёт — последний кадр остаётся
  audDrive(c,s,L,true,now);s.resync=false}

function size(o){const c=o.video,a=c&&E.ast(c.src),vd=a&&a.vd;if(!vd||!vd.w)return[1.6,.9];const p=E.ppu(a)||100;return[vd.w/p,vd.h/p]}
function draw(gx,o,w,h){
  const c=o.video;if(!c)return;norm(c);const a=E.ast(c.src),s=stOf(o);s.seen=E.now();let img=null;
  const url=a&&E.srcOf(a),hasV=!!(c.clips&&c.clips.length);
  if(url){if(!s.v||s.src!==url)mkEl(s,url);drive(o,c,s,s.v);if(hasV&&s.v.readyState>=2&&s.v.videoWidth)img=s.v}
  if(!img&&hasV&&a&&E.poster)img=E.poster(a);
  if(img){gx.save();gx.globalAlpha*=c.alpha;if(c.fx||c.fy)gx.scale(c.fx?-1:1,c.fy?-1:1);try{gx.drawImage(img,-w/2,-h/2,w,h)}catch(e){}gx.restore()}
  else if(E.editor&&!E.playing()){gx.save();gx.strokeStyle='#c98a4a';gx.fillStyle='#c98a4a';gx.lineWidth=.02;gx.setLineDash([.06,.05]);gx.strokeRect(-w/2,-h/2,w,h);gx.setLineDash([]);
    gx.globalAlpha=.8;gx.font=Math.max(.08,Math.min(w,h)*.2)+'px sans-serif';gx.textAlign='center';gx.textBaseline='middle';gx.fillText(hasV?'VIDEO':'VIDEO (нет картинки)',0,0);gx.restore()}
  if(E.onFrame)E.onFrame(o,s)}

if(typeof setInterval=='function')setInterval(()=>{const now=E.now();   // объект не рисуется (скрыт / удалён) — не играем «за кадром»
  let ids=null;ST.forEach((s,id)=>{if(now-s.seen>600){if(s.v&&!s.v.paused)s.v.pause();s.au.forEach(x=>{if(!x.el.paused)x.el.pause()})}
    if(now-s.seen>8000){if(!ids)ids=new Set(E.objs().map(o=>o.id));if(!ids.has(id)){dispose(s);ST.delete(id)}}})},300);

const total=c=>tl(c).T;
return{mk,norm,newId,clipDef,audDef,dur,tl,at,gain,D,draw,size,
  state(o){return o.video?stOf(o):null},
  busy(){if(E.playing())return false;for(const o of E.objs()){if(!o.video||o.active===false)continue;const s=ST.get(o.id);if(s&&s.manual&&s.on)return true}return false},
  play(o){if(!o.video)return;const c=norm(o.video),s=stOf(o);if(!(c.clips||[]).length&&!(c.aclips||[]).length)return;if(!c.loop&&s.t>=total(c)-1e-3)s.t=0;s.on=true;s.go=true;s.manual=!E.playing()},
  pause(o){if(!o.video)return;const s=stOf(o);s.on=false;s.manual=false},
  stop(o){if(!o.video)return;const s=stOf(o);s.t=0;s.k=0;s.vk=-1;s.on=false;s.manual=false},
  seek(o,t,keep){if(!o.video)return;const c=norm(o.video),s=stOf(o),L=tl(c);s.t=clamp(+t||0,0,L.T);const w=at(c,s.t);if(w.k>=0)s.k=w.k;s.vk=-1;
    if(keep&&s.on){s.go=true}else{s.on=false;s.manual=false}},
  setVolume(o,x){if(o.video)norm(o.video).volume=clamp(+x||0,0,1)},
  setMuted(o,m){if(o.video)o.video.muted=!!m},
  reset(){ST.forEach(dispose);ST.clear()}}}
/*VIDCORE-END*/
/*WEBVCORE-BEGIN*/
function makeWebVideo(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const nv=(v,d)=>isFinite(+v)?+v:d;
const D={url:'',autoplay:true,loop:true,muted:true,controls:false,volume:1,alpha:1,w:3.2,h:1.8,fit:'contain',fx:false,fy:false,preview:true,
  start:0,end:0,rep:1,speed:1,after:'hold',adapt:'none'};   // + q:[{url,start,end}] — очередь (клипы 2, 3, …); клип 1 = url/start/end
const mk=()=>{const c=Object.assign({},D);c.q=[];return c};
function norm(c){
  for(const k in D)if(c[k]===undefined||c[k]===null)c[k]=D[k];
  if(!Array.isArray(c.q))c.q=[];
  c.url=String(c.url||'');c.volume=clamp(nv(c.volume,1),0,1);c.alpha=clamp(nv(c.alpha,1),0,1);
  c.w=clamp(nv(c.w,D.w),.1,100);c.h=clamp(nv(c.h,D.h),.1,100);
  c.start=clamp(nv(c.start,0),0,86400);c.end=clamp(nv(c.end,0),0,86400);c.rep=clamp(Math.round(nv(c.rep,1)),1,99);c.speed=clamp(nv(c.speed,1),.25,2);
  if(c.fit!='cover'&&c.fit!='stretch')c.fit='contain';
  if(c.after!='hide')c.after='hold';
  if(c.adapt!='first'&&c.adapt!='prev'&&c.adapt!='each')c.adapt='none';return c}

/* ---------- разбор ссылки ---------- */
function parseT(t){t=String(t||'').trim();if(!t)return 0;if(/^\d+$/.test(t))return +t;
  const m=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(t);return m?(+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0):0}
function parse(raw){
  let u=String(raw||'').trim();if(!u)return null;
  if(/^[\w-]{11}$/.test(u)&&!/^\d+$/.test(u))return{kind:'yt',id:u,start:0,ar:16/9};   // голый id ролика
  if(!/^[a-z][a-z0-9+.-]*:/i.test(u)&&/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u))u='https://'+u;   // ссылка без https://
  let U;try{U=new URL(u)}catch(e){return null}
  if(!/^(https?|data|blob):$/.test(U.protocol))return null;
  const h=U.hostname.replace(/^(www|m|music)\./,''),p=U.pathname.split('/').filter(Boolean);let id=null;
  if(h=='youtu.be')id=p[0];
  else if(/(^|\.)youtube(-nocookie)?\.com$/.test(h)){if(p[0]=='watch')id=U.searchParams.get('v');else if(['embed','shorts','live','v'].includes(p[0]))id=p[1]}
  if(id&&/^[\w-]{11}$/.test(id)){const t=U.searchParams.get('t')||U.searchParams.get('start')||((U.hash||'').match(/t=([^&]+)/)||[])[1]||'';return{kind:'yt',id,start:parseT(t),ar:p[0]=='shorts'?9/16:16/9}}
  if(/(^|\.)giphy\.com$/.test(h)&&(p[0]=='gifs'||p[0]=='stickers')){const m=/(?:^|-)([A-Za-z0-9]+)$/.exec(p[p.length-1]||'');if(m&&/(^|\.)giphy\.com$/.test(h))return{kind:'img',url:'https://media.giphy.com/media/'+m[1]+'/giphy.gif'}}
  if(/\.(mp4|webm|ogv|m4v|mov)$/i.test(U.pathname)||/^data:video\//i.test(u))return{kind:'video',url:u};
  return{kind:'img',url:u}}
const PC=new Map();
function parseC(u){u=String(u||'');let r=PC.get(u);if(r===undefined){r=parse(u);if(PC.size>400)PC.clear();PC.set(u,r)}return r}

/* ---------- очередь: клип 1 = url/start/end, дальше q[]. Нераспознанные ссылки пропускаются ---------- */
function items(c){const L=[];
  const add=(url,st,en)=>{url=String(url||'').trim();if(!url)return;const p=parseC(url);if(!p)return;
    st=Math.max(0,nv(st,0));en=Math.max(0,nv(en,0));if(st<=0&&p.kind=='yt')st=p.start|0;if(en<=st)en=0;L.push({p,start:st,end:en})};
  add(c.url,c.start,c.end);if(Array.isArray(c.q))for(const it of c.q)if(it)add(it.url,it.start,it.end);return L}
/* «ручной» режим: отрезок / повторы / несколько клипов — конец клипа ловим сами. Иначе — нативный loop, как раньше */
const manualOf=(c,L,it)=>L.length>1||c.rep>1||it.end>0||(it.start>0&&it.p.kind!='yt');

/* ---------- состояние ---------- */
const ST=new Map();let layer=null,hold=null,lis=false;
const holder=()=>{if(!hold){hold=document.createElement('div');hold.style.cssText='position:fixed;right:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:.02;pointer-events:none;z-index:-1';document.body.appendChild(hold)}return hold};
const layerEl=()=>{if(!layer){layer=document.createElement('div');layer.style.cssText='position:fixed;overflow:hidden;pointer-events:none;z-index:6;display:none';document.body.appendChild(layer)}return layer};
function killIfr(s){if(s.ifr){try{s.ifr.remove()}catch(e){}s.ifr=null}s.loaded=false}
function dispose(s){killIfr(s);if(s.el){try{if(s.el.pause)s.el.pause();s.el.removeAttribute('src');if(s.el.load)s.el.load();s.el.remove()}catch(e){}s.el=null}s.th=null;s.snap=null}
const redraw=()=>{if(E.redraw)E.redraw()};
function mkMedia(s,c){
  const p=s.p;
  if(p.kind=='img'){
    const im=new Image();im.decoding='async';im.referrerPolicy='no-referrer';im.crossOrigin='anonymous';let again=false;
    im.onload=()=>{s.status='ok';if(s.freeze){s.freeze=false;s.on=false}redraw()};
    im.onerror=()=>{if(!again){again=true;im.removeAttribute('crossorigin');im.src=p.url}else{s.status='err';redraw()}};   // без CORS-заголовков картинка всё равно рисуется (просто «грязный» холст)
    im.src=p.url;holder().appendChild(im);s.el=im}
  else if(p.kind=='video'){
    const v=document.createElement('video');v.playsInline=true;v.muted=true;v.preload='auto';v.crossOrigin='anonymous';v.setAttribute('playsinline','');let again=false;
    v.addEventListener('loadeddata',()=>{s.status='ok';redraw()});v.addEventListener('seeked',redraw);
    v.addEventListener('error',()=>{if(!again){again=true;v.removeAttribute('crossorigin');v.src=p.url;v.load()}else{s.status='err';redraw()}});
    v.src=p.url;holder().appendChild(v);s.el=v}
  else if(p.kind=='yt'){
    listen();const im=new Image();im.referrerPolicy='no-referrer';im.onload=redraw;im.src='https://i.ytimg.com/vi/'+p.id+'/mqdefault.jpg';s.th=im;s.status='ok'}}
const curOf=s=>{const L=items(s.c);return L[s.idx]||L[0]||null};
function stOf(o){
  const c=o.webv,L=items(c),pl=!!E.playing();let s=ST.get(o.id);
  let idx=s&&s.pl===pl?s.idx:0;if(idx>=L.length)idx=0;
  const it=L[idx],p=it?it.p:null,key=p?JSON.stringify(p):'';
  if(s&&(s.key!==key||s.pl!==pl)){dispose(s);s=null}
  if(!s){s={key,p,pl,el:null,ifr:null,th:null,snap:null,status:p?'loading':'empty',on:c.autoplay!==false&&(pl||c.preview!==false),seen:0,fseen:0,hid:false,freeze:false,vol:null,
    c,idx,rep:0,done:false,ars:[],n:L.length,clock:0,t:E.now(),dr:0,msgs:0,ct:0,dur:0,ps:-2,quiet:0,sk:false,loaded:false,ew:0,eh:0};
    ST.set(o.id,s);if(p)mkMedia(s,c)}
  s.c=c;s.n=L.length;return s}
function embedUrl(s,c){
  const p=s.p,L=items(c),it=curOf(s),man=it?manualOf(c,L,it):false,st=it?it.start:(p.start|0),
    q=['autoplay='+(s.on?1:0),'mute='+(c.muted?1:0),'controls='+(c.controls?1:0),'rel=0','playsinline=1','modestbranding=1','iv_load_policy=3','enablejsapi=1','fs=0'];
  if(!c.controls)q.push('disablekb=1');if(c.loop&&!man){q.push('loop=1');q.push('playlist='+p.id)}if(st>0)q.push('start='+(st|0));
  try{if(/^https?:$/.test(location.protocol))q.push('origin='+encodeURIComponent(location.origin))}catch(e){}
  return'https://www.youtube.com/embed/'+p.id+'?'+q.join('&')}
function cmd(s,func,args){if(s.ifr&&s.ifr.contentWindow)try{s.ifr.contentWindow.postMessage(JSON.stringify({event:'command',func,args:args||[]}),'*')}catch(e){}}
/* подписка на состояние плеера YouTube (currentTime / playerState) — по нему узнаём, что отрезок закончился */
function ytHello(s){const w=s.ifr&&s.ifr.contentWindow;if(!w)return;
  try{w.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*');w.postMessage(JSON.stringify({event:'command',func:'addEventListener',args:['onStateChange']}),'*')}catch(e){}}
const ytRate=s=>{if(s.c&&s.c.speed!=1)cmd(s,'setPlaybackRate',[s.c.speed])};
function listen(){if(lis||typeof addEventListener!='function')return;lis=true;addEventListener('message',onMsg)}
function onMsg(ev){let d=ev&&ev.data;if(typeof d=='string'){if(d.charCodeAt(0)!==123)return;try{d=JSON.parse(d)}catch(e){return}}
  if(!d||typeof d!='object'||!d.event)return;
  ST.forEach(s=>{if(!s.ifr||ev.source!==s.ifr.contentWindow)return;s.msgs++;const i=d.info;
    if(d.event=='onStateChange'&&typeof i=='number')s.ps=i;
    else if(i&&typeof i=='object'){if(typeof i.playerState=='number')s.ps=i.playerState;if(typeof i.currentTime=='number')s.ct=i.currentTime;if(typeof i.duration=='number'&&i.duration>0)s.dur=i.duration}
    ytCheck(s)})}
function ytCheck(s){if(s.done||!s.on||!s.p||s.p.kind!='yt'||!s.ifr||E.now()<s.quiet)return;
  const L=items(s.c),it=L[s.idx];if(!it)return;const man=manualOf(s.c,L,it);
  if(s.ps===0){if(man)clipDone(s);else if(!s.c.loop)finish(s);return}
  if(man&&it.end>0&&s.ps===1&&s.ct>=it.end-.12)clipDone(s)}

/* ---------- очередь: переходы ---------- */
function finish(s){s.done=true;s.on=false;const k=s.p&&s.p.kind;
  if(k=='yt')cmd(s,'pauseVideo');else if(k=='video'&&s.el){try{s.el.pause()}catch(e){}}redraw()}   // after:'hold' — остаётся последний кадр; 'hide' — draw ничего не рисует
function jump(s,idx){const c=s.c,L=items(c);if(!L.length)return;idx=((idx%L.length)+L.length)%L.length;
  const it=L[idx],p=it.p,old=s.p;
  s.idx=idx;s.rep=0;s.done=false;s.clock=0;s.sk=false;s.ps=-2;s.ct=0;s.quiet=E.now()+800;s.hid=false;s.freeze=false;s.key=JSON.stringify(p);s.n=L.length;
  if(p.kind=='yt'&&old&&old.kind=='yt'&&s.ifr&&s.msgs>0){s.p=p;cmd(s,'loadVideoById',[{videoId:p.id,startSeconds:it.start}]);ytRate(s)}   // тот же iframe — без перезагрузки
  else{dispose(s);s.p=p;s.status=p.kind=='yt'?'ok':'loading';mkMedia(s,c)}
  s.on=true;redraw()}
function replay(s){const it=curOf(s);if(!it)return;const k=it.p.kind;s.clock=0;s.sk=k=='video';s.ct=0;s.ps=-2;s.quiet=E.now()+800;s.on=true;
  if(k=='yt'){cmd(s,'seekTo',[it.start,true]);cmd(s,'playVideo')}
  else if(k=='video'&&s.el){try{s.el.currentTime=it.start}catch(e){}const q=s.el.play();if(q&&q.catch)q.catch(()=>{})}
  else if(k=='img'){dispose(s);s.p=it.p;s.status='loading';mkMedia(s,s.c)}}   // GIF проигрывается заново только перезагрузкой
function clipDone(s){const c=s.c,L=items(c);if(!L.length)return;s.quiet=E.now()+800;
  if(s.rep+1<c.rep){s.rep++;replay(s);return}
  s.rep=0;
  if(s.idx+1<L.length){jump(s,s.idx+1);return}
  if(c.loop){if(L.length>1)jump(s,0);else replay(s);return}
  finish(s)}
function tick(s,now){
  const dt=Math.min(.25,Math.max(0,(now-s.t)/1000));s.t=now;
  if(!s.c||!s.p||s.done||!s.on||E.paused()||now-s.seen>250)return;
  const L=items(s.c),it=L[s.idx];if(!it)return;const man=manualOf(s.c,L,it),k=s.p.kind;
  if(k=='video'){const e=s.el;if(!e||s.status!='ok')return;
    if(e.playbackRate!=s.c.speed)try{e.playbackRate=s.c.speed}catch(x){}
    if(!s.sk&&e.readyState>=1){s.sk=true;if(it.start>0)try{e.currentTime=it.start}catch(x){}}
    if(!man){if(s.sk&&e.ended&&!s.c.loop)finish(s);return}
    if(s.sk&&(e.ended||(it.end>0&&e.currentTime>=it.end-.04)))clipDone(s)}
  else if(k=='img'){if(s.status!='ok'||!man)return;s.clock+=dt;if(s.clock>=(it.end>0?it.end:3))clipDone(s)}   // у GIF длительность неизвестна: End = «сколько секунд показывать», по умолчанию 3
  else if(k=='yt'){if(!s.ifr||!s.loaded)return;s.clock+=dt;
    if(man&&!s.msgs&&it.end>0&&s.clock>=(it.end-it.start)/s.c.speed+.8)clipDone(s)}}   // запасной таймер, если плеер не присылает состояние

function place(s,c,w,h,M,sx,sy,cam){
  const b=E.box();if(!b)return;const L=layerEl();
  L.style.display='block';L.style.left=(b.cx+b.x)+'px';L.style.top=(b.cy+b.y)+'px';L.style.width=b.w+'px';L.style.height=b.h+'px';
  if(!s.ifr){const f=document.createElement('iframe');f.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    f.setAttribute('frameborder','0');f.style.cssText='position:absolute;border:0;background:#000;transform-origin:50% 50%';f.src=embedUrl(s,c);
    if(f.addEventListener)f.addEventListener('load',()=>{if(s.ifr!==f)return;s.loaded=true;ytHello(s);ytRate(s);
      const re=()=>{if(s.ifr===f&&!s.msgs){ytHello(s);ytRate(s)}};setTimeout(re,600);setTimeout(re,1800)});
    L.appendChild(f);s.ifr=f;s.loaded=false;s.clock=0}
  const f=s.ifr,z=cam.z,fl=(c.fx?' scaleX(-1)':'')+(c.fy?' scaleY(-1)':'');
  f.style.display='block';f.style.width=(w*z)+'px';f.style.height=(h*z)+'px';f.style.left=(sx(M[4])-b.x-w*z/2)+'px';f.style.top=(sy(M[5])-b.y-h*z/2)+'px';
  f.style.transform='matrix('+M[0]+','+(-M[1])+','+(-M[2])+','+M[3]+',0,0)'+fl;f.style.opacity=c.alpha;f.style.pointerEvents=c.controls?'auto':'none';
  s.fseen=E.now();if(s.hid){s.hid=false;if(s.on)cmd(s,'playVideo')}}
function fit(gx,im,nw,nh,w,h,c){
  gx.save();if(c.fx||c.fy)gx.scale(c.fx?-1:1,c.fy?-1:1);
  if(c.fit=='stretch'||!nw||!nh)gx.drawImage(im,-w/2,-h/2,w,h);
  else{const k=c.fit=='cover'?Math.max(w/nw,h/nh):Math.min(w/nw,h/nh),dw=nw*k,dh=nh*k;
    if(c.fit=='cover'){gx.beginPath();gx.rect(-w/2,-h/2,w,h);gx.clip()}gx.drawImage(im,-dw/2,-dh/2,dw,dh)}
  gx.restore()}
function holdBox(gx,w,h,txt,col){
  gx.save();gx.strokeStyle=col;gx.fillStyle=col;gx.lineWidth=.02;gx.setLineDash([.06,.05]);gx.strokeRect(-w/2,-h/2,w,h);gx.setLineDash([]);
  gx.globalAlpha*=.85;gx.font=Math.max(.08,Math.min(w,h)*.12)+'px sans-serif';gx.textAlign='center';gx.textBaseline='middle';gx.fillText(txt,0,0);gx.restore()}
function snapOf(s){if(s.snap||!s.el)return;const e=s.el,nw=e.naturalWidth,nh=e.naturalHeight;if(!nw)return;
  try{const cv=document.createElement('canvas');cv.width=nw;cv.height=nh;cv.getContext('2d').drawImage(e,0,0);s.snap=cv}catch(err){}}

/* ---------- пропорции клипов и подгонка рамки ---------- */
function curAr(s){const p=s.p;if(!p)return 0;if(p.kind=='yt')return p.ar||16/9;const e=s.el;if(!e||s.status!='ok')return 0;
  const nw=e.naturalWidth||e.videoWidth,nh=e.naturalHeight||e.videoHeight;return nw&&nh?nw/nh:0}
/* adapt: none — рамка W×H как есть (клип вписывается по Fit); first — рамка с пропорциями первого клипа; prev — с пропорциями предыдущего; each — под каждый клип.
   Рамка всегда вписана в W×H (больше не становится); в Play размер меняется плавно */
function boxOf(s,c,w,h,dt){
  if(c.adapt=='none'){s.ew=0;return[w,h]}
  const A=s.ars,i=s.idx,nom=w/h;let r;
  if(c.adapt=='first')r=A[0];else if(c.adapt=='prev')r=i>0?A[i-1]:(A[s.n-1]||A[0]);else r=A[i];
  if(!(r>0))r=A[i]>0?A[i]:nom;
  const tw=r>=nom?w:h*r,th=r>=nom?w/r:h;
  if(E.playing()&&s.ew>0){const k=1-Math.exp(-dt*10);s.ew+=(tw-s.ew)*k;s.eh+=(th-s.eh)*k}else{s.ew=tw;s.eh=th}
  return[s.ew,s.eh]}

/* ---------- рисование (локальные оси объекта, y вниз; w × h — размер в единицах сцены) ---------- */
function draw(gx,o,w0,h0,M,sx,sy,cam,clean){
  const c=norm(o.webv),s=stOf(o),p=s.p,now=E.now();s.seen=now;
  const dts=s.dr?Math.min(.1,Math.max(0,(now-s.dr)/1000)):0;s.dr=now;
  gx.save();gx.globalAlpha*=c.alpha;
  const edit=!!E.editor&&!E.playing();
  const ar=curAr(s);if(ar>0)s.ars[s.idx]=ar;
  const bx=boxOf(s,c,w0,h0,dts),w=bx[0],h=bx[1];
  if(p&&s.done&&c.after=='hide'){if(edit)holdBox(gx,w,h,'скрыто после конца','#9ab');gx.restore();return}
  if(!p){if(edit)holdBox(gx,w,h,'WEB VIDEO · вставьте ссылку','#4fb3ff')}
  else if(p.kind=='yt'){
    const live=E.playing()&&!clean;
    gx.fillStyle='#000';gx.fillRect(-w/2,-h/2,w,h);
    if(live){gx.globalAlpha=1;place(s,c,w,h,M,sx,sy,cam)}
    else{const t=s.th&&s.th.complete&&s.th.naturalWidth?s.th:null;if(t)fit(gx,t,t.naturalWidth,t.naturalHeight,w,h,{fit:'contain',fx:c.fx,fy:c.fy});
      if(edit||clean){const r=Math.min(w,h)*.13;gx.fillStyle='rgba(0,0,0,.6)';gx.beginPath();gx.arc(0,0,r,0,Math.PI*2);gx.fill();
        gx.fillStyle='#fff';gx.beginPath();gx.moveTo(-r*.35,-r*.5);gx.lineTo(r*.6,0);gx.lineTo(-r*.35,r*.5);gx.closePath();gx.fill()}
      if(edit)holdBox(gx,w,h,'','#ff5a5a')}}
  else if(s.status=='ok'&&s.el){
    const e=s.el;
    if(p.kind=='video'){const run=s.on&&!E.paused(),L=items(c),it=L[s.idx],man=it?manualOf(c,L,it):false;
      e.loop=!!c.loop&&!man;e.muted=E.playing()?!!c.muted:true;e.volume=c.volume;
      if(run&&e.paused&&!e.ended){const q=e.play();if(q&&q.catch)q.catch(()=>{})}else if(!run&&!e.paused)e.pause();
      if(e.videoWidth)fit(gx,e,e.videoWidth,e.videoHeight,w,h,c)}
    else{if(s.on&&!E.paused())s.snap=null;else snapOf(s);
      const src=s.snap||e;fit(gx,src,src.naturalWidth||src.width,src.naturalHeight||src.height,w,h,c)}}
  else if(edit)holdBox(gx,w,h,s.status=='err'?'не удалось загрузить':'загрузка…',s.status=='err'?'#ff5a5a':'#9ab');
  gx.restore()}

/* вызывать после отрисовки всех объектов кадра: двигает очередь, прячет iframe тех, кого не рисовали, и убирает мусор */
function end(){const now=E.now(),pl=!!E.playing();let any=false;
  ST.forEach((s,id)=>{
    tick(s,now);
    if(s.ifr){if(!pl){killIfr(s)}else if(now-s.fseen>120){if(s.ifr.style.display!='none'){s.ifr.style.display='none';s.hid=true;cmd(s,'pauseVideo')}}else any=true}
    if(now-s.seen>6000&&!(s.ifr&&pl)){dispose(s);ST.delete(id)}
    else if(s.p&&s.p.kind=='video'&&s.el&&now-s.seen>600&&!s.el.paused)s.el.pause()});
  if(layer)layer.style.display=any?'block':'none'}

const info=o=>{const c=norm(o.webv),p=parse(c.url),L=items(c);if(!c.url.trim()&&!L.length)return{kind:'empty'};if(!p&&!L.length)return{kind:'bad'};
  const s=ST.get(o.id),q=p||L[0].p;return{kind:q.kind,id:q.id,status:s?s.status:'loading',n:L.length,idx:s?s.idx:0,ars:s?s.ars:[]}};
const sizeOf=o=>{const c=norm(o.webv);return[c.w,c.h]};
function native(o){const s=ST.get(o.id);if(!s||!s.p)return null;const e=s.el,ppu=E.ppu||100;
  if(s.p.kind=='yt')return[(s.p.ar||16/9)*1.8,1.8];
  if(!e||s.status!='ok')return null;const nw=e.naturalWidth||e.videoWidth,nh=e.naturalHeight||e.videoHeight;return nw?[nw/ppu,nh/ppu]:null}
const durOf=o=>{const s=ST.get(o.id);if(!s||!s.p)return 0;if(s.p.kind=='video'&&s.el&&isFinite(s.el.duration)&&s.el.duration>0)return s.el.duration;return s.dur>0?s.dur:0};
const api={mk,norm,parse,draw,end,size:sizeOf,info,native,D,items:c=>items(norm(c)),dur:durOf,
  busy(){if(E.playing())return false;for(const o of E.objs()){if(!o.webv||o.active===false)continue;const c=o.webv,s=ST.get(o.id);
      if(s&&s.p&&s.p.kind!='yt'&&s.on&&s.status!='err'&&c.preview!==false&&(s.p.kind=='video'||s.status=='ok'))return true}return false},
  play(o){if(!o.webv)return;const s=stOf(o);if(s.done){jump(s,0);return}s.on=true;s.hid=false;if(s.p&&s.p.kind=='yt')cmd(s,'playVideo');else if(s.p&&s.p.kind=='video'&&s.el){const q=s.el.play();if(q&&q.catch)q.catch(()=>{})}},
  pause(o){if(!o.webv)return;const s=stOf(o);s.on=false;if(s.p&&s.p.kind=='yt')cmd(s,'pauseVideo')},
  stop(o){if(!o.webv)return;const s=stOf(o),k=s.p&&s.p.kind;
    if(s.idx||s.rep||s.done){dispose(s);ST.delete(o.id);const n=stOf(o);n.on=false;if(n.p&&n.p.kind=='img')n.freeze=true;return}   // очередь — назад к первому клипу
    const it=curOf(s),st=it?it.start:0;s.rep=0;
    if(k=='yt'){s.on=false;cmd(s,'seekTo',[st,true]);cmd(s,'pauseVideo')}
    else if(k=='video'&&s.el){s.on=false;s.el.pause();try{s.el.currentTime=st}catch(e){}}
    else if(k=='img'){dispose(s);ST.delete(o.id);const n=stOf(o);n.on=false;n.freeze=true}},   // GIF перезагружается и замирает на первом кадре
  next(o){if(!o.webv)return;const s=stOf(o);jump(s,s.idx+1)},
  prev(o){if(!o.webv)return;const s=stOf(o);jump(s,s.idx-1)},
  goto(o,i){if(!o.webv)return;jump(stOf(o),Math.round(+i)||0)},
  seek(o,t){if(!o.webv)return;const s=stOf(o),k=s.p&&s.p.kind;t=Math.max(0,+t||0);if(k=='yt')cmd(s,'seekTo',[t,true]);else if(k=='video'&&s.el){try{s.el.currentTime=t}catch(e){}}},
  setVolume(o,v){if(!o.webv)return;const c=norm(o.webv);c.volume=clamp(+v||0,0,1);const s=stOf(o);cmd(s,'setVolume',[Math.round(c.volume*100)])},
  setMuted(o,m){if(!o.webv)return;const c=norm(o.webv);c.muted=!!m;cmd(stOf(o),m?'mute':'unMute')},
  setUrl(o,u){if(!o.webv)return;norm(o.webv).url=String(u==null?'':u)},
  restart(o){const s=ST.get(o.id);if(s){dispose(s);ST.delete(o.id)}},
  reset(){ST.forEach(dispose);ST.clear()}};
return api}
/*WEBVCORE-END*/
/*AUDCORE-BEGIN*/
function makeAudio(E){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const nv=(v,d)=>isFinite(+v)?+v:d;
const D={clip:null,awake:true,loop:false,volume:1,pitch:1,muted:false,delay:0,fadeIn:0,spatial:false,minD:2,maxD:12,rolloff:'linear',pan:true};
const mk=()=>Object.assign({},D);
function norm(c){
  for(const k in D)if(c[k]===undefined)c[k]=D[k];
  c.volume=clamp(nv(c.volume,1),0,1);c.pitch=clamp(nv(c.pitch,1),.25,3);c.delay=clamp(nv(c.delay,0),0,600);c.fadeIn=clamp(nv(c.fadeIn,0),0,60);
  c.minD=clamp(nv(c.minD,2),0,1000);c.maxD=clamp(nv(c.maxD,12),0,1000);if(c.maxD<=c.minD)c.maxD=c.minD+.1;if(c.rolloff!=='smooth'&&c.rolloff!=='natural')c.rolloff='linear';return c}

/* ---------- источник звука: dataURL → blob-URL (один раз на ассет), иначе <audio> с мегабайтным data: ест память ---------- */
const BU=new Map();
function srcFor(a){const u=a&&E.srcOf(a);if(!u)return null;if(!/^data:/.test(u))return u;
  if(typeof fetch!='function'||typeof URL=='undefined'||!URL.createObjectURL)return u;
  const key=a.id+':'+u.length;let e=BU.get(key);
  if(!e){e={b:null};BU.set(key,e);fetch(u).then(r=>r.blob()).then(b=>{e.b=URL.createObjectURL(b)}).catch(()=>{e.b=u});return null}   // null = ещё готовится, тик повторит
  return e.b}
function mkEl(url){const el=new Audio();el.preload='auto';el.src=url;try{el.preservesPitch=false;el.mozPreservesPitch=false;el.webkitPreservesPitch=false}catch(e){}return el}   // pitch меняет и скорость, как в Unity

/* ---------- стерео-панорама через WebAudio — только для spatial-источников и только когда это не даст тишины (cross-origin файл даёт нули) ---------- */
let ctx=null;
function getCtx(){if(ctx)return ctx;const AC=typeof AudioContext!='undefined'?AudioContext:typeof webkitAudioContext!='undefined'?webkitAudioContext:null;if(!AC)return null;try{ctx=new AC()}catch(e){ctx=null}return ctx}
function canPan(url){if(/^(blob|data):/i.test(url))return true;if(typeof location=='undefined'||!/^https?:$/.test(location.protocol))return false;try{return new URL(url,location.href).origin===location.origin}catch(e){return false}}
function nodeOf(s,url){if(s.node!==undefined)return s.node;s.node=null;if(!canPan(url))return null;const cx=getCtx();if(!cx||!cx.createStereoPanner)return null;
  try{const src=cx.createMediaElementSource(s.el),g=cx.createGain(),p=cx.createStereoPanner();src.connect(g);g.connect(p);p.connect(cx.destination);s.node={g,p}}catch(e){s.node=null}return s.node}

/* ---------- «игровые» часы: стоят, пока игра на паузе — иначе Delay и Fade In успевали бы пройти, пока звук не играет ---------- */
let pz0=0,pzSum=0;
const vnow=()=>{const n=E.now();return n-pzSum-(pz0?n-pz0:0)};
function clockSync(){const p=!!E.paused(),n=E.now();if(p&&!pz0)pz0=n;else if(!p&&pz0){pzSum+=n-pz0;pz0=0}}

/* ---------- состояние ---------- */
const ST=new Map();let gen=0;
function stOf(o){const pl=!!E.playing();let s=ST.get(o.id);if(s&&s.pl!==pl){kill(s);s=null}
  if(!s){s={pl,el:null,url:null,node:undefined,on:false,ended:false,hold:false,restart:false,t0:0,tryAt:0,gain:1,fade:null,wasAct:false,manual:false,blocked:false,shots:[],gen:0,dist:0};ST.set(o.id,s)}
  return s}
function stopEl(s){s.on=false;s.fade=null;s.restart=false;if(s.el){try{s.el.pause();s.el.currentTime=0}catch(e){}}}
function endShot(x){try{x.pause();x.removeAttribute('src');x.load&&x.load()}catch(e){}}
function dropEl(s){if(s.el){try{s.el.pause();s.el.removeAttribute('src');s.el.load&&s.el.load()}catch(e){}s.el=null;s.url=null;s.node=undefined}}
function kill(s){stopEl(s);s.shots.forEach(endShot);s.shots=[];dropEl(s)}
function startS(s,c){const now=vnow();s.on=true;s.ended=false;s.hold=false;s.restart=true;s.t0=now+c.delay*1000;
  if(c.fadeIn>0){s.gain=0;s.fade={from:0,to:1,t0:s.t0,dur:c.fadeIn*1000,stop:false}}else{s.gain=1;s.fade=null}}
const attOf=(c,d)=>{if(!c.spatial||d<=c.minD)return 1;if(d>=c.maxD)return 0;const t=(d-c.minD)/(c.maxD-c.minD);
  return c.rolloff=='smooth'?1-t*t*(3-2*t):c.rolloff=='natural'?(1-t)*(1-t):1-t};   // linear — прямая; smooth — плавные края; natural — быстро затихает вблизи, «хвост» дальше (как в жизни)

function upd(s,c,url,x,y,L,now){
  if(s.el&&s.url!==url){const was=s.on;dropEl(s);s.on=was;s.restart=true}
  if(!s.el){const el=mkEl(url);s.el=el;s.url=url;s.node=undefined;el.addEventListener&&el.addEventListener('ended',()=>{if(!el.loop&&s.el===el){s.on=false;s.ended=true}})}
  const el=s.el;
  if(s.fade){const f=s.fade,t=f.dur>0?clamp((now-f.t0)/f.dur,0,1):1;s.gain=f.from+(f.to-f.from)*t;
    if(t>=1&&now>=f.t0){s.gain=f.to;const stp=f.stop;s.fade=null;if(stp){stopEl(s);s.hold=false}}}
  const d=Math.hypot(x-L.x,y-L.y);s.dist=d;
  let v=(c.muted?0:c.volume)*s.gain*attOf(c,d),pn=0;
  if(c.spatial)pn=clamp((x-L.x)/Math.max(c.maxD,.001),-1,1)*.9;
  const nd=c.spatial&&c.pan?nodeOf(s,url):s.node;
  if(nd){nd.g.gain.value=v;nd.p.pan.value=c.spatial&&c.pan?pn:0;if(el.volume!==1)el.volume=1}else{const vv=clamp(v,0,1);if(el.volume!==vv)el.volume=vv}
  if(el.playbackRate!==c.pitch)el.playbackRate=c.pitch;
  if(el.loop!==!!c.loop)el.loop=!!c.loop;
  if(!c.loop&&el.ended&&s.on&&!s.restart){s.on=false;s.ended=true}   // restart: Play после конца клипа — не считать его «доигравшим» (el.ended остаётся true до перемотки)
  const want=s.on&&now>=s.t0&&!E.paused();
  if(want){
    if(s.restart){s.restart=false;try{el.currentTime=0}catch(e){}}
    if(el.error){s.on=false;return}   // файл не декодируется — не мучаем play()
    if(el.paused&&!s.blocked&&now>=s.tryAt){const p=el.play();
      if(p&&p.catch)p.catch(err=>{if(err&&err.name=='NotAllowedError')s.blocked=true;else s.tryAt=vnow()+300})}}   // браузер не дал автозапуск → ждём первого клика/нажатия; прочие сбои — повтор через 0.3 с
  else if(!el.paused)el.pause()}

/* вызывать после отрисовки кадра с порядком отрисовки OL=[{o,on,M},…]: M[4],M[5] — мировая позиция объекта */
function tick(OL){
  clockSync();const now=vnow(),pl=!!E.playing(),L=E.listener();gen++;
  for(const it of OL){const o=it.o;if(!o||!o.audio)continue;
    const c=norm(o.audio),s=stOf(o);s.gen=gen;
    const act=it.on!==false&&o.active!==false;
    if(!act){if(s.on||(s.el&&!s.el.paused))stopEl(s);s.wasAct=false;s.hold=false;continue}
    if(!pl){if(!s.manual&&(s.on||(s.el&&!s.el.paused)))stopEl(s);continue}   // в редакторе звучит только ручное превью
    if(!s.wasAct){s.wasAct=true;if(c.awake&&c.clip!=null)startS(s,c)}      // включили объект → как Play On Awake
    const a=c.clip!=null?E.ast(c.clip):null;if(!a||!a.audio)continue;
    const url=srcFor(a);if(!url)continue;
    const M=it.M||[1,0,0,1,0,0];upd(s,c,url,M[4],M[5],L,now)}
  ST.forEach((s,id)=>{if(s.gen!==gen){kill(s);ST.delete(id)}})}

/* ---------- превью в редакторе (вне Play): без пространственности, прямо из инспектора ---------- */
function prevApply(o){const s=ST.get(o.id);if(!s||!s.manual||!s.el)return;const c=norm(o.audio);s.el.volume=c.muted?0:c.volume;s.el.playbackRate=c.pitch;s.el.loop=!!c.loop}
function prev(o,n){const c=norm(o.audio);if(c.clip==null)return false;const a=E.ast(c.clip);if(!a||!a.audio)return false;
  const url=srcFor(a);if(!url){if((n|0)<40&&typeof setTimeout=='function')setTimeout(()=>prev(o,(n|0)+1),100);return true}
  const s=stOf(o);if(s.el&&s.url!==url)dropEl(s);
  if(!s.el){const el=mkEl(url);s.el=el;s.url=url;el.addEventListener&&el.addEventListener('ended',()=>{if(s.el===el&&!el.loop)s.manual=false})}
  s.manual=true;prevApply(o);try{s.el.currentTime=0}catch(e){}const p=s.el.play();if(p&&p.catch)p.catch(()=>{s.manual=false});return true}
function prevStop(o){const s=ST.get(o.id);if(!s)return;s.manual=false;stopEl(s)}
const prevInfo=o=>{const s=ST.get(o.id);if(!s||!s.manual||!s.el)return null;const d=s.el.duration;return{pos:s.el.currentTime||0,dur:isFinite(d)&&d>0?d:0}};
function prevSeek(o,f){const s=ST.get(o.id);if(!s||!s.manual||!s.el)return;const d=s.el.duration;if(isFinite(d)&&d>0)try{s.el.currentTime=clamp(+f||0,0,1)*d}catch(e){}}
const prevOn=o=>{const s=ST.get(o.id);return !!(s&&s.manual&&s.el&&!s.el.paused&&!s.el.ended)};

/* ---------- действия (On Click и т.п.) ---------- */
const withC=(o,f)=>{if(!o||!o.audio)return;f(norm(o.audio),stOf(o))};
const unlockAll=()=>{ST.forEach(s=>{s.blocked=false;s.tryAt=0});if(ctx&&ctx.state=='suspended')try{ctx.resume()}catch(e){}};
if(typeof addEventListener=='function')['pointerdown','keydown','touchend','click'].forEach(n=>addEventListener(n,unlockAll,{passive:true,capture:true}));
const api={mk,norm,D,tick,prev,prevStop,prevOn,prevApply,prevInfo,prevSeek,att:attOf,
  play(o){withC(o,(c,s)=>{if(s.hold&&!s.ended&&s.el){s.on=true;s.hold=false;s.t0=0;return}startS(s,c)})},   // после Pause продолжает с того же места
  pause(o){withC(o,(c,s)=>{if(s.on){s.on=false;s.hold=true}})},
  stop(o){withC(o,(c,s)=>{stopEl(s);s.hold=false;s.ended=false})},
  oneShot(o){withC(o,(c,s)=>{if(c.muted||c.clip==null)return;const a=E.ast(c.clip);if(!a||!a.audio)return;const url=srcFor(a);if(!url)return;
    const v=clamp(c.volume*attOf(c,s.dist),0,1);if(v<=0)return;
    const el=mkEl(url);el.volume=v;el.playbackRate=c.pitch;
    const done=()=>{const i=s.shots.indexOf(el);if(i>=0)s.shots.splice(i,1);endShot(el)};el.addEventListener&&el.addEventListener('ended',done);
    s.shots.push(el);if(s.shots.length>12)endShot(s.shots.shift());
    const p=el.play();if(p&&p.catch)p.catch(done)})},   // накладывается на уже играющий звук, не прерывая его
  setVolume(o,v){withC(o,c=>{c.volume=clamp(nv(v,1),0,1)})},
  setPitch(o,v){withC(o,c=>{c.pitch=clamp(nv(v,1),.25,3)})},
  setMuted(o,m){withC(o,c=>{c.muted=!!m})},
  fade(o,to,sec){withC(o,(c,s)=>{s.fade={from:s.gain,to:clamp(nv(to,0),0,1),t0:vnow(),dur:Math.max(0,nv(sec,1))*1000,stop:false}})},
  fadeStop(o,sec){withC(o,(c,s)=>{s.fade={from:s.gain,to:0,t0:vnow(),dur:Math.max(0,nv(sec,1))*1000,stop:true}})},
  isPlaying(o){const s=ST.get(o.id);return !!(s&&s.on)},
  prune(gone){for(const o of E.objs())if(o.audio&&gone.has(o.audio.clip))o.audio.clip=null},
  reset(){ST.forEach(kill);ST.clear();pz0=pzSum=0}};
return api}
/*AUDCORE-END*/
function makeLayout(E){
const DEF={
  v:{type:'v',w:3,h:4,pl:.1,pr:.1,pt:.1,pb:.1,sp:.1,al:'UC',fw:false,fh:false,an:true,ad:.25},
  h:{type:'h',w:4,h:2,pl:.1,pr:.1,pt:.1,pb:.1,sp:.1,al:'ML',fw:false,fh:false,an:true,ad:.25},
  grid:{type:'grid',w:3.4,h:3,pl:.1,pr:.1,pt:.1,pb:.1,cw:1,ch:1,sx:.1,sy:.1,corner:'UL',axis:'h',cons:'cols',cnt:3,al:'UC',fit:'off',an:true,ad:.25}};
const mk=t=>Object.assign({},DEF[t]||DEF.v),norm=L=>{const d=DEF[L.type]||DEF.v;for(const k in d)if(L[k]===undefined)L[k]=d[k];if(L.fit===true||L.fit===false)L.fit='off';return L};
const pick=(m,k,d)=>k in m?m[k]:d,AX=a=>[pick({L:0,C:.5,R:1},String(a)[1],.5),pick({U:0,M:.5,L:1},String(a)[0],0)];   // [по X, по Y]: 0 — лево/верх, 1 — право/низ
const r4=v=>Math.round(v*1e4)/1e4;
// видимый размер ребёнка: bw/bh — без scale, w/h — с ним; rs — можно менять размер (Image / Gradient)
const vis=c=>{const z=E.size(c),f=E.fixed(c);return{bw:z[0],bh:z[1],w:z[0]*(f?1:Math.abs(c.sx)||1e-3),h:z[1]*(f?1:Math.abs(c.sy)||1e-3),rs:!f&&!!(c.img||c.grad),rz:false}};
/* Плавность: данные объекта (x, y, scale) каждый кадр «подтягиваются» к своему месту в раскладке (экспонента, время ≈ L.ad секунд).
   Поэтому объект, который вставили в раскладку, выпихнули из неё, включили / выключили или отпустили после перетаскивания — красиво доезжает сам.
   Пока пользователь держит объект мышью, его не трогаем (E.pressed), а после отпускания он плавно возвращается на место. */
const ST=new Map();let lastT=0,dt=.0167,busy=false;
const ease=(cur,tg,k)=>k>=1||Math.abs(tg-cur)<5e-4?tg:cur+(tg-cur)*k;
function place(c,s,w,h,cx,cy,L){
  const tx=r4(cx),ty=r4(cy);let tsx=c.sx,tsy=c.sy;
  if(s.rz){tsx=r4((c.sx<0?-1:1)*w/s.bw);tsy=r4((c.sy<0?-1:1)*h/s.bh)}
  const st=ST.get(c.id);
  if(st&&E.pressed()&&(c.x!==st.x||c.y!==st.y||c.sx!==st.sx||c.sy!==st.sy)){busy=true;return}   // объект держат мышью — не мешаем
  const k=(L.an!==false&&(+L.ad)>0)?1-Math.exp(-dt*4.6/Math.max(.02,+L.ad)):1;
  const nx=k>=1?tx:r4(ease(c.x,tx,k)),ny=k>=1?ty:r4(ease(c.y,ty,k)),nsx=k>=1?tsx:r4(ease(c.sx,tsx,k)),nsy=k>=1?tsy:r4(ease(c.sy,tsy,k));
  if(c.x!==nx)c.x=nx;if(c.y!==ny)c.y=ny;if(s.rz){if(c.sx!==nsx)c.sx=nsx;if(c.sy!==nsy)c.sy=nsy}
  if(nx!==tx||ny!==ty||(s.rz&&(nsx!==tsx||nsy!==tsy)))busy=true;
  ST.set(c.id,{x:c.x,y:c.y,sx:c.sx,sy:c.sy})}
function linear(o,L,kids){
  const v=L.type=='v',[W,H]=E.size(o),iw=W-L.pl-L.pr,ih=H-L.pt-L.pb,n=kids.length,sp=+L.sp||0,[ax,ay]=AX(L.al);
  const S=kids.map(vis);
  S.forEach(s=>{let w=s.w,h=s.h;
    if(s.rs){if(v){if(L.fw)w=iw;if(L.fh)h=(ih-sp*(n-1))/n}else{if(L.fh)h=ih;if(L.fw)w=(iw-sp*(n-1))/n}}
    if(s.rs&&L.kp&&!(L.fw&&L.fh)){if(w!==s.w&&h===s.h)h=s.h*w/s.w;else if(h!==s.h&&w===s.w)w=s.w*h/s.h}s.rz=s.rs&&(w!==s.w||h!==s.h);s.fw=Math.max(.01,w);s.fh=Math.max(.01,h)});
  const total=S.reduce((a,s)=>a+(v?s.fh:s.fw),0)+sp*(n-1);
  let pos=v?H/2-L.pt-(ih-total)*ay:-W/2+L.pl+(iw-total)*ax;
  kids.forEach((c,i)=>{const s=S[i];let cx,cy;
    if(v){cy=pos-s.fh/2;pos-=s.fh+sp;cx=-W/2+L.pl+(iw-s.fw)*ax+s.fw/2}
    else{cx=pos+s.fw/2;pos+=s.fw+sp;cy=H/2-L.pt-(ih-s.fh)*ay-s.fh/2}
    place(c,s,s.fw,s.fh,cx,cy,L)})}
function grid(o,L,kids){
  const[W,H]=E.size(o),iw=W-L.pl-L.pr,ih=H-L.pt-L.pb,n=kids.length,cw0=Math.max(.01,+L.cw||1),ch0=Math.max(.01,+L.ch||1),gx=+L.sx||0,gy=+L.sy||0,[ax,ay]=AX(L.al),hz=L.axis!='v';let cw=cw0,ch=ch0;if(L.fit=='off'){for(const c of kids){const z=vis(c);if(z.w>cw)cw=z.w;if(z.h>ch)ch=z.h}}
  let cols,rows;
  if(L.cons=='cols'){cols=Math.max(1,Math.round(+L.cnt)||1);rows=Math.ceil(n/cols)}
  else if(L.cons=='rows'){rows=Math.max(1,Math.round(+L.cnt)||1);cols=Math.ceil(n/rows)}
  else if(hz){cols=Math.max(1,Math.floor((iw+gx)/Math.max(.01,cw+gx)));rows=Math.ceil(n/cols)}
  else{rows=Math.max(1,Math.floor((ih+gy)/Math.max(.01,ch+gy)));cols=Math.ceil(n/rows)}
  let uc,ur;if(hz){uc=Math.min(cols,n);ur=Math.ceil(n/uc)}else{ur=Math.min(rows,n);uc=Math.ceil(n/ur)}
  const bw=uc*cw+(uc-1)*gx,bh=ur*ch+(ur-1)*gy,left=-W/2+L.pl+(iw-bw)*ax,top=H/2-L.pt-(ih-bh)*ay;
  kids.forEach((c,i)=>{let col,row;if(hz){col=i%uc;row=Math.floor(i/uc)}else{row=i%ur;col=Math.floor(i/ur)}
    if(L.corner=='UR'||L.corner=='LR')col=uc-1-col;if(L.corner=='LL'||L.corner=='LR')row=ur-1-row;
    const s=vis(c),fm=s.rs?L.fit:'off';s.rz=fm=='stretch'||fm=='contain';let tw=s.w,th=s.h;if(fm=='stretch'){tw=cw;th=ch}else if(fm=='contain'){const kk=Math.min(cw/s.w,ch/s.h);tw=s.w*kk;th=s.h*kk}
    place(c,s,tw,th,left+col*(cw+gx)+cw/2,top-row*(ch+gy)-ch/2,L)})}
// раскладка всех объектов с компонентом layout: родители раньше детей (вложенные раскладки)
function apply(){
  const all=E.objs();let any=false;for(const o of all)if(o.layout){any=true;break}if(!any){if(ST.size)ST.clear();return false}
  const now=E.now(),raw=(now-lastT)/1000;dt=lastT&&raw>0&&raw<.1?raw:.0167;lastT=now;busy=false;
  if(ST.size>all.length*2+16){const ids=new Set(all.map(o=>o.id));for(const k of[...ST.keys()])if(!ids.has(k))ST.delete(k)}
  const km=new Map();for(const c of all)if(c.parent!=null){let a=km.get(c.parent);if(!a)km.set(c.parent,a=[]);a.push(c)}
  const dep=o=>{let n=0;for(let p=o;p&&p.parent!=null&&n<64;p=E.get(p.parent))n++;return n};
  const ls=all.filter(o=>o.layout&&o.active!==false).sort((a,b)=>dep(a)-dep(b));
  for(const o of ls){const L=norm(o.layout),kids=(km.get(o.id)||[]).filter(c=>c.active!==false);if(!kids.length)continue;L.type=='grid'?grid(o,L,kids):linear(o,L,kids)}
  return busy}   // true — что-то ещё едет к своему месту: нужен следующий кадр
return{mk,norm,apply,DEF}}
const LAY=makeLayout({objs:()=>objs,get,size,fixed:o=>!!(o.screen||pureMask(o)),now:()=>performance.now(),pressed:()=>false});
const SV=makeScroll({get,objs:()=>objs,order,size,locM,mulM,wmat,invM,apM,kids:id=>kids.get(id)||[],now:()=>performance.now(),playing:()=>true,paused:()=>false,selSet:()=>new Set(),expMode:()=>false,spr:id=>{const a=ast(id);return a&&a.img||null}});
const PFX=makeParticles({ast,now:()=>performance.now(),playing:()=>true,paused:()=>false,objs:()=>objs});
const RFX=makeReflection({now:()=>performance.now(),playing:()=>true,paused:()=>false,objs:()=>objs});
const BOIL=makeBoil({get:id=>get(id),now:()=>performance.now(),playing:()=>true,paused:()=>false,dpr:()=>DPR});
const PMV=makePMV({objs:()=>objs,now:()=>performance.now(),playing:()=>true,paused:()=>false});PMV.arm(true);
const VIDX=makeVideo({ast,now:()=>performance.now(),playing:()=>true,paused:()=>false,objs:()=>objs,srcOf:a=>a.src,poster:a=>null,ppu:a=>ppuOf(a)});
const WEBV=makeWebVideo({now:()=>performance.now(),editor:false,ppu:PPU,playing:()=>true,paused:()=>false,objs:()=>objs,box:()=>{const r=cvs.getBoundingClientRect();return clipRect?{cx:r.left,cy:r.top,x:clipRect.x,y:clipRect.y,w:clipRect.w,h:clipRect.h}:{cx:r.left,cy:r.top,x:0,y:0,w:r.width,h:r.height}}});
const AUD=makeAudio({now:()=>performance.now(),ast,srcOf:a=>a.src,playing:()=>true,paused:()=>false,objs:()=>objs,listener:()=>({x:cam.x,y:cam.y}),redraw:()=>{}});
const GIFX=makeGif({ast,dim:id=>{const a=ast(id);return a&&a.img&&a.img.width>0?[a.img.width/ppuOf(a),a.img.height/ppuOf(a)]:null},drawImg,now:()=>performance.now(),playing:()=>true,paused:()=>false,objs:()=>objs});

/* ================= вид и отрисовка ================= */
const cvs=$('#c'),g=cvs.getContext('2d');
let view={x:0,y:0,w:8,h:4.5,mode:'height',bg:'#222222'},cam={x:0,y:0,z:100},CW=0,CH=0,DPR=1,clipRect=null;
function layoutView(){
  CW=innerWidth;CH=innerHeight;DPR=Math.min(devicePixelRatio||1,view.dpr>0?view.dpr:2);
  const pw=Math.round(CW*DPR),ph=Math.round(CH*DPR);if(cvs.width!=pw||cvs.height!=ph){cvs.width=pw;cvs.height=ph}
  /* режимы JS Screen: fit / pixel (целый зум) — с полями; expand — без полей, видно всё; cover — заполняет экран; width / height — по стороне */
  let z;const m=view.mode;
  if(m=='fit'||m=='pixel'||m=='expand')z=Math.min(CW/view.w,CH/view.h);else if(m=='cover')z=Math.max(CW/view.w,CH/view.h);else if(m=='width')z=CW/view.w;else z=CH/view.h;
  if(view.maxScale>0)z=Math.min(z,view.maxScale*PPU);
  if(m=='pixel'){const f=z/PPU;z=(f>=1?Math.floor(f):f)*PPU}
  cam={x:view.x,y:view.y,z};
  clipRect=m=='fit'||m=='pixel'?{x:CW/2-view.w*z/2,y:CH/2-view.h*z/2,w:view.w*z,h:view.h*z}:null;
  PS=clipRect||!PIN.size?null:{x:(CW/z-view.w)/2,y:(CH/z-view.h)/2,sw:CW/z/view.w,sh:CH/z/view.h};
  orientCheck()}
/* подсказка «Поверните устройство», если JS Screen требует другую ориентацию */
let rotEl=null;
function orientCheck(){const o=view.orient;
  if(o!='landscape'&&o!='portrait'){if(rotEl)rotEl.style.display='none';return}
  if(!rotEl){rotEl=document.createElement('div');
    rotEl.style.cssText='position:fixed;inset:0;z-index:5;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:'+(view.bgOuter||'#000')+';color:#ddd;font:16px system-ui,sans-serif;text-align:center;padding:24px';
    rotEl.innerHTML='<div style="font-size:48px">\u27F3</div><div>Поверните устройство</div>';document.body.appendChild(rotEl)}
  rotEl.style.display=(o=='landscape'&&CH>CW)||(o=='portrait'&&CW>CH)?'flex':'none'}
const toWorld=e=>{const r=cvs.getBoundingClientRect();return{x:(e.clientX-r.left-CW/2)/cam.z+cam.x,y:-(e.clientY-r.top-CH/2)/cam.z+cam.y}};
function render(){
  g.setTransform(DPR,0,0,DPR,0,0);g.imageSmoothingEnabled=view.smooth!==false;if(view.smooth!==false)g.imageSmoothingQuality='high';
  g.fillStyle=view.bgOuter||'#000';g.fillRect(0,0,CW,CH);
  g.save();if(clipRect){g.beginPath();g.rect(clipRect.x,clipRect.y,clipRect.w,clipRect.h);g.clip()}
  g.fillStyle=view.bg;g.fillRect(0,0,CW,CH);
  const sx=x=>(x-cam.x)*cam.z+CW/2,sy=y=>CH/2-(y-cam.y)*cam.z;
  LAY.apply();PMV.begin();
  const OL=order(),bst=[],flushB=d=>{while(bst.length&&bst[bst.length-1].d>=d){const b=bst.pop();SV.bars(g,b.o,b.M,sx,sy,cam,false)}};SV.begin(OL,false);
  for(const{o,d,on,M}of OL){flushB(d);if(!on)continue;
    const im=btnView(o),[w,h]=size(o,o.img?im:null);
    const hw=w/2,hh=h/2,ax=Math.abs(M[0])*hw+Math.abs(M[2])*hh,ay=Math.abs(M[1])*hw+Math.abs(M[3])*hh,px=sx(M[4]),py=sy(M[5]);
    if(!o.particles&&(px+ax*cam.z<-8||px-ax*cam.z>CW+8||py+ay*cam.z<-8||py-ay*cam.z>CH+8))continue;
    const cl=SV.clip(g,o,sx,sy),gx=cl&&cl.ctx?cl.ctx:g;
    gx.save();gx.transform(M[0]*cam.z,-M[1]*cam.z,M[2]*cam.z,-M[3]*cam.z,px,py);gx.scale(1,-1);
    {const _dr=gq=>{if(o.img&&im)drawImg(gq,im,w,h);
    else if(o.text&&im)window.drawText(gq,o.text,im);
    else if(o.grad)window.drawGrad(gq,o.grad,w,h);
    else if(o.gif)GIFX.draw(gq,o,w,h);
    else if(o.video)VIDX.draw(gq,o,w,h);
    else if(o.webv)WEBV.draw(gq,o,w,h,M,sx,sy,cam,false)};
    const _bc=BOIL.of(o);if(!(_bc&&BOIL.draw(gx,o,w,h,_dr,cam.z,M,JSON.stringify([im,o.grad]),_bc)))_dr(gx)}
    gx.restore();if(o.particles)PFX.draw(gx,o,M,sx,sy,cam,CW,CH);if(o.reflect)RFX.draw(gx,o,M,sx,sy,cam,CW,CH);if(cl)SV.endClip(g,cl);if(o.scrollv)bst.push({d,o,M})}
  flushB(-1);
  WEBV.end();
  AUD.tick(OL);
  g.restore()}
function frame(){
  const now=performance.now();
  for(const{o,on}of order()){if(!on){run.pl.delete(o.id);continue}if(!o.animator)continue;const p=player(o);if(!p){run.pl.delete(o.id);continue}if(!rtTick(p,now))run.pl.delete(o.id)}
  goTick(now);mcTick();
  render();requestAnimationFrame(frame)}

/* ================= ввод (мышь и касания) ================= */
function bindInput(){
  cvs.addEventListener('pointerdown',e=>{if(e.button)return;cvs.setPointerCapture&&cvs.setPointerCapture(e.pointerId);
    const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;run.down=live(o)?o.id:null;SV.down(toWorld(e),e.clientX,e.clientY);e.preventDefault()});
  cvs.addEventListener('pointermove',e=>{if(SV.move(toWorld(e),e.clientX,e.clientY)){run.down=null;run.hover=null;return}
    if(e.pointerType!='mouse'&&run.down==null)return;const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;cvs.style.cursor=live(o)?'pointer':''});
  const up=e=>{SV.up();const id=run.down;run.down=null;
    if(id!=null){const o=handler(rayHit(toWorld(e)));run.hover=o?o.id:null;if(o&&o.id==id)fire(o)}
    if(e.pointerType!='mouse')run.hover=null};
  cvs.addEventListener('pointerup',up);
  cvs.addEventListener('pointercancel',()=>{SV.up();run.down=null;run.hover=null});
  cvs.addEventListener('wheel',e=>{const k=e.deltaMode==1?1/3:e.deltaMode==2?1:1/100;if(SV.wheel(toWorld(e),e.deltaX*k,e.deltaY*k,e.shiftKey))e.preventDefault()},{passive:false});
  cvs.addEventListener('pointerleave',e=>{if(e.pointerType=='mouse')run.hover=null});
  cvs.addEventListener('contextmenu',e=>e.preventDefault());
  // вкладка была скрыта — сдвигаем таймеры анимации, чтобы они не «перескакивали»
  let hid=0;document.addEventListener('visibilitychange',()=>{if(document.hidden)hid=performance.now();else if(hid){const d=performance.now()-hid;hid=0;run.pl.forEach(p=>{p.t0+=d;if(p.x)p.x.t0+=d})}});
  addEventListener('resize',layoutView)}

/* ================= сцена загрузки ================= */
/*LOADCORE-BEGIN*/
const LD_FM=['h','v','r90','r180','r360'];
const LD_DEF=()=>({on:false,min:0,bg:{color:'#14161c',sprite:null,fit:'cover'},logo:{sprite:null,x:0,y:-110,h:240,alpha:1},
  bar:{sprite:null,color:'#5aa0ff',x:0,y:260,w:640,h:20,alpha:1,fm:'h',fo:0,fc:true,empty:.25}});
function loadNorm(c){
  const D=LD_DEF(),n=(v,d,a,b)=>{v=+v;return isFinite(v)?Math.max(a,Math.min(b,v)):d},col=(v,d)=>/^#[0-9a-f]{3,8}$/i.test(v||'')?v:d,id=v=>v==null||v===''?null:v;
  c=c||{};const bg=c.bg||{},lg=c.logo||{},br=c.bar||{},o={on:!!c.on,min:n(c.min,0,0,10),bg:{},logo:{},bar:{}};
  o.bg={color:col(bg.color,D.bg.color),sprite:id(bg.sprite),fit:bg.fit=='contain'||bg.fit=='stretch'?bg.fit:'cover'};
  o.logo={sprite:id(lg.sprite),x:n(lg.x,D.logo.x,-3000,3000),y:n(lg.y,D.logo.y,-3000,3000),h:n(lg.h,D.logo.h,4,3000),alpha:n(lg.alpha,1,0,1)};
  o.bar={sprite:id(br.sprite),color:col(br.color,D.bar.color),x:n(br.x,D.bar.x,-3000,3000),y:n(br.y,D.bar.y,-3000,3000),w:n(br.w,D.bar.w,4,3000),h:n(br.h,D.bar.h,2,3000),alpha:n(br.alpha,1,0,1),
    fm:LD_FM.includes(br.fm)?br.fm:'h',fo:Math.max(0,Math.round(n(br.fo,0,0,3))),fc:br.fc!==false,empty:n(br.empty,D.bar.empty,0,1)};
  if(typeof bg.src=='string')o.bg.src=bg.src;if(typeof lg.src=='string')o.logo.src=lg.src;if(typeof br.src=='string')o.bar.src=br.src;return o}
/* Рисует сцену в CSS-пикселях W×H (контекст уже отмасштабирован под dpr). im = {bg,logo,bar} — готовые картинки/канвасы, p — прогресс 0…1, fc — fillClip из Image·Filled */
function loadDraw(g,W,H,L,im,p,fc){
  const iw=i=>i.naturalWidth||i.width,ih=i=>i.naturalHeight||i.height,s=Math.min(W/1920,H/1080),cx=W/2,cy=H/2;
  g.clearRect(0,0,W,H);g.fillStyle=L.bg.color;g.fillRect(0,0,W,H);
  if(im.bg&&iw(im.bg)&&ih(im.bg)){
    if(L.bg.fit=='stretch')g.drawImage(im.bg,0,0,W,H);
    else{const w=iw(im.bg),h=ih(im.bg),k=L.bg.fit=='contain'?Math.min(W/w,H/h):Math.max(W/w,H/h);g.drawImage(im.bg,(W-w*k)/2,(H-h*k)/2,w*k,h*k)}}
  if(im.logo&&iw(im.logo)&&ih(im.logo)){
    let lh=L.logo.h*s,lw=lh*iw(im.logo)/ih(im.logo);if(lw>W*.92){const k=W*.92/lw;lw*=k;lh*=k}   // на узком экране логотип не вылезает за края
    g.save();g.globalAlpha=L.logo.alpha;g.drawImage(im.logo,cx+L.logo.x*s-lw/2,cy+L.logo.y*s-lh/2,lw,lh);g.restore()}
  const b=L.bar,bw=Math.min(b.w*s,W*.92),bh=Math.max(1,b.h*s),shape=()=>{if(im.bar&&iw(im.bar))g.drawImage(im.bar,-bw/2,-bh/2,bw,bh);else{g.fillStyle=b.color;g.fillRect(-bw/2,-bh/2,bw,bh)}};
  g.save();g.translate(cx+b.x*s,cy+b.y*s);
  if(b.empty>0){g.globalAlpha=b.alpha*b.empty;shape()}                    // «дорожка» — та же картинка, но бледная
  g.globalAlpha=b.alpha;g.save();if(fc&&fc(g,bw,bh,{fm:b.fm,fo:b.fo,fa:Math.max(0,Math.min(1,p)),fc:b.fc}))shape();g.restore();
  g.restore()}
/* Экспортированная страница: рисует сцену на <canvas id="lc"> внутри #load, плавно подтягивает полоску к реальному прогрессу.
   Возвращает {set(p), finish()} или null (нет разметки). finish() ждёт 100%, минимальное время и гасит экран (0.25 с). */
function loadStart(cfg,fc){
  const root=document.getElementById('load'),cv=document.getElementById('lc');if(!root||!cv||!cv.getContext)return null;
  const L=loadNorm(cfg),g=cv.getContext('2d'),im={};let target=0,shown=0,t0=performance.now(),last=t0,alive=true,W=1,H=1;
  const size=()=>{const d=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;cv.width=Math.round(W*d);cv.height=Math.round(H*d);cv.style.width=W+'px';cv.style.height=H+'px';g.setTransform(d,0,0,d,0,0)};
  size();window.addEventListener('resize',size);
  ['bg','logo','bar'].forEach(k=>{const src=L[k]&&L[k].src;if(!src)return;const i=new Image();i.onload=()=>{im[k]=i};i.src=src});
  const tick=now=>{if(!alive)return;const dt=Math.min(.1,(now-last)/1000);last=now;shown+=(target-shown)*(1-Math.exp(-dt*8));if(target>=1&&shown>.999)shown=1;loadDraw(g,W,H,L,im,shown,fc);requestAnimationFrame(tick)};
  requestAnimationFrame(tick);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  return{set(p){target=Math.max(target,Math.min(1,+p||0))},
    async finish(){target=1;
      for(let i=0;shown<1&&!document.hidden&&i<80;i++)await wait(30);               // доезжаем до 100% (в фоновой вкладке rAF стоит — не ждём)
      const rest=L.min*1000-(performance.now()-t0);if(rest>0)await wait(rest);
      root.style.transition='opacity .25s';root.style.opacity='0';await wait(260);alive=false;window.removeEventListener('resize',size)}}}
/*LOADCORE-END*/
/* ================= загрузка ================= */
const loadImg=url=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url});
async function boot(){
  const bar=$('#bar'),msg=$('#msg'),LS=window.U2D_LOADING&&window.U2D_LOADING.on?loadStart(window.U2D_LOADING,fillClip):null;
  let r;try{r=await fetch('game.json',{cache:'no-cache'});G=await r.json()}catch(e){msg.textContent='Не удалось загрузить game.json';return}
  document.title=G.title||'Game';view=Object.assign(view,G.view||{});
  document.body.style.background=view.bgOuter||'#000';
  objs=G.objects||[];objs.forEach(o=>omap.set(o.id,o));buildPins();
  objs.forEach(o=>{if(o.parent!=null&&omap.has(o.parent)){let a=kids.get(o.parent);if(!a)kids.set(o.parent,a=[]);a.push(o)}else roots.push(o)});
  (G.clips||[]).forEach(c=>CL.set(c.id,c));(G.ctls||[]).forEach(k=>CT.set(k.id,k));
  const files=(G.assets||[]).filter(a=>a.file),total=files.length||1;let done=0;const tick=()=>{bar.style.width=Math.round(++done/total*100)+'%';if(LS)LS.set(done/total)};
  await Promise.all(files.map(async a=>{
    if(a.font){try{const ff=new FontFace('U2DFont'+a.id,'url('+a.file+')');await ff.load();document.fonts.add(ff);amap.set(a.id,{id:a.id,name:a.name,font:true,family:'U2DFont'+a.id})}catch(e){console.warn('font',a.name,e)}}
    else if(a.audio){amap.set(a.id,{id:a.id,name:a.name,audio:1,src:a.file,ad:a.ad||{}})}
    else if(a.video){amap.set(a.id,{id:a.id,name:a.name,video:1,src:a.file,vd:a.vd||{},ppu:a.ppu||PPU})}
    else{const img=await loadImg(a.file);if(img)amap.set(a.id,{id:a.id,name:a.name,img,ppu:a.ppu||PPU,mode:a.mode||'single',sprites:a.sprites||[]});else console.warn('image',a.name)}
    tick()}));
  (G.assets||[]).filter(a=>a.parent).forEach(m=>{const p=amap.get(m.parent);if(!p)return;const rc=m.rect,c=document.createElement('canvas');c.width=rc.w;c.height=rc.h;
    c.getContext('2d').drawImage(p.img,rc.x,rc.y,rc.w,rc.h,0,0,rc.w,rc.h);amap.set(m.id,{id:m.id,parent:m.parent,rect:rc,img:c})});
  layoutView();bindInput();if(LS)await LS.finish();$('#load').style.display='none';
  const fs=$('#fs');if(fs&&view.fs!==false&&document.documentElement.requestFullscreen){fs.style.display='block';
    fs.onclick=()=>{if(document.fullscreenElement){document.exitFullscreen();return}
      document.documentElement.requestFullscreen().then(()=>{const o=view.orient;if((o=='landscape'||o=='portrait')&&screen.orientation&&screen.orientation.lock)screen.orientation.lock(o).catch(()=>{})}).catch(()=>{})}}
  goStart();
  window.__game={objs,run,order,get,fire,rayHit,handler,cam:()=>cam,go:{setActive:goSetActive,isEntering:id=>entering.has(id)}};
  requestAnimationFrame(frame)}
boot();
})();
