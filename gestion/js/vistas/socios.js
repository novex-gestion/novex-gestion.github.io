// 07 · SOCIOS — que el esfuerzo sea parejo.
//
// Cada socio tiene una cuenta con la sociedad. Sube cuando pone plata (gastos
// de su bolsillo, aportes) y baja cuando saca (retiros, cobros que se quedó).
// El neteo dice quién tiene que transferirle a quién para quedar iguales
// según la participación de cada uno.
import { SOCIOS, nombreSocio } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { neteo, cuentaSocio, rotuloTipo } from '../finanzas.js';
import { esc, fmtUsd, fmtFechaCorta, toast } from '../ui.js';
import { formularioMovimiento } from './caja.js';

export function montarSocios(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">So<em>cios</em></h1>
        <p class="vista__sub mono">Neteo y cuentas entre socios</p>
      </div>
      <button type="button" class="boton boton--chico" id="btn-mov-socio">+ Movimiento</button>
    </div>
    <div class="kpis" id="soc-kpis"></div>
    <div id="soc-liquidacion" style="margin-top:4px"></div>
    <div id="soc-detalle" style="margin-top:18px"></div>`;

  raiz.querySelector('#btn-mov-socio').addEventListener('click', () => formularioMovimiento(null, 'aporte'));

  function pintar() {
    const zonaKpis = raiz.querySelector('#soc-kpis');
    if (!zonaKpis) return;

    const n = neteo(cache);

    zonaKpis.innerHTML = n.cuentas.map((c) => `
      <div class="kpi">
        <p class="kpi__nombre">${esc(nombreSocio(c.uid))} · ${Math.round(c.participacion * 100)} %</p>
        <p class="kpi__valor ${c.saldo < 0 ? 'rojo' : c.saldo > 0 ? 'verde' : ''}">${fmtUsd(c.saldo)}</p>
        <p class="kpi__pie mono">${c.saldo > 0 ? 'puso de su bolsillo' : c.saldo < 0 ? 'tiene plata de la sociedad' : 'en cero'}</p>
      </div>`).join('') + `
      <div class="kpi">
        <p class="kpi__nombre">Puesto entre los dos</p>
        <p class="kpi__valor">${fmtUsd(n.total)}</p>
        <p class="kpi__pie mono">capital de trabajo de los socios</p>
      </div>`;

    // ---- La liquidación: el número que resuelve el pedido ----
    const liq = raiz.querySelector('#soc-liquidacion');
    if (n.parejo) {
      liq.innerHTML = `
        <div class="panel panel--ok">
          <p class="panel__destacado">Están parejos ✓</p>
          <p class="panel__texto">Ninguno le debe nada al otro: cada uno sostiene su parte del negocio.</p>
        </div>`;
    } else {
      const t = n.transferencia;
      liq.innerHTML = `
        <div class="panel panel--accion">
          <p class="panel__destacado">${esc(nombreSocio(t.de))} le tiene que transferir ${fmtUsd(t.monto)} a ${esc(nombreSocio(t.a))}</p>
          <p class="panel__texto">
            Con esa transferencia los dos quedan habiendo puesto lo mismo que les toca por su participación.
            No mueve la caja de NOVEX: es plata entre ustedes.
          </p>
          <button type="button" class="boton boton--lleno" id="btn-netear">Registrar la transferencia</button>
        </div>`;
      liq.querySelector('#btn-netear').addEventListener('click', () => {
        formularioMovimiento(
          {
            tipo: 'neteo',
            fecha: new Date(),
            montoUsd: t.monto,
            socio: t.de,
            socioDestino: t.a,
            concepto: `Neteo: ${nombreSocio(t.de)} → ${nombreSocio(t.a)}`,
          },
          'neteo'
        );
      });
    }

    // ---- Detalle de cada cuenta ----
    raiz.querySelector('#soc-detalle').innerHTML = n.cuentas.map((c) => {
      const lineas = [
        ['Gastos que puso de su bolsillo', c.puso, '+'],
        ['Aportes a la caja', c.aportes, '+'],
        ['Retiros', c.retiros, '−'],
        ['Reintegros que recibió', c.reintegros, '−'],
        ['Cobros de clientes que se quedó', c.cobrosRecibidos, '−'],
        ['Neteos', c.neteos, c.neteos < 0 ? '−' : '+'],
      ].filter(([, v]) => Math.abs(v) > 0.004);

      const movs = c.filas.slice(0, 8);

      return `
        <section class="bloque-socio">
          <div class="bloque-socio__cab">
            <h2 class="bloque-socio__nombre">${esc(nombreSocio(c.uid))}</h2>
            <span class="bloque-socio__saldo ${c.saldo < 0 ? 'rojo' : 'verde'}">${fmtUsd(c.saldo)}</span>
          </div>
          <div class="bloque-socio__cuenta">
            ${lineas.map(([rotulo, valor, signo]) => `
              <div class="renglon">
                <span class="renglon__rotulo">${esc(rotulo)}</span>
                <span class="renglon__valor mono">${signo} ${fmtUsd(Math.abs(valor))}</span>
              </div>`).join('') || '<p class="vacio">// Sin movimientos todavía.</p>'}
            <div class="renglon renglon--total">
              <span class="renglon__rotulo">Saldo${c.saldo > 0 ? ' — NOVEX le debe' : c.saldo < 0 ? ' — le debe a NOVEX' : ''}</span>
              <span class="renglon__valor mono">${fmtUsd(c.saldo)}</span>
            </div>
            <div class="renglon renglon--objetivo">
              <span class="renglon__rotulo">Le corresponde sostener (${Math.round(c.participacion * 100)} %)</span>
              <span class="renglon__valor mono">${fmtUsd(c.objetivo)}</span>
            </div>
            <div class="renglon renglon--dif">
              <span class="renglon__rotulo">${c.diferencia > 0 ? 'Puso de más' : c.diferencia < 0 ? 'Puso de menos' : 'Está justo'}</span>
              <span class="renglon__valor mono ${c.diferencia < 0 ? 'rojo' : c.diferencia > 0 ? 'verde' : ''}">${fmtUsd(Math.abs(c.diferencia))}</span>
            </div>
          </div>
          ${movs.length ? `
            <div class="filas">
              ${movs.map((f) => `
                <article class="fila">
                  <div class="fila__principal">
                    <p class="fila__nombre">${esc(f.concepto)}</p>
                    <p class="fila__detalle">${esc([fmtFechaCorta(f.fecha), rotuloTipo(f.clase)].filter(Boolean).join(' · '))}</p>
                  </div>
                  <div class="fila__lado">
                    <span class="fila__monto ${f.cuentaSocio > 0 ? 'verde' : 'rojo'}">${f.cuentaSocio > 0 ? '+' : '−'} ${fmtUsd(Math.abs(f.cuentaSocio))}</span>
                  </div>
                </article>`).join('')}
            </div>
            ${c.filas.length > movs.length ? `<p class="modal__nota">// y ${c.filas.length - movs.length} movimientos más.</p>` : ''}`
          : ''}
        </section>`;
    }).join('');
  }

  pintar();
  return alCambiar((col) => {
    if (['movimientos', 'gastos', 'pagos', 'clientes'].includes(col)) pintar();
  });
}
