# chrome-personal-mcp

Personal Chrome MCP server ที่รัน Chrome ผ่าน Puppeteer ใน Docker พร้อม persistent profile และ debug mode ผ่าน VNC

## Overview

- รัน Google Chrome ใน Docker container พร้อม persistent user profile (login session คงอยู่ข้ามการ restart)
- **prod mode** — headless, ไม่มี UI
- **debug mode** — มี virtual display (Xvfb) + VNC เพื่อดูหน้าจอ Chrome แบบ real-time

## Requirements

- Docker + Docker Compose v2
- VNC viewer (เช่น [RealVNC](https://www.realvnc.com/), [TigerVNC](https://tigervnc.org/)) สำหรับ debug mode

## Quick Start

```bash
# build และรัน
docker compose up --build

# รันแบบ background
docker compose up --build -d
```

## Debug Mode (VNC)

เปิด `docker-compose.yml` แล้วเปลี่ยน environment:

```yaml
environment:
  - MODE=debug
```

จากนั้น connect VNC ที่ `localhost:5900` (ไม่มี password)

```bash
# ตัวอย่างด้วย vncviewer
vncviewer localhost:5900
```

## Project Structure

```
chrome-personal-mcp/
├── app.js              # Puppeteer script หลัก
├── start.sh            # Entrypoint — เลือก prod/debug mode
├── Dockerfile          # Node 20 + Chrome + Xvfb + VNC
├── docker-compose.yml  # Service config
├── package.json        # Dependencies (puppeteer)
└── data/               # Volume mount — Chrome profile + screenshots
    ├── chrome-profile/ # Persistent Chrome user data (login sessions)
    └── last.png        # Screenshot ล่าสุด
```

## Volumes

| Path (container) | Path (host) | Description |
|---|---|---|
| `/data/chrome-profile` | `./data/chrome-profile` | Chrome user profile — เก็บ cookies, login sessions |
| `/data/last.png` | `./data/last.png` | Screenshot ล่าสุดที่ถ่ายไว้ |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODE` | `prod` | `prod` = headless, `debug` = Xvfb + VNC |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome` | Path ของ Chrome binary (set ใน Dockerfile) |

## Ports

| Port | Description |
|---|---|
| `5900` | VNC server — ใช้เฉพาะ `MODE=debug` |

## First-time Login

ครั้งแรกที่รัน ถ้าต้องการ login เว็บไซต์ใดๆ ให้ใช้ debug mode:

1. เปลี่ยน `MODE=debug` ใน `docker-compose.yml`
2. `docker compose up --build`
3. Connect VNC ที่ `localhost:5900`
4. Login ผ่าน Chrome ที่เห็นใน VNC
5. หยุด container แล้วเปลี่ยนกลับเป็น `MODE=prod`
6. `docker compose up` — Chrome จะจำ session ไว้ใน `./data/chrome-profile`
