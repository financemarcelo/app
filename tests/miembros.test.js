import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, valido, anadir, quitar, enlaceAviso, MAX_MIEMBROS } from "../js/miembros.js";

test("normaliza y valida correos", () => {
  assert.equal(normalizar("  Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.ok(valido("luis.p+carteras@ejemplo.es"));
  for (const malo of ["", "ana", "ana@", "@ejemplo.com", "ana@ejemplo", "a b@ejemplo.com", "a@b.com,c@d.com"]) {
    assert.ok(!valido(malo), malo);
  }
});

test("añade y quita miembros", () => {
  const lista = anadir(["ana@ejemplo.com"], " Luis@Ejemplo.es ");
  assert.deepEqual(lista, ["ana@ejemplo.com", "luis@ejemplo.es"]);
  assert.throws(() => anadir(lista, "LUIS@ejemplo.es"), /ya es miembro/);
  assert.throws(() => anadir(lista, "luis"), /correo válido/);
  assert.deepEqual(quitar(lista, "Luis@ejemplo.es"), ["ana@ejemplo.com"]);
  const llena = Array.from({ length: MAX_MIEMBROS }, (_, i) => `m${i}@ejemplo.com`);
  assert.throws(() => anadir(llena, "otro@ejemplo.com"), /hasta 20/);
});

test("enlace de aviso por correo", () => {
  const enlace = enlaceAviso({ correos: ["Luis@ejemplo.es", "eva@ejemplo.com"], cartera: "Común & Cía",
                               url: "https://financemarcelo.github.io/app/" });
  assert.ok(enlace.startsWith("mailto:luis@ejemplo.es,eva@ejemplo.com?subject="));
  const parametros = new URLSearchParams(enlace.split("?")[1]);
  assert.equal(parametros.get("subject"), "Te he añadido a la cartera «Común & Cía»");
  assert.match(parametros.get("body"), /https:\/\/financemarcelo\.github\.io\/app\//);
});
