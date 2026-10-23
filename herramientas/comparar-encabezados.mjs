// comparar-encabezados.mjs — comprobación C1: la secuencia de encabezados (H1…H6)
// de cada página compilada coincide con la de la referencia (src/data/estructura-viva.json,
// que ya lleva aplicada la regla del H1).
//
// Se compara con un puntero que avanza por la secuencia de la página nueva: cada
// encabezado de la referencia tiene que aparecer, en el mismo orden y con el mismo
// nivel y texto, después del anterior. No se usa indexOf (evita dar por bueno un
// encabezado que esté antes de donde debería).
//
// Uso: node herramientas/comparar-encabezados.mjs [--dist dist] [--completo]
//   --completo: desde la Fase 2, también falla si falta alguna página de la referencia.
// Salida: informes/encabezados.md; código 1 si hay diferencias.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const DIST = arg('dist', 'dist');
const COMPLETO = process.argv.includes('--completo');
const ESTRUCTURA = 'src/data/estructura-viva.json';
const estructura = fs.existsSync(ESTRUCTURA) ? JSON.parse(fs.readFileSync(ESTRUCTURA, 'utf8')) : {};

function* htmls(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (/\.html?$/i.test(e.name)) yield p;
  }
}
const limpiar = t => t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
// Las ventanas modales (<div class="modal …">) van ocultas y no forman parte de la lectura de la
// página: sus encabezados no cuentan (estructura-viva.py hace lo mismo con la referencia).
// Se usa un lector de HTML de verdad (node-html-parser), no expresiones regulares.
function encabezados(html) {
  const root = parse(html, { comment: false });
  for (const modal of root.querySelectorAll('div.modal')) modal.remove();
  return root.querySelectorAll('h1, h2, h3, h4, h5, h6').map((h) => ({ n: Number(h.tagName[1]), t: limpiar(h.innerHTML) }));
}
// fichero de dist/ → ruta pública (inversa de build.format 'preserve' y de la paginación /pagina/N)
function rutaDe(f) {
  let r = '/' + path.relative(DIST, f).split(path.sep).join('/');
  if (r === '/index.html') return '/';
  if (r.endsWith('/index.html')) return r.slice(0, -'/index.html'.length); // /es/index.html → /es (clave de la referencia)
  r = r.replace(/\/pagina\/(\d+)\.html$/, '?page=$1');
  r = r.replace(/ /g, '%20');
  if (/^\/[a-z]{2}\/(?!content\/|brand\/)[^/]+\/\d+-[^/]+\.html$/.test(r)) return r; // ficha: conserva .html
  return r.replace(/\.html$/, '');
}
// Páginas de la referencia que no existen en la web nueva por decisión (Dec. 8: sin cuentas de cliente).
const TIPOS_SIN_PAGINA = new Set(['authentication', 'password']);
for (const [ruta, e] of Object.entries(estructura)) if (TIPOS_SIN_PAGINA.has(e.tipo)) delete estructura[ruta];

const diferencias = [], sinReferencia = [];
let comparadas = 0;
const vistas = new Set();
for (const f of htmls(DIST)) {
  const ruta = rutaDe(f);
  const ref = estructura[ruta];
  if (!ref) { sinReferencia.push(ruta); continue; }
  vistas.add(ruta);
  comparadas++;
  const nuevos = encabezados(fs.readFileSync(f, 'utf8'));
  let p = 0;
  for (const e of ref.encabezados) {
    while (p < nuevos.length && !(nuevos[p].n === e.n && nuevos[p].t === e.t)) p++;
    if (p >= nuevos.length) { diferencias.push({ ruta, falta: `h${e.n} «${e.t}»` }); break; }
    p++;
  }
}
const faltan = Object.keys(estructura).filter(r => !vistas.has(r));
const lineas = [
  '# Encabezados (C1)', '',
  `${comparadas} páginas comparadas con la referencia; ${diferencias.length} con diferencias; ${sinReferencia.length} sin página de referencia; ${faltan.length} páginas de la referencia aún sin generar${COMPLETO ? ' (cuentan como fallo)' : ' (informativo hasta la Fase 2)'}.`, '',
  ...(diferencias.length ? ['## Diferencias', ...diferencias.map(d => `- \`${d.ruta}\`: no encuentro ${d.falta} en su sitio`)] : []),
  ...(sinReferencia.length ? ['', '## Sin referencia (páginas nuevas)', ...sinReferencia.slice(0, 50).map(r => `- \`${r}\``)] : []),
  ...(COMPLETO && faltan.length ? ['', '## Páginas de la referencia sin generar', ...faltan.slice(0, 100).map(r => `- \`${r}\``)] : []),
];
fs.mkdirSync('informes', { recursive: true });
fs.writeFileSync('informes/encabezados.md', lineas.join('\n') + '\n');
console.log(lineas.slice(0, 3).join('\n'));
if (diferencias.length || (COMPLETO && faltan.length)) { console.log('SE HA PARADO EN: encabezados (ver informes/encabezados.md)'); process.exitCode = 1; }
