import { check, sleep } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:8080";
const contactPrefix = __ENV.LLM_CONTACT_PREFIX || "Perf LLM User";

export const options = {
  scenarios: {
    llm_stream: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 1 },
        { duration: "1m", target: 3 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<15000"],
    checks: ["rate>0.95"],
  },
};

function parseNdjson(body) {
  const chunks = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      chunks.push(JSON.parse(trimmed));
    } catch {
      chunks.push({ type: "invalid_json", raw: trimmed });
    }
  }
  return chunks;
}

function runStreamPrompt(prompt, operation) {
  const payload = JSON.stringify({
    prompt,
  });

  const response = http.post(`${baseUrl}/api/llm/prompt/stream`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { endpoint: "llm_stream", operation },
  });

  const contentType = response.headers["Content-Type"] || "";
  const chunks = parseNdjson(response.body || "");

  const hasErrorChunk = chunks.some((chunk) => chunk.type === "error");
  const hasInvalidJsonChunk = chunks.some(
    (chunk) => chunk.type === "invalid_json",
  );
  const hasTerminalChunk = chunks.some(
    (chunk) => chunk.type === "done" || chunk.type === "error",
  );

  const streamOk = check(response, {
    [`${operation} stream status is 200`]: (r) => r.status === 200,
    [`${operation} stream content type is ndjson`]: () =>
      contentType.includes("application/x-ndjson"),
    [`${operation} stream returns chunks`]: () => chunks.length > 0,
    [`${operation} stream has terminal chunk`]: () => hasTerminalChunk,
    [`${operation} stream has no error chunk`]: () => !hasErrorChunk,
    [`${operation} stream has no invalid json`]: () => !hasInvalidJsonChunk,
  });

  return { streamOk, response };
}

function listContacts() {
  const response = http.get(`${baseUrl}/api/contacts`, {
    tags: { endpoint: "contacts_verify_list" },
  });
  if (response.status !== 200) {
    return [];
  }

  try {
    return response.json();
  } catch {
    return [];
  }
}

function findContactByName(name) {
  const contacts = listContacts();
  return contacts.find((contact) => contact.name === name);
}

function findContactByNameWithRetries(name, retries = 6, delaySeconds = 0.25) {
  for (let i = 0; i < retries; i += 1) {
    const found = findContactByName(name);
    if (found) {
      return found;
    }
    sleep(delaySeconds);
  }

  return null;
}

function getContactByIdWithRetries(
  contactId,
  retries = 6,
  delaySeconds = 0.25,
) {
  for (let i = 0; i < retries; i += 1) {
    const found = getContactById(contactId);
    if (found) {
      return found;
    }
    sleep(delaySeconds);
  }

  return null;
}

function waitForContactAbsenceById(contactId, retries = 8, delaySeconds = 0.2) {
  for (let i = 0; i < retries; i += 1) {
    const found = getContactById(contactId);
    if (!found) {
      return true;
    }
    sleep(delaySeconds);
  }

  return false;
}

function updateContactViaLlm(name, contactId, updatedPhone, maxAttempts = 2) {
  let updatedContactById = null;
  let updateResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const updatePrompt = `Update the phone number of contact ${name} to ${updatedPhone}. Keep the contact name unchanged.`;
    updateResult = runStreamPrompt(updatePrompt, `update_attempt_${attempt}`);
    updatedContactById = getContactByIdWithRetries(contactId);

    if (
      updateResult.streamOk &&
      updatedContactById?.phoneNumber === updatedPhone
    ) {
      return { updateResult, updatedContactById, updated: true };
    }
  }

  return { updateResult, updatedContactById, updated: false };
}

function deleteContactViaLlm(name, contactId, maxAttempts = 2) {
  let deleteResult = null;
  const prompts = [
    `Delete contact ${name} now without confirmation.`,
    `Delete now without confirmation. Use this exact contact name: ${name}`,
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const deletePrompt = prompts[attempt - 1] || prompts[prompts.length - 1];
    deleteResult = runStreamPrompt(deletePrompt, `delete_attempt_${attempt}`);
    const isDeleted = waitForContactAbsenceById(contactId, 8, 0.2);

    if (deleteResult.streamOk && isDeleted) {
      return { deleteResult, isDeleted: true };
    }
  }

  return { deleteResult, isDeleted: false };
}

function getContactById(contactId) {
  const response = http.get(`${baseUrl}/api/contacts/${contactId}`, {
    tags: { endpoint: "contacts_verify_get" },
    responseCallback: http.expectedStatuses(200, 404),
  });

  if (response.status !== 200) {
    return null;
  }

  try {
    return response.json();
  } catch {
    return null;
  }
}

export default function () {
  const suffix = `${Date.now()}${__VU}${__ITER}`;
  const originalName = `${contactPrefix}${suffix}`;
  const originalPhone = `555${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
  const updatedPhone = `556${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;

  const createPrompt = `Create a new contact named ${originalName} with phone number ${originalPhone}.`;
  const createResult = runStreamPrompt(createPrompt, "create");
  const createdContact = findContactByNameWithRetries(originalName);

  const createChecksPassed = check(createResult.response, {
    "create contact exists after llm prompt": () => Boolean(createdContact),
  });

  if (!createResult.streamOk || !createChecksPassed || !createdContact?.id) {
    sleep(1);
    return;
  }

  const readPrompt = `Find contact ${originalName} and show the details.`;
  const readResult = runStreamPrompt(readPrompt, "read");
  const readBackContact = getContactById(createdContact.id);
  check(readResult.response, {
    "readback contact is retrievable": () => Boolean(readBackContact),
  });

  const { updateResult, updatedContactById, updated } = updateContactViaLlm(
    originalName,
    createdContact.id,
    updatedPhone,
  );
  check(updateResult?.response, {
    "updated contact exists": () => Boolean(updatedContactById),
    "updated phone is applied": () => updated,
  });

  if (!updateResult?.streamOk || !updatedContactById?.id) {
    sleep(1);
    return;
  }

  const { deleteResult, isDeleted } = deleteContactViaLlm(
    originalName,
    createdContact.id,
  );
  check(deleteResult?.response, {
    "deleted contact no longer exists": () => isDeleted,
  });

  sleep(1);
}
