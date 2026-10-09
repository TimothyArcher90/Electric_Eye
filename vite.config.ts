import {defineConfig} from 'vite';

// Identificador de cada compilación: va dentro del editor y en dist/version.json. Si el servidor tiene una
// compilación más nueva que la pestaña abierta, el editor se recarga solo (ver src/version.ts).
const COMPILACION = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: {__COMPILACION__: JSON.stringify(COMPILACION)},
  build: {target: 'es2022', chunkSizeWarningLimit: 2000},
  plugins: [{
    name: 'version',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: JSON.stringify({compilacion: COMPILACION})});
    },
  }],
});
