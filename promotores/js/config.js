// ============================================================
// NOVEX PROMOTORES — configuración
// App separada de /gestion/: acá viven el reclutamiento y el
// seguimiento de los activadores del canal Clover. Quien entra
// acá NO ve clientes, cobros ni gastos de la agencia.
//
// Mismo proyecto Firebase que la gestión: lo que separa el
// acceso son las Security Rules, no la base.
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCt86XOBMMWffP1oRzgzh7vEJOwlQrqGOc',
  authDomain: 'novex-gestion.firebaseapp.com',
  projectId: 'novex-gestion',
  storageBucket: 'novex-gestion.firebasestorage.app',
  messagingSenderId: '353788063180',
  appId: '1:353788063180:web:dc5246d2dae85fa5b20169',
};

// Quién puede entrar a ESTA app. Los UIDs identifican, no autentican.
// Para sumar a alguien: crear el usuario en Firebase Auth, pegar su UID acá
// Y agregarlo también a la función esEquipo() de firestore.rules.
export const EQUIPO = {
  '0H6nIW0JbzUI3igshz4HhLf66le2': { nombre: 'Iván' },
  NUTgVP6JJAbvJg2ay47GtDgpxrk1: { nombre: 'Juan' },
  // Cuenta compartida del equipo (admin@novex.bot). Acceso completo:
  // ve y edita los postulantes, pero no toca nada de la agencia.
  prsS6TSmQQfNkU3Xv73mfwNAIMH3: { nombre: 'Equipo' },
};

// El embudo del reclutamiento. `enResumen` decide si sale como KPI arriba.
export const ESTADOS_POSTULANTE = [
  { id: 'nuevo',       nombre: 'Nuevo',        enResumen: true },
  { id: 'contactado',  nombre: 'Contactado',   enResumen: true },
  { id: 'interesado',  nombre: 'Interesado',   enResumen: true },
  { id: 'agendado',    nombre: 'Agendado',     enResumen: true },
  { id: 'activo',      nombre: 'Activo',       enResumen: true },
  { id: 'no_responde', nombre: 'No responde',  enResumen: false },
  { id: 'descartado',  nombre: 'Descartado',   enResumen: false },
];

// Lo que paga el canal por comercio activado, y lo que cobra el promotor.
// Sirve para calcular el bono y el margen; si cambia el acuerdo, se toca acá.
export const PAGO = {
  porAltaPromotor: 26000,
  bonoPromotor: 100000,
  bonoCadaAltas: 10,
  porAltaCanal: 50000,   // lo que Trackeando le paga a NOVEX por terminal sana
};

export function nombreEstadoPostulante(id) {
  const e = ESTADOS_POSTULANTE.find((e) => e.id === id);
  return e ? e.nombre : id || '—';
}

export function nombrePersona(uid) {
  return EQUIPO[uid] ? EQUIPO[uid].nombre : '—';
}

// Cuántos bonos le corresponden a un promotor por sus altas.
export function bonosPorAltas(altas) {
  return Math.floor((Number(altas) || 0) / PAGO.bonoCadaAltas);
}

export function aCobrarPromotor(altas) {
  const n = Number(altas) || 0;
  return n * PAGO.porAltaPromotor + bonosPorAltas(n) * PAGO.bonoPromotor;
}

export function fmtPesos(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
