/**
 * SIMULADOR DE REQUISIÇÕES HTTP
 */

// === DICIONÁRIO DE STATUS HTTP ===
const HTTP_MEANINGS = {
    200: "Requisição bem-sucedida. O servidor processou o pedido com sucesso.",
    201: "Criado. A requisição foi bem sucedida e um novo recurso foi criado no banco de dados.",
    400: "Bad Request. O servidor não processou a requisição devido a um erro do cliente (ex: sintaxe inválida ou dados faltando).",
    404: "Not Found. O servidor não conseguiu encontrar o recurso solicitado (ex: ID inexistente ou endpoint incorreto).",
    500: "Internal Server Error. Ocorreu um erro inesperado no código do servidor ao tentar processar a requisição."
};

const state = {
    users: JSON.parse(localStorage.getItem('sim_users')) || [],
    logs: JSON.parse(localStorage.getItem('sim_logs')) || [],
    stats: JSON.parse(localStorage.getItem('sim_stats')) || { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
    lastJson: JSON.parse(localStorage.getItem('sim_last_json')) || null,
    editingId: null
};

const DOM = {
    form: document.getElementById('userForm'),
    userId: document.getElementById('userId'),
    nome: document.getElementById('nome'),
    documento: document.getElementById('documento'),
    idade: document.getElementById('idade'),
    cidade: document.getElementById('cidade'),
    forceError: document.getElementById('forceError'), // Novo
    
    errNome: document.getElementById('errNome'),
    errIdade: document.getElementById('errIdade'),
    errCidade: document.getElementById('errCidade'),
    
    btnSubmit: document.getElementById('btnSubmit'),
    btnCancel: document.getElementById('btnCancel'),
    formTitle: document.getElementById('formTitle'),
    
    tableBody: document.getElementById('tableBody'),
    searchInput: document.getElementById('searchInput'),
    
    serverLogs: document.getElementById('serverLogs'),
    btnClearLogs: document.getElementById('btnClearLogs'),
    jsonOutput: document.getElementById('jsonOutput'), // Novo
    
    themeToggle: document.getElementById('themeToggle'),
    toastContainer: document.getElementById('toastContainer'),
    
    statTotal: document.getElementById('statTotal'),
    statGet: document.getElementById('statGet'),
    statPost: document.getElementById('statPost'),
    statPut: document.getElementById('statPut'),
    statDelete: document.getElementById('statDelete'),
};

function init() {
    setupEventListeners();
    applyTheme(localStorage.getItem('sim_theme') || 'light');
    renderTable();
    renderLogs();
    renderLastJson();
    updateStatsUI();
}

function setupEventListeners() {
    DOM.form.addEventListener('submit', handleFormSubmit);
    DOM.btnCancel.addEventListener('click', resetForm);
    DOM.searchInput.addEventListener('input', debounce(handleSearch, 400));
    DOM.btnClearLogs.addEventListener('click', clearLogs);
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    DOM.tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-edit')) prepareEdit(e.target.dataset.id);
        else if (e.target.classList.contains('btn-delete')) handleDelete(e.target.dataset.id);
    });
}

/**
 * SIMULADOR DE REDE E SERVIDOR
 * Adicionado parâmetro simulatedError para interceptar a requisição e forçar falhas
 */
async function simulateHTTPRequest(method, endpoint, payload = null, simulatedError = 'none') {
    setLoadingState(true);
    
    const latency = Math.floor(Math.random() * 500) + 300;
    await new Promise(resolve => setTimeout(resolve, latency));

    let response = { status: 500, statusText: 'Internal Server Error', data: null, message: 'Erro desconhecido' };
    
    try {
        // --- INTERCEPTAÇÃO DE ERRO SIMULADO (BRECHA) ---
        if (simulatedError !== 'none') {
            const errorStatus = parseInt(simulatedError);
            let errText = errorStatus === 400 ? 'Bad Request' : (errorStatus === 404 ? 'Not Found' : 'Internal Server Error');
            let errMsg = errorStatus === 400 ? 'Simulação: Dados mal formatados enviados ao servidor.' 
                       : (errorStatus === 404 ? 'Simulação: Rota ou registro não localizado.' 
                       : 'Simulação: O servidor crashou inesperadamente.');
            
            response = { status: errorStatus, statusText: errText, message: errMsg };
        } 
        // --- FLUXO NORMAL DA API ---
        else if (endpoint.startsWith('/usuarios')) {
            switch (method) {
                case 'GET': response = handleApiGet(endpoint); break;
                case 'POST': response = handleApiPost(payload); break;
                case 'PUT': response = handleApiPut(endpoint, payload); break;
                case 'DELETE': response = handleApiDelete(endpoint); break;
            }
        } else {
            response = { status: 404, statusText: 'Not Found', message: 'Endpoint inexistente.' };
        }
    } catch (error) {
        response = { status: 500, statusText: 'Internal Server Error', message: 'Falha no processamento do servidor.' };
    }

    addServerLog(method, endpoint, response);
    updateStats(method);
    setLoadingState(false);
    
    return response;
}

// CONTROLADORES (MOCK)
function handleApiGet(endpoint) {
    const urlParams = new URLSearchParams(endpoint.split('?')[1]);
    const query = urlParams.get('q');
    let result = state.users;
    
    if (query) {
        const lowerQuery = query.toLowerCase();
        result = state.users.filter(u => 
            u.nome.toLowerCase().includes(lowerQuery) || 
            u.cidade.toLowerCase().includes(lowerQuery)
        );
    }
    return { status: 200, statusText: 'OK', data: result, message: `${result.length} registro(s) encontrado(s).` };
}

function handleApiPost(payload) {
    if (!payload.nome || !payload.cidade) return { status: 400, statusText: 'Bad Request', message: 'Campos obrigatórios ausentes.' };
    
    const newUser = { id: generateId(), nome: payload.nome, documento: payload.documento || '---', idade: payload.idade || '---', cidade: payload.cidade };
    state.users.push(newUser);
    saveData('sim_users', state.users);
    
    updateLastJson(newUser); // Grava para exibição na 3ª coluna
    
    return { status: 201, statusText: 'Created', data: newUser, message: 'Usuário cadastrado com sucesso.' };
}

function handleApiPut(endpoint, payload) {
    const id = endpoint.split('/')[2];
    const index = state.users.findIndex(u => u.id === id);
    
    if (index === -1) return { status: 404, statusText: 'Not Found', message: 'Registro não encontrado.' };
    if (!payload.nome || !payload.cidade) return { status: 400, statusText: 'Bad Request', message: 'Campos obrigatórios ausentes.' };
    
    state.users[index] = { ...state.users[index], ...payload };
    saveData('sim_users', state.users);
    
    updateLastJson(state.users[index]); // Grava para exibição na 3ª coluna
    
    return { status: 200, statusText: 'OK', data: state.users[index], message: 'Usuário atualizado com sucesso.' };
}

function handleApiDelete(endpoint) {
    const id = endpoint.split('/')[2];
    const index = state.users.findIndex(u => u.id === id);
    
    if (index === -1) return { status: 404, statusText: 'Not Found', message: 'Registro não encontrado.' };
    
    state.users.splice(index, 1);
    saveData('sim_users', state.users);
    return { status: 200, statusText: 'OK', message: 'Usuário removido com sucesso.' };
}

// INTERAÇÕES CLIENTE
async function handleFormSubmit(e) {
    e.preventDefault();
    clearErrors();

    const formData = {
        nome: DOM.nome.value.trim(),
        documento: DOM.documento.value.trim(),
        idade: DOM.idade.value.trim(),
        cidade: DOM.cidade.value.trim()
    };

    let hasError = false;
    if (!formData.nome) { showError(DOM.errNome, 'Obrigatório.'); hasError = true; }
    if (!formData.cidade) { showError(DOM.errCidade, 'Obrigatória.'); hasError = true; }
    if (hasError) return;

    const isEditing = state.editingId !== null;
    const method = isEditing ? 'PUT' : 'POST';
    const endpoint = isEditing ? `/usuarios/${state.editingId}` : '/usuarios';
    const simulatedError = DOM.forceError.value; // Captura a simulação de erro

    const response = await simulateHTTPRequest(method, endpoint, formData, simulatedError);

    if (response.status === 201 || response.status === 200) {
        showToast(response.message, 'success');
        resetForm();
        renderTable();
    } else {
        showToast(`Erro ${response.status}: ${response.message}`, 'error');
    }
}

async function handleSearch() {
    const query = DOM.searchInput.value.trim();
    const endpoint = query ? `/usuarios?q=${encodeURIComponent(query)}` : '/usuarios';
    const response = await simulateHTTPRequest('GET', endpoint);
    if (response.status === 200) renderTableData(response.data);
}

async function handleDelete(id) {
    if (confirm('Tem certeza que deseja excluir?')) {
        const response = await simulateHTTPRequest('DELETE', `/usuarios/${id}`);
        if (response.status === 200) { showToast(response.message, 'success'); renderTable(); }
        else { showToast(`Erro ${response.status}: ${response.message}`, 'error'); }
    }
}

function prepareEdit(id) {
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    state.editingId = id;
    DOM.nome.value = user.nome; DOM.documento.value = user.documento !== '---' ? user.documento : '';
    DOM.idade.value = user.idade !== '---' ? user.idade : ''; DOM.cidade.value = user.cidade;
    DOM.formTitle.innerText = `Editando: ${id} (PUT)`; DOM.btnSubmit.innerText = 'Atualizar (PUT)';
    DOM.btnSubmit.style.backgroundColor = 'var(--put)'; DOM.btnCancel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
    DOM.form.reset();
    state.editingId = null;
    DOM.forceError.value = 'none'; // Reseta o seletor de erro
    DOM.formTitle.innerText = 'Novo Registro (POST)';
    DOM.btnSubmit.innerText = 'Enviar Requisição';
    DOM.btnSubmit.style.backgroundColor = 'var(--primary)';
    DOM.btnCancel.classList.add('hidden');
    clearErrors();
}

// RENDERIZAÇÃO
function renderTable() { renderTableData(state.users); }

function renderTableData(data) {
    DOM.tableBody.innerHTML = '';
    if (data.length === 0) { DOM.tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nenhum registro.</td></tr>`; return; }
    data.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><small>${user.id}</small></td><td><strong>${user.nome}</strong></td><td>${user.cidade}</td>
            <td class="action-btns">
                <button class="btn btn-sm btn-secondary btn-edit" data-id="${user.id}">Editar</button>
                <button class="btn btn-sm btn-danger btn-delete" data-id="${user.id}">Excluir</button>
            </td>
        `;
        DOM.tableBody.appendChild(tr);
    });
}

function addServerLog(method, endpoint, response) {
    const logEntry = {
        time: new Date().toLocaleTimeString(),
        method, endpoint, status: response.status, statusText: response.statusText, message: response.message
    };
    state.logs.unshift(logEntry);
    if (state.logs.length > 30) state.logs.pop();
    saveData('sim_logs', state.logs);
    renderLogs();
}

function renderLogs() {
    DOM.serverLogs.innerHTML = '';
    if (state.logs.length === 0) { DOM.serverLogs.innerHTML = `<div class="empty-logs">Aguardando requisições...</div>`; return; }

    state.logs.forEach(log => {
        const statusClass = log.status >= 200 && log.status < 300 ? 'success' : (log.status >= 400 ? 'error' : 'warning');
        const meaning = HTTP_MEANINGS[log.status] || "Status não mapeado no dicionário educacional.";
        
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `
            <div class="log-header">
                <span class="log-time">[${log.time}]</span>
                <span class="badge ${log.method.toLowerCase()}">${log.method}</span>
                <span class="log-endpoint">${log.endpoint}</span>
            </div>
            <div class="log-status">
                <span>Status:</span>
                <span class="status-code ${statusClass}">${log.status} ${log.statusText}</span>
            </div>
            <div class="log-message">ℹ️ ${log.message}</div>
            <div class="log-meaning">💡 <b>O que significa:</b> ${meaning}</div>
        `;
        DOM.serverLogs.appendChild(div);
    });
}

// LÓGICA DO VISUALIZADOR JSON
function updateLastJson(data) {
    state.lastJson = data;
    saveData('sim_last_json', state.lastJson);
    renderLastJson();
}

function renderLastJson() {
    if (!state.lastJson) {
        DOM.jsonOutput.innerHTML = '<span style="color:#8b949e">Nenhum dado recebido do banco ainda. Tente cadastrar alguém.</span>';
        return;
    }
    
    // Função simples para colorir o JSON estilo VSCode
    let jsonStr = JSON.stringify(state.lastJson, null, 4);
    jsonStr = jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) { cls = 'json-key'; } 
            else { cls = 'json-string'; }
        } else if (/true|false/.test(match)) { cls = 'json-number'; } 
        else if (/null/.test(match)) { cls = 'json-number'; }
        return '<span class="' + cls + '">' + match + '</span>';
    });
    
    DOM.jsonOutput.innerHTML = jsonStr;
}

function clearLogs() { state.logs = []; saveData('sim_logs', state.logs); renderLogs(); showToast('Logs limpos.', 'success'); }

function updateStats(method) { if (state.stats[method] !== undefined) { state.stats[method]++; saveData('sim_stats', state.stats); updateStatsUI(); } }
function updateStatsUI() { DOM.statTotal.innerText = state.users.length; DOM.statGet.innerText = state.stats.GET; DOM.statPost.innerText = state.stats.POST; DOM.statPut.innerText = state.stats.PUT; DOM.statDelete.innerText = state.stats.DELETE; }

// UTILS
function generateId() { return Math.random().toString(36).substr(2, 6).toUpperCase(); }
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function showError(element, message) { element.innerText = message; }
function clearErrors() { document.querySelectorAll('.error-msg').forEach(el => el.innerText = ''); }

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span><button style="background:none;border:none;cursor:pointer;font-weight:bold;color:inherit" onclick="this.parentElement.remove()">✕</button>`;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

function setLoadingState(isLoading) {
    const originalText = state.editingId ? 'Atualizar (PUT)' : 'Enviar Requisição';
    DOM.btnSubmit.disabled = isLoading; DOM.btnSubmit.innerText = isLoading ? 'Processando...' : originalText;
    if (isLoading && !DOM.form.contains(document.activeElement)) DOM.tableBody.style.opacity = '0.5'; else DOM.tableBody.style.opacity = '1';
}

function toggleTheme() {
    const newTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}
function applyTheme(theme) {
    document.body.dataset.theme = theme; localStorage.setItem('sim_theme', theme);
    DOM.themeToggle.innerText = theme === 'light' ? '🌙' : '☀️';
}
function debounce(func, wait) {
    let timeout;
    return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

init();