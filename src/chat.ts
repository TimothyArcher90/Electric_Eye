// Chat con Claude dentro del editor. El servidor local (servidor/chat.mjs) lanza Claude Code con las herramientas
// de Electric Eye y devuelve el avance línea a línea (texto, acciones y errores).
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Markdown mínimo de las respuestas: negritas, cursivas, código y listas con guion. */
const markdown = (t: string) => escapar(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/^- /gm, '• ');

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
    enviar.disabled = true;
    enviar.textContent = 'Trabajando…';
    texto.value = '';
    añadir('yo', mensaje);
    const espera = añadir('accion', 'Claude está pensando…');
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
          const ev = JSON.parse(l) as {tipo: string; texto?: string};
          if (ev.tipo === 'texto') añadir('claude', ev.texto ?? '');
          else if (ev.tipo === 'accion') añadir('accion', `· ${ev.texto}`);
          else if (ev.tipo === 'error') añadir('error', ev.texto ?? 'Error');
        }
      }
    } catch (e) {
      añadir('error', `No pude hablar con el servidor de Electric Eye. ¿Está abierta la ventana negra? (${(e as Error).message})`);
    } finally {
      espera.remove();
      ocupado = false;
      enviar.disabled = false;
      enviar.textContent = 'Enviar';
    }
  };

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
