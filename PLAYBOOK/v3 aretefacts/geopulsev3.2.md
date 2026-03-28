GeoPulse V3.2 — Production PRD, Data Architecture & API Specification
1. Product Definition
GeoPulse is a measurement and optimization infrastructure for AI visibility.
It tracks, models, and improves how often AI systems select, cite, and represent a brand across real-world queries.
2. Core Problem
LLMs are black boxes. There is no system that measures how they choose sources across queries, competitors, and time.
GeoPulse solves this by building a query → response → citation graph.
3. Core Product Principles
•	Measure outcomes, not inputs
•	Empirical data over heuristics
•	Multi-model by design
•	Time-series first
•	API-first architecture
4. System Architecture Overview
GeoPulse consists of two primary pipelines:
•	Site Intelligence Pipeline
•	Query Measurement Pipeline
5. Site Intelligence Pipeline
•	Domain ingestion
•	Crawling and rendering
•	Feature extraction
•	Page and template classification
6. Query Measurement Pipeline
•	Query selection (intent-based)
•	Multi-model execution
•	Response parsing
•	Citation extraction
•	Metric computation
7. Core Data Model
Primary object: QueryRun
•	query_id
•	model_id
•	response
•	citations
•	timestamp
8. Key Metrics
•	Citation Rate
•	Share of Voice
•	Query Coverage
•	Inference Probability
•	Drift Score
9. API Specification
9.1 Audit API
•	POST /v1/audits/domains
•	GET /v1/audits/{id}
9.2 Query API
•	POST /v1/query-runs
•	GET /v1/query-runs/{id}
9.3 Pre-Publish API
•	POST /v1/prepublish/score-page
•	POST /v1/prepublish/compare
9.4 Benchmark API
•	GET /v1/benchmarks
•	GET /v1/domains/{id}/ranking
10. Model Strategy
Use two lanes:
•	Target models (to measure)
•	Auditor models (to analyze outputs)
11. Moat Summary
•	Citation graph
•	Query libraries
•	Feature corpus
•	Time-series drift data
•	Workflow integrations
12. Final Statement
GeoPulse becomes the system of record for AI visibility by owning the measurement of real-world AI selection behavior.
