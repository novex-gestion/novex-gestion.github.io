// Punto de entrada de NOVEX Promotores: gate de autenticación + router por hash.
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth, configLista } from './firebase.js';
import { EQUIPO, nombrePersona } from './config.js';
import { conectarDatos, desconectarDatos } from './datos.js';
import { toast } from '../../gestion/js/ui.js';
import { montarPostulantes } from './vistas/postulantes.js';
import { montarEquipo } from './vistas/equipo.js';

const pantallaLogin = document.getElementById('pantalla-login');
const pantallaApp = document.getElementById('pantalla-app');
const formLogin = document.getElementById('form-login');
const loginError = document.getElementById('login-error');
const vista = document.getElementById('vista');

if (!configLista) {
  pantallaLogin.hidden = false;
  document.getElementById('login-pendiente').hidden = false;
  formLogin.querySelectorAll('input, button').forEach((el) => (el.disabled = true));
} else {
  iniciar();
}

function iniciar() {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const boton = document.getElementById('login-entrar');
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      await signInWithEmailAndPassword(
        auth,
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-clave').value
      );
    } catch (err) {
      loginError.textContent = mensajeError(err);
      loginError.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });

  document.getElementById('login-olvide').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      loginError.textContent = 'Escribí tu email arriba y volvé a tocar acá.';
      loginError.hidden = false;
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      loginError.textContent = 'Listo: revisá tu casilla, te llegó un mail para cambiarla.';
      loginError.hidden = false;
    } catch (err) {
      loginError.textContent = mensajeError(err);
      loginError.hidden = false;
    }
  });

  document.getElementById('btn-salir').addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, (usuario) => {
    if (usuario && EQUIPO[usuario.uid]) {
      pantallaLogin.hidden = true;
      pantallaApp.hidden = false;
      document.getElementById('usuario-nombre').textContent = nombrePersona(usuario.uid);
      conectarDatos();
      navegar();
    } else {
      if (usuario) {
        // Cuenta válida en Firebase pero sin permiso en ESTA app.
        signOut(auth);
        loginError.textContent = 'Esa cuenta no tiene acceso a Promotores.';
        loginError.hidden = false;
      }
      desconectarDatos();
      pantallaApp.hidden = true;
      pantallaLogin.hidden = false;
    }
  });

  window.addEventListener('hashchange', () => {
    if (!pantallaApp.hidden) navegar();
  });
}

function mensajeError(err) {
  const c = err && err.code ? err.code : '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) {
    return 'Email o contraseña incorrectos.';
  }
  if (c.includes('too-many-requests')) return 'Demasiados intentos. Esperá unos minutos.';
  if (c.includes('invalid-email')) return 'Ese email no es válido.';
  if (c.includes('network-request-failed')) return 'Sin conexión. Probá de nuevo.';
  return 'No se pudo: ' + (c || err);
}

// ============ ROUTER ============
let limpiarVista = null;

const RUTAS = {
  postulantes: montarPostulantes,
  equipo: montarEquipo,
};

function navegar() {
  const hash = location.hash.replace(/^#\/?/, '') || 'postulantes';
  const [ruta] = hash.split('/');

  if (limpiarVista) { limpiarVista(); limpiarVista = null; }
  vista.innerHTML = '';
  window.scrollTo(0, 0);

  document.querySelectorAll('.nav__item').forEach((a) => {
    a.classList.toggle('activo', a.dataset.ruta === ruta);
  });

  try {
    if (RUTAS[ruta]) {
      limpiarVista = RUTAS[ruta](vista);
    } else {
      location.hash = '#/postulantes';
    }
  } catch (err) {
    console.error(err);
    toast('Algo falló al abrir la vista', true);
  }
}
