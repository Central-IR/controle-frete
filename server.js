const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Helper function para calcular status
function calcularStatus(frete) {
    if (frete.status_especial) {
        return frete.status_especial;
    }
    
    if (frete.entregue) {
        return 'Entregue';
    }
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataEntrega = new Date(frete.data_entrega);
    dataEntrega.setHours(0, 0, 0, 0);
    
    if (dataEntrega < hoje) {
        return 'Fora do Prazo';
    }
    
    return 'Em Trânsito';
}

// GET - Buscar fretes por mês/ano
app.get('/api/fretes/:ano/:mes', async (req, res) => {
    try {
        const { ano, mes } = req.params;
        
        const { data: fretes, error: fretesError } = await supabase
            .from('fretes')
            .select('*')
            .eq('ano', parseInt(ano))
            .eq('mes', parseInt(mes))
            .order('numero_nf', { ascending: true });

        if (fretesError) throw fretesError;

        // Buscar observações para cada frete
        const fretesComObs = await Promise.all(fretes.map(async (frete) => {
            const { data: observacoes, error: obsError } = await supabase
                .from('frete_observacoes')
                .select('*')
                .eq('frete_id', frete.id)
                .order('created_at', { ascending: false });

            if (obsError) throw obsError;

            return {
                ...frete,
                observacoes: observacoes || []
            };
        }));

        res.json(fretesComObs);
    } catch (error) {
        console.error('Erro ao buscar fretes:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Criar novo frete
app.post('/api/fretes', async (req, res) => {
    try {
        const freteData = req.body;
        
        // Extrair mês e ano da data de emissão
        const dataEmissao = new Date(freteData.data_emissao);
        freteData.mes = dataEmissao.getMonth() + 1;
        freteData.ano = dataEmissao.getFullYear();

        const { data, error } = await supabase
            .from('fretes')
            .insert([freteData])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Erro ao criar frete:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT - Atualizar frete
app.put('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const freteData = req.body;
        
        // Extrair mês e ano da data de emissão
        const dataEmissao = new Date(freteData.data_emissao);
        freteData.mes = dataEmissao.getMonth() + 1;
        freteData.ano = dataEmissao.getFullYear();

        const { data, error } = await supabase
            .from('fretes')
            .update(freteData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar frete:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH - Toggle entregue
app.patch('/api/fretes/:id/toggle-entregue', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar o frete atual
        const { data: freteAtual, error: fetchError } = await supabase
            .from('fretes')
            .select('entregue')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Inverter o status
        const { data, error } = await supabase
            .from('fretes')
            .update({ entregue: !freteAtual.entregue })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Erro ao atualizar status de entrega:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Excluir frete
app.delete('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('fretes')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Frete excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir frete:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Adicionar observação
app.post('/api/fretes/:id/observacoes', async (req, res) => {
    try {
        const { id } = req.params;
        const { texto } = req.body;

        const { data, error } = await supabase
            .from('frete_observacoes')
            .insert([{
                frete_id: id,
                texto: texto
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Erro ao adicionar observação:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Excluir observação
app.delete('/api/observacoes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('frete_observacoes')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Observação excluída com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir observação:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Dashboard stats
app.get('/api/fretes/:ano/:mes/stats', async (req, res) => {
    try {
        const { ano, mes } = req.params;
        
        const { data: fretes, error } = await supabase
            .from('fretes')
            .select('*')
            .eq('ano', parseInt(ano))
            .eq('mes', parseInt(mes));

        if (error) throw error;

        const stats = {
            totalEntregues: fretes.filter(f => f.entregue).length,
            totalEmTransito: fretes.filter(f => !f.entregue && calcularStatus(f) === 'Em Trânsito').length,
            totalForaPrazo: fretes.filter(f => !f.entregue && calcularStatus(f) === 'Fora do Prazo').length
        };

        res.json(stats);
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
