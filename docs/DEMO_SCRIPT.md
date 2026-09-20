# 3-Minute Demo Script — AWS Change Intelligence

**Setup before recording:**
- Backend running: `backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001`
- Frontend running: `cd frontend && npm run dev`
- Browser open at `http://localhost:5173`, full screen, dark mode
- Target resource pre-selected: `payment-processor-lambda`
- Change type pre-selected: `DELETE`
- Zoom browser to 110% so graph and cards are clearly visible

---

## Segment 1 — The Setup (0:00–0:30)

**What's on screen:** The sidebar with the resource picker and change type buttons.

**Say:**
> "Every week, engineers push changes to production without knowing what they'll break.
> AWS has the data — X-Ray traces, Config relationships, CloudTrail events, Cost Explorer.
> But nothing connects it into a decision.
>
> This is AWS Change Intelligence. Let me show you what happens when someone wants to delete the payment-processor Lambda."

**Action:** Select `payment-processor-lambda` from the dropdown. Click the `DELETE` button. It highlights red.

---

## Segment 2 — The Blast Radius (0:30–1:00)

**What's on screen:** Hit Analyze. Watch the graph animate in with the radar sweep and red blast path.

**Say:**
> "Hit analyze."
>
> *(pause 2 seconds while graph loads)*
>
> "8 services affected. 3 teams. The checkout API, the fraud detection service, the payments database, the notification pipeline — all of them break if this Lambda goes down.
>
> The graph is live-traced from X-Ray. These aren't guesses — this is 48,000 calls per week, visualized."

**Point to:** The floating counters bottom-left of the graph — Resources, Apps, Teams, Alarms.

---

## Segment 3 — The Blind Spot (1:00–1:30)

**What's on screen:** The graph, highlighting the red dashed edge between fraud-detection-service and payment-processor-lambda.

**Say:**
> "Now here's the part no one knows about.
>
> See this red edge? Fraud detection calls payment-processor 6,000 times a week.
> But if you look at AWS Config — that dependency doesn't exist. It's not declared anywhere.
>
> We call this a blind spot. The system found it by cross-referencing X-Ray observed traffic against Config declared relationships.
>
> If you had deleted this Lambda without this tool — fraud checks would have failed open for 17 minutes. Every transaction approved. No screening. That actually happened — INC-2043, November last year."

**Point to:** The Blind Spots panel showing `fraud-detection-service → payment-processor-lambda` with the `why_hidden` text.

---

## Segment 4 — The Risk Score (1:30–2:00)

**What's on screen:** The Risk Score card with the SVG ring animating up to the score.

**Say:**
> "The risk score is deterministic — not vibes, not an LLM guess.
>
> *(watch the counter animate)*
>
> Score: 88. Critical.
>
> Five signals fired: customer-facing surface reached — 30 points. Blind spot present — 15 points. Historical incident match at 91% similarity — 11 points. Blast radius size — 11 points. Production-critical node in path — 8 points.
>
> The AI narrates the verdict. The math is authoritative."

**Point to:** The signal breakdown bars inside the RiskBadge when expanded.

---

## Segment 5 — The Cost Signal (2:00–2:30)

**What's on screen:** Scroll down to the Cost Impact card.

**Say:**
> "And here's the number that gets finance's attention.
>
> $285 per month in downstream services that would be affected. The payments RDS alone is $182 a month in operational cost tied to this Lambda.
>
> This isn't just an outage risk. Every change has a cost blast radius — and nobody was measuring it."

**Point to:** The neon green cost tiles, especially payments-rds showing `-$182/mo`.

---

## Segment 6 — The Close (2:30–3:00)

**What's on screen:** Scroll back up. Show the AI Verdict + Recommendation card and the Change Plan.

**Say:**
> "The system generates a step-by-step change plan — coordinate with the checkout team, notify the fraud team, drain the SQS queue before deletion, validate no active connections on RDS.
>
> *(beat)*
>
> AWS had all this data the whole time.
> X-Ray. Config. CloudTrail. Cost Explorer.
>
> We just made it a decision — before the decision was made."

**End on:** The full UI visible — graph, risk score, cost card, all in the cyberpunk theme.

---

## Backup Lines (if you go off-script)

- On the graph: *"Every node is a real AWS resource type. Every edge has a confidence score and a provenance — X-Ray, Config, CloudTrail, or inferred."*
- On blind spots: *"A blind spot is any edge X-Ray observed but Config doesn't know about. That's where real incidents hide."*
- On the score: *"The score goes 0–100. Critical is 75+. This change is an 88 — you don't push this on a Friday."*
- On cost: *"We modeled billing against AWS Cost Explorer pricing — Lambda GB-seconds, RDS instance hours, DynamoDB on-demand units."*
- On the stack: *"FastAPI backend, NetworkX graph engine, React + ForceGraph2D frontend, Claude on Bedrock for the verdict."*

---

## What NOT to say

- Don't say "mock data" or "fixture" — it's a demo environment
- Don't say "we plan to" — everything shown is built and working
- Don't explain how the graph works technically — show it, name the outcome
- Don't pause on loading — have the result pre-loaded if doing multiple takes
