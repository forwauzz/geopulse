GEO-PULSE
Product Requirements Document
v1.0  ·  March 2026  ·  Teché Labs Inc.
SCOPE  This PRD covers the full GEO-Pulse product: MVP definition, audit engine, pricing, tech stack, security architecture, user stories, build phases, marketing pipeline, and success metrics. This is the single source of truth. Refer here before making any product decision.

Product	Version	Status	Owner
GEO-Pulse	v1.0 — MVP	Active Build	Teché Labs Inc.
Last Updated	Build Method	Budget	Revenue Target
March 2026	Cursor / AI-assisted	$0 → $70/mo at scale	$1K MRR by Month 5


1. Problem Statement
Google AI Overviews and AI Mode now serve 2 billion monthly users. For the first time, a site can rank well in traditional search and be completely invisible in AI search — not because of content quality, but because of structural, technical, and semantic readiness failures that no existing tool audits.

The Three Gaps No Current Tool Addresses
•	AI Crawler Blocking: Most sites accidentally block GPTBot, ClaudeBot, or PerplexityBot via outdated robots.txt rules. The site owner has no idea. No audit tool flags this specifically.
•	Extractability Failure: AI models decompose queries into sub-topics and extract structured answers. Sites formatted for reading — not extraction — are invisible to this process.
•	Agent Readiness Gap: Universal Commerce Protocol (UCP), launched January 2026 and backed by Google and Shopify, requires machine-readable commerce primitives for AI agent checkout. Zero audit tools check for it.

Why Existing Tools Miss This
•	Semrush, Ahrefs, Screaming Frog: built for traditional search signals. Zero GEO-specific checks.
•	WordLift AI Audit, Delante: free single-page tools. No scoring, no action plan, no payment layer.
•	Geoptie, Scrunch AI, Peec AI: visibility monitoring. They track citations after the fact. GEO-Pulse audits readiness before.

POSITIONING  "See if AI search engines can actually understand your site." — This is the hero statement. Most people do not know what GEO means. This framing requires zero category education.


2. Product Overview
What GEO-Pulse Is
GEO-Pulse is a freemium AI search readiness auditor. A user enters a URL, the engine runs a 15-point technical and semantic audit, and the product returns an "AI Search Readiness Score" from 0–100 with actionable fixes. The free tier shows the score and the top 3 issues. The paid Deep Audit ($29, one-time) delivers a full 15-point report as PDF + emailed HTML.

What GEO-Pulse Is Not
•	Not a citation predictor — it audits readiness, not outcomes.
•	Not an SEO ranking tool — it does not track keyword positions.
•	Not a content generator — it audits existing content structure.
•	Not an AI visibility monitor — that is a future paid tier, not the MVP.

Brand
•	Name: GEO-Pulse
•	Hero headline: "See if AI search engines can actually understand your site."
•	Score name: AI Search Readiness Score (never "citation probability")
•	Tone: direct, data-first, no hype — the product speaks for itself
•	Visual: dark-mode-adjacent, score-centric, minimal UI


3. Pricing Model
Sequenced to optimise for the fastest first dollar and lowest buyer friction. One-time purchase ($29) is the primary early revenue driver. Subscription introduced only after the one-time model proves demand.

Tier	Price	Audience	Key Features	Launch Phase
Free	$0	All visitors	3 scans/mo, instant score, 3 issues shown	Day 1
Deep Audit	$29 one-time	High-intent SMBs	Full 15-point report, PDF, action plan, emailed instantly	Day 1
Pro	$39/mo	Active site owners	Unlimited scans, weekly monitoring, alerts	Month 2+
Agency	$89/mo	SEO agencies	White-label reports, embed widget, multi-client, branded PDF	Month 3+

SEQUENCING RULE  Do not launch $39/mo Pro until you have 10 confirmed $29 one-time buyers. Do not launch $89/mo Agency until you have 5 confirmed Pro subscribers. Each tier validates the next.

NAMING RULE  The score is always called "AI Search Readiness Score." Never use "citation probability," "AI ranking score," or any phrasing that implies predicted outcomes. This is a technical and semantic readiness audit — not a prediction engine.


4. User Stories

Role	User Story	Acceptance Criteria
SMB Owner	I want to know in 60 seconds if my site can be found in AI search so I know if I have a problem.	Score renders in <8s. 3 issues shown. Email gate before full report. Mobile-friendly.
SMB Owner (paid)	I want a full audit report that tells me exactly what to fix, so I can give it to my developer or agency.	$29 payment completes. PDF report + HTML email delivered within 60s. Action plan included.
SEO Agency Lead	I want to run my clients' sites through GEO-Pulse and send them a branded report so I look proactive.	White-label PDF with agency logo. Custom report URL. Multi-client dashboard. $89/mo gate.
Freelance Consultant	I want to offer GEO audits as a service and use GEO-Pulse as my backend tool so I don't have to build anything.	Agency tier: bulk scan, downloadable PDF, no GEO-Pulse branding visible to end client.
E-commerce Manager	I want to check if my product pages are ready for AI agent checkout so I don't lose sales to competitors.	UCP module: checks machine-readable commerce signals on product pages. Specific fix shown.


5. User Journeys
Journey A — Free Scan User (Primary)
GOAL: GET SCORE + 3 ISSUES WITHOUT PAYING
1.	User lands on geo-pulse.io via social share, directory, or search.
2.	Enters their domain URL into the hero scan form.
3.	Cloudflare Turnstile challenge completes (invisible to user).
4.	Results page loads in <8 seconds: AI Search Readiness Score badge + letter grade + 3 issues.
5.	Email gate appears: "Get your full 15-point report — enter email to continue."
6.	User enters email → stored in leads table → Resend sends a teaser email with score summary.
7.	Results page shows a "Share your score" button with pre-populated social copy and OG image.
8.	CTA: "Get the full report — $29 one-time. No subscription."

Journey B — Deep Audit Buyer ($29)
GOAL: GET FULL 15-POINT REPORT AND ACTION PLAN
9.	User clicks "Get Full Report" on results page or in teaser email.
10.	Stripe Checkout opens (hosted, no card data on GEO-Pulse servers).
11.	Payment completes → Stripe webhook fires → scan queued via Cloudflare Queues.
12.	Worker runs full 15-point audit on homepage + top 2 internal pages.
13.	pdf-lib generates branded PDF report with: score breakdown, per-check findings, ordered action plan.
14.	Resend delivers: HTML email report + PDF attachment within 60 seconds of payment.
15.	User account created automatically (magic link emailed).
16.	Dashboard shows past reports, re-scan option, upgrade CTA.

DELIVERY SLA  Full report must be delivered within 60 seconds of payment confirmation. If the scan job fails, Resend sends a "Report delayed" email and the Worker retries via Cloudflare Queues dead-letter queue. No silent failures.

Journey C — Agency White-Label ($89/mo) — Phase 3
GOAL: RUN CLIENT AUDITS AND DELIVER BRANDED REPORTS
17.	Agency owner signs up, upgrades to Agency tier via Stripe subscription.
18.	Dashboard: upload logo, set brand colours, configure custom report domain.
19.	Agency enters client URL → full audit runs → PDF generated with agency logo.
20.	Agency downloads PDF or uses shareable report URL (custom domain, no GEO-Pulse branding).
21.	Embed widget: copy/paste JS snippet → client-facing audit form on agency website.
22.	Widget captures leads to agency dashboard. Powered-by badge on free embed, removed on paid.


6. Audit Engine — Functional Specification
The audit engine runs inside a Cloudflare Worker. It fetches the target URL, parses the HTML using HTMLRewriter (streaming, no DOM), runs deterministic checks, calls Gemini Flash-Lite only for the two checks that require natural language reasoning (Q&A block detection, extractability), then computes a weighted score.

SSRF PREVENTION  Before any fetch, the Worker must: (1) validate the submitted URL against strict scheme / hostname / port rules, (2) reject private/internal hostname patterns and IP literals (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254, localhost, metadata hosts), and (3) set `redirect: 'manual'` and re-validate redirect targets on every hop. Cloudflare Workers do not expose a native DNS resolution primitive in this implementation path, so the practical protection model is strict hostname validation plus manual redirect validation rather than general-purpose DNS lookups. This is non-negotiable — user-submitted URLs are an SSRF vector.

Scoring Rubric — 100-Point Scale
Check	Weight	What Is Measured	Pass Condition	Fail Fix
AI Crawler Access	15pts	robots.txt: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot	No Disallow for any AI crawler user-agent	Add or update robots.txt to allow AI crawlers
Snippet Eligibility	10pts	X-Robots-Tag, nosnippet, max-snippet meta	No nosnippet or max-snippet=0 found	Remove restrictive snippet tags from key pages
Structured Data (Schema.org)	15pts	JSON-LD: Article, FAQPage, HowTo, Product, LocalBusiness	At least 1 relevant schema type found and valid	Add JSON-LD schema matching page type
Q&A Content Blocks	10pts	Presence of direct-answer paragraphs (60–80 word concise blocks)	3+ extractable answer blocks detected	Reformat key content as Q&A with direct answers
Header Hierarchy	10pts	H1–H4 logical nesting that supports sub-query decomposition	H1 present, H2s follow logical topic breakdown	Restructure headers to match intent sub-topics
llms.txt Presence	10pts	/llms.txt file accessible at root domain	File exists and is well-formed	Create and publish /llms.txt
E-E-A-T Signals	10pts	Author bylines, About page, citations, trust signals	Author name + About page or org page detectable	Add author markup and trust page
Page Speed (Core Web Vitals)	10pts	LCP, CLS, FID via Lighthouse API or PageSpeed Insights API	LCP <2.5s, CLS <0.1	Compress images, defer JS, fix layout shift
HTTPS + Security Headers	5pts	HTTPS enforced, CSP or X-Frame-Options present	HTTPS active, at least 1 security header present	Force HTTPS, add Cloudflare security headers
UCP Agent Readiness	15pts	Machine-readable commerce primitives for AI agent checkout (product JSON, price, availability)	Product schema with price + availability present (e-commerce only)	Add Product schema with offer, price, availability fields
TOTAL	100pts			

Score Bands and Letter Grades
•	90–100: A+ — Fully ready. Cite-worthy structure across all checks.
•	75–89: B — Good foundation. 2–3 structural gaps to close.
•	55–74: C — Partial readiness. AI can partially extract content.
•	35–54: D — Significant gaps. AI crawlers may be blocked or extractability is poor.
•	0–34: F — Not ready. Multiple critical failures. Likely invisible to AI search.

SCORE DESIGN INTENT  Calibrate the scoring weights so that the average site scores 45–65/100. This range triggers both sharing behaviours: high scorers brag, low scorers share seeking validation. Both drive traffic. Never inflate scores to make users feel good.

AI Reasoning Layer — Gemini Flash-Lite Usage
Gemini Flash-Lite (1,000 req/day free tier) is called for exactly two checks that require semantic understanding:
•	Q&A Block Detection: given the extracted body text, identify and count direct-answer paragraphs (60–80 words, question-answer format). Binary: pass if 3+ found.
•	Extractability Signal: given the H1–H4 header structure, assess whether the hierarchy supports AI sub-query decomposition. Binary: pass or fail with a one-line reason.
All other checks are deterministic — no AI required. Gemini is not called for scoring, not called for report generation, and not called for anything else in the MVP.

Report Contents — Deep Audit ($29)
•	Cover: domain, date, overall score, letter grade
•	Executive Summary: 3-sentence plain-English verdict
•	Score Breakdown: all 15 checks, pass/fail, weight, finding per check
•	Top 3 Critical Issues: expanded with exact fix instructions
•	Action Plan: ordered priority list — do these 5 things first
•	Technical Appendix: raw robots.txt content, schema.org findings, headers found
•	Footer: GEO-Pulse branding, report date, scan ID for re-verification


7. Technology Stack
Every tool chosen for two criteria: (1) commercially usable free tier, and (2) fits inside Cloudflare's edge-native architecture. No Vercel. No Make.com. No Puppeteer. These exclusions are final.

Layer	Tool	Purpose	Free Limit	First Upgrade
Frontend	Next.js 15 + OpenNext	App, landing page, results, dashboard	Unlimited (CF Pages)	Never (Pages stays free)
Hosting	Cloudflare Pages	Static + SSR deployment, commercial OK	Unlimited bandwidth	Never
API / Logic	Cloudflare Workers	Scan engine, scoring, PDF gen, webhooks	100K req/day	$5/mo (CPU limit)
Queue	Cloudflare Queues	Async scan jobs, report delivery	10K ops/day	Paid Workers ($5)
Database	Supabase	Users, scans, leads, reports, RLS auth	500MB, 50K MAU	$25/mo (bandwidth)
AI Reasoning	Gemini 2.5 Flash-Lite	Content extractability, Q&A block detection	1,000 req/day free	$0.01–0.03/1K tok
PDF Generation	pdf-lib	Branded report PDF, runs in Workers	Free OSS	Never
Email	Resend	Report delivery, onboarding, alerts	100/day, 3K/mo	$20/mo (Pro)
Payments	Stripe	$29 one-time, $39/mo, $89/mo	2.9% + $0.30/txn	Never (% only)
Auth	Supabase Auth	Magic link + OAuth, sessions, RLS integration	50K MAU free	With DB upgrade
Automation	n8n (self-hosted)	Content gen, social scheduling, lead routing	Free on Oracle CF	Never (self-hosted)
Social Scheduling	Buffer Free	X, Instagram, LinkedIn — 3 channels, AI gen	30 posts/channel/mo	$6/mo (Essentials)
CAPTCHA	Cloudflare Turnstile	Scan form abuse prevention	Free, unlimited	Never
Analytics	Cloudflare Analytics + Supabase	Traffic, scan volume, conversion events	Free	Never

Architecture Overview
•	Next.js 15 App Router deployed to Cloudflare Workers via @opennextjs/cloudflare (not @cloudflare/next-on-pages — deprecated).
•	Scan requests hit a dedicated Cloudflare Worker (not a Next.js API route) to keep CPU time isolated and avoid the 10ms free-tier CPU limit on the frontend Worker.
•	Cloudflare Queues handles async job processing: scan job enqueued on payment, consumed by scan Worker, result written to Supabase, email triggered via Resend.
•	Supabase is accessed exclusively via the Supabase client library using anon key for user-scoped operations and service_role key (Wrangler secret) only in Workers for admin operations.
•	pdf-lib runs inside the scan Worker to generate the PDF report programmatically. No external PDF service required.

Cursor Rules Setup
Create .cursor/rules/ with scoped .mdc files (not the deprecated .cursorrules):
•	base.mdc: always-apply rules — TypeScript strict, no any, prefer explicit types, no console.log in production
•	workers.mdc: scoped to /workers/** — CF Worker patterns, no Node.js APIs, use HTMLRewriter not cheerio, SSRF validation on all fetch calls
•	frontend.mdc: scoped to /app/** — Next.js App Router patterns, no client-side fetch to Supabase, use server actions
•	security.mdc: always-apply — never log secrets, never expose service_role, always validate user input

CURSOR RULE  Add to workers.mdc: "Never use Puppeteer, node-fetch, or any Node.js built-in that is not available in the CF Worker runtime. Always validate user-submitted URLs against a private IP blocklist before fetching."


8. Data Model
Six tables. RLS enabled on all of them before the first row is inserted. The leads table uses service_role only — it holds pre-auth email captures and must never be exposed to the anon key.

Table	Key Fields	Purpose	RLS Policy
users	id, email, plan, created_at, stripe_customer_id	Auth + billing identity	user_id = auth.uid()
scans	id, user_id, url, status, score, issues_json, created_at	Every audit run, free and paid	user_id = auth.uid() OR is_public = true
leads	id, email, url, score, source, converted, created_at	Email captures before auth (free scan gate)	Service role only (no user RLS)
reports	id, scan_id, user_id, pdf_url, delivered_at, type	Paid Deep Audit reports	user_id = auth.uid()
agencies	id, user_id, name, logo_url, custom_domain, active	Agency white-label config	user_id = auth.uid()
payments	id, user_id, stripe_session_id, amount, type, created_at	Audit trail of all transactions	user_id = auth.uid()

Critical RLS Policies
•	Enable RLS: ALTER TABLE [table] ENABLE ROW LEVEL SECURITY; — run on every table at creation.
•	Users table: CREATE POLICY "own row" ON users FOR ALL USING (id = auth.uid());
•	Scans table: CREATE POLICY "own scans" ON scans FOR ALL USING (user_id = auth.uid());
•	Reports table: CREATE POLICY "own reports" ON reports FOR ALL USING (user_id = auth.uid());
•	Leads table: no user-facing policy — service_role only. Never expose via anon key.
•	Index all RLS policy columns: CREATE INDEX ON scans(user_id); — missing indexes cause 2–11x slowdown.


9. Security Architecture
Security is a day-one requirement, not a post-launch retrofit. Every item in the table below must be implemented before the product goes live.

Risk	Mitigation	Implementation
SSRF via user-submitted URLs	Validate URL scheme, block private IPs, validate DNS before fetch	Worker: allowlist https only, reject 127.x/10.x/192.168.x/169.254.x, set redirect: manual
Scan endpoint abuse	Rate limit per IP + per email + Turnstile CAPTCHA	CF Workers Rate Limiting binding: 10 req/min per IP. Turnstile on scan form. Block >20 req/day per email.
Supabase data exposure	RLS on every table. Never expose service_role key to client.	Enable RLS before inserting first row. Test with anon key only. service_role in Wrangler secrets only.
API key leakage	All secrets via wrangler secret put. Never in wrangler.toml or source.	.dev.vars for local. Cloudflare Secrets Store (beta) for shared multi-worker secrets.
Stripe webhook spoofing	Verify Stripe-Signature header on every webhook	stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET). Reject unverified events.
Bot scraping of scan results	Cloudflare Bot Fight Mode (free) + Turnstile	Enable Bot Fight Mode in CF dashboard. Turnstile on all forms. Results page requires email.
Email deliverability	SPF + DKIM + DMARC from day 1	Add Resend DNS records in Cloudflare. Start with DMARC p=none, escalate to p=reject after 30 days.
Next.js auth bypass (CVE-2025-29927)	Cloudflare WAF managed rule enabled	Enable in CF dashboard: Security → WAF → Managed Rules. Keep Next.js patched.

NON-NEGOTIABLES  RLS on every table. SSRF validation on every fetch. Stripe webhook signature verification. Turnstile on the scan form. SPF + DKIM + DMARC before first email send. These five items block launch if incomplete.


10. Marketing Strategy & Growth Pipeline
The marketing system is a product decision — it runs without manual involvement after setup. The three growth loops below are embedded into the product, not bolted on as campaigns.

Growth Loop 1 — Share Your Score
The most powerful distribution mechanic in the product. Every scan produces a shareable OG image: score badge, letter grade, domain name. One-click share to X, LinkedIn, Instagram.
•	Pre-populated tweet: "Just scanned [domain] on GEO-Pulse — AI Search Readiness Score: 58/100 (D). Found 3 things blocking AI search visibility. Free scan: geopulse.io 🔍"
•	Do not include percentile or peer-ranking claims until the benchmark pipeline is implemented and methodologically defensible.
•	Design scoring so most sites land 45–65 — triggers both ego share and anxiety share.
•	Results page shows score prominently before the email gate — they see the number first.

Growth Loop 2 — Agency Embed Widget (Phase 3)
Agencies embed a white-label scan form on their websites. Clients scan → email captured → agency gets the lead → GEO-Pulse gets backlink and brand exposure.
•	Free embed: "Powered by GEO-Pulse" footer link — permanent backlink on every embed.
•	Agency tier ($89/mo): removes branding, adds agency logo, custom domain.
•	Pitch to agencies: "Give your clients a free GEO audit tool on your website — positions you as an AI search expert before the call."

Growth Loop 3 — Cold Agency Outreach with Product as Hook
The outreach email uses the product itself as the personalisation mechanism — scan the prospect's client site before emailing, include their actual score in the subject line.
•	Subject: "We scanned [client domain] for AI search readiness — they scored 54/100"
•	Body: 3 actual issues found. Offer the full report. No generic pitch.
•	Tool: Apollo.io free tier (10K credits/mo). Hunter.io for email finding (25 free/mo).
•	Sequence: 5 touches over 30 days — see full sequence in the Marketing Strategy document.

Content Engine — Automated Social Distribution
Runs via n8n (self-hosted, Oracle Cloud Always Free) → Gemini API → Buffer Free. Zero manual input after setup. One insight per week becomes 7 posts across 5 platforms.
•	X (Twitter): 3 posts/day — primary channel. GEO tips, score reveals, AI search news.
•	Instagram: 1 post/day — scorecards, carousels, before/after reveals.
•	Threads: auto-reposts X content via Buffer.
•	LinkedIn brand page: 3 posts/week via Buffer. Low ROI, but automated so zero cost.
•	YouTube/TikTok: 2–3 faceless explainer videos/week via InVideo AI ($20/mo) — Month 2+.

Launch Sequence — Days 15–21
23.	Deploy to production on Cloudflare Pages + Workers.
24.	Product Hunt launch — Tuesday midnight PT. Respond to every comment.
25.	Show HN on Hacker News — be honest about solo build, include technical detail.
26.	Submit to: There's An AI For That, Toolify.ai, FutureTools, Futurepedia, AI Scout.
27.	Submit to: AlternativeTo, SaaSHub, G2, Capterra.
28.	Post in r/SEO, r/SaaS with genuine insight post (not self-promotion).
29.	Send first 50 cold emails to SEO agencies with personalised site scores.

SEO Content Strategy
Organic search is a 4–6 month compounding play. Start building from Day 1 so it pays off by Month 4.
•	Pillar 1 — Tool landing pages: "GEO readiness checker," "AI search readiness audit," "Is my site GEO ready."
•	Pillar 2 — Comparison pages: "GEO-Pulse vs Geoptie," "GEO-Pulse vs WordLift," "best GEO audit tool 2026."
•	Pillar 3 — Programmatic SEO: industry-specific readiness pages (Month 4+, only after manual pages rank).


11. Build Phases
21 days to first live sale. Each phase has a clear exit criterion — do not move to the next phase until the criterion is met.

Phase	Timeline	Deliverables	Exit Criteria
0	Days 1–3	Scaffold: Next.js 15 + OpenNext + Cloudflare Workers
Supabase project + RLS on all tables from day 1
Wrangler secrets configured, .cursor/rules/ set up	wrangler dev runs locally. Supabase tables exist. Cursor rules active.
1	Days 4–7	Landing page: hero, scan input, value prop, pricing
Scan engine Worker: fetch URL, parse HTML, run 10 checks
Results page: score display + 3 issues + email gate	End-to-end scan works locally. Score renders. Email captured in Supabase leads table.
2	Days 8–11	Stripe $29 one-time checkout + webhook handler
pdf-lib report generation in Worker
Resend email delivery: HTML report + PDF attachment	$1 test payment succeeds. PDF generated and emailed within 60s of payment.
3	Days 12–14	Supabase auth: magic link + Google OAuth
User dashboard: scan history, past reports
Cloudflare Queues: async scan jobs for deep audit	Registered user can log in, see past scans, access paid reports.
4 — Launch	Days 15–21	Deploy to Cloudflare Pages + Workers production
Share-your-score OG image + social share buttons
Submit: Product Hunt, directories, HN Show HN, Reddit	Live at custom domain. First 10 real scans. First email capture. First $29 sale.
5 — Scale	Month 2+	Pro subscription ($39/mo): monitoring + alerts
Agency tier ($89/mo): white-label, embed widget
Content engine live: n8n + Gemini + Buffer autopilot	3 paying Pro users. 1 Agency subscriber. Content running without manual input.

BUILD ORDER RULE  Phase 0 → Phase 1 → Phase 2 is the critical path. Never start social content before the product is live. Never start agency outreach before the $29 payment flow works end-to-end. Distribution without a working product is wasted effort.


12. Success Metrics

Metric	Week 4	Month 2	Month 3	Source
Free scans / week	50+	200+	500+	Supabase scans table
Email capture rate	10%	15%	20%+	leads / scans ratio
$29 audit purchases	1–3	10–20	30–50	Stripe dashboard
MRR (subscriptions)	$0	$200–$500	$800–$1,200	Stripe MRR view
Share-your-score clicks	Baseline	100/wk	400/wk	CF Analytics
Agency inbound leads	0	2–5	8–12	Supabase leads table
Organic search traffic	~0	200–500/mo	1K–3K/mo	CF Analytics

Early Warning Thresholds — Trigger a Review If:
•	Email capture rate below 5% for 2 consecutive weeks → the free scan is not delivering instant value. Test a stronger gating message or show more of the report before the gate.
•	$29 conversion rate below 1% after 100 email captures → pricing page copy problem or wrong audience. Test lowering to $19 or changing the offer framing.
•	Agency outreach reply rate below 1.5% → subject line or personalisation is failing. Test 3 new subject lines with real client scores.
•	Share-your-score click rate below 3% → the score badge visual is not compelling. Redesign the OG image or add competitive framing.
•	Gemini API returning 429s → approaching 1,000 RPD free limit. Add request queuing and consider upgrading to paid tier ($0.01–0.03/1K tokens).


13. MVP Scope Exclusions
These features are explicitly out of scope for the MVP. They are documented here to prevent scope creep during the build. Any deviation requires deliberate re-evaluation, not just momentum.

Feature	Why Out of MVP Scope	When to Add
White-label / agency tier	Second-stage monetisation. Needs subscription layer first.	Month 3, after 3+ Pro subscribers
Subscription monitoring ($39/mo)	Requires recurring billing, alerting infra, and proven retention.	Month 2, after $29 audit validates demand
Make.com / Zapier automation	15x over free operation limit. n8n self-hosted is the correct path.	Never — use n8n instead
Vercel hosting	Hobby plan prohibits commercial use. CF Pages is better.	Never — CF Pages is the stack
Puppeteer PDF generation	Cannot run in CF Worker V8 isolate. Use pdf-lib.	CF Browser Rendering if needed (paid)
Faceless video (YouTube/TikTok)	Non-blocking. Requires $20/mo (InVideo). Low early ROI.	Month 2 after first revenue
Programmatic SEO pages	60% failure rate without strong manual content first.	Month 4+, after organic traction confirmed
Citation probability scoring	Unprovable claim. Damages credibility. Not in product.	Never — use "AI Search Readiness Score" only


14. Operating Cost Runway
Month 1 — $0 to $20/month
•	Cloudflare Workers + Pages: $0
•	Supabase: $0 — keep alive with cron ping to prevent 7-day inactivity pause
•	Resend: $0 — 100 emails/day cap. First forced upgrade when daily sends exceed 80.
•	Gemini 2.5 Flash-Lite: $0 — 1,000 req/day. Monitor usage.
•	Buffer: $0 — 3 channels free
•	n8n: $0 — self-hosted Oracle Cloud Always Free (4 OCPU ARM, 24 GB RAM)
•	Stripe: $0 + 2.9% + $0.30 per transaction
•	InVideo AI: $20/month — first paid expense. Delay to Month 2.
•	Domain: ~$12/year

Month 2–3 Forced Upgrades
•	Cloudflare Workers paid: $5/month — 10ms CPU limit breaks PDF generation on free tier
•	Resend Pro: $20/month — when daily email volume exceeds 80
•	Supabase Pro: $25/month — when bandwidth or inactivity-pause is a recurring problem
•	Total at full early-stage operation: ~$70/month

BREAK-EVEN  2 Pro subscribers ($78/mo) covers all $70 operating costs from Month 2 onward. The product is cash-positive before the third subscriber. Every $29 one-time audit sale in Month 1 is pure margin above the $0 cost base.


15. Open Questions & Decisions Pending
•	Domain: geopulse.io vs geo-pulse.com vs geopulse.ai — check availability before setup. Prefer .io or .ai for the tech-forward positioning.
•	Supabase keep-alive: set a Cloudflare Cron Trigger to ping the Supabase health endpoint every 24 hours to prevent the 7-day inactivity pause on the free tier.
•	Score calibration: requires testing against 50+ real sites to validate that most score 45–65. Adjust weights if the distribution skews too high or too low.
•	Gemini provider fallback: architect the AI call so the provider (model name, endpoint) is a config variable, not hardcoded. This allows switching to Cloudflare Workers AI or OpenAI with one config change if Gemini limits drop again.
•	Agency tier domain config: custom domain white-label requires a Cloudflare CNAME setup per agency — evaluate if this is manual or automated via Cloudflare API before committing to the feature.
•	GDPR / Quebec Law 25: if scanning sites in Quebec or EU, the leads table (email capture) requires a compliant privacy notice and opt-in at the email gate. Consult before launch if targeting these regions actively.


Decision Framework
BEFORE ANY PRODUCT DECISION  Ask three questions: (1) Does this make users more likely to share their score, embed the widget, or refer an agency? (2) Does this block a paying user from getting value? (3) Does this belong in Phase 4 or later? If the answer to all three is no — defer it. Build what compounds.

GEO-Pulse PRD v1.0  ·  Teché Labs Inc.  ·  March 2026  ·  Confidential
