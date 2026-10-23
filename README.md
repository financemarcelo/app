# Carteras

Aplicación web para crear carteras artificiales con acciones del IBEX 35 y del Dow Jones
Industrial Average, compartirlas, operar con ellas y seguir su valor en euros.

Se publica con GitHub Pages en <https://financemarcelo.github.io/app/>.

## Funciones

- Inicio de sesión con cualquier cuenta de Google (Firebase Authentication). Al entrar se
  guarda el perfil de la cuenta (nombre, correo, alta y último acceso). Una cuenta nueva
  queda pendiente hasta que el administrador la aprueba; mientras tanto solo ve un aviso.
- **Mercado**: nivel y variación del día del IBEX 35 y del Dow Jones; al elegir un índice,
  su gráfico (de un mes a 20 años). Último precio, variación del día y hora de la cotización
  de cada valor (unos 15 minutos de retraso), con búsqueda y filtro por índice.
- **Ficha de un valor**: datos de identificación, gráfico de cotización (de un mes a 20
  años) y dividendos recientes.
- **Carteras**: crear carteras con un capital inicial en euros; comprar y vender títulos al
  último precio; posiciones con precio medio y plusvalía; rentabilidad; evolución diaria del
  valor; historial de operaciones (con quién registró cada una), dividendos, desdoblamientos
  y ajustes.
- **Carteras compartidas**: el propietario añade o quita miembros por correo. Los miembros
  ven la cartera y registran operaciones a su nombre; pueden salir de ella. «Avisar por
  correo» abre el programa de correo con el enlace a la aplicación; la aplicación no envía
  correos.
- **Administración** (solo administradores): cuentas pendientes de aprobación (aprobar o
  rechazar) y cuentas con acceso (eliminar). Rechazar o eliminar retira el acceso en ese
  momento; un proceso automático del repositorio de datos desactiva después la cuenta y
  borra su perfil, sus carteras y sus operaciones.

## Cálculo de una cartera

El estado de una cartera se reconstruye en cada consulta a partir de sus operaciones y de
los eventos de cada valor (`js/cartera.js`):

- Las compras y ventas se ejecutan al último precio disponible. Los valores en dólares se
  convierten con el tipo de cambio de referencia del BCE.
- Un dividendo se abona en efectivo a quien tenía títulos al empezar su fecha ex-dividendo.
- Un desdoblamiento multiplica los títulos y conserva el coste.
- Un ajuste (ampliación con derechos, dividendo en acciones o escisión) no cambia los
  títulos: se abona en efectivo el valor que pierde la acción.
- La plusvalía usa el precio medio de compra; las ventas reducen el coste en proporción.

## Datos

Los datos de mercado están en Firestore (proyecto `finanzas-marcelo-4dd03`). Los cargan
procesos automáticos de un repositorio privado: precios diarios tras el cierre de Nueva
York y cotizaciones cada 15 minutos en horario de mercado. Cada cartera se guarda bajo la
cuenta de su propietario (`usuarios/{uid}/carteras`) con la lista de correos de sus
miembros; las reglas de Firestore solo dejan leerla a esos correos y registrar operaciones
a nombre de quien las hace.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html`, `css/estilos.css` | Página y estilos |
| `js/app.js` | Vistas y navegación |
| `js/cartera.js` | Cálculo de carteras (sin dependencias) |
| `js/datos.js` | Lectura y escritura en Firestore |
| `js/miembros.js` | Correos de los miembros y aviso por correo (sin dependencias) |
| `js/firebase.js`, `js/config.js` | Inicialización y configuración pública de Firebase |
| `js/formato.js`, `js/graficos.js` | Formato en español y gráficos (Chart.js) |
| `tests/` | Pruebas (`npm test`, Node.js 20 o posterior) |

## Ejecución local

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
npm test                      # pruebas
```
