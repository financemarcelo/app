// Ficha de un valor: precio, gráfico con o sin dividendos, rentabilidad por año, datos clave,
// posiciones en las carteras de la cuenta, dividendos y desdoblamientos.
import * as datos from "../datos.js";
import { enSeguimiento, alternarSeguimiento } from "../sesion.js";
import { todasLasCarteras } from "../resumen.js";
import { $, pintar, kpis, segmentado, alElegir, vigente, intentar } from "../ui.js";
import * as f from "../formato.js";
import { dibujarLinea } from "../graficos.js";
import { plazaDe, estadoSesion, variacion, sector } from "../calculos.js";
import { enlaceCartera, enlaceOperar } from "./comun.js";
import { en } from "../moneda.js";
import { abrirApuntar } from "./apuntar.js";

const RANGOS = [["1M", 1 / 12], ["6M", 0.5], ["1A", 1], ["5A", 5], ["10A", 10], ["Desde 2006", 25]];
const ANIOS_BARRAS = 11;

export async function vista({ actual, partes }) {
  const simbolo = decodeURIComponent(partes[0] ?? "");
  const [ficha, cotizaciones, estad, calculadas] = await Promise.all([
    datos.fichaValor(simbolo), datos.cotizaciones(), datos.estadisticas(), todasLasCarteras()]);
  if (!ficha) return pintar(actual, `<p class="error">No existe el valor ${f.html(simbolo)}.</p><p><a href="#/mercado">← Mercado</a></p>`);
  const c = cotizaciones[simbolo] ?? {};
  const v = variacion(c);
  const e = estad.valores[simbolo] ?? {};
  const plaza = plazaDe(ficha.indice);
  const indice = ficha.indice === "DJIA" ? "Dow Jones" : "IBEX 35";
  const moneda = ficha.divisa === "USD" ? "$" : "€";
  const anioActual = new Date().getFullYear();
  const rentAnual = Object.entries(e.rent_anual ?? {}).slice(-ANIOS_BARRAS);
  const maximoBarra = Math.max(0.01, ...rentAnual.map(([, r]) => Math.abs(r ?? 0)));
  const posiciones = calculadas.map((r) => ({ r, p: r.valoracion.posiciones.find((x) => x.simbolo === simbolo) })).filter((x) => x.p);
  const dividendos = [...(ficha.dividendos ?? [])].reverse();
  const eventos = [...(ficha.desdoblamientos ?? [])].reverse();

  if (!pintar(actual, `
    <div class="pila" style="gap:14px">
      <span class="miga"><a href="#/mercado">Mercado</a> / <a href="#/mercado?pestana=${ficha.indice}">${indice}</a> / ${f.html(ficha.nombre)}</span>
      <div class="encabezado">
        <div class="pila" style="gap:8px"><h1>${f.html(ficha.nombre)}</h1>
          <div class="fila" style="gap:6px">${[ficha.simbolo, `ISIN ${ficha.isin}`, plaza.ciudad, ficha.divisa === "USD" ? "Dólar" : "Euro", sector(ficha.sector)]
            .map((t) => `<span class="etiqueta-gris">${f.html(t)}</span>`).join("")}</div></div>
        <div class="fila" style="gap:20px;align-items:flex-end">
          <div class="pila num" style="gap:2px;align-items:flex-end">
            <span style="font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1">${f.precio(c.precio, ficha.divisa)}</span>
            <span class="${f.claseSigno(v)}" style="font-size:14px;font-weight:700">${f.conSigno(c.precio - c.cierre_anterior, 3)} ${moneda} · ${f.pctSigno(v)} hoy</span>
            <span class="aviso">${f.fechaHora(c.hora)} · ${estadoSesion(plaza).texto.toLowerCase()}</span></div>
          <div class="fila"><button class="boton linea" id="apuntar-valor" type="button">✎ Apuntar</button>
            <button class="boton linea" id="seguir" type="button">${enSeguimiento(simbolo) ? "★ Siguiendo" : "☆ Seguir"}</button>
            <a class="boton" href="${enlaceOperar(null, simbolo)}">Operar</a></div>
        </div>
      </div>
    </div>

    <div class="columnas">
      <div class="principal">
        <section class="panel" style="gap:14px">
          <div class="fila entre">${segmentado("rango", RANGOS.map(([n]) => ({ valor: n, texto: n })), "1A")}
            ${segmentado("serie", [{ valor: "precio", texto: "Precio" }, { valor: "ajustado", texto: "Con dividendos" }], "precio")}</div>
          <div class="grafico alto"><canvas id="grafico"></canvas></div>
          <span class="aviso" id="nota-serie">Precio de cierre de cada sesión.</span>
        </section>
        <section class="panel" style="gap:14px">
          <div class="fila entre" style="align-items:baseline"><h2>Rentabilidad por año</h2>
            <span class="aviso">Precio y dividendos · ${anioActual} hasta hoy</span></div>
          ${rentAnual.length ? `<div class="anual">${rentAnual.map(([anio, r]) => {
            const alto = `${((Math.abs(r ?? 0) / maximoBarra) * 120).toFixed(0)}px`;
            return `<div class="columna" title="${anio}: ${f.pctSigno(r)}">
              <div class="arriba">${r > 0 ? `<b class="sube">${f.conSigno((r ?? 0) * 100, 1)}</b><i style="height:${alto}"></i>` : ""}</div>
              <div class="abajo">${r < 0 ? `<i style="height:${alto}"></i><b class="baja">${f.conSigno(r * 100, 1)}</b>` : ""}</div></div>`;
          }).join("")}</div>
          <div class="ejes">${rentAnual.map(([anio]) => `<span>${anio}${Number(anio) === anioActual ? "*" : ""}</span>`).join("")}</div>
          <span class="aviso">En %. ${rentAnual[0]?.[0] === e.desde?.slice(0, 4) ? `${rentAnual[0][0]} desde el ${f.fecha(e.desde)}. ` : ""}* Año en curso.</span>`
          : `<p class="vacio">Sin datos suficientes.</p>`}
        </section>
      </div>

      <aside class="lateral">
        ${kpis([
          { etiqueta: "Cierre anterior", valor: f.precio(c.cierre_anterior, ficha.divisa) },
          { etiqueta: "Volumen", valor: f.abreviado(c.volumen ?? e.ultima_sesion?.volumen) },
          { etiqueta: "Máximo del día", valor: f.precio(c.maximo, ficha.divisa) },
          { etiqueta: "Mínimo del día", valor: f.precio(c.minimo, ficha.divisa) },
          { etiqueta: "Máx. 52 semanas", valor: f.precio(e.max_52s, ficha.divisa) },
          { etiqueta: "Mín. 52 semanas", valor: f.precio(e.min_52s, ficha.divisa) },
          { etiqueta: "Rent. div. 12 m", valor: e.rent_div_12m == null ? "—" : `${f.num(e.rent_div_12m * 100, 1)} %` },
          { etiqueta: "Variación 1 año", valor: f.pctSigno(e.var_1a, 1), clase: f.claseSigno(e.var_1a) },
          { etiqueta: "Con dividendos, 1 año", valor: f.pctSigno(e.rent_total_1a, 1), clase: f.claseSigno(e.rent_total_1a) },
          { etiqueta: `Desde ${e.desde?.slice(0, 4) ?? "—"}, anual`, valor: f.pctSigno(e.rent_anualizada, 1), clase: f.claseSigno(e.rent_anualizada) },
        ], { compactos: true, dos: true })}
        <section class="panel negro">
          <h3 class="titulo-seccion">En tus carteras</h3>
          ${posiciones.length ? posiciones.map(({ r, p }) => `<a class="renglon num" href="${enlaceCartera(r.cartera)}" style="text-decoration:none">
            <span>${f.html(r.cartera.nombre)} · ${f.titulos(p.titulos)} títulos</span><strong>${f.pctSigno(en(p, "plusvaliaPct"))}</strong></a>`).join("")
            : `<span class="suave">No lo tienes en ninguna cartera.</span>`}
        </section>
        <section class="panel">
          <h3 class="titulo-seccion">Dividendos</h3>
          <div id="dividendos">${listaDividendos(dividendos.slice(0, 5), ficha.divisa)}</div>
          ${dividendos.length > 5 ? `<button class="enlace" id="todos-dividendos" type="button">Ver los ${dividendos.length} desde ${dividendos.at(-1).fecha.slice(0, 4)}</button>` : ""}
          ${dividendos.length ? "" : `<span class="suave">Sin dividendos registrados desde 2006.</span>`}
        </section>
        <section class="panel">
          <h3 class="titulo-seccion">Desdoblamientos y ajustes</h3>
          ${eventos.length ? eventos.map((x) => `<div class="renglon num"><span class="suave">${f.fecha(x.fecha)}</span>
            <span><strong>${x.tipo === "desdoblamiento" ? "Desdoblamiento" : "Ajuste"}</strong> ${f.num(x.numerador, x.numerador % 1 ? 3 : 0)}:${f.num(x.denominador, x.denominador % 1 ? 3 : 0)}</span></div>`).join("")
            : `<span class="suave">Ninguno desde 2006.</span>`}
          <span class="aviso">Un desdoblamiento multiplica los títulos. Un ajuste (ampliación, dividendo en acciones o escisión) se abona en efectivo en las carteras que tienen el valor.</span>
        </section>
      </aside>
    </div>`)) return;

  let rango = "1A", serie = "precio";
  const dibujar = async () => {
    const anios = RANGOS.find(([n]) => n === rango)[1];
    const desde = new Date(Date.now() - anios * 365.25 * 86400000).toISOString().slice(0, 10);
    const s = await datos.sesionesEnEscalaDeHoy(simbolo, Math.max(2006, Number(desde.slice(0, 4))), new Date().getUTCFullYear());
    if (!vigente(actual)) return;
    const k = Math.max(0, s.fechas.findIndex((x) => x >= desde));
    const valores = (serie === "precio" ? s.cierres : s.cierresAjustados).slice(k);
    $("#nota-serie").textContent = serie === "precio" ? "Precio de cierre de cada sesión, corregido por los desdoblamientos posteriores."
      : "Precio con los dividendos reinvertidos, en la escala de hoy: muestra la rentabilidad total de quien reinvierte los dividendos.";
    dibujarLinea($("#grafico"), s.fechas.slice(k).map(f.fecha), valores, (x) => f.precio(x, ficha.divisa));
  };
  alElegir(document, "rango", (x) => { rango = x; dibujar(); });
  alElegir(document, "serie", (x) => { serie = x; dibujar(); });
  dibujar().catch((err) => console.error(err));

  $("#todos-dividendos")?.addEventListener("click", (ev) => {
    $("#dividendos").innerHTML = listaDividendos(dividendos, ficha.divisa);
    ev.target.remove();
  });
  $("#seguir").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    await intentar(async () => { ev.target.textContent = (await alternarSeguimiento(simbolo)) ? "★ Siguiendo" : "☆ Seguir"; });
    ev.target.disabled = false;
  });
  $("#apuntar-valor").addEventListener("click", () => abrirApuntar({ simbolo, grafico: true }));
}

function listaDividendos(lista, divisa) {
  return lista.map((d) => `<div class="renglon borde num"><span class="suave">${f.fecha(d.fecha)}</span><strong>${f.num(d.importe, 4)} ${divisa === "USD" ? "$" : "€"}</strong></div>`).join("");
}
