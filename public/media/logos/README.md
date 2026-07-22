# AI engine logos

Drop each engine's **official** brand logo here, using the exact filenames below. The app renders
them via `components/ai-engines.tsx` (landing strip, results Access Matrix, report, emails).

| Filename         | Engine    | Get the official asset from |
|------------------|-----------|-----------------------------|
| `openai.svg`     | ChatGPT   | OpenAI brand / press page   |
| `google.svg`     | Google    | Google brand resources      |
| `claude.svg`     | Claude    | Anthropic brand assets      |
| `copilot.svg`    | Copilot   | Microsoft brand assets (Copilot / Bing) |
| `perplexity.svg` | Perplexity| Perplexity brand page       |

## Guidelines
- **SVG** for in-app surfaces (crisp at any size). For emails also add a **PNG** at 2× (e.g.
  `openai@2x.png`, ~48×48) — most email clients render SVG poorly.
- Prefer the **monochrome / single-color** mark where a brand offers one; it sits better against
  GEO-Pulse's light and dark surfaces. Otherwise use the full-color mark.
- Keep transparent backgrounds and roughly square aspect (the component sizes to a square box).
- These are third-party trademarks used **nominatively** (to indicate which engines we check). Use
  each brand's official file as-is; don't recolor or distort their marks.

Until a file is added, that engine shows its **wordmark text** only (no broken image in the strip).
