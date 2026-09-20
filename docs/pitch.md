One important nuance: AWS already has products such as **AWS Resilience Hub** that assess application resiliency and can discover dependencies, so avoid saying "AWS has nothing like this." Resilience Hub is focused on resiliency assessment against policies, RTO/RPO, alarms, SOPs and tests. Our differentiation is the **pre-change decision workflow**: *what happens if I make this specific change right now?*—combining runtime and audit evidence, undocumented dependencies, historical incidents, deterministic risk, AI reasoning, and an actionable change plan.

## 🎤 Blast Radius — Complete Hackathon Pitch

### 1. The Problem

> **"Before making a change to production, how confident are you that you know everything that change will affect?"**

Today, AWS already gives us excellent visibility into individual aspects of our infrastructure.

For example, **AWS Config** can tell us what resources exist and records resource relationships. AWS Resilience Hub can assess application resiliency and provide recommendations around things like alarms, SOPs and testing.

But the problem we wanted to solve is slightly different.

Imagine I'm about to **delete a Lambda function**.

I know the Lambda I'm changing.

But do I know:

* Which other services directly depend on it?
* Which services depend on those services?
* Which application will be affected?
* Is there an undocumented dependency that isn't present in my configuration?
* Is a customer-facing flow somewhere downstream?
* Which team owns the affected components?
* Which monitoring alarms will stop being useful?
* Has a similar change caused an incident before?
* And most importantly — **how risky is this particular change?**

That's where things become difficult.

Modern cloud applications aren't a collection of isolated resources.

They're a **web of interconnected services**.

A seemingly small change like:

> "Let's downsize this database."

can potentially affect:

```text
Database
   ↓
API
   ↓
Payment Service
   ↓
Checkout Application
   ↓
Customers
```

And the dependency might not even be documented.

So the real problem is:

> **We have plenty of infrastructure data, but that data is fragmented across different AWS services. What we don't have is a single, change-centric view that tells us the potential impact, hidden dependencies, historical precedent, risk, and what we should do before making the change.**

---

# 2. Our Solution — Blast Radius

That's why we built **Blast Radius**.

> **Blast Radius is an AI-powered AWS Change Intelligence platform that answers one question before you make an infrastructure change: "What could this change break, how risky is it, and what should I do before proceeding?"**

Instead of looking at AWS services independently, we bring their signals together into a **single dependency graph**.

We take information from:

* AWS Config
* X-Ray
* CloudTrail
* AppRegistry
* CloudWatch
* Resource Tags

and transform them into one unified view of the environment.

Then, when a user proposes a change, we analyze that change across the entire graph.

---

# 3. The Architecture

At a high level:

```text
                 AWS DATA SOURCES
                       │
       ┌───────────────┼────────────────┐
       │               │                │
     Config          X-Ray          CloudTrail
       │               │                │
       ├────────── AppRegistry ─────────┤
       │               │                │
       ├────── CloudWatch (Alarms) ──────┤
       └────────── Tags ────────────────┘
                       │
                       ▼
                GRAPH ENGINE
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Blast Radius   Blind Spots   Incidents
          │            │            │
          └────────────┼────────────┘
                       ▼
                RISK SCORER
                       │
                       ▼
              COST ESTIMATOR
                       │
                       ▼
                 BEDROCK AI
                       │
                       ▼
                CHANGE PLAN
```

The important thing is that **AI isn't responsible for figuring out the infrastructure itself**.

The infrastructure analysis is deterministic.

AI is used on top of that trusted context to explain the result and provide recommendations.

---

# 4. The Graph Engine

The heart of Blast Radius is our **graph engine**.

We build a directed graph using information from five major AWS data sources.

Our graph contains different types of nodes:

### Resource

Actual AWS infrastructure:

```text
Lambda
RDS
SQS
API Gateway
DynamoDB
```

### Application

A logical business application.

For example:

```text
Checkout App
 ├── Checkout Lambda
 ├── Payment Lambda
 ├── SQS
 └── DynamoDB
```

### Team

The team responsible for a resource.

```text
Payment Lambda
      ↓
Payments Team
```

### Alarm

CloudWatch monitoring associated with a resource.

```text
Payment Lambda
      ↑
Payment Latency Alarm
```

### Customer

A synthetic node representing end users.

If a resource eventually connects to this node, we know the change has a **customer-facing impact**.

---

# 5. Why Multiple AWS Sources?

This is one of the strongest parts of the story.

Each AWS service gives us a **different perspective**.

### AWS Config

> **What officially exists and how resources are configured.**

### X-Ray

> **What actually talks to what at runtime.**

For example:

```text
Lambda A → Lambda B
```

might actually happen thousands of times even if that relationship wasn't documented.

### CloudTrail

> **Who performed what AWS API action and when.**

This gives us an additional behavioral/audit signal.

### AppRegistry

> **Which infrastructure belongs to which logical application.**

### CloudWatch + Tags

> **What is being monitored and who owns it.**

The power comes from combining them.

---

# 6. Confidence Scoring

But there's another problem.

Not every relationship we discover has the same level of certainty.

For example:

```text
X-Ray says:
A → B
```

is different from:

```text
Config says:
A → B
```

And if **both Config and X-Ray independently agree**, that's much stronger evidence.

So every edge in our graph gets a **confidence score based on its provenance**.

For example:

```text
X-Ray       → 0.75
CloudTrail  → 0.65
Config      → 0.60
Inferred    → 0.30
```

And when multiple sources agree:

```text
Config + X-Ray
      ↓
   0.95 confidence
```

This means we're not simply saying:

> "These two things are connected."

We're saying:

> **"These two things are connected, and here's how confident we are and why."**

---

# 7. Blind-Spot Detection

This is another major differentiator.

Suppose:

```text
X-Ray:
Payment Service → Fraud Service
```

but:

```text
AWS Config:
No such dependency documented
```

That's potentially dangerous.

Because someone looking only at the declared architecture might never know about it.

So Blast Radius identifies these as:

> 🚨 **Undocumented Dependencies / Blind Spots**

And we show:

* source
* target
* call count
* confidence % (how certain we are this edge is real)
* provenance (X-Ray or CloudTrail)
* why the dependency was considered hidden

And importantly, we don't flood the user with every undocumented relationship in the environment.

We scope the detection to the **blast radius of the resource being changed**.

So the result stays relevant.

---

# 8. Bidirectional Blast Radius

When a user selects a resource, we don't just ask:

> "What does this resource depend on?"

We ask **both directions**.

### Inbound

> Who depends on me?

### Outbound

> What do I depend on?

And we traverse up to **three hops**.

For example:

```text
                 Checkout API
                      ↓
               Payment Service
                      ↓
                 Payment DB
```

If I change the Payment Service, we can identify:

```text
Inbound:
Checkout API
Checkout App
Customers

Outbound:
Payment DB
Fraud Service
```

So we get a much more complete picture of the potential impact.

---

# 9. Historical Precedent

Now comes another question:

> **"Has something like this gone wrong before?"**

We have a historical incident database.

When someone proposes a change, we look for incidents with similar:

* resource type
* resource
* change type
* application context

For example:

```text
Proposed change:
Delete Lambda

Historical incident:
INC-2841
Change: Delete Lambda
Outage: 47 minutes
Root cause: Downstream service still depended on Lambda
Affected apps: Checkout, Payments
```

That's incredibly useful context.

Because instead of only saying:

> "This change looks risky."

we can say:

> **"A similar change previously resulted in a 47-minute outage because of a downstream dependency."**

The historical matcher is also intentionally strict: the **resource type and change type must match** before we consider the precedent.

---

# 10. Deterministic Risk Scoring

We don't want an LLM randomly deciding:

> "I think this looks high risk."

So our **risk score is deterministic**.

We calculate a score from multiple signals:

```text
customer facing          +30
change type severity     +20
blast radius size    up to +15
blind spot present        +15
historical incident  up to +12
prod critical node        +8
                         ───
                      max 100
```

Then:

```text
0–24    → LOW
25–49   → MEDIUM
50–74   → HIGH
75–100  → CRITICAL
```

This is important because the risk score is **explainable and reproducible**.

A judge can ask:

> "Why did you classify this as HIGH?"

And we can show exactly which signals contributed to that score.

---

# 11. Cost Impact Analysis

We didn't want to stop at risk. We also wanted to answer:

> **"What will this change cost or save?"**

After the blast radius is computed, we run every affected node through a **cost estimator**.

For each resource with a known cost profile, we calculate the monthly cost delta based on the change:

```text
Delete Lambda         → saves $X/month (resource_deleted)
Downsize Lambda memory → saves/costs based on memory ratio
RDS instance resize    → delta based on per-instance-class rates
DynamoDB billing mode  → estimated shift from provisioned to on-demand
```

Each delta includes:

* monthly cost change in USD
* driver (what caused the delta)
* baseline monthly cost
* confidence %

The cost delta is shown directly on each affected node in the **Node Inspector panel** — so engineers can see both the risk and the financial impact of a change in one view.

---

# 13. Where AI Comes In

Once we have all this structured evidence, we send it to **Claude through Amazon Bedrock**.

But we're deliberately **not asking the LLM to discover the infrastructure itself**.

We give it the structured analysis:

```text
Resource
Change
Blast radius
Dependencies
Confidence
Blind spots
Historical incidents
Risk signals
```

Then Bedrock produces:

### Verdict

> What does this change mean?

### Reasoning

> Why is it risky or relatively safe?

### Recommendation

> Should the operator proceed cautiously, validate something first, etc.?

### Change Plan

> What specific steps should happen before and after the change?

This gives us the best of both worlds:

> **Deterministic infrastructure analysis + AI-powered reasoning.**

---

# 14. Actionable Change Plans

We didn't want the system to stop at:

> 🔴 "Risk = HIGH."

That's not particularly useful.

So for **HIGH and CRITICAL** changes, we generate a concrete change plan.

For example:

```text
☐ Notify Payments Team
☐ Validate undocumented Fraud Service dependency
☐ Check X-Ray activity for last 30 days
☐ Verify rollback artifact
☐ Run load test
☐ Perform 10% canary
☐ Enable enhanced monitoring
☐ Review post-change metrics
```

So Blast Radius doesn't just answer:

> **"What might happen?"**

It also answers:

> **"What should I do before I make the change?"**

---

# 15. The Demo Flow

For the actual judge demo, I'd make the story extremely simple.

Start with the **boot screen** — a terminal animation initialises the system on load:

```text
> INITIALIZING AWS CHANGE INTELLIGENCE v2.0.0
> CONNECTING TO GRAPH ENGINE................. OK
> LOADING X-RAY SERVICE MAP......... 27 NODES, 40 EDGES
> BLIND SPOT DETECTOR................................ ARMED
> COST ESTIMATOR.............................. CALIBRATED
> RISK SCORER........................................... ONLINE
> ████████████████████████████ 100%
> ALL SYSTEMS READY. INITIATING...
```

This sets the tone immediately — judges see what the system is doing before they touch anything.

Then:

> **"Let me show you what happens when an engineer wants to make what looks like a simple production change."**

Then:

### Step 1 — Select resource

Choose:

**Payment Processor Lambda**

Show:

```text
Type: Lambda
Environment: Production
Criticality: Critical
Customer Facing: Yes
```

### Step 2 — Select change

Choose:

**Delete**

Then say:

> "At this point, a normal workflow might tell me that I'm deleting a Lambda. But Blast Radius asks a much bigger question."

### Step 3 — Analyze

Click:

**Analyze Change**

And show the graph.

The graph is **interactive and 3D** (Three.js / react-force-graph-3d) — nodes represent resources, applications, teams, alarms, and customers, colored by criticality. Every edge shows its relation type, provenance sources, and confidence score on hover. Blind-spot edges render as **red dashed lines**, visually distinct from declared dependencies.

Click any node to open the **Node Inspector panel** — a slide-in sidebar showing criticality, resource type, ARN, hop distance, blast path, related blind spots, and **cost impact for that specific node**.

```text
Payment Lambda
      │
 ┌────┼─────────┐
 ↓    ↓         ↓
API  Fraud     Alarm
 ↓    ↓
App  Database
 ↓
Customer
```

Then highlight the **red dashed blind-spot edge**.

Say:

> "X-Ray tells us that this service is actually calling another service, but that dependency isn't present in our declared configuration."

That's your **wow moment**.

---

### Step 4 — Show risk

Then move to:

**Risk: CRITICAL — 96/100**

Expand the signals:

```text
customer facing          +30
change type severity     +20
blast radius size        +15
blind spot present       +15
historical incident      +8
prod critical node       +8
```

Now the judge can see:

> This isn't an arbitrary AI-generated risk level.

It is explainable.

---

### Step 5 — Show cost impact

Click any node in the 3D graph to open the **Node Inspector**.

Show the cost delta:

```text
Node: payment-processor-lambda
Cost Impact: -$X/mo
Driver: resource_deleted
Baseline: $Y/mo · 90% confidence
```

Say:

> "We don't just tell you what breaks. We tell you what it costs or saves."

---

### Step 6 — Show historical precedent

Then:

> "And this isn't just theoretical."

Show:

```text
INC-2043
Similar delete operation on Lambda
17-minute outage
Root cause:
Deleting the Lambda severed an undocumented invocation from fraud-detection-service.
Fraud checks failed open — all transactions processed without screening.
```

This ties your historical intelligence into the story.

---

### Step 7 — Show AI verdict

Then:

> "Now that we have deterministic evidence, we ask Bedrock to reason over it."

Show the verdict/recommendation.

The important phrase here is:

> **"The AI doesn't invent the dependency. It reasons over the dependency evidence we've already established."**

That is a very strong point to make to AWS judges.

---

### Step 8 — Generate Change Plan

Finally:

> "And instead of simply telling the engineer 'don't do it', we tell them what they should validate before proceeding."

Open:

**Generate Change Plan**

Show the checklist.

---

# 16. Your One-Sentence Pitch

> **"So what exactly did you build?"**

answer:

> **"Blast Radius is an AWS Change Intelligence platform that combines configuration, runtime behavior, audit activity, application context, monitoring and historical incidents into a confidence-aware dependency graph, so before an engineer changes a production resource, they can see what could be affected, discover hidden dependencies, understand the risk, learn from previous incidents, and get an actionable change plan."**

---

# 17. Summary

> **"Cloud environments are highly interconnected, but change decisions are often made with only a partial view of those dependencies. AWS gives us this information across different services, but it's fragmented.**
>
> **Blast Radius brings those signals together into a single dependency graph. When an engineer proposes a change, we trace its direct and indirect impact, detect undocumented dependencies, check whether similar changes caused incidents before, and calculate an explainable risk score.**
>
> **Then we use Amazon Bedrock to reason over that evidence and generate a recommendation and actionable change plan.**
>
> **So instead of asking 'What am I changing?', Blast Radius helps answer 'What am I potentially affecting, how risky is it, and what should I do before I proceed?'**"


