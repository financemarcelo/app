// Administración: aprobar, rechazar y eliminar cuentas.
import * as datos from "../datos.js";
import { sesion, administrador } from "../sesion.js";
import { $$, pintar, kpis, tabla, intentar } from "../ui.js";
import * as f from "../formato.js";

const iso = (marca) => marca?.toDate?.()?.toISOString();

export async function vista({ actual }) {
  if (!administrador()) return pintar(actual, `<h1>Administración</h1><p class="error">Solo para administradores.</p>`);
  const [cuentas, aprobadas, pedidas] = await Promise.all([datos.perfiles(), datos.aprobaciones(), datos.bajas()]);
  cuentas.sort((a, b) => (iso(a.alta) ?? "").localeCompare(iso(b.alta) ?? ""));
  const pendientes = cuentas.filter((u) => u.uid !== sesion.usuario.uid && !aprobadas[u.uid] && !pedidas[u.uid]);
  const activas = cuentas.filter((u) => !pendientes.includes(u));
  const eliminadas = Object.values(pedidas).filter((b) => b.procesada);
  const fila = (u, acciones) => `<tr><td class="izq"><strong>${f.html(u.nombre || "—")}</strong></td><td class="izq">${f.html(u.correo)}</td>
    <td>${f.fechaHora(iso(u.alta))}</td><td>${f.fechaHora(iso(u.ultimo_acceso))}</td><td>${acciones}</td></tr>`;
  const boton = (accion, clase, texto, u) =>
    `<button class="boton ${clase} pequeno" data-${accion}="${f.html(u.uid)}" data-correo="${f.html(u.correo)}" type="button">${texto}</button>`;
  const cabeceras = [{ texto: "Nombre", izq: true }, { texto: "Correo", izq: true }, "Alta", "Último acceso", ""];

  if (!pintar(actual, `
    <div><h1>Administración</h1><p class="subtitulo">Cuentas de Google que han entrado en la aplicación.</p></div>
    ${kpis([
      { etiqueta: "Pendientes", valor: `${pendientes.length}`, clase: pendientes.length ? "sube" : "" },
      { etiqueta: "Con acceso", valor: `${activas.length}` },
      { etiqueta: "Eliminadas", valor: `${eliminadas.length}` },
    ])}
    <section class="pila"><h2>Pendientes de aprobación</h2>
      ${pendientes.length ? tabla(cabeceras, pendientes.map((u) => fila(u, `<span class="fila" style="justify-content:flex-end">
          ${boton("aprobar", "negro", "Aprobar", u)}${boton("baja", "peligro", "Rechazar", u)}</span>`)))
        : `<p class="vacio">No hay cuentas pendientes.</p>`}</section>
    <section class="pila"><h2>Cuentas con acceso</h2>
      ${tabla(cabeceras, activas.map((u) => fila(u, u.uid === sesion.usuario.uid ? "Tú"
        : pedidas[u.uid] ? '<span class="suave">Eliminación pendiente</span>' : boton("baja", "peligro", "Eliminar", u))))}
      <p class="aviso">Rechazar o eliminar una cuenta le retira el acceso en ese momento. En la siguiente actualización de
        cotizaciones (cada 15 minutos en días laborables) se desactiva su acceso con Google y se borran su perfil, sus
        preferencias, sus carteras, sus operaciones y sus cuadernos. No se puede deshacer.</p></section>
    ${eliminadas.length ? `<section class="pila"><h2>Cuentas eliminadas</h2>
      ${tabla([{ texto: "Correo", izq: true }, "Eliminada"], eliminadas.map((b) => `<tr><td class="izq">${f.html(b.correo)}</td><td>${f.fechaHora(iso(b.procesada))}</td></tr>`))}</section>` : ""}`)) return;

  const recargar = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
  $$("[data-aprobar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    if (await intentar(() => datos.aprobar(b.dataset.aprobar, b.dataset.correo))) recargar();
    b.disabled = false;
  }));
  $$("[data-baja]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la cuenta ${b.dataset.correo}? Se borrarán sus datos y no podrá volver a entrar.`)) return;
    b.disabled = true;
    if (await intentar(() => datos.pedirBaja(b.dataset.baja, b.dataset.correo))) recargar();
    b.disabled = false;
  }));
}
