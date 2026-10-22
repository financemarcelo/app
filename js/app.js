// Interfaz de la aplicación: acceso, mercado, ficha de valor y carteras.
import { entrar, salir, alCambiarUsuario } from "./firebase.js";
import * as datos from "./datos.js";
import * as cartera from "./cartera.js";
import * as f from "./formato.js";
import { dibujarLinea } from "./graficos.js";
import { CAPITAL_INICIAL_POR_DEFECTO } from "./config.js";

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const contenido = $("#contenido");
const INDICES = { IBEX35: "IBEX 35", DJIA: "Dow Jones" };
const RANGOS = [["1M", 1 / 12], ["6M", 0.5], ["1A", 1], ["5A", 5], ["Máx", 25]];
const DIAS_COTIZACION_ANTIGUA = 4;

let usuario = null;
let turno = 0;
const filtroMercado = { indice: "", texto: "" };

alCambiarUsuario((u) => {
  usuario = u;
  $("#usuario").hidden = !u;
  $("#menu").hidden = !u;
  $("#correo").textContent = u?.email ?? "";
  enrutar();
});
window.addEventListener("hashchange", enrutar);
$("#boton-salir").addEventListener("click", () => salir());

// ── Navegación ───────────────────────────────────────────────────────────────

async function enrutar() {
  const actual = ++turno;
  if (!usuario) return vistaAcceso();
  const [, seccion = "carteras", id] = (location.hash || "#/carteras").split("/");
  document.querySelectorAll("#menu a").forEach((a) => {
    a.classList.toggle("activo", a.dataset.seccion === (seccion === "valor" ? "mercado" :
                                                        seccion === "cartera" ? "carteras" : seccion));
  });
  pintar(actual, `<p class="cargando">Cargando…</p>`);
  try {
    if (seccion === "mercado") await vistaMercado(actual);
    else if (seccion === "valor") await vistaValor(actual, decodeURIComponent(id));
    else if (seccion === "cartera") await vistaCartera(actual, id);
    else await vistaCarteras(actual);
  } catch (e) {
    vistaError(actual, e);
  }
}

/** Escribe en la página solo si el usuario no ha cambiado de vista mientras se cargaban datos. */
function pintar(actual, contenidoHtml) {
  if (actual !== turno) return false;
  contenido.innerHTML = contenidoHtml;
  return true;
}

function vistaError(actual, e) {
  console.error(e);
  if (e?.code === "permission-denied") {
    pintar(actual, `<section class="acceso tarjeta">
      <h1>Sin acceso</h1>
      <p>La cuenta <strong>${f.html(usuario?.email)}</strong> no tiene acceso a los datos.</p>
      <p class="aviso">El acceso se concede por correo en la configuración del proyecto.</p></section>`);
  } else {
    pintar(actual, `<section class="tarjeta"><h1>Algo ha fallado</h1>
      <p class="error">${f.html(e?.message ?? e)}</p>
      <button class="boton boton-secundario" type="button" onclick="location.reload()">Reintentar</button></section>`);
  }
}

// ── Acceso ───────────────────────────────────────────────────────────────────

function vistaAcceso() {
  contenido.innerHTML = `<section class="acceso tarjeta">
    <h1>Carteras artificiales</h1>
    <p class="subtitulo">Crea carteras con acciones del IBEX 35 y del Dow Jones y sigue su valor.</p>
    <button class="boton" id="boton-entrar" type="button">Entrar con Google</button>
    <p class="error" id="error-acceso" hidden></p></section>`;
  $("#boton-entrar").addEventListener("click", async () => {
    try {
      await entrar();
    } catch (e) {
      const mensajes = {
        "auth/popup-blocked": "El navegador ha bloqueado la ventana de acceso. Permite ventanas emergentes para esta página.",
        "auth/popup-closed-by-user": "Se cerró la ventana de acceso antes de terminar.",
        "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Authentication.",
      };
      const error = $("#error-acceso");
      error.textContent = mensajes[e.code] ?? e.message;
      error.hidden = false;
    }
  });
}

// ── Mercado ──────────────────────────────────────────────────────────────────

async function vistaMercado(actual) {
  const [valores, cotizaciones] = await Promise.all([datos.listaValores(), datos.cotizaciones()]);
  const horas = Object.values(cotizaciones).map((c) => c.hora).sort();
  if (!pintar(actual, `<h1>Mercado</h1>
    <p class="subtitulo">Última cotización: ${f.fechaHora(horas[horas.length - 1])}</p>
    <div class="filtros">
      <input id="buscar" type="search" placeholder="Buscar valor" value="${f.html(filtroMercado.texto)}">
      ${[["", "Todos"], ...Object.entries(INDICES)].map(([id, nombre]) =>
        `<button class="chip${filtroMercado.indice === id ? " activo" : ""}" data-indice="${id}" type="button">${nombre}</button>`).join("")}
    </div>
    <div class="tarjeta tabla-envoltura"><table>
      <thead><tr><th>Valor</th><th>Precio</th><th>Variación</th><th>Hora</th></tr></thead>
      <tbody id="filas"></tbody></table></div>`)) return;

  const filas = () => {
    const texto = filtroMercado.texto.toLowerCase();
    $("#filas").innerHTML = valores
      .filter((v) => !filtroMercado.indice || v.indice === filtroMercado.indice)
      .filter((v) => !texto || v.simbolo.toLowerCase().includes(texto) || v.nombre.toLowerCase().includes(texto))
      .map((v) => {
        const c = cotizaciones[v.simbolo] ?? {};
        const variacion = c.precio != null && c.cierre_anterior ? c.precio / c.cierre_anterior - 1 : null;
        return `<tr class="enlace" data-simbolo="${f.html(v.simbolo)}">
          <td><strong>${f.html(v.simbolo)}</strong><span class="nombre-valor">${f.html(v.nombre)}</span></td>
          <td>${f.precio(c.precio, v.divisa)}</td>
          <td class="${f.claseSigno(variacion)}">${f.pct(variacion)}</td>
          <td>${f.fechaHora(c.hora)}</td></tr>`;
      }).join("") || `<tr><td colspan="4" class="vacio">Ningún valor coincide.</td></tr>`;
  };
  filas();
  $("#buscar").addEventListener("input", (e) => { filtroMercado.texto = e.target.value; filas(); });
  contenido.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
    filtroMercado.indice = b.dataset.indice;
    contenido.querySelectorAll(".chip").forEach((x) => x.classList.toggle("activo", x === b));
    filas();
  }));
  $("#filas").addEventListener("click", (e) => {
    const fila = e.target.closest("tr[data-simbolo]");
    if (fila) location.hash = `#/valor/${encodeURIComponent(fila.dataset.simbolo)}`;
  });
}

// ── Ficha de un valor ────────────────────────────────────────────────────────

async function vistaValor(actual, simbolo) {
  const [ficha, cotizaciones] = await Promise.all([datos.fichaValor(simbolo), datos.cotizaciones()]);
  if (!ficha) return pintar(actual, `<p class="error">No existe el valor ${f.html(simbolo)}.</p>`);
  const c = cotizaciones[simbolo] ?? {};
  const variacion = c.precio != null && c.cierre_anterior ? c.precio / c.cierre_anterior - 1 : null;
  const dividendos = [...(ficha.dividendos ?? [])].reverse().slice(0, 8);
  if (!pintar(actual, `<p><a href="#/mercado">← Mercado</a></p>
    <h1>${f.html(ficha.nombre)}</h1>
    <p class="subtitulo">${f.html(simbolo)} · ${f.html(INDICES[ficha.indice] ?? ficha.indice)} · ISIN ${f.html(ficha.isin)}
      · ${f.html(ficha.mic)} · ${f.html(ficha.sector)}</p>
    <div class="indicadores">
      <div class="tarjeta indicador"><div class="etiqueta">Último precio</div>
        <div class="valor">${f.precio(c.precio, ficha.divisa)}</div>
        <div class="aviso">${f.fechaHora(c.hora)}</div></div>
      <div class="tarjeta indicador"><div class="etiqueta">Variación del día</div>
        <div class="valor ${f.claseSigno(variacion)}">${f.pct(variacion)}</div></div>
    </div>
    <h2>Cotización</h2>
    <div class="filtros">${RANGOS.map(([n], i) =>
      `<button class="chip${i === 2 ? " activo" : ""}" data-rango="${i}" type="button">${n}</button>`).join("")}</div>
    <div class="tarjeta"><div class="grafico"><canvas id="grafico"></canvas></div></div>
    <h2>Dividendos recientes</h2>
    ${dividendos.length ? `<div class="tarjeta tabla-envoltura"><table>
      <thead><tr><th>Fecha</th><th>Importe por título</th></tr></thead><tbody>
      ${dividendos.map((d) => `<tr><td>${f.fecha(d.fecha)}</td><td>${f.precio(d.importe, ficha.divisa)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vacio">Sin dividendos registrados.</p>`}`)) return;

  const dibujar = async (indice) => {
    const anios = RANGOS[indice][1];
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - anios * 365.25 * 86400000).toISOString().slice(0, 10);
    const s = await datos.sesiones(simbolo, Number(desde.slice(0, 4)), ahora.getUTCFullYear());
    if (actual !== turno) return;
    const i = s.fechas.findIndex((x) => x >= desde);
    const fechas = i < 0 ? [] : s.fechas.slice(i);
    const cierres = i < 0 ? [] : s.cierres.slice(i);
    dibujarLinea($("#grafico"), fechas.map(f.fecha), cierres, (v) => f.precio(v, ficha.divisa));
  };
  contenido.querySelectorAll("[data-rango]").forEach((b) => b.addEventListener("click", () => {
    contenido.querySelectorAll("[data-rango]").forEach((x) => x.classList.toggle("activo", x === b));
    dibujar(Number(b.dataset.rango));
  }));
  await dibujar(2);
}

// ── Carteras ─────────────────────────────────────────────────────────────────

/** Reúne todo lo necesario para calcular una cartera y la calcula. */
async function calcularCartera(c, { conSerie = false } = {}) {
  const [operaciones, cotizaciones, cambio] = await Promise.all([
    datos.operaciones(usuario.uid, c.id), datos.cotizaciones(), datos.tipoCambioActual()]);
  const simbolos = [...new Set(operaciones.map((o) => o.simbolo))];
  const fichas = Object.fromEntries(await Promise.all(simbolos.map(async (s) => [s, await datos.fichaValor(s)])));
  const eventos = Object.fromEntries(simbolos.map((s) => [s, fichas[s] ?? {}]));
  const divisas = Object.fromEntries(simbolos.map((s) => [s, fichas[s]?.divisa ?? "EUR"]));
  const anioInicio = Number((operaciones[0]?.fecha_mercado ?? c.fecha_inicio).slice(0, 4));
  const anioActual = new Date().getUTCFullYear();
  const [serieCambio, sesiones] = await Promise.all([
    datos.serieTipoCambio(Math.min(anioInicio, Number(c.fecha_inicio.slice(0, 4))), anioActual),
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
  const serie = conSerie ? cartera.serieValor({ ...base, sesiones, desde: c.fecha_inicio, hasta: f.hoy() }) : null;
  return { operaciones, estado, valoracion, serie, cotizaciones, cambio, divisas };
}

async function vistaCarteras(actual) {
  const lista = await datos.carteras(usuario.uid);
  const calculadas = await Promise.all(lista.map(async (c) => ({ c, r: await calcularCartera(c) })));
  if (!pintar(actual, `<h1>Mis carteras</h1>
    <p class="subtitulo">Carteras artificiales valoradas en euros.</p>
    ${calculadas.length ? `<div class="lista-carteras">${calculadas.map(({ c, r }) => {
      const rent = r.valoracion.totalEur / c.capital_inicial - 1;
      return `<a class="tarjeta" href="#/cartera/${c.id}"><div class="nombre">${f.html(c.nombre)}</div>
        <div class="indicador"><div class="valor">${f.eur(r.valoracion.totalEur)}</div></div>
        <div class="${f.claseSigno(rent)}">${f.pct(rent)}</div>
        <div class="aviso">Desde ${f.fecha(c.fecha_inicio)}</div></a>`;
    }).join("")}</div>` : `<p class="vacio">Todavía no hay carteras.</p>`}
    <h2>Nueva cartera</h2>
    <form class="tarjeta formulario" id="nueva">
      <div><label for="nombre">Nombre</label><input id="nombre" required maxlength="60" placeholder="Mi cartera"></div>
      <div><label for="capital">Capital inicial (€)</label>
        <input id="capital" type="number" min="1" step="1" required value="${CAPITAL_INICIAL_POR_DEFECTO}"></div>
      <div><button class="boton" type="submit">Crear cartera</button></div>
    </form>`)) return;

  $("#nueva").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = e.submitter;
    boton.disabled = true;
    const id = await datos.crearCartera(usuario.uid, {
      nombre: $("#nombre").value.trim(), capitalInicial: Number($("#capital").value), fechaInicio: f.hoy() });
    location.hash = `#/cartera/${id}`;
  });
}

async function vistaCartera(actual, id) {
  const c = (await datos.carteras(usuario.uid)).find((x) => x.id === id);
  if (!c) return pintar(actual, `<p class="error">La cartera no existe.</p><p><a href="#/carteras">← Mis carteras</a></p>`);
  const [r, valores] = await Promise.all([calcularCartera(c, { conSerie: true }), datos.listaValores()]);
  const { estado, valoracion } = r;
  const rentEur = valoracion.totalEur - c.capital_inicial;
  const movimientos = [
    ...r.operaciones.map((o) => ({ fecha: o.fecha_mercado, tipo: o.tipo, simbolo: o.simbolo,
                                   detalle: `${f.titulos(o.titulos)} × ${f.precio(o.precio, o.divisa)}`,
                                   importeEur: o.tipo === "compra" ? -o.importe_eur : o.importe_eur })),
    ...estado.movimientos,
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const porIndice = (indice) => valores.filter((v) => v.indice === indice)
    .map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)} · ${f.html(v.nombre)}</option>`).join("");

  if (!pintar(actual, `<p><a href="#/carteras">← Mis carteras</a></p>
    <h1>${f.html(c.nombre)}</h1>
    <p class="subtitulo">Creada el ${f.fecha(c.fecha_inicio)} con ${f.eur(c.capital_inicial)}</p>
    <div class="indicadores">
      <div class="tarjeta indicador"><div class="etiqueta">Valor total</div><div class="valor">${f.eur(valoracion.totalEur)}</div></div>
      <div class="tarjeta indicador"><div class="etiqueta">Rentabilidad</div>
        <div class="valor ${f.claseSigno(rentEur)}">${f.pct(rentEur / c.capital_inicial)}</div>
        <div class="aviso ${f.claseSigno(rentEur)}">${f.eur(rentEur)}</div></div>
      <div class="tarjeta indicador"><div class="etiqueta">Efectivo</div><div class="valor">${f.eur(estado.efectivo)}</div></div>
      <div class="tarjeta indicador"><div class="etiqueta">Dividendos y ajustes</div>
        <div class="valor">${f.eur(estado.dividendosEur + estado.ajustesEur)}</div></div>
    </div>

    <h2>Operar</h2>
    <form class="tarjeta formulario" id="operar">
      <div class="ancho"><label for="valor">Valor</label><select id="valor" required>
        <option value="">Elige un valor…</option>
        <optgroup label="IBEX 35">${porIndice("IBEX35")}</optgroup>
        <optgroup label="Dow Jones">${porIndice("DJIA")}</optgroup></select></div>
      <div><label for="tipo">Operación</label><select id="tipo"><option value="compra">Comprar</option>
        <option value="venta">Vender</option></select></div>
      <div><label for="titulos">Títulos</label><input id="titulos" type="number" min="1" step="1" required></div>
      <div><button class="boton" type="submit">Confirmar</button></div>
      <p class="aviso ancho" id="estimacion">Se ejecuta al último precio disponible.</p>
      <p class="error ancho" id="error-operacion" hidden></p>
    </form>

    <h2>Posiciones</h2>
    ${valoracion.posiciones.length ? `<div class="tarjeta tabla-envoltura"><table>
      <thead><tr><th>Valor</th><th>Títulos</th><th>Coste medio (€)</th><th>Precio</th><th>Valor (€)</th><th>Plusvalía</th></tr></thead>
      <tbody>${valoracion.posiciones.map((p) => `<tr class="enlace" data-simbolo="${f.html(p.simbolo)}">
        <td><strong>${f.html(p.simbolo)}</strong></td><td>${f.titulos(p.titulos)}</td>
        <td>${f.eur(p.costeEur / p.titulos)}</td><td>${f.precio(p.precio, r.divisas[p.simbolo])}</td>
        <td>${f.eur(p.valorEur)}</td>
        <td class="${f.claseSigno(p.plusvaliaEur)}">${f.eur(p.plusvaliaEur)} (${f.pct(p.plusvaliaPct)})</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vacio">Sin posiciones.</p>`}

    <h2>Evolución</h2>
    ${r.serie.length > 1 ? `<div class="tarjeta"><div class="grafico"><canvas id="grafico"></canvas></div></div>`
                         : `<p class="vacio">La evolución aparece a partir de la segunda sesión.</p>`}

    <h2>Movimientos</h2>
    ${movimientos.length ? `<div class="tarjeta tabla-envoltura"><table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Detalle</th><th>Importe</th></tr></thead>
      <tbody>${movimientos.map((m) => `<tr><td>${f.fecha(m.fecha)}</td><td>${f.html(m.tipo)}</td>
        <td>${f.html(m.simbolo)}</td><td>${f.html(m.detalle)}</td>
        <td class="${f.claseSigno(m.importeEur)}">${f.eur(m.importeEur)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="vacio">Sin movimientos.</p>`}

    <h2>Eliminar</h2>
    <button class="boton boton-peligro" id="eliminar" type="button">Eliminar esta cartera</button>`)) return;

  if (r.serie.length > 1) {
    dibujarLinea($("#grafico"), r.serie.map((p) => f.fecha(p.fecha)), r.serie.map((p) => p.totalEur), f.eur);
  }
  contenido.querySelectorAll("tr[data-simbolo]").forEach((fila) => fila.addEventListener("click", () => {
    location.hash = `#/valor/${encodeURIComponent(fila.dataset.simbolo)}`;
  }));

  const ficha = (s) => valores.find((v) => v.simbolo === s);
  const propuesta = () => {
    const simbolo = $("#valor").value;
    const titulos = Number($("#titulos").value);
    const cot = r.cotizaciones[simbolo];
    if (!simbolo || !cot) return null;
    const divisa = ficha(simbolo).divisa;
    const importeEur = cartera.importeOperacionEur({ titulos, precio: cot.precio, divisa, eurusd: r.cambio.valor });
    return { simbolo, titulos, divisa, cot, importeEur, tipo: $("#tipo").value };
  };
  const estimar = () => {
    const p = propuesta();
    if (!p) { $("#estimacion").textContent = "Se ejecuta al último precio disponible."; return; }
    const dias = (Date.now() - new Date(p.cot.hora).getTime()) / 86400000;
    $("#estimacion").innerHTML = `Precio ${f.precio(p.cot.precio, p.divisa)} (${f.fechaHora(p.cot.hora)})` +
      (p.divisa === "USD" ? ` · 1 € = ${f.num(r.cambio.valor, 4)} $` : "") +
      (p.titulos > 0 ? ` · Importe ${f.eur(p.importeEur)}` : "") +
      (dias > DIAS_COTIZACION_ANTIGUA ? ` · <span class="error">cotización de hace ${Math.floor(dias)} días</span>` : "");
  };
  ["#valor", "#tipo", "#titulos"].forEach((s) => $(s).addEventListener("input", estimar));

  $("#operar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = propuesta();
    const error = $("#error-operacion");
    const fallo = p ? cartera.validarOperacion(estado, p) : "Elige un valor con cotización.";
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    e.submitter.disabled = true;
    await datos.registrarOperacion(usuario.uid, c.id, {
      fecha_mercado: p.cot.fecha, simbolo: p.simbolo, tipo: p.tipo, titulos: p.titulos, precio: p.cot.precio,
      divisa: p.divisa, eurusd: r.cambio.valor, importe_eur: p.importeEur });
    enrutar();
  });

  $("#eliminar").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la cartera «${c.nombre}» y todas sus operaciones?`)) return;
    await datos.borrarCartera(usuario.uid, c.id);
    location.hash = "#/carteras";
  });
}
