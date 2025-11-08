// ==========================================
// ======== CONFIGURAÇÃO ====================
// ==========================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3003/api'
    : `${window.location.origin}/api`;

const POLLING_INTERVAL = 3000;

let expedicoes = [];
let isOnline = false;
let statusSelecionado = 'TODOS';
let periodoSelecionado = 'TODOS';
let transportadoraSelecionada = 'TODAS';
let transportadorasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;
let sessionCheckInterval = null;

console.log('API URL configurada:', API_URL);

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ==========================================
// ======== VERIFICAR AUTENTICAÇÃO ==========
// ==========================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('controleFreteSession', sessionToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('controleFreteSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    verificarSessaoValida();
}

async function verificarSessaoValida() {
    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        const data = await response.json();

        if (!data.valid) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado(data.message);
            return;
        }

        iniciarAplicacao();
    } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        mostrarTelaAcessoNegado('Erro ao verificar autenticação');
    }
}

function iniciarAplicacao() {
    loadExpedicoes();
    startRealtimeSync();
    startSessionCheck();
}

// ==========================================
// ======== VERIFICAÇÃO PERIÓDICA DE SESSÃO =
// ==========================================
function startSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }

    sessionCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });

            const data = await response.json();

            if (!data.valid) {
                clearInterval(sessionCheckInterval);
                sessionStorage.removeItem('controleFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
        }
    }, 30000);
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Somente usuários autenticados podem acessar esta área') {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #F5F5F5 0%, #FFFFFF 100%); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); max-width: 500px;">
                <h1 style="font-size: 1.8rem; color: #1E1E1E; margin-bottom: 1rem;">🔒 ACESSO NEGADO</h1>
                <p style="color: #666; margin-bottom: 2rem; line-height: 1.6;">${mensagem}</p>
                <button onclick="voltarParaLogin()" style="padding: 1rem 2rem; background: linear-gradient(135deg, #ff5100 0%, #E67E00 100%); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(255, 140, 0, 0.4);">
                    Ir para o Login
                </button>
            </div>
        </div>
    `;
}

function voltarParaLogin() {
    window.location.href = PORTAL_URL;
}

// ==========================================
// ======== MODAL DE CONFIRMAÇÃO ============
// ==========================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Confirmação',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning'
        } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'primary'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });
    });
}

// ==========================================
// ======== MODAL DE FORMULÁRIO =============
// ==========================================
function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const expedicao = isEditing ? expedicoes.find(e => e.id === editingId) : null;

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? '✏️ Editar Expedição' : '📦 Nova Expedição'}</h3>
                </div>
                <div class="modal-form-content">
                    <form id="modalExpedicaoForm">
                        <input type="hidden" id="modalEditId" value="${editingId || ''}">
                        
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="modalNumeroNF">📄 Número da NF *</label>
                                <input type="text" id="modalNumeroNF" placeholder="Ex: 12345" value="${expedicao?.numero_nf || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalDataExpedicao">📅 Data de Expedição *</label>
                                <input type="date" id="modalDataExpedicao" value="${expedicao?.data_expedicao || new Date().toISOString().split('T')[0]}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalDestinatario">👤 Destinatário *</label>
                                <input type="text" id="modalDestinatario" placeholder="Nome do destinatário" value="${expedicao?.destinatario || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalCidadeDestino">🏙️ Cidade Destino *</label>
                                <input type="text" id="modalCidadeDestino" placeholder="Cidade/UF" value="${expedicao?.cidade_destino || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalTransportadora">🚚 Transportadora *</label>
                                <input type="text" id="modalTransportadora" placeholder="Nome da transportadora" value="${expedicao?.transportadora || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalValorFrete">💰 Valor do Frete (R$) *</label>
                                <input type="number" id="modalValorFrete" step="0.01" min="0" placeholder="0.00" value="${expedicao?.valor_frete || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalPeso">⚖️ Peso (kg)</label>
                                <input type="number" id="modalPeso" step="0.01" min="0" placeholder="0.00" value="${expedicao?.peso || ''}">
                            </div>

                            <div class="form-group">
                                <label for="modalVolumes">📦 Volumes</label>
                                <input type="number" id="modalVolumes" min="1" placeholder="1" value="${expedicao?.volumes || '1'}">
                            </div>

                            <div class="form-group">
                                <label for="modalStatus">📊 Status *</label>
                                <select id="modalStatus" required>
                                    <option value="PENDENTE" ${expedicao?.status === 'PENDENTE' ? 'selected' : ''}>Pendente</option>
                                    <option value="EM_TRANSITO" ${expedicao?.status === 'EM_TRANSITO' ? 'selected' : ''}>Em Trânsito</option>
                                    <option value="ENTREGUE" ${expedicao?.status === 'ENTREGUE' ? 'selected' : ''}>Entregue</option>
                                    <option value="CANCELADO" ${expedicao?.status === 'CANCELADO' ? 'selected' : ''}>Cancelado</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="modalCodigoRastreio">🔍 Código de Rastreio</label>
                                <input type="text" id="modalCodigoRastreio" placeholder="Código de rastreio" value="${expedicao?.codigo_rastreio || ''}">
                            </div>

                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="modalObservacoes">📝 Observações</label>
                                <textarea id="modalObservacoes" rows="3" placeholder="Observações adicionais...">${expedicao?.observacoes || ''}</textarea>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary" id="modalCancelFormBtn">Cancelar</button>
                            <button type="submit" class="primary">${isEditing ? '💾 Atualizar' : '➕ Salvar'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('formModal');
    const form = document.getElementById('modalExpedicaoForm');
    const cancelBtn = document.getElementById('modalCancelFormBtn');

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => {
            modal.remove();
        }, 200);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            numero_nf: document.getElementById('modalNumeroNF').value.trim(),
            data_expedicao: document.getElementById('modalDataExpedicao').value,
            destinatario: document.getElementById('modalDestinatario').value.trim(),
            cidade_destino: document.getElementById('modalCidadeDestino').value.trim(),
            transportadora: document.getElementById('modalTransportadora').value.trim(),
            valor_frete: parseFloat(document.getElementById('modalValorFrete').value),
            peso: parseFloat(document.getElementById('modalPeso').value) || null,
            volumes: parseInt(document.getElementById('modalVolumes').value) || 1,
            status: document.getElementById('modalStatus').value,
            codigo_rastreio: document.getElementById('modalCodigoRastreio').value.trim() || null,
            observacoes: document.getElementById('modalObservacoes').value.trim() || null
        };

        const editId = document.getElementById('modalEditId').value;

        // Atualização otimista
        const tempId = editId || 'temp_' + Date.now();
        const optimisticData = { ...formData, id: tempId, timestamp: new Date().toISOString() };

        if (editId) {
            const index = expedicoes.findIndex(e => e.id === editId);
            if (index !== -1) expedicoes[index] = optimisticData;
            showMessage('Expedição atualizada!', 'success');
        } else {
            expedicoes.push(optimisticData);
            showMessage('Expedição registrada!', 'success');
        }

        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        updateStats();
        filterExpedicoes();
        closeModal();

        syncWithServer(formData, editId, tempId);
    });

    cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    setTimeout(() => {
        document.getElementById('modalNumeroNF').focus();
    }, 100);
}

// ==========================================
// ======== FUNÇÕES DA APLICAÇÃO ============
// ==========================================

function toggleForm() {
    showFormModal();
}

function generateHash(data) { 
    return JSON.stringify(data); 
}

function startRealtimeSync() {
    setInterval(async () => {
        if (isOnline) await checkForUpdates();
    }, POLLING_INTERVAL);
    
    setInterval(() => {
        if (expedicoes.length > 0) {
            filterExpedicoes();
        }
    }, 30000);
}

async function checkForUpdates() {
    try {
        const response = await fetch(`${API_URL}/expedicoes`, { 
            cache: 'no-cache', 
            headers: { 
                'Cache-Control': 'no-cache', 
                'Pragma': 'no-cache',
                'X-Session-Token': sessionToken
            } 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;
        
        const serverData = await response.json();
        const newHash = generateHash(serverData);
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            expedicoes = serverData;
            atualizarTransportadorasDisponiveis();
            renderTransportadorasFilter();
            updateStats();
            filterExpedicoes();
        }
    } catch (error) { 
        console.error('Erro ao verificar atualizações:', error); 
    }
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/expedicoes`, { 
            method: 'HEAD', 
            cache: 'no-cache',
            headers: {
                'X-Session-Token': sessionToken
            }
        });
        isOnline = response.ok;
        updateConnectionStatus();
        return isOnline;
    } catch (error) { 
        console.error('Erro ao verificar status do servidor:', error);
        isOnline = false; 
        updateConnectionStatus(); 
        return false; 
    }
}

function updateConnectionStatus() {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;

    if (isOnline) {
        statusDiv.className = 'connection-status online';
        statusDiv.querySelector('span:last-child').textContent = 'Online';
    } else {
        statusDiv.className = 'connection-status offline';
        statusDiv.querySelector('span:last-child').textContent = 'Offline';
    }
}

async function loadExpedicoes() {
    console.log('Carregando expedições...');
    const serverOnline = await checkServerStatus();
    console.log('Servidor online:', serverOnline);
    
    try {
        if (serverOnline) {
            const response = await fetch(`${API_URL}/expedicoes`, {
                headers: {
                    'X-Session-Token': sessionToken
                }
            });
            console.log('Response status:', response.status);

            if (response.status === 401) {
                sessionStorage.removeItem('controleFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            
            expedicoes = await response.json();
            console.log('Expedições carregadas:', expedicoes.length);
            lastDataHash = generateHash(expedicoes);
        } else { 
            expedicoes = [];
            console.log('Servidor offline, lista vazia');
        }
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        updateStats();
        filterExpedicoes();
    } catch (error) { 
        console.error('Erro ao carregar expedições:', error); 
        showMessage('Erro ao conectar com o servidor: ' + error.message, 'error');
        expedicoes = []; 
        filterExpedicoes(); 
    }
}

function atualizarTransportadorasDisponiveis() {
    transportadorasDisponiveis.clear();
    expedicoes.forEach(e => { 
        if (e.transportadora && e.transportadora.trim()) {
            transportadorasDisponiveis.add(e.transportadora.trim());
        }
    });
}

function renderTransportadorasFilter() {
    const container = document.getElementById('transportadorasFilter');
    if (!container) return;

    container.innerHTML = '';
    
    const btnTodas = document.createElement('button');
    btnTodas.className = 'brand-button' + (transportadoraSelecionada === 'TODAS' ? ' active' : '');
    btnTodas.textContent = 'TODAS';
    btnTodas.onclick = () => selecionarTransportadora('TODAS');
    container.appendChild(btnTodas);

    Array.from(transportadorasDisponiveis).sort().forEach(transportadora => {
        const btn = document.createElement('button');
        btn.className = 'brand-button' + (transportadoraSelecionada === transportadora ? ' active' : '');
        btn.textContent = transportadora;
        btn.onclick = () => selecionarTransportadora(transportadora);
        container.appendChild(btn);
    });
}

function selecionarTransportadora(transportadora) {
    transportadoraSelecionada = transportadora;
    renderTransportadorasFilter();
    filterExpedicoes();
}

function updateStats() {
    const stats = {
        total: expedicoes.length,
        pendente: expedicoes.filter(e => e.status === 'PENDENTE').length,
        emTransito: expedicoes.filter(e => e.status === 'EM_TRANSITO').length,
        entregue: expedicoes.filter(e => e.status === 'ENTREGUE').length
    };

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPendente').textContent = stats.pendente;
    document.getElementById('statEmTransito').textContent = stats.emTransito;
    document.getElementById('statEntregue').textContent = stats.entregue;
}

async function syncWithServer(formData, editId, tempId) {
    const serverOnline = await checkServerStatus();
    if (!serverOnline) {
        console.log('Servidor offline. Sincronização pendente.');
        showMessage('Salvo localmente (servidor offline)', 'info');
        return;
    }

    try {
        let url, method;
        if (editId) { 
            url = `${API_URL}/expedicoes/${editId}`; 
            method = 'PUT'; 
        } else { 
            url = `${API_URL}/expedicoes`; 
            method = 'POST'; 
        }

        console.log(`Sincronizando: ${method} ${url}`);

        const response = await fetch(url, { 
            method, 
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            }, 
            body: JSON.stringify(formData) 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        
        const savedData = await response.json();
        console.log('Dados salvos:', savedData);

        if (editId) {
            const index = expedicoes.findIndex(e => e.id === editId);
            if (index !== -1) expedicoes[index] = savedData;
        } else {
            const tempIndex = expedicoes.findIndex(e => e.id === tempId);
            if (tempIndex !== -1) {
                expedicoes[tempIndex] = savedData;
            }
        }

        lastDataHash = generateHash(expedicoes);
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        updateStats();
        filterExpedicoes();
    } catch (error) {
        console.error('Erro ao sincronizar:', error);
        if (!editId) {
            expedicoes = expedicoes.filter(e => e.id !== tempId);
            filterExpedicoes();
        }
        showMessage('Erro ao salvar no servidor: ' + error.message, 'error');
    }
}

window.editExpedicao = function(id) {
    showFormModal(id);
};

window.deleteExpedicao = async function(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir esta expedição? Esta ação não pode ser desfeita.',
        {
            title: 'Excluir Expedição',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    const deletedExpedicao = expedicoes.find(e => e.id === id);
    expedicoes = expedicoes.filter(e => e.id !== id);
    atualizarTransportadorasDisponiveis();
    renderTransportadorasFilter();
    updateStats();
    filterExpedicoes();
    showMessage('Expedição excluída!', 'success');

    syncDeleteWithServer(id, deletedExpedicao);
};

async function syncDeleteWithServer(id, deletedExpedicao) {
    const serverOnline = await checkServerStatus();
    if (!serverOnline) {
        console.log('Servidor offline. Exclusão pendente.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/expedicoes/${id}`, { 
            method: 'DELETE',
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        lastDataHash = generateHash(expedicoes);
    } catch (error) {
        console.error('Erro ao sincronizar exclusão:', error);
        if (deletedExpedicao) {
            expedicoes.push(deletedExpedicao);
            atualizarTransportadorasDisponiveis();
            renderTransportadorasFilter();
            updateStats();
            filterExpedicoes();
            showMessage('Erro ao excluir no servidor', 'error');
        }
    }
}

function filterExpedicoes() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    statusSelecionado = document.getElementById('filterStatus').value;
    periodoSelecionado = document.getElementById('filterPeriodo').value;
    
    let filtered = expedicoes;

    // Filtro por transportadora
    if (transportadoraSelecionada !== 'TODAS') {
        filtered = filtered.filter(e => e.transportadora === transportadoraSelecionada);
    }

    // Filtro por status
    if (statusSelecionado !== 'TODOS') {
        filtered = filtered.filter(e => e.status === statusSelecionado);
    }

    // Filtro por período
    if (periodoSelecionado !== 'TODOS') {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        filtered = filtered.filter(e => {
            const dataExpedicao = new Date(e.data_expedicao);
            dataExpedicao.setHours(0, 0, 0, 0);
            
            switch(periodoSelecionado) {
                case 'HOJE':
                    return dataExpedicao.getTime() === hoje.getTime();
                case 'SEMANA':
                    const inicioSemana = new Date(hoje);
                    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
                    return dataExpedicao >= inicioSemana;
                case 'MES':
                    return dataExpedicao.getMonth() === hoje.getMonth() && 
                           dataExpedicao.getFullYear() === hoje.getFullYear();
                default:
                    return true;
            }
        });
    }

    // Filtro por pesquisa
    if (searchTerm) {
        filtered = filtered.filter(e => 
            e.numero_nf.toLowerCase().includes(searchTerm) ||
            e.destinatario.toLowerCase().includes(searchTerm) ||
            e.cidade_destino.toLowerCase().includes(searchTerm) ||
            e.transportadora.toLowerCase().includes(searchTerm) ||
            (e.codigo_rastreio && e.codigo_rastreio.toLowerCase().includes(searchTerm))
        );
    }

    // Ordenar por data (mais recentes primeiro)
    filtered.sort((a, b) => new Date(b.data_expedicao) - new Date(a.data_expedicao));

    renderExpedicoes(filtered);
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Sem data';
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s atrás`;
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}min atrás`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h atrás`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d atrás`;
    
    return past.toLocaleDateString('pt-BR');
}

function formatDate(dateString) {
    if (!dateString) return 'Sem data';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

function getStatusBadge(status) {
    const statusMap = {
        'PENDENTE': 'pendente',
        'EM_TRANSITO': 'em-transito',
        'ENTREGUE': 'entregue',
        'CANCELADO': 'cancelado'
    };
    
    const statusText = {
        'PENDENTE': 'Pendente',
        'EM_TRANSITO': 'Em Trânsito',
        'ENTREGUE': 'Entregue',
        'CANCELADO': 'Cancelado'
    };
    
    return `<span class="status-badge ${statusMap[status]}">${statusText[status]}</span>`;
}

function renderExpedicoes(expedicoesToRender) {
    const container = document.getElementById('expedicoesContainer');
    
    if (!expedicoesToRender || expedicoesToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma expedição encontrada</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>NF</th>
                        <th>Destinatário</th>
                        <th>Cidade</th>
                        <th>Transportadora</th>
                        <th>Valor Frete</th>
                        <th>Peso</th>
                        <th>Volumes</th>
                        <th>Status</th>
                        <th>Rastreio</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${expedicoesToRender.map(e => `
                        <tr>
                            <td>${formatDate(e.data_expedicao)}</td>
                            <td><strong>${e.numero_nf}</strong></td>
                            <td>${e.destinatario}</td>
                            <td>${e.cidade_destino}</td>
                            <td>${e.transportadora}</td>
                            <td>R$ ${parseFloat(e.valor_frete).toFixed(2)}</td>
                            <td>${e.peso ? `${e.peso} kg` : '-'}</td>
                            <td>${e.volumes || '-'}</td>
                            <td>${getStatusBadge(e.status)}</td>
                            <td style="font-family: monospace; font-size: 0.85rem;">${e.codigo_rastreio || '-'}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="window.editExpedicao('${e.id}')" class="action-btn edit">Editar</button>
                                <button onclick="window.deleteExpedicao('${e.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('statusMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}
