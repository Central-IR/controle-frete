// ==========================================
// ======== CONFIGURAÇÃO ====================
// ==========================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3004/api'
    : `${window.location.origin}/api`;

const POLLING_INTERVAL = 5000;

let fretes = [];
let allFretes = [];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentFreteIdForObs = null;
let sessionToken = null;
let sessionCheckInterval = null;
let pollingInterval = null;
let currentFilter = 'all'; // Filtro ativo pelos cards do dashboard

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
        sessionStorage.setItem('controleFreteSessao', sessionToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('controleFreteSessao');
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
            sessionStorage.removeItem('controleFreteSessao');
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
    loadFretes();
    setTodayDate();
    updateMonthDisplay();
    startSessionCheck();
    startPolling();
    updateConnectionStatus(true);
    document.getElementById('freteForm').addEventListener('submit', handleSubmit);
}

// ==========================================
// ======== STATUS DE CONEXÃO ===============
// ==========================================
function updateConnectionStatus(isOnline) {
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.className = `connection-status ${isOnline ? 'online' : 'offline'}`;
        statusDiv.innerHTML = `
            <span class="status-dot"></span>
            <span>${isOnline ? 'Online' : 'Offline'}</span>
        `;
    }
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
                clearInterval(pollingInterval);
                sessionStorage.removeItem('controleFreteSessao');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
            updateConnectionStatus(false);
        }
    }, 30000);
}

// ==========================================
// ======== POLLING AUTOMÁTICO ==============
// ==========================================
function startPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(() => {
        loadFretes(true);
    }, POLLING_INTERVAL);
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Somente usuários autenticados podem acessar esta área') {
    document.body.innerHTML = `
        <div class="unauthorized-screen">
            <div class="unauthorized-content">
                <h1 class="unauthorized-title">NÃO AUTORIZADO</h1>
                <p class="unauthorized-message">${mensagem}</p>
                <button onclick="voltarParaLogin()" class="unauthorized-button">
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
// ======== FUNÇÕES DA APLICAÇÃO ============
// ==========================================

// Carregar fretes do servidor
async function loadFretes(silent = false) {
    try {
        const response = await fetch(`${API_URL}/fretes/${currentYear}/${currentMonth + 1}`, {
            headers: {
                'X-Session-Token': sessionToken,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao carregar fretes');
        
        updateConnectionStatus(true);
        
        fretes = await response.json();
        allFretes = [...fretes];
        
        // Verificar atrasos apenas na primeira carga
        if (!silent) {
            verificarAtrasos();
        }
        
        applyCurrentFilter();
        updateDashboard();
    } catch (error) {
        console.error('Erro:', error);
        updateConnectionStatus(false);
        if (!silent) {
            showMessage('Erro ao conectar com o servidor: ' + error.message, 'error');
        }
    }
}

// Verificar mercadorias em atraso
function verificarAtrasos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const atrasados = fretes.filter(frete => {
        if (frete.entregue || frete.status_especial) return false;
        const dataEntrega = new Date(frete.data_entrega + 'T00:00:00');
        return dataEntrega < hoje;
    });

    if (atrasados.length > 0) {
        showSystemMessage({
            icon: '⚠️',
            title: 'ATENÇÃO',
            message: `Existem ${atrasados.length} mercadoria${atrasados.length > 1 ? 's' : ''} com entrega em atraso.`,
            confirmText: 'Entendi',
            type: 'warning'
        });
    }
}

// Definir data de hoje nos campos
function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dataEmissao').value = today;
    document.getElementById('dataColeta').value = today;
}

// Atualizar exibição do mês
function updateMonthDisplay() {
    const date = new Date(currentYear, currentMonth, 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    document.getElementById('currentMonth').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
}

// Mudar mês
function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    updateMonthDisplay();
    loadFretes();
}

// Filtrar por card do dashboard
function filterByDashboard(filterType) {
    currentFilter = filterType;
    applyCurrentFilter();
}

// Aplicar filtro atual
function applyCurrentFilter() {
    let filtered = [...allFretes];
    
    // Filtro por card do dashboard
    if (currentFilter === 'entregue') {
        filtered = filtered.filter(f => f.entregue);
    } else if (currentFilter === 'em-transito') {
        filtered = filtered.filter(f => !f.entregue && getStatus(f) === 'Em Trânsito');
    } else if (currentFilter === 'fora-prazo') {
        filtered = filtered.filter(f => !f.entregue && getStatus(f) === 'Fora do Prazo');
    }
    
    // Filtros adicionais
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const vendedorFilter = document.getElementById('filterVendedor').value;
    const transportadoraFilter = document.getElementById('filterTransportadora').value;

    filtered = filtered.filter(frete => {
        const matchSearch = 
            frete.numero_nf.toLowerCase().includes(searchTerm) ||
            frete.orgao.toLowerCase().includes(searchTerm) ||
            frete.destino.toLowerCase().includes(searchTerm) ||
            (frete.numero_documento && frete.numero_documento.toLowerCase().includes(searchTerm));

        const matchVendedor = !vendedorFilter || frete.vendedor === vendedorFilter;
        const matchTransportadora = !transportadoraFilter || frete.transportadora === transportadoraFilter;

        return matchSearch && matchVendedor && matchTransportadora;
    });

    renderFretes(filtered);
}

// Abrir modal de formulário
function openFormModal(freteId = null) {
    if (freteId) {
        const frete = fretes.find(f => f.id === freteId);
        if (!frete) return;

        document.getElementById('editId').value = frete.id;
        document.getElementById('numeroNF').value = frete.numero_nf;
        document.getElementById('dataEmissao').value = frete.data_emissao;
        document.getElementById('numeroDocumento').value = frete.numero_documento || '';
        document.getElementById('valor').value = frete.valor;
        document.getElementById('orgao').value = frete.orgao;
        document.getElementById('contatoOrgao').value = frete.contato_orgao || '';
        document.getElementById('vendedor').value = frete.vendedor;
        document.getElementById('transportadora').value = frete.transportadora;
        document.getElementById('valorFrete').value = frete.valor_frete;
        document.getElementById('dataColeta').value = frete.data_coleta;
        document.getElementById('destino').value = frete.destino;
        document.getElementById('dataEntrega').value = frete.data_entrega;
        document.getElementById('statusEspecial').value = frete.status_especial || '';

        document.getElementById('formTitle').textContent = 'Editar Registro';
        document.getElementById('submitText').textContent = 'Atualizar Registro';
        document.getElementById('submitIcon').textContent = '✓';
    } else {
        document.getElementById('freteForm').reset();
        setTodayDate();
        document.getElementById('editId').value = '';
        document.getElementById('formTitle').textContent = 'Novo Registro de Frete';
        document.getElementById('submitText').textContent = 'Registrar Frete';
        document.getElementById('submitIcon').textContent = '✓';
    }

    document.getElementById('formModal').classList.add('show');
}

// Fechar modal de formulário
function closeFormModal() {
    document.getElementById('formModal').classList.remove('show');
    document.getElementById('freteForm').reset();
    setTodayDate();
}

// Submeter formulário com feedback instantâneo
async function handleSubmit(e) {
    e.preventDefault();
    
    const editId = document.getElementById('editId').value;
    const freteData = {
        numero_nf: document.getElementById('numeroNF').value,
        data_emissao: document.getElementById('dataEmissao').value,
        numero_documento: document.getElementById('numeroDocumento').value || null,
        valor: parseFloat(document.getElementById('valor').value) || 0,
        orgao: document.getElementById('orgao').value,
        contato_orgao: document.getElementById('contatoOrgao').value || null,
        vendedor: document.getElementById('vendedor').value,
        transportadora: document.getElementById('transportadora').value,
        valor_frete: parseFloat(document.getElementById('valorFrete').value) || 0,
        data_coleta: document.getElementById('dataColeta').value,
        destino: document.getElementById('destino').value,
        data_entrega: document.getElementById('dataEntrega').value,
        status_especial: document.getElementById('statusEspecial').value || null
    };

    // Feedback instantâneo
    closeFormModal();
    showSystemMessage({
        icon: '⏳',
        title: 'PROCESSANDO',
        message: editId ? 'Atualizando registro...' : 'Criando novo registro...',
        autoClose: false
    });

    try {
        let response;
        if (editId) {
            response = await fetch(`${API_URL}/fretes/${editId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify(freteData)
            });
        } else {
            response = await fetch(`${API_URL}/fretes`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify(freteData)
            });
        }

        if (response.status === 401) {
            closeSystemMessage();
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao salvar');

        closeSystemMessage();
        showSystemMessage({
            icon: '✓',
            title: 'SUCESSO',
            message: editId ? 'Registro atualizado com sucesso!' : 'Registro criado com sucesso!',
            confirmText: 'OK',
            type: 'success'
        });

        // Atualizar dados em background
        loadFretes(true);
    } catch (error) {
        console.error('Erro:', error);
        closeSystemMessage();
        showSystemMessage({
            icon: '✕',
            title: 'ERRO',
            message: 'Não foi possível salvar o registro. Tente novamente.',
            confirmText: 'OK',
            type: 'error'
        });
    }
}

// Toggle entregue com feedback instantâneo
async function toggleEntregue(id) {
    const frete = fretes.find(f => f.id === id);
    if (!frete) return;

    const novoStatus = !frete.entregue;
    
    // Atualização otimista da UI
    frete.entregue = novoStatus;
    applyCurrentFilter();
    updateDashboard();

    try {
        const response = await fetch(`${API_URL}/fretes/${id}/toggle-entregue`, {
            method: 'PATCH',
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao atualizar');

        // Sincronizar com servidor
        await loadFretes(true);
    } catch (error) {
        console.error('Erro:', error);
        // Reverter mudança em caso de erro
        frete.entregue = !novoStatus;
        applyCurrentFilter();
        updateDashboard();
        showSystemMessage({
            icon: '✕',
            title: 'ERRO',
            message: 'Não foi possível atualizar o status. Tente novamente.',
            confirmText: 'OK',
            type: 'error'
        });
    }
}

// Deletar frete
async function deleteFrete(id) {
    const confirmed = await showSystemConfirm({
        icon: '⚠️',
        title: 'CONFIRMAR EXCLUSÃO',
        message: 'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'warning'
    });

    if (!confirmed) return;

    showSystemMessage({
        icon: '⏳',
        title: 'PROCESSANDO',
        message: 'Excluindo registro...',
        autoClose: false
    });

    try {
        const response = await fetch(`${API_URL}/fretes/${id}`, {
            method: 'DELETE',
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            closeSystemMessage();
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao excluir');

        closeSystemMessage();
        showSystemMessage({
            icon: '✓',
            title: 'SUCESSO',
            message: 'Registro excluído com sucesso!',
            confirmText: 'OK',
            type: 'success'
        });

        await loadFretes(true);
    } catch (error) {
        console.error('Erro:', error);
        closeSystemMessage();
        showSystemMessage({
            icon: '✕',
            title: 'ERRO',
            message: 'Não foi possível excluir o registro. Tente novamente.',
            confirmText: 'OK',
            type: 'error'
        });
    }
}

// Modal de mensagem do sistema
function showSystemMessage(options) {
    const {
        icon = 'ℹ️',
        title = 'AVISO',
        message = '',
        confirmText = 'OK',
        type = 'info',
        autoClose = true
    } = options;

    // Remover mensagem anterior se existir
    closeSystemMessage();

    const messageHTML = `
        <div class="system-message-backdrop" id="systemMessageBackdrop"></div>
        <div class="system-message" id="systemMessage">
            <div class="system-message-icon">${icon}</div>
            <div class="system-message-title">${title}</div>
            <div class="system-message-text">${message}</div>
            ${autoClose !== false ? `
                <div class="system-message-actions">
                    <button class="${type === 'error' ? 'danger' : 'primary'}" id="systemMessageBtn">${confirmText}</button>
                </div>
            ` : ''}
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', messageHTML);

    if (autoClose !== false) {
        const btn = document.getElementById('systemMessageBtn');
        btn.addEventListener('click', closeSystemMessage);
    }
}

// Fechar mensagem do sistema
function closeSystemMessage() {
    const message = document.getElementById('systemMessage');
    const backdrop = document.getElementById('systemMessageBackdrop');
    
    if (message) message.remove();
    if (backdrop) backdrop.remove();
}

// Modal de confirmação do sistema
function showSystemConfirm(options) {
    return new Promise((resolve) => {
        const {
            icon = '❓',
            title = 'CONFIRMAÇÃO',
            message = '',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning'
        } = options;

        const confirmHTML = `
            <div class="system-message-backdrop" id="systemConfirmBackdrop"></div>
            <div class="system-message" id="systemConfirm">
                <div class="system-message-icon">${icon}</div>
                <div class="system-message-title">${title}</div>
                <div class="system-message-text">${message}</div>
                <div class="system-message-actions">
                    <button class="secondary" id="systemCancelBtn">${cancelText}</button>
                    <button class="${type === 'warning' ? 'danger' : 'primary'}" id="systemConfirmBtn">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', confirmHTML);

        const confirmBtn = document.getElementById('systemConfirmBtn');
        const cancelBtn = document.getElementById('systemCancelBtn');
        const backdrop = document.getElementById('systemConfirmBackdrop');

        const closeConfirm = (result) => {
            const message = document.getElementById('systemConfirm');
            const backdrop = document.getElementById('systemConfirmBackdrop');
            if (message) message.remove();
            if (backdrop) backdrop.remove();
            resolve(result);
        };

        confirmBtn.addEventListener('click', () => closeConfirm(true));
        cancelBtn.addEventListener('click', () => closeConfirm(false));
        backdrop.addEventListener('click', () => closeConfirm(false));
    });
}

// Calcular status
function getStatus(frete) {
    if (frete.status_especial) {
        return frete.status_especial;
    }
    
    if (frete.entregue) return 'Entregue';
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataEntrega = new Date(frete.data_entrega + 'T00:00:00');
    
    if (dataEntrega < hoje) return 'Fora do Prazo';
    return 'Em Trânsito';
}

// Formatar moeda
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Formatar data
function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

// Formatar data e hora
function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Renderizar fretes
function renderFretes(fretesArray) {
    const container = document.getElementById('fretesContainer');
    
    const sortedFretes = [...fretesArray].sort((a, b) => {
        const nfA = parseInt(a.numero_nf) || 0;
        const nfB = parseInt(b.numero_nf) || 0;
        return nfA - nfB;
    });
    
    if (sortedFretes.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">Nenhum registro encontrado</p>
                    <p>Adicione um novo envio para começar o monitoramento</p>
                </td>
            </tr>
        `;
        return;
    }

    container.innerHTML = sortedFretes.map(frete => {
        const status = getStatus(frete);
        let rowClass = '';
        let badgeClass = 'em-transito';
        
        if (status === 'Entregue') {
            rowClass = 'entregue';
            badgeClass = 'entregue';
        } else if (status === 'Fora do Prazo') {
            rowClass = 'fora-prazo';
            badgeClass = 'fora-prazo';
        } else if (status === 'Devolução') {
            rowClass = 'devolucao';
            badgeClass = 'devolucao';
        } else if (status === 'Simples Remessa') {
            badgeClass = 'simples-remessa';
        } else if (status === 'Remessa de Amostra') {
            badgeClass = 'remessa-amostra';
        } else if (status === 'Cancelada') {
            rowClass = 'cancelada';
            badgeClass = 'cancelada';
        }

        const checkIcon = '✓';
        const checkClass = frete.entregue ? 'checked' : '';

        return `
            <tr class="${rowClass}">
                <td>
                    <button class="entregue-btn ${checkClass}" onclick="toggleEntregue('${frete.id}')" title="${frete.entregue ? 'Desmarcar entrega' : 'Marcar como entregue'}">
                        ${checkIcon}
                    </button>
                </td>
                <td><strong>${frete.numero_nf}</strong></td>
                <td>${formatCurrency(frete.valor)}</td>
                <td>${frete.vendedor}</td>
                <td>${frete.transportadora}</td>
                <td>${frete.destino}</td>
                <td>${formatDate(frete.data_entrega)}</td>
                <td><span class="badge ${badgeClass}">${status}</span></td>
                <td>
                    <div class="actions">
                        <button class="small" onclick="openInfoModal('${frete.id}')">Ver</button>
                        <button class="edit small" onclick="openFormModal('${frete.id}')">Editar</button>
                        <button class="obs-btn small" onclick="openObservacoesModal('${frete.id}')" title="Observações">⚠️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Atualizar dashboard
function updateDashboard() {
    const entregues = fretes.filter(f => f.entregue).length;
    const foraPrazo = fretes.filter(f => !f.entregue && getStatus(f) === 'Fora do Prazo').length;
    const emRota = fretes.filter(f => !f.entregue && getStatus(f) === 'Em Trânsito').length;

    document.getElementById('totalEntregues').textContent = entregues;
    document.getElementById('totalForaPrazo').textContent = foraPrazo;
    document.getElementById('totalEmRota').textContent = emRota;
}

// Filtrar fretes (sem filtro de status)
function filterFretes() {
    applyCurrentFilter();
}

// Mostrar mensagem (legado - mantido para compatibilidade)
function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('statusMessage');
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');

    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

// Abrir modal de informações (formato de formulário somente leitura)
function openInfoModal(freteId) {
    const frete = fretes.find(f => f.id === freteId);
    if (!frete) return;

    document.getElementById('modalNF').textContent = frete.numero_nf;
    
    const infoHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Número da NF</label>
                <input type="text" value="${frete.numero_nf}" readonly>
            </div>
            <div class="form-group">
                <label>Data de Emissão</label>
                <input type="text" value="${formatDate(frete.data_emissao)}" readonly>
            </div>
            <div class="form-group">
                <label>Número do Documento</label>
                <input type="text" value="${frete.numero_documento || 'Não informado'}" readonly>
            </div>
            <div class="form-group">
                <label>Valor da Nota</label>
                <input type="text" value="${formatCurrency(frete.valor)}" readonly>
            </div>
            <div class="form-group">
                <label>Nome do Órgão</label>
                <input type="text" value="${frete.orgao}" readonly>
            </div>
            <div class="form-group">
                <label>Contato do Órgão</label>
                <input type="text" value="${frete.contato_orgao || 'Não informado'}" readonly>
            </div>
            <div class="form-group">
                <label>Vendedor Responsável</label>
                <input type="text" value="${frete.vendedor}" readonly>
            </div>
            <div class="form-group">
                <label>Transportadora</label>
                <input type="text" value="${frete.transportadora}" readonly>
            </div>
            <div class="form-group">
                <label>Valor do Frete</label>
                <input type="text" value="${formatCurrency(frete.valor_frete)}" readonly>
            </div>
            <div class="form-group">
                <label>Data da Coleta</label>
                <input type="text" value="${formatDate(frete.data_coleta)}" readonly>
            </div>
            <div class="form-group">
                <label>Cidade-UF de Destino</label>
                <input type="text" value="${frete.destino}" readonly>
            </div>
            <div class="form-group">
                <label>Data de Entrega</label>
                <input type="text" value="${formatDate(frete.data_entrega)}" readonly>
            </div>
            <div class="form-group">
                <label>Status Especial</label>
                <input type="text" value="${frete.status_especial || 'Nenhum'}" readonly>
            </div>
            <div class="form-group">
                <label>Status Atual</label>
                <input type="text" value="${getStatus(frete)}" readonly>
            </div>
        </div>
    `;

    document.getElementById('modalInfoContent').innerHTML = infoHTML;
    document.getElementById('infoModal').classList.add('show');
}

// Fechar modal de informações
function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('show');
}

// Abrir modal de observações
function openObservacoesModal(freteId) {
    currentFreteIdForObs = freteId;
    const frete = fretes.find(f => f.id === freteId);
    if (!frete) return;

    document.getElementById('obsModalNF').textContent = frete.numero_nf;
    document.getElementById('novaObservacao').value = '';
    
    renderObservacoes(frete);
    document.getElementById('observacoesModal').classList.add('show');
}

// Fechar modal de observações
function closeObservacoesModal() {
    document.getElementById('observacoesModal').classList.remove('show');
    currentFreteIdForObs = null;
}

// Renderizar observações
function renderObservacoes(frete) {
    const container = document.getElementById('listaObservacoes');
    const observacoes = frete.observacoes || [];

    if (observacoes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Nenhuma observação registrada ainda.</p>';
        return;
    }

    const sortedObs = [...observacoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = sortedObs.map(obs => `
        <div class="observacao-item">
            <div class="observacao-header">
                <div class="observacao-data">${formatDateTime(obs.created_at)}</div>
                <button class="text-only" onclick="excluirObservacao('${obs.id}')">Excluir</button>
            </div>
            <div class="observacao-texto">${obs.texto}</div>
        </div>
    `).join('');
}

// Adicionar observação
async function adicionarObservacao() {
    const texto = document.getElementById('novaObservacao').value.trim();
    if (!texto) {
        showSystemMessage({
            icon: '⚠️',
            title: 'AVISO',
            message: 'Digite uma observação antes de adicionar!',
            confirmText: 'OK',
            type: 'warning'
        });
        return;
    }

    try {
        const response = await fetch(`${API_URL}/fretes/${currentFreteIdForObs}/observacoes`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify({ texto })
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao adicionar observação');

        document.getElementById('novaObservacao').value = '';
        
        await loadFretes(true);
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showSystemMessage({
            icon: '✕',
            title: 'ERRO',
            message: 'Não foi possível adicionar a observação. Tente novamente.',
            confirmText: 'OK',
            type: 'error'
        });
    }
}

// Excluir observação
async function excluirObservacao(obsId) {
    const confirmed = await showSystemConfirm({
        icon: '⚠️',
        title: 'CONFIRMAR EXCLUSÃO',
        message: 'Tem certeza que deseja excluir esta observação?',
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'warning'
    });

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/observacoes/${obsId}`, {
            method: 'DELETE',
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao excluir observação');
        
        await loadFretes(true);
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showSystemMessage({
            icon: '✕',
            title: 'ERRO',
            message: 'Não foi possível excluir a observação. Tente novamente.',
            confirmText: 'OK',
            type: 'error'
        });
    }
}

// Fechar modais clicando fora
window.onclick = function(event) {
    const formModal = document.getElementById('formModal');
    const infoModal = document.getElementById('infoModal');
    const obsModal = document.getElementById('observacoesModal');
    
    if (event.target === formModal) {
        closeFormModal();
    }
    if (event.target === infoModal) {
        closeInfoModal();
    }
    if (event.target === obsModal) {
        closeObservacoesModal();
    }
}
