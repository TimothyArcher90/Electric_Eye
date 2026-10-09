// Arranca Electric Eye en local: el puente con Claude (5175) y el editor (5174), y abre el navegador.
import {execSync, spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, normalize, sep} from 'node:path';
import {iniciarPuente, puenteActivo, PUERTO} from './puente.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const url = 'http://127.0.0.1:5174/';

/** Windows: termina los procesos que escuchan en un puerto. Devuelve si había alguno. */
const liberarPuerto = (puerto) => {
  try {
    const pids = new Set(execSync('netstat -ano -p tcp').toString().split(/\r?\n/)
      .filter((l) => /LISTENING/i.test(l) && new RegExp(`:${puerto}\\s`).test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((pid) => pid && pid !== '0' && pid !== String(process.pid)));
    for (const pid of pids) execSync(`taskkill /F /PID ${pid}`, {stdio: 'ignore'});
    return pids.size > 0;
  } catch {
    return false;
  }
};
const abrirNavegador = () => {
  if (process.env.EE_SIN_NAVEGADOR) return;
  const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(abrir[0], abrir[1], {stdio: 'ignore', detached: true}).on('error', () => undefined).unref();
};

// Si ya estaba abierto (otra ventana o una versión anterior), se apaga y se arranca de nuevo: así un
// doble clic en el icono siempre deja en marcha la versión recién actualizada.
console.log('\n  Arrancando Electric Eye...');
const yaAbierto = await fetch(url, {signal: AbortSignal.timeout(1500)}).then((r) => r.ok, () => false);
if (yaAbierto) {
  if (process.platform === 'win32' && liberarPuerto(5174)) {
    console.log('\n  Cerrando la sesión anterior de Electric Eye...');
    await new Promise((r) => setTimeout(r, 1500));
  } else {
    console.log(`\n  Electric Eye ya estaba en marcha: ${url}\n`);
    abrirNavegador();
    process.exit(0);
  }
}

// Puente con Claude: si ya hay uno sano (por ejemplo, el del conector de la app de Claude) se usa ese. Si el
// puerto está ocupado por un proceso que no responde, en Windows se libera y se arranca uno nuevo.
if (!(await puenteActivo())) {
  try {
    await iniciarPuente();
  } catch {
    if (process.platform === 'win32' && liberarPuerto(PUERTO)) await new Promise((r) => setTimeout(r, 1000));
    try {
      if (!(await puenteActivo())) await iniciarPuente();
    } catch (e) {
      console.log(`  Aviso: el puente con Claude no arrancó (${e.message}). El editor se abre igual.`);
    }
  }
}
// El editor viaja ya compilado en dist/ (dentro del repositorio): aquí solo se sirven archivos, sin compilar
// nada ni depender de Vite. Así arranca en un segundo y no hay cachés que se queden viejas.
const DIST = join(RAIZ, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.log('  Falta la carpeta dist/ del editor. Compilando (solo esta vez)...');
  const {build} = await import('vite');
  await build({root: RAIZ, logLevel: 'error'});
}
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.pbf': 'application/x-protobuf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};
const web = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url ?? '/', url).pathname);
  let archivo = normalize(join(DIST, ruta.endsWith('/') ? `${ruta}index.html` : ruta));
  if (!archivo.startsWith(DIST + sep) && archivo !== DIST) archivo = join(DIST, 'index.html');
  if (!existsSync(archivo) || statSync(archivo).isDirectory()) {
    res.writeHead(404).end('No encontrado');
    return;
  }
  res.writeHead(200, {'Content-Type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache'});
  createReadStream(archivo).pipe(res);
});
await new Promise((ok, mal) => {
  web.once('error', mal);
  web.listen(5174, '127.0.0.1', ok);
});
console.log(`\n  Electric Eye listo: ${url}`);
abrirNavegador();
console.log('  Deja esta ventana abierta. Si el navegador no se abrió, entra en esa dirección a mano.');
const salud = await fetch(`http://127.0.0.1:${PUERTO}/salud`, {signal: AbortSignal.timeout(3000)}).then((r) => r.json(), () => null);
console.log(salud ? `  Puente con Claude: activo  ·  vídeos y PNG en ${salud.salidas}\n` : '  Puente con Claude: no responde (reinicia la app de Claude).\n');
