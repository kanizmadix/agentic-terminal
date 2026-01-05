const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/ping', (_req, res) => res.json({ status: 'ok', time: new Date() }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
