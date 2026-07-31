# Bark Web

[简体中文](README.zh-CN.md)

A clean, self-hosted web console for sending [Bark](https://github.com/Finb/Bark) notifications. It keeps server URLs, device names, and Device Keys in the browser and sends notifications through a same-origin server proxy.

## Features

- Manage multiple Bark servers and devices
- Import complete Bark push links, including multi-line imports
- Optional device names for readable recipient lists
- Title, subtitle, plain text or Markdown messages
- Interruption level, notification sound, and critical-alert volume
- Grouping, badge, icon, open URL, copy, auto-copy, and archive options
- English and Simplified Chinese interface
- Local JSON backup and restore
- No analytics or tracking

## Import format

Paste one complete Bark push link per line:

```text
My phone https://bark.example.com/DemoDeviceKey_123456/message
Tablet https://api.day.app/AnotherDemoKey_789/message
```

Use exactly one regular space between the optional device name and URL. If any line is invalid, the entire batch is rejected. Message text in the URL is ignored and is not saved.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

For a production build:

```bash
npm run build
npm run start
```

## Docker

Build and run locally:

```bash
docker build -t bark-web .
docker run --rm -p 3000:3000 bark-web
```

After the GitHub workflow publishes the image, run:

```bash
docker run --rm -p 3000:3000 ghcr.io/space4yyy/bark-web:latest
```

The workflow builds pull requests and publishes branch, tag, SHA, and `latest` images to GitHub Container Registry after pushes to `main` or `v*` tags.

## Security and data

Device Keys are sensitive. They are stored in `localStorage`, so clearing browser data, using a private window, or switching browsers/devices can lose them. Export a backup after setup and keep the JSON private because it contains Device Keys in plain text.

In hosted environments, the server proxy only accepts publicly reachable HTTPS Bark servers. Local development also permits local HTTP servers for testing.

Device Keys belong to the Bark server that issued them. When switching to another Bark server, register the device with that server and use its new key.
