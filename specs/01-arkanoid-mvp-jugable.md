# SPEC 01 — Arkanoid MVP jugable

> **Estado:** Implementado
> **Depende de:** Ninguna
> **Fecha:** 2026-11-16
> **Objetivo:** Un Arkanoid de un solo nivel, jugable en el navegador con teclado y ratón, con vidas, puntuación, sonidos, explosiones y pantallas de inicio, pausa, victoria y derrota.

## Por qué existe esta spec

El repositorio solo tiene assets (`assets/spritesheet.js`, `assets/spritesheet-breakout.png` y `assets/sounds/`). Esta spec define el primer juego completo de punta a punta. Así, las specs siguientes (niveles, power-ups, récords) tienen una base jugable sobre la que construir.

## Alcance

**Dentro:**

- `index.html`, `styles.css` y `game.js` en la raíz del repo, sin dependencias ni build.
- Canvas lógico fijo de 448×512, centrado y escalado con CSS manteniendo la proporción.
- HUD dibujado en el canvas, en una franja superior de 32 px: la puntuación a la izquierda y las vidas a la derecha.
- Paleta controlada con flechas ←/→, con A/D y con el ratón.
- Pelota que arranca pegada a la paleta y se lanza con Espacio o clic.
- Rebote en la paleta con un ángulo que depende de la zona de impacto.
- Velocidad de la pelota que aumenta cada 5 bloques rotos, con un tope.
- Muro de 6 filas × 13 columnas. Cada fila es de un color, con puntos según la fila. Todos los bloques se rompen de un golpe.
- Animación de explosión de 4 frames al romper un bloque, usando `EXPLOSION_FRAMES`.
- Sonidos `ball-bounce.mp3` (rebote en la paleta y las paredes) y `break-sound.mp3` (bloque roto).
- 3 vidas. Al perder una, la pelota vuelve a la paleta.
- Estados: pantalla de inicio, saque, jugando, pausa (P o Esc), victoria y derrota. Desde victoria o derrota, Espacio reinicia la partida.
- Paso 0: `git init` del repositorio.

**Fuera de alcance (para futuras specs):**

- Varios niveles o patrones de muro dibujados.
- Bloques grises o con varios golpes de resistencia.
- Power-ups.
- Récords o cualquier persistencia (localStorage incluido).
- Controles táctiles y versión móvil.
- Canvas adaptable a pantalla completa.
- Música de fondo, control de volumen y botón de silencio.
- Pausa automática al perder el foco de la ventana.

## Modelo de datos

Todo vive en `game.js`, en un único objeto `state` más una serie de constantes. `assets/spritesheet.js` aporta los globales `SPRITES`, `EXPLOSION_FRAMES`, `EXPLOSION_DURATION`, `loadSpritesheet`, `drawSprite` y `drawFrame`.

```js
// Constantes de diseño (px y px/s)
const WIDTH = 448, HEIGHT = 512, HUD_H = 32;
const PADDLE_W = 80, PADDLE_H = 14, PADDLE_Y = 472, PADDLE_SPEED = 420;
const BALL_SIZE = 12;
const BALL_SPEED_START = 300, BALL_SPEED_STEP = 20, BALL_SPEED_MAX = 520;
const BRICKS_PER_SPEEDUP = 5;
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° respecto a la vertical
const BRICK_W = 32, BRICK_H = 16, BRICK_COLS = 13, BRICK_OFFSET_X = 16, BRICK_OFFSET_Y = 64;
const LIVES_START = 3;

// Filas de arriba abajo
const ROWS = [
  { color: 'red',     points: 60 },
  { color: 'yellow',  points: 50 },
  { color: 'cyan',    points: 40 },
  { color: 'magenta', points: 30 },
  { color: 'hotpink', points: 20 },
  { color: 'green',   points: 10 },
];

const state = {
  phase: 'ready',          // 'ready' | 'serve' | 'playing' | 'paused' | 'won' | 'lost'
  pausedFrom: null,        // 'serve' | 'playing': adónde vuelve al quitar la pausa
  score: 0,
  lives: LIVES_START,
  bricksBroken: 0,
  paddle: { x: 184 },      // borde izquierdo; y fijo = PADDLE_Y
  ball: { x: 0, y: 0, vx: 0, vy: 0, speed: BALL_SPEED_START },
  bricks: [/* { x, y, color, points, alive: true } */],
  explosions: [/* { x, y, color, start } */], // start = timestamp en ms
  input: { left: false, right: false, mouseX: null },
};
```

Convenciones:

- Coordenadas con el origen arriba a la izquierda, en píxeles lógicos del canvas (448×512).
- Velocidades en px/s, multiplicadas por `dt` en segundos. `dt` se limita a un máximo de 1/30 s.
- El ratón se convierte a coordenadas lógicas con `getBoundingClientRect()`, porque el canvas se escala con CSS.
- `EXPLOSION_DURATION` (150 ms) se interpreta como la duración **de cada frame**. Una explosión dura 600 ms y luego se elimina.
- Muro: 13 × 32 = 416 px más 16 px de margen a cada lado, lo que suma 448. Las filas ocupan de y = 64 a y = 160.
- Puntuación máxima del nivel: 13 × (60+50+40+30+20+10) = 2730.

## Plan de implementación

0. Ejecutar `git init` y crear `.gitignore` con `.DS_Store`. Hacer el commit inicial con los assets, `README.md`, `CLAUDE.md`, `skills-lock.json`, `.claude/` y `specs/`.
1. Crear `index.html` (canvas 448×512, cargando `assets/spritesheet.js` y después `game.js` como scripts clásicos) y `styles.css` (fondo oscuro, canvas centrado y escalado con `aspect-ratio`, `image-rendering: pixelated`). Crear `game.js` con las constantes, `state` y el bucle `requestAnimationFrame` con `dt`, arrancado dentro de `loadSpritesheet`. Prueba manual: servir con `python3 -m http.server` y ver el canvas negro centrado sin errores en la consola.
2. Paleta: dibujarla con `drawSprite(ctx, 'paddle', ...)` a 80×14. Moverla con ←/→ y A/D (`keydown`/`keyup`) y con `mousemove`, limitada a los bordes. Prueba manual: se mueve con las dos formas de control y no se sale del canvas.
3. Pelota y saque: en la fase `serve` la pelota sigue al centro de la paleta. Espacio o clic la lanzan hacia arriba a `BALL_SPEED_START`. Rebota en las paredes laterales y en el techo (y = `HUD_H`). Si cae por debajo del canvas, vuelve a `serve`, todavía sin restar vidas. Prueba manual: lanzar, ver los rebotes y ver que vuelve a la paleta.
4. Rebote en la paleta por zona: `offset = (centroPelota − centroPaleta) / (PADDLE_W / 2)`, limitado a [−1, 1]. El ángulo es `offset × MAX_BOUNCE_ANGLE` respecto a la vertical, conservando `ball.speed`. Reproducir `ball-bounce.mp3` en cada rebote contra la paleta o una pared. Prueba manual: golpear con los extremos de la paleta desvía la pelota hacia ese lado y suena el rebote.
5. Muro: generar `state.bricks` a partir de `ROWS` y de la rejilla, y dibujarlo con `drawSprite(ctx, 'block_' + color, ...)`. Prueba manual: se ven 6 filas de colores con 13 bloques cada una.
6. Colisión con los bloques: AABB entre la pelota y los bloques vivos. Se procesa como máximo un bloque por frame, invirtiendo `vx` o `vy` según el eje de menor solapamiento. Marcar `alive = false`, sumar `points` y reproducir `break-sound.mp3`. Prueba manual: los bloques desaparecen al golpearlos y la pelota rebota.
7. Explosiones: al romper un bloque, añadir `{ x, y, color, start }` a `state.explosions`. Dibujar el frame `floor((now − start) / EXPLOSION_DURATION)` con `drawFrame` y eliminar la explosión al pasar del frame 3. Prueba manual: cada bloque roto muestra su animación de color.
8. Aceleración: incrementar `bricksBroken`. Cada `BRICKS_PER_SPEEDUP` bloques, `ball.speed = min(ball.speed + BALL_SPEED_STEP, BALL_SPEED_MAX)` y se reescala `vx`/`vy` manteniendo la dirección. Prueba manual: la pelota se nota más rápida tras romper varios bloques.
9. Vidas y HUD: al caer la pelota se resta una vida y se vuelve a `serve`. La velocidad no se reinicia al perder una vida. Dibujar la franja del HUD con `SCORE: N` a la izquierda y `VIDAS: N` a la derecha. Prueba manual: el HUD refleja los puntos y las vidas en tiempo real.
10. Fases de partida: `ready` muestra el título y "Pulsa Espacio para empezar", y Espacio pasa a `serve`. Con 0 vidas se pasa a `lost` ("GAME OVER" y la puntuación). Sin bloques vivos se pasa a `won` ("¡VICTORIA!" y la puntuación). En `won`/`lost`, Espacio llama a `resetGame()` y vuelve a `serve`. Prueba manual: recorrer el ciclo completo.
11. Pausa: P o Esc en `serve`/`playing` pasan a `paused` y guardan `pausedFrom`. Otra pulsación vuelve a la fase guardada. Mientras dure la pausa no se actualiza la física y se dibuja un overlay con "PAUSA". Prueba manual: pausar y reanudar en mitad de un rebote sin que la pelota salte.

## Criterios de aceptación

- [ ] Abrir `http://localhost:8000` tras `python3 -m http.server` carga el juego sin errores en la consola.
- [ ] El canvas mide 448×512 lógicos, está centrado y mantiene la proporción al redimensionar la ventana.
- [ ] Al cargar se ve la pantalla de inicio. Espacio deja la pelota pegada a la paleta.
- [ ] La paleta se mueve con ←/→, con A/D y con el ratón, y nunca sale del canvas.
- [ ] El ratón controla la paleta correctamente aunque el canvas esté escalado por CSS.
- [ ] Espacio o clic lanzan la pelota desde la paleta.
- [ ] La pelota rebota en las paredes laterales y en el techo (debajo del HUD) y suena `ball-bounce.mp3`.
- [ ] Golpear con el extremo izquierdo de la paleta manda la pelota hacia la izquierda, y con el derecho hacia la derecha.
- [ ] El muro tiene 78 bloques en 6 filas de arriba abajo: rojo, amarillo, cian, magenta, rosa y verde.
- [ ] Romper un bloque rojo suma 60 puntos y uno verde suma 10.
- [ ] Al romper un bloque suena `break-sound.mp3` y se reproduce su animación de explosión de 4 frames del mismo color.
- [ ] La velocidad de la pelota sube cada 5 bloques rotos y nunca supera 520 px/s.
- [ ] El HUD muestra la puntuación y las vidas actuales.
- [ ] La partida empieza con 3 vidas. Al caer la pelota se pierde una y la pelota vuelve a la paleta.
- [ ] Con 0 vidas aparece "GAME OVER" con la puntuación.
- [ ] Al romper los 78 bloques aparece "¡VICTORIA!" con la puntuación (2730).
- [ ] En las pantallas de victoria y derrota, Espacio reinicia con 3 vidas, 0 puntos y el muro completo.
- [ ] P o Esc pausan y reanudan. Durante la pausa la pelota no se mueve y se ve "PAUSA".
- [ ] No hay dependencias externas: solo `index.html`, `styles.css`, `game.js` y `assets/`.

## Decisiones

- **Sí:** un MVP de un solo nivel. Es lo mínimo que se puede jugar de verdad, y los niveles van en otra spec.
- **No:** el juego completo en una spec. Tocaría demasiadas áreas a la vez.
- **Sí:** `index.html` + `styles.css` + `game.js` como scripts clásicos. `assets/spritesheet.js` ya es un script clásico con globales, y así no hay que mezclar estilos de carga.
- **No:** dividir en módulos ES. Obligaría a reescribir `spritesheet.js` o a combinar dos estilos de carga.
- **No:** meterlo todo en `index.html`. Crece mal.
- **Sí:** control con teclado (←/→ y A/D) y ratón, y lanzamiento con Espacio o clic.
- **No:** control táctil. Requiere un canvas adaptable y otra spec.
- **Sí:** 3 vidas y puntos por fila (de 60 a 10). La fila de arriba cuesta más de alcanzar.
- **No:** puntos fijos por bloque. Es más plano como juego.
- **Sí:** 6 filas de colores rompibles de un golpe.
- **No:** fila gris de 2 golpes. Introduce la resistencia por bloque, que va con otra spec de tipos de bloque.
- **No:** patrón de muro dibujado. Eso es diseño de niveles.
- **Sí:** ángulo según la zona de impacto (±60°) y aceleración cada 5 bloques hasta 520 px/s. Da control al jugador y una dificultad creciente.
- **No:** rebote espejo simple. El jugador no controlaría nada.
- **Sí:** la velocidad no se reinicia al perder una vida. Es más simple, y la partida es corta.
- **Sí:** canvas lógico fijo de 448×512 escalado por CSS. Las coordenadas quedan estables y la rejilla de 13 × 32 px + 2 × 16 px encaja exacta.
- **No:** canvas a pantalla completa adaptable. Complica las coordenadas.
- **Sí:** HUD dibujado en el canvas, en una franja de 32 px. Todo el render queda en un solo sitio.
- **No:** HUD en el DOM.
- **Sí:** física con `dt` en px/s, limitada a 1/30 s. Es independiente de los Hz del monitor y evita que la pelota atraviese bloques tras un tirón.
- **Sí:** `EXPLOSION_DURATION` como duración por frame (600 ms en total). La animación se ve; si fuera la duración total, cada frame duraría unos 37 ms y apenas se notaría.
- **Sí:** la paleta se dibuja a 80×14 aunque el sprite mida 162×14. A tamaño real ocuparía un 36 % del ancho.
- **Sí:** pausa con P o Esc.
- **No:** pausa automática al perder el foco. Queda fuera de esta spec.
- **Sí:** después de perder una vida, la pelota vuelve a la paleta y se relanza con Espacio o clic.
- **No:** relanzamiento automático. El jugador debe decidir cuándo volver a jugar.
- **No:** ninguna persistencia. Los récords van en su propia spec.
- **Sí:** `git init` como paso 0, porque `/spec-impl` necesita un repo para crear la rama.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La pelota atraviesa bloques o la paleta a alta velocidad | `dt` limitado a 1/30 s y velocidad máxima de 520 px/s: el desplazamiento por frame (≈17 px) queda por debajo de la altura de un bloque. |
| Política de autoplay del navegador bloquea el audio | El primer sonido solo suena tras un gesto del usuario (Espacio o clic). Los errores de `play()` se capturan con `.catch(() => {})` para no romper el juego. |
| Sonidos solapados que se cortan entre sí | Reiniciar `currentTime = 0` antes de cada `play()`. Si se nota el corte, clonar el nodo de audio. |
| Abrir `index.html` con `file://` falla en algún navegador | El método documentado es servir con `python3 -m http.server`. |
| La paleta escalada a 80 px de ancho se ve deformada | Es una decisión estética aceptada. Ajustar `PADDLE_W` es un cambio de una constante. |
| La pelota entra en bucle horizontal casi plano | El ángulo máximo es de 60° respecto a la vertical, así que siempre queda una componente vertical de al menos la mitad de la velocidad. |

## Lo que **no** entra en esta spec

- Varios niveles o muros con patrones.
- Bloques grises o con resistencia.
- Power-ups.
- Récords o persistencia en localStorage.
- Controles táctiles y versión móvil.
- Canvas adaptable a pantalla completa.
- Música, volumen y silencio.
- Pausa automática al perder el foco.

Cada uno de estos puntos, si llega, irá en su propia spec.
