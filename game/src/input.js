// ATOLL RUN — keyboard input.
// Tracks held keys and the keys struck since the last frame, so the game
// can tell "held down" apart from "just pressed" (Space, R, M, P).

export function createInput() {
  const held = new Set();
  const struck = new Set();
  const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  function onDown(event) {
    if (BLOCKED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (!held.has(event.code)) struck.add(event.code);
    held.add(event.code);
  }

  function onUp(event) {
    if (BLOCKED.has(event.code)) event.preventDefault();
    held.delete(event.code);
  }

  return {
    held,
    struck,
    pressed(code) {
      return struck.has(code);
    },
    isDown(code) {
      return held.has(code);
    },
    attach() {
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
    },
    detach() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      held.clear();
      struck.clear();
    },
    endFrame() {
      struck.clear();
    },
  };
}
