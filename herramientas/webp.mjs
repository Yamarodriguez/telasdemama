// webp.mjs — versiones webp de las fotos de producto para el rediseño (Fase 3) y la velocidad (Fase 6).
//
// La tienda vieja guarda cada foto rellena de blanco hasta un tamaño fijo (large_default 1000×750, medium_default
// 382×272): por eso las fotos verticales salen con franjas blancas a los lados. Aquí se recorta ese blanco (solo el
// borde blanco puro; si el recorte se comiera más del 60 % de la foto se deja sin recortar) y se escribe en webp:
//   public/webp/<id>-large_default/<nombre>-<ancho>.webp   (anchos 500 y el real, nunca más de 1000)
//   public/webp/<id>-medium_default/<nombre>-<ancho>.webp  (ancho real, nunca más de 382)
// y apunta medidas y rutas en src/data/imagenes-webp.json (clave: id de la imagen de PrestaShop). La ruta del jpg
// original no cambia: sigue siendo el src de la etiqueta <img>.
//
// Se ejecuta solo al compilar (integración en astro.config.mjs; salta lo que ya existe) y a mano:
//   node herramientas/webp.mjs --todo [--idioma es] [--rehacer]
//   node herramientas/webp.mjs --producto 1091 [--producto 55 …]
// Nunca pide nada a telasdemama.com. public/webp/ y el JSON no suben a Git: se generan en cada compilación.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const FICHERO_DATOS = 'src/data/imagenes-webp.json';
const CALIDAD = 82;
const TAMANOS = { large_default: { anchos: [500, 1000] }, medium_default: { anchos: [382] } };
const UMBRAL_BLANCO = 12; // diferencia máxima con el blanco puro para considerarlo relleno
const MINIMO_QUE_QUEDA = 0.4; // si el recorte deja menos del 40 % de ancho o de alto, no se recorta

export async function generarWebp({ idioma = 'es', ids = null, rehacer = false, raiz = process.cwd(), log = console.log } = {}) {
  const productos = JSON.parse(fs.readFileSync(path.join(raiz, `src/data/catalogo/${idioma}/productos.json`), 'utf8'));
  const elegidos = ids ? productos.filter((p) => ids.includes(Number(p.id))) : productos;
  const ficheroDatos = path.join(raiz, FICHERO_DATOS);
  const datos = !rehacer && fs.existsSync(ficheroDatos) ? JSON.parse(fs.readFileSync(ficheroDatos, 'utf8')) : {};
  let hechas = 0, saltadas = 0, faltan = 0, recortadas = 0;
  const inicio = Date.now();

  for (const p of elegidos) {
    for (const img of p.imagenes ?? []) {
      const entrada = datos[String(img.id)] ?? {};
      for (const [tam, cfg] of Object.entries(TAMANOS)) {
        const ruta = img.por_tamano?.[tam];
        if (!ruta) continue;
        const clave = tam === 'large_default' ? '' : 'medio';
        const ya = clave ? entrada.medio : entrada.base ? entrada : null;
        const origen = path.join(raiz, 'public', ruta);
        if (!fs.existsSync(origen)) { faltan++; continue; }
        const carpeta = path.posix.dirname(ruta);
        const nombre = path.posix.basename(ruta).replace(/\.[a-z]+$/i, '');
        const destinoCarpeta = path.join(raiz, 'public', 'webp', carpeta);
        const base = `/webp${carpeta}/${nombre}`;
        if (ya && !rehacer && ya.anchos?.every((a) => fs.existsSync(path.join(raiz, 'public', `${base.slice(1)}-${a}.webp`)))) { saltadas++; continue; }
        fs.mkdirSync(destinoCarpeta, { recursive: true });
        const original = await sharp(origen).metadata();
        // Recorte del relleno blanco (solo si deja foto suficiente).
        let fuente = sharp(origen);
        let ancho = original.width, alto = original.height;
        try {
          const { data, info } = await sharp(origen).trim({ background: '#ffffff', threshold: UMBRAL_BLANCO }).toBuffer({ resolveWithObject: true });
          if (info.width >= original.width * MINIMO_QUE_QUEDA && info.height >= original.height * MINIMO_QUE_QUEDA && (info.width < original.width || info.height < original.height)) {
            fuente = sharp(data); ancho = info.width; alto = info.height; recortadas++;
          }
        } catch { /* foto toda blanca o rara: se deja tal cual */ }
        const anchos = [...new Set(cfg.anchos.filter((a) => a < ancho).concat([Math.min(ancho, Math.max(...cfg.anchos))]))].sort((a, b) => a - b);
        for (const a of anchos) {
          await fuente.clone().resize({ width: a, withoutEnlargement: true }).webp({ quality: CALIDAD }).toFile(path.join(destinoCarpeta, `${nombre}-${a}.webp`));
        }
        hechas += anchos.length;
        const registro = { ancho, alto, base, anchos };
        if (clave) entrada.medio = registro; else Object.assign(entrada, registro);
        datos[String(img.id)] = entrada;
      }
    }
  }
  const ordenado = {};
  for (const k of Object.keys(datos).filter((k) => k !== '_nota').sort((a, b) => Number(a) - Number(b))) ordenado[k] = datos[k];
  ordenado._nota = 'Generado por herramientas/webp.mjs al compilar (no se edita a mano, no sube a Git). Clave: id de la imagen de PrestaShop; «ancho»/«alto» son las medidas reales tras recortar el relleno blanco; «medio» es la versión para tarjetas.';
  fs.writeFileSync(ficheroDatos, JSON.stringify(ordenado, null, 2) + '\n');
  const resumen = `webp: ${hechas} ficheros nuevos (${recortadas} fotos recortadas de blanco), ${saltadas} ya existían, ${faltan} jpg sin bajar; ${Object.keys(ordenado).length - 1} imágenes en ${FICHERO_DATOS} (${((Date.now() - inicio) / 1000).toFixed(0)} s).`;
  log(resumen);
  return resumen;
}

// ---- uso desde la línea de órdenes ----
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
  const ids = args.map((a, i) => (a === '--producto' ? Number(args[i + 1]) : null)).filter(Boolean);
  if (!args.includes('--todo') && ids.length === 0) { console.log('Uso: node herramientas/webp.mjs --todo [--rehacer] | --producto <id> [--producto <id> …]'); process.exit(1); }
  await generarWebp({ idioma: arg('idioma', 'es'), ids: ids.length ? ids : null, rehacer: args.includes('--rehacer') });
}
