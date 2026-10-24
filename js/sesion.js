// Estado de la sesión compartido por todas las vistas.
import * as datos from "./datos.js";
import { normalizar } from "./miembros.js";

export const sesion = {
  usuario: null,
  estado: null, // "administrador", "aprobada", "pendiente" o "eliminada"
  preferencias: { ...datos.PREFERENCIAS_INICIALES },
  turno: 0,
};

export const administrador = () => sesion.estado === "administrador";
export const puedeUsar = () => ["administrador", "aprobada"].includes(sesion.estado);
export const correoPropio = () => normalizar(sesion.usuario?.email);
export const nombrePropio = () => (sesion.usuario?.displayName || sesion.usuario?.email || "").split(" ")[0];

/** Tema y densidad de las preferencias, aplicados a toda la página. */
export function aplicarPresentacion(prefs = sesion.preferencias) {
  document.documentElement.dataset.tema = prefs.tema ?? "automatico";
  document.documentElement.dataset.densidad = prefs.densidad ?? "comoda";
}

export async function cargarPreferencias() {
  sesion.preferencias = await datos.preferencias(sesion.usuario).catch(() => ({ ...datos.PREFERENCIAS_INICIALES }));
  aplicarPresentacion();
  return sesion.preferencias;
}

export async function cambiarPreferencias(cambios) {
  sesion.preferencias = { ...sesion.preferencias, ...cambios };
  aplicarPresentacion();
  await datos.guardarPreferencias(sesion.usuario, cambios);
}

export function enSeguimiento(simbolo) {
  return sesion.preferencias.seguimiento.includes(simbolo);
}

export async function alternarSeguimiento(simbolo) {
  const lista = enSeguimiento(simbolo) ? sesion.preferencias.seguimiento.filter((s) => s !== simbolo)
    : [...sesion.preferencias.seguimiento, simbolo];
  await cambiarPreferencias({ seguimiento: lista });
  return lista.includes(simbolo);
}
