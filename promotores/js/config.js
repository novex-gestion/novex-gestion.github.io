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
  // admin@novex.bot — la usa Mati. Acceso completo a los postulantes,
  // nada de la agencia. Si algún día la usa otra persona, lo que haga va a
  // figurar como "Mati": ahí conviene darle cuenta propia.
  prsS6TSmQQfNkU3Xv73mfwNAIMH3: { nombre: 'Mati' },
};

// Quién tocó cada ficha por última vez. Juno firma con su UID de Firebase.
const UID_JUNO = 'HBkuexr9OnV9j1WuXb4DLpxBcZU2';

export function nombreAutor(uid) {
  if (!uid) return '';
  if (uid === UID_JUNO || uid === 'juno') return 'Juno';
  return EQUIPO[uid] ? EQUIPO[uid].nombre : '';
}

// El embudo del reclutamiento, numerado como lo pidió Juan (ago-2026).
// "Manuales" y "No responde" dejaron de ser estados: los manuales son una
// marca en la ficha (materialEnviado) y el que no responde queda descartado
// con motivo. "Activo" no figura en el pipeline: vive en la solapa Equipo.
export const ESTADOS_POSTULANTE = [
  { id: 'nuevo',       nombre: 'Nuevo',        num: 1 },
  { id: 'contactado',  nombre: 'Contactados',  num: 2 },
  { id: 'interesado',  nombre: 'Interesados',  num: 3 },
  // Mismo id interno de siempre ("agendado") para no migrar datos: solo
  // cambia cómo se muestra.
  { id: 'agendado',    nombre: 'Llamar',       num: 4 },
  { id: 'activo',      nombre: 'Activo',       enEquipo: true },
  { id: 'descartado',  nombre: 'Descartado',   num: 6, tono: 'apagado' },
];

// Los que se muestran como botones del pipeline (sin Activo: esos están en Equipo).
export const ESTADOS_PIPELINE = ESTADOS_POSTULANTE.filter((e) => !e.enEquipo);

// Etiquetas para fichas viejas que aún tengan un estado retirado.
const ESTADOS_RETIRADOS = { manuales: 'Manuales (viejo)', no_responde: 'No responde (viejo)' };

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
  return e ? e.nombre : ESTADOS_RETIRADOS[id] || id || '—';
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
