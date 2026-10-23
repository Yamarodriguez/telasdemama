// Reglas de títulos aprobadas (src/data/reglas-contenido/<idioma>.json), en un módulo que usan por igual
// las plantillas de Astro, la herramienta aplicar-titulos.mjs y las comprobaciones. Así el cambio de
// contenido se aplica y se comprueba desde el mismo sitio.

import fs from 'node:fs';
import path from 'node:path';

const cache = new Map();

/** Reglas del idioma, o null si no hay fichero. */
export function reglasDe(idioma, raiz = process.cwd()) {
  if (!cache.has(idioma)) {
    const f = path.join(raiz, 'src', 'data', 'reglas-contenido', `${idioma}.json`);
    cache.set(idioma, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  }
  return cache.get(idioma);
}

function limpio(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** ¿La categoría cuelga (a cualquier nivel) de la categoría `raizId`? */
export function cuelgaDe(categoria, raizId, categoriaPorId) {
  let c = categoria;
  for (let i = 0; c && i < 20; i++) {
    if (c.id === raizId) return true;
    c = c.padre_id != null ? categoriaPorId.get(c.padre_id) : null;
  }
  return false;
}

/** Title de una categoría tras las reglas (el original si no hay regla que aplique). */
export function tituloCategoria(idioma, categoria, categoriaPorId) {
  const r = reglasDe(idioma)?.titulos;
  if (!r) return categoria.title;
  const propio = r.categorias?.[String(categoria.id)]?.title;
  if (propio) return propio;
  if (limpio(categoria.title) !== limpio(categoria.nombre)) return categoria.title; // título a medida de la tienda: no se pisa
  const p = r.patron_categoria_sin_titulo_propio;
  if (!p) return categoria.title;
  const patron = cuelgaDe(categoria, 3, categoriaPorId) ? p.bajo_telas : cuelgaDe(categoria, 6, categoriaPorId) ? p.bajo_merceria : p.resto;
  return patron ? patron.replace('{nombre}', limpio(categoria.nombre)) : categoria.title;
}

/** H1 de una categoría tras las reglas. */
export function h1Categoria(idioma, categoria) {
  const r = reglasDe(idioma)?.titulos;
  return r?.categorias?.[String(categoria.id)]?.h1 ?? categoria.h1 ?? categoria.nombre;
}

/** Title de una ficha tras las reglas. */
export function tituloProducto(idioma, producto) {
  const r = reglasDe(idioma)?.titulos?.patron_ficha_sin_titulo_propio?.patron;
  const actual = producto.meta_title || producto.title || producto.nombre;
  if (!r || limpio(actual) !== limpio(producto.nombre)) return actual;
  return r.replace('{nombre}', limpio(producto.nombre));
}

/** Title de la portada tras las reglas. */
export function tituloPortada(idioma, actual) {
  return reglasDe(idioma)?.titulos?.portada?.title ?? actual;
}

/** H1 de la portada para el rediseño (en la copia fiel el H1 es el logotipo). */
export function h1Portada(idioma) {
  return reglasDe(idioma)?.titulos?.portada?.h1 ?? null;
}
