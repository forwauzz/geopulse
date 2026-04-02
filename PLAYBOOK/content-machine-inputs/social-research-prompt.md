Use this prompt in another LLM after you decide the exact query set and platforms.

```text
You are helping me research market conversations for GEO-Pulse, a product that audits AI search readiness for websites.

I do not want generic marketing ideas. I want real conversation-derived pain points, wording, and topic opportunities.

Product framing:
- GEO-Pulse helps teams see whether AI search engines can actually understand their site.
- It audits readiness, not rankings.
- It surfaces issues around crawl access, structured data, extractability, authority/trust signals, and related readiness gaps.
- The primary CTA for content is a free scan.

Target audiences to keep in mind:
- agency owners
- SEO consultants
- growth marketers
- founders
- in-house content teams
- ecommerce operators

Platforms to research:
- X
- Reddit
- optionally LinkedIn if the signal is strong

Your task:
1. Find recurring conversations about the problems GEO-Pulse solves.
2. Extract the exact language people use when describing those problems.
3. Normalize each finding into a clear pain point.
4. Infer which audience the finding most likely belongs to.
5. Suggest content opportunities that GEO-Pulse could credibly write about.
6. Avoid inventing facts or summarizing weak evidence as strong consensus.

For every finding, return:
- platform
- search query used
- source URL
- author or handle if relevant
- exact snippet
- normalized pain point
- inferred persona
- confidence
- notes

Then produce:
- top repeated pain points
- repeated wording patterns
- 10 content opportunities
- which opportunities best fit a newsletter-first rollout
- which opportunities best support a free-scan CTA

Important rules:
- Do not fabricate sources.
- Keep exact snippets separate from your interpretation.
- Do not turn jokes or obvious sarcasm into strategic truth.
- Prefer repeated patterns over isolated comments.
- Highlight uncertainty when evidence is thin.

Output in markdown using this structure:

# Social Research Packet

## Research session
- date:
- tools used:
- objective:

## Search themes covered

## Raw findings

## Repeated pain points

## Repeated language patterns

## Topic opportunities

## Editorial cautions

## Recommended next actions
```
