# Ficha técnica: mapas de "Why America keeps losing wars" (CaspianReport)

Fuente: 263 fotogramas (uno cada 4 s, 960×540) extraídos del vídeo local, 17,5 min.
Medición con `reverse-engineering-video` sobre f_0061 (Irán/Golfo), f_0074 (Coreas) y f_0092 (Indochina).

Etiquetas: **[M]** medido · **[O]** observado en fotograma · **[I]** inferido · **[?]** desconocido.

## Qué es y quién lo hace

- Mapas de atlas en 3D inclinado, con fichas y rótulos con serifa, intercalados con archivo en marcos de "pantalla CRT" y gráficos de barras marrones. **[O]**
- Créditos finales: *Animations: Mudassir Riaz*; producción Shirvan Neftchi (f_0255–0263). **[O]**
- "Powered by deltasweep.com" abajo a la derecha de cada mapa. DeltaSweep es el **patrocinador** del vídeo (aparece su app "Pulse" y su logo, f_0245–0254). No hay prueba de que sea la herramienta de los mapas. **[O]/[I]**
- Herramienta de los mapas: **[?]**. Lo compatible con lo visto es After Effects con plugin de mapas o Blender con relieve; no se puede verificar desde los fotogramas. **[I]**

## Mapa base: "atlas antiguo"

| Elemento | Valor | Etiqueta |
|---|---|---|
| Tierra neutra | `#F2DFCF` (28,7 % del fotograma en f_0061), `#DECEBE` en sombra | [M] |
| Relieve | Sombreado gris "grabado" solo visible en montaña (`#C1AFA1`, `#968981`) | [M]/[O] |
| Mar somero / plataforma | `#C4CEC8`, `#BACCC9` | [M] |
| Mar medio | `#A0C3C6`, `#9CC2C4` | [M] |
| Mar profundo | `#77ADB7`, `#72AAB5`, `#57858C`, `#498B9A`, en terrazas escalonadas por profundidad (batimetría) | [M]/[O] |
| Costa | Sin trazo; el contraste lo da el color del mar somero | [O] |
| Fronteras neutras | Línea fina gris cálida (~1 px a 960) | [O] |

## Países protagonistas

| Rol | Color | Etiqueta |
|---|---|---|
| Adversario / foco | `#CB8C5B` (luz) – `#9C6C48` (sombra) | [M] |
| EE. UU. / aliado / avance | `#5C844E` (luz) – `#4C6C41` (sombra) | [M] |
| Bloque comunista (fichas) | Rojo `#C74227` | [M] |

- El relieve se ve a través del color (sombreado multiplicado sobre el relleno). **[O]**
- El país "sobresale": borde oscuro fino y una sombra o canto en el lado opuesto a la luz (Irán, f_0061). **[O]**
- El control territorial cambia de color con un barrido: el verde avanza sobre el naranja (Irak, Vietnam, Afganistán). **[O]**

## Rótulos

- Países: serifa romana en mayúsculas, con mucho espaciado (~0,3–0,4 em), gris oscuro cálido, **tumbados sobre el plano del mapa** (se ven en perspectiva). Ocupan el ancho del país. **[O]**
- Ciudades: punto amarillo `#F2E21E` con contorno oscuro fino; nombre en serifa **cursiva** negra, debajo o al lado. **[O]**
- Océanos: cursiva pequeña espaciada ("Pacific Ocean"). **[O]**

## Cámara y óptica

- Inclinación alta (~45–60°), plano bajo y oblicuo, deriva lenta y continua (empuje o paneo suave). **[O]/[I]**
- Desenfoque de profundidad (tilt-shift): zona nítida desde el 25–37 % de la altura hacia abajo; arriba, desenfocado. Transición "abrupta" en f_0061 y f_0074 y gradual en f_0092. **[M]**
- Viñeta visible: esquina/centro 0,80–0,85. **[M]**
- Sin grano: ruido 0,26–0,43. **[M]**
- Etalonaje: high-key, bajo contraste, negros levantados, cálido; split-tone naranja/amarillo; saturación media 0,20–0,27. **[M]**

## Fichas y efectos

- Fichas hexagonales **de pie** sobre el mapa, con sombra proyectada: borde blanco, fondo de color o blanco, retrato o icono azul marino dentro (BIDEN, OBAMA, SADDAM…). **[O]**
- Siluetas de soldados de pie sobre bases hexagonales verdes o naranjas, alineadas formando un frente. **[O]**
- Anillos rojos de objetivo (doble anillo que late). **[O]**
- Círculos verdes translúcidos de alcance o radar, con un icono de avión. **[O]**
- Barcos y aviones blancos pequeños con sombra y banderita. **[O]**
- Fichas rojas hexagonales con hoz y martillo (efecto dominó). **[O]**

## Marca

- Logo del canal abajo a la izquierda, siempre. "Powered by …" abajo a la derecha en los mapas. **[O]**

## Traducción al portal

| Ficha | Portal |
|---|---|
| Atlas antiguo + batimetría | Estilo **Atlas** |
| Relieve multiplicado sobre el país | Resaltado por debajo del sombreado |
| País que sobresale | Borde oscuro + sombra desplazada |
| Rótulos tumbados con serifa | Cinzel SemiBold (países), EB Garamond Italic (ciudades y mares), alineados al mapa |
| Tilt-shift + viñeta + etalonaje | Desenfoque de profundidad y etalonaje cálido en la vista previa y la exportación |
| Fichas hexagonales de pie | Pin estilo **Ficha** (icono, emoji o imagen subida) |
| Anillos de objetivo / radar | Zona estilo **Objetivo** y **Radar** |
| Barrido de control territorial | Elemento **Territorio** con barrido direccional |
| Logo fijo | Marca de agua (imagen) en el overlay |

Reutilizar el logo del canal, sus retratos o su archivo exige derechos. La técnica se replica libremente.
