require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MIDDLEWARE DE AUTENTICAÇÃO
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

// ROTAS
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/fretes', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('fretes').select('*').order('numero_nf');
    if (error) throw error;
    const fretes = data.map(f => ({ ...f, observacoes: f.observacoes ? JSON.parse(f.observacoes) : [] }));
    res.json(fretes);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar fretes' });
  }
});

app.get('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('fretes').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ...data, observacoes: data.observacoes ? JSON.parse(data.observacoes) : [] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar frete' });
  }
});

app.post('/api/fretes', authMiddleware, async (req, res) => {
  try {
    const frete = req.body;
    frete.observacoes = JSON.stringify(frete.observacoes || []);
    frete.created_at = new Date().toISOString();
    frete.username = req.username;
    const { data, error } = await supabase.from('fretes').insert(frete).select().single();
    if (error) throw error;
    res.status(201).json({ ...data, observacoes: JSON.parse(data.observacoes) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar frete' });
  }
});

app.put('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const frete = req.body;
    frete.observacoes = JSON.stringify(frete.observacoes || []);
    frete.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('fretes').update(frete).eq('id', req.params.id).select().single();
    if (error) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ...data, observacoes: JSON.parse(data.observacoes) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar frete' });
  }
});

app.patch('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('fretes').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ...data, observacoes: data.observacoes ? JSON.parse(data.observacoes) : [] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar frete' });
  }
});

app.delete('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('fretes').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar frete' });
  }
});

app.get('/api/transportadoras', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('transportadoras').select('*').order('nome');
    if (error) throw error;
    res.json(data.map(t => t.nome));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar transportadoras' });
  }
});

app.post('/api/transportadoras', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('transportadoras').insert({ nome: req.body.nome.toUpperCase() }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar transportadora' });
  }
});

app.delete('/api/transportadoras/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('transportadoras').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar transportadora' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
