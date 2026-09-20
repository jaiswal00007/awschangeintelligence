export interface Resource {
  id: string
  name: string
  resource_type: string
  criticality: string
  customer_facing: boolean
  attrs: Record<string, unknown>
}

export interface ChangeRequest {
  target: string
  change_type: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export interface BlastRadiusSummary {
  resources: number
  applications: number
  teams: number
  alarms: number
  customer_facing: boolean
}

export interface CostDelta {
  monthly_delta_usd: number
  driver: string
  baseline_usd: number
  confidence: number
}

export interface AffectedNode {
  node_id: string
  name: string
  node_type: string
  resource_type: string
  criticality: string
  hop_distance: number
  path: string[]
  cost_delta?: CostDelta
}

export interface BlindSpot {
  source_id: string
  source_name: string
  target_id: string
  target_name: string
  observed_via: string
  observed_count: number
  confidence: number
  why_hidden: string
}

export interface HistoricalMatch {
  incident_id: string
  similarity: number
  outage_minutes: number
  date: string
  root_cause: string
  affected_apps: string[]
  severity: string
}

export interface RiskResult {
  score: number
  level: string
  signals: Record<string, number>
}

export interface AnalysisResult {
  change: ChangeRequest
  blast_radius: BlastRadiusSummary
  affected_nodes: AffectedNode[]
  blind_spots: BlindSpot[]
  historical_matches: HistoricalMatch[]
  risk: RiskResult
  verdict: string
  recommendation: string
  change_plan: string[]
}

export interface GraphNode {
  id: string
  name: string
  node_type: string
  resource_type: string
  criticality: string
  customer_facing: boolean
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
  provenance: string[]
  confidence: number
  observed_count: number
  is_blind_spot: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
