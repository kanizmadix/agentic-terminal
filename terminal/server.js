const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3333;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENTS = {
  researcher: { name:'RESEARCHER', color:'#00d4ff', system:'You are an expert research specialist. Synthesise information clearly, think critically, and format all responses in clean markdown with headers, bullets, and tables where helpful.' },
  coder:      { name:'CODER',      color:'#00ff41', system:'You are a senior software engineer. Write clean, idiomatic, production-ready code. Always use fenced code blocks with the correct language identifier. When generating diagrams, use mermaid code blocks.' },
  creative:   { name:'CREATIVE',   color:'#ff44ff', system:'You are a master creative writer with range across all forms — fiction, poetry, scripts, worldbuilding. Be vivid, original, and never generic.' },
  analyst:    { name:'ANALYST',    color:'#ffaa00', system:'You are a sharp strategic analyst. Apply frameworks (SWOT, Porter Five Forces, OKRs) precisely. Use markdown tables and structured headers. Give clear recommendations.' },
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/chat', async (req, res) => {
  const { agent, messages, model } = req.body;
  const cfg = AGENTS[agent] || AGENTS.researcher;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  try {
    const stream = client.messages.stream({ model: model||'claude-sonnet-4-6', max_tokens: 4096, system: cfg.system, messages });
    stream.on('text', t => res.write(`data: ${JSON.stringify({ type:'text', text:t })}\n\n`));
    stream.on('finalMessage', m => { res.write(`data: ${JSON.stringify({ type:'done', usage:m.usage })}\n\n`); res.end(); });
    stream.on('error', e => { res.write(`data: ${JSON.stringify({ type:'error', error:e.message })}\n\n`); res.end(); });
    req.on('close', () => stream.abort?.());
  } catch (err) { res.write(`data: ${JSON.stringify({ type:'error', error:err.message })}\n\n`); res.end(); }
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`);
    const d = await r.json();
    res.json({ abstract: d.AbstractText, source: d.AbstractSource, url: d.AbstractURL, answer: d.Answer,
      related: (d.RelatedTopics||[]).filter(t=>t.Text).slice(0,5).map(t=>({ text:t.Text, url:t.FirstURL })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents', (_req, res) => res.json(Object.entries(AGENTS).map(([id,c])=>({ id, name:c.name, color:c.color }))));

app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
