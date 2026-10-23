// bajar-imagenes.mjs — baja las imágenes que usan las páginas de referencia y las
// deja en public/ con la MISMA ruta pública que en la tienda vieja:
//   /{id_imagen}-{tamaño}/{nombre}.jpg  (home_default, large_default, medium_default…)
//   /img/…  (logo, iconos, banners, cms, tiendas, marcas)  /modules/htmlbanners*/…
//
// Uso:
//   node herramientas/bajar-imagenes.mjs --muestra 30   → solo mide 30 al azar (HEAD) y estima el peso total
//   node herramientas/bajar-imagenes.mjs                → baja todas (con permiso del propietario)
//   opciones: --referencia referencia  --salida public  --dominio telasdemama.com  --idioma (todos)
// De UNA EN UNA (el servidor viejo corta con 508 si hay dos peticiones). Retoma lo que falte.
// Si hay un rastreo en marcha (informes/rastreo-en-curso.lock) se niega a arrancar.
// Las que dan 404 van a informes/imagenes-fallidas.txt (no suben a git).

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const DOMINIO = arg('dominio', 'telasdemama.com');
const SALIDA = arg('salida', 'public');
const REFERENCIA = arg('referencia', 'referencia');
const MUESTRA = Number(arg('muestra', 0));
const BASE = `https://${DOMINIO}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (rastreo-migracion)';
const ESPERA_MIN = 400, ESPERA_MAX = 60_000;
let espera = 800;
const LOCK = path.join('informes', 'rastreo-en-curso.lock');
const LOG = path.join('informes', 'bajar-imagenes.log');
const FALLIDAS = path.join('informes', 'imagenes-fallidas.txt');
fs.mkdirSync('informes', { recursive: true });
const log = s => { const l = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
const dormir = ms => new Promise(r => setTimeout(r, ms));

if (fs.existsSync(LOCK)) {
  console.error(`Hay un rastreo en marcha (${LOCK}). El servidor solo admite una cosa a la vez: espera a que termine.`);
  process.exit(2);
}

// ---- lista de imágenes ----
function* htmls(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (/\.html?$/i.test(e.name)) yield p;
  }
}
const domEsc = DOMINIO.replace(/\./g, '\\.');
const reDom = new RegExp(`^(?:https?:)?//(?:www\\.)?${domEsc}`);
const EXT = /\.(jpe?g|png|gif|webp|svg|ico)$/i;
const imagenes = new Map(); // ruta -> nº de páginas
for (const f of htmls(REFERENCIA)) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/(?:src|href|data-full-size-image-url|data-image-large-src|data-image-medium-src|data-src|content)="([^"]+)"/g)) {
    let u = m[1].replace(/&amp;/g, '&').trim();
    if (!(reDom.test(u) || u.startsWith('/'))) continue;
    u = u.replace(reDom, '').split('?')[0].split('#')[0];
    if (!EXT.test(u)) continue;
    try { u = decodeURI(u); } catch { /* se deja como está */ }
    imagenes.set(u, (imagenes.get(u) ?? 0) + 1);
  }
  for (const m of h.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    let u = m[2].trim();
    if (!(reDom.test(u) || u.startsWith('/'))) continue;
    u = u.replace(reDom, '').split('?')[0].split('#')[0];
    if (EXT.test(u)) imagenes.set(u, (imagenes.get(u) ?? 0) + 1);
  }
}
const lista = [...imagenes.keys()].sort();
const porTipo = {};
for (const r of lista) {
  const t = r.match(/^\/\d+-(\w+)\//)?.[1] ?? (r.startsWith('/img/') ? 'img' : r.startsWith('/modules/') ? 'modules' : 'otras');
  porTipo[t] = (porTipo[t] ?? 0) + 1;
}
log(`${lista.length} imágenes distintas en la referencia: ${JSON.stringify(porTipo)}`);

const pendientes = lista.filter(r => !fs.existsSync(path.join(SALIDA, r)));
log(`${lista.length - pendientes.length} ya bajadas, ${pendientes.length} pendientes`);

// ---- muestra: solo medir ----
if (MUESTRA) {
  const azar = [...pendientes].sort(() => Math.random() - 0.5).slice(0, MUESTRA);
  let total = 0, n = 0;
  const porTam = {};
  for (const r of azar) {
    const ini = Date.now();
    const res = await fetch(BASE + encodeURI(r), { method: 'HEAD', headers: { 'User-Agent': UA } });
    const len = Number(res.headers.get('content-length') ?? 0);
    const t = r.match(/^\/\d+-(\w+)\//)?.[1] ?? 'otras';
    (porTam[t] ??= []).push(len);
    if (res.status === 200 && len) { total += len; n++; }
    log(`${res.status} ${String(Date.now() - ini).padStart(5)}ms ${String(len).padStart(8)} B ${r}`);
    await dormir(espera);
  }
  const media = n ? total / n : 0;
  log(`muestra: ${n} medidas, media ${(media / 1024).toFixed(1)} KB`);
  for (const [t, v] of Object.entries(porTam)) {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const cuantas = porTipo[t] ?? 0;
    log(`  ${t}: media ${(m / 1024).toFixed(1)} KB × ${cuantas} ≈ ${(m * cuantas / 1024 / 1024).toFixed(0)} MB`);
  }
  log(`estimación total: ${(media * pendientes.length / 1024 / 1024).toFixed(0)} MB para ${pendientes.length} ficheros`);
  process.exit(0);
}

// ---- descarga completa ----
let hechas = 0, fallos = 0, bytes = 0;
const fallidasPrevias = fs.existsSync(FALLIDAS) ? new Set(fs.readFileSync(FALLIDAS, 'utf8').split('\n').map(l => l.split('\t')[0]).filter(Boolean)) : new Set();
for (const r of pendientes) {
  if (fallidasPrevias.has(r)) continue;
  const destino = path.join(SALIDA, r);
  let ok = false;
  for (let intento = 0; intento < 5 && !ok; intento++) {
    const ini = Date.now();
    try {
      const res = await fetch(BASE + encodeURI(r), { headers: { 'User-Agent': UA }, redirect: 'manual' });
      if (res.status === 200) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, buf);
        bytes += buf.length; ok = true;
        espera = Math.max(ESPERA_MIN, Math.round(espera * 0.9));
        log(`200 ${String(Date.now() - ini).padStart(5)}ms ${String(buf.length).padStart(8)} B ${r}`);
      } else if (res.status === 404 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
        log(`${res.status} ${r}`);
        fs.appendFileSync(FALLIDAS, `${r}\t${res.status}\t${imagenes.get(r)} páginas\n`);
        fallos++; break;
      } else {
        espera = Math.min(ESPERA_MAX, Math.round(espera * 1.5));
        const p = [8000, 20000, 60000, 120000, 180000][intento];
        log(`  reintento ${intento + 1} en ${p / 1000}s (estado ${res.status}) ${r}`);
        await dormir(p);
      }
    } catch (e) {
      const p = [8000, 20000, 60000, 120000, 180000][intento];
      log(`  reintento ${intento + 1} en ${p / 1000}s (${e?.cause?.message ?? e.message}) ${r}`);
      await dormir(p);
    }
  }
  if (!ok && !fs.existsSync(destino)) { /* 404 anotado o sin respuesta */ if (!fallidasPrevias.has(r)) { /* ya apuntado si 404 */ } }
  hechas++;
  if (hechas % 100 === 0) log(`--- ${hechas}/${pendientes.length}, ${(bytes / 1024 / 1024).toFixed(0)} MB, fallos ${fallos}, espera ${espera} ms`);
  await dormir(espera);
}
log(`FIN. ${hechas} peticiones, ${(bytes / 1024 / 1024).toFixed(0)} MB bajados, ${fallos} fallos (ver ${FALLIDAS}).`);
const quedan = lista.filter(r => !fs.existsSync(path.join(SALIDA, r)));
log(`faltan ${quedan.length} de ${lista.length}`);
if (quedan.length) { log('SE HA PARADO EN: bajar-imagenes (faltan imágenes; las 404 del original van a src/data/fallos-original.json)'); process.exitCode = 1; }
