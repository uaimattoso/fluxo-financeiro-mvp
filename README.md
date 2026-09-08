# Fluxo — Assistente financeiro

MVP para leitura de prints de ordens de pagamento e geração de sugestões estruturadas.

## Regras atuais

- O menu de contexto seleciona a casa em gestão: Bafo da Prainha, Capiau, Dois de Fevereiro, Casa Porto ou Casa de Apoio CRS.
- A casa selecionada permanece salva neste navegador e acompanha a revisão do lançamento.
- Cada casa mantém sessão, catálogos, mapeamentos e controle de duplicidade próprios no servidor interno.
- A Casa de Apoio CRS está preparada como licença separada para o futuro espelhamento dos rateios em receitas e para a despesa total.
- Banda: novo lançamento, categoria Couvert Artístico.
- Gelo, Gás e Carvão: atualizar recorrência em aberto.
- A imagem é processada localmente no navegador.
- A primeira integração com o Conta Azul cria somente lançamentos de Banda, sempre após revisão.

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

## Conta Azul no ambiente interno

1. Copie `.env.example` para `.env.local` e preencha `CA_CLIENT_ID` e `CA_CLIENT_SECRET`.
2. Cadastre no aplicativo do Conta Azul o retorno `http://127.0.0.1:8787/auth/conta-azul/callback`.
3. Inicie também o servidor seguro com `pnpm api`.
4. Use **Conectar Conta Azul**, selecione os vínculos e revise antes de criar.

Credenciais, tokens, mapeamentos e protocolos ficam na pasta local `.data`, separados por casa; essa pasta não é enviada ao GitHub. Reenvios idênticos são bloqueados por casa.
