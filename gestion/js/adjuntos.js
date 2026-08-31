// ============================================================
// NOVEX — ADJUNTOS
// Sirve igual para tareas, ideas del blog o lo que venga: se le pasa la
// colección y el id del documento, y se encarga del resto.
//
// DÓNDE VIVEN
// En una subcolección `adjuntos` colgando del documento (`tareas/{id}/adjuntos`).
// No en el documento mismo: las vistas escuchan las colecciones enteras en vivo,
// y meter archivos ahí haría que cada cambio en una tarea se traiga todos los
// adjuntos de todas. Colgados aparte, se cargan sólo al abrir la ficha.
//
// EL LÍMITE, dicho de frente
// Firebase Storage no está habilitado en el proyecto (quedó fuera del plan
// gratuito), así que el archivo se guarda dentro de la base. Un documento de
// Firestore no puede pasar 1 MB, y codificarlo lo agranda un tercio: el techo
// real es ~700 KB por archivo.
//   - Las imágenes se achican y comprimen antes de subir, así que casi siempre
//     entran (una foto de celular de 4 MB queda en ~200 KB).
//   - Un PDF no se puede comprimir: si no entra, se avisa y se ofrece el link.
// Por eso además de archivos se pueden guardar LINKS (Drive, Dropbox): sin
// límite de tamaño y sirve para videos o documentos pesados.
// ============================================================
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, updateDoc, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from './firebase.js';
import { esc, modal, confirmar, toast } from './ui.js';

const TOPE_BASE64 = 700 * 1024;        // lo que entra en un documento de Firestore
const LADO_MAXIMO = 1600;              // px del lado más largo de una imagen
const CALIDADES = [0.72, 0.6, 0.45, 0.3];

export function pesoLegible(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}

const esImagen = (tipo) => String(tipo || '').startsWith('image/');

// Un link sólo puede ser http(s). Sin esto, un "javascript:..." pegado en el campo
// se ejecutaría al abrirlo; y una miniatura sólo se pinta si de verdad es una imagen.
const linkSeguro = (u) => /^https?:\/\//i.test(String(u || ''));
const imagenSegura = (d) => /^data:image\//i.test(String(d || ''));

const icono = (a) => {
  if (a.clase === 'link') return '🔗';
  const t = String(a.tipo || '');
  if (esImagen(t)) return '🖼';
  if (t.includes('pdf')) return '📕';
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return '📊';
  if (t.includes('word') || t.includes('document')) return '📄';
  if (t.includes('zip') || t.includes('rar')) return '🗜';
  return '📎';
};

/** Achica y comprime una imagen hasta que entre. Devuelve un data URL. */
function comprimirImagen(file) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('Ese archivo no parece una imagen válida.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > LADO_MAXIMO || height > LADO_MAXIMO) {
          const escala = LADO_MAXIMO / Math.max(width, height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const lienzo = document.createElement('canvas');
        lienzo.width = width;
        lienzo.height = height;
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff';                  // los PNG con transparencia van a JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        for (const calidad of CALIDADES) {
          const salida = lienzo.toDataURL('image/jpeg', calidad);
          if (salida.length <= TOPE_BASE64) return resolver({ datos: salida, tipo: 'image/jpeg' });
        }
        rechazar(new Error('La imagen es demasiado grande incluso comprimida. Probá con una captura o pegá el link.'));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

function leerTalCual(file) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      if (lector.result.length > TOPE_BASE64) {
        return rechazar(new Error(
          `"${file.name}" pesa ${pesoLegible(file.size)} y el máximo es ${pesoLegible(TOPE_BASE64 * 0.75)}. ` +
          'Subilo a Drive y pegá el link con "+ Link".'
        ));
      }
      resolver({ datos: lector.result, tipo: file.type || 'application/octet-stream' });
    };
    lector.readAsDataURL(file);
  });
}

async function prepararArchivo(file) {
  const { datos, tipo } = esImagen(file.type) ? await comprimirImagen(file) : await leerTalCual(file);
  return {
    clase: 'archivo',
    nombre: file.name,
    tipo,
    peso: file.size,
    pesoGuardado: datos.length,
    datos,
  };
}

/**
 * Monta el bloque de adjuntos dentro de `contenedor`.
 * Si `docId` es null (alta), los va juntando en memoria y se escriben con
 * `guardarPendientes(idNuevo)` una vez creado el documento.
 */
export function montarAdjuntos(contenedor, coleccion, docId) {
  let lista = [];
  const pendientes = [];
  let parar = null;

  contenedor.innerHTML = `
    <div class="adjuntos">
      <div class="adjuntos__cab">
        <span class="campo__nombre mono">Adjuntos</span>
        <div class="adjuntos__acciones">
          <button type="button" class="boton boton--chico" data-subir>+ Archivo</button>
          <button type="button" class="boton boton--chico" data-link>+ Link</button>
        </div>
      </div>
      <input type="file" hidden data-input multiple>
      <div class="adjuntos__lista" data-lista></div>
    </div>`;

  const zonaLista = contenedor.querySelector('[data-lista]');
  const input = contenedor.querySelector('[data-input]');

  contenedor.querySelector('[data-subir]').addEventListener('click', () => input.click());
  contenedor.querySelector('[data-link]').addEventListener('click', pedirLink);
  input.addEventListener('change', async () => {
    for (const file of Array.from(input.files || [])) await sumarArchivo(file);
    input.value = '';
  });

  function pintar() {
    const todos = [...lista, ...pendientes];
    if (!todos.length) {
      zonaLista.innerHTML = '<p class="adjuntos__vacio mono">// Sin adjuntos. Sumá una foto, un PDF o pegá un link.</p>';
      return;
    }
    zonaLista.innerHTML = todos.map((a, i) => `
      <div class="adjunto" data-i="${i}">
        ${a.clase === 'archivo' && esImagen(a.tipo) && imagenSegura(a.datos)
          ? `<img class="adjunto__mini" src="${esc(a.datos)}" alt="">`
          : `<span class="adjunto__icono">${icono(a)}</span>`}
        <div class="adjunto__datos">
          <span class="adjunto__nombre">${esc(a.nombre)}</span>
          <span class="adjunto__meta mono">${a.clase === 'link' ? 'link' : pesoLegible(a.pesoGuardado || a.peso)}${
            a.pendiente ? ' · se sube al guardar' : ''}</span>
        </div>
        <button type="button" class="adjunto__quitar" data-quitar="${i}" title="Quitar">×</button>
      </div>`).join('');

    zonaLista.querySelectorAll('.adjunto').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-quitar]')) return;
        abrir(todos[Number(el.dataset.i)]);
      });
    });
    zonaLista.querySelectorAll('[data-quitar]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await quitar(todos[Number(b.dataset.quitar)]);
      });
    });
  }

  function abrir(a) {
    if (a.clase === 'link') {
      if (!linkSeguro(a.url)) { toast('Ese link no es válido', true); return; }
      window.open(a.url, '_blank', 'noopener');
      return;
    }
    if (esImagen(a.tipo) && imagenSegura(a.datos)) {
      modal(a.nombre, `<div class="modal__cuerpo"><img src="${esc(a.datos)}" alt="" style="max-width:100%; display:block">
        <div class="modal__acciones">
          <a class="boton" href="${esc(a.datos)}" download="${esc(a.nombre)}">Descargar</a>
          <button type="button" class="boton boton--lleno" data-cerrar>Cerrar</button>
        </div></div>`);
      return;
    }
    // el resto se baja directo
    const a2 = document.createElement('a');
    a2.href = a.datos;
    a2.download = a.nombre;
    a2.click();
  }

  async function sumarArchivo(file) {
    try {
      const adj = await prepararArchivo(file);
      await guardar(adj);
    } catch (err) {
      toast(err.message || 'No se pudo sumar el archivo', true);
    }
  }

  function pedirLink() {
    const m = modal('Sumar un link', `
      <form id="form-link">
        <p class="modal__nota">// Para lo que no entra como archivo: un video, un PDF pesado, una carpeta de Drive.</p>
        <label class="campo">
          <span class="campo__nombre mono">Link *</span>
          <input type="url" name="url" required placeholder="https://drive.google.com/...">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Nombre</span>
          <input type="text" name="nombre" placeholder="Cómo se llama (opcional)">
        </label>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton--lleno">Sumar</button>
        </div>
      </form>`);
    m.el.querySelector('#form-link').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = e.target.url.value.trim();
      if (!url) return;
      if (!linkSeguro(url)) { toast('El link tiene que empezar con http:// o https://', true); return; }
      let nombre = e.target.nombre.value.trim();
      if (!nombre) { try { nombre = new URL(url).hostname.replace('www.', ''); } catch { nombre = 'Link'; } }
      m.cerrar();
      await guardar({ clase: 'link', nombre, url, tipo: 'link' });
    });
  }

  async function guardar(adj) {
    if (!docId) {                       // alta: todavía no hay dónde colgarlo
      pendientes.push({ ...adj, pendiente: true });
      pintar();
      return;
    }
    try {
      await addDoc(collection(db, coleccion, docId, 'adjuntos'), { ...adj, ...stamp(true) });
      await contar(1);
      toast('Adjunto sumado');
    } catch (err) {
      console.error(err);
      toast('No se pudo guardar el adjunto', true);
    }
  }

  async function quitar(a) {
    if (a.pendiente) {
      const i = pendientes.indexOf(a);
      if (i >= 0) pendientes.splice(i, 1);
      pintar();
      return;
    }
    if (!(await confirmar(`Se borra "${a.nombre}".`, 'Borrar'))) return;
    try {
      await deleteDoc(doc(db, coleccion, docId, 'adjuntos', a.id));
      await contar(-1);
      toast('Adjunto borrado');
    } catch (err) {
      console.error(err);
      toast('No se pudo borrar', true);
    }
  }

  // Contador en el documento padre: permite mostrar el clip en los listados sin
  // tener que leer la subcolección de cada tarea.
  async function contar(delta) {
    try {
      await updateDoc(doc(db, coleccion, docId), { adjuntos: increment(delta) });
    } catch (err) { /* el contador es una comodidad, no puede romper la carga */ }
  }

  function escuchar() {
    if (!docId) { pintar(); return; }
    parar = onSnapshot(
      query(collection(db, coleccion, docId, 'adjuntos'), orderBy('creadoEl', 'asc')),
      (snap) => { lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })); pintar(); },
      (err) => { console.error('adjuntos:', err); pintar(); }
    );
  }
  escuchar();

  return {
    /** Después de crear el documento, vuelca lo que se había juntado. */
    async guardarPendientes(idNuevo) {
      if (!pendientes.length) return 0;
      let n = 0;
      for (const a of pendientes) {
        const { pendiente, ...limpio } = a;
        try {
          await addDoc(collection(db, coleccion, idNuevo, 'adjuntos'), { ...limpio, ...stamp(true) });
          n++;
        } catch (err) { console.error(err); }
      }
      if (n) {
        try { await updateDoc(doc(db, coleccion, idNuevo), { adjuntos: increment(n) }); } catch (err) { /* ignorable */ }
      }
      pendientes.length = 0;
      return n;
    },
    hayPendientes: () => pendientes.length,
    desconectar() { if (parar) parar(); },
  };
}

/** Clip para los listados. Devuelve '' si no hay adjuntos. */
export function selloAdjuntos(n) {
  const c = Number(n) || 0;
  return c > 0 ? `<span class="sello sello--apagado">📎 ${c}</span>` : '';
}
