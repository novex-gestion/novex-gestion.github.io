// Inicialización de Firebase (SDK por CDN, sin build).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_CONFIG } from './config.js';

export const configLista = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);

export let app = null;
export let auth = null;
export let db = null;

if (configLista) {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
}

// Trazabilidad estándar de todo documento.
export function stamp(esAlta = false) {
  const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
  const base = { actualizadoPor: uid, actualizadoEl: serverTimestamp() };
  if (esAlta) {
    base.creadoPor = uid;
    base.creadoEl = serverTimestamp();
  }
  return base;
}
