// Cálculos de presentación que no leen Firestore: horario de las bolsas, reparto de una
// cartera, dividendos estimados, agrupaciones y exportación a CSV.
import { aEuros } from "./cartera.js";

// ── Sectores (clasificación GICS de la lista de valores) ─────────────────────

const SECTORES = {
  "Communication Services": "Telecomunicaciones",
  "Consumer Discretionary": "Consumo discrecional",
  "Consumer Staples": "Consumo básico",
  Energy: "Energía",
  Financials: "Finanzas",
  "Health Care": "Salud",
  Industrials: "Industria",
  "Information Technology": "Tecnología",
  Materials: "Materiales",
  "Real Estate": "Inmobiliario",
  Utilities: "Servicios públicos",
};

export const sector = (nombre) => SECTORES[nombre] ?? nombre ?? "Otros";

// ── Bolsas ───────────────────────────────────────────────────────────────────

export const PLAZAS = {
  madrid: { nombre: "Bolsa de Madrid", ciudad: "Madrid", zona: "Europe/Madrid", abre: [9, 0], cierra: [17, 30] },
  nuevayork: { nombre: "Bolsa de Nueva York", ciudad: "Nueva York", zona: "America/New_York", abre: [9, 30],
               cierra: [16, 0] },
};

/** Plaza de un valor o de un índice según el índice al que pertenece. */
export const plazaDe = (indice) => (indice === "DJIA" ? PLAZAS.nuevayork : PLAZAS.madrid);

/** Fecha (AAAA-MM-DD), día de la semana (0 = domingo), hora y minuto de un instante en una zona. */
export function enZona(instante, zona) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    weekday: "short", hourCycle: "h23",
  }).formatToParts(instante).map((p) => [p.type, p.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, dia: dias[partes.weekday],
           hora: Number(partes.hour), minuto: Number(partes.minute) };
}

/** Instante en que el reloj de `zona` marca la fecha y la hora dadas. */
export function instanteEnZona(fecha, hora, minuto, zona) {
  const [a, m, d] = fecha.split("-").map(Number);
  let t = Date.UTC(a, m - 1, d, hora, minuto);
  for (let i = 0; i < 2; i++) {
    const local = enZona(new Date(t), zona);
    const [la, lm, ld] = local.fecha.split("-").map(Number);
    t += Date.UTC(a, m - 1, d, hora, minuto) - Date.UTC(la, lm - 1, ld, local.hora, local.minuto);
  }
  return new Date(t);
}

/** Hora (HH:MM) de un instante en hora peninsular. */
export function horaPeninsular(instante) {
  const { hora, minuto } = enZona(instante, "Europe/Madrid");
  return `${hora}:${String(minuto).padStart(2, "0")}`;
}

/**
 * Estado de la sesión ordinaria de una plaza (sin festivos): {abierta, abre, cierra, texto}.
 * Las horas del texto van en hora peninsular.
 */
export function estadoSesion(plaza, ahora = new Date()) {
  const local = enZona(ahora, plaza.zona);
  const abre = instanteEnZona(local.fecha, ...plaza.abre, plaza.zona);
  const cierra = instanteEnZona(local.fecha, ...plaza.cierra, plaza.zona);
  const laborable = local.dia >= 1 && local.dia <= 5;
  const abierta = laborable && ahora >= abre && ahora < cierra;
  const texto = abierta ? `Abierta · cierra a las ${horaPeninsular(cierra)}`
    : laborable && ahora < abre ? `Cerrada · abre a las ${horaPeninsular(abre)}`
    : `Cerrada · sesión de ${horaPeninsular(abre)} a ${horaPeninsular(cierra)}`;
  return { abierta, abre, cierra, texto };
}

/** Variación de una cotización respecto al cierre anterior, en fracción. */
export function variacion(cot) {
  return cot?.precio != null && cot.cierre_anterior ? cot.precio / cot.cierre_anterior - 1 : null;
}

// ── Cartera ──────────────────────────────────────────────────────────────────

/**
 * Reparto del valor de una cartera por mercado, sector y divisa.
 * @param {Array} posiciones  de valorar(): {simbolo, valorEur}
 * @param {number} efectivo   euros
 * @param {object} fichas     {simbolo: {indice, sector, divisa}}
 */
export function reparto(posiciones, efectivo, fichas) {
  const total = posiciones.reduce((s, p) => s + (p.valorEur ?? 0), 0) + efectivo;
  const agrupar = (clave) => {
    const grupos = new Map();
    for (const p of posiciones) {
      const nombre = clave(fichas[p.simbolo] ?? {});
      grupos.set(nombre, (grupos.get(nombre) ?? 0) + (p.valorEur ?? 0));
    }
    const lista = [...grupos].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
    if (efectivo > 0) lista.push({ nombre: "Efectivo", valor: efectivo, efectivo: true });
    return lista.map((g) => ({ ...g, fraccion: total > 0 ? g.valor / total : 0 }));
  };
  return {
    total,
    mercado: agrupar((f) => plazaDe(f.indice).ciudad),
    sector: agrupar((f) => sector(f.sector)),
    divisa: agrupar((f) => (f.divisa === "USD" ? "Dólar" : "Euro")).map((g) => (g.efectivo ? { ...g, nombre: "Euro (efectivo)" } : g)),
  };
}

const sumarAnio = (fecha, anios) => `${Number(fecha.slice(0, 4)) + anios}${fecha.slice(4)}`;

/**
 * Dividendos estimados entre `desde` y `hasta` (AAAA-MM-DD): los del año anterior en las mismas
 * fechas, con los títulos de hoy. Es una estimación: la fecha y el importe reales pueden variar.
 * @param {object} titulos   {simbolo: títulos}
 * @param {object} eventos   {simbolo: {dividendos: [{fecha, importe}]}}
 * @param {object} divisas   {simbolo: divisa}
 * @param {number} eurusd    dólares por euro
 */
export function dividendosEstimados({ titulos, eventos, divisas, eurusd, desde, hasta }) {
  const r = [];
  for (const [simbolo, n] of Object.entries(titulos)) {
    if (!(n > 0)) continue;
    for (const d of eventos[simbolo]?.dividendos ?? []) {
      const fecha = sumarAnio(d.fecha, 1);
      if (fecha < desde || fecha > hasta) continue;
      r.push({ fecha, simbolo, titulos: n, porTitulo: d.importe, divisa: divisas[simbolo],
               importeEur: aEuros(n * d.importe, divisas[simbolo], eurusd), estimado: true });
    }
  }
  return r.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Suma de importes por mes (12 posiciones) de los movimientos de un año. */
export function porMes(movimientos, anio) {
  const meses = Array(12).fill(0);
  for (const m of movimientos) {
    if (m.fecha.startsWith(`${anio}-`)) meses[Number(m.fecha.slice(5, 7)) - 1] += m.importeEur;
  }
  return meses;
}

/** Serie en base 100 a partir de su primer valor. */
export function base100(valores) {
  const inicio = valores.find((v) => v != null && v !== 0);
  return valores.map((v) => (v == null || !inicio ? null : (v / inicio) * 100));
}

/** Valores de una serie {fechas, valores} alineados con otras fechas (último conocido). */
export function alinear(fechas, serie) {
  const r = [];
  let j = -1;
  for (const f of fechas) {
    while (j + 1 < serie.fechas.length && serie.fechas[j + 1] <= f) j++;
    r.push(j < 0 ? null : serie.valores[j]);
  }
  return r;
}

// ── Exportación ──────────────────────────────────────────────────────────────

/** Texto CSV para Excel en español: separador «;», coma decimal y marca UTF-8. */
export function aCsv(cabeceras, filas) {
  const celda = (v) => {
    if (v == null) return "";
    const texto = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return "﻿" + [cabeceras, ...filas].map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}
