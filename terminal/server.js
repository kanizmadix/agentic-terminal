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
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages,
    });
    res.json({ content: msg.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ping', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
