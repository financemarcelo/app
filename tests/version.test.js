import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indiceVersionado, modulos } from "../scripts/version.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index.html lleva la huella actual de cada fichero", () => {
  assert.ok(html === indiceVersionado(html), "index.html no está al día: ejecuta «npm run versiones»");
});

test("el mapa de importación cubre todos los módulos menos el principal", () => {
  const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(Object.keys(imports), modulos().filter((m) => m !== "js/app.js").map((m) => `./${m}`));
});
