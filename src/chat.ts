// Chat con Claude dentro del editor. El servidor local (servidor/chat.mjs) lanza Claude Code con las herramientas
// de Electric Eye y devuelve el avance línea a línea (texto, acciones y errores).
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Markdown mínimo de las respuestas: negritas, cursivas, código y listas con guion. */
const markdown = (t: string) => escapar(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/^- /gm, '• ');

/** 75 → "1:15". */
const reloj = (seg: number) => `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const iniciarChat = () => {
  const panel = $<HTMLElement>('chat');
  const lista = $<HTMLDivElement>('chat-mensajes');
  const texto = $<HTMLTextAreaElement>('chat-texto');
  const enviar = $<HTMLButtonElement>('chat-enviar');
  let ocupado = false;

  const añadir = (clase: string, contenido: string) => {
    const d = document.createElement('div');
    d.className = `chat-msg ${clase}`;
    if (clase === 'claude') d.innerHTML = markdown(contenido);
    else d.textContent = contenido;
    lista.appendChild(d);
    lista.scrollTop = lista.scrollHeight;
    return d;
  };

  const abrir = (si: boolean) => {
    panel.hidden = !si;
    document.body.classList.toggle('con-chat', si);
    try {
      localStorage.setItem('ee-chat', si ? '1' : '0');
    } catch {
      /* sin almacenamiento: da igual */
    }
    window.dispatchEvent(new Event('resize')); // el mapa recalcula su tamaño
    if (si) texto.focus();
  };
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem('ee-chat');
  } catch {
    /* sin almacenamiento */
  }
  abrir(guardado !== '0'); // el chat se abre de entrada: es la forma principal de trabajar
  $('b-chat').addEventListener('click', () => abrir(panel.hidden));
  $('chat-cerrar').addEventListener('click', () => abrir(false));
  $('chat-nuevo').addEventListener('click', async () => {
    await fetch('/api/chat/nuevo', {method: 'POST'}).catch(() => undefined);
    lista.replaceChildren();
    añadir('claude', 'Conversación nueva. ¿Qué mapa hacemos?');
  });

  const mandar = async () => {
    const mensaje = texto.value.trim();
    if (!mensaje || ocupado) return;
    ocupado = true;
    document.body.dataset.chatOcupado = '1'; // no recargar la página mientras Claude trabaja
    enviar.disabled = true;
    enviar.textContent = 'Trabajando…';
    texto.value = '';
    añadir('yo', mensaje);
    const espera = añadir('estado', '');
    const inicio = performance.now();
    let cambios = 0;
    const pintarEstado = (fin = false) => {
      const t = reloj((performance.now() - inicio) / 1000);
      espera.textContent = fin
        ? `⏱ Tiempo: ${t}  ·  ✏️ Modificaciones: ${cambios}`
        : `⏱ ${t}  ·  ✏️ ${cambios} modificaciones  ·  Claude está trabajando…`;
    };
    pintarEstado();
    const tic = window.setInterval(() => pintarEstado(), 1000);
    try {
      const r = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({mensaje})});
      if (!r.ok || !r.body) throw new Error(await r.text());
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let resto = '';
      for (;;) {
        const {done, value} = await lector.read();
        if (done) break;
        resto += dec.decode(value, {stream: true});
        const lineas = resto.split('\n');
        resto = lineas.pop() ?? '';
        for (const l of lineas) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as {tipo: string; texto?: string; modifica?: boolean};
          if (ev.tipo === 'texto') añadir('claude', ev.texto ?? '');
          else if (ev.tipo === 'accion') {
            if (ev.modifica) cambios++;
            // Acciones repetidas seguidas (comprobar la exportación…) se agrupan: "· Comprobando ×4".
            const previo = espera.previousElementSibling as HTMLDivElement | null;
            if (previo && previo.dataset.accion === ev.texto) {
              const n = Number(previo.dataset.n ?? 1) + 1;
              previo.dataset.n = String(n);
              previo.textContent = `· ${ev.texto} ×${n}`;
            } else {
              añadir('accion', `· ${ev.texto}`).dataset.accion = ev.texto;
            }
            lista.appendChild(espera); // el contador siempre al final
          }
          else if (ev.tipo === 'error') añadir('error', ev.texto ?? 'Error');
        }
      }
    } catch (e) {
      añadir('error', `No pude hablar con el servidor de Electric Eye. ¿Está abierta la ventana negra? (${(e as Error).message})`);
    } finally {
      window.clearInterval(tic);
      pintarEstado(true);
      lista.appendChild(espera);
      lista.scrollTop = lista.scrollHeight;
      ocupado = false;
      delete document.body.dataset.chatOcupado;
      enviar.disabled = false;
      enviar.textContent = 'Enviar';
    }
  };

  // Tiempo de render: el editor avisa al empezar y al terminar cada exportación.
  let render: {nodo: HTMLDivElement; tic: number; inicio: number} | null = null;
  window.addEventListener('ee-exportacion', (e) => {
    const d = (e as CustomEvent).detail as {fase: string; inicio: number; segundos?: number; ruta?: string; mb?: number; error?: string; calidad?: string};
    if (d.fase === 'renderizando' && !render) {
      const nodo = añadir('estado render', '');
      const pintar = () => (nodo.textContent = `🎬 Renderizando… ${reloj((Date.now() - d.inicio) / 1000)}`);
      pintar();
      render = {nodo, tic: window.setInterval(pintar, 1000), inicio: d.inicio};
      return;
    }
    if (d.fase !== 'renderizando') {
      const r = render ?? {nodo: añadir('estado render', ''), tic: 0, inicio: d.inicio};
      window.clearInterval(r.tic);
      const seg = d.segundos ?? (Date.now() - r.inicio) / 1000;
      r.nodo.textContent = d.fase === 'listo'
        ? `🎬 Render: ${reloj(seg)}${d.mb ? `  ·  ${d.mb} MB` : ''}${d.ruta ? `\n📁 ${d.ruta}` : ''}${d.calidad ? `\n🔎 ${d.calidad}` : ''}`
        : `🎬 El render falló tras ${reloj(seg)}: ${d.error ?? ''}`;
      render = null;
    }
  });

  // Sugerencias de un clic: rellenan el cuadro para editar o enviar.
  lista.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-texto]') as HTMLButtonElement | null;
    if (!b) return;
    texto.value = b.dataset.texto ?? '';
    texto.focus();
  });

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void mandar();
  });
  texto.addEventListener('keydown', (e) => {
    e.stopPropagation(); // los atajos del editor (Espacio, K, Supr…) no deben saltar mientras escribes
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void mandar();
    }
  });
};
