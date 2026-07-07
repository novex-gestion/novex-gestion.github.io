// ============================================================
// NOVEX GESTIÓN — configuración
// La firebaseConfig es pública por diseño (la seguridad son
// las Security Rules + Auth). Los UIDs identifican, no
// autentican: pueden estar en el repo sin riesgo.
// ============================================================

// Pegar acá el objeto de "Configuración del proyecto → Tus apps"
// de la consola de Firebase. Mientras sea null, la app muestra
// el aviso de configuración pendiente.
export const FIREBASE_CONFIG = null;

// UID de Firebase Auth → socio (se completa al crear los usuarios)
export const SOCIOS = {
  // 'UID_IVAN': { nombre: 'Iván' },
  // 'UID_JUAN': { nombre: 'Juan' },
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
