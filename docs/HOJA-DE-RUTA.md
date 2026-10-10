# Electric Eye · hoja de ruta hacia el nivel Caspian Report

Estado a 10/10/2026. Lo que se compara con Caspian Report sale de medir fotogramas de un vídeo suyo
(`referencias/caspian-report-ficha.md`). No sabemos con qué programa hacen sus mapas.

## 1. Qué tenemos

| Área | Qué hace Electric Eye hoy | Comprobado |
|---|---|---|
| Mapa base | Estilo Atlas con la paleta medida, relieve fijo tipo grabado (solo montañas), mar en terrazas por profundidad, costas sin trazo, fronteras finas | Vista previa y vídeo |
| Estabilidad | Sin "hervor" de tierra ni mar; cámara continua sin paradas; control de saltos en cada render | Medido: 0 saltos, textura −70 % |
| Rótulos | Solo los países de la historia, en serifa tumbada sobre el mapa; aparecen cuando el país entra | Vídeo |
| Fichas | Hexágonos de pie con canto, peanas (soldados de pie sobre base hexagonal), unidades blancas con banderita, retratos | Vista previa |
| Iconos | 19 siluetas propias: soldado, infante, tanque, barco, submarino, avión, helicóptero, dron, dron de ala fija, Shahed, enjambre, misil, explosión, ancla, nuclear, petróleo, fábrica, mando, satélite | Hoja de iconos |
| Movimiento | Flechas de ataque en 3D que avanzan, rutas que se dibujan, unidades que viajan por la ruta (drones, misiles, aviones), frentes que barren un país, objetivos que laten, radares, columnas 3D | Vista previa |
| Texto | Títulos en Oswald con barra de acento, rótulos de papel, fuente en pantalla | Vídeo |
| Óptica | Desenfoque de profundidad, viñeta, etalonaje cálido, desenfoque de movimiento opcional | Vídeo |
| Formatos | 16:9, 9:16 (Reel, con zona segura), 4:5, 1:1, 4K | Vídeo |
| Flujo | Chat dentro del editor → Claude monta, revisa y exporta → render en segundo plano → control de calidad → archivo en `D:\ElectricEye\salidas` | Prueba de punta a punta |

## 2. Qué falta para ser más Caspian

Por orden de impacto en pantalla:

1. **Recortes de archivo en marco** (foto o vídeo dentro de un marco tipo pantalla CRT o recorte de periódico) que
   entran sobre el mapa. Caspian intercala archivo constantemente. → Elemento `recorte` (imagen o vídeo + marco).
2. **Gráficos de datos sobre el mapa** (barras marrones, cifras grandes). → Elemento `grafico` en el overlay.
3. **Retratos en fichas** (líderes): ya se puede subir una imagen, pero falta una biblioteca y recorte automático.
4. **Banderas reales** en fichas y unidades (ahora es un paño del color del bando).
5. **Modelos 3D reales** (tanques, barcos en glTF) con Three.js sobre el mapa. Hoy son siluetas con volumen ilustrado,
   que mantienen el tamaño en pantalla como en la referencia; modelos reales serían el salto siguiente.
6. **Guion → escenas**: pegar el guion de un vídeo y que Claude proponga y monte una pieza por párrafo, con duración
   ajustada a la locución.
7. **Fronteras en disputa** marcadas (Crimea, Cachemira, Sáhara Occidental) con trama.
8. **Plantillas de escena** reutilizables (bloqueo naval, ofensiva terrestre, ruta comercial, alcance de misiles).

## 3. Cómo lo organizamos

```
Guion ──► Escenas (Claude) ──► Electric Eye (chat) ──► Render en segundo plano ──► Control de calidad ──► Edición final
                                    ▲                                                     │
                                    └──────────── correcciones automáticas ◄──────────────┘
```

- **Motor** (`src/`): el mapa y sus elementos. Cambios visuales siempre con prueba de render y medición.
- **Dirección** (`servidor/guia-de-direccion.md`): las reglas de estilo que sigue Claude. Cada lección de un vídeo
  revisado se convierte en una regla aquí.
- **Producción** (`servidor/render.mjs`, `scripts/analizar-video.py`): render, control de calidad y análisis.

## 4. Cómo trabajarlo de forma profesional

1. **Una pieza = un párrafo del guion** (8–20 s). Nada de piezas largas: se revisan y corrigen mejor.
2. **Pedir siempre** formato, duración, protagonista, acción en orden y título (ver la fórmula en el chat).
3. **Revisar en el editor con ▶** antes de exportar; exportar la final a 30 fps.
4. **Control de calidad**: si el chat avisa de saltos, pedir "corrige los saltos y exporta otra vez".
5. **Mandar cada vídeo final** para análisis cuando algo no convenza: cada problema encontrado se corrige en el motor
   y en la guía, para que no vuelva a pasar.
6. **Edición final** en Premiere o CapCut: locución, música y archivo entre mapas.
