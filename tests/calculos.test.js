import { test } from "node:test";
import assert from "node:assert/strict";
import { sector, PLAZAS, estadoSesion, instanteEnZona, enZona, horaPeninsular, variacion, reparto,
         dividendosEstimados, porMes, base100, alinear, aCsv } from "../js/calculos.js";

test("sectores en español", () => {
  assert.equal(sector("Information Technology"), "Tecnología");
  assert.equal(sector("Desconocido"), "Desconocido");
});

test("instante de una hora local con cambio de hora", () => {
  // 9:30 en Nueva York: 13:30 UTC en verano (EDT) y 14:30 UTC en invierno (EST).
  assert.equal(instanteEnZona("2026-07-01", 9, 30, "America/New_York").toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(instanteEnZona("2026-12-01", 9, 30, "America/New_York").toISOString(), "2026-12-01T14:30:00.000Z");
  assert.equal(instanteEnZona("2026-07-01", 9, 0, "Europe/Madrid").toISOString(), "2026-07-01T07:00:00.000Z");
  assert.deepEqual(enZona(new Date("2026-10-23T22:30:00Z"), "Europe/Madrid"),
                   { fecha: "2026-10-24", dia: 6, hora: 0, minuto: 30 });
});

test("estado de la sesión", () => {
  const madrid = PLAZAS.madrid, ny = PLAZAS.nuevayork;
  assert.equal(estadoSesion(madrid, new Date("2026-10-23T10:00:00Z")).abierta, true);   // viernes 12:00
  assert.equal(estadoSesion(madrid, new Date("2026-10-23T16:00:00Z")).abierta, false);  // viernes 18:00
  assert.equal(estadoSesion(madrid, new Date("2026-10-24T10:00:00Z")).abierta, false);  // sábado
  const nyAbierta = estadoSesion(ny, new Date("2026-10-23T15:00:00Z"));
  assert.equal(nyAbierta.abierta, true);
  assert.equal(nyAbierta.texto, "Abierta · cierra a las 22:00");
  // Semana en que Europa ya ha cambiado la hora y Estados Unidos todavía no: cierra a las 21:00.
  assert.equal(estadoSesion(ny, new Date("2026-10-26T15:00:00Z")).texto, "Abierta · cierra a las 21:00");
  assert.equal(estadoSesion(madrid, new Date("2026-10-23T06:00:00Z")).texto, "Cerrada · abre a las 9:00");
  assert.equal(horaPeninsular(new Date("2026-01-15T08:00:00Z")), "9:00");
});

test("variación del día", () => {
  assert.equal(variacion({ precio: 11, cierre_anterior: 10 }).toFixed(2), "0.10");
  assert.equal(variacion({ precio: 11 }), null);
  assert.equal(variacion(undefined), null);
});

test("reparto por mercado, sector y divisa", () => {
  const fichas = { "SAN.MC": { indice: "IBEX35", sector: "Financials", divisa: "EUR" },
                   AAPL: { indice: "DJIA", sector: "Information Technology", divisa: "USD" } };
  const r = reparto([{ simbolo: "SAN.MC", valorEur: 600 }, { simbolo: "AAPL", valorEur: 300 }], 100, fichas);
  assert.equal(r.total, 1000);
  assert.deepEqual(r.mercado.map((g) => [g.nombre, g.fraccion]), [["Madrid", 0.6], ["Nueva York", 0.3], ["Efectivo", 0.1]]);
  assert.deepEqual(r.sector.map((g) => g.nombre), ["Finanzas", "Tecnología", "Efectivo"]);
  assert.deepEqual(r.divisa.map((g) => g.nombre), ["Euro", "Dólar", "Euro (efectivo)"]);
});

test("dividendos estimados con los del año anterior", () => {
  const r = dividendosEstimados({
    titulos: { "SAN.MC": 100, AAPL: 10, KO: 0 },
    eventos: { "SAN.MC": { dividendos: [{ fecha: "2025-11-04", importe: 0.1 }, { fecha: "2025-05-02", importe: 0.1 }] },
               AAPL: { dividendos: [{ fecha: "2025-11-10", importe: 0.25 }] },
               KO: { dividendos: [{ fecha: "2025-11-01", importe: 0.5 }] } },
    divisas: { "SAN.MC": "EUR", AAPL: "USD" }, eurusd: 1.25, desde: "2026-10-23", hasta: "2026-12-31",
  });
  assert.deepEqual(r.map((d) => [d.fecha, d.simbolo, d.importeEur]), [["2026-11-04", "SAN.MC", 10], ["2026-11-10", "AAPL", 2]]);
});

test("importes por mes, base 100 y alineación", () => {
  const meses = porMes([{ fecha: "2026-01-05", importeEur: 10 }, { fecha: "2026-01-20", importeEur: 5 },
                        { fecha: "2026-03-01", importeEur: 2 }, { fecha: "2025-03-01", importeEur: 99 }], 2026);
  assert.deepEqual(meses.slice(0, 3), [15, 0, 2]);
  assert.deepEqual(base100([50, 55, null, 40]).map((v) => (v == null ? v : Math.round(v * 1e6) / 1e6)), [100, 110, null, 80]);
  assert.deepEqual(alinear(["2026-01-01", "2026-01-03", "2026-01-05"],
                           { fechas: ["2026-01-02", "2026-01-04"], valores: [1, 2] }), [null, 1, 2]);
});

test("CSV para Excel en español", () => {
  const texto = aCsv(["Valor", "Importe"], [["SAN.MC", 1234.5], ['Nota "rara"; con punto y coma', null]]);
  assert.equal(texto, '﻿Valor;Importe\r\nSAN.MC;1234,5\r\n"Nota ""rara""; con punto y coma";\r\n');
});
