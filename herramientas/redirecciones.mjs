// redirecciones.mjs — genera public/_redirects (Netlify) a partir del catálogo:
//   · la raíz / → /es/ (como hacía la tienda vieja, 302);
//   · la paginación vieja (?page=N) → su página propia /pagina/N;
//   · las redirecciones que ya hacía PrestaShop (p. ej. /es/9-revistas);
//   · cuenta de cliente, carrito y pedido, que desaparecen con la Dec. 8 → contacto;
//   · el buscador, pendiente de decidir (Pagefind o quitarlo) → portada.
// Se ejecuta antes de compilar (npm run build lo llama con "prebuild").
// Uso: node herramientas/redirecciones.mjs

import fs from 'node:fs';
import path from 'node:path';

const POR_PAGINA = 12;
const DIR = 'src/data/catalogo';
const idiomas = fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, 'productos.json')) && fs.existsSync(`src/data/bloques/${d}/menu.json`));
const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CUENTA_Y_CARRITO = ['mi-cuenta', 'iniciar-sesion', 'recuperar-contraseña', 'datos-personales', 'historial-compra', 'facturas-abono', 'direcciones', 'descuento', 'carrito', 'pedido', 'confirmacion-pedido', 'seguimiento-pedido', 'seguimiento-pedido-invitado', 'direccion'];

const lineas = ['# Generado por herramientas/redirecciones.mjs a partir del catálogo. No editar a mano.', ''];
lineas.push(`/  /${idiomas[0]}/  302!`, '');

for (const idioma of idiomas) {
  const categorias = leer(`${DIR}/${idioma}/categorias.json`);
  const otras = leer(`${DIR}/${idioma}/otras.json`);
  const redirecciones = fs.existsSync(`${DIR}/${idioma}/redirecciones.json`) ? leer(`${DIR}/${idioma}/redirecciones.json`) : {};
  const listados = [
    ...categorias.map((c) => ({ base: c.url, n: c.productos.length })),
    ...Object.entries(otras).filter(([, o]) => ['best-sales', 'new-products', 'prices-drop', 'manufacturer'].includes(o.tipo) && o.productos).map(([u, o]) => ({ base: decodeURIComponent(u), n: o.productos.length })),
  ];
  lineas.push(`# ${idioma}: paginación vieja (?page=N) → página propia`);
  for (const l of listados) {
    if (Math.ceil(l.n / POR_PAGINA) < 2) continue;
    lineas.push(`${l.base}  page=1  ${l.base}  301`);
    lineas.push(`${l.base}  page=:n  ${l.base}/pagina/:n  301`);
  }
  lineas.push('', `# ${idioma}: redirecciones que ya hacía la tienda vieja`);
  for (const [de, a] of Object.entries(redirecciones)) {
    if (a.includes('iniciar-sesion')) continue;
    lineas.push(`${de}  ${a.replace(/^https?:\/\/[^/]+/, '')}  301`);
  }
  lineas.push('', `# ${idioma}: cuenta de cliente, carrito y pedido ya no existen (Dec. 8) → contacto`);
  for (const r of CUENTA_Y_CARRITO) lineas.push(`/${idioma}/${encodeURI(r)}  /${idioma}/contactenos  301`);
  lineas.push(`/${idioma}/busqueda  /${idioma}/  302`, '');
}
lineas.push('# URL antiguas de PrestaShop con index.php', '/index.php  /  301', '');

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/_redirects', lineas.join('\n'));
console.log(`public/_redirects: ${lineas.filter((l) => l && !l.startsWith('#')).length} reglas (${idiomas.join(', ')})`);
