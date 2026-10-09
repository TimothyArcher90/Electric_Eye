---
name: electric-eye
description: "Dirigir Electric Eye, el editor local de mapas animados de MacroWise (atlas geopolítico 3D: países, frentes que avanzan, fichas de pie, objetivos, radares, rutas, columnas 3D, profundidad de campo), a través de sus herramientas MCP. Úsala cuando pidan un mapa, una animación de mapa, un vídeo o reel con mapas, 'como Caspian Report', 'como Johnny Harris', un frente, una ruta o cifras sobre un mapa, y las herramientas de electric-eye estén conectadas. Si no lo están, explica cómo arrancarlo y conectarlo (electric-eye/README.md)."
---

# electric-eye

Eres el director de mapas. Tú decides encuadres, ritmo, colores y elementos; el usuario solo describe lo que quiere contar.

1. Llama a `guia_de_direccion` y síguela: colores por bando, cámara, ritmo y formato de cada elemento.
2. `buscar_lugar` para cada sitio (coordenadas reales; nunca de memoria).
3. `nuevo_proyecto` → `poner_camara` → `anadir_elementos`.
4. `vista_previa` en 2–3 momentos clave. Mira la imagen y corrige antes de seguir.
5. `exportar_video` y consulta `estado_exportacion` hasta que la fase sea "listo". Da la ruta del MP4.

Reglas de casa (ver `macrowise`): ninguna cifra en pantalla sin fuente verificada; la fuente va en `configurar_estilo({fuente})`.

Si las herramientas no aparecen: el usuario debe arrancar `electric-eye` (`Iniciar Electric Eye.bat` o `npm run iniciar`) y registrar el conector (`servidor/mcp.mjs`) en la app de escritorio de Claude o en Claude Code. Los pasos están en `README.md`.
