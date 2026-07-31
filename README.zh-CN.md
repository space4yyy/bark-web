# Bark Web

[English](README.md)

一个简洁、可自托管的 [Bark](https://github.com/Finb/Bark) 网页通知控制台。服务器地址、设备名称和 Device Key 保存在浏览器中，通知通过同源服务端代理发送。

## 功能

- 管理多个 Bark 服务器和设备
- 导入完整 Bark 推送链接，支持多行批量导入
- 为 Device Key 配置便于阅读的设备名称
- 支持标题、副标题、纯文本和 Markdown
- 支持提醒级别、通知铃声和重要警告音量
- 支持分组、角标、图标、跳转链接、复制、自动复制和归档
- 英语与简体中文界面
- 本地 JSON 备份与恢复
- 不包含分析和追踪

## 导入格式

每行粘贴一个完整 Bark 推送链接：

```text
我的手机 https://bark.example.com/DemoDeviceKey_123456/推送内容
平板 https://api.day.app/AnotherDemoKey_789/推送内容
```

设备名为可选项；设备名和 URL 之间只能使用一个半角空格。任何一行格式不正确时，整批数据都会被拒绝。URL 中的推送内容会被忽略，不会保存。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000>。

生产构建：

```bash
npm run build
npm run start
```

## Docker

本地构建并运行：

```bash
docker build -t bark-web .
docker run --rm -p 3000:3000 bark-web
```

GitHub 工作流发布镜像后，可以运行：

```bash
docker run --rm -p 3000:3000 ghcr.io/space4yyy/bark-web:latest
```

工作流会构建 Pull Request；推送到 `main` 或 `v*` 标签后，会向 GitHub Container Registry 发布分支、标签、SHA 和 `latest` 镜像。

## 安全与数据

Device Key 是敏感信息，保存在浏览器 `localStorage` 中。清除浏览器数据、使用无痕窗口或更换浏览器/设备后可能丢失。建议配置完成后立即导出备份；备份 JSON 包含明文 Device Key，请勿公开或转发。

线上环境的服务端代理仅允许访问公网可达的 HTTPS Bark 服务器。本地开发环境也允许使用本地 HTTP 服务器，便于测试。

Device Key 由对应 Bark 服务器签发。更换 Bark 服务器后，需要在 Bark App 中向新服务器重新注册，并使用新生成的 Key。
