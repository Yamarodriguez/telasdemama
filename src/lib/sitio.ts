// Datos fijos de la web y decisiones que afectan a todas las páginas.

import rediseno from '../data/rediseno.json';

/** Dominio público (canonical, hreflang, og:url). Sin barra final. */
export const DOMINIO = 'https://telasdemama.com';

/** Etiquetas de seguimiento de la tienda vieja. Se mantienen tal cual (Fase 7: consentimiento de cookies). */
export const SEGUIMIENTO = {
  activo: true,
  gtm: 'GTM-KTP52S5',
  ads: 'AW-388689405',
  ga4: 'G-8H0YS98F5Q',
  metricool: '496d96d709dc30015522103497570877',
};

/** Cuenta de Revi (opiniones), widget externo que sigue funcionando en estático. */
export const REVI = { cuenta: '5f9170edaac41', tienda: '99' };

/**
 * Scripts de módulos que dependían del servidor de PrestaShop (carrito, buscador por AJAX,
 * boletín, alertas de stock, captcha, Facebook, contra reembolso, precio por medida, filtros).
 * No se cargan: en estático solo darían errores. El JavaScript del tema sí se carga igual.
 */
const SCRIPTS_EXCLUIDOS = [
  '/modules/ps_shoppingcart/',
  '/modules/ps_searchbar/',
  '/modules/ps_emailsubscription/',
  '/modules/ps_emailalerts/',
  '/modules/eicaptcha/',
  '/modules/ps_facebook/',
  '/modules/codwfeeplus/',
  '/modules/productpricebysize/',
  '/modules/ps_facetedsearch/',
  '/modules/productcomments/views/js/list-comments.js',
  '/modules/productcomments/views/js/post-comment.js',
];

export function scriptPermitido(ruta: string): boolean {
  return !SCRIPTS_EXCLUIDOS.some((x) => ruta.includes(x));
}

/** Convierte una ruta relativa a la raíz en absoluta con el dominio público. */
export function absoluta(ruta: string): string {
  if (!ruta) return ruta;
  if (/^https?:\/\//.test(ruta)) return ruta;
  return DOMINIO + (ruta.startsWith('/') ? ruta : '/' + ruta);
}

/** Enlace de WhatsApp con el mensaje ya escrito. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Rellena {campo} en una plantilla de texto. */
export function plantilla(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => String(valores[k] ?? ''));
}

/**
 * Interruptor del rediseño (Fase 3, Dec. 4): src/data/rediseno.json. Apagado, la web es la copia fiel.
 * Encendido, solo las páginas de la lista cargan la hoja del rediseño y sus añadidos.
 * REDISENO=1 / REDISENO=0 y REDISENO_OPCION=a|b|c en el entorno mandan sobre el fichero (para compilar
 * las opciones en imagen sin editar nada).
 */
const envActivo = process.env.REDISENO;
export const REDISENO = {
  activo: envActivo === '1' ? true : envActivo === '0' ? false : Boolean(rediseno.activo),
  opcion: process.env.REDISENO_OPCION || rediseno.opcion || '1',
  /** Idiomas con el rediseño en TODAS sus páginas (los demás siguen como copia fiel). */
  idiomas: ((rediseno as any).idiomas ?? []) as string[],
  /** Páginas sueltas con el rediseño (y muestra para las capturas). */
  paginas: rediseno.paginas as string[],
};

/** ¿Esta página (ruta sin dominio, como /es/3-telas) lleva el rediseño? */
export function redisenoActivo(url: string): boolean {
  if (!REDISENO.activo || !url) return false;
  const u = decodeURIComponent(url).replace(/\/$/, '') || '/';
  const idioma = u.match(/^\/([a-z]{2})(\/|$)/)?.[1];
  if (idioma && REDISENO.idiomas.includes(idioma)) return true;
  return REDISENO.paginas.some((p) => (decodeURIComponent(p).replace(/\/$/, '') || '/') === u);
}
