import os
from dotenv import load_dotenv
load_dotenv()
os.environ["MOCK_BEDROCK"] = "false"

print("MOCK_BEDROCK  =", os.getenv("MOCK_BEDROCK"))
print("LLM_PROXY_URL =", os.getenv("LLM_PROXY_URL", "NOT SET"))
print("LLM_PROXY_MODEL =", os.getenv("LLM_PROXY_MODEL", "NOT SET"))

from app.bedrock_client import get_verdict

result = get_verdict(
    change_request={"target": "arn:aws:lambda:us-east-1:123456789012:function:payment-processor-lambda", "change_type": "delete"},
    blast_radius={"resources": 3, "applications": 1, "teams": 1, "alarms": 2, "customer_facing": True},
    affected_nodes=[],
    blind_spots=[],
    historical_matches=[],
    risk={"level": "high", "score": 65, "signals": {"customer_facing": 30, "blast_radius_size": 8}},
)
print("\nRESULT:")
print("verdict:", result.get("verdict"))
print("recommendation:", result.get("recommendation"))
print("change_plan steps:", len(result.get("change_plan", [])))
