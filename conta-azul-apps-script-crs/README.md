# Ponte Conta Azul — CRS

Projeto Apps Script **separado** do Bafo da Prainha. Sua URL `/exec`, credenciais e tokens pertencem somente à licença da CRS.

Projeto publicado: https://script.google.com/home/projects/1DBKzQ8eonpuBwvKjyw55L15seBlADQIfe_z50LgvWbNCTw5gS5EWpJML/edit

URL de redirecionamento da CRS: https://script.google.com/macros/s/AKfycbw7-WplZr-2N6pu76966H18o5DpyDNw2sR8No2ASCO9IdM8ZUXzMG_zg05M3VnV-Xh1/exec

1. O projeto Apps Script foi criado com `Code.gs` e `Bridge.html` e implantado como aplicativo da web, executando como proprietário e com acesso para qualquer pessoa. A ponte começa sem credenciais e só expõe o estado da conexão.
2. Cadastre a URL `/exec` acima como redirecionamento do aplicativo da CRS no Portal Conta Azul. A URL deve coincidir exatamente com a usada na autorização.
3. Nas Propriedades do script **desse projeto**, configure `CA_CLIENT_ID`, `CA_CLIENT_SECRET`, `CA_REDIRECT_URI` e `FLUXO_ACCESS_KEY` próprios da CRS. Não copie tokens ou chaves do Bafo.
4. Abra `/exec?action=authorize` para autorizar a licença da CRS. Depois, confira a identidade da empresa antes de habilitar qualquer operação financeira.

Esta primeira versão só permite autorização, estado da conexão e leitura da empresa conectada. Escritas financeiras ficam fechadas até o fluxo de rateio da CRS estar implementado e revisado.

