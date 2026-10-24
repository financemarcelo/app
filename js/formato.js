// Formato de números, importes y fechas en español.

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const numeros = new Map();

export function eur(n) {
  return n == null || Number.isNaN(n) ? "—" : euros.format(n);
}

export function num(n, decimales = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  if (!numeros.has(decimales)) {
    numeros.set(decimales, new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
  }
  return numeros.get(decimales).format(n);
}

export function titulos(n) {
  return Number.isInteger(n) ? num(n, 0) : num(n, 4);
}

export function precio(n, divisa) {
  return n == null ? "—" : `${num(n, 2)} ${divisa === "USD" ? "$" : "€"}`;
}

export function pct(fraccion) {
  if (fraccion == null || Number.isNaN(fraccion)) return "—";
  const signo = fraccion > 0 ? "+" : "";
  return `${signo}${num(fraccion * 100, 2)} %`;
}

export function claseSigno(n) {
  return n > 0 ? "sube" : n < 0 ? "baja" : "";
}

export function fecha(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function fechaHora(isoUtc) {
  if (!isoUtc) return "—";
  return new Date(isoUtc).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit",
                                                    minute: "2-digit" });
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del navegador. */
export function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Escapa texto para insertarlo en HTML. */
export function html(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                                                           '"': "&quot;", "'": "&#39;" })[c]);
}

/** Número con signo (+/−) y los decimales indicados. */
export function conSigno(n, decimales = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), decimales)}`;
}

/** Porcentaje con signo tipográfico (−) y una precisión dada. */
export function pctSigno(fraccion, decimales = 2) {
  return fraccion == null || Number.isNaN(fraccion) ? "—" : `${conSigno(fraccion * 100, decimales)} %`;
}

/** Euros sin decimales con signo, para variaciones (+1.218 €). */
export function eurSigno(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), 0)} €`;
}

const simbolo = (divisa) => (divisa === "USD" ? "$" : "€");

/** Importe en euros o dólares: 1.234,56 € o 1.234,56 $. */
export function dinero(n, divisa = "EUR", decimales = 2) {
  return n == null || Number.isNaN(n) ? "—" : `${num(n, decimales)} ${simbolo(divisa)}`;
}

/** Importe con signo y sin decimales: +1.234 € o −56 $. */
export function dineroSigno(n, divisa = "EUR") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), 0)} ${simbolo(divisa)}`;
}

/** Euros sin decimales (231.904 €). */
export function eurEntero(n) {
  return n == null || Number.isNaN(n) ? "—" : `${num(n, 0)} €`;
}

/** Cantidades grandes abreviadas: 9,4 mill. */
/** Número con su nombre en singular o plural: «1 cobro», «3 cobros». */
export function cantidad(n, singular, plural = `${singular}s`) {
  return `${num(n, 0)} ${n === 1 ? singular : plural}`;
}

export function abreviado(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${num(n / 1e9, 1)} mil mill.`;
  if (Math.abs(n) >= 1e6) return `${num(n / 1e6, 1)} mill.`;
  if (Math.abs(n) >= 1e3) return `${num(n / 1e3, 1)} mil`;
  return num(n, 0);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const nombreMes = (i) => MESES[i];

/** Fecha corta (23/10) para listas del año en curso. */
export function fechaCorta(iso) {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Fecha larga: «jueves, 23 de octubre». */
export function fechaLarga(fecha = new Date()) {
  return fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}
