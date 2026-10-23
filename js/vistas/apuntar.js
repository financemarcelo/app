// Panel lateral para apuntar una idea desde cualquier página, y vínculo de carteras con cuadernos.
import * as datos from "../datos.js";
import { sesion, correoPropio } from "../sesion.js";
import { $, $$, abrirVentana, segmentado, alElegir, mensajeError } from "../ui.js";
import * as f from "../formato.js";
import { minigrafico } from "../graficos.js";

export const TIPOS_NOTA = [
  { valor: "idea", texto: "Idea", clase: "" },
  { valor: "hipotesis", texto: "Hipótesis", clase: "rojo" },
  { valor: "resultado", texto: "Resultado", clase: "lleno" },
  { valor: "pregunta", texto: "Pregunta", clase: "discontinua" },
];
const ULTIMO_CUADERNO = "carteras.ultimo-cuaderno";

/**
 * Da lectura de las carteras propias a los miembros de los cuadernos en que están vinculadas
 * (campo `lectores`). Los cuadernos que la cuenta ya no puede leer dejan de contar.
 */
export async function sincronizarLectores(listaCuadernos) {
  const propias = (await datos.carteras(sesion.usuario)).filter((c) => c.propietario === sesion.usuario.uid);
  for (const c of propias) {
    const deseados = new Set();
    for (const q of listaCuadernos) if ((q.carteras ?? []).includes(c.ruta)) q.miembros.forEach((m) => deseados.add(m));
    c.miembros.forEach((m) => deseados.delete(m));
    const lista = [...deseados].sort();
    if (lista.join() !== [...c.lectores].sort().join()) await datos.cambiarLectores(c, lista);
  }
}

/** Guarda una nota y, si vincula carteras propias, da lectura de ellas a los miembros del cuaderno. */
export async function guardarNota(cuaderno, nota) {
  await datos.crearNota(cuaderno.id, sesion.usuario, nota);
  const rutas = (nota.carteras ?? []).map((c) => c.ruta).filter((r) => r.startsWith(`usuarios/${sesion.usuario.uid}/`));
  if (rutas.length) {
    for (const ruta of rutas) await datos.vincularCarteraEnCuaderno(cuaderno.id, ruta);
    await sincronizarLectores(await datos.cuadernos(sesion.usuario));
  }
}

/**
 * Abre el panel «Apuntar».
 * @param {object} contexto  {simbolo, cartera, grafico: true si se puede adjuntar el gráfico del valor}
 */
export async function abrirApuntar({ simbolo = null, cartera = null, grafico = false } = {}) {
  const { elemento, cerrar } = abrirVentana({ titulo: "Apuntar", lateral: true, cuerpo: `<p class="cargando">Cargando…</p>` });
  const cuerpo = $(".cuerpo", elemento);
  const yo = correoPropio();
  const [todos, valores] = await Promise.all([datos.cuadernos(sesion.usuario), datos.listaValores()]);
  const editables = todos.filter((q) => q.editores.includes(yo));
  if (!editables.length) {
    cuerpo.innerHTML = `<p style="margin:0">Las notas se guardan en un cuaderno. Todavía no tienes ninguno en el que puedas escribir.</p>
      <form class="pila" id="primer-cuaderno"><label class="campo"><span>Nombre del cuaderno</span>
        <input type="text" id="titulo-cuaderno" required maxlength="80" value="Ideas sueltas"></label>
        <div><button class="boton negro" type="submit">Crear cuaderno</button></div></form>`;
    $("#primer-cuaderno", cuerpo).addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await datos.crearCuaderno(sesion.usuario, { titulo: $("#titulo-cuaderno", cuerpo).value.trim(), descripcion: "" });
        cerrar();
        abrirApuntar({ simbolo, cartera, grafico });
      } catch (err) { alert(mensajeError(err)); }
    });
    return;
  }
  let ultimo = null;
  try { ultimo = localStorage.getItem(ULTIMO_CUADERNO); } catch { /* sin almacenamiento local */ }
  const vinculos = { valores: simbolo ? [simbolo] : [], carteras: cartera && cartera.propietario === sesion.usuario.uid
    ? [{ ruta: cartera.ruta, nombre: cartera.nombre }] : [] };
  let tipo = "idea";
  cuerpo.innerHTML = `
    <label class="campo"><span class="etiqueta">Cuaderno</span><select id="cuaderno-nota">${editables.map((q) => `<option value="${q.id}" ${q.id === ultimo ? "selected" : ""}>
      ${f.html(q.titulo)} · ${q.miembros.length === 1 ? "solo tú" : `${q.miembros.length} personas`}</option>`).join("")}</select></label>
    ${segmentado("tipo-nota", TIPOS_NOTA.map((t) => ({ ...t, clase: t.valor === "hipotesis" ? "rojo" : "" })), "idea", { clase: "lleno" })}
    <textarea id="texto-nota" maxlength="5000" placeholder="Apunta una idea, una hipótesis o un resultado…" style="border-width:2px"></textarea>
    <div class="pila" style="gap:8px"><span class="etiqueta">Vinculado</span><div class="chips" id="vinculos"></div>
      ${simbolo || cartera ? `<span class="aviso">Lo que estás viendo se vincula solo.</span>` : ""}</div>
    ${grafico && simbolo ? `<label class="opcion elegida"><input type="checkbox" id="adjuntar" checked>
      <span class="pila" style="gap:0;flex:1"><strong>Adjuntar el gráfico de ${f.html(simbolo)}</strong><span class="suave" style="font-size:12px">último año · precio</span></span>
      <span id="mini-apuntar"></span></label>` : ""}
    <div class="pila" id="anteriores" style="gap:8px;border-top:1px solid var(--linea-suave);padding-top:14px"></div>
    <p class="error" id="error-nota" hidden></p>`;
  const pie = document.createElement("footer");
  pie.innerHTML = `<button class="boton linea" type="button" id="cancelar-nota">Cancelar</button><button class="boton" type="button" id="guardar-nota">Guardar nota</button>`;
  $(".cajon", elemento).appendChild(pie);

  const pintarVinculos = () => {
    $("#vinculos", cuerpo).innerHTML = [
      ...vinculos.valores.map((s) => `<span class="chip activo">${f.html(s)} <button class="enlace" data-quitar-valor="${f.html(s)}" type="button" aria-label="Quitar">×</button></span>`),
      ...vinculos.carteras.map((c) => `<span class="chip activo">Cartera · ${f.html(c.nombre)} <button class="enlace" data-quitar-cartera="${f.html(c.ruta)}" type="button" aria-label="Quitar">×</button></span>`),
      `<select id="mas-valor" style="width:auto;padding:4px 8px;border-width:1.5px;border-color:var(--linea)"><option value="">+ Valor</option>
        ${valores.map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)} · ${f.html(v.nombre)}</option>`).join("")}</select>`,
    ].join("");
    $("#mas-valor", cuerpo).addEventListener("change", (e) => {
      if (e.target.value && !vinculos.valores.includes(e.target.value) && vinculos.valores.length < 20) vinculos.valores.push(e.target.value);
      pintarVinculos();
    });
    $$("[data-quitar-valor]", cuerpo).forEach((b) => b.addEventListener("click", () => {
      vinculos.valores = vinculos.valores.filter((s) => s !== b.dataset.quitarValor); pintarVinculos();
    }));
    $$("[data-quitar-cartera]", cuerpo).forEach((b) => b.addEventListener("click", () => {
      vinculos.carteras = vinculos.carteras.filter((c) => c.ruta !== b.dataset.quitarCartera); pintarVinculos();
    }));
  };
  pintarVinculos();
  alElegir(cuerpo, "tipo-nota", (v) => { tipo = v; });
  $("#cancelar-nota", elemento).addEventListener("click", cerrar);

  if (grafico && simbolo) {
    const anio = new Date().getUTCFullYear();
    datos.sesiones(simbolo, anio - 1, anio).then((s) => {
      if ($("#mini-apuntar", cuerpo)) $("#mini-apuntar", cuerpo).innerHTML = minigrafico(s.cierres.slice(-250), 80, 32);
    });
  }
  if (simbolo) {
    datos.notasSobreValor(todos, simbolo).then((lista) => {
      $("#anteriores", cuerpo).innerHTML = lista.length ? `<span class="etiqueta">Notas anteriores sobre ${f.html(simbolo)}</span>
        ${lista.slice(0, 4).map((n) => `<a class="pila" href="#/cuaderno/${n.cuaderno.id}" style="gap:2px;font-size:13px;border-left:2px solid var(--linea);padding-left:10px;text-decoration:none">
          <span class="suave">${f.html(n.autor?.nombre || n.autor?.correo)} · ${f.html(n.cuaderno.titulo)} · ${f.fechaCorta(n.creada?.toDate?.().toISOString().slice(0, 10))}</span>
          <span>${f.html(n.texto.length > 140 ? `${n.texto.slice(0, 140)}…` : n.texto)}</span></a>`).join("")}` : "";
    }).catch(() => {});
  }

  $("#guardar-nota", elemento).addEventListener("click", async (e) => {
    const texto = $("#texto-nota", cuerpo).value.trim();
    const error = $("#error-nota", cuerpo);
    if (!texto) { error.textContent = "Escribe la nota antes de guardarla."; error.hidden = false; return; }
    const q = editables.find((x) => x.id === $("#cuaderno-nota", cuerpo).value);
    e.target.disabled = true;
    try {
      await guardarNota(q, { tipo, texto, valores: vinculos.valores, carteras: vinculos.carteras,
                             grafico: grafico && simbolo && $("#adjuntar", cuerpo)?.checked ? { simbolo, anios: 1 } : null });
      try { localStorage.setItem(ULTIMO_CUADERNO, q.id); } catch { /* sin almacenamiento local */ }
      cuerpo.innerHTML = `<p style="margin:0"><strong>Nota guardada</strong> en «${f.html(q.titulo)}».</p>
        <div class="fila"><a class="boton negro" href="#/cuaderno/${q.id}" id="ir-cuaderno">Abrir el cuaderno</a></div>`;
      pie.remove();
      $("#ir-cuaderno", cuerpo).addEventListener("click", cerrar);
      if (location.hash.startsWith(`#/cuaderno/${q.id}`)) window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
      e.target.disabled = false;
    }
  });
}
