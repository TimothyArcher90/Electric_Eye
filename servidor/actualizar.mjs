// Pone Electric Eye al día antes de arrancar: baja los cambios del repositorio (git pull) y, si cambiaron
// las dependencias, las instala. Si no hay git o no hay conexión, sigue con la versión que hay.
import {execSync, spawnSync} from 'node:child_process';
import {existsSync, rmSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// safe.directory: en discos sin dueño de archivos (FAT/exFAT, como suele ser D:) git se niega a trabajar sin él.
const SEGURO = `-c safe.directory="${RAIZ.replace(/\\/g, '/')}"`;
const ENTORNO = {...process.env, GIT_TERMINAL_PROMPT: '0'}; // nunca pedir usuario o contraseña: fallaría en silencio
const git = (args) => execSync(`git ${SEGURO} ${args}`, {cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], env: ENTORNO})
  .toString().trim();

try {
  if (!existsSync(join(RAIZ, '.git'))) throw new Error('sin repositorio');
  // Un git cortado a medias deja este candado y bloquea todos los pull siguientes.
  const candado = join(RAIZ, '.git', 'index.lock');
  if (existsSync(candado) && Date.now() - statSync(candado).mtimeMs > 2 * 60 * 1000) rmSync(candado);
  // Archivos que se regeneran solos (npm install, compilación local): sus cambios locales no deben frenar la actualización.
  for (const ruta of ['package-lock.json', 'dist']) {
    try {
      git(`checkout -- ${ruta}`);
    } catch {
      /* no existe en esta versión o no había cambios */
    }
  }
  const antes = git('rev-parse HEAD');
  console.log('  Buscando actualizaciones...');
  // Sin límite de tiempo corto: cortar un pull a medias puede dejar el programa roto. La salida se ve en pantalla.
  const r = spawnSync(`git ${SEGURO} pull --ff-only`, {cwd: RAIZ, stdio: 'inherit', shell: true, env: ENTORNO, timeout: 15 * 60 * 1000});
  if (r.status !== 0) throw new Error('git pull no terminó bien');
  const despues = git('rev-parse HEAD');
  if (antes === despues) {
    console.log('  Electric Eye está al día.');
  } else {
    console.log('  Electric Eye actualizado.');
    const cambios = git(`diff --name-only ${antes} ${despues}`).split('\n');
    if (cambios.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      console.log('  Instalando dependencias nuevas...');
      spawnSync('npm', ['install'], {cwd: RAIZ, stdio: 'inherit', shell: true});
    }
  }
} catch (e) {
  console.log(`  No se pudo buscar actualizaciones (${e.message.split('\n')[0]}). Sigo con la versión instalada.`);
}
if (!existsSync(join(RAIZ, 'node_modules'))) spawnSync('npm', ['install'], {cwd: RAIZ, stdio: 'inherit', shell: true});
