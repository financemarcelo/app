// Interfaz de la aplicación: acceso, mercado, ficha de valor, carteras y administración.
import { entrar, salir, alCambiarUsuario } from "./firebase.js";
import * as datos from "./datos.js";
import * as cartera from "./cartera.js";
import * as miembros from "./miembros.js";
import * as f from "./formato.js";
import { dibujarLinea } from "./graficos.js";
import { CAPITAL_INICIAL_POR_DEFECTO, URL_APLICACION } from "./config.js";

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const contenido = $("#contenido");
const INDICES = { IBEX35: "IBEX 35", DJIA: "Dow Jones" };
const RANGOS = [["1M", 1 / 12], ["6M", 0.5], ["1A", 1], ["5A", 5], ["Máx", 25]];
const RANGO_INICIAL = 2;
const DIAS_COTIZACION_ANTIGUA = 4;

let usuario = null;
let estado = null; // "administrador", "aprobada", "pendiente" o "eliminada"
let administrador = false;
let turno = 0;
const filtroMercado = { indice: "", texto: "" };

alCambiarUsuario(async (u) => {
  usuario = u;
  aplicarEstado(null);
  $("#usuario").hidden = !u;
  $("#correo").textContent = u?.email ?? "";
  enrutar();
  if (!u) return;
  // El perfil se guarda antes de comprobar el estado para que el administrador vea la cuenta nueva.
  await datos.guardarPerfil(u).catch((e) => console.warn("Perfil sin guardar:", e));
  const nuevo = await datos.estadoCuenta(u);
  if (usuario !== u) return;
  aplicarEstado(nuevo);
  enrutar();
});
window.addEventListener("hashchange", enrutar);
$("#boton-salir").addEventListener("click", () => salir());

/** Muestra el menú solo a las cuentas que pueden usar la aplicación. */
function aplicarEstado(nuevo) {
  estado = nuevo;
  administrador = nuevo === "administrador";
  $("#menu").hidden = !["administrador", "aprobada"].includes(nuevo);
  $("#enlace-admin").hidden = !administrador;
}

const correoPropio = () => miembros.normalizar(usuario?.email);
const iso = (marca) => marca?.toDate?.()?.toISOString();
const botonDe = (envio) => envio.submitter ?? envio.target.querySelector("[type=submit]");
const mensajeError = (e) => (e?.code === "permission-denied" ? "No tienes permiso para hacer esto." : e?.message ?? String(e));

/** Ejecuta una acción que escribe en Firestore y avisa si falla. */
async function intentar(accion) {
  try {
    await accion();
  } catch (e) {
    console.error(e);
    alert(mensajeError(e));
  }
}

// ── Navegación ───────────────────────────────────────────────────────────────

async function enrutar() {
  const actual = ++turno;
  if (!usuario) return vistaAcceso();
  if (!estado) return pintar(actual, `<p class="cargando">Cargando…</p>`);
  if (estado === "pendiente" || estado === "eliminada") return vistaPendiente(actual);
  const [, seccion = "carteras", ...partes] = (location.hash || "#/carteras").split("/");
  const enMenu = { valor: "mercado", cartera: "carteras" }[seccion] ?? seccion;
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("activo", a.dataset.seccion === enMenu));
  pintar(actual, `<p class="cargando">Cargando…</p>`);
  try {
    if (seccion === "mercado") await vistaMercado(actual);
    else if (seccion === "valor") await vistaValor(actual, decodeURIComponent(partes[0]));
    else if (seccion === "cartera") {
      // #/cartera/{propietario}/{id}; los enlaces antiguos (#/cartera/{id}) son de carteras propias.
      const [propietario, id] = (partes.length > 1 ? partes : [usuario.uid, partes[0]]).map(decodeURIComponent);
      await vistaCartera(actual, propietario, id);
    } else if (seccion === "admin") await vistaAdmin(actual);
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
      <p>La cuenta <strong>${f.html(usuario?.email)}</strong> no tiene acceso a este contenido.</p>
      <p class="aviso">Si es una cartera compartida, pide a su propietario que te añada con este correo.</p>
      <p><a href="#/carteras">← Mis carteras</a></p></section>`);
  } else {
    pintar(actual, `<section class="tarjeta"><h1>Algo ha fallado</h1>
      <p class="error">${f.html(e?.message ?? e)}</p>
      <button class="boton boton-secundario" type="button" onclick="location.reload()">Reintentar</button></section>`);
  }
}

/** Sesiones del último periodo de `anios` años: {fechas, cierres}. */
async function serieReciente(cargar, anios) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - anios * 365.25 * 86400000).toISOString().slice(0, 10);
  const s = await cargar(Number(desde.slice(0, 4)), ahora.getUTCFullYear());
  const i = s.fechas.findIndex((x) => x >= desde);
  return i < 0 ? { fechas: [], cierres: [] } : { fechas: s.fechas.slice(i), cierres: s.cierres.slice(i) };
}

/** Botones de periodo y gráfico de una serie diaria. */
function graficoConRangos(actual, contenedor, cargar, formato) {
  contenedor.innerHTML = `<div class="filtros">${RANGOS.map(([n], i) =>
      `<button class="chip${i === RANGO_INICIAL ? " activo" : ""}" data-rango="${i}" type="button">${n}</button>`).join("")}</div>
    <div class="tarjeta"><div class="grafico"><canvas></canvas></div></div>`;
  const dibujar = async (indice) => {
    const s = await serieReciente(cargar, RANGOS[indice][1]);
    if (actual !== turno) return;
    dibujarLinea($("canvas", contenedor), s.fechas.map(f.fecha), s.cierres, formato);
  };
  contenedor.querySelectorAll("[data-rango]").forEach((b) => b.addEventListener("click", () => {
    contenedor.querySelectorAll("[data-rango]").forEach((x) => x.classList.toggle("activo", x === b));
    dibujar(Number(b.dataset.rango));
  }));
  return dibujar(RANGO_INICIAL);
}

// ── Acceso ───────────────────────────────────────────────────────────────────

function vistaAcceso() {
  contenido.innerHTML = `<section class="acceso tarjeta">
    <h1>Carteras artificiales</h1>
    <p class="subtitulo">Crea carteras con acciones del IBEX 35 y del Dow Jones, compártelas con quien
      quieras y sigue su valor en euros.</p>
    <button class="boton" id="boton-entrar" type="button">Entrar con Google</button>
    <p class="aviso">Sirve cualquier cuenta de Google. Las cuentas nuevas las aprueba el administrador.</p>
    <p class="error" id="error-acceso" hidden></p></section>`;
  $("#boton-entrar").addEventListener("click", async () => {
    try {
      await entrar();
    } catch (e) {
      const mensajes = {
        "auth/popup-blocked": "El navegador ha bloqueado la ventana de acceso. Permite ventanas emergentes para esta página.",
        "auth/popup-closed-by-user": "Se cerró la ventana de acceso antes de terminar.",
        "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Authentication.",
        "auth/user-disabled": "Esta cuenta ha sido eliminada por el administrador.",
      };
      const error = $("#error-acceso");
      error.textContent = mensajes[e.code] ?? e.message;
      error.hidden = false;
    }
  });
}

function vistaPendiente(actual) {
  const eliminada = estado === "eliminada";
  if (!pintar(actual, `<section class="acceso tarjeta">
    <h1>${eliminada ? "Cuenta eliminada" : "Pendiente de aprobación"}</h1>
    <p>${eliminada ? `El administrador ha eliminado la cuenta <strong>${f.html(usuario.email)}</strong>.`
      : `La cuenta <strong>${f.html(usuario.email)}</strong> está registrada, pero el administrador
         todavía no la ha aprobado.`}</p>
    ${eliminada ? "" : `<p class="aviso">Cuando la apruebe, pulsa «Comprobar de nuevo».</p>
      <button class="boton" id="comprobar" type="button">Comprobar de nuevo</button>`}</section>`)) return;
  $("#comprobar")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    aplicarEstado(await datos.estadoCuenta(usuario));
    enrutar();
  });
}

// ── Mercado ──────────────────────────────────────────────────────────────────

async function vistaMercado(actual) {
  const [valores, cotizaciones, indices, cotIndices] = await Promise.all([
    datos.listaValores(), datos.cotizaciones(), datos.listaIndices(), datos.cotizacionesIndices()]);
  const horas = Object.values(cotizaciones).map((c) => c.hora).sort();
  if (!pintar(actual, `<h1>Mercado</h1>
    <p class="subtitulo">Última cotización: ${f.fechaHora(horas[horas.length - 1])}</p>
    <div class="filtros">
      <input id="buscar" type="search" placeholder="Buscar valor" value="${f.html(filtroMercado.texto)}">
      ${[["", "Todos"], ...Object.entries(INDICES)].map(([id, nombre]) =>
        `<button class="chip${filtroMercado.indice === id ? " activo" : ""}" data-indice="${id}" type="button">${nombre}</button>`).join("")}
    </div>
    <section id="panel-indices"></section>
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

  // Con un índice elegido: su nivel y su gráfico. Con «Todos»: el nivel de cada índice.
  const panel = () => {
    const visibles = indices.filter((i) => !filtroMercado.indice || i.indice === filtroMercado.indice);
    $("#panel-indices").innerHTML = `<div class="indicadores">${visibles.map((i) => {
      const c = cotIndices[i.indice] ?? {};
      const variacion = c.precio != null && c.cierre_anterior ? c.precio / c.cierre_anterior - 1 : null;
      return `<div class="tarjeta indicador${visibles.length > 1 ? " seleccionable" : ""}" data-indice="${i.indice}">
        <div class="etiqueta">${f.html(i.nombre)}</div>
        <div class="valor">${f.num(c.precio, 2)}</div>
        <div class="${f.claseSigno(variacion)}">${f.pct(variacion)} hoy</div>
        <div class="aviso">${f.fechaHora(c.hora)}</div></div>`;
    }).join("")}</div>
    ${visibles.length === 1 ? `<div id="grafico-indice"></div>
      <p class="aviso">Índice de precios: no incluye dividendos.</p>` : ""}`;
    if (visibles.length === 1) {
      graficoConRangos(actual, $("#grafico-indice"),
                       (desde, hasta) => datos.sesionesIndice(visibles[0].indice, desde, hasta), (v) => f.num(v, 0))
        .catch((e) => console.error(e));
    }
    $("#panel-indices").querySelectorAll(".seleccionable").forEach((t) => t.addEventListener("click", () => {
      elegirIndice(t.dataset.indice);
    }));
  };

  const elegirIndice = (indice) => {
    filtroMercado.indice = indice;
    contenido.querySelectorAll(".chip[data-indice]").forEach((x) => x.classList.toggle("activo", x.dataset.indice === indice));
    filas();
    panel();
  };

  filas();
  panel();
  $("#buscar").addEventListener("input", (e) => { filtroMercado.texto = e.target.value; filas(); });
  contenido.querySelectorAll(".chip[data-indice]").forEach((b) => b.addEventListener("click", () => elegirIndice(b.dataset.indice)));
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
    <div id="grafico-valor"></div>
    <h2>Dividendos recientes</h2>
    ${dividendos.length ? `<div class="tarjeta tabla-envoltura"><table>
      <thead><tr><th>Fecha</th><th>Importe por título</th></tr></thead><tbody>
      ${dividendos.map((d) => `<tr><td>${f.fecha(d.fecha)}</td><td>${f.precio(d.importe, ficha.divisa)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vacio">Sin dividendos registrados.</p>`}`)) return;

  await graficoConRangos(actual, $("#grafico-valor"), (desde, hasta) => datos.sesiones(simbolo, desde, hasta),
                         (v) => f.precio(v, ficha.divisa));
}

// ── Carteras ─────────────────────────────────────────────────────────────────

/** Reúne todo lo necesario para calcular una cartera y la calcula. */
async function calcularCartera(c, { conSerie = false } = {}) {
  const [operaciones, cotizaciones, cambio] = await Promise.all([
    datos.operaciones(c), datos.cotizaciones(), datos.tipoCambioActual()]);
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

const enlaceCartera = (c) => `#/cartera/${encodeURIComponent(c.propietario)}/${encodeURIComponent(c.id)}`;

/** Descripción de con quién se comparte una cartera. */
function compartida(c) {
  if (c.propietario !== usuario.uid) return "Compartida contigo";
  return c.miembros.length > 1 ? `Compartida con ${c.miembros.length - 1} ${c.miembros.length === 2 ? "persona" : "personas"}` : "";
}

/** Quién registró una operación. Las anteriores a las carteras compartidas son del propietario. */
function autorOperacion(o, c) {
  const uid = o.autor?.uid ?? c.propietario;
  if (uid === usuario.uid) return "Tú";
  return o.autor?.nombre || o.autor?.correo || "Propietario";
}

async function vistaCarteras(actual) {
  const lista = await datos.carteras(usuario);
  const calculadas = await Promise.all(lista.map(async (c) => ({ c, r: await calcularCartera(c) })));
  if (!pintar(actual, `<h1>Mis carteras</h1>
    <p class="subtitulo">Carteras artificiales valoradas en euros: las tuyas y las que otros comparten contigo.</p>
    ${calculadas.length ? `<div class="lista-carteras">${calculadas.map(({ c, r }) => {
      const rent = r.valoracion.totalEur / c.capital_inicial - 1;
      return `<a class="tarjeta" href="${enlaceCartera(c)}"><div class="nombre">${f.html(c.nombre)}</div>
        <div class="indicador"><div class="valor">${f.eur(r.valoracion.totalEur)}</div></div>
        <div class="${f.claseSigno(rent)}">${f.pct(rent)}</div>
        <div class="aviso">Desde ${f.fecha(c.fecha_inicio)}${compartida(c) ? ` · ${compartida(c)}` : ""}</div></a>`;
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
    botonDe(e).disabled = true;
    await intentar(async () => {
      const nueva = await datos.crearCartera(usuario, {
        nombre: $("#nombre").value.trim(), capitalInicial: Number($("#capital").value), fechaInicio: f.hoy() });
      location.hash = enlaceCartera(nueva);
    });
    botonDe(e).disabled = false;
  });
}

async function vistaCartera(actual, propietario, id) {
  const c = await datos.cartera(propietario, id);
  if (!c) return pintar(actual, `<p class="error">La cartera no existe.</p><p><a href="#/carteras">← Mis carteras</a></p>`);
  const [r, valores] = await Promise.all([calcularCartera(c, { conSerie: true }), datos.listaValores()]);
  const { estado, valoracion } = r;
  const esPropietario = c.propietario === usuario.uid;
  const yo = correoPropio();
  const otros = c.miembros.filter((m) => m !== yo);
  const rentEur = valoracion.totalEur - c.capital_inicial;
  const movimientos = [
    ...r.operaciones.map((o) => ({ fecha: o.fecha_mercado, tipo: o.tipo, simbolo: o.simbolo,
                                   detalle: `${f.titulos(o.titulos)} × ${f.precio(o.precio, o.divisa)}`,
                                   quien: autorOperacion(o, c),
                                   importeEur: o.tipo === "compra" ? -o.importe_eur : o.importe_eur })),
    ...estado.movimientos.map((m) => ({ ...m, quien: "—" })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const porIndice = (indice) => valores.filter((v) => v.indice === indice)
    .map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)} · ${f.html(v.nombre)}</option>`).join("");

  if (!pintar(actual, `<p><a href="#/carteras">← Mis carteras</a></p>
    <h1>${f.html(c.nombre)}</h1>
    <p class="subtitulo">Creada el ${f.fecha(c.fecha_inicio)} con ${f.eur(c.capital_inicial)}${compartida(c) ? ` · ${compartida(c)}` : ""}</p>
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
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Detalle</th><th>Quién</th><th>Importe</th></tr></thead>
      <tbody>${movimientos.map((m) => `<tr><td>${f.fecha(m.fecha)}</td><td>${f.html(m.tipo)}</td>
        <td>${f.html(m.simbolo)}</td><td>${f.html(m.detalle)}</td><td>${f.html(m.quien)}</td>
        <td class="${f.claseSigno(m.importeEur)}">${f.eur(m.importeEur)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="vacio">Sin movimientos.</p>`}

    <h2>Miembros</h2>
    <div class="tarjeta">
      <ul class="miembros">${c.miembros.map((m) => `<li><span>${f.html(m)}${m === yo ? " (tú)" : ""}</span>
        ${esPropietario && m !== yo ? `<button class="boton boton-secundario" data-quitar="${f.html(m)}" type="button">Quitar</button>` : ""}</li>`).join("")}</ul>
      ${esPropietario ? `<form class="formulario" id="invitar">
        <div class="ancho"><label for="correo-miembro">Añadir por correo</label>
          <input id="correo-miembro" type="email" required placeholder="nombre@ejemplo.com"></div>
        <div><button class="boton" type="submit">Añadir</button></div>
        ${otros.length ? `<div><a class="boton boton-secundario" href="${f.html(miembros.enlaceAviso({ correos: otros, cartera: c.nombre, url: URL_APLICACION }))}">Avisar por correo</a></div>` : ""}
        <p class="error ancho" id="error-miembro" hidden></p></form>` : ""}
      <p class="aviso">Los miembros ven la cartera y registran operaciones a su nombre al entrar con la cuenta
        de Google de ese correo; si es su primera vez, el administrador tiene que aprobar su cuenta. La
        aplicación no envía correos: «Avisar por correo» abre tu programa de correo con el enlace ya escrito.</p>
    </div>

    ${esPropietario ? `<h2>Eliminar</h2>
      <button class="boton boton-peligro" id="eliminar" type="button">Eliminar esta cartera</button>`
      : `<h2>Salir</h2>
      <button class="boton boton-peligro" id="salir-cartera" type="button">Salir de esta cartera</button>`}`)) return;

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
    botonDe(e).disabled = true;
    try {
      await datos.registrarOperacion(c, usuario, {
        fecha_mercado: p.cot.fecha, simbolo: p.simbolo, tipo: p.tipo, titulos: p.titulos, precio: p.cot.precio,
        divisa: p.divisa, eurusd: r.cambio.valor, importe_eur: p.importeEur });
      enrutar();
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
      botonDe(e).disabled = false;
    }
  });

  if (esPropietario) {
    $("#invitar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const error = $("#error-miembro");
      try {
        const lista = miembros.anadir(c.miembros, $("#correo-miembro").value);
        botonDe(e).disabled = true;
        await datos.cambiarMiembros(c, lista);
        enrutar();
      } catch (err) {
        error.textContent = mensajeError(err);
        error.hidden = false;
        botonDe(e).disabled = false;
      }
    });
    contenido.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`¿Quitar a ${b.dataset.quitar} de la cartera? Sus operaciones se conservan.`)) return;
      await intentar(async () => {
        await datos.cambiarMiembros(c, miembros.quitar(c.miembros, b.dataset.quitar));
        enrutar();
      });
    }));
    $("#eliminar").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar la cartera «${c.nombre}» y todas sus operaciones? También desaparece para sus miembros.`)) return;
      await intentar(async () => {
        await datos.borrarCartera(c);
        location.hash = "#/carteras";
      });
    });
  } else {
    $("#salir-cartera").addEventListener("click", async () => {
      if (!confirm(`¿Salir de la cartera «${c.nombre}»? Tus operaciones se conservan.`)) return;
      await intentar(async () => {
        await datos.salirDeCartera(c, usuario);
        location.hash = "#/carteras";
      });
    });
  }
}

// ── Administración ───────────────────────────────────────────────────────────

async function vistaAdmin(actual) {
  if (!administrador) {
    return pintar(actual, `<h1>Administración</h1><p class="error">Solo para administradores.</p>`);
  }
  const [cuentas, aprobadas, pedidas] = await Promise.all([datos.perfiles(), datos.aprobaciones(), datos.bajas()]);
  cuentas.sort((a, b) => (iso(a.alta) ?? "").localeCompare(iso(b.alta) ?? ""));
  const pendientes = cuentas.filter((u) => u.uid !== usuario.uid && !aprobadas[u.uid] && !pedidas[u.uid]);
  const activas = cuentas.filter((u) => !pendientes.includes(u));
  const eliminadas = Object.values(pedidas).filter((b) => b.procesada);
  const fila = (u, acciones) => `<tr><td>${f.html(u.nombre || "—")}</td><td>${f.html(u.correo)}</td>
    <td>${f.fechaHora(iso(u.alta))}</td><td>${f.fechaHora(iso(u.ultimo_acceso))}</td><td>${acciones}</td></tr>`;
  const boton = (accion, clase, texto, u) =>
    `<button class="boton ${clase}" data-${accion}="${f.html(u.uid)}" data-correo="${f.html(u.correo)}" type="button">${texto}</button>`;
  const tabla = (filas) => `<div class="tarjeta tabla-envoltura"><table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Alta</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
  if (!pintar(actual, `<h1>Administración</h1>
    <p class="subtitulo">${cuentas.length} ${cuentas.length === 1 ? "cuenta registrada" : "cuentas registradas"}</p>
    <h2>Pendientes de aprobación</h2>
    ${pendientes.length ? tabla(pendientes.map((u) => fila(u, `<div class="acciones">${boton("aprobar", "", "Aprobar", u)}
        ${boton("baja", "boton-peligro", "Rechazar", u)}</div>`)).join(""))
      : `<p class="vacio">No hay cuentas pendientes.</p>`}
    <h2>Cuentas con acceso</h2>
    ${tabla(activas.map((u) => fila(u, u.uid === usuario.uid ? "Tú"
      : pedidas[u.uid] ? "Eliminación pendiente" : boton("baja", "boton-peligro", "Eliminar", u))).join(""))}
    <p class="aviso">Rechazar o eliminar una cuenta le retira el acceso en ese momento. En la siguiente
      actualización de cotizaciones (cada 15 minutos en días laborables) se desactiva su acceso con Google y
      se borran su perfil, sus carteras y sus operaciones. No se puede deshacer.</p>
    ${eliminadas.length ? `<h2>Cuentas eliminadas</h2>
      <div class="tarjeta tabla-envoltura"><table><thead><tr><th>Correo</th><th>Eliminada</th></tr></thead>
      <tbody>${eliminadas.map((b) => `<tr><td>${f.html(b.correo)}</td><td>${f.fechaHora(iso(b.procesada))}</td></tr>`).join("")}
      </tbody></table></div>` : ""}`)) return;

  contenido.querySelectorAll("[data-aprobar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await intentar(async () => {
      await datos.aprobar(b.dataset.aprobar, b.dataset.correo);
      enrutar();
    });
    b.disabled = false;
  }));
  contenido.querySelectorAll("[data-baja]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la cuenta ${b.dataset.correo}? Se borrarán su perfil, sus carteras y sus operaciones, y no podrá volver a entrar.`)) return;
    b.disabled = true;
    await intentar(async () => {
      await datos.pedirBaja(b.dataset.baja, b.dataset.correo);
      enrutar();
    });
    b.disabled = false;
  }));
}
