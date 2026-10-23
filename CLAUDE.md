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
Títulos APROBADOS por Yama el 23-10-2026 (informes/analisis-competencia.md §4): reglas en `src/data/reglas-contenido/es.json`, aplicadas al compilar por `src/lib/reglas-titulos.mjs` (portada: title «Telas de Mamá · Tienda de telas online y mercería en Asturias»; categoría Telas: H1 «Telas por metros»; patrones de `<title>` para categorías y fichas; los títulos a medida que ya existían se conservan). Pasada en seco: `node herramientas/aplicar-titulos.mjs --seco` → informes/titulos-es.md. El rótulo visible de los listados («Telas · Hay N productos») no cambia; solo H1 y `<title>`.

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
Repositorio https://github.com/Yamarodriguez/telasdemama.git (remoto `origin`, rama `main`, conectado el 23-10-2026) · hosting nuevo Netlify (desplegado por Yama el 23-10-2026 desde `main`; `netlify.toml` con noindex G3 hasta la Fase 7) · Merchant Center [pendiente de confirmar; hay Google Ads]
Webservice `/api` activo (pide clave). Sin sitemap declarado; rutas de sitemap sin confirmar (508).
Páginas con tráfico (Search Console): [pendiente]

Catálogo: 658 fichas · 120 categorías (4 niveles, 6 vacías) · 5 CMS · 12 productos por página · 1.644 imágenes × 3 tamaños (home/large/medium_default) · 28 fichas sin precio («COMBINACIÓN») · 32 «por metro» · sin EAN · sin sitemap XML · sin JSON-LD (microdata).
Referencia del castellano bajada en referencia/ (1.156 HTML, 226 MB); tabla en referencia/rastreo-es.json; análisis en informes/analisis-es.md.

## Fase 2 (copia fiel en Astro) — cómo está montada
- Rutas: `src/pages/[idioma]/…` (portada `index.astro`, `[slug].astro` para categorías/listados/páginas sueltas, `[slug]/pagina/[n].astro` para la paginación, `[categoria]/[producto].astro` fichas con `.html`, `content/[cms].astro`, `brand/[marca].astro`, `404.astro`). `build.format: 'preserve'` y `trailingSlash: 'ignore'` (la portada de cada idioma es `/es/`).
- Plantillas en `src/components/plantillas/`, piezas en `src/components/`, esqueleto en `src/layouts/Base.astro`, acceso a datos en `src/lib/` (`catalogo.ts`, `paginas.ts`, `prestashop.ts`, `sitio.ts`).
- Datos: catálogo (`src/data/catalogo/<idioma>/`), bloques fijos sacados del HTML vivo (`src/data/bloques/<idioma>/`, se regeneran con `npm run bloques` = `herramientas/extraer-bloques.py`), textos de interfaz (`src/data/textos/<idioma>.json`) y lo NUEVO (`src/data/nuevo/<idioma>.json`: WhatsApp, bloque «Pedidos» del pie, avisos). Un idioma existe en la web en cuanto tiene catálogo + bloques + textos.
- Reglas del tema reproducidas (no tocar sin comprobar con el comparador): la miniatura muestra la descripción LARGA recortada a 150 caracteres al estilo Smarty y el nombre recortado a 60; la segunda foto es la de posición 2; el `alt` es la leyenda real (`fichas-extra.json`); el visor de fotos lleva flechas con más de 5 imágenes; la pestaña «Detalles» solo con referencia; las categorías llevan « (N)» en el título de las páginas 2+; el contador «Hay N productos» va fuera del H1 en los listados sin H1.
- Dec. 8 en la web: botón «Pedir por WhatsApp» (ficha con cantidad, listados sin ella); sin acceso de cliente ni carrito; buscador, orden, filtros (salvo «Categorías», que enlaza a la subcategoría), boletín y adjunto del formulario visibles pero desactivados con aviso; contacto envía por `mailto:` hasta la Fase 5. Cuenta/carrito/búsqueda redirigen en `public/_redirects` (generado por `herramientas/redirecciones.mjs` en `prebuild`). Paginación vieja `?page=N` → 301 a `/pagina/N`.
- Comprobaciones: `npm run todo` = datos → compilar → validar (C6) → encabezados (C1, `--completo`) → plantillas (C2, `herramientas/comparar-plantillas.mjs` con las diferencias aceptadas y su motivo en `comparar-plantillas.config.json`). `npm run todo:visual` añade `herramientas/comprobar-visual.mjs` (C3 contraste, C4 geometría a 1400 y 390 px, C5 404 en vivo; Playwright 1.64.1 con el Chrome instalado; muestra de páginas y diferencias aceptadas en `comprobar-visual.config.json`; capturas lado a lado en `capturas/`; informe `informes/visual.md`). C1, C2, C3 y C4 a **0** el 23-10-2026; C5 y C6 solo fallan por las imágenes que aún no ha bajado la Fase 1.
- Hook pre-push: `.githooks/pre-push` pasa `npm run todo:visual`; se activa con `npm run hooks:activar` (cada clon tiene que activarlo). Saltar una vez, solo con motivo escrito en el commit: `SALTAR_COMPROBACIONES=1 git push`.
- Imágenes de producto (`public/*_default/`, 4.932 ficheros, 237 MB) **en git desde el 23-10-2026** por decisión de Yama: Netlify compila desde el repositorio. En la Fase 6 se añaden versiones webp.
- Lo nuevo lleva su hoja aparte, `public/estilos/nuevo.css`, cargada la última (solo para lo que no existía: el H1 de los listados dentro de la caja `.page-heading`).
- Decisiones de la Fase 2 pendientes de Yama: filtros (punto 7), buscador Pagefind o quitarlo (punto 8), orden de listados, Google+ en las fichas, textos de `nuevo/es.json`.

## Estado (se actualiza al cerrar cada fase)
- Fase 3: **en curso** (23-10-2026, su sesión). Encargo en informes/analisis-competencia.md; informe en informes/fase-3.md. **Yama eligió la opción 1 (diseño propio) y aprobó extenderla**: interruptor `src/data/rediseno.json` encendido para **todo el castellano** (`idiomas: ["es"]`; `paginas` = muestra para capturas); los demás idiomas siguen como copia fiel hasta traducir los textos de `src/data/rediseno/`. Esqueleto `src/layouts/Rediseno.astro` + `src/components/rediseno/` (Portada1, Listado, Ficha, PaginaCms, Contacto, Tiendas, MapaDelSitio, Marcas, Proveedores, NoEncontrada; Portada2 y `2.css` guardados) y hoja `public/estilos/rediseno/1.css` (importa `base.css`). Las comprobaciones C1, C2 y C4 saltan las páginas con el rediseño (lo dicen en su informe); C5 y C6 sí las revisan; `node herramientas/todo.mjs --visual --dist dist-rediseno` a 0. Capturas: `herramientas/capturar-rediseno.mjs` → `capturas/rediseno-<ahora|1|2>-<pagina>-<ancho>.png`. Diferencia de contenido documentada: las páginas de texto del rediseño quitan el `<script>` ajeno del original (informe §6). **Pendiente de Yama: [CONFIRMAR] del informe §4, el script ajeno del original, decisiones de la Fase 2 (filtros, buscador, orden), textos del rediseño en ca/gl/eu/pt.** Estado del cambio: **main desplegado en Netlify con noindex, con el rediseño en todo el castellano**.
- Fase 2: **CERRADA el 23-10-2026** (sesión madre). `npm run todo:visual` a 0 fallos con las imágenes (datos, compilar, validar, encabezados, plantillas, visual: C1–C6). Capturas de `capturas/` aprobadas por Yama. Hook pre-push activo. Estado del cambio: **main desplegado en Netlify con noindex**. Siguiente: Fase 3 (rediseño, Dec. 4) cuando Yama quiera; quedan sus decisiones de la Fase 2 (filtros, buscador, orden, Google+, textos de `nuevo/es.json`).
- Fase 1: **CERRADA el 23-10-2026** (su sesión). Informe: informes/fase-1.md. Referencia completa de los 5 idiomas en `referencia/` (5.780 páginas, 0 cortas); tema en `public/` (147 ficheros); imágenes 4.968/4.973 (237 MB, en git por decisión de Yama; las 5 que faltan dan 404 en el original → `src/data/fallos-original.json`); catálogo de los 5 idiomas en `src/data/catalogo/<idioma>/` (658 productos, 120 categorías, 5 CMS cada uno; sin CSV que contrastar); `src/data/estructura-viva.json` con la regla del H1 (30 páginas por idioma); barrido de 404 a 0 en los 5 (`barrido-404.mjs --idioma xx`); `npm run todo:visual` a 0. Estado del cambio: **commit 54c1efa subido a `origin/main`, desplegado por Netlify con noindex**. Herramientas: `bajar-tema.mjs`, `bajar-imagenes.mjs`, `extraer-ps.py`, `estructura-viva.py`, `servir-referencia.mjs` (8090), `barrido-404.mjs`, `validar.mjs`, `comparar-encabezados.mjs`, `todo.mjs`.
- Hallazgos de la Fase 1 (se deciden, no se tocan): **ca, gl, eu y pt están a medias** (564 de 658 fichas y 86 de 120 categorías con el nombre en castellano o en inglés; las 5 páginas de texto en inglés por defecto de PrestaShop, «About us» de 605 caracteres) → decidir en la Fase 4 si se mantienen, se traducen o se redirigen; 3 fichas sin `data-product` (839, 840, 1124; sacadas del HTML visible); 14 categorías vacías (no 6); descuentos del 30 % que caducan el 30-10-2026 (Dec. 9); rastreador de Metricool en todas las páginas; el servidor viejo da 508 por su cuenta incluso con una sola petición.
- Pendiente del propietario: qué es «cantidad 1» en una tela, formas de cobro para WhatsApp, objetivos, Merchant Center, zona DNS completa, exports/Webservice, Search Console, quién envía el correo, legales con el gestor, decisión sobre los fallos del §11.
