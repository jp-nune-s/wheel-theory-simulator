'use strict';

const $ = id => document.getElementById(id);
const canvas = $('wheelCanvas');
const ctx = canvas.getContext('2d');
const input = $('expression');
const notice = $('alert-box');
const resultEl = $('result-value');
const INF = Object.freeze({ kind: 'inf' });
const BOT = Object.freeze({ kind: 'bot' });
const state = { flipY: false, flipX: false, ast: null, raf: 0, framePoints: [], targets: [], current: null };
const SAMPLE_COUNT = 41;
const X_MIN = -5, X_MAX = 5;

function isSpecial(v, kind) { return v && v.kind === kind; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isZero(v) { return isNumber(v) && v === 0; }
function format(v) {
  if (v === INF) return '∞';
  if (v === BOT) return '⊥ (0/0)';
  if (Object.is(v, -0) || Math.abs(v) < 1e-10) return '0';
  return Number(v.toPrecision(7)).toString();
}
function add(a,b) {
  if (a === BOT || b === BOT) return BOT;
  if (a === INF && b === INF) return BOT;
  if (a === INF || b === INF) return INF;
  return a + b;
}
function negate(a) { return a === BOT ? BOT : a === INF ? INF : -a; }
function subtract(a,b) { return add(a,negate(b)); }
function multiply(a,b) {
  if (a === BOT || b === BOT) return BOT;
  if ((a === INF && isZero(b)) || (b === INF && isZero(a))) return BOT;
  if (a === INF || b === INF) return INF;
  return a * b;
}
function inverse(a) {
  if (a === BOT) return BOT;
  if (a === INF) return 0;
  if (a === 0) return INF;
  return 1 / a;
}
function divide(a,b) { return multiply(a,inverse(b)); }

function tokenize(source) {
  const normalized = source.trim().replaceAll('∞','inf').replaceAll('⊥','bot').replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-');
  const tokens = normalized.match(/inf|bot|(?:\d+(?:\.\d*)?|\.\d+)|[a-zA-Z]+|[()+*/-]/gi) || [];
  if (tokens.join('').toLowerCase() !== normalized.replace(/\s/g,'').toLowerCase()) throw Error('Símbolo inválido. Use números, x, c, inf, ⊥, parênteses e + − × ÷.');
  return tokens;
}
function parse(source) {
  const tokens = tokenize(source);
  if (!tokens.length) throw Error('Digite uma expressão.');
  let i = 0;
  function primary() {
    const token = tokens[i++];
    if (token === undefined) throw Error('Expressão incompleta.');
    if (token === '(') {
      const node = expression();
      if (tokens[i++] !== ')') throw Error('Falta fechar parênteses.');
      return node;
    }
    if (token === '-') return { type:'unary', op:'-', child:primary() };
    if (token === '+') return { type:'unary', op:'+', child:primary() };
    if (/^inf$/i.test(token)) return { type:'value', value:INF };
    if (/^bot$/i.test(token)) return { type:'value', value:BOT };
    if (/^[xc]$/i.test(token)) return { type:'variable', name:token.toLowerCase() };
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return { type:'value', value:Number(token) };
    throw Error(`Valor desconhecido: ${token}`);
  }
  function term() {
    let node = primary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]; node = { type:'binary', op, left:node, right:primary() };
    }
    return node;
  }
  function expression() {
    let node = term();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++]; node = { type:'binary', op, left:node, right:term() };
    }
    return node;
  }
  const ast = expression();
  if (i !== tokens.length) throw Error(`Token inesperado: ${tokens[i]}`);
  return ast;
}
function evaluateNode(node, vars) {
  if (node.type === 'value') return node.value;
  if (node.type === 'variable') return vars[node.name];
  if (node.type === 'unary') {
    const value = evaluateNode(node.child,vars);
    return node.op === '-' ? negate(value) : value;
  }
  const a = evaluateNode(node.left,vars), b = evaluateNode(node.right,vars);
  if (node.op === '+') return add(a,b);
  if (node.op === '-') return subtract(a,b);
  if (node.op === '*') return multiply(a,b);
  return divide(a,b);
}
function variablesIn(node, found = new Set()) {
  if (node.type === 'variable') found.add(node.name);
  if (node.child) variablesIn(node.child,found);
  if (node.left) variablesIn(node.left,found);
  if (node.right) variablesIn(node.right,found);
  return found;
}
function currentVars() { return { x:Number($('xValue').value), c:Number($('cValue').value) }; }
function geometry() {
  const w=canvas.width,h=canvas.height;
  const r=Math.min(w*.32,(h-150)*.37);
  return {w,h,cx:w*.51,cy:h*.45,r};
}
function project(value,g) {
  const {cx,cy,r}=g;
  if (value === INF) return {x:cx,y:cy-r,kind:'inf'};
  if (value === BOT) return {x:cx,y:cy,kind:'bot'};
  const theta=2*Math.atan(value)-Math.PI/2;
  return {x:cx+r*Math.cos(theta),y:cy-r*Math.sin(theta),kind:'real'};
}
function mirror(p,g) {
  return {x:g.cx+(state.flipY?-1:1)*(p.x-g.cx),y:g.cy+(state.flipX?-1:1)*(p.y-g.cy),kind:p.kind};
}
function mappedPoint(value,g) { return mirror(project(value,g),g); }
function samplesFor(ast) {
  const vars=variablesIn(ast);
  const current=currentVars();
  if (!vars.has('x')) return Array.from({length:SAMPLE_COUNT},()=>evaluateNode(ast,current));
  return Array.from({length:SAMPLE_COUNT},(_,i)=>{
    const x=X_MIN+(X_MAX-X_MIN)*i/(SAMPLE_COUNT-1);
    return evaluateNode(ast,{...current,x});
  });
}
function color(kind,alpha=1) {
  if (kind==='inf') return `rgba(255,119,217,${alpha})`;
  if (kind==='bot') return `rgba(255,202,104,${alpha})`;
  return `rgba(104,216,255,${alpha})`;
}
function drawLabel(text,p,g,opts={}) {
  const {cx,cy}=g, dx=p.x-cx,dy=p.y-cy, len=Math.hypot(dx,dy)||1;
  const x=p.x+(dx/len)*(opts.offset||15), y=p.y+(dy/len)*(opts.offset||15);
  ctx.font=opts.font||'13px Georgia'; ctx.fillStyle=opts.fill||'#c5d7ee';
  ctx.textAlign=x<cx-8?'right':x>cx+8?'left':'center';
  ctx.textBaseline=y<cy?'bottom':'top'; ctx.fillText(text,x,y);
}
function drawWheel(points, progress=1) {
  const g=geometry(),{w,h,cx,cy,r}=g;
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createRadialGradient(cx,cy,20,cx,cy,r*2.7); bg.addColorStop(0,'#1b2440'); bg.addColorStop(1,'#08121e'); ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle='rgba(220,230,255,.72)';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='rgba(185,204,235,.16)';ctx.lineWidth=1;
  for(let i=1;i<=3;i++){ctx.beginPath();ctx.arc(cx,cy,r*i/4,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.strokeStyle='rgba(205,220,245,.25)';ctx.stroke();
  const refValues=[[-2,'−2'],[-1,'−1'],[-.5,'−½'],[0,'0'],[.5,'½'],[1,'1'],[2,'2']];
  for(const [v,label] of refValues){
    const p=mappedPoint(v,g);ctx.beginPath();ctx.moveTo(mirror({x:cx,y:cy},g).x,mirror({x:cx,y:cy},g).y);ctx.lineTo(p.x,p.y);ctx.strokeStyle='rgba(133,160,197,.16)';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle='#9fb4d0';ctx.fill();drawLabel(label,p,g,{offset:13,font:'12px Georgia',fill:'#b9c8dc'});
  }
  const north=mappedPoint(INF,g), south=mappedPoint(0,g);
  ctx.font='bold 17px Georgia';ctx.textAlign='center';ctx.textBaseline=north.y<cy?'bottom':'top';ctx.fillStyle='#ff77d9';ctx.fillText('∞',north.x,north.y+(north.y<cy?-14:14));
  ctx.font='13px Georgia';ctx.fillStyle='#68d8ff';ctx.textBaseline=south.y<cy?'bottom':'top';ctx.fillText('0',south.x,south.y+(south.y<cy?-12:12));
  const eased=1-Math.pow(1-progress,3);
  const drawPoints=points||state.targets;
  if(drawPoints.length){
    drawPoints.forEach((p,i)=>{
      const alpha=.24+(i%5)*.045;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle=color(p.kind,alpha);ctx.lineWidth=1.1;ctx.stroke();
      if(i%5===0){ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,Math.PI*2);ctx.fillStyle=color(p.kind,.9);ctx.fill();}
      if(i%10===0 && p.kind!=='bot') drawLabel(`x=${format(X_MIN+(X_MAX-X_MIN)*i/(SAMPLE_COUNT-1))}`,p,g,{offset:7,font:'10px sans-serif',fill:'#93a6c1'});
    });
  }
  // The selected x gets a prominent ray and marker.
  if(state.ast){
    const val=evaluateNode(state.ast,currentVars()),p=mappedPoint(val,g);
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle=color(p.kind,.98);ctx.lineWidth=3.5;ctx.shadowColor=color(p.kind,.9);ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color(p.kind,1);ctx.shadowColor=color(p.kind,1);ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;
  }
  // Infinity collapse: keep the circle and emphasize its single projective pole with one north-pointing axis.
  const allInf=drawPoints.length>0&&drawPoints.every(p=>p.kind==='inf');
  if(allInf){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(north.x,north.y);ctx.strokeStyle='#ff77d9';ctx.lineWidth=7;ctx.shadowColor='#ff77d9';ctx.shadowBlur=22;ctx.stroke();ctx.shadowBlur=0;}
  // Bottom collapse converges into the center hub. ⊥ remains an exceptional value, separate from the circle.
  const allBot=drawPoints.length>0&&drawPoints.every(p=>p.kind==='bot');
  if(allBot){const glow=ctx.createRadialGradient(cx,cy,1,cx,cy,48);glow.addColorStop(0,'rgba(255,224,160,.96)');glow.addColorStop(.24,'rgba(255,202,104,.58)');glow.addColorStop(1,'rgba(255,202,104,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,48,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(cx,cy,12,0,Math.PI*2);ctx.fillStyle='#ffca68';ctx.fill();ctx.fillStyle='#ffe0a0';ctx.font='bold 12px Georgia';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('⊥ = 0/0',cx+17,cy);}
  ctx.beginPath();ctx.arc(cx,cy,3.5,0,Math.PI*2);ctx.fillStyle='#f2eaff';ctx.fill();
}
function getTargetPoints(ast) { const g=geometry();return samplesFor(ast).map(v=>mappedPoint(v,g)); }
function animateTo(targets) {
  if(state.raf) cancelAnimationFrame(state.raf);
  const starts=state.framePoints.length===targets.length?state.framePoints:targets.map(()=>({x:geometry().cx,y:geometry().cy,kind:'real'}));
  const startTime=performance.now(),duration=620;
  function frame(now){
    const t=Math.min(1,(now-startTime)/duration),ease=1-Math.pow(1-t,3);
    state.framePoints=targets.map((p,i)=>({x:starts[i].x+(p.x-starts[i].x)*ease,y:starts[i].y+(p.y-starts[i].y)*ease,kind:t>.8?p.kind:starts[i].kind===p.kind?p.kind:p.kind}));
    drawWheel(state.framePoints,t);
    if(t<1)state.raf=requestAnimationFrame(frame);else{state.framePoints=targets;state.raf=0;drawWheel(state.framePoints,1);}
  }
  state.raf=requestAnimationFrame(frame);
}
function setResult() {
  if(!state.ast)return;
  const value=evaluateNode(state.ast,currentVars());
  resultEl.textContent=format(value);
  $('xOutput').textContent=format(Number($('xValue').value));
  $('cOutput').textContent=format(Number($('cValue').value));
}
function updateSliderView(animateFamily=false) {
  if(!state.ast)return;
  setResult();
  if(animateFamily){state.targets=getTargetPoints(state.ast);animateTo(state.targets);}else drawWheel(state.framePoints.length?state.framePoints:state.targets,1);
}
function runExpression(record=true) {
  try {
    const ast=parse(input.value);
    state.ast=ast;
    const vars=variablesIn(ast),value=evaluateNode(ast,currentVars());
    $('operationTitle').textContent=vars.size?`${input.value.trim()}  (x e c variáveis)`:`${input.value.trim()} = ${format(value)}`;
    state.targets=getTargetPoints(ast);
    animateTo(state.targets);
    setResult();
    if(value===BOT) notice.textContent='Resultado ⊥ = 0/0: os raios da família colapsam visualmente ao centro. ⊥ é um estado extra, não um número projetivo.';
    else if(value===INF) notice.textContent='Resultado ∞: os raios convergem ao polo norte, destacado como um único eixo absorvente da visualização.';
    else if(vars.size) notice.textContent=`Expressão com ${[...vars].join(' e ')}: os raios rotulados mostram amostras da família; ajuste os controles para explorar valores. A animação é visual, não uma soma vetorial.`;
    else notice.textContent=`Resultado ${format(value)}. Uma expressão sem incógnitas calcula normalmente; os raios da amostra convergem ao resultado.`;
    if(record){input.setAttribute('aria-invalid','false');}
  } catch(error) {
    input.setAttribute('aria-invalid','true');notice.textContent=error.message;resultEl.textContent='Expressão inválida';$('operationTitle').textContent='Corrija a expressão';
  }
}
$('calculator').addEventListener('submit',event=>{event.preventDefault();runExpression();});
input.addEventListener('input',()=>input.setAttribute('aria-invalid','false'));
document.querySelectorAll('.presets button').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.expression;runExpression();}));
$('xValue').addEventListener('input',()=>updateSliderView(false));
$('cValue').addEventListener('input',()=>updateSliderView(true));
$('flipY').addEventListener('click',()=>{state.flipY=!state.flipY;$('flipY').setAttribute('aria-pressed',String(state.flipY));state.targets=getTargetPoints(state.ast);state.framePoints=state.targets;drawWheel(state.targets,1);});
$('flipX').addEventListener('click',()=>{state.flipX=!state.flipX;$('flipX').setAttribute('aria-pressed',String(state.flipX));state.targets=getTargetPoints(state.ast);state.framePoints=state.targets;drawWheel(state.targets,1);});
$('resetView').addEventListener('click',()=>{state.flipX=false;state.flipY=false;$('flipX').setAttribute('aria-pressed','false');$('flipY').setAttribute('aria-pressed','false');state.targets=getTargetPoints(state.ast);state.framePoints=state.targets;drawWheel(state.targets,1);});
state.ast=parse(input.value);state.targets=getTargetPoints(state.ast);state.framePoints=state.targets;updateSliderView(false);
