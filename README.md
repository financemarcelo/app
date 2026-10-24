# Carteras

Aplicación web para crear carteras artificiales con acciones del IBEX 35 y del Dow Jones
Industrial Average, compartirlas, operar con ellas, seguir su valor en euros y anotar ideas
en cuadernos compartidos.

Se publica con GitHub Pages en <https://financemarcelo.github.io/app/>.

## Acceso

- **Portada**: quien no ha entrado ve el propósito de la aplicación, los dos mercados, el
  método, las funciones, las fuentes de datos y las limitaciones. No muestra datos de
  carteras ni de cuentas; la figura de los índices usa valores aproximados escritos en el
  código, porque los datos de mercado solo se leen con una cuenta aprobada.
- Inicio de sesión con cualquier cuenta de Google (Firebase Authentication). Al entrar se
  guarda el perfil de la cuenta (nombre, correo, alta y último acceso). Una cuenta nueva
  queda pendiente hasta que el administrador la aprueba; mientras tanto solo ve un aviso.

## Páginas

- **Inicio**: patrimonio total, variación del día, rentabilidad, dividendos del año,
  tarjetas de cada cartera con su evolución, actividad reciente, valores que más suben y
  bajan, valores en seguimiento y próximos dividendos estimados.
- **Carteras**: una pestaña por cartera. Indicadores (valor, rentabilidad, efectivo,
  dividendos, ajustes y comisiones), evolución en base 100 frente al IBEX 35 o al Dow Jones,
  reparto por mercado, sector y divisa, posiciones, movimientos filtrables, miembros,
  cambio de nombre, eliminación y exportación a CSV. Alta de carteras nuevas con un
  capital inicial en euros, que empiezan el día de su creación.
- **Operar**: elección de la cartera y del valor, compra o venta por títulos o por importe
  al último precio, resumen con la comisión simulada y efecto en la cartera. Se llega desde
  una cartera, desde la ficha de un valor o desde la barra inferior del móvil.
- **Mercado**: estado de las bolsas de Madrid y Nueva York, tipo euro-dólar, índices con su
  gráfico y amplitud del día, lista de valores con filtro por índice, sector y seguimiento,
  orden, rango de 52 semanas, rentabilidad por dividendo y mapa de calor.
- **Ficha de un valor**: precio y variación del día, gráfico de precio o con dividendos (de
  un mes a desde 2006), rentabilidad por año, cifras clave, posiciones en las carteras,
  dividendos, desdoblamientos y ajustes.
- **Dividendos**: cobrados por mes, por valor y por cartera; estimación hasta fin de año y
  próximos cobros; exportación a CSV.
- **Cuaderno**: cuadernos de notas (idea, hipótesis, resultado o pregunta) con vínculos a
  valores, a carteras propias y a gráficos, estado «pendiente de comprobar», comentarios,
  filtros y búsqueda. El propietario invita por correo con permiso de edición o de lectura.
  Los miembros de un cuaderno leen, en solo lectura, las carteras vinculadas en sus notas.
  «Apuntar», en la cabecera y en las fichas, abre un panel para escribir una nota sobre lo
  que se está viendo.
- **Perfil**: cuenta, preferencias (moneda de valoración en euros o dólares, tema claro u
  oscuro, variaciones en porcentaje o importe, página al entrar, densidad), comisiones
  simuladas, exportación, fuentes de datos con su última carga y borrado de las carteras
  propias.
- **Administración** (solo administradores): cuentas pendientes de aprobación (aprobar o
  rechazar) y cuentas con acceso (eliminar). Rechazar o eliminar retira el acceso en ese
  momento; un proceso automático del repositorio de datos desactiva después la cuenta y
  borra su perfil, sus carteras, sus operaciones y sus cuadernos.

## Carteras compartidas

El propietario añade o quita miembros por correo. Los miembros ven la cartera y registran
operaciones a su nombre; pueden salir de ella. «Avisar por correo» abre el programa de
correo con el enlace a la aplicación; la aplicación no envía correos.

## Cálculo de una cartera

El estado de una cartera se reconstruye en cada consulta a partir de sus operaciones y de
los eventos de cada valor (`js/cartera.js`):

- Las compras y ventas se ejecutan al último precio disponible. Los valores en dólares se
  convierten con el tipo de cambio de referencia del BCE.
- La comisión simulada (porcentaje del importe con mínimo y máximo opcionales) se guarda en
  cada operación y se descuenta del efectivo.
- Un dividendo se abona en efectivo a quien tenía títulos al empezar su fecha ex-dividendo.
- Un desdoblamiento multiplica los títulos y conserva el coste.
- Un ajuste (ampliación con derechos, dividendo en acciones o escisión) no cambia los
  títulos: se abona en efectivo el valor que pierde la acción.
- La plusvalía usa el precio medio de compra; las ventas reducen el coste en proporción.
- Los precios guardados son los negociados cada día. Los gráficos de precios los muestran
  en la escala de hoy (corregidos por los desdoblamientos posteriores).

En dólares, cada importe pasado (capital inicial, operaciones, comisiones, dividendos y
ajustes) se convierte al tipo del BCE de su fecha, y el valor actual, al de hoy; la
rentabilidad incluye así el efecto del tipo de cambio. El efectivo de la cartera sigue en
euros: las operaciones se pagan siempre en euros.

Los dividendos futuros son **estimaciones**: repiten los del año anterior en las mismas
fechas con los títulos de hoy, y se marcan como tales en pantalla.

## Datos

Los datos de mercado están en Firestore (proyecto `finanzas-marcelo-4dd03`). Los cargan
procesos automáticos de un repositorio privado: precios diarios y estadísticas de cada
valor e índice tras el cierre de Nueva York, y cotizaciones cada 15 minutos en horario de
mercado. Cada cartera se guarda bajo la cuenta de su propietario
(`usuarios/{uid}/carteras`) con la lista de correos de sus miembros y de sus lectores; las
reglas de Firestore solo dejan leerla a esos correos y registrar operaciones a los miembros,
a nombre de quien las hace. Las preferencias se guardan en
`usuarios/{uid}/ajustes/preferencias` y los cuadernos en `cuadernos/{id}`.

Los precios, dividendos y tipos de cambio se guardan desde el primer día disponible, pero la
aplicación los lee y los muestra desde 2006 (`js/datos.js`), para que todos los valores
cubran el mismo periodo.

Las carteras calculadas se guardan en memoria durante un minuto o hasta la siguiente
escritura; la cartera abierta se calcula siempre de nuevo.

## Versiones en el navegador

`index.html` pide la hoja de estilos, el módulo principal y, mediante un mapa de importación,
cada módulo con una huella de su contenido (`?v=…`). Así el navegador nunca mezcla ficheros
de una versión anterior guardados en su caché con los de la nueva. `npm run versiones`
actualiza las huellas y `npm test` comprueba que están al día.

Si la aplicación no arranca (un módulo que no se descarga o un error al cargarlo), la página
lo explica con un botón para volver a cargar en lugar de quedarse en «Cargando…».

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html`, `css/estilos.css` | Página, cabecera, barra inferior del móvil y estilos (claro y oscuro) |
| `js/app.js` | Arranque, sesión, enrutador, buscador y botón «Apuntar» |
| `js/vistas/` | Una vista por página: `portada`, `pendiente`, `inicio`, `carteras`, `operar`, `mercado`, `valor`, `dividendos`, `cuaderno`, `perfil`, `admin`; `apuntar` (panel de notas) y `comun` (enlaces y textos compartidos) |
| `js/cartera.js` | Cálculo de carteras y comisiones (sin dependencias) |
| `js/calculos.js` | Sesiones de las bolsas, reparto, dividendos estimados, base 100 y CSV (sin dependencias) |
| `js/resumen.js` | Cálculo de las carteras de la cuenta con los datos de Firestore |
| `js/datos.js` | Lectura y escritura en Firestore |
| `js/sesion.js` | Cuenta, estado de acceso y preferencias de la sesión |
| `js/moneda.js` | Moneda de presentación (euro o dólar) e importes con su símbolo |
| `js/ui.js` | Piezas de interfaz compartidas (indicadores, tablas, ventanas) |
| `js/miembros.js` | Correos de los miembros y avisos por correo (sin dependencias) |
| `js/firebase.js`, `js/config.js` | Inicialización y configuración pública de Firebase |
| `js/formato.js`, `js/graficos.js` | Formato en español y gráficos (Chart.js) |
| `scripts/version.mjs` | Huellas de los ficheros en `index.html` (`npm run versiones`) |
| `tests/` | Pruebas (`npm test`, Node.js 20 o posterior) |

## Ejecución local

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
npm run versiones             # tras cambiar cualquier fichero de css/ o js/
npm test                      # pruebas
```
