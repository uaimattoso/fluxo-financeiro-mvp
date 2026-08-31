/** Fluxo — ponte exclusiva com o Conta Azul. */
const FLUXO_CA = Object.freeze({
  apiBase: 'https://api-v2.contaazul.com',
  authorizeUrl: 'https://login.contaazul.com/#/oauth/authorize',
  tokenUrl: 'https://api-v2.contaazul.com/oauth/token'
});

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.code) {
      validateState_(p.state);
      exchangeCode_(p.code);
      return HtmlService.createHtmlOutput('<h2>Conta Azul conectado ao Fluxo.</h2><p>Você já pode fechar esta janela.</p>');
    }
    if (p.error) throw new Error('Autorização recusada: ' + p.error);
    if (p.action === 'authorize') {
      const url = getAuthorizationUrl_().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return HtmlService.createHtmlOutput(
        '<div style="font:16px Arial;padding:32px;line-height:1.5;text-align:center">' +
        '<h2>Conectar o Fluxo ao Conta Azul</h2><p>Continue para autorizar o acesso seguro.</p>' +
        '<a href="' + url + '" target="_top" style="display:inline-block;background:#164b35;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Continuar para o Conta Azul</a></div>'
      );
    }
    if (p.action === 'catalogs') return json_(getCatalogs_());
    if (p.action === 'mappings') return json_(getMappings_());
    return json_({ ok: true, configured: isConfigured_(), connected: isConnected_(), service: 'Fluxo Conta Azul' });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'saveMappings') return json_(saveMappings_(body.mappings || {}));
    if (body.action === 'previewPayable') return json_({ ok: true, payload: buildPayable_(body) });
    if (body.action === 'createPayable') return json_(createPayable_(body));
    throw new Error('Ação não reconhecida.');
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function getAuthorizationUrl_() {
  const state = Utilities.getUuid();
  CacheService.getScriptCache().put('fluxo_oauth_' + state, 'valid', 600);
  return FLUXO_CA.authorizeUrl + '?' + query_({
    response_type: 'code', client_id: required_('CA_CLIENT_ID'), redirect_uri: callbackUrl_(), state: state,
    scope: 'openid profile aws.cognito.signin.user.admin'
  });
}

function validateState_(state) {
  const key = 'fluxo_oauth_' + state;
  if (!state || CacheService.getScriptCache().get(key) !== 'valid') throw new Error('Autorização expirada. Inicie novamente pelo Fluxo.');
  CacheService.getScriptCache().remove(key);
}

function exchangeCode_(code) {
  saveTokens_(UrlFetchApp.fetch(FLUXO_CA.tokenUrl, { method: 'post', muteHttpExceptions: true, headers: { Authorization: basic_() }, payload: { grant_type: 'authorization_code', code: code, redirect_uri: callbackUrl_() } }));
}

function accessToken_() {
  const props = PropertiesService.getScriptProperties(), token = props.getProperty('CA_ACCESS_TOKEN');
  if (token && Date.now() < Number(props.getProperty('CA_TOKEN_EXPIRES_AT') || 0)) return token;
  saveTokens_(UrlFetchApp.fetch(FLUXO_CA.tokenUrl, { method: 'post', muteHttpExceptions: true, headers: { Authorization: basic_() }, payload: { grant_type: 'refresh_token', refresh_token: required_('CA_REFRESH_TOKEN') } }));
  return required_('CA_ACCESS_TOKEN');
}

function saveTokens_(response) {
  const status = response.getResponseCode(), body = parse_(response.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) throw new Error('Falha ao obter acesso do Conta Azul (' + status + ').');
  const values = { CA_ACCESS_TOKEN: body.access_token, CA_TOKEN_EXPIRES_AT: String(Date.now() + Math.max(60, Number(body.expires_in || 3600) - 120) * 1000) };
  if (body.refresh_token) values.CA_REFRESH_TOKEN = body.refresh_token;
  PropertiesService.getScriptProperties().setProperties(values, false);
}

function ca_(path, method, payload) {
  const response = UrlFetchApp.fetch(FLUXO_CA.apiBase + path, { method: method || 'get', muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + accessToken_(), Accept: 'application/json' }, payload: payload ? JSON.stringify(payload) : undefined });
  const status = response.getResponseCode(), body = parse_(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('Conta Azul respondeu ' + status + ': ' + JSON.stringify(body).slice(0, 300));
  return body;
}

function getCatalogs_() {
  const accounts = catalog_(['/v1/conta-financeira?pagina=1&tamanho_pagina=100&apenas_ativo=true']);
  const categories = catalog_(['/v1/categorias?pagina=1&tamanho_pagina=1000']);
  const costCenters = catalog_(['/v1/centro-de-custo?pagina=1&tamanho_pagina=1000']);
  const people = catalog_([
    '/v1/pessoas?pagina=1&tamanho_pagina=1000&tipo_perfil=Fornecedor',
    '/v1/pessoa?pagina=1&tamanho_pagina=1000&tipo_perfil=FORNECEDOR&status=ATIVO'
  ]);
  return {
    ok: true,
    accounts: accounts.items,
    categories: categories.items,
    costCenters: costCenters.items,
    people: people.items,
    warnings: [accounts.error, categories.error, costCenters.error, people.error].filter(Boolean)
  };
}

function catalog_(paths) {
  let lastError = '';
  for (let i = 0; i < paths.length; i++) {
    try { return { items: list_(ca_(paths[i])), error: '' }; }
    catch (error) { lastError = error.message; }
  }
  return { items: [], error: lastError };
}

function buildPayable_(body) {
  const f = body.form || {}, m = body.mappings || {}, missing = [];
  if (f.kind !== 'Banda') missing.push('Somente Banda está liberada');
  [[f.supplier,'Favorecido'],[f.amount,'Valor'],[f.payment,'Vencimento'],[f.competence,'Competência'],[m.contactId,'Contato'],[m.categoryId,'Categoria'],[m.accountId,'Conta financeira']].forEach(function(x){ if(!x[0]) missing.push(x[1]); });
  if (missing.length) throw new Error('Revise: ' + missing.join(', '));
  const value = money_(f.amount), rate = { id_categoria: m.categoryId, valor: value };
  if (m.costCenterId) rate.rateio_centro_custo = [{ id_centro_custo: m.costCenterId, valor: value }];
  return { data_competencia: iso_(f.competence), valor: value, observacao: f.pix ? 'PIX: ' + f.pix : '', descricao: f.description, contato: m.contactId, conta_financeira: m.accountId, rateio: [rate], condicao_pagamento: { parcelas: [{ descricao: f.description, data_vencimento: iso_(f.payment), nota: 'Banda: ' + (f.bandName || ''), conta_financeira: m.accountId, detalhe_valor: { multa:0, juros:0, valor_bruto:value, valor_liquido:value, desconto:0, taxa:0 }, metodo_pagamento:'PIX_PAGAMENTO_INSTANTANEO' }] } };
}

function createPayable_(body) {
  if (body.confirm !== true) throw new Error('Confirmação final obrigatória.');
  const payload = buildPayable_(body), key = digest_(payload), props = PropertiesService.getScriptProperties(), previous = props.getProperty('CREATED_' + key);
  if (previous) return Object.assign(parse_(previous), { ok:true, duplicatePrevented:true });
  const result = ca_('/v1/financeiro/eventos-financeiros/contas-a-pagar', 'post', payload);
  const saved = { ok:true, protocolId:result.protocolo || result.protocolId || result.id || '', status:result.status || 'PROCESSANDO', createdAt:result.data_criacao || result.createdAt || new Date().toISOString() };
  props.setProperty('CREATED_' + key, JSON.stringify(saved));
  return saved;
}

function getMappings_(){ return parse_(PropertiesService.getScriptProperties().getProperty('FLUXO_MAPPINGS') || '{}'); }
function saveMappings_(value){ PropertiesService.getScriptProperties().setProperty('FLUXO_MAPPINGS', JSON.stringify(value)); return {ok:true}; }
function callbackUrl_(){ return PropertiesService.getScriptProperties().getProperty('CA_REDIRECT_URI') || ScriptApp.getService().getUrl(); }
function isConfigured_(){ const p=PropertiesService.getScriptProperties(); return Boolean(p.getProperty('CA_CLIENT_ID') && p.getProperty('CA_CLIENT_SECRET')); }
function isConnected_(){ return Boolean(PropertiesService.getScriptProperties().getProperty('CA_REFRESH_TOKEN')); }
function required_(name){ const value=PropertiesService.getScriptProperties().getProperty(name); if(!value) throw new Error('Propriedade ausente: ' + name); return value; }
function basic_(){ return 'Basic ' + Utilities.base64Encode(required_('CA_CLIENT_ID') + ':' + required_('CA_CLIENT_SECRET')); }
function json_(value){ return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function parse_(value){ try{return JSON.parse(value)}catch(_){return {message:String(value)}} }
function query_(value){ return Object.keys(value).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(value[k])}).join('&'); }
function list_(value){ const raw=Array.isArray(value)?value:(value.items||value.itens||value.data||value.results||value.conteudo||[]); return raw.map(function(x){return {id:String(x.id||x.uuid||x.id_pessoa||x.id_categoria||x.id_centro_custo||x.id_conta_financeira||''),name:String(x.nome||x.name||x.descricao||x.razao_social||x.nome_fantasia||'Sem nome')}}).filter(function(x){return x.id}); }
function money_(value){ return Number(String(value).replace(/\./g,'').replace(',','.')); }
function iso_(value){ const p=String(value).split('/'); return p[2]+'-'+p[1]+'-'+p[0]; }
function digest_(value){ const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value)); return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'').slice(0,32); }
