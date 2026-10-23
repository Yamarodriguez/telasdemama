// capturar-webs.mjs — capturas de pantalla de webs externas (competencia, referencias de diseño)
// a 1400 y 390 px, para el análisis de la Fase 3. Usa el Chrome instalado (Playwright).
// También apunta los enlaces del menú de cada portada en un .json, para encontrar categorías y fichas.
//
// Uso: node herramientas/capturar-webs.mjs --salida informes/competencia URL [URL…]
//   --solo-ancho 1400   (opcional) una sola anchura
// Nombre de fichero: dominio + ruta, sin caracteres raros.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const SALIDA = opt('salida', 'informes/competencia');
const ANCHOS = opt('solo-ancho', '') ? [Number(opt('solo-ancho'))] : [1400, 390];
const urls = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!urls.length) { console.error('Dime al menos una URL'); process.exit(2); }
fs.mkdirSync(SALIDA, { recursive: true });

const nombre = (u) => { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ locale: 'es-ES', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
const resumen = {};
for (const u of urls) {
  for (const ancho of ANCHOS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: ancho, height: 900 });
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      // cerrar avisos de cookies habituales para que no tapen la captura
      for (const sel of ['#onetrust-accept-btn-handler', '.cc-btn.cc-dismiss', 'button:has-text("Aceptar todo")', 'button:has-text("Aceptar todas")', 'button:has-text("Aceptar")', 'a:has-text("Aceptar")', '#cookieConsentOK', '.js-cookie-consent-agree']) {
        const b = page.locator(sel).first();
        if (await b.count() && await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => null); break; }
      }
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(800);
      const fichero = path.join(SALIDA, `${nombre(u)}-${ancho}.png`);
      try { await page.screenshot({ path: fichero, fullPage: true, timeout: 30000 }); } catch { await page.screenshot({ path: fichero, fullPage: false }); }
      if (ancho === ANCHOS[0]) {
        resumen[u] = await page.evaluate(() => ({
          titulo: document.title,
          h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).slice(0, 3),
          enlaces_menu: [...document.querySelectorAll('nav a, header a, #header a, .menu a, #menu a')].map((a) => ({ t: a.textContent.replace(/\s+/g, ' ').trim(), h: a.href })).filter((x) => x.t && x.h.startsWith('http')).slice(0, 80),
          alto: document.documentElement.scrollHeight,
        }));
      }
      console.log(`ok  ${ancho}  ${u}`);
    } catch (e) { console.log(`FALLO ${ancho} ${u}: ${String(e.message).split('\n')[0]}`); }
    await page.close();
  }
}
fs.writeFileSync(path.join(SALIDA, 'enlaces.json'), JSON.stringify(resumen, null, 1));
await browser.close();
console.log(`Capturas en ${SALIDA}/`);
