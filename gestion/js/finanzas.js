// ============================================================
// NOVEX — MOTOR FINANCIERO
// Un solo lugar donde viven las reglas de la plata. Las vistas leen de acá;
// no calculan por su cuenta. Así caja, socios y clientes no se contradicen.
//
// Todo se mide en USD (los gastos en ARS ya se convierten al cargarse).
//
// LAS REGLAS, en una tabla:
//
//   Hecho                                   Caja NOVEX   Cuenta del socio
//   ─────────────────────────────────────────────────────────────────────
//   Gasto pagado por la cuenta NOVEX          −monto           —
//   Gasto que puso un socio de su bolsillo       —          +monto (a favor)
//   Cobro que entró a la caja NOVEX           +monto           —
//   Cobro que se quedó un socio                  —          −monto (lo tiene él)
//   Aporte de capital de un socio             +monto        +monto (a favor)
//   Retiro de un socio                        −monto        −monto
//   Reintegro de la caja a un socio           −monto        −monto
//   Neteo: el que paga / el que recibe            —          +monto / −monto
//
// Saldo de la cuenta de un socio POSITIVO = NOVEX le debe a él.
// ============================================================
import { SOCIOS, participacion } from './config.js';
import { aFecha } from './ui.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const monto = (v) => Number(v) || 0;

// Un cobro sin `recibidoPor` es anterior al campo: se asume que entró a la
// caja, que es como se venía trabajando. Nunca se reinterpreta el pasado.
export const recibidoPor = (p) => p.recibidoPor || 'novex';

// Lo efectivamente cobrado de una cuota (contempla cobros parciales).
export function cobradoDe(p) {
  if (p.montoCobrado != null) return monto(p.montoCobrado);
  return p.estado === 'cobrado' ? monto(p.montoUsd) : 0;
}

// ============================================================
// LIBRO ÚNICO: todo lo que movió plata, venga de donde venga.
// Los gastos y los cobros no se vuelven a cargar acá: se leen de donde ya
// se cargan. Sólo aportes, retiros y neteos son propios de este módulo.
// ============================================================
export function libro(cache) {
  const filas = [];

  for (const g of cache.gastos) {
    const m = monto(g.montoUsd);
    if (!m) continue;
    const deSocio = g.pagadoPor && g.pagadoPor !== 'novex';
    filas.push({
      id: 'gasto:' + g.id,
      fecha: aFecha(g.fecha),
      periodo: g.periodo,
      concepto: g.concepto,
      detalle: g.clienteNegocio || null,
      clase: 'gasto',
      caja: deSocio ? 0 : -m,
      socio: deSocio ? g.pagadoPor : null,
      cuentaSocio: deSocio ? m : 0,
      origen: 'gastos',
      ref: g.id,
    });
  }

  for (const p of cache.pagos) {
    const m = cobradoDe(p);
    if (!m) continue;
    const quien = recibidoPor(p);
    const deSocio = quien !== 'novex';
    filas.push({
      id: 'cobro:' + p.id,
      fecha: aFecha(p.fechaCobro) || aFecha(p.vence),
      periodo: p.periodo,
      concepto: 'Cobro · ' + (p.clienteNegocio || ''),
      detalle: p.medioPago || null,
      clase: 'cobro',
      caja: deSocio ? 0 : m,
      socio: deSocio ? quien : null,
      cuentaSocio: deSocio ? -m : 0,
      origen: 'pagos',
      ref: p.id,
    });
  }

  for (const mv of cache.movimientos) {
    const m = monto(mv.montoUsd);
    if (!m) continue;
    const base = {
      id: 'mov:' + mv.id,
      fecha: aFecha(mv.fecha),
      periodo: mv.periodo,
      concepto: mv.concepto || rotuloTipo(mv.tipo),
      detalle: mv.detalle || null,
      clase: mv.tipo,
      origen: 'movimientos',
      ref: mv.id,
      socio: mv.socio || null,
    };
    if (mv.tipo === 'aporte') {
      filas.push({ ...base, caja: m, cuentaSocio: m });
    } else if (mv.tipo === 'retiro' || mv.tipo === 'reintegro') {
      filas.push({ ...base, caja: -m, cuentaSocio: -m });
    } else if (mv.tipo === 'neteo') {
      // Quien PAGA el neteo termina habiendo puesto más plata en el negocio, así que
      // su cuenta SUBE; quien la recibe puso menos, y baja. (Al revés, emparejar
      // agrandaría la diferencia y el módulo pediría transferencias sin fin.)
      // La caja de NOVEX no se toca: es plata que va de un socio al otro.
      filas.push({ ...base, caja: 0, cuentaSocio: m });
      filas.push({ ...base, id: base.id + ':d', caja: 0, socio: mv.socioDestino, cuentaSocio: -m });
    } else if (mv.tipo === 'ingreso') {
      filas.push({ ...base, caja: m, cuentaSocio: 0, socio: null });
    } else if (mv.tipo === 'egreso') {
      filas.push({ ...base, caja: -m, cuentaSocio: 0, socio: null });
    } else {
      filas.push({ ...base, caja: monto(mv.caja), cuentaSocio: monto(mv.cuentaSocio) });
    }
  }

  return filas.sort((a, b) => (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0));
}

export function rotuloTipo(t) {
  const r = {
    gasto: 'Gasto', cobro: 'Cobro', aporte: 'Aporte de socio', retiro: 'Retiro de socio',
    reintegro: 'Reintegro a socio', neteo: 'Neteo entre socios',
    ingreso: 'Ingreso a la caja', egreso: 'Salida de la caja',
  };
  return r[t] || t;
}

// ============================================================
// CAJA
// ============================================================
export function caja(cache) {
  const filas = libro(cache).filter((f) => f.caja !== 0);
  const entradas = r2(filas.filter((f) => f.caja > 0).reduce((s, f) => s + f.caja, 0));
  const salidas = r2(filas.filter((f) => f.caja < 0).reduce((s, f) => s + f.caja, 0));
  return { filas, saldo: r2(entradas + salidas), entradas, salidas: r2(Math.abs(salidas)) };
}

export function cajaDelPeriodo(cache, periodo) {
  const filas = caja(cache).filas.filter((f) => f.periodo === periodo);
  const entradas = r2(filas.filter((f) => f.caja > 0).reduce((s, f) => s + f.caja, 0));
  const salidas = r2(Math.abs(filas.filter((f) => f.caja < 0).reduce((s, f) => s + f.caja, 0)));
  return { filas, entradas, salidas, neto: r2(entradas - salidas) };
}

// ============================================================
// CUENTA DE CADA SOCIO
// ============================================================
export function cuentaSocio(cache, uid) {
  const filas = libro(cache).filter((f) => f.socio === uid && f.cuentaSocio !== 0);
  const abs = (clase) => r2(filas.filter((f) => f.clase === clase)
    .reduce((s, f) => s + Math.abs(f.cuentaSocio), 0));
  return {
    uid,
    filas,
    puso: abs('gasto'),                // gastos que pagó de su bolsillo
    aportes: abs('aporte'),
    retiros: abs('retiro'),
    reintegros: abs('reintegro'),
    cobrosRecibidos: abs('cobro'),     // plata de clientes que quedó en su cuenta
    neteos: r2(filas.filter((f) => f.clase === 'neteo').reduce((s, f) => s + f.cuentaSocio, 0)),
    saldo: r2(filas.reduce((s, f) => s + f.cuentaSocio, 0)),
  };
}

// ============================================================
// NETEO ENTRE SOCIOS — el corazón del pedido.
//
// El "aporte neto" de un socio es lo que puso menos lo que sacó: exactamente
// el saldo de su cuenta. Para que el esfuerzo sea equitativo, cada uno tiene
// que sostener su parte según su participación.
//
//   objetivo del socio = (suma de los saldos) × su participación
//   diferencia = saldo − objetivo
//
// Diferencia positiva: puso de más, le deben. Negativa: puso de menos, debe.
// Con dos socios, la liquidación es una sola transferencia.
// ============================================================
export function neteo(cache) {
  const cuentas = Object.keys(SOCIOS).map((u) => ({
    ...cuentaSocio(cache, u),
    participacion: participacion(u),
  }));
  const total = r2(cuentas.reduce((s, c) => s + c.saldo, 0));

  for (const c of cuentas) {
    c.objetivo = r2(total * c.participacion);
    c.diferencia = r2(c.saldo - c.objetivo);
  }

  const ordenadas = [...cuentas].sort((a, b) => a.diferencia - b.diferencia);
  const deudor = ordenadas[0];
  const acreedor = ordenadas[ordenadas.length - 1];
  const importe = Math.min(Math.abs(deudor.diferencia), acreedor.diferencia);

  return {
    cuentas,
    total,
    parejo: !(importe >= 1),          // menos de un dólar de diferencia: está parejo
    transferencia: importe >= 1 ? { de: deudor.uid, a: acreedor.uid, monto: r2(importe) } : null,
  };
}

// ============================================================
// CUENTA CORRIENTE DE CLIENTES
// Devengado (lo que se le facturó) − cobrado = saldo.
// El devengado son las cuotas más los cargos sueltos (setup, extras);
// los créditos (bonificaciones, notas de crédito) restan.
// ============================================================
export function ccCliente(cache, clienteId) {
  const filas = [];

  for (const p of cache.pagos.filter((x) => x.clienteId === clienteId)) {
    const debe = monto(p.montoUsd);
    if (debe) filas.push({
      fecha: aFecha(p.vence), tipo: 'cuota', concepto: 'Cuota ' + (p.periodo || ''),
      debe, haber: 0, ref: p.id, periodo: p.periodo,
    });
    const cobrado = cobradoDe(p);
    if (cobrado) filas.push({
      fecha: aFecha(p.fechaCobro) || aFecha(p.vence), tipo: 'pago',
      concepto: 'Pago' + (p.medioPago ? ' · ' + p.medioPago : ''),
      debe: 0, haber: cobrado, ref: p.id, periodo: p.periodo,
    });
  }

  for (const c of cache.cargos.filter((x) => x.clienteId === clienteId)) {
    const m = monto(c.montoUsd);
    if (!m) continue;
    const esCredito = c.tipo === 'credito';
    filas.push({
      fecha: aFecha(c.fecha), tipo: c.tipo || 'cargo', concepto: c.concepto,
      debe: esCredito ? 0 : m, haber: esCredito ? m : 0, ref: c.id, periodo: c.periodo,
    });
  }

  filas.sort((a, b) => (a.fecha ? a.fecha.getTime() : 0) - (b.fecha ? b.fecha.getTime() : 0));
  let acumulado = 0;
  for (const f of filas) { acumulado = r2(acumulado + f.debe - f.haber); f.saldo = acumulado; }

  const devengado = r2(filas.reduce((s, f) => s + f.debe, 0));
  const cobrado = r2(filas.reduce((s, f) => s + f.haber, 0));
  return { filas, devengado, cobrado, saldo: r2(devengado - cobrado) };
}

// Vencido de un cliente: cuotas cuyo vencimiento ya pasó y siguen sin cobrarse
// del todo. Los cargos sueltos no vencen: no tienen fecha de vencimiento propia.
//
// Nunca puede superar el saldo de la cuenta: si se le bonificaron 100, no se le
// pueden reclamar. Reclamar de más es peor que no reclamar.
export function vencidoCliente(cache, clienteId, saldoConocido) {
  const hoy = new Date();
  const porCuotas = cache.pagos
    .filter((p) => p.clienteId === clienteId)
    .filter((p) => { const v = aFecha(p.vence); return v && v < hoy; })
    .reduce((s, p) => s + Math.max(0, monto(p.montoUsd) - cobradoDe(p)), 0);
  const saldo = saldoConocido != null ? saldoConocido : ccCliente(cache, clienteId).saldo;
  return r2(Math.max(0, Math.min(porCuotas, saldo)));
}

// Saldo de todos los clientes de una sola pasada, para el tablero.
export function ccTodos(cache) {
  return cache.clientes
    .map((c) => {
      const cc = ccCliente(cache, c.id);
      return { cliente: c, ...cc, vencido: vencidoCliente(cache, c.id, cc.saldo) };
    })
    .filter((x) => x.devengado > 0 || x.cobrado > 0)
    .sort((a, b) => b.saldo - a.saldo);
}
