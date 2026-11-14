import { describe, expect, it } from "vitest";

import { emitente } from "../modelo";
import { EMPRESA, FORNECEDORES } from "./parceiros";
import * as sim from "./simulador";

// Dados fictícios · Velmark, empresa de demonstração.
const semPausa = () => Promise.resolve();

describe("simulador da API de Apuração Assistida da CBS", () => {
  it("gera chaves com dígito verificador válido e emitentes da demonstração", async () => {
    const debitos = await sim.debitos();
    const creditos = await sim.creditos();
    expect(debitos.length).toBeGreaterThan(5);
    expect(creditos.length).toBeGreaterThan(5);
    for (const d of [...debitos, ...creditos]) {
      expect([44, 50]).toContain(d.chave.length);
      expect(sim.dvMod11(d.chave.slice(0, -1))).toBe(d.chave.slice(-1));
    }
    expect(new Set(debitos.map((d) => emitente(d.chave)))).toEqual(new Set([EMPRESA.cnpj]));
    const fornecedores = new Set(FORNECEDORES.map((f) => f.cnpj));
    for (const c of creditos) expect(fornecedores.has(emitente(c.chave))).toBe(true);
  });

  it("entrega arquivos no formato da API, um estado por documento e o ni com 14 dígitos", async () => {
    const arquivos = await sim.arquivos();
    expect(arquivos.length).toBeGreaterThanOrEqual(2);
    for (const a of arquivos) {
      const doc = JSON.parse(a.conteudo) as {
        tiqueteSolicitacao: string;
        ni: string;
        apuracao: { pa: string; debitos?: { chave: string }[]; creditos?: { chave: string }[] }[];
      };
      expect(doc.ni).toBe(EMPRESA.cnpj);
      expect(doc.ni).toHaveLength(14);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      const chaves = doc.apuracao.flatMap((p) => [...(p.debitos ?? []), ...(p.creditos ?? [])]);
      expect(new Set(chaves.map((c) => c.chave)).size).toBe(chaves.length);
      for (const p of doc.apuracao) expect(p.pa).toMatch(/^\d{2}\/\d{4}$/);
    }
  });

  it("consulta ao vivo: fluxo completo, consulta incremental e cota de 4 pedidos por dia", async () => {
    const antes = (await sim.saude()).ingestao.find((i) => i.servico === "debitos");
    const etapas: string[] = [];
    await sim.consultarAgora("debitos", (p) => etapas.push(p.etapa), semPausa);
    expect(etapas).toEqual([
      "solicitada",
      "em_processamento",
      "concluida",
      "baixada",
      "link_usado",
    ]);
    const depois = (await sim.saude()).ingestao.find((i) => i.servico === "debitos");
    expect(depois?.cota_restante_hoje).toBe((antes?.cota_restante_hoje ?? 0) - 1);

    let recusada = false;
    for (let i = 0; i < 5; i++) {
      await sim.consultarAgora(
        "debitos",
        (p) => {
          if (p.etapa === "recusada") recusada = true;
        },
        semPausa,
      );
    }
    expect(recusada).toBe(true);
    expect(
      (await sim.saude()).ingestao.find((i) => i.servico === "debitos")?.cota_restante_hoje,
    ).toBe(0);
  });
});
