// capturar-rediseno.mjs — Fase 3 (Dec. 4): compila la web con el interruptor encendido para cada opción del
// rediseño (REDISENO=1, REDISENO_OPCION=1|2) y captura las páginas de prueba (src/data/rediseno.json) a 1400 y
// 390 px, para que Yama elija mirando. Además monta una comparativa lado a lado («ahora» | opción 1 | opción 2)
// por página y ancho; la columna «ahora» sale de las capturas de la copia fiel que hace comprobar-visual.mjs.
// No pide nada a telasdemama.com. Compila en su propia carpeta, dist-rediseno/ (no toca dist/, que usan las comprobaciones y el hook pre-push).
//
// Uso: node herramientas/capturar-rediseno.mjs [--opciones 1,2] [--anchos 1400,390] [--sin-compilar] [--alto-1400 2400] [--alto-390 2600]
// Salida: capturas/rediseno-<opcion>-<pagina>-<ancho>.png y capturas/rediseno-comparativa-<pagina>-<ancho>.png

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const OPCIONES = arg('opciones', '1,2').split(',');
const ANCHOS = arg('anchos', '1400,390').split(',').map(Number);
const ALTO = { 1400: Number(arg('alto-1400', 2400)), 390: Number(arg('alto-390', 2600)) };
const SIN_COMPILAR = process.argv.includes('--sin-compilar');
const PUERTO = 8093;
const SALIDA = 'dist-rediseno'; // carpeta propia: dist/ es de las comprobaciones (npm run todo:visual, hook pre-push)
const NOMBRES = { ahora: 'Ahora (copia fiel)', 1: 'Opción 1 · Diseño propio', 2: 'Opción 2 · Al estilo de quekucas' };
const PERMITIDOS = /^https?:\/\/(localhost|fonts\.googleapis\.com|fonts\.gstatic\.com|revi\.io|[a-z0-9.-]*\.revi\.io)(:|\/|$)/;

const rediseno = JSON.parse(fs.readFileSync('src/data/rediseno.json', 'utf8'));
const paginas = rediseno.paginas;
fs.mkdirSync('capturas', { recursive: true });

function compilar(opcion) {
  const env = { ...process.env };
  if (opcion) { env.REDISENO = '1'; env.REDISENO_OPCION = String(opcion); } else { env.REDISENO = '0'; delete env.REDISENO_OPCION; }
  process.stdout.write(`\n=== compilar (interruptor ${opcion ? 'encendido, opción ' + opcion : 'apagado'}) ===\n`);
  const r = process.platform === 'win32' ? spawnSync('npx astro build --outDir ' + SALIDA, { stdio: 'inherit', shell: true, env }) : spawnSync('npx', ['astro', 'build', '--outDir', SALIDA], { stdio: 'inherit', env });
  if (r.status !== 0) { console.log('Falló la compilación.'); process.exit(1); }
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.webp': 'image/webp', '.json': 'application/json' };
function rutaFichero(urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { p = urlPath; }
  for (const base of [SALIDA, 'public']) {
    for (const c of [p, p + '.html', p.replace(/\/$/, '') + '/index.html', p + '/index.html']) {
      const f = path.join(base, c);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}
function servir() {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      const f = rutaFichero(new URL(req.url, 'http://x').pathname);
      if (!f) { r.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.existsSync(SALIDA + '/404.html') ? fs.readFileSync(SALIDA + '/404.html') : 'no'); return; }
      r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] ?? 'application/octet-stream' });
      r.end(fs.readFileSync(f));
    });
    s.listen(PUERTO, () => res(s));
  });
}

const slug = (pagina) => (pagina.replace(/^\/[a-z]{2}\/?/, '') || 'portada').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const hechas = [];

// «ahora» = la copia fiel (interruptor apagado), capturada igual que las opciones para que la comparativa sea justa.
// --sin-compilar solo tiene sentido con una opción: dist-rediseno/ guarda la última compilación.
for (const op of ['ahora', ...OPCIONES]) {
  if (!SIN_COMPILAR) compilar(op === 'ahora' ? null : op);
  else if (op === 'ahora') continue;
  const servidor = await servir();
  const navegador = await chromium.launch({ channel: 'chrome' });
  for (const pagina of paginas) {
    for (const ancho of ANCHOS) {
      const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 1 });
      await contexto.route(/^https?:\/\//, (r) => (PERMITIDOS.test(r.request().url()) ? r.continue() : r.abort()));
      const page = await contexto.newPage();
      await page.goto(`http://localhost:${PUERTO}${pagina}`, { waitUntil: 'networkidle' });
      const tieneRediseno = await page.evaluate(() => document.body.classList.contains('rd'));
      if (op !== 'ahora' && !tieneRediseno) console.log(`AVISO: ${pagina} no lleva el rediseño (¿${SALIDA}/ compilado sin REDISENO=1?)`);
      if (op === 'ahora' && tieneRediseno) console.log(`AVISO: ${pagina} lleva el rediseño en la columna «ahora»`);
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(600);
      const altoPagina = await page.evaluate(() => Math.min(document.documentElement.scrollHeight, 12000));
      await page.setViewportSize({ width: ancho, height: Math.max(900, altoPagina) });
      await page.waitForTimeout(200);
      const fichero = path.join('capturas', `rediseno-${op}-${slug(pagina)}-${ancho}.png`);
      await page.screenshot({ path: fichero, fullPage: true });
      hechas.push(fichero);
      await contexto.close();
    }
  }
  await navegador.close();
  servidor.close();
}

// ---- comparativas lado a lado ----
async function etiqueta(texto, anchoImg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoImg}" height="54"><rect width="100%" height="100%" fill="#222"/><text x="16" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">${texto.replace(/&/g, '&amp;')}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
for (const pagina of paginas) {
  for (const ancho of ANCHOS) {
    const columnas = [];
    for (const op of ['ahora', ...OPCIONES]) {
      const fichero = path.join('capturas', `rediseno-${op}-${slug(pagina)}-${ancho}.png`);
      if (fs.existsSync(fichero)) columnas.push({ op, fichero });
    }
    const anchoCol = ancho >= 1000 ? 700 : ancho;
    const altoCol = Math.round(ALTO[ancho] * (anchoCol / ancho));
    const SEP = 24;
    const partes = [];
    for (const c of columnas) {
      const meta = await sharp(c.fichero).metadata();
      const recorte = await sharp(c.fichero).extract({ left: 0, top: 0, width: meta.width, height: Math.min(meta.height, ALTO[ancho]) }).resize({ width: anchoCol }).png().toBuffer();
      const lienzo = await sharp({ create: { width: anchoCol, height: altoCol + 54, channels: 4, background: '#ffffff' } })
        .composite([{ input: await etiqueta(NOMBRES[c.op] ?? c.op, anchoCol), top: 0, left: 0 }, { input: recorte, top: 54, left: 0 }]).png().toBuffer();
      partes.push(lienzo);
    }
    const total = columnas.length * anchoCol + (columnas.length + 1) * SEP;
    const salida = path.join('capturas', `rediseno-comparativa-${slug(pagina)}-${ancho}.png`);
    await sharp({ create: { width: total, height: altoCol + 54 + 2 * SEP, channels: 4, background: '#e9e9e9' } })
      .composite(partes.map((input, i) => ({ input, top: SEP, left: SEP + i * (anchoCol + SEP) }))).png().toFile(salida);
    hechas.push(salida);
  }
}

console.log(hechas.map((f) => ' - ' + f).join('\n'));
console.log(`Listo: ${hechas.length} imágenes en capturas/`);
