// Dev-only bridge to the my-genai MCP server. The browser can't call the server
// directly (no CORS, and generation is exposed only over the MCP protocol), so
// this Vite middleware speaks MCP from Node — where there's no CORS — and gives
// the editor a plain same-origin endpoint:
//
//   POST /api/genai/generate  { prompt, width?, height?, workflow?, provider? }
//     → { dataUrl, sourceUrl }   (image fetched server-side, returned inline)
//
// Only active under `npm run dev`. Configure the server via GENAI_MCP_URL.
const MCP_URL = process.env.GENAI_MCP_URL || 'https://genai.home.codepoet.site/mcp/';
const ORIGIN = new URL(MCP_URL).origin;

// MCP Streamable HTTP replies are SSE (`data: {json}`) or plain JSON.
function parseMessages(text, contentType) {
  if (contentType && contentType.includes('application/json')) {
    try { return [JSON.parse(text)]; } catch { return []; }
  }
  const out = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (s.startsWith('data:')) { try { out.push(JSON.parse(s.slice(5).trim())); } catch { /* skip */ } }
  }
  return out;
}

async function rpc(session, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session.id) headers['mcp-session-id'] = session.id;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) session.id = sid;
  return parseMessages(await res.text(), res.headers.get('content-type'));
}

async function generateViaMcp(args) {
  const session = {};
  await rpc(session, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'poc-tile-editor', version: '0.1' } } });
  await rpc(session, { jsonrpc: '2.0', method: 'notifications/initialized' });
  const msgs = await rpc(session, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'generate_image', arguments: args } });
  const resp = msgs.find((m) => m.id === 2 && (m.result || m.error));
  if (!resp) throw new Error('no tool response from MCP');
  if (resp.error) throw new Error(resp.error.message || 'MCP error');
  let payload = resp.result.structuredContent;
  if (!payload && Array.isArray(resp.result.content)) {
    const t = resp.result.content.find((c) => c.type === 'text');
    if (t) { try { payload = JSON.parse(t.text); } catch { /* leave null */ } }
  }
  const img = payload && payload.images && payload.images[0];
  const url = img && (img.url || img.path);
  if (!url) throw new Error('MCP result had no image');
  return url;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function genaiBridge() {
  return {
    name: 'genai-bridge',
    configureServer(server) {
      server.middlewares.use('/api/genai/generate', async (req, res) => {
        const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
        if (req.method !== 'POST') return json(405, { error: 'POST only' });
        try {
          const body = await readJson(req);
          if (!body.prompt) return json(400, { error: 'prompt required' });
          const args = {
            prompt: body.prompt,
            provider: body.provider || 'comfyui',
            workflow: body.workflow || 'z-image-turbo',
            width: body.width || 512,
            height: body.height || 512,
          };
          if (body.negative_prompt) args.negative_prompt = body.negative_prompt;
          if (body.seed != null) args.seed = body.seed;
          const url = await generateViaMcp(args);
          const abs = url.startsWith('http') ? url : ORIGIN + url;
          const imgRes = await fetch(abs);
          if (!imgRes.ok) throw new Error('image fetch failed: ' + imgRes.status);
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mime = imgRes.headers.get('content-type') || 'image/png';
          json(200, { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, sourceUrl: abs });
        } catch (e) {
          json(500, { error: String((e && e.message) || e) });
        }
      });
    },
  };
}
