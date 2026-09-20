import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .datasource import MockDataSource
from .graph_engine import build_graph, blast_radius as compute_blast_radius, get_subgraph
from .blind_spot import detect_all_blind_spots, detect_blind_spots_for_target
from .risk_scorer import score as compute_score
from .incident_matcher import match as match_incidents
from .bedrock_client import get_verdict, chat as bedrock_chat
from .cost_estimator import estimate_cost_deltas
from .models import (
    ChangeRequest, AnalysisResult, GraphResponse,
    BlastRadiusSummary, AffectedNode, BlindSpot, HistoricalMatch, RiskResult,
)

FIXTURES_PATH = str(Path(__file__).parent.parent / "fixtures")

app = FastAPI(title="AWS Change Intelligence", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── startup: build graph once ────────────────────────────────────────────────

_ds = MockDataSource(FIXTURES_PATH)
_graph = build_graph(_ds)
detect_all_blind_spots(_graph)  # mark edges once at startup


@app.get("/resources")
def list_resources():
    resources = []
    for node, data in _graph.nodes(data=True):
        if data.get("node_type") == "resource":
            resources.append({
                "id": node,
                "name": data.get("name", node),
                "resource_type": data.get("resource_type", ""),
                "criticality": data.get("criticality", "unknown"),
                "attrs": data.get("attrs", {}),
                "customer_facing": data.get("customer_facing", False),
            })
    return {"resources": resources}


@app.get("/graph/{resource_id:path}")
def get_graph(resource_id: str, hops: int = 2):
    subgraph = get_subgraph(_graph, resource_id, hops)
    if not subgraph["nodes"]:
        raise HTTPException(status_code=404, detail=f"Resource {resource_id} not found")
    return subgraph


@app.get("/incidents")
def list_incidents(resource_type: str = None, change_type: str = None):
    incidents = _ds.get_incidents()
    if resource_type:
        incidents = [i for i in incidents if i.get("resourceType") == resource_type]
    if change_type:
        incidents = [i for i in incidents if i.get("changeType") == change_type]
    return {"incidents": incidents}


@app.post("/change/analyze", response_model=AnalysisResult)
def analyze_change(req: ChangeRequest):
    if not _graph.has_node(req.target):
        raise HTTPException(status_code=404, detail=f"Resource {req.target} not found in graph")

    # Blast radius
    br_result = compute_blast_radius(_graph, req.target, hops=3)
    br_summary = BlastRadiusSummary(**br_result["blast_radius"])
    raw_affected = estimate_cost_deltas(
        _ds.get_costs(),
        br_result["affected_nodes"],
        req.change_type,
        req.before,
        req.after,
    )
    affected_nodes = [AffectedNode(**n) for n in raw_affected]

    # Blind spots scoped to this target + its blast radius
    affected_ids = {n.node_id for n in affected_nodes} | {req.target}
    scoped_blind_spots = detect_blind_spots_for_target(_graph, req.target, affected_ids)
    blind_spot_models = [BlindSpot(**bs) for bs in scoped_blind_spots]

    # App names in blast radius for incident matching
    affected_app_names = [
        n.name for n in affected_nodes if n.node_type == "application"
    ]

    # Historical incident match
    target_data = _graph.nodes[req.target]
    raw_matches = match_incidents(
        _ds.get_incidents(),
        resource_type=target_data.get("resource_type", ""),
        change_type=req.change_type,
        affected_apps=affected_app_names,
    )
    historical_models = [HistoricalMatch(**m) for m in raw_matches]

    # Risk score
    raw_risk = compute_score(
        blast_radius=br_result["blast_radius"],
        change_type=req.change_type,
        blind_spots=scoped_blind_spots,
        historical_matches=raw_matches,
        affected_nodes=br_result["affected_nodes"],
    )
    risk_model = RiskResult(**raw_risk)

    # Verdict (LLM or fallback)
    verdict_result = get_verdict(
        change_request=req.model_dump(),
        blast_radius=br_result["blast_radius"],
        affected_nodes=br_result["affected_nodes"][:8],
        blind_spots=scoped_blind_spots,
        historical_matches=raw_matches[:3],
        risk=raw_risk,
    )

    return AnalysisResult(
        change=req,
        blast_radius=br_summary,
        affected_nodes=affected_nodes,
        blind_spots=blind_spot_models,
        historical_matches=historical_models,
        risk=risk_model,
        verdict=verdict_result.get("verdict", ""),
        recommendation=verdict_result.get("recommendation", ""),
        change_plan=verdict_result.get("change_plan", []),
    )


@app.post("/verdict")
def rerun_verdict(req: ChangeRequest):
    """Re-run only the LLM layer on an existing analysis (for prompt tuning)."""
    return analyze_change(req)


class ChatRequest(BaseModel):
    message: str
    context: dict


@app.post("/change/chat")
def change_chat(req: ChatRequest):
    reply = bedrock_chat(req.message, req.context)
    return {"reply": reply}
