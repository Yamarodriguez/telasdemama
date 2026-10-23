// validar.mjs — comprobación C6 sobre la web compilada (dist/).
//
// Por cada HTML de dist/:
//   - se puede leer y tiene <title> no vacío;
//   - exactamente un <h1> (tras la regla del H1);
//   - ninguna variable de Smarty sin resolver ({$ … } o {l s=…});
//   - ningún enlace interno perdido: cada href que empieza por / tiene fichero en dist/ o public/
//     (reglas de URL: sin barra final, fichas .html, categorías sin extensión → fichero .html);
//   - ninguna imagen, hoja o script sin fichero;
//   - canonical, si lo hay, absoluto y sin barra final, igual que el original;
//   - hreflang, si lo hay, igual que el de la referencia para esa ruta (desde la Fase 2).
//   - (desde la Fase 2) JSON-LD de Product coherente con el precio visible.
// Excepciones: src/data/fallos-original.json (lo que ya fallaba en la tienda vieja).
//
// Uso: node herramientas/validar.mjs [--dist dist] [--public public]
// Salida: informes/validar.md; código 1 si hay fallos.

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const DIST = arg('dist', 'dist');
const PUBLIC = arg('public', 'public');
const SITIO = 'https://telasdemama.com';
const FALLOS_ORIGINAL = 'src/data/fallos-original.json';
const listaBlanca = fs.existsSync(FALLOS_ORIGINAL) ? JSON.parse(fs.readFileSync(FALLOS_ORIGINAL, 'utf8')).recursos ?? {} : {};

function* htmls(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (/\.html?$/i.test(e.name)) yield p;
  }
}

// ¿Existe en dist/ o public/ el fichero que serviría esta ruta pública?
export function existeRuta(ruta) {
  let p;
  try { p = decodeURIComponent(ruta.split('?')[0].split('#')[0]); } catch { p = ruta; }
  if (p === '/') return fs.existsSync(path.join(DIST, 'index.html'));
  const candidatos = [p, p + '.html', p.endsWith('/') ? p + 'index.html' : null].filter(Boolean);
  return candidatos.some(c => [DIST, PUBLIC].some(d => { const f = path.join(d, c); return fs.existsSync(f) && fs.statSync(f).isFile(); }));
}

const fallos = [];
let n = 0;
for (const f of htmls(DIST)) {
  n++;
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/');
  const html = fs.readFileSync(f, 'utf8');
  const falla = msg => fallos.push({ pagina: rel, fallo: msg });

  if (!html.match(/<title>\s*[^<]+<\/title>/i)) falla('sin <title>');
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  if (h1 !== 1) falla(`${h1} H1 (tiene que haber exactamente uno)`);
  if (/\{\$[a-zA-Z_]|\{l s=/.test(html)) falla('variable de Smarty sin resolver ({$… o {l s=…)');

  const can = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
  if (can) {
    if (!can.startsWith(SITIO + '/')) falla(`canonical no absoluto al dominio: ${can}`);
    if (can.endsWith('/') && can !== SITIO + '/') falla(`canonical con barra final: ${can}`);
  }

  const internos = new Set();
  for (const m of html.matchAll(/<(a|link|script|img|source)\b([^>]*)>/gi)) {
    const attrs = m[2];
    // hreflang a idiomas que todavía no están compilados: no es un enlace roto, es la Fase 1 a medias
    if (m[1].toLowerCase() === 'link' && /rel="alternate"/i.test(attrs)) {
      const idioma = attrs.match(/href="https?:\/\/[^/]+\/([a-z]{2})\//i)?.[1];
      if (idioma && !fs.existsSync(path.join(DIST, idioma))) continue;
    }
    const get = a => attrs.match(new RegExp(`(?<![\\w-])${a}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
    for (const a of ['href', 'src', 'data-src', 'data-full-size-image-url', 'data-image-large-src']) {
      let v = get(a); if (!v) continue;
      v = v.replace(/&amp;/g, '&');
      if (v.startsWith(SITIO + '/')) v = v.slice(SITIO.length);
      if (!v.startsWith('/') || v.startsWith('//')) continue;
      internos.add(v);
    }
  }
  for (const r of internos) {
    const limpio = r.split('?')[0].split('#')[0];
    if (listaBlanca[limpio] || listaBlanca[r]) continue;
    const params = new URLSearchParams(r.split('?')[1] ?? '');
    if ([...params.keys()].some(k => k !== 'page')) continue; // filtros/buscador: se decide en la Fase 2
    if (!existeRuta(limpio)) falla(`enlace o recurso sin fichero: ${r}`);
  }
}

const lineas = [
  '# Validador (C6)', '',
  `${n} páginas en ${DIST}/; ${fallos.length} fallos.`, '',
  ...(fallos.length ? ['| página | fallo |', '|---|---|', ...fallos.slice(0, 500).map(x => `| \`${x.pagina}\` | ${x.fallo} |`)] : ['Sin fallos.']),
];
fs.mkdirSync('informes', { recursive: true });
fs.writeFileSync('informes/validar.md', lineas.join('\n') + '\n');
console.log(lineas.slice(0, 3).join('\n'));
if (!n) { console.log('SE HA PARADO EN: validar (no hay ningún HTML en dist/)'); process.exitCode = 1; }
else if (fallos.length) { console.log(`SE HA PARADO EN: validar (${fallos.length} fallos; ver informes/validar.md)`); process.exitCode = 1; }
