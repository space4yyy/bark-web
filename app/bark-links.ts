export function parseBarkLink(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅支持 HTTP 或 HTTPS 链接");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("链接中缺少 Device Key");
  }
  const key = decodeURIComponent(segments[0]).trim();
  if (
    !key ||
    key === "push" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(key)
  ) {
    throw new Error("无法从链接中识别 Device Key");
  }
  return {
    serverUrl: url.origin,
    key,
  };
}

export function defaultServerName(serverUrl: string) {
  return new URL(serverUrl).host;
}

export function parseBarkImportLine(value: string) {
  if (!value || value !== value.trim()) {
    throw new Error("行首和行尾不能有空格");
  }
  if (/[\t\u00a0]/.test(value) || value.includes("  ")) {
    throw new Error("设备名和链接之间只能使用一个半角空格");
  }

  const parts = value.split(" ");
  if (parts.length > 2) {
    throw new Error("设备名和链接之间只能使用一个半角空格");
  }

  const [first, second] = parts;
  const hasDeviceName = second !== undefined;
  const deviceName = hasDeviceName ? first : "未命名设备";
  const link = hasDeviceName ? second : first;
  if (!deviceName || !link) {
    throw new Error("设备名或 Bark 链接为空");
  }

  return {
    ...parseBarkLink(link),
    deviceName,
  };
}
