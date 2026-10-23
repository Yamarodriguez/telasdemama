// Configuración de Astro para telasdemama.com.
// Las URL de PrestaShop no llevan barra final y las fichas acaban en .html,
// por eso build.format 'preserve' (las fichas con .html, las categorías sin extensión) y trailingSlash 'ignore' (B1 del método, adaptado).
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://telasdemama.com',
  // 'ignore' y no 'never': la portada de cada idioma es /es/ (con barra, como en PrestaShop) y las demás URL van sin ella;
  // con 'never' el servidor de vista previa de Astro rechaza /es/. El canonical lo escribe cada página.
  trailingSlash: 'ignore',
  build: {
    format: 'preserve', // index.astro → carpeta/index.html (la portada es /es/), el resto → nombre.html
    assets: '_astro',
  },
  compressHTML: false,
});
