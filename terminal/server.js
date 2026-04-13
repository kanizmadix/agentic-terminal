require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname)));

// ─── Agent definitions ───────────────────────────────────────────────────────
const AGENTS = {
  researcher: {
    name: 'RESEARCHER',
    color: '#00d4ff',
    system: `You are an expert research specialist. You excel at synthesizing information, explaining complex topics clearly, and providing deep analysis. You think critically and cite reasoning. Format all responses in clean markdown with headers, bullet points, and code blocks where helpful. When asked about current events, acknowledge your knowledge cutoff and suggest using /search or /wiki for live data.`,
  },
  coder: {
    name: 'CODER',
    color: '#00ff41',
    system: `You are a senior software engineer with expertise across all languages and paradigms. You write clean, idiomatic, production-ready code. Always use fenced code blocks with the correct language identifier. Explain your implementation choices briefly. Prefer simple, readable solutions over clever ones. When generating architecture diagrams or flowcharts, output them as mermaid code blocks.`,
  },
  creative: {
    name: 'CREATIVE',
    color: '#ff00ff',
    system: `You are a master creative writer with range across all forms — fiction, poetry, scripts, game design, worldbuilding, character development, marketing copy. Your writing is vivid, original, and emotionally resonant. Embrace experimental forms when appropriate. Never be generic. Use markdown formatting for structure where helpful.`,
  },
  analyst: {
    name: 'ANALYST',
    color: '#ffaa00',
    system: `You are a sharp strategic analyst. You apply frameworks (SWOT, Porter's Five Forces, Jobs-to-be-Done, OKRs, etc.) with precision. You break complex problems into structured components, weigh tradeoffs explicitly, and give clear recommendations. Use markdown headers, tables, and bullet points for all responses. When relevant, use mermaid code blocks for flowcharts or decision trees.`,
  },
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Chat (streaming SSE) ─────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { agent, messages, model } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages provided' });

  const agentCfg = AGENTS[agent] || AGENTS.researcher;
  const selectedModel = model || 'claude-sonnet-4-6';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: selectedModel,
      max_tokens: 4096,
      system: agentCfg.system,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    stream.on('finalMessage', (message) => {
      res.write(`data: ${JSON.stringify({ type: 'done', usage: message.usage })}\n\n`);
      res.end();
    });

    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    });

    req.on('close', () => stream.abort?.());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// ─── DuckDuckGo instant answer search ────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    const data = await response.json();
    res.json({
      abstract: data.Abstract,
      abstractText: data.AbstractText,
      abstractSource: data.AbstractSource,
      abstractUrl: data.AbstractURL,
      answer: data.Answer,
      answerType: data.AnswerType,
      relatedTopics: (data.RelatedTopics || [])
        .filter((t) => t.Text)
        .slice(0, 6)
        .map((t) => ({ text: t.Text, url: t.FirstURL })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wikipedia summary ────────────────────────────────────────────────────────
app.get('/api/wiki', async (req, res) => {
  const { topic } = req.query;
  if (!topic) return res.status(400).json({ error: 'Missing topic' });
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page,
      thumbnail: data.thumbnail?.source,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Mermaid diagram generation via Claude ────────────────────────────────────
app.post('/api/diagram', async (req, res) => {
  const { description, type } = req.body;
  if (!description) return res.status(400).json({ error: 'Missing description' });
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Generate a Mermaid.js diagram for: "${description}".
Diagram type hint: ${type || 'choose the most appropriate type'}.
Return ONLY the raw Mermaid code (no markdown fences, no explanation).
Start directly with the diagram type keyword (graph, flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, etc.).`,
        },
      ],
    });
    let diagram = message.content[0].text.trim();
    // Strip markdown fences if model added them anyway
    diagram = diagram.replace(/^```(?:mermaid)?\n?/, '').replace(/\n?```$/, '').trim();
    res.json({ diagram });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent list ───────────────────────────────────────────────────────────────
app.get('/api/agents', (_req, res) => {
  res.json(
    Object.entries(AGENTS).map(([id, cfg]) => ({ id, name: cfg.name, color: cfg.color }))
  );
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const keyStatus = key && key !== 'sk-ant-api03-PASTE-YOUR-KEY-HERE'
    ? `✓ API key loaded (${key.slice(0, 12)}...)`
    : '✗ API key MISSING — add it to .env';

  console.log(`
╔══════════════════════════════════════════════╗
║       AI MULTI-AGENT TERMINAL  v1.0.0        ║
╠══════════════════════════════════════════════╣
║  Server  →  http://localhost:${PORT}           ║
║  ${keyStatus.padEnd(44)}║
╚══════════════════════════════════════════════╝

  Open http://localhost:${PORT} in your browser
`);
});
