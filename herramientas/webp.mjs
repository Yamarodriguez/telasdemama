// webp.mjs — versiones webp de las fotos de producto (Fase 3: la foto principal de la ficha va en webp con
// srcset, sin estirar, con width y height; en la Fase 6 se extenderá al resto).
//
// Lee public/<id>-large_default/<fichero>.jpg (las fotos bajadas de la tienda vieja, que no suben a Git),
// escribe public/webp/<id>-large_default/<nombre>-<ancho>.webp (anchos 500 y 1000, nunca más grande que el
// original) y apunta medidas y rutas en src/data/imagenes-webp.json (clave: id de la imagen de PrestaShop).
// La ruta del jpg original no cambia: sigue siendo el src de la etiqueta <img>.
//
// Uso: node herramientas/webp.mjs --producto 1091 [--producto 55 …] [--idioma es]
//      node herramientas/webp.mjs --todo [--idioma es]        (todas las fotos del catálogo)
// Nunca pide nada a telasdemama.com.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const IDIOMA = arg('idioma', 'es');
const TODO = args.includes('--todo');
const productosPedidos = args.map((a, i) => (a === '--producto' ? Number(args[i + 1]) : null)).filter(Boolean);
const ANCHOS = [500, 1000];
const CALIDAD = 82;
const FICHERO_DATOS = 'src/data/imagenes-webp.json';

if (!TODO && productosPedidos.length === 0) {
  console.log('Uso: node herramientas/webp.mjs --producto <id> [--producto <id> …] | --todo');
  process.exit(1);
}

const productos = JSON.parse(fs.readFileSync(`src/data/catalogo/${IDIOMA}/productos.json`, 'utf8'));
const elegidos = TODO ? productos : productos.filter((p) => productosPedidos.includes(Number(p.id)));
if (elegidos.length === 0) { console.log('No hay productos con esos ids.'); process.exit(1); }

const datos = fs.existsSync(FICHERO_DATOS) ? JSON.parse(fs.readFileSync(FICHERO_DATOS, 'utf8')) : {};
let hechas = 0, faltan = 0, saltadas = 0;

for (const p of elegidos) {
  for (const img of p.imagenes ?? []) {
    const ruta = img.por_tamano?.large_default; // «/2711-large_default/algodon-mar-caspio.jpg»
    if (!ruta) continue;
    const origen = path.join('public', ruta);
    if (!fs.existsSync(origen)) { faltan++; console.log(`falta ${origen} (¿imágenes de la Fase 1 sin bajar?)`); continue; }
    const carpeta = path.posix.dirname(ruta); // «/2711-large_default»
    const nombre = path.posix.basename(ruta).replace(/\.[a-z]+$/i, '');
    const destinoCarpeta = path.join('public', 'webp', carpeta);
    fs.mkdirSync(destinoCarpeta, { recursive: true });
    const meta = await sharp(origen).metadata();
    const anchos = [...new Set(ANCHOS.filter((a) => a < meta.width).concat([Math.min(meta.width, Math.max(...ANCHOS))]))].sort((a, b) => a - b);
    let nuevas = 0;
    for (const a of anchos) {
      const destino = path.join(destinoCarpeta, `${nombre}-${a}.webp`);
      if (fs.existsSync(destino)) { saltadas++; continue; }
      await sharp(origen).resize({ width: a, withoutEnlargement: true }).webp({ quality: CALIDAD }).toFile(destino);
      nuevas++;
    }
    hechas += nuevas;
    datos[String(img.id)] = { ancho: meta.width, alto: meta.height, base: `/webp${carpeta}/${nombre}`, anchos };
  }
}

const ordenado = { _nota: datos._nota ?? 'Versiones webp de las fotos de producto (Fase 3). Lo genera herramientas/webp.mjs; la clave es el id de la imagen de PrestaShop.' };
for (const k of Object.keys(datos).filter((k) => k !== '_nota').sort((a, b) => Number(a) - Number(b))) ordenado[k] = datos[k];
fs.writeFileSync(FICHERO_DATOS, JSON.stringify(ordenado, null, 2) + '\n');
console.log(`webp: ${hechas} ficheros nuevos, ${saltadas} ya existían, ${faltan} jpg sin bajar. Datos en ${FICHERO_DATOS} (${Object.keys(ordenado).length - 1} imágenes).`);
