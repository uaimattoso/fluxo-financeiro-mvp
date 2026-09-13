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

function ca_(path) {
  const response = UrlFetchApp.fetch(CRS_CA.apiBase + path, {
    method:'get', muteHttpExceptions:true, contentType:'application/json',
    headers:{Authorization:'Bearer ' + accessToken_(), Accept:'application/json'}
  });
  const status = response.getResponseCode();
  const body = parse_(response.getContentText());
  if (status < 200 || status >= 300) throw new Error('Conta Azul respondeu ' + status + '.');
  return body;
}

function callbackUrl_() { return PropertiesService.getScriptProperties().getProperty('CA_REDIRECT_URI') || ScriptApp.getService().getUrl(); }
function configured_() { const p = PropertiesService.getScriptProperties(); return Boolean(p.getProperty('CA_CLIENT_ID') && p.getProperty('CA_CLIENT_SECRET')); }
function connected_() { return Boolean(PropertiesService.getScriptProperties().getProperty('CA_REFRESH_TOKEN')); }
function required_(name) { const value = PropertiesService.getScriptProperties().getProperty(name); if (!value) throw new Error('Propriedade ausente: ' + name); return value; }
function basic_() { return 'Basic ' + Utilities.base64Encode(required_('CA_CLIENT_ID') + ':' + required_('CA_CLIENT_SECRET')); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function parse_(value) { try { return JSON.parse(value); } catch (_) { return {message:String(value)}; } }
function query_(value) { return Object.keys(value).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(value[k]); }).join('&'); }

