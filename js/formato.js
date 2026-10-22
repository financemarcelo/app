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
