#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:8080}"

curl --fail --silent --show-error "${base_url}/" >/dev/null
curl --fail --silent --show-error "${base_url}/api/health" |
  python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'

email="ep1-smoke-$(date +%s)-$$@example.test"
registration="$(curl --fail-with-body --silent --show-error \
  --header 'content-type: application/json' \
  --data "{\"email\":\"${email}\",\"password\":\"ep1-smoke-strong-password\"}" \
  "${base_url}/api/auth/register")"
token="$(printf '%s' "$registration" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

curl --fail --silent --show-error \
  --header "Authorization: Bearer ${token}" \
  "${base_url}/api/auth/me" |
  python3 -c 'import json,sys; assert json.load(sys.stdin)["email"].endswith("@example.test")'

preview="$(curl --fail-with-body --silent --show-error \
  --header 'content-type: application/json' \
  --data '{"name":"EP1 smoke test","areaM2":50,"budgetClp":13000000}' \
  "${base_url}/api/projects/preview")"

printf '%s' "$preview" | python3 -c '
import json, sys
result = json.load(sys.stdin)
assert result["project"]["id"] > 0
assert result["project"]["name"] == "EP1 smoke test"
recommendation = result["recommendation"]
assert recommendation["source"] == "demo"
assert recommendation["recommended_tier"] == "standard"
assert recommendation["estimated_cost_clp"] == 13000000
assert recommendation["fits_budget"] is True
'

curl --fail --silent --show-error "${base_url}/api/projects" |
  python3 -c 'import json,sys; assert any(p["name"] == "EP1 smoke test" for p in json.load(sys.stdin))'

status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --data '{"name":"","areaM2":0,"budgetClp":-1}' \
  "${base_url}/api/projects/preview")"
test "$status" = 400

curl --fail --silent --show-error --output /dev/null \
  --request POST --header "Authorization: Bearer ${token}" \
  "${base_url}/api/auth/logout"
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "Authorization: Bearer ${token}" "${base_url}/api/auth/me")"
test "$status" = 401

echo 'EP1 smoke test: frontend, NestJS, FastAPI, PostgreSQL, auth and validation passed.'
