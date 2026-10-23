// Inicialización de Firebase (SDK modular desde el CDN de Google).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, query, where, orderBy, limit, serverTimestamp, arrayRemove, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const entrar = () => signInWithPopup(auth, new GoogleAuthProvider());
export const salir = () => signOut(auth);
export const alCambiarUsuario = (fn) => onAuthStateChanged(auth, fn);

export {
  collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, query,
  where, orderBy, limit, serverTimestamp, arrayRemove, arrayUnion,
};
