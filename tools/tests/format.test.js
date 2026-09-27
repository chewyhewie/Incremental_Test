// Number and duration formatting from ui.js. These are pure functions, so they
// are testable without a DOM.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const fmt = (v, d) => g.fn.formatNumber(new g.Decimal(v), d);

test("below 1e6, numbers are plain with thousands separators", () => {
  assert.equal(fmt(0), "0");
  assert.equal(fmt(7), "7");
  assert.equal(fmt(999), "999");
  assert.equal(fmt(1000), "1,000");
  assert.equal(fmt(12345), "12,345");
  assert.equal(fmt(999999), "999,999");
});

test("fractions below 1e6 are floored by default", () => {
  assert.equal(fmt(12.9), "12");
  assert.equal(fmt(0.8), "0");
});

test("at and above 1e6, numbers switch to scientific notation", () => {
  assert.equal(fmt(1e6), "1.00e6");
  assert.equal(fmt(1234567), "1.23e6");
  assert.equal(fmt(1e9), "1.00e9");
});

test("the mantissa is floored, never rounded up past the next power", () => {
  // 9.999e6 must not render as 10.00e6.
  assert.equal(fmt(9999999), "9.99e6");
  assert.equal(fmt("9.9999e100"), "9.99e100");
});

test("very large values format without overflowing", () => {
  assert.equal(fmt("1e300"), "1.00e300");
  assert.equal(fmt("1.5e1000"), "1.50e1000");
});

test("the boundary at 1e6 is exact", () => {
  assert.equal(fmt(999999), "999,999");
  assert.equal(fmt(1000000), "1.00e6");
});

test("formatNumber accepts a plain number as well as a Decimal", () => {
  assert.equal(g.fn.formatNumber(12345), "12,345");
  assert.equal(g.fn.formatNumber(1234567), "1.23e6");
});

test("formatRate keeps one decimal place below the scientific threshold", () => {
  assert.equal(g.fn.formatRate(new g.Decimal(0)), "0");
  assert.equal(g.fn.formatRate(new g.Decimal(2.5)), "2.5");
  assert.equal(g.fn.formatRate(new g.Decimal(1234.56)), "1,234.6");
});

test("formatDuration uses hours, minutes or seconds as appropriate", () => {
  assert.equal(g.fn.formatDuration(0), "0s");
  assert.equal(g.fn.formatDuration(45), "45s");
  assert.equal(g.fn.formatDuration(60), "1m 0s");
  assert.equal(g.fn.formatDuration(125), "2m 5s");
  assert.equal(g.fn.formatDuration(3600), "1h 0m");
  assert.equal(g.fn.formatDuration(3725), "1h 2m");
  assert.equal(g.fn.formatDuration(8 * 3600), "8h 0m");
});

test("formatDuration floors fractional seconds", () => {
  assert.equal(g.fn.formatDuration(45.9), "45s");
});

test("the offline notice reads correctly, capped and uncapped", () => {
  const plain = g.fn.offlineMessage({
    seconds: 3725, gained: new g.Decimal(123456), capped: false,
  });
  assert.match(plain, /1h 2m/);
  assert.match(plain, /123,456/);
  assert.ok(!/capped/.test(plain), "no cap note when not capped");

  const capped = g.fn.offlineMessage({
    seconds: g.CONFIG.offlineCapSeconds, gained: new g.Decimal(1e7), capped: true,
  });
  assert.match(capped, /capped at 8h/);
  assert.match(capped, /1\.00e7/);
});
