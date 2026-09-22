#!/usr/bin/env bash
#
# Copies simlab-api's OpenAPI document into this repository, as JSON, stamped
# with the simlab-api version it came from.
#
#   scripts/refresh-api-spec.sh [path to simlab-api]   (or: make api-spec)
#
# The browser's types in src/api/types.ts are held to this copy by
# src/api/types.contract.test.ts. A copy rather than a read of the sibling
# repository, so the check runs wherever this repository is checked out on its
# own, and so the version of the API this build was written against is a fact
# in the tree: refreshing it is a change someone makes, and reviews.
set -euo pipefail

source_repo="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../simlab-api" && pwd)}"
spec="$source_repo/api/openapi.yaml"
[[ -f "$spec" ]] || { echo "no OpenAPI document at $spec" >&2; exit 1; }
version="$("$source_repo/scripts/version.sh" "$source_repo")"
# The version script marks any uncommitted change in simlab-api dirty; what
# matters here is only whether the document copied is the committed one.
if [[ -z "$(git -C "$source_repo" status --porcelain -- api/openapi.yaml)" ]]; then
  version="${version%.dirty}"
fi
out="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/api/simlab-api.openapi.json"

python3 - "$spec" "$version" "$out" <<'PY'
import json, sys, yaml
spec_path, version, out = sys.argv[1:]
with open(spec_path) as f:
    spec = yaml.safe_load(f)
spec["x-vendored-from"] = f"simlab-api {version}"
with open(out, "w") as f:
    json.dump(spec, f, indent=1, sort_keys=False)
    f.write("\n")
PY
echo "api/simlab-api.openapi.json <- simlab-api $version"
