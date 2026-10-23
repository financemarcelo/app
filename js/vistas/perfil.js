// Perfil y ajustes: cuenta, preferencias, comisión simulada, exportación y borrado de carteras.
import { salir } from "../firebase.js";
import * as datos from "../datos.js";
import { sesion, administrador, cambiarPreferencias } from "../sesion.js";
import { todasLasCarteras, movimientosDe, invalidar } from "../resumen.js";
import { $, $$, pintar, kpis, segmentado, alElegir, intentar, descargar, inicial, enConstruccion } from "../ui.js";
import * as f from "../formato.js";
import { comisionEur } from "../cartera.js";
import { aCsv } from "../calculos.js";

const PREFERENCIAS = [
  { clave: "tema", titulo: "Tema", ayuda: "Automático sigue el ajuste de tu dispositivo.",
    opciones: [["claro", "Claro"], ["oscuro", "Oscuro"], ["automatico", "Automático"]] },
  { clave: "variaciones", titulo: "Variaciones", ayuda: "Cómo se muestran los cambios de precio del día en listas y tarjetas.",
    opciones: [["porcentaje", "Porcentaje"], ["importe", "Importe"]] },
  { clave: "inicio", titulo: "Página al entrar", ayuda: "Lo primero que ves al abrir la aplicación.",
    opciones: [["inicio", "Inicio"], ["cartera", "Primera cartera"], ["mercado", "Mercado"]] },
  { clave: "densidad", titulo: "Densidad", ayuda: "Más filas en pantalla o más espacio entre ellas.",
    opciones: [["comoda", "Cómoda"], ["compacta", "Compacta"]] },
];

export async function vista({ actual }) {
  const [calculadas, ficha, actualizado] = await Promise.all([
    todasLasCarteras(), datos.perfil(sesion.usuario.uid), datos.actualizaciones()]);
  const u = sesion.usuario;
  const prefs = sesion.preferencias;
  const movimientos = movimientosDe(calculadas);
  const propias = calculadas.filter((r) => r.cartera.propietario === u.uid);
  const operacionesPropias = calculadas.flatMap((r) => r.operaciones).filter((o) => (o.autor?.uid ?? "") === u.uid
    || (!o.autor && calculadas.find((r) => r.operaciones.includes(o))?.cartera.propietario === u.uid)).length;
  const secciones = [["cuenta", "Cuenta"], ["preferencias", "Preferencias"], ["comisiones", "Comisiones simuladas"],
                     ["exportacion", "Datos y exportación"], ...(administrador() ? [["administracion", "Administración"]] : []),
                     ["borrar", "Borrar datos"]];

  if (!pintar(actual, `
    <h1>Perfil y ajustes</h1>
    <div class="columnas">
      <nav class="navegacion-lateral" style="flex:1 1 220px" aria-label="Secciones">
        ${secciones.map(([id, t]) => `<a href="#${id}" data-ir="${id}" style="${id === "borrar" ? "color:var(--acento)" : ""}"><strong>${t}</strong></a>`).join("")}
      </nav>
      <div class="principal" style="flex:999 1 640px;gap:20px">
        <section class="panel fuerte" id="cuenta" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:20px">
          <span class="avatar grande">${inicial(u.displayName || u.email)}</span>
          <div class="pila" style="flex:1 1 260px;gap:4px"><strong style="font-size:22px">${f.html(u.displayName || "Sin nombre")}</strong>
            <span class="suave">Cuenta de Google · ${f.html(u.email)} · ${administrador() ? "administrador" : "acceso aprobado"}</span></div>
          <button class="boton linea" id="salir" type="button">Cerrar sesión</button>
          <div style="flex-basis:100%">${kpis([
            { etiqueta: "Desde", valor: f.fecha(ficha?.alta?.toDate?.().toISOString()) },
            { etiqueta: "Carteras", valor: `${calculadas.length}`, nota: propias.length === 1 ? "1 propia" : `${propias.length} propias` },
            { etiqueta: "Operaciones", valor: `${operacionesPropias}`, nota: "registradas por ti" },
            { etiqueta: "En seguimiento", valor: f.cantidad(prefs.seguimiento.length, "valor", "valores") },
          ], { compactos: true })}</div>
        </section>

        <section class="panel" id="preferencias" style="gap:4px">
          <h2 style="margin-bottom:8px">Preferencias</h2>
          <div class="fila entre" style="padding:12px 0;border-top:1px solid var(--linea-suave);gap:10px 24px">
            <div class="pila" style="gap:2px;flex:1 1 240px"><strong>Moneda de valoración</strong>
              <span class="aviso">Los valores en la otra moneda se convierten con el tipo del BCE. ${enConstruccion()} para el dólar.</span></div>
            ${segmentado("moneda", [{ valor: "EUR", texto: "Euro" }, { valor: "USD", texto: "Dólar", desactivada: true }], "EUR")}
          </div>
          ${PREFERENCIAS.map((p) => `<div class="fila entre" style="padding:12px 0;border-top:1px solid var(--linea-suave);gap:10px 24px">
            <div class="pila" style="gap:2px;flex:1 1 240px"><strong>${p.titulo}</strong><span class="aviso">${p.ayuda}</span></div>
            ${segmentado(p.clave, p.opciones.map(([v, t]) => ({ valor: v, texto: t })), prefs[p.clave])}</div>`).join("")}
          <p class="aviso" id="guardado" hidden>Guardado.</p>
        </section>

        <section class="panel" id="comisiones" style="gap:14px">
          <div class="fila entre"><div class="pila" style="gap:2px"><h2>Comisiones simuladas</h2>
            <span class="aviso">Se descuentan del efectivo en cada compra y venta nueva; no cambian las operaciones anteriores.</span></div>
            <button class="interruptor" id="comision-activa" type="button" role="switch" aria-checked="${prefs.comision.activa}" aria-label="Aplicar comisiones"></button></div>
          <form class="formulario" id="form-comision">
            <label class="campo"><span>Porcentaje sobre el importe</span><input type="number" id="c-porcentaje" min="0" max="5" step="0.01" value="${prefs.comision.porcentaje ?? 0}"></label>
            <label class="campo"><span>Mínimo por operación (€)</span><input type="number" id="c-minimo" min="0" step="0.01" value="${prefs.comision.minimo ?? ""}"></label>
            <label class="campo"><span>Máximo por operación (€)</span><input type="number" id="c-maximo" min="0" step="0.01" placeholder="Sin máximo" value="${prefs.comision.maximo ?? ""}"></label>
            <div><button class="boton negro" type="submit">Guardar</button></div>
          </form>
          <span class="aviso" id="ejemplo-comision"></span>
        </section>

        <section class="panel" id="exportacion" style="gap:14px">
          <h2>Datos y exportación</h2>
          <div class="fila"><button class="boton linea" id="csv-carteras" type="button">Exportar carteras (CSV)</button>
            <button class="boton linea" id="csv-movimientos" type="button">Exportar movimientos (CSV)</button></div>
          <div class="pila" style="gap:0">${[
            ["Precios diarios desde 2006 y dividendos", "Yahoo Finance", actualizado.precios ? `Última carga: ${f.fechaHora(actualizado.precios.toISOString())}` : "—"],
            ["Cotizaciones de valores e índices", "Yahoo Finance", actualizado.cotizaciones ? `Cada 15 min · última carga ${f.fechaHora(actualizado.cotizaciones.toISOString())}` : "—"],
            ["Euro-dólar", "Banco Central Europeo", actualizado.fechaCambio ? `Referencia del ${f.fecha(actualizado.fechaCambio)}` : "—"]]
            .map(([d, fte, e]) => `<div class="fila entre" style="padding:10px 0;border-top:1px solid var(--linea-suave);font-size:14px">
              <span><strong>${d}</strong> · ${fte}</span><span class="suave">${e}</span></div>`).join("")}</div>
        </section>

        ${administrador() ? `<section class="panel" id="administracion"><h2>Administración</h2>
          <p style="margin:0">Aprobar cuentas nuevas y eliminar cuentas.</p><div><a class="boton negro" href="#/admin">Abrir administración</a></div></section>` : ""}

        <section class="panel peligro fila entre" id="borrar">
          <div class="pila" style="gap:2px;flex:1 1 300px"><h2 style="color:var(--acento)">Borrar datos</h2>
            <span class="aviso">Elimina ${propias.length === 1 ? "la cartera de la que eres propietario" : `las ${propias.length} carteras de las que eres propietario`} y sus operaciones, también para sus miembros. No afecta a los datos de mercado. No se puede deshacer.</span></div>
          <button class="boton peligro" id="borrar-todo" type="button" ${propias.length ? "" : "disabled"}>Borrar todas mis carteras</button>
        </section>
      </div>
    </div>`)) return;

  const avisoGuardado = () => {
    const aviso = $("#guardado");
    if (!aviso) return; // ya se ha cambiado de página
    aviso.hidden = false;
    setTimeout(() => { aviso.hidden = true; }, 1500);
  };
  for (const p of PREFERENCIAS) {
    alElegir(document, p.clave, (valor) => intentar(async () => { await cambiarPreferencias({ [p.clave]: valor }); avisoGuardado(); }));
  }

  const leerComision = () => ({
    activa: $("#comision-activa").getAttribute("aria-checked") === "true",
    porcentaje: Number($("#c-porcentaje").value || 0),
    minimo: $("#c-minimo").value === "" ? null : Number($("#c-minimo").value),
    maximo: $("#c-maximo").value === "" ? null : Number($("#c-maximo").value),
  });
  const ejemplo = () => {
    const c = leerComision();
    $("#ejemplo-comision").textContent = c.activa
      ? `Ejemplo: comprar 1.600 € cuesta ${f.eur(comisionEur(1600, c))} de comisión; comprar 20.000 €, ${f.eur(comisionEur(20000, c))}.`
      : "Sin comisión: las operaciones nuevas no pagan nada.";
  };
  ejemplo();
  $("#comision-activa").addEventListener("click", async (e) => {
    e.target.setAttribute("aria-checked", String(e.target.getAttribute("aria-checked") !== "true"));
    ejemplo();
    await intentar(() => cambiarPreferencias({ comision: leerComision() }));
  });
  $$("#form-comision input").forEach((i) => i.addEventListener("input", ejemplo));
  $("#form-comision").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await intentar(() => cambiarPreferencias({ comision: leerComision() }))) $("#ejemplo-comision").textContent += " Guardado.";
  });

  $("#salir").addEventListener("click", () => salir());
  $$("[data-ir]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.ir)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#csv-carteras").addEventListener("click", () => descargar(`carteras-${f.hoy()}.csv`, aCsv(
    ["Cartera", "Valor", "Títulos", "Coste (€)", "Precio", "Divisa", "Valor (€)", "Plusvalía (€)"],
    calculadas.flatMap((r) => [
      ...r.valoracion.posiciones.map((p) => [r.cartera.nombre, p.simbolo, p.titulos, redondeo(p.costeEur), p.precio, r.divisas[p.simbolo],
                                             redondeo(p.valorEur), redondeo(p.plusvaliaEur)]),
      [r.cartera.nombre, "Efectivo", "", "", "", "EUR", redondeo(r.estado.efectivo), ""]]))));
  $("#csv-movimientos").addEventListener("click", () => descargar(`movimientos-${f.hoy()}.csv`, aCsv(
    ["Fecha", "Cartera", "Tipo", "Valor", "Títulos", "Precio", "Divisa", "Comisión (€)", "Importe (€)"],
    movimientos.map((m) => [m.fecha, m.cartera.nombre, m.tipo, m.simbolo, m.titulos, m.precio ?? m.porTitulo, m.divisa,
                            m.comisionEur ?? "", redondeo(m.importeEur)]))));
  $("#borrar-todo").addEventListener("click", async (e) => {
    if (!confirm(`¿Borrar ${propias.length === 1 ? "tu cartera" : `tus ${propias.length} carteras`} y todas sus operaciones? No se puede deshacer.`)) return;
    if (!confirm("Confirma de nuevo: se borrarán también para sus miembros.")) return;
    e.target.disabled = true;
    const ok = await intentar(async () => { for (const r of propias) await datos.borrarCartera(r.cartera); });
    invalidar();
    if (ok) location.hash = "#/inicio";
  });
}

const redondeo = (n) => (n == null ? null : Math.round(n * 100) / 100);
