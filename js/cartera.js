// Cálculo de una cartera artificial a partir de sus operaciones y de los eventos de cada
// valor (dividendos, desdoblamientos y ajustes). Funciones puras: no leen Firestore.
//
// Convenciones:
// - Importes de la cartera en euros. Los valores en dólares se convierten con el tipo de
//   cambio de referencia del BCE (dólares por euro).
// - Un evento con fecha D afecta a los títulos que había al empezar D: se aplica antes que
//   las operaciones de ese mismo día.
// - «desdoblamiento» multiplica los títulos por numerador/denominador.
// - «ajuste» (ampliación con derechos, dividendo en acciones, escisión) no cambia los
//   títulos: se abona en efectivo el valor que pierde la acción,
//   títulos × cierre anterior × (1 − denominador/numerador).

export function aEuros(importe, divisa, eurusd) {
  if (divisa === "EUR") return importe;
  if (divisa === "USD") return importe / eurusd;
  throw new Error(`Divisa no admitida: ${divisa}`);
}

export function importeOperacionEur({ titulos, precio, divisa, eurusd }) {
  return aEuros(titulos * precio, divisa, eurusd);
}

/** Lista ordenada de sucesos: eventos antes que operaciones en la misma fecha. */
function sucesos(operaciones, eventos, simbolosOperados) {
  const lista = [];
  for (const op of operaciones) {
    lista.push({ fecha: op.fecha_mercado, orden: 1, marca: op.marca ?? 0, tipo: op.tipo, op });
  }
  for (const simbolo of simbolosOperados) {
    const ev = eventos[simbolo] || {};
    for (const d of ev.dividendos || []) {
      lista.push({ fecha: d.fecha, orden: 0, tipo: "dividendo", simbolo, importe: d.importe });
    }
    for (const s of ev.desdoblamientos || []) {
      lista.push({ fecha: s.fecha, orden: 0, tipo: s.tipo === "desdoblamiento" ? "desdoblamiento" : "ajuste",
                   simbolo, numerador: s.numerador, denominador: s.denominador });
    }
  }
  lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden || a.marca - b.marca));
  return lista;
}

/**
 * Recorre la cartera hasta la fecha `hasta` (incluida) y devuelve su estado.
 *
 * @param {object} p
 * @param {number} p.capitalInicial      euros
 * @param {Array}  p.operaciones          {fecha_mercado, simbolo, tipo: "compra"|"venta", titulos, importe_eur}
 * @param {object} p.eventos              {simbolo: {dividendos: [], desdoblamientos: []}}
 * @param {object} p.divisas              {simbolo: "EUR"|"USD"}
 * @param {Function} p.tipoCambio         fecha -> dólares por euro
 * @param {Function} p.cierreAnterior     (simbolo, fecha) -> cierre de la sesión anterior, o null
 * @param {string} [p.hasta]              AAAA-MM-DD
 */
export function reconstruir({ capitalInicial, operaciones, eventos, divisas, tipoCambio, cierreAnterior,
                              hasta = "9999-12-31" }) {
  const estado = { efectivo: capitalInicial, posiciones: {}, dividendosEur: 0, ajustesEur: 0,
                   resultadoRealizadoEur: 0, movimientos: [] };
  const operados = new Set(operaciones.map((o) => o.simbolo));

  for (const s of sucesos(operaciones, eventos, operados)) {
    if (s.fecha > hasta) break;
    const simbolo = s.simbolo ?? s.op.simbolo;
    const pos = estado.posiciones[simbolo];

    if (s.tipo === "compra" || s.tipo === "venta") {
      aplicarOperacion(estado, s.op);
    } else if (!pos || pos.titulos <= 0) {
      continue; // el evento no afecta a quien no tiene títulos
    } else if (s.tipo === "dividendo") {
      const eur = aEuros(pos.titulos * s.importe, divisas[simbolo], tipoCambio(s.fecha));
      estado.efectivo += eur;
      estado.dividendosEur += eur;
      estado.movimientos.push({ fecha: s.fecha, tipo: "dividendo", simbolo, importeEur: eur,
                                detalle: `${fmt(s.importe)} ${divisas[simbolo]} por título` });
    } else if (s.tipo === "desdoblamiento") {
      const antes = pos.titulos;
      pos.titulos = antes * s.numerador / s.denominador;
      estado.movimientos.push({ fecha: s.fecha, tipo: "desdoblamiento", simbolo, importeEur: 0,
                                detalle: `${s.numerador}:${s.denominador} (${fmt(antes)} → ${fmt(pos.titulos)} títulos)` });
    } else if (s.tipo === "ajuste") {
      const cierre = cierreAnterior(simbolo, s.fecha);
      const factor = s.denominador / s.numerador;
      const eur = cierre ? aEuros(pos.titulos * cierre * (1 - factor), divisas[simbolo], tipoCambio(s.fecha)) : 0;
      estado.efectivo += eur;
      estado.ajustesEur += eur;
      pos.costeEur -= eur;
      estado.movimientos.push({ fecha: s.fecha, tipo: "ajuste", simbolo, importeEur: eur,
                                detalle: `${s.numerador}:${s.denominador}` });
    }
  }
  return estado;
}

function aplicarOperacion(estado, op) {
  const pos = (estado.posiciones[op.simbolo] ??= { titulos: 0, costeEur: 0 });
  if (op.tipo === "compra") {
    pos.titulos += op.titulos;
    pos.costeEur += op.importe_eur;
    estado.efectivo -= op.importe_eur;
  } else {
    const costeVendido = pos.titulos > 0 ? pos.costeEur * (op.titulos / pos.titulos) : 0;
    pos.titulos -= op.titulos;
    pos.costeEur -= costeVendido;
    estado.efectivo += op.importe_eur;
    estado.resultadoRealizadoEur += op.importe_eur - costeVendido;
    if (pos.titulos <= 1e-9) delete estado.posiciones[op.simbolo];
  }
}

/** Comprueba una operación antes de guardarla. Devuelve un texto de error o null. */
export function validarOperacion(estado, { tipo, simbolo, titulos, importeEur }) {
  if (!Number.isFinite(titulos) || titulos <= 0) return "El número de títulos debe ser mayor que cero.";
  if (!Number.isInteger(titulos)) return "El número de títulos debe ser entero.";
  if (tipo === "compra" && importeEur > estado.efectivo + 1e-6) return "No hay efectivo suficiente.";
  if (tipo === "venta") {
    const disponibles = estado.posiciones[simbolo]?.titulos ?? 0;
    if (titulos > disponibles + 1e-9) return `Solo hay ${fmt(disponibles)} títulos para vender.`;
  }
  return null;
}

/**
 * Valoración a precios actuales.
 * @param {object} estado      resultado de reconstruir()
 * @param {object} precios     {simbolo: precio en su divisa}
 * @param {object} divisas     {simbolo: divisa}
 * @param {number} eurusd      dólares por euro
 */
export function valorar(estado, precios, divisas, eurusd) {
  const posiciones = Object.entries(estado.posiciones).map(([simbolo, p]) => {
    const precio = precios[simbolo];
    const valorEur = precio == null ? null : aEuros(p.titulos * precio, divisas[simbolo], eurusd);
    const plusvaliaEur = valorEur == null ? null : valorEur - p.costeEur;
    return { simbolo, titulos: p.titulos, costeEur: p.costeEur, precio, valorEur, plusvaliaEur,
             plusvaliaPct: plusvaliaEur == null || p.costeEur <= 0 ? null : plusvaliaEur / p.costeEur };
  });
  const valorPosicionesEur = posiciones.reduce((s, p) => s + (p.valorEur ?? 0), 0);
  return { posiciones, valorPosicionesEur, totalEur: estado.efectivo + valorPosicionesEur };
}

/**
 * Serie diaria del valor de la cartera.
 * @param {object} p           los mismos datos que reconstruir(), más:
 * @param {object} p.sesiones  {simbolo: {fechas: [], cierres: []}} ordenadas
 * @param {string} p.desde     primera fecha de la serie
 * @param {string} p.hasta     última fecha de la serie
 * @returns {Array<{fecha, totalEur}>}
 */
export function serieValor({ capitalInicial, operaciones, eventos, divisas, tipoCambio, sesiones,
                             desde, hasta }) {
  const fechas = [...new Set(Object.values(sesiones).flatMap((s) => s.fechas))]
    .filter((f) => f >= desde && f <= hasta).sort();
  if (!fechas.includes(desde)) fechas.unshift(desde);
  const cierreHasta = indiceCierres(sesiones);
  const cierreAnterior = (simbolo, fecha) => cierreHasta(simbolo, anteriorA(fecha));

  const serie = [];
  for (const fecha of fechas) {
    const estado = reconstruir({ capitalInicial, operaciones, eventos, divisas, tipoCambio, cierreAnterior,
                                 hasta: fecha });
    let total = estado.efectivo;
    for (const [simbolo, p] of Object.entries(estado.posiciones)) {
      const cierre = cierreHasta(simbolo, fecha);
      if (cierre != null) total += aEuros(p.titulos * cierre, divisas[simbolo], tipoCambio(fecha));
    }
    serie.push({ fecha, totalEur: total });
  }
  return serie;
}

/** Función (simbolo, fecha) -> último cierre en o antes de fecha. */
export function indiceCierres(sesiones) {
  return (simbolo, fecha) => {
    const s = sesiones[simbolo];
    if (!s) return null;
    const i = ultimoIndiceHasta(s.fechas, fecha);
    return i < 0 ? null : s.cierres[i];
  };
}

/** Función fecha -> último valor en o antes de fecha de una serie {fechas, valores}. */
export function serieHasta({ fechas, valores }) {
  return (fecha) => {
    const i = ultimoIndiceHasta(fechas, fecha);
    return i < 0 ? valores[0] : valores[i];
  };
}

export function ultimoIndiceHasta(fechas, fecha) {
  let bajo = 0, alto = fechas.length - 1, r = -1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    if (fechas[medio] <= fecha) { r = medio; bajo = medio + 1; } else { alto = medio - 1; }
  }
  return r;
}

function anteriorA(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
