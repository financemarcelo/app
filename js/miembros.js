// Miembros de una cartera compartida: correos y aviso por correo electrónico.

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
export const MAX_MIEMBROS = 20;

export const normalizar = (correo) => String(correo ?? "").trim().toLowerCase();
export const valido = (correo) => CORREO.test(normalizar(correo));

/** Lista de miembros con un correo más. Lanza un error con el motivo si no se puede añadir. */
export function anadir(miembros, correo) {
  const c = normalizar(correo);
  if (!valido(c)) throw new Error("Escribe un correo válido.");
  if (miembros.includes(c)) throw new Error("Ese correo ya es miembro de la cartera.");
  if (miembros.length >= MAX_MIEMBROS) throw new Error(`Una cartera admite hasta ${MAX_MIEMBROS} miembros.`);
  return [...miembros, c];
}

export function quitar(miembros, correo) {
  const c = normalizar(correo);
  return miembros.filter((m) => m !== c);
}

/** Enlace que abre el programa de correo con el aviso ya escrito. La aplicación no envía correos. */
export function enlaceAviso({ correos, cartera, url }) {
  const asunto = `Te he añadido a la cartera «${cartera}»`;
  const cuerpo = `Te he añadido como miembro de la cartera «${cartera}» en Carteras.\n\n`
    + `Entra con la cuenta de Google de este correo:\n${url}\n`;
  return `mailto:${correos.map(normalizar).join(",")}?subject=${encodeURIComponent(asunto)}`
    + `&body=${encodeURIComponent(cuerpo)}`;
}
