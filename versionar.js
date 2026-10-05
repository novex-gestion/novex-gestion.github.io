// Sube la versión de los archivos del front para que el navegador deje de
// servir copias viejas.
//
//   node versionar.js gestion      → sube una versión
//   node versionar.js promotores
//
// El problema que resuelve: index.html carga `app.js?v=9`, pero app.js importa
// `./vistas/gastos.js` SIN versión, y esos módulos se importan entre sí también
// sin versión. Entonces se publica un cambio, el archivo está bien en el server,
// y el navegador sigue mostrando el de antes — sin forma de darse cuenta salvo
// mirando el código fuente en el inspector.
//
// Acá se le pone la misma versión a TODA la cadena: el <script> del index, la
// hoja de estilos y cada import relativo de cada módulo.

const fs = require('fs');
const path = require('path');

const app = process.argv[2];
if (!app) {
  console.error('Falta la app. Ej: node versionar.js gestion');
  process.exit(1);
}

const raiz = path.join(__dirname, app);
if (!fs.existsSync(raiz)) {
  console.error(`No existe la carpeta ${app}/`);
  process.exit(1);
}

// La versión sale del index.html: se lee la que hay y se le suma uno.
const indexPath = path.join(raiz, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
const actual = Math.max(
  0,
  ...[...index.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]))
);
const nueva = actual + 1;

// 1. El index: script principal y hoja de estilos.
index = index.replace(/(\.(?:js|css))(\?v=\d+)?(["'])/g, `$1?v=${nueva}$3`);
fs.writeFileSync(indexPath, index);

// 2. Cada import relativo de cada módulo. Los de https:// (Firebase) quedan
//    como están: los versiona el CDN.
function archivosJs(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosJs(p));
    else if (e.name.endsWith('.js')) salida.push(p);
  }
  return salida;
}

const jsDir = path.join(raiz, 'js');
let tocados = 0;
let imports = 0;

for (const archivo of fs.existsSync(jsDir) ? archivosJs(jsDir) : []) {
  const antes = fs.readFileSync(archivo, 'utf8');
  // from './x.js'  ·  from '../x.js'  ·  import('./x.js')
  const despues = antes.replace(
    /(from\s+['"]|import\(\s*['"])(\.{1,2}\/[^'"]+?\.js)(\?v=\d+)?(['"])/g,
    (_, pre, ruta, __, fin) => `${pre}${ruta}?v=${nueva}${fin}`
  );
  if (despues !== antes) {
    fs.writeFileSync(archivo, despues);
    tocados++;
    imports += [...despues.matchAll(new RegExp(`\\?v=${nueva}`, 'g'))].length;
  }
}

console.log(`${app}: v${actual} -> v${nueva}`);
console.log(`  index.html actualizado`);
console.log(`  ${tocados} módulos, ${imports} imports versionados`);
