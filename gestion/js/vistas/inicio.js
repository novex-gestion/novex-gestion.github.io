// 01 · INICIO — qué atender hoy + P&L del mes (cobrado − gastos).
import { cache, alCambiar } from '../datos.js';
import { esc, fmtUsd, aFecha, periodoDe, nombrePeriodo, sumarMeses } from '../ui.js';

const DIA_MS = 86400000;

export function montarInicio(raiz) {
  function pintar() {
    if (!raiz.isConnected) return;
    const ahora = new Date();
    const periodo = periodoDe();

    // ---- Alertas ----
    const consultasNuevas = cache.consultas.filter((c) => c.estado === 'nueva');
    const pagosMes = cache.pagos;
    const vencidas = pagosMes.filter((p) => p.estado === 'pendiente' && aFecha(p.vence) && aFecha(p.vence) < ahora);
    const porVencer = pagosMes.filter((p) => {
      const v = aFecha(p.vence);
      return p.estado === 'pendiente' && v && v >= ahora && v - ahora < 7 * DIA_MS;
    });
    const frios = cache.leads.filter((l) => {
      if (l.etapa === 'ganado' || l.etapa === 'perdido') return false;
      const f = aFecha(l.etapaCambiadaEl);
      return f && ahora - f > 5 * DIA_MS;
    });
    const tareasVencidas = cache.tareas.filter((t) => {
      const f = aFecha(t.fechaLimite);
      return t.estado === 'pendiente' && f && f < ahora;
    });
    const tareasHoy = cache.tareas.filter((t) => {
      const f = aFecha(t.fechaLimite);
      return t.estado === 'pendiente' && f && f.toDateString() === ahora.toDateString();
    });

    const alertas = [
      consultasNuevas.length && {
        href: '#/pipeline', tono: 'naranja',
        texto: `${consultasNuevas.length === 1 ? '1 consulta nueva' : consultasNuevas.length + ' consultas nuevas'} desde la web`,
      },
      vencidas.length && {
        href: '#/cobranzas', tono: 'rojo',
        texto: `${vencidas.length === 1 ? '1 cuota vencida' : vencidas.length + ' cuotas vencidas'} · ${fmtUsd(vencidas.reduce((s, p) => s + (Number(p.montoUsd) || 0), 0))}`,
      },
      porVencer.length && {
        href: '#/cobranzas', tono: 'naranja',
        texto: `${porVencer.length === 1 ? '1 cuota vence' : porVencer.length + ' cuotas vencen'} esta semana`,
      },
      frios.length && {
        href: '#/pipeline', tono: 'naranja',
        texto: `${frios.length === 1 ? '1 lead frío' : frios.length + ' leads fríos'} (5+ días sin moverse): ${esc(frios.slice(0, 2).map((l) => l.negocio).join(', '))}${frios.length > 2 ? '…' : ''}`,
      },
      tareasVencidas.length && {
        href: '#/tareas', tono: 'rojo',
        texto: `${tareasVencidas.length === 1 ? '1 tarea vencida' : tareasVencidas.length + ' tareas vencidas'}`,
      },
      tareasHoy.length && {
        href: '#/tareas', tono: 'crema',
        texto: `${tareasHoy.length === 1 ? '1 tarea para hoy' : tareasHoy.length + ' tareas para hoy'}`,
      },
    ].filter(Boolean);

    // ---- P&L del mes ----
    const cobrado = cache.pagos
      .filter((p) => p.periodo === periodo && p.estado === 'cobrado')
      .reduce((s, p) => s + (Number(p.montoUsd) || 0), 0);
    const gastos = cache.gastos
      .filter((g) => g.periodo === periodo)
      .reduce((s, g) => s + (Number(g.montoUsd) || 0), 0);
    const resultado = cobrado - gastos;
    const activos = cache.clientes.filter((c) => c.estado === 'activo');
    const mrr = activos.reduce((s, c) => s + (Number(c.cuotaMensualUsd) || 0), 0);

    const abiertos = cache.leads.filter((l) => l.etapa !== 'ganado' && l.etapa !== 'perdido');
    const valorAbierto = abiertos.reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);

    // ---- Serie 6 meses: cobrado vs gastos ----
    const meses = [];
    for (let i = 5; i >= 0; i--) meses.push(sumarMeses(periodo, -i));
    const serie = meses.map((per) => ({
      per,
      cobrado: cache.pagos.filter((p) => p.periodo === per && p.estado === 'cobrado')
        .reduce((s, p) => s + (Number(p.montoUsd) || 0), 0),
      gastos: cache.gastos.filter((g) => g.periodo === per)
        .reduce((s, g) => s + (Number(g.montoUsd) || 0), 0),
    }));
    const tope = Math.max(...serie.flatMap((m) => [m.cobrado, m.gastos]), 1);

    // ---- Margen por cliente (mes actual) ----
    const margenes = activos.map((c) => {
      const directos = cache.gastos
        .filter((g) => g.periodo === periodo && g.clienteId === c.id)
        .reduce((s, g) => s + (Number(g.montoUsd) || 0), 0);
      return { c, directos, margen: (Number(c.cuotaMensualUsd) || 0) - directos };
    }).sort((a, b) => b.margen - a.margen);

    // ---- Cierre del pipeline (histórico) ----
    const ganados = cache.leads.filter((l) => l.etapa === 'ganado').length;
    const perdidos = cache.leads.filter((l) => l.etapa === 'perdido');

    raiz.innerHTML = `
      <div class="vista__cab">
        <div>
          <h1 class="vista__titulo">Ini<em>cio</em></h1>
          <p class="vista__sub mono">${esc(ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        </div>
      </div>

      ${alertas.length ? `
        <section class="panel" style="margin-bottom:14px">
          <h2 class="panel__titulo">Para atender</h2>
          <div class="filas">
            ${alertas.map((a) => `
              <a class="fila fila--link alerta--${a.tono}" href="${a.href}" style="text-decoration:none">
                <p class="fila__nombre" style="font-size:14px">${a.texto}</p>
                <span class="mono" style="color:var(--minimo); font-size:12px">→</span>
              </a>`).join('')}
          </div>
        </section>` : `
        <p class="vacio" style="margin-bottom:14px">// Nada urgente para atender. 🧉</p>`}

      <div class="kpis">
        <div class="kpi"><p class="kpi__nombre">Cobrado ${esc(periodo)}</p><p class="kpi__valor verde">${fmtUsd(cobrado)}</p></div>
        <div class="kpi"><p class="kpi__nombre">Gastos</p><p class="kpi__valor rojo">${fmtUsd(gastos)}</p></div>
        <div class="kpi"><p class="kpi__nombre">Resultado</p><p class="kpi__valor ${resultado >= 0 ? 'verde' : 'rojo'}">${resultado < 0 ? '−' : ''}${fmtUsd(Math.abs(resultado))}</p></div>
        <div class="kpi"><p class="kpi__nombre">Recurrente</p><p class="kpi__valor naranja">${fmtUsd(mrr)}</p></div>
      </div>

      <section class="panel" style="margin-bottom:14px">
        <h2 class="panel__titulo">Últimos 6 meses <span class="mono" style="color:var(--minimo); text-transform:none; letter-spacing:0.05em">■ cobrado · <span style="color:var(--rojo)">■</span> gastos</span></h2>
        <div class="grafico">
          ${serie.map((mes) => `
            <div class="grafico__mes">
              <div class="grafico__barras">
                <div class="grafico__barra grafico__barra--cobrado" style="height:${Math.round((mes.cobrado / tope) * 100)}%" title="${fmtUsd(mes.cobrado)}"></div>
                <div class="grafico__barra grafico__barra--gasto" style="height:${Math.round((mes.gastos / tope) * 100)}%" title="${fmtUsd(mes.gastos)}"></div>
              </div>
              <p class="grafico__rotulo mono">${esc(nombrePeriodo(mes.per).slice(0, 3))}</p>
            </div>`).join('')}
        </div>
      </section>

      <section class="panel" style="margin-bottom:14px">
        <h2 class="panel__titulo">Pipeline</h2>
        <div class="datos">
          <div><p class="dato__nombre">Abiertos</p><p class="dato__valor">${abiertos.length} lead${abiertos.length === 1 ? '' : 's'} · ${fmtUsd(valorAbierto)}</p></div>
          <div><p class="dato__nombre">Ganados</p><p class="dato__valor">${ganados}</p></div>
          <div><p class="dato__nombre">Perdidos</p><p class="dato__valor">${perdidos.length}</p></div>
        </div>
        ${perdidos.filter((l) => l.motivoPerdido).length ? `
          <p class="modal__nota" style="margin-top:10px">// Últimos motivos de pérdida: ${perdidos
            .filter((l) => l.motivoPerdido)
            .sort((a, b) => (aFecha(b.etapaCambiadaEl)?.getTime() || 0) - (aFecha(a.etapaCambiadaEl)?.getTime() || 0))
            .slice(0, 3).map((l) => esc(l.motivoPerdido)).join(' · ')}</p>` : ''}
      </section>

      ${margenes.length ? `
        <section class="panel">
          <h2 class="panel__titulo">Margen por cliente (${esc(nombrePeriodo(periodo))})</h2>
          <div class="filas">
            ${margenes.map(({ c, directos, margen }) => `
              <a class="fila fila--link" href="#/clientes/${esc(c.id)}" style="text-decoration:none">
                <div class="fila__principal">
                  <p class="fila__nombre" style="font-size:14px">${esc(c.negocio)}</p>
                  <p class="fila__detalle">cuota ${fmtUsd(c.cuotaMensualUsd)}${directos ? ' − ' + fmtUsd(directos) + ' directos' : ' · sin gastos directos'}</p>
                </div>
                <span class="fila__monto" style="color:${margen >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${margen < 0 ? '−' : ''}${fmtUsd(Math.abs(margen))}</span>
              </a>`).join('')}
          </div>
        </section>` : ''}`;
  }

  pintar();
  return alCambiar(() => pintar());
}
