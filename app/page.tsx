"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultServerName,
  parseBarkImportLine,
} from "./bark-links";
import {
  clearComposerPreferences,
  DEFAULT_COMPOSER_PREFERENCES,
  readComposerPreferences,
  sanitizeIconLibrary,
  sanitizeSelectedIcon,
  writeComposerPreferences,
} from "./composer-preferences";

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

type ConfirmTarget =
  | { kind: "server"; server: BarkServer }
  | { kind: "device"; device: Device }
  | { kind: "icon"; url: string }
  | { kind: "clear" };

type Locale = "zh" | "en";
type IconPreviewStatus = "idle" | "loading" | "ready" | "error";

const STORAGE_KEY = "bark-console-config-v1";
const BACKUP_WARNING_KEY = "bark-console-backup-warning-dismissed-v1";
const LOCALE_KEY = "bark-console-locale-v1";

const DEFAULT_CONFIG: StoredConfig = {
  version: 2,
  activeServerId: "",
  servers: [],
};

const SOUNDS = [
  ["", "Default", "默认铃声"],
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
  ["silence", "Silence", "静音"],
];

const LEVELS = [
  ["active", "Active", "主动提醒", "Lights up the screen immediately", "立即亮屏并显示通知"],
  ["timeSensitive", "Time Sensitive", "时效性通知", "Can appear during Focus", "可在专注模式下显示"],
  ["passive", "Passive", "静默通知", "Adds the notification silently", "仅加入通知中心"],
  ["critical", "Critical", "重要警告", "Can play a sound in Silent mode", "静音模式下仍可响铃"],
];

const LINK_ERROR_EN: Record<string, string> = {
  "仅支持 HTTP 或 HTTPS 链接": "Only HTTP or HTTPS links are supported",
  "链接中缺少 Device Key": "The link does not contain a Device Key",
  "无法从链接中识别 Device Key": "A valid Device Key could not be found in the link",
  "行首和行尾不能有空格": "Leading and trailing spaces are not allowed",
  "设备名和链接之间只能使用一个半角空格":
    "Use exactly one regular space between the device name and link",
  "设备名或 Bark 链接为空": "The device name or Bark link is empty",
};

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
  const [locale, setLocale] = useState<Locale>("zh");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMobileDevices, setShowMobileDevices] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] =
    useState(false);
  const [showIconAdd, setShowIconAdd] = useState(false);
  const [editingIcons, setEditingIcons] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState("");
  const [iconPreviewStatus, setIconPreviewStatus] =
    useState<IconPreviewStatus>("idle");
  const [backupWarningDismissed, setBackupWarningDismissed] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
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
  const [iconLibrary, setIconLibrary] = useState<string[]>([]);
  const [jumpUrl, setJumpUrl] = useState("");
  const [copy, setCopy] = useState("");
  const [autoCopy, setAutoCopy] = useState(false);
  const [isArchive, setIsArchive] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serverMenuRef = useRef<HTMLDivElement>(null);

  /* Browser storage is only available after hydration, so this one-time
     initialization intentionally restores React state from localStorage. */
  /* eslint-disable react-hooks/set-state-in-effect */
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
          const servers = parsed.servers
            .filter(
              (server) =>
                !(server.id === "official" && server.devices.length === 0),
            )
            .map((server) => {
              if (server.name !== "未命名服务器") return server;
              try {
                return { ...server, name: defaultServerName(server.url) };
              } catch {
                return server;
              }
            });
          const activeServerId = servers.some(
            (server) => server.id === parsed.activeServerId,
          )
            ? String(parsed.activeServerId)
            : (servers[0]?.id ?? "");
          setConfig({ version: 2, activeServerId, servers });
        }
      }
      setBackupWarningDismissed(
        localStorage.getItem(BACKUP_WARNING_KEY) === "1",
      );
      const savedLocale = localStorage.getItem(LOCALE_KEY);
      setLocale(
        savedLocale === "zh" || savedLocale === "en"
          ? savedLocale
          : navigator.language.toLowerCase().startsWith("zh")
            ? "zh"
            : "en",
      );
      const preferences = readComposerPreferences(localStorage);
      setUseMarkdown(preferences.useMarkdown);
      setSound(preferences.sound);
      setLevel(preferences.level);
      setVolume(preferences.volume);
      setAutoCopy(preferences.autoCopy);
      setIsArchive(preferences.isArchive);
      setShowAdvanced(preferences.showAdvanced);
      setIconLibrary(preferences.iconLibrary);
      setIcon(preferences.selectedIcon);
    } catch {
      setNotice({ type: "error", text: "本地配置读取失败，已使用默认设置。" });
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale, ready]);

  useEffect(() => {
    if (!ready) return;
    writeComposerPreferences(localStorage, {
      useMarkdown,
      sound,
      level: level as "active" | "timeSensitive" | "passive" | "critical",
      volume,
      autoCopy,
      isArchive,
      showAdvanced,
      iconLibrary,
      selectedIcon: icon,
    });
  }, [
    autoCopy,
    isArchive,
    icon,
    iconLibrary,
    level,
    ready,
    showAdvanced,
    sound,
    useMarkdown,
    volume,
  ]);

  const tr = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const deviceCount = (count: number) =>
    locale === "zh" ? `${count} 个设备` : `${count} ${count === 1 ? "device" : "devices"}`;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!showMobileDevices) return;

    const scrollPosition = window.scrollY;
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollPosition);
    };
  }, [showMobileDevices]);

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
    const lines = barkLinks.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) return;

    const parsed: Array<{
      serverUrl: string;
      key: string;
      deviceName: string;
    }> = [];
    const errors: string[] = [];
    lines.forEach((line, index) => {
      try {
        parsed.push(parseBarkImportLine(line));
      } catch (error) {
        errors.push(
          locale === "zh"
            ? `第 ${index + 1} 行：${error instanceof Error ? error.message : "格式错误"}`
            : `Line ${index + 1}: ${
                error instanceof Error
                  ? (LINK_ERROR_EN[error.message] ?? error.message)
                  : "Invalid format"
              }`,
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
    const servers = config.servers.map((server) => ({
      ...server,
      devices: [...server.devices],
    }));
    parsed.forEach(({ serverUrl: parsedServerUrl, key, deviceName }) => {
      let server = servers.find(
        (item) => cleanServerUrl(item.url) === cleanServerUrl(parsedServerUrl),
      );
      if (!server) {
        server = {
          id: makeId(),
          name: defaultServerName(parsedServerUrl),
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
      const device = {
        id: makeId(),
        name:
          deviceName === "未命名设备"
            ? tr("未命名设备", "Unnamed device")
            : deviceName,
        key,
      };
      server.devices.push(device);
      added += 1;
    });
    setConfig({
      version: 2,
      servers,
      activeServerId: firstTargetServerId || config.activeServerId,
    });
    setBarkLinks("");
    setShowImport(false);
    setNotice({
      type: "success",
      text:
        duplicates > 0
          ? tr(
              `已导入 ${added} 个设备，跳过 ${duplicates} 个重复 Key`,
              `Imported ${added}; skipped ${duplicates} duplicate ${
                duplicates === 1 ? "key" : "keys"
              }`,
            )
          : tr(`已导入 ${added} 个设备`, `Imported ${deviceCount(added)}`),
    });
  }

  function removeDevice(device: Device) {
    setConfirmTarget({ kind: "device", device });
  }

  function addServer(event: FormEvent) {
    event.preventDefault();
    const url = cleanServerUrl(serverUrl);
    if (!url) return;
    let name = serverName.trim();
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      if (!name) name = defaultServerName(url);
    } catch {
      setNotice({
        type: "error",
        text: tr(
          "请输入完整的服务器地址，例如 https://api.day.app",
          "Enter a complete server URL, for example https://api.day.app",
        ),
      });
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
    setNotice({
      type: "success",
      text: tr(`已添加「${name}」`, `Added “${name}”`),
    });
  }

  function removeServer(server: BarkServer) {
    setConfirmTarget({ kind: "server", server });
  }

  function startEditingServer(server: BarkServer) {
    setEditingServerId(server.id);
    setServerNameDraft(server.name);
    setServerUrlDraft(server.url);
  }

  function saveServerEdit(serverId: string) {
    const name = serverNameDraft.trim() || tr("未命名服务器", "Unnamed server");
    const url = cleanServerUrl(serverUrlDraft);
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setNotice({
        type: "error",
        text: tr(
          "请输入有效的 HTTP 或 HTTPS 服务器地址。",
          "Enter a valid HTTP or HTTPS server URL.",
        ),
      });
      return;
    }
    setConfig((current) => ({
      ...current,
      servers: current.servers.map((server) =>
        server.id === serverId ? { ...server, name, url } : server,
      ),
    }));
    setEditingServerId(null);
    setNotice({
      type: "success",
      text: tr("服务器信息已更新。", "Server details updated."),
    });
  }

  function startEditingDevice(device: Device) {
    setEditingDeviceId(device.id);
    setDeviceNameDraft(device.name);
    setDeviceKeyDraft(device.key);
  }

  function saveDeviceEdit(deviceId: string) {
    const name = deviceNameDraft.trim() || tr("未命名设备", "Unnamed device");
    const key = deviceKeyDraft.trim().replace(/^\/+|\/+$/g, "");
    if (!key) {
      setNotice({
        type: "error",
        text: tr("Device Key 不能为空。", "Device Key cannot be empty."),
      });
      return;
    }
    if (
      activeServer?.devices.some(
        (device) => device.id !== deviceId && device.key === key,
      )
    ) {
      setNotice({
        type: "error",
        text: tr(
          "当前服务器已经存在这个 Device Key。",
          "This Device Key already exists on the current server.",
        ),
      });
      return;
    }
    updateActiveServer((server) => ({
      ...server,
      devices: server.devices.map((device) =>
        device.id === deviceId ? { ...device, name, key } : device,
      ),
    }));
    setEditingDeviceId(null);
    setNotice({
      type: "success",
      text: tr("设备信息已更新。", "Device details updated."),
    });
  }

  function toggleDevice(id: string) {
    setSelectedDeviceIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  function isValidIconUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function openIconAdd() {
    setIconUrlDraft("");
    setIconPreviewStatus("idle");
    setShowIconAdd(true);
  }

  function updateIconUrlDraft(value: string) {
    setIconUrlDraft(value);
    const trimmed = value.trim();
    setIconPreviewStatus(
      !trimmed ? "idle" : isValidIconUrl(trimmed) ? "loading" : "error",
    );
  }

  function addIcon(event: FormEvent) {
    event.preventDefault();
    const url = iconUrlDraft.trim();
    if (!isValidIconUrl(url)) {
      setIconPreviewStatus("error");
      return;
    }
    if (iconLibrary.includes(url)) {
      setNotice({
        type: "error",
        text: tr("这个图标已经添加过了。", "This icon has already been added."),
      });
      return;
    }
    if (iconPreviewStatus !== "ready") return;

    setIconLibrary((current) => [...current, url]);
    setIcon(url);
    setShowIconAdd(false);
    setNotice({
      type: "success",
      text: tr("图标已添加并选中。", "Icon added and selected."),
    });
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
            headers: {
              "Content-Type": "application/json",
              "Accept-Language": locale,
            },
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
          : tr("未知错误", "Unknown error");
      if (failures.length === 0) {
        setNotice({
          type: "success",
          text: tr(
            `已发送给 ${succeeded.length} 个设备`,
            `Sent to ${deviceCount(succeeded.length)}`,
          ),
        });
      } else if (succeeded.length === 0) {
        setNotice({
          type: "error",
          text: tr(`发送失败：${firstFailure}`, `Send failed: ${firstFailure}`),
        });
      } else {
        setNotice({
          type: "error",
          text: tr(
            `${succeeded.length} 个成功，${failures.length} 个失败：${firstFailure}`,
            `${succeeded.length} succeeded, ${failures.length} failed: ${firstFailure}`,
          ),
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : tr("发送失败，请稍后重试。", "Send failed. Try again later."),
      });
    } finally {
      setSending(false);
    }
  }

  function exportConfig() {
    if (
      !window.confirm(
        tr(
          "导出的 JSON 包含明文 Device Key。请妥善保管，不要上传到网盘或发给他人。继续导出？",
          "The exported JSON contains Device Keys in plain text. Keep it private and do not upload or share it. Continue?",
        ),
      )
    ) {
      return;
    }
    const backup = {
      ...config,
      version: 3,
      iconLibrary,
      selectedIcon: icon,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
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
          iconLibrary?: unknown;
          selectedIcon?: unknown;
        };
        if (
          (parsed.version !== 1 &&
            parsed.version !== 2 &&
            parsed.version !== 3) ||
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
        if (parsed.version === 3) {
          const restoredIcons = sanitizeIconLibrary(parsed.iconLibrary);
          setIconLibrary(restoredIcons);
          setIcon(
            sanitizeSelectedIcon(parsed.selectedIcon, restoredIcons),
          );
        }
        setNotice({
          type: "success",
          text: tr("配置已从备份恢复。", "Configuration restored from backup."),
        });
      } catch {
        setNotice({
          type: "error",
          text: tr("备份文件格式不正确。", "The backup file is invalid."),
        });
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    setConfirmTarget({ kind: "clear" });
  }

  function executeConfirmedAction() {
    if (!confirmTarget) return;

    if (confirmTarget.kind === "device") {
      const { device } = confirmTarget;
      updateActiveServer((server) => ({
        ...server,
        devices: server.devices.filter((item) => item.id !== device.id),
      }));
      setSelectedDeviceIds((ids) => ids.filter((id) => id !== device.id));
      setNotice({
        type: "success",
        text: tr(`已移除设备「${device.name}」`, `Removed device “${device.name}”`),
      });
    }

    if (confirmTarget.kind === "server") {
      const { server } = confirmTarget;
      const remaining = config.servers.filter((item) => item.id !== server.id);
      setConfig({
        ...config,
        servers: remaining,
        activeServerId:
          config.activeServerId === server.id
            ? (remaining[0]?.id ?? "")
            : config.activeServerId,
      });
      setSelectedDeviceIds((ids) =>
        ids.filter(
          (id) => !server.devices.some((device) => device.id === id),
        ),
      );
      setNotice({
        type: "success",
        text: tr(`已删除服务器「${server.name}」`, `Deleted server “${server.name}”`),
      });
    }

    if (confirmTarget.kind === "icon") {
      setIconLibrary((current) =>
        current.filter((url) => url !== confirmTarget.url),
      );
      setIcon((current) => (current === confirmTarget.url ? "" : current));
      if (iconLibrary.length === 1) setEditingIcons(false);
      setNotice({
        type: "success",
        text: tr("图标已删除。", "Icon deleted."),
      });
    }

    if (confirmTarget.kind === "clear") {
      setConfig(DEFAULT_CONFIG);
      setSelectedDeviceIds([]);
      localStorage.removeItem(STORAGE_KEY);
      clearComposerPreferences(localStorage);
      setUseMarkdown(DEFAULT_COMPOSER_PREFERENCES.useMarkdown);
      setSound(DEFAULT_COMPOSER_PREFERENCES.sound);
      setLevel(DEFAULT_COMPOSER_PREFERENCES.level);
      setVolume(DEFAULT_COMPOSER_PREFERENCES.volume);
      setAutoCopy(DEFAULT_COMPOSER_PREFERENCES.autoCopy);
      setIsArchive(DEFAULT_COMPOSER_PREFERENCES.isArchive);
      setShowAdvanced(DEFAULT_COMPOSER_PREFERENCES.showAdvanced);
      setIconLibrary(DEFAULT_COMPOSER_PREFERENCES.iconLibrary);
      setIcon(DEFAULT_COMPOSER_PREFERENCES.selectedIcon);
      setNotice({
        type: "success",
        text: tr("本地配置已清除。", "Local configuration cleared."),
      });
    }

    setConfirmTarget(null);
  }

  if (!ready) {
    return (
      <main className="boot">
        <div className="boot-mark">B</div>
        <p>{tr("正在读取本地配置…", "Loading local configuration…")}</p>
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
            <span>{tr("把通知送到你的设备", "Send notifications to your devices")}</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="privacy-pill">
            <span className="privacy-dot" />
            {tr("数据仅在此浏览器", "Data stays in this browser")}
          </span>
          <button
            className="language-toggle"
            type="button"
            onClick={() => setLocale((current) => (current === "zh" ? "en" : "zh"))}
            aria-label={tr("切换到英语", "Switch to Chinese")}
          >
            {locale === "zh" ? "EN" : "中文"}
          </button>
          <button
            className="header-add-button"
            onClick={() => setShowImport(true)}
          >
            <span aria-hidden="true">＋</span>
            <span>{tr("添加 Bark 地址", "Add Bark link")}</span>
          </button>
          <button className="icon-button" onClick={() => setShowSettings(true)}>
            <span aria-hidden="true">⚙</span>
            <span>{tr("设置", "Settings")}</span>
          </button>
        </div>
      </header>

      {!backupWarningDismissed && (
        <div className="local-warning" role="note">
          <span className="warning-icon">!</span>
          <div>
            <strong>
              {tr(
                "Device Key 只保存在当前浏览器，容易丢失",
                "Device Keys exist only in this browser and are easy to lose",
              )}
            </strong>
            <p>
              {tr(
                "清理浏览器数据、使用无痕模式或更换设备后都无法恢复。建议添加完成后立即导出备份。",
                "They cannot be recovered after clearing browser data, using private browsing, or changing devices. Export a backup after setup.",
              )}
            </p>
          </div>
          <button className="warning-export" onClick={exportConfig}>
            {tr("导出备份", "Export backup")}
          </button>
          <button
            className="warning-close"
            aria-label={tr("关闭备份提醒", "Dismiss backup reminder")}
            onClick={() => {
              setBackupWarningDismissed(true);
              localStorage.setItem(BACKUP_WARNING_KEY, "1");
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="workspace">
        <aside className="device-panel">
          <div className="panel-heading">
            <div className="server-select" ref={serverMenuRef}>
              <span className="eyebrow">{tr("当前服务器", "Current server")}</span>
              <button
                className="server-select-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={serverMenuOpen}
                onClick={() =>
                  config.servers.length
                    ? setServerMenuOpen((open) => !open)
                    : setShowImport(true)
                }
              >
                <span>{activeServer?.name ?? tr("尚未添加服务器", "No server added")}</span>
                {config.servers.length > 0 && (
                  <span className={`select-chevron ${serverMenuOpen ? "open" : ""}`} />
                )}
              </button>
              {serverMenuOpen && config.servers.length > 0 && (
                <div
                  className="server-select-menu"
                  role="listbox"
                  aria-label={tr("选择 Bark 服务器", "Choose a Bark server")}
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
                          <small>{deviceCount(server.devices.length)}</small>
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
                    <span>⚙</span>
                    {tr("管理服务器与设备", "Manage servers and devices")}
                  </button>
                </div>
              )}
            </div>
            <button
              className="small-ghost"
              onClick={() => setShowSettings(true)}
              aria-label={tr("管理服务器", "Manage servers")}
            >
              {tr("编辑", "Edit")}
            </button>
          </div>
          <div className="server-address">
            {activeServer?.url ??
              tr(
                "粘贴 Bark 推送链接即可自动添加",
                "Paste a Bark push link to add it automatically",
              )}
          </div>

          <div className="devices-title">
            <div>
              <h2>{tr("接收设备", "Devices")}</h2>
              <span>{deviceCount(activeServer?.devices.length ?? 0)}</span>
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
                  ? tr("取消全选", "Deselect all")
                  : tr("全选", "Select all")}
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
                <strong>
                  {activeServer
                    ? tr("还没有接收设备", "No devices yet")
                    : tr("从 Bark 链接开始", "Start with a Bark link")}
                </strong>
                <p>
                  {activeServer
                    ? tr(
                        "点击右上角“添加 Bark 地址”，导入新的设备链接。",
                        "Use “Add Bark link” above to import a device link.",
                      )
                    : tr(
                        "点击右上角“添加 Bark 地址”，服务器和设备会自动创建。",
                        "Use “Add Bark link” above to create the server and device automatically.",
                      )}
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="composer-panel">
          <button
            className={`mobile-recipient-bar mobile-only ${
              selectedDevices.length ? "ready" : "missing"
            }`}
            type="button"
            onClick={() => setShowMobileDevices(true)}
          >
            <span className="mobile-recipient-label">
              <small>{tr("接收设备", "Recipients")}</small>
              <strong>
                {selectedDevices.length
                  ? selectedDevices.length === 1
                    ? selectedDevices[0].name
                    : tr(
                        `${selectedDevices[0].name} 等 ${selectedDevices.length} 个设备`,
                        `${selectedDevices[0].name} and ${selectedDevices.length - 1} more`,
                      )
                  : tr("尚未选择设备", "No recipients selected")}
              </strong>
            </span>
            <span className="mobile-recipient-action">
              {selectedDevices.length
                ? tr("修改", "Change")
                : tr("选择", "Choose")}
              <span aria-hidden="true">›</span>
            </span>
          </button>

          <div className="composer-heading">
            <div>
              <span className="eyebrow">{tr("新通知", "New notification")}</span>
              <h1>{tr("发送一条 Bark 通知", "Send a Bark notification")}</h1>
              <p>
                {selectedDevices.length
                  ? tr(
                      `将发送给：${selectedDevices.map((device) => device.name).join("、")}`,
                      `Sending to: ${selectedDevices.map((device) => device.name).join(", ")}`,
                    )
                  : tr(
                      "请先从左侧选择一个或多个接收设备",
                      "Choose one or more devices from the left",
                    )}
              </p>
            </div>
            <span className={`status-badge ${selectedDevices.length ? "ready" : ""}`}>
              {selectedDevices.length
                ? deviceCount(selectedDevices.length)
                : tr("未选择设备", "No device selected")}
            </span>
          </div>

          <form className="composer-form" onSubmit={sendPush}>
            <div className="field-row">
              <label className="field">
                <span>{tr("通知标题", "Title")} <em>{tr("可选", "Optional")}</em></span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={tr("例如：今日提醒", "For example: Today’s reminder")}
                />
              </label>
              <div className="field format-field">
                <span>
                  {tr("内容格式", "Message format")}{" "}
                  <em>{tr("支持基础 Markdown", "Basic Markdown supported")}</em>
                </span>
                <div
                  className="format-picker"
                  role="group"
                  aria-label={tr("通知内容格式", "Notification message format")}
                >
                  <button
                    type="button"
                    className={!useMarkdown ? "active" : ""}
                    onClick={() => setUseMarkdown(false)}
                    aria-pressed={!useMarkdown}
                  >
                    {tr("纯文本", "Plain text")}
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

            <div className="icon-library-field">
              <div className="icon-library-heading">
                <span>
                  {tr("通知图标", "Notification icon")}{" "}
                  <em>{tr("可选", "Optional")}</em>
                </span>
                {iconLibrary.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditingIcons((current) => !current)}
                  >
                    {editingIcons
                      ? tr("完成", "Done")
                      : tr("编辑", "Edit")}
                  </button>
                )}
              </div>
              <div className="icon-library-strip">
                <button
                  className="icon-choice icon-add-choice"
                  type="button"
                  onClick={openIconAdd}
                  aria-label={tr("添加通知图标", "Add notification icon")}
                  title={tr("添加图标", "Add icon")}
                >
                  <span>＋</span>
                </button>
                {iconLibrary.map((url) => {
                  const selected = icon === url;
                  return (
                    <div className="icon-choice-wrap" key={url}>
                      <button
                        className={`icon-choice ${selected ? "selected" : ""}`}
                        type="button"
                        onClick={() =>
                          setIcon((current) => (current === url ? "" : url))
                        }
                        aria-pressed={selected}
                        aria-label={
                          selected
                            ? tr(
                                "取消选择这个通知图标",
                                "Deselect this notification icon",
                              )
                            : tr(
                                "选择这个通知图标",
                                "Select this notification icon",
                              )
                        }
                        title={url}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" />
                      </button>
                      {editingIcons && (
                        <button
                          className="icon-choice-delete"
                          type="button"
                          onClick={() =>
                            setConfirmTarget({ kind: "icon", url })
                          }
                          aria-label={tr(
                            "删除这个通知图标",
                            "Delete this notification icon",
                          )}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="field message-field">
              <span>
                {useMarkdown ? tr("Markdown 内容", "Markdown message") : tr("通知内容", "Message")}{" "}
                <em className="required-mark">{tr("必填", "Required")}</em>
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={
                  useMarkdown
                    ? tr(
                        "例如：**今日计划**\n\n- 领取快递\n- 晚上七点散步",
                        "For example: **Today’s plan**\n\n- Pick up a package\n- Take an evening walk",
                      )
                    : tr("写下你想发送的内容…", "Write your notification…")
                }
                maxLength={1000}
                required
              />
              <small>{body.length} / 1000</small>
            </label>

            <button
              className="mobile-notification-toggle mobile-only"
              type="button"
              onClick={() =>
                setShowNotificationSettings((current) => !current)
              }
              aria-expanded={showNotificationSettings}
            >
              <span>
                <strong>{tr("通知设置", "Notification settings")}</strong>
                <small>
                  {tr(
                    `${
                      LEVELS.find(([value]) => value === level)?.[2] ??
                      "主动提醒"
                    } · ${
                      SOUNDS.find(([value]) => value === sound)?.[2] ??
                      SOUNDS.find(([value]) => value === sound)?.[1] ??
                      "默认铃声"
                    }`,
                    `${
                      LEVELS.find(([value]) => value === level)?.[1] ??
                      "Active"
                    } · ${
                      SOUNDS.find(([value]) => value === sound)?.[1] ??
                      "Default"
                    }`,
                  )}
                </small>
              </span>
              <span>
                {showNotificationSettings
                  ? tr("收起", "Collapse")
                  : tr("展开", "Expand")}{" "}
                <span aria-hidden="true">
                  {showNotificationSettings ? "⌃" : "›"}
                </span>
              </span>
            </button>

            <div
              className={`notification-settings ${
                showNotificationSettings ? "open" : ""
              }`}
            >
              <div className="field-row">
                <label className="field">
                  <span>{tr("提醒级别", "Interruption level")}</span>
                  <SelectMenu
                    label={tr("提醒级别", "Interruption level")}
                    value={level}
                    onChange={setLevel}
                    options={LEVELS.map(
                      ([
                        value,
                        enLabel,
                        zhLabel,
                        enDescription,
                        zhDescription,
                      ]) => ({
                        value,
                        label: tr(zhLabel, enLabel),
                        description: tr(zhDescription, enDescription),
                      }),
                    )}
                  />
                </label>
                <label className="field">
                  <span>{tr("通知铃声", "Sound")}</span>
                  <SelectMenu
                    label={tr("通知铃声", "Sound")}
                    value={sound}
                    onChange={setSound}
                    options={SOUNDS.map(([value, enLabel, zhLabel]) => ({
                      value,
                      label: tr(zhLabel, enLabel),
                      description: value
                        ? value === "silence"
                          ? tr("不播放提示音", "No notification sound")
                          : tr(
                              `系统铃声 · ${value}`,
                              `System sound · ${value}`,
                            )
                        : tr(
                            "使用 Bark 默认设置",
                            "Use the Bark default",
                          ),
                    }))}
                  />
                </label>
              </div>

              {level === "critical" && (
                <label className="volume-field">
                  <span>
                    <strong>
                      {tr("重要警告音量", "Critical alert volume")}
                    </strong>
                    <small>
                      {tr(
                        "即使设备处于静音模式也会响铃",
                        "Can play even when the device is in Silent mode",
                      )}
                    </small>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={volume}
                    onChange={(event) => setVolume(event.target.value)}
                    aria-label={tr(
                      "重要警告音量",
                      "Critical alert volume",
                    )}
                  />
                  <output>{volume} / 10</output>
                </label>
              )}
            </div>

            <button
              className="advanced-toggle"
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-expanded={showAdvanced}
            >
              <span>{tr("高级选项", "Advanced options")}</span>
              <span>{showAdvanced ? "−" : "＋"}</span>
            </button>

            {showAdvanced && (
              <div className="advanced-grid">
                <label className="field">
                  <span>
                    {tr("副标题", "Subtitle")}{" "}
                    <em>{tr("可选", "Optional")}</em>
                  </span>
                  <input
                    value={subtitle}
                    onChange={(event) => setSubtitle(event.target.value)}
                    placeholder={tr(
                      "显示在标题与正文之间",
                      "Shown between the title and message",
                    )}
                  />
                </label>
                <label className="field">
                  <span>
                    {tr("通知分组", "Group")}{" "}
                    <em>{tr("可选", "Optional")}</em>
                  </span>
                  <input
                    value={group}
                    onChange={(event) => setGroup(event.target.value)}
                    placeholder={tr(
                      "例如：日常通知",
                      "For example: Daily",
                    )}
                  />
                </label>
                <label className="field">
                  <span>{tr("角标数字", "Badge number")}</span>
                  <input
                    value={badge}
                    onChange={(event) => setBadge(event.target.value)}
                    type="number"
                    min="0"
                    placeholder={tr("例如：1", "For example: 1")}
                  />
                </label>
                <label className="field">
                  <span>{tr("点击跳转 URL", "Open URL")}</span>
                  <input
                    value={jumpUrl}
                    onChange={(event) => setJumpUrl(event.target.value)}
                    placeholder={tr("https://… 或自定义 Scheme", "https://… or a custom scheme")}
                  />
                </label>
                <label className="field">
                  <span>{tr("复制内容", "Copy text")}</span>
                  <input
                    value={copy}
                    onChange={(event) => setCopy(event.target.value)}
                    placeholder={tr("长按通知时复制", "Copied when the notification is held")}
                  />
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={autoCopy}
                    onChange={(event) => setAutoCopy(event.target.checked)}
                  />
                  <span>{tr("收到通知时自动复制", "Copy automatically on receipt")}</span>
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={isArchive}
                    onChange={(event) => setIsArchive(event.target.checked)}
                  />
                  <span>{tr("保存到 Bark 历史记录", "Save to Bark history")}</span>
                </label>
              </div>
            )}

            <div className="send-row">
              <p>
                {tr(
                  "通知内容将直接发送到当前 Bark 服务器。",
                  "The notification is sent directly to the current Bark server.",
                )}
              </p>
              <button
                className="primary-button"
                type="submit"
                disabled={sending || !body.trim() || selectedDevices.length === 0}
              >
                <span>
                  {sending ? tr("发送中…", "Sending…") : tr("发送通知", "Send notification")}
                </span>
              </button>
            </div>

            <div className="mobile-send-bar mobile-only">
              <span>
                {selectedDevices.length
                  ? deviceCount(selectedDevices.length)
                  : tr("未选择接收设备", "No recipients")}
              </span>
              <button
                type={selectedDevices.length ? "submit" : "button"}
                onClick={
                  selectedDevices.length
                    ? undefined
                    : () => setShowMobileDevices(true)
                }
                disabled={
                  sending ||
                  (selectedDevices.length > 0 && !body.trim())
                }
              >
                {sending
                  ? tr("发送中…", "Sending…")
                  : !selectedDevices.length
                    ? tr("选择接收设备", "Choose recipients")
                    : !body.trim()
                      ? tr("请填写通知内容", "Enter a message")
                      : tr(
                          `发送给 ${selectedDevices.length} 个设备`,
                          `Send to ${selectedDevices.length}`,
                        )}
              </button>
            </div>
          </form>
        </section>
      </div>

      {showMobileDevices && (
        <div
          className="modal-backdrop mobile-device-backdrop"
          onMouseDown={() => setShowMobileDevices(false)}
        >
          <section
            className="mobile-device-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-device-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-heading">
              <div>
                <span className="eyebrow">
                  {tr("通知接收人", "Notification recipients")}
                </span>
                <h2 id="mobile-device-title">
                  {tr("选择接收设备", "Choose recipients")}
                </h2>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setShowMobileDevices(false)}
                aria-label={tr(
                  "关闭设备选择窗口",
                  "Close recipient picker",
                )}
              >
                ×
              </button>
            </div>

            {config.servers.length > 0 && activeServer && (
              <div className="mobile-server-picker">
                <span>{tr("Bark 服务器", "Bark server")}</span>
                <SelectMenu
                  label={tr("选择 Bark 服务器", "Choose a Bark server")}
                  value={activeServer.id}
                  onChange={(serverId) =>
                    setConfig((current) => ({
                      ...current,
                      activeServerId: serverId,
                    }))
                  }
                  options={config.servers.map((server) => ({
                    value: server.id,
                    label: server.name,
                    description: `${server.url} · ${deviceCount(
                      server.devices.length,
                    )}`,
                  }))}
                />
              </div>
            )}

            <div className="mobile-device-sheet-title">
              <span>
                <strong>
                  {activeServer
                    ? tr("接收设备", "Recipients")
                    : tr("尚未添加服务器", "No server added")}
                </strong>
                <small>
                  {deviceCount(activeServer?.devices.length ?? 0)}
                </small>
              </span>
              {activeServer && activeServer.devices.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDeviceIds((current) => {
                      const activeIds = activeServer.devices.map(
                        (device) => device.id,
                      );
                      const allSelected = activeIds.every((id) =>
                        current.includes(id),
                      );
                      return allSelected
                        ? current.filter((id) => !activeIds.includes(id))
                        : Array.from(new Set([...current, ...activeIds]));
                    })
                  }
                >
                  {selectedDevices.length === activeServer.devices.length
                    ? tr("取消全选", "Deselect all")
                    : tr("全选", "Select all")}
                </button>
              )}
            </div>

            <div className="mobile-device-list">
              {activeServer?.devices.length ? (
                activeServer.devices.map((device) => {
                  const checked = selectedDeviceIds.includes(device.id);
                  return (
                    <button
                      key={device.id}
                      type="button"
                      className={`device-card ${checked ? "selected" : ""}`}
                      onClick={() => toggleDevice(device.id)}
                    >
                      <span className="device-check">
                        {checked ? "✓" : ""}
                      </span>
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
                <div className="mobile-device-empty">
                  <strong>
                    {activeServer
                      ? tr("还没有接收设备", "No devices yet")
                      : tr("还没有 Bark 地址", "No Bark links yet")}
                  </strong>
                  <p>
                    {tr(
                      "添加完整 Bark 地址后即可选择接收设备。",
                      "Add a complete Bark link to choose a recipient.",
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileDevices(false);
                      setShowImport(true);
                    }}
                  >
                    {tr("添加 Bark 地址", "Add Bark link")}
                  </button>
                </div>
              )}
            </div>

            <div className="mobile-device-sheet-footer">
              <span>
                {selectedDevices.length
                  ? tr(
                      `已选择 ${selectedDevices.length} 个设备`,
                      `${selectedDevices.length} selected`,
                    )
                  : tr("尚未选择设备", "No recipients selected")}
              </span>
              <button
                type="button"
                onClick={() => setShowMobileDevices(false)}
              >
                {tr("完成", "Done")}
              </button>
            </div>
          </section>
        </div>
      )}

      {showIconAdd && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowIconAdd(false)}
        >
          <section
            className="import-modal icon-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="icon-add-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {tr("图标库", "Icon library")}
                </span>
                <h2 id="icon-add-title">
                  {tr("添加通知图标", "Add notification icon")}
                </h2>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setShowIconAdd(false)}
                aria-label={tr("关闭添加图标窗口", "Close add icon dialog")}
              >
                ×
              </button>
            </div>
            <form className="icon-add-form" onSubmit={addIcon}>
              <label>
                <span>{tr("图标 URL", "Icon URL")}</span>
                <input
                  value={iconUrlDraft}
                  onChange={(event) => updateIconUrlDraft(event.target.value)}
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  autoFocus
                />
              </label>
              <div
                className={`icon-preview ${iconPreviewStatus}`}
                aria-live="polite"
              >
                {isValidIconUrl(iconUrlDraft.trim()) ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={iconUrlDraft.trim()}
                      src={iconUrlDraft.trim()}
                      alt={tr("通知图标预览", "Notification icon preview")}
                      onLoad={() => setIconPreviewStatus("ready")}
                      onError={() => setIconPreviewStatus("error")}
                    />
                    <span>
                      {iconPreviewStatus === "ready" &&
                        tr("图片加载成功", "Image loaded")}
                      {iconPreviewStatus === "loading" &&
                        tr("正在加载预览…", "Loading preview…")}
                      {iconPreviewStatus === "error" &&
                        tr("无法加载这张图片", "This image could not be loaded")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="icon-preview-placeholder">＋</span>
                    <span>
                      {iconPreviewStatus === "error"
                        ? tr(
                            "请输入有效的 HTTP 或 HTTPS 图片地址",
                            "Enter a valid HTTP or HTTPS image URL",
                          )
                        : tr(
                            "粘贴地址后将在这里预览",
                            "Paste a URL to preview it here",
                          )}
                    </span>
                  </>
                )}
              </div>
              <div className="import-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setShowIconAdd(false)}
                >
                  {tr("取消", "Cancel")}
                </button>
                <button
                  className="save-button"
                  type="submit"
                  disabled={iconPreviewStatus !== "ready"}
                >
                  {tr("添加并选中", "Add and select")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showImport && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowImport(false)}
        >
          <section
            className="import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{tr("快速导入", "Quick import")}</span>
                <h2 id="import-title">{tr("添加 Bark 地址", "Add Bark link")}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowImport(false)}
                aria-label={tr("关闭添加窗口", "Close add dialog")}
              >
                ×
              </button>
            </div>
            <form className="import-modal-form" onSubmit={importBarkLinks}>
              <label>
                <span>{tr("完整 Bark 推送链接", "Complete Bark push link")}</span>
                <textarea
                  value={barkLinks}
                  onChange={(event) => setBarkLinks(event.target.value)}
                  placeholder={
                    tr(
                      "我的手机 https://bark.example.com/DemoDeviceKey_123456/推送内容\n平板 https://api.day.app/AnotherDemoKey_789/推送内容",
                      "My phone https://bark.example.com/DemoDeviceKey_123456/message\nTablet https://api.day.app/AnotherDemoKey_789/message",
                    )
                  }
                  autoComplete="off"
                  autoFocus
                  required
                />
              </label>
              <div className="import-example">
                <strong>
                  {tr("支持设备名称与多行导入", "Device names and multi-line import supported")}
                </strong>
                <p>
                  {tr(
                    "每行使用“设备名 + 一个半角空格 + 完整链接”。格式不规范时整批拒绝写入，链接中的推送内容不会保存。",
                    "Use “device name + one regular space + complete link” on each line. If any line is invalid, nothing is imported. Message text in links is not saved.",
                  )}
                </p>
              </div>
              <div className="import-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowImport(false)}
                >
                  {tr("取消", "Cancel")}
                </button>
                <button type="submit" className="save-button">
                  {barkLinks.includes("\n")
                    ? tr("批量导入", "Import all")
                    : tr("解析并添加", "Parse and add")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

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
                <span className="eyebrow">{tr("本地配置", "Local configuration")}</span>
                <h2 id="settings-title">{tr("服务器与设备", "Servers and devices")}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowSettings(false)}
                aria-label={tr("关闭设置", "Close settings")}
              >
                ×
              </button>
            </div>

            <div className="settings-section">
              <h3>{tr("服务器", "Servers")}</h3>
              <div className="server-list">
                {config.servers.map((server) =>
                  editingServerId === server.id ? (
                    <div className="edit-card" key={server.id}>
                      <label>
                        <span>{tr("服务器名称", "Server name")}</span>
                        <input
                          value={serverNameDraft}
                          onChange={(event) => setServerNameDraft(event.target.value)}
                          placeholder={tr("未命名服务器", "Unnamed server")}
                        />
                      </label>
                      <label>
                        <span>{tr("服务器地址", "Server URL")}</span>
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
                          {tr("取消", "Cancel")}
                        </button>
                        <button
                          className="save-button"
                          onClick={() => saveServerEdit(server.id)}
                        >
                          {tr("保存", "Save")}
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
                        aria-label={tr(`切换到 ${server.name}`, `Switch to ${server.name}`)}
                      >
                        {server.name.slice(0, 1)}
                      </button>
                      <div>
                        <strong>{server.name}</strong>
                        <span>
                          {server.url} · {deviceCount(server.devices.length)}
                        </span>
                      </div>
                      <button
                        className="edit-text"
                        onClick={() => startEditingServer(server)}
                      >
                        {tr("编辑", "Edit")}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => removeServer(server)}
                      >
                        {tr("删除", "Delete")}
                      </button>
                    </div>
                  ),
                )}
                {config.servers.length === 0 && (
                  <div className="settings-empty">
                    <strong>{tr("还没有服务器", "No servers yet")}</strong>
                    <span>
                      {tr(
                        "点击按钮粘贴完整 Bark 链接，或使用下方表单手动添加服务器。",
                        "Paste a complete Bark link, or add a server manually below.",
                      )}
                    </span>
                    <button
                      className="settings-add-link"
                      onClick={() => {
                        setShowSettings(false);
                        setShowImport(true);
                      }}
                    >
                      <span aria-hidden="true">＋</span>
                      {tr("添加 Bark 地址", "Add Bark link")}
                    </button>
                  </div>
                )}
              </div>
              <form className="inline-form" onSubmit={addServer}>
                <input
                  value={serverName}
                  onChange={(event) => setServerName(event.target.value)}
                  placeholder={tr("名称（可选）", "Name (optional)")}
                />
                <input
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder="https://bark.example.com"
                  type="url"
                  required
                />
                <button type="submit">{tr("添加服务器", "Add server")}</button>
              </form>
              <p className="settings-help">
                {tr(
                  "Device Key 属于服务器实例。更换服务器后，请在 Bark App 中重新注册并添加新 Key。",
                  "A Device Key belongs to one server instance. After changing servers, register again in the Bark app and add the new key.",
                )}
              </p>
            </div>

            <div className="settings-section">
              <div className="section-title-row">
                <h3>{tr("当前服务器的设备", "Devices on current server")}</h3>
                <span>{activeServer?.name ?? tr("尚未选择服务器", "No server selected")}</span>
              </div>
              <div className="manage-device-list">
                {activeServer?.devices.map((device) =>
                  editingDeviceId === device.id ? (
                    <div className="edit-card device-edit-card" key={device.id}>
                      <label>
                        <span>{tr("设备名称", "Device name")}</span>
                        <input
                          value={deviceNameDraft}
                          onChange={(event) => setDeviceNameDraft(event.target.value)}
                          placeholder={tr("未命名设备", "Unnamed device")}
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
                          {tr("取消", "Cancel")}
                        </button>
                        <button
                          className="save-button"
                          onClick={() => saveDeviceEdit(device.id)}
                        >
                          {tr("保存", "Save")}
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
                        {showKeys[device.id] ? tr("隐藏", "Hide") : tr("显示", "Show")}
                      </button>
                      <button
                        className="edit-text"
                        onClick={() => startEditingDevice(device)}
                      >
                        {tr("编辑", "Edit")}
                      </button>
                      <button className="danger-text" onClick={() => removeDevice(device)}>
                        {tr("移除", "Remove")}
                      </button>
                    </div>
                  ),
                )}
                {!activeServer?.devices.length && (
                  <p className="settings-help">
                    {tr("当前服务器还没有保存设备。", "No devices are saved on this server.")}
                  </p>
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
                {tr("导出备份", "Export backup")}
              </button>
              <button
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                {tr("导入备份", "Import backup")}
              </button>
              <button className="danger-button" onClick={clearAllData}>
                {tr("清除全部本地数据", "Clear all local data")}
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmTarget && (
        <div
          className="modal-backdrop confirm-backdrop"
          onMouseDown={() => setConfirmTarget(null)}
        >
          <section
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="confirm-icon" aria-hidden="true">
              !
            </span>
            <div className="confirm-copy">
              <span className="eyebrow">{tr("危险操作", "Destructive action")}</span>
              <h2 id="confirm-title">
                {confirmTarget.kind === "device" &&
                  tr("移除这个设备？", "Remove this device?")}
                {confirmTarget.kind === "server" &&
                  tr("删除这个服务器？", "Delete this server?")}
                {confirmTarget.kind === "icon" &&
                  tr("删除这个图标？", "Delete this icon?")}
                {confirmTarget.kind === "clear" &&
                  tr("清除全部本地数据？", "Clear all local data?")}
              </h2>
              <p id="confirm-description">
                {confirmTarget.kind === "device" &&
                  tr(
                    `设备“${confirmTarget.device.name}”的 Device Key 将从此浏览器移除。`,
                    `The Device Key for “${confirmTarget.device.name}” will be removed from this browser.`,
                  )}
                {confirmTarget.kind === "server" &&
                  tr(
                    `服务器“${confirmTarget.server.name}”及其 ${confirmTarget.server.devices.length} 个设备配置将被删除。`,
                    `“${confirmTarget.server.name}” and its ${deviceCount(
                      confirmTarget.server.devices.length,
                    )} will be deleted.`,
                  )}
                {confirmTarget.kind === "icon" &&
                  tr(
                    "这个通知图标将从浏览器本地图标库中删除。",
                    "This notification icon will be removed from the local icon library.",
                  )}
                {confirmTarget.kind === "clear" &&
                  tr(
                    "所有服务器、设备名称和 Device Key 都将从此浏览器删除。",
                    "All servers, device names, and Device Keys will be deleted from this browser.",
                  )}
              </p>
              <small>
                {tr(
                  "此操作无法撤销，请确认已按需导出备份。",
                  "This cannot be undone. Export a backup first if needed.",
                )}
              </small>
            </div>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                onClick={() => setConfirmTarget(null)}
              >
                {tr("取消", "Cancel")}
              </button>
              <button className="confirm-danger-button" onClick={executeConfirmedAction}>
                {confirmTarget.kind === "device"
                  ? tr("确认移除", "Remove")
                  : tr("确认删除", "Delete")}
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
