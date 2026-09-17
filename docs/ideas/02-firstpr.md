# 🥈 FirstPR — Idea Plan #2

> *An agent that gives you your first commit — at a hackathon literally named "First Commit."*

**Weighted score:** 8.45
**Track:** Ship It (or Build It — Strands is an AWS open-source tool)
**Sector:** Developer tooling / open-source community

---

## The problem (Idea & Impact)

Thousands of early-career devs want to contribute to open source but freeze at the door:
Which repo? Which issue? What files? How do I even start? The intimidation is the barrier —
and that barrier is exactly what WeMakeDevs exists to lower.

**The person on the other side:** the intimidated first-time contributor — who *is* the judge,
and *is* half the room. This is Kunal's life's work rendered as software.

**Theme fit is destiny:** the event is named **First Commit.** An agent that produces someone's
first commit isn't pandering to the theme — it *is* the theme. That intangible is what makes a
founder screenshot your project.

## What it does (the ONE feature that must run)

1. Enter a repo URL + your skill level.
2. A Strands + Bedrock agent uses tools to: pick a genuine good-first-issue → read the codebase
   to find the files to change → draft an actual code diff → write the PR description.
3. Output: a checkable **artifact** — a real, mergeable draft PR (not advice).

## Why it wins the rubric

| Criterion | How FirstPR scores |
|-----------|--------------------|
| **Idea & Impact** | The person is in the room; "made your first PR" lands instantly. |
| **Built on AWS** | Purest **Strands Agents SDK** multi-tool reasoning demo in the field. |
| **Learning** | Best "my first agent" arc — visible task decomposition across tools. |
| **Execution** | Hardened by pre-vetting repos (see below) so the diff is genuinely mergeable. |
| **Demo Video** | Ends with clicking "Create pull request." First commit, on camera. |

## Architecture

```
React / simple web UI  (Amplify or S3+CloudFront)
   │  repo URL + skill level → watch agent work → see draft PR
   ▼
API Gateway → Lambda
   │
   ▼
Strands Agent (Bedrock Claude)
   ├─ tool: list_issues(repo, label=good-first-issue)
   ├─ tool: read_repo(paths)         → fetch tree + key files (README/CONTRIBUTING)
   ├─ tool: draft_change(issue,files)→ propose a diff
   └─ tool: write_pr_body(diff)      → PR title + description
   │
   ▼
DynamoDB (newcomer skill profile / match history)  ·  GitHub API (tools)
```

**Add one AWS-native tool** (DynamoDB-backed skill memory, or S3-stored repo embeddings) so the
AWS story is more than "Bedrock as an LLM endpoint."

## AWS services

Strands Agents SDK · Bedrock (Claude) · Lambda · API Gateway · DynamoDB · Amplify/S3+CloudFront

## 4-day build plan

- **Day 1:** Strands agent skeleton + GitHub tools (`list_issues`, `read_repo`). Bedrock access. Pick 2–3 friendly demo repos with clean good-first-issues.
- **Day 2:** `draft_change` + `write_pr_body`. Validate the agent actually solves your pre-vetted issues.
- **Day 3:** UI that shows the **tool-call trace** live (the "agent is reasoning" money shot) + the draft PR. Deploy.
- **Day 4:** Land one real mergeable PR on a demo repo; record video; blog post.

## Execution-hardening (3 → ~7)

- **Pre-vet 2–3 repos** with docs/typo/test-level good-first-issues where the diff is genuinely
  mergeable. Do NOT let judges pick an arbitrary repo live.
- Frame output as an **assisted draft, human reviews** — the artifact is the win, not autonomy.
- Show the **reasoning trace** (found issue → read these 3 files → proposed patch) as the wow-factor.

## 3-minute demo script

1. (0:00) "I always wanted to contribute to open source. I never knew where to start."
2. (0:30) Paste a repo URL, pick "beginner."
3. (1:00) Watch the agent's tool trace: list issues → read files → draft change.
4. (1:45) A real diff + PR description appears.
5. (2:20) Click **Create pull request.** It's live on GitHub.
6. (2:45) "My first commit — written with my first agent, on AWS."

## Biggest risk & mitigation

**Risk:** generating a *correct* diff for an arbitrary repo live — the #1 faceplant risk.
**Mitigation:** pre-vetted repos + easy well-labeled issues + "assisted draft" framing. Ship
this and the theme-fit intangible is unmatched in the field.
