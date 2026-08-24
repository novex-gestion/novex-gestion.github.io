// 01 · POSTULANTES — la bandeja de Juno.
// Acá caen los candidatos a activador del canal Clover: Juno los contacta por
// WhatsApp, los clasifica y escala; el equipo decide y registra el desenlace.
import {
  doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import {
  ESTADOS_POSTULANTE, ESTADOS_PIPELINE, nombreEstadoPostulante, nombrePersona, nombreAutor,
} from '../config.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtFechaCorta, haceDias, aFecha, modal, confirmar, toast, selectHtml,
} from '../../../gestion/js/ui.js';

// Los que piden atención humana primero (ordenan la lista arriba de todo).
const CALIENTES = ['interesado', 'agendado'];

// El paso siguiente del embudo, para avanzar con un solo botón.
// Desde "Llamar" (agendado) no hay siguiente automático: el pase a Activo se
// hace con el botón "→ Equipo", que pide el número de activador de Trackeando.
const PROXIMO = {
  nuevo: 'contactado',
  contactado: 'interesado',
  interesado: 'agendado',
  no_responde: 'contactado',   // fichas viejas
  descartado: 'contactado',
};

// 5491164127127 -> 11 6412-7127
function telLindo(t) {
  const d = String(t || '').replace(/\D/g, '').replace(/^549?/, '');
  if (d.length !== 10) return t || '—';
  const area = d.length === 10 && d.startsWith('11') ? 2 : 3;
  const resto = d.slice(area);
  return `${d.slice(0, area)} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

// Lo que escribe una persona ("11 3495-3442", "011 15 3495 3442", "+54 9 11...")
// tiene que terminar en el mismo formato que usa Juno, porque el teléfono ES el
// id del documento: si no coincide, se crea una ficha duplicada.
export function normalizarTel(entrada) {
  let d = String(entrada || '').replace(/\D/g, '');
  if (!d) return null;
  d = d.replace(/^0+/, '');                      // 011... -> 11...
  if (d.startsWith('54')) d = d.slice(2);        // país
  if (d.startsWith('9')) d = d.slice(1);         // el 9 de móvil
  d = d.replace(/^0+/, '');
  // El 15 va después del código de área, que puede tener 2, 3 o 4 dígitos.
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break; }
    }
  }
  if (d.length !== 10) return null;              // no se pudo interpretar
  return '549' + d;
}

// Alta a mano: alguien que llegó por afuera del pool (una recomendación, un CV
// suelto, alguien que escribió). Queda en NUEVO, listo para que Juno lo contacte.
function altaManual(alGuardar) {
  const m = modal('Nuevo postulante', `
    <div class="modal__cuerpo">
      <div class="campo">
        <label class="campo__nombre" for="np-nombre">Nombre y apellido</label>
        <input id="np-nombre" type="text" placeholder="Franco Gauna" autocomplete="off">
      </div>
      <div class="campo">
        <label class="campo__nombre" for="np-tel">Teléfono</label>
        <input id="np-tel" type="tel" placeholder="11 3495-3442" autocomplete="off">
        <p class="campo__ayuda mono" id="np-tel-eco">Como lo tengas: se acomoda solo.</p>
      </div>
      <div class="campo">
        <label class="campo__nombre" for="np-localidad">Localidad</label>
        <input id="np-localidad" type="text" placeholder="Pablo Podestá" autocomplete="off">
      </div>
      <div class="campo">
        <label class="campo__nombre" for="np-email">Email <span class="campo__opc">(opcional)</span></label>
        <input id="np-email" type="email" placeholder="nombre@mail.com" autocomplete="off">
      </div>
      <div class="campo">
        <label class="campo__nombre" for="np-perfil">De dónde viene o qué hace</label>
        <textarea id="np-perfil" rows="2" placeholder="Lo recomendó Mati. Vendió seguros dos años."></textarea>
      </div>
      <div class="modal__acciones">
        <button type="button" class="boton" data-cerrar>Cancelar</button>
        <button type="button" class="boton boton--lleno" data-crear>Agregar</button>
      </div>
    </div>`);

  const $ = (id) => m.el.querySelector(id);
  const eco = $('#np-tel-eco');

  // Mostrar cómo va a quedar, antes de guardar: un teléfono mal cargado es una
  // ficha que Juno nunca va a poder contactar.
  $('#np-tel').addEventListener('input', (e) => {
    const t = normalizarTel(e.target.value);
    if (!e.target.value.trim()) {
      eco.textContent = 'Como lo tengas: se acomoda solo.';
      eco.classList.remove('campo__ayuda--mal', 'campo__ayuda--bien');
    } else if (t) {
      eco.textContent = `Va a quedar como ${telLindo(t)}`;
      eco.classList.add('campo__ayuda--bien');
      eco.classList.remove('campo__ayuda--mal');
    } else {
      eco.textContent = 'No lo entiendo. Faltan o sobran dígitos?';
      eco.classList.add('campo__ayuda--mal');
      eco.classList.remove('campo__ayuda--bien');
    }
  });

  $('[data-crear]').addEventListener('click', async () => {
    const nombre = $('#np-nombre').value.trim();
    const tel = normalizarTel($('#np-tel').value);
    if (!nombre) return toast('Ponele un nombre.');
    if (!tel) return toast('Ese teléfono no se entiende. Revisalo.');

    const boton = $('[data-crear]');
    boton.disabled = true;
    try {
      // El id es el teléfono: si ya existe, NO se pisa la ficha.
      const ref = doc(db, 'postulantes', tel);
      const previo = await getDoc(ref);
      if (previo.exists()) {
        const d = previo.data();
        toast(`${d.nombre || 'Ese número'} ya está cargado.`);
        boton.disabled = false;
        return;
      }
      await setDoc(ref, {
        nombre,
        telefono: tel,
        localidad: $('#np-localidad').value.trim(),
        email: $('#np-email').value.trim(),
        perfil: $('#np-perfil').value.trim(),
        estado: 'nuevo',
        origen: 'carga manual',
        creadoEl: serverTimestamp(),
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      m.cerrar();
      toast(`${nombre} agregado. Ya lo podés mandar a contactar.`);
      if (alGuardar) alGuardar();
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar.');
      boton.disabled = false;
    }
  });

  setTimeout(() => $('#np-nombre').focus(), 60);
}

export function montarPostulantes(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Postu<em>lantes</em></h1>
        <p class="vista__sub mono" id="pos-resumen"></p>
      </div>
      <button type="button" class="boton boton--lleno" id="pos-nuevo">+ Postulante</button>
    </div>
    <div class="kpis" id="pos-kpis"></div>
    <div class="filtros" id="pos-filtros"></div>
    <div class="filas" id="pos-lista"></div>`;

  let filtro = 'todos';

  raiz.querySelector('#pos-nuevo').addEventListener('click', () => altaManual(pintar));

  function pintar() {
    const lista = raiz.querySelector('#pos-lista');
    if (!lista) return;

    const todos = cache.postulantes || [];
    const cuenta = (e) => todos.filter((p) => (p.estado || 'nuevo') === e).length;
    const calientes = todos.filter((p) => CALIENTES.includes(p.estado)).length;

    raiz.querySelector('#pos-resumen').textContent =
      `${todos.length} postulantes` + (calientes ? ` · ${calientes} esperando respuesta tuya` : '');

    // El embudo de un vistazo: TODOS los estados, cada uno con su box.
    raiz.querySelector('#pos-kpis').innerHTML = ESTADOS_POSTULANTE
      .map((e) => `
        <div class="kpi ${e.tono === 'apagado' ? 'kpi--apagado' : ''}">
          <p class="kpi__nombre">${e.num ? `<span class="kpi__num">${e.num}</span> ` : ''}${esc(e.nombre)}${e.enEquipo ? ' <span class="kpi__hint">→ Equipo</span>' : ''}</p>
          <p class="kpi__valor">${cuenta(e.id)}</p>
        </div>`).join('');

    // Botones del pipeline: TODOS (distinto) + estados numerados. Activo no
    // está: los activos viven en la solapa Equipo.
    const filtros = [
      { id: 'todos', nombre: 'Todos', clase: 'filtro--todos' },
      ...ESTADOS_PIPELINE.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        num: e.num,
        clase: e.tono === 'apagado' ? 'filtro--descartado' : '',
      })),
    ];
    raiz.querySelector('#pos-filtros').innerHTML = filtros.map((f) =>
      `<button type="button" class="filtro ${f.clase || ''} ${f.id === filtro ? 'activo' : ''}" data-f="${esc(f.id)}">${
        f.num ? `<span class="filtro__num">${f.num}</span> ` : ''}${esc(f.nombre)}</button>`
    ).join('');
    raiz.querySelectorAll('#pos-filtros .filtro').forEach((b) =>
      b.addEventListener('click', () => { filtro = b.dataset.f; pintar(); })
    );

    const visibles = todos
      .filter((p) => {
        const e = p.estado || 'nuevo';
        if (e === 'activo') return false;   // los activos están en Equipo
        if (filtro === 'todos') return true;
        return e === filtro;
      })
      .sort((a, b) => {
        // Primero los que esperan respuesta, después por actividad reciente.
        const ca = CALIENTES.includes(a.estado) ? 0 : 1;
        const cb = CALIENTES.includes(b.estado) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        const fa = aFecha(a.ultimaActividad) || aFecha(a.creadoEl);
        const fb = aFecha(b.ultimaActividad) || aFecha(b.creadoEl);
        return (fb?.getTime() || 0) - (fa?.getTime() || 0);
      });

    lista.innerHTML = visibles.map((p) => {
      const estado = p.estado || 'nuevo';
      const apagado = ['descartado', 'no_responde'].includes(estado);
      // Quién tocó la ficha por última vez: Juno, Juan o Mati.
      const autor = nombreAutor(p.actualizadoPor);
      const detalle = [
        p.localidad,
        p.ultimaActividad ? haceDias(p.ultimaActividad) : null,
        p.puntaje ? `${p.puntaje} pts` : null,
        autor ? `por ${autor}` : null,
      ].filter(Boolean).join(' · ');
      const wa = String(p.telefono || '').replace(/\D/g, '');
      const sigue = PROXIMO[estado];
      // Desde "Llamar" el paso siguiente es el equipo (pide N° de activador).
      const alEquipo = ['agendado', 'manuales'].includes(estado);
      const esperaMaterial = p.mandarManuales && !p.materialEnviado;
      return `
        <article class="fila fila--pos ${apagado ? 'fila--apagada' : ''}" data-id="${esc(p.id)}">
          <div class="pos__cab">
            <p class="fila__nombre">${esc(p.nombre || 'Sin nombre')}</p>
            <span class="estado-envoltura">
              <select class="estado-rapido" data-e="${esc(estado)}" aria-label="Estado de ${esc(p.nombre || '')}">
                ${selectHtml(ESTADOS_PIPELINE, estado)}
              </select>
            </span>
          </div>

          <p class="fila__detalle">${esc(detalle || '—')}</p>
          ${p.llamadaCuando ? `<p class="pos__llamada">📞 Llamada: ${esc(p.llamadaCuando)}</p>` : ''}
          ${p.materialEnviado ? `<p class="pos__material">✓ Manuales enviados · ${esc(fmtFechaCorta(p.materialEnviado))}</p>`
            : (esperaMaterial ? '<p class="pos__material pos__material--espera">⏳ Juno le manda los manuales en unos minutos</p>' : '')}
          ${p.perfil ? `<p class="pos__perfil">${esc(p.perfil)}</p>` : ''}
          ${p.junoResumen ? `<p class="pos__juno">${esc(p.junoResumen)}</p>` : ''}
          ${ultimaNota(p)}
          <p class="pos__contacto">${esc(telLindo(p.telefono))}${p.email ? ' · ' + esc(p.email) : ''}</p>

          <div class="pos__acciones">
            ${botonJuno(p)}
            ${wa ? `<a class="boton boton--chico" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" data-no-abrir>WhatsApp</a>` : ''}
            ${sigue ? `<button type="button" class="boton boton--chico boton--lleno" data-avanzar>→ ${esc(nombreEstado(sigue))}</button>` : ''}
            ${alEquipo ? '<button type="button" class="boton boton--chico boton--lleno" data-equipo>→ Equipo</button>' : ''}
            ${!p.materialEnviado && !p.mandarManuales && ['interesado', 'agendado', 'manuales'].includes(estado)
              ? '<button type="button" class="boton boton--chico" data-manuales>Mandar manuales</button>' : ''}
            <button type="button" class="boton boton--chico" data-nota>+ Nota</button>
            ${estado !== 'descartado' ? '<button type="button" class="boton boton--chico" data-descartar>Descartar</button>' : ''}
            <button type="button" class="boton boton--chico" data-ficha>Ficha</button>
          </div>
        </article>`;
    }).join('') ||
      (cache.listo.postulantes
        ? '<p class="vacio">// Nada por acá todavía.</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila').forEach((el) => {
      const p = (cache.postulantes || []).find((x) => x.id === el.dataset.id);
      if (!p) return;
      const sel = el.querySelector('.estado-rapido');
      sel.addEventListener('change', (ev) => cambiarEstado(p, ev.target));

      el.querySelector('[data-ficha]').addEventListener('click', () => detallePostulante(p));
      el.querySelector('[data-juno]')?.addEventListener('click', (ev) => pedirContacto(p, ev.target));
      el.querySelector('[data-avanzar]')?.addEventListener('click', () =>
        moverA(p, PROXIMO[p.estado || 'nuevo'], sel));
      el.querySelector('[data-equipo]')?.addEventListener('click', () => pasarAlEquipo(p));
      el.querySelector('[data-manuales]')?.addEventListener('click', (ev) => mandarManuales(p, ev.target));
      el.querySelector('[data-nota]')?.addEventListener('click', () => notaRapida(p));
      el.querySelector('[data-descartar]')?.addEventListener('click', () =>
        moverA(p, 'descartado', sel));
    });
  }

  // ---- Pase al equipo: el número de activador se lo da Trackeando al hacer
  // el alta en su CRM; queda en la ficha y el promotor pasa a la solapa Equipo.
  function pasarAlEquipo(p) {
    const m = modal(`Al equipo: ${p.nombre || ''}`, `
      <div class="modal__cuerpo">
        <p class="ficha">Pasa a la solapa Equipo como promotor activo. El número de
        activador es el que te da el CRM de Trackeando al hacerle el alta.</p>
        <div class="campo">
          <label class="campo__nombre" for="eq-numero">N° de activador (Trackeando)</label>
          <input id="eq-numero" type="text" placeholder="Ej: 1043" autocomplete="off">
        </div>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-pasar>Pasar al equipo</button>
        </div>
      </div>`);
    m.el.querySelector('[data-pasar]').addEventListener('click', async () => {
      const numero = m.el.querySelector('#eq-numero').value.trim();
      try {
        await updateDoc(doc(db, 'postulantes', p.id), {
          estado: 'activo',
          numeroActivador: numero,
          activoDesde: serverTimestamp(),
          ultimaActividad: serverTimestamp(),
          historial: arrayUnion({
            fecha: new Date().toISOString(),
            texto: `Pasó al equipo${numero ? ` con el N° de activador ${numero}` : ' (falta el N° de activador)'}.`,
            quien: nombrePersona(auth.currentUser.uid),
          }),
          ...stamp(),
        });
        m.cerrar();
        toast(`${(p.nombre || '').split(' ')[0]} ya está en el Equipo 🎉`);
      } catch (err) { console.error(err); toast('No se pudo pasar', true); }
    });
    setTimeout(() => m.el.querySelector('#eq-numero').focus(), 60);
  }

  // ---- Nota rápida, sin abrir la ficha ----
  function notaRapida(p) {
    const m = modal(`Nota: ${p.nombre || ''}`, `
      <div class="modal__cuerpo">
        <div class="campo">
          <textarea id="nota-texto" rows="3" placeholder="Qué pasó…" autofocus></textarea>
        </div>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-guardar>Guardar nota</button>
        </div>
      </div>`);
    m.el.querySelector('[data-guardar]').addEventListener('click', async () => {
      const texto = m.el.querySelector('#nota-texto').value.trim();
      if (!texto) return toast('La nota está vacía.');
      try {
        await updateDoc(doc(db, 'postulantes', p.id), {
          historial: arrayUnion({
            fecha: new Date().toISOString(),
            texto,
            quien: nombrePersona(auth.currentUser.uid),
          }),
          ultimaActividad: serverTimestamp(),
          ...stamp(),
        });
        m.cerrar();
        toast('Nota guardada');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
    setTimeout(() => m.el.querySelector('#nota-texto').focus(), 60);
  }

  // ---- Mandarle los manuales: Juno los envía en su próxima pasada ----
  async function mandarManuales(p, boton) {
    boton.disabled = true;
    boton.textContent = 'Encolando…';
    try {
      await updateDoc(doc(db, 'postulantes', p.id), {
        mandarManuales: true,
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      toast(`Juno le manda los manuales a ${(p.nombre || '').split(' ')[0]} en unos minutos`);
    } catch (err) {
      console.error(err);
      boton.disabled = false;
      boton.textContent = 'Mandar manuales';
      toast('No se pudo encolar', true);
    }
  }

  // Cambio de estado en la lista misma: es lo que la vuelve un pipeline
  // sin necesidad de arrastrar tarjetas.
  function cambiarEstado(p, select) {
    return moverA(p, select.value, select);
  }

  async function moverA(p, nuevo, select) {
    const previo = p.estado || 'nuevo';
    if (!nuevo || nuevo === previo) return;
    if (select) select.dataset.guardando = '1';
    try {
      await updateDoc(doc(db, 'postulantes', p.id), {
        estado: nuevo,
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      if (select) { select.value = nuevo; select.dataset.e = nuevo; }
      toast(`${(p.nombre || 'Postulante').split(' ')[0]} → ${nombreEstado(nuevo)}`);
    } catch (err) {
      console.error(err);
      if (select) select.value = previo;   // que la pantalla no mienta
      toast('No se pudo cambiar el estado', true);
    } finally {
      if (select) delete select.dataset.guardando;
    }
  }

  // La última nota que escribió alguien del equipo, ahí en la fila: si hay que
  // abrir la ficha para leerla, en la práctica no se lee.
  function ultimaNota(p) {
    const notas = Array.isArray(p.historial) ? p.historial : [];
    if (!notas.length) return '';
    const n = notas[notas.length - 1];
    const previas = notas.length > 1 ? ` · +${notas.length - 1} nota${notas.length > 2 ? 's' : ''} más` : '';
    const firma = [n.quien, n.fecha ? fmtFechaCorta(n.fecha) : ''].filter(Boolean).join(', ');
    return `<p class="pos__nota">${esc(n.texto)}
      <span class="pos__nota-meta">— ${esc(firma)}${esc(previas)}</span></p>`;
  }

  // ---- Pedirle a Juno que lo contacte ----
  // El pedido entra a una COLA: Juno lo levanta en su próximo turno, respetando
  // el cupo diario y el horario. No dispara el mensaje al instante a propósito,
  // para que nadie pueda mandar 40 de golpe y quemar el número.
  function botonJuno(p) {
    if (p.contactadoEl) return '';                    // Juno ya le escribió
    if (p.contactoPedido) {
      const quien = p.contactoPedidoPor ? ` (pidió ${p.contactoPedidoPor})` : '';
      return `<span class="pos__encola">⏳ En cola${esc(quien)}</span>`;
    }
    return '<button type="button" class="boton boton--chico" data-juno>Contactar</button>';
  }

  async function pedirContacto(p, boton) {
    boton.disabled = true;
    boton.textContent = 'Encolando…';
    try {
      await updateDoc(doc(db, 'postulantes', p.id), {
        contactoPedido: serverTimestamp(),
        contactoPedidoPor: nombrePersona(auth.currentUser.uid),
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      toast(`${(p.nombre || '').split(' ')[0]} va a la cola de Juno`);
    } catch (err) {
      console.error(err);
      boton.disabled = false;
      boton.textContent = 'Contactar';
      toast('No se pudo encolar', true);
    }
  }

  function nombreEstado(id) {
    const e = ESTADOS_POSTULANTE.find((x) => x.id === id);
    return e ? e.nombre : id;
  }

  // ============ DETALLE ============
  function detallePostulante(p) {
    const wa = String(p.telefono || '').replace(/\D/g, '');
    const historial = Array.isArray(p.historial) ? [...p.historial].reverse() : [];

    const m = modal(p.nombre || 'Postulante', `
      <div class="modal__cuerpo">
        <div class="datos">
          <div><p class="dato__nombre">Teléfono</p><p class="dato__valor">${
            wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${esc(p.telefono)}</a>` : '—'
          }</p></div>
          <div><p class="dato__nombre">Localidad</p><p class="dato__valor">${esc(p.localidad || '—')}</p></div>
          <div><p class="dato__nombre">Email</p><p class="dato__valor">${esc(p.email || '—')}</p></div>
          <div><p class="dato__nombre">Origen</p><p class="dato__valor">${esc(p.origen || '—')}</p></div>
          <div><p class="dato__nombre">Primer contacto</p><p class="dato__valor">${
            p.contactadoEl ? fmtFechaCorta(p.contactadoEl) : '—'}</p></div>
          <div><p class="dato__nombre">Última actividad</p><p class="dato__valor">${
            p.ultimaActividad ? fmtFechaCorta(p.ultimaActividad) : '—'}</p></div>
        </div>

        ${p.perfil ? `<p class="ficha">${esc(p.perfil)}</p>` : ''}
        ${p.junoResumen ? `<p class="ficha"><b>Juno:</b> ${esc(p.junoResumen)}</p>` : ''}
        ${p.motivo ? `<p class="ficha"><b>Motivo:</b> ${esc(p.motivo)}</p>` : ''}

        ${p.materialEnviado ? `<p class="ficha">✓ Manuales enviados el ${fmtFechaCorta(p.materialEnviado)}.</p>` : ''}

        <div class="campo">
          <label class="campo__nombre" for="pos-estado">Estado</label>
          <select id="pos-estado">${selectHtml(ESTADOS_PIPELINE, p.estado || 'nuevo')}</select>
        </div>

        <div class="campo">
          <label class="campo__nombre" for="pos-nota">Agregar una nota</label>
          <textarea id="pos-nota" rows="2" placeholder="Qué pasó en la llamada…"></textarea>
        </div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--peligro boton--chico" data-borrar>Borrar</button>
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-guardar>Guardar</button>
        </div>

        ${historial.length ? `
          <h3 class="campo__nombre" style="margin-top:1.2rem">Historial</h3>
          ${historial.map((h) => `
            <div class="interaccion">
              <p class="interaccion__meta">${esc(fmtFechaCorta(h.fecha))} · ${esc(h.quien || 'Juno')}</p>
              <p class="interaccion__texto">${esc(h.texto)}</p>
            </div>`).join('')}` : ''}
      </div>`);

    m.el.querySelector('[data-guardar]').addEventListener('click', async () => {
      const estado = m.el.querySelector('#pos-estado').value;
      const nota = m.el.querySelector('#pos-nota').value.trim();
      try {
        const cambios = { estado, ultimaActividad: serverTimestamp(), ...stamp() };
        if (nota) {
          cambios.historial = arrayUnion({
            fecha: new Date().toISOString(),
            texto: nota,
            quien: nombrePersona(auth.currentUser.uid),
          });
        }
        await updateDoc(doc(db, 'postulantes', p.id), cambios);
        m.cerrar();
        toast('Guardado');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });

    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      if (!(await confirmar(`¿Borrar a ${p.nombre}? No se puede deshacer.`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'postulantes', p.id));
        m.cerrar();
        toast('Borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  pintar();
  return alCambiar((col) => { if (col === 'postulantes') pintar(); });
}
