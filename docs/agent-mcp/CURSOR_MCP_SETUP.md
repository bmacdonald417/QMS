# Cursor MCP → your deployed QMS

This connects **Cursor’s MCP client** to your **production (or staging) QMS** so the assistant can call tools that read your **QMS Agent intake** (open requests). It does **not** grant full admin API access: only what the MCP server exposes (today: `open-requests` + health check).

## 1. Railway (or any host)

On the **QMS web service** (same service that runs `node src/index.js`):

1. **Variables → New variable**
   - **`AGENT_MCP_SECRET`** — long random string (32+ bytes), e.g.  
     `openssl rand -base64 32`  
   - Keep it **secret**; treat like a password.

2. Redeploy so the server starts with the variable set.

Without this, `GET /api/agent/mcp/open-requests` returns **503** and the log may mention missing configuration.

## 2. Base URL

Use the **public origin** of your API (same host that serves `/api/health`):

- Example: `https://quality.mactechsolutionsllc.com`  
- **No** trailing slash.

## 3. Install the local MCP bridge (this repo)

The bridge is a small Node app under **`mcp/qms-agent/`** (stdio MCP server → HTTP to your site).

```bash
cd mcp/qms-agent
npm install
```

## 4. Register MCP in Cursor

**Cursor → Settings → MCP** (or edit your MCP config JSON).

Add a server that runs the bridge **on your machine**, with env vars (do **not** commit real secrets into git):

```json
{
  "mcpServers": {
    "qms-agent": {
      "command": "node",
      "args": ["C:/Users/YOU/.cursor/QMS/mcp/qms-agent/index.mjs"],
      "env": {
        "QMS_BASE_URL": "https://quality.mactechsolutionsllc.com",
        "AGENT_MCP_SECRET": "paste-the-same-value-as-railway-AGENT_MCP_SECRET"
      }
    }
  }
}
```

- Replace the **`args`** path with the **absolute path** to `mcp/qms-agent/index.mjs` on your PC (Windows or macOS/Linux).
- **`AGENT_MCP_SECRET`** here must **match** Railway exactly.

After saving, restart Cursor or reload MCP. You should see **`qms-agent`** with tools **`qms_list_open_requests`** and **`qms_health`**.

## 5. Security notes

- **`AGENT_MCP_SECRET`** protects a **read-only** list of open agent requests. Anyone with the secret can read that payload; rotate if leaked.
- Prefer **per-environment** secrets (prod vs staging).
- Do **not** put the secret in the repo, screenshots, or shared docs.

## 6. HTTP API reference

| Tool | Maps to |
|------|---------|
| `qms_list_open_requests` | `GET /api/agent/mcp/open-requests` with header `X-Agent-Mcp-Secret: <AGENT_MCP_SECRET>` |
| `qms_health` | `GET /api/health` |

See also `docs/agent-mcp/README.md` and `server/.env.example` (`AGENT_MCP_SECRET`).

## 7. Optional: more tools later

If you need Cursor to call **authenticated** APIs (create requests, execution packages, etc.), that requires **user JWT** or **integration tokens** (`INTEGRATION_JWT_SECRET` + client credentials) — a different design than the shared MCP secret. Extend `mcp/qms-agent/index.mjs` carefully and avoid storing long-lived user passwords in MCP config.
