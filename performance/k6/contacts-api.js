import { check, sleep } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  scenarios: {
    contacts_crud: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "1m", target: 15 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

function randomSuffix() {
  return `${Date.now()}-${__VU}-${__ITER}-${Math.floor(Math.random() * 100000)}`;
}

export default function () {
  const suffix = randomSuffix();
  const createPayload = JSON.stringify({
    name: `Perf User ${suffix}`,
    phoneNumber: `+1-555-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
  });

  const createRes = http.post(`${baseUrl}/api/contacts`, createPayload, {
    headers: { "Content-Type": "application/json" },
    tags: { endpoint: "create_contact" },
  });

  const createOk = check(createRes, {
    "create status is 201": (r) => r.status === 201,
    "create has id": (r) => {
      try {
        return Boolean(r.json("id"));
      } catch {
        return false;
      }
    },
  });

  if (!createOk) {
    sleep(1);
    return;
  }

  const contactId = createRes.json("id");

  const listRes = http.get(`${baseUrl}/api/contacts`, {
    tags: { endpoint: "list_contacts" },
  });
  check(listRes, {
    "list status is 200": (r) => r.status === 200,
  });

  const getRes = http.get(`${baseUrl}/api/contacts/${contactId}`, {
    tags: { endpoint: "get_contact" },
  });
  check(getRes, {
    "get status is 200": (r) => r.status === 200,
  });

  const updatePayload = JSON.stringify({
    name: `Updated Perf User ${suffix}`,
  });
  const updateRes = http.patch(
    `${baseUrl}/api/contacts/${contactId}`,
    updatePayload,
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "update_contact" },
    },
  );
  check(updateRes, {
    "update status is 200": (r) => r.status === 200,
  });

  const deleteRes = http.del(`${baseUrl}/api/contacts/${contactId}`, null, {
    tags: { endpoint: "delete_contact" },
  });
  check(deleteRes, {
    "delete status is 204": (r) => r.status === 204,
  });

  sleep(1);
}
