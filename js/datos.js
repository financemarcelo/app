// Lectura y escritura en Firestore. La estructura de los documentos está descrita en el
// repositorio de datos (ARQUITECTURA.md).
import {
  db, doc, getDoc, getDocs, collection, addDoc, deleteDoc, writeBatch, query, orderBy, serverTimestamp,
} from "./firebase.js";

const cache = new Map();
const CADUCIDAD_MS = 60_000; // cotizaciones y año en curso: se vuelven a leer tras un minuto

async function leer(ruta, { caduca = false } = {}) {
  const guardado = cache.get(ruta);
  if (guardado && (!caduca || Date.now() - guardado.momento < CADUCIDAD_MS)) return guardado.datos;
  const instantanea = await getDoc(doc(db, ruta));
  const datos = instantanea.exists() ? instantanea.data() : null;
  cache.set(ruta, { datos, momento: Date.now() });
  return datos;
}

// ── Mercado ──────────────────────────────────────────────────────────────────

export async function listaValores() {
  return (await leer("mercado/valores"))?.lista ?? [];
}

export async function cotizaciones() {
  return (await leer("mercado/cotizaciones", { caduca: true }))?.valores ?? {};
}

export async function tipoCambioActual() {
  return leer("mercado/eurusd", { caduca: true });
}

/** Ficha del valor con sus dividendos y desdoblamientos. */
export function fichaValor(simbolo) {
  return leer(`valores/${simbolo}`);
}

/** Sesiones de un valor entre dos años: {fechas, cierres, cierresAjustados}. */
export async function sesiones(simbolo, desdeAnio, hastaAnio) {
  const anioActual = new Date().getUTCFullYear();
  const anios = [];
  for (let a = desdeAnio; a <= hastaAnio; a++) anios.push(a);
  const docs = await Promise.all(anios.map((a) => leer(`valores/${simbolo}/precios/${a}`,
                                                       { caduca: a === anioActual })));
  const r = { fechas: [], cierres: [], cierresAjustados: [] };
  for (const d of docs) {
    if (!d) continue;
    const series = JSON.parse(d.datos);
    r.fechas.push(...series.fechas);
    r.cierres.push(...series.cierre);
    r.cierresAjustados.push(...series.cierre_ajustado);
  }
  return r;
}

/** Tipo de cambio de referencia del BCE (dólares por euro) entre dos años: {fechas, valores}. */
export async function serieTipoCambio(desdeAnio, hastaAnio) {
  const anioActual = new Date().getUTCFullYear();
  const r = { fechas: [], valores: [] };
  for (let a = desdeAnio; a <= hastaAnio; a++) {
    const d = await leer(`tipos_cambio/EURUSD/anios/${a}`, { caduca: a === anioActual });
    if (!d) continue;
    const serie = JSON.parse(d.datos);
    r.fechas.push(...serie.fechas);
    r.valores.push(...serie.valores);
  }
  return r;
}

// ── Carteras ─────────────────────────────────────────────────────────────────

const rutaCarteras = (uid) => collection(db, "usuarios", uid, "carteras");
const rutaOperaciones = (uid, id) => collection(db, "usuarios", uid, "carteras", id, "operaciones");

export async function carteras(uid) {
  const r = await getDocs(query(rutaCarteras(uid), orderBy("creada")));
  return r.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function crearCartera(uid, { nombre, capitalInicial, fechaInicio }) {
  const ref = await addDoc(rutaCarteras(uid), {
    nombre, divisa: "EUR", capital_inicial: capitalInicial, fecha_inicio: fechaInicio,
    creada: serverTimestamp(),
  });
  return ref.id;
}

export async function operaciones(uid, carteraId) {
  const r = await getDocs(query(rutaOperaciones(uid, carteraId), orderBy("creada")));
  return r.docs.map((d) => {
    const datos = d.data();
    return { id: d.id, ...datos, marca: datos.creada?.toMillis?.() ?? Date.now() };
  });
}

export function registrarOperacion(uid, carteraId, operacion) {
  return addDoc(rutaOperaciones(uid, carteraId), { ...operacion, creada: serverTimestamp() });
}

export async function borrarCartera(uid, carteraId) {
  const ops = await getDocs(rutaOperaciones(uid, carteraId));
  const lote = writeBatch(db);
  ops.docs.forEach((d) => lote.delete(d.ref));
  await lote.commit();
  await deleteDoc(doc(db, "usuarios", uid, "carteras", carteraId));
}
