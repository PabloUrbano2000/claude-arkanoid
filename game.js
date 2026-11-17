'use strict';

// Constantes de diseño (px y px/s)
const WIDTH = 448, HEIGHT = 512, HUD_H = 32;
const PADDLE_W = 80, PADDLE_H = 14, PADDLE_Y = 472, PADDLE_SPEED = 420;
const BALL_SIZE = 12;
const BALL_SPEED_START = 300, BALL_SPEED_STEP = 20, BALL_SPEED_MAX = 520;
const BRICKS_PER_SPEEDUP = 5;
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° respecto a la vertical
const BRICK_W = 32, BRICK_H = 16, BRICK_COLS = 13, BRICK_OFFSET_X = 16, BRICK_OFFSET_Y = 48;
const HIT_FLASH_MS = 100; // duración del parpadeo blanco
const LIVES_START = 3;
const MAX_DT = 1 / 30; // s

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

const state = {
  phase: 'ready',          // 'ready' | 'serve' | 'playing' | 'paused' | 'won' | 'lost'
  pausedFrom: null,        // 'serve' | 'playing': adónde vuelve al quitar la pausa
  score: 0,
  lives: LIVES_START,
  bricksBroken: 0,
  paddle: { x: 184 },      // borde izquierdo; y fijo = PADDLE_Y
  ball: { x: 0, y: 0, vx: 0, vy: 0, speed: BALL_SPEED_START },
  bricks: [],              // { x, y, color, points, hits, hitAt: null, alive: true }
  explosions: [],          // { x, y, color, start }, start = timestamp en ms
  input: { left: false, right: false, mouseX: null },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let lastTime = null;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// --- Sonido ------------------------------------------------------------------

const sounds = {
  bounce: new Audio('assets/sounds/ball-bounce.mp3'),
  break: new Audio('assets/sounds/break-sound.mp3'),
};

function playSound(name) {
  const audio = sounds[name];
  audio.currentTime = 0;
  audio.play().catch(() => {}); // autoplay bloqueado u otro error: no romper el juego
}

// --- Entrada ---------------------------------------------------------------

const KEYS_LEFT = ['ArrowLeft', 'KeyA'];
const KEYS_RIGHT = ['ArrowRight', 'KeyD'];

window.addEventListener('keydown', (e) => {
  if (KEYS_LEFT.includes(e.code)) { state.input.left = true; e.preventDefault(); }
  if (KEYS_RIGHT.includes(e.code)) { state.input.right = true; e.preventDefault(); }

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    togglePause();
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (state.phase === 'ready') state.phase = 'serve';
    else if (state.phase === 'serve') launchBall();
    else if (state.phase === 'won' || state.phase === 'lost') resetGame();
  }
});

canvas.addEventListener('mousedown', () => {
  if (state.phase === 'serve') launchBall();
});

window.addEventListener('keyup', (e) => {
  if (KEYS_LEFT.includes(e.code)) state.input.left = false;
  if (KEYS_RIGHT.includes(e.code)) state.input.right = false;
});

// El canvas está escalado por CSS: convertir a coordenadas lógicas
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  state.input.mouseX = (e.clientX - rect.left) * (WIDTH / rect.width);
});

// --- Muro --------------------------------------------------------------------

function buildBricks() {
  const bricks = [];
  ROWS.forEach((row, r) => {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: BRICK_OFFSET_X + c * BRICK_W,
        y: BRICK_OFFSET_Y + r * BRICK_H,
        color: row.color,
        points: row.points,
        hits: row.hits,      // golpes que le quedan
        hitAt: null,         // timestamp (ms) del último golpe que no lo rompió
        alive: true,
      });
    }
  });
  return bricks;
}

state.bricks = buildBricks();

// Pausa solo desde 'serve'/'playing'; al reanudar vuelve a la fase guardada
function togglePause() {
  if (state.phase === 'serve' || state.phase === 'playing') {
    state.pausedFrom = state.phase;
    state.phase = 'paused';
  } else if (state.phase === 'paused') {
    state.phase = state.pausedFrom;
    state.pausedFrom = null;
  }
}

// Nueva partida desde 'won'/'lost': vuelve directamente al saque
function resetGame() {
  state.score = 0;
  state.lives = LIVES_START;
  state.bricksBroken = 0;
  state.ball.speed = BALL_SPEED_START;
  state.bricks = buildBricks();
  state.explosions = [];
  state.pausedFrom = null;
  state.phase = 'serve';
}

// --- Actualización -----------------------------------------------------------

function updatePaddle(dt) {
  const { input, paddle } = state;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (dir !== 0) {
    paddle.x += dir * PADDLE_SPEED * dt;
    input.mouseX = null; // el teclado tiene prioridad sobre la última posición del ratón
  } else if (input.mouseX !== null) {
    paddle.x = input.mouseX - PADDLE_W / 2;
    input.mouseX = null; // consumir: solo se aplica cuando el ratón se mueve
  }

  paddle.x = clamp(paddle.x, 0, WIDTH - PADDLE_W);
}

// La pelota se guarda por su esquina superior izquierda, como la paleta
function stickBallToPaddle() {
  const { ball, paddle } = state;
  ball.x = paddle.x + PADDLE_W / 2 - BALL_SIZE / 2;
  ball.y = PADDLE_Y - BALL_SIZE;
  ball.vx = 0;
  ball.vy = 0;
}

function launchBall() {
  const { ball } = state;
  // Usa la velocidad actual: no se reinicia al relanzar (ver paso 9)
  ball.vx = 0;
  ball.vy = -ball.speed;
  state.phase = 'playing';
}

function updateBall(dt, now) {
  const { ball } = state;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Paredes laterales
  if (ball.x < 0) {
    ball.x = 0;
    ball.vx = Math.abs(ball.vx);
    playSound('bounce');
  } else if (ball.x + BALL_SIZE > WIDTH) {
    ball.x = WIDTH - BALL_SIZE;
    ball.vx = -Math.abs(ball.vx);
    playSound('bounce');
  }

  // Techo (debajo del HUD)
  if (ball.y < HUD_H) {
    ball.y = HUD_H;
    ball.vy = Math.abs(ball.vy);
    playSound('bounce');
  }

  // Paleta: solo si la pelota baja y se solapa con ella
  const { paddle } = state;
  if (
    ball.vy > 0 &&
    ball.y + BALL_SIZE >= PADDLE_Y &&
    ball.y <= PADDLE_Y + PADDLE_H &&
    ball.x + BALL_SIZE >= paddle.x &&
    ball.x <= paddle.x + PADDLE_W
  ) {
    const ballCenter = ball.x + BALL_SIZE / 2;
    const paddleCenter = paddle.x + PADDLE_W / 2;
    const offset = clamp((ballCenter - paddleCenter) / (PADDLE_W / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE; // respecto a la vertical

    ball.vx = ball.speed * Math.sin(angle);
    ball.vy = -ball.speed * Math.cos(angle);
    ball.y = PADDLE_Y - BALL_SIZE;
    playSound('bounce');
  }

  collideBricks(now);

  if (state.bricks.every((b) => !b.alive)) {
    state.phase = 'won';
    return;
  }

  // Cae por debajo del canvas: se pierde una vida y vuelve al saque.
  // La velocidad no se reinicia. Sin vidas, fin de la partida.
  if (ball.y > HEIGHT) {
    state.lives--;
    state.phase = state.lives <= 0 ? 'lost' : 'serve';
  }
}

// AABB contra los bloques vivos: como máximo un bloque por frame
function collideBricks(now) {
  const { ball } = state;

  for (const brick of state.bricks) {
    if (!brick.alive) continue;

    const overlapX = Math.min(ball.x + BALL_SIZE, brick.x + BRICK_W) - Math.max(ball.x, brick.x);
    const overlapY = Math.min(ball.y + BALL_SIZE, brick.y + BRICK_H) - Math.max(ball.y, brick.y);
    if (overlapX <= 0 || overlapY <= 0) continue;

    // Rebotar en el eje de menor solapamiento. Se empuja según el lado donde
    // está la pelota (no según su velocidad) y solo se invierte si va hacia el bloque.
    if (overlapX < overlapY) {
      const fromLeft = ball.x + BALL_SIZE / 2 < brick.x + BRICK_W / 2;
      ball.x += fromLeft ? -overlapX : overlapX;
      if (fromLeft ? ball.vx > 0 : ball.vx < 0) ball.vx = -ball.vx;
    } else {
      const fromAbove = ball.y + BALL_SIZE / 2 < brick.y + BRICK_H / 2;
      ball.y += fromAbove ? -overlapY : overlapY;
      if (fromAbove ? ball.vy > 0 : ball.vy < 0) ball.vy = -ball.vy;
    }

    // Golpe que no lo rompe: solo rebote, parpadeo y sonido de rebote
    brick.hits--;
    if (brick.hits > 0) {
      brick.hitAt = now;
      playSound('bounce');
      return;
    }

    brick.alive = false;
    state.score += brick.points;
    state.explosions.push({ x: brick.x, y: brick.y, color: brick.color, start: now });
    playSound('break');

    state.bricksBroken++;
    if (state.bricksBroken % BRICKS_PER_SPEEDUP === 0) speedUpBall();
    return;
  }
}

// Sube la velocidad con tope y reescala vx/vy manteniendo la dirección
function speedUpBall() {
  const { ball } = state;
  const newSpeed = Math.min(ball.speed + BALL_SPEED_STEP, BALL_SPEED_MAX);
  const factor = newSpeed / ball.speed;
  ball.vx *= factor;
  ball.vy *= factor;
  ball.speed = newSpeed;
}

// EXPLOSION_DURATION es la duración de cada frame: 4 frames = 600 ms
function explosionFrame(explosion, now) {
  return Math.floor((now - explosion.start) / EXPLOSION_DURATION);
}

function updateExplosions(now) {
  state.explosions = state.explosions.filter((ex) => explosionFrame(ex, now) <= 3);
}

function update(dt, now) {
  if (state.phase === 'paused') return; // sin física durante la pausa

  updatePaddle(dt);

  if (state.phase === 'serve') {
    stickBallToPaddle();
  } else if (state.phase === 'playing') {
    updateBall(dt, now);
  }

  updateExplosions(now);
}

// --- Render ------------------------------------------------------------------

function render(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    drawSprite(ctx, 'block_' + brick.color, brick.x, brick.y, BRICK_W, BRICK_H);

    // Parpadeo blanco tras un golpe que no lo rompió
    if (brick.hitAt !== null && now - brick.hitAt < HIT_FLASH_MS) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
    }
  }

  for (const ex of state.explosions) {
    const frame = explosionFrame(ex, now);
    if (frame >= 0 && frame <= 3) {
      drawFrame(ctx, EXPLOSION_FRAMES[ex.color][frame], ex.x, ex.y, BRICK_W, BRICK_H);
    }
  }

  drawSprite(ctx, 'paddle', state.paddle.x, PADDLE_Y, PADDLE_W, PADDLE_H);

  if (state.phase === 'serve' || state.phase === 'playing' || state.phase === 'paused') {
    drawSprite(ctx, 'ball', state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE);
  }

  renderHud();

  if (state.phase === 'ready') {
    renderOverlay('ARKANOID', 'Pulsa Espacio para empezar');
  } else if (state.phase === 'paused') {
    renderOverlay('PAUSA', 'Pulsa P o Esc para continuar');
  } else if (state.phase === 'lost') {
    renderOverlay('GAME OVER', `Puntuación: ${state.score}`, 'Pulsa Espacio para reiniciar');
  } else if (state.phase === 'won') {
    renderOverlay('¡VICTORIA!', `Puntuación: ${state.score}`, 'Pulsa Espacio para reiniciar');
  }
}

// Capa semitransparente bajo el HUD con un título y líneas de texto
function renderOverlay(title, ...lines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, HUD_H, WIDTH, HEIGHT - HUD_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cy = HUD_H + (HEIGHT - HUD_H) / 2;

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(title, WIDTH / 2, cy - 30);

  ctx.font = '16px monospace';
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, cy + 20 + i * 26);
  });
}

function renderHud() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, WIDTH, HUD_H);
  ctx.fillStyle = '#444';
  ctx.fillRect(0, HUD_H - 1, WIDTH, 1);

  ctx.font = 'bold 16px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${state.score}`, 12, HUD_H / 2);

  ctx.textAlign = 'right';
  ctx.fillText(`VIDAS: ${state.lives}`, WIDTH - 12, HUD_H / 2);
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;

  update(dt, now);
  render(now);

  requestAnimationFrame(loop);
}

loadSpritesheet(() => {
  requestAnimationFrame(loop);
});
