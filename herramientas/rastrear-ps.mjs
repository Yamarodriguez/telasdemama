// rastrear-ps.mjs — rastreador de una tienda PrestaShop para la migración.
//
// Parte de la portada de un idioma y sigue todos los enlaces internos de ese
// idioma (categorías con toda su paginación, fichas, páginas CMS, etc.).
// Guarda el HTML en referencia/ con la misma ruta pública y una tabla en
// referencia/rastreo-<idioma>.json con tipo, id, URL, idioma, estado, etc.
//
// Va DESPACIO a propósito: el servidor de la tienda es compartido y corta con
// "508 Resource Limit Is Reached". Un hilo, espera entre peticiones, reintentos
// con pausas crecientes y pausa general cuando aparece un 508.
//
// Uso:
//   node herramientas/rastrear-ps.mjs --idioma es
//   opciones: --hilos 1  --espera 800 (ms)  --max 0 (0 = sin límite)
//             --salida referencia  --dominio telasdemama.com
//   Se puede cortar y volver a lanzar: retoma lo que falte.

import fs from 'node:fs';
import path from 'node:path';

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf('--' + nombre);
  return i === -1 ? porDefecto : process.argv[i + 1];
};

const DOMINIO = arg('dominio', 'telasdemama.com');
const IDIOMA = arg('idioma', 'es');
const HILOS = Number(arg('hilos', 1));
const ESPERA = Number(arg('espera', 800));
const MAX = Number(arg('max', 0));
const SALIDA = arg('salida', 'referencia');
const BASE = `https://${DOMINIO}`;
const TIMEOUT_MS = 90_000;
const ESPERAS_REINTENTO = [8_000, 20_000, 60_000, 180_000];
// Ritmo adaptable: el servidor compartido admite una petición a la vez y tarda
// en soltar la anterior. Si aparece un 508 se espera más; si todo va bien, menos.
const ESPERA_MIN = 3_000, ESPERA_MAX = 60_000;
let esperaActual = Math.max(ESPERA_MIN, ESPERA);
const MIN_CARACTERES = 5000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (rastreo-migracion)';

const RUTA_MANIFIESTO = path.join(SALIDA, `rastreo-${IDIOMA}.json`);
const RUTA_LOG = path.join('informes', `rastreo-${IDIOMA}.log`);
fs.mkdirSync(SALIDA, { recursive: true });
fs.mkdirSync('informes', { recursive: true });

const EXT_ACTIVOS = /\.(jpe?g|png|gif|webp|svg|ico|css|js|pdf|zip|woff2?|ttf|eot|mp4|xml|txt)(\?|$)/i;

function log(linea) {
  const t = new Date().toISOString().slice(11, 19);
  const s = `[${t}] ${linea}`;
  console.log(s);
  fs.appendFileSync(RUTA_LOG, s + '\n');
}

// Normaliza una URL encontrada en el HTML. Devuelve null si no hay que rastrearla.
function normalizar(href, desde) {
  if (!href) return null;
  href = href.trim().replace(/&amp;/g, '&');
  if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) return null;
  let u;
  try { u = new URL(href, desde); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host !== DOMINIO) return null;
  u.protocol = 'https:';
  u.hostname = DOMINIO;
  u.hash = '';
  // Solo el idioma elegido
  if (!(u.pathname === `/${IDIOMA}` || u.pathname.startsWith(`/${IDIOMA}/`))) return null;
  if (u.pathname === `/${IDIOMA}`) u.pathname = `/${IDIOMA}/`;
  // Ficheros, módulos y rutas internas: no son páginas
  if (EXT_ACTIVOS.test(u.pathname)) return null;
  if (/\/(module|modules|themes|js|img|c|m|p)\//.test(u.pathname)) return null;
  // Parámetros: solo se conserva ?page=N (paginación). Cualquier otro (q=, order=,
  // s=, controller=, add, token…) descarta la URL: son filtros, buscador o carrito.
  const params = [...u.searchParams.keys()];
  if (params.length) {
    if (params.length === 1 && params[0] === 'page') {
      const n = u.searchParams.get('page');
      if (!/^\d+$/.test(n)) return null;
      if (n === '1') u.search = '';
      else u.search = `?page=${n}`;
    } else {
      return null;
    }
  }
  return u.toString();
}

// Ruta de fichero para una URL: /es/ → es/index.html ; /es/3-telas → es/3-telas.html
// /es/3-telas?page=2 → es/3-telas__page-2.html ; /es/inicio/1-x.html → es/inicio/1-x.html
function ficheroPara(url) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index';
  if (!/\.html?$/i.test(p)) p += u.search ? `__page-${u.searchParams.get('page')}.html` : '.html';
  else if (u.search) p = p.replace(/\.html?$/i, `__page-${u.searchParams.get('page')}.html`);
  // Caracteres que Windows no admite en nombres de fichero
  p = p.split('/').map(s => s.replace(/[<>:"\\|?*]/g, '_')).join('/');
  return path.join(SALIDA, p);
}

function analizarHtml(html) {
  const body = html.match(/<body[^>]*>/i)?.[0] ?? '';
  const id = body.match(/\bid="([^"]+)"/)?.[1] ?? '';
  const clases = body.match(/\bclass="([^"]+)"/)?.[1] ?? '';
  const idObj = clases.match(/\b(?:product|category|cms|manufacturer|supplier)-id-(\d+)\b/)?.[1] ?? '';
  const titulo = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1]
    ?? html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i)?.[1] ?? '';
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  const enlaces = new Set();
  for (const m of html.matchAll(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/gi)) {
    const n = normalizar(m[1] ?? m[2], BASE + '/');
    if (n) enlaces.add(n);
  }
  return { tipo: id || 'desconocido', id: idObj, clases, titulo, canonical, h1, enlaces: [...enlaces] };
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function pedir(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const ini = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': IDIOMA }, redirect: 'manual', signal: ctrl.signal });
    const texto = await r.text();
    return { estado: r.status, texto, ms: Date.now() - ini, destino: r.headers.get('location') ?? '' };
  } catch (e) {
    return { estado: 0, texto: '', ms: Date.now() - ini, error: String(e?.cause?.message ?? e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

// ---- Estado ----
let manifiesto = {};
if (fs.existsSync(RUTA_MANIFIESTO)) {
  manifiesto = JSON.parse(fs.readFileSync(RUTA_MANIFIESTO, 'utf8'));
  log(`Retomo: ${Object.keys(manifiesto).length} URL ya conocidas en ${RUTA_MANIFIESTO}`);
}
const guardarManifiesto = () => {
  const tmp = RUTA_MANIFIESTO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifiesto, null, 1));
  fs.renameSync(tmp, RUTA_MANIFIESTO);
};

const cola = [];
const vistas = new Set();
function encolar(url, desde) {
  if (vistas.has(url)) return;
  vistas.add(url);
  const previo = manifiesto[url];
  if (previo && previo.estado === 200 && previo.fichero && fs.existsSync(previo.fichero)) {
    // Ya bajada: solo hace falta volver a leer sus enlaces para seguir el árbol
    try {
      const html = fs.readFileSync(previo.fichero, 'utf8');
      for (const e of analizarHtml(html).enlaces) encolar(e, url);
    } catch { /* se vuelve a bajar */ cola.push({ url, desde }); }
    return;
  }
  if (previo && (previo.estado === 301 || previo.estado === 302 || previo.estado === 404 || previo.estado === 410)) {
    return; // redirecciones y 404 ya anotados no se repiten
  }
  cola.push({ url, desde });
}

let hechas = 0, fallos = 0, pausaGlobalHasta = 0;

async function procesar({ url, desde }) {
  let intento = 0, res;
  for (;;) {
    const ahora = Date.now();
    if (pausaGlobalHasta > ahora) await dormir(pausaGlobalHasta - ahora);
    res = await pedir(url);
    const transitorio = res.estado === 0 || res.estado >= 500 || res.estado === 429;
    if (!transitorio || intento >= ESPERAS_REINTENTO.length) break;
    const espera = ESPERAS_REINTENTO[intento++];
    if (res.estado === 508 || res.estado === 503) {
      pausaGlobalHasta = Date.now() + espera; // el servidor está al límite: paramos todos
      esperaActual = Math.min(ESPERA_MAX, Math.round(esperaActual * 1.5));
    }
    log(`  reintento ${intento}/${ESPERAS_REINTENTO.length} en ${espera / 1000}s (estado ${res.estado}${res.error ? ' ' + res.error : ''}) ${url}`);
    await dormir(espera);
  }
  if (intento === 0 && res.estado > 0 && res.estado < 500) esperaActual = Math.max(ESPERA_MIN, Math.round(esperaActual * 0.9));

  const fila = { url, idioma: IDIOMA, estado: res.estado, ms: res.ms, intentos: intento + 1, desde, fecha: new Date().toISOString() };
  if (res.estado >= 300 && res.estado < 400) {
    fila.redirige_a = res.destino;
    const n = normalizar(res.destino, url);
    if (n) encolar(n, url);
  } else if (res.estado === 200 || res.estado === 404) {
    const a = analizarHtml(res.texto);
    Object.assign(fila, { tipo: a.tipo, id: a.id, titulo: a.titulo, canonical: a.canonical, h1: a.h1, bytes: res.texto.length, clases: a.clases });
    if (res.texto.length < MIN_CARACTERES) fila.corta = true;
    if (res.estado === 200) {
      fila.fichero = ficheroPara(url);
      fs.mkdirSync(path.dirname(fila.fichero), { recursive: true });
      fs.writeFileSync(fila.fichero, res.texto);
      for (const e of a.enlaces) encolar(e, url);
    } else {
      fila.tipo = a.tipo || 'pagenotfound';
    }
  } else {
    fila.error = res.error ?? `estado ${res.estado}`;
    fallos++;
  }
  manifiesto[url] = fila;
  hechas++;
  guardarManifiesto();
  log(`${String(res.estado).padStart(3)} ${String(res.ms).padStart(5)}ms ${fila.tipo ?? '-'} ${fila.id ?? ''} ${url}${fila.redirige_a ? ' -> ' + fila.redirige_a : ''}`);
  if (hechas % 25 === 0) log(`--- hechas ${hechas}, en cola ${cola.length}, conocidas ${vistas.size}, fallos ${fallos}, espera ${esperaActual} ms`);
}

async function hilo() {
  while (cola.length) {
    if (MAX && hechas >= MAX) return;
    const item = cola.shift();
    await procesar(item);
    await dormir(esperaActual);
  }
}

log(`Rastreo de ${BASE}/${IDIOMA}/ — hilos ${HILOS}, espera ${ESPERA} ms, salida ${SALIDA}/`);
encolar(`${BASE}/${IDIOMA}/`, '(semilla)');
await Promise.all(Array.from({ length: HILOS }, hilo));

const filas = Object.values(manifiesto).filter(f => f.idioma === IDIOMA);
const porTipo = {};
for (const f of filas) porTipo[`${f.estado} ${f.tipo ?? '-'}`] = (porTipo[`${f.estado} ${f.tipo ?? '-'}`] ?? 0) + 1;
log(`FIN. ${filas.length} URL en el manifiesto; esta pasada ${hechas} peticiones, ${fallos} fallos definitivos.`);
for (const [k, v] of Object.entries(porTipo).sort()) log(`  ${String(v).padStart(4)}  ${k}`);
if (fallos) { log('SE HA PARADO EN: quedan URL con fallo definitivo; vuelve a lanzar el rastreo para reintentarlas.'); process.exitCode = 1; }
