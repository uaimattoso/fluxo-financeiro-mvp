# Fluxo — Assistente financeiro

MVP para leitura de prints de ordens de pagamento e geração de sugestões estruturadas.

## Regras atuais

- O menu de contexto seleciona a casa em gestão: Bafo da Prainha, Capiau, Dois de Fevereiro, Casa Porto ou Casa de Apoio CRS.
- A casa selecionada permanece salva neste navegador e acompanha a revisão do lançamento.
- Cada casa mantém sessão, catálogos, mapeamentos e controle de duplicidade próprios no servidor interno.
- A Casa de Apoio CRS está preparada como licença separada para o futuro espelhamento dos rateios em receitas e para a despesa total.
- Boletos de despesas rateadas da CRS geram uma revisão com quatro receitas, usando cada restaurante como cliente, e uma despesa com o beneficiário como fornecedor. A confirmação fica bloqueada até as quatro receitas somarem exatamente o valor da despesa.
- O rateio da CRS é fixo: Bafo da Prainha 42%, Casa Porto 20%, Capiau 26% e Dois de Fevereiro 12%.
- Banda: novo lançamento, categoria Couvert Artístico.
- Gelo, Gás e Carvão: atualizar recorrência em aberto.
- A imagem é processada localmente no navegador.
- A primeira integração com o Conta Azul cria somente lançamentos de Banda, sempre após revisão.

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

## Conta Azul no site publicado — Bafo da Prainha

O site usa a implantação do Google Apps Script indicada em `src/App.tsx`. Atualizar o GitHub Pages **não** atualiza o Apps Script. No projeto Apps Script dessa implantação:

1. Substitua `Code.gs` e adicione o arquivo HTML `Bridge.html` da pasta `conta-azul-apps-script`.
2. Nas Propriedades do script, configure `CA_CLIENT_ID`, `CA_CLIENT_SECRET` e `CA_REDIRECT_URI` (a URL `/exec` da própria implantação). Mantenha os tokens existentes; a conexão já autorizada pode ser reutilizada.
3. Crie `FLUXO_ACCESS_KEY` com um valor aleatório longo e privado, gerado em um gerenciador de senhas. Esta chave protege consulta de cadastros, mapeamentos e criação de lançamentos. Não a coloque no GitHub, na URL nem no código da interface.
4. Implante uma **nova versão da implantação existente**, preservando a mesma URL `/exec`. Se a URL mudar, atualize `BRIDGE` em `src/App.tsx` e o retorno cadastrado no Portal Conta Azul.
5. Abra o site, selecione Bafo da Prainha, confira a empresa retornada pelo Conta Azul, informe a chave de acesso e confirme antes de criar.

As outras quatro casas ficam sem conexão nesta etapa. A ponte antiga aceitava lançamentos sem autenticar o solicitante; a nova versão fecha as rotas públicas de consulta e escrita. O site não grava a chave de acesso no armazenamento do navegador.

## Servidor local legado

`pnpm api` mantém o servidor local separado para desenvolvimento, com dados em `.data`. O site publicado não usa esse servidor.

