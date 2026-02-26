# System Architecture & Deployment Guide

> This document describes the overall architecture of Nanobrowser, how the
> **Chrome Extension** and the **Orchestrator Server** work together, and how to
> deploy both components.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Chrome Extension](#chrome-extension)
3. [Orchestrator Server](#orchestrator-server)
4. [Data Flow](#data-flow)
5. [Development Setup](#development-setup)
6. [Deployment](#deployment)
7. [Environment Variables](#environment-variables)

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User's Browser (Chrome / Edge)                │
│                                                                      │
│  ┌──────────────┐   Chrome messaging   ┌──────────────────────────┐  │
│  │  Side Panel   │ ◄──────────────────► │  Background Service      │  │
│  │  (React UI)   │                      │  Worker                  │  │
│  └──────────────┘                       │  ┌────────┐ ┌─────────┐ │  │
│                                         │  │Planner │ │Navigator│ │  │
│  ┌──────────────┐                       │  └────────┘ └─────────┘ │  │
│  │  Options Page │  chrome.storage      │  ┌──────────────────┐   │  │
│  │  (React UI)   │ ◄──────────────────► │  │ Browser Context   │   │  │
│  └──────┬───────┘                       │  │ (DOM automation)  │   │  │
│         │                               │  └──────────────────┘   │  │
│         │                               └──────────────────────────┘  │
│         │ fetch (HTTP)                                                │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│   Orchestrator Server        │
│   (Express + SQLite)         │
│                              │
│   POST /api/rules            │
│   GET  /api/rules            │
│   GET  /api/rules/:id        │
│   PUT  /api/rules/:id        │
│   DELETE /api/rules/:id      │
│   GET  /health               │
└──────────────────────────────┘
```

The system has two independently deployable parts:

| Component | Technology | Purpose |
|---|---|---|
| **Chrome Extension** | Manifest V3, React, Vite, LangChain.js | Runs AI agents locally in the browser, automates web pages |
| **Orchestrator Server** | Node.js, Express, better-sqlite3 | Central rule repository that teams can share |

The Chrome Extension works **fully offline** – the Orchestrator Server is
optional and only needed when teams want to share automation rules.

---

## Chrome Extension

### Workspace Layout

```
chrome-extension/          # MV3 manifest + background service worker
├── manifest.js            # Dynamic manifest generation
├── vite.config.mts        # Vite build config (IIFE bundle)
└── src/
    └── background/
        ├── index.ts       # Service worker entry point
        ├── agent/         # Multi-agent system (Navigator, Planner)
        ├── browser/       # DOM automation via Chrome Debugger API
        └── services/      # Analytics, speech-to-text

pages/                     # React UI pages
├── side-panel/            # Chat interface (main user interaction)
├── options/               # Settings page (models, firewall, rules)
└── content/               # Content script injected into web pages

packages/                  # Shared libraries
├── storage/               # Chrome extension storage abstraction
│   └── lib/rules/         # Rules CRUD on chrome.storage.local
├── i18n/                  # Internationalization
├── ui/                    # Shared React components
├── shared/                # Common types & utilities
└── ...                    # dev-utils, hmr, vite-config, etc.
```

### Key Concepts

| Concept | Description |
|---|---|
| **Background Service Worker** | The MV3 service worker (`chrome-extension/src/background/index.ts`) hosts the multi-agent executor. It communicates with the side panel via `chrome.runtime.Port`. |
| **Multi-Agent System** | A **Planner** agent breaks tasks into steps; a **Navigator** agent executes each step by interacting with the DOM through the Chrome Debugger Protocol. |
| **Rules (local)** | Users can create automation rules stored in `chrome.storage.local` via the `@extension/storage` package. |
| **Options Page** | React page where users configure LLM providers, models, firewall rules, and manage local/server rules. |

### Build Output

Running `pnpm build` produces the `dist/` directory which is loaded as an
unpacked Chrome extension:

```
dist/
├── manifest.json
├── background.iife.js      # Service worker
├── side-panel/index.html   # Side panel UI
├── options/index.html      # Options page
├── content/index.iife.js   # Content script
└── ...                     # Icons, assets
```

---

## Orchestrator Server

The orchestrator server (`server/`) is a lightweight Express API backed by
SQLite. It acts as a central rule repository for teams to push and pull
automation rules.

### Source Layout

```
server/
├── package.json       # @extension/server
├── tsconfig.json
├── .env.example       # Environment variable documentation
└── src/
    ├── index.ts       # Express app + global error handler
    ├── routes.ts      # REST routes for /api/rules
    └── database.ts    # SQLite CRUD helpers (better-sqlite3)
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check – returns `{ "status": "ok" }` |
| `GET` | `/api/rules` | List all rules (optional `?q=` search) |
| `GET` | `/api/rules/:id` | Get a single rule by ID |
| `POST` | `/api/rules` | Create a new rule |
| `PUT` | `/api/rules/:id` | Update an existing rule |
| `DELETE` | `/api/rules/:id` | Delete a rule |

### Database

The server uses **better-sqlite3** with WAL mode. The database file
(`rules.db`) is created automatically in the current working directory on first
start.

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS rules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Data Flow

### Rule Push (Extension → Server)

1. User clicks **Push** on a local rule in the Options page
2. `RuleSettings.tsx` sends `POST /api/rules` to the orchestrator server
3. Server validates input, generates a UUID, inserts into SQLite
4. Server responds with the created rule
5. Extension UI refreshes the server rules list

### Rule Pull (Server → Extension)

1. User clicks **Pull** on a server rule (or **Pull All**)
2. `RuleSettings.tsx` sends `GET /api/rules` to fetch server rules
3. For each rule, checks if a local rule with matching `serverId` exists:
   - **Exists**: updates the local copy via `rulesStorage.updateRule()`
   - **New**: creates a local copy via `rulesStorage.addRule()` with `source: 'server'`
4. Extension UI refreshes the local rules list

### Agent Execution

1. User types a task in the side panel
2. Side panel sends `new_task` message via `chrome.runtime.Port`
3. Background service worker sets up the Executor with configured LLM models
4. Planner agent breaks the task into steps
5. Navigator agent executes each step using Chrome Debugger Protocol
6. Execution events stream back to the side panel in real time

---

## Development Setup

### Prerequisites

- **Node.js** ≥ 22.12.0 (see `.nvmrc`)
- **pnpm** ≥ 9.15.1 (`corepack enable && corepack prepare pnpm@9.15.1 --activate`)

### Install & Build

```bash
# Clone the repository
git clone https://github.com/nanobrowser/nanobrowser.git
cd nanobrowser

# Install all dependencies
pnpm install

# Build the Chrome extension
pnpm build

# Start the orchestrator server in dev mode (optional)
pnpm -F @extension/server dev
```

### Development Mode

```bash
# Start all workspaces in watch mode (extension + pages)
pnpm dev

# Start only the orchestrator server with hot reload
pnpm -F @extension/server dev
```

### Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` directory

---

## Deployment

### Chrome Extension

The extension is distributed in two ways:

1. **Chrome Web Store** – Upload the `dist-zip/` archive created by `pnpm zip`
2. **Manual install** – Share the `dist/` directory or the zip file

```bash
# Build + create zip for distribution
pnpm zip
# Output: dist-zip/nanobrowser-<version>.zip
```

### Orchestrator Server

The server can be deployed anywhere Node.js runs. Below are common options.

#### Option A: Direct Node.js (VPS / VM)

```bash
cd server

# Install production dependencies
pnpm install --prod

# Build TypeScript
pnpm build

# Set environment variables
export PORT=3456
export CORS_ORIGIN='*'   # or restrict to your extension origin

# Start the server
node dist/index.js
```

Use a process manager like **pm2** to keep the server alive:

```bash
npm install -g pm2
pm2 start dist/index.js --name nanobrowser-server
pm2 save
pm2 startup
```

#### Option B: Docker

Create a `Dockerfile` in the `server/` directory:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY dist/ ./dist/
EXPOSE 3456
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
cd server
pnpm build
docker build -t nanobrowser-server .
docker run -d -p 3456:3456 \
  -e CORS_ORIGIN='*' \
  -v nanobrowser-data:/app \
  nanobrowser-server
```

> **Note**: The SQLite database file (`rules.db`) is stored in the working
> directory. Use a Docker volume to persist data across container restarts.

#### Option C: Cloud Platforms

The server is a standard Express app compatible with:

- **Railway** / **Render** / **Fly.io** – Set the root directory to `server/`, add build command `pnpm build`, start command `node dist/index.js`
- **AWS EC2 / GCP Compute** – Follow Option A above
- **Kubernetes** – Containerize with Option B, mount a PersistentVolume for `rules.db`

### Connecting Extension to Server

1. Deploy the orchestrator server and note its URL (e.g., `https://rules.example.com`)
2. Open the extension Options page → **Rules** tab
3. Enter the server URL and click **Save**
4. Use **Push** / **Pull** to sync rules with the server

---

## Environment Variables

### Chrome Extension

| Variable | File | Description |
|---|---|---|
| `VITE_POSTHOG_API_KEY` | `.env.local` | PostHog analytics API key (optional) |
| `VITE_POSTHOG_HOST` | `.env.local` | Custom PostHog host (optional) |

### Orchestrator Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3456` | Port the server listens on |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (set to `chrome-extension://<id>` for production) |

See `server/.env.example` for a template.
