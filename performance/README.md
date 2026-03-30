# Performance Testing

This folder contains k6 load tests for the Digital Phone Book API.

## Prerequisites

- Docker and Docker Compose
- Running stack (`backend`, `frontend`, `nginx`, `db`, `llm`)

## Run via Docker Compose profile

From repository root:

```bash
docker compose --profile perf run --rm k6
```

This runs `performance/k6/contacts-api.js` and targets:

- `http://nginx/api/contacts` when run inside Docker Compose

## Override target base URL

You can override the base URL when needed:

```bash
docker compose --profile perf run --rm -e BASE_URL=http://nginx k6
```

Or from host (if k6 is installed locally):

```bash
k6 run -e BASE_URL=http://localhost:8080 performance/k6/contacts-api.js
```

## What is measured

The scenario performs a repeated CRUD lifecycle:

1. Create contact
2. List contacts
3. Get created contact
4. Update created contact
5. Delete created contact

Default checks and thresholds:

- Error rate: `<1%`
- 95th percentile latency: `<500ms`
- Check success rate: `>99%`
