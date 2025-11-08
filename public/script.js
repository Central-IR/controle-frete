// Configuração da API
const API_URL = window.location.origin;

let fretes = [];
let allFretes = [];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentFreteIdForObs = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadFretes();
    setTodayDate();
    updateMonthDisplay();
    document.getElementById('freteForm').addEventListener('submit', handleSubmit);
});

// Carregar fretes do servidor
async function loadFretes() {
    try {
        const response = await fetch(`${API_URL}/api/fretes/${currentYear}/${currentMonth + 1}`);
        if (!response.ok) throw new Error('Erro ao carregar fretes');
        
        fretes = await response.json();
        allFretes = [...fretes];
        renderFretes(fretes);
        updateDashboard();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao carregar dados', 'error');
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
            response = await fetch(`${API_URL}/api/fretes/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(freteData)
            });
            showMessage('Registro atualizado com sucesso!', 'success');
        } else {
            response = await fetch(`${API_URL}/api/fretes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(freteData)
            });
            showMessage('Registro cadastrado com sucesso!', 'success');
        }

        if (!response.ok) throw new Error('Erro ao salvar');

        await loadFretes();
        closeFormModal();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao salvar registro', 'error');
    }
}

// Toggle entregue
async function toggleEntregue(id) {
    try {
        const response = await fetch(`${API_URL}/api/fretes/${id}/toggle-entregue`, {
            method: 'PATCH'
        });

        if (!response.ok) throw new Error('Erro ao atualizar');

        const updatedFrete = await response.json();
        showMessage(
            updatedFrete.entregue ? 'Entrega confirmada!' : 'Entrega desmarcada',
            'success'
        );

        await loadFretes();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao atualizar status', 'error');
    }
}

// Deletar frete
async function deleteFrete(id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    try {
        const response = await fetch(`${API_URL}/api/fretes/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Erro ao excluir');

        showMessage('Registro excluído com sucesso!', 'success');
        await loadFretes();
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao excluir registro', 'error');
    }
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
                <td colspan="9" style="text-align: center; padding: 3rem;">
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
                        <button class="small" onclick="openObservacoesModal('${frete.id}')" style="background: transparent; border: 2px solid #F59E0B; color: #F59E0B;" title="Observações">⚠️</button>
                        <button class="danger small" onclick="deleteFrete('${frete.id}')">Excluir</button>
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
    }, 4000);
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
            <h4>Dados da Nota Fiscal</h4>
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
            <h4>Responsável e Destino</h4>
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
            <h4>Informações de Transporte</h4>
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
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Nenhuma observação registrada ainda.</p>';
        return;
    }

    const sortedObs = [...observacoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = sortedObs.map(obs => `
        <div class="observacao-item">
            <div class="observacao-header">
                <div class="observacao-data">${formatDateTime(obs.created_at)}</div>
                <button class="danger small" onclick="excluirObservacao('${obs.id}')" style="margin: 0; padding: 4px 8px;">Excluir</button>
            </div>
            <div class="observacao-texto">${obs.texto}</div>
        </div>
    `).join('');
}

// Adicionar observação
async function adicionarObservacao() {
    const texto = document.getElementById('novaObservacao').value.trim();
    if (!texto) {
        showMessage('Digite uma observação antes de adicionar!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/fretes/${currentFreteIdForObs}/observacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto })
        });

        if (!response.ok) throw new Error('Erro ao adicionar observação');

        showMessage('Observação adicionada com sucesso!', 'success');
        document.getElementById('novaObservacao').value = '';
        
        await loadFretes();
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao adicionar observação', 'error');
    }
}

// Excluir observação
async function excluirObservacao(obsId) {
    if (!confirm('Tem certeza que deseja excluir esta observação?')) return;

    try {
        const response = await fetch(`${API_URL}/api/observacoes/${obsId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Erro ao excluir observação');

        showMessage('Observação excluída!', 'success');
        
        await loadFretes();
        const frete = fretes.find(f => f.id === currentFreteIdForObs);
        renderObservacoes(frete);
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao excluir observação', 'error');
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
