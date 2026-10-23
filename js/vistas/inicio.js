// Inicio: patrimonio, carteras, actividad, movimientos del día, seguimiento y próximos dividendos.
import * as datos from "../datos.js";
import { sesion, nombrePropio } from "../sesion.js";
import { todasLasCarteras, movimientosDe } from "../resumen.js";
import { pintar, kpis } from "../ui.js";
import * as f from "../formato.js";
import { minigrafico } from "../graficos.js";
import { variacion, dividendosEstimados, PLAZAS, estadoSesion } from "../calculos.js";
import { enlaceCartera, etiquetaCompartida, describirMovimiento, textoVariacion } from "./comun.js";

export async function vista({ actual }) {
  const [calculadas, valores, cotizaciones, cambio] = await Promise.all([
    todasLasCarteras(), datos.listaValores(), datos.cotizaciones(), datos.tipoCambioActual()]);
  const total = calculadas.reduce((s, r) => s + r.valoracion.totalEur, 0);
  const aportado = calculadas.reduce((s, r) => s + r.cartera.capital_inicial, 0);
  const hoyEur = calculadas.reduce((s, r) => s + r.hoyEur, 0);
  const anio = new Date().getFullYear();
  const movimientos = movimientosDe(calculadas);
  const dividendosAnio = movimientos.filter((m) => m.tipo === "dividendo" && m.fecha.startsWith(`${anio}-`));
  const nombres = Object.fromEntries(valores.map((v) => [v.simbolo, v.nombre]));

  // Valores que más suben y más bajan en su última sesión.
  const conVariacion = valores.map((v) => ({ ...v, var: variacion(cotizaciones[v.simbolo]) }))
    .filter((v) => v.var != null).sort((a, b) => b.var - a.var);
  const suben = conVariacion.filter((v) => v.var > 0).slice(0, 3);
  const bajan = conVariacion.filter((v) => v.var < 0).slice(-3).reverse();

  // Próximos dividendos estimados: títulos actuales de todas las carteras.
  const titulos = {}, eventos = {}, divisas = {};
  for (const r of calculadas) {
    for (const [s, p] of Object.entries(r.estado.posiciones)) titulos[s] = (titulos[s] ?? 0) + p.titulos;
    Object.assign(eventos, r.eventos);
    Object.assign(divisas, r.divisas);
  }
  const desde = f.hoy();
  const hasta = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const proximos = dividendosEstimados({ titulos, eventos, divisas, eurusd: cambio?.valor ?? 1, desde, hasta }).slice(0, 4);

  const horas = Object.values(cotizaciones).map((c) => c.hora).sort();
  const madrid = estadoSesion(PLAZAS.madrid), ny = estadoSesion(PLAZAS.nuevayork);
  const textoVar = (v) => textoVariacion(cotizaciones[v.simbolo]);
  const seguimiento = sesion.preferencias.seguimiento.map((s) => ({ simbolo: s, cot: cotizaciones[s],
    divisa: valores.find((v) => v.simbolo === s)?.divisa }));

  if (!pintar(actual, `
    <div class="encabezado">
      <div><h1>Hola, ${f.html(nombrePropio())}.</h1>
        <p class="subtitulo">${f.fechaLarga()} · última cotización ${f.fechaHora(horas.at(-1))} · Madrid ${madrid.abierta ? "abierta" : "cerrada"} · Nueva York ${ny.abierta ? "abierta" : "cerrada"}</p></div>
      <a class="boton" href="#/operar">Nueva operación</a>
    </div>

    ${kpis([
      { etiqueta: "Patrimonio total", valor: f.eurEntero(total), nota: `${calculadas.length} ${calculadas.length === 1 ? "cartera" : "carteras"}` },
      { etiqueta: "Hoy", valor: f.eurSigno(hoyEur), clase: f.claseSigno(hoyEur), nota: `${f.pctSigno(total - hoyEur ? hoyEur / (total - hoyEur) : null)} desde el cierre anterior` },
      { etiqueta: "Rentabilidad total", valor: f.pctSigno(aportado ? total / aportado - 1 : null), clase: f.claseSigno(total - aportado), nota: `sobre ${f.eurEntero(aportado)} aportados` },
      { etiqueta: `Dividendos ${anio}`, valor: f.eurEntero(dividendosAnio.reduce((s, m) => s + m.importeEur, 0)), nota: f.cantidad(dividendosAnio.length, "cobro") },
    ])}

    <div class="columnas">
      <section class="principal">
        <div class="fila entre" style="align-items:baseline"><h2>Mis carteras</h2><a href="#/carteras/nueva" style="font-weight:600;font-size:14px">+ Nueva cartera</a></div>
        ${calculadas.length ? calculadas.map((r) => {
          const rent = r.valoracion.totalEur / r.cartera.capital_inicial - 1;
          const compartida = etiquetaCompartida(r.cartera);
          return `<a class="tarjeta-cartera" href="${enlaceCartera(r.cartera)}">
            <span class="pila" style="gap:4px;min-width:0"><strong style="font-size:17px">${f.html(r.cartera.nombre)}</strong>
              <span class="suave" style="font-size:13px">${Object.keys(r.estado.posiciones).length} valores · desde ${f.fecha(r.cartera.fecha_inicio)}${compartida ? ` · ${compartida}` : ""}</span></span>
            <span class="pila" style="gap:0;align-items:flex-end"><strong class="num" style="font-size:20px">${f.eurEntero(r.valoracion.totalEur)}</strong>
              <span class="${f.claseSigno(rent)}" style="font-size:13px;font-weight:600">${f.pctSigno(rent)}</span></span>
            ${minigrafico((r.serie ?? []).map((p) => p.totalEur))}</a>`;
        }).join("") : `<div class="panel"><p class="vacio">Todavía no tienes carteras.</p><div><a class="boton" href="#/carteras/nueva">Crear mi primera cartera</a></div></div>`}

        <h2 style="margin-top:8px">Actividad reciente</h2>
        ${movimientos.length ? `<div class="lista">${movimientos.slice(0, 8).map((m) => `<div>
          <span class="suave">${f.fechaCorta(m.fecha)}</span>
          <span><strong>${f.html(describirMovimiento(m).tipo)}</strong> · ${f.html(describirMovimiento(m).texto)} <span class="suave">en ${f.html(m.cartera.nombre)}</span></span>
          <span class="num" style="font-weight:600">${m.importeEur ? f.eurSigno(m.importeEur) : "—"}</span></div>`).join("")}</div>`
          : `<p class="vacio">Sin movimientos todavía.</p>`}
      </section>

      <aside class="lateral">
        <section class="panel">
          <h3 class="titulo-seccion">Más suben hoy</h3>
          ${suben.map((v) => `<a class="renglon" href="#/valor/${encodeURIComponent(v.simbolo)}" style="text-decoration:none"><span><strong>${f.html(v.simbolo)}</strong> ${f.html(nombres[v.simbolo] ?? "")}</span><strong class="sube num">${textoVar(v)}</strong></a>`).join("") || `<p class="vacio">—</p>`}
          <h3 class="titulo-seccion" style="margin-top:8px">Más bajan hoy</h3>
          ${bajan.map((v) => `<a class="renglon" href="#/valor/${encodeURIComponent(v.simbolo)}" style="text-decoration:none"><span><strong>${f.html(v.simbolo)}</strong> ${f.html(nombres[v.simbolo] ?? "")}</span><strong class="baja num">${textoVar(v)}</strong></a>`).join("") || `<p class="vacio">—</p>`}
        </section>
        <section class="panel">
          <div class="fila entre"><h3 class="titulo-seccion">En seguimiento</h3><a href="#/mercado?pestana=seguimiento" style="font-size:13px;font-weight:600">Editar</a></div>
          ${seguimiento.length ? seguimiento.map((s) => {
            const v = variacion(s.cot);
            return `<a class="renglon num" href="#/valor/${encodeURIComponent(s.simbolo)}" style="text-decoration:none"><strong>${f.html(s.simbolo)}</strong>
              <span>${f.precio(s.cot?.precio, s.divisa)} <span class="${f.claseSigno(v)}" style="font-weight:600">${textoVariacion(s.cot)}</span></span></a>`;
          }).join("") : `<p class="vacio">Marca valores con ★ en Mercado para seguirlos aquí.</p>`}
        </section>
        <section class="panel negro">
          <h3 class="titulo-seccion">Próximos dividendos</h3>
          ${proximos.length ? proximos.map((d) => `<div class="renglon num"><span>${f.fechaCorta(d.fecha)} · ${f.html(d.simbolo)}</span><strong>≈ ${d.importeEur < 100 ? f.eur(d.importeEur) : f.eurEntero(d.importeEur)}</strong></div>`).join("")
            : `<p class="vacio" style="color:var(--gris-3)">No se esperan dividendos en los próximos tres meses.</p>`}
          <span class="aviso" style="color:var(--gris-3)">Estimados a partir de los del año anterior. <a href="#/dividendos" style="color:inherit">Ver dividendos</a></span>
        </section>
      </aside>
    </div>`)) return;
}
