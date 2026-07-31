"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { parseBarkLink } from "./bark-links";

type Device = {
  id: string;
  name: string;
  key: string;
};

type BarkServer = {
  id: string;
  name: string;
  url: string;
  devices: Device[];
};

type StoredConfig = {
  version: 2;
  activeServerId: string;
  servers: BarkServer[];
};

type Notice = {
  type: "success" | "error";
  text: string;
};

const STORAGE_KEY = "bark-console-config-v1";

const DEFAULT_CONFIG: StoredConfig = {
  version: 2,
  activeServerId: "",
  servers: [],
};

const SOUNDS = [
  ["", "默认铃声"],
  ["alarm", "Alarm"],
  ["anticipate", "Anticipate"],
  ["bell", "Bell"],
  ["birdsong", "Birdsong"],
  ["calypso", "Calypso"],
  ["chime", "Chime"],
  ["electronic", "Electronic"],
  ["glass", "Glass"],
  ["minuet", "Minuet"],
  ["multiwayinvitation", "Multiway Invitation"],
  ["newmail", "New Mail"],
  ["newsflash", "News Flash"],
  ["noir", "Noir"],
  ["paymentsuccess", "Payment Success"],
  ["shake", "Shake"],
  ["sherwoodforest", "Sherwood Forest"],
  ["silence", "静音"],
];

const LEVELS = [
  ["active", "主动提醒", "立即亮屏并显示通知"],
  ["timeSensitive", "时效性通知", "可在专注模式下显示"],
  ["passive", "静默通知", "仅加入通知中心"],
  ["critical", "重要警告", "静音模式下仍可响铃"],
];

type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
};

function SelectMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, []);

  return (
    <div className="select-menu-field" ref={rootRef}>
      <button
        type="button"
        className="select-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>{selected.label}</strong>
          {selected.description && <small>{selected.description}</small>}
        </span>
        <span className={`select-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="select-menu-popover" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? "selected" : ""}
                key={option.value || "default"}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="select-option-dot" />
                <span className="select-option-copy">
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <span className="select-option-check">{isSelected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanServerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function maskKey(key: string) {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 5)}••••••${key.slice(-4)}`;
}

export default function Home() {
  const [config, setConfig] = useState<StoredConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [barkLinks, setBarkLinks] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [serverNameDraft, setServerNameDraft] = useState("");
  const [serverUrlDraft, setServerUrlDraft] = useState("");
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [deviceKeyDraft, setDeviceKeyDraft] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [group, setGroup] = useState("");
  const [sound, setSound] = useState("");
  const [level, setLevel] = useState("active");
  const [volume, setVolume] = useState("5");
  const [badge, setBadge] = useState("");
  const [icon, setIcon] = useState("");
  const [jumpUrl, setJumpUrl] = useState("");
  const [copy, setCopy] = useState("");
  const [autoCopy, setAutoCopy] = useState(false);
  const [isArchive, setIsArchive] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serverMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          version?: number;
          activeServerId?: string;
          servers?: BarkServer[];
        };
        if (
          (parsed.version === 1 || parsed.version === 2) &&
          Array.isArray(parsed.servers)
        ) {
          const servers = parsed.servers.filter(
            (server) => !(server.id === "official" && server.devices.length === 0),
          );
          const activeServerId = servers.some(
            (server) => server.id === parsed.activeServerId,
          )
            ? String(parsed.activeServerId)
            : (servers[0]?.id ?? "");
          setConfig({ version: 2, activeServerId, servers });
        }
      }
    } catch {
      setNotice({ type: "error", text: "本地配置读取失败，已使用默认设置。" });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config, ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function closeServerMenu(event: MouseEvent) {
      if (
        serverMenuRef.current &&
        !serverMenuRef.current.contains(event.target as Node)
      ) {
        setServerMenuOpen(false);
      }
    }

    function closeServerMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setServerMenuOpen(false);
    }

    document.addEventListener("mousedown", closeServerMenu);
    document.addEventListener("keydown", closeServerMenuWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeServerMenu);
      document.removeEventListener("keydown", closeServerMenuWithKeyboard);
    };
  }, []);

  const activeServer =
    config.servers.find((server) => server.id === config.activeServerId) ??
    config.servers[0];

  const selectedDevices = useMemo(
    () =>
      activeServer?.devices.filter((device) =>
        selectedDeviceIds.includes(device.id),
      ) ?? [],
    [activeServer, selectedDeviceIds],
  );

  function updateActiveServer(updater: (server: BarkServer) => BarkServer) {
    setConfig((current) => ({
      ...current,
      servers: current.servers.map((server) =>
        server.id === current.activeServerId ? updater(server) : server,
      ),
    }));
  }

  function importBarkLinks(event: FormEvent) {
    event.preventDefault();
    const lines = barkLinks
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed: Array<{ serverUrl: string; key: string }> = [];
    const errors: string[] = [];
    lines.forEach((line, index) => {
      try {
        parsed.push(parseBarkLink(line));
      } catch (error) {
        errors.push(
          `第 ${index + 1} 行：${error instanceof Error ? error.message : "格式错误"}`,
        );
      }
    });
    if (errors.length > 0) {
      setNotice({ type: "error", text: errors[0] });
      return;
    }

    let added = 0;
    let duplicates = 0;
    let firstTargetServerId = "";
    const newDeviceIds: string[] = [];
    const servers = config.servers.map((server) => ({
      ...server,
      devices: [...server.devices],
    }));
    parsed.forEach(({ serverUrl: parsedServerUrl, key }) => {
      let server = servers.find(
        (item) => cleanServerUrl(item.url) === cleanServerUrl(parsedServerUrl),
      );
      if (!server) {
        server = {
          id: makeId(),
          name: "未命名服务器",
          url: parsedServerUrl,
          devices: [],
        };
        servers.push(server);
      }
      if (!firstTargetServerId) firstTargetServerId = server.id;
      if (server.devices.some((device) => device.key === key)) {
        duplicates += 1;
        return;
      }
      const device = { id: makeId(), name: "未命名设备", key };
      server.devices.push(device);
      newDeviceIds.push(device.id);
      added += 1;
    });
    setConfig({
      version: 2,
      servers,
      activeServerId: firstTargetServerId || config.activeServerId,
    });
    setSelectedDeviceIds(newDeviceIds);
    setBarkLinks("");
    setNotice({
      type: "success",
      text:
        duplicates > 0
          ? `已导入 ${added} 个设备，跳过 ${duplicates} 个重复 Key`
          : `已导入 ${added} 个设备`,
    });
  }

  function removeDevice(device: Device) {
    if (!window.confirm(`从此浏览器移除「${device.name}」？`)) return;
    updateActiveServer((server) => ({
      ...server,
      devices: server.devices.filter((item) => item.id !== device.id),
    }));
    setSelectedDeviceIds((ids) => ids.filter((id) => id !== device.id));
  }

  function addServer(event: FormEvent) {
    event.preventDefault();
    const name = serverName.trim() || "未命名服务器";
    const url = cleanServerUrl(serverUrl);
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setNotice({ type: "error", text: "请输入完整的服务器地址，例如 https://api.day.app" });
      return;
    }
    const id = makeId();
    setConfig((current) => ({
      ...current,
      activeServerId: id,
      servers: [...current.servers, { id, name, url, devices: [] }],
    }));
    setServerName("");
    setServerUrl("");
    setNotice({ type: "success", text: `已添加「${name}」` });
  }

  function removeServer(server: BarkServer) {
    if (!window.confirm(`删除「${server.name}」及其 ${server.devices.length} 个本地设备配置？`)) {
      return;
    }
    const remaining = config.servers.filter((item) => item.id !== server.id);
    setConfig({
      ...config,
      servers: remaining,
      activeServerId:
        config.activeServerId === server.id
          ? (remaining[0]?.id ?? "")
          : config.activeServerId,
    });
  }

  function startEditingServer(server: BarkServer) {
    setEditingServerId(server.id);
    setServerNameDraft(server.name);
    setServerUrlDraft(server.url);
  }

  function saveServerEdit(serverId: string) {
    const name = serverNameDraft.trim() || "未命名服务器";
    const url = cleanServerUrl(serverUrlDraft);
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setNotice({ type: "error", text: "请输入有效的 HTTP 或 HTTPS 服务器地址。" });
      return;
    }
    setConfig((current) => ({
      ...current,
      servers: current.servers.map((server) =>
        server.id === serverId ? { ...server, name, url } : server,
      ),
    }));
    setEditingServerId(null);
    setNotice({ type: "success", text: "服务器信息已更新。" });
  }

  function startEditingDevice(device: Device) {
    setEditingDeviceId(device.id);
    setDeviceNameDraft(device.name);
    setDeviceKeyDraft(device.key);
  }

  function saveDeviceEdit(deviceId: string) {
    const name = deviceNameDraft.trim() || "未命名设备";
    const key = deviceKeyDraft.trim().replace(/^\/+|\/+$/g, "");
    if (!key) {
      setNotice({ type: "error", text: "Device Key 不能为空。" });
      return;
    }
    if (
      activeServer?.devices.some(
        (device) => device.id !== deviceId && device.key === key,
      )
    ) {
      setNotice({ type: "error", text: "当前服务器已经存在这个 Device Key。" });
      return;
    }
    updateActiveServer((server) => ({
      ...server,
      devices: server.devices.map((device) =>
        device.id === deviceId ? { ...device, name, key } : device,
      ),
    }));
    setEditingDeviceId(null);
    setNotice({ type: "success", text: "设备信息已更新。" });
  }

  function toggleDevice(id: string) {
    setSelectedDeviceIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  async function sendPush(event: FormEvent) {
    event.preventDefault();
    if (!activeServer || selectedDevices.length === 0 || !body.trim()) return;
    setSending(true);
    setNotice(null);

    const payloadBase: Record<string, string | number | boolean> = {
      level,
      [useMarkdown ? "markdown" : "body"]: body.trim(),
    };
    if (title.trim()) payloadBase.title = title.trim();
    if (subtitle.trim()) payloadBase.subtitle = subtitle.trim();
    if (group.trim()) payloadBase.group = group.trim();
    if (sound) payloadBase.sound = sound;
    if (level === "critical") payloadBase.volume = volume;
    if (badge) payloadBase.badge = Number(badge);
    if (icon.trim()) payloadBase.icon = icon.trim();
    if (jumpUrl.trim()) payloadBase.url = jumpUrl.trim();
    if (copy.trim()) payloadBase.copy = copy.trim();
    if (autoCopy) payloadBase.autoCopy = 1;
    if (isArchive) payloadBase.isArchive = 1;

    try {
      const results = await Promise.allSettled(
        selectedDevices.map(async (device) => {
          const response = await fetch("/api/bark/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              server_url: cleanServerUrl(activeServer.url),
              payload: { ...payloadBase, device_key: device.key },
            }),
          });
          const result = (await response.json().catch(() => null)) as
            | { code?: number; message?: string }
            | null;
          if (!response.ok || (result?.code !== undefined && result.code !== 200)) {
            throw new Error(result?.message || `HTTP ${response.status}`);
          }
          return device.name;
        }),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled");
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const firstFailure =
        failures[0]?.reason instanceof Error
          ? failures[0].reason.message
          : "未知错误";
      if (failures.length === 0) {
        setNotice({
          type: "success",
          text: `已发送给 ${succeeded.length} 个设备`,
        });
      } else if (succeeded.length === 0) {
        setNotice({
          type: "error",
          text: `发送失败：${firstFailure}`,
        });
      } else {
        setNotice({
          type: "error",
          text: `${succeeded.length} 个成功，${failures.length} 个失败：${firstFailure}`,
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "发送失败，请稍后重试。",
      });
    } finally {
      setSending(false);
    }
  }

  function exportConfig() {
    if (
      !window.confirm(
        "导出的 JSON 包含明文 Device Key。请妥善保管，不要上传到网盘或发给他人。继续导出？",
      )
    ) {
      return;
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bark-console-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importConfig(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          version?: number;
          activeServerId?: string;
          servers?: BarkServer[];
        };
        if (
          (parsed.version !== 1 && parsed.version !== 2) ||
          !Array.isArray(parsed.servers)
        ) {
          throw new Error();
        }
        setConfig({
          version: 2,
          servers: parsed.servers,
          activeServerId:
            parsed.servers.find((server) => server.id === parsed.activeServerId)
              ?.id ??
            parsed.servers[0]?.id ??
            "",
        });
        setNotice({ type: "success", text: "配置已从备份恢复。" });
      } catch {
        setNotice({ type: "error", text: "备份文件格式不正确。" });
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!window.confirm("确定清除本浏览器中的全部服务器和 Device Key？此操作无法撤销。")) {
      return;
    }
    setConfig(DEFAULT_CONFIG);
    setSelectedDeviceIds([]);
    localStorage.removeItem(STORAGE_KEY);
    setNotice({ type: "success", text: "本地配置已清除。" });
  }

  if (!ready) {
    return (
      <main className="boot">
        <div className="boot-mark">B</div>
        <p>正在读取本地配置…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">B</span>
          <div>
            <strong>Bark Console</strong>
            <span>把通知送到你的设备</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="privacy-pill">
            <span className="privacy-dot" />
            数据仅在此浏览器
          </span>
          <button className="icon-button" onClick={() => setShowSettings(true)}>
            <span aria-hidden="true">⚙</span>
            <span>设置</span>
          </button>
        </div>
      </header>

      <div className="local-warning" role="note">
        <span className="warning-icon">!</span>
        <div>
          <strong>Device Key 只保存在当前浏览器，容易丢失</strong>
          <p>清理浏览器数据、使用无痕模式或更换设备后都无法恢复。建议添加完成后立即导出备份。</p>
        </div>
        <button onClick={exportConfig}>导出备份</button>
      </div>

      <div className="workspace">
        <aside className="device-panel">
          <div className="panel-heading">
            <div className="server-select" ref={serverMenuRef}>
              <span className="eyebrow">当前服务器</span>
              <button
                className="server-select-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={serverMenuOpen}
                onClick={() =>
                  config.servers.length
                    ? setServerMenuOpen((open) => !open)
                    : setShowSettings(true)
                }
              >
                <span>{activeServer?.name ?? "尚未添加服务器"}</span>
                {config.servers.length > 0 && (
                  <span className={`select-chevron ${serverMenuOpen ? "open" : ""}`} />
                )}
              </button>
              {serverMenuOpen && config.servers.length > 0 && (
                <div
                  className="server-select-menu"
                  role="listbox"
                  aria-label="选择 Bark 服务器"
                >
                  {config.servers.map((server) => {
                    const selected = server.id === activeServer?.id;
                    return (
                      <button
                        key={server.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? "selected" : ""}
                        onClick={() => {
                          setConfig((current) => ({
                            ...current,
                            activeServerId: server.id,
                          }));
                          setServerMenuOpen(false);
                        }}
                      >
                        <span className="server-option-mark">
                          {server.name.slice(0, 1)}
                        </span>
                        <span className="server-option-copy">
                          <strong>{server.name}</strong>
                          <small>{server.devices.length} 个设备</small>
                        </span>
                        <span className="server-option-check">
                          {selected ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    className="server-menu-manage"
                    type="button"
                    onClick={() => {
                      setServerMenuOpen(false);
                      setShowSettings(true);
                    }}
                  >
                    <span>＋</span>
                    添加或管理服务器
                  </button>
                </div>
              )}
            </div>
            <button
              className="small-ghost"
              onClick={() => setShowSettings(true)}
              aria-label="管理服务器"
            >
              编辑
            </button>
          </div>
          <div className="server-address">
            {activeServer?.url ?? "粘贴 Bark 推送链接即可自动添加"}
          </div>

          <div className="devices-title">
            <div>
              <h2>接收设备</h2>
              <span>{activeServer?.devices.length ?? 0} 个设备</span>
            </div>
            {activeServer && activeServer.devices.length > 0 && (
              <button
                className="text-button"
                onClick={() =>
                  setSelectedDeviceIds(
                    selectedDeviceIds.length === activeServer.devices.length
                      ? []
                      : activeServer.devices.map((device) => device.id),
                  )
                }
              >
                {selectedDeviceIds.length === activeServer.devices.length
                  ? "取消全选"
                  : "全选"}
              </button>
            )}
          </div>

          <div className="device-list">
            {activeServer?.devices.length ? (
              activeServer.devices.map((device) => {
                const checked = selectedDeviceIds.includes(device.id);
                return (
                  <button
                    key={device.id}
                    className={`device-card ${checked ? "selected" : ""}`}
                    onClick={() => toggleDevice(device.id)}
                  >
                    <span className="device-check">{checked ? "✓" : ""}</span>
                    <span className="device-avatar">
                      {device.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="device-copy">
                      <strong>{device.name}</strong>
                      <span>{maskKey(device.key)}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="empty-state">
                <span className="empty-phone">↗</span>
                <strong>{activeServer ? "还没有接收设备" : "从 Bark 链接开始"}</strong>
                <p>
                  {activeServer
                    ? "导入包含 Device Key 的完整链接，即可添加到当前服务器。"
                    : "下面粘贴 Bark App 中复制的推送链接，服务器和设备会自动创建。"}
                </p>
              </div>
            )}
          </div>

          <form className="add-device import-links" onSubmit={importBarkLinks}>
            <h3>导入 Bark 链接</h3>
            <label>
              <span>每行一个完整推送链接</span>
              <textarea
                value={barkLinks}
                onChange={(event) => setBarkLinks(event.target.value)}
                placeholder={
                  "https://bark.example.com/DeviceKey/推送内容\nhttps://api.day.app/AnotherKey/推送内容"
                }
                autoComplete="off"
                required
              />
            </label>
            <p>自动解析服务器与 Device Key，链接中的推送内容不会保存。</p>
            <button className="secondary-button" type="submit">
              <span>＋</span> {barkLinks.includes("\n") ? "批量导入" : "解析并添加"}
            </button>
          </form>
        </aside>

        <section className="composer-panel">
          <div className="composer-heading">
            <div>
              <span className="eyebrow">新通知</span>
              <h1>发送一条 Bark 通知</h1>
              <p>
                {selectedDevices.length
                  ? `将发送给：${selectedDevices.map((device) => device.name).join("、")}`
                  : "请先从左侧选择一个或多个接收设备"}
              </p>
            </div>
            <span className={`status-badge ${selectedDevices.length ? "ready" : ""}`}>
              {selectedDevices.length ? `${selectedDevices.length} 个设备` : "未选择设备"}
            </span>
          </div>

          <form className="composer-form" onSubmit={sendPush}>
            <div className="field-row">
              <label className="field">
                <span>通知标题 <em>可选</em></span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：服务器状态更新"
                />
              </label>
              <label className="field">
                <span>副标题 <em>可选</em></span>
                <input
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  placeholder="显示在标题与正文之间"
                />
              </label>
            </div>

            <div className="field-row compact-row">
              <label className="field">
                <span>通知分组 <em>可选</em></span>
                <input
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                  placeholder="例如：运维告警"
                />
              </label>
              <div className="field format-field">
                <span>
                  内容格式 <em>支持基础 Markdown</em>
                </span>
                <div className="format-picker" role="group" aria-label="通知内容格式">
                  <button
                    type="button"
                    className={!useMarkdown ? "active" : ""}
                    onClick={() => setUseMarkdown(false)}
                    aria-pressed={!useMarkdown}
                  >
                    纯文本
                  </button>
                  <button
                    type="button"
                    className={useMarkdown ? "active" : ""}
                    onClick={() => setUseMarkdown(true)}
                    aria-pressed={useMarkdown}
                  >
                    Markdown
                  </button>
                </div>
              </div>
            </div>

            <label className="field message-field">
              <span>{useMarkdown ? "Markdown 内容" : "通知内容"}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={
                  useMarkdown
                    ? "例如：**构建成功**\n\n- 版本：v1.2.0\n- 环境：生产"
                    : "写下你想发送的内容…"
                }
                maxLength={1000}
                required
              />
              <small>{body.length} / 1000</small>
            </label>

            <div className="field-row">
              <label className="field">
                <span>提醒级别</span>
                <SelectMenu
                  label="提醒级别"
                  value={level}
                  onChange={setLevel}
                  options={LEVELS.map(([value, label, description]) => ({
                    value,
                    label,
                    description,
                  }))}
                />
              </label>
              <label className="field">
                <span>通知铃声</span>
                <SelectMenu
                  label="通知铃声"
                  value={sound}
                  onChange={setSound}
                  options={SOUNDS.map(([value, label]) => ({
                    value,
                    label,
                    description: value
                      ? value === "silence"
                        ? "不播放提示音"
                        : `系统铃声 · ${value}`
                      : "使用 Bark 默认设置",
                  }))}
                />
              </label>
            </div>

            {level === "critical" && (
              <label className="volume-field">
                <span>
                  <strong>重要警告音量</strong>
                  <small>即使设备处于静音模式也会响铃</small>
                </span>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={volume}
                  onChange={(event) => setVolume(event.target.value)}
                  aria-label="重要警告音量"
                />
                <output>{volume} / 10</output>
              </label>
            )}

            <button
              className="advanced-toggle"
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-expanded={showAdvanced}
            >
              <span>高级选项</span>
              <span>{showAdvanced ? "−" : "＋"}</span>
            </button>

            {showAdvanced && (
              <div className="advanced-grid">
                <label className="field">
                  <span>角标数字</span>
                  <input
                    value={badge}
                    onChange={(event) => setBadge(event.target.value)}
                    type="number"
                    min="0"
                    placeholder="例如：1"
                  />
                </label>
                <label className="field">
                  <span>图标 URL</span>
                  <input
                    value={icon}
                    onChange={(event) => setIcon(event.target.value)}
                    type="url"
                    placeholder="https://…"
                  />
                </label>
                <label className="field">
                  <span>点击跳转 URL</span>
                  <input
                    value={jumpUrl}
                    onChange={(event) => setJumpUrl(event.target.value)}
                    placeholder="https://… 或自定义 Scheme"
                  />
                </label>
                <label className="field">
                  <span>复制内容</span>
                  <input
                    value={copy}
                    onChange={(event) => setCopy(event.target.value)}
                    placeholder="长按通知时复制"
                  />
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={autoCopy}
                    onChange={(event) => setAutoCopy(event.target.checked)}
                  />
                  <span>收到通知时自动复制</span>
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={isArchive}
                    onChange={(event) => setIsArchive(event.target.checked)}
                  />
                  <span>保存到 Bark 历史记录</span>
                </label>
              </div>
            )}

            <div className="send-row">
              <p>通知内容将直接发送到当前 Bark 服务器。</p>
              <button
                className="primary-button"
                type="submit"
                disabled={sending || !body.trim() || selectedDevices.length === 0}
              >
                <span>{sending ? "发送中…" : "发送通知"}</span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {showSettings && (
        <div className="modal-backdrop" onMouseDown={() => setShowSettings(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">本地配置</span>
                <h2 id="settings-title">服务器与设备</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowSettings(false)}
                aria-label="关闭设置"
              >
                ×
              </button>
            </div>

            <div className="settings-section">
              <h3>服务器</h3>
              <div className="server-list">
                {config.servers.map((server) =>
                  editingServerId === server.id ? (
                    <div className="edit-card" key={server.id}>
                      <label>
                        <span>服务器名称</span>
                        <input
                          value={serverNameDraft}
                          onChange={(event) => setServerNameDraft(event.target.value)}
                          placeholder="未命名服务器"
                        />
                      </label>
                      <label>
                        <span>服务器地址</span>
                        <input
                          value={serverUrlDraft}
                          onChange={(event) => setServerUrlDraft(event.target.value)}
                          placeholder="https://bark.example.com"
                        />
                      </label>
                      <div className="edit-actions">
                        <button
                          className="secondary-button"
                          onClick={() => setEditingServerId(null)}
                        >
                          取消
                        </button>
                        <button
                          className="save-button"
                          onClick={() => saveServerEdit(server.id)}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`server-item ${
                        server.id === activeServer?.id ? "current" : ""
                      }`}
                      key={server.id}
                    >
                      <button
                        className="server-avatar"
                        onClick={() =>
                          setConfig((current) => ({
                            ...current,
                            activeServerId: server.id,
                          }))
                        }
                        aria-label={`切换到 ${server.name}`}
                      >
                        {server.name.slice(0, 1)}
                      </button>
                      <div>
                        <strong>{server.name}</strong>
                        <span>
                          {server.url} · {server.devices.length} 个设备
                        </span>
                      </div>
                      <button
                        className="edit-text"
                        onClick={() => startEditingServer(server)}
                      >
                        编辑
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => removeServer(server)}
                      >
                        删除
                      </button>
                    </div>
                  ),
                )}
                {config.servers.length === 0 && (
                  <div className="settings-empty">
                    <strong>还没有服务器</strong>
                    <span>从左侧粘贴完整 Bark 链接，或在下方手动添加。</span>
                  </div>
                )}
              </div>
              <form className="inline-form" onSubmit={addServer}>
                <input
                  value={serverName}
                  onChange={(event) => setServerName(event.target.value)}
                  placeholder="名称（可选）"
                />
                <input
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder="https://bark.example.com"
                  type="url"
                  required
                />
                <button type="submit">添加服务器</button>
              </form>
              <p className="settings-help">
                Device Key 属于服务器实例。更换服务器后，请在 Bark App 中重新注册并添加新 Key。
              </p>
            </div>

            <div className="settings-section">
              <div className="section-title-row">
                <h3>当前服务器的设备</h3>
                <span>{activeServer?.name ?? "尚未选择服务器"}</span>
              </div>
              <div className="manage-device-list">
                {activeServer?.devices.map((device) =>
                  editingDeviceId === device.id ? (
                    <div className="edit-card device-edit-card" key={device.id}>
                      <label>
                        <span>设备名称</span>
                        <input
                          value={deviceNameDraft}
                          onChange={(event) => setDeviceNameDraft(event.target.value)}
                          placeholder="未命名设备"
                        />
                      </label>
                      <label>
                        <span>Device Key</span>
                        <input
                          value={deviceKeyDraft}
                          onChange={(event) => setDeviceKeyDraft(event.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <div className="edit-actions">
                        <button
                          className="secondary-button"
                          onClick={() => setEditingDeviceId(null)}
                        >
                          取消
                        </button>
                        <button
                          className="save-button"
                          onClick={() => saveDeviceEdit(device.id)}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="manage-device" key={device.id}>
                      <span className="device-avatar">
                        {device.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{device.name}</strong>
                        <code>{showKeys[device.id] ? device.key : maskKey(device.key)}</code>
                      </div>
                      <button
                        onClick={() =>
                          setShowKeys((current) => ({
                            ...current,
                            [device.id]: !current[device.id],
                          }))
                        }
                      >
                        {showKeys[device.id] ? "隐藏" : "显示"}
                      </button>
                      <button
                        className="edit-text"
                        onClick={() => startEditingDevice(device)}
                      >
                        编辑
                      </button>
                      <button className="danger-text" onClick={() => removeDevice(device)}>
                        移除
                      </button>
                    </div>
                  ),
                )}
                {!activeServer?.devices.length && (
                  <p className="settings-help">当前服务器还没有保存设备。</p>
                )}
              </div>
            </div>

            <div className="settings-footer">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={importConfig}
                hidden
              />
              <button className="secondary-button" onClick={exportConfig}>
                导出备份
              </button>
              <button
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                导入备份
              </button>
              <button className="danger-button" onClick={clearAllData}>
                清除全部本地数据
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className={`toast ${notice.type}`} role="status">
          <span>{notice.type === "success" ? "✓" : "!"}</span>
          {notice.text}
        </div>
      )}
    </main>
  );
}
