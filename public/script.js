// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://controle-frete.onrender.com/api';

let fretes = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentTab = 0;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
const tabs = ['tab-nota', 'tab-orgao', 'tab-transporte'];

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

console.log('Controle de Frete iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// NAVEGAÇÃO POR MESES
// ============================================
function updateMonthDisplay() {
    const display = document.getElementById('currentMonthDisplay');
    if (display) {
        display.textContent = `${meses[currentMonth]} ${currentYear}`;
    }
    updateDashboard();
    filterFretes();
}

window.previousMonth = function() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    updateMonthDisplay();
};

window.nextMonth = function() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    updateMonthDisplay();
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
    updateMonthDisplay();
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
async function loadFretes() {
    if (!isOnline) return;

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
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        fretes = data;
        
        const newHash = JSON.stringify(fretes.map(f => f.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            console.log(`${fretes.length} fretes carregados`);
            updateAllFilters();
            updateDashboard();
            filterFretes();
        }
    } catch (error) {
        console.error('Erro ao carregar:', error);
    }
}

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
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Status monitorados
    const statusMonitorados = ['EM_TRANSITO', 'ENTREGUE'];
    
    // Filtrar apenas fretes monitorados do mês selecionado
    const fretesMonitoradosDoMes = fretes.filter(f => {
        const dataEmissao = new Date(f.data_emissao + 'T00:00:00');
        const mesCorreto = dataEmissao.getMonth() === currentMonth && dataEmissao.getFullYear() === currentYear;
        return mesCorreto && statusMonitorados.includes(f.status);
    });
    
    // Entregas Realizadas (do mês selecionado - monitorados)
    const entregues = fretesMonitoradosDoMes.filter(f => f.status === 'ENTREGUE').length;
    
    // Fora do Prazo (monitorados, não entregues, previsão vencida)
    const foraPrazo = fretesMonitoradosDoMes.filter(f => {
        if (f.status === 'ENTREGUE') return false;
        const previsao = new Date(f.previsao_entrega + 'T00:00:00');
        previsao.setHours(0, 0, 0, 0);
        return previsao < hoje;
    }).length;
    
    // Em Trânsito (monitorados ativos)
    const transito = fretesMonitoradosDoMes.filter(f => f.status === 'EM_TRANSITO').length;
    
    // Todos os fretes do mês (incluindo não monitorados)
    const todosFretesDoMes = fretes.filter(f => {
        const dataEmissao = new Date(f.data_emissao + 'T00:00:00');
        return dataEmissao.getMonth() === currentMonth && dataEmissao.getFullYear() === currentYear;
    });
    
    // Valor Total (todos do mês)
    const valorTotal = todosFretesDoMes.reduce((sum, f) => sum + parseFloat(f.valor_nf || 0), 0);
    
    // Frete Total (todos do mês)
    const freteTotal = todosFretesDoMes.reduce((sum, f) => sum + parseFloat(f.valor_frete || 0), 0);
    
    // Atualizar valores
    document.getElementById('statEntregues').textContent = entregues;
    document.getElementById('statForaPrazo').textContent = foraPrazo;
    document.getElementById('statTransito').textContent = transito;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('statFrete').textContent = `R$ ${freteTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // ALERTA VISUAL SUTIL - Fora do Prazo
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
// FORMULÁRIO
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
            showMessage('Frete não encontrado!', 'error');
            return;
        }
    }

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Frete' : 'Novo Frete'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchFormTab(0)">Dados da Nota</button>
                        <button class="tab-btn" onclick="switchFormTab(1)">Órgão</button>
                        <button class="tab-btn" onclick="switchFormTab(2)">Transporte</button>
                    </div>

                    <form id="freteForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-nota">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="numero_nf">Número da NF *</label>
                                    <input type="text" id="numero_nf" value="${frete?.numero_nf || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_emissao">Data de Emissão *</label>
                                    <input type="date" id="data_emissao" value="${frete?.data_emissao || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento *</label>
                                    <input type="text" id="documento" value="${frete?.documento || ''}" placeholder="CPF/CNPJ" required>
                                </div>
                                <div class="form-group">
                                    <label for="valor_nf">Valor da Nota (R$) *</label>
                                    <input type="number" id="valor_nf" step="0.01" min="0" value="${frete?.valor_nf || ''}" required>
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
                                    <input type="text" id="contato_orgao" value="${frete?.contato_orgao || ''}" placeholder="Telefone/E-mail">
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor Responsável *</label>
                                    <select id="vendedor" required>
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${frete?.vendedor === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${frete?.vendedor === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${frete?.vendedor === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                        <option value="GUSTAVO" ${frete?.vendedor === 'GUSTAVO' ? 'selected' : ''}>GUSTAVO</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-transporte">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="transportadora">Transportadora *</label>
                                    <select id="transportadora" required>
                                        <option value="">Selecione...</option>
                                        <option value="TNT MERCÚRIO" ${frete?.transportadora === 'TNT MERCÚRIO' ? 'selected' : ''}>TNT MERCÚRIO</option>
                                        <option value="JAMEF" ${frete?.transportadora === 'JAMEF' ? 'selected' : ''}>JAMEF</option>
                                        <option value="BRASPRESS" ${frete?.transportadora === 'BRASPRESS' ? 'selected' : ''}>BRASPRESS</option>
                                        <option value="GENEROSO" ${frete?.transportadora === 'GENEROSO' ? 'selected' : ''}>GENEROSO</option>
                                        <option value="CONTINENTAL" ${frete?.transportadora === 'CONTINENTAL' ? 'selected' : ''}>CONTINENTAL</option>
                                        <option value="JEOLOG" ${frete?.transportadora === 'JEOLOG' ? 'selected' : ''}>JEOLOG</option>
                                        <option value="TG TRANSPORTES" ${frete?.transportadora === 'TG TRANSPORTES' ? 'selected' : ''}>TG TRANSPORTES</option>
                                        <option value="CORREIOS" ${frete?.transportadora === 'CORREIOS' ? 'selected' : ''}>CORREIOS</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="valor_frete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valor_frete" step="0.01" min="0" value="${frete?.valor_frete || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_coleta">Data da Coleta</label>
                                    <input type="date" id="data_coleta" value="${frete?.data_coleta || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="cidade_destino">Cidade-UF (Destino) *</label>
                                    <input type="text" id="cidade_destino" value="${frete?.cidade_destino || ''}" placeholder="Ex: São Paulo-SP" required>
                                </div>
                                <div class="form-group">
                                    <label for="previsao_entrega">Data de Entrega *</label>
                                    <input type="date" id="previsao_entrega" value="${frete?.previsao_entrega || ''}" required>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">${editingId ? 'Atualizar' : 'Salvar'}</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
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

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
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

function switchTab(index) {
    currentTab = index;
    
    document.querySelectorAll('#formModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    document.querySelectorAll('#formModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
    
    updateNavigationButtons();
}

// ============================================
// SUBMIT
// ============================================
async function handleSubmit(event) {
    if (event) event.preventDefault();

    const formData = {
        numero_nf: document.getElementById('numero_nf').value.trim(),
        data_emissao: document.getElementById('data_emissao').value,
        documento: document.getElementById('documento').value.trim(),
        valor_nf: parseFloat(document.getElementById('valor_nf').value),
        nome_orgao: document.getElementById('nome_orgao').value.trim(),
        contato_orgao: document.getElementById('contato_orgao').value.trim(),
        vendedor: document.getElementById('vendedor').value.trim(),
        transportadora: document.getElementById('transportadora').value.trim(),
        valor_frete: parseFloat(document.getElementById('valor_frete').value),
        data_coleta: document.getElementById('data_coleta').value,
        cidade_destino: document.getElementById('cidade_destino').value.trim(),
        previsao_entrega: document.getElementById('previsao_entrega').value
        // Status será calculado automaticamente pelo servidor
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        const freteExistente = fretes.find(f => String(f.id) === String(editId));
        if (freteExistente) {
            formData.timestamp = freteExistente.timestamp;
        }
    }

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
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

        if (editId) {
            const index = fretes.findIndex(f => String(f.id) === String(editId));
            if (index !== -1) fretes[index] = savedData;
            showMessage('Frete atualizado!', 'success');
        } else {
            fretes.push(savedData);
            showMessage('Frete criado!', 'success');
        }

        lastDataHash = JSON.stringify(fretes.map(f => f.id));
        updateAllFilters();
        updateDashboard();
        filterFretes();
        
        closeFormModal();

    } catch (error) {
        console.error('Erro:', error);
        showMessage(`Erro: ${error.message}`, 'error');
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

    const novoStatus = frete.status === 'ENTREGUE' ? 'EM_TRANSITO' : 'ENTREGUE';

    // Atualizar localmente
    frete.status = novoStatus;
    updateDashboard();
    filterFretes();

    // Atualizar no servidor
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
            if (index !== -1) fretes[index] = savedData;

        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            // Reverter mudança
            frete.status = novoStatus === 'ENTREGUE' ? 'EM_TRANSITO' : 'ENTREGUE';
            updateDashboard();
            filterFretes();
            showMessage('Erro ao atualizar status', 'error');
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
        showMessage('Frete não encontrado!', 'error');
        return;
    }
    
    showFormModal(idStr);
};

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
    showMessage('Frete excluído!', 'success');

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
                showMessage('Erro ao excluir', 'error');
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
        showMessage('Frete não encontrado!', 'error');
        return;
    }

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes do Frete</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">Dados da Nota</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Órgão</button>
                        <button class="tab-btn" onclick="switchViewTab(2)">Transporte</button>
                    </div>

                    <div class="tab-content active" id="view-tab-nota">
                        <div class="info-section">
                            <h4>Dados da Nota Fiscal</h4>
                            <p><strong>Número NF:</strong> ${frete.numero_nf}</p>
                            <p><strong>Data Emissão:</strong> ${formatDate(frete.data_emissao)}</p>
                            <p><strong>Documento:</strong> ${frete.documento}</p>
                            <p><strong>Valor NF:</strong> R$ ${parseFloat(frete.valor_nf).toFixed(2)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-orgao">
                        <div class="info-section">
                            <h4>Dados do Órgão</h4>
                            <p><strong>Nome do Órgão:</strong> ${frete.nome_orgao}</p>
                            ${frete.contato_orgao ? `<p><strong>Contato:</strong> ${frete.contato_orgao}</p>` : ''}
                            <p><strong>Vendedor Responsável:</strong> ${frete.vendedor}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-transporte">
                        <div class="info-section">
                            <h4>Dados do Transporte</h4>
                            <p><strong>Transportadora:</strong> ${frete.transportadora}</p>
                            <p><strong>Valor do Frete:</strong> R$ ${parseFloat(frete.valor_frete).toFixed(2)}</p>
                            ${frete.data_coleta ? `<p><strong>Data Coleta:</strong> ${formatDate(frete.data_coleta)}</p>` : ''}
                            <p><strong>Destino:</strong> ${frete.cidade_destino}</p>
                            <p><strong>Previsão Entrega:</strong> ${formatDate(frete.previsao_entrega)}</p>
                            <p><strong>Status:</strong> ${getStatusBadge(frete.status)}</p>
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
    updateTransportadorasFilter();
    updateVendedoresFilter();
    updateStatusFilter();
}

function updateTransportadorasFilter() {
    const transportadoras = new Set();
    fretes.forEach(f => {
        if (f.transportadora?.trim()) {
            transportadoras.add(f.transportadora.trim());
        }
    });

    const select = document.getElementById('filterTransportadora');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todas</option>';
        Array.from(transportadoras).sort().forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function updateVendedoresFilter() {
    const vendedores = new Set();
    fretes.forEach(f => {
        if (f.vendedor?.trim()) {
            vendedores.add(f.vendedor.trim());
        }
    });

    const select = document.getElementById('filterVendedor');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
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
        
        // Verificar se tem algum fora do prazo
        if (f.status !== 'ENTREGUE') {
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
        select.innerHTML = '<option value="">Todos</option>';
        
        // Adicionar "Fora do Prazo" SOMENTE se existir
        if (temForaDoPrazo) {
            const optionForaPrazo = document.createElement('option');
            optionForaPrazo.value = 'FORA_DO_PRAZO';
            optionForaPrazo.textContent = 'Fora do Prazo';
            select.appendChild(optionForaPrazo);
        }
        
        const statusMap = {
            'EM_TRANSITO': 'Em Trânsito',
            'ENTREGUE': 'Entregue',
            'DEVOLUCAO': 'Devolução',
            'SIMPLES_REMESSA': 'Simples Remessa',
            'REMESSA_AMOSTRA': 'Remessa de Amostra',
            'CANCELADO': 'Cancelada'
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
        return dataEmissao.getMonth() === currentMonth && dataEmissao.getFullYear() === currentYear;
    });

    if (filterTransportadora) {
        filtered = filtered.filter(f => f.transportadora === filterTransportadora);
    }

    if (filterStatus) {
        if (filterStatus === 'FORA_DO_PRAZO') {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            filtered = filtered.filter(f => {
                if (f.status === 'ENTREGUE') return false;
                const previsao = new Date(f.previsao_entrega + 'T00:00:00');
                previsao.setHours(0, 0, 0, 0);
                return previsao < hoje;
            });
        } else {
            filtered = filtered.filter(f => f.status === filterStatus);
        }
    }

    if (filterVendedor) {
        filtered = filtered.filter(f => f.vendedor === filterVendedor);
    }

    if (searchTerm) {
        filtered = filtered.filter(f => 
            f.numero_nf?.toLowerCase().includes(searchTerm) ||
            f.transportadora?.toLowerCase().includes(searchTerm) ||
            f.nome_orgao?.toLowerCase().includes(searchTerm) ||
            f.cidade_destino?.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => new Date(a.data_emissao) - new Date(b.data_emissao));
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
                        <th>Transp.</th>
                        <th>Destino</th>
                        <th>Frete</th>
                        <th>Status</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${fretesToRender.map(f => {
                        const isEntregue = f.status === 'ENTREGUE';
                        return `
                        <tr class="${isEntregue ? 'row-entregue' : ''}">
                            <td style="text-align: center; padding: 8px;">
                                <div class="checkbox-container">
                                    <input 
                                        type="checkbox" 
                                        id="check-${f.id}"
                                        ${isEntregue ? 'checked' : ''}
                                        onchange="toggleEntregue('${f.id}')"
                                        class="custom-checkbox"
                                    >
                                    <label for="check-${f.id}" class="checkbox-label"></label>
                                </div>
                            </td>
                            <td><strong>${f.numero_nf}</strong></td>
                            <td style="white-space: nowrap;">${formatDate(f.data_emissao)}</td>
                            <td style="max-width: 200px; word-wrap: break-word; white-space: normal;">${f.nome_orgao}</td>
                            <td>${f.vendedor}</td>
                            <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.transportadora}">${f.transportadora}</td>
                            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.cidade_destino}">${f.cidade_destino}</td>
                            <td style="white-space: nowrap;"><strong>R$ ${parseFloat(f.valor_frete).toFixed(2)}</strong></td>
                            <td>${getStatusBadge(f.status)}</td>
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

function showMessage(message, type) {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
