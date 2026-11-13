'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('wheelCanvas');
const ctx = canvas.getContext('2d');
const input = $('expression');
const notice = $('alert-box');
const resultEl = $('result-value');
const INF = Object.freeze({ kind: 'inf' });
const BOT = Object.freeze({ kind: 'bot' });

const state = {
  flipX: false,
  flipY: false,
  ast: null,
  family: [],
};

function isInf(v) { return v === INF; }
function isBot(v) { return v === BOT; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isZero(v) { return isFiniteNumber(v) && v === 0; }

function formatValue(v) {
  if (isInf(v)) return '∞';
  if (isBot(v)) return '⊥';
  if (Math.abs(v) < 1e-10) return '0';
  return Number(v.toFixed(4)).toString();
}

function negate(v) {
  if (isBot(v)) return BOT;
  if (isInf(v)) return INF;
  return -v;
}

function add(a, b) {
  if (isBot(a) || isBot(b)) return BOT;
  if (isInf(a) && isInf(b)) return BOT;
  if (isInf(a) || isInf(b)) return INF;
  return a + b;
}

function subtract(a, b) {
  return add(a, negate(b));
}

function multiply(a, b) {
  if (isBot(a) || isBot(b)) return BOT;
  if ((isInf(a) && isZero(b)) || (isInf(b) && isZero(a))) return BOT;
  if (isInf(a) || isInf(b)) return INF;
  return a * b;
}

function inverse(a) {
  if (isBot(a)) return BOT;
  if (isInf(a)) return 0;
  if (a === 0) return INF;
  return 1 / a;
}

function divide(a, b) {
  if (isBot(a) || isBot(b)) return BOT;
  if (isInf(a) && isInf(b)) return BOT;
  if (isInf(b)) return isInf(a) ? BOT : 0;
  if (isInf(a)) return (b === 0) ? BOT : INF;
  if (b === 0) return (a === 0) ? BOT : INF;
  return a / b;
}

function tokenize(inputText) {
  const normalized = inputText
    .trim()
    .replaceAll('∞', 'inf')
    .replaceAll('⊥', 'bot')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replace(/\s+/g, '');

  const tokens = normalized.match(/inf|bot|[a-z]+|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/gi) || [];
  if (tokens.join('').toLowerCase() !== normalized.toLowerCase()) {
    throw new Error('Símbolo inválido. Use números, x, c, inf, ⊥ e operadores + − * /');
  }
  return tokens;
}

function parseExpression(expressionText) {
  const tokens = tokenize(expressionText);
  if (!tokens.length) throw new Error('Digite uma expressão.');
  let i = 0;

  function primary() {
    const token = tokens[i++];
    if (!token) throw new Error('Expressão incompleta.');

    if (token === '(') {
      const node = expression();
      if (tokens[i++] !== ')') throw new Error('Falta fechar parênteses.');
      return node;
    }

    if (token === '-') return { type: 'unary', op: '-', child: primary() };
    if (token === '+') return primary();

    if (/^inf$/i.test(token)) return { type: 'value', value: INF };
    if (/^bot$/i.test(token)) return { type: 'value', value: BOT };
    if (/^[xc]$/i.test(token)) return { type: 'variable', name: token.toLowerCase() };
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return { type: 'value', value: Number(token) };

    throw new Error(`Valor desconhecido: ${token}`);
  }

  function term() {
    let node = primary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++];
      node = { type: 'binary', op, left: node, right: primary() };
    }
    return node;
  }

  function expression() {
    let node = term();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++];
      node = { type: 'binary', op, left: node, right: term() };
    }
    return node;
  }

  const ast = expression();
  if (i !== tokens.length) throw new Error(`Token inesperado: ${tokens[i]}`);
  return ast;
}

function variablesIn(ast, set = new Set()) {
  if (!ast) return set;
  if (ast.type === 'variable') set.add(ast.name);
  if (ast.child) variablesIn(ast.child, set);
  if (ast.left) variablesIn(ast.left, set);
  if (ast.right) variablesIn(ast.right, set);
  return set;
}

function evaluateNode(node, values) {
  if (node.type === 'value') return node.value;
  if (node.type === 'variable') return values[node.name];
  if (node.type === 'unary') {
    const inner = evaluateNode(node.child, values);
    return node.op === '-' ? negate(inner) : inner;
  }

  const left = evaluateNode(node.left, values);
  const right = evaluateNode(node.right, values);

  switch (node.op) {
    case '+': return add(left, right);
    case '-': return subtract(left, right);
    case '*': return multiply(left, right);
    case '/': return divide(left, right);
    default: throw new Error(`Operador inválido: ${node.op}`);
  }
}

function currentVariables() {
  return {
    x: Number($('xValue').value),
    c: Number($('cValue').value),
  };
}

function geometry() {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.52;
  const cy = h * 0.47;
  const r = Math.min(w * 0.31, h * 0.37);
  return { w, h, cx, cy, r };
}

function applyMirror(x, y, g) {
  const { cx, cy } = g;
  const sx = state.flipX ? cx - (x - cx) : x;
  const sy = state.flipY ? cy - (y - cy) : y;
  return { x: sx, y: sy };
}

function projectValue(value, g) {
  const { cx, cy, r } = g;
  if (isInf(value)) return applyMirror(cx, cy - r, g);
  if (isBot(value)) return applyMirror(cx, cy, g);

  const theta = 2 * Math.atan(value) - Math.PI / 2;
  const px = cx + r * Math.cos(theta);
  const py = cy - r * Math.sin(theta);
  return applyMirror(px, py, g);
}

function labelForValue(value) {
  if (isInf(value)) return '∞';
  if (isBot(value)) return '⊥';
  const v = Number(value);
  if (Math.abs(v) < 1e-6) return '0';
  return Number(v.toFixed(2)).toString();
}

function drawBackground(g) {
  const { w, h, cx, cy, r } = g;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, r * 2.5);
  bg.addColorStop(0, '#1b2440');
  bg.addColorStop(1, '#08121e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 230, 255, 0.72)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.strokeStyle = 'rgba(205, 220, 245, 0.2)';
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(185, 204, 235, 0.12)';
  for (let i = 1; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawReferenceLabels(g) {
  const { cx, cy, r } = g;
  const refs = [-2, -1, -0.5, 0, 0.5, 1, 2];

  refs.forEach((v) => {
    const p = projectValue(v, g);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#a6b7d7';
    ctx.fill();

    const label = labelForValue(v);
    ctx.font = '12px Georgia';
    ctx.fillStyle = '#dfe9fb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x + 16, p.y - 12);
  });

  const north = projectValue(INF, g);
  ctx.font = '16px Georgia';
  ctx.fillStyle = '#ff77d9';
  ctx.fillText('∞', north.x, north.y - 12);
}

function colorFor(value) {
  if (isInf(value)) return '#ff77d9';
  if (isBot(value)) return '#ffca68';
  return '#68d8ff';
}

function drawFamily(ast) {
  const g = geometry();
  drawBackground(g);
  drawReferenceLabels(g);

  const samples = [];

  for (let i = 0; i < 41; i += 1) {
    const x = -5 + (i / 40) * 10;
    const vars = { x, c: Number($('cValue').value) };
    const result = evaluateNode(ast, vars);
    samples.push({ value: result, xValue: x });
  }

  const allInf = samples.every((s) => isInf(s.value));
  const allBot = samples.every((s) => isBot(s.value));

  if (allInf) {
    const north = projectValue(INF, g);
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(north.x, north.y);
    ctx.strokeStyle = '#ff77d9';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ff77d9';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const glow = ctx.createRadialGradient(g.cx, g.cy, 5, g.cx, g.cy, 70);
    glow.addColorStop(0, 'rgba(255,119,217,0.85)');
    glow.addColorStop(1, 'rgba(255,119,217,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, 70, 0, Math.PI * 2);
    ctx.fill();
  } else if (allBot) {
    const glow = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, 80);
    glow.addColorStop(0, 'rgba(255,202,104,1)');
    glow.addColorStop(0.25, 'rgba(255,202,104,0.7)');
    glow.addColorStop(1, 'rgba(255,202,104,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(g.cx, g.cy, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffca68';
    ctx.fill();

    ctx.font = 'bold 15px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe8b4';
    ctx.fillText('⊥ = 0/0', g.cx + 2, g.cy + 28);
  } else {
    samples.forEach((sample, index) => {
      const p = projectValue(sample.value, g);
      const alpha = 0.2 + 0.7 * (index / samples.length);

      ctx.beginPath();
      ctx.moveTo(g.cx, g.cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = colorFor(sample.value).replace(')', `, ${alpha})`).replace('rgb', 'rgba');
      ctx.lineWidth = 1.1;
      ctx.stroke();

      if (index % 4 === 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(sample.value);
        ctx.fill();

        ctx.font = '10px Georgia';
        ctx.fillStyle = '#dfe9fb';
        ctx.textAlign = 'center';
        ctx.fillText(labelForValue(sample.value), p.x + 12, p.y - 10);
      }
    });
  }

  // Highlight current x value on the wheel.
  const currentValue = evaluateNode(ast, currentVariables());
  const currentP = projectValue(currentValue, g);
  ctx.beginPath();
  ctx.moveTo(g.cx, g.cy);
  ctx.lineTo(currentP.x, currentP.y);
  ctx.strokeStyle = colorFor(currentValue);
  ctx.lineWidth = 4;
  ctx.shadowColor = colorFor(currentValue);
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(currentP.x, currentP.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = colorFor(currentValue);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(g.cx, g.cy, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#f2eaff';
  ctx.fill();
}

function updateResult(ast) {
  const values = currentVariables();
  const result = evaluateNode(ast, values);
  $('xOutput').textContent = formatValue(values.x);
  $('cOutput').textContent = formatValue(values.c);
  resultEl.textContent = formatValue(result);
  $('operationTitle').textContent = input.value.trim();
}

function runExpression() {
  try {
    const ast = parseExpression(input.value);
    state.ast = ast;
    updateResult(ast);
    drawFamily(ast);

    const vars = variablesIn(ast);
    const value = evaluateNode(ast, currentVariables());

    if (isBot(value)) {
      notice.textContent = 'Resultado ⊥ = 0/0: os raios colapsam ao centro. O centro torna-se o ponto absorvente da roda.';
    } else if (isInf(value)) {
      notice.textContent = 'Resultado ∞: os raios convergem para o eixo do infinito no topo da roda.';
    } else if (vars.size > 0) {
      notice.textContent = 'Expressão com incógnitas. Ajuste x e c para explorar a família de resultados e a reflexão visual da roda.';
    } else {
      notice.textContent = `Resultado ${formatValue(value)}. A expressão é estritamente numérica e a roda mostra sua localização na reta projetiva.`;
    }
  } catch (error) {
    notice.textContent = error.message;
    resultEl.textContent = 'Erro';
    $('operationTitle').textContent = 'Expressão inválida';
  }
}

$('calculator').addEventListener('submit', (event) => {
  event.preventDefault();
  runExpression();
});

$('xValue').addEventListener('input', () => {
  if (!state.ast) return;
  updateResult(state.ast);
  drawFamily(state.ast);
});

$('cValue').addEventListener('input', () => {
  if (!state.ast) return;
  updateResult(state.ast);
  drawFamily(state.ast);
});

$('flipY').addEventListener('click', () => {
  state.flipY = !state.flipY;
  $('flipY').setAttribute('aria-pressed', String(state.flipY));
  if (state.ast) drawFamily(state.ast);
});

$('flipX').addEventListener('click', () => {
  state.flipX = !state.flipX;
  $('flipX').setAttribute('aria-pressed', String(state.flipX));
  if (state.ast) drawFamily(state.ast);
});

$('resetView').addEventListener('click', () => {
  state.flipX = false;
  state.flipY = false;
  $('flipX').setAttribute('aria-pressed', 'false');
  $('flipY').setAttribute('aria-pressed', 'false');
  if (state.ast) drawFamily(state.ast);
});

document.querySelectorAll('.presets button').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.expression;
    runExpression();
  });
});

state.ast = parseExpression(input.value);
updateResult(state.ast);
drawFamily(state.ast);
