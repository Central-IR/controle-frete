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
const tabs = ['tab-frete', 'tab-origem-destino', 'tab-datas', 'tab-observacoes'];

console.log('Controle de Frete iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

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
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    
    // Filtrar fretes do mês atual
    const fretesDoMes = fretes.filter(f => {
        const dataEmissao = new Date(f.data_emissao + 'T00:00:00');
        return dataEmissao.getMonth() === mesAtual && dataEmissao.getFullYear() === anoAtual;
    });
    
    // Em Trânsito
    const transito = fretes.filter(f => 
        f.status === 'EM_TRANSITO' || f.status === 'EM_ROTA_ENTREGA'
    ).length;
    
    // Fora do Prazo (não entregues e previsão vencida)
    const foraPrazo = fretes.filter(f => {
        if (f.status === 'ENTREGUE') return false;
        const previsao = new Date(f.previsao_entrega + 'T00:00:00');
        return previsao < hoje;
    }).length;
    
    // Entregas Realizadas (do mês)
    const entregues = fretesDoMes.filter(f => f.status === 'ENTREGUE').length;
    
    // Frete Total (do mês)
    const freteTotal = fretesDoMes.reduce((sum, f) => sum + parseFloat(f.valor_frete || 0), 0);
    
    // Valor Total (do mês)
    const valorTotal = fretesDoMes.reduce((sum, f) => sum + parseFloat(f.valor_nf || 0), 0);
    
    document.getElementById('statTransito').textContent = transito;
    document.getElementById('statForaPrazo').textContent = foraPrazo;
    document.getElementById('statEntregues').textContent = entregues;
    document.getElementById('statFrete').textContent = `R$ ${freteTotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('statValorTotal').textContent = `R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
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
                        <button class="tab-btn active">Frete</button>
                        <button class="tab-btn">Origem/Destino</button>
                        <button class="tab-btn">Datas</button>
                        <button class="tab-btn">Observações</button>
                    </div>

                    <form id="freteForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-frete">
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
                                    <label for="valor_nf">Valor da NF (R$) *</label>
                                    <input type="number" id="valor_nf" step="0.01" min="0" value="${frete?.valor_nf || ''}" required>
                                </div>
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
                                    <label for="codigo_rastreio">Código de Rastreio</label>
                                    <input type="text" id="codigo_rastreio" value="${frete?.codigo_rastreio || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="valor_frete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valor_frete" step="0.01" min="0" value="${frete?.valor_frete || ''}" required>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-origem-destino">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="cidade_origem">Cidade de Origem *</label>
                                    <input type="text" id="cidade_origem" value="${frete?.cidade_origem || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="uf_origem">UF de Origem *</label>
                                    <input type="text" id="uf_origem" value="${frete?.uf_origem || ''}" maxlength="2" required>
                                </div>
                                <div class="form-group">
                                    <label for="cidade_destino">Cidade de Destino *</label>
                                    <input type="text" id="cidade_destino" value="${frete?.cidade_destino || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="uf_destino">UF de Destino *</label>
                                    <input type="text" id="uf_destino" value="${frete?.uf_destino || ''}" maxlength="2" required>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-datas">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="data_coleta">Data de Coleta</label>
                                    <input type="date" id="data_coleta" value="${frete?.data_coleta || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="previsao_entrega">Previsão de Entrega *</label>
                                    <input type="date" id="previsao_entrega" value="${frete?.previsao_entrega || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="data_entrega_real">Data de Entrega Real</label>
                                    <input type="date" id="data_entrega_real" value="${frete?.data_entrega_real || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="status">Status *</label>
                                    <select id="status" required>
                                        <option value="AGUARDANDO_COLETA" ${frete?.status === 'AGUARDANDO_COLETA' ? 'selected' : ''}>Aguardando Coleta</option>
                                        <option value="EM_TRANSITO" ${frete?.status === 'EM_TRANSITO' ? 'selected' : ''}>Em Trânsito</option>
                                        <option value="EM_ROTA_ENTREGA" ${frete?.status === 'EM_ROTA_ENTREGA' ? 'selected' : ''}>Em Rota de Entrega</option>
                                        <option value="ENTREGUE" ${frete?.status === 'ENTREGUE' ? 'selected' : ''}>Entregue</option>
                                        <option value="DEVOLVIDO" ${frete?.status === 'DEVOLVIDO' ? 'selected' : ''}>Devolvido</option>
                                        <option value="EXTRAVIADO" ${frete?.status === 'EXTRAVIADO' ? 'selected' : ''}>Extraviado</option>
                                        <option value="CANCELADO" ${frete?.status === 'CANCELADO' ? 'selected' : ''}>Cancelado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-observacoes">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="responsavel">Responsável *</label>
                                    <select id="responsavel" required>
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${frete?.responsavel === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${frete?.responsavel === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${frete?.responsavel === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                        <option value="GUSTAVO" ${frete?.responsavel === 'GUSTAVO' ? 'selected' : ''}>GUSTAVO</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor</label>
                                    <select id="vendedor">
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${frete?.vendedor === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${frete?.vendedor === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${frete?.vendedor === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                    </select>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <textarea id="observacoes" rows="4">${frete?.observacoes || ''}</textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary" id="btnVoltar" onclick="previousTab()" style="display: none;">Voltar</button>
                            <button type="button" class="secondary" id="btnProximo" onclick="nextTab()">Próximo</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    currentTab = 0;
    updateNavigationButtons();
    
    // MAIÚSCULAS automáticas
    const camposMaiusculas = ['numero_nf', 'codigo_rastreio', 'cidade_origem', 'uf_origem', 
                               'cidade_destino', 'uf_destino', 'observacoes'];

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
    const editId = document.getElementById('editId')?.value;
    showMessage(editId ? 'Atualização cancelada' : 'Registro cancelado', 'error');
    
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// SISTEMA DE ABAS
// ============================================
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

function nextTab() {
    if (currentTab < tabs.length - 1) {
        const currentTabElement = document.getElementById(tabs[currentTab]);
        const requiredInputs = currentTabElement.querySelectorAll('[required]');
        let isValid = true;

        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.focus();
            }
        });

        if (!isValid) {
            showMessage('Preencha todos os campos obrigatórios', 'error');
            return;
        }

        currentTab++;
        switchTab(currentTab);
    } else {
        handleSubmit(new Event('submit'));
    }
}

function previousTab() {
    if (currentTab > 0) {
        currentTab--;
        switchTab(currentTab);
    }
}

function updateNavigationButtons() {
    const btnVoltar = document.getElementById('btnVoltar');
    const btnProximo = document.getElementById('btnProximo');
    
    if (btnVoltar) {
        btnVoltar.style.display = currentTab === 0 ? 'none' : 'inline-flex';
    }
    
    if (btnProximo) {
        const editId = document.getElementById('editId')?.value;
        if (currentTab === tabs.length - 1) {
            btnProximo.textContent = editId ? 'Atualizar' : 'Salvar';
            btnProximo.className = 'save';
        } else {
            btnProximo.textContent = 'Próximo';
            btnProximo.className = 'secondary';
        }
    }
}

// ============================================
// SUBMIT
// ============================================
async function handleSubmit(event) {
    if (event) event.preventDefault();

    const formData = {
        numero_nf: document.getElementById('numero_nf').value.trim(),
        data_emissao: document.getElementById('data_emissao').value,
        valor_nf: parseFloat(document.getElementById('valor_nf').value),
        transportadora: document.getElementById('transportadora').value.trim(),
        codigo_rastreio: document.getElementById('codigo_rastreio').value.trim(),
        valor_frete: parseFloat(document.getElementById('valor_frete').value),
        cidade_origem: document.getElementById('cidade_origem').value.trim(),
        uf_origem: document.getElementById('uf_origem').value.trim(),
        cidade_destino: document.getElementById('cidade_destino').value.trim(),
        uf_destino: document.getElementById('uf_destino').value.trim(),
        data_coleta: document.getElementById('data_coleta').value,
        previsao_entrega: document.getElementById('previsao_entrega').value,
        data_entrega_real: document.getElementById('data_entrega_real').value,
        status: document.getElementById('status').value,
        responsavel: document.getElementById('responsavel').value.trim(),
        vendedor: document.getElementById('vendedor').value.trim(),
        observacoes: document.getElementById('observacoes').value.trim()
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        const freteExistente = fretes.find(f => String(f.id) === String(editId));
        if (freteExistente) {
            formData.timestamp = freteExistente.timestamp;
        }
    }

    closeFormModal();

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
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

    } catch (error) {
        console.error('Erro:', error);
        showMessage(`Erro: ${error.message}`, 'error');
    }
}

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
                        <button class="tab-btn active" onclick="switchViewTab(0)">Frete</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Origem/Destino</button>
                        <button class="tab-btn" onclick="switchViewTab(2)">Datas</button>
                        <button class="tab-btn" onclick="switchViewTab(3)">Observações</button>
                    </div>

                    <div class="tab-content active" id="view-tab-frete">
                        <div class="info-section">
                            <h4>Dados do Frete</h4>
                            <p><strong>Número NF:</strong> ${frete.numero_nf}</p>
                            <p><strong>Data Emissão:</strong> ${formatDate(frete.data_emissao)}</p>
                            <p><strong>Valor NF:</strong> R$ ${parseFloat(frete.valor_nf).toFixed(2)}</p>
                            <p><strong>Transportadora:</strong> ${frete.transportadora}</p>
                            ${frete.codigo_rastreio ? `<p><strong>Código Rastreio:</strong> ${frete.codigo_rastreio}</p>` : ''}
                            <p><strong>Valor Frete:</strong> R$ ${parseFloat(frete.valor_frete).toFixed(2)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-origem-destino">
                        <div class="info-section">
                            <h4>Origem e Destino</h4>
                            <p><strong>Origem:</strong> ${frete.cidade_origem}-${frete.uf_origem}</p>
                            <p><strong>Destino:</strong> ${frete.cidade_destino}-${frete.uf_destino}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-datas">
                        <div class="info-section">
                            <h4>Datas</h4>
                            ${frete.data_coleta ? `<p><strong>Data Coleta:</strong> ${formatDate(frete.data_coleta)}</p>` : ''}
                            <p><strong>Previsão Entrega:</strong> ${formatDate(frete.previsao_entrega)}</p>
                            ${frete.data_entrega_real ? `<p><strong>Entrega Real:</strong> ${formatDate(frete.data_entrega_real)}</p>` : ''}
                            <p><strong>Status:</strong> ${getStatusBadge(frete.status)}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-observacoes">
                        <div class="info-section">
                            <h4>Informações Adicionais</h4>
                            <p><strong>Responsável:</strong> ${frete.responsavel}</p>
                            ${frete.vendedor ? `<p><strong>Vendedor:</strong> ${frete.vendedor}</p>` : ''}
                            ${frete.observacoes ? `<p><strong>Observações:</strong> ${frete.observacoes}</p>` : ''}
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
    updateResponsaveisFilter();
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

function updateResponsaveisFilter() {
    const responsaveis = new Set();
    fretes.forEach(f => {
        if (f.responsavel?.trim()) {
            responsaveis.add(f.responsavel.trim());
        }
    });

    const select = document.getElementById('filterResponsavel');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(responsaveis).sort().forEach(r => {
            const option = document.createElement('option');
            option.value = r;
            option.textContent = r;
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
    const filterResponsavel = document.getElementById('filterResponsavel')?.value || '';
    
    let filtered = [...fretes];

    if (filterTransportadora) {
        filtered = filtered.filter(f => f.transportadora === filterTransportadora);
    }

    if (filterStatus) {
        filtered = filtered.filter(f => f.status === filterStatus);
    }

    if (filterResponsavel) {
        filtered = filtered.filter(f => f.responsavel === filterResponsavel);
    }

    if (searchTerm) {
        filtered = filtered.filter(f => 
            f.numero_nf?.toLowerCase().includes(searchTerm) ||
            f.codigo_rastreio?.toLowerCase().includes(searchTerm) ||
            f.transportadora?.toLowerCase().includes(searchTerm) ||
            f.cidade_destino?.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => new Date(b.data_emissao) - new Date(a.data_emissao));
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
                        <th>NF</th>
                        <th>Data Emissão</th>
                        <th>Transportadora</th>
                        <th>Rastreio</th>
                        <th>Origem</th>
                        <th>Destino</th>
                        <th>Valor Frete</th>
                        <th>Status</th>
                        <th style="text-align: center; min-width: 260px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${fretesToRender.map(f => `
                        <tr>
                            <td><strong>${f.numero_nf}</strong></td>
                            <td>${formatDate(f.data_emissao)}</td>
                            <td>${f.transportadora}</td>
                            <td>${f.codigo_rastreio || '-'}</td>
                            <td>${f.cidade_origem}-${f.uf_origem}</td>
                            <td>${f.cidade_destino}-${f.uf_destino}</td>
                            <td><strong>R$ ${parseFloat(f.valor_frete).toFixed(2)}</strong></td>
                            <td>${getStatusBadge(f.status)}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="viewFrete('${f.id}')" class="action-btn view">Ver</button>
                                <button onclick="editFrete('${f.id}')" class="action-btn edit">Editar</button>
                                <button onclick="deleteFrete('${f.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `).join('')}
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
        'AGUARDANDO_COLETA': { class: 'aguardando', text: 'Aguardando Coleta' },
        'EM_TRANSITO': { class: 'transito', text: 'Em Trânsito' },
        'EM_ROTA_ENTREGA': { class: 'rota', text: 'Em Rota de Entrega' },
        'ENTREGUE': { class: 'entregue', text: 'Entregue' },
        'DEVOLVIDO': { class: 'devolvido', text: 'Devolvido' },
        'EXTRAVIADO': { class: 'extraviado', text: 'Extraviado' },
        'CANCELADO': { class: 'cancelado', text: 'Cancelado' }
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
