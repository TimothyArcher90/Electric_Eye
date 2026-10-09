// Pone Electric Eye al día antes de arrancar: baja los cambios del repositorio (git pull) y, si cambiaron
// las dependencias, las instala. Si no hay git o no hay conexión, sigue con la versión que hay.
import {execSync, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// safe.directory: en discos sin dueño de archivos (FAT/exFAT, como suele ser D:) git se niega a trabajar sin él.
const git = (args) => execSync(`git -c safe.directory="${RAIZ.replace(/\\/g, "/")}" ${args}`, {cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000}).toString().trim();

try {
  if (!existsSync(join(RAIZ, '.git'))) throw new Error('sin repositorio');
  const antes = git('rev-parse HEAD');
  git('pull --ff-only');
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
