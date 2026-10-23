// todo.mjs — pasa todas las comprobaciones en orden y se para en la primera que falla.
//
//   npm run todo          → sin navegador: datos, compilar, validar, encabezados
//   npm run todo:visual   → además, las comprobaciones con navegador (C2, C3, C4, C5 en vivo),
//                           que llegan en la Fase 2. Hasta entonces avisa de que no están.
//
// Cada paso deja su informe en informes/. Si algo falla: código de salida 1 y
// «SE HA PARADO EN: <paso>». Desde la Fase 2 no se sube nada sin 0 fallos.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const VISUAL = process.argv.includes('--visual');
const inicio = Date.now();
const resultados = [];

function paso(nombre, fn) {
  process.stdout.write(`\n=== ${nombre} ===\n`);
  const t = Date.now();
  let ok = true, detalle = '';
  try { const r = fn(); if (r === false) ok = false; else if (typeof r === 'string') detalle = r; }
  catch (e) { ok = false; detalle = e.message; console.log(detalle); }
  resultados.push({ nombre, ok, s: ((Date.now() - t) / 1000).toFixed(1), detalle });
  if (!ok) {
    console.log(`\nSE HA PARADO EN: ${nombre}`);
    informe();
    process.exit(1);
  }
}
function ejecutar(cmd, args) {
  // En Windows npx es npx.cmd; se pasa la orden entera como texto para no usar shell con lista de argumentos.
  const r = process.platform === 'win32'
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}
function informe() {
  const lineas = [
    `# todo${VISUAL ? ':visual' : ''} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '',
    '| paso | resultado | segundos | nota |', '|---|---|---|---|',
    ...resultados.map(r => `| ${r.nombre} | ${r.ok ? 'bien' : '**FALLA**'} | ${r.s} | ${r.detalle} |`),
    '', `Total: ${((Date.now() - inicio) / 1000).toFixed(0)} s. ${resultados.every(r => r.ok) ? '0 fallos.' : 'Parado en el primer fallo.'}`,
  ];
  fs.mkdirSync('informes', { recursive: true });
  fs.writeFileSync('informes/todo.md', lineas.join('\n') + '\n');
  console.log('\n' + lineas.slice(2).join('\n'));
}

// 1. Datos: el catálogo y la estructura existen y se leen.
paso('datos', () => {
  const ficheros = ['src/data/catalogo/es/productos.json', 'src/data/catalogo/es/categorias.json', 'src/data/catalogo/es/cms.json', 'src/data/estructura-viva.json', 'src/data/tema-recursos.json'];
  const notas = [];
  for (const f of ficheros) {
    if (!fs.existsSync(f)) throw new Error(`falta ${f} (pasa npm run extraer / npm run estructura)`);
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    notas.push(`${f.split('/').pop()}: ${Array.isArray(d) ? d.length : Object.keys(d).length}`);
  }
  const productos = JSON.parse(fs.readFileSync(ficheros[0], 'utf8'));
  const sinNombre = productos.filter(p => !p.nombre).length;
  if (sinNombre) throw new Error(`${sinNombre} productos sin nombre`);
  const conPrecioCero = productos.filter(p => p.muestra_precio && !(p.precio_con_iva > 0)).length;
  if (conPrecioCero) throw new Error(`${conPrecioCero} productos con precio visible y precio 0`);
  console.log(notas.join(' · '));
  return notas.join(' · ');
});

// 2. Compilar con Astro.
paso('compilar', () => ejecutar('npx', ['astro', 'build']));

// 3. Validador (C6).
paso('validar', () => ejecutar('node', ['herramientas/validar.mjs']));

// 4. Encabezados (C1).
paso('encabezados', () => ejecutar('node', ['herramientas/comparar-encabezados.mjs']));

// 5. Con navegador (Fase 2): marcado por plantilla, contraste, geometría, 404 en vivo.
if (VISUAL) {
  paso('visual', () => {
    console.log('Las comprobaciones con navegador (C2, C3, C4, C5 en vivo) se escriben en la Fase 2. De momento no hay nada que pasar.');
    return 'pendiente de la Fase 2';
  });
}

informe();
