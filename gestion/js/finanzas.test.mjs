// Test del motor financiero. Se corre a mano cuando se toca finanzas.js:
//
//     node js/finanzas.test.mjs
//
// No necesita instalar nada ni conectarse a Firebase: arma cachés de mentira y
// verifica los números. Existe porque el neteo tenía los signos invertidos y el
// módulo pedía transferencias sin fin; el test lo agarró antes de publicar.

import { caja, cuentaSocio, neteo, ccCliente, vencidoCliente, ccTodos } from './finanzas.js';

const NICO = '0H6nIW0JbzUI3igshz4HhLf66le2';
const JUAN = 'NUTgVP6JJAbvJg2ay47GtDgpxrk1';
const d = (s) => new Date(s + 'T12:00:00');
let fallos = 0;
function ok(rotulo, real, esperado) {
  const bien = Math.abs(real - esperado) < 0.01;
  if (!bien) fallos++;
  console.log(`${bien ? '  OK  ' : ' FALLA'} ${rotulo}: ${real} (esperado ${esperado})`);
}

// ---------- CASO 1: sólo gastos, uno puso más que el otro ----------
let c = {
  gastos: [
    { id: 'g1', concepto: 'Claude', montoUsd: 800, pagadoPor: NICO, fecha: d('2026-08-01'), periodo: '2026-08' },
    { id: 'g2', concepto: 'Fotos', montoUsd: 200, pagadoPor: JUAN, fecha: d('2026-08-02'), periodo: '2026-08' },
  ],
  pagos: [], movimientos: [], cargos: [], clientes: [],
};
console.log('CASO 1 — Nico puso 800, Juan 200');
ok('saldo Nico', cuentaSocio(c, NICO).saldo, 800);
ok('saldo Juan', cuentaSocio(c, JUAN).saldo, 200);
let n = neteo(c);
ok('total puesto', n.total, 1000);
ok('transferencia', n.transferencia.monto, 300);
console.log(`  ${n.transferencia.de === JUAN ? 'OK  ' : 'FALLA'} paga Juan, cobra Nico`);
if (n.transferencia.de !== JUAN || n.transferencia.a !== NICO) fallos++;
ok('caja (nadie puso plata de la caja)', caja(c).saldo, 0);

// ---------- CASO 2: se registra el neteo, quedan parejos ----------
c.movimientos.push({ id: 'm1', tipo: 'neteo', montoUsd: 300, socio: JUAN, socioDestino: NICO, fecha: d('2026-08-05'), periodo: '2026-08' });
console.log('CASO 2 — después de netear: los dos tienen que quedar en 500');
ok('saldo Nico', cuentaSocio(c, NICO).saldo, 500);
ok('saldo Juan', cuentaSocio(c, JUAN).saldo, 500);
n = neteo(c);
console.log(`  ${n.parejo ? 'OK  ' : 'FALLA'} quedan parejos y no pide otra transferencia`);
if (!n.parejo) fallos++;
ok('total puesto no cambia', n.total, 1000);

// ---------- CASO 3: caja con cobros y gastos ----------
c = {
  gastos: [{ id: 'g1', concepto: 'Hosting', montoUsd: 300, pagadoPor: 'novex', fecha: d('2026-08-01'), periodo: '2026-08' }],
  pagos: [
    { id: 'p1', clienteId: 'c1', clienteNegocio: 'Bar', periodo: '2026-08', montoUsd: 1000, estado: 'cobrado', montoCobrado: 1000, recibidoPor: 'novex', fechaCobro: d('2026-08-03'), vence: d('2026-08-10') },
    { id: 'p2', clienteId: 'c2', clienteNegocio: 'Peluquería', periodo: '2026-08', montoUsd: 500, estado: 'cobrado', montoCobrado: 500, recibidoPor: NICO, fechaCobro: d('2026-08-04'), vence: d('2026-08-10') },
  ],
  movimientos: [{ id: 'm1', tipo: 'retiro', montoUsd: 200, socio: JUAN, fecha: d('2026-08-06'), periodo: '2026-08' }],
  cargos: [], clientes: [],
};
console.log('CASO 3 — caja: entra 1000 a la caja, 500 lo cobra Nico, sale 300 de gasto y 200 de retiro');
ok('saldo de caja', caja(c).saldo, 500);            // 1000 − 300 − 200
ok('Nico (se quedó un cobro)', cuentaSocio(c, NICO).saldo, -500);
ok('Juan (retiró)', cuentaSocio(c, JUAN).saldo, -200);

// ---------- CASO 4: cuenta corriente de un cliente ----------
c = {
  gastos: [], movimientos: [],
  clientes: [{ id: 'c1', negocio: 'Bar Nueve' }],
  pagos: [
    { id: 'p1', clienteId: 'c1', clienteNegocio: 'Bar Nueve', periodo: '2026-07', montoUsd: 500, estado: 'cobrado', montoCobrado: 500, vence: d('2026-07-10'), fechaCobro: d('2026-07-09') },
    { id: 'p2', clienteId: 'c1', clienteNegocio: 'Bar Nueve', periodo: '2026-08', montoUsd: 500, estado: 'pendiente', montoCobrado: 200, vence: d('2026-08-10') },
  ],
  cargos: [
    { id: 'x1', clienteId: 'c1', tipo: 'cargo', concepto: 'Setup', montoUsd: 400, fecha: d('2026-07-01'), periodo: '2026-07' },
    { id: 'x2', clienteId: 'c1', tipo: 'credito', concepto: 'Bonificación', montoUsd: 100, fecha: d('2026-08-01'), periodo: '2026-08' },
  ],
};
const cc = ccCliente(c, 'c1');
console.log('CASO 4 — cliente: cuotas 500+500, setup 400, crédito 100, cobrado 500+200');
ok('facturado', cc.devengado, 1400);
ok('cobrado', cc.cobrado, 800);
ok('saldo', cc.saldo, 600);
ok('vencido (cuota de agosto parcial)', vencidoCliente(c, 'c1'), 300);

// El vencido nunca puede pasarse del saldo: si se bonificó, no se reclama.
const c5 = { gastos: [], movimientos: [], clientes: [{ id: 'c9', negocio: 'Peluquería' }],
  pagos: [{ id: 'p9', clienteId: 'c9', periodo: '2026-08', montoUsd: 800, estado: 'pendiente', montoCobrado: 300, vence: d('2026-08-05') }],
  cargos: [{ id: 'x9', clienteId: 'c9', tipo: 'credito', concepto: 'Bonificación', montoUsd: 100, fecha: d('2026-08-08'), periodo: '2026-08' }] };
console.log('CASO 4b — cuota 800, cobrado 300, bonificado 100');
ok('saldo', ccCliente(c5, 'c9').saldo, 400);
ok('vencido acotado al saldo', vencidoCliente(c5, 'c9'), 400);
ok('saldo del listado general', ccTodos(c)[0].saldo, 600);

// ---------- CASO 5: cobros viejos sin el campo recibidoPor ----------
c = { gastos: [], movimientos: [], cargos: [], clientes: [],
  pagos: [{ id: 'p1', clienteId: 'c1', periodo: '2026-06', montoUsd: 700, estado: 'cobrado', vence: d('2026-06-10'), fechaCobro: d('2026-06-09') }] };
console.log('CASO 5 — cobro viejo sin recibidoPor ni montoCobrado');
ok('entra a la caja', caja(c).saldo, 700);

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
