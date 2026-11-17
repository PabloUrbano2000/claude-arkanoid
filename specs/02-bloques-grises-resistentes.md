# SPEC 02 — Bloques grises resistentes

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-16
> **Objetivo:** Añadir encima del muro una fila de 13 bloques grises que necesitan 2 golpes para romperse, con un parpadeo blanco en el golpe que no los rompe.

## Alcance

**Dentro:**

- Una 7.ª fila gris de 13 bloques en y = 48, por encima de la roja. Las 6 filas de color no se mueven (de y = 64 a y = 160).
- Cada bloque tiene una resistencia (`hits`). Los grises empiezan con 2 y los de color con 1.
- Un golpe que no rompe un gris resta 1 a `hits`, hace rebotar la pelota, suena `ball-bounce.mp3` y el bloque parpadea en blanco durante 100 ms.
- El golpe que lo rompe se comporta como con cualquier bloque: suma 100 puntos, suena `break-sound.mp3`, se reproduce la explosión `EXPLOSION_FRAMES.gray` y cuenta para la aceleración.
- La victoria sigue exigiendo romper todos los bloques, grises incluidos.
- `resetGame()` reconstruye el muro con los grises otra vez a 2 golpes.

**Fuera de alcance (para futuras specs):**

- Resistencia variable (3 golpes o según la fila).
- Bloques indestructibles.
- Oscurecer el bloque o cambiar su sprite según el daño.
- Puntos por cada golpe que no rompe el bloque.
- Varios niveles o muros con patrones.
- Cualquier otro arreglo del MVP (sonidos que se cortan, saque vertical, sub-pasos de física).

## Modelo de datos

Todo sigue en `game.js`. Solo cambian una constante, la tabla `ROWS` y la forma de cada bloque.

```js
const BRICK_OFFSET_Y = 48;   // antes 64: la fila gris ocupa 48-64
const HIT_FLASH_MS = 100;    // duración del parpadeo blanco

// Filas de arriba abajo
const ROWS = [
  { color: 'gray',    points: 100, hits: 2 },
  { color: 'red',     points: 60,  hits: 1 },
  { color: 'yellow',  points: 50,  hits: 1 },
  { color: 'cyan',    points: 40,  hits: 1 },
  { color: 'magenta', points: 30,  hits: 1 },
  { color: 'hotpink', points: 20,  hits: 1 },
  { color: 'green',   points: 10,  hits: 1 },
];

// Bloque en state.bricks
// { x, y, color, points, hits, hitAt: null, alive: true }
//   hits:  golpes que le quedan; al llegar a 0 → alive = false
//   hitAt: timestamp (ms) del último golpe que no lo rompió, o null
```

Convenciones:

- `bricksBroken` cuenta solo bloques rotos, no golpes.
- El parpadeo se calcula con `now - hitAt < HIT_FLASH_MS`, con el mismo `now` de `requestAnimationFrame` que usan las explosiones.
- Muro: 7 × 13 = 91 bloques.
- Puntuación máxima: 2730 + 13 × 100 = 4030.

## Plan de implementación

1. Datos: cambiar `BRICK_OFFSET_Y` a 48, añadir `HIT_FLASH_MS`, añadir `hits` a cada entrada de `ROWS` y la fila gris al principio. En `buildBricks()`, copiar `hits` y poner `hitAt: null` en cada bloque. Prueba manual: se ve una fila gris encima de la roja, las filas de color siguen en su sitio y por ahora el gris se rompe de un golpe.
2. Resistencia: en `collideBricks()`, corregir antes la resolución del rebote. La pelota se empuja fuera del bloque según el lado en el que está su centro respecto al centro del bloque, no según el signo de la velocidad. La velocidad de ese eje solo se invierte si la pelota va hacia el bloque. Después del rebote, restar 1 a `brick.hits`. Si queda por encima de 0, guardar `brick.hitAt = now`, reproducir `ball-bounce.mp3` y salir sin sumar puntos ni contar el bloque como roto. Si llega a 0, seguir el camino actual de rotura (`alive = false`, puntos, explosión, `break-sound.mp3`, `bricksBroken`). Prueba manual: un gris necesita 2 golpes, el primero solo rebota y suena el rebote, y el segundo lo rompe con su explosión.
3. Parpadeo: en `render()`, después de dibujar un bloque vivo, si `hitAt !== null && now - hitAt < HIT_FLASH_MS`, pintar encima un `fillRect` blanco semitransparente del tamaño del bloque. Prueba manual: el primer golpe a un gris lo hace destellar en blanco brevemente.

## Criterios de aceptación

- [ ] El muro tiene 91 bloques. La fila de arriba (y = 48) es gris y debajo siguen rojo, amarillo, cian, magenta, rosa y verde, en las mismas posiciones que en la SPEC 01.
- [ ] El primer golpe a un bloque gris no lo rompe: la pelota rebota, suena `ball-bounce.mp3`, el bloque parpadea en blanco y la puntuación no cambia.
- [ ] El segundo golpe al mismo bloque gris lo rompe: suma 100 puntos, suena `break-sound.mp3` y se ve la explosión.
- [ ] Un bloque de color sigue rompiéndose de un golpe con los mismos puntos que en la SPEC 01.
- [ ] El golpe que no rompe un gris no cuenta para la aceleración. Solo cuentan los bloques rotos.
- [ ] Con grises todavía vivos no aparece "¡VICTORIA!".
- [ ] Al romper los 91 bloques aparece "¡VICTORIA!" con 4030 puntos.
- [ ] Tras reiniciar con Espacio desde victoria o derrota, todos los grises vuelven a necesitar 2 golpes.
- [ ] El juego carga sin errores en la consola.

## Decisiones

- **Sí:** 2 golpes fijos. Es fácil de leer y de probar. El valor vive en `ROWS` y se cambia en una línea.
- **No:** 3 golpes o resistencia variable por fila. Alarga la partida y complica el muro sin aportar a esta spec.
- **Sí:** una fila extra arriba. Protege la fila roja, que es la más valiosa, y no elimina ningún color.
- **No:** sustituir la fila roja o ponerla en medio. Una pierde un color y la otra cambia el ritmo del muro sin motivo.
- **Sí:** la fila gris en y = 48, con las de color en el mismo sitio. La distancia a la paleta no cambia y la dificultad de la SPEC 01 se mantiene.
- **No:** desplazar todo el muro 16 px hacia abajo. Acercaría los bloques a la paleta.
- **Sí:** 100 puntos solo al romperlo. La puntuación máxima (4030) queda exacta y verificable.
- **No:** puntos por cada golpe. Ensucia el cálculo del máximo.
- **Sí:** parpadeo blanco de 100 ms y el sonido de rebote. No hacen falta sprites nuevos y el jugador entiende que el golpe ha contado.
- **No:** oscurecerlo según el daño. Con solo 2 golpes, el parpadeo basta.
- **Sí:** `hits` como dato de `ROWS` y de cada bloque. Una futura spec de niveles o de tipos de bloque podrá reutilizarlo sin cambiar la colisión.
- **No:** una propiedad `type: 'gray'` con lógica especial. Sería más difícil de extender.
- **Sí:** la victoria exige romper también los grises. La condición actual (`every(!alive)`) no cambia.
- **Sí:** `bricksBroken` cuenta solo los bloques rotos. Así se conserva el significado de la SPEC 01.
- **Sí:** corregir en esta spec la resolución del rebote contra bloques. Con bloques de 2 golpes, el fallo de la SPEC 01 rompía grises de un solo impacto.
- **No:** dejarlo como limitación conocida o pasarlo a la spec de pulido. Rompería el criterio de los 2 golpes.
- **Sí:** la explosión usa `EXPLOSION_FRAMES.gray`, que en los assets reutiliza los frames rojos. No hay que tocar `spritesheet.js`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La pelota golpea dos veces el mismo gris en frames consecutivos y lo rompe de un solo impacto | Detectado al revisar: en entradas diagonales por una esquina, la resolución de la SPEC 01 (que empuja según el signo de la velocidad) invertía `vx` hacia el bloque. Pasaba en 6 de 180 casos a 30 FPS y 420–520 px/s. El paso 2 empuja según la posición relativa de los centros y solo invierte la velocidad si la pelota va hacia el bloque. |
| El parpadeo se "consume" si se pausa justo después del golpe | Se acepta: dura 100 ms y no afecta a la jugabilidad. |
| La explosión gris se ve roja | Es una limitación conocida de los assets (`gray` reutiliza los frames rojos). Se acepta. |
| Los criterios de la SPEC 01 (78 bloques, 2730 puntos) dejan de cumplirse | Es intencionado. Esta spec los sustituye por 91 bloques y 4030 puntos. |

## Lo que **no** entra en esta spec

- Resistencia variable o de 3 golpes.
- Bloques indestructibles.
- Cambio visual permanente según el daño.
- Puntos por golpe.
- Niveles o muros con patrones.
- Otros arreglos del MVP.

Cada uno de estos puntos, si llega, irá en su propia spec.
