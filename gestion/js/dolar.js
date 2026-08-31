// ============================================================
// NOVEX — DÓLAR BLUE, DÍA A DÍA
//
// Todo el sistema mide en USD. Cuando se carga algo en pesos hay que convertir,
// y convertir con el dólar de hoy un gasto de hace tres meses da un número falso.
// Por eso se usa SIEMPRE la cotización del día de la operación.
//
// "Promedio" = (compra + venta) / 2, que es como se habla del blue en la calle.
//
// Fuentes:
//   - hoy            → dolarapi.com (se actualiza durante el día)
//   - días anteriores→ api.argentinadatos.com (serie histórica, ya cerrada)
// Los fines de semana y feriados vienen con el valor arrastrado del último día
// hábil, así que no hay que resolverlo acá.
//
// Las cotizaciones pasadas se guardan en Firestore (`cotizaciones/YYYY-MM-DD`):
// quedan como registro de con qué número se convirtió cada cosa, y el sistema
// sigue andando aunque la API se caiga. La de HOY no se cachea en la base: el
// mercado se sigue moviendo y mañana ese valor ya no sería el de "hoy".
// ============================================================
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';

const API_HOY = 'https://dolarapi.com/v1/dolares/blue';
const API_FECHA = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/blue';

const memoria = new Map();          // YYYY-MM-DD -> cotización (evita repetir pedidos)
const HOY_MS = 10 * 60 * 1000;      // la de hoy se refresca cada 10 minutos

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function armar(compra, venta, fecha, fuente) {
  const c = Number(compra) || 0;
  const v = Number(venta) || 0;
  if (!c && !v) return null;
  const promedio = c && v ? (c + v) / 2 : c || v;
  return { fecha, compra: c, venta: v, promedio: Math.round(promedio * 100) / 100, fuente };
}

async function pedir(url) {
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    return null;                     // sin internet o API caída: se resuelve a mano
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Cotización del blue de una fecha (YYYY-MM-DD). Devuelve null si no se pudo
 * conseguir: quien la pide tiene que contemplarlo y pedir el número a mano.
 */
export async function blueDe(fechaISO) {
  if (!fechaISO) return null;
  const esHoy = fechaISO === hoyISO();

  const enMemoria = memoria.get(fechaISO);
  if (enMemoria && (!esHoy || Date.now() - enMemoria.leidoEn < HOY_MS)) return enMemoria.valor;

  // Las pasadas pueden estar ya guardadas en la base.
  if (!esHoy) {
    try {
      const snap = await getDoc(doc(db, 'cotizaciones', fechaISO));
      if (snap.exists()) {
        const v = snap.data();
        const cot = armar(v.compra, v.venta, fechaISO, v.fuente || 'base');
        if (cot) { memoria.set(fechaISO, { valor: cot, leidoEn: Date.now() }); return cot; }
      }
    } catch (err) { /* si la base no responde, se sigue por la API */ }
  }

  let cot = null;
  if (esHoy) {
    const d = await pedir(API_HOY);
    if (d) cot = armar(d.compra, d.venta, fechaISO, 'dolarapi');
  }
  if (!cot) {
    const [a, m, dia] = fechaISO.split('-');
    const d = await pedir(`${API_FECHA}/${a}/${m}/${dia}`);
    if (d) cot = armar(d.compra, d.venta, fechaISO, 'argentinadatos');
  }
  if (!cot) return null;

  memoria.set(fechaISO, { valor: cot, leidoEn: Date.now() });

  // Sólo se guardan las cerradas: la de hoy todavía se puede mover.
  if (!esHoy) {
    setDoc(doc(db, 'cotizaciones', fechaISO), {
      compra: cot.compra, venta: cot.venta, promedio: cot.promedio,
      fuente: cot.fuente, guardadoEl: new Date(),
    }).catch(() => { /* que no falle la carga por no poder cachear */ });
  }

  return cot;
}

export const blueHoy = () => blueDe(hoyISO());

/** Formato corto para mostrar: "1.550" */
export function fmtPesos(n) {
  return Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
