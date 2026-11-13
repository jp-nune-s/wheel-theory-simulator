'use strict';

/*
 * Visual exploration layer: connects the sampled family into a trace and lets
 * the user select parameter values directly on the wheel.
 */
const drawBaseChart = drawChart;
drawChart = function drawChartWithFamilyTrace(samples, highlightOnly = false) {
  drawBaseChart(samples, highlightOnly);

  const g = geometry();
  const points = samplePoints(samples);
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  let segmentOpen = false;
  let previous = null;

  for (const item of points) {
    const { point, value } = item;
    if (isBot(value)) {
      segmentOpen = false;
      previous = null;
      continue;
    }

    const separated = previous && Math.hypot(point.x - previous.x, point.y - previous.y) > g.r * 0.48;
    if (!segmentOpen || separated) {
      ctx.moveTo(point.x, point.y);
      segmentOpen = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
    previous = point;
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#68d8ff';
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.restore();
};

function sampleParameter(item) {
  const match = /^(x|c)=(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(item.parameter || '');
  return match ? { name: match[1], value: Number(match[2]) } : null;
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
  return nearest && nearest.distance <= Math.max(18, g.r * 0.055) ? nearest : null;
}

canvas.addEventListener('pointermove', event => {
  const item = nearestSampleAt(event);
  canvas.style.cursor = item && sampleParameter(item) ? 'pointer' : 'default';
  if (!item) {
    canvas.removeAttribute('title');
    return;
  }
  const parameter = sampleParameter(item);
  canvas.title = `${parameter ? `${parameter.name} = ${format(parameter.value)} · ` : ''}resultado: ${format(item.value)}. Clique para selecionar.`;
});

canvas.addEventListener('pointerleave', () => {
  canvas.style.cursor = 'default';
  canvas.removeAttribute('title');
});

canvas.addEventListener('click', event => {
  const item = nearestSampleAt(event);
  const parameter = item && sampleParameter(item);
  if (!parameter) return;

  const slider = $(`${parameter.name}Value`);
  slider.value = String(parameter.value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
