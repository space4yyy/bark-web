import assert from "node:assert/strict";
import test from "node:test";
import { handleBarkProxyRequest } from "../worker/bark-proxy.ts";

test("forwards Bark pushes server-side without requiring target CORS headers", async () => {
  let forwardedRequest;
  const fetcher = async (request) => {
    forwardedRequest = request;
    return Response.json({ code: 200, message: "success" });
  };
  const request = new Request("http://localhost:3000/api/bark/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      server_url: "http://localhost:4010/",
      payload: { device_key: "device-test", body: "hello" },
    }),
  });

  const response = await handleBarkProxyRequest(request, fetcher);

  assert.equal(response.status, 200);
  assert.equal(forwardedRequest.url, "http://localhost:4010/push");
  assert.equal(forwardedRequest.method, "POST");
  assert.deepEqual(await forwardedRequest.json(), {
    device_key: "device-test",
    body: "hello",
  });
});

test("rejects cross-site callers", async () => {
  const request = new Request("https://bark-console.example/api/bark/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
      "oai-authenticated-user-id": "user-1",
    },
    body: JSON.stringify({
      server_url: "https://api.day.app",
      payload: { device_key: "device-test", body: "hello" },
    }),
  });

  const response = await handleBarkProxyRequest(request, fetch);

  assert.equal(response.status, 403);
});

test("allows public same-origin callers without OpenAI identity headers", async () => {
  const fetcher = async () =>
    Response.json({ code: 200, message: "success" });
  const request = new Request(
    "https://bark-web.example/api/bark/push",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://bark-web.example",
      },
      body: JSON.stringify({
        server_url: "https://api.day.app",
        payload: { device_key: "device-test", body: "hello" },
      }),
    },
  );

  const response = await handleBarkProxyRequest(request, fetcher);

  assert.equal(response.status, 200);
});

test("blocks private network targets in production", async () => {
  const request = new Request("https://bark-console.example/api/bark/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://bark-console.example",
      "oai-authenticated-user-id": "user-1",
    },
    body: JSON.stringify({
      server_url: "http://192.168.1.20:8080",
      payload: { device_key: "device-test", body: "hello" },
    }),
  });

  const response = await handleBarkProxyRequest(request, fetch);

  assert.equal(response.status, 400);
});
