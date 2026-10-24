// Piezas de interfaz compartidas por las vistas.
import { sesion } from "./sesion.js";
import * as f from "./formato.js";

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];
export const contenido = () => document.getElementById("contenido");

/** Escribe la vista solo si el usuario no ha cambiado de página mientras se cargaban los datos. */
export function pintar(actual, html) {
  if (actual !== sesion.turno) return false;
  contenido().innerHTML = html;
  window.scrollTo?.(0, 0);
  return true;
}

export const vigente = (actual) => actual === sesion.turno;

export const mensajeError = (e) => (e?.code === "permission-denied" ? "No tienes permiso para hacer esto."
  : e?.message ?? String(e));

/** Ejecuta una acción que escribe en Firestore y avisa si falla. Devuelve true si ha ido bien. */
export async function intentar(accion) {
  try {
    await accion();
    return true;
  } catch (e) {
    console.error(e);
    alert(mensajeError(e));
    return false;
  }
}

export const botonDe = (envio) => envio.submitter ?? envio.target.querySelector("[type=submit]");

// ── Fragmentos de HTML ───────────────────────────────────────────────────────

export const orientativo = (texto = "Orientativo") => `<span class="orientativo">${f.html(texto)}</span>`;
export const enConstruccion = () => `<span class="construccion">En construcción</span>`;

/** Cuadrícula de indicadores: [{etiqueta, valor, nota, clase}]. */
export function kpis(lista, { compactos = false, dos = false } = {}) {
  return `<section class="kpis${compactos ? " compactos" : ""}${dos ? " dos" : ""}">${lista.map((k) => `
    <div class="kpi${k.clicable ? " clicable" : ""}"${k.atributos ?? ""}>
      <span class="etiqueta">${k.etiqueta}</span>
      <span class="valor ${k.clase ?? ""}">${k.valor}</span>
      ${k.nota ? `<span class="nota-kpi">${k.nota}</span>` : ""}
    </div>`).join("")}</section>`;
}

/** Grupo de botones excluyentes: opciones [{valor, texto, desactivada}]. */
export function segmentado(nombre, opciones, activo, { clase = "" } = {}) {
  return `<div class="segmentado ${clase}" role="group" data-grupo="${nombre}">${opciones.map((o) => `
    <button type="button" data-valor="${f.html(o.valor)}" class="${o.valor === activo ? `activo ${o.clase ?? ""}` : ""}"
      ${o.desactivada ? "disabled" : ""} aria-pressed="${o.valor === activo}">${o.texto}</button>`).join("")}</div>`;
}

/** Conecta un grupo segmentado: llama a `alCambiar(valor)` y marca la opción elegida. */
export function alElegir(raiz, nombre, alCambiar) {
  const grupo = $(`[data-grupo="${nombre}"]`, raiz);
  grupo?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-valor]");
    if (!b || b.disabled) return;
    $$("button", grupo).forEach((x) => {
      const elegido = x === b;
      x.classList.toggle("activo", elegido);
      x.setAttribute("aria-pressed", elegido);
    });
    alCambiar(b.dataset.valor);
  });
}

export function tabla(cabeceras, filas, { pie = "" } = {}) {
  return `<div class="tabla-envoltura"><table class="tabla">
    <thead><tr>${cabeceras.map((c) => `<th${c.izq ? ' class="izq"' : ""}>${c.texto ?? c}</th>`).join("")}</tr></thead>
    <tbody>${filas.join("")}</tbody>${pie}</table></div>`;
}

/** Barra de reparto con su leyenda: partes [{nombre, fraccion, color}]. */
export function reparto(titulo, partes) {
  return `<div class="reparto"><span class="etiqueta">${titulo}</span>
    <div class="barras">${partes.map((p) => `<span style="width:${(p.fraccion * 100).toFixed(2)}%;background:${p.color}"></span>`).join("")}</div>
    ${partes.map((p) => `<div class="fila-reparto"><span><span class="cuadro" style="background:${p.color}"></span>${f.html(p.nombre)}</span>
      <strong class="num">${f.num(p.fraccion * 100, 1)} %</strong></div>`).join("")}</div>`;
}

const COLORES_REPARTO = ["var(--fuerte)", "var(--sube)", "var(--gris-1)", "var(--gris-2)", "#6b7fae", "#a3a3a3", "#7c5c4a"];
const COLOR_EFECTIVO = "var(--gris-3)";

export function colorear(partes) {
  let i = 0;
  return partes.map((p) => ({ ...p, color: p.efectivo ? COLOR_EFECTIVO : COLORES_REPARTO[i++ % COLORES_REPARTO.length] }));
}

/** Posición de un precio entre el mínimo y el máximo de 52 semanas. */
export function rango52(precio, minimo, maximo, decimales = 2) {
  if (minimo == null || maximo == null) return "—";
  const pos = maximo > minimo && precio != null ? Math.min(100, Math.max(0, ((precio - minimo) / (maximo - minimo)) * 100)) : 50;
  return `<span class="rango"><span class="num">${f.num(minimo, decimales)}</span><span class="linea">
    <span class="marca-rango" style="left:calc(${pos.toFixed(1)}% - 1.5px)"></span></span><span class="num">${f.num(maximo, decimales)}</span></span>`;
}

// ── Ventanas ─────────────────────────────────────────────────────────────────

/** Abre un diálogo centrado o un cajón lateral. Devuelve {elemento, cerrar}. */
export function abrirVentana({ titulo, cuerpo, pie = "", lateral = false, alCerrar }) {
  const capa = document.getElementById("capa");
  const velo = document.createElement("div");
  velo.className = `velo${lateral ? " lateral" : ""}`;
  velo.innerHTML = `<section class="${lateral ? "cajon" : "dialogo"}" role="dialog" aria-modal="true" aria-label="${f.html(titulo)}">
    <header><h2>${f.html(titulo)}</h2><button class="cerrar" type="button" aria-label="Cerrar">×</button></header>
    <div class="cuerpo">${cuerpo}</div>${pie ? `<footer>${pie}</footer>` : ""}</section>`;
  const cerrar = () => {
    velo.remove();
    document.removeEventListener("keydown", tecla);
    alCerrar?.();
  };
  const tecla = (e) => { if (e.key === "Escape") cerrar(); };
  velo.addEventListener("click", (e) => { if (e.target === velo) cerrar(); });
  $(".cerrar", velo).addEventListener("click", cerrar);
  document.addEventListener("keydown", tecla);
  capa.appendChild(velo);
  $("input, textarea, select", velo)?.focus();
  return { elemento: velo, cerrar };
}

/** Descarga un texto como fichero. */
export function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Inicial para un avatar. */
export const inicial = (texto) => (String(texto ?? "?").trim()[0] ?? "?").toUpperCase();
