// Capa de datos: una sola suscripción en vivo por colección.
// Acá solo se escucha lo del canal de promotores; la gestión de la agencia
// vive en otra app y con otras colecciones.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';

const COLECCIONES = ['postulantes'];

export const cache = {
  postulantes: [],
  listo: Object.fromEntries(COLECCIONES.map((c) => [c, false])),
};

const oyentes = new Set();
let paradas = [];

export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function conectarDatos() {
  if (paradas.length) return;
  for (const col of COLECCIONES) {
    paradas.push(
      onSnapshot(collection(db, col), (snap) => {
        cache[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cache.listo[col] = true;
        for (const fn of oyentes) fn(col);
      }, (err) => {
        console.error(`Error escuchando ${col}:`, err);
      })
    );
  }
}

export function desconectarDatos() {
  for (const p of paradas) p();
  paradas = [];
  for (const c of COLECCIONES) { cache[c] = []; cache.listo[c] = false; }
}
