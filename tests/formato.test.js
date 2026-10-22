import { test } from "node:test";
import assert from "node:assert/strict";
import { pct, fecha, titulos, claseSigno, html, precio } from "../js/formato.js";
import { reducir } from "../js/graficos.js";

test("formatos", () => {
  assert.equal(fecha("2026-01-05"), "05/01/2026");
  assert.equal(claseSigno(-1), "baja");
  assert.equal(claseSigno(0), "");
  assert.equal(html('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.equal(pct(null), "—");
  assert.match(pct(0.1234), /^\+12,34\s%$/);
  assert.match(titulos(3), /^3$/);
  assert.match(precio(10, "USD"), /\$$/);
});

test("reducción de series largas conserva el último punto", () => {
  const e = Array.from({ length: 2001 }, (_, i) => i);
  const r = reducir(e, e, 800);
  assert.ok(r.etiquetas.length <= 802);
  assert.equal(r.etiquetas.at(-1), 2000);
  assert.deepEqual(reducir([1, 2], [3, 4], 800), { etiquetas: [1, 2], valores: [3, 4] });
});
