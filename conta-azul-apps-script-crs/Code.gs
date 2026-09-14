/** Fluxo — conexão isolada da licença Conta Azul da CRS. */
const CRS_CA = Object.freeze({
  apiBase: 'https://api-v2.contaazul.com',
  authorizeUrl: 'https://login.contaazul.com/#/oauth/authorize',
  tokenUrl: 'https://api-v2.contaazul.com/oauth/token'
});

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.code) {
      validateState_(params.state);
      exchangeCode_(params.code);
      return HtmlService.createHtmlOutput('<h2>Conta Azul da CRS conectado ao Fluxo.</h2><p>Você já pode fechar esta janela.</p>');
    }
    if (params.error) throw new Error('Autorização recusada: ' + params.error);
    if (params.action === 'authorize') {
      const url = authorizationUrl_().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return HtmlService.createHtmlOutput(
        '<div style="font:16px Arial;padding:32px;line-height:1.5;text-align:center">' +
        '<h2>Conectar a CRS ao Conta Azul</h2><p>Autorize a licença da CRS.</p>' +
        '<a href="' + url + '" target="_top" style="display:inline-block;background:#164b35;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Continuar para o Conta Azul</a></div>'
      );
    }
    if (params.action === 'bridge') {
      const nonce = String(params.nonce || '');
      if (!/^[0-9a-f-]{36}$/.test(nonce)) throw new Error('Ponte inválida.');
      const page = HtmlService.createTemplateFromFile('Bridge');
      page.nonce = nonce;
      return page.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return json_({ok:true, company:'CRS', configured:configured_(), connected:connected_()});
  } catch (error) {
    return json_({ok:false, message:error.message});
  }
}

function doPost() {
  return json_({ok:false, message:'Operações financeiras da CRS ainda não estão liberadas.'});
}

function bridgeRequest(request) {
  const action = String(request && request.action || '');
  if (action === 'status') return {ok:true, company:'CRS', configured:configured_(), connected:connected_()};
  const supplied = String(request && request.accessKey || '');
  const expected = required_('FLUXO_ACCESS_KEY');
  if (!supplied || supplied !== expected) throw new Error('Chave de acesso inválida.');
  if (!connected_()) throw new Error('Licença da CRS ainda não conectada.');
  if (action === 'identity') return {ok:true, company:ca_('/v1/pessoas/conta-conectada')};
  if (action === 'catalogs') return catalogs_();
  if (action === 'previewRateio') { validateRateioMappings_(request.body || {}); return {ok:true, entries:rateio_(request.body || {})}; }
  if (action === 'createRateio') return createRateio_(request.body || {});
  throw new Error('Operação não disponível na ponte da CRS.');
}

function authorizationUrl_() {
  const state = Utilities.getUuid();
  CacheService.getScriptCache().put('fluxo_crs_oauth_' + state, 'valid', 600);
  return CRS_CA.authorizeUrl + '?' + query_({
    response_type:'code', client_id:required_('CA_CLIENT_ID'), redirect_uri:callbackUrl_(),
    state:state, scope:'openid profile aws.cognito.signin.user.admin'
  });
}

function validateState_(state) {
  const key = 'fluxo_crs_oauth_' + state;
  if (!state || CacheService.getScriptCache().get(key) !== 'valid') throw new Error('Autorização expirada. Inicie novamente pela ponte da CRS.');
  CacheService.getScriptCache().remove(key);
}

function exchangeCode_(code) {
  saveTokens_(UrlFetchApp.fetch(CRS_CA.tokenUrl, {
    method:'post', muteHttpExceptions:true, headers:{Authorization:basic_()},
    payload:{grant_type:'authorization_code', code:code, redirect_uri:callbackUrl_()}
  }));
}

function accessToken_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('CA_ACCESS_TOKEN');
  if (token && Date.now() < Number(props.getProperty('CA_TOKEN_EXPIRES_AT') || 0)) return token;
  saveTokens_(UrlFetchApp.fetch(CRS_CA.tokenUrl, {
    method:'post', muteHttpExceptions:true, headers:{Authorization:basic_()},
    payload:{grant_type:'refresh_token', refresh_token:required_('CA_REFRESH_TOKEN')}
  }));
  return required_('CA_ACCESS_TOKEN');
}

function saveTokens_(response) {
  const status = response.getResponseCode();
  const body = parse_(response.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) throw new Error('Falha ao obter acesso do Conta Azul (' + status + ').');
  const values = {
    CA_ACCESS_TOKEN:body.access_token,
    CA_TOKEN_EXPIRES_AT:String(Date.now() + Math.max(60, Number(body.expires_in || 3600) - 120) * 1000)
  };
  if (body.refresh_token) values.CA_REFRESH_TOKEN = body.refresh_token;
  PropertiesService.getScriptProperties().setProperties(values, false);
}

function ca_(path, method, payload) {
  const response = UrlFetchApp.fetch(CRS_CA.apiBase + path, {
    method:method || 'get', muteHttpExceptions:true, contentType:'application/json',
    headers:{Authorization:'Bearer ' + accessToken_(), Accept:'application/json'},
    payload:payload ? JSON.stringify(payload) : undefined
  });
  const status = response.getResponseCode();
  const body = parse_(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('Conta Azul respondeu ' + status + '.');
  return body;
}

function catalogs_() {
  return {
    ok:true,
    accounts:list_(ca_('/v1/conta-financeira?pagina=1&tamanho_pagina=100&apenas_ativo=true')),
    categories:list_(ca_('/v1/categorias?pagina=1&tamanho_pagina=1000')),
    clients:list_(ca_('/v1/pessoas?pagina=1&tamanho_pagina=1000&tipo_perfil=Cliente')),
    suppliers:list_(ca_('/v1/pessoas?pagina=1&tamanho_pagina=1000&tipo_perfil=Fornecedor'))
  };
}

function rateio_(body) {
  const f = body.form || {}, m = body.mappings || {};
  const names = ['Bafo da Prainha','Casa Porto','Capiau','Dois de Fevereiro'];
  const categories = ['Recebíveis - Bafo','Recebíveis - Casa Porto','Recebíveis - Capiau','Recebíveis - Dois de Fevereiro'];
  const weights = [42,20,26,12];
  const total = cents_(f.amount);
  if (total <= 0 || !/^\d{2}\/\d{2}\/\d{4}$/.test(String(f.payment)) || !/^\d{2}\/\d{2}\/\d{4}$/.test(String(f.competence))) throw new Error('Confira valor, vencimento e competência.');
  if (!String(f.description || '').trim()) throw new Error('Informe a descrição da despesa.');
  if (!m.accountId || !m.payableCategoryId || !m.supplierId) throw new Error('Selecione conta financeira, categoria da despesa e fornecedor no Conta Azul.');
  const result = [];
  let used = 0;
  for (let i = 0; i < names.length; i++) {
    const value = i === 3 ? total-used : Math.round(total*weights[i]/100);
    used += value;
    const contact = m.clientIds && m.clientIds[names[i]];
    if (!contact) throw new Error('Selecione o cliente da receita: ' + names[i]);
    const category = m.receivableCategoryIds && m.receivableCategoryIds[names[i]];
    if (!category) throw new Error('Selecione a categoria ' + categories[i]);
    result.push({type:'Receita',party:names[i],cents:value,payload:event_(value, f, contact, m.accountId, category, 'Rateio Benefício Cidadania - ' + names[i], 'BOLETO_BANCARIO')});
  }
  result.push({type:'Despesa',party:'Shalom',cents:total,payload:event_(total, f, m.supplierId, m.accountId, m.payableCategoryId, String(f.description), 'BOLETO_BANCARIO')});
  return result;
}

function validateRateioMappings_(body) {
  const m=body.mappings || {}, c=catalogs_();
  const names=['Bafo da Prainha','Casa Porto','Capiau','Dois de Fevereiro'];
  const clients=['BAFO DA PRAINHA','CASA PORTO','O TORRESMEIRO (Capiau)','TASCARIA (2 de Fevereiro)'];
  const categories=['Recebíveis - Bafo','Recebíveis - Casa Porto','Recebíveis - Capiau','Recebíveis - Dois de Fevereiro'];
  const equal=function(a,b){return String(a).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()===String(b).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();};
  const fixedAccounts=c.accounts.filter(function(x){return equal(x.name,'1.Banco Safra - Conta Corrente');});
  if (fixedAccounts.length!==1 || fixedAccounts[0].id!==m.accountId) throw new Error('A conta financeira da CRS deve ser 1.Banco Safra - Conta Corrente.');
  const payableCategories=c.categories.filter(function(x){return equal(x.name,'Benefício Cidadania');});
  if (payableCategories.length!==1 || payableCategories[0].id!==m.payableCategoryId) throw new Error('A categoria da despesa da Shalom deve ser Benefício Cidadania.');
  const shalomSuppliers=c.suppliers.filter(function(x){return /^SHALOM(?:\b|\s|[,.-])/.test(String(x.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase());});
  if (shalomSuppliers.length!==1 || shalomSuppliers[0].id!==m.supplierId) throw new Error('O fornecedor da despesa deve ser o cadastro único da Shalom na CRS.');
  for (let i=0;i<names.length;i++) {
    if (!c.clients.some(function(x){return x.id===(m.clientIds || {})[names[i]] && equal(x.name,clients[i]);})) throw new Error('Confira o cliente ' + clients[i] + '.');
    if (!c.categories.some(function(x){return x.id===(m.receivableCategoryIds || {})[names[i]] && equal(x.name,categories[i]);})) throw new Error('Confira a categoria ' + categories[i] + '.');
  }
}

function event_(cents, form, contact, account, category, description, method) {
  const amount = cents/100;
  return {
    data_competencia:iso_(form.competence), valor:amount,
    observacao:'Rateio CRS · ' + String(form.description || ''),
    descricao:description, contato:contact, conta_financeira:account,
    rateio:[{id_categoria:category,valor:amount}],
    condicao_pagamento:{parcelas:[{
      descricao:description, data_vencimento:iso_(form.payment),
      nota:'Rateio CRS', conta_financeira:account,
      detalhe_valor:{multa:0,juros:0,valor_bruto:amount,valor_liquido:amount,desconto:0,taxa:0},
      metodo_pagamento:method
    }]}
  };
}

function createRateio_(body) {
  if (body.confirm !== true) throw new Error('Confirmação final obrigatória.');
  const company = ca_('/v1/pessoas/conta-conectada');
  const identity = String(company.nome_fantasia || company.razao_social || company.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if (identity !== 'FIRMA CARIOCA DE BALCAO' && identity !== 'CRS SERVICO DE APOIO ADMINISTRATIVO LTDA') throw new Error('A licença conectada não corresponde à CRS.');
  validateRateioMappings_(body);
  const entries = rateio_(body);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const batch = digest_(entries.map(function(entry){return entry.payload}));
    const results = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], key = 'CRS_CREATED_' + batch + '_' + i;
      const prior = props.getProperty(key);
      if (prior) {
        const saved = parse_(prior);
        results.push({type:entry.type,party:entry.party,status:saved.status,protocolId:saved.protocolId,duplicatePrevented:true});
        if (saved.status === 'UNKNOWN') return {ok:false,partial:true,results:results,message:'O resultado de um envio anterior é incerto. Confira na Conta Azul antes de repetir.'};
        continue;
      }
      // A reserva evita repetição cega se a API criar o lançamento mas a resposta se perder.
      props.setProperty(key, JSON.stringify({status:'UNKNOWN',protocolId:''}));
      try {
        const path = entry.type === 'Receita' ? 'contas-a-receber' : 'contas-a-pagar';
        const created = ca_('/v1/financeiro/eventos-financeiros/' + path, 'post', entry.payload);
        const saved = {status:String(created.status || 'PENDING'),protocolId:String(created.protocolo || '')};
        props.setProperty(key, JSON.stringify(saved));
        results.push({type:entry.type,party:entry.party,status:saved.status,protocolId:saved.protocolId});
      } catch (error) {
        return {ok:false,partial:true,results:results,message:'Envio interrompido em ' + entry.party + ': ' + error.message + '. Confira na Conta Azul antes de repetir.'};
      }
    }
    return {ok:true,results:results};
  } finally {lock.releaseLock();}
}

function list_(value) {
  const raw = Array.isArray(value) ? value : (value.items || value.itens || value.data || []);
  return raw.map(function(item){return {id:String(item.id || item.uuid || item.id_pessoa || item.id_categoria || item.id_conta_financeira || ''),name:String(item.nome || item.razao_social || item.nome_fantasia || item.descricao || '')};}).filter(function(item){return item.id && item.name;});
}
function cents_(value) { const match = String(value).trim().replace(/\./g,'').replace(',','.'); const number = Number(match); if (!Number.isFinite(number)) throw new Error('Valor inválido.'); return Math.round(number*100); }
function iso_(value) { const p=String(value).split('/'), d=new Date(Number(p[2]),Number(p[1])-1,Number(p[0])); if (d.getFullYear()!==Number(p[2]) || d.getMonth()!==Number(p[1])-1 || d.getDate()!==Number(p[0])) throw new Error('Data inválida.'); return p[2]+'-'+p[1]+'-'+p[0]; }
function digest_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value))).replace(/=+$/,'').slice(0,32); }

function callbackUrl_() { return PropertiesService.getScriptProperties().getProperty('CA_REDIRECT_URI') || ScriptApp.getService().getUrl(); }
function configured_() { const p = PropertiesService.getScriptProperties(); return Boolean(p.getProperty('CA_CLIENT_ID') && p.getProperty('CA_CLIENT_SECRET')); }
function connected_() { return Boolean(PropertiesService.getScriptProperties().getProperty('CA_REFRESH_TOKEN')); }
function required_(name) { const value = PropertiesService.getScriptProperties().getProperty(name); if (!value) throw new Error('Propriedade ausente: ' + name); return value; }
function basic_() { return 'Basic ' + Utilities.base64Encode(required_('CA_CLIENT_ID') + ':' + required_('CA_CLIENT_SECRET')); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function parse_(value) { try { return JSON.parse(value); } catch (_) { return {message:String(value)}; } }
function query_(value) { return Object.keys(value).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(value[k]); }).join('&'); }

