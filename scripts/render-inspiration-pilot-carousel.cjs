const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = process.cwd();
const pilotDir = path.join(
  root,
  "output",
  "instagram",
  "inspiration-pilot-2026-07-26",
);
const outputDir = path.join(pilotDir, "prototype-carousel");
const modelPath = path.join(pilotDir, "avatars", "blonde-creator.png");

fs.mkdirSync(outputDir, { recursive: true });

const W = 1080;
const H = 1350;
const GOLD = "#E2B33A";
const IVORY = "#FFF9EF";

const slides = [
  {
    eyebrow: "AI VISIBILITY",
    title: ["Your competitor", "may be easier for", "AI to understand."],
    body: ["Same market.", "Different visibility."],
    marker: "01 / 05   SWIPE →",
    zoom: 1,
    focal: "centre",
    shade: "bottom",
  },
  {
    eyebrow: "WHAT MACHINES NEED",
    title: ["AI looks for", "clear signals."],
    labels: ["WHO YOU ARE", "WHAT YOU DO", "WHY TRUST THE ANSWER"],
    marker: "02 / 05",
    zoom: 1.72,
    crop: { left: 430, top: 80 },
    shade: "left",
  },
  {
    eyebrow: "THE 4-ANSWER TEST",
    title: ["Your site needs", "4 clear answers."],
    checks: ["Who are you?", "What do you sell?", "Who is it for?", "Why is it credible?"],
    marker: "03 / 05",
    zoom: 1.34,
    crop: { left: 360, top: 40 },
    shade: "left",
  },
  {
    eyebrow: "CLARITY BEFORE VOLUME",
    title: ["More content", "will not fix", "unclear content."],
    body: ["Fix access. Extractability.", "Entity clarity. Evidence."],
    marker: "04 / 05   KEEP SWIPING →",
    zoom: 1.25,
    crop: { left: 60, top: 250 },
    shade: "bottom",
  },
  {
    eyebrow: "FREE AI-SEARCH READINESS SCAN",
    title: ["See what AI", "may miss."],
    body: ["Find the signals making your", "site harder to understand."],
    cta: "RUN YOUR FREE SCAN",
    url: "GETGEOPULSE.COM",
    marker: "05 / 05",
    zoom: 1.55,
    crop: { left: 610, top: 180 },
    shade: "left",
  },
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textLines(lines, x, y, size, gap, family, weight, fill = IVORY) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * gap}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="-1.4">${esc(line)}</text>`,
    )
    .join("");
}

function overlaySvg(slide, index) {
  const gradient =
    slide.shade === "left"
      ? `<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#090806" stop-opacity=".92"/><stop offset=".60" stop-color="#090806" stop-opacity=".42"/><stop offset="1" stop-color="#090806" stop-opacity=".08"/></linearGradient>`
      : `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090806" stop-opacity=".08"/><stop offset=".42" stop-color="#090806" stop-opacity=".18"/><stop offset="1" stop-color="#090806" stop-opacity=".90"/></linearGradient>`;

  const titleY = index === 0 ? 780 : 260;
  const bodyY = index === 0 ? 1070 : index === 3 ? 930 : 720;
  const labels = slide.labels
    ? slide.labels
        .map(
          (label, i) => `
            <line x1="76" y1="${680 + i * 105}" x2="112" y2="${680 + i * 105}" stroke="${GOLD}" stroke-width="3"/>
            <text x="132" y="${690 + i * 105}" fill="${IVORY}" font-family="Arial" font-size="25" font-weight="750" letter-spacing="1.5">${esc(label)}</text>`,
        )
        .join("")
    : "";
  const checks = slide.checks
    ? slide.checks
        .map(
          (check, i) => `
            <circle cx="96" cy="${625 + i * 105}" r="23" fill="${GOLD}"/>
            <text x="96" y="${634 + i * 105}" text-anchor="middle" fill="#17130A" font-family="Arial" font-size="20" font-weight="800">${i + 1}</text>
            <text x="140" y="${634 + i * 105}" fill="${IVORY}" font-family="Arial" font-size="30" font-weight="650">${esc(check)}</text>`,
        )
        .join("")
    : "";
  const cta = slide.cta
    ? `<rect x="72" y="855" width="580" height="84" rx="42" fill="${GOLD}"/>
       <text x="362" y="909" text-anchor="middle" fill="#17130A" font-family="Arial" font-size="25" font-weight="850" letter-spacing="1">${slide.cta}</text>
       <text x="76" y="1006" fill="${IVORY}" font-family="Arial" font-size="31" font-weight="800" letter-spacing="1.4">${slide.url}</text>`
    : "";

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>${gradient}</defs>
      <rect width="${W}" height="${H}" fill="url(#shade)"/>
      <text x="76" y="106" fill="${GOLD}" font-family="Arial" font-size="20" font-weight="800" letter-spacing="3">${esc(slide.eyebrow)}</text>
      ${textLines(slide.title, 72, titleY, index === 0 ? 73 : 70, 80, "Georgia", 700)}
      ${slide.body ? textLines(slide.body, 76, bodyY, 29, 42, "Arial", 500, "#E7DED2") : ""}
      ${labels}
      ${checks}
      ${cta}
      <text x="76" y="1280" fill="#E9E0D4" font-family="Arial" font-size="17" font-weight="750" letter-spacing="2">${esc(slide.marker)}</text>
      <text x="1002" y="1280" text-anchor="end" fill="${GOLD}" font-family="Arial" font-size="19" font-weight="850" letter-spacing="2.5">GEO-PULSE</text>
    </svg>
  `);
}

async function backgroundFor(slide) {
  if (slide.zoom === 1) {
    return sharp(modelPath)
      .resize(W, H, { fit: "cover", position: slide.focal || "centre" })
      .png()
      .toBuffer();
  }

  const width = Math.round(W * slide.zoom);
  const height = Math.round(H * slide.zoom);
  const maxLeft = width - W;
  const maxTop = height - H;
  const left = Math.min(Math.max(slide.crop?.left || 0, 0), maxLeft);
  const top = Math.min(Math.max(slide.crop?.top || 0, 0), maxTop);

  return sharp(modelPath)
    .resize(width, height, { fit: "cover" })
    .extract({ left, top, width: W, height: H })
    .png()
    .toBuffer();
}

async function render() {
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    await sharp(await backgroundFor(slide))
      .composite([{ input: overlaySvg(slide, index), left: 0, top: 0 }])
      .png()
      .toFile(path.join(outputDir, `slide-${index + 1}.png`));
  }

  const staleSixth = path.join(outputDir, "slide-6.png");
  if (fs.existsSync(staleSixth)) fs.unlinkSync(staleSixth);
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
