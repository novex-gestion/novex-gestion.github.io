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

// UID de Firebase Auth → socio.
// `parte` es la participación en la sociedad: define cuánto le toca sostener a
// cada uno y, por lo tanto, el neteo. Tiene que sumar 1 entre todos.
export const SOCIOS = {
  '0H6nIW0JbzUI3igshz4HhLf66le2': { nombre: 'Nico', parte: 0.5 },
  NUTgVP6JJAbvJg2ay47GtDgpxrk1: { nombre: 'Juan', parte: 0.5 },
};

// Participación de un socio. Si algún día las partes no suman 1, se normalizan
// en vez de mentir: el neteo tiene que cuadrar siempre.
export function participacion(uid) {
  const total = Object.values(SOCIOS).reduce((s, x) => s + (Number(x.parte) || 0), 0);
  const propia = SOCIOS[uid] ? Number(SOCIOS[uid].parte) || 0 : 0;
  return total > 0 ? propia / total : 0;
}

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

// Dónde entró (o de dónde salió) la plata: la caja de la sociedad o el
// bolsillo de un socio. Se usa para cobros y para movimientos de caja.
export function opcionesCuenta(incluirNovex = true) {
  const socios = Object.keys(SOCIOS).map((u) => ({ id: u, nombre: nombreSocio(u) }));
  return incluirNovex ? [{ id: 'novex', nombre: 'Caja NOVEX' }, ...socios] : socios;
}

// Movimientos que se cargan a mano en la caja. Los gastos y los cobros NO
// están acá: se leen de sus propios módulos para no cargarlos dos veces.
export const TIPOS_MOVIMIENTO = [
  { id: 'aporte',    nombre: 'Aporte de socio',     ayuda: 'Un socio pone plata en la caja. Sube la caja y le queda a favor.' },
  { id: 'retiro',    nombre: 'Retiro de socio',     ayuda: 'Un socio saca plata de la caja. Baja la caja y baja su cuenta.' },
  { id: 'reintegro', nombre: 'Reintegro a socio',   ayuda: 'La caja le devuelve a un socio lo que había puesto de su bolsillo.' },
  { id: 'neteo',     nombre: 'Neteo entre socios',  ayuda: 'Un socio le transfiere al otro para emparejar. No toca la caja.' },
  { id: 'ingreso',   nombre: 'Otro ingreso',        ayuda: 'Plata que entra y no es cobro de cliente (venta de algo, reintegro externo).' },
  { id: 'egreso',    nombre: 'Otra salida',         ayuda: 'Plata que sale y no es un gasto cargado en el módulo de Gastos.' },
];

export function nombreTipoMovimiento(id) {
  const t = TIPOS_MOVIMIENTO.find((t) => t.id === id);
  return t ? t.nombre : id || '—';
}

export const MEDIOS_PAGO = [
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'efectivo',      nombre: 'Efectivo' },
  { id: 'mercadopago',   nombre: 'Mercado Pago' },
  { id: 'cripto',        nombre: 'Cripto' },
  { id: 'otro',          nombre: 'Otro' },
];

// Conceptos de cargo que no son la cuota mensual (van a la cuenta del cliente).
export const CONCEPTOS_CARGO = [
  { id: 'setup',      nombre: 'Setup / puesta en marcha' },
  { id: 'extra',      nombre: 'Trabajo extra' },
  { id: 'pauta',      nombre: 'Pauta facturada al cliente' },
  { id: 'produccion', nombre: 'Producción (fotos, video)' },
  { id: 'otro',       nombre: 'Otro' },
];

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

// El workflow editorial del blog (estándar del mercado: cada etapa con dueño
// y criterio de terminado). El ticket nace en Ideas y muere en Publicado.
export const ESTADOS_CONTENIDO = [
  { id: 'idea',       nombre: 'Ideas' },
  { id: 'brief',      nombre: 'Brief' },
  { id: 'redaccion',  nombre: 'Redacción' },
  { id: 'revision',   nombre: 'Revisión' },
  { id: 'publicado',  nombre: 'Publicado' },
  { id: 'descartada', nombre: 'Descartada', tono: 'apagado' },
];

export const RUBROS_CONTENIDO = [
  { id: 'general',     nombre: 'General / todos' },
  { id: 'gastronomia', nombre: 'Gastronomía' },
  { id: 'estetica',    nombre: 'Peluquería y estética' },
  { id: 'salud',       nombre: 'Salud y consultorios' },
  { id: 'comercio',    nombre: 'Comercio de barrio' },
  { id: 'servicios',   nombre: 'Servicios y oficios' },
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
