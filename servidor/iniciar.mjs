// Arranca Electric Eye en local: el puente con Claude (5175) y el editor (5174), y abre el navegador.
import {execSync, spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {iniciarPuente, puenteActivo, PUERTO} from './puente.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const url = 'http://127.0.0.1:5174/';

/** Windows: termina el proceso que sirve el editor (5174). El puente puede vivir en el conector de Claude: no se toca. */
const apagarAnterior = () => {
  try {
    const pids = new Set(execSync('netstat -ano -p tcp').toString().split(/\r?\n/)
      .filter((l) => /LISTENING/i.test(l) && /:5174\s/.test(l))
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
const yaAbierto = await fetch(url, {signal: AbortSignal.timeout(1500)}).then((r) => r.ok, () => false);
if (yaAbierto) {
  if (process.platform === 'win32' && apagarAnterior()) {
    console.log('\n  Cerrando la sesión anterior de Electric Eye...');
    await new Promise((r) => setTimeout(r, 1500));
  } else {
    console.log(`\n  Electric Eye ya estaba en marcha: ${url}\n`);
    abrirNavegador();
    process.exit(0);
  }
}

if (!(await puenteActivo())) await iniciarPuente();
const vite = await createServer({root: RAIZ, server: {port: 5174, host: '127.0.0.1', strictPort: true}});
await vite.listen();
console.log(`\n  Electric Eye listo: ${url}`);
const {salidas} = await (await fetch(`http://127.0.0.1:${PUERTO}/salud`)).json();
console.log(`  Puente con Claude: http://127.0.0.1:${PUERTO}  ·  vídeos y PNG en ${salidas}\n`);

abrirNavegador();
