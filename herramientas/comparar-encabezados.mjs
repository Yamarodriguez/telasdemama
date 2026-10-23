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
function encabezados(html) {
  const out = [];
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) out.push({ n: Number(m[1]), t: limpiar(m[2]) });
  return out;
}
// fichero de dist/ → ruta pública (inversa de build.format 'file' y de la paginación __page-N)
function rutaDe(f) {
  let r = '/' + path.relative(DIST, f).split(path.sep).join('/');
  if (r.endsWith('/index.html')) return r.slice(0, -'index.html'.length);
  r = r.replace(/__page-(\d+)\.html$/, '?page=$1');
  if (/\/\d+-[^/]+\.html$/.test(r) && /^\/[a-z]{2}\/[^/]+\/\d+-/.test(r)) return r; // ficha: conserva .html
  return r.replace(/\.html$/, '');
}

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
