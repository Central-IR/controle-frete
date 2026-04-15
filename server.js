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

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// LISTAR FRETES
app.get('/api/fretes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fretes')
      .select('*')
      .order('numero_nf', { ascending: true });
    
    if (error) {
      console.error('Erro Supabase:', error);
      return res.status(500).json({ error: error.message });
    }
    
    // Formatar os dados pro frontend
    const fretes = data.map(item => {
      let observacoes = [];
      if (item.observacoes) {
        try {
          observacoes = typeof item.observacoes === 'string' 
            ? JSON.parse(item.observacoes) 
            : item.observacoes;
        } catch(e) {
          observacoes = [];
        }
      }
      return { ...item, observacoes };
    });
    
    res.json(fretes);
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// BUSCAR UM FRETE
app.get('/api/fretes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fretes')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) return res.status(404).json({ error: 'Não encontrado' });
    
    let observacoes = [];
    if (data.observacoes) {
      try {
        observacoes = typeof data.observacoes === 'string' 
          ? JSON.parse(data.observacoes) 
          : data.observacoes;
      } catch(e) {}
    }
    
    res.json({ ...data, observacoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRIAR FRETE
app.post('/api/fretes', async (req, res) => {
  try {
    const frete = { ...req.body };
    frete.observacoes = JSON.stringify(frete.observacoes || []);
    frete.created_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('fretes')
      .insert(frete)
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.status(201).json({ ...data, observacoes: JSON.parse(data.observacoes) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ATUALIZAR FRETE COMPLETO
app.put('/api/fretes/:id', async (req, res) => {
  try {
    const frete = { ...req.body };
    frete.observacoes = JSON.stringify(frete.observacoes || []);
    frete.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('fretes')
      .update(frete)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ ...data, observacoes: JSON.parse(data.observacoes) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ATUALIZAR PARCIAL (status, data_entrega)
app.patch('/api/fretes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fretes')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    
    let observacoes = [];
    if (data.observacoes) {
      try {
        observacoes = typeof data.observacoes === 'string' 
          ? JSON.parse(data.observacoes) 
          : data.observacoes;
      } catch(e) {}
    }
    
    res.json({ ...data, observacoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETAR FRETE
app.delete('/api/fretes/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('fretes')
      .delete()
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TRANSPORTADORAS
app.get('/api/transportadoras', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transportadoras')
      .select('nome')
      .order('nome');
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.json(data.map(t => t.nome));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transportadoras', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transportadoras')
      .insert({ nome: req.body.nome.toUpperCase() })
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transportadoras/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('transportadoras')
      .delete()
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FALLBACK
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
