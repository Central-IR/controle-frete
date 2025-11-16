require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log detalhado de requisições
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ======== ARQUIVO DE LOG ==================
// ==========================================
const logFilePath = path.join(__dirname, 'acessos.log');

function registrarAcesso(req, res, next) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress;

    const cleanIP = clientIP.replace('::ffff:', '');
    const logEntry = `[${new Date().toISOString()}] IP: ${cleanIP} Rota: ${req.path}\n`;

    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error('Erro ao gravar log:', err);
    });

    next();
}

app.use(registrarAcesso);

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

console.log('🔐 Portal URL configurado:', PORTAL_URL);

async function verificarAutenticacao(req, res, next) {
    // Rotas públicas que NÃO precisam de autenticação
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    // Pegar token da sessão
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    console.log('🔑 Token recebido:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'NENHUM');

    if (!sessionToken) {
        console.log('❌ Token não encontrado');
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado',
            redirectToLogin: true
        });
    }

    try {
        console.log('🔍 Verificando sessão no portal:', PORTAL_URL);
        
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        console.log('📊 Resposta do portal:', verifyResponse.status);

        if (!verifyResponse.ok) {
            console.log('❌ Resposta não OK do portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou ou foi invalidada',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();
        console.log('📋 Dados da sessão:', sessionData.valid ? 'VÁLIDA' : 'INVÁLIDA');

        if (!sessionData.valid) {
            console.log('❌ Sessão marcada como inválida pelo portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: sessionData.message || 'Sua sessão expirou',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;

        console.log('✅ Autenticação bem-sucedida para:', sessionData.session?.username);
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// ==========================================
// ======== SERVIR ARQUIVOS ESTÁTICOS =======
// ==========================================
const publicPath = path.join(__dirname, 'public');
console.log('📁 Pasta public:', publicPath);

app.use(express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ==========================================
// ======== HEALTH CHECK (PÚBLICO) ==========
// ==========================================
app.get('/health', async (req, res) => {
    console.log('💚 Health check requisitado');
    try {
        const { error } = await supabase
            .from('controle_frete')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            portal_url: PORTAL_URL,
            timestamp: new Date().toISOString(),
            publicPath: publicPath,
            authentication: 'enabled',
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

// ==========================================
// ======== ROTAS DA API ====================
// ==========================================

// Aplicar autenticação em todas as rotas da API
app.use('/api', verificarAutenticacao);

// GET - Listar todos os fretes
app.get('/api/fretes', async (req, res) => {
    try {
        console.log('🔍 Buscando todos os fretes...');
        
        const { data: fretes, error } = await supabase
            .from('controle_frete')
            .select('*')
            .order('data_emissao', { ascending: false });

        if (error) throw error;

        console.log(`✅ ${fretes.length} fretes encontrados`);
        res.json(fretes);
    } catch (error) {
        console.error('❌ Erro ao buscar fretes:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar fretes',
            details: error.message 
        });
    }
});

// GET - Buscar frete por ID
app.get('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Buscando frete ID: ${id}`);

        const { data, error } = await supabase
            .from('controle_frete')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Frete não encontrado' });
        }

        console.log('✅ Frete encontrado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar frete:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar frete',
            details: error.message 
        });
    }
});

// POST - Criar novo frete
app.post('/api/fretes', async (req, res) => {
    try {
        console.log('📝 Criando novo frete:', req.body);
        
        const {
            numero_nf,
            data_emissao,
            valor_nf,
            transportadora,
            codigo_rastreio,
            valor_frete,
            cidade_origem,
            uf_origem,
            cidade_destino,
            uf_destino,
            data_coleta,
            previsao_entrega,
            data_entrega_real,
            status,
            responsavel,
            vendedor,
            observacoes
        } = req.body;

        // Validações básicas
        if (!numero_nf || !data_emissao || !valor_nf || !transportadora || !valor_frete ||
            !cidade_origem || !uf_origem || !cidade_destino || !uf_destino ||
            !previsao_entrega || !responsavel) {
            return res.status(400).json({ 
                error: 'Campos obrigatórios faltando',
                campos_obrigatorios: [
                    'numero_nf', 'data_emissao', 'valor_nf', 'transportadora', 
                    'valor_frete', 'cidade_origem', 'uf_origem', 'cidade_destino', 
                    'uf_destino', 'previsao_entrega', 'responsavel'
                ]
            });
        }

        const { data, error } = await supabase
            .from('controle_frete')
            .insert([{
                numero_nf,
                data_emissao,
                valor_nf,
                transportadora,
                codigo_rastreio: codigo_rastreio || null,
                valor_frete,
                cidade_origem,
                uf_origem,
                cidade_destino,
                uf_destino,
                data_coleta: data_coleta || null,
                previsao_entrega,
                data_entrega_real: data_entrega_real || null,
                status: status || 'EM_TRANSITO',
                responsavel,
                vendedor: vendedor || null,
                observacoes: observacoes || null
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
        console.log(`✏️ Atualizando frete ID: ${id}`);
        
        const {
            numero_nf,
            data_emissao,
            valor_nf,
            transportadora,
            codigo_rastreio,
            valor_frete,
            cidade_origem,
            uf_origem,
            cidade_destino,
            uf_destino,
            data_coleta,
            previsao_entrega,
            data_entrega_real,
            status,
            responsavel,
            vendedor,
            observacoes
        } = req.body;

        const { data, error } = await supabase
            .from('controle_frete')
            .update({
                numero_nf,
                data_emissao,
                valor_nf,
                transportadora,
                codigo_rastreio,
                valor_frete,
                cidade_origem,
                uf_origem,
                cidade_destino,
                uf_destino,
                data_coleta,
                previsao_entrega,
                data_entrega_real,
                status,
                responsavel,
                vendedor,
                observacoes
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'Frete não encontrado' });
        }

        console.log('✅ Frete atualizado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar frete:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar frete',
            details: error.message 
        });
    }
});

// DELETE - Excluir frete
app.delete('/api/fretes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Deletando frete ID: ${id}`);

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

// ==========================================
// ======== ROTA PRINCIPAL (PÚBLICO) ========
// ==========================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Controle de Frete API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            fretes: '/api/fretes',
            create: 'POST /api/fretes',
            update: 'PUT /api/fretes/:id',
            delete: 'DELETE /api/fretes/:id'
        }
    });
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path,
        message: 'Esta rota não existe na API'
    });
});

// ==========================================
// ======== TRATAMENTO DE ERROS =============
// ==========================================
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// ==========================================
// ======== INICIAR SERVIDOR ================
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log(`🚀 Controle de Frete API v1.0.0`);
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Database: Supabase`);
    console.log(`🔗 Supabase URL: ${supabaseUrl}`);
    console.log(`📁 Public folder: ${publicPath}`);
    console.log(`🔐 Autenticação: Ativa ✅`);
    console.log(`🌐 Portal URL: ${PORTAL_URL}`);
    console.log(`🔓 Rotas públicas: /, /health, /app`);
    console.log(`📋 Tabela: controle_frete`);
    console.log('🚀 ================================\n');
});

// Verificar se pasta public existe
if (!fs.existsSync(publicPath)) {
    console.error('⚠️ AVISO: Pasta public/ não encontrada!');
    console.error('📁 Crie a pasta e adicione os arquivos:');
    console.error('   - public/index.html');
    console.error('   - public/style.css');
    console.error('   - public/script.js');
    console.error('   - public/I.R.-COMERCIO-E-MATERIAIS-ELETRICOS-PRETO.png');
}
