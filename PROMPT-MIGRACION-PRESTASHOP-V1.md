# Prompt para migrar una tienda PrestaShop a Astro (versión 1)

Es la adaptación del prompt V5 (WordPress + Elementor) a PrestaShop. Mantiene lo que no depende del constructor (método por fases, reglas de oro, comprobaciones, DNS, correo, Git) y sustituye todo lo que era de Elementor por lo que hace falta en una tienda.

**Aviso de honestidad:** el V5 salió de dos migraciones reales. Esta versión todavía no. Todo lo específico de PrestaShop es previsión razonada, no experiencia. Por eso la Fase 0 es más larga y comprueba cada suposición contra la web real. Lo que falle se anota en la sección E, que arranca vacía.

---

## PARA TI, YAMA: cómo se usa

1. Crea una carpeta vacía para la web nueva (por ejemplo `Escritorio\midominio`).
2. Copia dentro este fichero y, si quieres reutilizar herramientas, la carpeta `kit` y la carpeta `analisis` del kit V5 (su CONTENIDO, no la subcarpeta que crea Windows al descomprimir).
3. Añade lo que tengas de la sección 1 (export CSV del Back Office, copia de la zona DNS, Search Console).
4. Abre Claude Code en esa carpeta y pega el mensaje de abajo rellenando los corchetes.

### Mensaje para la primera sesión

```
Quiero migrar [DOMINIO] (tienda PrestaShop [versión si la sabes], en vivo en
https://[DOMINIO]) a Astro en [Netlify / Cloudflare Pages], conservando todas
las URL y el posicionamiento. Soy el propietario y no soy técnico: háblame en
castellano de España, de tú y sin jerga, y hazlo tú.

En esta carpeta tienes:
- PROMPT-MIGRACION-PRESTASHOP-V1.md: el método. Léelo entero antes de nada.
- kit/ y analisis/ (si los he puesto): herramientas y análisis de las
  migraciones de WordPress. Reutiliza solo lo que este prompt diga.
- [exports]: CSV del Back Office, SQL o lo que haya.

Datos: Analytics [G-…], WhatsApp [nº], correo [@], titular [nombre, NIF,
dirección]. Dominio en [registrador]. Formularios con [Web3Forms / otro].
Repositorio: [URL / "créalo tú"]. Hosting nuevo: [nombre / "todavía no hay"].
¿Vende online hoy? [sí, unos N pedidos al mes / no / casi nada].

Decisiones: las de la sección 0, salvo: [nada / lo que cambies].

Empieza por la FASE 0. No escribas código del motor hasta que te confirme el
inventario y la Dec. 8.
```

### Mensaje para las sesiones siguientes

Una sesión por fase: `Lee CLAUDE.md y empieza la Fase [N].`

---

## 0. DECISIONES (con opción por defecto)

Las 1 a 7 son las de V5 (cambian solo las notas). **Las 8 a 10 son nuevas y las más importantes.**

| Decisión | Qué significa para ti | Por defecto | Alternativa |
|---|---|---|---|
| Dec. 1 — Dónde trabaja Claude | Si Claude puede ejecutar en tu ordenador | Claude Code | Sin terminal: ficheros `.cmd` de doble clic (Anexo 1 de V5) |
| Dec. 2 — Quién sube a main | Quién publica | Claude, si las comprobaciones salen a 0 | Tú |
| Dec. 3 — Copia fiel | Cómo se copia la web vieja | Exacta y comprobada **por tipo de plantilla** (portada, categoría, producto, CMS…) | Directo a diseño propio |
| Dec. 4 — Rediseño | Cómo se decide el diseño | 2 o 3 opciones en imagen, prueba en una página, interruptor | Todo de golpe |
| Dec. 5 — DNS | Dónde se cambia | En el registrador, sin tocar el correo | Pasarlo al hosting nuevo copiando antes el correo |
| Dec. 6 — Ancho | Pantallas grandes | Igual que la vieja | Todo el ancho |
| Dec. 7 — Texto sin contraste | Cómo se arregla | A mano, con tu permiso | Automático |
| **Dec. 8 — La tienda** | **Qué pasa con comprar** (carrito, pago, cuentas de cliente). Astro es estático y **no vende por sí solo** | Se decide en la Fase 0 con datos reales de pedidos. Si vende poco: **catálogo estático + "pedir presupuesto / WhatsApp"**. Si vende de verdad: **catálogo estático + compra por enlace externo** (Stripe Payment Links, Snipcart o similar) | (a) Mantener PrestaShop solo para comprar, en un subdominio, y migrar el escaparate. (b) No migrar: optimizar PrestaShop donde está. (c) Pasar a otra plataforma de tienda |
| **Dec. 9 — Precios y stock** | Cómo se mantienen al día en una web estática | Se congelan al bajar, y **se vuelven a bajar la víspera del cambio**. Después, tú los editas en un fichero | Compilación automática cada noche leyendo el PrestaShop (necesita que siga vivo y con API) |
| **Dec. 10 — PrestaShop viejo** | Qué pasa con él al terminar | Se queda vivo un mes y luego se guarda copia completa (base de datos + pedidos + facturas) | Se cancela antes (no recomendado) |

**Si la Dec. 8 sale (a), (b) o (c), este método ya no es el adecuado:** Claude lo dice en la Fase 0 y se replantea el encargo antes de seguir.

---

## 1. LO QUE TIENES QUE TENER TÚ

### Ficheros
- [ ] **Zona DNS completa tal como está hoy** (MX, SPF, DKIM, SRV, autoconfig, TXT). Lo más importante: sin ella se pierde el correo. En tiendas hay además TXT de verificación (Google, Merchant Center) y a veces correo transaccional por SMTP.
- [ ] **Exports del Back Office** (Parámetros avanzados → Exportar): productos, categorías, combinaciones, marcas, proveedores. Y, si puedes, una copia de la base de datos. Sirven para contrastar con lo que se descargue de la web.
- [ ] **Search Console**: Rendimiento → Páginas, 12 meses. Dice qué fichas y categorías traen tráfico.
- [ ] **Merchant Center / Google Shopping**: si existe, la URL del feed y qué módulo lo genera. Es una dependencia oculta.
- [ ] **Informe de ventas** de los últimos 12 meses (pedidos por mes). Decide la Dec. 8.

### Accesos (que funcionen)
Registrador, hosting del PrestaShop, **Back Office**, GitHub, hosting nuevo, Search Console, Analytics, Merchant Center, servicio de formularios y **pasarela de pago** (para saber qué avisos devuelve al dominio).

### Datos que solo sabes tú
Precios reales y si llevan IVA, plazos y gastos de envío reales, zonas de envío, teléfono/WhatsApp/correo/horario, datos legales del titular, política de devoluciones y desistimiento vigente, identificadores de Analytics/Search Console, reseñas reales que se puedan publicar.

---

## A. CÓMO TRABAJAMOS

Se mantienen **A1 a A5 del V5** con estos cambios:

### A1. Comprobar el entorno
Igual que V5 (Node 22.12+, Python con `beautifulsoup4` y `lxml`, git, `gh`, navegador para Playwright, petición de prueba al dominio). Añadir:
- ¿Se puede acceder al Back Office? ¿Está activo el **Webservice** (`/api`) o hay que pedir la clave?
- ¿La web responde con ritmo normal? PrestaShop con muchos productos es lento: el rastreo va despacio (2 hilos, 400 ms, reintentos).

### A2. El propietario y cómo se le habla
Igual que V5, incluido "arreglado no es publicado" con los 4 estados.

### A3. Las reglas de oro (adaptadas)
1. **El contenido original no se toca**: ni nombres de producto, ni descripciones, ni precios, ni referencias, ni orden, ni enlaces. Excepción: la regla del H1 que apruebas en la Fase 0.
2. Si pides corregir contenido: regla en fichero de datos + script repetible + pasada en seco (`--seco`) con recuento y 5 ejemplos + commit propio.
3. Lo nuevo se añade alrededor o al final, desde `src/data/`.
4. **No se inventa ningún dato.** En una tienda esto incluye: precios, descuentos, stock, plazos de entrega, gastos de envío, materiales, medidas, certificaciones, reseñas, normativa de consumo. Lo que no esté en la web se pregunta. Todo texto escrito por IA pasa comprobación de hechos.
5. **Las URL no cambian nunca**, ni las de producto (`/es/categoria/34-nombre.html`), ni las de categoría (`/es/12-nombre`), ni las de imágenes (`/34-large_default/nombre.jpg` y `/img/p/…`). Están en Google, Google Imágenes y Merchant Center.
6. Los fallos del original se enseñan y se decide. Ni se copian en silencio ni se arreglan en silencio.
7. **Datos personales de clientes: nunca al repositorio ni a ningún fichero de la web** (clientes, direcciones, pedidos, correos de newsletter). Si hay lista de newsletter, se entrega aparte para importarla en un servicio de correo, con tu permiso.
8. Antes de quitar algo "que no se ve", comprobar que nada dependa de su espacio.
9. Si una imagen de fondo no carga, no se arregla nada: se apunta y se avisa.
10. Desde la Fase 2, nada se da por bueno sin `todo` y `todo:visual` a 0 fallos (sección C).

### A4 y A5
Igual que V5 (ahorro de tokens, informes a disco, `.gitignore` antes del primer `git add`, nunca `git add .`, clon limpio antes de subir). Añadir a lo que **no** sube a Git: `exports/`, cualquier CSV o SQL con datos de clientes, y `referencia/`. Lo que **sí** sube: `src/data/` (catálogo en JSON) y `estructura-viva.json`.

---

## B. EL KIT: qué se reutiliza y qué hay que escribir

El kit V5 está hecho para Elementor. Con PrestaShop:

**Se puede reutilizar (tras revisar):** descargadores de HTML, hojas e imágenes; `comparar-encabezados.mjs`; capturas con Playwright (`channel: 'chrome'`); `validar.mjs`; `todo.mjs`; el motor de redirecciones de V5 como idea.

**No sirve y no se usa:** `extraer.py` (lee XML de WordPress), `arbol.py` (árbol de Elementor), `menus.py`, `kit/copia-fiel/` y `kit/web-final/` salvo como ejemplo de estructura y de formularios AJAX.

**Hay que escribir (Fase 1 y 2):**

| Herramienta | Qué hace | Fase |
|---|---|---|
| `rastrear-ps.mjs` | Parte del sitemap (módulo Google sitemap, suele ser `/1_index_sitemap.xml`), de las categorías con toda su paginación y de los enlaces internos. Guarda el HTML en `referencia/` y una tabla `tipo, id, URL, idioma` | 1 |
| `extraer-ps.py` | Pasa cada HTML a JSON de catálogo (producto, categoría, marca, CMS) y lo contrasta con los CSV del Back Office | 1 |
| Descargador de imágenes de PrestaShop | Ver 1.4 | 1 |
| Barrido de 404, validador, `todo.mjs` | Como V5 (C5, C6), adaptados | 1 |
| Comparador por plantilla | Ver C2 | 2 |
| Contraste y geometría | Como V5 (C3, C4) | 2 |

### B1. Montaje del proyecto (Fase 0)
Se monta en la raíz, nunca dentro de `kit/`. `astro.config.mjs` va con **`trailingSlash: 'never'` y `build.format: 'file'`**, porque las URL de PrestaShop no terminan en barra y las fichas acaban en `.html`. (Es lo contrario de V5; `validar.mjs` y el canonical se ajustan a esto.) Se fijan versiones exactas en `package.json`.

---

## C. LAS COMPROBACIONES

Mismo esquema que V5: `npm run todo` (sin navegador) y `npm run todo:visual` (con navegador), cada una con informe en `informes/`, código de salida distinto de 0 si falla y mensaje "SE HA PARADO EN: <paso>". Excepciones en `src/data/fallos-original.json`. Desde la Fase 2, no se sube nada sin 0 fallos, con hook `pre-push`.

- **C1. Encabezados**: igual que V5 (secuencia H1/H2/H3 contra `estructura-viva.json`, con puntero, no `indexOf`).
- **C2. Marcado por plantilla**: sin `data-id` de Elementor. Se compara, por **tipo de página** (portada, categoría, producto, CMS, marca, contacto, 404, y blog si hay), el DOM de la web nueva con el de la referencia usando selectores estables del tema (`#header`, `.product-miniature`, `#product`, `.breadcrumb`, `#footer`…): etiqueta, clases como conjunto, atributos `data-*` y texto. Mismo lector de HTML para los dos lados. Se normalizan los tokens que cambian en cada visita (`token` de formularios, `static_token`, ids de sesión).
- **C3. Contraste**: igual que V5, capas apiladas con su transparencia. Fondo desconocido porque la foto no cargó: no se toca nada.
- **C4. Geometría** a 1400 y 390 px por tipo de plantilla. En tienda importa especialmente: rejilla de productos, ficha, miniaturas y precios.
- **C5. Barrido de 404**: peticiones de fotos, tipografías y otros; las bloqueadas a propósito cuentan como fallo salvo lista blanca. En PrestaShop hay que vigilar las miniaturas por tamaño (`home_default`, `large_default`…).
- **C6. Validador**: lo de V5 (etiquetas, un solo H1 tras la regla, ningún enlace perdido, ninguna imagen sin fichero, ningún shortcode/variable de Smarty sin resolver como `{$` o `{l s=`) y además:
  - canonical exacto **sin barra final** y absoluto, igual que el original;
  - **`<link rel="alternate" hreflang>`** idéntico al original si hay varios idiomas;
  - **JSON-LD de Product** con `name`, `sku`/`mpn`, `image`, `offers` (`price`, `priceCurrency`, `availability`) coherente con lo visible. Nunca un precio distinto entre el texto y el JSON-LD;
  - cada producto del sitemap original existe, o tiene redirección;
  - ningún producto sin precio ni imagen si en el original lo tenía.

---

## D. EL PASO A PASO

Nueve fases, en orden. Cada cierre: se cumple su Cierre, `todo` y `todo:visual` a 0 (desde la Fase 2), commit, `CLAUDE.md` actualizado, subida si la Dec. 2 lo permite y estado del cambio (A2).

### FASE 0 — Reconocimiento (solo lectura)

Todo va a `informes/inventario.md`, resumido en el chat. Sin tocar motor ni plantillas.

1. Comprobar el entorno (A1) y crear `CLAUDE.md` (G1).
2. **Identificar la plataforma:** versión de PrestaShop (meta generator, rutas `/themes/`, `/modules/`, estructura de URL), tema usado (Classic, Hummingbird o de terceros: Warehouse, Leo, Iqit…), **constructor de páginas si lo hay** (Creative Elements, Ap Page Builder, Iqit Elementor…). Si hay un constructor, se avisa: partes de la web serán árboles propios y el método de V5 aplica a esas partes.
3. **Recuentos:** productos (activos e inactivos), categorías (niveles de profundidad), combinaciones por producto, marcas, proveedores, páginas CMS, entradas de blog, idiomas, monedas, ¿multitienda?
4. **Tipos de plantilla:** agrupar por huella del HTML (no por URL): portada, categoría, producto simple, producto con combinaciones, pack, marca, CMS, contacto, blog, 404, resultado de búsqueda, cuenta, carrito, pedido.
5. **Qué depende de PrestaShop en dinámico** y qué se hace con cada cosa (Dec. 8): carrito, pedido, cuenta de cliente, login, lista de deseos, comparador, buscador, **filtros por facetas**, selector de combinación (talla/color), precios por grupo de cliente, descuentos con fecha, stock en tiempo real, opiniones de producto, productos relacionados, "visto recientemente", formularios, newsletter.
6. **Módulos instalados** (rutas `/modules/NOMBRE/` en el HTML) y qué aporta cada uno. Marcar los que escriben HTML que habrá que capturar.
7. **Estructura de URL y SEO actual:** patrón de URL de producto/categoría/marca/CMS, prefijo de idioma, uso de `?id_product=`, `?controller=`, `?page=`, `?order=`, `?q=` (filtros), canonical, `robots.txt`, sitemap, hreflang, datos estructurados existentes.
8. **Feeds y servicios externos:** Google Merchant Center, comparadores de precio, marketplaces, píxeles de Meta/Google, webhooks de la pasarela de pago y del transportista, correo transaccional (SMTP).
9. **Iconos y tipografías**: SVG o fuente de iconos con su versión; tipografías y si están en npm.
10. **H1:** páginas con 0 y con 2 o más. Aprobar **una sola regla** con la lista delante; se apunta en `CLAUDE.md`.
11. **Enlaces rotos del original** (`#`, vacíos, a productos desactivados).
12. **Páginas que traen tráfico** (Search Console) y **qué fichas se venden** (informe de ventas).
13. **Datos legales:** qué páginas CMS son legales (aviso legal, privacidad, cookies, condiciones de venta, desistimiento, envíos). Si se mantiene la venta, deben estar completas y vigentes; si faltan, se avisa y se pregunta, no se inventan.

**Cierre:** confirmas el inventario, la **Dec. 8** y la regla del H1.

### FASE 1 — Bajar todo y montar la referencia

Mientras la web vieja sigue en el dominio. Despacio: 2 hilos, 400 ms entre peticiones, reintentos; se descarta una página de menos de 5.000 caracteres (con revisión: una ficha puede ser corta de verdad).

1. **Rastrear TODO** con `rastrear-ps.mjs`: sitemap + categorías con **toda su paginación** + enlaces internos. Cruzar con los CSV del Back Office: lo que está en CSV y no en el rastreo (o al revés) se enseña.
2. **Fichas con combinaciones:** guardar el HTML base y, si el selector de combinación cambia precio/stock por JavaScript o por una petición, capturar **cada combinación** (precio, referencia, stock, imagen). Se dice cuántas son antes de bajarlas.
3. **Hojas y scripts:** `theme.css`, `custom.css`, `theme.js`, CSS y JS de cada módulo que aparezca en el `<head>`/pie, con su orden exacto; reescribir direcciones absolutas al dominio viejo (script, falla si queda alguna). Tipografías e iconos desde npm con versión exacta (sin `^`); lo que no esté, con `descargar-fuentes.mjs`.
4. **Imágenes** (con permiso, diciendo cuántas son y cuánto ocupan):
   - miniaturas por tamaño tal como las pide el HTML: `/{id}-{tamaño}/nombre.jpg` (`home_default`, `small_default`, `medium_default`, `large_default`, `cart_default`…);
   - las originales de `/img/p/…` si el HTML las enlaza (zoom, `data-full-size-image-url`);
   - categorías (`/c/…`), marcas (`/m/…`), logo y favicon (`/img/…`), imágenes de CMS (`/img/cms/…`), banners de módulos y las de los `url(...)` de las hojas;
   - **se conservan rutas y nombres originales**; si la ruta con tamaño es una reescritura de `.htaccess`, se guarda con esa misma ruta pública.
5. **Páginas CMS y legales** desde la web en vivo (no se confía en el export). Nunca se sobrescribe un texto bueno con uno vacío; el script falla si una legal tiene menos de N caracteres.
6. `extraer-ps.py` → `src/data/catalogo/*.json` (producto, categoría, marca, CMS): nombre, referencia, EAN, precio sin y con IVA, precio tachado, fecha de fin de oferta, stock visible, descripción corta y larga (HTML tal cual), características, imágenes en orden, combinaciones, categoría por defecto y breadcrumb, `meta title`, `meta description`, canonical, hreflang. **Se contrasta con el CSV: precios y referencias deben coincidir al 100 %** y las diferencias se enseñan.
7. `estructura-viva.json` con los encabezados de cada página.
8. **Servir la referencia en local** (puerto 8090) y escribir el barrido de 404 (C5). Tiene que dar 0. Lo que da 404 también en el servidor viejo va a `src/data/fallos-original.json`.
9. Primeros pasos de `todo.mjs` (generar, compilar, validar, encabezados).
10. **Repositorio y hosting:** `.gitignore` completo y primer commit; primer despliegue con `X-Robots-Tag: noindex` (G3), compilado antes desde un clon limpio. Única subida sin `todo:visual`.

**Cierre:** referencia a 0 errores 404 (salvo lista), catálogo extraído y contrastado con el Back Office, validador sin ficheros que falten.

### FASE 2 — Copia fiel por plantilla

1. **Primero el comparador (C2)**, luego las plantillas.
2. Una plantilla Astro **por tipo de página**, con el marcado sacado del HTML real, no escrito de memoria. Los datos salen de `src/data/catalogo/`.
3. **Rutas idénticas a las originales**, incluidos los ids dentro de la URL (`34-nombre.html`) y el prefijo de idioma.
4. Lo que pintan los módulos (menú, buscador, bloques de la portada, carrusel, newsletter, redes, productos destacados) se captura del HTML vivo.
5. **Interacciones:** el JavaScript del tema se carga igual que en la referencia (menú móvil, galería, zoom, pestañas). Lo que depende del servidor (carrito, filtros, buscador, login) **no funciona en estático**: se reemplaza según la Dec. 8 y la Fase 5. Mientras tanto, el botón "Añadir al carrito" queda **desactivado visiblemente** o apunta al destino decidido; nunca roto en silencio.
6. **Paginación y orden:** cada página de categoría pasa a ser estática (`?page=2` → ruta propia con redirección `?page=` conservando la URL pública si se puede). Los parámetros de orden y de filtros (`?order=`, `?q=`) no se generan: se explican y se deciden (ver 2.7).
7. **Filtros por facetas (si existen):** opciones (a) filtro en el navegador con los datos ya cargados, (b) quitarlos, (c) mantener solo categorías. Se enseñan con el volumen de tráfico que traen esas URL (Search Console) antes de decidir. Las URL con `?q=` que tengan tráfico llevan redirección o canonical a la categoría.
8. **Buscador:** Pagefind (índice estático en la compilación) o quitarlo; se decide con el propietario.
9. El CSS se copia, no se escribe (igual que V5): hojas en su orden original; el CSS propio solo para lo que no existe y nunca para color, tamaño ni tipografía del contenido.
10. Lo que PrestaShop/Smarty hace al publicar y que hay que reproducir: formato de precio (`1.234,56 €`), `data-*` con JSON de producto, `<meta property="product:price:amount">`, `og:*`, textos de disponibilidad. Se comprueba en el HTML real.
11. Fallos del original a `fallos-original.json` con número de páginas.
12. C3, C4, capturas lado a lado por plantilla (escritorio y móvil), `todo` y `todo:visual` completos.

**Cierre:** `todo` y `todo:visual` a 0, capturas aprobadas, hook `pre-push` puesto.

### FASE 3 — Rediseño (Dec. 4)
Igual que V5 (2 o 3 opciones en imagen, una página de prueba, interruptor `site.rediseno`, hoja propia la última del `<head>`, antes/después medido a 0). Añadir para tienda: **la ficha de producto y la rejilla de categoría son lo que más se mira**; hay que conservar siempre visibles precio, disponibilidad, referencia y botón de compra o de contacto. Foto principal en webp con `srcset`, sin estirar, con `width` y `height`.

### FASE 4 — Contenido nuevo y SEO
Todo desde ficheros de datos; los JSON de catálogo no se editan a mano.

- [ ] `Product` JSON-LD correcto en cada ficha, `BreadcrumbList` en fichas y categorías, `Organization`, `LocalBusiness` si hay tienda física.
- [ ] Texto introductorio y FAQ en categorías (sin enlaces forzados, una sola FAQ por página, con `FAQPage`). Nada inventado.
- [ ] Reseñas: solo las reales exportadas del módulo de opiniones, con su fecha. Nunca se escriben ni se "mejoran".
- [ ] Páginas nuevas con script (`nueva-pagina.mjs`), enlazadas desde menú, rejilla y texto. Ninguna huérfana.
- [ ] Botones descriptivos ("Ver precios", "Pedir presupuesto"), no "Haz clic aquí".
- [ ] Títulos y descripciones duplicados entre productos: se listan y se corrigen **con permiso** (A3.2).
- [ ] Productos desactivados o agotados con tráfico: decisión por producto (mantener con aviso, redirigir a la categoría o al sustituto, 410).
- [ ] Correcciones de texto: solo con permiso, reglas que no se puedan aplicar dos veces, respetando mayúsculas.

### FASE 5 — Compra, formularios y contacto (según Dec. 8)
- **Formularios** (contacto, presupuesto, newsletter): envío AJAX sin salir de la página, aviso con la página de origen, evento de conversión en Analytics. Web3Forms redirige a una página en inglés si no se evita.
- **Si hay compra por enlace externo:** cada ficha lleva su enlace de compra o su producto en el servicio elegido, definidos en `src/data/`. El precio en la ficha y en el servicio de pago tiene que coincidir; se comprueba con un script que falla si no.
- **Si hay presupuesto/WhatsApp:** mensaje precargado con el nombre y la referencia del producto.
- **Obligaciones de venta online** (si se vende): información precontractual, derecho de desistimiento, condiciones de venta, envíos y devoluciones, textos de privacidad y cookies. Se usan los textos vigentes del propietario o de su gestor; Claude no los redacta ni los da por válidos.
- La prueba de envío o de compra real la hace el propietario.

**Cierre:** recibes un envío de prueba de cada formulario y, si hay compra, una compra de prueba completa.

### FASE 6 — Velocidad (sin tocar el diseño)
Como V5: fuera tipografías sin uso, `unicode-range`, `width`/`height` en cada foto, webp con `<picture>` manteniendo el `src` original, sin `loading="lazy"` en las primeras imágenes. Para tienda: **miniaturas con `srcset` por tamaño** (las de `/…-home_default/` para rejillas), y medir sobre la web compilada, no sobre `npm run dev`. El antes y el después dan 0 diferencias (C4).

### FASE 7 — Mudanza al dominio (en este orden)
1. **Volver a bajar precios y stock** (Dec. 9) y regenerar el catálogo; comparar con la referencia del día. Congelar pedidos o avisar de la hora del cambio si se vende.
2. Comprobar que no queda nada por bajar de la web vieja.
3. Tener delante la zona DNS completa.
4. En el hosting nuevo: añadir el dominio y que la orden de compilación genere lo que no está en Git.
5. En el registrador (Dec. 5): registro A de `@` a la IP del hosting nuevo, `www` igual o CNAME, borrar AAAA del hosting viejo, no poner CNAME en la raíz, **no tocar MX, SPF, DKIM, SRV ni TXT** (incluidos los de verificación de Google/Merchant Center).
6. Si se pasan los servidores DNS al hosting nuevo: antes copiar todos los registros de correo y TXT.
7. Comprobar preguntando a los servidores DNS, no al ordenador. HTTPS verificado.
8. Mismo día: quitar `noindex`, activar la redirección de `*.netlify.app` al dominio.
9. **PrestaShop viejo:** pasa a un subdominio de acceso (por ejemplo `antigua.dominio.com`) con `noindex` y protegido con contraseña, o se deja en el hosting sin dominio público. **No se borra** (Dec. 10). Se actualiza lo que dependa del dominio (webhooks de pasarela, transportista, SMTP) y se prueba un pedido si sigue habiendo venta.
10. **Correo:** correo de prueba y envío de cada formulario. Si PrestaShop mandaba correos transaccionales, se comprueba quién los manda ahora.
11. **Redirecciones (la parte crítica en PrestaShop):**
    - URLs con id viejas (`?id_product=34&controller=product`, `?id_category=12&controller=category`) → su URL amigable, no la portada;
    - URLs sin prefijo de idioma si existían;
    - `?page=N`, `?order=`, `?q=` según lo decidido en la Fase 2;
    - productos eliminados: 301 al sustituto o a su categoría, o 410, uno a uno con la lista de Search Console delante;
    - `/index.php?controller=…`, `/authentification`, `/mon-compte`, `/panier`, `/commande`, `/connexion`: a la página que corresponda según la Dec. 8;
    - se comprueba pidiendo cada URL vieja.
12. **Merchant Center / feeds:** el feed de productos debe seguir accesible o regenerarse desde el catálogo nuevo (script a `public/feed.xml`) y cambiarse la URL en Merchant Center **el mismo día**. Si no, los anuncios y fichas de Shopping se paran.
13. **Cookies:** CMP certificado conectado a Analytics (y a los píxeles que haya) antes de que pongan cookies.
14. **Search Console:** enviar `sitemap-index.xml` (que debe incluir todas las fichas, categorías y marcas), comprobar que dan 200, pedir indexación de lo más importante y vigilar las páginas con tráfico durante semanas. Un descenso de indexación de fichas es la primera señal de problema.
15. Hosting viejo un mes más; después copia completa de base de datos, pedidos y facturas **guardada**. Confirmar con tu gestor cuánto tiempo hay que conservarla.

**Cierre:** dominio y `www` por HTTPS con la web nueva, correo funcionando, feed en marcha, sitemap enviado.

### FASE 8 — Auditoría (solo lee)
Entrega una lista y tú dices qué se hace. Se busca: productos sin precio o sin imagen; precios o referencias que no coinciden con el catálogo guardado; títulos y descripciones duplicados; fichas huérfanas; enlaces a productos retirados; redirecciones en cadena; botones a `#` o a rutas de carrito que ya no existen; datos estructurados con errores (prueba de resultados enriquecidos de Google); páginas indexadas que ya no existen; legales desactualizadas.

---

## E. ERRORES QUE YA NOS PASARON

**Los de V5 siguen valiendo** (CSS escrito a ojo, imágenes de fondo sin bajar, correo perdido por pasar DNS sin MX, regla aplicada dos veces, `git add .`, ENOENT por fichero fuera de Git, etc.).

**Riesgos previsibles de PrestaShop (aún no vividos; se confirman o se borran en la primera migración):**

| Riesgo | Por qué | Regla |
|---|---|---|
| Precios publicados distintos de los reales | El catálogo se congela y la tienda vieja siguió vendiendo | Dec. 9 y Fase 7, paso 1 |
| Se pierde el tráfico de categorías con filtros | URL `?q=` indexadas sin redirección | Fase 2, paso 7; redirecciones |
| Fichas con combinaciones que muestran un solo precio | Solo se bajó la base | Fase 1, paso 2 |
| Imágenes de producto rotas | Se bajó `/img/p/` y no las rutas `/{id}-{tamaño}/` que usa el HTML | Fase 1, paso 4 |
| Anuncios de Shopping parados | Feed viejo dejó de responder | Fase 7, paso 12 |
| Pedido cobrado que no llega a ningún sitio | Webhook de la pasarela apuntaba al dominio antiguo | Fase 7, paso 9 |
| Datos de clientes en el repositorio | Se subió un CSV del Back Office | A3.7, A5 |
| Canonical con barra final cuando el original no la lleva | Se copió la configuración de V5 | B1 y C6 |
| Botón de compra que no hace nada | El JS de carrito sigue cargado pero no hay servidor | Fase 2, paso 5 |
| Reseñas o textos de "stock limitado" inventados | Texto generado sin comprobar | A3.4 |
| Se pierde la lista de newsletter | Estaba solo en el PrestaShop | Fase 0 y A3.7 |
| Facturas y pedidos sin copia | Se canceló el hosting | Dec. 10, Fase 7, paso 15 |

---

## F. DETALLES TÉCNICOS DE PRESTASHOP (por confirmar en la Fase 0)

- Plantillas en Smarty (`.tpl`); los bloques los pintan **módulos enganchados a "hooks"**. Para copiar el aspecto se parte del HTML ya renderizado.
- URL amigables con id: `/{id}-{slug}` para categorías y `/{categoria}/{id}-{slug}.html` para productos (a veces con `-{id_combinacion}`), con prefijo `/{iso}/` si hay varios idiomas. Los detalles exactos dependen de la versión y de la configuración SEO de la tienda.
- Miniaturas servidas por una regla de `.htaccess` (`/{id_imagen}-{tipo}/{slug}.jpg`) que apunta a `/img/p/…`. En estático, esa ruta pública se genera como fichero.
- El HTML de la ficha suele traer los datos como JSON en un atributo `data-product` o en `prestashop.*` dentro de un `<script>`; es la mejor fuente para contrastar con el CSV.
- Precios con IVA según país y grupo de cliente: se guarda **solo el precio público visible** salvo que se pida otra cosa.
- Los **tokens** de formularios (`token`, `static_token`) cambian en cada visita: se normalizan al comparar y no se copian.
- Versiones 1.6, 1.7, 8 y 9 difieren en estructura de tema y de URL: Claude anota la versión en la Fase 0 y adapta los selectores de C2.

---

## G. PLANTILLAS

### G1. CLAUDE.md (lo crea Claude en la Fase 0)
```markdown
# [DOMINIO] — migración de PrestaShop a Astro

## Quién manda
[NOMBRE], no técnico: castellano de España, de tú, sin jerga. Lo haces tú.
Cada informe dice el estado del cambio (local / commit / main desplegado).

## Decisiones
Dec. 1 [..] · 2 [..] · 3 [..] · 4 [..] · 5 [..] · 6 [..] · 7 [..]
Dec. 8 (tienda) [..] · Dec. 9 (precios) [..] · Dec. 10 (PrestaShop viejo) [..]
Regla del H1 aprobada: [..]

## Reglas
- Método: PROMPT-MIGRACION-PRESTASHOP-V1.md. Antes de cada fase, lee esa fase y la sección E.
- Contenido original intocable salvo petición (regla + seco + commit propio).
- Nada inventado (precios, stock, plazos, reseñas, normativa). Lo nuevo, desde src/data/.
- URL, rutas de imagen y canonical idénticos al original.
- Datos de clientes nunca al repositorio.
- Desde la Fase 2: 0 fallos en `npm run todo` y `npm run todo:visual` antes de subir.
- Informes en informes/; no listar carpetas enormes.
- Windows: código con barras invertidas, en ficheros.
- Agentes: PROHIBIDO escribir ficheros.

## Datos
PrestaShop [versión] · tema [..] · módulos clave [..] · idiomas [..]
GA4 · WhatsApp · correo · formulario · DNS en [registrador] · repositorio · hosting.
Merchant Center [sí/no, módulo del feed].
Páginas con tráfico (Search Console): [las 10 primeras].

## Estado (se actualiza al cerrar cada fase)
- Fase actual: [n] — falta: [...]
- Hecho: [fase, fecha y commit]
- Pendiente del propietario: [...]
```

### G2. .gitignore
```
node_modules/
dist/
.astro/
*.xml
*.zip
*.log
*.csv
*.sql
exports/
kit/
analisis/
referencia/
informes/
capturas*/
descargas/
*-fallidas.txt
public/css/
```
(No se ignora `src/data/`: ahí vive el catálogo. Se revisa antes del primer `git add` que no contenga datos de clientes.)

### G3. Bloque noindex para la web de pruebas
En `netlify.toml` (o su equivalente en Cloudflare Pages, con `_headers`):
```toml
# Se QUITA el día del cambio de DNS (Fase 7, paso 8), ni antes ni después.
[[headers]]
  for = "/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
```
