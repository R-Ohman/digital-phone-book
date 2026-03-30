# Performance Testing

This folder contains k6 load tests for the Digital Phone Book API.

## Prerequisites

- Docker and Docker Compose
- Running stack (`backend`, `frontend`, `nginx`, `db`, `llm`)

## Run via Docker Compose profile

From repository root:

```bash
docker compose --profile perf run --rm k6
docker compose --profile perf run --rm k6-llm
```

These run the following scripts:

- `k6` -> `performance/k6/contacts-api.js`
- `k6-llm` -> `performance/k6/llm-stream.js`

Both target:

- `http://nginx/api/contacts` when run inside Docker Compose
- `http://nginx/api/llm/prompt/stream` when run inside Docker Compose

## Override target base URL

You can override the base URL when needed:

```bash
docker compose --profile perf run --rm -e BASE_URL=http://nginx k6
docker compose --profile perf run --rm -e BASE_URL=http://nginx -e LLM_CONTACT_PREFIX="Perf LLM User" k6-llm
```

Or from host (if k6 is installed locally):

```bash
k6 run -e BASE_URL=http://localhost:8080 performance/k6/contacts-api.js
k6 run -e BASE_URL=http://localhost:8080 -e LLM_CONTACT_PREFIX="Perf LLM User" performance/k6/llm-stream.js
```

## What is measured

Contacts scenario performs a repeated CRUD lifecycle:

1. Create contact
2. List contacts
3. Get created contact
4. Update created contact
5. Delete created contact

Default checks and thresholds:

- Error rate: `<1%`
- 95th percentile latency: `<500ms`
- Check success rate: `>99%`

LLM scenario performs repeated prompt-streaming CRUD operations and validates that:

- Create contact via LLM prompt
- Read contact via LLM prompt
- Update contact via LLM prompt
- Delete contact via LLM prompt
- Verify each operation by querying Contacts API state
- Ensure stream format and terminal behavior are valid

Default checks and thresholds:

- Error rate: `<5%`
- 95th percentile latency: `<15000ms`
- Check success rate: `>95%`
