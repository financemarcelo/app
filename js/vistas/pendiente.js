// Aviso para cuentas pendientes de aprobación o eliminadas.
import * as datos from "../datos.js";
import { sesion } from "../sesion.js";
import { pintar, $ } from "../ui.js";
import * as f from "../formato.js";

export function vista({ actual, alCambiarEstado }) {
  const eliminada = sesion.estado === "eliminada";
  if (!pintar(actual, `<section class="panel fuerte acceso">
    <span class="etiqueta">${eliminada ? "Cuenta eliminada" : "Cuenta registrada"}</span>
    <h1 style="font-size:32px">${eliminada ? "Cuenta eliminada" : "Pendiente de aprobación"}</h1>
    <p style="margin:0">${eliminada ? `El administrador ha eliminado la cuenta <strong>${f.html(sesion.usuario.email)}</strong>.`
      : `La cuenta <strong>${f.html(sesion.usuario.email)}</strong> está registrada, pero el administrador todavía no la ha aprobado.`}</p>
    ${eliminada ? "" : `<p class="aviso">Cuando la apruebe, pulsa «Comprobar de nuevo».</p>
      <div class="fila"><button class="boton" id="comprobar" type="button">Comprobar de nuevo</button></div>`}
  </section>`)) return;
  $("#comprobar")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    await alCambiarEstado(await datos.estadoCuenta(sesion.usuario));
  });
}
