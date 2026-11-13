'use strict';

const $ = id => document.getElementById(id);
const canvas = $('wheelCanvas');
const ctx = canvas.getContext('2d');
const input = $('expression');
const notice = $('alert-box');
const resultEl = $('result-value');
const INF = Object.freeze({ kind: 'infinity' });
const BOT = Object.freeze({ kind: 'bottom' });
const state = {
  ast: null,
  values: [],
  manualFlipX: false,
  manualFlipY: false,
  automaticMirror: null,
  transition: 0,
  animation: { x: 0, c: 0 },
};
const SAMPLE_STEPS = 20;
const SAMPLE_MIN = -5;
const SAMPLE_MAX = 5;

function isInf(v) { return v === INF; }
function isBot(v) { return v === BOT; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isZero(v) { return isFiniteNumber(v) && v === 0; }
function format(v) {
  if (isInf(v)) return '∞';
  if (isBot(v)) return '⊥ (0/0)';
  if (Math.abs(v) < 1e-10) return '0';
  return Number(v.toPrecision(6)).toString();
}
function add(a,b) {
  if (isBot(a) || isBot(b)) return BOT;
  if (isInf(a) && isInf(b)) return BOT;
  if (isInf(a) || isInf(b)) return INF;
  return a + b;
}
function negate(a) { return isBot(a) ? BOT : isInf(a) ? INF : -a; }
function subtract(a,b) { return add(a,negate(b)); }
function multiply(a,b) {
  if (isBot(a) || isBot(b)) return BOT;
  if ((isInf(a) && isZero(b)) || (isInf(b) && isZero(a))) return BOT;
  if (isInf(a) || isInf(b)) return INF;
  return a * b;
}
function divide(a,b) {
  if (isBot(a) || isBot(b)) return BOT;
  if (isInf(a) && isInf(b)) return BOT;
  if (isInf(b)) return isInf(a) ? BOT : 0;
  if (isInf(a)) return isZero(b) ? BOT : INF;
  if (isZero(b)) return isZero(a) ? BOT : INF;
  return a / b;
}

function tokenize(source) {
  const normalized = source.trim()
    .replaceAll('∞','inf').replaceAll('⊥','bot').replaceAll('×','*')
    .replaceAll('÷','/').replaceAll('−','-').replace(/\s+/g,'');
  const tokens = normalized.match(/inf|bot|[a-z]+|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/gi) || [];
  if (tokens.join('').toLowerCase() !== normalized.toLowerCase()) {
    throw new Error('Símbolo inválido. Use números, x, c, inf, ⊥, parênteses e + − * /.');
  }
  return tokens;
}
function parse(source) {
  const tokens = tokenize(source);
  if (!tokens.length) throw new Error('Digite uma expressão.');
  let i = 0;
  function primary() {
    const token = tokens[i++];
    if (token === undefined) throw new Error('Expressão incompleta.');
    if (token === '(') {
      const node = expression();
      if (tokens[i++] !== ')') throw new Error('Falta fechar parênteses.');
      return node;
    }
    if (token === '-') return {type:'unary',op:'-',child:primary()};
    if (token === '+') return primary();
    if (/^inf$/i.test(token)) return {type:'value',value:INF};
    if (/^bot$/i.test(token)) return {type:'value',value:BOT};
    if (/^[xc]$/i.test(token)) return {type:'variable',name:token.toLowerCase()};
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return {type:'value',value:Number(token)};
    throw new Error(`Valor desconhecido: ${token}`);
  }
  function term() {
    let node = primary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]; node = {type:'binary',op,left:node,right:primary()};
    }
    return node;
  }
  function expression() {
    let node = term();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++]; node = {type:'binary',op,left:node,right:term()};
    }
    return node;
  }
  const ast = expression();
  if (i !== tokens.length) throw new Error(`Token inesperado: ${tokens[i]}`);
  return ast;
}
function variablesIn(node,set=new Set()) {
  if (node.type==='variable') set.add(node.name);
  if (node.child) variablesIn(node.child,set);
  if (node.left) variablesIn(node.left,set);
  if (node.right) variablesIn(node.right,set);
  return set;
}
function evaluateNode(node,vars) {
  if (node.type==='value') return node.value;
  if (node.type==='variable') return vars[node.name];
  if (node.type==='unary') return node.op==='-' ? negate(evaluateNode(node.child,vars)) : evaluateNode(node.child,vars);
  const a=evaluateNode(node.left,vars), b=evaluateNode(node.right,vars);
  if (node.op==='+') return add(a,b);
  if (node.op==='-') return subtract(a,b);
  if (node.op==='*') return multiply(a,b);
  return divide(a,b);
}
function currentVars() { return {x:Number($('xValue').value),c:Number($('cValue').value)}; }
function identifyAutomaticMirror(ast) {
  const isX = node => node && node.type==='variable' && node.name==='x';
  const isOne = node => node && node.type==='value' && node.value===1;
  if (ast.type==='unary' && ast.op==='-' && isX(ast.child)) return 'y';
  if (ast.type==='binary' && ast.op==='/' && isOne(ast.left) && isX(ast.right)) return 'x';
  return null;
}
function updateMirrorUI() {
  $('mirrorHint').textContent = state.automaticMirror==='y'
    ? '−x reflete naturalmente a família no eixo y; o eixo foi destacado automaticamente.'
    : state.automaticMirror==='x'
      ? '1/x reflete naturalmente a família no eixo x; o eixo foi destacado automaticamente.'
      : 'Em −x e 1/x, a família aparece refletida pelo próprio mapeamento.';
  $('flipX').setAttribute('aria-pressed',String(state.manualFlipX));
  $('flipY').setAttribute('aria-pressed',String(state.manualFlipY));
}
function geometry() {
  const w=canvas.width,h=canvas.height;
  return {w,h,cx:w/2,cy:h/2,r:Math.min(w,h)*.365};
}
function mirrorPoint(point,g) {
  return {
    x:state.manualFlipY ? 2*g.cx-point.x : point.x,
    y:state.manualFlipX ? 2*g.cy-point.y : point.y,
    kind:point.kind,
  };
}
function project(value,g) {
  let point;
  if (isInf(value)) point={x:g.cx,y:g.cy-g.r,kind:'inf'};
  else if (isBot(value)) point={x:g.cx,y:g.cy,kind:'bot'};
  else {
    const theta=2*Math.atan(value)-Math.PI/2;
    point={x:g.cx+g.r*Math.cos(theta),y:g.cy-g.r*Math.sin(theta),kind:'real'};
  }
  return mirrorPoint(point,g);
}
function getSamples(ast) {
  const vars=variablesIn(ast), current=currentVars();
  if (!vars.size) return [{parameter:'',value:evaluateNode(ast,current)}];
  const parameter=vars.has('x')?'x':'c';
  return Array.from({length:SAMPLE_STEPS+1},(_,i)=>{
    const amount=SAMPLE_MIN+(SAMPLE_MAX-SAMPLE_MIN)*i/SAMPLE_STEPS;
    const params={...current,[parameter]:amount};
    return {parameter:`${parameter}=${format(amount)}`,value:evaluateNode(ast,params)};
  });
}
function rgbaFor(kind,alpha) {
  const color=isBot(kind)?[255,202,104]:isInf(kind)?[255,119,217]:[104,216,255];
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}
function drawText(text,x,y,color='#dbe7f8',align='center',font='10px sans-serif') {
  ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);
}
function drawBase(g) {
  const {w,h,cx,cy,r}=g;
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createRadialGradient(cx,cy,20,cx,cy,r*2.7);bg.addColorStop(0,'#1c2542');bg.addColorStop(1,'#08121e');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  // Equal x/y scale and a centered circle prevent perspective-like stretching or tilt.
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle='rgba(220,230,255,.72)';ctx.lineWidth=2;ctx.stroke();
  for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,r*i/5,0,Math.PI*2);ctx.strokeStyle='rgba(185,204,235,.13)';ctx.lineWidth=1;ctx.stroke();}
  ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);
  ctx.strokeStyle='rgba(205,220,245,.22)';ctx.lineWidth=1;ctx.stroke();
  if(state.automaticMirror==='y') {ctx.beginPath();ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.strokeStyle='rgba(104,216,255,.7)';ctx.lineWidth=2.2;ctx.stroke();}
  if(state.automaticMirror==='x') {ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.strokeStyle='rgba(255,119,217,.7)';ctx.lineWidth=2.2;ctx.stroke();}
  const north=project(INF,g),south=project(0,g);
  drawText('∞',north.x,north.y-17,'#ff77d9','center','bold 17px Georgia');
  drawText('0',south.x,south.y+17,'#68d8ff','center','13px Georgia');
  const refs=[[-2,'−2'],[-1,'−1'],[-.5,'−½'],[.5,'½'],[1,'1'],[2,'2']];
  refs.forEach(([value,label])=>{const p=project(value,g);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle='#9fb4d0';ctx.fill();const dx=(p.x-cx)/(Math.hypot(p.x-cx,p.y-cy)||1),dy=(p.y-cy)/(Math.hypot(p.x-cx,p.y-cy)||1);drawText(label,p.x+dx*16,p.y+dy*16,'#bdcce1','center','12px Georgia');});
}
function drawCollapseHub(g,phase) {
  const pulse=.78+.22*Math.sin(phase*7), glow=ctx.createRadialGradient(g.cx,g.cy,1,g.cx,g.cy,62*pulse);
  glow.addColorStop(0,'rgba(255,231,184,.95)');glow.addColorStop(.24,'rgba(255,202,104,.58)');glow.addColorStop(1,'rgba(255,202,104,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(g.cx,g.cy,62*pulse,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(g.cx,g.cy,7,0,Math.PI*2);ctx.fillStyle='#ffca68';ctx.fill();
  drawText('⊥ = 0/0',g.cx+15,g.cy+22,'#ffe0a0','left','bold 12px Georgia');
}
function drawInfinityAxis(g) {
  const north=project(INF,g);
  ctx.beginPath();ctx.moveTo(g.cx,g.cy);ctx.lineTo(north.x,north.y);ctx.strokeStyle='#ff77d9';ctx.lineWidth=6;ctx.shadowColor='#ff77d9';ctx.shadowBlur=22;ctx.stroke();ctx.shadowBlur=0;
  const halo=ctx.createRadialGradient(north.x,north.y,1,north.x,north.y,35);halo.addColorStop(0,'rgba(255,119,217,.75)');halo.addColorStop(1,'rgba(255,119,217,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(north.x,north.y,35,0,Math.PI*2);ctx.fill();
}
function draw(values,phase=1) {
  const g=geometry();drawBase(g);
  const points=values.map(item=>({item,p:project(item.value,g)}));
  const allBot=points.length>0&&points.every(({p})=>p.kind==='bot');
  const allInf=points.length>0&&points.every(({p})=>p.kind==='inf');
  if(allBot) drawCollapseHub(g,phase);
  if(allInf) drawInfinityAxis(g);

  const origin=mirrorPoint({x:g.cx,y:g.cy},g);
  points.forEach(({item,p},index)=>{
    const alpha=points.length===1?.92:.25+(index%4)*.1;
    ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle=rgbaFor(p.kind,alpha);ctx.lineWidth=points.length===1?2.5:1.15;ctx.stroke();
  });

  // Label every sampled ray. When many outputs collapse to one place, stagger labels
  // in a small stack with guide lines so the parameter values remain identifiable.
  const occupied=[];
  points.forEach(({item,p},index)=>{
    let dx=p.x-g.cx,dy=p.y-g.cy,len=Math.hypot(dx,dy);
    if(len<1) {dx=0;dy=-1;len=1;}
    let x=g.cx+dx*.79,y=g.cy+dy*.79;
    const collision=occupied.some(q=>Math.hypot(q.x-x,q.y-y)<18);
    if(collision || allBot || allInf) {
      const stackIndex=index-(points.length-1)/2;
      x=p.x+(allBot?35:28);y=p.y+stackIndex*10;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x-7,y);ctx.strokeStyle=rgbaFor(p.kind,.35);ctx.lineWidth=.7;ctx.stroke();
    }
    occupied.push({x,y});
    const label=item.parameter||format(item.value);
    drawText(label,x,y,'#d7e4f5','center','9px ui-monospace, monospace');
  });

  if(state.ast) {
    const value=evaluateNode(state.ast,currentVars()),p=project(value,g);
    ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle=rgbaFor(p.kind,1);ctx.lineWidth=3.5;ctx.shadowColor=rgbaFor(p.kind,1);ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=rgbaFor(p.kind,1);ctx.shadowColor=rgbaFor(p.kind,1);ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;
  }
  ctx.beginPath();ctx.arc(origin.x,origin.y,4,0,Math.PI*2);ctx.fillStyle='#f3eaff';ctx.fill();
}
function samplePoints(samples) { const g=geometry();return samples.map(item=>project(item.value,g)); }
function animateTo(samples,duration=560) {
  if(state.transition) cancelAnimationFrame(state.transition);
  const next=samplePoints(samples),previous=state.values.length===next.length?state.values:next.map(()=>({x:geometry().cx,y:geometry().cy,kind:'real'}));
  const started=performance.now();
  function frame(now) {
    const t=Math.min(1,(now-started)/duration),ease=1-Math.pow(1-t,3);
    const interpolated=next.map((p,i)=>({x:previous[i].x+(p.x-previous[i].x)*ease,y:previous[i].y+(p.y-previous[i].y)*ease,kind:p.kind}));
    draw(interpolated,ease);
    if(t<1) state.transition=requestAnimationFrame(frame);
    else {state.values=next;state.transition=0;draw(samples,1);}
  }
  state.transition=requestAnimationFrame(frame);
}
function updateResult() {
  if(!state.ast)return;
  const vars=currentVars(),result=evaluateNode(state.ast,vars);
  $('xOutput').textContent=format(vars.x);$('cOutput').textContent=format(vars.c);resultEl.textContent=format(result);
}
function updateSamples(animate=false) {
  if(!state.ast)return;
  const samples=getSamples(state.ast);updateResult();
  if(animate) animateTo(samples,230); else {state.values=samplePoints(samples);draw(samples,1);}
}
function runExpression() {
  try {
    const ast=parse(input.value);state.ast=ast;state.automaticMirror=identifyAutomaticMirror(ast);
    updateMirrorUI();
    const vars=variablesIn(ast),value=evaluateNode(ast,currentVars());
    $('operationTitle').textContent=input.value.trim();
    input.setAttribute('aria-invalid','false');
    const samples=getSamples(ast);updateResult();animateTo(samples,700);
    if(isBot(value)) notice.textContent='Resultado ⊥ = 0/0: os raios convergem e colapsam ao centro âmbar. ⊥ é um elemento adicional, fora da reta projetiva.';
    else if(isInf(value)) notice.textContent='Resultado ∞: os raios convergem para o único polo norte, destacado pelo eixo vertical magenta.';
    else if(vars.size) notice.textContent=`Expressão com ${[...vars].join(' e ')}: cada raio está identificado pelo valor amostrado do parâmetro. Ajuste os controles ou inicie a animação opcional.`;
    else notice.textContent=`Resultado ${format(value)}. A expressão numérica é representada pelo raio destacado.`;
  } catch(error) {
    input.setAttribute('aria-invalid','true');notice.textContent=error.message;resultEl.textContent='Expressão inválida';$('operationTitle').textContent='Corrija a expressão';
  }
}
function toggleMirror(axis) {
  if(axis==='x') state.manualFlipX=!state.manualFlipX; else state.manualFlipY=!state.manualFlipY;
  updateMirrorUI();updateSamples(true);
}
function startParameterAnimation(name) {
  const button=$(`animate${name.toUpperCase()}`),slider=$(`${name}Value`);
  if(state.animation[name]) { cancelAnimationFrame(state.animation[name]);state.animation[name]=0;button.textContent=`▶ Animar ${name}`;button.setAttribute('aria-pressed','false');return; }
  button.textContent=`■ Parar ${name}`;button.setAttribute('aria-pressed','true');
  const begin=performance.now(),duration=5200;
  const tick=now=>{
    if(!state.animation[name])return;
    const cycle=((now-begin)%duration)/duration;
    const wave=(1-Math.cos(cycle*Math.PI*2))/2;
    slider.value=String(Number(slider.min)+(Number(slider.max)-Number(slider.min))*wave);
    updateSamples(false);
    state.animation[name]=requestAnimationFrame(tick);
  };
  state.animation[name]=requestAnimationFrame(tick);
}
function stopParameterAnimation(name) {
  if(state.animation[name])cancelAnimationFrame(state.animation[name]);
  state.animation[name]=0;
  const button=$(`animate${name.toUpperCase()}`);button.textContent=`▶ Animar ${name}`;button.setAttribute('aria-pressed','false');
}
$('calculator').addEventListener('submit',event=>{event.preventDefault();runExpression();});
input.addEventListener('input',()=>input.setAttribute('aria-invalid','false'));
document.querySelectorAll('.presets button').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.expression;runExpression();}));
$('xValue').addEventListener('input',()=>{stopParameterAnimation('x');updateSamples(true);});
$('cValue').addEventListener('input',()=>{stopParameterAnimation('c');updateSamples(true);});
$('animateX').addEventListener('click',()=>startParameterAnimation('x'));
$('animateC').addEventListener('click',()=>startParameterAnimation('c'));
$('flipY').addEventListener('click',()=>toggleMirror('y'));
$('flipX').addEventListener('click',()=>toggleMirror('x'));
$('resetView').addEventListener('click',()=>{state.manualFlipX=false;state.manualFlipY=false;updateMirrorUI();updateSamples(true);});
window.addEventListener('beforeunload',()=>{stopParameterAnimation('x');stopParameterAnimation('c');});
state.ast=parse(input.value);state.automaticMirror=identifyAutomaticMirror(state.ast);updateMirrorUI();updateResult();state.values=samplePoints(getSamples(state.ast));draw(getSamples(state.ast),1);
