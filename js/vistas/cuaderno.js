// Cuaderno de notas compartido: cuadernos, notas con vínculos, comentarios y personas.
import * as datos from "../datos.js";
import * as miembros from "../miembros.js";
import { sesion, correoPropio } from "../sesion.js";
import { $, $$, pintar, abrirVentana, segmentado, alElegir, intentar, mensajeError, inicial, vigente } from "../ui.js";
import * as f from "../formato.js";
import { dibujarLinea } from "../graficos.js";
import { URL_APLICACION } from "../config.js";
import { enlaceValor } from "./comun.js";
import { TIPOS_NOTA, guardarNota, sincronizarLectores } from "./apuntar.js";

const filtroNotas = { tipo: "", texto: "" };
const fechaDe = (marca) => marca?.toDate?.()?.toISOString();
const enlaceRuta = (ruta) => {
  const [, propietario, , id] = ruta.split("/");
  return `#/cartera/${encodeURIComponent(propietario)}/${encodeURIComponent(id)}`;
};

function colorAvatar(uid) {
  if (uid === sesion.usuario.uid) return "";
  return [...uid].reduce((s, c) => s + c.charCodeAt(0), 0) % 2 ? "azul" : "gris";
}

export async function vista({ actual, partes }) {
  const lista = await datos.cuadernos(sesion.usuario);
  sincronizarLectores(lista).catch((e) => console.warn("Lectores sin actualizar:", e));
  if (!lista.length) {
    if (!pintar(actual, `<div><h1>Cuaderno</h1><p class="subtitulo">Ideas, hipótesis y resultados, solo para ti o compartidos por correo.</p></div>
      <div class="panel fuerte" style="max-width:640px"><p style="margin:0">Todavía no tienes ningún cuaderno.</p>
        <div><button class="boton" id="nuevo" type="button">Crear un cuaderno</button></div></div>`)) return;
    $("#nuevo").addEventListener("click", () => dialogoNuevo());
    return;
  }
  const id = decodeURIComponent(partes[0] ?? "") || lista[0].id;
  const q = lista.find((x) => x.id === id);
  if (!q) return pintar(actual, `<p class="error">El cuaderno no existe o no eres miembro.</p><p><a href="#/cuaderno">← Mis cuadernos</a></p>`);
  const yo = correoPropio();
  const esPropietario = q.propietario === sesion.usuario.uid;
  const esEditor = q.editores.includes(yo);
  const [todas, valores, propias] = await Promise.all([datos.notas(q.id), datos.listaValores(),
    datos.carteras(sesion.usuario).then((l) => l.filter((c) => c.propietario === sesion.usuario.uid))]);
  const nombres = Object.fromEntries(valores.map((v) => [v.simbolo, v.nombre]));
  const cuenta = (tipo) => todas.filter((n) => !tipo || n.tipo === tipo).length;
  const vinculadosValores = Object.entries(todas.flatMap((n) => n.valores ?? []).reduce((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]);
  const vinculadasCarteras = Object.values(todas.flatMap((n) => n.carteras ?? []).reduce((a, c) => ({ ...a, [c.ruta]: { ...c, n: (a[c.ruta]?.n ?? 0) + 1 } }), {}));

  if (!pintar(actual, `
    <div class="columnas">
      <nav style="flex:1 1 220px;min-width:0" class="pila" aria-label="Mis cuadernos">
        <div class="fila entre" style="align-items:baseline"><h3 class="titulo-seccion">Cuadernos</h3>
          <button class="enlace" id="nuevo" type="button" style="font-size:13px">+ Nuevo</button></div>
        <div class="navegacion-lateral">${lista.map((x) => `<a href="#/cuaderno/${x.id}" class="${x.id === q.id ? "activo" : ""}">
          <strong>${f.html(x.titulo)}</strong><span class="suave" style="font-size:12px">${x.miembros.length === 1 ? "Solo tú" : `${x.miembros.length} personas`}${x.editores.includes(yo) ? "" : " · solo lectura"}</span></a>`).join("")}</div>
      </nav>

      <div class="principal" style="flex:999 1 560px;gap:18px">
        <div class="encabezado">
          <div class="pila" style="gap:6px;flex:1 1 320px"><h1 style="font-size:clamp(28px,4.5vw,40px)">${f.html(q.titulo)}</h1>
            ${q.descripcion ? `<p class="subtitulo" style="margin:0">${f.html(q.descripcion)}</p>` : ""}</div>
          <div class="fila"><span class="fila" style="gap:0">${q.miembros.slice(0, 5).map((m) => `<span class="avatar mediano ${m === yo ? "" : "gris"}" title="${f.html(m)}" style="margin-left:-6px;border:2px solid var(--fondo)">${inicial(m)}</span>`).join("")}</span>
            ${esPropietario ? `<button class="boton linea" id="compartir" type="button">Compartir</button><button class="boton linea" id="editar-cuaderno" type="button">Editar</button>`
              : `<button class="boton peligro" id="salir-cuaderno" type="button">Salir</button>`}</div>
        </div>

        ${esEditor ? `<section class="redactor" aria-label="Nueva nota">
          <textarea id="texto" maxlength="5000" placeholder="Apunta una idea, una hipótesis o un resultado…"></textarea>
          <div class="chips" id="vinculos-nueva" style="padding:0 18px 10px"></div>
          <div class="herramientas"><div class="fila">
            ${segmentado("tipo", TIPOS_NOTA.map((t) => ({ valor: t.valor, texto: t.texto })), "idea")}
            <select id="mas-valor" style="width:auto;padding:5px 8px;border-color:var(--linea)"><option value="">+ Valor</option>
              ${valores.map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)} · ${f.html(v.nombre)}</option>`).join("")}</select>
            ${propias.length ? `<select id="mas-cartera" style="width:auto;padding:5px 8px;border-color:var(--linea)"><option value="">+ Cartera</option>
              ${propias.map((c) => `<option value="${f.html(c.ruta)}">${f.html(c.nombre)}</option>`).join("")}</select>` : ""}
            <select id="mas-grafico" style="width:auto;padding:5px 8px;border-color:var(--linea)"><option value="">+ Gráfico</option>
              ${valores.map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)}</option>`).join("")}</select></div>
            <button class="boton" id="guardar" type="button">Guardar</button></div>
          <p class="error" id="error-nota" hidden style="padding:0 18px 12px"></p>
        </section>` : `<p class="recuadro">Tienes este cuaderno en <strong>solo lectura</strong>: puedes leer las notas, pero no escribir.</p>`}

        <div class="fila entre">
          <div class="chips">${[["", "Todas"], ...TIPOS_NOTA.map((t) => [t.valor, t.texto])].map(([v, t]) =>
            `<button class="chip${v === filtroNotas.tipo ? " activo" : ""}" data-filtro="${v}" type="button">${t} · ${cuenta(v)}</button>`).join("")}</div>
          <input type="search" id="buscar-nota" placeholder="Buscar en el cuaderno" value="${f.html(filtroNotas.texto)}" style="width:auto;min-width:200px;border-color:var(--linea);padding:7px 12px">
        </div>
        <div class="pila" id="notas" style="gap:14px"></div>
      </div>

      <aside class="lateral" style="flex:1 1 260px">
        <section class="panel"><h3 class="titulo-seccion">Personas</h3>
          ${q.miembros.map((m) => `<div class="fila" style="gap:10px;flex-wrap:nowrap"><span class="avatar mediano ${m === yo ? "" : "gris"}">${inicial(m)}</span>
            <span class="pila" style="gap:0;min-width:0;font-size:13px"><strong style="overflow-wrap:anywhere">${f.html(m)}${m === yo ? " (tú)" : ""}</strong>
            <span class="suave">${q.editores.includes(m) ? (m === q.miembros[0] && esPropietario && m === yo ? "Propietario" : "Puede editar") : "Solo lectura"}</span></span></div>`).join("")}
          ${esPropietario ? `<button class="enlace" id="invitar" type="button" style="font-size:13px;text-align:left">+ Invitar por correo</button>` : ""}
        </section>
        <section class="panel"><h3 class="titulo-seccion">Vinculado</h3>
          ${vinculadosValores.length || vinculadasCarteras.length ? [
            ...vinculadosValores.slice(0, 8).map(([s, n]) => `<a class="renglon" href="${enlaceValor(s)}" style="text-decoration:none"><strong>${f.html(s)}</strong><span class="suave">${n} ${n === 1 ? "nota" : "notas"}</span></a>`),
            ...vinculadasCarteras.map((c) => `<a class="renglon" href="${enlaceRuta(c.ruta)}" style="text-decoration:none"><strong>Cartera · ${f.html(c.nombre)}</strong><span class="suave">${c.n} ${c.n === 1 ? "nota" : "notas"}</span></a>`),
          ].join("") : `<p class="vacio">Nada vinculado todavía.</p>`}
          ${vinculadasCarteras.length ? `<span class="aviso">Los miembros del cuaderno ven las carteras vinculadas en solo lectura.</span>` : ""}
        </section>
        <section class="panel negro"><h3 class="titulo-seccion">Actividad</h3>
          ${todas.slice(0, 5).map((n) => `<span style="font-size:13px">${f.html(n.autor?.uid === sesion.usuario.uid ? "Tú" : n.autor?.nombre || n.autor?.correo)} añadió ${articulo(n.tipo)} · ${f.fechaCorta(fechaDe(n.creada)?.slice(0, 10))}</span>`).join("") || `<span class="suave">Sin actividad.</span>`}
        </section>
      </aside>
    </div>`)) return;

  // ── Notas ──
  const pintarNotas = () => {
    const texto = filtroNotas.texto.toLowerCase();
    const visibles = todas.filter((n) => (!filtroNotas.tipo || n.tipo === filtroNotas.tipo) && (!texto || n.texto.toLowerCase().includes(texto)));
    $("#notas").innerHTML = visibles.length ? visibles.map((n) => notaHtml(n, { esEditor, esPropietario, nombres })).join("")
      : `<p class="vacio">${todas.length ? "Ninguna nota coincide." : "El cuaderno está vacío. Apunta la primera idea."}</p>`;
    visibles.filter((n) => n.grafico?.simbolo).forEach((n) => dibujarGraficoNota(actual, n));
  };
  pintarNotas();
  $$("[data-filtro]").forEach((b) => b.addEventListener("click", () => {
    filtroNotas.tipo = b.dataset.filtro;
    $$("[data-filtro]").forEach((x) => x.classList.toggle("activo", x === b));
    pintarNotas();
  }));
  $("#buscar-nota").addEventListener("input", (e) => { filtroNotas.texto = e.target.value; pintarNotas(); });

  const recargar = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
  $("#notas").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const n = todas.find((x) => x.id === b.dataset.nota);
    const accion = b.dataset.accion;
    if (accion === "estado") {
      if (await intentar(() => datos.cambiarEstadoNota(q.id, n.id, n.estado === "comprobada" ? "pendiente" : "comprobada"))) recargar();
    } else if (accion === "borrar") {
      if (confirm("¿Borrar esta nota y sus comentarios?") && await intentar(() => datos.borrarNota(q.id, n.id))) recargar();
    } else if (accion === "editar") {
      const nuevo = prompt("Corrige la nota:", n.texto);
      if (nuevo != null && nuevo.trim() && await intentar(() => datos.editarNota(q.id, n.id, nuevo.trim().slice(0, 5000)))) recargar();
    } else if (accion === "comentarios") {
      await mostrarComentarios(q, n, esEditor, esPropietario);
    }
  });

  // ── Nueva nota ──
  if (esEditor) {
    let tipo = "idea";
    const vinculos = { valores: [], carteras: [], grafico: null };
    const pintarVinculos = () => {
      $("#vinculos-nueva").innerHTML = [
        ...vinculos.valores.map((s) => `<span class="chip vinculo">${f.html(s)} <button class="enlace" data-quitar="valor:${f.html(s)}" type="button">×</button></span>`),
        ...vinculos.carteras.map((c) => `<span class="chip vinculo">Cartera · ${f.html(c.nombre)} <button class="enlace" data-quitar="cartera:${f.html(c.ruta)}" type="button">×</button></span>`),
        ...(vinculos.grafico ? [`<span class="chip vinculo">Gráfico · ${f.html(vinculos.grafico.simbolo)} <button class="enlace" data-quitar="grafico:" type="button">×</button></span>`] : []),
      ].join("");
    };
    alElegir(document, "tipo", (v) => { tipo = v; });
    $("#mas-valor").addEventListener("change", (e) => {
      if (e.target.value && !vinculos.valores.includes(e.target.value)) vinculos.valores.push(e.target.value);
      e.target.value = "";
      pintarVinculos();
    });
    $("#mas-cartera")?.addEventListener("change", (e) => {
      const c = propias.find((x) => x.ruta === e.target.value);
      if (c && !vinculos.carteras.some((x) => x.ruta === c.ruta)) vinculos.carteras.push({ ruta: c.ruta, nombre: c.nombre });
      e.target.value = "";
      pintarVinculos();
    });
    $("#mas-grafico").addEventListener("change", (e) => {
      if (e.target.value) {
        vinculos.grafico = { simbolo: e.target.value, anios: 1 };
        if (!vinculos.valores.includes(e.target.value)) vinculos.valores.push(e.target.value);
      }
      e.target.value = "";
      pintarVinculos();
    });
    $("#vinculos-nueva").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quitar]");
      if (!b) return;
      const [clase, valor] = b.dataset.quitar.split(/:(.*)/);
      if (clase === "valor") vinculos.valores = vinculos.valores.filter((s) => s !== valor);
      if (clase === "cartera") vinculos.carteras = vinculos.carteras.filter((c) => c.ruta !== valor);
      if (clase === "grafico") vinculos.grafico = null;
      pintarVinculos();
    });
    $("#guardar").addEventListener("click", async (e) => {
      const texto = $("#texto").value.trim();
      const error = $("#error-nota");
      if (!texto) { error.textContent = "Escribe la nota antes de guardarla."; error.hidden = false; return; }
      e.target.disabled = true;
      try {
        await guardarNota(q, { tipo, texto, valores: vinculos.valores, carteras: vinculos.carteras, grafico: vinculos.grafico });
        recargar();
      } catch (err) {
        error.textContent = mensajeError(err);
        error.hidden = false;
        e.target.disabled = false;
      }
    });
  }

  $("#nuevo").addEventListener("click", () => dialogoNuevo());
  $("#compartir")?.addEventListener("click", () => dialogoCompartir(q));
  $("#invitar")?.addEventListener("click", () => dialogoCompartir(q));
  $("#editar-cuaderno")?.addEventListener("click", () => dialogoEditar(q));
  $("#salir-cuaderno")?.addEventListener("click", async () => {
    if (!confirm(`¿Salir del cuaderno «${q.titulo}»? Tus notas se conservan.`)) return;
    if (await intentar(() => datos.salirDeCuaderno(q.id, sesion.usuario))) {
      await sincronizarLectores(await datos.cuadernos(sesion.usuario)).catch(() => {});
      location.hash = "#/cuaderno";
    }
  });
}

function articulo(tipo) {
  return { idea: "una idea", hipotesis: "una hipótesis", resultado: "un resultado", pregunta: "una pregunta" }[tipo] ?? "una nota";
}

function notaHtml(n, { esEditor, esPropietario, nombres }) {
  const tipo = TIPOS_NOTA.find((t) => t.valor === n.tipo) ?? TIPOS_NOTA[0];
  const mia = n.autor?.uid === sesion.usuario.uid;
  return `<article class="nota">
    <span class="avatar ${colorAvatar(n.autor?.uid ?? "")}">${inicial(n.autor?.nombre || n.autor?.correo)}</span>
    <div class="pila" style="gap:10px;min-width:0">
      <div class="fila" style="gap:8px;font-size:13px"><strong style="font-size:14px">${f.html(mia ? "Tú" : n.autor?.nombre || n.autor?.correo)}</strong>
        <span class="suave">${f.fechaHora(fechaDe(n.creada))}${n.editada ? " · editada" : ""}</span>
        <span class="etiqueta-tipo ${tipo.clase}">${tipo.texto}</span></div>
      <p class="texto">${f.html(n.texto)}</p>
      ${n.grafico?.simbolo ? `<figure style="margin:0;border:1.5px solid var(--linea-suave);padding:12px" class="pila">
        <div class="grafico bajo"><canvas data-grafico="${n.id}"></canvas></div>
        <figcaption class="aviso">Cierres diarios de ${f.html(n.grafico.simbolo)} · último año</figcaption></figure>` : ""}
      ${(n.valores?.length || n.carteras?.length) ? `<div class="chips">
        ${(n.valores ?? []).map((s) => `<a class="chip vinculo" href="${enlaceValor(s)}" title="${f.html(nombres[s] ?? "")}">${f.html(s)} ↗</a>`).join("")}
        ${(n.carteras ?? []).map((c) => `<a class="chip vinculo" href="${enlaceRuta(c.ruta)}">Cartera · ${f.html(c.nombre)} ↗</a>`).join("")}</div>` : ""}
      <div class="pie-nota">
        <button type="button" data-accion="comentarios" data-nota="${n.id}">Comentarios</button>
        ${n.tipo === "hipotesis" || n.estado ? (esEditor ? `<button type="button" data-accion="estado" data-nota="${n.id}">${n.estado === "comprobada" ? "☑ Comprobada" : "☐ Pendiente de comprobar"}</button>`
          : `<span>${n.estado === "comprobada" ? "☑ Comprobada" : "☐ Pendiente de comprobar"}</span>`) : ""}
        ${mia && esEditor ? `<button type="button" data-accion="editar" data-nota="${n.id}">Editar</button>` : ""}
        ${(mia && esEditor) || esPropietario ? `<button type="button" data-accion="borrar" data-nota="${n.id}">Borrar</button>` : ""}
      </div>
      <div class="comentarios" id="comentarios-${n.id}" hidden></div>
    </div></article>`;
}

async function dibujarGraficoNota(actual, n) {
  const anio = new Date().getUTCFullYear();
  const s = await datos.sesionesEnEscalaDeHoy(n.grafico.simbolo, anio - (n.grafico.anios ?? 1), anio);
  if (!vigente(actual)) return;
  const desde = new Date(Date.now() - (n.grafico.anios ?? 1) * 365.25 * 86400000).toISOString().slice(0, 10);
  const k = Math.max(0, s.fechas.findIndex((x) => x >= desde));
  dibujarLinea(document.querySelector(`[data-grafico="${n.id}"]`), s.fechas.slice(k).map(f.fecha), s.cierres.slice(k), (x) => f.num(x, 2));
}

async function mostrarComentarios(q, n, esEditor, esPropietario) {
  const caja = document.getElementById(`comentarios-${n.id}`);
  if (!caja.hidden) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = `<p class="cargando">Cargando…</p>`;
  const pintarLista = async () => {
    const lista = await datos.comentarios(q.id, n.id);
    caja.innerHTML = `${lista.map((k) => `<div class="pila" style="gap:2px;font-size:14px">
        <span class="suave" style="font-size:12px">${f.html(k.autor?.uid === sesion.usuario.uid ? "Tú" : k.autor?.nombre || k.autor?.correo)} · ${f.fechaHora(fechaDe(k.creado))}
        ${k.autor?.uid === sesion.usuario.uid || esPropietario ? `· <button class="enlace" data-borrar-comentario="${k.id}" type="button" style="font-size:12px">Borrar</button>` : ""}</span>
        <span style="white-space:pre-wrap">${f.html(k.texto)}</span></div>`).join("") || `<span class="vacio">Sin comentarios.</span>`}
      ${esEditor ? `<form class="fila" data-comentar style="flex-wrap:nowrap"><input type="text" maxlength="2000" placeholder="Escribe un comentario" required style="border-color:var(--linea)">
        <button class="boton negro pequeno" type="submit">Responder</button></form>` : ""}`;
    caja.querySelector("[data-comentar]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const campo = e.target.querySelector("input");
      if (await intentar(() => datos.comentar(q.id, n.id, sesion.usuario, campo.value.trim()))) await pintarLista();
    });
    caja.querySelectorAll("[data-borrar-comentario]").forEach((b) => b.addEventListener("click", async () => {
      if (await intentar(() => datos.borrarComentario(q.id, n.id, b.dataset.borrarComentario))) await pintarLista();
    }));
  };
  await pintarLista();
}

function dialogoNuevo() {
  const { elemento, cerrar } = abrirVentana({
    titulo: "Nuevo cuaderno",
    cuerpo: `<label class="campo"><span>Título</span><input type="text" id="titulo-nuevo" maxlength="80" required placeholder="Dividendos y precio"></label>
      <label class="campo"><span>Pregunta o propósito (opcional)</span><input type="text" id="descripcion-nueva" maxlength="300" placeholder="¿Cae el precio lo mismo que el dividendo?"></label>
      <p class="error" id="error-nuevo" hidden></p>`,
    pie: `<button class="boton linea" type="button" data-cancelar>Cancelar</button><button class="boton" type="button" data-crear>Crear</button>`,
  });
  $("[data-cancelar]", elemento).addEventListener("click", cerrar);
  $("[data-crear]", elemento).addEventListener("click", async (e) => {
    const titulo = $("#titulo-nuevo", elemento).value.trim();
    if (!titulo) { $("#error-nuevo", elemento).textContent = "Escribe un título."; $("#error-nuevo", elemento).hidden = false; return; }
    e.target.disabled = true;
    try {
      const id = await datos.crearCuaderno(sesion.usuario, { titulo, descripcion: $("#descripcion-nueva", elemento).value.trim() });
      cerrar();
      location.hash = `#/cuaderno/${id}`;
    } catch (err) {
      $("#error-nuevo", elemento).textContent = mensajeError(err);
      $("#error-nuevo", elemento).hidden = false;
      e.target.disabled = false;
    }
  });
}

function dialogoEditar(q) {
  const { elemento, cerrar } = abrirVentana({
    titulo: "Editar el cuaderno",
    cuerpo: `<label class="campo"><span>Título</span><input type="text" id="titulo-edit" maxlength="80" required value="${f.html(q.titulo)}"></label>
      <label class="campo"><span>Pregunta o propósito</span><input type="text" id="descripcion-edit" maxlength="300" value="${f.html(q.descripcion ?? "")}"></label>`,
    pie: `<button class="boton peligro" type="button" data-borrar>Borrar el cuaderno</button><button class="boton" type="button" data-guardar>Guardar</button>`,
  });
  const recargar = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
  $("[data-guardar]", elemento).addEventListener("click", async () => {
    if (await intentar(() => datos.actualizarCuaderno(q.id, { titulo: $("#titulo-edit", elemento).value.trim() || q.titulo,
                                                                descripcion: $("#descripcion-edit", elemento).value.trim() }))) { cerrar(); recargar(); }
  });
  $("[data-borrar]", elemento).addEventListener("click", async () => {
    if (!confirm(`¿Borrar el cuaderno «${q.titulo}» con todas sus notas? No se puede deshacer.`)) return;
    if (await intentar(() => datos.borrarCuaderno(q.id))) {
      cerrar();
      await sincronizarLectores(await datos.cuadernos(sesion.usuario)).catch(() => {});
      location.hash = "#/cuaderno";
    }
  });
}

/** Ventana «Compartir»: invitar por correo, cambiar el permiso, quitar y avisar. */
function dialogoCompartir(q) {
  const yo = correoPropio();
  const enlace = `${URL_APLICACION}#/cuaderno/${q.id}`;
  let estado = { miembros: [...q.miembros], editores: [...q.editores] };
  const { elemento, cerrar } = abrirVentana({
    titulo: `Compartir «${q.titulo}»`,
    cuerpo: `<form class="fila" id="form-invitar" style="align-items:flex-end;gap:8px">
        <label class="campo" style="flex:1 1 220px"><span class="etiqueta">Correo de la persona</span><input type="email" id="correo-invitado" required placeholder="nombre@ejemplo.com"></label>
        <label class="campo" style="flex:0 1 170px"><span class="etiqueta">Permiso</span><select id="permiso"><option value="editar">Puede editar</option><option value="leer">Solo lectura</option></select></label>
        <button class="boton negro" type="submit">Invitar</button></form>
      <p class="error" id="error-invitar" hidden></p>
      <div id="personas" style="border-top:2px solid var(--fuerte)"></div>
      <div class="recuadro"><strong>Cómo entra una persona invitada</strong>
        <span>1. Abre el enlace del cuaderno.</span><span>2. Entra con una cuenta de Google de ese mismo correo (si es nueva, el administrador la aprueba).</span>
        <span>3. Solo ve este cuaderno y, en solo lectura, las carteras vinculadas en sus notas.</span></div>`,
    pie: `<span class="fila" style="margin-right:auto"><button class="boton linea" type="button" data-copiar>Copiar enlace</button>
        <a class="boton linea" data-avisar href="#">Avisar por correo</a></span><button class="boton" type="button" data-hecho>Hecho</button>
      <span class="aviso" style="flex-basis:100%">«Avisar por correo» abre tu programa de correo con el enlace ya escrito; la aplicación no envía correos.</span>`,
    alCerrar: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
  });
  const guardar = async (nuevo) => {
    await datos.actualizarCuaderno(q.id, nuevo);
    estado = nuevo;
    q.miembros = nuevo.miembros;
    q.editores = nuevo.editores;
    await sincronizarLectores(await datos.cuadernos(sesion.usuario));
    pintarPersonas();
  };
  const pintarPersonas = () => {
    $("#personas", elemento).innerHTML = estado.miembros.map((m) => `<div class="fila" style="padding:12px 0;border-bottom:1px solid var(--linea-suave);gap:8px 12px">
      <span class="avatar mediano ${m === yo ? "" : "gris"}">${inicial(m)}</span>
      <span class="pila" style="gap:0;flex:1 1 200px;min-width:0;font-size:14px"><strong style="overflow-wrap:anywhere">${f.html(m)}${m === yo ? " (tú)" : ""}</strong></span>
      ${m === yo ? `<span class="suave" style="font-size:13px;font-weight:700">Propietario</span>`
        : `<select data-permiso="${f.html(m)}" style="width:auto;padding:5px 8px;font-size:13px"><option value="editar" ${estado.editores.includes(m) ? "selected" : ""}>Puede editar</option>
          <option value="leer" ${estado.editores.includes(m) ? "" : "selected"}>Solo lectura</option></select>
          <button class="enlace" data-quitar="${f.html(m)}" type="button" style="color:var(--acento);font-size:13px">Quitar</button>`}</div>`).join("");
    const otros = estado.miembros.filter((m) => m !== yo);
    const avisar = $("[data-avisar]", elemento);
    avisar.href = otros.length ? miembros.enlaceAvisoCuaderno({ correos: otros, cuaderno: q.titulo, url: enlace }) : "#";
    avisar.toggleAttribute("aria-disabled", !otros.length);
    $$("[data-permiso]", elemento).forEach((s) => s.addEventListener("change", () => intentar(() => guardar({
      miembros: estado.miembros,
      editores: s.value === "editar" ? [...new Set([...estado.editores, s.dataset.permiso])] : estado.editores.filter((m) => m !== s.dataset.permiso),
    }))));
    $$("[data-quitar]", elemento).forEach((b) => b.addEventListener("click", () => intentar(() => guardar({
      miembros: estado.miembros.filter((m) => m !== b.dataset.quitar), editores: estado.editores.filter((m) => m !== b.dataset.quitar),
    }))));
  };
  pintarPersonas();
  $("#form-invitar", elemento).addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("#error-invitar", elemento);
    try {
      const lista = miembros.anadir(estado.miembros, $("#correo-invitado", elemento).value);
      const nuevo = lista.at(-1);
      await guardar({ miembros: lista, editores: $("#permiso", elemento).value === "editar" ? [...estado.editores, nuevo] : estado.editores });
      $("#correo-invitado", elemento).value = "";
      error.hidden = true;
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
    }
  });
  $("[data-copiar]", elemento).addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(enlace); e.target.textContent = "Enlace copiado"; } catch { prompt("Copia el enlace:", enlace); }
  });
  $("[data-hecho]", elemento).addEventListener("click", cerrar);
}
