import { getThemePalette } from "./theme.js";
function escapeJson(value) {
    return value.replaceAll("<", "\\u003c").replaceAll("-->", "--\\>");
}
export function renderCanvasPage(bootstrap) {
    const palette = getThemePalette(bootstrap.config.theme);
    const bootstrapJson = escapeJson(JSON.stringify(bootstrap));
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pac-Man</title>
    <meta name="theme-color" content="${palette.background}" />
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background:
          radial-gradient(circle at 12% 14%, color-mix(in srgb, ${palette.pacman} 18%, transparent), transparent 22%),
          radial-gradient(circle at 86% 18%, color-mix(in srgb, ${palette.ghosts[1]} 14%, transparent), transparent 20%),
          radial-gradient(circle at 78% 84%, color-mix(in srgb, ${palette.ghosts[3]} 12%, transparent), transparent 22%),
          linear-gradient(180deg, color-mix(in srgb, ${palette.background} 88%, #111827 12%), ${palette.background});
        color: ${palette.text};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(1320px, 100%);
        margin: 0 auto;
        padding: 36px 24px 44px;
      }

      .demo-shell {
        display: block;
      }

      .board-frame {
        padding: 0;
      }

      .canvas-shell {
        padding: 0;
        background: transparent;
      }

      .game-canvas {
        display: block;
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        filter: drop-shadow(0 28px 48px rgba(0, 0, 0, 0.3));
      }

      @media (max-width: 760px) {
        main {
          padding: 18px 12px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section id="app" aria-live="polite"></section>
    </main>
    <script id="pacman-bootstrap" type="application/json">${bootstrapJson}</script>
    <script type="module">
      import { mountPacmanDemo } from "./runtime/renderer/canvasRuntime.js";

      const bootstrap = JSON.parse(document.getElementById("pacman-bootstrap").textContent);
      mountPacmanDemo(document.getElementById("app"), bootstrap);
    </script>
  </body>
</html>`;
}
//# sourceMappingURL=canvasRenderer.js.map