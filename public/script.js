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
    document.getElementById('freteForm').addEventListener('submit', handleSubmit);
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
        }
    }, 30000); // Verifica a cada 30 segundos
}

// ==========================================
// ======== POLLING AUTOMÁTICO ==============
// ==========================================
function startPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(() => {
        loadFretes(true); // true = silent mode (sem mensagens)
    }, POLLING_INTERVAL);
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Somente usuários autenticados podem acessar esta área') {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg-secondary); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: 24px; box-shadow: 0 20px 60px var(--shadow); max-width: 500px; border: 1px solid var(--border-color);">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h1 style="font-size: 1.8rem; color: var(--text-primary); margin-bottom: 1rem;">NÃO AUTORIZADO</h1>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; line-height: 1.6;">${mensagem}</p>
                <button onclick="voltarParaLogin()" style="padding: 1rem 2rem; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(204, 112, 0, 0.4); transition: all 0.2s;">
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
        
        fretes = await response.json();
        allFretes = [...fretes];
        renderFretes(fretes);
        updateDashboard();
    } catch (error) {
        console.error('Erro:', error);
        if (!silent) {
            showMessage('Erro ao conectar com o servidor: ' + error.message, 'error');
        }
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

// Submeter formulário
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
            showMessage('✅ Registro atualizado com sucesso!', 'success');
        } else {
            response = await fetch(`${API_URL}/fretes`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify(freteData)
            });
            showMessage('✅ Registro cadastrado com sucesso!', 'success');
        }

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSessao');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao salvar');

        await loadFretes();
        closeFormModal();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('❌ Erro ao salvar registro', 'error');
    }
}

// Toggle entregue
async function toggleEntregue(id) {
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

        const updatedFrete = await response.json();
        showMessage(
            updatedFrete.entregue ? '✅ Entrega confirmada!' : '⚪ Entrega desmarcada',
            'success'
        );

        await loadFretes();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('❌ Erro ao atualizar status', 'error');
    }
}

// Deletar frete
async function deleteFrete(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
        {
            title: '⚠️ Excluir Registro',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/fretes/${id}`, {
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

        if (!response.ok) throw new Error('Erro ao excluir');

        showMessage('✅ Registro excluído com sucesso!', 'success');
        await loadFretes();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('❌ Erro ao excluir registro', 'error');
    }
}

// Modal de confirmação
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
                <div class="modal-content" style="max-width: 450px;">
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
                    <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">📦</div>
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
                        <button class="small" onclick="openInfoModal('${frete.id}')">👁️ Ver</button>
                        <button class="edit small" onclick="openFormModal('${frete.id}')">✏️ Editar</button>
                        <button class="small" onclick="openObservacoesModal('${frete.id}')" style="background: #F59E0B; border: none;" title="Observações">⚠️</button>
                        <button class="danger small" onclick="deleteFrete('${frete.id}')">🗑️ Excluir</button>
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

// Filtrar fretes
function filterFretes() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const vendedorFilter = document.getElementById('filterVendedor').value;
    const transportadoraFilter = document.getElementById('filterTransportadora').value;
    const statusFilter = document.getElementById('filterStatus').value;

    const filtered = allFretes.filter(frete => {
        const matchSearch = 
            frete.numero_nf.toLowerCase().includes(searchTerm) ||
            frete.orgao.toLowerCase().includes(searchTerm) ||
            frete.destino.toLowerCase().includes(searchTerm) ||
            (frete.numero_documento && frete.numero_documento.toLowerCase().includes(searchTerm));

        const matchVendedor = !vendedorFilter || frete.vendedor === vendedorFilter;
        const matchTransportadora = !transportadoraFilter || frete.transportadora === transportadoraFilter;
        const matchStatus = !statusFilter || getStatus(frete) === statusFilter;

        return matchSearch && matchVendedor && matchTransportadora && matchStatus;
    });

    renderFretes(filtered);
}

// Mostrar mensagem
function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('statusMessage');
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');

    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

// Abrir modal de informações
function openInfoModal(freteId) {
    const frete = fretes.find(f => f.id === freteId);
    if (!frete) return;

    document.getElementById('modalNF').textContent = frete.numero_nf;
    
    const status = getStatus(frete);
    let statusColor = 'var(--primary)';
    if (status === 'Entregue') statusColor = 'var(--success-color)';
    else if (status === 'Fora do Prazo') statusColor = '#EF4444';
    else if (status === 'Devolução') statusColor = '#F97316';
    else if (status === 'Cancelada') statusColor = '#6B7280';
    else if (status === 'Simples Remessa') statusColor = '#3B82F6';
    else if (status === 'Remessa de Amostra') statusColor = '#A855F7';

    const infoHTML = `
        <div class="info-section">
            <h4>📄 Dados da Nota Fiscal</h4>
            <div class="info-grid">
                <div class="info-box">
                    <div class="info-box-label">Número da NF</div>
                    <div class="info-box-value">${frete.numero_nf}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Data de Emissão</div>
                    <div class="info-box-value">${formatDate(frete.data_emissao)}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Número do Documento</div>
                    <div class="info-box-value">${frete.numero_documento || 'Não informado'}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Valor da Nota</div>
                    <div class="info-box-value" style="color: var(--primary);">${formatCurrency(frete.valor)}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Status Atual</div>
                    <div class="info-box-value" style="color: ${statusColor};">${status}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Status Especial</div>
                    <div class="info-box-value">${frete.status_especial || 'Nenhum'}</div>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h4>👤 Responsável e Destino</h4>
            <div class="info-grid">
                <div class="info-box">
                    <div class="info-box-label">Vendedor Responsável</div>
                    <div class="info-box-value">${frete.vendedor}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Nome do Órgão</div>
                    <div class="info-box-value">${frete.orgao}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Contato do Órgão</div>
                    <div class="info-box-value">${frete.contato_orgao || 'Não informado'}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Cidade-UF de Destino</div>
                    <div class="info-box-value">${frete.destino}</div>
                </div>
            </div>
        </div>

        <div class="info-section">
            <h4>🚚 Informações de Transporte</h4>
            <div class="info-grid">
                <div class="info-box">
                    <div class="info-box-label">Transportadora</div>
                    <div class="info-box-value">${frete.transportadora}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Valor do Frete</div>
                    <div class="info-box-value">${formatCurrency(frete.valor_frete)}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Data da Coleta</div>
                    <div class="info-box-value">${formatDate(frete.data_coleta)}</div>
                </div>
                <div class="info-box">
                    <div class="info-box-label">Data de Entrega</div>
                    <div class="info-box-value">${formatDate(frete.data_entrega)}</div>
                </div>
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
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">📝 Nenhuma observação registrada ainda.</p>';
        return;
    }

    const sortedObs = [...observacoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = sortedObs.map(obs => `
        <div class="observacao-item">
            <div class="observacao-header">
                <div class="observacao-data">📅 ${formatDateTime(obs.created_at)}</div>
                <button class="danger small" onclick="excluirObservacao('${obs.id}')" style="margin: 0; padding: 4px 8px;">🗑️ Excluir</button>
            </div>
            <div class="observacao-texto">${obs.texto}</div>
        </div>
    `).join('');
}

// Adicionar observação
async function adicionarObservacao() {
    const texto = document.getElementById('novaObservacao').value.trim();
    if (!texto) {
        showMessage('⚠️ Digite uma observação antes de adicionar!', 'error');
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

        showMessage('✅ Observação adicionada com sucesso!', 'success');
        document.getElementById('novaObservacao').value = '';
        
        await loadFretes();
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showMessage('❌ Erro ao adicionar observação', 'error');
    }
}

// Excluir observação
async function excluirObservacao(obsId) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir esta observação?',
        {
            title: '⚠️ Excluir Observação',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

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

        showMessage('✅ Observação excluída!', 'success');
        
        await loadFretes();
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showMessage('❌ Erro ao excluir observação', 'error');
    }
}

// Fechar modais clicando fora
window.onclick = function(event) {
    const formModal = document.getElementById('formModal');
    const infoModal = document.getElementById('infoModal');
    const obsModal = document.getElementById('observacoesModal');
    const confirmModal = document.getElementById('confirmModal');
    
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
