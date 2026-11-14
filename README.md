# Cockpit CBS · demonstração

Demonstração do cockpit da **Apuração Assistida da CBS**: o que a Receita apurou (API v2 de
Apuração Assistida) e o que a empresa decidiu sobre isso.

**Dados fictícios · Velmark, empresa de demonstração.** Não há banco, login nem chamada à Receita:
as respostas da API são simuladas no navegador, no formato da documentação oficial
(`src/lib/cbs/demo/simulador.ts`), com fornecedores e clientes inventados (CNPJs conferidos como
inexistentes). Decisões e consultas feitas na tela ficam só na memória da aba.

O simulador reproduz as regras da API v2: consulta incremental, fluxo assíncrono (pedido → tíquete
→ situação → link temporário de 48 h com um download só → arquivo JSON), até 4 pedidos por dia por
serviço, janela de 8 dias, a primeira consulta começando no dia 1º do mês pela data de alteração e o
campo `ni` vindo com 14 dígitos. Tudo é relativo ao dia de hoje (`src/lib/cbs/demo/linha-do-tempo.ts`).

## Comandos

```bash
bun install
bun run build      # site estático em .output/public (entrada: _shell.html)
bun run test
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

## Publicar

O build é um site estático. Por padrão ele vai na **raiz** de um endereço (arquivos em `/assets/...`).
Para um subcaminho, informe o caminho no build: `CAMINHO_BASE=/cockpit-cbs/ bun run build` (o Vite e o
roteador passam a usar o mesmo prefixo). Qualquer servidor de arquivos serve, desde que devolva
`_shell.html` para as rotas da aplicação (`/periodo`, `/creditos`, `/saidas`, `/saude`). No Caddy, na raiz:

```
root * /caminho/para/.output/public
try_files {path} /_shell.html
file_server
```

Num subcaminho (é assim na VPS, em `/cockpit-cbs/`, pelo roteiro `27-cockpit-cbs.sh` do repositório
`agentes`):

```
redir /cockpit-cbs /cockpit-cbs/ 308
handle_path /cockpit-cbs/* {
	root * /caminho/para/.output/public
	try_files {path} /_shell.html
	file_server
}
```
