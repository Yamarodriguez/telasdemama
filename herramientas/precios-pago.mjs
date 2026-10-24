// precios-pago.mjs — genera netlify/functions/precios-pago.mjs, la tabla mínima que lee la función de pago
// (netlify/functions/pago.mjs): para cada ficha del catálogo, su nombre, referencia, precio con IVA, si se puede
// pedir y su cantidad mínima. Así la función no carga el catálogo entero (3 MB) y el importe del pago sale
// SIEMPRE de los precios del catálogo y nunca de lo que mande el navegador.
//
// Se ejecuta solo en cada compilación (npm run build → prebuild). El fichero no sube a Git: es un derivado del
// catálogo y, si subiera, podría quedarse con precios viejos.
//
// Uso: node herramientas/precios-pago.mjs [--idioma es]

import fs from 'node:fs';
import path from 'node:path';

const i = process.argv.indexOf('--idioma');
const IDIOMA = i === -1 ? 'es' : process.argv[i + 1];
const productos = JSON.parse(fs.readFileSync(`src/data/catalogo/${IDIOMA}/productos.json`, 'utf8'));
const tabla = {};
let pedibles = 0;
for (const p of productos) {
  const pedible = Boolean(p.muestra_precio && p.disponible_para_pedido && p.disponibilidad !== 'unavailable' && p.precio_con_iva > 0);
  if (pedible) pedibles++;
  tabla[p.id] = {
    nombre: p.nombre,
    referencia: p.referencia ?? '',
    precio: p.precio_con_iva,
    pedible,
    minimo_cm: p.cantidad_minima || 1,
    url: p.url,
  };
}
const salida = path.join('netlify', 'functions', 'precios-pago.mjs');
fs.mkdirSync(path.dirname(salida), { recursive: true });
// Módulo de JavaScript (no JSON) para que lo importe igual Node y el empaquetador de Netlify, sin sintaxis especial.
const cabecera = '// Generado por herramientas/precios-pago.mjs en cada compilación; no se edita ni sube a Git.';
fs.writeFileSync(salida, [cabecera, 'export default ' + JSON.stringify({ idioma: IDIOMA, generado: new Date().toISOString(), productos: tabla }) + ';', ''].join('\n'));
console.log(`precios-pago: ${Object.keys(tabla).length} fichas (${pedibles} se pueden pedir) → ${salida}`);
