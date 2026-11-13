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
  if (isBot(v)) return '⊥';
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
  const normalized = source.trim().replaceAll('∞','inf').replaceAll('⊥','bot').replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replace(/\s+/g,'');
  const tokens = normalized.match(/inf|bot|[a-z]+|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/gi) || [];
  if (tokens.join('').toLowerCase() !== normalized.toLowerCase()) throw new Error('Símbolo inválido. Use números, x, c, inf, ⊥, parênteses e + − * /.');
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
function variablesIn(node, set = new Set()) {
  if (node.type === 'variable') set.add(node.name);
  if (node.child) variablesIn(node.child, set);
  if (node.left) variablesIn(node.left, set);
  if (node.right) variablesIn(node.right, set);
  return set;
}
function evaluateNode(node, vars) {
  if (node.type === 'value') return node.value;
  if (node.type === 'variable') return vars[node.name];
  if (node.type === 'unary') return node.op === '-' ? negate(evaluateNode(node.child, vars)) : evaluateNode(node.child, vars);
  const a = evaluateNode(node.left, vars), b = evaluateNode(node.right, vars);
  if (node.op === '+') return add(a,b);
  if (node.op === '-') return subtract(a,b);
  if (node.op === '*') return multiply(a,b);
  return divide(a,b);
}
function currentVars() { return { x: Number($('xValue').value), c: Number($('cValue').value) }; }
function classifyTransform(ast, value) {
  const isX = node => node && node.type === 'variable' && node.name === 'x';
  if (ast.type === 'unary' && ast.op === '-' && isX(ast.child)) return { label: 'Espelho', effect: 'inverte a família em relação ao eixo y', axis: 'y' };
  if (ast.type === 'binary' && ast.op === '/' && ast.left && ast.left.type === 'value' && ast.left.value === 1 && isX(ast.right)) return { label: 'Inversão', effect: 'inverte a família em relação ao eixo x', axis: 'x' };
  if (ast.type === 'binary' && ast.op === '+' && (isX(ast.left) || isX(ast.right))) return { label: 'Translação', effect: 'desloca a família ao longo da roda', axis: '—' };
  if (ast.type === 'binary' && ast.op === '-' && (isX(ast.left) || isX(ast.right))) return { label: 'Reflexão', effect: 'reverte e desloca a família', axis: 'y' };
  if (isInf(value)) return { label: 'Colapso ao infinito', effect: 'todos os raios convergem para o eixo superior', axis: '∞' };
  if (isBot(value)) return { label: 'Colapso ao centro', effect: 'todos os raios convergem ao centro do círculo', axis: '⊥' };
  return { label: 'Valor estático', effect: 'a expressão fixa um ponto na roda', axis: '—' };
}
function updateTransformMeta(ast, value) {
  const info = classifyTransform(ast, value);
  $('transform-label').textContent = info.label;
  $('transform-effect').textContent = info.effect;
  $('transform-axis').textContent = info.axis;
}
function identifyAutomaticMirror(ast) {
  const isX = node => node && node.type === 'variable' && node.name === 'x';
  const isOne = node => node && node.type === 'value' && node.value === 1;
  if (ast.type === 'unary' && ast.op === '-' && isX(ast.child)) return 'y';
  if (ast.type === 'binary' && ast.op === '/' && isOne(ast.left) && isX(ast.right)) return 'x';
  return null;
}
function updateMirrorUI() {
  $('mirrorHint').textContent = state.automaticMirror === 'y'
    ? '−x reflete naturalmente a família no eixo y; o eixo foi destacado automaticamente.'
    : state.automaticMirror === 'x'
      ? '1/x reflete naturalmente a família no eixo x; o eixo foi destacado automaticamente.'
      : 'Em −x e 1/x, a família já aparece refletida pelo próprio mapeamento.';
  $('flipX').setAttribute('aria-pressed', String(state.manualFlipX));
  $('flipY').setAttribute('aria-pressed', String(state.manualFlipY));
}
function geometry() {
  const w = canvas.width, h = canvas.height;
  return { w, h, cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.365 };
}
function mirrorPoint(point, g) {
  return {
    x: state.manualFlipY ? 2 * g.cx - point.x : point.x,
    y: state.manualFlipX ? 2 * g.cy - point.y : point.y,
    kind: point.kind,
  };
}
function project(value, g) {
  let point;
  if (isInf(value)) point = { x: g.cx, y: g.cy - g.r, kind: 'inf' };
  else if (isBot(value)) point = { x: g.cx, y: g.cy, kind: 'bot' };
  else {
    const theta = 2 * Math.atan(value) - Math.PI / 2;
    point = { x: g.cx + g.r * Math.cos(theta), y: g.cy - g.r * Math.sin(theta), kind: 'real' };
  }
  return mirrorPoint(point, g);
}
function labelFor(value) {
  if (isInf(value)) return '∞';
  if (isBot(value)) return '⊥';
  if (Math.abs(value) < 1e-6) return '0';
  return Number(value.toFixed(2)).toString();
}
function rgbaFor(kind, alpha) {
  const color = isBot(kind) ? [255, 202, 104] : isInf(kind) ? [255, 119, 217] : [104, 216, 255];
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}
function drawText(text, x, y, color = '#dbe7f8', align = 'center', font = '10px sans-serif') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
function drawBase(g) {
  const { w, h, cx, cy, r } = g;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, r * 2.7);
  bg.addColorStop(0, '#1c2542');
  bg.addColorStop(1, '#08121e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220,230,255,.72)';
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (r * i) / 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(185,204,235,.13)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.strokeStyle = 'rgba(205,220,245,.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (state.automaticMirror === 'y') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.strokeStyle = 'rgba(104,216,255,.7)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  if (state.automaticMirror === 'x') {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.strokeStyle = 'rgba(255,119,217,.7)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  const north = project(INF, g);
  const south = project(0, g);
  drawText('∞', north.x, north.y - 17, '#ff77d9', 'center', 'bold 17px Georgia');
  drawText('0', south.x, south.y + 17, '#68d8ff', 'center', '13px Georgia');

  const refs = [[-2, '−2'], [-1, '−1'], [-0.5, '−½'], [0.5, '½'], [1, '1'], [2, '2']];
  refs.forEach(([value, label]) => {
    const p = project(value, g);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#a6b7d7';
    ctx.fill();
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    drawText(label, p.x + (dx / len) * 18, p.y + (dy / len) * 18, '#dfe9fb', 'center', '12px Georgia');
  });
}
function drawCollapseCenter(g) {
  const pulse = 0.82 + 0.22 * Math.sin(performance.now() / 250);
  const glow = ctx.createRadialGradient(g.cx, g.cy, 1, g.cx, g.cy, 62 * pulse);
  glow.addColorStop(0, 'rgba(255,231,184,.95)');
  glow.addColorStop(0.24, 'rgba(255,202,104,.58)');
  glow.addColorStop(1, 'rgba(255,202,104,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, 62 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffca68';
  ctx.fill();
  drawText('⊥ = 0/0', g.cx + 15, g.cy + 22, '#ffe0a0', 'left', 'bold 12px Georgia');
}
function drawInfinityAxis(g) {
  const north = project(INF, g);
  ctx.beginPath();
  ctx.moveTo(g.cx, g.cy);
  ctx.lineTo(north.x, north.y);
  ctx.strokeStyle = '#ff77d9';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#ff77d9';
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const halo = ctx.createRadialGradient(north.x, north.y, 1, north.x, north.y, 35);
  halo.addColorStop(0, 'rgba(255,119,217,.75)');
  halo.addColorStop(1, 'rgba(255,119,217,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(north.x, north.y, 35, 0, Math.PI * 2);
  ctx.fill();
}
function getSamples(ast) {
  const vars = variablesIn(ast), current = currentVars();
  if (!vars.size) return [{ parameter: '', value: evaluateNode(ast, current) }];
  const parameter = vars.has('x') ? 'x' : 'c';
  return Array.from({ length: SAMPLE_STEPS + 1 }, (_, i) => {
    const amount = SAMPLE_MIN + ((SAMPLE_MAX - SAMPLE_MIN) * i) / SAMPLE_STEPS;
    const params = { ...current, [parameter]: amount };
    return { parameter: `${parameter}=${format(amount)}`, value: evaluateNode(ast, params) };
  });
}
function samplePoints(samples) {
  const g = geometry();
  return samples.map(item => ({ ...item, point: project(item.value, g) }));
}
function drawFamilyTrace(points) {
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  let started = false;

  for (const { value, point } of points) {
    if (isBot(value)) {
      started = false;
      continue;
    }

    if (!started) {
      ctx.moveTo(point.x, point.y);
      started = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }

  ctx.strokeStyle = 'rgba(165, 223, 255, 0.78)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(104, 216, 255, 0.8)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();
}
function drawChart(samples, highlightOnly = false) {
  const g = geometry();
  drawBase(g);

  const points = samplePoints(samples);
  const allBot = points.every(({ value }) => isBot(value));
  const allInf = points.every(({ value }) => isInf(value));

  if (allBot) drawCollapseCenter(g);
  if (allInf) drawInfinityAxis(g);
  drawFamilyTrace(points);

  const origin = mirrorPoint({ x: g.cx, y: g.cy, kind: 'real' }, g);

  points.forEach(({ value, parameter, point }, index) => {
    const alpha = highlightOnly ? 0.92 : 0.2 + (index / points.length) * 0.7;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = rgbaFor(point.kind, alpha);
    ctx.lineWidth = highlightOnly ? 2.6 : 1.15;
    ctx.stroke();

    const label = parameter || labelFor(value);
    const dx = point.x - g.cx;
    const dy = point.y - g.cy;
    const len = Math.hypot(dx, dy) || 1;
    const x = point.x + (dx / len) * 18;
    const y = point.y + (dy / len) * 18;
    if (!highlightOnly || index % 3 === 0) drawText(label, x, y, '#e3effb', 'center', '9px ui-monospace, monospace');
  });

  if (state.ast) {
    const currentValue = evaluateNode(state.ast, currentVars());
    const p = project(currentValue, g);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = rgbaFor(p.kind, 1);
    ctx.lineWidth = 3.5;
    ctx.shadowColor = rgbaFor(p.kind, 1);
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgbaFor(p.kind, 1);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f3eaff';
  ctx.fill();
}
function updateResultDisplay() {
  if (!state.ast) return;
  const vars = currentVars();
  const result = evaluateNode(state.ast, vars);
  $('xOutput').textContent = format(vars.x);
  $('cOutput').textContent = format(vars.c);
  resultEl.textContent = format(result);
  $('operationTitle').textContent = input.value.trim();
  updateTransformMeta(state.ast, result);
}
function runExpression() {
  try {
    const ast = parse(input.value);
    state.ast = ast;
    state.automaticMirror = identifyAutomaticMirror(ast);
    updateMirrorUI();

    const vars = variablesIn(ast);
    const value = evaluateNode(ast, currentVars());
    updateResultDisplay();
    drawChart(getSamples(ast), false);

    if (isBot(value)) {
      notice.textContent = 'Resultado ⊥ = 0/0: os raios convergem e colapsam ao centro âmbar. ⊥ é um elemento adicional, fora da reta projetiva.';
    } else if (isInf(value)) {
      notice.textContent = 'Resultado ∞: os raios convergem para o único polo norte, destacado pelo eixo vertical magenta.';
    } else if (vars.size > 0) {
      notice.textContent = `Expressão com ${[...vars].join(' e ')}: cada raio está identificado pelo valor amostrado do parâmetro. Ajuste os controles ou inicie a animação opcional.`;
    } else {
      notice.textContent = `Resultado ${format(value)}. A expressão numérica é representada pelo raio destacado.`;
    }
  } catch (error) {
    notice.textContent = error.message;
    resultEl.textContent = 'Expressão inválida';
    $('operationTitle').textContent = 'Corrija a expressão';
  }
}
function stopParameterAnimation(name) {
  const button = $(`animate${name.toUpperCase()}`);
  if (state.animation[name]) cancelAnimationFrame(state.animation[name]);
  state.animation[name] = 0;
  if (button) {
    button.textContent = `▶ Animar ${name}`;
    button.setAttribute('aria-pressed', 'false');
  }
}
function startParameterAnimation(name) {
  const button = $(`animate${name.toUpperCase()}`);
  const slider = $(`${name}Value`);

  if (state.animation[name]) {
    stopParameterAnimation(name);
    return;
  }

  button.textContent = `■ Parar ${name}`;
  button.setAttribute('aria-pressed', 'true');

  const begin = performance.now();
  const duration = 5200;

  const tick = now => {
    if (!state.animation[name]) return;
    const t = ((now - begin) % duration) / duration;
    const waveform = (1 - Math.cos(t * Math.PI * 2)) / 2;
    const min = Number(slider.min), max = Number(slider.max);
    slider.value = String(min + (max - min) * waveform);
    if (state.ast) {
      updateResultDisplay();
      drawChart(getSamples(state.ast), false);
    }
    state.animation[name] = requestAnimationFrame(tick);
  };

  state.animation[name] = requestAnimationFrame(tick);
}
function toggleMirror(axis) {
  if (axis === 'x') state.manualFlipX = !state.manualFlipX; else state.manualFlipY = !state.manualFlipY;
  updateMirrorUI();
  if (state.ast) drawChart(getSamples(state.ast), false);
}
function sampleParameterFromItem(item) {
  const match = /^(x|c)=/i.exec(item.parameter || '');
  if (!match) return null;
  const name = match[1].toLowerCase();
  const value = Number(item.parameter.slice(name.length + 1));
  return Number.isFinite(value) ? { name, value } : null;
}
function nearestSampleAt(event) {
  if (!state.ast) return null;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const g = geometry();
  let nearest = null;

  for (const item of samplePoints(getSamples(state.ast))) {
    const distance = Math.hypot(item.point.x - x, item.point.y - y);
    if (!nearest || distance < nearest.distance) nearest = { ...item, distance };
  }

  const threshold = Math.max(18, g.r * 0.055);
  return nearest && nearest.distance <= threshold ? nearest : null;
}
canvas.addEventListener('pointermove', event => {
  const item = nearestSampleAt(event);
  const parameter = item ? sampleParameterFromItem(item) : null;
  canvas.style.cursor = parameter ? 'pointer' : 'default';

  if (!item || !parameter) {
    canvas.removeAttribute('title');
    return;
  }

  canvas.title = `${parameter.name.toUpperCase()} = ${format(parameter.value)} · resultado: ${format(item.value)}`;
});
canvas.addEventListener('pointerleave', () => {
  canvas.style.cursor = 'default';
  canvas.removeAttribute('title');
});
canvas.addEventListener('click', event => {
  const item = nearestSampleAt(event);
  const parameter = item ? sampleParameterFromItem(item) : null;
  if (!parameter) return;

  const slider = $(`${parameter.name}Value`);
  slider.value = String(parameter.value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
$('calculator').addEventListener('submit', event => { event.preventDefault(); runExpression(); });
input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false'));
document.querySelectorAll('.presets button').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.expression; runExpression(); }));
$('xValue').addEventListener('input', () => { stopParameterAnimation('x'); if (state.ast) { updateResultDisplay(); drawChart(getSamples(state.ast), false); } });
$('cValue').addEventListener('input', () => { stopParameterAnimation('c'); if (state.ast) { updateResultDisplay(); drawChart(getSamples(state.ast), false); } });
$('animateX').addEventListener('click', () => startParameterAnimation('x'));
$('animateC').addEventListener('click', () => startParameterAnimation('c'));
$('flipY').addEventListener('click', () => toggleMirror('y'));
$('flipX').addEventListener('click', () => toggleMirror('x'));
$('resetView').addEventListener('click', () => { state.manualFlipX = false; state.manualFlipY = false; updateMirrorUI(); if (state.ast) drawChart(getSamples(state.ast), false); });
window.addEventListener('beforeunload', () => { stopParameterAnimation('x'); stopParameterAnimation('c'); });
state.ast = parse(input.value);
state.automaticMirror = identifyAutomaticMirror(state.ast);
updateMirrorUI();
updateResultDisplay();
drawChart(getSamples(state.ast), false);
