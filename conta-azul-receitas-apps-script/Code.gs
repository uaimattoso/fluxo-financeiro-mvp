const CA = Object.freeze({
  apiBase: 'https://api-v2.contaazul.com',
  authorizeUrl: 'https://login.contaazul.com/#/oauth/authorize',
  tokenUrl: 'https://api-v2.contaazul.com/oauth/token'
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.code) {
      validateState_(p.state);
      exchangeCode_(p.code);
      return HtmlService.createHtmlOutput('<h2>Conta Azul conectado.</h2><p>Você pode fechar esta janela e voltar ao importador.</p>');
    }
    if (p.error) throw new Error('Autorização recusada: ' + p.error);
    if (p.action === 'authorize') {
      const url = getAuthorizationUrl_().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return HtmlService.createHtmlOutput('<div style="font:16px Arial;padding:32px;text-align:center"><h2>Conectar ao Conta Azul</h2><p>Autorize o importador de receitas.</p><a href="' + url + '" target="_top">Continuar</a></div>');
    }
  } catch (err) {
    return HtmlService.createHtmlOutput('<h2>Falha na conexão</h2><p>' + escapeHtml_(err.message) + '</p>');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Importador de receitas · Conta Azul')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppState() {
  const configured = isConfigured_();
  const connected = isConnected_();
  let company = null;
  if (connected) {
    try { company = ca_('/v1/pessoas/conta-conectada'); } catch (_) {}
  }
  return { ok: true, configured: configured, connected: connected, company: company, authorizeUrl: ScriptApp.getService().getUrl() + '?action=authorize' };
}

function getCatalogs() {
  requireConnected_();
  return {
    ok: true,
    accounts: catalog_(['/v1/conta-financeira?pagina=1&tamanho_pagina=200&apenas_ativo=true']),
    categories: catalog_(['/v1/categorias?pagina=1&tamanho_pagina=1000']),
    costCenters: catalog_(['/v1/centro-de-custo?pagina=1&tamanho_pagina=1000']),
    contacts: catalog_(['/v1/pessoa?pagina=1&tamanho_pagina=1000', '/v1/pessoas?pagina=1&tamanho_pagina=1000'])
  };
}

function createReceipts(input) {
  requireConnected_();
  const rows = (input && input.rows) || [];
  const map = (input && input.mapping) || {};
  if (!rows.length) throw new Error('Nenhuma linha válida para importar.');
  if (!map.accountId || !map.contactId) throw new Error('Selecione a conta financeira e o cliente/contato padrão.');
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const results = [];
    rows.forEach(function(row, index) {
      const normalized = normalizeRow_(row, map, index + 2);
      const key = 'RECEITA_' + digest_(normalized.payload);
      const previous = props.getProperty(key);
      if (previous) {
        results.push(Object.assign(JSON.parse(previous), { duplicatePrevented: true }));
        return;
      }
      try {
        const response = ca_('/v1/financeiro/eventos-financeiros/contas-a-receber', 'post', normalized.payload);
        const saved = {
          row: normalized.rowNumber,
          status: String(response.status || 'PENDING'),
          protocolId: String(response.protocolo || response.protocolId || ''),
          gross: normalized.gross,
          fee: normalized.fee,
          net: normalized.net,
          description: normalized.payload.descricao
        };
        props.setProperty(key, JSON.stringify(saved));
        results.push(saved);
      } catch (err) {
        results.push({ row: normalized.rowNumber, status: 'ERROR', message: err.message });
      }
    });
    return { ok: results.every(function(x) { return x.status !== 'ERROR'; }), results: results };
  } finally {
    lock.releaseLock();
  }
}

function normalizeRow_(row, map, rowNumber) {
  const gross = money_(row.gross);
  const fee = Math.abs(money_(row.fee));
  if (!(gross > 0)) throw new Error('Linha ' + rowNumber + ': valor bruto deve ser maior que zero.');
  if (!isFinite(fee) || fee < 0) throw new Error('Linha ' + rowNumber + ': tarifa inválida.');
  const net = round_(gross - fee);
  if (net < 0) throw new Error('Linha ' + rowNumber + ': tarifa maior que o valor bruto.');
  const categoryId = map.categories && map.categories[String(row.category || '').trim()];
  if (!categoryId) throw new Error('Linha ' + rowNumber + ': categoria sem mapeamento.');
  const centerId = map.costCenters && map.costCenters[String(row.costCenter || '').trim()];
  const payload = {
    data_competencia: isoDate_(row.competence, rowNumber),
    valor: gross,
    observacao: String(row.description || 'Receita importada'),
    descricao: String(row.description || 'Receita importada'),
    contato: map.contactId,
    conta_financeira: map.accountId,
    rateio: [{
      id_categoria: categoryId,
      valor: gross,
      rateio_centro_custo: centerId ? [{ id_centro_custo: centerId, valor: gross }] : []
    }],
    condicao_pagamento: {
      parcelas: [{
        descricao: String(row.description || 'Receita importada'),
        data_vencimento: isoDate_(row.dueDate, rowNumber),
        nota: 'Importação de receita · pagamento: ' + String(row.paymentDate || ''),
        conta_financeira: map.accountId,
        detalhe_valor: {
          multa: 0, juros: 0, valor_bruto: gross, valor_liquido: net,
          desconto: 0, taxa: fee
        },
        metodo_pagamento: map.paymentMethod || 'OUTRO'
      }]
    }
  };
  return { rowNumber: rowNumber, gross: gross, fee: fee, net: net, payload: payload };
}

function getAuthorizationUrl_() {
  const state = Utilities.getUuid();
  CacheService.getScriptCache().put('receitas_oauth_' + state, 'valid', 600);
  return CA.authorizeUrl + '?' + query_({
    response_type: 'code', client_id: required_('CA_CLIENT_ID'),
    redirect_uri: callbackUrl_(), state: state,
    scope: 'openid profile aws.cognito.signin.user.admin'
  });
}

function validateState_(state) {
  if (!state || CacheService.getScriptCache().get('receitas_oauth_' + state) !== 'valid') {
    throw new Error('Autorização expirada. Inicie novamente.');
  }
  CacheService.getScriptCache().remove('receitas_oauth_' + state);
}

function exchangeCode_(code) {
  saveTokens_(UrlFetchApp.fetch(CA.tokenUrl, {
    method: 'post', muteHttpExceptions: true, headers: { Authorization: basic_() },
    payload: { grant_type: 'authorization_code', code: code, redirect_uri: callbackUrl_() }
  }));
}

function accessToken_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('CA_ACCESS_TOKEN');
  if (token && Date.now() < Number(p.getProperty('CA_TOKEN_EXPIRES_AT') || 0)) return token;
  saveTokens_(UrlFetchApp.fetch(CA.tokenUrl, {
    method: 'post', muteHttpExceptions: true, headers: { Authorization: basic_() },
    payload: { grant_type: 'refresh_token', refresh_token: required_('CA_REFRESH_TOKEN') }
  }));
  return required_('CA_ACCESS_TOKEN');
}

function saveTokens_(response) {
  const status = response.getResponseCode(), body = parse_(response.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) throw new Error('Falha ao obter acesso do Conta Azul (' + status + ').');
  PropertiesService.getScriptProperties().setProperties({
    CA_ACCESS_TOKEN: body.access_token,
    CA_TOKEN_EXPIRES_AT: String(Date.now() + Math.max(60, Number(body.expires_in || 3600) - 120) * 1000),
    CA_REFRESH_TOKEN: body.refresh_token || PropertiesService.getScriptProperties().getProperty('CA_REFRESH_TOKEN') || ''
  }, false);
}

function ca_(path, method, payload) {
  const response = UrlFetchApp.fetch(CA.apiBase + path, {
    method: method || 'get', muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken_(), Accept: 'application/json' },
    payload: payload ? JSON.stringify(payload) : undefined
  });
  const status = response.getResponseCode(), body = parse_(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('Conta Azul respondeu ' + status + ': ' + JSON.stringify(body).slice(0, 300));
  return body;
}

function catalog_(paths) {
  let error = '';
  for (let i = 0; i < paths.length; i++) {
    try { return list_(ca_(paths[i])); } catch (err) { error = err.message; }
  }
  if (error) throw new Error(error);
  return [];
}

function list_(value) {
  const raw = Array.isArray(value) ? value : (value.items || value.itens || value.data || value.results || []);
  return raw.map(function(x) {
    return {
      id: String(x.id || x.uuid || x.id_pessoa || x.id_categoria || x.id_centro_custo || x.id_conta_financeira || ''),
      name: String(x.nome || x.name || x.descricao || x.razao_social || x.nome_fantasia || '')
    };
  }).filter(function(x) { return x.id && x.name; });
}

function requireConnected_() {
  if (!isConnected_()) throw new Error('Conecte o Conta Azul antes de continuar.');
}

function isConfigured_() {
  const p = PropertiesService.getScriptProperties();
  return Boolean(p.getProperty('CA_CLIENT_ID') && p.getProperty('CA_CLIENT_SECRET'));
}

function isConnected_() {
  return Boolean(PropertiesService.getScriptProperties().getProperty('CA_REFRESH_TOKEN'));
}

function required_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Propriedade ausente: ' + name);
  return value;
}

function basic_() {
  return 'Basic ' + Utilities.base64Encode(required_('CA_CLIENT_ID') + ':' + required_('CA_CLIENT_SECRET'));
}

function callbackUrl_() {
  return PropertiesService.getScriptProperties().getProperty('CA_REDIRECT_URI') || ScriptApp.getService().getUrl();
}

function money_(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  if (!isFinite(number)) throw new Error('Valor inválido: ' + value);
  return round_(number);
}

function round_(value) { return Math.round(value * 100) / 100; }

function isoDate_(value, rowNumber) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const p = text.split(/[\/.\-]/);
  if (p.length !== 3) throw new Error('Linha ' + rowNumber + ': data inválida.');
  const d = p[0].length === 4 ? [p[0], p[1], p[2]] : [p[2], p[1], p[0]];
  const date = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
  if (date.getFullYear() !== Number(d[0]) || date.getMonth() !== Number(d[1]) - 1 || date.getDate() !== Number(d[2])) {
    throw new Error('Linha ' + rowNumber + ': data inválida.');
  }
  return d[0] + '-' + ('0' + d[1]).slice(-2) + '-' + ('0' + d[2]).slice(-2);
}

function digest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value))).replace(/=+$/, '').slice(0, 32);
}

function query_(value) {
  return Object.keys(value).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(value[k]); }).join('&');
}

function parse_(value) { try { return JSON.parse(value); } catch (_) { return { message: String(value) }; } }
function escapeHtml_(value) { return String(value).replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
