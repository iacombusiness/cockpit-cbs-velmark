import { describe, expect, it } from "vitest";

import type { PainelSaude } from "./api";
import { descreverCron, estadoGeral, proximaExecucaoDiaria, resumoHttp, termoBusca } from "./saude";

const ingestao = (risco: PainelSaude["ingestao"][number]["risco_janela"]) => ({
  servico: "debitos",
  ultima_processada: "2026-11-11T09:10:04Z",
  dias_sem_carga: 0.5,
  risco_janela: risco,
  solicitacoes_hoje: 1,
  cota_restante_hoje: 3,
  em_andamento: 0,
  erros_7d: 0,
  alertas_criticos_abertos: 0,
});

const painel = (parcial: Partial<PainelSaude> = {}): PainelSaude => ({
  agora: "2026-11-11T20:30:00Z",
  config: { enabled: true, servicos: ["debitos", "creditos"] },
  ingestao: [ingestao("ok")],
  cron: [
    {
      job: "processar-arquivos",
      schedule: "*/15 * * * *",
      ativo: true,
      ultimo_status: "succeeded",
      ultima_execucao: "2026-11-11T20:30:00Z",
      execucoes_24h: 96,
      falhas_24h: 0,
    },
  ],
  http: [],
  ...parcial,
});

describe("conexão com a Receita", () => {
  it("descreve o cron no horário de Brasília", () => {
    expect(descreverCron("10 9 * * *")).toBe("todo dia às 06:10");
    expect(descreverCron("*/15 * * * *")).toBe("a cada 15 min");
    expect(descreverCron("0 0 1 * *")).toBe("0 0 1 * *");
  });

  it("calcula a próxima consulta diária", () => {
    expect(
      proximaExecucaoDiaria("10 9 * * *", new Date("2026-11-11T08:00:00Z"))?.toISOString(),
    ).toBe("2026-11-11T09:10:00.000Z");
    expect(
      proximaExecucaoDiaria("10 9 * * *", new Date("2026-11-11T20:30:00Z"))?.toISOString(),
    ).toBe("2026-11-12T09:10:00.000Z");
    expect(proximaExecucaoDiaria("*/15 * * * *", new Date())).toBeNull();
  });

  it("resume o estado geral do mais grave para o mais leve", () => {
    expect(estadoGeral(painel()).tom).toBe("good");
    expect(estadoGeral(painel({ config: { enabled: false, servicos: [] } })).selo).toBe(
      "Conexão desligada",
    );
    expect(estadoGeral(painel({ ingestao: [ingestao("critico")] })).tom).toBe("crit");
    expect(estadoGeral(painel({ ingestao: [ingestao("sem_carga")] })).tom).toBe("warn");
    const comFalha = painel();
    comFalha.cron[0] = { ...comFalha.cron[0]!, falhas_24h: 2 };
    expect(estadoGeral(comFalha).titulo).toBe("A conexão precisa de atenção");
  });

  it("resume as chamadas HTTP recentes e normaliza a busca", () => {
    const r = resumoHttp([
      { id: 2, status: 200, regiao: "sa-east-1", erro: null, em: "" },
      { id: 1, status: 500, regiao: "sa-east-1", erro: "x", em: "" },
    ]);
    expect(r).toEqual({ regiao: "São Paulo (sa-east-1)", ok: 1, total: 2 });
    expect(termoBusca(" 82.597.552/0001-93 ")).toBe("82597552000193");
    expect(termoBusca("NFS-e")).toBe("nfse");
  });
});
