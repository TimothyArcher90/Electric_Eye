// Chat con Claude dentro del editor. Cada mensaje lanza Claude Code en modo no interactivo (`claude -p`) con
// solo las herramientas de Electric Eye. Usa la cuenta con la que hayas entrado en Claude Code (tu suscripción)
// o, si existe, la variable ANTHROPIC_API_KEY. La conversación continúa con --resume.
import {execSync, spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_MCP = join(tmpdir(), 'electric-eye', 'mcp.json');
mkdirSync(dirname(CONFIG_MCP), {recursive: true});
writeFileSync(CONFIG_MCP, JSON.stringify({
  mcpServers: {'electric-eye': {command: process.execPath, args: [join(RAIZ, 'servidor', 'mcp.mjs')]}},
}));

const INSTRUCCIONES = [
  'Hablas con el usuario desde el chat integrado de Electric Eye, su editor de mapas animados.',
  'Todo lo haces con las herramientas de electric-eye: lee guia_de_direccion antes de dirigir, usa buscar_lugar,',
  'revisa con vista_previa antes de exportar y, al exportar, consulta estado_exportacion hasta "listo" y da la ruta.',
  'El usuario ve el editor a la vez que el chat: responde en español, breve y claro, sin jerga técnica.',
  'Al terminar una pieza dile que pulse ▶ (o la barra espaciadora) para verla animada, y pregunta si la exportas.',
  'Mapas siempre atractivos: estilo atlas salvo que pida otro, un protagonista por plano, cámara inclinada que se mueve.',
  'Solo lo que cuenta la historia: nada de rótulos o detalles que no se pidan. Para ofensivas usa rutas estilo "ataque".',
  'El render va en segundo plano: el usuario puede cerrar la pestaña. Al terminar revisa calidad.saltos y corrige si hay.',
].join(' ');

const INSTRUCCIONES_ARCHIVO = join(dirname(CONFIG_MCP), 'instrucciones.txt');
writeFileSync(INSTRUCCIONES_ARCHIVO, INSTRUCCIONES);

/** Ruta del ejecutable de Claude Code. En Windows puede ser claude.exe (instalador) o claude.cmd (npm). */
const ejecutableClaude = () => {
  if (process.platform !== 'win32') return 'claude';
  try {
    const rutas = execSync('where claude', {stdio: ['ignore', 'pipe', 'ignore']}).toString().split(/\r?\n/).filter(Boolean);
    return rutas.find((r) => /\.exe$/i.test(r)) ?? rutas.find((r) => /\.cmd$/i.test(r)) ?? 'claude';
  } catch {
    return 'claude';
  }
};
const comillas = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

let sesion = null; // id de la conversación de Claude Code, para seguir el hilo
let enCurso = null;

const linea = (res, datos) => res.write(`${JSON.stringify(datos)}\n`);

const NOMBRES = {
  guia_de_direccion: 'Leyendo la guía', buscar_lugar: 'Buscando lugares', nuevo_proyecto: 'Creando el proyecto',
  configurar_estilo: 'Ajustando el estilo', cambiar_formato: 'Cambiando el formato', poner_camara: 'Moviendo la cámara',
  anadir_elementos: 'Añadiendo elementos', editar_elemento: 'Editando', borrar_elementos: 'Borrando',
  vista_previa: 'Revisando un fotograma', exportar_png: 'Guardando PNG', exportar_video: 'Exportando el vídeo',
  estado_exportacion: 'Comprobando la exportación', guardar_proyecto: 'Guardando el proyecto',
  abrir_proyecto: 'Abriendo proyecto', ver_estado: 'Mirando el editor', carpeta_de_salida: 'Carpeta de salida',
};

const MODIFICAN = new Set(['nuevo_proyecto', 'configurar_estilo', 'cambiar_formato', 'poner_camara', 'anadir_elementos',
  'editar_elemento', 'borrar_elementos', 'abrir_proyecto']);

export const reiniciarChat = () => {
  enCurso?.kill();
  sesion = null;
};

export const manejarChat = (mensaje, res) => {
  res.writeHead(200, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache'});
  if (enCurso) {
    linea(res, {tipo: 'error', texto: 'Claude sigue con el encargo anterior. Espera a que termine.'});
    return res.end();
  }
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--mcp-config', CONFIG_MCP, '--strict-mcp-config',
    '--allowedTools', 'mcp__electric-eye',
    '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch',
    '--append-system-prompt-file', INSTRUCCIONES_ARCHIVO];
  if (sesion) args.push('--resume', sesion);

  // Un .exe se lanza directo; un .cmd necesita la consola de Windows (y comillas en los argumentos).
  const exe = ejecutableClaude();
  const conShell = process.platform === 'win32' && !/\.exe$/i.test(exe);
  const hijo = spawn(conShell ? comillas(exe) : exe, conShell ? args.map(comillas) : args,
    {cwd: RAIZ, shell: conShell, windowsHide: true});
  enCurso = hijo;
  let resto = '';
  let error = '';
  let terminado = false;

  hijo.stdout.on('data', (trozo) => {
    resto += trozo.toString('utf8');
    const lineas = resto.split('\n');
    resto = lineas.pop() ?? '';
    for (const l of lineas) {
      if (!l.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(l);
      } catch {
        continue;
      }
      if (ev.session_id) sesion = ev.session_id;
      if (ev.type === 'assistant') {
        for (const b of ev.message?.content ?? []) {
          if (b.type === 'text' && b.text.trim()) linea(res, {tipo: 'texto', texto: b.text});
          if (b.type === 'tool_use') {
            const corto = String(b.name).replace(/^mcp__electric-eye__/, '');
            // Las internas (ToolSearch…) no se muestran. "modifica" cuenta los cambios hechos al mapa.
            if (NOMBRES[corto]) linea(res, {tipo: 'accion', texto: NOMBRES[corto], modifica: MODIFICAN.has(corto)});
          }
        }
      }
      if (ev.type === 'result') {
        terminado = true;
        if (ev.is_error) linea(res, {tipo: 'error', texto: String(ev.result ?? 'Claude no pudo terminar.')});
      }
    }
  });
  hijo.stderr.on('data', (t) => {
    error += t.toString('utf8');
  });
  hijo.on('error', () => {
    linea(res, {tipo: 'error', texto: 'No encuentro Claude Code en este ordenador. Instálalo (https://claude.com/claude-code), ' +
      'abre una terminal, escribe "claude" y entra con tu cuenta. Después vuelve a escribir aquí.'});
  });
  hijo.on('close', (codigo) => {
    enCurso = null;
    if (!terminado && codigo !== 0 && codigo !== null) {
      const pista = /log ?in|auth|credential|api key/i.test(error)
        ? 'Claude Code no tiene la sesión iniciada: abre una terminal, escribe "claude" y entra con tu cuenta.'
        : `Claude Code terminó con un error. ${error.trim().split('\n').slice(-3).join(' ')}`.trim();
      linea(res, {tipo: 'error', texto: pista});
    }
    linea(res, {tipo: 'fin'});
    res.end();
  });
  hijo.stdin.end(mensaje);
};
