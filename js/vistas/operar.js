// Operar: cartera, valor, compra o venta al último precio o al cierre de un día anterior,
// títulos, resumen con comisión simulada y efecto en la cartera.
import * as datos from "../datos.js";
import * as cartera from "../cartera.js";
import { sesion, correoPropio } from "../sesion.js";
import { todasLasCarteras, invalidar } from "../resumen.js";
import { $, $$, pintar, segmentado, alElegir, mensajeError } from "../ui.js";
import * as f from "../formato.js";
import { minigrafico } from "../graficos.js";
import { plazaDe, estadoSesion, variacion, dividendosEstimados, sector } from "../calculos.js";
import { enlaceCartera, enlaceValor, avisoSupervivencia } from "./comun.js";

const DIAS_COTIZACION_ANTIGUA = 4;
const PRIMERA_FECHA = "2006-01-02";

/** Día anterior a una fecha AAAA-MM-DD. */
const diaAnterior = (fecha) => new Date(Date.parse(`${fecha}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Mayor n entre 0 y `tope` para el que `cabe(n)` es cierto (cabe es monótona). */
function mayorQueCabe(tope, cabe) {
  let bajo = 0, alto = Math.max(0, Math.floor(tope));
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2);
    if (cabe(medio)) bajo = medio; else alto = medio - 1;
  }
  return bajo;
}

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
  let modo = "ultimo"; // "ultimo" o "anterior" (cierre de un día anterior)
  let eventosValor = {};
  let sesionesValor = null; // sesiones del valor desde el inicio de la cartera, para el modo «anterior»
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
        <section class="panel" role="group" aria-labelledby="paso-cartera">
          <h2 class="etiqueta" id="paso-cartera">1 · Cartera</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px" id="carteras"></div>
        </section>
        <section class="panel" role="group" aria-labelledby="paso-valor">
          <h2 class="etiqueta" id="paso-valor">2 · Valor</h2>
          <select id="valor" required>
            <option value="">Elige un valor…</option>
            <optgroup label="IBEX 35">${opciones("IBEX35")}</optgroup>
            <optgroup label="Dow Jones">${opciones("DJIA")}</optgroup>
          </select>
          <div id="ficha-valor"></div>
        </section>
        <section class="panel" role="group" aria-labelledby="paso-orden" style="gap:14px">
          <h2 class="etiqueta" id="paso-orden">3 · Orden</h2>
          <div>${segmentado("tipo", [{ valor: "compra", texto: "Comprar" }, { valor: "venta", texto: "Vender" }], "compra", { clase: "grande lleno" })}</div>
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
          <div class="pila" style="gap:8px" id="modos"><span style="font-size:14px;font-weight:700">Precio</span>
            <label class="opcion elegida"><input type="radio" name="precio" value="ultimo" checked><span><strong>Último precio</strong> <span class="suave" id="texto-precio"></span></span></label>
            <label class="opcion"><input type="radio" name="precio" value="anterior"><span class="pila" style="gap:8px;flex:1"><span><strong>Cierre de un día anterior</strong>
              <span class="suave">· para reconstruir una cartera desde ${f.fecha(PRIMERA_FECHA)}</span></span>
              <span class="fila" id="dia-anterior" hidden><input type="date" id="fecha-operacion" style="width:auto">
                <span class="suave" id="texto-cierre"></span></span></span></label>
            <p class="aviso" id="aviso-anterior" hidden>${avisoSupervivencia()}</p>
          </div>
        </section>
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
    await cargarSesiones();
    const variacionDia = variacion(cot);
    $("#ficha-valor").innerHTML = `<div class="fila entre" style="background:var(--fondo);padding:16px;gap:16px 24px">
      <div class="pila" style="gap:2px;flex:1 1 180px"><strong style="font-size:18px">${f.html(v.simbolo)} · ${f.html(v.nombre)}</strong>
        <span class="suave" style="font-size:13px">${plazaDe(v.indice).ciudad} · ${v.divisa === "USD" ? "dólar" : "euro"} · ${v.indice === "DJIA" ? "Dow Jones" : "IBEX 35"} · ${f.html(sector(v.sector))}</span></div>
      <div class="pila" style="gap:0;align-items:flex-end"><span class="num" style="font-size:26px;font-weight:700">${f.precio(cot?.precio, v.divisa)}</span>
        <span class="${f.claseSigno(variacionDia)} num" style="font-size:13px;font-weight:700">${f.conSigno(cot ? cot.precio - cot.cierre_anterior : null)} ${v.divisa === "USD" ? "$" : "€"} · ${f.pctSigno(variacionDia)}</span></div>
      <span id="mini"></span></div>`;
    const anio = new Date().getUTCFullYear();
    const s = await datos.sesionesEnEscalaDeHoy(simbolo, anio - 1, anio);
    if (ficha(simbolo) === v && $("#mini")) $("#mini").innerHTML = minigrafico(s.cierres.slice(-30), 140, 44);
  };

  // Sesiones del valor desde el inicio de la cartera: precio de cierre de un día anterior.
  async function cargarSesiones() {
    sesionesValor = null;
    if (!simbolo || modo !== "anterior") return;
    const pedido = simbolo;
    const s = await datos.sesiones(pedido, Number(elegida.cartera.fecha_inicio.slice(0, 4)), new Date().getUTCFullYear());
    if (pedido === simbolo) sesionesValor = s;
  }
  const fechaMinima = () => [elegida.cartera.fecha_inicio, PRIMERA_FECHA, sesionesValor?.fechas[0] ?? ""].sort().at(-1);
  const cierreEn = (fecha) => {
    if (!sesionesValor || !fecha) return null;
    const i = cartera.ultimoIndiceHasta(sesionesValor.fechas, fecha);
    return i < 0 ? null : { fecha: sesionesValor.fechas[i], cierre: sesionesValor.cierres[i] };
  };

  /** Precio, fecha de mercado y tipo de cambio de la operación según el modo. */
  const precioOperacion = () => {
    if (modo === "ultimo") {
      const cot = cotizaciones[simbolo];
      return cot ? { precio: cot.precio, fecha: cot.fecha, hora: cot.hora, eurusd: cambio.valor } : null;
    }
    const sesionElegida = cierreEn($("#fecha-operacion").value);
    return sesionElegida && sesionElegida.fecha >= elegida.cartera.fecha_inicio
      ? { precio: sesionElegida.cierre, fecha: sesionElegida.fecha, hora: null, eurusd: elegida.linea.tipoCambio(sesionElegida.fecha) }
      : null;
  };

  const calcular = (titulos = Number($("#titulos").value)) => {
    const v = ficha(simbolo);
    const precio = v && precioOperacion();
    if (!precio) return null;
    const importeEur = cartera.importeOperacionEur({ titulos, precio: precio.precio, divisa: v.divisa, eurusd: precio.eurusd });
    const comisionEur = cartera.comisionEur(importeEur, comision);
    return { v, ...precio, titulos, importeEur, comisionEur, precioEur: importeEur / (titulos || 1) };
  };

  /** La cartera recalculada con la operación añadida en su fecha, con todas las posteriores. */
  const conOperacion = (p) => {
    const op = { fecha_mercado: p.fecha, simbolo, tipo, titulos: p.titulos, importe_eur: p.importeEur,
                 comision_eur: p.comisionEur, eurusd: p.eurusd, marca: Date.now() };
    const { linea } = elegida;
    const cierreAnterior = (s, fecha) => {
      if (s !== simbolo || !sesionesValor) return linea.cierreAnterior(s, fecha);
      const i = cartera.ultimoIndiceHasta(sesionesValor.fechas, diaAnterior(fecha));
      return i < 0 ? null : sesionesValor.cierres[i];
    };
    const estado = cartera.reconstruir({ ...linea, cierreAnterior, operaciones: [...linea.operaciones, op],
      eventos: { ...linea.eventos, [simbolo]: eventosValor[simbolo] ?? {} },
      divisas: { ...linea.divisas, [simbolo]: p.v.divisa } });
    return { op, estado };
  };

  /** Texto del problema de la operación, o null si se puede hacer. */
  const comprobar = (p) => {
    if (!Number.isInteger(p.titulos) || p.titulos <= 0) return "El número de títulos debe ser un entero mayor que cero.";
    const { op, estado } = conOperacion(p);
    if (!estado.problema) return null;
    if (estado.problema.op !== op && elegida.estado.problema) return null; // ya estaba antes de esta operación
    return estado.problema.op === op ? estado.problema.texto
      : `Con esta operación, la del ${f.fecha(estado.problema.fecha)} ya no sería posible: ${estado.problema.texto.toLowerCase()}`;
  };

  const maximoTitulos = () => {
    const base = calcular(1);
    if (!base) return 0;
    // Cota: todo el efectivo que ha entrado en la cartera (capital, ventas, dividendos y ajustes).
    const { estado, linea } = elegida;
    const entradas = linea.capitalInicial + estado.dividendosEur + estado.ajustesEur
      + linea.operaciones.filter((o) => o.tipo === "venta").reduce((s, o) => s + o.importe_eur, 0);
    const tope = tipo === "venta" ? 1e9 : entradas / base.precioEur;
    return mayorQueCabe(tope, (n) => n === 0 || !comprobar(calcular(n)));
  };

  const actualizar = () => {
    const p = calcular();
    const maximo = maximoTitulos();
    $("#maximo").textContent = !simbolo ? "" : tipo === "compra" ? `Con el efectivo de la cartera puedes comprar hasta ${f.titulos(maximo)} títulos.`
      : maximo ? `Puedes vender hasta ${f.titulos(maximo)} títulos.` : `No tienes ${simbolo} en esta cartera.`;
    const cot = cotizaciones[simbolo];
    $("#texto-precio").textContent = cot ? `· ${f.precio(cot.precio, ficha(simbolo)?.divisa)} · ${f.fechaHora(cot.hora)}` : "";
    if (modo === "anterior") {
      const elegido = $("#fecha-operacion").value;
      $("#texto-cierre").textContent = !simbolo ? "Elige un valor."
        : !sesionesValor ? "Cargando precios…"
        : p ? `Cierre del ${f.fecha(p.fecha)}: ${f.precio(p.precio, p.v.divisa)}${p.fecha !== elegido ? " (último día con sesión)" : ""}`
        : `Sin cotización de ${simbolo} ese día ni antes desde el inicio de la cartera.`;
    }
    const resumen = $("#resumen");
    if (!p) {
      resumen.innerHTML = `<h3 class="titulo-seccion">Resumen</h3><p class="vacio">Elige un valor.</p>`;
      $("#despues").hidden = true;
      $("#en-cartera").hidden = true;
      return;
    }
    const fallo = comprobar(p);
    const dias = p.hora ? (Date.now() - new Date(p.hora).getTime()) / 86400000 : 0;
    const total = tipo === "compra" ? p.importeEur + p.comisionEur : p.importeEur - p.comisionEur;
    resumen.innerHTML = `<h3 class="titulo-seccion">Resumen</h3>
      <p style="margin:0;font-size:22px;font-weight:800">${tipo === "compra" ? "Comprar" : "Vender"} ${f.titulos(p.titulos || 0)} ${f.html(simbolo)}</p>
      <div class="pila" style="gap:0">
        ${[[modo === "ultimo" ? "Precio" : `Cierre del ${f.fecha(p.fecha)}`, f.precio(p.precio, p.v.divisa)],
           ...(p.v.divisa === "USD" ? [[`Importe en dólares`, f.precio(p.titulos * p.precio, "USD")],
                                       [`Tipo de cambio del BCE (${f.fechaCorta(modo === "ultimo" ? cambio.fecha : p.fecha)})`, `${f.num(p.eurusd, 4)} $/€`]] : []),
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

    // Efecto en la cartera de hoy: recalculada con la operación en su fecha (dividendos incluidos).
    const pos = elegida.estado.posiciones[simbolo];
    const titulosAntes = pos?.titulos ?? 0;
    const despues = conOperacion(p).estado;
    const precioHoy = cot?.precio ?? p.precio;
    const precios = { ...Object.fromEntries(elegida.valoracion.posiciones.map((x) => [x.simbolo, x.precio])), [simbolo]: precioHoy };
    const valoracionDespues = cartera.valorar(despues, precios, { ...elegida.divisas, [simbolo]: p.v.divisa }, cambio.valor);
    const titulosDespues = despues.posiciones[simbolo]?.titulos ?? 0;
    const efectivoDespues = despues.efectivo;
    const totalCartera = valoracionDespues.totalEur;
    const valorAntes = elegida.valoracion.posiciones.find((x) => x.simbolo === simbolo)?.valorEur ?? 0;
    const valorDespues = valoracionDespues.posiciones.find((x) => x.simbolo === simbolo)?.valorEur ?? 0;
    $("#despues").hidden = false;
    $("#despues").innerHTML = `<h3 class="titulo-seccion">Después de operar</h3>
      ${modo === "anterior" ? `<span class="aviso" style="margin-top:-6px">Hoy, con los dividendos y desdoblamientos desde el ${f.fecha(p.fecha)}.</span>` : ""}
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

  const limitesFecha = () => {
    const entrada = $("#fecha-operacion");
    entrada.min = fechaMinima();
    entrada.max = diaAnterior(f.hoy());
    if (entrada.value && entrada.value < entrada.min) entrada.value = entrada.min;
  };
  $("#carteras").addEventListener("change", async (e) => {
    elegida = operables[Number(e.target.value)];
    pintarCarteras();
    await cargarSesiones();
    limitesFecha();
    actualizar();
  });
  $("#valor").addEventListener("change", async (e) => {
    simbolo = e.target.value;
    pintarCarteras();
    actualizar();
    await pintarValor();
    limitesFecha();
    actualizar();
  });
  $("#modos").addEventListener("change", async (e) => {
    if (e.target.name !== "precio") return;
    modo = e.target.value;
    $$("#modos .opcion").forEach((o) => o.classList.toggle("elegida", o.querySelector("input").checked));
    $("#dia-anterior").hidden = modo !== "anterior";
    $("#aviso-anterior").hidden = modo !== "anterior";
    actualizar();
    await cargarSesiones();
    limitesFecha();
    if (modo === "anterior" && !$("#fecha-operacion").value) $("#fecha-operacion").value = fechaMinima();
    actualizar();
  });
  $("#fecha-operacion").addEventListener("change", actualizar);
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
    const fallo = comprobar(p);
    const error = $("#error-operacion");
    if (fallo) { error.textContent = fallo; error.hidden = false; return; }
    $$("button[type=submit]").forEach((b) => { b.disabled = true; });
    try {
      await datos.registrarOperacion(elegida.cartera, sesion.usuario, {
        fecha_mercado: p.fecha, simbolo, tipo, titulos: p.titulos, precio: p.precio, divisa: p.v.divisa,
        eurusd: p.eurusd, importe_eur: p.importeEur, ...(p.comisionEur ? { comision_eur: p.comisionEur } : {}) });
      invalidar();
      location.hash = enlaceCartera(elegida.cartera);
    } catch (err) {
      error.textContent = mensajeError(err);
      error.hidden = false;
      $$("button[type=submit]").forEach((b) => { b.disabled = false; });
    }
  });
}

