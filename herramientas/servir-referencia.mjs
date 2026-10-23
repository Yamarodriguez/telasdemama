// servir-referencia.mjs — sirve la copia de la tienda vieja en local, con las
// MISMAS URL que el original, para mirarla en el navegador y para el barrido de 404.
//
//   /es/                 → referencia/es/index.html
//   /es/3-telas          → referencia/es/3-telas.html
//   /es/3-telas?page=2   → referencia/es/3-telas__page-2.html
//   /es/inicio/1003-x.html → referencia/es/inicio/1003-x.html
//   /themes/…, /modules/…, /js/…, /img/…, /1234-large_default/x.jpg → public/…
//
// Uso: node herramientas/servir-referencia.mjs  (opciones: --puerto 8090 --referencia referencia --public public)
// Las direcciones absolutas a telasdemama.com que hay dentro del HTML se reescriben
// al vuelo a http://localhost:8090 para que el navegador no se vaya a la web viva.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const PUERTO = Number(arg('puerto', 8090));
const REFERENCIA = arg('referencia', 'referencia');
const PUBLIC = arg('public', 'public');
const DOMINIO = arg('dominio', 'telasdemama.com');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

// Misma regla que rastrear-ps.mjs (ficheroPara) para pasar de URL a fichero de referencia.
export function ficheroReferencia(pathname, search) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { p = pathname; }
  const page = new URLSearchParams(search).get('page');
  if (p.endsWith('/')) p += 'index';
  if (!/\.html?$/i.test(p)) p += page && page !== '1' ? `__page-${page}.html` : '.html';
  else if (page && page !== '1') p = p.replace(/\.html?$/i, `__page-${page}.html`);
  p = p.split('/').map(s => s.replace(/[<>:"\\|?*]/g, '_')).join('/');
  return path.join(REFERENCIA, p);
}

export function resolver(urlPath) {
  const u = new URL(urlPath, 'http://x');
  const esPagina = /^\/[a-z]{2}(\/|$)/.test(u.pathname) && !/\.(css|js|jpe?g|png|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(u.pathname);
  if (u.pathname === '/') return { redirigir: '/es/' };
  if (esPagina) return { fichero: ficheroReferencia(u.pathname === '/es' ? '/es/' : u.pathname, u.search) };
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { p = u.pathname; }
  return { fichero: path.join(PUBLIC, p) };
}

const reAbs = new RegExp(`https?://(?:www\\.)?${DOMINIO.replace(/\./g, '\\.')}`, 'g');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const servidor = http.createServer((req, res) => {
    const r = resolver(req.url);
    if (r.redirigir) { res.writeHead(302, { Location: r.redirigir }); return res.end(); }
    const f = r.fichero;
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 ${req.url} → ${f}`);
    }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (ext === '.html') {
      let html = fs.readFileSync(f, 'utf8');
      html = html.replace(reAbs, `http://localhost:${PUERTO}`);
      return res.end(html);
    }
    fs.createReadStream(f).pipe(res);
  });
  servidor.listen(PUERTO, () => console.log(`Referencia servida en http://localhost:${PUERTO}/es/  (Ctrl+C para parar)`));
}
