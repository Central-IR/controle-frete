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
// DASHBOARD
// ============================================
function updateDashboard() {
    const total = fretes.length;
    const transito = fretes.filter(f => f.status === 'EM_TRANSITO').length;
    const entregues = fretes.filter(f => f.status === 'ENTREGUE').length;
    const pendentes = fretes.filter(f => f.status === 'AGUARDANDO_COLETA').length;
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statTransito').textContent = transito;
    document.getElementById('statEntregues').textContent = entregues;
    document.getElementById('statPendentes').textContent = pendentes;
}

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

// ============================================
// FUNÇÕES A IMPLEMENTAR
// ============================================
window.toggleForm = function() {
    // TODO: Implementar modal de formulário
    showMessage('Função em desenvolvimento', 'error');
};

window.editFrete = function(id) {
    // TODO: Implementar edição
    showMessage('Função em desenvolvimento', 'error');
};

window.viewFrete = function(id) {
    // TODO: Implementar visualização
    showMessage('Função em desenvolvimento', 'error');
};

window.deleteFrete = function(id) {
    // TODO: Implementar exclusão
    showMessage('Função em desenvolvimento', 'error');
};
