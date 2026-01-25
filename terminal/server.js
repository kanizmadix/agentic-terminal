const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3333;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENTS = {
  researcher: {
    name: 'RESEARCHER',
    system: 'You are an expert research specialist. Synthesise information clearly, think critically, and format responses in markdown.',
  },
  coder: {
    name: 'CODER',
    system: 'You are a senior software engineer. Write clean, production-ready code. Always use fenced code blocks with the correct language identifier.',
  },
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/chat', async (req, res) => {
  const { agent, messages } = req.body;
  const cfg = AGENTS[agent] || AGENTS.researcher;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: cfg.system, messages });
    stream.on('text', t => res.write(`data: ${JSON.stringify({ type: 'text', text: t })}\n\n`));
    stream.on('finalMessage', m => { res.write(`data: ${JSON.stringify({ type: 'done', usage: m.usage })}\n\n`); res.end(); });
    stream.on('error', e => { res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`); res.end(); });
    req.on('close', () => stream.abort?.());
  } catch (err) { res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`); res.end(); }
});

app.get('/api/agents', (_req, res) => res.json(Object.entries(AGENTS).map(([id, c]) => ({ id, name: c.name }))));

app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
