// Arranque de la aplicación: sesión, marco (cabecera, pie y barra inferior), buscador y enrutador.
import { alCambiarUsuario } from "./firebase.js";
import * as datos from "./datos.js";
import { sesion, puedeUsar, administrador, cargarPreferencias, aplicarPresentacion } from "./sesion.js";
import { $, $$, pintar, inicial, mensajeError } from "./ui.js";
import { invalidar } from "./resumen.js";
import * as f from "./formato.js";
import { grupoDe } from "./calculos.js";
import { enlaceValor } from "./vistas/comun.js";
import * as portada from "./vistas/portada.js";
import * as pendiente from "./vistas/pendiente.js";
import * as inicio from "./vistas/inicio.js";
import { vistaLista, vistaNueva, vistaCartera } from "./vistas/carteras.js";
import * as operar from "./vistas/operar.js";
import * as mercado from "./vistas/mercado.js";
import * as valor from "./vistas/valor.js";
import * as dividendos from "./vistas/dividendos.js";
import * as cuaderno from "./vistas/cuaderno.js";
import * as perfil from "./vistas/perfil.js";
import * as admin from "./vistas/admin.js";
import { abrirApuntar } from "./vistas/apuntar.js";

const VISTAS = {
  inicio: inicio.vista,
  carteras: vistaLista,
  cartera: vistaCartera,
  operar: operar.vista,
  mercado: mercado.vista,
  valor: valor.vista,
  dividendos: dividendos.vista,
  cuaderno: cuaderno.vista,
  perfil: perfil.vista,
  admin: admin.vista,
};
// Sección del menú que se marca para cada página.
const EN_MENU = { cartera: "carteras", valor: "mercado" };
const PAGINA_INICIAL = { inicio: "#/inicio", cartera: "#/carteras", mercado: "#/mercado" };

aplicarPresentacion();

alCambiarUsuario(async (u) => {
  sesion.usuario = u;
  sesion.estado = null;
  invalidar();
  marco();
  enrutar();
  if (!u) return;
  // El perfil se guarda antes de comprobar el estado para que el administrador vea la cuenta nueva.
  await datos.guardarPerfil(u).catch((e) => console.warn("Perfil sin guardar:", e));
  const estado = await datos.estadoCuenta(u).catch(() => "pendiente");
  if (sesion.usuario !== u) return;
  sesion.estado = estado;
  if (puedeUsar()) await cargarPreferencias();
  if (sesion.usuario !== u) return;
  marco();
  if (!location.hash || location.hash === "#/") location.replace(PAGINA_INICIAL[sesion.preferencias.inicio] ?? "#/inicio");
  else enrutar();
});
window.addEventListener("hashchange", enrutar);

/** Cabecera, pie y barra inferior, solo para las cuentas que pueden usar la aplicación. */
function marco() {
  const visible = Boolean(sesion.usuario) && puedeUsar();
  for (const id of ["cabecera", "pie", "barra-inferior"]) $(`#${id}`).hidden = !visible;
  $("#enlace-admin").hidden = !administrador();
  $("#avatar").textContent = sesion.usuario ? inicial(sesion.usuario.displayName || sesion.usuario.email) : "·";
  if (!sesion.usuario) aplicarPresentacion({ tema: "automatico", densidad: "comoda" });
}

async function alCambiarEstado(estado) {
  sesion.estado = estado;
  if (puedeUsar()) await cargarPreferencias();
  marco();
  enrutar();
}

/** Lee la ruta «#/seccion/a/b?clave=valor». */
function ruta() {
  const [camino, busqueda = ""] = (location.hash || "#/inicio").slice(1).split("?");
  const [seccion = "inicio", ...partes] = camino.split("/").filter(Boolean);
  return { seccion, partes, consulta: new URLSearchParams(busqueda) };
}

async function enrutar() {
  const actual = ++sesion.turno;
  cerrarBusqueda();
  if (!sesion.usuario) return portada.vista();
  const main = $("#contenido");
  main.className = "contenido";
  if (!sesion.estado) return pintar(actual, `<p class="cargando">Cargando…</p>`);
  if (!puedeUsar()) return pendiente.vista({ actual, alCambiarEstado });

  const { seccion, partes, consulta } = ruta();
  const enMenu = EN_MENU[seccion] ?? seccion;
  $$("#menu a, #barra-inferior a").forEach((a) => a.classList.toggle("activo", a.dataset.seccion === enMenu));
  const vista = seccion === "carteras" && partes[0] === "nueva" ? vistaNueva : VISTAS[seccion];
  if (!vista) return pintar(actual, `<h1>Página no encontrada</h1><p><a href="#/inicio">← Inicio</a></p>`);
  pintar(actual, `<p class="cargando">Cargando…</p>`);
  try {
    await vista({ actual, partes, consulta });
  } catch (e) {
    console.error(e);
    const sinPermiso = e?.code === "permission-denied";
    pintar(actual, `<section class="panel peligro" style="max-width:640px">
      <h2>${sinPermiso ? "Sin acceso" : "No se ha podido cargar la página"}</h2>
      <p style="margin:0">${sinPermiso ? "Esta página no está compartida con tu cuenta." : f.html(mensajeError(e))}</p>
      <div><a class="boton linea" href="#/inicio">Volver al inicio</a></div></section>`);
  }
}

// ── Buscador de valores ──────────────────────────────────────────────────────

const buscar = $("#buscar-valor");
const resultados = $("#resultados-busqueda");

function cerrarBusqueda() {
  resultados.hidden = true;
  resultados.innerHTML = "";
}

buscar.addEventListener("input", async () => {
  const texto = buscar.value.trim().toLowerCase();
  if (!texto) return cerrarBusqueda();
  const lista = await datos.listaValores();
  if (buscar.value.trim().toLowerCase() !== texto) return;
  const encontrados = lista.filter((v) => [v.simbolo, v.nombre, v.isin].some((x) => (x ?? "").toLowerCase().includes(texto))).slice(0, 8);
  resultados.innerHTML = encontrados.length
    ? encontrados.map((v, i) => `<a href="${enlaceValor(v.simbolo)}" class="${i ? "" : "marcado"}"><span><strong>${f.html(v.simbolo)}</strong>
        ${f.html(v.nombre)}</span><span class="suave">${grupoDe(v).nombre}</span></a>`).join("")
    : `<p class="vacio" style="padding:10px 12px;margin:0">Sin resultados.</p>`;
  resultados.hidden = false;
});
buscar.addEventListener("keydown", (e) => {
  const enlaces = $$("a", resultados);
  if (!enlaces.length) return;
  const marcado = enlaces.findIndex((a) => a.classList.contains("marcado"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const siguiente = (marcado + (e.key === "ArrowDown" ? 1 : -1) + enlaces.length) % enlaces.length;
    enlaces.forEach((a, i) => a.classList.toggle("marcado", i === siguiente));
  } else if (e.key === "Enter") {
    e.preventDefault();
    location.hash = enlaces[Math.max(0, marcado)].getAttribute("href");
    buscar.value = "";
    buscar.blur();
  } else if (e.key === "Escape") {
    cerrarBusqueda();
  }
});
resultados.addEventListener("click", (e) => {
  if (e.target.closest("a")) buscar.value = "";
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#buscador")) cerrarBusqueda();
});

// ── Apuntar desde la cabecera, con el contexto de la página ──────────────────

$("#boton-apuntar").addEventListener("click", async () => {
  const { seccion, partes } = ruta();
  if (seccion === "valor" && partes[0]) return abrirApuntar({ simbolo: decodeURIComponent(partes[0]), grafico: true });
  if (seccion === "cartera" && partes.length > 1) {
    const [propietario, id] = partes.map(decodeURIComponent);
    const c = await datos.cartera(propietario, id).catch(() => null);
    return abrirApuntar({ cartera: c });
  }
  return abrirApuntar();
});

// Para el aviso de index.html: los módulos se han cargado y la aplicación ha arrancado.
window.carterasIniciada = true;
