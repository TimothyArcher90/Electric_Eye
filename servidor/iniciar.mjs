// Arranca Electric Eye en local: el puente con Claude (5175) y el editor (5174), y abre el navegador.
import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {iniciarPuente, puenteActivo, PUERTO} from './puente.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!(await puenteActivo())) await iniciarPuente();
const vite = await createServer({root: RAIZ, server: {port: 5174, host: '127.0.0.1', strictPort: true}});
await vite.listen();
const url = 'http://127.0.0.1:5174/';
console.log(`\n  Electric Eye listo: ${url}`);
const {salidas} = await (await fetch(`http://127.0.0.1:${PUERTO}/salud`)).json();
console.log(`  Puente con Claude: http://127.0.0.1:${PUERTO}  ·  vídeos y PNG en ${salidas}\n`);

if (!process.env.EE_SIN_NAVEGADOR) {
  const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(abrir[0], abrir[1], {stdio: 'ignore', detached: true}).on('error', () => undefined).unref();
}
