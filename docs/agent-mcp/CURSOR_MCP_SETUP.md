# Cursor MCP → your deployed QMS

This connects **Cursor’s MCP client** to your **production (or staging) QMS** so the assistant can call tools that read your **QMS Agent intake** (open requests). It does **not** grant full admin API access: only what the MCP server exposes (today: `open-requests` + health check).

## 1. Railway (or any host)

On the **QMS web service** (same service that runs `node src/index.js`):

1. **Variables → + New Variable**

2. **Variable name (exact spelling):** `AGENT_MCP_SECRET`  
   - Three letters: **M C P** (Model Context Protocol style “MCP”), **not** `MPC`.  
   - The app only reads `AGENT_MCP_SECRET`; any other name is ignored.

3. **Value:** paste a **literal** long random secret. Generate it locally using **one** of these (pick what works on your PC):

   - **Node** (if `node` works in a terminal — you already use it for this repo):
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - **OpenSSL** (no `cd` in front — run exactly this line). Works if Git for Windows or OpenSSL is on your `PATH`:
     ```bash
     openssl rand -base64 32
     ```
   - **PowerShell** (open **Windows PowerShell** or “Terminal” with PowerShell — **not** classic `cmd.exe`, because `[Convert]::...` is PowerShell syntax):
     ```powershell
     $b = New-Object byte[] 32
     [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
     [Convert]::ToBase64String($b)
     ```
   - **From Command Prompt (`cmd`)** but run PowerShell once:
     ```bat
     powershell -NoProfile -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)"
     ```

   Copy the **one line of base64 text** and paste it into Railway (and the same into Cursor MCP `AGENT_MCP_SECRET`).

4. **Ignore the `${{...}}` / reference dropdown for this variable**  
   Railway’s dropdown lists **references** to other variables (`DATABASE_URL`, `JWT_SECRET`, Railway system vars, etc.). There is **no** built‑in “agent” option — that is normal. You are **not** wiring this secret from Railway’s menu; you **type the name yourself** and **paste your own random string** as the value. Do **not** pick `${{DATABASE_URL}}` or similar for `AGENT_MCP_SECRET`.

5. Save, then **redeploy** the service so `process.env.AGENT_MCP_SECRET` is set at runtime.

Without this, `GET /api/agent/mcp/open-requests` returns **503** and the log may mention missing configuration.

### If “nothing works” or MCP returns errors — check the Railway value

**`AGENT_MCP_SECRET` must be a real secret string**, not a broken reference.

- **Wrong:** `${{AGENT_MPC_SECRET}}` — that references a variable named `AGENT_MPC_SECRET` (**MPC**). Your app reads **`AGENT_MCP_SECRET`** (**MCP**). If the referenced name does not exist, Railway will not inject a secret; the header check fails and automation sees **401** or empty behavior.
- **Right:** Paste a generated value directly into **`AGENT_MCP_SECRET`**, e.g. run locally:
  `openssl rand -base64 32`
  and paste the output as the variable value (no `${{ }}` unless you intentionally use a **Shared** variable with the **exact** name you reference).

Then set the **same literal value** in Cursor MCP `env.AGENT_MCP_SECRET` and redeploy Railway once after saving.

### “Nothing generated” but the tool runs

`qms_list_open_requests` returns JSON with a **`requests`** array. If it is **empty**, the API is working; there are simply **no open QMS Agent requests** in that database right now (statuses filtered to open pipeline only). Create a request from **System → QMS Agent** in the app, then run the tool again.

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
