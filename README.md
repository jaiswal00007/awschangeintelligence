# AWS Change Intelligence (BlastRadius)

Pre-change blast radius analysis for AWS infrastructure. Surfaces hidden dependencies, historical incidents, and a deterministic risk score before you deploy.

---

## Prerequisites

- Python 3.13+
- Node.js 18+
- (Optional) AWS credentials with `bedrock:InvokeModel` permission for real AI verdicts

---

## Setup

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env:
#   MOCK_BEDROCK=true   → use deterministic fallback (demo mode, no AWS needed)
#   MOCK_BEDROCK=false  → call real Bedrock (requires AWS credentials below)
```

If using real Bedrock, add to `backend/.env`:

```
AWS_ACCESS_KEY_ID=<your key>
AWS_SECRET_ACCESS_KEY=<your secret>
AWS_SESSION_TOKEN=<token if using SSO or assume-role>
BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

The model must be enabled in your AWS account under **Bedrock → Model access**.

Once credentials are set, restart the backend and run a quick smoke test:

```bash
curl -s -X POST http://localhost:8001/change/analyze \
  -H 'Content-Type: application/json' \
  -d '{"target":"arn:aws:lambda:us-east-1:123456789012:function:payment-processor-lambda","change_type":"delete","before":{},"after":{}}' \
  | python3 -m json.tool | grep -A5 '"verdict"'
```

If credentials aren't available, set `MOCK_BEDROCK=true` — all 3 demo scenarios still produce clean, scenario-specific verdicts using the deterministic fallback.

### 2. Frontend

```bash
cd frontend
npm install
```

---

## Running

Open two terminals.

**Terminal 1 — Backend**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Demo scenarios

| Target resource | Change type | Expected risk | Key signal |
|---|---|---|---|
| `payment-processor-lambda` | delete | CRITICAL 96 | Blind spot: fraud-detection-service calls it (5,929×/day undocumented) |
| `checkout-service-lambda` | downsize | CRITICAL 87 | INC-1834: same change caused OOM outage during flash sale |
| `payments-rds` | config_change | HIGH 51 | Blind spot: reporting-lambda holds connection pool (1,440 calls/day) |

---

## Architecture

```
frontend (React + Vite, :5173)
    └── /api proxy
backend (FastAPI, :8001)
    ├── MockDataSource  ← fixtures/  (demo)
    ├── graph_engine    ← NetworkX directed graph (Config + X-Ray + CloudTrail)
    ├── blind_spot      ← edges observed in telemetry but absent from declared deps
    ├── incident_matcher← fuzzy match against CloudTrail/incident history
    ├── risk_scorer     ← deterministic weighted score 0–100
    └── bedrock_client  ← Claude narrates; score is authoritative
```
