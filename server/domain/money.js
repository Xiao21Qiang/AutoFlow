function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  const number = toFiniteNumber(value, 0);
  return Number(number.toFixed(2));
}

function nonNegativeMoney(value) {
  return Math.max(0, roundMoney(value));
}

function clampTinyNegativeMoney(value) {
  const rounded = roundMoney(value);
  return rounded < 0 && Math.abs(rounded) <= 0.01 ? 0 : rounded;
}

module.exports = {
  clampTinyNegativeMoney,
  nonNegativeMoney,
  roundMoney,
  toFiniteNumber,
};
