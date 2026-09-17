import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import networkx as nx

from .datasource import DataSource


class NodeType(str, Enum):
    resource = "resource"
    application = "application"
    team = "team"
    alarm = "alarm"
    customer = "customer"


class EdgeRelation(str, Enum):
    depends_on = "depends_on"
    invokes = "invokes"
    reads_from = "reads_from"
    owned_by = "owned_by"
    monitored_by = "monitored_by"
    serves = "serves"
    member_of = "member_of"


class EdgeProvenance(str, Enum):
    config = "config"
    cloudtrail = "cloudtrail"
    xray = "xray"
    tag = "tag"
    appregistry = "appregistry"
    inferred = "inferred"


_PROVENANCE_CONFIDENCE = {
    EdgeProvenance.config: 0.60,
    EdgeProvenance.cloudtrail: 0.65,
    EdgeProvenance.xray: 0.75,
    EdgeProvenance.tag: 0.50,
    EdgeProvenance.appregistry: 0.60,
    EdgeProvenance.inferred: 0.30,
}

_CRITICALITY_ORDER = {"unknown": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

CUSTOMER_NODE_ID = "synthetic:customer"


def _resource_short_name(arn_or_id: str) -> str:
    return arn_or_id.split(":")[-1].split("/")[-1]


def build_graph(ds: DataSource) -> nx.DiGraph:
    G = nx.DiGraph()

    # ── tag lookup ──────────────────────────────────────────────────────────
    tag_map: dict[str, dict] = {}
    for entry in ds.get_tags():
        tag_map[entry["resourceARN"]] = entry.get("tags", {})

    # ── appregistry lookup ───────────────────────────────────────────────────
    app_resource_map: dict[str, str] = {}   # resource_arn -> app_id
    for app in ds.get_appregistry():
        G.add_node(
            app["id"],
            node_type=NodeType.application,
            name=app["name"],
            attrs=app.get("tags", {}),
            criticality="high",
            sources=["appregistry"],
        )
        for arn in app.get("associatedResources", []):
            app_resource_map[arn] = app["id"]

    # ── customer node ────────────────────────────────────────────────────────
    G.add_node(
        CUSTOMER_NODE_ID,
        node_type=NodeType.customer,
        name="Customer",
        attrs={},
        criticality="critical",
        sources=["inferred"],
    )

    # ── resource nodes (from Config) ─────────────────────────────────────────
    for res in ds.get_resources():
        rid = res["id"]
        tags = tag_map.get(rid, {})
        crit = tags.get("criticality", "unknown")
        G.add_node(
            rid,
            node_type=NodeType.resource,
            name=res["name"],
            resource_type=res["type"],
            attrs={**res.get("configuration", {}), **tags},
            criticality=crit,
            sources=["config"],
            customer_facing=tags.get("customer-facing", "false") == "true",
        )

    # ── Config declared edges ────────────────────────────────────────────────
    for res in ds.get_resources():
        src = res["id"]
        for rel in res.get("relationships", []):
            dst = rel["resourceId"]
            if not G.has_node(dst):
                continue
            relation = EdgeRelation.depends_on
            raw = rel.get("relationshipName", "").lower()
            if "trigger" in raw:
                relation = EdgeRelation.invokes
            elif "associated" in raw:
                relation = EdgeRelation.depends_on
            _add_or_merge_edge(G, src, dst, relation, EdgeProvenance.config, 1)

    # ── X-Ray observed edges ─────────────────────────────────────────────────
    xray = ds.get_xray_service_graph()
    svc_by_ref: dict[int, dict] = {}
    for svc in xray.get("serviceGraph", {}).get("services", []):
        svc_by_ref[svc["referenceId"]] = svc

    for svc in xray.get("serviceGraph", {}).get("services", []):
        src_arn = svc.get("arn")
        if not src_arn or not G.has_node(src_arn):
            continue
        for edge in svc.get("edges", []):
            dst_svc = svc_by_ref.get(edge["referenceId"])
            if not dst_svc:
                continue
            dst_arn = dst_svc.get("arn")
            if not dst_arn or not G.has_node(dst_arn):
                continue
            count = edge.get("summaryStatistics", {}).get("totalCount", 1)
            _add_or_merge_edge(G, src_arn, dst_arn, EdgeRelation.invokes,
                               EdgeProvenance.xray, count)

    # ── CloudTrail invoke edges ──────────────────────────────────────────────
    for evt in ds.get_cloudtrail_events():
        if evt.get("eventName") != "Invoke":
            continue
        caller = evt.get("username", "")
        # Resolve caller ARN from name
        caller_arn = _resolve_arn_by_name(G, caller)
        target_arn = None
        for r in evt.get("resources", []):
            if r.get("type") == "AWS::Lambda::Function":
                target_arn = r.get("ARN")
        if not caller_arn or not target_arn or not G.has_node(target_arn):
            continue
        if caller_arn == target_arn:
            continue
        count = evt.get("invokeCount", 1)
        _add_or_merge_edge(G, caller_arn, target_arn, EdgeRelation.invokes,
                           EdgeProvenance.cloudtrail, count)

    # ── AppRegistry member_of edges ──────────────────────────────────────────
    for res in ds.get_resources():
        rid = res["id"]
        app_id = app_resource_map.get(rid)
        if app_id and G.has_node(app_id):
            _add_or_merge_edge(G, rid, app_id, EdgeRelation.member_of,
                               EdgeProvenance.appregistry, 1)

    # ── Tag: owned_by team ───────────────────────────────────────────────────
    for arn, tags in tag_map.items():
        team = tags.get("team")
        if not team or not G.has_node(arn):
            continue
        team_node = f"team:{team}"
        if not G.has_node(team_node):
            G.add_node(team_node, node_type=NodeType.team, name=team,
                       attrs={}, criticality="unknown", sources=["tag"])
        _add_or_merge_edge(G, arn, team_node, EdgeRelation.owned_by,
                           EdgeProvenance.tag, 1)

    # ── CloudWatch alarms: monitored_by ──────────────────────────────────────
    for alarm in ds.get_alarms():
        alarm_id = alarm["alarmArn"]
        if not G.has_node(alarm_id):
            G.add_node(alarm_id, node_type=NodeType.alarm, name=alarm["alarmName"],
                       attrs={}, criticality="unknown", sources=["cloudwatch"])
        for dim in alarm.get("dimensions", []):
            # Find resource node whose name matches dimension value
            target = _resolve_arn_by_name(G, dim["value"])
            if target:
                _add_or_merge_edge(G, alarm_id, target, EdgeRelation.monitored_by,
                                   EdgeProvenance.inferred, 1)

    # ── Customer-facing: serves edge ─────────────────────────────────────────
    for node, data in list(G.nodes(data=True)):
        if data.get("customer_facing"):
            _add_or_merge_edge(G, node, CUSTOMER_NODE_ID, EdgeRelation.serves,
                               EdgeProvenance.tag, 1)

    # ── Boost confidence where both config + xray agree ──────────────────────
    for u, v, data in G.edges(data=True):
        provs = data.get("provenances", [])
        if EdgeProvenance.config in provs and EdgeProvenance.xray in provs:
            data["confidence"] = 0.95

    return G


def blast_radius(G: nx.DiGraph, target_id: str, hops: int = 2) -> dict:
    """
    Traverse graph up to `hops` from target.
    Returns affected nodes with hop distance and shortest path.
    Uses REVERSE graph so we follow edges that point TOWARD target
    (i.e. find who depends on target).
    """
    if not G.has_node(target_id):
        return {"target": target_id, "affected_nodes": []}

    # For blast radius: who would break if target disappears?
    # Follow incoming edges (who depends on target) + outgoing (what target depends on)
    # We do BFS on both directions
    affected: dict[str, dict] = {}

    # Forward: what target calls (its dependencies also impacted if delete)
    for node, path in _bfs_paths(G, target_id, hops, reverse=False):
        if node == target_id:
            continue
        existing = affected.get(node, {})
        if not existing or len(path) < existing["hop_distance"]:
            affected[node] = {"node_id": node, "hop_distance": len(path) - 1, "path": path}

    # Reverse: who depends on target (the blast)
    for node, path in _bfs_paths(G, target_id, hops, reverse=True):
        if node == target_id:
            continue
        existing = affected.get(node, {})
        if not existing or len(path) < existing.get("hop_distance", 999) + 1:
            affected[node] = {"node_id": node, "hop_distance": len(path) - 1, "path": path}

    result_nodes = []
    resources = teams = apps = alarms = 0
    customer_facing = False

    for node_id, info in affected.items():
        data = G.nodes[node_id]
        ntype = data.get("node_type", NodeType.resource)
        if ntype == NodeType.resource:
            resources += 1
        elif ntype == NodeType.team:
            teams += 1
        elif ntype == NodeType.application:
            apps += 1
        elif ntype == NodeType.alarm:
            alarms += 1
        elif ntype == NodeType.customer:
            customer_facing = True

        result_nodes.append({
            **info,
            "name": data.get("name", node_id),
            "node_type": ntype,
            "resource_type": data.get("resource_type", ""),
            "criticality": data.get("criticality", "unknown"),
        })

    return {
        "target": target_id,
        "blast_radius": {
            "resources": resources,
            "applications": apps,
            "teams": teams,
            "alarms": alarms,
            "customer_facing": customer_facing,
        },
        "affected_nodes": sorted(result_nodes, key=lambda x: x["hop_distance"]),
    }


def get_subgraph(G: nx.DiGraph, target_id: str, hops: int = 2) -> dict:
    """Return nodes + edges for visualization around target."""
    if not G.has_node(target_id):
        return {"nodes": [], "edges": []}

    node_ids = {target_id}
    for node, _ in _bfs_paths(G, target_id, hops, reverse=False):
        node_ids.add(node)
    for node, _ in _bfs_paths(G, target_id, hops, reverse=True):
        node_ids.add(node)

    nodes = []
    for nid in node_ids:
        d = G.nodes[nid]
        nodes.append({
            "id": nid,
            "name": d.get("name", nid),
            "node_type": d.get("node_type", NodeType.resource),
            "resource_type": d.get("resource_type", ""),
            "criticality": d.get("criticality", "unknown"),
            "customer_facing": d.get("customer_facing", False),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        if u in node_ids and v in node_ids:
            edges.append({
                "source": u,
                "target": v,
                "relation": data.get("relation", ""),
                "provenance": data.get("provenances", []),
                "confidence": data.get("confidence", 0.5),
                "observed_count": data.get("observed_count", 0),
                "is_blind_spot": data.get("is_blind_spot", False),
            })

    return {"nodes": nodes, "edges": edges}


# ── helpers ──────────────────────────────────────────────────────────────────

def _add_or_merge_edge(G: nx.DiGraph, src: str, dst: str,
                       relation: EdgeRelation, provenance: EdgeProvenance,
                       count: int):
    if not G.has_node(src) or not G.has_node(dst):
        return
    if G.has_edge(src, dst):
        data = G[src][dst]
        data["observed_count"] = data.get("observed_count", 0) + count
        provs = data.get("provenances", [])
        if provenance not in provs:
            provs.append(provenance)
        data["provenances"] = provs
        data["confidence"] = max(
            data.get("confidence", 0),
            _PROVENANCE_CONFIDENCE.get(provenance, 0.3)
        )
    else:
        G.add_edge(src, dst,
                   relation=relation,
                   provenances=[provenance],
                   confidence=_PROVENANCE_CONFIDENCE.get(provenance, 0.3),
                   observed_count=count,
                   is_blind_spot=False)


def _bfs_paths(G: nx.DiGraph, start: str, hops: int, reverse: bool):
    graph = G.reverse() if reverse else G
    visited = {start: [start]}
    queue = [start]
    for _ in range(hops):
        next_queue = []
        for node in queue:
            for neighbor in graph.successors(node):
                if neighbor not in visited:
                    visited[neighbor] = visited[node] + [neighbor]
                    next_queue.append(neighbor)
        queue = next_queue
    for node, path in visited.items():
        yield node, path


def _resolve_arn_by_name(G: nx.DiGraph, name: str) -> Optional[str]:
    for node, data in G.nodes(data=True):
        if data.get("name") == name:
            return node
        if node.endswith(f":{name}") or node.endswith(f"/{name}"):
            return node
    return None
