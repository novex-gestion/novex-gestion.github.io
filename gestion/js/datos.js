// Capa de datos: una sola suscripción en vivo por colección,
// caché en memoria y aviso a las vistas cuando algo cambia.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';

export const cache = {
  leads: [],
  clientes: [],
  pagos: [],
  tareas: [],
  listo: { leads: false, clientes: false, pagos: false, tareas: false },
};

const oyentes = new Set();
let paradas = [];

export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function conectarDatos() {
  if (paradas.length) return;
  for (const col of ['leads', 'clientes', 'pagos', 'tareas']) {
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
  cache.leads = []; cache.clientes = []; cache.pagos = []; cache.tareas = [];
  cache.listo = { leads: false, clientes: false, pagos: false, tareas: false };
}
