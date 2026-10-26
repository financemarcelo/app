// Mercado: estado de las bolsas, índice elegido con su gráfico, lista y mapa de los valores.
import * as datos from "../datos.js";
import { sesion, enSeguimiento, alternarSeguimiento } from "../sesion.js";
import { $, pintar, kpis, segmentado, alElegir, tabla, rango52, vigente, intentar } from "../ui.js";
import * as f from "../formato.js";
import { dibujarLinea } from "../graficos.js";
import { PLAZAS, GRUPOS, plazaDe, indicesDe, grupoDe, enPestana, estadoSesion, variacion, sector } from "../calculos.js";
import { enlaceValor, enlaceOperar, textoVariacion } from "./comun.js";

const RANGOS = [["1M", 1 / 12], ["6M", 0.5], ["1A", 1], ["5A", 5], ["10A", 10], ["Desde 2006", 25]];
const ORDENES = { dia: "variación del día", nombre: "nombre", anio: "variación a un año", dividendo: "rentabilidad por dividendo" };
const estadoVista = { vista: "lista", sector: "", orden: "dia" };

const claseMapa = (v) => (v == null ? "m0" : v <= -0.012 ? "m-2" : v < -0.002 ? "m-1" : v <= 0.002 ? "m0" : v < 0.012 ? "m1" : "m2");

export async function vista({ actual, consulta }) {
  const anio = new Date().getUTCFullYear();
  const [valores, indices, cotizaciones, cotIndices, estad, cambio, serieCambio] = await Promise.all([
    datos.listaValores(), datos.listaIndices(), datos.cotizaciones(), datos.cotizacionesIndices(), datos.estadisticas(),
    datos.tipoCambioActual(), datos.serieTipoCambio(anio, anio)]);
  const pestana = consulta.get("pestana") ?? "todos";
  const seguimiento = sesion.preferencias.seguimiento;
  const varSeguimiento = seguimiento.map((s) => variacion(cotizaciones[s])).filter((v) => v != null);
  const mediaSeguimiento = varSeguimiento.length ? varSeguimiento.reduce((a, b) => a + b, 0) / varSeguimiento.length : null;
  const cambioAnterior = serieCambio.valores.at(-2);
  const madrid = estadoSesion(PLAZAS.madrid), ny = estadoSesion(PLAZAS.nuevayork);
  const horas = Object.values(cotizaciones).map((c) => c.hora).sort();
  const cuenta = (id) => valores.filter((v) => enPestana(v, id)).length;

  if (!pintar(actual, `
    <div class="encabezado">
      <div><h1>Mercado</h1><p class="subtitulo">${valores.length} valores · última cotización ${f.fechaHora(horas.at(-1))} · retraso aproximado de 15 minutos</p></div>
      ${segmentado("vista", [{ valor: "lista", texto: "Lista" }, { valor: "mapa", texto: "Mapa" }], estadoVista.vista)}
    </div>
    ${kpis([
      { etiqueta: PLAZAS.madrid.nombre, valor: madrid.abierta ? "Abierta" : "Cerrada", clase: madrid.abierta ? "sube" : "", nota: madrid.texto },
      { etiqueta: PLAZAS.nuevayork.nombre, valor: ny.abierta ? "Abierta" : "Cerrada", clase: ny.abierta ? "sube" : "", nota: ny.texto },
      { etiqueta: "Euro-dólar (BCE)", valor: `${f.num(cambio?.valor, 4)} $`, nota: `${cambio?.fecha ? f.fecha(cambio.fecha) : ""}${cambioAnterior ? ` · ${f.pctSigno(cambio.valor / cambioAnterior - 1)} frente al día anterior` : ""}` },
      { etiqueta: "Tu seguimiento", valor: f.pctSigno(mediaSeguimiento), clase: f.claseSigno(mediaSeguimiento), nota: `variación media de hoy · ${f.cantidad(seguimiento.length, "valor", "valores")}` },
    ])}
    <nav class="pestanas" aria-label="Mercado">
      ${[["todos", `Todos · ${valores.length}`], ...GRUPOS.map((g) => [g.id, `${g.nombre} · ${cuenta(g.id)}`]),
         ["seguimiento", `En seguimiento · ${seguimiento.length}`]]
        .map(([id, texto]) => `<a href="#/mercado?pestana=${id}" class="${id === pestana ? "activo" : ""}">${texto}</a>`).join("")}
    </nav>
    <section id="indices"></section>
    <div class="fila entre">
      <div class="chips" id="sectores"></div>
      <label class="fila" style="font-size:14px;font-weight:600">Ordenar por
        <select id="orden" style="width:auto;padding:7px 10px">${Object.entries(ORDENES).map(([k, t]) => `<option value="${k}" ${k === estadoVista.orden ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <section id="valores"></section>
    <p class="aviso">Rentabilidad por dividendo: dividendos de los últimos 12 meses entre el último precio. Variación a un año y máximo y mínimo de 52 semanas con los precios de cierre. ★: en seguimiento.</p>`)) return;

  // ── Índices ──
  const panelIndices = () => {
    const contenedor = $("#indices");
    if (pestana === "seguimiento") { contenedor.innerHTML = ""; return; }
    // En el mercado continuo, el índice de Madrid en pequeño.
    const visibles = indices.filter((i) => pestana === "todos" || i.indice === pestana
      || (pestana === "continuo" && plazaDe(i) === PLAZAS.madrid));
    if (visibles.length !== 1 || pestana === "continuo") {
      contenedor.innerHTML = `<div class="kpis">${visibles.map((i) => {
        const c = cotIndices[i.indice] ?? {}, v = variacion(c);
        return `<a class="kpi clicable" href="#/mercado?pestana=${i.indice}" style="text-decoration:none">
          <span class="etiqueta">Índice · ${f.html(i.nombre)}</span><span class="valor">${f.num(c.precio, 1)}</span>
          <span class="${f.claseSigno(v)}" style="font-weight:700;font-size:14px">${f.conSigno(c.precio - c.cierre_anterior, 1)} puntos · ${f.pctSigno(v)}</span>
          <span class="nota-kpi">${f.fechaHora(c.hora)} · ver su gráfico</span></a>`;
      }).join("")}</div>`;
      return;
    }
    const i = visibles[0];
    const c = cotIndices[i.indice] ?? {}, v = variacion(c), e = estad.indices[i.indice] ?? {};
    const sesionPlaza = estadoSesion(plazaDe(i));
    const miembrosIndice = valores.filter((x) => indicesDe(x).includes(i.indice)).map((x) => variacion(cotizaciones[x.simbolo]));
    const suben = miembrosIndice.filter((x) => x > 0).length, bajan = miembrosIndice.filter((x) => x < 0).length;
    const iguales = miembrosIndice.length - suben - bajan;
    const pct = (n) => (miembrosIndice.length ? (n / miembrosIndice.length) * 100 : 0).toFixed(1);
    contenedor.innerHTML = `<div class="panel fuerte" style="flex-direction:row;flex-wrap:wrap;gap:24px 32px">
      <div class="pila" style="flex:999 1 520px;min-width:0;gap:14px">
        <div class="fila entre" style="align-items:flex-end;gap:12px 24px">
          <div class="pila num" style="gap:4px"><span class="etiqueta">Índice · ${f.html(i.nombre)}</span>
            <span style="font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1">${f.num(c.precio, 1)}</span>
            <span class="${f.claseSigno(v)}" style="font-size:14px;font-weight:700">${f.conSigno(c.precio - c.cierre_anterior, 1)} puntos · ${f.pctSigno(v)} hoy</span>
            <span class="aviso">${f.fechaHora(c.hora)} · ${sesionPlaza.texto.toLowerCase()}</span></div>
          ${segmentado("rango-indice", RANGOS.map(([n]) => ({ valor: n, texto: n })), "1A")}
        </div>
        <div class="grafico"><canvas id="grafico-indice"></canvas></div>
      </div>
      <div class="pila" style="flex:1 1 280px;min-width:0;gap:16px">
        ${kpis([
          { etiqueta: "Cierre anterior", valor: f.num(c.cierre_anterior, 1) },
          { etiqueta: "Volumen", valor: c.volumen ? f.abreviado(c.volumen) : "—" },
          { etiqueta: "Máximo del día", valor: f.num(c.maximo, 1) },
          { etiqueta: "Mínimo del día", valor: f.num(c.minimo, 1) },
          { etiqueta: "Máx. 52 semanas", valor: f.num(e.max_52s, 1) },
          { etiqueta: "Mín. 52 semanas", valor: f.num(e.min_52s, 1) },
          { etiqueta: `En ${anio}`, valor: f.pctSigno(e.var_anio), clase: f.claseSigno(e.var_anio) },
          { etiqueta: "En 1 año", valor: f.pctSigno(e.var_1a), clase: f.claseSigno(e.var_1a) },
        ], { compactos: true, dos: true })}
        <div class="pila" style="gap:8px"><span class="etiqueta">Hoy en el ${f.html(i.nombre)}</span>
          <div class="amplitud" role="img" aria-label="${suben} suben, ${iguales} sin cambios, ${bajan} bajan">
            <span style="width:${pct(suben)}%;background:var(--sube)"></span><span style="width:${pct(iguales)}%;background:var(--gris-3)"></span><span style="width:${pct(bajan)}%;background:var(--baja)"></span></div>
          <div class="fila entre" style="font-size:13px;font-weight:700"><span class="sube">${suben} suben</span><span class="suave">${iguales} igual</span><span class="baja">${bajan} bajan</span></div></div>
        <span class="aviso">Índice de precios: no incluye dividendos. ${i.indice === "DJIA" ? "Pondera cada valor por el precio de su acción." : "Pondera cada valor por su capitalización en bolsa ajustada por el capital flotante."}</span>
      </div></div>`;
    const dibujar = async (nombre) => {
      const anios = RANGOS.find(([n]) => n === nombre)[1];
      const desde = new Date(Date.now() - anios * 365.25 * 86400000).toISOString().slice(0, 10);
      const s = await datos.sesionesIndice(i.indice, Math.max(2006, Number(desde.slice(0, 4))), anio);
      if (!vigente(actual)) return;
      const k = s.fechas.findIndex((x) => x >= desde);
      dibujarLinea($("#grafico-indice"), s.fechas.slice(k).map(f.fecha), s.cierres.slice(k), (x) => f.num(x, 0));
    };
    alElegir(contenedor, "rango-indice", dibujar);
    dibujar("1A").catch((e) => console.error(e));
  };

  // ── Valores ──
  const visibles = () => valores.filter((v) => (pestana === "seguimiento" ? seguimiento.includes(v.simbolo) : enPestana(v, pestana)));
  const pintarSectores = () => {
    const nombres = [...new Set(visibles().map((v) => sector(v.sector)))].sort((a, b) => a.localeCompare(b, "es"));
    if (estadoVista.sector && !nombres.includes(estadoVista.sector)) estadoVista.sector = "";
    $("#sectores").innerHTML = [["", "Todos los sectores"], ...nombres.map((n) => [n, n])]
      .map(([v, t]) => `<button class="chip${v === estadoVista.sector ? " activo" : ""}" data-sector="${f.html(v)}" type="button">${f.html(t)}</button>`).join("");
  };
  const ordenar = (lista) => {
    const clave = { dia: (v) => variacion(cotizaciones[v.simbolo]) ?? -Infinity, anio: (v) => estad.valores[v.simbolo]?.var_1a ?? -Infinity,
                    dividendo: (v) => estad.valores[v.simbolo]?.rent_div_12m ?? -Infinity }[estadoVista.orden];
    return clave ? [...lista].sort((a, b) => clave(b) - clave(a)) : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  };
  const pintarValores = () => {
    const lista = ordenar(visibles().filter((v) => !estadoVista.sector || sector(v.sector) === estadoVista.sector));
    const contenedor = $("#valores");
    if (!lista.length) {
      contenedor.innerHTML = `<p class="vacio">${pestana === "seguimiento" ? "Todavía no sigues ningún valor: márcalos con ★ en la lista." : "Ningún valor coincide."}</p>`;
      return;
    }
    if (estadoVista.vista === "mapa") {
      // En «todos» y en el mercado continuo, por grupos: IBEX 35, resto del continuo y Dow Jones.
      const grupos = pestana === "todos" || pestana === "continuo"
        ? [...GRUPOS.map((g) => [g.resto ?? g.nombre, lista.filter((v) => grupoDe(v) === g)]),
           ["Otros valores", lista.filter((v) => !GRUPOS.includes(grupoDe(v)))]]
        : [["", lista]];
      contenedor.innerHTML = `<div class="pila"><div class="escala">−2 % <i style="background:#c2410c"></i><i style="background:#fdba74"></i>
          <i style="background:var(--linea)"></i><i style="background:#93c5fd"></i><i style="background:#1d4ed8"></i> +2 %</div>
        ${grupos.filter(([, g]) => g.length).map(([titulo, g]) => `${titulo ? `<span class="etiqueta">${f.html(titulo)} · variación del día</span>` : ""}
          <div class="mapa">${g.map((v) => {
            const x = variacion(cotizaciones[v.simbolo]);
            return `<a class="${claseMapa(x)}" href="${enlaceValor(v.simbolo)}" title="${f.html(v.nombre)}"><b>${f.html(v.simbolo.replace(".MC", ""))}</b><span class="num">${f.pctSigno(x)}</span></a>`;
          }).join("")}</div>`).join("")}
        <p class="aviso">Azul: sube; naranja: baja; cuanto más oscuro, más intenso. Cada casilla es un valor, del mismo tamaño.</p></div>`;
      return;
    }
    contenedor.innerHTML = tabla(["", { texto: "Valor", izq: true }, "Último", "Hoy", "1 año", { texto: "Mín. y máx. de 52 semanas", izq: true }, "Rent. div.", ""],
      lista.map((v) => {
        const c = cotizaciones[v.simbolo] ?? {}, x = variacion(c), e = estad.valores[v.simbolo] ?? {};
        const seguido = enSeguimiento(v.simbolo);
        return `<tr class="clicable" data-simbolo="${f.html(v.simbolo)}">
          <td><button class="estrella${seguido ? " activa" : ""}" data-seguir="${f.html(v.simbolo)}" type="button" aria-label="${seguido ? "Dejar de seguir" : "Seguir"} ${f.html(v.simbolo)}">★</button></td>
          <td class="izq"><strong>${f.html(v.simbolo)}</strong><span class="nombre">${f.html(v.nombre)} · ${f.html(sector(v.sector))}</span></td>
          <td><strong>${f.precio(c.precio, v.divisa)}</strong></td>
          <td class="${f.claseSigno(x)}"><strong>${textoVariacion(c)}</strong></td>
          <td class="${f.claseSigno(e.var_1a)}">${f.pctSigno(e.var_1a, 1)}</td>
          <td class="izq">${rango52(c.precio, e.min_52s, e.max_52s)}</td>
          <td>${e.rent_div_12m == null ? "—" : `${f.num(e.rent_div_12m * 100, 1)} %`}</td>
          <td><a class="boton linea pequeno" href="${enlaceOperar(null, v.simbolo)}" data-operar>Operar</a></td></tr>`;
      }));
  };

  panelIndices();
  pintarSectores();
  pintarValores();
  alElegir(document, "vista", (v) => { estadoVista.vista = v; pintarValores(); });
  $("#orden").addEventListener("change", (e) => { estadoVista.orden = e.target.value; pintarValores(); });
  $("#sectores").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sector]");
    if (!b) return;
    estadoVista.sector = b.dataset.sector;
    pintarSectores();
    pintarValores();
  });
  $("#valores").addEventListener("click", async (e) => {
    const estrella = e.target.closest("[data-seguir]");
    if (estrella) {
      e.stopPropagation();
      estrella.disabled = true;
      await intentar(async () => {
        const ahora = await alternarSeguimiento(estrella.dataset.seguir);
        estrella.classList.toggle("activa", ahora);
      });
      estrella.disabled = false;
      return;
    }
    if (e.target.closest("[data-operar]")) return;
    const fila = e.target.closest("tr[data-simbolo]");
    if (fila) location.hash = enlaceValor(fila.dataset.simbolo);
  });
}
