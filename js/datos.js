// Lectura y escritura en Firestore. La estructura de los documentos está descrita en el
// repositorio de datos (ARQUITECTURA.md).
import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, addDoc, deleteDoc, writeBatch, query,
  where, orderBy, serverTimestamp, arrayRemove,
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

/** Fichas de los índices: identificador (IBEX35, DJIA), símbolo, nombre y divisa. */
export async function listaIndices() {
  return (await leer("mercado/valores"))?.indices ?? [];
}

export async function cotizaciones() {
  return (await leer("mercado/cotizaciones", { caduca: true }))?.valores ?? {};
}

export async function cotizacionesIndices() {
  return (await leer("mercado/cotizaciones", { caduca: true }))?.indices ?? {};
}

export async function tipoCambioActual() {
  return leer("mercado/eurusd", { caduca: true });
}

/** Ficha del valor con sus dividendos y desdoblamientos. */
export function fichaValor(simbolo) {
  return leer(`valores/${simbolo}`);
}

/** Sesiones diarias guardadas bajo `base`/precios entre dos años: {fechas, cierres, cierresAjustados}. */
async function serieDiaria(base, desdeAnio, hastaAnio) {
  const anioActual = new Date().getUTCFullYear();
  const anios = [];
  for (let a = desdeAnio; a <= hastaAnio; a++) anios.push(a);
  const docs = await Promise.all(anios.map((a) => leer(`${base}/precios/${a}`, { caduca: a === anioActual })));
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

export const sesiones = (simbolo, desdeAnio, hastaAnio) => serieDiaria(`valores/${simbolo}`, desdeAnio, hastaAnio);
export const sesionesIndice = (indice, desdeAnio, hastaAnio) => serieDiaria(`indices/${indice}`, desdeAnio, hastaAnio);

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

// ── Cuenta ───────────────────────────────────────────────────────────────────

const correoDe = (usuario) => usuario.email.toLowerCase();

/** Crea o actualiza el perfil de la cuenta al entrar. */
export async function guardarPerfil(usuario) {
  const ref = doc(db, "usuarios", usuario.uid);
  const datos = { nombre: (usuario.displayName ?? "").slice(0, 100), correo: correoDe(usuario),
                  ultimo_acceso: serverTimestamp() };
  if (!(await getDoc(ref)).exists()) datos.alta = serverTimestamp();
  await setDoc(ref, datos, { merge: true });
}

// ── Carteras ─────────────────────────────────────────────────────────────────
// Cada cartera se guarda bajo la cuenta de su propietario (usuarios/{uid}/carteras/{id}) y
// la leen todos los correos de `miembros`.

const RUTA_CARTERA = /^usuarios\/([^/]+)\/carteras\/[^/]+$/;

function deDocumento(d) {
  const datos = d.data();
  return { id: d.id, ruta: d.ref.path, ...datos,
           propietario: datos.propietario ?? d.ref.path.match(RUTA_CARTERA)?.[1], miembros: datos.miembros ?? [] };
}

/** Carteras propias y compartidas con la cuenta, de la más antigua a la más reciente. */
export async function carteras(usuario) {
  const correo = correoDe(usuario);
  const [propias, compartidas] = await Promise.all([
    getDocs(collection(db, "usuarios", usuario.uid, "carteras")),
    getDocs(query(collectionGroup(db, "carteras"), where("miembros", "array-contains", correo))),
  ]);
  const porRuta = new Map([...propias.docs, ...compartidas.docs].map((d) => [d.ref.path, deDocumento(d)]));
  const lista = [...porRuta.values()];
  // Las carteras creadas antes de poder compartirlas se completan con propietario y miembros.
  await Promise.all(lista.filter((c) => c.propietario === usuario.uid && !c.miembros.length).map((c) => {
    c.miembros = [correo];
    return updateDoc(doc(db, c.ruta), { propietario: usuario.uid, miembros: c.miembros })
      .catch((e) => console.warn("Cartera sin completar:", c.ruta, e));
  }));
  return lista.sort((a, b) => (a.creada?.toMillis?.() ?? 0) - (b.creada?.toMillis?.() ?? 0));
}

export async function cartera(propietario, id) {
  const d = await getDoc(doc(db, "usuarios", propietario, "carteras", id));
  return d.exists() ? deDocumento(d) : null;
}

export async function crearCartera(usuario, { nombre, capitalInicial, fechaInicio }) {
  const ref = await addDoc(collection(db, "usuarios", usuario.uid, "carteras"), {
    nombre, divisa: "EUR", capital_inicial: capitalInicial, fecha_inicio: fechaInicio,
    creada: serverTimestamp(), propietario: usuario.uid, miembros: [correoDe(usuario)],
  });
  return { propietario: usuario.uid, id: ref.id };
}

export function cambiarMiembros(c, miembros) {
  return updateDoc(doc(db, c.ruta), { miembros });
}

export function salirDeCartera(c, usuario) {
  return updateDoc(doc(db, c.ruta), { miembros: arrayRemove(correoDe(usuario)) });
}

export async function operaciones(c) {
  const r = await getDocs(query(collection(db, c.ruta, "operaciones"), orderBy("creada")));
  return r.docs.map((d) => {
    const datos = d.data();
    return { id: d.id, ...datos, marca: datos.creada?.toMillis?.() ?? Date.now() };
  });
}

/** Registra una operación a nombre de la cuenta que la hace. */
export function registrarOperacion(c, usuario, operacion) {
  return addDoc(collection(db, c.ruta, "operaciones"), {
    ...operacion, creada: serverTimestamp(),
    autor: { uid: usuario.uid, correo: correoDe(usuario), nombre: (usuario.displayName ?? "").slice(0, 100) },
  });
}

export async function borrarCartera(c) {
  const ops = await getDocs(collection(db, c.ruta, "operaciones"));
  const lote = writeBatch(db);
  ops.docs.forEach((d) => lote.delete(d.ref));
  await lote.commit();
  await deleteDoc(doc(db, c.ruta));
}

// ── Administración ───────────────────────────────────────────────────────────

/** Las reglas solo dejan leer administracion/… a los administradores. */
export async function esAdministrador() {
  try {
    await getDoc(doc(db, "administracion", "acceso"));
    return true;
  } catch {
    return false;
  }
}

export async function perfiles() {
  const r = await getDocs(collection(db, "usuarios"));
  return r.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/** Eliminaciones pedidas, por uid: {correo, solicitada, procesada}. */
export async function bajas() {
  const r = await getDocs(collection(db, "bajas"));
  return Object.fromEntries(r.docs.map((d) => [d.id, d.data()]));
}

export function pedirBaja(uid, correo) {
  return setDoc(doc(db, "bajas", uid), { correo, solicitada: serverTimestamp(), procesada: null });
}
