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

O build é um site estático para a **raiz** de um endereço (os arquivos usam caminhos `/assets/...`).
Qualquer servidor de arquivos serve, desde que devolva `_shell.html` para as rotas da aplicação
(`/periodo`, `/creditos`, `/saidas`, `/saude`). No Caddy:

```
root * /caminho/para/.output/public
try_files {path} /_shell.html
file_server
```
