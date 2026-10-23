// Dividendos: cobrados por año y cartera, estimados hasta fin de año, por mes, por valor y próximos.
import * as datos from "../datos.js";
import { todasLasCarteras, movimientosDe } from "../resumen.js";
import { $, pintar, kpis, tabla, descargar, orientativo } from "../ui.js";
import * as f from "../formato.js";
import { dividendosEstimados, porMes, aCsv } from "../calculos.js";
import { enlaceValor } from "./comun.js";

const filtro = { cartera: "", anio: null };

export async function vista({ actual }) {
  const [calculadas, cambio] = await Promise.all([todasLasCarteras(), datos.tipoCambioActual()]);
  const anioActual = new Date().getFullYear();
  const elegidas = calculadas.filter((r) => !filtro.cartera || r.cartera.ruta === filtro.cartera);
  const cobrados = movimientosDe(elegidas).filter((m) => m.tipo === "dividendo");
  const anios = [...new Set([anioActual, ...cobrados.map((m) => Number(m.fecha.slice(0, 4)))])].sort();
  const anio = filtro.anio && anios.includes(filtro.anio) ? filtro.anio : anioActual;
  const delAnio = cobrados.filter((m) => m.fecha.startsWith(`${anio}-`));
  const delAnterior = cobrados.filter((m) => m.fecha.startsWith(`${anio - 1}-`));
  const suma = (lista) => lista.reduce((s, m) => s + m.importeEur, 0);

  // Estimaciones con los títulos de hoy y los dividendos del año anterior.
  const titulos = {}, eventos = {}, divisas = {};
  for (const r of elegidas) {
    for (const [s, p] of Object.entries(r.estado.posiciones)) titulos[s] = (titulos[s] ?? 0) + p.titulos;
    Object.assign(eventos, r.eventos);
    Object.assign(divisas, r.divisas);
  }
  const hoy = f.hoy();
  const estimadosAnio = anio === anioActual
    ? dividendosEstimados({ titulos, eventos, divisas, eurusd: cambio?.valor ?? 1, desde: hoy, hasta: `${anio}-12-31` }) : [];
  const proximos = dividendosEstimados({ titulos, eventos, divisas, eurusd: cambio?.valor ?? 1, desde: hoy,
                                         hasta: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10) }).slice(0, 5);
  const haceUnAno = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const ultimos12 = suma(cobrados.filter((m) => m.fecha > haceUnAno));
  const valorActual = elegidas.reduce((s, r) => s + r.valoracion.totalEur, 0);

  const meses = porMes(delAnio, anio);
  const mesesEstimados = porMes(estimadosAnio, anio);
  const maximo = Math.max(1, ...meses.map((m, i) => m + mesesEstimados[i]));
  const porValor = Object.entries(delAnio.reduce((acc, m) => ({ ...acc, [m.simbolo]: (acc[m.simbolo] ?? 0) + m.importeEur }), {}))
    .sort((a, b) => b[1] - a[1]);
  const diferencia = suma(delAnio) - suma(delAnterior);

  if (!pintar(actual, `
    <div class="encabezado">
      <div><h1>Dividendos</h1><p class="subtitulo">Importes brutos, sin retenciones · los dólares se convierten al tipo del BCE del día de pago</p></div>
      <div class="fila">
        <select id="cartera" style="width:auto"><option value="">Todas las carteras</option>
          ${calculadas.map((r) => `<option value="${f.html(r.cartera.ruta)}" ${r.cartera.ruta === filtro.cartera ? "selected" : ""}>${f.html(r.cartera.nombre)}</option>`).join("")}</select>
        <div class="segmentado" id="anios">${anios.slice(-4).map((a) => `<button type="button" data-anio="${a}" class="${a === anio ? "activo" : ""}">${a}</button>`).join("")}</div>
      </div>
    </div>
    ${kpis([
      { etiqueta: `Cobrado en ${anio}`, valor: f.eurEntero(suma(delAnio)), nota: `${f.cantidad(delAnio.length, "cobro")} de ${f.cantidad(new Set(delAnio.map((m) => m.simbolo)).size, "valor", "valores")}` },
      anio === anioActual
        ? { etiqueta: "Estimado hasta diciembre", valor: `≈ ${f.eurEntero(suma(estimadosAnio))}`, nota: f.cantidad(estimadosAnio.length, "cobro previsto", "cobros previstos") }
        : { etiqueta: `Media por cobro`, valor: f.eurEntero(delAnio.length ? suma(delAnio) / delAnio.length : 0), nota: `en ${anio}` },
      { etiqueta: "Rentabilidad por dividendo", valor: `${f.num(valorActual ? (ultimos12 / valorActual) * 100 : 0, 1)} %`, nota: "últimos 12 meses sobre el valor actual" },
      { etiqueta: `Frente a ${anio - 1}`, valor: f.eurSigno(diferencia), clase: f.claseSigno(diferencia),
        nota: suma(delAnterior) ? `${f.pctSigno(diferencia / suma(delAnterior), 1)} respecto al año anterior` : `sin cobros en ${anio - 1}` },
    ])}

    <div class="columnas estirar">
      <section class="panel principal" style="gap:14px">
        <div class="fila entre"><h2>Por mes</h2>
          <div class="leyenda"><span><span class="cuadro" style="background:var(--fuerte)"></span>Cobrado</span>
            ${estimadosAnio.length ? `<span><span class="cuadro" style="border:1.5px dashed var(--fuerte)"></span>Estimado</span>` : ""}</div></div>
        <div class="barras-verticales">${meses.map((m, i) => {
          const e = mesesEstimados[i];
          return `<div class="columna" title="${f.nombreMes(i)}: ${f.eurEntero(m)}${e ? ` + ≈ ${f.eurEntero(e)}` : ""}">
            <span>${m + e ? `${e ? "≈" : ""}${f.num(m + e, 0)}` : ""}</span>
            ${e ? `<i class="estimada" style="height:${((e / maximo) * 170).toFixed(0)}px"></i>` : ""}
            ${m ? `<i style="height:${((m / maximo) * 170).toFixed(0)}px"></i>` : ""}</div>`;
        }).join("")}</div>
        <div class="ejes">${meses.map((_, i) => `<span>${f.nombreMes(i)}</span>`).join("")}</div>
      </section>
      <aside class="panel lateral" style="gap:10px">
        <h2>Por valor</h2>
        ${porValor.length ? porValor.slice(0, 8).map(([s, v]) => `<a class="pila" href="${enlaceValor(s)}" style="gap:4px;text-decoration:none">
          <span class="renglon num"><strong>${f.html(s)}</strong><span>${f.eurEntero(v)}</span></span>
          <span style="display:block;height:6px;background:var(--linea-suave)"><span style="display:block;height:6px;width:${((v / porValor[0][1]) * 100).toFixed(1)}%;background:var(--fuerte)"></span></span></a>`).join("")
          : `<p class="vacio">Sin cobros en ${anio}.</p>`}
      </aside>
    </div>

    <div class="columnas">
      <section class="panel negro lateral" style="gap:10px">
        <div class="fila entre"><h2 style="color:inherit">Próximos</h2>${orientativo("Estimado")}</div>
        ${proximos.length ? proximos.map((d) => `<div style="display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #333">
          <span class="pila" style="align-items:center;border:1.5px solid currentColor;padding:4px 0;gap:0"><strong style="font-size:20px;line-height:1">${d.fecha.slice(8, 10)}</strong>
            <span style="font-size:11px;text-transform:uppercase">${f.nombreMes(Number(d.fecha.slice(5, 7)) - 1)}</span></span>
          <span class="pila" style="gap:0;min-width:0"><strong>${f.html(d.simbolo)}</strong><span class="suave" style="font-size:12px">${f.titulos(d.titulos)} títulos × ${f.num(d.porTitulo, 4)} ${d.divisa === "USD" ? "$" : "€"}</span></span>
          <strong class="num">≈ ${d.importeEur < 100 ? f.eur(d.importeEur) : f.eurEntero(d.importeEur)}</strong></div>`).join("")
          : `<p class="suave" style="margin:0">No se esperan dividendos en los próximos cuatro meses.</p>`}
        <span class="aviso" style="color:var(--gris-3)">Estimados con los dividendos del año anterior en las mismas fechas y los títulos de hoy. La fecha y el importe reales pueden variar.</span>
      </section>
      <section class="principal" style="gap:12px">
        <div class="fila entre"><h2>Cobrados en ${anio}</h2>${delAnio.length ? `<button class="boton linea pequeno" id="exportar" type="button">Exportar CSV</button>` : ""}</div>
        ${delAnio.length ? tabla(["Fecha", "Valor", { texto: "Cartera", izq: true }, "Títulos", "Por título", "Importe"],
          delAnio.map((m) => `<tr class="clicable" data-simbolo="${f.html(m.simbolo)}"><td>${f.fecha(m.fecha)}</td><td><strong>${f.html(m.simbolo)}</strong></td>
            <td class="izq">${f.html(m.cartera.nombre)}</td><td>${f.titulos(m.titulos)}</td><td>${f.num(m.porTitulo, 4)} ${m.divisa === "USD" ? "$" : "€"}</td>
            <td><strong>${f.eur(m.importeEur)}</strong></td></tr>`))
          : `<p class="vacio">Sin cobros en ${anio}.</p>`}
      </section>
    </div>`)) return;

  const recargar = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
  $("#cartera").addEventListener("change", (e) => { filtro.cartera = e.target.value; recargar(); });
  $("#anios").addEventListener("click", (e) => {
    const b = e.target.closest("[data-anio]");
    if (b) { filtro.anio = Number(b.dataset.anio); recargar(); }
  });
  document.querySelectorAll("tr[data-simbolo]").forEach((t) => t.addEventListener("click", () => { location.hash = enlaceValor(t.dataset.simbolo); }));
  $("#exportar")?.addEventListener("click", () => descargar(`dividendos-${anio}.csv`, aCsv(
    ["Fecha", "Valor", "Cartera", "Títulos", "Por título", "Divisa", "Importe (€)"],
    delAnio.map((m) => [m.fecha, m.simbolo, m.cartera.nombre, m.titulos, m.porTitulo, m.divisa, Math.round(m.importeEur * 100) / 100]))));
}
