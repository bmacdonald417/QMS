import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes, { authMiddleware } from './auth.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`QMS API listening on http://localhost:${PORT}`);
});
