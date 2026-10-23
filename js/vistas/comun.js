// Textos y enlaces que comparten varias vistas.
import { sesion } from "../sesion.js";
import * as f from "../formato.js";
import { variacion } from "../calculos.js";

export const enlaceCartera = (c) => `#/cartera/${encodeURIComponent(c.propietario)}/${encodeURIComponent(c.id)}`;
export const enlaceValor = (simbolo) => `#/valor/${encodeURIComponent(simbolo)}`;
export const enlaceOperar = (c, simbolo) =>
  `#/operar${c ? `/${encodeURIComponent(c.propietario)}/${encodeURIComponent(c.id)}` : ""}${simbolo ? `?valor=${encodeURIComponent(simbolo)}` : ""}`;

/** Con quién se comparte una cartera, desde el punto de vista de la cuenta. */
export function etiquetaCompartida(c) {
  if (c.propietario !== sesion.usuario.uid) return "compartida contigo";
  return c.miembros.length > 1 ? `compartida con ${c.miembros.length - 1} ${c.miembros.length === 2 ? "persona" : "personas"}` : "";
}

/** Quién registró una operación. Las anteriores a las carteras compartidas son del propietario. */
export function autorOperacion(o, c) {
  const uid = o.autor?.uid ?? c.propietario;
  if (uid === sesion.usuario.uid) return "Tú";
  return o.autor?.nombre || o.autor?.correo || "Propietario";
}

const TIPOS = { compra: "Compra", venta: "Venta", dividendo: "Dividendo", desdoblamiento: "Desdoblamiento",
                ajuste: "Ajuste", aportacion: "Aportación" };

/** Tipo y descripción breve de un movimiento (operación o evento). */
export function describirMovimiento(m) {
  const tipo = TIPOS[m.tipo] ?? m.tipo;
  if (m.tipo === "compra" || m.tipo === "venta") {
    return { tipo, texto: `${f.titulos(m.titulos)} ${m.simbolo} × ${f.precio(m.precio, m.divisa)}` };
  }
  if (m.tipo === "dividendo") {
    return { tipo, texto: `${m.simbolo} · ${f.titulos(m.titulos)} títulos × ${f.num(m.porTitulo, 4)} ${m.divisa === "USD" ? "$" : "€"}` };
  }
  return { tipo, texto: `${m.simbolo} · ${m.detalle}` };
}

/** Variación del día de una cotización según la preferencia (porcentaje o importe). */
export function textoVariacion(cot, decimales = 2) {
  const v = variacion(cot);
  if (v == null) return "—";
  return sesion.preferencias.variaciones === "importe" ? f.conSigno(cot.precio - cot.cierre_anterior, decimales)
    : f.pctSigno(v);
}
