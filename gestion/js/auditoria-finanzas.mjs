// Auditoría adversaria del motor financiero. Se corre junto con finanzas.test.mjs:
//
//     node js/auditoria-finanzas.mjs
//
// A diferencia del test, este no comprueba que lo esperado funcione: intenta
// ROMPER el motor con datos incompletos, fechas cruzadas y casos borde. Encontró
// que la caja mostraba los cobros en el mes de la cuota y no en el que entró la plata.
import { caja, cajaDelPeriodo, cuentaSocio, neteo, ccCliente, vencidoCliente, ccTodos, libro }
  from './finanzas.js';

const NICO = '0H6nIW0JbzUI3igshz4HhLf66le2';
const JUAN = 'NUTgVP6JJAbvJg2ay47GtDgpxrk1';
const d = (s) => new Date(s + 'T12:00:00');
const vacio = () => ({ gastos: [], pagos: [], movimientos: [], cargos: [], clientes: [] });

let fallas = 0, avisos = 0;
const ok = (r, real, esp) => {
  const bien = Math.abs(real - esp) < 0.011;
  if (!bien) fallas++;
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${r}: ${real} (esperado ${esp})`);
};
const aviso = (t) => { avisos++; console.log(`  AVISO ${t}`); };
const titulo = (t) => console.log('\n' + t);

// ─────────────────────────────────────────────────────────────
titulo('1. La caja de un mes tiene que mostrar lo que se movió ESE mes');
{
  const c = vacio();
  // cuota de JULIO que se termina cobrando en AGOSTO
  c.pagos.push({ id: 'p1', clienteId: 'c1', clienteNegocio: 'Bar', periodo: '2026-07',
    montoUsd: 1000, estado: 'cobrado', montoCobrado: 1000, recibidoPor: 'novex',
    vence: d('2026-07-10'), fechaCobro: d('2026-08-04') });

  const jul = cajaDelPeriodo(c, '2026-07');
  const ago = cajaDelPeriodo(c, '2026-08');
  console.log(`  la plata entró el 04/08. Caja de julio: ${jul.entradas} | caja de agosto: ${ago.entradas}`);
  ok('agosto muestra la entrada', ago.entradas, 1000);
  ok('julio no la muestra', jul.entradas, 0);
}

// ─────────────────────────────────────────────────────────────
titulo('2. El saldo total tiene que ser igual a la suma de todos los meses');
{
  const c = vacio();
  c.gastos.push({ id: 'g1', concepto: 'x', montoUsd: 100, pagadoPor: 'novex', fecha: d('2026-07-05'), periodo: '2026-07' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-07', montoUsd: 500, estado: 'cobrado',
    montoCobrado: 500, recibidoPor: 'novex', vence: d('2026-07-10'), fechaCobro: d('2026-08-03') });
  c.movimientos.push({ id: 'm1', tipo: 'aporte', montoUsd: 200, socio: NICO, fecha: d('2026-09-01'), periodo: '2026-09' });

  const total = caja(c).saldo;
  const meses = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const suma = meses.reduce((s, m) => s + cajaDelPeriodo(c, m).neto, 0);
  console.log(`  saldo total: ${total} | suma de los meses: ${Math.round(suma * 100) / 100}`);
  ok('cuadran', Math.round(suma * 100) / 100, total);
}

// ─────────────────────────────────────────────────────────────
titulo('3. Un cobro cobrado en un mes distinto al de la cuota');
{
  const c = vacio();
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-07', montoUsd: 800, estado: 'cobrado',
    montoCobrado: 800, recibidoPor: 'novex', vence: d('2026-07-10'), fechaCobro: d('2026-08-20') });
  const filas = libro(c).filter((f) => f.clase === 'cobro');
  console.log(`  fecha de la fila: ${filas[0].fecha.toISOString().slice(0, 10)} | periodo de la fila: ${filas[0].periodo}`);
  if (filas[0].periodo !== '2026-08') aviso('la fila de caja lleva el período de la CUOTA, no el de la fecha en que entró la plata');
}

// ─────────────────────────────────────────────────────────────
titulo('4. Neteo: los dos socios sacaron más de lo que pusieron (saldos negativos)');
{
  const c = vacio();
  c.movimientos.push(
    { id: 'm1', tipo: 'retiro', montoUsd: 300, socio: NICO, fecha: d('2026-08-01'), periodo: '2026-08' },
    { id: 'm2', tipo: 'retiro', montoUsd: 100, socio: JUAN, fecha: d('2026-08-02'), periodo: '2026-08' },
  );
  const n = neteo(c);
  console.log(`  Nico ${n.cuentas[0].saldo} | Juan ${n.cuentas[1].saldo} | total ${n.total}`);
  console.log(`  transferencia: ${n.transferencia ? `${n.transferencia.de === NICO ? 'Nico' : 'Juan'} paga ${n.transferencia.monto}` : 'ninguna'}`);
  // Nico sacó 300 y Juan 100: para quedar parejos (−200 c/u) Nico le tiene que dar 100 a Juan
  ok('paga el que sacó de más', n.transferencia ? n.transferencia.monto : 0, 100);
  if (n.transferencia && n.transferencia.de !== NICO) { fallas++; console.log('  FALLA: debería pagar Nico'); }
}

// ─────────────────────────────────────────────────────────────
titulo('5. Neteo: después de emparejar, los dos quedan iguales (con retiros y cobros)');
{
  const c = vacio();
  c.gastos.push({ id: 'g1', concepto: 'x', montoUsd: 1000, pagadoPor: NICO, fecha: d('2026-08-01'), periodo: '2026-08' });
  c.movimientos.push({ id: 'm1', tipo: 'retiro', montoUsd: 400, socio: JUAN, fecha: d('2026-08-02'), periodo: '2026-08' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-08', montoUsd: 200, estado: 'cobrado',
    montoCobrado: 200, recibidoPor: NICO, vence: d('2026-08-05'), fechaCobro: d('2026-08-05') });
  // Nico: +1000 −200 = 800 | Juan: −400 | total 400 | objetivo 200 c/u
  const n1 = neteo(c);
  ok('Nico', n1.cuentas[0].saldo, 800);
  ok('Juan', n1.cuentas[1].saldo, -400);
  ok('transferencia', n1.transferencia.monto, 600);

  c.movimientos.push({ id: 'm2', tipo: 'neteo', montoUsd: 600, socio: n1.transferencia.de,
    socioDestino: n1.transferencia.a, fecha: d('2026-08-10'), periodo: '2026-08' });
  const n2 = neteo(c);
  console.log(`  tras netear: Nico ${n2.cuentas[0].saldo} | Juan ${n2.cuentas[1].saldo}`);
  ok('quedan iguales', n2.cuentas[0].saldo - n2.cuentas[1].saldo, 0);
  if (!n2.parejo) { fallas++; console.log('  FALLA: sigue pidiendo transferencia'); }
  ok('el total no cambió', n2.total, 400);
}

// ─────────────────────────────────────────────────────────────
titulo('6. Reintegro: le devuelven al socio lo que puso, tiene que quedar en cero');
{
  const c = vacio();
  c.gastos.push({ id: 'g1', concepto: 'x', montoUsd: 250, pagadoPor: NICO, fecha: d('2026-08-01'), periodo: '2026-08' });
  c.movimientos.push({ id: 'm1', tipo: 'aporte', montoUsd: 1000, socio: JUAN, fecha: d('2026-08-01'), periodo: '2026-08' });
  c.movimientos.push({ id: 'm2', tipo: 'reintegro', montoUsd: 250, socio: NICO, fecha: d('2026-08-05'), periodo: '2026-08' });
  ok('Nico vuelve a cero', cuentaSocio(c, NICO).saldo, 0);
  ok('la caja pagó el reintegro', caja(c).saldo, 750);
}

// ─────────────────────────────────────────────────────────────
titulo('7. Doble conteo: un gasto pagado por un socio NO sale de la caja');
{
  const c = vacio();
  c.gastos.push({ id: 'g1', concepto: 'x', montoUsd: 500, pagadoPor: NICO, fecha: d('2026-08-01'), periodo: '2026-08' });
  ok('la caja no se toca', caja(c).saldo, 0);
  ok('la cuenta del socio sí', cuentaSocio(c, NICO).saldo, 500);
}

// ─────────────────────────────────────────────────────────────
titulo('8. Cobro parcial: nunca se cuenta de más');
{
  const c = vacio();
  c.clientes.push({ id: 'c1', negocio: 'Bar' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-08', montoUsd: 1000, estado: 'pendiente',
    montoCobrado: 400, recibidoPor: 'novex', vence: d('2026-08-05'), fechaCobro: d('2026-08-06') });
  const cc = ccCliente(c, 'c1');
  ok('facturado', cc.devengado, 1000);
  ok('cobrado', cc.cobrado, 400);
  ok('saldo', cc.saldo, 600);
  ok('a la caja entraron 400', caja(c).saldo, 400);
}

// ─────────────────────────────────────────────────────────────
titulo('9. Le pagaron de más (montoCobrado > cuota): queda saldo a favor del cliente');
{
  const c = vacio();
  c.clientes.push({ id: 'c1', negocio: 'Bar' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-08', montoUsd: 500, estado: 'cobrado',
    montoCobrado: 700, recibidoPor: 'novex', vence: d('2026-08-05'), fechaCobro: d('2026-08-05') });
  const cc = ccCliente(c, 'c1');
  ok('saldo a favor del cliente', cc.saldo, -200);
  ok('vencido no puede ser negativo', vencidoCliente(c, 'c1'), 0);
  ok('a la caja entró todo', caja(c).saldo, 700);
}

// ─────────────────────────────────────────────────────────────
titulo('10. Datos sucios: gasto sin pagadoPor, movimiento sin socio, monto en texto');
{
  const c = vacio();
  c.gastos.push({ id: 'g1', concepto: 'sin pagador', montoUsd: 100, fecha: d('2026-08-01'), periodo: '2026-08' });
  c.gastos.push({ id: 'g2', concepto: 'monto texto', montoUsd: '250.50', pagadoPor: NICO, fecha: d('2026-08-01'), periodo: '2026-08' });
  c.movimientos.push({ id: 'm1', tipo: 'retiro', montoUsd: 50, fecha: d('2026-08-02'), periodo: '2026-08' });
  console.log(`  caja: ${caja(c).saldo} | Nico: ${cuentaSocio(c, NICO).saldo}`);
  ok('el gasto sin pagador se toma como de la caja', caja(c).saldo, -150);
  ok('el monto en texto se convierte', cuentaSocio(c, NICO).saldo, 250.5);
  const huerfano = libro(c).find((f) => f.clase === 'retiro' && !f.socio);
  if (huerfano) aviso('hay un retiro sin socio: baja la caja pero no la cuenta de nadie');
}

// ─────────────────────────────────────────────────────────────
titulo('11. Neteo mal cargado: mismo socio de origen y destino');
{
  const c = vacio();
  c.movimientos.push({ id: 'm1', tipo: 'neteo', montoUsd: 500, socio: NICO, socioDestino: NICO,
    fecha: d('2026-08-01'), periodo: '2026-08' });
  ok('se anula solo', cuentaSocio(c, NICO).saldo, 0);
  ok('no toca la caja', caja(c).saldo, 0);
}

// ─────────────────────────────────────────────────────────────
titulo('12. Neteo sin destino (dato incompleto)');
{
  const c = vacio();
  c.movimientos.push({ id: 'm1', tipo: 'neteo', montoUsd: 500, socio: NICO, fecha: d('2026-08-01'), periodo: '2026-08' });
  const n = neteo(c);
  console.log(`  Nico ${n.cuentas[0].saldo} | Juan ${n.cuentas[1].saldo} | total ${n.total}`);
  if (n.total !== 0) aviso(`un neteo sin destino deja ${n.total} colgado: la contrapartida no le llega a nadie`);
}

// ─────────────────────────────────────────────────────────────
titulo('13. Cuenta corriente: el orden de los movimientos y el saldo corrido');
{
  const c = vacio();
  c.clientes.push({ id: 'c1', negocio: 'Bar' });
  c.cargos.push({ id: 'x1', clienteId: 'c1', tipo: 'cargo', concepto: 'Setup', montoUsd: 300, fecha: d('2026-06-01'), periodo: '2026-06' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-07', montoUsd: 500, estado: 'cobrado',
    montoCobrado: 500, vence: d('2026-07-10'), fechaCobro: d('2026-07-09') });
  c.cargos.push({ id: 'x2', clienteId: 'c1', tipo: 'credito', concepto: 'Bonif', montoUsd: 100, fecha: d('2026-08-01'), periodo: '2026-08' });
  const cc = ccCliente(c, 'c1');
  console.log('  ' + cc.filas.map((f) => `${f.fecha.toISOString().slice(5, 10)} ${f.concepto} d:${f.debe} h:${f.haber} => ${f.saldo}`).join('\n  '));
  // debe: 300 (setup) + 500 (cuota) = 800 | haber: 500 (pago) + 100 (bonif) = 600
  ok('saldo final', cc.saldo, 200);
  const ultimo = cc.filas[cc.filas.length - 1];
  ok('el saldo corrido termina igual al saldo', ultimo.saldo, cc.saldo);
}

// ─────────────────────────────────────────────────────────────
titulo('14. Cuota sin fecha de vencimiento');
{
  const c = vacio();
  c.clientes.push({ id: 'c1', negocio: 'Bar' });
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-08', montoUsd: 400, estado: 'pendiente', montoCobrado: 0 });
  ok('igual se devenga', ccCliente(c, 'c1').devengado, 400);
  ok('no figura como vencida', vencidoCliente(c, 'c1'), 0);
}

// ─────────────────────────────────────────────────────────────
titulo('15. Cierre: la plata no se crea ni se destruye');
{
  // Todo lo que la sociedad tiene (caja) más lo que le deben los clientes,
  // menos lo que les debe a los socios, tiene que cerrar contra el resultado.
  const c = vacio();
  c.clientes.push({ id: 'c1', negocio: 'Bar' });
  c.gastos.push(
    { id: 'g1', concepto: 'a', montoUsd: 300, pagadoPor: 'novex', fecha: d('2026-08-01'), periodo: '2026-08' },
    { id: 'g2', concepto: 'b', montoUsd: 200, pagadoPor: NICO, fecha: d('2026-08-02'), periodo: '2026-08' },
  );
  c.pagos.push({ id: 'p1', clienteId: 'c1', periodo: '2026-08', montoUsd: 1000, estado: 'cobrado',
    montoCobrado: 1000, recibidoPor: 'novex', vence: d('2026-08-05'), fechaCobro: d('2026-08-05') });
  c.movimientos.push(
    { id: 'm1', tipo: 'aporte', montoUsd: 500, socio: JUAN, fecha: d('2026-08-01'), periodo: '2026-08' },
    { id: 'm2', tipo: 'retiro', montoUsd: 150, socio: NICO, fecha: d('2026-08-06'), periodo: '2026-08' },
  );
  const laCaja = caja(c).saldo;
  const deudaConSocios = cuentaSocio(c, NICO).saldo + cuentaSocio(c, JUAN).saldo;
  // caja = cobros + aportes − gastos de la caja − retiros
  ok('caja', laCaja, 1000 + 500 - 300 - 150);
  // deuda con socios = lo que pusieron − lo que sacaron
  ok('deuda con los socios', deudaConSocios, (200 + 500) - 150);
  // patrimonio: lo que hay en la caja menos lo que se les debe a los socios
  console.log(`  caja ${laCaja} − deuda con socios ${deudaConSocios} = ${Math.round((laCaja - deudaConSocios) * 100) / 100}`);
  // resultado real del negocio: cobrado − gastos totales
  ok('cierra contra el resultado (cobrado − gastos)', laCaja - deudaConSocios, 1000 - 500);
}

console.log('\n' + '─'.repeat(60));
console.log(fallas ? `${fallas} FALLAS` : 'sin fallas de cálculo');
console.log(avisos ? `${avisos} avisos para revisar` : 'sin avisos');
process.exit(0);
