const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = process.cwd();
const sourceRoot = path.join(
  root,
  "output",
  "instagram",
  "inspiration-pilot-2026-07-26",
);
const outputRoot = path.join(
  root,
  "output",
  "instagram",
  "creative-stream-test-2026-07-26",
);
const publicRoot = path.join(
  root,
  "public",
  "campaigns",
  "creative-stream-test-2026-07-26",
);

const W = 1080;
const H = 1350;

const streams = [
  {
    id: "proof-guide",
    avatar: "amara.png",
    theme: "proof",
    slides: [
      {
        eyebrow: "MEET AMARA - AI VISIBILITY GUIDE",
        title: ["Your website can be", "online and still be", "hard for AI to explain."],
        body: ["Here is the four-signal check she uses."],
      },
      {
        eyebrow: "SIGNAL 01",
        title: ["Can AI access", "the page?"],
        body: ["Robots rules, blocked requests and unstable responses can stop retrieval before your content is considered."],
        chips: ["ACCESS", "STATUS", "CRAWL"],
      },
      {
        eyebrow: "SIGNAL 02",
        title: ["Can AI extract", "a direct answer?"],
        body: ["Clear headings, concise answer blocks and useful structure make the page easier to quote and summarize."],
        chips: ["HEADINGS", "ANSWERS", "STRUCTURE"],
      },
      {
        eyebrow: "SIGNALS 03 + 04",
        title: ["Is your identity clear?", "Is the proof visible?"],
        body: ["Entity clarity says who you are. Evidence gives an AI system a reason to trust the answer."],
        chips: ["IDENTITY", "EVIDENCE"],
      },
      {
        eyebrow: "DO NOT GUESS",
        title: ["Scan the signals.", "Fix the biggest gap.", "Measure again."],
        body: ["Run the free AI-search readiness scan at getgeopulse.com."],
        cta: "CHECK YOUR VISIBILITY",
      },
    ],
  },
  {
    id: "engine-experiment",
    avatar: "priya.png",
    theme: "experiment",
    slides: [
      {
        eyebrow: "THE 3-ENGINE TEST",
        title: ["What happens when", "you ask three AI engines", "about the same business?"],
        body: ["The answers are rarely identical."],
        logos: ["openai", "google", "perplexity"],
      },
      {
        eyebrow: "STEP 01",
        title: ["Ask one real", "buyer question."],
        body: ["Use the same wording, market and intent across every engine. Otherwise the comparison is noise."],
        logos: ["openai", "google", "perplexity"],
      },
      {
        eyebrow: "STEP 02",
        title: ["Compare four things."],
        body: ["Was the brand mentioned? Was it described correctly? Which competitors appeared? Which sources were cited?"],
        chips: ["MENTION", "ACCURACY", "RIVALS", "CITATIONS"],
      },
      {
        eyebrow: "STEP 03",
        title: ["Save the evidence.", "Do not trust a screenshot", "from one lucky answer."],
        body: ["A useful benchmark records the prompt, model, response, citations and time."],
        chips: ["PROMPT", "MODEL", "ANSWER", "TIME"],
      },
      {
        eyebrow: "MAKE VISIBILITY MEASURABLE",
        title: ["Benchmark.", "Improve.", "Run it again."],
        body: ["GEO-Pulse tracks the same buyer questions across AI engines."],
        cta: "SEE YOUR AI VISIBILITY",
      },
    ],
  },
  {
    id: "agency-workflow",
    avatar: "blonde-creator.png",
    theme: "agency",
    slides: [
      {
        eyebrow: "THE AGENCY AI-VISIBILITY WORKFLOW",
        title: ["One client.", "Three AI engines.", "One scorecard."],
        body: ["A repeatable way to show clients what AI can find."],
      },
      {
        eyebrow: "01 - SET THE BASELINE",
        title: ["Add the client,", "their domain and", "real competitors."],
        body: ["GEO-Pulse provisions a starting prompt set so the dashboard is not empty on day one."],
        chips: ["DOMAIN", "RIVALS", "PROMPTS"],
      },
      {
        eyebrow: "02 - MEASURE",
        title: ["Run the first", "visibility check", "immediately."],
        body: ["Compare mentions, position and citations across connected AI engines."],
        chips: ["OPENAI", "GEMINI", "PERPLEXITY"],
      },
      {
        eyebrow: "03 - EXPLAIN",
        title: ["Turn the findings", "into a client-safe", "scorecard."],
        body: ["Lead with the score, strongest evidence and next actions. Keep technical detail available, not dominant."],
        chips: ["SCORE", "PROOF", "NEXT ACTION"],
      },
      {
        eyebrow: "04 - KEEP THE CLIENT",
        title: ["Send the update.", "Fix the gaps.", "Show the change."],
        body: ["Recurring measurement gives the agency a reason to stay in the conversation."],
        cta: "BUILD YOUR CLIENT SCORECARD",
      },
    ],
  },
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, x, y, size, gap, color, family = "Arial", weight = 800) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * gap}" fill="${color}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="-1.5">${esc(line)}</text>`,
    )
    .join("");
}

function proofSvg(slide, index) {
  const chips = (slide.chips || [])
    .map((chip, chipIndex) => {
      const x = 64 + (chipIndex % 2) * 250;
      const y = 910 + Math.floor(chipIndex / 2) * 78;
      return `<rect x="${x}" y="${y}" width="220" height="56" rx="18" fill="#17140F"/>
        <text x="${x + 110}" y="${y + 36}" text-anchor="middle" fill="#FFF9ED" font-family="Arial" font-size="17" font-weight="850" letter-spacing="1.5">${esc(chip)}</text>`;
    })
    .join("");
  const cta = slide.cta
    ? `<rect x="62" y="990" width="480" height="78" rx="39" fill="#17140F"/>
       <text x="302" y="1040" text-anchor="middle" fill="#FFF9ED" font-family="Arial" font-size="20" font-weight="850" letter-spacing="1">${esc(slide.cta)}</text>`
    : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#FFF8EB"/>
    <circle cx="890" cy="160" r="280" fill="#F1C84B"/>
    <rect x="0" y="1180" width="${W}" height="170" fill="#F1C84B"/>
    <text x="64" y="90" fill="#7A5A00" font-family="Arial" font-size="18" font-weight="850" letter-spacing="2.4">${esc(slide.eyebrow)}</text>
    ${textLines(slide.title, 62, 210, index === 0 ? 62 : 66, 76, "#17140F")}
    ${textLines(wrapWords(slide.body.join(" "), 43), 64, index === 0 ? 550 : 605, 26, 37, "#514A3F", "Arial", 500)}
    ${chips}${cta}
    <text x="64" y="1268" fill="#17140F" font-family="Arial" font-size="18" font-weight="850" letter-spacing="2">${String(index + 1).padStart(2, "0")} / 05</text>
    <text x="370" y="1268" text-anchor="end" fill="#17140F" font-family="Arial" font-size="19" font-weight="900" letter-spacing="2">GEO-PULSE</text>
  </svg>`);
}

function experimentSvg(slide, index) {
  const chips = (slide.chips || [])
    .map((chip, chipIndex) => {
      const y = 825 + chipIndex * 70;
      return `<circle cx="87" cy="${y}" r="22" fill="#159A7D"/>
        <text x="87" y="${y + 7}" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="17" font-weight="900">${chipIndex + 1}</text>
        <text x="128" y="${y + 8}" fill="#1C2522" font-family="Arial" font-size="23" font-weight="800" letter-spacing="1">${esc(chip)}</text>`;
    })
    .join("");
  const cta = slide.cta
    ? `<rect x="60" y="1010" width="500" height="76" rx="38" fill="#159A7D"/>
       <text x="310" y="1059" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="20" font-weight="850">${esc(slide.cta)}</text>`
    : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#F8FBF9"/>
    <circle cx="70" cy="90" r="4" fill="#159A7D"/><circle cx="92" cy="90" r="4" fill="#159A7D"/><circle cx="114" cy="90" r="4" fill="#159A7D"/>
    <path d="M600 0 L1080 0 L1080 1350 L810 1350 Q660 1080 690 760 Q720 420 600 0" fill="#DFF3EC"/>
    <text x="60" y="130" fill="#14755F" font-family="Arial" font-size="18" font-weight="850" letter-spacing="2.4">${esc(slide.eyebrow)}</text>
    ${textLines(slide.title, 60, 255, index === 0 ? 59 : 64, 74, "#15211E")}
    ${textLines(wrapWords(slide.body.join(" "), 43), 62, index === 0 ? 585 : 620, 26, 37, "#4A5C56", "Arial", 500)}
    ${chips}${cta}
    <rect x="60" y="1242" width="132" height="42" rx="21" fill="#159A7D"/>
    <text x="126" y="1270" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="850">${String(index + 1).padStart(2, "0")} / 05</text>
    <text x="370" y="1270" text-anchor="end" fill="#14755F" font-family="Arial" font-size="19" font-weight="900" letter-spacing="2">GEO-PULSE</text>
  </svg>`);
}

function agencySvg(slide, index) {
  const chips = (slide.chips || [])
    .map((chip, chipIndex) => {
      const y = 780 + chipIndex * 78;
      return `<rect x="62" y="${y}" width="390" height="58" rx="16" fill="#22262C" stroke="#F28B3B" stroke-width="2"/>
        <circle cx="94" cy="${y + 29}" r="11" fill="#F28B3B"/>
        <text x="124" y="${y + 37}" fill="#F7F4EE" font-family="Arial" font-size="20" font-weight="800" letter-spacing="1">${esc(chip)}</text>`;
    })
    .join("");
  const cta = slide.cta
    ? `<rect x="62" y="1000" width="490" height="78" rx="18" fill="#F28B3B"/>
       <text x="307" y="1050" text-anchor="middle" fill="#16181D" font-family="Arial" font-size="20" font-weight="900">${esc(slide.cta)}</text>`
    : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#111318"/>
    <path d="M0 1160 L1080 920 L1080 1350 L0 1350 Z" fill="#1A1E25"/>
    <rect x="62" y="66" width="52" height="8" rx="4" fill="#F28B3B"/>
    <text x="62" y="126" fill="#F28B3B" font-family="Arial" font-size="18" font-weight="850" letter-spacing="2.4">${esc(slide.eyebrow)}</text>
    ${textLines(slide.title, 62, 255, index === 0 ? 72 : 66, 78, "#F8F4EC")}
    ${textLines(wrapWords(slide.body.join(" "), index === 0 ? 27 : 34), 64, index === 0 ? 600 : 625, 26, 38, "#B9BEC8", "Arial", 500)}
    ${chips}${cta}
    <text x="64" y="1272" fill="#F28B3B" font-family="Arial" font-size="17" font-weight="850" letter-spacing="2">${String(index + 1).padStart(2, "0")} / 05</text>
    <text x="370" y="1272" text-anchor="end" fill="#F8F4EC" font-family="Arial" font-size="19" font-weight="900" letter-spacing="2">GEO-PULSE</text>
  </svg>`);
}

async function avatarLayer(stream, index) {
  const avatarPath = path.join(sourceRoot, "avatars", stream.avatar);
  const width = index === 0 ? (stream.theme === "agency" ? 660 : 610) : 500;
  const height = index === 0 ? 900 : 650;
  const top = index === 0 ? 450 : 700;
  return {
    input: await sharp(avatarPath)
      .resize(width, height, { fit: "cover", position: "top" })
      .png()
      .toBuffer(),
    left: W - width,
    top,
  };
}

async function logoLayers(slide) {
  if (!slide.logos) return [];
  const logoFiles = {
    openai: "chatgpt.jpg",
    google: "gemini.jpg",
    perplexity: "perplexity.jpg",
  };
  const layers = [];
  for (let i = 0; i < slide.logos.length; i += 1) {
    const logo = slide.logos[i];
    const x = 60;
    const y = 900 + i * 96;
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="350" height="82"><rect width="350" height="82" rx="22" fill="#FFFFFF" stroke="#CFE7DF" stroke-width="3"/></svg>`),
      left: x,
      top: y,
    });
    layers.push({
      input: await sharp(path.join(root, "public", "ai-engines", logoFiles[logo]))
        .resize(285, 60, { fit: "contain", background: "#FFFFFF" })
        .png()
        .toBuffer(),
      left: x + 32,
      top: y + 11,
    });
  }
  return layers;
}

async function render() {
  for (const stream of streams) {
    const outputDir = path.join(outputRoot, stream.id);
    const publicDir = path.join(publicRoot, stream.id);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    for (let index = 0; index < stream.slides.length; index += 1) {
      const slide = stream.slides[index];
      const svg =
        stream.theme === "proof"
          ? proofSvg(slide, index)
          : stream.theme === "experiment"
            ? experimentSvg(slide, index)
            : agencySvg(slide, index);
      const layers = [
        { input: svg, left: 0, top: 0 },
        await avatarLayer(stream, index),
        ...(await logoLayers(slide)),
      ];
      const image = sharp({
        create: {
          width: W,
          height: H,
          channels: 3,
          background: stream.theme === "agency" ? "#111318" : "#FFFFFF",
        },
      }).composite(layers);
      const outputPath = path.join(outputDir, `slide-${index + 1}.jpg`);
      const publicPath = path.join(publicDir, `slide-${index + 1}.jpg`);
      await image.jpeg({ quality: 87, chromaSubsampling: "4:4:4" }).toFile(outputPath);
      fs.copyFileSync(outputPath, publicPath);
    }
  }
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
