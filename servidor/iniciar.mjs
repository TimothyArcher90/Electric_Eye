// Arranca Electric Eye en local: el puente con Claude (5175) y el editor (5174), y abre el navegador.
import {execSync, spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {build, preview} from 'vite';
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
// El editor se sirve ya compilado (dist/), no con el servidor de desarrollo: así no depende de cachés que
// se quedan viejas tras una actualización (la página salía en blanco, sin estilos). Se recompila solo si
// cambió el código.
const masReciente = (ruta) => {
  const st = statSync(ruta);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(0, ...readdirSync(ruta).map((f) => masReciente(join(ruta, f))));
};
const compilado = join(RAIZ, 'dist', 'index.html');
const fuentes = ['src', 'index.html', 'package.json', 'vite.config.ts'].map((f) => join(RAIZ, f)).filter(existsSync);
if (!existsSync(compilado) || Math.max(...fuentes.map(masReciente)) > statSync(compilado).mtimeMs) {
  console.log('  Preparando el editor (solo tras una actualización, tarda unos segundos)...');
  await build({root: RAIZ, logLevel: 'error'});
}
await preview({root: RAIZ, preview: {port: 5174, host: '127.0.0.1', strictPort: true}, logLevel: 'error'});
console.log(`\n  Electric Eye listo: ${url}`);
abrirNavegador();
console.log('  Deja esta ventana abierta. Si el navegador no se abrió, entra en esa dirección a mano.');
const salud = await fetch(`http://127.0.0.1:${PUERTO}/salud`, {signal: AbortSignal.timeout(3000)}).then((r) => r.json(), () => null);
console.log(salud ? `  Puente con Claude: activo  ·  vídeos y PNG en ${salud.salidas}\n` : '  Puente con Claude: no responde (reinicia la app de Claude).\n');
