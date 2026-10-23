// Datos y ayudas de las plantillas del rediseño (Fase 3). Todo lo nuevo sale de src/data/rediseno/<idioma>.json;
// el resto (menú, productos, páginas) se lee del catálogo y de los bloques de la tienda vieja, como las plantillas fieles.

import { bloques, catalogo, nuevo, textoPlano, type Producto } from './catalogo';
import { absoluta, enlaceWhatsApp, plantilla } from './sitio';
import es from '../data/rediseno/es.json';

const TEXTOS: Record<string, any> = { es };

export function textosRediseno(idioma: string): any {
  return TEXTOS[idioma] ?? TEXTOS.es;
}

export interface EntradaMenu { texto: string; href: string; hijos: { texto: string; href: string }[] }

/**
 * Menú reorganizado con las categorías actuales (informe §5.3): Telas y sus familias, Mercería, Revistas y libros,
 * Nueva colección, Ofertas (= rebajados), Sobre mí y Contacto. Fuera las categorías de temporada caducadas
 * (LIQUIDACIÓN, REMATE FINAL INVIERNO 25) hasta que Yama decida (inventario §11). No hay página de «Combinaciones».
 */
export function menuRediseno(idioma: string): EntradaMenu[] {
  const b = bloques(idioma);
  const t = textosRediseno(idioma);
  const EXCLUIDOS = new Set(['category-133', 'category-135']);
  const ORDEN_TELAS = ['Tipo de tejido', 'Estampado', 'Composición'];
  const res: EntradaMenu[] = [];
  for (const m of b.menu) {
    if (EXCLUIDOS.has(m.id)) continue;
    let hijos = (m.hijos ?? []).map((h: any) => ({ texto: h.texto, href: h.href }));
    if (m.id === 'category-3') {
      const peso = (x: { texto: string }) => { const i = ORDEN_TELAS.indexOf(x.texto); return i === -1 ? 99 : i; };
      hijos = [...hijos].sort((a, b2) => peso(a) - peso(b2));
    }
    if (m.id === 'category-6' || m.id === 'category-9') hijos = []; // en el menú solo el acceso; las familias van en la propia categoría
    res.push({ texto: m.texto, href: m.href, hijos });
  }
  // Ofertas y Contacto se añaden antes de «Sobre mí» para dejar el contacto al final.
  const sobreMi = res.findIndex((x) => x.href.includes('/content/4-'));
  const ofertas = { texto: t.menu.ofertas, href: `/${idioma}/productos-rebajados`, hijos: [] };
  const contacto = { texto: t.menu.contacto, href: `/${idioma}/contactenos`, hijos: [] };
  if (sobreMi === -1) res.push(ofertas, contacto);
  else res.splice(sobreMi, 0, ofertas), res.push(contacto);
  return res;
}

/** Enlace de WhatsApp sin mensaje (cabecera, botones genéricos). */
export function whatsappGenerico(idioma: string): string {
  return `https://wa.me/${nuevo(idioma).whatsapp_numero}`;
}

/** Enlace de WhatsApp de una tela, con el mensaje de lista (nombre, referencia, URL). */
export function whatsappProducto(idioma: string, p: Producto): string {
  const n = nuevo(idioma);
  return enlaceWhatsApp(n.whatsapp_numero, plantilla(n.mensaje_lista, { nombre: p.nombre, referencia: p.referencia ?? '', url: absoluta(p.url) }));
}

/** ¿Se puede pedir? (tiene precio, está disponible para pedido y no está agotado). */
export function pedible(p: Producto): boolean {
  return p.muestra_precio && p.disponible_para_pedido && p.disponibilidad !== 'unavailable';
}

/** Texto de disponibilidad de la tienda vieja («¡AGOTADO!», «Últimas unidades en stock»); vacío si hay existencias. */
export function disponibilidad(p: Producto): { estado: 'agotado' | 'ultimas' | 'disponible' | ''; texto: string } {
  const texto = ((p as any).mensaje_disponibilidad ?? '').trim();
  const estado = p.disponibilidad === 'unavailable' ? 'agotado' : p.disponibilidad === 'last_remaining_items' ? 'ultimas' : p.disponibilidad === 'available' ? 'disponible' : '';
  return { estado, texto };
}

/** «5,00 € por metro» en las 32 fichas que lo tienen; vacío en el resto (la unidad del precio está por confirmar). */
export function precioPorUnidad(p: Producto): string {
  return p.unidad ? `${p.precio_unidad} ${p.unidad}`.trim() : '';
}

/** Foto de un producto por tamaño (home_default 253×230, medium_default 382×272, large_default 1000×750). */
export function foto(p: Producto, tam: 'home_default' | 'medium_default' | 'large_default', idioma = 'es') {
  const portada = p.imagenes.find((i) => i.portada) ?? p.imagenes[0];
  // Sin foto: la imagen «sin foto» de PrestaShop. La tienda vieja solo servía la pequeña y la grande.
  return portada ? portada.por_tamano[tam] : `/img/p/${idioma}-default-${tam === 'large_default' ? 'large_default' : 'home_default'}.jpg`;
}

/** Versiones webp (src/data/imagenes-webp.json) de una imagen, si herramientas/webp.mjs las generó. */
import webpDatos from '../data/imagenes-webp.json';
export interface Webp { ancho: number; alto: number; base: string; anchos: number[] }
export function webpDe(idImagen: number | string | undefined): Webp | undefined {
  if (idImagen == null) return undefined;
  const w = (webpDatos as Record<string, any>)[String(idImagen)];
  return w && w.base ? (w as Webp) : undefined;
}
export function srcsetWebp(w: Webp): string {
  return w.anchos.map((a) => `${w.base}-${a}.webp ${a}w`).join(', ');
}

/** Subtítulo y párrafos de «Sobre mí» (cms 4), tal cual, para el bloque de Natalia. */
export function sobreMi(idioma: string): { subtitulo: string; parrafos: string[]; href: string } {
  const c = catalogo(idioma);
  const pagina = c.cms.find((x) => x.id === 4);
  if (!pagina) return { subtitulo: '', parrafos: [], href: '' };
  const html = pagina.contenido;
  const h4 = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)].map((m) => textoPlano(m[1]).trim()).filter(Boolean);
  const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textoPlano(m[1]).trim()).filter((x) => x.length > 60);
  return { subtitulo: h4.find((x) => !/^sobre m/i.test(x)) ?? '', parrafos: ps.slice(0, 2), href: pagina.url };
}

/** Primer producto con foto de una categoría (foto grande para banners y hero de la opción 2). */
export function primeraFotoDeCategoria(idioma: string, idCategoria: number): Producto | undefined {
  const c = catalogo(idioma);
  const cat = c.categoriaPorId.get(idCategoria);
  if (!cat) return undefined;
  return c.productosDe(cat.productos).find((p) => p.imagenes.length > 0);
}

/** Primer producto con foto de una lista (más vendidos, novedades, rebajados). */
export function primeraFotoDeLista(idioma: string, tipo: string): Producto | undefined {
  const c = catalogo(idioma);
  const o = Object.values(c.otras).find((x) => x.tipo === tipo);
  return o ? c.productosDe(o.productos ?? []).find((p) => p.imagenes.length > 0) : undefined;
}

/** Las fichas «COMBINACION …» (sin precio), para «Nuestras combinaciones» de la opción 2. */
export function combinaciones(idioma: string): Producto[] {
  return catalogo(idioma).productos.filter((p) => /^COMBINACI/i.test(p.nombre) && p.imagenes.length > 0);
}

/** Descripción corta en una línea para las tarjetas de la opción 2. */
export function lineaDescripcion(p: Producto, max = 90): string {
  const s = textoPlano(p.descripcion_corta || p.descripcion || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const corte = s.lastIndexOf(' ', max);
  return s.slice(0, corte > 40 ? corte : max) + '…';
}
