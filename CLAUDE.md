# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always reply to the user in **Spanish** in this project.

## Project status

An Arkanoid/breakout game built with **plain HTML, CSS and JavaScript, with zero dependencies** (README, written in Spanish). The game itself is **not implemented yet**. Only the assets exist. Don't add npm, bundlers, frameworks or build steps.

## Running

There is no build, lint or test tooling. Serve the repo root over HTTP and open the page in a browser, for example:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

The entry HTML file must be at the **repo root**, because `assets/spritesheet.js` loads the image from the relative path `assets/spritesheet-breakout.png`.

## Assets (`assets/`)

- `spritesheet-breakout.png` (559×337) is the single sprite atlas.
- `spritesheet.js` is a **classic script, not an ES module**. It defines globals and has no exports, so include it with a plain `<script src="assets/spritesheet.js">` placed before the game code. It provides:
  - `SPRITES`: source rects (`sx, sy, sw, sh`) for `paddle`, `ball`, and `blocks.{gray,red,yellow,cyan,magenta,hotpink,green}`.
  - `EXPLOSION_FRAMES[color]`: 4-frame break animations per block color (`gray` reuses the red frames). `EXPLOSION_DURATION = 150` (ms).
  - `loadSpritesheet(cb)`: loads the PNG once, copies it to an offscreen canvas and queues callbacks until it is ready. Start the game loop inside this callback.
  - `drawSprite(ctx, name, x, y, w, h)`: `name` is `'paddle'`, `'ball'` or `'block_<color>'`. `drawFrame(ctx, frame, x, y, w, h)` draws one explosion frame. Both silently do nothing until the sheet is loaded.
- `sounds/ball-bounce.mp3` and `sounds/break-sound.mp3` are the bounce and brick-break effects.

## Workflow: spec-driven development

The project-local skills in `.claude/skills/` (pinned in `skills-lock.json`, source `Klerith/fernando-skills`) define how features get built:

- `/spec <feature>` designs a spec interactively (questions first, then section by section, using `.claude/skills/spec/template.md`) and saves it to `specs/NN-name.md`. It writes no code. It matches the language and conventions of existing specs. Replies follow the language of the user's prompt.
- `/spec-impl <NN-spec-name>` implements a spec only if its state is "Approved". It creates a git branch named after the spec and works step by step, pausing for diff review. Optional config goes in `specs/.spec-config.yml` (defaults: `AutoCreateBranch: true`, `AutoCommitSteps: false`).

Note: the directory is **not a git repository yet**, so it needs a `git init` before `/spec-impl` can create branches.
