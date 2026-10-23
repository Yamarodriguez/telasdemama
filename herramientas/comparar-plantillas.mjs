// comparar-plantillas.mjs — comprobación C2: el marcado de cada página compilada (dist/) coincide
// con el de la referencia (referencia/) por tipo de plantilla.
//
// Para cada página de la referencia se busca su fichero en dist/ y se comparan los dos árboles
// con el MISMO lector de HTML: etiqueta, id, clases (como conjunto), atributos y texto propio,
// nodo a nodo. Antes se normaliza lo que cambia en cada visita (tokens, ids aleatorios, dominio,
// ?page=N) y se quitan las diferencias aceptadas de comparar-plantillas.config.json (cada una con
// su motivo). Lo que queda es un fallo de la copia.
//
// Uso: node herramientas/comparar-plantillas.mjs [--idioma es] [--muestra 0] [--pagina /es/3-telas]
//   --muestra N : compara solo N páginas por tipo (0 = todas)
//   --pagina URL: compara una sola página y enseña todas sus diferencias
// Salida: informes/plantillas.md; código 1 si hay diferencias.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const IDIOMA = arg('idioma', 'es');
const MUESTRA = Number(arg('muestra', 0));
const SOLO = arg('pagina', '');
const REF = arg('referencia', 'referencia');
const DIST = arg('dist', 'dist');
const DOMINIO = 'https://telasdemama.com';
const config = JSON.parse(fs.readFileSync('herramientas/comparar-plantillas.config.json', 'utf8'));
const manifiesto = JSON.parse(fs.readFileSync(path.join(REF, `rastreo-${IDIOMA}.json`), 'utf8'));
const ATTR_IGNORADOS = new Set(config.atributos_ignorados);
const IDS_ALEATORIOS = config.ids_aleatorios.map((r) => new RegExp(r));
const RENOMBRAR = Object.keys(config.renombrar);
const QUITAR = Object.keys(config.quitar).join(', ');

// ---- utilidades ----
function ficheroDist(url) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname);
  const page = u.searchParams.get('page');
  if (p.endsWith('/')) p += 'index';
  if (page && page !== '1') p = p.replace(/\.html$/, '') + `/pagina/${page}`;
  if (!p.endsWith('.html')) p += '.html';
  return path.join(DIST, p);
}

function normTexto(s) {
  return (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function normValor(nombre, v) {
  if (v == null) return '';
  let s = decodificar(String(v).trim());
  if (/^(href|src|data-full-size-image-url|data-image-large-src|data-image-medium-src|content|data-slider-encoded-url)$/.test(nombre) || nombre === 'href') {
    s = s.replace(/^https?:\/\/(www\.)?telasdemama\.com/, '').replace(/^\/\/telasdemama\.com/, '');
    s = s.replace(/\?page=1$/, '').replace(/\?page=(\d+)$/, '/pagina/$1');
    try { s = decodeURIComponent(s); } catch { /* se deja tal cual */ }
    if (s === '') s = '/';
  }
  if (nombre === 'id' || nombre === 'for' || nombre === 'data-target') {
    const sinAlmohadilla = s.replace(/^#/, '');
    for (const r of IDS_ALEATORIOS) {
      const m = sinAlmohadilla.match(r);
      if (m) { s = (s.startsWith('#') ? '#' : '') + sinAlmohadilla.replace(/\d+/, 'N'); break; }
    }
  }
  if (nombre === 'class') s = s.split(/\s+/).filter(Boolean).sort().join(' ');
  return normTexto(s); // los saltos de línea de un alt o title no son una diferencia
}

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", times: '×', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', middot: '·', bull: '•', trade: '™', reg: '®', laquo: '«', raquo: '»', copy: '©', euro: '€', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°' };
function decodificar(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m);
}

function textoPropio(el) {
  return normTexto(decodificar(el.childNodes.filter((n) => n.nodeType === 3).map((n) => n.rawText).join(' ')));
}

function firma(el) {
  const attrs = {};
  for (const [k, v] of Object.entries(el.attributes)) {
    if (ATTR_IGNORADOS.has(k)) continue;
    if (k.startsWith('data-') && ATTR_IGNORADOS.has(k)) continue;
    attrs[k] = normValor(k, v);
  }
  const tag = el.getAttribute('data-cmp-tag') || el.tagName.toLowerCase();
  delete attrs['data-cmp-tag'];
  return { tag, attrs, texto: textoPropio(el) };
}

function preparar(html, lado) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, pre: true, textarea: true } });
  for (const el of root.querySelectorAll(QUITAR)) el.remove();
  for (const regla of config.quitar_si_texto) {
    for (const el of root.querySelectorAll(regla.selector)) if (el.text.includes(regla.contiene)) el.remove();
  }
  // Nodos aceptados como distintos (botón de carrito → WhatsApp, enlaces de filtro → texto…):
  // se dejan opacos (misma etiqueta ficticia, sin atributos, sin texto ni hijos) para comprobar
  // solo que están en el mismo sitio.
  for (const sel of RENOMBRAR) {
    for (const el of root.querySelectorAll(sel)) {
      for (const k of Object.keys(el.attributes)) el.removeAttribute(k);
      el.setAttribute('data-cmp-tag', 'x');
      el.set_content('');
    }
  }
  return root;
}

function hijos(el) {
  return el.childNodes.filter((n) => n.nodeType === 1);
}

function ruta(el) {
  const partes = [];
  let n = el;
  while (n && n.tagName) {
    const id = n.id ? `#${n.id}` : '';
    const cl = n.classList?.value?.length ? '.' + n.classList.value.slice(0, 2).join('.') : '';
    partes.unshift(n.tagName.toLowerCase() + id + cl);
    n = n.parentNode;
  }
  return partes.slice(-6).join(' > ');
}

function comparar(a, b, diffs, limite = 40) {
  if (diffs.length >= limite) return;
  const fa = firma(a), fb = firma(b);
  if (fa.tag !== fb.tag) { diffs.push({ donde: ruta(a), que: 'etiqueta', ref: fa.tag, nuevo: fb.tag }); return; }
  for (const k of new Set([...Object.keys(fa.attrs), ...Object.keys(fb.attrs)])) {
    if ((fa.attrs[k] ?? '') !== (fb.attrs[k] ?? '')) diffs.push({ donde: ruta(a), que: `atributo ${k}`, ref: fa.attrs[k] ?? '(sin)', nuevo: fb.attrs[k] ?? '(sin)' });
  }
  if (fa.texto !== fb.texto) diffs.push({ donde: ruta(a), que: 'texto', ref: fa.texto.slice(0, 120), nuevo: fb.texto.slice(0, 120) });
  const ha = hijos(a), hb = hijos(b);
  if (ha.length !== hb.length) {
    const i = ha.findIndex((h, idx) => !hb[idx] || firma(h).tag !== firma(hb[idx]).tag || (firma(h).attrs.id ?? '') !== (firma(hb[idx]).attrs.id ?? ''));
    const primero = i === -1 ? (ha[hb.length] ?? hb[ha.length]) : (ha[i] ?? hb[i]);
    diffs.push({ donde: ruta(a), que: `nº de hijos ${ha.length} vs ${hb.length}`, ref: i === -1 ? '' : ruta(ha[i] ?? a), nuevo: primero ? ruta(primero) : '' });
  }
  for (let i = 0; i < Math.min(ha.length, hb.length); i++) comparar(ha[i], hb[i], diffs, limite);
}

function compararCabecera(ra, rb) {
  const diffs = [];
  // /estilos/ es la hoja de lo nuevo (regla del H1, WhatsApp): no existe en la referencia y va la última.
  const dato = (root, sel, attr) => root.querySelectorAll(sel).filter((e) => !(e.getAttribute('href') ?? '').startsWith('/estilos/')).map((e) => (attr ? normValor(attr, e.getAttribute(attr)) : normTexto(e.text)));
  const pares = [
    ['title', 'title', null],
    ['meta description', 'meta[name=description]', 'content'],
    ['meta keywords', 'meta[name=keywords]', 'content'],
    ['canonical', 'link[rel=canonical]', 'href'],
    ['hreflang', 'link[rel=alternate]', 'hreflang'],
    ['hojas (orden)', 'link[rel=stylesheet]', 'href'],
    ['og', 'meta[property]', 'content'],
  ];
  for (const [nombre, sel, attr] of pares) {
    const x = dato(ra, sel, attr).join(' | '), y = dato(rb, sel, attr).join(' | ');
    if (x !== y) diffs.push({ donde: 'head', que: nombre, ref: x.slice(0, 200), nuevo: y.slice(0, 200) });
  }
  return diffs;
}

// ---- recorrido ----
const porTipo = {};
const resultados = [];
const entradas = Object.entries(manifiesto).filter(([u, f]) => f.estado === 200 && f.fichero && !config.tipos_omitidos[f.tipo] && (!SOLO || u === DOMINIO + SOLO));
const contador = {};
for (const [url, f] of entradas) {
  const tipo = f.tipo || '?';
  contador[tipo] = (contador[tipo] ?? 0) + 1;
  if (MUESTRA && contador[tipo] > MUESTRA && !SOLO) continue;
  const destino = ficheroDist(url);
  const r = { url, tipo, destino, diffs: [] };
  if (!fs.existsSync(destino)) { r.diffs.push({ donde: '(fichero)', que: 'falta en dist', ref: destino, nuevo: '' }); }
  else {
    const ra = preparar(fs.readFileSync(f.fichero, 'utf8'), 'ref');
    const rb = preparar(fs.readFileSync(destino, 'utf8'), 'nuevo');
    r.diffs.push(...compararCabecera(ra, rb));
    const ba = ra.querySelector('body'), bb = rb.querySelector('body');
    if (ba && bb) comparar(ba, bb, r.diffs, SOLO ? 500 : 40);
  }
  resultados.push(r);
  (porTipo[tipo] ??= { paginas: 0, conDiferencias: 0, firmas: new Map() }).paginas++;
  if (r.diffs.length) {
    porTipo[tipo].conDiferencias++;
    for (const d of r.diffs) {
      const clave = `${d.donde} · ${d.que}`;
      const e = porTipo[tipo].firmas.get(clave) ?? { n: 0, ejemplo: d, url };
      e.n++;
      porTipo[tipo].firmas.set(clave, e);
    }
  }
}

// ---- informe ----
const L = [`# Comparación por plantilla (C2) — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, ''];
L.push(`Páginas comparadas: ${resultados.length} · con diferencias: ${resultados.filter((r) => r.diffs.length).length}`, '');
L.push('| tipo | páginas | con diferencias |', '|---|---|---|');
for (const [t, v] of Object.entries(porTipo).sort()) L.push(`| ${t} | ${v.paginas} | ${v.conDiferencias} |`);
for (const [t, v] of Object.entries(porTipo).sort()) {
  if (!v.conDiferencias) continue;
  L.push('', `## ${t}`, '');
  const firmas = [...v.firmas.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  for (const [clave, e] of firmas) {
    L.push(`- **${e.n}×** \`${clave}\``, `  - referencia: \`${String(e.ejemplo.ref).slice(0, 160)}\``, `  - nueva: \`${String(e.ejemplo.nuevo).slice(0, 160)}\``, `  - p. ej. ${e.url.replace(DOMINIO, '')}`);
  }
}
if (SOLO && resultados[0]) {
  L.push('', `## Todas las diferencias de ${SOLO}`, '');
  for (const d of resultados[0].diffs) L.push(`- \`${d.donde}\` · ${d.que}: ref=\`${d.ref}\` nuevo=\`${d.nuevo}\``);
}
fs.mkdirSync('informes', { recursive: true });
fs.writeFileSync('informes/plantillas.md', L.join('\n') + '\n');
console.log(L.slice(0, 12).join('\n'));
const malas = resultados.filter((r) => r.diffs.length).length;
console.log(malas ? `\n${malas} páginas con diferencias. Detalle en informes/plantillas.md` : '\n0 diferencias.');
if (malas) process.exitCode = 1;
