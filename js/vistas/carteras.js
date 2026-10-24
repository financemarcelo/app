// Carteras: pestañas, indicadores, evolución frente a un índice, reparto, posiciones, movimientos,
// miembros y alta de carteras nuevas.
import * as datos from "../datos.js";
import * as miembros from "../miembros.js";
import { sesion, correoPropio } from "../sesion.js";
import { todasLasCarteras, calcularCartera, movimientosDe, invalidar } from "../resumen.js";
import { $, $$, pintar, kpis, segmentado, alElegir, tabla, reparto, colorear, intentar, botonDe, abrirVentana,
         descargar, mensajeError, vigente } from "../ui.js";
import * as f from "../formato.js";
import { dibujarSeries } from "../graficos.js";
import { reparto as calcularReparto, base100, alinear, aCsv } from "../calculos.js";
import { CAPITAL_INICIAL_POR_DEFECTO, URL_APLICACION } from "../config.js";
import { enlaceCartera, enlaceOperar, enlaceValor, etiquetaCompartida, autorOperacion, describirMovimiento,
         avisoSupervivencia } from "./comun.js";
import { moneda, en, dinero, dineroEntero, dineroSigno } from "../moneda.js";
import { abrirApuntar } from "./apuntar.js";

const PRIMERA_FECHA = "2006-01-02";
const RANGOS = [["1M", 1 / 12], ["3M", 0.25], ["6M", 0.5], ["1A", 1], ["Inicio", null]];
const FILTROS = [["todos", "Todos"], ["compra", "Compras"], ["venta", "Ventas"], ["dividendo", "Dividendos"], ["eventos", "Eventos"]];

function pestanas(lista, activa) {
  return `<nav class="pestanas" aria-label="Mis carteras">${lista.map((r) => `<a href="${enlaceCartera(r.cartera)}"
    class="${r.cartera.ruta === activa ? "activo" : ""}">${f.html(r.cartera.nombre)}</a>`).join("")}
    <a href="#/carteras/nueva" class="${activa === "nueva" ? "activo" : "tenue"}">+ Nueva cartera</a></nav>`;
}

/** #/carteras: la primera cartera, o el alta si no hay ninguna. */
export async function vistaLista(ctx) {
  const lista = await todasLasCarteras();
  if (!vigente(ctx.actual)) return;
  if (!lista.length) return vistaNueva(ctx);
  location.replace(enlaceCartera(lista[0].cartera));
}

export async function vistaNueva({ actual }) {
  const lista = await todasLasCarteras();
  if (!pintar(actual, `${pestanas(lista, "nueva")}
    <div><h1>Nueva cartera</h1><p class="subtitulo">Una cartera artificial empieza con un capital inicial en euros, todo en efectivo.</p></div>
    <form class="panel fuerte formulario" id="nueva" style="max-width:760px">
      <label class="campo"><span>Nombre</span><input type="text" id="nombre" required maxlength="60" placeholder="Mi cartera"></label>
      <label class="campo"><span>Capital inicial (€)</span><input type="number" id="capital" min="1" step="1" required value="${CAPITAL_INICIAL_POR_DEFECTO}"></label>
      <label class="campo"><span>Fecha de inicio</span><input type="date" id="fecha-inicio" required value="${f.hoy()}" min="${PRIMERA_FECHA}" max="${f.hoy()}"></label>
      <div><button class="boton" type="submit">Crear cartera</button></div>
      <p class="aviso ancho" id="aviso-inicio">Empieza hoy. Con una fecha pasada, la cartera se reconstruye con los precios de cierre desde esa fecha.</p>
    </form>`)) return;
  $("#fecha-inicio").addEventListener("input", (e) => {
    $("#aviso-inicio").textContent = e.target.value && e.target.value < f.hoy()
      ? `Las operaciones se registran desde Operar, con «Cierre de un día anterior». ${avisoSupervivencia()}`
      : "Empieza hoy. Con una fecha pasada, la cartera se reconstruye con los precios de cierre desde esa fecha.";
  });
  $("#nueva").addEventListener("submit", async (e) => {
    e.preventDefault();
    botonDe(e).disabled = true;
    await intentar(async () => {
      const fecha = $("#fecha-inicio").value;
      const nueva = await datos.crearCartera(sesion.usuario, {
        nombre: $("#nombre").value.trim(), capitalInicial: Number($("#capital").value),
        fechaInicio: fecha >= PRIMERA_FECHA && fecha <= f.hoy() ? fecha : f.hoy() });
      invalidar();
      location.hash = enlaceCartera(nueva);
    });
    botonDe(e).disabled = false;
  });
}

export async function vistaCartera({ actual, partes }) {
  const [propietario, id] = partes.map(decodeURIComponent);
  const [lista, c, valores] = await Promise.all([todasLasCarteras(), datos.cartera(propietario, id), datos.listaValores()]);
  if (!c) return pintar(actual, `<p class="error">La cartera no existe.</p><p><a href="#/carteras">← Mis carteras</a></p>`);
  // La cartera abierta se calcula siempre de nuevo para ver las operaciones recientes de otros miembros.
  const r = await calcularCartera(c, { conSerie: true });
  const yo = correoPropio();
  const esPropietario = c.propietario === sesion.usuario.uid;
  const esMiembro = esPropietario || c.miembros.includes(yo);
  const fichas = Object.fromEntries(valores.map((v) => [v.simbolo, v]));
  const { estado, valoracion } = r;
  const anio = new Date().getFullYear();
  const movimientos = movimientosDe([r]);
  const cobrosAnio = movimientos.filter((m) => m.tipo === "dividendo" && m.fecha.startsWith(`${anio}-`));
  const total = en(valoracion, "total");
  const capital = en(r, "capital");
  const rent = total - capital;
  const efectivo = en(valoracion, "efectivo");
  const enDolares = moneda() === "USD";
  const rep = calcularReparto(valoracion.posiciones, estado.efectivo, fichas);
  const compartida = etiquetaCompartida(c);
  // Reconstruida: empieza al menos tres días antes de su creación.
  const creada = c.creada?.toDate?.();
  const reconstruida = creada && c.fecha_inicio < new Date(creada.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const otros = c.miembros.filter((m) => m !== yo);

  if (!pintar(actual, `
    ${esMiembro ? pestanas(lista, c.ruta) : `<p class="miga"><a href="#/cuaderno">← Cuaderno</a></p>`}
    ${esMiembro ? "" : `<p class="recuadro"><strong>Solo lectura.</strong> Ves esta cartera porque su propietario la ha vinculado a un cuaderno del que eres miembro.</p>`}
    ${reconstruida ? `<p class="recuadro"><strong>Cartera reconstruida desde el ${f.fecha(c.fecha_inicio)}.</strong> ${avisoSupervivencia()}</p>` : ""}
    <div class="encabezado">
      <div><h1>${f.html(c.nombre)}</h1>
        <p class="subtitulo">Creada el ${f.fecha(c.fecha_inicio)} · capital inicial ${f.eurEntero(c.capital_inicial)}${enDolares ? ` (${dineroEntero(capital)} al cambio de ese día)` : ""} · valorada en ${enDolares ? "dólares" : "euros"}${compartida ? ` · ${compartida}` : ""}</p></div>
      <div class="fila">
        <button class="boton linea" id="exportar" type="button">Exportar CSV</button>
        <button class="boton linea" id="apuntar-cartera" type="button">✎ Apuntar</button>
        ${esMiembro ? `<a class="boton linea" href="#ajustes-cartera" id="ir-ajustes">Ajustes</a><a class="boton" href="${enlaceOperar(c)}">Operar</a>` : ""}
      </div>
    </div>

    ${kpis([
      { etiqueta: "Valor", valor: dineroEntero(total), nota: `${dineroSigno(en(r, "hoy"))} hoy (${f.pctSigno(total - en(r, "hoy") ? en(r, "hoy") / (total - en(r, "hoy")) : null)})` },
      { etiqueta: "Rentabilidad", valor: f.pctSigno(rent / capital), clase: f.claseSigno(rent), nota: `${dineroSigno(rent)} sobre lo aportado` },
      { etiqueta: "Efectivo", valor: dineroEntero(efectivo), nota: `${f.num(total ? (efectivo / total) * 100 : 0, 1)} % de la cartera` },
      { etiqueta: "Dividendos", valor: dineroEntero(en(estado, "dividendos")), nota: `${f.cantidad(cobrosAnio.length, "cobro")} en ${anio}` },
      { etiqueta: "Ajustes y comisiones", valor: dineroSigno(en(estado, "ajustes") - en(estado, "comisiones")),
        nota: `ajustes ${dineroSigno(en(estado, "ajustes"))} · comisiones ${dineroEntero(en(estado, "comisiones"))}` },
    ])}

    <div class="columnas estirar">
      <section class="panel principal" style="gap:14px">
        <div class="fila entre"><h2>Evolución</h2>
          <div class="fila">${segmentado("rango", RANGOS.map(([n]) => ({ valor: n, texto: n })), "Inicio")}
            ${segmentado("comparar", [{ valor: "IBEX35", texto: "IBEX 35" }, { valor: "DJIA", texto: "Dow Jones" }, { valor: "", texto: "Sin índice" }], "IBEX35")}</div></div>
        <div class="leyenda" id="leyenda"></div>
        ${r.serie.length > 1 ? `<div class="grafico"><canvas id="grafico"></canvas></div>`
          : `<p class="vacio">La evolución aparece a partir de la segunda sesión.</p>`}
      </section>
      <aside class="panel lateral" style="gap:22px">
        <h2>Reparto</h2>
        ${valoracion.posiciones.length ? `
          ${reparto("Mercado", colorear(rep.mercado))}
          ${reparto("Sector", colorear(rep.sector))}
          ${reparto("Divisa", colorear(rep.divisa))}` : `<p class="vacio">Todo en efectivo.</p>`}
      </aside>
    </div>

    <section class="pila">
      <div class="fila entre" style="align-items:baseline"><h2>Posiciones</h2>
        <span class="aviso">${valoracion.posiciones.length} valores · dólares al tipo del BCE (${f.num(r.cambio?.valor, 4)} $/€)</span></div>
      ${valoracion.posiciones.length ? tabla(
        ["Valor", "Títulos", "Coste medio", "Último", `Valor en ${enDolares ? "$" : "€"}`, { texto: "Peso", izq: true }, "Rentab."],
        [...valoracion.posiciones].sort((a, b) => (b.valorEur ?? 0) - (a.valorEur ?? 0)).map((p) => {
          const peso = total ? (en(p, "valor") ?? 0) / total : 0;
          return `<tr class="clicable" data-simbolo="${f.html(p.simbolo)}">
            <td><strong>${f.html(p.simbolo)}</strong><span class="nombre">${f.html(fichas[p.simbolo]?.nombre ?? "")}</span></td>
            <td>${f.titulos(p.titulos)}</td><td>${dinero(en(p, "coste") / p.titulos)}</td>
            <td>${f.precio(p.precio, r.divisas[p.simbolo])}</td><td><strong>${dineroEntero(en(p, "valor"))}</strong></td>
            <td class="izq"><span class="peso"><span class="barra"><span style="width:${(peso * 100).toFixed(1)}%"></span></span><span class="num">${f.num(peso * 100, 1)} %</span></span></td>
            <td class="${f.claseSigno(en(p, "plusvalia"))}" title="${dineroSigno(en(p, "plusvalia"))}"><strong>${f.pctSigno(en(p, "plusvaliaPct"))}</strong></td></tr>`;
        }),
        { pie: `<tfoot class="pie-tabla"><tr><td><strong>Efectivo</strong></td><td></td><td></td><td></td><td><strong>${dineroEntero(efectivo)}</strong></td>
          <td class="izq"><span class="peso"><span class="barra"><span style="width:${total ? ((efectivo / total) * 100).toFixed(1) : 0}%;background:var(--gris-3)"></span></span><span class="num">${f.num(total ? (efectivo / total) * 100 : 0, 1)} %</span></span></td><td></td></tr></tfoot>` })
        : `<p class="vacio">Sin posiciones: todo el capital está en efectivo.${esMiembro ? ` <a href="${enlaceOperar(c)}">Hacer la primera compra</a>.` : ""}</p>`}
    </section>

    <section class="pila">
      <div class="fila entre"><h2>Movimientos</h2>${segmentado("filtro", FILTROS.map(([v, t]) => ({ valor: v, texto: t })), "todos")}</div>
      <div id="movimientos"></div>
    </section>

    <section class="pila" id="ajustes-cartera">
      <h2>Miembros</h2>
      <div class="panel">
        <ul class="miembros">${c.miembros.map((m) => `<li><span>${f.html(m)}${m === yo ? " (tú)" : ""}</span>
          ${esPropietario && m !== yo ? `<button class="boton peligro pequeno" data-quitar="${f.html(m)}" type="button">Quitar</button>` : ""}</li>`).join("")}</ul>
        ${c.lectores.length ? `<p class="aviso">Además, ${c.lectores.length} ${c.lectores.length === 1 ? "persona la lee" : "personas la leen"} en solo lectura por cuadernos en los que está vinculada.</p>` : ""}
        ${esPropietario ? `<form class="formulario" id="invitar">
          <label class="campo ancho"><span>Añadir por correo</span><input id="correo-miembro" type="email" required placeholder="nombre@ejemplo.com"></label>
          <div><button class="boton negro" type="submit">Añadir</button></div>
          ${otros.length ? `<div><a class="boton linea" href="${f.html(miembros.enlaceAviso({ correos: otros, cartera: c.nombre, url: URL_APLICACION }))}">Avisar por correo</a></div>` : ""}
          <p class="error ancho" id="error-miembro" hidden></p></form>` : ""}
        <p class="aviso">Los miembros ven la cartera y registran operaciones a su nombre al entrar con la cuenta de Google de ese correo; si es su primera vez, el administrador tiene que aprobar su cuenta. La aplicación no envía correos: «Avisar por correo» abre tu programa de correo con el enlace ya escrito.</p>
      </div>
      ${esPropietario ? `<div class="panel">
        <form class="formulario" id="renombrar"><label class="campo ancho"><span>Nombre de la cartera</span>
          <input type="text" id="nuevo-nombre" required maxlength="60" value="${f.html(c.nombre)}"></label>
          <div><button class="boton linea" type="submit">Cambiar el nombre</button></div></form>
      </div>
      <div class="panel peligro fila entre"><div><h3 style="color:var(--acento)">Eliminar la cartera</h3>
        <p class="aviso">Borra la cartera y todas sus operaciones, también para sus miembros. No se puede deshacer.</p></div>
        <button class="boton peligro" id="eliminar" type="button">Eliminar esta cartera</button></div>`
      : esMiembro ? `<div class="panel fila entre"><p class="aviso">Al salir dejas de ver la cartera. Tus operaciones se conservan.</p>
        <button class="boton peligro" id="salir-cartera" type="button">Salir de esta cartera</button></div>` : ""}
    </section>`)) return;

  // Evolución frente a un índice, en base 100.
  let rango = "Inicio", comparar = "IBEX35";
  const sesionesIndice = {};
  const dibujar = async () => {
    if (r.serie.length < 2) return;
    const anios = RANGOS.find(([n]) => n === rango)[1];
    const desde = anios ? new Date(Date.now() - anios * 365.25 * 86400000).toISOString().slice(0, 10) : c.fecha_inicio;
    const tramo = r.serie.filter((p) => p.fecha >= desde);
    const fechas = tramo.map((p) => p.fecha);
    const series = [{ nombre: c.nombre, valores: base100(tramo.map((p) => en(p, "total"))) }];
    if (comparar) {
      sesionesIndice[comparar] ??= await datos.sesionesIndice(comparar, Number(c.fecha_inicio.slice(0, 4)), new Date().getUTCFullYear());
      const s = sesionesIndice[comparar];
      series.push({ nombre: comparar === "IBEX35" ? "IBEX 35" : "Dow Jones", comparacion: true,
                    valores: base100(alinear(fechas, { fechas: s.fechas, valores: s.cierres })) });
    }
    if (!vigente(actual)) return;
    const final = (v) => { const u = v.filter((x) => x != null); return u.length ? u.at(-1) / 100 - 1 : null; };
    $("#leyenda").innerHTML = series.map((s) => `<span><span class="muestra${s.comparacion ? " discontinua" : ""}"></span>
      <strong>${f.html(s.nombre)}</strong> <span class="${f.claseSigno(final(s.valores))}" style="font-weight:700">${f.pctSigno(final(s.valores))}</span></span>`).join("")
      + `<span class="suave">Base 100 el ${f.fecha(fechas[0])}${comparar ? " · índice de precios, sin dividendos" : ""}</span>`;
    dibujarSeries($("#grafico"), fechas.map(f.fecha), series, (v) => f.num(v, 1));
  };
  alElegir(document, "rango", (v) => { rango = v; dibujar(); });
  alElegir(document, "comparar", (v) => { comparar = v; dibujar(); });
  dibujar().catch((e) => console.error(e));

  // Movimientos filtrables.
  const pintarMovimientos = (filtro) => {
    const lista = movimientos.filter((m) => filtro === "todos" || m.tipo === filtro
      || (filtro === "eventos" && ["desdoblamiento", "ajuste"].includes(m.tipo)));
    $("#movimientos").innerHTML = lista.length ? `<div class="lista cuatro">${lista.map((m) => {
      const d = describirMovimiento(m);
      const quien = m.tipo === "compra" || m.tipo === "venta" ? ` · ${f.html(autorOperacion(m, c))}` : "";
      return `<div><span class="suave">${f.fecha(m.fecha)}</span><span><span class="etiqueta-tipo">${f.html(d.tipo)}</span></span>
        <span style="min-width:0">${f.html(d.texto)}<span class="suave">${quien}${m.comisionEur ? ` · comisión ${dinero(en(m, "comision"))}` : ""}</span></span>
        <strong class="num ${m.tipo === "dividendo" || m.tipo === "ajuste" ? "sube" : ""}">${m.importeEur ? dineroSigno(en(m, "importe")) : "—"}</strong></div>`;
    }).join("")}<div><span class="suave">${f.fecha(c.fecha_inicio)}</span><span><span class="etiqueta-tipo">Aportación</span></span>
      <span>Capital inicial de la cartera</span><strong class="num">${dineroSigno(capital)}</strong></div></div>`
      : `<p class="vacio">No hay movimientos de este tipo.</p>`;
  };
  alElegir(document, "filtro", pintarMovimientos);
  pintarMovimientos("todos");

  $$("tr[data-simbolo]").forEach((fila) => fila.addEventListener("click", () => { location.hash = enlaceValor(fila.dataset.simbolo); }));
  $("#ir-ajustes")?.addEventListener("click", (e) => { e.preventDefault(); $("#ajustes-cartera").scrollIntoView({ behavior: "smooth" }); });
  $("#apuntar-cartera").addEventListener("click", () => abrirApuntar({ cartera: c }));
  $("#exportar").addEventListener("click", () => exportar(c, r, movimientos, fichas));

  const recargar = () => { invalidar(); window.dispatchEvent(new HashChangeEvent("hashchange")); };
  $("#invitar")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("#error-miembro");
    try {
      const lista = miembros.anadir(c.miembros, $("#correo-miembro").value);
      botonDe(e).disabled = true;
      await datos.cambiarMiembros(c, lista);
      recargar();
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
      botonDe(e).disabled = false;
    }
  });
  $$("[data-quitar]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`¿Quitar a ${b.dataset.quitar} de la cartera? Sus operaciones se conservan.`)) return;
    if (await intentar(() => datos.cambiarMiembros(c, miembros.quitar(c.miembros, b.dataset.quitar)))) recargar();
  }));
  $("#renombrar")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await intentar(() => datos.renombrarCartera(c, $("#nuevo-nombre").value.trim()))) recargar();
  });
  $("#eliminar")?.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la cartera «${c.nombre}» y todas sus operaciones? También desaparece para sus miembros.`)) return;
    if (await intentar(() => datos.borrarCartera(c))) { invalidar(); location.hash = "#/carteras"; }
  });
  $("#salir-cartera")?.addEventListener("click", async () => {
    if (!confirm(`¿Salir de la cartera «${c.nombre}»? Tus operaciones se conservan.`)) return;
    if (await intentar(() => datos.salirDeCartera(c, sesion.usuario))) { invalidar(); location.hash = "#/carteras"; }
  });
}

function exportar(c, r, movimientos, fichas) {
  const nombre = c.nombre.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  const { elemento, cerrar } = abrirVentana({
    titulo: `Exportar «${c.nombre}»`,
    cuerpo: `<p style="margin:0">Ficheros CSV que se abren con Excel o con Hojas de cálculo de Google.</p>
      <div class="fila"><button class="boton negro" data-fichero="posiciones" type="button">Posiciones</button>
      <button class="boton negro" data-fichero="movimientos" type="button">Movimientos</button></div>`,
  });
  $$("[data-fichero]", elemento).forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.fichero === "posiciones") {
      descargar(`${nombre}-posiciones-${f.hoy()}.csv`, aCsv(
        ["Valor", "Nombre", "Títulos", "Coste (€)", "Precio", "Divisa", "Valor (€)", "Plusvalía (€)"],
        [...r.valoracion.posiciones.map((p) => [p.simbolo, fichas[p.simbolo]?.nombre, p.titulos, round(p.costeEur), p.precio,
                                                r.divisas[p.simbolo], round(p.valorEur), round(p.plusvaliaEur)]),
         ["Efectivo", "", "", "", "", "EUR", round(r.estado.efectivo), ""]]));
    } else {
      descargar(`${nombre}-movimientos-${f.hoy()}.csv`, aCsv(
        ["Fecha", "Tipo", "Valor", "Títulos", "Precio", "Divisa", "Comisión (€)", "Importe (€)", "Quién"],
        movimientos.map((m) => [m.fecha, m.tipo, m.simbolo, m.titulos, m.precio ?? m.porTitulo, m.divisa,
                                m.comisionEur ?? "", round(m.importeEur), m.tipo === "compra" || m.tipo === "venta" ? autorOperacion(m, c) : ""])));
    }
    cerrar();
  }));
}

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
