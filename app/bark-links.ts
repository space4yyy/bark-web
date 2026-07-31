export function parseBarkLink(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅支持 HTTP 或 HTTPS 链接");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("链接中缺少 Device Key");
  }
  const key = decodeURIComponent(segments[0]).trim();
  if (!key || key === "push") {
    throw new Error("无法从链接中识别 Device Key");
  }
  return {
    serverUrl: url.origin,
    key,
  };
}
