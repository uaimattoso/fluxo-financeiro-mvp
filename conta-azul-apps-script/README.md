# Ponte Fluxo + Conta Azul

Projeto Google Apps Script exclusivo do Fluxo. Não compartilha implantação, propriedades, credenciais ou tokens com o SalesTrack.

1. Crie um novo projeto em `script.google.com`.
2. Cole `Code.gs` e habilite a exibição do manifesto para usar `appsscript.json`.
3. Implante como aplicativo da web, executando como você e com acesso para qualquer pessoa. As operações financeiras exigem `FLUXO_ACCESS_KEY`.
4. Copie a URL terminada em `/exec` e cadastre-a como URL de redirecionamento no aplicativo Fluxo do Portal Conta Azul.
5. Nas Propriedades do script, crie `CA_CLIENT_ID`, `CA_CLIENT_SECRET`, `CA_REDIRECT_URI` e uma chave aleatória longa `FLUXO_ACCESS_KEY`.
6. Nunca coloque credenciais no GitHub ou no código da interface.

