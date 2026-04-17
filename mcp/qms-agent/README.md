# QMS Agent MCP (Cursor bridge)

Stdio MCP server that calls your deployed QMS:

- `qms_list_open_requests` → `GET /api/agent/mcp/open-requests` + `X-Agent-Mcp-Secret`
- `qms_health` → `GET /api/health`

## Setup

See **[docs/agent-mcp/CURSOR_MCP_SETUP.md](../../docs/agent-mcp/CURSOR_MCP_SETUP.md)** for Railway variables and Cursor `mcpServers` JSON.

```bash
npm install
```

Run is managed by Cursor via `node .../index.mjs` (not usually run manually).
