const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = process.cwd();
const outputDir = path.join(root, "output", "instagram", "ai-search-readiness-carousel");
const backgroundPath = path.join(outputDir, "generated-background.png");

const width = 1080;
const height = 1350;

const slides = [
  {
    eyebrow: "AI SEARCH REALITY",
    title: ["Your website can", "rank in Google —", "and still be", "invisible to AI."],
    body: "Visibility in traditional search does not automatically make a page easy for AI systems to understand or extract.",
    cover: true,
    marker: "01 / 05   SWIPE",
  },
  {
    eyebrow: "THE DISTINCTION THAT MATTERS",
    title: ["Crawlable is not", "the same as", "extractable."],
    body: "A page may be accessible and still hide its most useful answers inside weak structure, vague copy, or unclear entity signals.",
    chips: ["BURIED ANSWERS", "WEAK STRUCTURE", "UNCLEAR TRUST SIGNALS"],
    marker: "02 / 05",
  },
  {
    eyebrow: "ASK THE BETTER QUESTION",
    title: ["Can an AI system", "identify who you are,", "what you do, and", "why it should trust you?"],
    body: "More content will not fix a site that is difficult to interpret. Clarity, structure, and evidence come first.",
    marker: "03 / 05",
  },
  {
    eyebrow: "WHAT TO FIX FIRST",
    title: ["Clarity before", "volume."],
    steps: [
      ["01", "ACCESS", "Can crawlers reach the important pages?"],
      ["02", "EXTRACTABILITY", "Can the main answer stand on its own?"],
      ["03", "ENTITY CLARITY", "Is the company and offer unambiguous?"],
      ["04", "TRUST SIGNALS", "Is there visible evidence behind the claim?"],
    ],
    marker: "04 / 05",
  },
  {
    eyebrow: "FREE AI SEARCH READINESS SCAN",
    title: ["Find out where", "your site breaks."],
    body: "See the readiness issues that may make your website difficult for AI search systems to understand.",
    cta: "RUN YOUR FREE SCAN",
    url: "GETGEOPULSE.COM",
    marker: "05 / 05",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function multiline(lines, x, y, size, lineHeight, color = "#f6f1e7", weight = 700) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="-2">${escapeXml(line)}</text>`,
    )
    .join("");
}

function textWrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function bodyText(text, x, y, maxChars = 58) {
  return multiline(textWrap(text, maxChars), x, y, 30, 43, "#c7c0b3", 400);
}

function stepsMarkup(steps) {
  return steps
    .map(([number, label, detail], index) => {
      const y = 592 + index * 138;
      return `
        <line x1="92" y1="${y - 54}" x2="988" y2="${y - 54}" stroke="#493b22" stroke-width="1"/>
        <text x="92" y="${y}" fill="#d6a83e" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700">${number}</text>
        <text x="170" y="${y}" fill="#f6f1e7" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" letter-spacing="1.6">${label}</text>
        <text x="170" y="${y + 42}" fill="#a9a397" font-family="Arial, Helvetica, sans-serif" font-size="23">${escapeXml(detail)}</text>
      `;
    })
    .join("");
}

function svgForSlide(slide, index) {
  const useBackground = slide.cover;
  const titleY = slide.cover ? 355 : 330;
  const titleSize = slide.cover ? 78 : index === 2 ? 63 : 73;
  const titleLineHeight = slide.cover ? 86 : index === 2 ? 72 : 82;
  const titleBlockHeight = slide.title.length * titleLineHeight;
  const bodyY = titleY + titleBlockHeight + 50;

  const chips =
    slide.chips?.map((chip, chipIndex) => {
      const y = bodyY + 190 + chipIndex * 76;
      return `
        <rect x="92" y="${y - 42}" width="650" height="58" rx="29" fill="#17140f" stroke="#5c4820"/>
        <circle cx="121" cy="${y - 13}" r="6" fill="#d6a83e"/>
        <text x="145" y="${y - 3}" fill="#e6d4a4" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" letter-spacing="1.2">${chip}</text>
      `;
    }).join("") ?? "";

  const cta = slide.cta
    ? `
      <rect x="92" y="888" width="540" height="92" rx="46" fill="#d6a83e"/>
      <text x="362" y="947" fill="#080706" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="1.4">${slide.cta}</text>
      <text x="92" y="1048" fill="#f6f1e7" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="1.4">${slide.url}</text>
    `
    : "";

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="${useBackground ? "transparent" : "#080706"}"/>
    ${useBackground ? `<rect width="1080" height="1350" fill="url(#fade)"/>` : ""}
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#080706" stop-opacity="0.98"/>
        <stop offset="0.64" stop-color="#080706" stop-opacity="0.82"/>
        <stop offset="1" stop-color="#080706" stop-opacity="0.28"/>
      </linearGradient>
      <radialGradient id="glow">
        <stop offset="0" stop-color="#d6a83e" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#d6a83e" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="950" cy="220" r="360" fill="url(#glow)"/>
    <rect x="92" y="96" width="54" height="4" rx="2" fill="#d6a83e"/>
    <text x="164" y="108" fill="#d6a83e" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="2.2">${escapeXml(slide.eyebrow)}</text>
    ${multiline(slide.title, 92, titleY, titleSize, titleLineHeight)}
    ${slide.body ? bodyText(slide.body, 92, bodyY) : ""}
    ${chips}
    ${slide.steps ? stepsMarkup(slide.steps) : ""}
    ${cta}
    <text x="92" y="1270" fill="#8c8578" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">${slide.marker}</text>
    <text x="988" y="1270" fill="#d6a83e" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">GEO-PULSE</text>
  </svg>`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    const base = slide.cover
      ? sharp(backgroundPath).resize(width, height, { fit: "cover" }).modulate({ brightness: 0.74 })
      : sharp({ create: { width, height, channels: 4, background: "#080706" } });

    await base
      .composite([
        { input: Buffer.from(svgForSlide(slide, index)), top: 0, left: 0 },
      ])
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
      .toFile(path.join(outputDir, `slide-${index + 1}.jpg`));
  }

  console.log(outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
