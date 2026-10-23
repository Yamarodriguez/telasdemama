// Acceso al catálogo (src/data/catalogo/<idioma>/) y a los bloques fijos (src/data/bloques/<idioma>/)
// que se extrajeron de la tienda vieja. Las plantillas solo leen de aquí.

export interface Imagen {
  id: number;
  fichero: string;
  portada: boolean;
  leyenda: string;
  posicion: string;
  por_tamano: Record<string, string>;
}

export interface Producto {
  id: number;
  url: string;
  canonical: string;
  hreflang: Record<string, string>;
  nombre: string;
  referencia: string | null;
  ean13: string | null;
  link_rewrite: string;
  categoria_defecto: { id: number; slug: string; nombre: string };
  breadcrumb: { texto: string; url: string }[];
  h1: string;
  title: string;
  meta_title: string;
  meta_description: string;
  meta_description_visible: string;
  meta_keywords: string;
  muestra_precio: boolean;
  precio_visible: string;
  precio_con_iva: number;
  precio_sin_iva: number;
  tiene_descuento: boolean;
  precio_tachado: number | null;
  descuento_tipo: string | null;
  descuento_porcentaje: string | null;
  unidad: string;
  precio_unidad: string;
  stock: number;
  disponibilidad: string | null;
  cantidad_minima: number;
  disponible_para_pedido: boolean;
  en_oferta: boolean;
  nuevo: boolean;
  fabricante_id: number;
  descripcion_corta: string;
  descripcion: string;
  imagen_portada: { id: number; fichero: string } | null;
  imagenes: Imagen[];
  accesorios: { id: string; url: string; nombre: string }[];
  valoracion: { media: string; opiniones: string };
  opiniones: any[];
}

export interface Categoria {
  id: number;
  url: string;
  canonical: string;
  hreflang: Record<string, string>;
  nombre: string;
  h1: string;
  title: string;
  meta_description: string;
  meta_keywords: string;
  breadcrumb: { texto: string; url: string }[];
  padre_id: number | null;
  nivel: number;
  descripcion: string;
  imagen: string | null;
  total_productos_declarado: number | null;
  productos: string[];
  paginas: number;
}

export interface PaginaCms {
  id: number;
  url: string;
  canonical: string;
  hreflang: Record<string, string>;
  nombre: string;
  h1: string;
  title: string;
  meta_description: string;
  meta_keywords: string;
  breadcrumb: { texto: string; url: string }[];
  contenido: string;
}

export interface OtraPagina {
  tipo: string;
  url: string;
  canonical: string;
  hreflang: Record<string, string>;
  h1: string;
  titulo_visible: string;
  title: string;
  meta_description: string;
  breadcrumb: { texto: string; url: string }[];
  productos: string[];
  paginas: number;
}

export interface NodoArbol {
  id: number | null;
  nombre: string;
  href: string;
  hijos: NodoArbol[];
}

const ficherosCatalogo = import.meta.glob('../data/catalogo/*/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const ficherosBloques = import.meta.glob('../data/bloques/*/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const ficherosTextos = import.meta.glob('../data/textos/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const ficherosNuevo = import.meta.glob('../data/nuevo/*.json', { eager: true, import: 'default' }) as Record<string, any>;

function leer(mapa: Record<string, any>, patron: RegExp): Record<string, Record<string, any>> {
  const res: Record<string, Record<string, any>> = {};
  for (const [ruta, datos] of Object.entries(mapa)) {
    const m = ruta.match(patron);
    if (!m) continue;
    (res[m[1]] ??= {})[m[2]] = datos;
  }
  return res;
}

const CATALOGO = leer(ficherosCatalogo, /catalogo\/([a-z]{2})\/([a-z-]+)\.json$/);
const BLOQUES = leer(ficherosBloques, /bloques\/([a-z]{2})\/([a-z-]+)\.json$/);
const TEXTOS = leer(ficherosTextos, /textos\/([a-z]{2})()\.json$/);
const NUEVO = leer(ficherosNuevo, /nuevo\/([a-z]{2})()\.json$/);

/** Idiomas con catálogo completo (productos + bloques). Hoy solo `es`; los demás llegan de la Fase 1. */
export function idiomas(): string[] {
  return Object.keys(CATALOGO).filter((i) => CATALOGO[i].productos && BLOQUES[i]?.menu && TEXTOS[i]);
}

export const PRODUCTOS_POR_PAGINA = 12;

/** La portada de un idioma es /es/ (con barra), como en la tienda vieja; el extractor la guardó sin ella. */
function conBarraPortada(url: string): string {
  return /^\/[a-z]{2}$/.test(url) ? url + '/' : url;
}
function arreglarMigas<T extends { breadcrumb?: { texto: string; url: string }[] }>(x: T): T {
  if (x.breadcrumb) for (const m of x.breadcrumb) m.url = conBarraPortada(m.url);
  return x;
}

const arreglados = new Set<string>();

export function catalogo(idioma: string) {
  const c = CATALOGO[idioma];
  if (!c) throw new Error(`No hay catálogo para el idioma ${idioma}`);
  if (!arreglados.has(idioma)) {
    arreglados.add(idioma);
    for (const lista of [c.productos, c.categorias, c.cms, Object.values(c.otras ?? {})]) for (const x of lista as any[]) arreglarMigas(x);
    for (const o of Object.values(c.otras ?? {}) as any[]) o.url = conBarraPortada(o.url);
  }
  const productos = c.productos as Producto[];
  const categorias = c.categorias as Categoria[];
  const porId = new Map<number, Producto>(productos.map((p) => [p.id, p]));
  const categoriaPorId = new Map<number, Categoria>(categorias.map((x) => [x.id, x]));
  return {
    productos,
    categorias,
    cms: c.cms as PaginaCms[],
    otras: c.otras as Record<string, OtraPagina>,
    redirecciones: (c.redirecciones ?? {}) as Record<string, string>,
    porId,
    categoriaPorId,
    /** Productos a partir de una lista de ids (texto o número), en ese orden; los que no existen se saltan. */
    productosDe(ids: (string | number)[]): Producto[] {
      return ids.map((i) => porId.get(Number(i))).filter((p): p is Producto => Boolean(p));
    },
    /** Marca (fabricante) por id, a partir de su página /brand/{id}-{nombre}. */
    marcaPorId(id: number): { id: number; url: string; nombre: string } | undefined {
      for (const [url, o] of Object.entries(c.otras as Record<string, OtraPagina>)) {
        const m = url.match(/\/brand\/(\d+)-/);
        if (m && Number(m[1]) === id) return { id, url, nombre: o.h1 || o.titulo_visible || o.title };
      }
      return undefined;
    },
  };
}

export function bloques(idioma: string) {
  const b = BLOQUES[idioma];
  if (!b) throw new Error(`No hay bloques para el idioma ${idioma} (pasa herramientas/extraer-bloques.py)`);
  return {
    menu: b.menu as any[],
    cabecera: b.cabecera,
    pie: b.pie,
    arbol: b['arbol-categorias'] as NodoArbol[],
    laterales: b.laterales as { bloques: { titulo: string; productos: number[] }[]; revi_vertical: boolean },
    portada: b.portada,
    revi: (b['revi-miniaturas'] ?? {}) as Record<string, { estrellas: number[]; texto: string } | null>,
    etiquetas: (b.etiquetas ?? {}) as Record<string, { miniatura?: { clase: string; texto: string }[]; ficha?: { clase: string; texto: string }[] }>,
    fichasExtra: (b['fichas-extra'] ?? {}) as Record<string, any>,
    facetas: (b.facetas ?? {}) as Record<string, any>,
    ordenes: (b.ordenes ?? {}) as Record<string, string>,
    marcas: (b.marcas ?? {}) as Record<string, { descripcion_corta_html: string; descripcion_html: string }>,
    tiendas: b.tiendas,
    contacto: b.contacto,
    mapa: b['mapa-del-sitio'],
  };
}

export function textos(idioma: string): Record<string, any> {
  const t = TEXTOS[idioma]?.[''];
  if (!t) throw new Error(`Faltan los textos de interfaz de ${idioma} (src/data/textos/${idioma}.json)`);
  return t;
}

export function nuevo(idioma: string): Record<string, any> {
  const n = NUEVO[idioma]?.[''];
  if (!n) throw new Error(`Faltan los textos nuevos de ${idioma} (src/data/nuevo/${idioma}.json)`);
  return n;
}

/** Busca un nodo del árbol de categorías por id. */
export function nodoArbol(arbol: NodoArbol[], id: number): NodoArbol | null {
  for (const n of arbol) {
    if (n.id === id) return n;
    const h = nodoArbol(n.hijos, id);
    if (h) return h;
  }
  return null;
}

/** Trozos de 12 (lo que muestra PrestaShop por página). */
export function paginar<T>(items: T[], porPagina = PRODUCTOS_POR_PAGINA): T[][] {
  const paginas: T[][] = [];
  for (let i = 0; i < items.length; i += porPagina) paginas.push(items.slice(i, i + porPagina));
  return paginas.length ? paginas : [[]];
}

/** URL pública de la página n de un listado: la 1 es la propia; las demás, /pagina/n. */
export function urlPagina(base: string, n: number): string {
  return n <= 1 ? base : `${base}/pagina/${n}`;
}

/** Quita las etiquetas HTML dejando el texto (con los saltos de línea del original) y decodifica entidades básicas. */
export function textoPlano(html: string, recortar = true): string {
  const s = (html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  return recortar ? s.trim() : s;
}

/**
 * Recorte como el `truncate` de Smarty (longitud 150, sin partir palabras, con «...»),
 * que es lo que hace la plantilla de la miniatura con la descripción.
 */
export function truncarSmarty(texto: string, longitud = 150, etc = '...'): string {
  if (texto.length <= longitud) return texto;
  const l = longitud - etc.length;
  const corte = texto.slice(0, l + 1).replace(/\s+?(\S+)?$/, '');
  return corte.slice(0, l) + etc;
}

/** Decodifica las entidades HTML básicas de un texto ya recortado. */
export function decodificarEntidades(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/**
 * Texto de la miniatura: PrestaShop quita las etiquetas de la descripción y recorta a 150 caracteres.
 * Las entidades escritas en el texto (p. ej. «&nbsp;») se quedan tal cual, como en la tienda vieja,
 * donde salían escapadas (se ve literalmente «&nbsp;»). No se decodifican.
 */
export function descripcionMiniatura(html: string): string {
  const sinEtiquetas = (html ?? '').replace(/<[^>]+>/g, '');
  return truncarSmarty(sinEtiquetas).trim();
}

/**
 * Alt de una foto de producto: la leyenda real de la imagen, tomada de la ficha de la tienda vieja
 * (src/data/bloques/<idioma>/fichas-extra.json → leyendas). Si no consta, vacío.
 */
export function altImagen(leyendas: Record<string, string> | undefined, idImagen: number | undefined): string {
  if (!leyendas || idImagen == null) return '';
  return leyendas[String(idImagen)] ?? '';
}

/** Número como lo escribe PrestaShop en `content="…"`: 13 → "13", 2.5 → "2.5". */
export function numeroPlano(n: number | null | undefined): string {
  return n == null ? '' : String(Number(n));
}

/** Precio con formato de la tienda: 1234.5 → "1.234,50 €" (espacio duro antes del símbolo). */
export function formatoPrecio(n: number): string {
  const [entero, dec] = Number(n).toFixed(2).split('.');
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
}

/** «Hay N productos.» según el idioma. */
export function contadorProductos(t: Record<string, any>, n: number): string {
  if (n === 0) return '';
  if (n === 1) return t.hay_producto;
  return String(t.hay_productos).replace('{n}', String(n));
}

/** Clases del body que PrestaShop añade a todas las páginas de un idioma. */
export function clasesBase(idioma: string, t: Record<string, any>): string[] {
  return [`lang-${idioma}`, `country-${t.pais}`, `currency-${String(t.moneda.iso_code).toLowerCase()}`];
}
