from typing import Any, Optional
from pydantic import BaseModel


class ChangeRequest(BaseModel):
    target: str
    change_type: str  # delete | downsize | config_change | scale | iam_change
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None


class BlastRadiusSummary(BaseModel):
    resources: int
    applications: int
    teams: int
    alarms: int
    customer_facing: bool


class AffectedNode(BaseModel):
    node_id: str
    name: str
    node_type: str
    resource_type: str
    criticality: str
    hop_distance: int
    path: list[str]


class BlindSpot(BaseModel):
    source_id: str
    source_name: str
    target_id: str
    target_name: str
    observed_via: str
    observed_count: int
    confidence: float
    why_hidden: str


class HistoricalMatch(BaseModel):
    incident_id: str
    similarity: float
    outage_minutes: int
    date: str
    root_cause: str
    affected_apps: list[str]
    severity: str


class RiskResult(BaseModel):
    score: int
    level: str
    signals: dict[str, float]


class AnalysisResult(BaseModel):
    change: ChangeRequest
    blast_radius: BlastRadiusSummary
    affected_nodes: list[AffectedNode]
    blind_spots: list[BlindSpot]
    historical_matches: list[HistoricalMatch]
    risk: RiskResult
    verdict: str
    recommendation: str
    change_plan: list[str]


class GraphNode(BaseModel):
    id: str
    name: str
    node_type: str
    resource_type: str
    criticality: str
    customer_facing: bool


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    provenance: list[str]
    confidence: float
    observed_count: int
    is_blind_spot: bool


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
