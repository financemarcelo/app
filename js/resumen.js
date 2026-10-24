// Cálculo de las carteras de la cuenta con los datos de Firestore, guardado en memoria un minuto o
// hasta la siguiente escritura (operación, cambio de miembros, alta o baja de una cartera).
import * as datos from "./datos.js";
import * as cartera from "./cartera.js";
import { sesion } from "./sesion.js";
import { hoy } from "./formato.js";
import { variacion } from "./calculos.js";

const VIGENCIA_MS = 60_000; // las operaciones de otros miembros aparecen, como mucho, un minuto después
let memoria = null;
let momento = 0;

export function invalidar() {
  memoria = null;
}

/** Reúne lo necesario para calcular una cartera y la calcula. */
export async function calcularCartera(c, { conSerie = false } = {}) {
  const [operaciones, cotizaciones, cambio] = await Promise.all([
    datos.operaciones(c), datos.cotizaciones(), datos.tipoCambioActual()]);
  const simbolos = [...new Set(operaciones.map((o) => o.simbolo))];
  const fichas = Object.fromEntries(await Promise.all(simbolos.map(async (s) => [s, await datos.fichaValor(s)])));
  const eventos = Object.fromEntries(simbolos.map((s) => [s, fichas[s] ?? {}]));
  const divisas = Object.fromEntries(simbolos.map((s) => [s, fichas[s]?.divisa ?? "EUR"]));
  const anioInicio = Number([c.fecha_inicio, ...operaciones.map((o) => o.fecha_mercado)].sort()[0].slice(0, 4));
  const anioActual = new Date().getUTCFullYear();
  const [serieCambio, sesiones] = await Promise.all([
    datos.serieTipoCambio(anioInicio, anioActual),
    Promise.all(simbolos.map(async (s) => [s, await datos.sesiones(s, anioInicio, anioActual)]))
      .then(Object.fromEntries),
  ]);
  const tipoCambio = serieCambio.fechas.length ? cartera.serieHasta(serieCambio) : () => cambio.valor;
  const cierreHasta = cartera.indiceCierres(sesiones);
  const cierreAnterior = (s, fecha) => {
    const i = cartera.ultimoIndiceHasta(sesiones[s]?.fechas ?? [], fecha) - (sesiones[s]?.fechas.includes(fecha) ? 1 : 0);
    return i >= 0 ? sesiones[s].cierres[i] : null;
  };
  const base = { capitalInicial: c.capital_inicial, operaciones, eventos, divisas, tipoCambio };
  const estado = cartera.reconstruir({ ...base, cierreAnterior });
  const precios = Object.fromEntries(simbolos.map((s) => [s, cotizaciones[s]?.precio ?? cierreHasta(s, "9999-12-31")]));
  const valoracion = cartera.valorar(estado, precios, divisas, cambio.valor);
  // Variación del día de las posiciones: títulos × (último precio − cierre anterior).
  const hoyEur = valoracion.posiciones.reduce((suma, p) => {
    const cot = cotizaciones[p.simbolo];
    const v = variacion(cot);
    return v == null || p.valorEur == null ? suma : suma + p.valorEur - p.valorEur / (1 + v);
  }, 0);
  const serie = conSerie ? cartera.serieValor({ ...base, sesiones, desde: c.fecha_inicio, hasta: hoy() }) : null;
  // Capital aportado en dólares: al tipo del BCE del día de inicio.
  const capitalEur = c.capital_inicial, capitalUsd = c.capital_inicial * tipoCambio(c.fecha_inicio);
  // `linea`: lo necesario para recalcular la cartera con una operación más (operar en una fecha pasada).
  return { cartera: c, operaciones, estado, valoracion, serie, cotizaciones, cambio, divisas, fichas, eventos,
           sesiones, hoyEur, hoyUsd: hoyEur * cambio.valor, capitalEur, capitalUsd, linea: { ...base, cierreAnterior } };
}

/**
 * Todas las carteras de la cuenta calculadas (con su serie diaria), de la más antigua a la más
 * reciente. Las carteras en las que la cuenta solo es lectora (por un cuaderno) no se incluyen.
 */
export async function todasLasCarteras() {
  if (memoria && Date.now() - momento < VIGENCIA_MS) return memoria;
  momento = Date.now();
  memoria = (async () => {
    const lista = await datos.carteras(sesion.usuario);
    return Promise.all(lista.map((c) => calcularCartera(c, { conSerie: true })));
  })();
  try {
    return await memoria;
  } catch (e) {
    memoria = null;
    throw e;
  }
}

/** Efectivo que mueve una operación, con la comisión: negativo en las compras. */
const importeOperacion = (o) => (o.tipo === "compra" ? -(o.importe_eur + (o.comision_eur ?? 0))
  : o.importe_eur - (o.comision_eur ?? 0));

/** Movimientos de todas las carteras: operaciones y eventos, con la cartera a la que pertenecen. */
export function movimientosDe(calculadas) {
  return calculadas.flatMap((r) => [
    ...r.operaciones.map((o) => ({ fecha: o.fecha_mercado, tipo: o.tipo, simbolo: o.simbolo, cartera: r.cartera,
                                   titulos: o.titulos, precio: o.precio, divisa: o.divisa, autor: o.autor,
                                   comisionEur: o.comision_eur ?? 0, comisionUsd: (o.comision_eur ?? 0) * o.eurusd,
                                   marca: o.marca, importeEur: importeOperacion(o), importeUsd: importeOperacion(o) * o.eurusd })),
    ...r.estado.movimientos.map((m) => ({ ...m, cartera: r.cartera })),
  ]).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.marca ?? 0) - (a.marca ?? 0)));
}
