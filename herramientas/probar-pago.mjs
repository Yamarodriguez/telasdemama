// probar-pago.mjs — prueba la función de pago (netlify/functions/pago.mjs) SIN llamar a Stripe: cambia `fetch` por
// uno falso, así que no gasta nada ni necesita claves. Comprueba el importe recalculado en el servidor, los límites
// de centímetros, las telas que no se pueden pedir y la respuesta sin clave.
//
// Uso: node herramientas/precios-pago.mjs && node herramientas/probar-pago.mjs      (sale con código 1 si algo falla)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!fs.existsSync('netlify/functions/precios-pago.mjs')) { console.log('Falta netlify/functions/precios-pago.mjs: pasa antes node herramientas/precios-pago.mjs'); process.exit(1); }
const { default: pago, importeCentimos } = await import(pathToFileURL(path.resolve('netlify/functions/pago.mjs')).href);
const tabla = (await import(pathToFileURL(path.resolve('netlify/functions/precios-pago.mjs')).href)).default.productos;

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'bien ' : 'FALLA'}  ${msg}`); if (!cond) fallos++; };
const llamar = (cuerpo, metodo = 'POST') => pago(new Request('https://x/.netlify/functions/pago', { method: metodo, body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined }));
const leer = async (r) => ({ estado: r.status, cuerpo: await r.json() });

// Stripe falso: guarda lo que le llega y devuelve una dirección de pago.
let recibido = null;
globalThis.fetch = async (url, init) => { recibido = { url, cabeceras: init.headers, cuerpo: new URLSearchParams(init.body) }; return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/prueba' }), { status: 200 }); };

const id = Object.keys(tabla).find((k) => tabla[k].pedible && tabla[k].precio === 13) ?? Object.keys(tabla).find((k) => tabla[k].pedible);
const precio = tabla[id].precio;
const sinPrecio = Object.keys(tabla).find((k) => !tabla[k].pedible);

delete process.env.STRIPE_SECRET_KEY;
let r = await leer(await llamar({ id, cm: 100 }));
ok(r.estado === 503, 'sin clave de Stripe responde 503 y no llama a Stripe');
ok(recibido === null, 'sin clave no se contacta con Stripe');

process.env.STRIPE_SECRET_KEY = 'sk_test_falsa';
r = await leer(await llamar({ id, cm: 150 }));
const esperado = Math.round(precio * 150 / 100 * 100);
ok(r.estado === 200 && r.cuerpo.url.startsWith('https://checkout.stripe.com/'), `150 cm de la tela ${id} (${precio} €) → 200 con dirección de pago`);
ok(Number(recibido.cuerpo.get('line_items[0][price_data][unit_amount]')) === esperado, `importe enviado a Stripe = ${esperado} céntimos (${precio} € × 150 cm ÷ 100)`);
ok(recibido.cuerpo.get('line_items[0][price_data][currency]') === 'eur', 'moneda euro');
ok(recibido.cuerpo.get('success_url') === 'https://x/pago-correcto' && recibido.cuerpo.get('cancel_url') === `https://x${tabla[id].url}`, 'vuelve a la misma web: /pago-correcto si paga, la ficha si cancela');
ok(recibido.cabeceras.Authorization === 'Bearer sk_test_falsa', 'usa la clave de la variable de entorno');
ok(recibido.cuerpo.get('metadata[centimetros]') === '150' && recibido.cuerpo.get('metadata[id_producto]') === id, 'guarda el id y los centímetros en el pago');
ok(importeCentimos(13, 100) === 1300 && importeCentimos(13, 150) === 1950 && importeCentimos(1.95, 33) === 64, 'cálculo: 13 € a 100 cm = 1300; 150 cm = 1950; 1,95 € a 33 cm = 64 céntimos');

// El navegador no puede imponer el precio.
recibido = null;
r = await leer(await llamar({ id, cm: 150, precio: 0.01, importe: 1 }));
ok(Number(recibido.cuerpo.get('line_items[0][price_data][unit_amount]')) === esperado, 'ignora un precio o importe que mande el navegador');

for (const [cm, nombre] of [[0, '0 cm'], [-5, 'negativos'], [12.5, 'decimales'], ['abc', 'texto'], [1001, 'más de 1000 cm'], [null, 'sin cm']]) {
  r = await leer(await llamar({ id, cm }));
  ok(r.estado === 400, `${nombre} → 400`);
}
r = await leer(await llamar({ id: '99999999', cm: 100 }));
ok(r.estado === 404, 'tela que no existe → 404');
if (sinPrecio) { r = await leer(await llamar({ id: sinPrecio, cm: 100 })); ok(r.estado === 409, `tela que no se puede pedir (${sinPrecio}) → 409`); }
r = await leer(await llamar(null, 'GET'));
ok(r.estado === 405, 'GET → 405');
globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'x' } }), { status: 400 });
r = await leer(await llamar({ id, cm: 100 }));
ok(r.estado === 502, 'si Stripe rechaza → 502 sin enseñar el motivo al cliente');
console.log(fallos ? `\n${fallos} FALLOS` : '\n0 fallos.');
process.exit(fallos ? 1 : 0);
