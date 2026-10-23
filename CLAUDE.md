# telasdemama.com — migración de PrestaShop a Astro

## Quién manda
Yama (propietaria/o de la tienda), no técnico: castellano de España, de tú, sin jerga. Lo haces tú.
Cada informe dice el estado del cambio (local / commit / main desplegado).
La tienda la lleva Natalia (Telas de Mamá, Rioseco, Sobrescobio, Asturias).

## Decisiones
Dec. 1 Claude Code · 2 [pendiente] · 3 copia fiel por plantilla · 4 [pendiente] · 5 DNS en el registrador sin tocar correo · 6 igual que la vieja · 7 a mano con permiso
Dec. 8 (tienda) **CONFIRMADA por Yama el 23-10-2026**: la tienda hace menos de 15 pedidos/mes → **catálogo estático + pedido por WhatsApp (+34 643 945 052) y formulario**, sin carrito ni pago online. El mensaje de WhatsApp lleva nombre, referencia y cantidad (metros). El cobro se acuerda fuera de la web (como hoy con transferencia). Ver informes/inventario.md §14.
Dec. 9 (precios) congelar y volver a bajar la víspera · Dec. 10 (PrestaShop viejo) un mes vivo y copia completa
Regla del H1 APROBADA por Yama el 23-10-2026: 1.126 páginas tienen un H1 y no se tocan; en las 30 sin H1 (más vendidos ×26, rebajados, novedades, marca, contacto) el título visible (`h2.page-heading`, sin el «Hay N productos») pasa a H1; en contacto, «Contacte con nosotros».

## Reglas
- Método: PROMPT-MIGRACION-PRESTASHOP-V1.md. Antes de cada fase, lee esa fase y la sección E.
- Contenido original intocable salvo petición (regla + seco + commit propio).
- Nada inventado (precios, stock, plazos, reseñas, normativa). Lo nuevo, desde src/data/.
- URL, rutas de imagen y canonical idénticos al original (sin barra final, sin www, fichas con .html).
- Datos de clientes nunca al repositorio.
- Desde la Fase 2: 0 fallos en `npm run todo` y `npm run todo:visual` antes de subir.
- Informes en informes/; no listar carpetas enormes (referencia/ tiene cientos de HTML).
- Windows: código con barras invertidas, en ficheros. Python con `-I` para leer lo descargado.
- Agentes: PROHIBIDO escribir ficheros.
- Scripts largos se escriben con la herramienta Write, no con heredoc en Bash (en este Windows el heredoc se come barras invertidas y corta el fichero).
- Mientras exista `informes/rastreo-en-curso.lock` no se lanza nada contra el servidor viejo (lo crea la cadena de rastreo; `bajar-imagenes.mjs` y `barrido-404.mjs --comprobar-origen` lo respetan).
- **El servidor viejo solo aguanta UNA petición a la vez** (508 Resource Limit, 7–14 s por página).
  Nunca lances dos cosas contra telasdemama.com al mismo tiempo. Rastreo: `node herramientas/rastrear-ps.mjs --idioma es`
  (1 hilo, ritmo adaptable, retoma solo). Análisis: `python -I herramientas/analizar-rastreo.py --idioma es`.

## Datos
PrestaShop 1.7 (versión exacta por confirmar) · PHP 7.4 · tema Cosmetics 2.3.1 (`cosmetics_th`, Prestahero) · sin constructor de páginas
Módulos clave: productpricebysize (precio por medida), ps_facetedsearch, productcomments + Revi, codwfeeplus, paypal, ps_emailsubscription, ps_emailalerts, htmlbanners1-9, homefeatured, ps_imageslider
Idiomas: es, ca, gl, eu, pt (hreflang es / ca-es / gl-es / eu-es / pt-pt) · moneda EUR
GTM-KTP52S5 · GA4 G-8H0YS98F5Q · Google Ads AW-388689405 · Meta (ps_facebook) · Revi 5f9170edaac41
WhatsApp +34 643 945 052 · correo contacto@telasdemama.com · formulario [pendiente]
DNS en Infofuturo (dns1/dns2.infofuturo.net), servidor Hetzner 188.245.164.207 (cPanel) · **MX al propio servidor: el correo vive en el hosting viejo**
Repositorio https://github.com/Yamarodriguez/telasdemama.git (remoto `origin`, rama `main`, conectado el 23-10-2026) · hosting nuevo [pendiente] · Merchant Center [pendiente de confirmar; hay Google Ads]
Webservice `/api` activo (pide clave). Sin sitemap declarado; rutas de sitemap sin confirmar (508).
Páginas con tráfico (Search Console): [pendiente]

Catálogo: 658 fichas · 120 categorías (4 niveles, 6 vacías) · 5 CMS · 12 productos por página · 1.644 imágenes × 3 tamaños (home/large/medium_default) · 28 fichas sin precio («COMBINACIÓN») · 32 «por metro» · sin EAN · sin sitemap XML · sin JSON-LD (microdata).
Referencia del castellano bajada en referencia/ (1.156 HTML, 226 MB); tabla en referencia/rastreo-es.json; análisis en informes/analisis-es.md.

## Estado (se actualiza al cerrar cada fase)
- Fase actual: **1 en curso** (empezada el 23-10-2026). Informe: informes/fase-1.md. Estado del cambio: **local + commit** (sin remoto: no hay `gh`; sin hosting).
- Hecho en la Fase 1: tema bajado a `public/` (147 ficheros, 0 fallos; `bajar-tema.mjs`); catálogo `es` extraído a `src/data/catalogo/es/` (658 productos, 120 categorías, 5 CMS; `extraer-ps.py`, sin CSV que contrastar); `src/data/estructura-viva.json` con la regla del H1 (30 páginas); servidor de referencia en 8090 (`npm run referencia`) y barrido de 404 (`barrido-404.mjs`: solo faltan las imágenes); Astro 7.4.2 montado, `npm run todo` a 0 fallos; `.gitignore` G2; repositorio git local.
- En marcha / pendiente de la Fase 1: rastreo de ca, gl, eu, pt en cadena (`informes/rastreo-en-curso.lock` mientras dure; luego `extraer-ps.py`, `estructura-viva.py` y `barrido-404.mjs --idioma xx` por idioma); imágenes (4.953 ficheros ≈ 250 MB, **pide permiso**; `bajar-imagenes.mjs`, se niega a arrancar si hay rastreo); `src/data/fallos-original.json` con `--comprobar-origen`; remoto y primer despliegue con noindex.
- Hallazgos de la extracción (se deciden, no se tocan): 3 fichas sin `data-product` (839, 840, 1124; sacadas del HTML visible), 14 categorías vacías (no 6), descuentos del 30 % que caducan el 30-10-2026, rastreador de Metricool en todas las páginas.
- Pendiente del propietario: qué es «cantidad 1» en una tela, formas de cobro para WhatsApp, objetivos, Merchant Center, zona DNS completa, exports/Webservice, Search Console, quién envía el correo, legales con el gestor, decisión sobre los fallos del §11.
