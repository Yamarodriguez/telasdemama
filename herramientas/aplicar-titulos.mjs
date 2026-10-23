// aplicar-titulos.mjs — enseña qué títulos (<title>) y H1 cambian con las reglas aprobadas de
// src/data/reglas-contenido/<idioma>.json, con recuento y ejemplos. Las reglas las aplican las
// plantillas al compilar (src/lib/reglas-titulos.mjs); este script es la pasada en seco que pide
// el método (A3.2) para ver el efecto antes de dar el cambio por bueno.
//
// Uso: node herramientas/aplicar-titulos.mjs [--idioma es] [--seco] [--ejemplos 5]
//   --seco (por defecto): no escribe nada, solo informa (informes/titulos-<idioma>.md)

import fs from 'node:fs';
import { tituloCategoria, h1Categoria, tituloProducto, tituloPortada, h1Portada, reglasDe } from '../src/lib/reglas-titulos.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const IDIOMA = arg('idioma', 'es');
const EJEMPLOS = Number(arg('ejemplos', 5));
const dir = `src/data/catalogo/${IDIOMA}`;
const leer = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}.json`, 'utf8'));
const categorias = leer('categorias');
const productos = leer('productos');
const otras = leer('otras');
const porId = new Map(categorias.map((c) => [c.id, c]));
const reglas = reglasDe(IDIOMA);
if (!reglas) { console.log(`No hay reglas para ${IDIOMA} (src/data/reglas-contenido/${IDIOMA}.json).`); process.exit(0); }

const cambios = { portada: [], categorias_title: [], categorias_h1: [], fichas_title: [] };
const portada = otras[`/${IDIOMA}`] ?? otras[`/${IDIOMA}/`];
if (portada && tituloPortada(IDIOMA, portada.title) !== portada.title) cambios.portada.push({ de: portada.title, a: tituloPortada(IDIOMA, portada.title) });
for (const c of categorias) {
  const t = tituloCategoria(IDIOMA, c, porId);
  if (t !== c.title) cambios.categorias_title.push({ url: c.url, de: c.title, a: t });
  const h = h1Categoria(IDIOMA, c);
  if (h !== (c.h1 || c.nombre)) cambios.categorias_h1.push({ url: c.url, de: c.h1 || c.nombre, a: h });
}
for (const p of productos) {
  const actual = p.meta_title || p.title || p.nombre;
  const t = tituloProducto(IDIOMA, p);
  if (t !== actual) cambios.fichas_title.push({ url: p.url, de: actual, a: t });
}

const L = [`# Títulos aprobados (${IDIOMA}) — pasada en seco ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '', `Aprobado: ${reglas.titulos.aprobado}`, ''];
const seccion = (titulo, lista) => {
  L.push(`## ${titulo}: ${lista.length} páginas`, '');
  for (const x of lista.slice(0, EJEMPLOS)) L.push(`- ${x.url ?? '/' + IDIOMA + '/'}: «${x.de}» → «${x.a}»`);
  if (lista.length > EJEMPLOS) L.push(`- … y ${lista.length - EJEMPLOS} más`);
  L.push('');
};
seccion('Portada: title', cambios.portada);
L.push(`H1 de portada para el rediseño: «${h1Portada(IDIOMA) ?? '(sin regla)'}» (en la copia fiel el H1 sigue siendo el logotipo)`, '');
seccion('Categorías: title', cambios.categorias_title);
seccion('Categorías: H1', cambios.categorias_h1);
seccion('Fichas: title', cambios.fichas_title);
L.push(`Sin cambio: ${categorias.length - cambios.categorias_title.length} títulos de categoría y ${productos.length - cambios.fichas_title.length} de ficha (ya tenían título propio o no les toca).`);
fs.mkdirSync('informes', { recursive: true });
fs.writeFileSync(`informes/titulos-${IDIOMA}.md`, L.join('\n') + '\n');
console.log(L.join('\n'));
