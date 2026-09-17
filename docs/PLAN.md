# AWS Change Intelligence — Build Plan

> **Tagline:** "Know the impact before you make the change."
> **Rating:** 8/10 hackathon idea. Real gap, AWS-native, visceral demo, feasible scope.

---

## Positioning

**Not:** "AWS is missing data."  
**Yes:** "AWS never assembles it at decision time. We do — before the decision is made."

**Differentiatior vs AWS Change Manager:** Change Manager tracks approvals after a request is filed. ACI predicts blast radius *before* the request exists.

**Differentiator vs log RCA tools (DevOps Guru, Datadog):** Those are reactive — post-incident cleanup. ACI is proactive — pre-change prevention. Declared vs observed dependency delta has no direct AWS-native equivalent.

---

## Component Map

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (React + TypeScript + Vite + Tailwind)    │
│                                                     │
│  [1] Change Composer     [2] Impact View            │
│      Resource picker         Blast radius card      │
│      Change type select      Dependency graph viz   │
│      Before/after fields     Blind spot highlight   │
│      [Analyze] button        Risk badge             │
│                              Verdict + reasoning    │
│                              [Generate Plan] button │
│                          [3] Change Plan Panel      │
│                              Ordered checklist      │
└──────────────┬──────────────────────────────────────┘
               │ HTTP (REST)
┌──────────────▼──────────────────────────────────────┐
│  BACKEND (FastAPI, Python)                          │
│                                                     │
│  POST /change/analyze                               │
│  GET  /graph/{resource_id}?hops=2                   │
│  GET  /resources                                    │
│  GET  /incidents                                    │
│  POST /verdict  (re-run LLM only)                   │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Graph Engine│  │ Risk Scorer  │  │ Bedrock   │  │
│  │ (NetworkX)  │  │(deterministic│  │ LLM Layer │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         └────────────────┴─────────────────┘        │
│                          │                          │
│  ┌───────────────────────▼──────────────────────┐   │
│  │  MockDataSource  (DataSource interface)       │   │
│  │  config · cloudtrail · xray · tags            │   │
│  │  appregistry · alarms · incidents             │   │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Data Sources & Graph Construction

Graph is built by merging edges from multiple AWS data sources, each shaped like real API responses.

| Source | Fixture file | Edge type | What it contributes |
|---|---|---|---|
| AWS Config | `config_resources.json` | Declared | `relationships` field — resource-to-resource declared deps |
| AppRegistry | `appregistry.json` | Declared | App→resource membership |
| X-Ray | `xray_service_graph.json` | Observed | Runtime service map — who actually called whom |
| CloudTrail | `cloudtrail_events.json` | Observed | Invoke/access events + historical change record |
| Tags | `tags.json` | Enrichment | owner→team edges, env/criticality node attrs |
| CloudWatch Alarms | `alarms.json` | Enrichment | Alarm→resource monitoring edges |
| Incidents | `incidents.json` | History | Past changes + outage records for historical match |

**Declared** = what AWS metadata says the relationship is.  
**Observed** = what telemetry proves is happening at runtime.  
**Blind spot** = edge exists in Observed but NOT in Declared. This is the core differentiator.

---

## Dependency Edge Types

```
depends_on      Source needs destination to function.
                Source: Config relationships OR X-Ray (high confidence)

invokes         Source actively calls destination at runtime.
                Source: X-Ray service graph + CloudTrail events
                NOTE: this is the blind-spot edge in the killer demo

reads_from      Source reads data from destination.
                Source: CloudTrail GetItem/Query events

owned_by        Resource belongs to a team or application.
                Source: Tags (owner=) + AppRegistry membership

monitored_by    An alarm watches this resource.
                Source: CloudWatch Alarms (alarm.dimensions match resource)

serves          Resource sits in front of a customer-facing surface.
                Source: Tags (customer-facing=true) + AppRegistry app type
```

### Edge Confidence

| Provenance | Confidence |
|---|---|
| Config + X-Ray both agree | 0.95 |
| X-Ray only (observed, not declared) | 0.75 |
| CloudTrail only | 0.65 |
| Config only (declared, no telemetry) | 0.60 |
| Tag-inferred | 0.50 |
| Inferred | 0.30 |

---

## Killer Demo Scenario — `payment-processor-lambda`

Designed to trigger every feature:

```
[customer]
    ↑ serves
[api-gateway-checkout]
    ↑ depends_on
[checkout-service-lambda]
    ↑ depends_on  (declared — Config + AppRegistry)
[payment-processor-lambda]  ← TARGET
    ↑ invokes     (observed only — X-Ray 847×/day — BLIND SPOT = red dashed edge)
[fraud-detection-service]
    ↑ reads_from
[payments-rds]

[payment-processor-lambda]
    ↓ owned_by       payments-team
    ↓ monitored_by   payment-error-alarm
    ↓ monitored_by   payment-latency-alarm
```

**Fixture properties:**
- AppRegistry: member of `checkout-app` (but NOT linked to `fraud-detection-service`)
- X-Ray: `fraud-detection-service` invokes it 847×/day (blind spot)
- Tags: `env=prod`, `criticality=medium` (intentionally wrong — trust gap story)
- Incident: INC-2043 in `incidents.json` — same resource_type + delete → 17-min outage
- Blast radius: 7 resources, 3 apps, 2 teams, 4 alarms, 1 customer-facing API gateway

**Score breakdown hitting CRITICAL 88:**

| Signal | Weight | Value | Contribution |
|---|---|---|---|
| Customer-facing surface reached | 30 | true | 30 |
| Change type severity (delete=1.0) | 20 | 1.0 | 20 |
| Blast radius size (log-scaled) | 15 | ~0.73 | 11 |
| Blind spot present | 15 | true | 15 |
| Historical incident match | 12 | true | 12 |
| Prod-critical node in radius | 8 | true | 0 (medium tag, but reached prod API GW) |

Total: **88 → CRITICAL**

---

## User Flow

### Screen 1 — Change Composer (left panel)

1. **Resource picker** — dropdown from `GET /resources`. Shows name + type + env tag.
2. **Change type** — Delete / Downsize / Config Change / Scale / IAM Change.
3. **Before/After fields** — conditional. Delete = none. Downsize = numeric. Config = key-value.
4. **Analyze button** — fires `POST /change/analyze`. Loading state: "Building impact graph…"

### Screen 2 — Impact View (right panel, 3 stacked cards)

**Card A — What is changing**
- Resource name, type, ARN
- Change diff: `memory: 1024 MB → 512 MB` or `[DELETE]` in red
- Owner team, environment

**Card B — What it affects**
- Blast radius row: `7 resources · 3 apps · 2 teams · 4 alarms · ⚠ 1 customer-facing API`
- Force-directed dependency graph:
  - Target node centered, pulsing
  - Nodes colored: green (low) / amber (medium) / red (prod-critical) / blue (app/team)
  - Blind spot edges: dashed red — hover shows "Seen in X-Ray (847 invocations) — NOT in AppRegistry"
  - Normal edges: solid gray — hover shows provenance + confidence %
  - Pan/zoom, node click for detail tooltip

**Card C — Should I do it?**
- Large risk badge: `CRITICAL 88`
- Expandable signal breakdown
- LLM verdict (1-2 sentences, bold first line)
- Reasoning bullets (3-4 points from Bedrock)
- Recommendation box: "Run 10% canary. Validate 4 dependencies first."
- Generate Change Plan button (shown when risk ≥ HIGH)

### Screen 3 — Change Plan Panel (expands below Card C)

- Ordered checklist, scenario-specific (not generic)
- Example: "Validate dependency: checkout-service → payment-processor-lambda (seen 847×/day in X-Ray)"
- Checkboxes (cosmetic, no persistence needed for demo)

---

## Backend Modules

| File | Responsibility |
|---|---|
| `datasource.py` | `DataSource` interface + `MockDataSource` impl |
| `graph_engine.py` | Builds NetworkX graph, merges declared+observed, `blast_radius(target, hops)` |
| `blind_spot.py` | Observed − declared edge diff → flagged blind spots |
| `risk_scorer.py` | Deterministic weighted sum → score 0-100 + signal breakdown |
| `incident_matcher.py` | Match change against incidents by resource_type + change_type |
| `bedrock_client.py` | Prompt + JSON output contract + deterministic fallback |
| `main.py` | FastAPI app, routes, pipeline assembly |

---

## API Surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/change/analyze` | ChangeRequest → full AnalysisResult |
| GET | `/graph/{resource_id}?hops=2` | Subgraph for viz |
| GET | `/resources` | List all resources (for picker) |
| GET | `/incidents` | Historical incident list |
| POST | `/verdict` | Re-run LLM layer only (tuning) |

---

## Risk Scoring

Weighted signal sum normalized to 0-100.

| Signal | Weight |
|---|---|
| Customer-facing surface reached | 30 |
| Change type severity (delete=1.0, downsize=0.6, config=0.3) | 20 |
| Blast radius size (log-scaled node count) | 15 |
| Blind spot present | 15 |
| Historical incident match | 12 |
| Prod-critical node in radius | 8 |

Levels: `0-24 low · 25-49 medium · 50-74 high · 75-100 critical`

Deterministic score is authoritative. Bedrock only narrates it — never recomputes.

---

## LLM Layer (Bedrock / Claude)

**Input:** compact JSON — change request, blast radius counts, top affected nodes + paths, blind spots, historical matches, risk score + signal breakdown.

**Output contract:**
```json
{
  "verdict": "High risk. Don't deploy directly.",
  "reasoning": ["...", "..."],
  "recommendation": "Run a 10% canary first; validate 4 dependencies.",
  "change_plan": ["Validate dep A", "Add missing tag on B", "Canary 10%"]
}
```

**Fallback:** if Bedrock unavailable, template verdict from signals. Demo never hard-fails.

---

## Tech Stack

- **Backend:** Python, FastAPI, NetworkX, boto3 (future real path), bedrock-runtime
- **Frontend:** React, TypeScript, Vite, Tailwind, react-force-graph
- **Data:** JSON fixtures in memory. SQLite optional for incidents.
- **No DB required for demo.**

---

## Build Phases

| Phase | What | Exit condition |
|---|---|---|
| P0 | Author all 7 fixture JSON files | Killer demo scenario correct on paper, score math verified |
| P1 | `datasource.py` + `graph_engine.py` + `/graph` + `/resources` | Graph builds, blast radius returns correct nodes |
| P2 | `blind_spot` + `risk_scorer` + `incident_matcher` + `/change/analyze` | Full AnalysisResult with rule-templated verdict, no LLM |
| P3 | `bedrock_client` + prompt + fallback | LLM verdict replaces template |
| P4 | React frontend — composer + 3 cards + force-graph viz | Killer demo flowable end-to-end |
| P5 | Polish — animations, stagger, blind-spot flash, score highlight | Demo-ready |

**P0-P2 = shippable product.** P3 = wow. P4 = demoable. P5 = wins.

If time is short: cut Cost Explorer fixture, cut Change Plan Generator, keep graph viz. The force-directed graph with red dashed blind-spot edge IS the idea made visible — do not cut it.

---

## Demo Script (90 seconds)

1. Open Change Composer. Select `payment-processor-lambda`. Change type: **Delete**.
2. Click Analyze. Graph animates blast radius.
3. Impact card: "7 resources, 3 apps, 2 teams, 4 alarms, **1 customer-facing API**."
4. Blind-spot edge flashes red: "Seen in X-Ray (847 invocations) — NOT in AppRegistry."
5. Risk badge: **CRITICAL 88**.
6. Verdict: "Don't do this."
7. Reasoning: "Last similar deletion caused a 17-minute outage (INC-2043)."
8. Click Generate Change Plan → scenario-specific ordered checklist.
9. Punchline: *"AWS had all this data. We made it a decision, before the decision was made."*

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bedrock latency in live demo | Deterministic fallback; pre-warm; offline stub mode |
| Graph viz eats build time | Stub with static Cytoscape JSON at P1, upgrade to animated at P4 |
| Fixtures feel fake | Shape exactly like real AWS API JSON; show real-API mapping table to judges |
| "Why not just use Change Manager?" | Change Manager tracks approvals. ACI predicts blast radius before the request is filed. |
| Risk score reads arbitrary | Show signal breakdown; math documented above |
| Score doesn't hit CRITICAL | Verify score arithmetic against fixture values before any code |
