# AWS Change Intelligence — End-to-End Design

> **Tagline:** *"Know the impact before you make the change."*

---

## 1. Vision

AWS already holds the data needed to understand what a change will affect — Config relationships, CloudTrail history, X-Ray traces, tags, AppRegistry, cost signals. But that data is scattered across a dozen consoles and never assembled at the one moment it matters: **the instant an engineer is about to make a change.**

AWS Change Intelligence (ACI) assembles it. It answers three questions before a change ships:

1. **What is changing?** — e.g. Lambda memory `1024 → 512 MB`.
2. **What could this affect?** — 7 resources, 3 apps, 2 teams, 4 alarms, 1 customer-facing API.
3. **Should I do it?** — Risk verdict + concrete recommended action (canary, validate deps, block).

**Positioning:** We are *not* claiming AWS lacks dependency data. AWS has the data. **We make it actionable before humans make risky decisions.** That is the gap.

### Killer demo

> **"What happens if I delete this resource?"**
>
> 🚨 **Don't do this.**
> - Not tagged production-critical, but telemetry + app relationships show it serves **Application X**.
> - **3 downstream services** depend on it.
> - **1 dependency** is missing from AppRegistry (blind spot).
> - Last similar deletion caused a **17-minute outage**.
> - **Recommended:** create a change plan, validate these 4 dependencies first.

---

## 2. Problem

| Pain | Today | With ACI |
|------|-------|----------|
| Impact unknown before change | Engineer guesses or greps Confluence | Full impact graph in seconds |
| Hidden dependencies | Discovered during the outage | Surfaced pre-change, incl. untagged blind spots |
| No risk signal | Tribal knowledge | Scored verdict + reason |
| No memory of past incidents | Postmortem lost in Slack | "Last similar change caused X" |
| Recommendation | None | Concrete next action (canary / validate / block) |

---

## 3. Core Features

### F1 — Change Intake
Describe the intended change. Sources:
- Manual form (demo default): resource + attribute + old→new value, or "delete".
- Parsed from IaC diff (Terraform plan JSON / CloudFormation changeset) — stretch.
- Parsed from a CloudTrail "about to happen" hook — future.

### F2 — Dependency Graph Engine
Build a directed graph of the blast radius around the target resource.
- **Nodes:** AWS resources, applications, teams, alarms, APIs, customers.
- **Edges:** typed relationships (`depends_on`, `invokes`, `reads_from`, `owned_by`, `monitored_by`, `serves`).
- **Edge provenance:** each edge tagged with source (Config / CloudTrail / X-Ray / tag / AppRegistry / inferred). Provenance drives confidence.

### F3 — Blast Radius Analysis
Traverse graph N hops from target. Classify each reached node: directly affected vs transitively affected. Count resources, apps, teams, alarms, customer-facing surfaces.

### F4 — Hidden Dependency Detection
Compare **declared** dependencies (AppRegistry, tags) vs **observed** dependencies (X-Ray traces, CloudTrail invoke history). Flag edges that exist in telemetry but NOT in declared metadata → **blind spots**. This is the differentiator: catching what the tags miss.

### F5 — Risk Scoring
Deterministic signals feed a score (see §7). Signals: blast radius size, customer-facing reach, presence of blind spots, historical incident match, criticality tags, change type (delete » downsize » config tweak).

### F6 — LLM Verdict & Recommendation (Bedrock)
Graph + signals + history → Bedrock (Claude) → natural-language verdict, reasoning, and a **specific recommended action**. LLM explains; it does not invent the graph.

### F7 — Historical Incident Match
"Last similar change caused a 17-minute outage." Match current change against a change/incident history store by (resource type + change type + affected-app pattern).

### F8 — Change Plan Generator
When risk is high, emit an ordered checklist: validate deps, add missing tags, canary %, rollback steps, teams to notify.

---

## 4. Architecture

```
┌──────────────┐     ┌─────────────────────────────────────────┐
│  Web UI      │────▶│  API (FastAPI)                            │
│ (React)      │     │  /change/analyze  /graph/:id  /verdict    │
└──────────────┘     └───────────────┬───────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────┐         ┌──────────────────┐        ┌──────────────────┐
│ Graph Engine  │         │ Risk Scorer       │        │ Bedrock Verdict  │
│ (NetworkX)    │         │ (deterministic)   │        │ (Claude)         │
└──────┬────────┘         └────────┬──────────┘        └────────┬─────────┘
       │                          │                            │
       ▼                          ▼                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Data Layer                                                            │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Resource graph │  │ Telemetry store   │  │ Incident history      │  │
│  │ (seeded mock)  │  │ (X-Ray/CloudTrail │  │ (past changes+outages)│  │
│  │                │  │  shaped, seeded)  │  │                       │  │
│  └────────────────┘  └──────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Data strategy: Seeded mock account

Demo runs on a **pre-populated fake AWS account** — a fixture that mimics real AWS API response shapes. No live-account risk, deterministic demo, fast.

- Fixtures shaped like **real** API responses so a later swap to live AWS is a data-source change, not a rewrite.
- One `DataSource` interface with two impls: `MockDataSource` (demo) and `AwsDataSource` (future, real SDK calls). Graph engine consumes the interface, unaware which is live.

This keeps the "AWS has the data" narrative honest: our fixtures are modeled on the exact services below.

---

## 5. AWS Services Leveraged

Each maps to a fixture in the mock account; each has a real-API equivalent for the production path.

| Service | What ACI extracts | Mock fixture | Real API (future) |
|---------|-------------------|--------------|-------------------|
| **AWS Config** | Resource inventory + `relationships` (declared deps) | `config_resources.json` | `config.list_discovered_resources`, `get_resource_config_history` |
| **CloudTrail** | Who changed what, invoke/access history (observed deps) | `cloudtrail_events.json` | `cloudtrail.lookup_events` |
| **X-Ray** | Service-map traces (observed runtime deps) | `xray_service_graph.json` | `xray.get_service_graph` |
| **Resource Groups Tagging** | Criticality / owner / env tags | `tags.json` | `resourcegroupstaggingapi.get_resources` |
| **AppRegistry** | App ↔ resource membership (declared) | `appregistry.json` | `servicecatalog-appregistry.list_associated_resources` |
| **CloudWatch Alarms** | Alarms watching affected resources | `alarms.json` | `cloudwatch.describe_alarms` |
| **Cost Explorer** | Cost signal per resource (blast weighting) | `costs.json` | `ce.get_cost_and_usage` |
| **Amazon Bedrock** | LLM verdict + recommendation (Claude) | live call (or stub) | `bedrock-runtime.invoke_model` |

**Core (demo-critical):** Config, CloudTrail, X-Ray, Tagging, AppRegistry, Bedrock.
**Enrichment (optional):** CloudWatch Alarms, Cost Explorer.

---

## 6. Data Model

### Graph

```
Node {
  id: str                 # arn or synthetic id
  type: enum(resource, application, team, alarm, api, customer)
  name: str
  attrs: dict             # region, resource_type, memory, env, ...
  criticality: enum(unknown, low, medium, high, prod_critical)
  sources: [str]          # which services declared this node
}

Edge {
  src: node_id
  dst: node_id
  relation: enum(depends_on, invokes, reads_from, owned_by,
                 monitored_by, serves, member_of)
  provenance: enum(config, cloudtrail, xray, tag, appregistry, inferred)
  confidence: float       # derived from provenance + observation count
  observed_count: int     # e.g. invocations seen in CloudTrail/X-Ray
}
```

### Change request

```
ChangeRequest {
  target: node_id
  change_type: enum(delete, downsize, config_change, scale, iam_change)
  before: dict            # {"memory": 1024}
  after: dict             # {"memory": 512}   (null for delete)
}
```

### Analysis result

```
AnalysisResult {
  change: ChangeRequest
  blast_radius: {
    resources: int, applications: int, teams: int,
    alarms: int, apis: int, customer_facing: bool
  }
  affected_nodes: [ {node, hop_distance, path[]} ]
  blind_spots: [ {edge, why_hidden} ]        # observed-not-declared
  historical_matches: [ {incident_id, similarity, outage_minutes} ]
  risk: { score: 0-100, level: enum(low, medium, high, critical),
          signals: {name: contribution} }
  verdict: str            # LLM natural language
  recommendation: str     # LLM specific action
  change_plan: [str]      # ordered steps, when high risk
}
```

### Incident history

```
Incident {
  id, resource_type, change_type, affected_apps[],
  outage_minutes, date, root_cause
}
```

---

## 7. Risk Scoring (deterministic, then LLM explains)

Weighted signal sum, normalized to 0–100. Weights tunable; illustrative:

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Customer-facing surface reached | 30 | Direct user impact |
| Change type severity (delete=1.0, downsize=0.6, config=0.3) | 20 | Irreversibility |
| Blast radius size (log-scaled node count) | 15 | Breadth |
| Blind spot present (observed dep not declared) | 15 | Unknown unknowns |
| Historical incident match | 12 | Precedent of pain |
| Prod-critical node in radius | 8 | Declared importance |

Levels: `0–24 low · 25–49 medium · 50–74 high · 75–100 critical`.

The deterministic score is authoritative and reproducible. **Bedrock consumes the score + signals + graph summary and writes the human verdict** — never recomputes the number. This keeps the demo reliable (score won't drift) while the language stays compelling.

---

## 8. LLM Layer (Bedrock)

**Input to Claude:** compact JSON — change request, blast radius counts, top affected nodes with paths, blind spots, historical matches, risk score + signal breakdown.

**Output contract (JSON):**
```json
{
  "verdict": "High risk. Don't deploy directly.",
  "reasoning": ["...", "..."],
  "recommendation": "Run a 10% canary first; validate 4 dependencies.",
  "change_plan": ["Validate dep A", "Add missing tag on B", "Canary 10%", "..."]
}
```

- System prompt pins: *reason only over provided graph/signals; do not invent dependencies; be specific and actionable.*
- Deterministic fallback: if Bedrock unavailable, template the verdict from signals so demo never hard-fails.
- Model: Claude on Bedrock (`bedrock-runtime.invoke_model`), or a stub returning fixture verdict for offline demo.

---

## 9. API Surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/change/analyze` | Body = ChangeRequest → full AnalysisResult |
| GET | `/graph/{resource_id}?hops=2` | Subgraph for viz |
| GET | `/resources` | List seeded resources (for picker) |
| GET | `/incidents?resource_type=&change_type=` | Historical matches |
| POST | `/verdict` | Re-run only LLM layer on an existing analysis (tuning) |

---

## 10. Frontend

Single-page React app. Flow mirrors the three questions.

- **Change Composer** — pick resource (dropdown from `/resources`), pick change type, set before/after. "Analyze" button.
- **Impact View** — three stacked cards:
  1. *What is changing* — the diff, plainly.
  2. *What it affects* — blast-radius counts + interactive dependency graph (nodes colored by criticality; blind-spot edges dashed red).
  3. *Should I do it* — big risk badge, verdict, reasoning bullets, recommendation, "Generate Change Plan" button.
- **Graph viz:** force-directed (react-force-graph or Cytoscape). Target node centered. Hover shows edge provenance + confidence.
- Dark theme, blast-radius red/amber/green risk coloring.

---

## 11. Tech Stack

- **Backend:** Python, FastAPI, `networkx` for graph, `boto3` (real path) behind `DataSource` interface, `bedrock-runtime` for LLM.
- **Frontend:** React + TypeScript + Vite + Tailwind + react-force-graph.
- **Data:** JSON fixtures for the seeded mock account; optional SQLite for incident history.
- **No DB required for demo** — fixtures loaded in memory. SQLite optional for incidents.

---

## 12. Build Phases

### Phase 0 — Fixtures (foundation)
Author the seeded mock account: `config_resources.json`, `cloudtrail_events.json`, `xray_service_graph.json`, `tags.json`, `appregistry.json`, `alarms.json`, `costs.json`, `incidents.json`. Design one scenario that hits every feature (the killer-demo resource with a hidden dep + a matching past outage).

### Phase 1 — Graph Engine
`DataSource` interface + `MockDataSource`. Build graph from fixtures. Merge declared + observed edges with provenance/confidence. `build_graph()`, `blast_radius(target, hops)`.

### Phase 2 — Analysis + Risk
Blind-spot detection (observed − declared). Historical match. Deterministic risk scorer. `/change/analyze` returns AnalysisResult sans LLM.

### Phase 3 — Bedrock Layer
Prompt + JSON contract + fallback template. Wire into analyze.

### Phase 4 — Frontend
Change composer, impact cards, graph viz. Wire to API.

### Phase 5 — Demo polish
Script the killer-delete scenario end to end. Tune weights so verdict reads clean. Rehearse.

**Feasibility order for hackathon:** P0→P1→P2 gets a working risk verdict with NO LLM (rule-templated). P3 adds the wow. P4 makes it demoable. If time runs short, P3 fallback still tells the whole story.

---

## 13. Demo Script (the 90 seconds that win)

1. Open Change Composer. Select `payment-processor-lambda`. Change type: **Delete**.
2. Click Analyze. Graph animates blast radius.
3. Impact card: "7 resources, 3 apps, 2 teams, 4 alarms, **1 customer-facing API**."
4. Blind-spot edge flashes red: "This dep is in X-Ray traces but NOT in AppRegistry."
5. Risk badge: **CRITICAL 88**. Verdict: 🚨 Don't do this.
6. Reasoning bullets incl. "Last similar deletion caused a 17-minute outage (INC-2043)."
7. Click Generate Change Plan → ordered checklist.
8. Punchline: *"AWS had all this data. We made it a decision, before the decision was made."*

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Bedrock latency/availability in live demo | Deterministic fallback verdict; pre-warm; offline stub mode |
| Graph viz complexity eats build time | Start with counts + list; add force-graph last |
| Fixtures feel fake to judges | Shape them exactly like real API JSON; show the real-API mapping table (§5) |
| Scope creep (real AWS integration) | Interface is ready but NOT on critical path; explicitly a "future" swap |
| Risk score reads arbitrary | Show signal breakdown; weights documented |

---

## 15. Why This Wins

- **Real gap, honest framing:** not "AWS is missing data" — "AWS never assembles it at decision time."
- **Concrete killer demo:** the delete-with-hidden-dependency + past-outage recall is visceral.
- **Feasible:** seeded mock account removes live-account friction; deterministic score keeps demo stable; LLM adds narrative on top.
- **Extensible story:** the `DataSource` interface makes "and here's the real-AWS version" a credible one-line pitch, not vaporware.
