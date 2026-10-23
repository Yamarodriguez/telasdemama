// comprobar-visual.mjs — comprobaciones con navegador de la Fase 2:
//   C4 geometría: para una muestra de páginas de cada plantilla, a 1400 y 390 px, se miden los
//      bloques principales (posición y tamaño) en la referencia y en la web nueva y se comparan
//      con una tolerancia de unos píxeles. Se guardan capturas en capturas/ para mirarlas.
//   C3 contraste: para cada texto visible se calcula el contraste (color del texto sobre el fondo
//      real, apilando capas con transparencia); si el fondo es una imagen que no se puede saber,
//      no se toca. Falla si un texto tiene distinto contraste en la web nueva que en la referencia.
//      Los textos del original con poco contraste se listan aparte (Dec. 7: se arreglan a mano, con permiso).
//   C5 404 en vivo: todo lo que el navegador pide y no existe (fotos, hojas, scripts, enlaces del
//      menú) cuenta como fallo, salvo la lista blanca (src/data/fallos-original.json y la config).
//
// Sirve la referencia (herramientas/servir-referencia.mjs, puerto 8090) y la web compilada (dist/,
// puerto 8091, con las mismas reglas que Netlify) y usa el Chrome instalado (Playwright, channel chrome).
// Las peticiones a dominios externos (Google, Revi, Metricool…) se bloquean en los dos lados.
//
// Uso: node herramientas/comprobar-visual.mjs [--idioma es] [--solo C4] [--pagina /es/3-telas] [--sin-capturas] [--dist dist]
// Salida: informes/visual.md, capturas/*.png; código 1 si hay fallos.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const IDIOMA = arg('idioma', 'es');
const SOLO = arg('solo', '');
const PAGINA = arg('pagina', '');
const SIN_CAPTURAS = process.argv.includes('--sin-capturas');
const DIST = arg('dist', 'dist'); // carpeta compilada que se sirve en 8091
const PUERTO_REF = 8090, PUERTO_NUEVA = 8091;
const config = JSON.parse(fs.readFileSync('herramientas/comprobar-visual.config.json', 'utf8'));
const manifiesto = JSON.parse(fs.readFileSync(`referencia/rastreo-${IDIOMA}.json`, 'utf8'));
const fallosOriginal = fs.existsSync('src/data/fallos-original.json') ? JSON.parse(fs.readFileSync('src/data/fallos-original.json', 'utf8')).recursos ?? {} : {};
const DOMINIO = 'https://telasdemama.com';

// ---------- muestra de páginas ----------
const fijas = new Set(config.paginas_fijas.map((p) => DOMINIO + p));
// Fase 3: las páginas con el rediseño encendido (src/data/rediseno.json) ya no son copia fiel: no se comparan
// con la tienda vieja (se miran a ojo con las capturas de capturar-rediseno.mjs) y se cuentan aparte.
const REDISENO = fs.existsSync('src/data/rediseno.json') ? JSON.parse(fs.readFileSync('src/data/rediseno.json', 'utf8')) : { activo: false, paginas: [] };
const conRediseno = new Set(REDISENO.activo ? REDISENO.paginas.map((p) => DOMINIO + (decodeURIComponent(p).replace(/\/$/, '') || '/')) : []);
const idiomasRediseno = new Set(REDISENO.activo ? REDISENO.idiomas ?? [] : []);
const esRediseno = (u) => { let r; try { r = decodeURIComponent(u); } catch { r = u; } r = r.replace(/\/$/, ''); return conRediseno.has(r) || idiomasRediseno.has(r.replace(DOMINIO, '').match(/^\/([a-z]{2})(\/|$)/)?.[1]); };
const saltadas = [];
const porTipo = {};
const paginas = [];
for (const [url, f] of Object.entries(manifiesto)) {
  if (f.estado !== 200 || ['authentication', 'password'].includes(f.tipo)) continue;
  if (esRediseno(url)) { saltadas.push(url.replace(DOMINIO, '')); continue; }
  if (PAGINA && url !== DOMINIO + PAGINA) continue;
  const fija = fijas.has(url);
  porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + (fija ? 0 : 1);
  if (fija || porTipo[f.tipo] <= config.por_tipo || PAGINA) paginas.push({ url, tipo: f.tipo });
}
paginas.push({ url: DOMINIO + '/pagina-que-no-existe-404', tipo: 'pagenotfound' });

// ---------- servidores ----------
function rutaDist(urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { p = urlPath; }
  const candidatos = [p, p + '.html', p.replace(/\/$/, '') + '/index.html', p + '/index.html'];
  for (const c of candidatos) { const f = path.join(DIST, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.webp': 'image/webp', '.json': 'application/json' };
function servirDist() {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      const u = new URL(req.url, 'http://x');
      // ?page=N → /pagina/N, como la regla de _redirects de Netlify
      let p = u.pathname;
      const page = u.searchParams.get('page');
      if (page && page !== '1') p = p.replace(/\/$/, '') + `/pagina/${page}`;
      const f = rutaDist(p) ?? (fs.existsSync(path.join('public', decodeURIComponent(p))) && fs.statSync(path.join('public', decodeURIComponent(p))).isFile() ? path.join('public', decodeURIComponent(p)) : null);
      if (!f) { r.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.existsSync(path.join(DIST, '404.html')) ? fs.readFileSync(path.join(DIST, '404.html')) : 'no'); return; }
      r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] ?? 'application/octet-stream' });
      r.end(fs.readFileSync(f));
    });
    s.listen(PUERTO_NUEVA, () => res(s));
  });
}
function servirReferencia() {
  const hijo = spawn(process.execPath, ['herramientas/servir-referencia.mjs', '--puerto', String(PUERTO_REF)], { stdio: 'ignore' });
  return new Promise((res) => setTimeout(() => res(hijo), 1200));
}

// ---------- medidas dentro de la página ----------
const MEDIR = ({ selectores, union }) => {
  const out = {};
  for (const sel of selectores) {
    // Los bloques con diferencia aceptada se miden como la caja que envuelve TODAS sus apariciones
    // (p. ej. el título h1 y el contador que va debajo); los demás, la primera aparición.
    const els = union.includes(sel) ? [...document.querySelectorAll(sel)] : [document.querySelector(sel)].filter(Boolean);
    if (!els.length) { out[sel] = null; continue; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) { const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y + window.scrollY); x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + window.scrollY + r.height); }
    if (x0 === Infinity) { out[sel] = { x: 0, y: 0, w: 0, h: 0 }; continue; }
    out[sel] = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  }
  out['(documento)'] = { x: 0, y: 0, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
  return out;
};

const CONTRASTE = () => {
  function parse(c) { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(',').map((x) => parseFloat(x)); return { r, g, b, a: isNaN(a) ? 1 : a }; }
  function mezclar(sup, inf) { const a = sup.a + inf.a * (1 - sup.a); if (!a) return { r: 255, g: 255, b: 255, a: 0 }; return { r: (sup.r * sup.a + inf.r * inf.a * (1 - sup.a)) / a, g: (sup.g * sup.a + inf.g * inf.a * (1 - sup.a)) / a, b: (sup.b * sup.a + inf.b * inf.a * (1 - sup.a)) / a, a }; }
  function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function fondo(el) { // apila capas hasta una opaca; imagen de fondo → desconocido
    let acumulado = { r: 0, g: 0, b: 0, a: 0 };
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { acumulado = mezclar(acumulado, bg); if (acumulado.a >= 0.999) return acumulado; }
    }
    return mezclar(acumulado, { r: 255, g: 255, b: 255, a: 1 });
  }
  function ruta(el) { const partes = []; for (let n = el, i = 0; n && n.tagName && i < 6; n = n.parentElement, i++) partes.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '')); return partes.join(' > '); }
  const res = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  let t;
  while ((t = walker.nextNode())) {
    const texto = t.textContent.replace(/\s+/g, ' ').trim();
    if (texto.length < 2) continue;
    const el = t.parentElement;
    if (!el || vistos.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || cs.fontFamily.includes('Material Icons') || cs.fontFamily.includes('fontello')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    vistos.add(el);
    const fg = parse(cs.color); const bg = fondo(el);
    if (!fg || !bg) continue;
    const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight) >= 700);
    res.push({ ruta: ruta(el), texto: texto.slice(0, 40), fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, ratio: Math.round(ratio(fg, bg) * 100) / 100, minimo: grande ? 3 : 4.5 });
  }
  return res;
};

// ---------- recorrido ----------
const CSS_QUIETO = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
async function abrir(context, url, ancho, bloqueados) {
  const page = await context.newPage();
  await page.setViewportSize({ width: ancho, height: 900 });
  const fallidas = [];
  page.on('response', (r) => { const u = new URL(r.url()); if (u.hostname === 'localhost' && r.status() >= 400) fallidas.push({ ruta: decodeURIComponent(u.pathname + u.search), estado: r.status() }); });
  page.on('requestfailed', (r) => { const u = new URL(r.url()); if (u.hostname === 'localhost') fallidas.push({ ruta: decodeURIComponent(u.pathname), estado: 'fallo' }); });
  await page.route('**/*', (route) => { const u = new URL(route.request().url()); if (u.hostname !== 'localhost') { bloqueados.add(u.hostname); return route.abort(); } return route.continue(); });
  await page.addInitScript(() => { window.__quieto = true; });
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: CSS_QUIETO });
  // Todas las tipografías cargadas (también las de iconos) y la página quieta: se espera a que
  // la altura del documento no cambie durante dos lecturas seguidas.
  await page.evaluate(async () => { await Promise.all([...document.fonts].map((f) => f.load().catch(() => null))); await document.fonts.ready; });
  let anterior = -1;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    const alto = await page.evaluate(() => document.documentElement.scrollHeight + '/' + document.body.getBoundingClientRect().width);
    if (alto === anterior) break;
    anterior = alto;
  }
  return { page, fallidas, estado: resp?.status() ?? 0 };
}

// Diferencias de geometría explicadas por una diferencia ACEPTADA que cambia la altura de un bloque
// (p. ej. el contador bajo el H1): lo que está debajo baja esa misma distancia y los contenedores
// que lo envuelven crecen lo mismo. Se descuentan antes de comparar.
function compararGeometria(a, b, aceptada) {
  const desvios = [];
  const T = config.tolerancia_px;
  for (const sel of Object.keys(a)) {
    if (!aceptada(sel)) continue;
    const x = a[sel], y = b[sel];
    if (x && y && x.h !== y.h) desvios.push({ y0: x.y, y1: x.y + x.h, delta: y.h - x.h });
    // Un bloque nuevo o que desaparece mueve lo de debajo su altura más sus márgenes (que no se miden): hasta 24 px más.
    else if (!x && y && y.h) desvios.push({ y0: y.y, y1: y.y, delta: y.h + 24 }); // bloque nuevo (p. ej. H1 de contacto)
    else if (x && !y && x.h) desvios.push({ y0: x.y, y1: x.y + x.h, delta: -(x.h + 24) }); // bloque que desaparece
  }
  // Lo que está debajo de un bloque aceptado, o lo envuelve, puede moverse o crecer hasta esa misma
  // distancia (no siempre lo hace: en dos columnas manda la columna más alta). Lo que está encima
  // o al lado no tiene excusa. La anchura y la posición horizontal siempre se comparan estrictas.
  const diffs = [];
  for (const sel of Object.keys(a)) {
    const x = a[sel], y = b[sel];
    if ((!x && !y) || aceptada(sel)) continue;
    if (!x || !y) { diffs.push({ sel, que: !x ? 'solo en la nueva' : 'falta en la nueva', ref: x, nueva: y }); continue; }
    let margenY = 0, margenH = 0, dentro = false;
    for (const d of desvios) {
      if (x.y >= d.y1 - T) margenY += Math.abs(d.delta);
      else if (x.y <= d.y0 + T && x.y + x.h >= d.y1 - T) margenH += Math.abs(d.delta);
      else if (x.y >= d.y0 - T && x.y + x.h <= d.y1 + T) dentro = true; // está dentro del bloque aceptado
    }
    if (dentro) continue;
    const desvio = { x: Math.abs(x.x - y.x), w: Math.abs(x.w - y.w), y: Math.max(0, Math.abs(x.y - y.y) - margenY), h: Math.max(0, Math.abs(x.h - y.h) - margenH) };
    const dist = Math.max(desvio.x, desvio.w, desvio.y, desvio.h);
    if (dist > config.tolerancia_px) diffs.push({ sel, que: `desvío ${dist}px`, ref: x, nueva: y });
  }
  return diffs;
}

const inicio = Date.now();
const distServer = await servirDist();
const refProc = await servirReferencia();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ deviceScaleFactor: 1, locale: 'es-ES' });
fs.mkdirSync('capturas', { recursive: true });
fs.mkdirSync('informes', { recursive: true });

const geometria = [], contraste = [], bajoContraste = [], cuatroCero = [], bloqueados = new Set(), sinCaptura = [];
let medidas = 0;
const hacer = (c) => !SOLO || SOLO.toUpperCase() === c;
const aceptada = (sel) => Object.keys(config.diferencias_aceptadas).some((k) => sel === k || sel.startsWith(k + ' '));

for (const { url, tipo } of paginas) {
  const ruta = url.replace(DOMINIO, '');
  const nombre = (ruta === '/' + IDIOMA + '/' ? 'portada' : ruta.replace(/^\/[a-z]{2}\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')) || 'raiz';
  const selectores = [...config.selectores_comunes, ...(config.selectores_por_tipo[tipo] ?? [])];
  for (const ancho of config.anchos) {
    const ref = await abrir(context, `http://localhost:${PUERTO_REF}${ruta}`, ancho, bloqueados);
    const nueva = await abrir(context, `http://localhost:${PUERTO_NUEVA}${ruta}`, ancho, bloqueados);
    medidas++;
    if (hacer('C4') && tipo !== 'pagenotfound') {
      const union = selectores.filter(aceptada);
      const a = await ref.page.evaluate(MEDIR, { selectores, union });
      const b = await nueva.page.evaluate(MEDIR, { selectores, union });
      for (const d of compararGeometria(a, b, aceptada)) geometria.push({ ruta, ancho, ...d });
      if (!SIN_CAPTURAS) {
        // Páginas larguísimas (p. ej. el aviso legal en móvil) superan el alto máximo que Chrome captura:
        // entonces se guarda solo la parte visible y se anota.
        for (const [p, lado] of [[ref.page, 'referencia'], [nueva.page, 'nueva']]) {
          const fichero = `capturas/${nombre}-${ancho}-${lado}.png`;
          try { await p.screenshot({ path: fichero, fullPage: true, timeout: 20000 }); }
          catch { try { await p.screenshot({ path: fichero, fullPage: false, timeout: 20000 }); sinCaptura.push(`${ruta} (${ancho}, ${lado}): solo la parte visible`); } catch (e) { sinCaptura.push(`${ruta} (${ancho}, ${lado}): ${String(e.message).split('\n')[0]}`); } }
        }
      }
    }
    if (hacer('C3') && ancho === config.anchos[0] && tipo !== 'pagenotfound') {
      const a = await ref.page.evaluate(CONTRASTE);
      const b = await nueva.page.evaluate(CONTRASTE);
      // Clave: ruta + texto + nº de repetición (el mismo texto puede salir varias veces en la página).
      const numerar = (lista) => { const c = new Map(); return lista.map((e) => { const k = `${e.ruta} | ${e.texto}`; const n = (c.get(k) ?? 0) + 1; c.set(k, n); return [`${k} #${n}`, e]; }); };
      const mapaB = new Map(numerar(b));
      for (const [k, e] of numerar(a)) {
        if (e.ratio < e.minimo) bajoContraste.push({ ruta, ...e });
        const n = mapaB.get(k);
        if (n && Math.abs(n.ratio - e.ratio) > config.tolerancia_contraste) contraste.push({ ruta, sel: e.ruta, texto: e.texto, ref: `${e.fg} sobre ${e.bg} = ${e.ratio}`, nueva: `${n.fg} sobre ${n.bg} = ${n.ratio}` });
      }
    }
    if (hacer('C5')) {
      for (const f of nueva.fallidas) {
        const limpio = f.ruta.split('?')[0];
        if (fallosOriginal[limpio] || config.recursos_aceptados[limpio] || (tipo === 'pagenotfound' && limpio === ruta)) continue;
        cuatroCero.push({ ruta, ancho, recurso: f.ruta, estado: f.estado });
      }
    }
    await ref.page.close(); await nueva.page.close();
  }
}
await browser.close();
distServer.close();
refProc.kill();

// ---------- informe ----------
const geomReal = geometria;
const geomAceptada = Object.keys(config.diferencias_aceptadas).length;
const cuatroCeroUnicos = [...new Map(cuatroCero.map((x) => [x.recurso, x])).values()];
const L = [`# Comprobaciones con navegador (C3, C4, C5) — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '',
  `${paginas.length} páginas × ${config.anchos.join(' y ')} px (${medidas} pares de páginas); ${((Date.now() - inicio) / 1000).toFixed(0)} s. Capturas en capturas/.${saltadas.length ? ` Con el rediseño encendido, no comparadas: ${saltadas.length} (${saltadas.slice(0, 20).join(', ')}${saltadas.length > 20 ? '…' : ''}).` : ''}`, '',
  `## C4 Geometría: ${geomReal.length} diferencias (${geomAceptada} bloques con diferencia aceptada por decisión, ver comprobar-visual.config.json)`, ''];
if (sinCaptura.length) L.push(`Sin captura (error del navegador): ${sinCaptura.join('; ')}`, '');
if (geomReal.length) {
  L.push('| página | ancho | bloque | qué | referencia | nueva |', '|---|---|---|---|---|---|');
  for (const g of geomReal.slice(0, 200)) L.push(`| ${g.ruta} | ${g.ancho} | \`${g.sel}\` | ${g.que} | ${g.ref ? `${g.ref.x},${g.ref.y} ${g.ref.w}×${g.ref.h}` : '—'} | ${g.nueva ? `${g.nueva.x},${g.nueva.y} ${g.nueva.w}×${g.nueva.h}` : '—'} |`);
}
L.push('', `## C3 Contraste: ${contraste.length} textos con distinto contraste que en la referencia`, '');
for (const c of contraste.slice(0, 100)) L.push(`- ${c.ruta} · \`${c.sel}\` «${c.texto}»: referencia ${c.ref} · nueva ${c.nueva}`);
const bajoUnicos = [...new Map(bajoContraste.map((x) => [`${x.ruta}|${x.texto}`, x])).values()];
L.push('', `## Textos del original con poco contraste (informativo; Dec. 7: se arreglan a mano con permiso): ${bajoUnicos.length}`, '');
for (const c of bajoUnicos.slice(0, 60)) L.push(`- ${c.ruta} «${c.texto}»: ${c.fg} sobre ${c.bg} = ${c.ratio} (mínimo ${c.minimo})`);
L.push('', `## C5 404 en vivo: ${cuatroCeroUnicos.length} recursos distintos que fallan (${cuatroCero.length} peticiones)`, '');
for (const c of cuatroCeroUnicos.slice(0, 150)) L.push(`- ${c.recurso} (${c.estado}) · p. ej. en ${c.ruta}`);
L.push('', `Dominios externos bloqueados durante la prueba: ${[...bloqueados].join(', ') || 'ninguno'}`);
fs.writeFileSync('informes/visual.md', L.join('\n') + '\n');
console.log(L.slice(0, 5).join('\n'));
console.log(`C4 ${geomReal.length} · C3 ${contraste.length} · C5 ${cuatroCeroUnicos.length} (detalle en informes/visual.md)`);
if (geomReal.length || contraste.length || cuatroCeroUnicos.length) { console.log('SE HA PARADO EN: visual'); process.exitCode = 1; }
