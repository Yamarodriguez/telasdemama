// El objeto `prestashop` que el JavaScript del tema (core.js, theme.js) espera encontrar en la página.
// Se reproduce con los mismos campos que escribía la tienda vieja, pero fijo: sin carrito, sin cliente,
// sin tokens de sesión. Lo que dependía del servidor queda vacío a propósito.

import { DOMINIO } from './sitio';

export interface DatosPagina {
  idioma: string;
  tipo: string; // page_name de PrestaShop: index, category, product, cms…
  layout: string;
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  urlActual: string;
  hreflang: Record<string, string>;
  migas: { texto: string; url: string }[];
  clasesBody: string[];
}

export function objetoPrestashop(d: DatosPagina, t: Record<string, any>, cabecera: any) {
  const base = DOMINIO + '/';
  const pages: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.rutas as Record<string, string>)) pages[k] = DOMINIO + v;
  const bodyClasses: Record<string, boolean> = { [`lang-${d.idioma}`]: true, 'lang-rtl': false, [`country-${String(t.pais).toUpperCase()}`]: true, [`currency-${t.moneda.iso_code}`]: true, [d.layout]: true, [`page-${d.tipo}`]: true, 'tax-display-enabled': true };
  for (const c of d.clasesBody) bodyClasses[c] = true;
  const sinFoto = (tam: string, w: number, h: number) => ({ url: `${DOMINIO}/img/p/${d.idioma}-default-${tam}.jpg`, width: w, height: h });
  return {
    cart: {
      products: [],
      totals: { total: { type: 'total', label: 'Total', amount: 0, value: '0,00 €' } },
      subtotals: { products: { type: 'products', label: 'Subtotal', amount: 0, value: '0,00 €' }, discounts: null, shipping: null, tax: null },
      products_count: 0,
      summary_string: '',
      vouchers: { allowed: 0, added: [] },
      discounts: [],
      minimalPurchase: 0,
      minimalPurchaseRequired: '',
    },
    currency: t.moneda,
    customer: { is_logged: false, addresses: [] },
    language: t.idioma,
    page: {
      title: '',
      canonical: d.canonical || null,
      meta: { title: d.title, description: d.description, keywords: d.keywords, robots: 'index' },
      page_name: d.tipo,
      body_classes: bodyClasses,
      admin_notifications: [],
    },
    shop: { name: cabecera.logo.alt, logo: cabecera.logo.src, stores_icon: '/img/logo_stores.png', favicon: '/img/favicon.ico' },
    urls: {
      base_url: base,
      current_url: DOMINIO + d.urlActual,
      shop_domain_url: DOMINIO,
      img_ps_url: `${base}img/`,
      img_cat_url: `${base}img/c/`,
      img_lang_url: `${base}img/l/`,
      img_prod_url: `${base}img/p/`,
      img_manu_url: `${base}img/m/`,
      img_sup_url: `${base}img/su/`,
      img_ship_url: `${base}img/s/`,
      img_store_url: `${base}img/st/`,
      img_col_url: `${base}img/co/`,
      img_url: `${base}themes/cosmetics_th/assets/img/`,
      css_url: `${base}themes/cosmetics_th/assets/css/`,
      js_url: `${base}themes/cosmetics_th/assets/js/`,
      pic_url: `${base}upload/`,
      pages,
      alternative_langs: d.hreflang,
      theme_assets: '/themes/cosmetics_th/assets/',
      actions: { logout: '' },
      no_picture_image: {
        bySize: { small_default: sinFoto('small_default', 98, 98), cart_default: sinFoto('cart_default', 125, 125), home_default: sinFoto('home_default', 253, 230), medium_default: sinFoto('medium_default', 382, 272), large_default: sinFoto('large_default', 1000, 750) },
        small: sinFoto('small_default', 98, 98),
        medium: sinFoto('home_default', 253, 230),
        large: sinFoto('large_default', 1000, 750),
        legend: '',
      },
    },
    configuration: { display_taxes_label: true, display_prices_tax_incl: true, is_catalog: true, show_prices: true, opt_in: { partner: false }, quantity_discount: { type: 'discount', label: 'Descuento' }, voucher_enabled: 0, return_enabled: 0 },
    field_required: [],
    breadcrumb: { links: d.migas.map((m) => ({ title: m.texto, url: DOMINIO + m.url })), count: d.migas.length },
    link: { protocol_link: 'https://', protocol_content: 'https://' },
    time: 0,
    static_token: '',
    token: '',
  };
}
