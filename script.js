// Small educational model of the rational wheel. The exceptional element ⊥ is
// deliberately drawn separately from the projective circle.
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const input = document.getElementById('expression');
const resultEl = document.getElementById('result-value');
const alertEl = document.getElementById('alert-box');
const historyEl = document.getElementById('history-list');
const INF = Object.freeze({ kind: 'infinity' });
const BOT = Object.freeze({ kind: 'bottom' });
const rational = (n, d = 1n) => {
  if (d === 0n) return n === 0n ? BOT : INF;
  if (d < 0n) { n = -n; d = -d; }
  const gcd = (a, b) => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
  const g = gcd(n, d);
  return { kind: 'rational', n: n / g, d: d / g };
};
const zero = () => rational(0n);
const isZero = x => x.kind === 'rational' && x.n === 0n;
const show = x => x.kind === 'infinity' ? '∞' : x.kind === 'bottom' ? '⊥ (0/0)' : x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`;
const add = (a,b) => {
  if (a.kind === 'bottom' || b.kind === 'bottom') return BOT;
  if (a.kind === 'infinity' && b.kind === 'infinity') return BOT;
  if (a.kind === 'infinity' || b.kind === 'infinity') return INF;
  return rational(a.n*b.d + b.n*a.d, a.d*b.d);
};
const sub = (a,b) => {
  if (a.kind === 'bottom' || b.kind === 'bottom') return BOT;
  if (a.kind === 'infinity' || b.kind === 'infinity') return a.kind === b.kind ? BOT : INF;
  return rational(a.n*b.d - b.n*a.d, a.d*b.d);
};
const mul = (a,b) => {
  if (a.kind === 'bottom' || b.kind === 'bottom') return BOT;
  if (a.kind === 'infinity' && b.kind === 'infinity') return INF;
  if (a.kind === 'infinity') return isZero(b) ? BOT : INF;
  if (b.kind === 'infinity') return isZero(a) ? BOT : INF;
  return rational(a.n*b.n, a.d*b.d);
};
const div = (a,b) => {
  if (a.kind === 'bottom' || b.kind === 'bottom') return BOT;
  if (a.kind === 'infinity' && b.kind === 'infinity') return BOT;
  if (b.kind === 'infinity') return a.kind === 'infinity' ? BOT : zero();
  if (a.kind === 'infinity') return isZero(b) ? BOT : INF;
  if (isZero(b)) return isZero(a) ? BOT : INF;
  return rational(a.n*b.d, a.d*b.n);
};
function tokenize(text) {
  const s = text.replace(/∞/g, 'inf').replace(/⊥/g, 'bot').replace(/\s+/g, '');
  const tokens = s.match(/inf|bot|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/gi) || [];
  if (tokens.join('').toLowerCase() !== s.toLowerCase()) throw Error('Expressão contém símbolo inválido. Use números, inf, bot, +, -, * e /.');
  return tokens;
}
function parse(text) {
  const t = tokenize(text); let i = 0;
  function primary() {
    const v = t[i++];
    if (v === undefined) throw Error('Expressão incompleta.');
    if (v === '(') { const x = expression(); if (t[i++] !== ')') throw Error('Falta fechar parênteses.'); return x; }
    if (v === '-') return unary(primary());
    if (v === '+') return primary();
    if (/^inf$/i.test(v)) return INF;
    if (/^bot$/i.test(v)) return BOT;
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)) {
      const [whole, frac = ''] = v.split('.'); return rational(BigInt((whole || '0') + frac), 10n ** BigInt(frac.length));
    }
    throw Error(`Símbolo inesperado: ${v}`);
  }
  function unary(x) { return x.kind === 'rational' ? rational(-x.n, x.d) : x; }
  function product() {
    let x = primary();
    while (t[i] === '*' || t[i] === '/') { const op = t[i++], y = primary(); x = op === '*' ? mul(x,y) : div(x,y); }
    return x;
  }
  function expression() {
    let x = product();
    while (t[i] === '+' || t[i] === '-') { const op = t[i++], y = product(); x = op === '+' ? add(x,y) : sub(x,y); }
    return x;
  }
  if (!t.length) throw Error('Digite uma expressão.');
  const value = expression();
  if (i !== t.length) throw Error(`Token inesperado: ${t[i]}`);
  return value;
}
function pointFor(value, cx, cy, radius) {
  if (value.kind === 'infinity') return { x: cx, y: cy-radius };
  const x = Number(value.n) / Number(value.d);
  const angle = 2 * Math.atan(x) - Math.PI / 2;
  // Screen y is inverted: zero is at the south pole, +∞ at the north pole.
  return { x: cx + radius*Math.cos(angle), y: cy - radius*Math.sin(angle) };
}
function draw(value) {
  const w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, r = 250;
  ctx.clearRect(0,0,w,h);
  const bg = ctx.createRadialGradient(cx,cy,30,cx,cy,500);
  bg.addColorStop(0,'#14243a'); bg.addColorStop(1,'#050d18'); ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle='rgba(220,235,255,.55)'; ctx.lineWidth=2; ctx.stroke();
  // Coordinate axes and projective poles: 0 is south; ±∞ is one north point.
  ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r);
  ctx.strokeStyle='rgba(220,235,255,.18)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='#ff6de8'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('∞',cx,cy-r-18);
  ctx.fillStyle='#68d8ff'; ctx.fillText('0',cx,cy+r+28);
  ctx.fillStyle='#dce7ff'; ctx.font='14px sans-serif'; ctx.fillText('reais negativos',cx-r+65,cy-12); ctx.fillText('reais positivos',cx+r-65,cy-12);
  // ⊥ is an extra algebraic element, not a point of the projective circle.
  const bx=cx, by=cy+315;
  ctx.beginPath(); ctx.moveTo(cx,cy+r); ctx.lineTo(bx,by-17); ctx.setLineDash([5,6]); ctx.strokeStyle='rgba(255,191,69,.55)'; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(bx,by,13,0,Math.PI*2); ctx.fillStyle='#ffbf45'; ctx.shadowColor='#ffbf45'; ctx.shadowBlur=18; ctx.fill(); ctx.shadowBlur=0;
  ctx.fillStyle='#ffcf70'; ctx.font='bold 16px sans-serif'; ctx.fillText('⊥ = 0/0',bx,by+34);
  if (value.kind === 'bottom') {
    ctx.beginPath(); ctx.arc(bx,by,21,0,Math.PI*2); ctx.strokeStyle='#fff0c2'; ctx.lineWidth=3; ctx.stroke();
  } else {
    const p=pointFor(value,cx,cy,r);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y); ctx.strokeStyle=value.kind==='infinity'?'#ff6de8':'#68d8ff'; ctx.lineWidth=4; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.fillStyle=value.kind==='infinity'?'#ff6de8':'#69f0d3'; ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=15; ctx.fill(); ctx.shadowBlur=0;
  }
  ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fillStyle='#eaf2ff'; ctx.fill();
}
let history=[];
function evaluate(expression) {
  try {
    const value=parse(expression);
    resultEl.textContent=show(value);
    alertEl.textContent=value.kind==='bottom' ? 'Resultado ⊥: elemento excepcional absorvente na roda dos racionais; ele é mostrado fora do círculo projetivo.' : value.kind==='infinity' ? 'Resultado ∞: os dois sentidos infinitos correspondem ao mesmo polo norte da reta projetiva.' : 'Resultado racional exato. O círculo mostra sua posição na reta projetiva; não representa a operação como soma de vetores.';
    history.unshift({expression,value}); history=history.slice(0,6);
    historyEl.replaceChildren(...history.map(entry=>{const li=document.createElement('li');li.className='history-item';const a=document.createElement('span');a.className='history-expression';a.textContent=entry.expression;const b=document.createElement('span');b.className='history-result';b.textContent=show(entry.value);li.append(a,b);return li;}));
    draw(value);
  } catch(error) { resultEl.textContent='Erro'; alertEl.textContent=error.message; }
}
document.getElementById('evaluate').addEventListener('click',()=>evaluate(input.value));
input.addEventListener('keydown',event=>{if(event.key==='Enter') evaluate(input.value);});
document.querySelectorAll('.quick-button').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.expression;evaluate(input.value);}));
draw(BOT);
