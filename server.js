require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// MIDDLEWARES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições
app.use((req, res, next) => {
    console.log(`🔥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'];

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado'
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou'
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                message: sessionData.message || 'Sua sessão expirou'
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// SERVIR ARQUIVOS ESTÁTICOS
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('controle_frete')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            timestamp: new Date().toISOString(),
            service: 'Controle de Frete API'
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ROTAS DA API
app.use('/api', verificarAutenticacao);

// GET - Listar todos os fretes
app.get('/api/fretes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('controle_frete')
            .select('*')
            .order('data_emissao', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar fretes:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar fretes',
            details: error.message 
        });
    }
});

// GET - Buscar por ID
app.get('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('controle_frete')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Frete não encontrado' });
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar frete:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar frete',
            details: error.message 
        });
    }
});

// POST - Criar frete
app.post('/api/fretes', async (req, res) => {
    try {
        console.log('📝 Criando frete:', req.body);
        
        const {
            numero_nf,
            data_emissao,
            documento,
            valor_nf,
            tipo_nf,
            nome_orgao,
            contato_orgao,
            vendedor,
            transportadora,
            valor_frete,
            data_coleta,
            cidade_destino,
            previsao_entrega,
            observacoes
        } = req.body;

        if (!numero_nf || !nome_orgao || !data_coleta) {
            return res.status(400).json({ 
                error: 'Campos obrigatórios faltando: numero_nf, nome_orgao, data_coleta'
            });
        }

        let status = 'EM_TRANSITO';
        const tipoNf = tipo_nf || 'ENVIO';
        const tiposComStatus = ['ENVIO', 'SIMPLES_REMESSA', 'REMESSA_AMOSTRA'];
        
        if (!tiposComStatus.includes(tipoNf)) {
            status = null;
        }

        const { data, error } = await supabase
            .from('controle_frete')
            .insert([{
                numero_nf,
                data_emissao: data_emissao || new Date().toISOString().split('T')[0],
                documento: documento || 'NÃO INFORMADO',
                valor_nf: valor_nf || 0,
                tipo_nf: tipoNf,
                nome_orgao,
                contato_orgao: contato_orgao || 'NÃO INFORMADO',
                vendedor: vendedor || 'NÃO INFORMADO',
                transportadora: transportadora || 'NÃO INFORMADO',
                valor_frete: valor_frete || 0,
                data_coleta,
                cidade_destino: cidade_destino || 'NÃO INFORMADO',
                previsao_entrega: previsao_entrega || null,
                status,
                observacoes: observacoes || '[]',
                observacoes_lidas: '{}'
            }])
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Frete criado:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar frete:', error);
        res.status(500).json({ 
            error: 'Erro ao criar frete',
            details: error.message 
        });
    }
});

// PUT - Atualizar frete
app.put('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`✏️ Atualizando frete: ${id}`);
        
        const {
            numero_nf,
            data_emissao,
            documento,
            valor_nf,
            tipo_nf,
            nome_orgao,
            contato_orgao,
            vendedor,
            transportadora,
            valor_frete,
            data_coleta,
            cidade_destino,
            previsao_entrega,
            observacoes,
            observacoes_lidas
        } = req.body;

        let status = 'EM_TRANSITO';
        const tipoNf = tipo_nf || 'ENVIO';
        const tiposComStatus = ['ENVIO', 'SIMPLES_REMESSA', 'REMESSA_AMOSTRA'];
        
        if (!tiposComStatus.includes(tipoNf)) {
            status = null;
        }

        const updateData = {
            numero_nf,
            data_emissao,
            documento,
            valor_nf,
            tipo_nf: tipoNf,
            nome_orgao,
            contato_orgao,
            vendedor,
            transportadora,
            valor_frete,
            data_coleta,
            cidade_destino,
            previsao_entrega,
            status,
            observacoes: observacoes || '[]'
        };

        if (observacoes_lidas !== undefined) {
            updateData.observacoes_lidas = observacoes_lidas;
        }

        const { data, error } = await supabase
            .from('controle_frete')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Frete não encontrado' });
        }

        console.log('✅ Frete atualizado:', data);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar frete:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar frete',
            details: error.message 
        });
    }
});

// PATCH - Toggle status
app.patch('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        console.log(`🔄 Toggle status do frete ${id} para: ${status}`);

        const { data, error } = await supabase
            .from('controle_frete')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Frete não encontrado' });
        }

        console.log('✅ Status atualizado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar status',
            details: error.message 
        });
    }
});

// NOVA ROTA - Marcar observações como lidas
app.post('/api/fretes/:id/marcar-lido', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId || req.user?.id || req.user?.username;

        if (!userId) {
            return res.status(400).json({ error: 'Usuário não identificado' });
        }

        console.log(`📖 Marcando observações como lidas - Frete: ${id}, Usuário: ${userId}`);

        const { data: frete, error: fetchError } = await supabase
            .from('controle_frete')
            .select('observacoes_lidas')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        let observacoesLidas = {};
        try {
            if (frete.observacoes_lidas) {
                observacoesLidas = typeof frete.observacoes_lidas === 'string' 
                    ? JSON.parse(frete.observacoes_lidas) 
                    : frete.observacoes_lidas;
            }
        } catch (e) {
            console.error('Erro ao parsear observacoes_lidas:', e);
        }

        observacoesLidas[userId] = new Date().toISOString();

        const { data, error } = await supabase
            .from('controle_frete')
            .update({ observacoes_lidas: observacoesLidas })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Observações marcadas como lidas');
        res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Erro ao marcar como lido:', error);
        res.status(500).json({ 
            error: 'Erro ao marcar como lido',
            details: error.message 
        });
    }
});

// DELETE - Excluir frete
app.delete('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Deletando frete: ${id}`);

        const { error } = await supabase
            .from('controle_frete')
            .delete()
            .eq('id', id);

        if (error) throw error;

        console.log('✅ Frete deletado');
        res.json({ message: 'Frete excluído com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao excluir frete:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir frete',
            details: error.message 
        });
    }
});

// ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Controle de Frete API',
        version: '2.2.0',
        timestamp: new Date().toISOString()
    });
});

// ROTA 404
app.use((req, res) => {
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path
    });
});

// TRATAMENTO DE ERROS
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// INICIAR SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log(`🚀 Controle de Frete API v2.2.0`);
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Supabase URL: ${supabaseUrl}`);
    console.log(`📁 Public folder: ${publicPath}`);
    console.log(`🔐 Autenticação: Ativa`);
    console.log(`🌐 Portal URL: ${PORTAL_URL}`);
    console.log(`🔔 Notificações: Ativas`);
    console.log('🚀 ================================\n');
});
