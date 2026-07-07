// Capa de datos: una sola suscripción en vivo por colección,
// caché en memoria y aviso a las vistas cuando algo cambia.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';

const COLECCIONES = ['leads', 'clientes', 'pagos', 'tareas', 'gastos', 'gastos_fijos', 'consultas'];

export const cache = {
  leads: [],
  clientes: [],
  pagos: [],
  tareas: [],
  gastos: [],
  gastos_fijos: [],
  consultas: [],
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
