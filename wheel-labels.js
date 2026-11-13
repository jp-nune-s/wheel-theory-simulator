'use strict';

/*
 * Projective wheel overlay.
 * A point on the source semicircle is a homogeneous pair (A, B), representing
 * A/B.  B=0 is the projective infinity; (0,0) is not on that semicircle and
 * is drawn separately as the wheel's bottom element.  The existing project()
 * function performs the double-angle map that joins the two zero endpoints
 * into one wheel point and places infinity at the north pole.
 */
const referenceValues = [
  { pair: [1, 0], label: '∞', color: '#ffca68' },
  { pair: [-2, 1], label: '−2', color: '#a9b8ff' },
  { pair: [-1, 1], label: '−1', color: '#a9b8ff' },
  { pair: [-1, 2], label: '−½', color: '#a9b8ff' },
  { pair: [0, 1], label: '0', color: '#68d8ff' },
  { pair: [1, 2], label: '½', color: '#ff77d9' },
  { pair: [1, 1], label: '1', color: '#ff77d9' },
  { pair: [2, 1], label: '2', color: '#ff77d9' },
];

function ratioFromPair([a, b]) {
  if (a === 0 && b === 0) return BOT;
  if (b === 0) return INF;
  return a / b;
}

function transformReference(reference) {
  if (!state.ast) return ratioFromPair(reference.pair);
  const variables = variablesIn(state.ast);
  if (!variables.size) return evaluateNode(state.ast, currentVars());

  const parameter = variables.has('x') ? 'x' : 'c';
  const value = ratioFromPair(reference.pair);
  return evaluateNode(state.ast, { ...currentVars(), [parameter]: value });
}

function drawBottomElement(g) {
  const glow = ctx.createRadialGradient(g.cx, g.cy, 1, g.cx, g.cy, 34);
  glow.addColorStop(0, 'rgba(230, 220, 255, 0.62)');
  glow.addColorStop(1, 'rgba(180, 160, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, 34, 0, Math.PI * 2);
  ctx.fill();
  drawText('0/0', g.cx + 20, g.cy + 27, '#e8ddff', 'left', '12px Georgia');
}

function drawTransformedReferences(items, g) {
  const allCollapsed = items.length > 0 && items.every(({ value }) => isBot(value));
  if (allCollapsed) return;

  const boxes = [];
  const offsets = [0, -14, 14, -28, 28, -42, 42, -56, 56];
  ctx.save();
  ctx.font = '13px Georgia';

  for (const { reference, value, point } of items) {
    if (isBot(value)) continue;

    const dx = point.x - g.cx;
    const dy = point.y - g.cy;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    const tx = -uy, ty = ux;
    const width = ctx.measureText(reference.label).width;
    let best = null;

    for (const offset of offsets) {
      const x = point.x + ux * 20 + tx * offset;
      const y = point.y + uy * 20 + ty * offset;
      const box = { left: x - width / 2 - 4, right: x + width / 2 + 4, top: y - 10, bottom: y + 10 };
      const collisions = boxes.reduce((count, other) => count + Number(
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
      ), 0);
      const overflow = Math.max(0, 8 - box.left) + Math.max(0, box.right - g.w + 8)
        + Math.max(0, 8 - box.top) + Math.max(0, box.bottom - g.h + 8);
      const score = collisions * 1000 + overflow * 20 + Math.abs(offset);
      if (!best || score < best.score) best = { x, y, box, score };
    }

    boxes.push(best.box);
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = `${reference.color}88`;
    ctx.lineWidth = 1.15;
    ctx.shadowColor = reference.color;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = reference.color;
    ctx.fill();
    drawText(reference.label, best.x, best.y, reference.color, 'center', '13px Georgia');
  }
  ctx.restore();
}

/* Keep the original wheel grid, but move its reference rays/labels through f. */
const drawOriginalWheelBase = drawBase;
drawBase = function drawProjectiveWheelBase(g) {
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

  const items = referenceValues.map(reference => {
    const value = transformReference(reference);
    return { reference, value, point: project(value, g) };
  });

  drawBottomElement(g);
  drawTransformedReferences(items, g);
};

/* script.js initializes before this deferred overlay is evaluated. Redraw once. */
drawChart(getSamples(state.ast), false);
