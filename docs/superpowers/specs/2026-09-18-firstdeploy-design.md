# FirstDeploy — Design Spec

> *"Your first cloud deploy should not become your first surprise bill."*
>
> **Decision:** Full pivot from AWS Change Intelligence (ACI) to FirstDeploy.
> ACI codebase is the foundation; graph engine / blast radius / incident matcher are retired.
> `bedrock_client.py` and the deterministic-first safety pattern are kept and adapted.

---

## 1. Problem & Audience

A student or early-career developer follows a cloud tutorial, copies a CloudFormation template,
and deploys it without understanding every setting. One line can:

- Make a data store publicly accessible
- Start a resource that bills every hour with no traffic
- Drop a database when the stack is deleted

AWS has individual tools that catch pieces of this (CloudFormation Guard, Cost Explorer, Trusted
Advisor), but a first-time builder does not know which tools to run or how to interpret their output.

**The person on the other side:** someone making their first AWS project with limited money and no
cloud operations experience. The fear of an unexpected bill or a security mistake stops many people
from deploying at all.

---

## 2. The One Feature

Upload or paste a CloudFormation template (YAML or JSON). Pick a region. FirstDeploy returns a
pre-deploy report answering three questions:

1. **What will this create?** — a short inventory of AWS resources
2. **What should I notice?** — deterministic cost, exposure, and deletion-safety findings
3. **What should I change?** — one plain-language fix per finding, with the exact property

**Hero demo template** contains three intentional mistakes:

| Mistake | Rule | Severity |
|---------|------|----------|
| S3 bucket with `BlockPublicAcls: false` | `s3-public-access-blocked` | RED |
| NAT Gateway in every AZ (unexpected recurring bill) | `nat-gateway-cost-warning` | AMBER |
| RDS instance without `DeletionProtection: true` | `rds-deletion-protection` | AMBER |

Every finding cites the rule ID, the template line number, and the evidence that triggered it.
Red = a concrete rule failed. Amber = a cost or operational tradeoff needs attention.
Green = the checks that ran all passed (scope is stated explicitly — not "safe", just "passed").

After the user applies the three suggested edits, a second scan clears all findings.
The deploy button only becomes active after a clean scan.

---

## 3. Trust Boundary

```
parse template → deterministic tools inspect it → human reviews findings → Bedrock explains them
```

- A YAML/JSON parser identifies resources and source line numbers.
- CloudFormation Guard rules and explicit local rules produce findings.
- The AWS Price List API supplies unit prices; arithmetic computes the estimate.
- Bedrock (Claude) may simplify and prioritize findings, but **cannot create or dismiss one**.
- If Bedrock is unavailable, the complete rule-based report still renders — demo never hard-fails.

FirstDeploy never claims a passing report proves a template is secure.
It states exactly which checks ran and which did not.

---

## 4. Architecture

```
React (Amplify Hosting)
        │  template YAML/JSON + region
        ▼
API Gateway → Lambda (Python)
        │
        ├─ parse_template()       cfn-flip / PyYAML parser, returns resource inventory + line map
        ├─ run_guard_rules()      cfn-guard CLI subprocess, returns Rule ID + severity + line
        ├─ estimate_cost()        AWS Price List API + deterministic arithmetic
        └─ explain_findings()     Strands agent → Amazon Bedrock (Claude)
                │
                └─ receives only structured, cited findings — cannot invent new ones

DynamoDB   — anonymous scan summaries (rule_id, severity, timestamp, region)
S3         — curated demo templates; generated PDF/JSON reports
```

**Strands agent tools** (the only things Bedrock can call):

| Tool | Deterministic output |
|------|---------------------|
| `inspect_resources` | resource types, logical IDs, properties, source line numbers |
| `run_guard_rules` | rule ID, severity (red/amber), failed property, remediation reference |
| `estimate_monthly_cost` | region, assumptions, unit price, arithmetic, monthly total |
| `explain_finding` | plain-language narration constrained strictly to tool outputs above |

---

## 5. AWS Services

| Service | Role |
|---------|------|
| **Amazon Bedrock** | Claude explains grounded findings for a first-time builder |
| **Strands Agents SDK** | orchestrates the four tools (inspect → guard → cost → explain) |
| **Lambda + API Gateway** | serverless analysis API (`POST /scan`) |
| **CloudFormation Guard** | open-source policy-as-code checks (the rule engine) |
| **AWS Price List API** | evidence for cost warnings (unit prices, not estimates pulled from thin air) |
| **Amplify Hosting** | public React app (Ship It track requires a public URL) |
| **DynamoDB** | scan summary history (anonymous) |
| **S3** | demo template library + generated reports |

The product also demonstrates its own promise: FirstDeploy's own deployment template is scanned by
FirstDeploy and the passing report is shown in the demo ("eating our own dogfood").

---

## 6. Data Model

### Scan request
```
ScanRequest {
  template: str          # raw YAML or JSON
  region: str            # e.g. "us-east-1"
  template_name: str     # display label
}
```

### Scan result
```
ScanResult {
  template_name: str
  region: str
  resources: [ResourceSummary]       # inventory
  findings: [Finding]                # rule results
  cost_estimate: CostEstimate
  overall_status: "pass" | "warn" | "fail"
  explanation: str                   # Bedrock narration (or fallback)
  checks_run: [str]                  # explicit scope statement
}

ResourceSummary {
  logical_id: str
  resource_type: str
  line: int
}

Finding {
  rule_id: str
  severity: "red" | "amber"
  resource_logical_id: str
  resource_type: str
  failed_property: str
  line: int
  message: str           # human-readable
  fix: str               # exact YAML property + value to add/change
}

CostEstimate {
  region: str
  assumptions: [str]
  line_items: [{resource: str, unit_price: str, quantity: str, monthly_usd: float}]
  total_monthly_usd: float
}
```

---

## 7. API Surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/scan` | `ScanRequest` → `ScanResult` |
| GET | `/templates` | list of curated demo templates (name + description) |
| GET | `/templates/{name}` | fetch a curated demo template |
| GET | `/rules` | list of implemented rules (id, severity, description) |

`/scan` is the only critical path. The others support the UI demo flow.

---

## 8. Frontend

Single-page React app. Three panels in sequence:

### Panel 1 — Template Input
- Paste textarea (YAML/JSON) OR upload file button
- "Load Demo Template" button (fetches the hero flawed template from `/templates/hero-flawed`)
- Region picker (us-east-1 default, clearly labeled "cost estimates apply to this region")
- "Scan Template" button — fires `POST /scan`
- Loading state: "Scanning… running Guard rules…"

### Panel 2 — Findings Report (replaces Panel 1 on result)
- **Resource inventory** — compact list: `OrderType::Resource (LogicalId)` with line numbers
- **Findings** — one card per finding:
  - RED badge for security/exposure, AMBER for cost/operational
  - Rule ID, affected resource, the failing property with template line
  - One-line fix: `Add DeletionProtection: true under Properties`
  - "Copy fix" button
- **Cost estimate** — breakdown table with assumptions stated, arithmetic shown
- **Overall status banner** — FAIL / WARN / PASS (green only when zero red findings)

### Panel 3 — Bedrock Explanation
- Collapsible "What should I do?" section
- Bedrock narration paragraph (constrained to findings above)
- If Bedrock unavailable: rule-templated fallback text renders instead (user sees no difference in basic flow)

### Rescan flow
- After applying fixes (in the textarea), user clicks "Rescan"
- New findings appear; cleared rules show green checkmarks
- "Deploy-ready" indicator appears only when overall_status = "pass"

### Self-scan easter egg
- Footer link: "See FirstDeploy's own scan report →" opens the pre-generated report of the project's own CFN template

---

## 9. Backend Module Map

| File | Replaces | Responsibility |
|------|----------|---------------|
| `app/scanner.py` | `graph_engine.py` | parse template, return ResourceSummary list + line map |
| `app/guard_runner.py` | `blind_spot.py` | invoke cfn-guard CLI, parse output into Finding list |
| `app/cost_estimator.py` | `risk_scorer.py` | call Price List API, compute monthly estimate |
| `app/bedrock_client.py` | kept, adapted | Strands agent + 4 tools + fallback |
| `app/models.py` | replaced | ScanRequest, ScanResult, Finding, CostEstimate |
| `app/main.py` | adapted | FastAPI app, `/scan` + `/templates` + `/rules` |
| `app/rules/` | new dir | Guard `.guard` rule files (one per finding type) |

**Retired:** `datasource.py`, `graph_engine.py`, `blind_spot.py`, `risk_scorer.py`, `incident_matcher.py`

**Fixtures retired:** all 8 JSON fixture files under `backend/fixtures/`

**Demo templates added:** `backend/templates/hero-flawed.yaml`, `backend/templates/hero-fixed.yaml`, `backend/templates/firstdeploy-own.yaml`

---

## 10. Four-Day Build Plan

### Day 1 — One Warning, Publicly Deployed
- Deploy public shell on Amplify + Lambda (Ship It insurance: public URL from Day 1)
- `scanner.py`: parse one CloudFormation template, return resource inventory
- `guard_runner.py`: detect public S3 access, return Finding with line number
- `POST /scan` returns one real finding on the hero template

### Day 2 — Deterministic Core Complete
- Add NAT Gateway cost warning rule
- Add RDS deletion-protection rule
- `cost_estimator.py`: Price List API for NAT Gateway hourly rate, deterministic arithmetic
- Full `ScanResult` without Bedrock — rule-templated explanation as fallback

### Day 3 — Agent + Full UI
- Wire Strands agent with four bounded tools into `bedrock_client.py`
- Build complete React UI: input panel, findings cards, cost table, rescan flow
- Hero demo flowable end-to-end: paste flawed template → 3 findings → fix → rescan → clean

### Day 4 — Prove + Present
- Focused tests for 3 hero rules + clean template (zero findings)
- Scan FirstDeploy's own `firstdeploy-own.yaml` → embed passing report in UI footer
- Record 3-minute demo video
- Publish architecture blog on AWS Builder Center (Top 5 blogs = Logitech keyboard)

---

## 11. Three-Minute Demo Script

| Time | Action |
|------|--------|
| 0:00–0:25 | "My first AWS tutorial worked. Then I learned one copied line could expose data or create a bill every month." |
| 0:25–0:50 | Click "Load Demo Template". Select region us-east-1. Click "Scan Template". |
| 0:50–1:30 | Tool trace runs. Three evidence-backed findings appear beside relevant lines. |
| 1:30–2:05 | Open NAT Gateway finding. Show price source, assumptions, arithmetic, simpler alternative. |
| 2:05–2:30 | Apply suggested edits in textarea. Click "Rescan". All three findings clear. Green banner. |
| 2:30–2:50 | Click footer link. "FirstDeploy scanned its own AWS deployment template — and passed." |
| 2:50–3:00 | "I did not need to become a cloud expert before my first deploy. I needed the right warning before it." |

---

## 12. Rubric Fit

| Criterion | Case |
|-----------|------|
| **Idea & Impact** | Prevents concrete financial and security harm for first-time deployers — a large, underserved audience |
| **Built on AWS** | AWS is the subject (CFN), the runtime (Lambda), the rule engine (Guard), the pricing source (Price List API), and the AI layer (Bedrock) |
| **Learning** | First multi-tool Strands agent; first serverless deploy; demonstrated by scanning the project's own stack |
| **Execution** | Three known rules, one input format, one region, deterministic outputs — four-day scope is honest |
| **Demo Video** | Flawed template → three visible findings → clean rescan within three minutes |

---

## 13. Scope Guardrails

- CloudFormation only. Terraform is a post-hackathon extension.
- Three excellent rules beat a broad scanner with vague findings.
- One AWS region for cost estimates, clearly labeled.
- No arbitrary security claims. No invented monthly totals.
- No automatic deployment. The user fixes and reviews the template.
- No AWS account access or credentials required from the user.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Judges see it as a thin linter wrapper | Show the complete beginner workflow: agent combines policy evidence, live pricing, source-level context, and plain-language remediation — then proves the change with before/after rescan |
| cfn-guard CLI not available in Lambda | Bundle cfn-guard binary in Lambda layer; fallback to pure-Python rule checks for the three hero rules |
| Price List API latency | Cache pricing data at cold start; fallback to hardcoded unit prices with source citation |
| Bedrock unavailable in demo | Deterministic fallback renders rule-templated explanation — demo never hard-fails |
| Template parsing edge cases | Scope to hero template for demo; parser errors show "unsupported template format" gracefully |

---

## 15. What ACI Code Is Kept vs Retired

| Module | Decision | Reason |
|--------|----------|--------|
| `bedrock_client.py` | **Keep, adapt** | Agent + fallback pattern reuses cleanly; swap graph-prompt for findings-prompt |
| `models.py` | **Replace** | New domain: ScanRequest/ScanResult instead of ChangeRequest/AnalysisResult |
| `main.py` | **Adapt** | Keep FastAPI + CORS boilerplate; replace routes |
| `graph_engine.py` | **Retire** | NetworkX blast radius is replaced by CloudFormation Guard rule engine |
| `blind_spot.py` | **Retire** | Replaced by `guard_runner.py` |
| `risk_scorer.py` | **Retire** | Replaced by `cost_estimator.py` (deterministic pricing math) |
| `incident_matcher.py` | **Retire** | No incident history concept in FirstDeploy |
| `datasource.py` | **Retire** | Mock AWS account replaced by demo template files |
| `fixtures/` | **Retire** | All 8 JSON fixtures replaced by `templates/*.yaml` |
| Frontend `App.tsx` | **Replace** | New UI: template input + findings report + rescan flow |
| Frontend `types.ts` | **Replace** | New types: ScanResult, Finding, CostEstimate |
| Frontend `api.ts` | **Replace** | New endpoints: `/scan`, `/templates`, `/rules` |
| Frontend `DependencyGraph.tsx` | **Retire** | No graph viz in FirstDeploy |
| Frontend `RiskBadge.tsx` | **Retire** or repurpose as severity badge | |
