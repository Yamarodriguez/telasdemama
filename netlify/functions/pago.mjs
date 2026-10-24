// pago.mjs — función de Netlify que crea la sesión de pago con tarjeta (Stripe Checkout) de un pedido por centímetros.
//
// Entra:  POST /.netlify/functions/pago   {"id": 1091, "cm": 150}
// Sale:   {"url": "https://checkout.stripe.com/…"}  (el navegador redirige ahí)  o  {"error": "…"} con el código HTTP que toque.
//
// Reglas:
//  - El importe NO viene del navegador: se recalcula aquí con el precio del catálogo (netlify/functions/precios-pago.mjs,
//    que genera herramientas/precios-pago.mjs en cada compilación) × centímetros ÷ PRECIO_BASE_CM.
//  - Solo se cobra el género: los gastos de envío no se añaden (no hay tarifas definidas en la web; envío gratis en
//    Península desde 50 €, el resto se acuerda por WhatsApp). Pendiente de Yama.
//  - La clave secreta de Stripe va en la variable de entorno STRIPE_SECRET_KEY de Netlify (nunca en el repositorio).
//    Con una clave de pruebas (sk_test_…) no se cobra nada: se prueba con la tarjeta 4242 4242 4242 4242.
//  - Los datos del cliente (dirección, teléfono) los recoge y guarda Stripe; esta web no guarda nada.
//  - Sin la clave, devuelve 503 y la ficha avisa de que se pida por WhatsApp.

import precios from './precios-pago.mjs';

/** A cuántos centímetros corresponde el precio de la ficha (100 = el precio es por metro). Igual que nuevo/es.json → precio_base_cm. */
const PRECIO_BASE_CM = 100;
/** Máximo de centímetros por pedido online (10 m); más, por WhatsApp. Pendiente de confirmar por Yama. */
const MAXIMO_CM = 1000;
/** Países a los que se envía desde la web (Península). Pendiente de confirmar por Yama. */
const PAISES = ['ES', 'PT'];
/** Stripe no cobra menos de 0,50 €. */
const MINIMO_CENTIMOS = 50;

const json = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Importe en céntimos de euro para `cm` centímetros de una tela de `precio` € (con IVA) cada PRECIO_BASE_CM cm. */
export function importeCentimos(precio, cm) {
  return Math.round((precio * cm / PRECIO_BASE_CM) * 100);
}

export default async (req, contexto) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let datos;
  try { datos = await req.json(); } catch { return json({ error: 'Pedido ilegible' }, 400); }

  const id = String(datos?.id ?? '');
  const cm = Number(datos?.cm);
  const ficha = precios.productos[id];
  if (!ficha) return json({ error: 'Tela no encontrada' }, 404);
  if (!ficha.pedible) return json({ error: 'Esta tela no se puede pedir ahora' }, 409);
  if (!Number.isInteger(cm) || cm < ficha.minimo_cm || cm > MAXIMO_CM) {
    return json({ error: `Los centímetros tienen que ser un número entero entre ${ficha.minimo_cm} y ${MAXIMO_CM}` }, 400);
  }
  const centimos = importeCentimos(ficha.precio, cm);
  if (centimos < MINIMO_CENTIMOS) return json({ error: 'El importe es demasiado pequeño para pagarlo con tarjeta' }, 400);

  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) return json({ error: 'El pago con tarjeta no está activado todavía' }, 503);

  const euros = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
  const cuerpo = new URLSearchParams();
  cuerpo.set('mode', 'payment');
  cuerpo.set('locale', 'es');
  // Las direcciones de vuelta usan el mismo sitio desde el que se pide (la web de pruebas o telasdemama.com).
  const origen = new URL(req.url).origin;
  cuerpo.set('success_url', `${origen}/pago-correcto`);
  cuerpo.set('cancel_url', `${origen}${ficha.url}`);
  cuerpo.set('line_items[0][quantity]', '1');
  cuerpo.set('line_items[0][price_data][currency]', 'eur');
  cuerpo.set('line_items[0][price_data][unit_amount]', String(centimos));
  cuerpo.set('line_items[0][price_data][product_data][name]', `${ficha.nombre} · ${cm} cm`);
  if (ficha.referencia) cuerpo.set('line_items[0][price_data][product_data][description]', `Ref. ${ficha.referencia}`);
  PAISES.forEach((p, k) => cuerpo.set(`shipping_address_collection[allowed_countries][${k}]`, p));
  cuerpo.set('phone_number_collection[enabled]', 'true');
  cuerpo.set('metadata[id_producto]', id);
  cuerpo.set('metadata[referencia]', ficha.referencia);
  cuerpo.set('metadata[centimetros]', String(cm));
  cuerpo.set('payment_intent_data[description]', `${ficha.nombre} · ${cm} cm (${euros(centimos)})`);
  cuerpo.set('custom_text[submit][message]', `Telas de Mamá · ${cm} cm de ${ficha.nombre}. Los gastos de envío, si los hay, se acuerdan por WhatsApp.`);

  let respuesta;
  try {
    respuesta = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
    });
  } catch {
    return json({ error: 'No se pudo contactar con el servicio de pago' }, 502);
  }
  const sesion = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !sesion.url) {
    console.error('Stripe rechazó la sesión:', respuesta.status, sesion?.error?.message ?? '');
    return json({ error: 'El servicio de pago no ha aceptado el pedido' }, 502);
  }
  return json({ url: sesion.url });
};

export const config = { path: '/.netlify/functions/pago' };
