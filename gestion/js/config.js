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
  '0H6nIW0JbzUI3igshz4HhLf66le2': { nombre: 'Iván' },
  NUTgVP6JJAbvJg2ay47GtDgpxrk1: { nombre: 'Juan' },
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

export const CATEGORIAS_GASTO = [
  { id: 'herramientas', nombre: 'Herramientas y suscripciones' },
  { id: 'fotografo',    nombre: 'Fotógrafo' },
  { id: 'pauta',        nombre: 'Pauta' },
  { id: 'impuestos',    nombre: 'Impuestos y bancos' },
  { id: 'viaticos',     nombre: 'Viáticos' },
  { id: 'otros',        nombre: 'Otros' },
];

export function nombreCategoria(id) {
  const c = CATEGORIAS_GASTO.find((c) => c.id === id);
  return c ? c.nombre : id || '—';
}

export function nombrePagador(id) {
  if (id === 'novex') return 'Cuenta NOVEX';
  return nombreSocio(id);
}

// Plantillas de WhatsApp — {campo} se reemplaza al abrir.
export const PLANTILLAS_WA = {
  seguimientoLead:
    'Hola {contacto}! Te escribo de NOVEX por {negocio} — ¿pudiste pensar lo que hablamos? Cualquier duda me decís y lo vemos.',
  seguimientoCliente:
    'Hola {contacto}! ¿Cómo viene todo con {negocio}? Te escribo para hacer un repaso rápido de cómo vamos y qué sigue este mes.',
  cobro:
    'Hola {contacto}! Te acerco el recordatorio de la cuota de {mes} de NOVEX ({monto}). Cuando puedas me mandás el comprobante. ¡Gracias!',
  bienvenida:
    '¡Bienvenido/a a NOVEX, {contacto}! Ya estamos arrancando con {negocio}. En estos días te escribimos para coordinar los primeros pasos. 🚀',
};

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
