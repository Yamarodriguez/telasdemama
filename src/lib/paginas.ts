// Describe cada página de listado (categorías, más vendidos, novedades, rebajados, marcas) para que
// las rutas de Astro compartan la misma información: productos, paginación, metadatos y columna izquierda.

import { catalogo, bloques, nodoArbol, paginar, type NodoArbol, type Producto } from './catalogo';

export interface Listado {
  /** Tramo de la URL tras /idioma/ (p. ej. «3-telas», «mas-vendidos», «brand/1-telasdemama»). */
  slug: string;
  base: string;
  tipo: 'category' | 'best-sales' | 'new-products' | 'prices-drop' | 'manufacturer';
  layout: 'layout-left-column';
  titulo: string;
  h1: string;
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  hreflang: Record<string, string>;
  migas: { texto: string; url: string }[];
  clasesBody: string[];
  /** id del <li> del menú principal que PrestaShop marca como «current» en esta página. */
  menuActual: string;
  productos: Producto[];
  paginas: number;
  raiz: NodoArbol;
  facetas?: any;
  /** Texto del orden por defecto que mostraba la tienda («Relevancia», «Ventas en orden decreciente»…). */
  orden?: string;
}

const TIPOS_OTRAS: Record<string, Listado['tipo']> = { 'best-sales': 'best-sales', 'new-products': 'new-products', 'prices-drop': 'prices-drop', manufacturer: 'manufacturer' };

export function listados(idioma: string): Listado[] {
  const c = catalogo(idioma);
  const b = bloques(idioma);
  const raizInicio = b.arbol[0];
  const res: Listado[] = [];

  for (const cat of c.categorias) {
    const slug = cat.url.replace(`/${idioma}/`, '');
    const productos = c.productosDe(cat.productos);
    const extra = b.facetas[String(cat.id)] ?? {};
    res.push({
      slug,
      base: cat.url,
      tipo: 'category',
      layout: 'layout-left-column',
      titulo: cat.h1 || cat.nombre,
      h1: cat.h1 || cat.nombre,
      title: cat.title,
      description: cat.meta_description,
      keywords: cat.meta_keywords,
      canonical: cat.canonical,
      hreflang: cat.hreflang,
      migas: cat.breadcrumb,
      clasesBody: [`category-id-${cat.id}`, extra.clase_body ?? `category-${slug.replace(/^\d+-/, '')}`, `category-id-parent-${cat.padre_id ?? 0}`, `category-depth-level-${cat.nivel}`],
      menuActual: `category-${cat.id}`,
      productos,
      paginas: paginar(productos).length,
      raiz: nodoArbol(b.arbol, cat.id) ?? raizInicio,
      facetas: extra,
      orden: typeof extra.orden === 'string' ? extra.orden : undefined,
    });
  }

  for (const [url, o] of Object.entries(c.otras)) {
    const tipo = TIPOS_OTRAS[o.tipo];
    if (!tipo || url === `/${idioma}/brands`) continue; // la lista de marcas tiene su propia plantilla
    const productos = c.productosDe(o.productos ?? []);
    res.push({
      slug: decodeURIComponent(url.replace(`/${idioma}/`, '')),
      base: decodeURIComponent(url),
      tipo,
      layout: 'layout-left-column',
      titulo: o.titulo_visible || o.h1 || o.title,
      h1: o.h1,
      title: o.title,
      description: o.meta_description,
      keywords: '',
      canonical: o.canonical,
      hreflang: o.hreflang,
      migas: o.breadcrumb,
      clasesBody: [],
      menuActual: '',
      productos,
      paginas: paginar(productos).length,
      raiz: raizInicio,
      orden: typeof b.ordenes[tipo] === 'string' ? b.ordenes[tipo] : undefined,
    });
  }
  return res;
}

/** Páginas sueltas (contacto, tienda, mapa, marcas, proveedores) con sus metadatos. */
export function paginaSuelta(idioma: string, url: string) {
  const o = catalogo(idioma).otras[url];
  if (!o) throw new Error(`No hay datos para ${url}`);
  return o;
}
