'use strict';
const canvas=document.getElementById('wheelCanvas'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const controls={mode:$('transform'),x:$('xValue'),c:$('cValue'),xo:$('xOutput'),co:$('cOutput'),mapped:$('mappedValue'),title:$('operationTitle'),notice:$('alert-box')};
const INF={kind:'inf'},BOT={kind:'bot'};
let sweepTimer=null;
const fmt=n=>{if(!Number.isFinite(n))return '∞';if(Math.abs(n)<1e-10)return '0';return Number(n.toFixed(3)).toString()};
function modeLabel(){
  const m=controls.mode.value;
  const c=Number(controls.c.value);
  const str = (() => {
    if (m === 'translate') return `x ↦ x + ${fmt(c)}`;
    if (m === 'negate') return 'x ↦ −x';
    if (m === 'reciprocal') return 'x ↦ 1/x';
    if (m === 'scale') return `x ↦ ${fmt(c)} · x`;
    if (m === 'infinity') return 'x ↦ ∞ · x';
    if (m === 'bottom') return 'x ↦ x + ⊥';
    return 'x ↦ x + c';
  })();
  controls.title.textContent = str;
  return str;
}
function transform(v){const c=Number(controls.c.value),m=controls.mode.value; if(m==='translate') return v+c; if(m==='negate') return -v; if(m==='reciprocal') return v===0?INF:1/v; if(m==='scale') return c===0?0:v*c; if(m==='infinity') return v===0?BOT:INF; if(m==='bottom') return BOT; return v; }
function project(v,cx,cy,r){if(v===INF)return{x:cx,y:cy-r,kind:'inf'}; if(v===BOT)return{x:cx,y:cy+r+76,kind:'bot'}; const a=2*Math.atan(v)-Math.PI/2; return{x:cx+r*Math.cos(a), y:cy-r*Math.sin(a), kind:'real'} }
function colorFor(kind){if(kind==='inf')return '#ff77d9'; if(kind==='bot')return '#ffca68'; return '#72dcff';}
function draw(){
  const w=canvas.width,h=canvas.height,cx=w*0.52,cy=h*0.47,r=Math.min(w*0.34,h*0.34);
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createRadialGradient(cx,cy,20,cx,cy,r*2.5);bg.addColorStop(0,'#1b2440');bg.addColorStop(1,'#08121e');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle='rgba(217,226,255,.72)'; ctx.lineWidth=2; ctx.stroke();
  ctx.strokeStyle='rgba(181,200,232,.16)'; ctx.lineWidth=1;
  for(let i=1;i<=4;i++){ ctx.beginPath(); ctx.arc(cx,cy,r*i/5,0,Math.PI*2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.strokeStyle='rgba(209,222,247,.22)'; ctx.stroke();
  ctx.font='15px Georgia'; ctx.textAlign='center'; ctx.fillStyle='#ff77d9'; ctx.fillText('∞',cx,cy-r-15); ctx.fillStyle='#72dcff'; ctx.fillText('0',cx,cy+r+24);
  const bx=cx, by=cy+r+70; ctx.setLineDash([5,6]); ctx.beginPath(); ctx.moveTo(cx,cy+r+4); ctx.lineTo(bx,by-13); ctx.strokeStyle='rgba(255,202,104,.48)'; ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(bx,by,9,0,Math.PI*2); ctx.fillStyle='#ffca68'; ctx.shadowColor='#ffca68'; ctx.shadowBlur=15; ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle='#ffdb91'; ctx.font='14px Georgia'; ctx.fillText('⊥ = 0/0',bx,by+25);

  const samples=Array.from({length:61},(_,i)=>-12+i*0.4);
  const realSamples=[];
  for(const x of samples){
    const y=transform(x);
    const p=project(y,cx,cy,r);
    realSamples.push(p);
    const alpha=.22 + .45*(1 - Math.min(1,Math.abs(x)/14));
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(p.x,p.y);
    ctx.strokeStyle = (p.kind === 'inf') ? `rgba(255,119,217,${alpha})` : (p.kind === 'bot' ? `rgba(255,202,104,${alpha})` : `rgba(104,216,255,${alpha})`);
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  let spread=0;if(realSamples.length){
    const mx=realSamples.reduce((s,p)=>s+p.x,0)/realSamples.length;
    const my=realSamples.reduce((s,p)=>s+p.y,0)/realSamples.length;
    spread = realSamples.reduce((s,p)=>s+Math.hypot(p.x-mx,p.y-my),0)/realSamples.length / r;
  }
  const concentration = Math.max(0,1-Math.min(1,spread));
  ctx.globalAlpha = 0.12 + 0.22 * concentration;
  for(let j=1;j<=3;j++){
    ctx.beginPath();
    ctx.arc(cx,cy,Math.max(10,r*(0.1 + j*0.08)*(1-0.4*concentration)),0,Math.PI*2);
    ctx.strokeStyle='#a998ff';
    ctx.lineWidth=1.3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const current = transform(Number(controls.x.value));
  const p = project(current,cx,cy,r);
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y); ctx.strokeStyle=colorFor(p.kind); ctx.lineWidth=4; ctx.shadowColor=colorFor(p.kind); ctx.shadowBlur=13; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fillStyle=colorFor(p.kind); ctx.fill(); ctx.shadowBlur=0;
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fillStyle='#f4edff'; ctx.shadowColor='#c3a9ff'; ctx.shadowBlur=20; ctx.fill(); ctx.shadowBlur=0;
}
function updateMappedValue(){
  const x=Number(controls.x.value), y=transform(x);
  controls.xo.textContent = fmt(x);
  controls.co.textContent = fmt(Number(controls.c.value));
  controls.mapped.textContent = y === INF ? '∞' : y === BOT ? '⊥ (0/0)' : fmt(y);
  modeLabel();
  draw();
}
function parseSimple(expr){
  const s=expr.trim().replaceAll('∞','inf').replaceAll('×','*').replaceAll('÷','/').replaceAll('⊥','bot');
  const tokens=s.match(/inf|bot|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/gi)||[];
  if(tokens.join('').toLowerCase()!==s.replace(/\s/g,'').toLowerCase()) throw Error('Use números, inf, ⊥ e os operadores +, −, ×, ÷.');
  let i=0;
  const valueFor = token => { const t=token.toLowerCase(); if(t==='inf') return INF; if(t==='bot') return BOT; const n=Number(t); if(!Number.isFinite(n)) throw Error(`Valor inválido: ${token}`); return n; };
  function primary(){
    const token=tokens[i++];
    if(token===undefined) throw Error('Expressão incompleta.');
    if(token==='('){ const v=exprAdd(); if(tokens[i++]!==')') throw Error('Falta fechar parênteses.'); return v; }
    if(token==='-'){ return -primary(); }
    if(token==='+'){ return primary(); }
    return valueFor(token);
  }
  function applyOp(a,b,op){
    if (a === BOT || b === BOT) return BOT;
    if (op === '+') { if (a === INF && b === INF) return BOT; if (a === INF || b === INF) return INF; return a + b; }
    if (op === '-') { if (a === INF || b === INF) return BOT; return a - b; }
    if (op === '*') { if ((a === INF && b === 0) || (b === INF && a === 0)) return BOT; if (a === INF || b === INF) return INF; return a * b; }
    if (op === '/') { if (a === INF && b === INF) return BOT; if (b === INF) return a === INF ? BOT : 0; if (a === INF) return b === 0 ? BOT : INF; if (b === 0) return a === 0 ? BOT : INF; return a / b; }
    throw Error(`Operador inválido: ${op}`);
  }
  function term(){ let a=primary(); while(tokens[i]==='*'||tokens[i]==='/'){ const op=tokens[i++]; a=applyOp(a,primary(),op); } return a; }
  function exprAdd(){ let a=term(); while(tokens[i]==='+'||tokens[i]==='-'){ const op=tokens[i++]; a=applyOp(a,term(),op); } return a; }
  const result = exprAdd(); if(i !== tokens.length) throw Error(`Token inesperado: ${tokens[i]}`); return result;
}
function resultText(v){ if(v===INF)return '∞'; if(v===BOT)return '⊥ (0/0)'; return Number(v).toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/,''); }
function evaluate(){
  try {
    const expr=$('expression').value, v=parseSimple(expr);
    const valueText = resultText(v);
    controls.notice.textContent = `${expr} = ${valueText}. Resultado calculado pelas regras didáticas desta roda.`;
    if(v === BOT) controls.mode.value = 'bottom';
    else if(v === INF) controls.mode.value = 'infinity';
    else { controls.mode.value = 'translate'; controls.x.value = String(Math.max(-5,Math.min(5,Number(v)))); }
    updateMappedValue();
  } catch (e) {
    controls.notice.textContent = e.message;
  }
}
controls.mode.addEventListener('change', updateMappedValue);
controls.x.addEventListener('input', updateMappedValue);
controls.c.addEventListener('input', updateMappedValue);
$('evaluate').addEventListener('click', evaluate);
$('expression').addEventListener('keydown', e => { if (e.key === 'Enter') evaluate(); });
document.querySelectorAll('.presets button').forEach(btn => btn.addEventListener('click', () => { $('expression').value = btn.dataset.expression; evaluate(); }));
$('sweep').addEventListener('click', () => {
  if (sweepTimer) {
    clearInterval(sweepTimer); sweepTimer = null; $('sweep').textContent = '▶ Percorrer x automaticamente'; return;
  }
  let t=-5; controls.x.value = String(t);
  $('sweep').textContent = '■ Parar percurso';
  sweepTimer=setInterval(()=>{ t += 0.06; if (t>5) t = -5; controls.x.value = String(t); updateMappedValue(); }, 30);
});
updateMappedValue();
