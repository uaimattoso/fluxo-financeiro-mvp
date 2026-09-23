# Importador de receitas Conta Azul

MVP separado da ponte do Grupo Bafo para importar XLS/XLSX/CSV como contas a receber.

## Fluxo

1. O usuário conecta a licença Conta Azul.
2. Seleciona um arquivo.
3. O navegador lê e mostra uma prévia com bruto, tarifa e líquido.
4. O usuário escolhe conta financeira e contato padrão.
5. O Apps Script cria os eventos de contas a receber.

A tarifa é normalizada para valor positivo e enviada dentro de `condicao_pagamento.parcelas[].detalhe_valor.taxa`; o líquido é calculado como bruto menos tarifa. O endpoint dedicado de baixa pode ser acoplado na próxima etapa quando o protocolo puder ser correlacionado à parcela criada.

## Configuração do Apps Script

Em Propriedades do script:

- `CA_CLIENT_ID`
- `CA_CLIENT_SECRET`
- `CA_REDIRECT_URI` com a URL `/exec` da implantação

O projeto deve ser implantado como aplicação web executada pelo usuário que está implantando, com acesso compatível com a política da conta.

## Observações

- Não grave tokens no código ou no GitHub.
- Faça primeiro um teste com uma única linha.
- A criação efetiva só ocorre depois da confirmação na interface.
