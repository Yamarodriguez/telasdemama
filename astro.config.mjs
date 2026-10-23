// Configuración de Astro para telasdemama.com.
// Las URL de PrestaShop no llevan barra final y las fichas acaban en .html,
// por eso trailingSlash 'never' y build.format 'file' (B1 del método).
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://telasdemama.com',
  trailingSlash: 'never',
  build: {
    format: 'preserve', // index.astro → carpeta/index.html (la portada es /es/), el resto → nombre.html
    assets: '_astro',
  },
  compressHTML: false,
});
