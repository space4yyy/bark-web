"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  version: 1;
  activeServerId: string;
  servers: BarkServer[];
};

type Notice = {
  type: "success" | "error";
  text: string;
};

const STORAGE_KEY = "bark-console-config-v1";

const DEFAULT_CONFIG: StoredConfig = {
  version: 1,
  activeServerId: "official",
  servers: [
    {
      id: "official",
      name: "Bark 官方服务器",
      url: "https://api.day.app",
      devices: [],
    },
  ],
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
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [deviceName, setDeviceName] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredConfig;
        if (parsed.version === 1 && Array.isArray(parsed.servers)) {
          setConfig(parsed);
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
    setSelectedDeviceIds([]);
  }, [config.activeServerId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  function addDevice(event: FormEvent) {
    event.preventDefault();
    const name = deviceName.trim();
    const key = deviceKey.trim().replace(/^\/+|\/+$/g, "");
    if (!name || !key || !activeServer) return;
    if (activeServer.devices.some((device) => device.key === key)) {
      setNotice({ type: "error", text: "这个 Device Key 已存在于当前服务器。" });
      return;
    }
    const device = { id: makeId(), name, key };
    updateActiveServer((server) => ({
      ...server,
      devices: [...server.devices, device],
    }));
    setSelectedDeviceIds((ids) => [...ids, device.id]);
    setDeviceName("");
    setDeviceKey("");
    setNotice({ type: "success", text: `已保存设备「${name}」` });
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
    const name = serverName.trim();
    const url = cleanServerUrl(serverUrl);
    if (!name || !url) return;
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
    setNotice({ type: "success", text: `已添加服务器「${name}」` });
  }

  function removeServer(server: BarkServer) {
    if (config.servers.length === 1) {
      setNotice({ type: "error", text: "至少需要保留一个服务器。" });
      return;
    }
    if (!window.confirm(`删除「${server.name}」及其 ${server.devices.length} 个本地设备配置？`)) {
      return;
    }
    const remaining = config.servers.filter((item) => item.id !== server.id);
    setConfig({
      ...config,
      servers: remaining,
      activeServerId:
        config.activeServerId === server.id
          ? remaining[0].id
          : config.activeServerId,
    });
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
          const response = await fetch(`${cleanServerUrl(activeServer.url)}/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payloadBase, device_key: device.key }),
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
      const failed = results.length - succeeded.length;
      if (failed === 0) {
        setNotice({
          type: "success",
          text: `已发送给 ${succeeded.length} 个设备`,
        });
      } else {
        setNotice({
          type: "error",
          text: `${succeeded.length} 个成功，${failed} 个失败。请检查服务器、Key 或跨域设置。`,
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
        const parsed = JSON.parse(String(reader.result)) as StoredConfig;
        if (
          parsed.version !== 1 ||
          !Array.isArray(parsed.servers) ||
          parsed.servers.length === 0
        ) {
          throw new Error();
        }
        setConfig(parsed);
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
            <div>
              <span className="eyebrow">当前服务器</span>
              <select
                aria-label="当前 Bark 服务器"
                value={activeServer?.id}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    activeServerId: event.target.value,
                  }))
                }
              >
                {config.servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="small-ghost"
              onClick={() => setShowSettings(true)}
              aria-label="管理服务器"
            >
              管理
            </button>
          </div>
          <div className="server-address">{activeServer?.url}</div>

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
                <strong>还没有接收设备</strong>
                <p>保存 Device Key 后，就可以在这里选择设备并发送通知。</p>
              </div>
            )}
          </div>

          <form className="add-device" onSubmit={addDevice}>
            <h3>添加设备</h3>
            <label>
              <span>用户名 / 备注</span>
              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="例如：小明的 iPhone"
                required
              />
            </label>
            <label>
              <span>Device Key</span>
              <input
                value={deviceKey}
                onChange={(event) => setDeviceKey(event.target.value)}
                placeholder="粘贴 Bark Device Key"
                type="password"
                autoComplete="off"
                required
              />
            </label>
            <button className="secondary-button" type="submit">
              <span>＋</span> 保存设备
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
                <select value={level} onChange={(event) => setLevel(event.target.value)}>
                  <option value="active">主动提醒</option>
                  <option value="timeSensitive">时效性通知</option>
                  <option value="passive">静默通知</option>
                  <option value="critical">重要警告</option>
                </select>
              </label>
              <label className="field">
                <span>通知铃声</span>
                <select value={sound} onChange={(event) => setSound(event.target.value)}>
                  {SOUNDS.map(([value, label]) => (
                    <option value={value} key={value || "default"}>
                      {label}
                    </option>
                  ))}
                </select>
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
                {config.servers.map((server) => (
                  <div className="server-item" key={server.id}>
                    <span className="server-avatar">{server.name.slice(0, 1)}</span>
                    <div>
                      <strong>{server.name}</strong>
                      <span>
                        {server.url} · {server.devices.length} 个设备
                      </span>
                    </div>
                    <button
                      className="danger-text"
                      onClick={() => removeServer(server)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              <form className="inline-form" onSubmit={addServer}>
                <input
                  value={serverName}
                  onChange={(event) => setServerName(event.target.value)}
                  placeholder="服务器名称"
                  required
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
                <span>{activeServer?.name}</span>
              </div>
              <div className="manage-device-list">
                {activeServer?.devices.map((device) => (
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
                    <button className="danger-text" onClick={() => removeDevice(device)}>
                      移除
                    </button>
                  </div>
                ))}
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
