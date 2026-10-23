// capturar-rediseno.mjs — Fase 3 (Dec. 4): capturas de las páginas de prueba con cada opción del rediseño,
// a 1400 y 390 px, y una imagen comparativa lado a lado («ahora» | A | B | C) por página y ancho, para que
// Yama elija mirando, no leyendo.
//
// Trabaja sobre dist/ compilado con el interruptor encendido (REDISENO=1 npx astro build); cambia la hoja
// del rediseño en el navegador para cada opción. La columna «ahora» sale de las capturas de la copia fiel
// que ya hace comprobar-visual.mjs (capturas/<pagina>-<ancho>-nueva.png). No pide nada a telasdemama.com.
//
// Uso: node herramientas/capturar-rediseno.mjs [--opciones a,b,c] [--anchos 1400,390] [--alto-1400 1900] [--alto-390 2300]
// Salida: capturas/rediseno/<pagina>-<ancho>-<opcion>.png y capturas/rediseno/comparativa-<pagina>-<ancho>.png

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import sharp from 'sharp';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const OPCIONES = arg('opciones', 'a,b,c').split(',');
const ANCHOS = arg('anchos', '1400,390').split(',').map(Number);
const ALTO = { 1400: Number(arg('alto-1400', 1900)), 390: Number(arg('alto-390', 2300)) };
const PUERTO = 8093;
const SALIDA = 'capturas/rediseno';
const NOMBRES = { ahora: 'Ahora (copia fiel)', a: 'Opción A · Como ahora, más clara', b: 'Opción B · Cálida, de taller', c: 'Opción C · En contraste' };

const rediseno = JSON.parse(fs.readFileSync('src/data/rediseno.json', 'utf8'));
const paginas = rediseno.paginas;
if (!fs.existsSync('dist/404.html')) { console.log('No hay dist/. Compila antes con el interruptor encendido: $env:REDISENO=\'1\'; npx astro build'); process.exit(1); }
fs.mkdirSync(SALIDA, { recursive: true });

// ---- servidor de dist/ (como el de comprobar-visual.mjs) ----
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.webp': 'image/webp', '.json': 'application/json' };
function rutaFichero(urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { p = urlPath; }
  for (const base of ['dist', 'public']) {
    for (const c of [p, p + '.html', p.replace(/\/$/, '') + '/index.html', p + '/index.html']) {
      const f = path.join(base, c);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}
const servidor = http.createServer((req, r) => {
  const u = new URL(req.url, 'http://x');
  const f = rutaFichero(u.pathname);
  if (!f) { r.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync('dist/404.html')); return; }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] ?? 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise((res) => servidor.listen(PUERTO, res));

// ---- capturas ----
const slug = (pagina) => pagina.replace(/^\/[a-z]{2}\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const navegador = await chromium.launch({ channel: 'chrome' });
const hechas = [];
for (const pagina of paginas) {
  for (const ancho of ANCHOS) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 1 });
    await contexto.route(/^https?:\/\/(?!localhost)/, (r) => r.abort()); // nada externo (Google, Revi, Metricool…)
    const page = await contexto.newPage();
    await page.goto(`http://localhost:${PUERTO}${pagina}`, { waitUntil: 'networkidle' });
    const tieneRediseno = await page.evaluate(() => Boolean(document.querySelector('link[href*="/estilos/rediseno/"]')));
    if (!tieneRediseno) console.log(`AVISO: ${pagina} no lleva la hoja del rediseño (¿dist/ compilado sin REDISENO=1?)`);
    for (const op of OPCIONES) {
      await page.evaluate((op) => {
        const link = document.querySelector('link[href*="/estilos/rediseno/"]');
        if (link) link.setAttribute('href', `/estilos/rediseno/${op}.css`);
        document.body.className = document.body.className.replace(/\brediseno-[a-z]\b/g, `rediseno-${op}`);
        window.scrollTo(0, 0);
      }, op);
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => { await document.fonts.ready; });
      // Recorre la página para que lo que aparece al hacer scroll (wow.js) esté visible en la captura.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(400);
      // El tema lleva una barra fija abajo en el móvil: con la ventana a la altura de la página la captura la enseña en su sitio.
      const altoPagina = await page.evaluate(() => Math.min(document.body.scrollHeight, 12000));
      await page.setViewportSize({ width: ancho, height: Math.max(900, altoPagina) });
      await page.waitForTimeout(200);
      const fichero = path.join(SALIDA, `${slug(pagina)}-${ancho}-${op}.png`);
      await page.screenshot({ path: fichero, fullPage: true });
      hechas.push(fichero);
    }
    await contexto.close();
  }
}
await navegador.close();
servidor.close();

// ---- comparativas lado a lado ----
async function etiqueta(texto, anchoImg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoImg}" height="54"><rect width="100%" height="100%" fill="#222"/><text x="16" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">${texto.replace(/&/g, '&amp;')}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
for (const pagina of paginas) {
  for (const ancho of ANCHOS) {
    const columnas = [];
    const ahora = path.join('capturas', `${slug(pagina)}-${ancho}-nueva.png`);
    if (fs.existsSync(ahora)) columnas.push({ op: 'ahora', fichero: ahora });
    for (const op of OPCIONES) columnas.push({ op, fichero: path.join(SALIDA, `${slug(pagina)}-${ancho}-${op}.png`) });
    const anchoCol = ancho === 1400 ? 700 : 390;
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
    const salida = path.join(SALIDA, `comparativa-${slug(pagina)}-${ancho}.png`);
    await sharp({ create: { width: total, height: altoCol + 54 + 2 * SEP, channels: 4, background: '#e9e9e9' } })
      .composite(partes.map((input, i) => ({ input, top: SEP, left: SEP + i * (anchoCol + SEP) }))).png().toFile(salida);
    hechas.push(salida);
  }
}
console.log(hechas.map((f) => ' - ' + f).join('\n'));
console.log(`Listo: ${hechas.length} imágenes en ${SALIDA}/`);
