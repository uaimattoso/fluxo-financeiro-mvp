# Ponte Conta Azul — CRS

Projeto Apps Script **separado** do Bafo da Prainha. Sua URL `/exec`, credenciais e tokens pertencem somente à licença da CRS.

1. Crie o projeto Apps Script e adicione `Code.gs` e `Bridge.html`.
2. Implante como aplicativo da web, executando como proprietário e com acesso para qualquer pessoa. A ponte começa sem credenciais e só expõe o estado da conexão.
3. Cadastre a URL `/exec` desta implantação como redirecionamento do aplicativo da CRS no Portal Conta Azul. A URL deve coincidir exatamente com a usada na autorização.
4. Nas Propriedades do script **desse projeto**, configure `CA_CLIENT_ID`, `CA_CLIENT_SECRET`, `CA_REDIRECT_URI` e `FLUXO_ACCESS_KEY` próprios da CRS. Não copie tokens ou chaves do Bafo.
5. Abra `/exec?action=authorize` para autorizar a licença da CRS. Depois, confira a identidade da empresa antes de habilitar qualquer operação financeira.

Esta primeira versão só permite autorização, estado da conexão e leitura da empresa conectada. Escritas financeiras ficam fechadas até o fluxo de rateio da CRS estar implementado e revisado.

