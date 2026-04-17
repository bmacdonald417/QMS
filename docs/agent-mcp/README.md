# QMS Agent (MCP-ready intake)

This repository ships the **QMS Agent** as part of the **Express API** + **Vite/React** client (not Next.js). The design mirrors what you would build in **Next.js 14 App Router** using:

- **Route handlers** (`app/api/.../route.ts`) instead of `server/src/agent/agentRoutes.js`
- **Server Actions** instead of `fetch('/api/agent/requests')` from the client
- The same **Prisma models** and validation shapes

## Principles

- **Intake only**: requests are persisted, auditable, and reviewable. There is **no** autonomous apply-to-production path from this feature.
- **Two surfaces**:
  1. **Human UI**: floating **QMS Agent** panel (System Admin) + **System → QMS Agent** dashboard.
  2. **Automation / Cursor MCP**: read-only pull of open specs via secret header (see below).

## Environment

| Variable | Purpose |
|----------|---------|
| `AGENT_MCP_SECRET` | Shared secret for `GET /api/agent/mcp/open-requests` (`X-Agent-Mcp-Secret` header). |

## Cursor MCP (connect the assistant to your site)

Step-by-step: **[CURSOR_MCP_SETUP.md](./CURSOR_MCP_SETUP.md)** — Railway `AGENT_MCP_SECRET`, local `mcp/qms-agent` install, and Cursor `mcpServers` config.

## HTTP API (current)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/agent/requests` | JWT Bearer, role **System Admin** |
| `GET` | `/api/agent/requests` | JWT Bearer, System Admin |
| `GET` | `/api/agent/requests/:id` | JWT Bearer, System Admin |
| `PATCH` | `/api/agent/requests/:id` | JWT Bearer, System Admin |
| `GET` | `/api/agent/mcp/open-requests` | `X-Agent-Mcp-Secret: <AGENT_MCP_SECRET>`; optional query `take=1..200` (default 200) |
| `GET` | `/api/agent/contracts` | JWT Bearer, System Admin |

## Next.js 14 porting checklist

1. Copy Prisma enums/models from `server/prisma/schema.prisma` (Agent* / Workflow*).
2. Move Zod shapes from `server/src/agent/agentSchemas.js` to `lib/agent/schemas.ts` (or colocate with server actions).
3. Replace Express handlers with **Route Handlers** that call the same service functions (extract service from `agentService.js` into shared `packages/agent-core` if desired).
4. Protect routes with your session helper (e.g. `getServerSession`) requiring **System Admin** (or map `agent:*` permissions).
5. Replace `QmsAgentFab` with a client component mounted in `app/(app)/layout.tsx`.
6. Map `AGENT_MCP_SECRET` to Route Handler `GET /api/agent/mcp/open-requests` (or Edge middleware).

## JSON samples

See:

- `docs/agent-mcp/contracts/suggest-update.request.sample.json`
- `docs/agent-mcp/contracts/build-workflow.request.sample.json`
- `docs/agent-mcp/contracts/open-requests.response.sample.json`
