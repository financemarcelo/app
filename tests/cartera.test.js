import { test } from "node:test";
import assert from "node:assert/strict";
import { aEuros, reconstruir, valorar, validarOperacion, serieValor, indiceCierres, serieHasta,
         ultimoIndiceHasta } from "../js/cartera.js";

const divisas = { "SAN.MC": "EUR", AAPL: "USD", MMM: "USD" };
const tipoCambio = () => 1.25; // dólares por euro
const sinCierre = () => null;

function op(fecha, simbolo, tipo, titulos, precio, marca = 0) {
  const eur = aEuros(titulos * precio, divisas[simbolo], 1.25);
  return { fecha_mercado: fecha, simbolo, tipo, titulos, precio, divisa: divisas[simbolo], importe_eur: eur, marca };
}

const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} ≠ ${b}`);

test("compra y venta en euros y dólares", () => {
  const e = reconstruir({
    capitalInicial: 10000, eventos: {}, divisas, tipoCambio, cierreAnterior: sinCierre,
    operaciones: [op("2026-01-05", "SAN.MC", "compra", 100, 10), op("2026-01-06", "AAPL", "compra", 10, 250),
                  op("2026-02-01", "SAN.MC", "venta", 40, 12)],
  });
  cerca(e.efectivo, 10000 - 1000 - 2000 + 480);
  assert.equal(e.posiciones["SAN.MC"].titulos, 60);
  cerca(e.posiciones["SAN.MC"].costeEur, 600);
  cerca(e.resultadoRealizadoEur, 480 - 400);
  cerca(e.posiciones.AAPL.costeEur, 2000);
});

test("vender todo elimina la posición", () => {
  const e = reconstruir({
    capitalInicial: 1000, eventos: {}, divisas, tipoCambio, cierreAnterior: sinCierre,
    operaciones: [op("2026-01-05", "SAN.MC", "compra", 10, 10), op("2026-01-06", "SAN.MC", "venta", 10, 11)],
  });
  assert.equal(e.posiciones["SAN.MC"], undefined);
  cerca(e.efectivo, 1010);
});

test("dividendo: cobra quien tenía títulos al empezar la fecha ex-dividendo", () => {
  const eventos = { "SAN.MC": { dividendos: [{ fecha: "2026-03-02", importe: 0.1 }], desdoblamientos: [] } };
  const base = { capitalInicial: 10000, eventos, divisas, tipoCambio, cierreAnterior: sinCierre };
  const antes = reconstruir({ ...base, operaciones: [op("2026-03-01", "SAN.MC", "compra", 100, 10)] });
  cerca(antes.dividendosEur, 10);
  const mismoDia = reconstruir({ ...base, operaciones: [op("2026-03-02", "SAN.MC", "compra", 100, 10)] });
  cerca(mismoDia.dividendosEur, 0);
});

test("dividendo en dólares se convierte a euros", () => {
  const eventos = { AAPL: { dividendos: [{ fecha: "2026-02-10", importe: 0.25 }], desdoblamientos: [] } };
  const e = reconstruir({ capitalInicial: 10000, eventos, divisas, tipoCambio, cierreAnterior: sinCierre,
                          operaciones: [op("2026-01-05", "AAPL", "compra", 100, 200)] });
  cerca(e.dividendosEur, 25 / 1.25);
});

test("desdoblamiento real multiplica títulos y conserva el coste", () => {
  const eventos = { AAPL: { dividendos: [], desdoblamientos: [{ fecha: "2026-06-01", numerador: 4, denominador: 1,
                                                                   tipo: "desdoblamiento" }] } };
  const e = reconstruir({ capitalInicial: 10000, eventos, divisas, tipoCambio, cierreAnterior: sinCierre,
                          operaciones: [op("2026-01-05", "AAPL", "compra", 10, 500)] });
  assert.equal(e.posiciones.AAPL.titulos, 40);
  cerca(e.posiciones.AAPL.costeEur, 4000);
});

test("ajuste por escisión: abona en efectivo y no cambia los títulos", () => {
  const eventos = { MMM: { dividendos: [], desdoblamientos: [{ fecha: "2024-04-01", numerador: 1196,
                                                                  denominador: 1000, tipo: "ajuste" }] } };
  const cierreAnterior = (s, f) => (s === "MMM" && f === "2024-04-01" ? 100 : null);
  const e = reconstruir({ capitalInicial: 20000, eventos, divisas, tipoCambio, cierreAnterior,
                          operaciones: [op("2024-03-01", "MMM", "compra", 100, 100)] });
  assert.equal(e.posiciones.MMM.titulos, 100);
  const esperado = 100 * 100 * (1 - 1000 / 1196) / 1.25;
  cerca(e.ajustesEur, esperado);
  cerca(e.efectivo, 20000 - 8000 + esperado);
  cerca(e.posiciones.MMM.costeEur, 8000 - esperado);
});

test("los eventos no afectan a valores sin títulos", () => {
  const eventos = { "SAN.MC": { dividendos: [{ fecha: "2026-01-01", importe: 1 }], desdoblamientos: [] } };
  const e = reconstruir({ capitalInicial: 100, eventos, divisas, tipoCambio, cierreAnterior: sinCierre,
                          operaciones: [op("2026-02-01", "SAN.MC", "compra", 1, 10)] });
  cerca(e.dividendosEur, 0);
});

test("validación de operaciones", () => {
  const e = reconstruir({ capitalInicial: 1000, eventos: {}, divisas, tipoCambio, cierreAnterior: sinCierre,
                          operaciones: [op("2026-01-05", "SAN.MC", "compra", 10, 10)] });
  assert.equal(validarOperacion(e, { tipo: "compra", simbolo: "SAN.MC", titulos: 0, importeEur: 0 }) !== null, true);
  assert.equal(validarOperacion(e, { tipo: "compra", simbolo: "SAN.MC", titulos: 1.5, importeEur: 15 }) !== null, true);
  assert.equal(validarOperacion(e, { tipo: "compra", simbolo: "SAN.MC", titulos: 100, importeEur: 1000 }), "No hay efectivo suficiente.");
  assert.equal(validarOperacion(e, { tipo: "compra", simbolo: "SAN.MC", titulos: 90, importeEur: 900 }), null);
  assert.match(validarOperacion(e, { tipo: "venta", simbolo: "SAN.MC", titulos: 11, importeEur: 110 }), /Solo hay 10/);
  assert.equal(validarOperacion(e, { tipo: "venta", simbolo: "SAN.MC", titulos: 10, importeEur: 100 }), null);
});

test("valoración a precios actuales", () => {
  const e = reconstruir({ capitalInicial: 10000, eventos: {}, divisas, tipoCambio, cierreAnterior: sinCierre,
                          operaciones: [op("2026-01-05", "SAN.MC", "compra", 100, 10), op("2026-01-05", "AAPL", "compra", 10, 250)] });
  const v = valorar(e, { "SAN.MC": 12, AAPL: 300 }, divisas, 1.5);
  cerca(v.valorPosicionesEur, 1200 + 3000 / 1.5);
  cerca(v.totalEur, 7000 + 1200 + 2000);
  const san = v.posiciones.find((p) => p.simbolo === "SAN.MC");
  cerca(san.plusvaliaEur, 200);
  cerca(san.plusvaliaPct, 0.2);
});

test("serie diaria del valor", () => {
  const sesiones = { "SAN.MC": { fechas: ["2026-01-05", "2026-01-06", "2026-01-07"], cierres: [10, 11, 9] } };
  const serie = serieValor({ capitalInicial: 1000, eventos: {}, divisas, tipoCambio, sesiones,
                             operaciones: [op("2026-01-05", "SAN.MC", "compra", 50, 10)],
                             desde: "2026-01-05", hasta: "2026-01-07" });
  assert.deepEqual(serie.map((p) => p.fecha), ["2026-01-05", "2026-01-06", "2026-01-07"]);
  cerca(serie[0].totalEur, 1000);
  cerca(serie[1].totalEur, 500 + 550);
  cerca(serie[2].totalEur, 500 + 450);
});

test("búsquedas por fecha", () => {
  assert.equal(ultimoIndiceHasta(["2026-01-02", "2026-01-05"], "2026-01-04"), 0);
  assert.equal(ultimoIndiceHasta(["2026-01-02", "2026-01-05"], "2026-01-01"), -1);
  const cierre = indiceCierres({ X: { fechas: ["2026-01-02", "2026-01-05"], cierres: [1, 2] } });
  assert.equal(cierre("X", "2026-01-09"), 2);
  assert.equal(cierre("Y", "2026-01-09"), null);
  const fx = serieHasta({ fechas: ["2026-01-02", "2026-01-05"], valores: [1.1, 1.2] });
  assert.equal(fx("2026-01-04"), 1.1);
  assert.equal(fx("2025-12-31"), 1.1);
});
