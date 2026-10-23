// Datos fijos de la web y decisiones que afectan a todas las páginas.

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
