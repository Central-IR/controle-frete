// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://controle-frete.onrender.com/api';

let fretes = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentMonth = new Date();

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

console.log('Controle de Frete iniciado');

// ============================================
// BADGE E LABELS DE TIPO DE NOTA
// ============================================
function getTipoNotaBadge(frete) {
    const isEspecial = frete.tipo_nf && frete.tipo_nf !== 'ENVIO';
    
    if (isEspecial) {
        return `<span class="badge badge-especial">${frete.tipo_nf.replace(/_/g, ' ')}</span>`;
    }
    
    return getStatusBadge(frete.status);
}

function getTipoNfLabel(tipo) {
    const labels = {
        'ENVIO': 'Envio',
        'CANCELADA': 'Cancelada',
        'REMESSA_AMOSTRA': 'Remessa de Amostra',
        'SIMPLES_REMESSA': 'Simples Remessa',
        'DEVOLUCAO': 'Devolução'
    };
    return labels[tipo] || tipo || 'Envio';
}

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// NAVEGAÇÃO POR MESES
// ============================================
function updateDisplay() {
    const display = document.getElementById('currentMonth');
    if (display) {
        display.textContent = `${meses[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    }
    updateDashboard();
    filterFretes();
}

window.changeMonth = function(direction) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1);
    updateDisplay();
};

// ============================================
// AUTENTICAÇÃO
// ============================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('controleFreteSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('controleFreteSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    updateDisplay();
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

// ============================================
// CONEXÃO E STATUS
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/fretes`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('Servidor ONLINE');
            await loadFretes();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadFretes(showMessage = false) {
    if (!isOnline) {
        if (showMessage) {
            showToast('Sistema offline. Não foi possível sincronizar.', 'error');
        }
        return;
    }

    try {
        // Adicionar timestamp para evitar cache
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}/fretes?_t=${timestamp}`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            if (showMessage) {
                showToast('Erro ao sincronizar dados', 'error');
            }
            return;
        }

        const data = await response.json();
        
        // SEMPRE atualizar os dados
        fretes = data;
        lastDataHash = JSON.stringify(fretes.map(f => f.id));
        
        console.log(`[${new Date().toLocaleTimeString()}] ${fretes.length} fretes carregados`);
        
        updateAllFilters();
        updateDashboard();
        filterFretes();
        
        if (showMessage) {
            showToast('Dados sincronizados com sucesso!', 'success');
        }
        
        // VERIFICAR NOTAS EM ATRASO (apenas na primeira carga)
        if (!sessionStorage.getItem('alertaAtrasosExibido')) {
            setTimeout(() => verificarNotasAtrasadas(), 1000);
            sessionStorage.setItem('alertaAtrasosExibido', 'true');
        }
    } catch (error) {
        console.error('Erro ao carregar:', error);
        if (showMessage) {
            showToast('Erro ao sincronizar dados', 'error');
        }
    }
}

// Função global para sincronização manual
window.sincronizarDados = function() {
    loadFretes(true);
};

function startPolling() {
    loadFretes();
    setInterval(() => {
        if (isOnline) loadFretes();
    }, 10000);
}

// ============================================
// DASHBOARD ATUALIZADO
// ============================================
function updateDashboard() {
    const fretesMesAtual = fretes.filter(f => {
        const data = new Date(f.data_emissao + 'T00:00:00');
        return data.getMonth() === currentMonth.getMonth() && data.getFullYear() === currentMonth.getFullYear();
    });

    // FILTRAR APENAS NOTAS DO TIPO ENVIO PARA CONTABILIZAR
    const fretesEnvio = fretesMesAtual.filter(f => !f.tipo_nf || f.tipo_nf === 'ENVIO');

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const entregues = fretesEnvio.filter(f => f.status === 'ENTREGUE').length;
    
    const foraPrazo = fretesEnvio.filter(f => {
        if (f.status === 'ENTREGUE') return false;
        const previsao = new Date(f.previsao_entrega + 'T00:00:00');
        previsao.setHours(0, 0, 0, 0);
        return previsao < hoje;
    }).length;
    
    const transito = fretesEnvio.filter(f => f.status === 'EM_TRANSITO').length;
    const valorTotal = fretesEnvio.reduce((sum, f) => sum + parseFloat(f.valor_nf || 0), 0);
    const freteTotal = fretesEnvio.reduce((sum, f) => sum + parseFloat(f.valor_frete || 0), 0);
    
    document.getElementById('statEntregues').textContent = entregues;
    document.getElementById('statForaPrazo').textContent = foraPrazo;
    document.getElementById('statTransito').textContent = transito;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('statFrete').textContent = `R$ ${freteTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const cardForaPrazo = document.getElementById('cardForaPrazo');
    const pulseBadge = document.getElementById('pulseBadge');
    
    if (foraPrazo > 0) {
        cardForaPrazo.classList.add('has-alert');
        pulseBadge.style.display = 'flex';
        pulseBadge.textContent = foraPrazo;
    } else {
        cardForaPrazo.classList.remove('has-alert');
        pulseBadge.style.display = 'none';
    }
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal" style="z-index: 10001;">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p style="margin: 1.5rem 0; color: var(--text-primary); font-size: 1rem; line-height: 1.6;">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
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

        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `@keyframes fadeOut { to { opacity: 0; } }`;
            document.head.appendChild(style);
        }
    });
}

// ============================================
// FORMULÁRIO COM OBSERVAÇÕES
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    let frete = null;
    
    if (isEditing) {
        const idStr = String(editingId);
        frete = fretes.find(f => String(f.id) === idStr);
        
        if (!frete) {
            showToast('Frete não encontrado!', 'error');
            return;
        }
    }

    // Processar observações
    let observacoesArray = [];
    if (frete && frete.observacoes) {
        try {
            observacoesArray = typeof frete.observacoes === 'string' 
                ? JSON.parse(frete.observacoes) 
                : frete.observacoes;
        } catch (e) {
            console.error('Erro ao parsear observações:', e);
        }
    }

    const observacoesHTML = observacoesArray.length > 0 
        ? observacoesArray.map((obs, idx) => `
            <div class="observacao-item" data-index="${idx}">
                <div class="observacao-header">
                    <span class="observacao-data">${new Date(obs.timestamp).toLocaleString('pt-BR')}</span>
                    <button type="button" class="btn-remove-obs" onclick="removerObservacao(${idx})" title="Remover">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <p class="observacao-texto">${obs.texto}</p>
            </div>
        `).join('')
        : '<p style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 2rem;">Nenhuma observação registrada</p>';

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Frete' : 'Novo Frete'}</h3>
                    <button class="close-modal" onclick="closeFormModal(true)">✕</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchFormTab(0)">Dados da Nota</button>
                        <button class="tab-btn" onclick="switchFormTab(1)">Órgão</button>
                        <button class="tab-btn" onclick="switchFormTab(2)">Transporte</button>
                        <button class="tab-btn" onclick="switchFormTab(3)">Observações</button>
                    </div>

                    <form id="freteForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        <input type="hidden" id="observacoesData" value='${JSON.stringify(observacoesArray)}'>
                        
                        <div class="tab-content active" id="tab-nota">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="numero_nf">Número da NF *</label>
                                    <input type="text" id="numero_nf" value="${frete?.numero_nf || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_emissao">Data de Emissão</label>
                                    <input type="date" id="data_emissao" value="${frete?.data_emissao || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento</label>
                                    <input type="text" id="documento" value="${frete?.documento || ''}" placeholder="CPF/CNPJ">
                                </div>
                                <div class="form-group">
                                    <label for="valor_nf">Valor da Nota (R$)</label>
                                    <input type="number" id="valor_nf" step="0.01" min="0" value="${frete?.valor_nf || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="tipo_nf">Tipo de NF</label>
                                    <select id="tipo_nf" onchange="handleTipoNfChange()">
                                        <option value="ENVIO" ${!frete?.tipo_nf || frete?.tipo_nf === 'ENVIO' ? 'selected' : ''}>Envio</option>
                                        <option value="CANCELADA" ${frete?.tipo_nf === 'CANCELADA' ? 'selected' : ''}>Cancelada</option>
                                        <option value="REMESSA_AMOSTRA" ${frete?.tipo_nf === 'REMESSA_AMOSTRA' ? 'selected' : ''}>Remessa de Amostra</option>
                                        <option value="SIMPLES_REMESSA" ${frete?.tipo_nf === 'SIMPLES_REMESSA' ? 'selected' : ''}>Simples Remessa</option>
                                        <option value="DEVOLUCAO" ${frete?.tipo_nf === 'DEVOLUCAO' ? 'selected' : ''}>Devolução</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-orgao">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="nome_orgao">Nome do Órgão *</label>
                                    <input type="text" id="nome_orgao" value="${frete?.nome_orgao || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="contato_orgao">Contato do Órgão</label>
                                    <input type="text" id="contato_orgao" value="${frete?.contato_orgao || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor Responsável</label>
                                    <select id="vendedor">
                                        <option value="">Selecione...</option>
                                        <option value="ISAQUE" ${frete?.vendedor === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${frete?.vendedor === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-transporte">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="transportadora">Transportadora</label>
                                    <select id="transportadora">
                                        <option value="">Selecione...</option>
                                        <option value="JADLOG" ${frete?.transportadora === 'JADLOG' ? 'selected' : ''}>JADLOG</option>
                                        <option value="TOTAL EXPRESS" ${frete?.transportadora === 'TOTAL EXPRESS' ? 'selected' : ''}>TOTAL EXPRESS</option>
                                        <option value="CORREIOS" ${frete?.transportadora === 'CORREIOS' ? 'selected' : ''}>CORREIOS</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="valor_frete">Valor do Frete (R$)</label>
                                    <input type="number" id="valor_frete" step="0.01" min="0" value="${frete?.valor_frete || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="data_coleta">Data da Coleta *</label>
                                    <input type="date" id="data_coleta" value="${frete?.data_coleta || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="cidade_destino">Cidade-UF (Destino)</label>
                                    <input type="text" id="cidade_destino" value="${frete?.cidade_destino || ''}" placeholder="Ex: São Paulo-SP">
                                </div>
                                <div class="form-group">
                                    <label for="previsao_entrega">Previsão de Entrega</label>
                                    <input type="date" id="previsao_entrega" value="${frete?.previsao_entrega || ''}">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-observacoes">
                            <div class="observacoes-section">
                                <div class="observacoes-list" id="observacoesList">
                                    ${observacoesHTML}
                                </div>
                                
                                <div class="nova-observacao">
                                    <label for="novaObservacao">Nova Observação</label>
                                    <textarea id="novaObservacao" placeholder="Digite sua observação aqui..." rows="3"></textarea>
                                    <button type="button" class="btn-add-obs" onclick="adicionarObservacao()">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                        Adicionar Observação
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">${editingId ? 'Atualizar' : 'Salvar'}</button>
                            <button type="button" class="secondary" onclick="closeFormModal(true)">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // MAIÚSCULAS automáticas
    const camposMaiusculas = ['numero_nf', 'documento', 'nome_orgao', 'contato_orgao', 'cidade_destino'];

    camposMaiusculas.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
            campo.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, start);
            });
        }
    });
    
    setTimeout(() => document.getElementById('numero_nf')?.focus(), 100);
}

// ============================================
// FUNÇÕES DE OBSERVAÇÕES
// ============================================
window.adicionarObservacao = function() {
    const textarea = document.getElementById('novaObservacao');
    const texto = textarea.value.trim();
    
    if (!texto) {
        showToast('Digite uma observação primeiro', 'error');
        return;
    }
    
    const observacoesDataField = document.getElementById('observacoesData');
    let observacoes = JSON.parse(observacoesDataField.value || '[]');
    
    observacoes.push({
        texto: texto,
        timestamp: new Date().toISOString()
    });
    
    observacoesDataField.value = JSON.stringify(observacoes);
    textarea.value = '';
    
    atualizarListaObservacoes();
    showToast('Observação adicionada', 'success');
};

window.removerObservacao = function(index) {
    const observacoesDataField = document.getElementById('observacoesData');
    let observacoes = JSON.parse(observacoesDataField.value || '[]');
    
    observacoes.splice(index, 1);
    observacoesDataField.value = JSON.stringify(observacoes);
    
    atualizarListaObservacoes();
    showToast('Observação removida', 'success');
};

function atualizarListaObservacoes() {
    const observacoesDataField = document.getElementById('observacoesData');
    const observacoes = JSON.parse(observacoesDataField.value || '[]');
    const container = document.getElementById('observacoesList');
    
    if (observacoes.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 2rem;">Nenhuma observação registrada</p>';
    } else {
        container.innerHTML = observacoes.map((obs, idx) => `
            <div class="observacao-item" data-index="${idx}">
                <div class="observacao-header">
                    <span class="observacao-data">${new Date(obs.timestamp).toLocaleString('pt-BR')}</span>
                    <button type="button" class="btn-remove-obs" onclick="removerObservacao(${idx})" title="Remover">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <p class="observacao-texto">${obs.texto}</p>
            </div>
        `).join('');
    }
}

window.handleTipoNfChange = function() {
    // Apenas para futura expansão se necessário
};

function closeFormModal(showCancelMessage = false) {
    const modal = document.getElementById('formModal');
    if (modal) {
        const editId = document.getElementById('editId')?.value;
        const isEditing = editId && editId !== '';
        
        if (showCancelMessage) {
            showToast(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        }
        
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// SISTEMA DE ABAS
// ============================================
window.switchFormTab = function(index) {
    const tabButtons = document.querySelectorAll('#formModal .tab-btn');
    const tabContents = document.querySelectorAll('#formModal .tab-content');
    
    tabButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    tabContents.forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// SUBMIT
// ============================================
async function handleSubmit(event) {
    if (event) event.preventDefault();

    const observacoesField = document.getElementById('observacoesData');
    const observacoesValue = observacoesField ? observacoesField.value : '[]';

    const formData = {
        numero_nf: document.getElementById('numero_nf').value.trim(),
        data_emissao: document.getElementById('data_emissao').value || new Date().toISOString().split('T')[0],
        documento: document.getElementById('documento').value.trim() || 'NÃO INFORMADO',
        valor_nf: document.getElementById('valor_nf').value ? parseFloat(document.getElementById('valor_nf').value) : 0,
        tipo_nf: document.getElementById('tipo_nf').value || 'ENVIO',
        nome_orgao: document.getElementById('nome_orgao').value.trim(),
        contato_orgao: document.getElementById('contato_orgao').value.trim() || 'NÃO INFORMADO',
        vendedor: document.getElementById('vendedor').value.trim() || 'NÃO INFORMADO',
        transportadora: document.getElementById('transportadora').value.trim() || 'NÃO INFORMADO',
        valor_frete: document.getElementById('valor_frete').value ? parseFloat(document.getElementById('valor_frete').value) : 0,
        data_coleta: document.getElementById('data_coleta').value,
        cidade_destino: document.getElementById('cidade_destino').value.trim() || 'NÃO INFORMADO',
        previsao_entrega: document.getElementById('previsao_entrega').value || null,
        observacoes: observacoesValue
    };
    
    console.log('[SUBMIT] Enviando tipo_nf:', formData.tipo_nf);

    // Calcular status baseado no tipo de NF
    if (formData.tipo_nf && formData.tipo_nf !== 'ENVIO') {
        // Tipos especiais não têm status normal, servidor vai tratar
        formData.status = null;
    }

    const editId = document.getElementById('editId').value;

    if (editId) {
        const freteExistente = fretes.find(f => String(f.id) === String(editId));
        if (freteExistente) {
            formData.timestamp = freteExistente.timestamp;
        }
    }

    if (!isOnline) {
        showToast('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editId ? `${API_URL}/fretes/${editId}` : `${API_URL}/fretes`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('controleFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Erro ao salvar');
        }

        const savedData = await response.json();
        console.log('[RESPOSTA] Dados salvos pelo servidor:', savedData);
        console.log('[RESPOSTA] tipo_nf retornado:', savedData.tipo_nf);
        console.log('[RESPOSTA] status retornado:', savedData.status);

        if (editId) {
            // Buscar o frete ANTES de atualizar para comparar
            const freteAntes = fretes.find(f => String(f.id) === String(editId));
            const tipoAnterior = freteAntes ? freteAntes.tipo_nf : null;
            
            // FORÇAR RECARREGAMENTO COMPLETO dos dados do servidor
            await loadFretes(false);
            
            // Verificar se mudou o tipo de NF
            if (tipoAnterior && tipoAnterior !== formData.tipo_nf) {
                showToast(`Tipo de NF alterado para: ${getTipoNfLabel(formData.tipo_nf)}`, 'success');
            } else {
                showToast('Frete atualizado!', 'success');
            }
        } else {
            fretes.push(savedData);
            showToast('Frete criado!', 'success');
            
            lastDataHash = JSON.stringify(fretes.map(f => f.id));
            updateAllFilters();
            updateDashboard();
            filterFretes();
        }
        
        closeFormModal();

    } catch (error) {
        console.error('Erro:', error);
        showToast(`Erro: ${error.message}`, 'error');
        closeFormModal();
    }
}

// ============================================
// TOGGLE ENTREGUE (CHECKBOX)
// ============================================
window.toggleEntregue = async function(id) {
    const idStr = String(id);
    const frete = fretes.find(f => String(f.id) === idStr);
    
    if (!frete) return;
    
    // Só permite toggle se for tipo ENVIO e estiver EM_TRANSITO ou ENTREGUE
    const isTipoEnvio = !frete.tipo_nf || frete.tipo_nf === 'ENVIO';
    if (!isTipoEnvio) {
        return;
    }

    const novoStatus = frete.status === 'ENTREGUE' ? 'EM_TRANSITO' : 'ENTREGUE';

    // Atualizar no servidor primeiro
    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/fretes/${idStr}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: novoStatus }),
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao atualizar');

            const savedData = await response.json();
            const index = fretes.findIndex(f => String(f.id) === idStr);
            if (index !== -1) {
                fretes[index] = savedData;
                updateDashboard();
                filterFretes();
            }

        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            showToast('Erro ao atualizar status', 'error');
        }
    }
};

// ============================================
// EDIÇÃO
// ============================================
window.editFrete = function(id) {
    const idStr = String(id);
    const frete = fretes.find(f => String(f.id) === idStr);
    
    if (!frete) {
        showToast('Frete não encontrado!', 'error');
        return;
    }
    
    showFormModal(idStr);
};

function getStatusBadgeForRender(frete) {
    // Se for tipo especial (não ENVIO), mostrar badge CINZA do tipo
    const isEspecial = frete.tipo_nf && frete.tipo_nf !== 'ENVIO';
    if (isEspecial) {
        const tipoLabel = getTipoNfLabel(frete.tipo_nf);
        return `<span class="badge badge-especial">${tipoLabel.toUpperCase()}</span>`;
    }
    
    // Para tipo ENVIO, verificar se está fora do prazo
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Se não está entregue E está fora do prazo, mostrar "Fora do Prazo" em vermelho
    if (frete.status !== 'ENTREGUE' && frete.previsao_entrega) {
        const previsao = new Date(frete.previsao_entrega + 'T00:00:00');
        previsao.setHours(0, 0, 0, 0);
        
        if (previsao < hoje) {
            return '<span class="badge devolvido">FORA DO PRAZO</span>';
        }
    }
    
    // Mostrar status com cores:
    // - EM_TRANSITO = LARANJA
    // - ENTREGUE = VERDE
    return getStatusBadge(frete.status);
}

// ============================================
// EXCLUSÃO
// ============================================
window.deleteFrete = async function(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir este frete?',
        {
            title: 'Excluir Frete',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    const idStr = String(id);
    const deletedFrete = fretes.find(f => String(f.id) === idStr);
    fretes = fretes.filter(f => String(f.id) !== idStr);
    updateAllFilters();
    updateDashboard();
    filterFretes();
    showToast('Frete excluído!', 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/fretes/${idStr}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedFrete) {
                fretes.push(deletedFrete);
                updateAllFilters();
                updateDashboard();
                filterFretes();
                showToast('Erro ao excluir', 'error');
            }
        }
    }
};

// ============================================
// VISUALIZAÇÃO
// ============================================
window.viewFrete = function(id) {
    const idStr = String(id);
    const frete = fretes.find(f => String(f.id) === idStr);
    
    if (!frete) {
        showToast('Frete não encontrado!', 'error');
        return;
    }

    // Processar observações
    let observacoesArray = [];
    if (frete.observacoes) {
        try {
            observacoesArray = typeof frete.observacoes === 'string' 
                ? JSON.parse(frete.observacoes) 
                : frete.observacoes;
        } catch (e) {
            console.error('Erro ao parsear observações:', e);
        }
    }

    const observacoesHTML = observacoesArray.length > 0 
        ? observacoesArray.map(obs => `
            <div class="observacao-item-view">
                <div class="observacao-header">
                    <span class="observacao-data">${new Date(obs.timestamp).toLocaleString('pt-BR')}</span>
                </div>
                <p class="observacao-texto">${obs.texto}</p>
            </div>
        `).join('')
        : '<p style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 1rem;">Nenhuma observação registrada</p>';

    // Função auxiliar para exibir valores
    const displayValue = (val) => {
        if (!val || val === 'NÃO INFORMADO') return '-';
        return val;
    };

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes do Frete</h3>
                    <button class="close-modal" onclick="closeViewModal()">✕</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">Dados da Nota</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Órgão</button>
                        <button class="tab-btn" onclick="switchViewTab(2)">Transporte</button>
                        <button class="tab-btn" onclick="switchViewTab(3)">Observações</button>
                    </div>

                    <div class="tab-content active" id="view-tab-nota">
                        <div class="info-section">
                            <h4>Dados da Nota Fiscal</h4>
                            <p><strong>Número NF:</strong> ${frete.numero_nf || '-'}</p>
                            <p><strong>Data Emissão:</strong> ${frete.data_emissao ? formatDate(frete.data_emissao) : '-'}</p>
                            <p><strong>Documento:</strong> ${displayValue(frete.documento)}</p>
                            <p><strong>Valor NF:</strong> R$ ${frete.valor_nf ? parseFloat(frete.valor_nf).toFixed(2) : '0,00'}</p>
                            <p><strong>Tipo NF:</strong> ${getTipoNfLabel(frete.tipo_nf)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-orgao">
                        <div class="info-section">
                            <h4>Dados do Órgão</h4>
                            <p><strong>Nome do Órgão:</strong> ${frete.nome_orgao || '-'}</p>
                            <p><strong>Contato:</strong> ${displayValue(frete.contato_orgao)}</p>
                            <p><strong>Vendedor Responsável:</strong> ${displayValue(frete.vendedor)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-transporte">
                        <div class="info-section">
                            <h4>Dados do Transporte</h4>
                            <p><strong>Transportadora:</strong> ${displayValue(frete.transportadora)}</p>
                            <p><strong>Valor do Frete:</strong> R$ ${frete.valor_frete ? parseFloat(frete.valor_frete).toFixed(2) : '0,00'}</p>
                            <p><strong>Data Coleta:</strong> ${frete.data_coleta ? formatDate(frete.data_coleta) : '-'}</p>
                            <p><strong>Destino:</strong> ${displayValue(frete.cidade_destino)}</p>
                            <p><strong>Previsão Entrega:</strong> ${frete.previsao_entrega ? formatDate(frete.previsao_entrega) : '-'}</p>
                            <p><strong>Status:</strong> ${getStatusBadgeForRender(frete)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-observacoes">
                        <div class="info-section">
                            <h4>Observações</h4>
                            <div class="observacoes-list-view">
                                ${observacoesHTML}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

window.switchViewTab = function(index) {
    document.querySelectorAll('#viewModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    document.querySelectorAll('#viewModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// FILTROS - ATUALIZAÇÃO DINÂMICA
// ============================================
function updateAllFilters() {
    updateStatusFilter();
    updateTransportadoraFilter();
    updateVendedorFilter();
}

function updateTransportadoraFilter() {
    const transportadoras = new Set();
    fretes.forEach(f => {
        if (f.transportadora?.trim()) {
            transportadoras.add(f.transportadora.trim());
        }
    });

    const select = document.getElementById('filterTransportadora');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todas Transportadoras</option>';
        Array.from(transportadoras).sort().forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function updateVendedorFilter() {
    const vendedores = new Set();
    fretes.forEach(f => {
        if (f.vendedor?.trim()) {
            vendedores.add(f.vendedor.trim());
        }
    });

    const select = document.getElementById('filterVendedor');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos Vendedores</option>';
        Array.from(vendedores).sort().forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.textContent = v;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function updateStatusFilter() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const statusSet = new Set();
    let temForaDoPrazo = false;
    
    fretes.forEach(f => {
        // Adicionar status existente
        if (f.status?.trim()) {
            statusSet.add(f.status.trim());
        }
        
        // Verificar se tem algum fora do prazo (apenas tipo ENVIO)
        const isTipoEnvio = !f.tipo_nf || f.tipo_nf === 'ENVIO';
        if (isTipoEnvio && f.status !== 'ENTREGUE') {
            const previsao = new Date(f.previsao_entrega + 'T00:00:00');
            previsao.setHours(0, 0, 0, 0);
            if (previsao < hoje) {
                temForaDoPrazo = true;
            }
        }
    });

    const select = document.getElementById('filterStatus');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos os Status</option>';
        
        // Adicionar "Fora do Prazo" SOMENTE se existir
        if (temForaDoPrazo) {
            const optionForaPrazo = document.createElement('option');
            optionForaPrazo.value = 'FORA_DO_PRAZO';
            optionForaPrazo.textContent = 'Fora do Prazo';
            select.appendChild(optionForaPrazo);
        }
        
        const statusMap = {
            'EM_TRANSITO': 'Em Trânsito',
            'ENTREGUE': 'Entregue'
        };
        
        Array.from(statusSet).sort().forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = statusMap[s] || s;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

// ============================================
// FILTROS E RENDERIZAÇÃO
// ============================================
function filterFretes() {
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const filterTransportadora = document.getElementById('filterTransportadora')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    const filterVendedor = document.getElementById('filterVendedor')?.value || '';
    
    let filtered = [...fretes];

    // Filtro por mês/ano selecionado
    filtered = filtered.filter(f => {
        const dataEmissao = new Date(f.data_emissao + 'T00:00:00');
        return dataEmissao.getMonth() === currentMonth.getMonth() && dataEmissao.getFullYear() === currentMonth.getFullYear();
    });

    // Filtro de transportadora
    if (filterTransportadora) {
        filtered = filtered.filter(f => f.transportadora === filterTransportadora);
    }

    // Filtro de vendedor
    if (filterVendedor) {
        filtered = filtered.filter(f => f.vendedor === filterVendedor);
    }

    // Filtro de status
    if (filterStatus) {
        if (filterStatus === 'FORA_DO_PRAZO') {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            filtered = filtered.filter(f => {
                // Apenas tipo ENVIO
                const isTipoEnvio = !f.tipo_nf || f.tipo_nf === 'ENVIO';
                if (!isTipoEnvio) return false;
                
                if (f.status === 'ENTREGUE') return false;
                const previsao = new Date(f.previsao_entrega + 'T00:00:00');
                previsao.setHours(0, 0, 0, 0);
                return previsao < hoje;
            });
        } else {
            filtered = filtered.filter(f => f.status === filterStatus);
        }
    }

    // Busca por texto (melhorada)
    if (searchTerm) {
        filtered = filtered.filter(f => {
            const searchFields = [
                f.numero_nf,
                f.transportadora,
                f.nome_orgao,
                f.cidade_destino,
                f.vendedor,
                f.documento,
                f.contato_orgao
            ];
            
            return searchFields.some(field => 
                field && field.toString().toLowerCase().includes(searchTerm)
            );
        });
    }

    // ORDENAR POR NÚMERO DA NF (crescente)
    filtered.sort((a, b) => {
        const numA = parseInt(a.numero_nf) || 0;
        const numB = parseInt(b.numero_nf) || 0;
        return numA - numB;
    });
    
    renderFretes(filtered);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderFretes(fretesToRender) {
    const container = document.getElementById('fretesContainer');
    
    if (!container) return;
    
    if (!fretesToRender || fretesToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum frete encontrado</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">
                            <span style="font-size: 1.1rem;">✓</span>
                        </th>
                        <th>NF</th>
                        <th>Emissão</th>
                        <th>Órgão</th>
                        <th>Vendedor</th>
                        <th>Transportadora</th>
                        <th>Valor NF</th>
                        <th>Status</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${fretesToRender.map(f => {
                        const isEntregue = f.status === 'ENTREGUE';
                        const isTipoEnvio = !f.tipo_nf || f.tipo_nf === 'ENVIO';
                        
                        // Mostrar checkbox apenas se for tipo ENVIO (permite toggle entre EM_TRANSITO e ENTREGUE)
                        const showCheckbox = isTipoEnvio;
                        
                        // Função para exibir valor ou "-" se for "NÃO INFORMADO"
                        const displayValue = (val) => {
                            if (!val || val === 'NÃO INFORMADO') return '-';
                            return val;
                        };
                        
                        return `
                        <tr class="${isEntregue ? 'row-entregue' : ''}">
                            <td style="text-align: center; padding: 8px;">
                                ${showCheckbox ? `
                                <div class="checkbox-wrapper">
                                    <input 
                                        type="checkbox" 
                                        id="check-${f.id}"
                                        ${isEntregue ? 'checked' : ''}
                                        onchange="toggleEntregue('${f.id}')"
                                        class="styled-checkbox"
                                    >
                                    <label for="check-${f.id}" class="checkbox-label-styled"></label>
                                </div>
                                ` : ''}
                            </td>
                            <td><strong>${f.numero_nf || '-'}</strong></td>
                            <td style="white-space: nowrap;">${formatDate(f.data_emissao)}</td>
                            <td style="max-width: 200px; word-wrap: break-word; white-space: normal;">${f.nome_orgao || '-'}</td>
                            <td>${displayValue(f.vendedor)}</td>
                            <td>${displayValue(f.transportadora)}</td>
                            <td><strong>R$ ${f.valor_nf ? parseFloat(f.valor_nf).toFixed(2) : '0,00'}</strong></td>
                            <td>${getStatusBadgeForRender(f)}</td>
                            <td class="actions-cell" style="text-align: center; white-space: nowrap;">
                                <button onclick="viewFrete('${f.id}')" class="action-btn view" title="Ver detalhes">Ver</button>
                                <button onclick="editFrete('${f.id}')" class="action-btn edit" title="Editar">Editar</button>
                                <button onclick="deleteFrete('${f.id}')" class="action-btn delete" title="Excluir">Excluir</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

// ============================================
// UTILIDADES
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function getStatusBadge(status) {
    const statusMap = {
        'EM_TRANSITO': { class: 'transito', text: 'Em Trânsito' },
        'ENTREGUE': { class: 'entregue', text: 'Entregue' },
        'DEVOLUCAO': { class: 'devolvido', text: 'Devolução' },
        'SIMPLES_REMESSA': { class: 'cancelado', text: 'Simples Remessa' },
        'REMESSA_AMOSTRA': { class: 'cancelado', text: 'Remessa de Amostra' },
        'CANCELADO': { class: 'cancelado', text: 'Cancelada' }
    };
    
    const s = statusMap[status] || { class: 'transito', text: status };
    return `<span class="badge ${s.class}">${s.text}</span>`;
}

function showToast(message, type) {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutBottom 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// ============================================
// ALERTA DE NOTAS EM ATRASO
// ============================================
function verificarNotasAtrasadas() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Buscar notas TIPO ENVIO que estão em atraso
    const notasAtrasadas = fretes.filter(f => {
        // Apenas tipo ENVIO
        const isTipoEnvio = !f.tipo_nf || f.tipo_nf === 'ENVIO';
        if (!isTipoEnvio) return false;
        
        // Não entregues
        if (f.status === 'ENTREGUE') return false;
        
        // Previsão vencida
        const previsao = new Date(f.previsao_entrega + 'T00:00:00');
        previsao.setHours(0, 0, 0, 0);
        
        return previsao < hoje;
    });
    
    // Se não há notas atrasadas, não mostrar alerta
    if (notasAtrasadas.length === 0) return;
    
    // Ordenar por data de previsão (mais atrasadas primeiro)
    notasAtrasadas.sort((a, b) => {
        const dataA = new Date(a.previsao_entrega);
        const dataB = new Date(b.previsao_entrega);
        return dataA - dataB;
    });
    
    mostrarAlertaAtrasos(notasAtrasadas);
}

function mostrarAlertaAtrasos(notasAtrasadas) {
    const hoje = new Date();
    
    // Calcular dias de atraso
    const calcularDiasAtraso = (previsao) => {
        const previsaoDate = new Date(previsao + 'T00:00:00');
        const diff = hoje - previsaoDate;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    };
    
    // Limitar a 5 notas mais atrasadas
    const notasMostrar = notasAtrasadas.slice(0, 5);
    
    const linhasTabela = notasMostrar.map(nota => {
        const diasAtraso = calcularDiasAtraso(nota.previsao_entrega);
        return `
            <tr>
                <td><strong>${nota.numero_nf}</strong></td>
                <td>${nota.nome_orgao}</td>
                <td>${nota.transportadora}</td>
                <td style="white-space: nowrap;">${formatDate(nota.previsao_entrega)}</td>
                <td style="text-align: center;">
                    <span style="background: rgba(239, 68, 68, 0.15); color: #EF4444; padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">
                        ${diasAtraso} ${diasAtraso === 1 ? 'DIA' : 'DIAS'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    const mensagemRodape = notasAtrasadas.length > 5 
        ? `<p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 1rem; text-align: center;">
            + ${notasAtrasadas.length - 5} ${notasAtrasadas.length - 5 === 1 ? 'outra nota' : 'outras notas'} em atraso
           </p>`
        : '';
    
    const modalHTML = `
        <div class="modal-overlay" id="alertaAtrasosModal" style="z-index: 999999;">
            <div class="modal-content" style="max-width: 900px; width: 90%;">
                <div class="modal-header" style="border-bottom: 3px solid #EF4444; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; background: rgba(239, 68, 68, 0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5">
                                <path d="M12 9v4m0 4h.01M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0z"/>
                            </svg>
                        </div>
                        <div>
                            <h3 class="modal-title" style="margin: 0; color: #EF4444; font-size: 1.4rem;">
                                ⚠️ ATENÇÃO: ${notasAtrasadas.length} ${notasAtrasadas.length === 1 ? 'NOTA EM ATRASO' : 'NOTAS EM ATRASO'}
                            </h3>
                            <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">
                                ${notasAtrasadas.length === 1 ? 'Esta nota passou' : 'Estas notas passaram'} da previsão de entrega
                            </p>
                        </div>
                    </div>
                </div>
                
                <div style="overflow-x: auto; margin-bottom: 1.5rem;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                                <th style="padding: 12px; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: var(--text-primary);">NF</th>
                                <th style="padding: 12px; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: var(--text-primary);">ÓRGÃO</th>
                                <th style="padding: 12px; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: var(--text-primary);">TRANSPORTADORA</th>
                                <th style="padding: 12px; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: var(--text-primary);">PREVISÃO</th>
                                <th style="padding: 12px; text-align: center; font-size: 0.85rem; text-transform: uppercase; color: var(--text-primary);">ATRASO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${linhasTabela}
                        </tbody>
                    </table>
                </div>
                
                ${mensagemRodape}
                
                <div class="modal-actions" style="border-top: 2px solid var(--border-color); padding-top: 1.5rem; margin-top: 1.5rem;">
                    <button type="button" class="save" onclick="fecharAlertaAtrasos()" style="min-width: 120px;">
                        ENTENDIDO
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Animação de entrada
    const modal = document.getElementById('alertaAtrasosModal');
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

window.fecharAlertaAtrasos = function() {
    const modal = document.getElementById('alertaAtrasosModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
};

// Limpar flag ao fechar a página (para mostrar novamente na próxima sessão)
window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem('alertaAtrasosExibido');
});
