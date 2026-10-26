// Portada para quien no ha entrado: propósito, mercados, método, funciones, datos y limitaciones.
import { entrar } from "../firebase.js";
import { $$, contenido } from "../ui.js";
import { PLAZAS, instanteEnZona, enZona, horaPeninsular } from "../calculos.js";

// Índices de precios (sin dividendos), base 100 = enero de 2006. Valores aproximados para la
// figura de la portada: quien no ha entrado no puede leer los datos de mercado.
const IBEX_APROXIMADO = [[2006, 100], [2007, 132], [2007.85, 149], [2008, 142], [2009.2, 64], [2010, 111], [2011, 92],
  [2012, 80], [2012.55, 56], [2013, 76], [2014, 93], [2015.3, 107], [2016, 89], [2016.5, 74], [2017, 87], [2018, 94],
  [2019, 80], [2020, 89], [2020.25, 57], [2021, 75], [2022, 81], [2023, 77], [2024, 94], [2025, 108], [2026, 150],
  [2026.8, 148]];
const DOW_APROXIMADO = [[2006, 100], [2007, 116], [2007.8, 132], [2008, 124], [2009.2, 61], [2010, 97], [2011, 108],
  [2012, 114], [2013, 122], [2014, 155], [2015, 167], [2016, 163], [2017, 185], [2018, 231], [2019, 218], [2020, 267],
  [2020.25, 174], [2021, 286], [2022, 340], [2022.75, 271], [2024, 352], [2025, 398], [2026, 449], [2026.8, 438]];

function curva(anclas, ancho, alto, maximo) {
  const [t0, t1] = [anclas[0][0], anclas[anclas.length - 1][0]];
  return anclas.map(([t, v]) => `${(((t - t0) / (t1 - t0)) * ancho).toFixed(1)},${(alto - (v / maximo) * alto).toFixed(1)}`).join(" ");
}

/** Posición (en % del día) de la sesión de una plaza, en hora peninsular. */
function franja(plaza) {
  const hoy = enZona(new Date(), plaza.zona).fecha;
  const minutos = (instante) => { const { hora, minuto } = enZona(instante, "Europe/Madrid"); return hora * 60 + minuto; };
  const abre = instanteEnZona(hoy, ...plaza.abre, plaza.zona), cierra = instanteEnZona(hoy, ...plaza.cierra, plaza.zona);
  return { izquierda: (minutos(abre) / 1440) * 100, ancho: ((minutos(cierra) - minutos(abre)) / 1440) * 100,
           texto: `${horaPeninsular(abre)}–${horaPeninsular(cierra)}` };
}

const PROPOSITO = [
  ["1.1", "Contrastar", "Llevar una idea sobre los mercados a una cartera concreta y comprobar con precios reales si se sostiene."],
  ["1.2", "Medir", "Ver el efecto de los dividendos, del tipo de cambio y de los desdoblamientos en la rentabilidad, en euros."],
  ["1.3", "Registrar", "Dejar por escrito cada hipótesis y su resultado, y compartirlo con quien se quiera discutir."],
];
const MERCADOS = [
  { ciudad: "Madrid", indice: "IBEX 35", clase: "background:var(--acento);color:#fff", filas: [
    ["Valores", "Todo el mercado continuo, unos 120; el IBEX 35 reúne los 35 más negociados"], ["Divisa", "Euro"],
    ["Sesión", "De 9:00 a 17:30"],
    ["Pondera por", "Capitalización bursátil ajustada por capital flotante"],
    ["Base", "3.000 puntos el 29 de diciembre de 1989"], ["Revisión", "Comité Asesor Técnico, en junio y diciembre"]] },
  { ciudad: "Nueva York", indice: "Dow Jones", clase: "background:var(--fuerte);color:var(--sobre-fuerte)", filas: [
    ["Valores", "30 grandes empresas de Estados Unidos, del NYSE y del Nasdaq"],
    ["Divisa", "Dólar; en la aplicación se convierte a euros con el tipo del BCE"],
    ["Sesión", "De 15:30 a 22:00, hora peninsular"], ["Pondera por", "Precio de la acción, no por tamaño de la empresa"],
    ["Origen", "Publicado desde 1896"], ["Revisión", "Comité de S&P Dow Jones Indices, sin calendario fijo"]] },
];
const METODO = [
  ["01", "Plantea", "Escribe la hipótesis en el cuaderno: qué esperas que pase y por qué."],
  ["02", "Monta", "Crea una cartera artificial con el capital inicial que quieras."],
  ["03", "Opera", "Compra y vende al último precio. Dividendos y desdoblamientos se aplican solos."],
  ["04", "Anota", "Compara el resultado con lo que esperabas y apúntalo junto a la hipótesis."],
];
const FUNCIONES = [
  ["Carteras artificiales", "Tantas como quieras, cada una con su capital inicial, propias o compartidas."],
  ["Operaciones al último precio", "Cotizaciones cada 15 minutos, con unos 15 de retraso, y comisión simulada opcional."],
  ["Rentabilidad en euros", "Los valores en dólares se convierten con el tipo de referencia del BCE."],
  ["Eventos automáticos", "Dividendos, desdoblamientos y ajustes de capital, cada uno en su fecha."],
  ["Veinte años de historia", "Gráficos de precios diarios de cada valor y de los dos índices desde 2006."],
  ["Cuaderno compartido", "Notas, hipótesis y resultados, con las personas que invites por correo."],
];
const MATERIALES = [
  ["Precios diarios", "Yahoo Finance", "diaria · desde 2006"], ["Cotizaciones", "Yahoo Finance", "cada 15 min"],
  ["Dividendos y desdoblamientos", "Yahoo Finance", "diaria · desde 2006"],
  ["Tipo de cambio euro-dólar", "Banco Central Europeo", "diaria"],
];
const LIMITACIONES = [
  "Las cotizaciones llegan con unos 15 minutos de retraso.",
  "Los dividendos se cuentan en bruto: no se descuentan impuestos.",
  "Las operaciones no mueven el precio, aunque sean muy grandes.",
  "Solo incluye los valores que cotizan hoy: los del mercado continuo y los 30 del Dow Jones.",
  "Es una herramienta de estudio: no es asesoramiento financiero.",
];

const seccion = (numero, titulo, extra = "") => `<div class="fila" style="gap:8px 20px;align-items:baseline">
  <span class="numero">${numero}</span><h2>${titulo}</h2>${extra}</div>`;

export function vista({ mensaje } = {}) {
  const madrid = franja(PLAZAS.madrid), ny = franja(PLAZAS.nuevayork);
  const solape = Math.max(0, madrid.izquierda + madrid.ancho - ny.izquierda);
  const main = contenido();
  main.className = "portada";
  main.innerHTML = `
  <header style="border-bottom:2px solid var(--fuerte)">
    <div class="ancho-portada fila entre" style="padding-top:16px;padding-bottom:16px;gap:16px 32px">
      <div class="fila" style="align-items:baseline;gap:12px"><span class="marca">Carteras</span>
        <span class="mono suave" style="font-size:12px">cuaderno de mercados</span></div>
      <nav class="fila" style="gap:22px;font-size:13px;text-transform:uppercase">
        <a href="#proposito" style="text-decoration:none">§1 Propósito</a><a href="#mercados" style="text-decoration:none">§2 Mercados</a>
        <a href="#metodo" style="text-decoration:none">§3 Método</a><a href="#datos" style="text-decoration:none">§5 Datos</a></nav>
      <button class="boton negro" data-entrar type="button">Entrar con Google</button>
    </div>
  </header>

  <section class="milimetrado" style="border-bottom:2px solid var(--fuerte)">
    <div class="ancho-portada" style="padding-top:56px;padding-bottom:64px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:48px;align-items:center">
      <div class="pila" style="gap:22px">
        <span class="numero" style="text-transform:uppercase;letter-spacing:.06em;font-size:13px">§0 · Resumen</span>
        <h1>Un laboratorio para poner a prueba ideas sobre la bolsa.</h1>
        <p style="margin:0;font-size:19px;line-height:1.6;max-width:540px">Carteras artificiales con acciones reales de la Bolsa española y del Dow Jones. Precios de verdad, dinero imaginario y un cuaderno para anotar cada hipótesis y lo que salió.</p>
        <div class="fila"><button class="boton" data-entrar type="button">Entrar con Google</button>
          <a class="boton linea" href="#metodo" style="background:var(--superficie)">Leer el método</a></div>
        <p class="error" id="error-acceso" ${mensaje ? "" : "hidden"}>${mensaje ?? ""}</p>
        <span class="mano" style="font-size:24px">acceso por invitación: el administrador aprueba cada cuenta</span>
      </div>
      <figure class="panel fuerte" style="gap:10px">
        <div class="fila entre mono" style="font-size:12px;text-transform:uppercase"><strong>Fig. 1</strong><span class="suave">2006 → 2026</span></div>
        <div style="position:relative">
          <svg viewBox="0 0 600 300" preserveAspectRatio="none" style="width:100%;height:300px;display:block" role="img" aria-label="IBEX 35 y Dow Jones desde 2006, base 100">
            ${[60, 120, 180].map((y) => `<line x1="0" y1="${y}" x2="600" y2="${y}" stroke="var(--linea-suave)" vector-effect="non-scaling-stroke"></line>`).join("")}
            <line x1="0" y1="240" x2="600" y2="240" stroke="var(--fuerte)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"></line>
            <line x1="0" y1="300" x2="600" y2="300" stroke="var(--fuerte)" vector-effect="non-scaling-stroke"></line>
            <polyline points="${curva(DOW_APROXIMADO, 600, 300, 500)}" fill="none" stroke="var(--fuerte)" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
            <polyline points="${curva(IBEX_APROXIMADO, 600, 300, 500)}" fill="none" stroke="var(--acento)" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline>
          </svg>
          <span style="position:absolute;right:4px;top:44px;font-size:13px;font-weight:800">Dow Jones · 438</span>
          <span style="position:absolute;right:4px;top:176px;font-size:13px;font-weight:800;color:var(--acento)">IBEX 35 · 148</span>
          <span class="mono suave" style="position:absolute;left:6px;top:214px;font-size:11px">base 100</span>
          <span class="anotacion" style="left:11%;top:190px;transform:rotate(-4deg)">crisis de 2008 ↓</span>
          <span class="anotacion" style="left:36%;top:60px;max-width:200px;transform:rotate(-3deg)">sin dividendos: IBEX ≈ 1,9 % al año, Dow ≈ 7,4 %. ¿Cuánto aportan los dividendos?</span>
        </div>
        <div class="fila entre mono suave" style="font-size:11px"><span>2006</span><span>2011</span><span>2016</span><span>2021</span><span>2026</span></div>
        <figcaption style="border-top:1px solid var(--linea-suave);padding-top:8px">Fig. 1 — IBEX 35 y Dow Jones como índices de precios, base 100 = enero de 2006. No incluyen dividendos. Valores aproximados.</figcaption>
      </figure>
    </div>
  </section>

  <section class="ancho-portada">
    <div class="kpis" style="border-top:0">
      ${[["≈150", "valores: el mercado continuo y los 30 del Dow Jones"], ["2", "bolsas: Madrid y Nueva York"],
         ["2006", "primer año con precios diarios"], ["15 min", "entre cotizaciones, en horario de mercado"]]
        .map(([c, t]) => `<div class="kpi"><span class="valor" style="font-size:36px;font-weight:800">${c}</span><span class="mono suave" style="font-size:12px">${t}</span></div>`).join("")}
    </div>
  </section>

  <section class="ancho-portada seccion" id="proposito">
    ${seccion("§1", "Propósito", '<span class="mano" style="font-size:24px">equivocarse sale gratis</span>')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));border-top:2px solid var(--fuerte)">
      ${PROPOSITO.map(([n, t, x]) => `<div class="pila" style="padding:22px 24px 22px 0;gap:10px"><span class="mono suave" style="font-size:12px">${n}</span>
        <h3 style="font-size:24px">${t}</h3><p style="margin:0;line-height:1.6">${x}</p></div>`).join("")}
    </div>
  </section>

  <section class="ancho-portada seccion" id="mercados">
    ${seccion("§2", "Dos mercados, una cartera")}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px">
      ${MERCADOS.map((m) => `<div class="panel fuerte sin-relleno">
        <div class="fila entre" style="padding:18px 20px;${m.clase}"><span style="font-size:28px;font-weight:800">${m.ciudad}</span>
          <span class="mono" style="font-size:13px;font-weight:700">${m.indice}</span></div>
        ${m.filas.map(([e, v]) => `<div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px;padding:11px 20px;border-top:1px solid var(--linea-suave)">
          <span class="mono suave" style="font-size:12px;padding-top:2px">${e}</span><span>${v}</span></div>`).join("")}
      </div>`).join("")}
    </div>
    <figure class="panel fuerte">
      <div class="fila entre mono" style="font-size:12px;text-transform:uppercase"><strong>Fig. 2 · Un día de mercado</strong><span class="suave">hora peninsular</span></div>
      <div style="position:relative;height:96px">
        <div style="position:absolute;left:0;right:0;top:46px;height:1px;background:var(--linea)"></div>
        <div style="position:absolute;left:${madrid.izquierda}%;width:${madrid.ancho}%;top:10px;height:28px;background:var(--acento);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;padding-left:8px;white-space:nowrap;overflow:hidden">Madrid · ${madrid.texto}</div>
        <div style="position:absolute;left:${ny.izquierda}%;width:${ny.ancho}%;top:54px;height:28px;background:var(--fuerte);color:var(--sobre-fuerte);font-size:13px;font-weight:700;display:flex;align-items:center;padding-left:8px;white-space:nowrap;overflow:hidden">Nueva York · ${ny.texto}</div>
        ${solape > 0 ? `<div style="position:absolute;left:${ny.izquierda}%;width:${solape}%;top:4px;bottom:8px;border:2px dashed var(--tinta)"></div>
        <span class="anotacion" style="left:${ny.izquierda}%;top:58px;transform:translateX(-100%) rotate(-3deg);padding-right:8px;white-space:nowrap">${Math.round((solape / 100) * 24 * 10) / 10} h con las dos abiertas →</span>` : ""}
      </div>
      <div class="fila entre mono suave" style="font-size:11px"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <figcaption>Fig. 2 — Sesiones ordinarias de hoy. Unas semanas al año el horario de Nueva York se desplaza una hora, porque Europa y Estados Unidos cambian la hora en fechas distintas.</figcaption>
    </figure>
  </section>

  <section class="ancho-portada seccion" id="metodo">
    ${seccion("§3", "Método")}
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
      ${METODO.map(([n, t, x], i) => `<div class="kpi" style="padding:24px 22px;gap:10px">
        <span style="font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1;${i === 0 ? "color:var(--acento)" : ""}">${n}</span>
        <h3 style="font-size:22px">${t}</h3><p style="margin:0;line-height:1.6">${x}</p></div>`).join("")}
    </div>
  </section>

  <section class="ancho-portada seccion">
    ${seccion("§4", "Qué hace la aplicación")}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:0 40px">
      ${FUNCIONES.map(([t, x]) => `<div style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding:16px 0;border-top:1px solid var(--linea)">
        <span class="mono" style="font-weight:700;color:var(--acento)">✓</span><span class="pila" style="gap:4px"><strong style="font-size:17px">${t}</strong><span>${x}</span></span></div>`).join("")}
    </div>
  </section>

  <section class="ancho-portada seccion" id="datos" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:40px">
    <div class="pila" style="gap:18px;min-width:0">
      ${seccion("§5", "Materiales: los datos")}
      <div style="border-top:2px solid var(--fuerte)">${MATERIALES.map(([d, fte, fr]) => `<div style="display:grid;grid-template-columns:minmax(140px,1.3fr) minmax(110px,1fr) minmax(100px,1fr);gap:12px;padding:12px 0;border-bottom:1px solid var(--linea-suave);font-size:14px">
        <strong>${d}</strong><span>${fte}</span><span class="mono suave" style="font-size:12px">${fr}</span></div>`).join("")}</div>
    </div>
    <div class="pila" style="gap:18px;min-width:0">
      ${seccion("§6", "Limitaciones")}
      <ol style="margin:0;padding:0 0 0 22px;border-top:2px solid var(--fuerte)">${LIMITACIONES.map((l) => `<li style="padding:12px 0 12px 6px;border-bottom:1px solid var(--linea-suave)">${l}</li>`).join("")}</ol>
    </div>
  </section>

  <section class="milimetrado" style="margin-top:56px;border-top:2px solid var(--fuerte);border-bottom:2px solid var(--fuerte)">
    <div class="ancho-portada fila entre" style="padding-top:56px;padding-bottom:56px;gap:24px">
      <h2 style="max-width:720px">Plantea la hipótesis. Monta la cartera. Mira qué pasa.</h2>
      <button class="boton" data-entrar type="button" style="padding:16px 26px">Entrar con Google</button>
    </div>
  </section>

  <footer class="ancho-portada fila entre mono suave" style="padding-top:22px;padding-bottom:22px;font-size:12px">
    <span>Proyecto personal de investigación. No es asesoramiento financiero.</span><span class="marca" style="font-family:inherit">Carteras</span>
  </footer>`;

  $$("[data-entrar]", main).forEach((b) => b.addEventListener("click", async () => {
    try {
      await entrar();
    } catch (e) {
      const mensajes = {
        "auth/popup-blocked": "El navegador ha bloqueado la ventana de acceso. Permite ventanas emergentes para esta página.",
        "auth/popup-closed-by-user": "Se cerró la ventana de acceso antes de terminar.",
        "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Authentication.",
        "auth/user-disabled": "Esta cuenta ha sido eliminada por el administrador.",
      };
      const error = main.querySelector("#error-acceso");
      error.textContent = mensajes[e.code] ?? e.message;
      error.hidden = false;
      error.scrollIntoView({ block: "center" });
    }
  }));
}
