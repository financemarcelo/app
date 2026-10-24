// Huella del contenido de cada fichero de la aplicación en index.html (?v=…), para que el navegador
// no mezcle ficheros de versiones distintas guardados en su caché. Uso: npm run versiones.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const MAPA = /<script type="importmap">[\s\S]*?<\/script>/;
const ESTILOS = /href="css\/estilos\.css(\?v=\w+)?"/;
const PRINCIPAL = /src="js\/app\.js(\?v=\w+)?"/;

const huella = (ruta) => createHash("sha256").update(readFileSync(join(RAIZ, ruta))).digest("hex").slice(0, 10);

/** Módulos de la aplicación (js/ y sus subcarpetas), ordenados. */
export function modulos(carpeta = "js") {
  return readdirSync(join(RAIZ, carpeta), { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? modulos(`${carpeta}/${e.name}`) : e.name.endsWith(".js") ? [`${carpeta}/${e.name}`] : [])).sort();
}

/**
 * index.html con la huella actual en la hoja de estilos, en el módulo principal y en el mapa de
 * importación, que hace que cada `import` pida el fichero con su huella.
 */
export function indiceVersionado(html) {
  for (const [nombre, patron] of [["mapa de importación", MAPA], ["hoja de estilos", ESTILOS], ["módulo principal", PRINCIPAL]]) {
    if (!patron.test(html)) throw new Error(`index.html no tiene ${nombre}`);
  }
  const entradas = modulos().filter((m) => m !== "js/app.js").map((m) => `    "./${m}": "./${m}?v=${huella(m)}"`);
  const mapa = `<script type="importmap">\n  { "imports": {\n${entradas.join(",\n")}\n  } }\n  </script>`;
  return html
    .replace(MAPA, mapa)
    .replace(ESTILOS, `href="css/estilos.css?v=${huella("css/estilos.css")}"`)
    .replace(PRINCIPAL, `src="js/app.js?v=${huella("js/app.js")}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ruta = join(RAIZ, "index.html");
  writeFileSync(ruta, indiceVersionado(readFileSync(ruta, "utf8")));
  console.log("index.html actualizado.");
}
