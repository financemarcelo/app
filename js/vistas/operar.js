// Operar: cartera, valor, compra o venta, títulos, resumen con comisión simulada y efecto en la cartera.
import * as datos from "../datos.js";
import * as cartera from "../cartera.js";
import { sesion, correoPropio } from "../sesion.js";
import { todasLasCarteras, invalidar } from "../resumen.js";
import { $, $$, pintar, segmentado, alElegir, mensajeError } from "../ui.js";
import * as f from "../formato.js";
import { minigrafico } from "../graficos.js";
import { plazaDe, estadoSesion, variacion, dividendosEstimados, sector } from "../calculos.js";
import { enlaceCartera, enlaceValor } from "./comun.js";

const DIAS_COTIZACION_ANTIGUA = 4;

export async function vista({ actual, partes, consulta }) {
  const [calculadas, valores, cotizaciones, cambio] = await Promise.all([
    todasLasCarteras(), datos.listaValores(), datos.cotizaciones(), datos.tipoCambioActual()]);
  const yo = correoPropio();
  const operables = calculadas.filter((r) => r.cartera.propietario === sesion.usuario.uid || r.cartera.miembros.includes(yo));
  if (!operables.length) {
    return pintar(actual, `<h1>Nueva operación</h1><div class="panel"><p class="vacio">Para operar necesitas una cartera.</p>
      <div><a class="boton" href="#/carteras/nueva">Crear una cartera</a></div></div>`);
  }
  const [propietario, id] = partes.map(decodeURIComponent);
  let elegida = operables.find((r) => r.cartera.propietario === propietario && r.cartera.id === id) ?? operables[0];
  let simbolo = valores.some((v) => v.simbolo === consulta.get("valor")) ? consulta.get("valor") : "";
  let tipo = "compra";
  let eventosValor = {};
  const ficha = (s) => valores.find((v) => v.simbolo === s);
  const volver = simbolo && consulta.get("valor") ? `<a class="miga" href="${enlaceValor(simbolo)}">← ${f.html(simbolo)} · ${f.html(ficha(simbolo)?.nombre ?? "")}</a>`
    : `<a class="miga" href="${enlaceCartera(elegida.cartera)}">← ${f.html(elegida.cartera.nombre)}</a>`;
  const opciones = (indice) => valores.filter((v) => v.indice === indice)
    .map((v) => `<option value="${f.html(v.simbolo)}">${f.html(v.simbolo)} · ${f.html(v.nombre)}</option>`).join("");

  if (!pintar(actual, `
    <div class="encabezado"><div>${volver}<h1 style="margin-top:6px">Nueva operación</h1></div>
      <span class="fila" id="estado-plaza" style="font-weight:600;font-size:14px"></span></div>
    <div class="columnas">
      <form class="principal" id="operar" style="gap:2px;background:var(--fuerte);border:2px solid var(--fuerte)">
        <fieldset class="panel" style="border:0;margin:0">
          <legend class="etiqueta" style="float:left;padding:0">1 · Cartera</legend>
          <div style="clear:both;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px" id="carteras"></div>
        </fieldset>
        <fieldset class="panel" style="border:0;margin:0">
          <legend class="etiqueta" style="float:left;padding:0">2 · Valor</legend>
          <select id="valor" style="clear:both" required>
            <option value="">Elige un valor…</option>
            <optgroup label="IBEX 35">${opciones("IBEX35")}</optgroup>
            <optgroup label="Dow Jones">${opciones("DJIA")}</optgroup>
          </select>
          <div id="ficha-valor"></div>
        </fieldset>
        <fieldset class="panel" style="border:0;margin:0;gap:14px">
          <legend class="etiqueta" style="float:left;padding:0">3 · Orden</legend>
          <div style="clear:both">${segmentado("tipo", [{ valor: "compra", texto: "Comprar" }, { valor: "venta", texto: "Vender" }], "compra", { clase: "grande lleno" })}</div>
          <div class="fila" style="align-items:flex-end;gap:16px">
            <label class="campo" style="flex:1 1 200px"><span>Títulos</span>
              <span class="contador"><button type="button" data-paso="-1" aria-label="Uno menos">−</button>
                <input type="number" id="titulos" inputmode="numeric" min="1" step="1" value="1">
                <button type="button" data-paso="1" aria-label="Uno más">+</button></span></label>
            <label class="campo" style="flex:1 1 160px"><span>o importe en €</span><input type="number" id="importe" min="0" step="1" placeholder="1.000"></label>
          </div>
          <div class="chips"><button class="chip" type="button" data-parte="1">Máximo</button>
            <button class="chip" type="button" data-parte="0.5">50 %</button><button class="chip" type="button" data-parte="0.25">25 %</button></div>
          <span class="aviso" id="maximo"></span>
          <div class="pila" style="gap:8px"><span style="font-size:14px;font-weight:700">Precio</span>
            <label class="opcion elegida"><input type="radio" name="precio" checked><span><strong>Último precio</strong> <span class="suave" id="texto-precio"></span></span></label>
            <label class="opcion desactivada"><input type="radio" name="precio" disabled><span><strong>Cierre de un día anterior</strong>
              <span class="suave">· para reconstruir una cartera desde 2006</span> <span class="construccion">En construcción</span></span></label>
          </div>
        </fieldset>
      </form>
      <aside class="lateral">
        <section class="panel fuerte" id="resumen"></section>
        <section class="panel" id="despues"></section>
        <section class="panel negro" id="en-cartera" hidden></section>
      </aside>
    </div>`)) return;

  if (simbolo) $("#valor").value = simbolo;
  const comision = sesion.preferencias.comision;

  const pintarCarteras = () => {
    $("#carteras").innerHTML = operables.map((r, i) => {
      const pos = r.estado.posiciones[simbolo];
      return `<label class="opcion${r === elegida ? " elegida" : ""}"><input type="radio" name="cartera" value="${i}" ${r === elegida ? "checked" : ""}>
        <span class="pila" style="gap:2px"><strong>${f.html(r.cartera.nombre)}</strong>
          <span class="suave num" style="font-size:13px">Efectivo ${f.eurEntero(r.estado.efectivo)}</span>
          ${simbolo ? `<span class="suave" style="font-size:13px">${pos ? `Tienes ${f.titulos(pos.titulos)} ${f.html(simbolo)}` : `Sin ${f.html(simbolo)}`}</span>` : ""}</span></label>`;
    }).join("");
  };

  const pintarValor = async () => {
    const v = ficha(simbolo);
    const cot = cotizaciones[simbolo];
    $("#estado-plaza").innerHTML = v ? `<span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${estadoSesion(plazaDe(v.indice)).abierta ? "var(--sube)" : "var(--gris-2)"}"></span>
      ${plazaDe(v.indice).ciudad} · ${estadoSesion(plazaDe(v.indice)).texto.toLowerCase()}` : "";
    if (!v) { $("#ficha-valor").innerHTML = ""; return; }
    eventosValor = { [simbolo]: (await datos.fichaValor(simbolo)) ?? {} };
    const variacionDia = variacion(cot);
    $("#ficha-valor").innerHTML = `<div class="fila entre" style="background:var(--fondo);padding:16px;gap:16px 24px">
      <div class="pila" style="gap:2px;flex:1 1 180px"><strong style="font-size:18px">${f.html(v.simbolo)} · ${f.html(v.nombre)}</strong>
        <span class="suave" style="font-size:13px">${plazaDe(v.indice).ciudad} · ${v.divisa === "USD" ? "dólar" : "euro"} · ${v.indice === "DJIA" ? "Dow Jones" : "IBEX 35"} · ${f.html(sector(v.sector))}</span></div>
      <div class="pila" style="gap:0;align-items:flex-end"><span class="num" style="font-size:26px;font-weight:700">${f.precio(cot?.precio, v.divisa)}</span>
        <span class="${f.claseSigno(variacionDia)} num" style="font-size:13px;font-weight:700">${f.conSigno(cot ? cot.precio - cot.cierre_anterior : null)} ${v.divisa === "USD" ? "$" : "€"} · ${f.pctSigno(variacionDia)}</span></div>
      <span id="mini"></span></div>`;
    const anio = new Date().getUTCFullYear();
    const s = await datos.sesiones(simbolo, anio - 1, anio);
    if (ficha(simbolo) === v && $("#mini")) $("#mini").innerHTML = minigrafico(s.cierres.slice(-30), 140, 44);
  };

  const calcular = () => {
    const v = ficha(simbolo);
    const cot = cotizaciones[simbolo];
    const titulos = Number($("#titulos").value);
    if (!v || !cot) return null;
    const importeEur = cartera.importeOperacionEur({ titulos, precio: cot.precio, divisa: v.divisa, eurusd: cambio.valor });
    const comisionEur = cartera.comisionEur(importeEur, comision);
    return { v, cot, titulos, importeEur, comisionEur, precioEur: importeEur / (titulos || 1) };
  };

  const maximoTitulos = () => {
    const v = ficha(simbolo), cot = cotizaciones[simbolo];
    if (!v || !cot) return 0;
    if (tipo === "venta") return elegida.estado.posiciones[simbolo]?.titulos ?? 0;
    const precioEur = cartera.importeOperacionEur({ titulos: 1, precio: cot.precio, divisa: v.divisa, eurusd: cambio.valor });
    let n = Math.floor(elegida.estado.efectivo / precioEur);
    while (n > 0 && n * precioEur + cartera.comisionEur(n * precioEur, comision) > elegida.estado.efectivo) n--;
    return Math.max(0, n);
  };

  const actualizar = () => {
    const p = calcular();
    const maximo = maximoTitulos();
    $("#maximo").textContent = !simbolo ? "" : tipo === "compra" ? `Con el efectivo de la cartera puedes comprar hasta ${f.titulos(maximo)} títulos.`
      : maximo ? `Puedes vender hasta ${f.titulos(maximo)} títulos.` : `No tienes ${simbolo} en esta cartera.`;
    $("#texto-precio").textContent = p ? `· ${f.precio(p.cot.precio, p.v.divisa)} · ${f.fechaHora(p.cot.hora)}` : "";
    const resumen = $("#resumen");
    if (!p) {
      resumen.innerHTML = `<h3 class="titulo-seccion">Resumen</h3><p class="vacio">Elige un valor.</p>`;
      $("#despues").hidden = true;
      $("#en-cartera").hidden = true;
      return;
    }
    const fallo = cartera.validarOperacion(elegida.estado, { tipo, simbolo, titulos: p.titulos, importeEur: p.importeEur, comisionEur: p.comisionEur });
    const dias = (Date.now() - new Date(p.cot.hora).getTime()) / 86400000;
    const total = tipo === "compra" ? p.importeEur + p.comisionEur : p.importeEur - p.comisionEur;
    resumen.innerHTML = `<h3 class="titulo-seccion">Resumen</h3>
      <p style="margin:0;font-size:22px;font-weight:800">${tipo === "compra" ? "Comprar" : "Vender"} ${f.titulos(p.titulos || 0)} ${f.html(simbolo)}</p>
      <div class="pila" style="gap:0">
        ${[["Precio", f.precio(p.cot.precio, p.v.divisa)],
           ...(p.v.divisa === "USD" ? [[`Importe en dólares`, f.precio(p.titulos * p.cot.precio, "USD")],
                                       [`Tipo de cambio del BCE${cambio.fecha ? ` (${f.fechaCorta(cambio.fecha)})` : ""}`, `${f.num(cambio.valor, 4)} $/€`]] : []),
           ["Importe en euros", f.eur(p.importeEur)],
           [comision.activa ? `Comisión simulada (${f.num(comision.porcentaje, 2)} %${comision.minimo != null ? `, mín. ${f.eur(comision.minimo)}` : ""})` : "Comisión simulada", comision.activa ? f.eur(p.comisionEur) : "Sin comisión"]]
          .map(([e, v]) => `<div class="renglon borde num" style="padding:8px 0"><span>${e}</span><span>${v}</span></div>`).join("")}
      </div>
      <div class="renglon" style="align-items:baseline"><strong>${tipo === "compra" ? "Total" : "Recibes"}</strong><span class="num" style="font-size:28px;font-weight:800">${f.eur(total)}</span></div>
      ${fallo ? `<p class="error">${f.html(fallo)}</p>` : ""}
      ${dias > DIAS_COTIZACION_ANTIGUA ? `<p class="error">La cotización es de hace ${Math.floor(dias)} días.</p>` : ""}
      <button class="boton ancho" form="operar" type="submit" ${fallo ? "disabled" : ""}>Confirmar ${tipo}</button>
      <p class="error" id="error-operacion" hidden></p>
      <span class="aviso">Operación simulada: no se envía a ningún mercado.${comision.activa ? "" : ' La comisión se configura en <a href="#/perfil">Perfil</a>.'}</span>`;

    // Efecto en la cartera.
    const pos = elegida.estado.posiciones[simbolo];
    const titulosAntes = pos?.titulos ?? 0;
    const titulosDespues = titulosAntes + (tipo === "compra" ? 1 : -1) * (p.titulos || 0);
    const efectivoDespues = elegida.estado.efectivo - (tipo === "compra" ? total : -total);
    const totalCartera = elegida.valoracion.totalEur - p.comisionEur;
    const valorAntes = elegida.valoracion.posiciones.find((x) => x.simbolo === simbolo)?.valorEur ?? 0;
    const valorDespues = Math.max(0, titulosDespues) * p.precioEur;
    $("#despues").hidden = false;
    $("#despues").innerHTML = `<h3 class="titulo-seccion">Después de operar</h3>
      ${[["Efectivo", f.eurEntero(elegida.estado.efectivo), f.eurEntero(efectivoDespues)],
         [`Títulos de ${f.html(simbolo)}`, f.titulos(titulosAntes), f.titulos(Math.max(0, titulosDespues))],
         [`Peso de ${f.html(simbolo)}`, `${f.num((valorAntes / elegida.valoracion.totalEur) * 100, 1)} %`, `${f.num((valorDespues / totalCartera) * 100, 1)} %`]]
        .map(([e, a, d]) => `<div class="renglon num"><span class="suave">${e}</span><span><span class="suave">${a}</span> → <strong>${d}</strong></span></div>`).join("")}`;
    const proximo = dividendosEstimados({ titulos: { [simbolo]: Math.max(titulosAntes, 1) }, eventos: eventosValor,
      divisas: { [simbolo]: p.v.divisa }, eurusd: cambio.valor, desde: f.hoy(), hasta: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) })[0];
    $("#en-cartera").hidden = !pos;
    if (pos) {
      $("#en-cartera").innerHTML = `<h3 class="titulo-seccion">${f.html(simbolo)} en esta cartera</h3>
        <span>${f.titulos(pos.titulos)} títulos · coste medio ${f.eur(pos.costeEur / pos.titulos)}</span>
        <span>Primera compra el ${f.fecha(pos.desde)}</span>
        ${proximo ? `<span class="aviso">Próximo dividendo estimado: ≈ ${f.num(proximo.porTitulo, 4)} ${p.v.divisa === "USD" ? "$" : "€"} por título hacia el ${f.fecha(proximo.fecha)}.</span>` : ""}`;
    }
  };

  pintarCarteras();
  await pintarValor();
  actualizar();

  $("#carteras").addEventListener("change", (e) => {
    elegida = operables[Number(e.target.value)];
    pintarCarteras();
    actualizar();
  });
  $("#valor").addEventListener("change", async (e) => {
    simbolo = e.target.value;
    pintarCarteras();
    actualizar();
    await pintarValor();
  });
  alElegir(document, "tipo", (v) => {
    tipo = v;
    $$("[data-grupo=tipo] button").forEach((b) => b.classList.toggle("rojo", b.dataset.valor === "venta" && v === "venta"));
    actualizar();
  });
  $("#titulos").addEventListener("input", () => { $("#importe").value = ""; actualizar(); });
  $("#importe").addEventListener("input", (e) => {
    const p = calcular();
    if (p) $("#titulos").value = Math.max(0, Math.floor(Number(e.target.value) / p.precioEur));
    actualizar();
  });
  $$("[data-paso]").forEach((b) => b.addEventListener("click", () => {
    $("#titulos").value = Math.max(1, Number($("#titulos").value || 0) + Number(b.dataset.paso));
    $("#importe").value = "";
    actualizar();
  }));
  $$("[data-parte]").forEach((b) => b.addEventListener("click", () => {
    $("#titulos").value = Math.floor(maximoTitulos() * Number(b.dataset.parte));
    $("#importe").value = "";
    actualizar();
  }));

  $("#operar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = calcular();
    if (!p) return;
    const fallo = cartera.validarOperacion(elegida.estado, { tipo, simbolo, titulos: p.titulos, importeEur: p.importeEur, comisionEur: p.comisionEur });
    const error = $("#error-operacion");
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    $$("button[type=submit]").forEach((b) => { b.disabled = true; });
    try {
      await datos.registrarOperacion(elegida.cartera, sesion.usuario, {
        fecha_mercado: p.cot.fecha, simbolo, tipo, titulos: p.titulos, precio: p.cot.precio, divisa: p.v.divisa,
        eurusd: cambio.valor, importe_eur: p.importeEur, ...(p.comisionEur ? { comision_eur: p.comisionEur } : {}) });
      invalidar();
      location.hash = enlaceCartera(elegida.cartera);
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
      $$("button[type=submit]").forEach((b) => { b.disabled = false; });
    }
  });
}

