const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3333;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages,
    });
    stream.on('text', t => res.write(`data: ${JSON.stringify({ type: 'text', text: t })}\n\n`));
    stream.on('finalMessage', m => {
      res.write(`data: ${JSON.stringify({ type: 'done', usage: m.usage })}\n\n`);
      res.end();
    });
    stream.on('error', e => { res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`); res.end(); });
    req.on('close', () => stream.abort?.());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

app.get('/api/ping', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
