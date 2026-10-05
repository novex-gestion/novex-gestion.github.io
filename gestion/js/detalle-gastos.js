// Detalle de gastos para cobrarle al cliente.
//
// Lo que vos adelantás (hosting, VPS, una API) y le refacturás: acá se arma el
// detalle para mandárselo. Dos salidas, porque son dos momentos distintos:
//   · WhatsApp  → el mensaje listo para pegar, que es como se cobra de verdad.
//   · Imprimir  → una hoja con membrete, para cuando lo pide formal o se lo
//                 tiene que pasar al contador.
//
// Solo entran los gastos REFACTURADOS (los que tienen cargoId): si no se marcó
// "se lo refacturo", es un costo nuestro y no tiene por qué ir en el detalle.

import { fmtUsd, fmtFechaCorta, aFecha, esc, nombrePeriodo } from './ui.js?v=11';

// Los gastos refacturados de un cliente, del más viejo al más nuevo.
// `periodo` en formato YYYY-MM; sin él, entran todos.
export function gastosDe(cache, clienteId, periodo) {
  return (cache.gastos || [])
    .filter((g) => g.clienteId === clienteId && g.cargoId)
    .filter((g) => !periodo || g.periodo === periodo)
    .sort((a, b) => (aFecha(a.fecha)?.getTime() || 0) - (aFecha(b.fecha)?.getTime() || 0));
}

export function totalDe(gastos) {
  return gastos.reduce((s, g) => s + (Number(g.montoUsd) || 0), 0);
}

// ============================================================
// WhatsApp
// ============================================================
// Texto plano: los emojis y el markdown de WhatsApp se ven distinto en cada
// teléfono y esto lo lee alguien que va a pagar. Mejor que se entienda.
export function textoWa(cliente, gastos, periodo) {
  const total = totalDe(gastos);
  const cuando = periodo ? nombrePeriodo(periodo) : 'a la fecha';

  const lineas = gastos.map((g) => {
    const fecha = fmtFechaCorta(g.fecha);
    const monto = fmtUsd(g.montoUsd);
    // Si se pagó en pesos, va el importe original: es el número que el cliente
    // puede cotejar contra el comprobante.
    const enPesos = g.moneda === 'ARS' && g.montoOriginal
      ? ` (ARS ${Number(g.montoOriginal).toLocaleString('es-AR')})`
      : '';
    return `- ${fecha} · ${g.concepto} · ${monto}${enPesos}`;
  });

  return [
    `Hola! Te paso el detalle de los gastos de ${cuando} que adelantamos por ${cliente.negocio}:`,
    '',
    ...lineas,
    '',
    `Total a reintegrar: ${fmtUsd(total)}`,
    '',
    'Cualquier duda me decís.',
  ].join('\n');
}

// ============================================================
// Hoja imprimible
// ============================================================
// Se abre en una pestaña y se imprime (o se guarda como PDF desde el navegador,
// que es como la mayoría termina haciendo el PDF).
export function abrirImprimible(cliente, gastos, periodo) {
  const total = totalDe(gastos);
  const cuando = periodo ? nombrePeriodo(periodo) : 'a la fecha';
  const hoy = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const filas = gastos.map((g) => `
    <tr>
      <td class="fecha">${esc(fmtFechaCorta(g.fecha))}</td>
      <td>${esc(g.concepto)}${g.moneda === 'ARS' && g.montoOriginal
        ? `<span class="ars">ARS ${Number(g.montoOriginal).toLocaleString('es-AR')} · TC ${esc(String(g.tc || "—"))}</span>`
        : ''}</td>
      <td class="monto">${esc(fmtUsd(g.montoUsd))}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Gastos ${esc(cliente.negocio)} — ${esc(cuando)}</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #16130f; margin: 0; padding: 28px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .hoja { max-width: 680px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #16130f; padding-bottom: 14px; margin-bottom: 26px; }
  .marca { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; }
  .marca span { color: #e07a1f; }
  .meta { text-align: right; font-size: 12px; color: #6b655d; line-height: 1.7; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 3px; }
  .para { font-size: 13px; color: #6b655d; margin: 0 0 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.09em;
       color: #6b655d; font-weight: 600; padding: 0 0 8px; border-bottom: 1px solid #d8d1c8; }
  th.monto, td.monto { text-align: right; }
  td { padding: 10px 0; border-bottom: 1px solid #ebe6df; vertical-align: top; }
  td.fecha { color: #6b655d; white-space: nowrap; padding-right: 16px; width: 70px; }
  td.monto { font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 16px; }
  .ars { display: block; font-size: 11px; color: #8b8278; margin-top: 2px; }
  tfoot td { border-bottom: none; border-top: 2px solid #16130f; padding-top: 12px;
             font-weight: 700; font-size: 15px; }
  .pie { margin-top: 30px; font-size: 11.5px; color: #8b8278; border-top: 1px solid #ebe6df;
         padding-top: 12px; }
  .imprimir { position: fixed; top: 18px; right: 18px; padding: 9px 18px; font-size: 13px;
              background: #16130f; color: #fff; border: 0; border-radius: 3px; cursor: pointer; }
  @media print { .imprimir { display: none; } body { padding: 0; } }
</style></head>
<body>
<button class="imprimir" onclick="window.print()">Imprimir o guardar PDF</button>
<div class="hoja">
  <header>
    <div class="marca">NO<span>VEX</span></div>
    <div class="meta">Detalle de gastos<br>${esc(hoy)}</div>
  </header>

  <h1>Gastos adelantados — ${esc(cuando)}</h1>
  <p class="para">${esc(cliente.negocio)}${cliente.contacto ? ' · ' + esc(cliente.contacto) : ''}</p>

  <table>
    <thead><tr><th>Fecha</th><th>Concepto</th><th class="monto">Importe</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="3">Sin gastos en el período.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="2">Total a reintegrar</td>
      <td class="monto">${esc(fmtUsd(total))}</td>
    </tr></tfoot>
  </table>

  <p class="pie">
    Gastos abonados por NOVEX por cuenta y orden de ${esc(cliente.negocio)}.
    ${gastos.some((g) => g.moneda === 'ARS')
      ? 'Los importes en pesos se convirtieron al tipo de cambio del día de cada gasto.'
      : ''}
  </p>
</div>
</body></html>`;

  const v = window.open('', '_blank');
  if (!v) return false;          // el navegador bloqueó la pestaña
  v.document.write(html);
  v.document.close();
  return true;
}
