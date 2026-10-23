// barrido-404.mjs — comprobación C5: ninguna página de la referencia pide algo
// que no exista (fotos, miniaturas por tamaño, hojas, scripts, tipografías, enlaces internos).
//
// Recorre cada HTML de referencia/<idioma>/, saca todo lo que el navegador pediría
// (src, href de hojas e iconos, data-* de imágenes, url() de los CSS) y comprueba
// que exista en disco con la misma ruta pública (referencia/ para páginas, public/
// para lo demás), igual que lo serviría servir-referencia.mjs.
//
// Uso: node herramientas/barrido-404.mjs [--idioma es] [--comprobar-origen]
//   --comprobar-origen: lo que falta se pide al servidor viejo (HEAD, de uno en uno);
//                       lo que allí también da 404 se añade a src/data/fallos-original.json
//                       (lista blanca) y deja de contar como fallo.
// Salida: informes/barrido-404-<idioma>.md. Código de salida 1 si queda algún fallo.

import fs from 'node:fs';
import path from 'node:path';
import { resolver } from './servir-referencia.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const IDIOMA = arg('idioma', 'es');
const REFERENCIA = arg('referencia', 'referencia');
const PUBLIC = arg('public', 'public');
const DOMINIO = arg('dominio', 'telasdemama.com');
const COMPROBAR_ORIGEN = process.argv.includes('--comprobar-origen');
const FALLOS_ORIGINAL = 'src/data/fallos-original.json';
const LOCK = path.join('informes', 'rastreo-en-curso.lock');

const domEsc = DOMINIO.replace(/\./g, '\\.');
const reDom = new RegExp(`^(?:https?:)?//(?:www\\.)?${domEsc}`);
const EXT_RECURSO = /\.(css|js|jpe?g|png|gif|webp|svg|ico|woff2?|ttf|eot|pdf)$/i;

const listaBlanca = fs.existsSync(FALLOS_ORIGINAL) ? JSON.parse(fs.readFileSync(FALLOS_ORIGINAL, 'utf8')) : { descripcion: 'Recursos y enlaces que ya fallaban en la tienda vieja (404 en el servidor original). No cuentan como fallo del barrido.', recursos: {} };

function* htmls(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (/\.html?$/i.test(e.name)) yield p;
  }
}

// ruta pública (sin dominio, con ?page= si lo lleva) a partir de un atributo
function normalizar(u, desdeRuta) {
  u = u.replace(/&amp;/g, '&').trim();
  if (!u || /^(data:|mailto:|tel:|javascript:|#|about:)/i.test(u)) return null;
  if (/^(https?:)?\/\//i.test(u) && !reDom.test(u)) return null; // externo: no se comprueba aquí
  u = u.replace(reDom, '');
  if (!u.startsWith('/')) u = path.posix.normalize(path.posix.join(path.posix.dirname(desdeRuta), u));
  const [sinHash] = u.split('#');
  const [ruta, query = ''] = sinHash.split('?');
  if (EXT_RECURSO.test(ruta)) return ruta;              // recurso: se ignora la query (?1571903726)
  const params = new URLSearchParams(query);
  const page = params.get('page');
  if ([...params.keys()].some(k => k !== 'page')) return null; // filtros, buscador, carrito: no son páginas de la referencia
  return ruta + (page && page !== '1' ? `?page=${page}` : '');
}

// Un idioma cuenta como rastreado del todo si tiene manifiesto y no hay rastreo en marcha.
const idiomaCompleto = i => fs.existsSync(path.join(REFERENCIA, `rastreo-${i}.json`)) && !fs.existsSync(LOCK);

const peticiones = new Map(); // ruta pública -> Set de páginas que la piden
const cssVistos = new Set();
function apuntar(ruta, desde) {
  if (!ruta) return;
  if (!peticiones.has(ruta)) peticiones.set(ruta, new Set());
  peticiones.get(ruta).add(desde);
}
function urlsDeCss(rutaCss) {
  if (cssVistos.has(rutaCss)) return;
  cssVistos.add(rutaCss);
  const f = resolver(rutaCss).fichero;
  if (!fs.existsSync(f)) return;
  const css = fs.readFileSync(f, 'utf8');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const r = normalizar(m[2], rutaCss);
    if (!r) continue;
    apuntar(r, rutaCss);
    if (r.endsWith('.css')) urlsDeCss(r);
  }
  for (const m of css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
    const r = normalizar(m[1], rutaCss); if (r) { apuntar(r, rutaCss); urlsDeCss(r); }
  }
}

let nPaginas = 0;
const base = path.join(REFERENCIA, IDIOMA);
for (const f of htmls(base)) {
  nPaginas++;
  const html = fs.readFileSync(f, 'utf8');
  // ruta pública de esta página (inversa de ficheroPara)
  let rel = '/' + path.relative(REFERENCIA, f).split(path.sep).join('/');
  rel = rel.replace(/__page-(\d+)\.html$/, '?page=$1').replace(/\/index\.html$/, '/').replace(/(?<!\.html)\.html$/, '');
  rel = rel.replace(/\?page=(\d+)$/, (m, n) => `?page=${n}`);
  if (/^\/[a-z]{2}\/[^?]+\?page=/.test(rel) && !rel.includes('.html')) { /* categoría paginada */ }
  const desde = rel;
  for (const m of html.matchAll(/<(link|script|img|source|a|iframe|video|audio|meta)\b([^>]*)>/gi)) {
    const etiqueta = m[1].toLowerCase(), attrs = m[2];
    // (?<![\w-]) evita que «src» case con «data-image-large-src»
    const get = n => attrs.match(new RegExp(`(?<![\\w-])${n}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? attrs.match(new RegExp(`(?<![\\w-])${n}\\s*=\\s*'([^']*)'`, 'i'))?.[1];
    if (etiqueta === 'link') {
      const rel2 = (get('rel') ?? '').toLowerCase();
      if (/stylesheet|icon|preload|prefetch/.test(rel2)) { const r = normalizar(get('href') ?? '', desde); apuntar(r, desde); if (r?.endsWith('.css')) urlsDeCss(r); }
      else if (/canonical|alternate/.test(rel2)) {
        const r = normalizar(get('href') ?? '', desde);
        const i = r?.match(/^\/([a-z]{2})(\/|$)/)?.[1];
        if (r && (!i || i === IDIOMA || idiomaCompleto(i))) apuntar(r, desde);
      }
    } else if (etiqueta === 'script' || etiqueta === 'iframe' || etiqueta === 'video' || etiqueta === 'audio') {
      apuntar(normalizar(get('src') ?? '', desde), desde);
    } else if (etiqueta === 'img' || etiqueta === 'source') {
      for (const a of ['src', 'data-src', 'data-full-size-image-url', 'data-image-large-src', 'data-image-medium-src', 'data-lazy']) { const v = get(a); if (v) apuntar(normalizar(v, desde), desde); }
      const ss = get('srcset'); if (ss) for (const s of ss.split(',')) apuntar(normalizar(s.trim().split(/\s+/)[0], desde), desde);
    } else if (etiqueta === 'meta') {
      const prop = (get('property') ?? '').toLowerCase();
      if (prop === 'og:image') apuntar(normalizar(get('content') ?? '', desde), desde);
    } else if (etiqueta === 'a') {
      const href = get('href'); if (!href) continue;
      const r = normalizar(href, desde);
      if (!r) continue;
      // enlaces a otros idiomas solo se comprueban si ese idioma ya está rastreado del todo
      const idiomaEnlace = r.match(/^\/([a-z]{2})(\/|$)/)?.[1];
      if (idiomaEnlace && idiomaEnlace !== IDIOMA && !idiomaCompleto(idiomaEnlace)) continue;
      apuntar(r, desde);
    }
  }
  for (const m of html.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) apuntar(normalizar(m[2], desde), desde);
}

// ---- comprobar en disco ----
const faltan = [];
const redirecciones = JSON.parse(fs.readFileSync(path.join(REFERENCIA, `rastreo-${IDIOMA}.json`), 'utf8'));
const redirigidas = new Map();
for (const [u, f] of Object.entries(redirecciones)) {
  if (!(f.estado >= 300 && f.estado < 400)) continue;
  const r = u.replace(reDom, '');
  redirigidas.set(r, f.redirige_a);
  try { redirigidas.set(decodeURIComponent(r), f.redirige_a); } catch { /* ruta sin codificar */ } // en el HTML van con espacios sin codificar
}
for (const [ruta, desde] of peticiones) {
  const r = resolver(ruta);
  if (r.redirigir) continue;
  if (fs.existsSync(r.fichero) && !fs.statSync(r.fichero).isDirectory()) continue;
  if (redirigidas.has(ruta)) continue;            // el original redirige (cuenta, login…)
  if (ruta.startsWith('/es/mapa')) { /* enlace del pie con espacio: va a fallos-original si el servidor lo confirma */ }
  if (listaBlanca.recursos[ruta]) continue;
  faltan.push({ ruta, fichero: r.fichero, paginas: desde.size, ejemplo: [...desde][0] });
}

// ---- opcional: preguntar al servidor viejo por lo que falta ----
const confirmados = [];
if (COMPROBAR_ORIGEN && faltan.length) {
  if (fs.existsSync(LOCK)) { console.error(`Hay un rastreo en marcha (${LOCK}); no se consulta el servidor viejo ahora.`); }
  else {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (rastreo-migracion)';
    for (const f of faltan) {
      const url = `https://${DOMINIO}${encodeURI(f.ruta)}`;
      let estado = 0;
      for (let i = 0; i < 3; i++) {
        try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'manual' }); estado = r.status; if (estado !== 508 && estado < 500) break; } catch { estado = 0; }
        await new Promise(r => setTimeout(r, [5000, 20000, 60000][i]));
      }
      f.origen = estado;
      console.log(`${estado} ${f.ruta}`);
      if (estado === 404 || estado === 410) { listaBlanca.recursos[f.ruta] = { estado, paginas: f.paginas, ejemplo: f.ejemplo, fecha: new Date().toISOString().slice(0, 10) }; confirmados.push(f.ruta); }
      await new Promise(r => setTimeout(r, 1200));
    }
    fs.mkdirSync('src/data', { recursive: true });
    fs.writeFileSync(FALLOS_ORIGINAL, JSON.stringify(listaBlanca, null, 1));
  }
}
const quedan = faltan.filter(f => !confirmados.includes(f.ruta));

// ---- informe ----
const porTipo = {};
for (const f of quedan) {
  const t = f.ruta.match(/^\/\d+-(\w+)\//)?.[1] ?? (f.ruta.startsWith('/img/') ? 'img' : f.ruta.startsWith('/modules/') || f.ruta.startsWith('/themes/') || f.ruta.startsWith('/js/') ? 'tema' : 'páginas');
  porTipo[t] = (porTipo[t] ?? 0) + 1;
}
const lineas = [
  `# Barrido de 404 (C5) — referencia ${IDIOMA}`, '',
  `${nPaginas} páginas leídas; ${peticiones.size} rutas distintas pedidas; ${Object.keys(listaBlanca.recursos).length} en la lista blanca (fallan también en el original).`,
  `**Faltan ${quedan.length}**${quedan.length ? ` → ${JSON.stringify(porTipo)}` : ''}.`, '',
  ...(quedan.length ? ['| ruta | páginas que la piden | ejemplo |', '|---|---|---|', ...quedan.slice(0, 300).map(f => `| \`${f.ruta}\` | ${f.paginas} | \`${f.ejemplo}\` |`)] : ['Todo lo que piden las páginas existe en disco.']),
];
fs.mkdirSync('informes', { recursive: true });
fs.writeFileSync(`informes/barrido-404-${IDIOMA}.md`, lineas.join('\n') + '\n');
fs.writeFileSync(`informes/barrido-404-${IDIOMA}.json`, JSON.stringify(quedan, null, 1));
console.log(lineas.slice(0, 4).join('\n'));
if (quedan.length) { console.log(`SE HA PARADO EN: barrido-404 (faltan ${quedan.length}; ver informes/barrido-404-${IDIOMA}.md)`); process.exitCode = 1; }
