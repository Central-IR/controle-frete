require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================
// SUPABASE
// ============================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// SERVER ARQUIVOS ESTÁTICOS - TEM QUE SER A PRIMEIRA ROTA
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
async function authMiddleware(req, res, next) {
  const sessionToken = req.headers['x-session-token'];

  if (!sessionToken) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token', sessionToken)
      .single();

    if (error || !session) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Sessão expirada' });
    }

    req.username = session.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Erro na autenticação' });
  }
}

// ============================================
// ROTAS DA API
// ============================================
app.get('/api/fretes', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('fretes').select('*').order('numero_nf');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar fretes' });
  }
});

app.post('/api/fretes', authMiddleware, async (req, res) => {
  // suas rotas...
  res.json({});
});

app.put('/api/fretes/:id', authMiddleware, async (req, res) => {
  res.json({});
});

app.delete('/api/fretes/:id', authMiddleware, async (req, res) => {
  res.json({});
});

app.patch('/api/fretes/:id', authMiddleware, async (req, res) => {
  res.json({});
});

// ============================================
// NÃO TEM FALLBACK! O express.static JÁ SERVE OS ARQUIVOS
// Se chegar aqui, é 404
// ============================================
app.use((req, res) => {
  // Se for API, retorna 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  // Se for arquivo estático que não existe, 404
  res.status(404).send('Arquivo não encontrado');
});

app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
