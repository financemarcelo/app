// Gráficos de línea con Chart.js (cargado como script global desde el CDN).

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

export function dibujarLinea(lienzo, etiquetas, valores, formato) {
  if (!window.Chart || !lienzo) return;
  graficos.get(lienzo)?.destroy();
  const color = getComputedStyle(document.documentElement).getPropertyValue("--acento").trim();
  const serie = reducir(etiquetas, valores);
  const grafico = new window.Chart(lienzo, {
    type: "line",
    data: { labels: serie.etiquetas, datasets: [{ data: serie.valores, borderColor: color, borderWidth: 1.5,
                                                 pointRadius: 0, tension: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false },
                 tooltip: { callbacks: { label: (c) => formato(c.parsed.y) } } },
      scales: { x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
                y: { ticks: { callback: (v) => formato(v) } } },
    },
  });
  graficos.set(lienzo, grafico);
}
