type Fetcher = (request: Request) => Promise<Response>;

type BarkProxyBody = {
  server_url?: unknown;
  payload?: unknown;
};

const MAX_REQUEST_BYTES = 64 * 1024;

function jsonError(status: number, message: string) {
  return Response.json({ code: status, message }, { status });
}

function requestMessage(request: Request, zh: string, en: string) {
  return request.headers.get("accept-language")?.toLowerCase().startsWith("zh")
    ? zh
    : en;
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

function hasValidPayload(payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const value = payload as Record<string, unknown>;
  const hasMessage =
    typeof value.body === "string" || typeof value.markdown === "string";
  return typeof value.device_key === "string" && hasMessage;
}

export async function handleBarkProxyRequest(
  request: Request,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, requestMessage(request, "仅支持 POST 请求。", "Only POST requests are supported."));
  }

  const requestUrl = new URL(request.url);
  const isLocal = isLocalHostname(requestUrl.hostname);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return jsonError(403, requestMessage(request, "请求来源无效。", "The request origin is invalid."));
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError(413, requestMessage(request, "通知内容过大。", "The notification payload is too large."));
  }

  let body: BarkProxyBody;
  try {
    body = (await request.json()) as BarkProxyBody;
  } catch {
    return jsonError(400, requestMessage(request, "请求内容不是有效的 JSON。", "The request body is not valid JSON."));
  }

  if (typeof body.server_url !== "string" || !hasValidPayload(body.payload)) {
    return jsonError(400, requestMessage(request, "服务器地址或通知内容不完整。", "The server URL or notification payload is incomplete."));
  }

  let serverUrl: URL;
  try {
    serverUrl = new URL(body.server_url);
  } catch {
    return jsonError(400, requestMessage(request, "Bark 服务器地址无效。", "The Bark server URL is invalid."));
  }

  if (!["http:", "https:"].includes(serverUrl.protocol)) {
    return jsonError(400, requestMessage(request, "Bark 服务器仅支持 HTTP 或 HTTPS。", "Bark servers must use HTTP or HTTPS."));
  }
  if (serverUrl.username || serverUrl.password || serverUrl.search || serverUrl.hash) {
    return jsonError(400, requestMessage(request, "服务器地址不能包含账号、查询参数或锚点。", "The server URL cannot contain credentials, query parameters, or a fragment."));
  }
  if (!isLocal && (serverUrl.protocol !== "https:" || isPrivateHostname(serverUrl.hostname))) {
    return jsonError(400, requestMessage(request, "线上版本仅支持可公开访问的 HTTPS Bark 服务器。", "The hosted version only supports publicly reachable HTTPS Bark servers."));
  }

  const targetUrl = `${serverUrl.toString().replace(/\/+$/, "")}/push`;
  try {
    const upstream = await fetcher(
      new Request(targetUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body.payload),
      }),
    );
    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return jsonError(502, requestMessage(request, "无法连接 Bark 服务器，请检查地址、HTTPS 和网络可达性。", "The Bark server could not be reached. Check the URL, HTTPS, and network access."));
  }
}
