const canvas = document.getElementById("wheelCanvas");
const ctx = canvas.getContext("2d");

const expressionInput = document.getElementById("expression");
const resultValueEl = document.getElementById("result-value");
const alertBoxEl = document.getElementById("alert-box");
const historyListEl = document.getElementById("history-list");
const evaluateButton = document.getElementById("evaluate");
const quickButtons = document.querySelectorAll(".quick-button");

const INF = { kind: "infinity" };
const BOTTOM = { kind: "bottom" };

const state = {
  history: [],
  currentValue: BOTTOM,
};

function gcdBigInt(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;

  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }

  return a;
}

function fractionFromInteger(num, den = 1n) {
  if (den === 0n) {
    return { kind: "number", num, den };
  }

  const sign = den < 0n ? -1n : 1n;
  num = sign * num;
  den = sign * den;

  const divisor = gcdBigInt(num < 0n ? -num : num, den);
  return { kind: "number", num: num / divisor, den: den / divisor };
}

function decimalToFraction(text) {
  const trimmed = text.trim();
  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = trimmed.replace("-", "");

  if (!unsigned.includes(".")) {
    return fractionFromInteger(sign * BigInt(unsigned), 1n);
  }

  const [whole, fractional] = unsigned.split(".");
  const numerator = BigInt((whole || "0") + (fractional || ""));
  const denominator = 10n ** BigInt((fractional || "").length);

  return fractionFromInteger(sign * numerator, denominator);
}

function formatValue(value) {
  if (value.kind === "infinity") {
    return "∞";
  }

  if (value.kind === "bottom") {
    return "0/0";
  }

  const { num, den } = value;
  if (den === 1n) {
    return num.toString();
  }

  const absNum = num < 0n ? -num : num;
  const sign = num < 0n ? "-" : "";
  return `${sign}${absNum}/${den}`;
}

function isFinite(value) {
  return value && value.kind === "number";
}

function valueToAngle(value) {
  if (value.kind === "infinity") {
    return Math.PI / 2;
  }

  if (value.kind === "bottom") {
    return 0;
  }

  const x = Number(value.num) / Number(value.den);
  return 2 * Math.atan(x) - Math.PI / 2;
}

function addValues(lhs, rhs) {
  if (lhs.kind === "bottom" || rhs.kind === "bottom") {
    return BOTTOM;
  }

  if (lhs.kind === "infinity" && rhs.kind === "infinity") {
    return BOTTOM;
  }

  if (lhs.kind === "infinity" || rhs.kind === "infinity") {
    return INF;
  }

  const left = lhs;
  const right = rhs;
  const numerator = left.num * right.den + right.num * left.den;
  const denominator = left.den * right.den;

  return fractionFromInteger(numerator, denominator);
}

function subtractValues(lhs, rhs) {
  if (lhs.kind === "bottom" || rhs.kind === "bottom") {
    return BOTTOM;
  }

  if (lhs.kind === "infinity" && rhs.kind === "infinity") {
    return BOTTOM;
  }

  if (lhs.kind === "infinity") {
    return INF;
  }

  if (rhs.kind === "infinity") {
    return INF;
  }

  const numerator = lhs.num * rhs.den - rhs.num * lhs.den;
  const denominator = lhs.den * rhs.den;
  return fractionFromInteger(numerator, denominator);
}

function multiplyValues(lhs, rhs) {
  if (lhs.kind === "bottom" || rhs.kind === "bottom") {
    return BOTTOM;
  }

  if (lhs.kind === "infinity" && rhs.kind === "number") {
    return rhs.num === 0n ? BOTTOM : INF;
  }

  if (rhs.kind === "infinity" && lhs.kind === "number") {
    return lhs.num === 0n ? BOTTOM : INF;
  }

  if (lhs.kind === "infinity" && rhs.kind === "infinity") {
    return INF;
  }

  if (lhs.kind === "number" && rhs.kind === "number") {
    return fractionFromInteger(lhs.num * rhs.num, lhs.den * rhs.den);
  }

  return BOTTOM;
}

function divideValues(lhs, rhs) {
  if (lhs.kind === "bottom" || rhs.kind === "bottom") {
    return BOTTOM;
  }

  if (rhs.kind === "number" && rhs.num === 0n) {
    if (lhs.kind === "number" && lhs.num === 0n) {
      return BOTTOM;
    }
    return INF;
  }

  if (lhs.kind === "number" && lhs.num === 0n && rhs.kind === "infinity") {
    return fractionFromInteger(0n, 1n);
  }

  if (lhs.kind === "infinity" && rhs.kind === "number") {
    return rhs.num === 0n ? BOTTOM : INF;
  }

  if (lhs.kind === "number" && rhs.kind === "infinity") {
    return fractionFromInteger(0n, 1n);
  }

  if (lhs.kind === "infinity" && rhs.kind === "infinity") {
    return BOTTOM;
  }

  if (lhs.kind === "number" && rhs.kind === "number") {
    if (rhs.num === 0n) {
      return lhs.num === 0n ? BOTTOM : INF;
    }
    return fractionFromInteger(lhs.num * rhs.den, lhs.den * rhs.num);
  }

  return BOTTOM;
}

function unaryMinus(value) {
  if (value.kind === "number") {
    return { kind: "number", num: -value.num, den: value.den };
  }

  if (value.kind === "infinity") {
    return INF;
  }

  return BOTTOM;
}

function evaluateNode(node) {
  if (!node) {
    return BOTTOM;
  }

  if (node.type === "literal") {
    return node.value;
  }

  if (node.type === "unary") {
    const target = evaluateNode(node.expression);
    if (node.operator === "-") {
      return unaryMinus(target);
    }
    return target;
  }

  if (node.type === "binary") {
    const left = evaluateNode(node.left);
    const right = evaluateNode(node.right);

    if (node.operator === "+") return addValues(left, right);
    if (node.operator === "-") return subtractValues(left, right);
    if (node.operator === "*") return multiplyValues(left, right);
    if (node.operator === "/") return divideValues(left, right);
  }

  return BOTTOM;
}

function tokenize(input) {
  const tokens = [];
  const clean = input.replace(/∞/g, "inf").replace(/\s+/g, "");
  let index = 0;

  while (index < clean.length) {
    const current = clean[index];

    if (/[0-9.]/.test(current)) {
      let numberText = "";
      while (index < clean.length && /[0-9.]/.test(clean[index])) {
        numberText += clean[index];
        index += 1;
      }

      tokens.push({ type: "number", value: decimalToFraction(numberText) });
      continue;
    }

    if (clean.startsWith("inf", index)) {
      tokens.push({ type: "literal", value: INF });
      index += 3;
      continue;
    }

    if (clean.startsWith("bot", index)) {
      tokens.push({ type: "literal", value: BOTTOM });
      index += 3;
      continue;
    }

    if ("+-*/()".includes(current)) {
      tokens.push({ type: current, value: current });
      index += 1;
      continue;
    }

    throw new Error(`Token inválido: "${current}"`);
  }

  return tokens;
}

function parseExpression(tokens) {
  let position = 0;

  function peek() {
    return tokens[position];
  }

  function consume(type) {
    const token = peek();
    if (!token || token.type !== type) {
      throw new Error(`Esperado ${type}, mas recebeu ${token ? token.type : "fim"}`);
    }
    position += 1;
    return token;
  }

  function parsePrimary() {
    const token = peek();
    if (!token) {
      throw new Error("Expressão incompleta");
    }

    if (token.type === "number") {
      consume("number");
      return { type: "literal", value: token.value };
    }

    if (token.type === "literal") {
      consume("literal");
      return { type: "literal", value: token.value };
    }

    if (token.type === "(") {
      consume("(");
      const expression = parseAdditive();
      consume(")");
      return expression;
    }

    if (token.type === "-") {
      consume("-");
      return { type: "unary", operator: "-", expression: parsePrimary() };
    }

    if (token.type === "+") {
      consume("+");
      return parsePrimary();
    }

    throw new Error(`Símbolo inesperado: ${token.type}`);
  }

  function parseMultiplicative() {
    let node = parsePrimary();

    while (peek() && (peek().type === "*" || peek().type === "/")) {
      const operator = peek().type;
      consume(operator);
      const right = parsePrimary();
      node = { type: "binary", operator, left: node, right };
    }

    return node;
  }

  function parseAdditive() {
    let node = parseMultiplicative();

    while (peek() && (peek().type === "+" || peek().type === "-")) {
      const operator = peek().type;
      consume(operator);
      const right = parseMultiplicative();
      node = { type: "binary", operator, left: node, right };
    }

    return node;
  }

  const ast = parseAdditive();
  if (peek()) {
    throw new Error(`Token restante: ${peek().type}`);
  }

  return ast;
}

function createAlert(value, expression) {
  const normalized = expression.replace(/\s+/g, "");

  if (value.kind === "bottom") {
    return "O elemento 0/0 absorve a operação e colapsa a roda no centro, como na convenção da Wheel Theory.";
  }

  if (value.kind === "infinity") {
    return "A operação produz um valor infinito explícito; o raio é guiado para o polo norte da roda.";
  }

  if (normalized.includes("/") && normalized.includes("0")) {
    return "A divisão por zero não vira erro: ela se materializa como um elemento especial da roda.";
  }

  return "A operação foi calculada com o conjunto estendido da roda e permanece coerente com a geometria visual.";
}

function renderHistory(entries) {
  historyListEl.innerHTML = "";

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";

    const expr = document.createElement("span");
    expr.className = "history-expression";
    expr.textContent = entry.expression;

    const result = document.createElement("span");
    result.className = "history-result";
    result.textContent = formatValue(entry.value);

    item.append(expr, result);
    historyListEl.appendChild(item);
  });
}

function drawWheel(value) {
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 250;

  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createRadialGradient(cx, cy, 60, cx, cy, radius + 140);
  bg.addColorStop(0, "rgba(17, 30, 54, 0.82)");
  bg.addColorStop(0.6, "rgba(10, 18, 28, 0.92)");
  bg.addColorStop(1, "rgba(4, 11, 18, 1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(226, 236, 255, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - radius);
  ctx.strokeStyle = "rgba(255, 109, 232, 0.6)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + radius);
  ctx.strokeStyle = "rgba(255, 191, 69, 0.55)";
  ctx.stroke();

  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    const startX = cx + Math.cos(angle) * 40;
    const startY = cy + Math.sin(angle) * 40;
    const endX = cx + Math.cos(angle) * radius;
    const endY = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.stroke();
  }

  const northX = cx;
  const northY = cy - radius - 18;
  const southX = cx;
  const southY = cy + radius + 32;

  ctx.fillStyle = "#ff6de8";
  ctx.font = "700 22px sans-serif";
  ctx.fillText("∞", northX - 10, northY);

  ctx.fillStyle = "#ffbf45";
  ctx.fillText("0", cx - 6, southY + 6);

  ctx.fillStyle = "#8ae6ff";
  ctx.font = "600 18px sans-serif";
  ctx.fillText("R", cx + radius + 10, cy - 6);

  if (value.kind === "bottom") {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
    glow.addColorStop(0, "rgba(255, 191, 69, 1)");
    glow.addColorStop(0.35, "rgba(255, 191, 69, 0.65)");
    glow.addColorStop(1, "rgba(255, 191, 69, 0)");

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffbf45";
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const angle = valueToAngle(value);
    const rayLength = value.kind === "infinity" ? radius : radius * 0.7;
    const x = cx + Math.cos(angle) * rayLength;
    const y = cy + Math.sin(angle) * rayLength;

    ctx.strokeStyle = value.kind === "infinity" ? "#ff6de8" : "#68d8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = value.kind === "infinity" ? "#ff6de8" : "#68d8ff";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
  centerGlow.addColorStop(0, "rgba(255,255,255,0.9)");
  centerGlow.addColorStop(0.3, "rgba(104, 216, 255, 0.65)");
  centerGlow.addColorStop(1, "rgba(104, 216, 255, 0)");
  ctx.fillStyle = centerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();
}

function evaluateInput() {
  try {
    const raw = expressionInput.value;
    const tokens = tokenize(raw);
    const ast = parseExpression(tokens);
    const value = evaluateNode(ast);

    state.currentValue = value;
    resultValueEl.textContent = formatValue(value);
    alertBoxEl.textContent = createAlert(value, raw);

    state.history.unshift({ expression: raw, value });
    state.history = state.history.slice(0, 6);
    renderHistory(state.history);

    drawWheel(value);
  } catch (error) {
    resultValueEl.textContent = "Erro";
    alertBoxEl.textContent = error.message || "Expressão inválida.";
  }
}

evaluateButton.addEventListener("click", evaluateInput);
expressionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    evaluateInput();
  }
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    expressionInput.value = button.dataset.expression;
    evaluateInput();
  });
});

const startupExpression = "inf + inf";
expressionInput.value = startupExpression;
state.history = [
  { expression: "1 / 0", value: INF },
  { expression: "0 / 0", value: BOTTOM },
  { expression: "2 + 3", value: fractionFromInteger(5n, 1n) },
];
renderHistory(state.history);

setTimeout(() => {
  evaluateInput();
}, 50);
