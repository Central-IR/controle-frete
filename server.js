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
// SUPABASE CLIENT
// ============================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
async function authMiddleware(req, res, next) {
  // Em desenvolvimento, pula autenticação
  if (process.env.DEVELOPMENT_MODE === 'true') {
    req.username = 'dev-user';
    return next();
  }

  const sessionToken = req.headers['x-session-token'];

  if (!sessionToken) {
    return res.status(401).json({ error: 'Token de sessão não fornecido' });
  }

  try {
    // Valida o token na tabela de sessões do portal
    const { data: session, error } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token', sessionToken)
      .single();

    if (error || !session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Sessão expirada' });
    }

    req.username = session.username;
    next();
  } catch (err) {
    console.error('Erro no middleware de auth:', err);
    return res.status(401).json({ error: 'Erro ao validar sessão' });
  }
}

// ============================================
// HEALTH CHECK (sem autenticação)
// ============================================
app.get('/health', (req, res) => {
res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ============================================
// ROTAS DE TRANSPORTADORAS
// ============================================

// GET /api/transportadoras — Lista todas as transportadoras
app.get('/api/transportadoras', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transportadoras')
      .select('*')
      .order('nome', { ascending: true });

    if (error) throw error;

    // Retorna array de strings com os nomes
    const nomes = data.map(t => t.nome);
    res.json(nomes);
  } catch (err) {
    console.error('Erro ao buscar transportadoras:', err);
    res.status(500).json({ error: 'Erro ao buscar transportadoras', details: err.message });
  }
});

// POST /api/transportadoras — Adiciona nova transportadora
app.post('/api/transportadoras', authMiddleware, async (req, res) => {
  try {
    const { nome } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome da transportadora é obrigatório' });
    }

    const { data, error } = await supabase
      .from('transportadoras')
      .insert({ nome: nome.trim().toUpperCase() })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Erro ao criar transportadora:', err);
    res.status(500).json({ error: 'Erro ao criar transportadora', details: err.message });
  }
});

// DELETE /api/transportadoras/:id — Remove transportadora
app.delete('/api/transportadoras/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('transportadoras')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar transportadora:', err);
    res.status(500).json({ error: 'Erro ao deletar transportadora', details: err.message });
  }
});

// ============================================
// ROTAS DE FRETES
// ============================================

// GET /api/fretes — Lista todos os fretes
app.get('/api/fretes', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fretes')
      .select('*')
      .order('numero_nf', { ascending: true });

    if (error) throw error;

    // Garante que observacoes seja retornado como array
    const fretes = data.map(f => ({
      ...f,
      observacoes: parseObservacoes(f.observacoes)
    }));

    res.json(fretes);
  } catch (err) {
    console.error('Erro ao buscar fretes:', err);
    res.status(500).json({ error: 'Erro ao buscar fretes', details: err.message });
  }
});

// GET /api/fretes/:id — Busca um frete por ID
app.get('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('fretes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Frete não encontrado' });
    }

    res.json({
      ...data,
      observacoes: parseObservacoes(data.observacoes)
    });
  } catch (err) {
    console.error('Erro ao buscar frete:', err);
    res.status(500).json({ error: 'Erro ao buscar frete', details: err.message });
  }
});

// POST /api/fretes — Cria novo frete
app.post('/api/fretes', authMiddleware, async (req, res) => {
  try {
    const freteData = sanitizarFrete(req.body);

    // Validações obrigatórias
    if (!freteData.numero_nf) {
      return res.status(400).json({ error: 'Número da NF é obrigatório' });
    }
    if (!freteData.nome_orgao) {
      return res.status(400).json({ error: 'Nome do órgão é obrigatório' });
    }
    if (!freteData.data_coleta) {
      return res.status(400).json({ error: 'Data de coleta é obrigatória' });
    }

    // Define status inicial
    if (!freteData.status) {
      const tiposComStatus = ['ENVIO', 'SIMPLES_REMESSA', 'REMESSA_AMOSTRA'];
      freteData.status = tiposComStatus.includes(freteData.tipo_nf) ? 'EM_TRANSITO' : null;
    }

    freteData.created_at = new Date().toISOString();
    freteData.username = req.username;

    const { data, error } = await supabase
      .from('fretes')
      .insert(freteData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      ...data,
      observacoes: parseObservacoes(data.observacoes)
    });
  } catch (err) {
    console.error('Erro ao criar frete:', err);
    res.status(500).json({ error: 'Erro ao criar frete', details: err.message });
  }
});

// PUT /api/fretes/:id — Atualiza frete completo
app.put('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const freteData = sanitizarFrete(req.body);

    freteData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('fretes')
      .update(freteData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Frete não encontrado' });
    }

    res.json({
      ...data,
      observacoes: parseObservacoes(data.observacoes)
    });
  } catch (err) {
    console.error('Erro ao atualizar frete:', err);
    res.status(500).json({ error: 'Erro ao atualizar frete', details: err.message });
  }
});

// PATCH /api/fretes/:id — Atualiza campos específicos (ex: status, data_entrega)
app.patch('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Permite apenas campos seguros no PATCH
    const allowedFields = ['status', 'data_entrega', 'observacoes'];
    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    filteredUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('fretes')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Frete não encontrado' });
    }

    res.json({
      ...data,
      observacoes: parseObservacoes(data.observacoes)
    });
  } catch (err) {
    console.error('Erro ao atualizar frete (PATCH):', err);
    res.status(500).json({ error: 'Erro ao atualizar frete', details: err.message });
  }
});

// DELETE /api/fretes/:id — Deleta frete
app.delete('/api/fretes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('fretes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao deletar frete:', err);
    res.status(500).json({ error: 'Erro ao deletar frete', details: err.message });
  }
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Garante que observacoes seja sempre um array válido
 */
function parseObservacoes(obs) {
  if (!obs) return [];
  if (Array.isArray(obs)) return obs;
  try {
    const parsed = JSON.parse(obs);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Sanitiza e normaliza os dados do frete antes de salvar
 */
function sanitizarFrete(body) {
  const frete = { ...body };

  // Campos de texto — converte para uppercase e limpa
  const camposTexto = ['numero_nf', 'documento', 'nome_orgao', 'contato_orgao',
                       'vendedor', 'transportadora', 'cidade_destino'];
  camposTexto.forEach(campo => {
    if (frete[campo] && frete[campo] !== 'NÃO INFORMADO') {
      frete[campo] = frete[campo].toString().trim().toUpperCase();
    }
  });

  // Campos numéricos
  frete.valor_nf = frete.valor_nf ? parseFloat(frete.valor_nf) : 0;
  frete.valor_frete = frete.valor_frete ? parseFloat(frete.valor_frete) : 0;

  // Campos de data — converte string vazia para null
  const camposData = ['data_emissao', 'data_coleta', 'previsao_entrega', 'data_entrega'];
  camposData.forEach(campo => {
    if (!frete[campo] || frete[campo] === '') {
      frete[campo] = null;
    }
  });

  // Tipo NF padrão
  if (!frete.tipo_nf) {
    frete.tipo_nf = 'ENVIO';
  }

  // Observacoes — garante que seja string JSON para o banco
  if (frete.observacoes) {
    if (typeof frete.observacoes === 'string') {
      try {
        JSON.parse(frete.observacoes); // valida se é JSON válido
      } catch {
        frete.observacoes = '[]';
      }
    } else if (Array.isArray(frete.observacoes)) {
      frete.observacoes = JSON.stringify(frete.observacoes);
    }
  } else {
    frete.observacoes = '[]';
  }

  return frete;
}

// ============================================
// FALLBACK — SERVIR INDEX.HTML PARA SPA
// ============================================
app.get('*', (req, res) => {
  // Não interceptar rotas de API
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(port, () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
  console.log(`📍 API disponível em http://localhost:${port}/api`);
  console.log(`🔧 Modo desenvolvimento: ${process.env.DEVELOPMENT_MODE === 'true'}`);
});
