'use strict';

/* Mapeia os rótulos de referência junto com a transformação aplicada à roda. */
const referenceValues = [
  { value: INF, label: '∞' },
  { value: -2, label: '−2' },
  { value: -1, label: '−1' },
  { value: -0.5, label: '−½' },
  { value: 0, label: '0' },
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
];

function referenceColor(kind) {
  if (kind === 'inf') return '#ff77d9';
  if (kind === 'bot') return '#ffca68';
  return '#a9b8ff';
}

function expressionReferenceValue(value) {
  if (!state.ast) return value;
  const variables = variablesIn(state.ast);
  if (!variables.size) return value;

  const parameter = variables.has('x') ? 'x' : 'c';
  return evaluateNode(state.ast, { ...currentVars(), [parameter]: value });
}

function placeReferenceLabels(items, g) {
  ctx.save();
  ctx.font = '12px Georgia';
  const placed = [];
  const tangentOffsets = [0, -12, 12, -24, 24, -36, 36, -48, 48];

  items.forEach(item => {
    const { reference, point, value } = item;
    const sourcePoint = project(reference.value, g);
    const dx = point.x - g.cx || sourcePoint.x - g.cx || 1;
    const dy = point.y - g.cy || sourcePoint.y - g.cy || 0;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    const tx = -uy, ty = ux;
    const width = ctx.measureText(reference.label).width;
    const color = referenceColor(point.kind);
    let best = null;

    tangentOffsets.forEach(offset => {
      const x = point.x + ux * 20 + tx * offset;
      const y = point.y + uy * 20 + ty * offset;
      const box = { left: x - width / 2 - 3, right: x + width / 2 + 3, top: y - 9, bottom: y + 9 };
      const overlap = placed.reduce((sum, other) => {
        const intersects = box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
        return sum + (intersects ? 1000 : 0);
      }, 0);
      const outside = Math.max(0, 8 - box.left) + Math.max(0, box.right - g.w + 8)
        + Math.max(0, 8 - box.top) + Math.max(0, box.bottom - g.h + 8);
      const score = overlap + outside * 20 + Math.abs(offset);
      if (!best || score < best.score) best = { x, y, box, score };
    });

    placed.push(best.box);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    drawText(reference.label, best.x, best.y, color, 'center', '12px Georgia');
  });
  ctx.restore();
}

/* Sobrescreve apenas a camada-base; o restante do renderizador continua igual. */
drawBase = function drawTransformedBase(g) {
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

  const items = referenceValues.map(reference => {
    const value = expressionReferenceValue(reference.value);
    return { reference, value, point: project(value, g) };
  });
  placeReferenceLabels(items, g);
};

/* script.js faz o primeiro desenho antes deste complemento carregar. */
drawChart(getSamples(state.ast), false);
