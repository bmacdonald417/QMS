#!/usr/bin/env node
/**
 * Stdio MCP server: exposes QMS Agent intake to Cursor via your deployed API.
 * Logs must go to stderr only (stdout is the MCP JSON-RPC stream).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = (process.env.QMS_BASE_URL || '').replace(/\/+$/, '');
const AGENT_MCP_SECRET = process.env.AGENT_MCP_SECRET || '';

function requireConfig() {
  if (!BASE_URL) {
    console.error('QMS_BASE_URL is required (e.g. https://quality.mactechsolutionsllc.com)');
    process.exit(1);
  }
  if (!AGENT_MCP_SECRET) {
    console.error('AGENT_MCP_SECRET is required (must match Railway / server env)');
    process.exit(1);
  }
}

async function fetchOpenRequests({ take = 50 } = {}) {
  const url = new URL('/api/agent/mcp/open-requests', BASE_URL);
  if (take && take > 0 && take <= 200) url.searchParams.set('take', String(take));
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-Agent-Mcp-Secret': AGENT_MCP_SECRET },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`open-requests failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`open-requests: invalid JSON: ${text.slice(0, 300)}`);
  }
}

async function fetchHealth() {
  const url = new URL('/api/health', BASE_URL);
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 2000) };
}

const server = new Server({ name: 'qms-agent', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'qms_list_open_requests',
      description:
        'Fetch open QMS Agent requests from the deployed MacTech QMS (read-only intake). Uses AGENT_MCP_SECRET on the server.',
      inputSchema: {
        type: 'object',
        properties: {
          take: {
            type: 'number',
            description: 'Max requests to return (1–200, default 50)',
            minimum: 1,
            maximum: 200,
          },
        },
      },
    },
    {
      name: 'qms_health',
      description: 'Check that the QMS API is reachable (GET /api/health, no MCP secret).',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params?.name;
  const args = request.params?.arguments && typeof request.params.arguments === 'object' ? request.params.arguments : {};

  if (name === 'qms_list_open_requests') {
    const take = typeof args.take === 'number' && Number.isFinite(args.take) ? Math.floor(args.take) : 50;
    const data = await fetchOpenRequests({ take });
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  if (name === 'qms_health') {
    const h = await fetchHealth();
    return {
      content: [{ type: 'text', text: JSON.stringify(h, null, 2) }],
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main() {
  requireConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`QMS Agent MCP connected (stdio). Base URL: ${BASE_URL}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
