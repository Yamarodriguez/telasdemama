// bajar-tema.mjs — baja las hojas, scripts y fuentes del tema y de los módulos
// que usan las páginas de referencia, y las deja en public/ con la MISMA ruta
// pública que tienen en la tienda vieja (p. ej. /themes/cosmetics_th/assets/css/theme.css).
//
// 1. Lee todos los HTML de referencia/ y apunta cada .css y .js del dominio, con
//    el orden en que aparecen por tipo de página → src/data/tema-recursos.json.
// 2. Los baja de UNO EN UNO (el servidor viejo no admite dos peticiones a la vez).
// 3. En cada CSS busca los url(...) (fuentes, iconos, fondos) y los baja también,
//    resolviendo la ruta relativa a la hoja.
// 4. Reescribe las direcciones absolutas al dominio viejo como rutas relativas a la
//    raíz y FALLA si queda alguna.
//
// Uso: node herramientas/bajar-tema.mjs   (opciones: --dominio, --salida public, --referencia referencia)
// Se puede relanzar: lo ya bajado no se vuelve a pedir.

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const DOMINIO = arg('dominio', 'telasdemama.com');
const SALIDA = arg('salida', 'public');
const REFERENCIA = arg('referencia', 'referencia');
const BASE = `https://${DOMINIO}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (rastreo-migracion)';
const ESPERA = 1500;
const LOG = path.join('informes', 'bajar-tema.log');
fs.mkdirSync('informes', { recursive: true });
const log = s => { const l = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
const dormir = ms => new Promise(r => setTimeout(r, ms));

// ---- 1. recursos de cada HTML ----
function* htmls(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (/\.html?$/i.test(e.name)) yield p;
  }
}
const domEsc = DOMINIO.replace(/\./g, '\\.');
const reDom = new RegExp(`^(?:https?:)?//(?:www\\.)?${domEsc}`);
const aRuta = u => u.replace(reDom, '').split('?')[0].split('#')[0];

const porTipo = {};      // tipo de página -> { css: [...], js: [...] } (orden de la primera página de ese tipo)
const recursos = new Map(); // ruta -> nº de páginas
let nHtml = 0;
for (const f of htmls(REFERENCIA)) {
  const h = fs.readFileSync(f, 'utf8');
  nHtml++;
  const tipo = h.match(/<body[^>]*\bid="([^"]+)"/)?.[1] ?? 'desconocido';
  const css = [], js = [], externos = [];
  for (const m of h.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)) {
    const href = m[0].match(/href="([^"]+)"/)?.[1]; if (!href) continue;
    if (reDom.test(href) || href.startsWith('/')) css.push(aRuta(href)); else externos.push(href);
  }
  for (const m of h.matchAll(/<script[^>]+src="([^"]+)"/gi)) {
    const src = m[1];
    if (reDom.test(src) || src.startsWith('/')) js.push(aRuta(src)); else externos.push(src.split('?')[0]);
  }
  for (const r of [...css, ...js]) recursos.set(r, (recursos.get(r) ?? 0) + 1);
  if (!porTipo[tipo]) porTipo[tipo] = { css, js, externos: [...new Set(externos)], ejemplo: f.split(path.sep).join('/') };
}
// favicon
recursos.set('/img/favicon.ico', nHtml);
log(`${nHtml} HTML leídos; ${recursos.size} hojas/scripts del dominio; tipos de página: ${Object.keys(porTipo).join(', ')}`);

// ---- 2. descarga secuencial ----
const fallos = [];
async function bajar(ruta) {
  const destino = path.join(SALIDA, ruta);
  if (fs.existsSync(destino)) return 'ya';
  const url = BASE + ruta;
  for (let intento = 0; intento < 4; intento++) {
    const ini = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual' });
      if (r.status === 200) {
        const buf = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, buf);
        log(`200 ${String(Date.now() - ini).padStart(5)}ms ${String(buf.length).padStart(8)} B ${ruta}`);
        return 'ok';
      }
      if (r.status === 404 || r.status === 403 || (r.status >= 300 && r.status < 400)) {
        log(`${r.status} ${ruta}`); fallos.push({ ruta, estado: r.status }); return 'fallo';
      }
      log(`  reintento ${intento + 1} (estado ${r.status}) ${ruta}`);
    } catch (e) {
      log(`  reintento ${intento + 1} (${e?.cause?.message ?? e.message}) ${ruta}`);
    }
    await dormir([8000, 20000, 60000, 120000][intento]);
  }
  fallos.push({ ruta, estado: 'sin respuesta' });
  return 'fallo';
}

const pendientes = [...recursos.keys()].sort();
for (const r of pendientes) { const res = await bajar(r); if (res !== 'ya') await dormir(ESPERA); }

// ---- 3. url(...) dentro de los CSS (fuentes, iconos, fondos) ----
const enCss = new Map(); // ruta -> desde qué hoja
const externosCss = new Set();
function urlsDeCss(ruta) {
  const destino = path.join(SALIDA, ruta);
  if (!fs.existsSync(destino)) return [];
  const css = fs.readFileSync(destino, 'utf8');
  const out = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const u = m[2].trim();
    if (/^(data:|#)/i.test(u)) continue;
    if (/^(https?:)?\/\//i.test(u) && !reDom.test(u)) { externosCss.add(u); continue; } // externo: se apunta aparte
    let abs;
    if (reDom.test(u)) abs = aRuta(u);
    else if (u.startsWith('/')) abs = u.split('?')[0].split('#')[0];
    else abs = path.posix.normalize(path.posix.join(path.posix.dirname(ruta), u.split('?')[0].split('#')[0]));
    out.push(abs);
  }
  return out;
}
const cola = pendientes.filter(r => r.endsWith('.css'));
const vistosCss = new Set(cola);
while (cola.length) {
  const hoja = cola.shift();
  for (const u of urlsDeCss(hoja)) {
    if (!enCss.has(u)) enCss.set(u, hoja);
    if (u.endsWith('.css') && !vistosCss.has(u)) { vistosCss.add(u); cola.push(u); }
  }
}
for (const u of [...enCss.keys()].sort()) { const res = await bajar(u); if (res !== 'ya') await dormir(ESPERA); }
log(`${enCss.size} ficheros referenciados desde los CSS (fuentes, iconos, fondos); ${externosCss.size} externos`);

// ---- 4. reescritura de direcciones absolutas ----
const reAbs = new RegExp(`(https?:)?//(?:www\\.)?${domEsc}(?=/)`, 'g');
let reescritos = 0;
function* ficheros(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* ficheros(p); else yield p;
  }
}
for (const f of ficheros(SALIDA)) {
  if (!/\.(css|js)$/i.test(f)) continue;
  const antes = fs.readFileSync(f, 'utf8');
  const despues = antes.replace(reAbs, '');
  if (antes !== despues) { fs.writeFileSync(f, despues); reescritos++; }
}
let quedan = 0;
for (const f of ficheros(SALIDA)) {
  if (!/\.(css|js)$/i.test(f)) continue;
  reAbs.lastIndex = 0;
  if (reAbs.test(fs.readFileSync(f, 'utf8'))) { quedan++; log(`QUEDA una dirección absoluta en ${f}`); }
}
log(`reescritos ${reescritos} ficheros; quedan ${quedan} con direcciones absolutas`);

// ---- salida ----
fs.mkdirSync('src/data', { recursive: true });
const tabla = {
  dominio: DOMINIO, fecha: new Date().toISOString().slice(0, 10),
  por_tipo_de_pagina: porTipo,
  recursos: Object.fromEntries([...recursos.entries()].sort().map(([k, v]) => [k, { paginas: v }])),
  desde_css: Object.fromEntries([...enCss.entries()].sort()),
  externos_en_css: [...externosCss].sort(),
  fallos,
};
fs.writeFileSync('src/data/tema-recursos.json', JSON.stringify(tabla, null, 1));
log(`escrito src/data/tema-recursos.json. Fallos: ${fallos.length}`);
if (fallos.length || quedan) { log('SE HA PARADO EN: bajar-tema (hay fallos o direcciones absolutas)'); process.exitCode = 1; }
