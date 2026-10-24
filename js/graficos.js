// Gráficos de línea con Chart.js (cargado como script global desde el CDN) y minigráficos SVG.

const graficos = new WeakMap();
const MAX_PUNTOS = 800;

/** Reduce una serie larga tomando un punto de cada k, conservando siempre el último. */
export function reducir(etiquetas, valores, max = MAX_PUNTOS) {
  if (etiquetas.length <= max) return { etiquetas, valores };
  const paso = Math.ceil(etiquetas.length / max);
  const e = [], v = [];
  for (let i = 0; i < etiquetas.length; i += paso) { e.push(etiquetas[i]); v.push(valores[i]); }
  if (e[e.length - 1] !== etiquetas[etiquetas.length - 1]) {
    e.push(etiquetas[etiquetas.length - 1]); v.push(valores[valores.length - 1]);
  }
  return { etiquetas: e, valores: v };
}

const color = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

/**
 * Dibuja una o varias series en un lienzo.
 * @param {HTMLCanvasElement} lienzo
 * @param {string[]} etiquetas           fechas ya formateadas
 * @param {Array} series                 [{nombre, valores, comparacion?: true}]; la primera es la principal
 * @param {Function} formato             valor -> texto
 */
export function dibujarSeries(lienzo, etiquetas, series, formato) {
  if (!window.Chart || !lienzo?.isConnected) return;
  graficos.get(lienzo)?.destroy();
  const paso = Math.max(1, Math.ceil(etiquetas.length / MAX_PUNTOS));
  const tomar = (lista) => reducir(etiquetas, lista, MAX_PUNTOS).valores;
  const ejeX = paso > 1 ? reducir(etiquetas, etiquetas, MAX_PUNTOS).valores : etiquetas;
  const texto = color("--texto"), suave = color("--suave"), linea = color("--linea-suave");
  // Una fecha cada 120 px como mucho, para que no se solapen en los gráficos estrechos.
  const marcasX = Math.max(3, Math.min(7, Math.floor((lienzo.parentElement?.clientWidth || 700) / 120)));
  const grafico = new window.Chart(lienzo, {
    type: "line",
    data: {
      labels: ejeX,
      datasets: series.map((s, i) => ({
        label: s.nombre, data: tomar(s.valores), pointRadius: 0, tension: 0, spanGaps: true,
        borderColor: s.comparacion ? color("--gris-2") : texto, borderWidth: s.comparacion ? 1.5 : 2,
        borderDash: s.comparacion ? [5, 4] : [], fill: i === 0 && !s.comparacion ? "start" : false,
        backgroundColor: "rgba(127, 127, 127, 0.08)",
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label ? `${c.dataset.label}: ` : ""}${formato(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: marcasX, maxRotation: 0, color: suave }, grid: { display: false }, border: { color: texto } },
        y: { position: "right", ticks: { callback: (v) => formato(v), color: suave, maxTicksLimit: 6 },
             grid: { color: linea }, border: { display: false } },
      },
    },
  });
  graficos.set(lienzo, grafico);
}

export function dibujarLinea(lienzo, etiquetas, valores, formato) {
  dibujarSeries(lienzo, etiquetas, [{ nombre: "", valores }], formato);
}

/** Puntos de un minigráfico SVG (ancho × alto) para una lista de valores. */
function puntosMinigrafico(valores, ancho = 120, alto = 36) {
  const v = valores.filter((x) => x != null);
  if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v), rango = max - min || 1;
  const paso = ancho / (v.length - 1);
  return v.map((x, i) => `${(i * paso).toFixed(1)},${(alto - 2 - ((x - min) / rango) * (alto - 4)).toFixed(1)}`).join(" ");
}

export function minigrafico(valores, ancho = 120, alto = 36) {
  return `<svg class="minigrafico" viewBox="0 0 ${ancho} ${alto}" style="width:${ancho}px;height:${alto}px" aria-hidden="true">
    <polyline points="${puntosMinigrafico(valores, ancho, alto)}"></polyline></svg>`;
}
