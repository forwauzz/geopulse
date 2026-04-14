GEO-PULSE
Marketing Strategy & Growth Pipeline
Day One to $1K MRR — Fully Automated, No Face, No Budget
⚠️  This document is the operational marketing bible for GEO-Pulse. It covers brand positioning, platform strategy, content engine, agency pipeline, growth loops, and week-by-week execution. Nothing here requires manual involvement after setup.

Monorepo - microservice build 

1. North Star & Brand Positioning
GEO-Pulse is a faceless, automated SaaS brand. No founder face. No personal brand. The product is the brand — and the score is the product's voice.

Brand Identity
•	Name: GEO-Pulse
•	Tagline: "Is your site ready for AI search?" (functional, scannable)
•	Secondary tagline: "The technical GEO readiness authority."
•	Tone: sharp, direct, data-first — no fluff, no hype
•	Visual: dark mode-adjacent, score-focused, minimal

Positioning Statement
"GEO-Pulse is the only tool that tells you exactly why your site isn't showing up in AI search — and gives you the fix in under 60 seconds."

Primary Audience (in order of priority)
1.	SEO agencies — highest LTV, white-label buyers, recurring revenue
2.	SMB owners in e-commerce, local services, SaaS — highest volume
3.	In-house SEO/marketing leads at mid-market companies
4.	Freelance consultants who resell audits

Differentiation That Matters
Incumbents (Semrush, Ahrefs, WordLift) audit technical SEO for traditional search. GEO-Pulse audits for AI search — a different set of signals, a different buyer anxiety, a different scoring rubric. The three features no competitor covers:
•	UCP agent-readiness check — is your site ready for AI agent checkout?
•	Query Fan-Out extractability — can AI decompose your content across sub-queries?
•	AI crawler eligibility — are you accidentally blocking GPTBot, ClaudeBot, PerplexityBot?


2. Pricing & Revenue Model
Monthly subscription wins. One-time reports are a trap — they create a revenue treadmill. The model below stacks subscriptions plus a one-time upsell for high-intent buyers.

Tier	Price	Who	Key Feature	Target MRR
Free	$0	Any business owner	3 scans/mo, no PDF	Lead gen
Pro	$39/mo	SMB / solopreneur	Full report + PDF + alerts	$780 @ 20 users
Agency	$89/mo	SEO agencies	White-label + embed widget	$890 @ 10 agencies
Deep Audit	$69 one-time	High-intent buyers	Manual + AI 10-page audit	Upsell accelerator

Agency tier is the highest leverage bet. 10 agencies at $89/month = $890 MRR with near-zero support load. Prioritise agency acquisition from Month 2 onward.


3. Platform Strategy & Automation Stack
All platforms run on autopilot. Content is AI-generated, reviewed once per batch during setup, then scheduled and forgotten. The stack below requires approximately 4 hours of initial setup and 1 hour per week of spot-checking after.

Platform	Purpose	Tool	Cost	Automation
X / Twitter	Primary thought leadership	Buffer Free + Gemini API	$0	100% auto
Instagram	Visual scorecards + carousels	Buffer Free + Canva	$0	100% auto
Threads	Repurposed X content	Buffer Free (cross-post)	$0	100% auto
YouTube	Faceless explainer clips	InVideo AI + YT Studio	$20/mo	90% auto
TikTok	Short-form GEO tips	InVideo AI + TikTok Sched.	Shared above	90% auto
LinkedIn	Brand page, low priority	Buffer Free (cross-post)	$0	100% auto

Platform Priority Order
5.	X (Twitter) — primary channel. SEO and GEO audience is most active here. Highest organic reach for a faceless tech brand. 3 posts/day.
6.	Instagram — secondary channel. Scorecard graphics and carousels drive sharing. 1 post/day.
7.	YouTube / TikTok — growth channel. Faceless explainer clips index on Google and drive long-tail discovery. 2-3 videos/week.
8.	Threads — passive repurposing. Everything from X auto-posts here via Buffer.
9.	LinkedIn — lowest ROI. Post 3x/week via Buffer brand page. Do not invest time here beyond setup.

Why Not LinkedIn-First?
LinkedIn brand pages get 2–5% organic reach versus 10–30% for personal profiles. Without a founder face, LinkedIn is a low-return channel. Set it up, auto-schedule into it, but do not treat it as a primary growth lever.


4. Content Engine: The Automated Flywheel
How It Works
The content engine runs on a weekly cycle. Every piece of content traces back to one source: a GEO insight, a real audit result, or a platform trend. One insight becomes seven posts across five platforms automatically.

•	Source input: 1 insight per week (GEO stat, audit finding, or Google AI Mode change)
•	Gemini API generates: X thread, Instagram caption, LinkedIn post, video script
•	n8n workflow routes each piece to Buffer queue
•	Buffer schedules automatically across all connected platforms
•	InVideo AI converts video scripts to faceless short-form clips
•	Canva templates batch-produce Instagram carousels once a week

Weekly Content Calendar
Day	Platform	Format	Content Angle	CTA	Auto?
Mon	X	Thread	GEO tip (robots.txt, schema, citations)	Scan your site	100%
Tue	Instagram	Carousel	Score comparison: before/after	Get your score	Canva → Buffer
Wed	X + LinkedIn	Stat post	"X% of sites block AI crawlers unknowingly"	Check yours	100%
Thu	YouTube/TikTok	60s video	Faceless explainer: what is GEO?	Link in bio	90% (InVideo)
Fri	X	Insight post	Weekly GEO trend: what changed in AI search	Free tool link	100%
Sat	Instagram	Single graphic	Score badge for a known brand	What would yours be?	Canva → Buffer
Sun	All (Threads reposts)	Recap	Best-performing post from the week	Passive	Buffer auto

Content Themes (Rotate Weekly)
10.	Technical GEO — robots.txt for AI crawlers, nosnippet tags, llms.txt, structured data
11.	Score reveals — "We scanned [brand name] and here's what we found"
12.	AI search news — what changed in Google AI Mode this week
13.	Before/after — site that improved its GEO score after following the recommendations
14.	Agency use case — how an agency used GEO-Pulse to win a client

AI Content Generation Prompt Template (for n8n → Gemini)
System: You are a GEO (Generative Engine Optimization) expert writing for a faceless brand called GEO-Pulse. Write in a direct, data-first tone. No emojis unless specified. No fluff. Output only the requested format.
User: Write a 280-character X post about [INSIGHT]. Include a CTA to "Scan your site free at geopulse.io". Output only the post text.


5. Built-In Growth Loops
The three mechanisms below are embedded into the product itself — not bolted on as marketing campaigns. They compound over time without additional effort.

Loop 1: Share Your Score
Design the scoring rubric so most sites score 40–70/100. This range triggers two responses simultaneously: high scorers brag, low scorers share seeking validation. Both drive traffic.
•	Every results page shows a pre-generated OG image: score badge + letter grade
•	One-click share to X, LinkedIn, Instagram with pre-populated copy
•	Include: "You scored better than X% of sites in your industry"
•	Results should feel personalised — reference their actual domain and issues

Pre-populated tweet: "Just scanned [domain] on GEO-Pulse — scored 64/100 for AI search readiness. Found 3 critical issues I didn't know about. Free scan: geopulse.io 🔍" — The domain personalisation makes people post it because it feels like their discovery.

Loop 2: Embeddable Agency Widget
Agencies embed a white-label "GEO Readiness Check" form on their own websites. When their clients scan, GEO-Pulse captures the lead (email-gated). The agency benefits from a premium lead-gen tool on their site. GEO-Pulse gets brand exposure and backlinks.
•	Free embed with "Powered by GEO-Pulse" footer branding
•	Agency tier removes branding and adds custom logo + domain
•	Every embedded widget is a permanent backlink to geopulse.io
•	Agencies are incentivised to promote the embed — it makes them look innovative

Loop 3: Comparison Pages (Programmatic SEO)
Create pages targeting searches like "GEO-Pulse vs Semrush", "GEO-Pulse vs Geoptie", "best GEO audit tool", "AI SEO checker alternative". These pages convert visitors who are already comparison-shopping — highest intent traffic.
•	Each page: 800–1,200 words, unique angle, clear verdict
•	Avoid thin content — Google has been penalising AI-generated comparison pages with no differentiation
•	Include an embedded live scan widget on each comparison page

Loop 4: AI Directory Submissions
Submit to every relevant directory once at launch. These create permanent backlinks and discovery traffic at zero ongoing cost.
•	Tier 1 (highest traffic): Product Hunt, There's An AI For That, Toolify.ai, FutureTools
•	Tier 2: Futurepedia, AI Scout, AlternativeTo, SaaSHub
•	Tier 3 (SEO value): Capterra, G2, BetaList, IndieHackers
•	SEO-specific: r/SEO sidebar resources, SEO tool roundup articles (pitch via HARO)


6. Day-One Setup Checklist
This is the exact sequence of setup tasks. Each item is a one-time action unless noted. Order matters — do not run content before infrastructure is live.

Week 1: Infrastructure
15.	Register domain (geopulse.io or geo-pulse.com — check availability)
16.	Set up Cloudflare account — add domain, enable Bot Fight Mode
17.	Set up Supabase project — configure RLS from day one (do not skip)
18.	Create brand identity: logo, colour palette, OG image templates in Canva
19.	Create all social accounts: X, Instagram, Threads, YouTube, TikTok, LinkedIn
20.	Connect all accounts to Buffer (free, 3 channels — prioritise X, Instagram, LinkedIn)
21.	Set up TikTok native scheduler and YouTube Studio
22.	Set up Resend — add domain, configure SPF/DKIM/DMARC in Cloudflare DNS
23.	Set up Stripe — create Payment Links for Pro ($39/mo) and Agency ($89/mo)
24.	Self-host n8n on Oracle Cloud Always Free — configure base workflows
25.	Create Gemini API key — free tier, verify 1,000 RPD limit

Week 2: Content Infrastructure
26.	Build Canva content templates: X header, Instagram post, carousel (10-slide), score badge OG image
27.	Write the base AI prompt templates for X, Instagram, LinkedIn, YouTube scripts
28.	Build n8n workflow: insight input → Gemini generate → Buffer queue → schedule
29.	Generate and schedule first 2 weeks of content before launch
30.	Set up InVideo AI account ($20/mo) — create brand kit, voice, style
31.	Produce first 3 YouTube/TikTok videos — schedule for weeks 3 and 4
32.	Set up Apollo.io free account — build first agency prospect list (250 contacts)

Week 3: Launch
33.	MVP live on Cloudflare Pages (product must be functional before promotion)
34.	Submit to Product Hunt — schedule Tuesday midnight PT launch
35.	Post Show HN on Hacker News (be honest, technical, founder-transparent even if faceless — say "built by a small team")
36.	Submit to all Tier 1 directories (same week as launch)
37.	Post in r/SEO, r/SaaS, r/Entrepreneur with genuine value post (not pure self-promotion)
38.	Send 50 personalised cold emails to SEO agencies (include their site's GEO score)
39.	Social content goes live — Buffer auto-schedules from this point

Week 4: Optimise the Funnel
40.	Review scan → email capture rate. If below 8%, test a stronger gate message
41.	Review email capture → paid conversion. If below 2%, test pricing page copy
42.	Check Resend daily email count — if hitting 80+ emails/day, upgrade to Resend Pro ($20/mo)
43.	A/B test two share-your-score message variants on the results page
44.	Respond to every Product Hunt comment, HN comment, Reddit reply personally (or via scheduled response)


7. Agency Acquisition Pipeline
Agencies are the most valuable customer segment. One agency at $89/month is worth more than three Pro subscribers. The pipeline below focuses on personalised outreach using the product itself as the hook — no generic cold email.

Finding Agency Prospects
•	Apollo.io free tier: search "SEO agency" + location, filter by company size 2–50 employees
•	Hunter.io: find decision-maker emails for targeted firms (25 free searches/month)
•	LinkedIn brand page: engage with agency content — like, comment with insights — before DMing
•	Twitter/X: search "SEO agency" + "GEO" or "AI search" — these are already aware buyers
•	Directories: Clutch, Agency Spotter, UpCity — browse and manually build list

The 5-Touch Outreach Sequence
Step	Day	Touch	Message angle
1	Day 0	Cold email #1	Run their client's site through GEO-Pulse, send the score in the email. "Here's what your client scored — thought you'd want to see it."
2	Day 3	Follow-up	One-liner: share the PDF preview. "The full report is attached — covers their robots.txt, schema gaps, and 3 quick wins."
3	Day 7	Value add	Send a GEO benchmark for their niche. No ask. Just useful.
4	Day 14	Offer	Offer white-label access: "Your clients see your logo, your domain. $89/month. I'll set it up for you."
5	Day 30	Last touch	Case study or result from another agency. Move to nurture list if no reply.

The Cold Email That Works
Subject: We scanned your client's site for GEO readiness — here's what we found
 Hey [Name],  I ran [Client Domain] through GEO-Pulse, our AI search readiness auditor. They scored 54/100.  The three biggest issues: • Missing llms.txt (GPTBot is partially blocked) • No Q&A structured data on key product pages • Headers don't support query fan-out — AI can't extract sub-answers  If you're offering GEO services to clients, this is the gap most agencies aren't catching yet.  I've attached a full PDF. Happy to walk through it.  [First name]


8. SEO Content Strategy
Organic search is a 4–6 month play. Start building it from day one so it compounds while other channels do the early lifting. Three content types, in order of production priority.

Pillar 1: Long-Tail Intent Pages (Highest Conversion)
•	"GEO readiness checker" — exact-match tool page
•	"Is my site ready for AI search" — question-format landing page
•	"How to optimize for Google AI Mode" — how-to guide with embedded scan widget
•	"ChatGPT SEO tool" / "Gemini SEO checker" — captures mislabelled searches
•	"llms.txt generator" — attract technical SEO practitioners

Pillar 2: Comparison Pages (Decision-Stage Traffic)
•	GEO-Pulse vs Geoptie — direct competitor comparison
•	GEO-Pulse vs WordLift — enterprise alternative angle
•	GEO-Pulse vs Semrush for AI search — incumbent comparison
•	Best GEO audit tools 2026 — own the category roundup

Pillar 3: Programmatic SEO (Scale — Month 3+)
Generate industry-specific readiness pages at scale only after confirming organic traction. Template: "[Industry] GEO Readiness: How [Industry] Businesses Can Rank in AI Search."
Do not launch programmatic SEO until manual pages are ranking and you can confirm each programmatic page has 800+ unique words with a real score example. Thin programmatic content will harm the domain.


9. 90-Day Revenue Pipeline
Phase	Timeline	Primary Goal	Key Actions	Revenue Target
0	Week 1-2	Infrastructure live	Domain, brand identity, all accounts set up	$0
1	Week 3-4	MVP live + first users	Product Hunt, directories, Show HN, 5 community posts	$0-$200
2	Month 2	Email list + social traction	Content engine live, agency outreach starts, share loop optimised	$200-$600
3	Month 3	$1K MRR milestone	Agency white-label push, embed widget deployed, SEO content live	$600-$1,200

Month 1 Focus: Distribution Over Optimisation
The single most important thing in Month 1 is getting the product in front of real users. Do not spend time on conversion rate optimisation, A/B testing, or advanced features. Ship, distribute, and listen.
•	Week 1–2: Infrastructure complete
•	Week 3: Launch hard — Product Hunt, HN, Reddit, cold email batch 1
•	Week 4: First revenue attempt — follow up with everyone who scanned their site

Month 2 Focus: Lead Engine
By Month 2, you should have real data on where users come from and where they drop. Optimise the scan → email → paid flow. Start the agency pipeline in earnest.
•	Email list: target 300 captures by end of Month 2
•	Content engine: fully running, no manual input required
•	Agency outreach: 250 emails sent, 10+ replies, 2–5 demos scheduled

Month 3 Focus: Agency Revenue
Month 3 is where the model proves itself or doesn't. The share-your-score loop should be generating organic traffic. Agency white-label should be generating recurring revenue. Evaluate whether to double down or pivot the pricing model.
•	Target: 3–5 agency subscribers at $89/month = $267–$445 from agencies alone
•	Target: 15–20 Pro subscribers at $39/month = $585–$780
•	Target: 2–4 Deep Audit one-time purchases = $138–$276
•	Combined MRR target: $800–$1,200


10. KPIs & What to Watch Weekly
Track these every Monday morning. If any metric is off-target for two weeks in a row, it triggers a review of that specific channel — not a wholesale strategy change.

Metric	Week 4	Month 2	Month 3	How to track
Free scans / week	50+	200+	500+	Supabase dashboard
Email capture rate	10%	15%	20%+	Supabase + Resend
Paid conversions (Pro)	0-2	5-10	20+	Stripe dashboard
MRR	$0-$100	$200-$600	$800-$1,200	Stripe
Social followers (X)	100	500	1,500	Buffer analytics
Inbound agency leads	0	2-5	10+	Supabase CRM table
Share-your-score clicks	Baseline	100/wk	500/wk	Cloudflare Analytics

Early Warning Signals
•	Email capture rate below 5%: the free scan is not delivering enough value. Add one more instant insight before the gate.
•	Paid conversion below 1%: pricing page problem or wrong audience. Review copy and consider lowering entry price to $29/month.
•	Agency outreach reply rate below 2%: the cold email subject line or personalisation is not landing. Test 3 new subject lines.
•	Share-your-score click rate below 3%: the score badge is not compelling enough. Make the visual sharper or add a competitive benchmark.


11. Operating Cost Summary
The goal is $0 until first revenue, then reinvest strategically. Here's the exact cost progression.

Month 1 — $0 to $20/month
•	Cloudflare Workers: $0 (free tier — 100K requests/day)
•	Cloudflare Pages: $0 (unlimited bandwidth, commercial use allowed)
•	Supabase: $0 (500 MB, keep alive with cron ping)
•	Resend: $0 (100 emails/day — hits the limit fast; plan to upgrade)
•	Gemini 2.5 Flash-Lite: $0 (1,000 requests/day)
•	Buffer: $0 (3 channels, unlimited AI)
•	n8n: $0 (self-hosted on Oracle Cloud Always Free)
•	Stripe: $0 + 2.9% + $0.30 per charge
•	InVideo AI: $20/month (first paid expense — faceless video)
•	Domain: ~$12/year

Month 2–3 — First Forced Upgrades
•	Cloudflare Workers paid: $5/month — triggered by 10ms CPU limit on PDF generation
•	Resend Pro: $20/month — triggered when daily email volume exceeds 80/day
•	Supabase Pro: $25/month — upgrade when bandwidth or inactivity-pause becomes an issue
•	Total at full early-stage operation: ~$70/month

Break-even: 2 Pro subscribers ($78/month) covers all operating costs from Month 2. Everything beyond that is margin. The goal is to be cash-positive before any upgrade is needed.


12. Known Risks & Mitigation

Risk 1: Google Changes AI Mode Citation Mechanics
Mitigation: audit structural readiness (robots.txt, schema, content format) — not current AI rankings. Structural signals are durable. If citation mechanics change, the audit categories adapt, not the scoring architecture.

Risk 2: Incumbents Add GEO Features for Free
Mitigation: own the UCP agent-readiness niche and the white-label agency angle before incumbents notice it. These are the two hardest features to replicate quickly. Build moat in the first 90 days.

Risk 3: Gemini Free Tier Cuts Limits Again
Mitigation: architect the AI provider layer so it's swappable. One config change should allow switching to Cloudflare Workers AI (free models) or OpenAI. Never build hard dependencies on a single free API.

Risk 4: Revenue Stall on One-Time Report Model
Mitigation: the pricing model in this plan is subscription-first. One-time Deep Audit is a supplemental upsell, not the primary model. Do not let it drift to becoming the primary offer.


Final Rule
The marketing strategy is the product strategy. Every feature decision should ask: does this make users more likely to share their score, embed the widget, or refer an agency? If it doesn't do one of those three things, it's a nice-to-have. Build what compounds.

Teché Labs Inc. — Confidential — March 2026
