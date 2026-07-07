// ============================================================
// NOVEX GESTIÓN — configuración
// La firebaseConfig es pública por diseño (la seguridad son
// las Security Rules + Auth). Los UIDs identifican, no
// autentican: pueden estar en el repo sin riesgo.
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCt86XOBMMWffP1oRzgzh7vEJOwlQrqGOc',
  authDomain: 'novex-gestion.firebaseapp.com',
  projectId: 'novex-gestion',
  storageBucket: 'novex-gestion.firebasestorage.app',
  messagingSenderId: '353788063180',
  appId: '1:353788063180:web:dc5246d2dae85fa5b20169',
};

// UID de Firebase Auth → socio
export const SOCIOS = {
  cTh48LC9BIPkE4BK4GeKWCsvnJm1: { nombre: 'Iván' },
  WWVdEhbOP5e1nIDffNzDGUecIa12: { nombre: 'Juan' },
};

export const ETAPAS = [
  { id: 'contacto',  nombre: 'Contacto' },
  { id: 'auditoria', nombre: 'Auditoría' },
  { id: 'propuesta', nombre: 'Propuesta' },
  { id: 'ganado',    nombre: 'Ganado' },
  { id: 'perdido',   nombre: 'Perdido' },
];

export const PAQUETES = [
  { id: 'contenido',    nombre: 'Contenido' },
  { id: 'arranque',     nombre: 'Arranque' },
  { id: 'crecimiento',  nombre: 'Crecimiento' },
  { id: 'operacion-ia', nombre: 'Operación con IA' },
];

export const ORIGENES = [
  { id: 'referido',    nombre: 'Referido' },
  { id: 'instagram',   nombre: 'Instagram' },
  { id: 'puerta-fria', nombre: 'Puerta fría' },
  { id: 'web',         nombre: 'Web' },
  { id: 'otro',        nombre: 'Otro' },
];

export const TIPOS_INTERACCION = [
  { id: 'whatsapp', nombre: 'WhatsApp' },
  { id: 'llamada',  nombre: 'Llamada' },
  { id: 'reunion',  nombre: 'Reunión' },
  { id: 'mail',     nombre: 'Mail' },
  { id: 'nota',     nombre: 'Nota' },
];

export function nombrePaquete(id) {
  const p = PAQUETES.find((p) => p.id === id);
  return p ? p.nombre : id || '—';
}

export function nombreEtapa(id) {
  const e = ETAPAS.find((e) => e.id === id);
  return e ? e.nombre : id;
}

export function nombreSocio(uid) {
  if (uid === 'ambos') return 'Ambos';
  return SOCIOS[uid] ? SOCIOS[uid].nombre : '—';
}
