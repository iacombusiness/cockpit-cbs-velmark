import { describe, expect, it } from "vitest";

import { somarDias } from "./demo/linha-do-tempo";
import { CLIENTES } from "./demo/parceiros";
import {
  checarNota,
  INICIO_BASE_RECEITA,
  situacaoReceita,
  type NotaErp,
  type NotaSaida,
} from "./saidas";

// Dados fictícios · Velmark, empresa de demonstração. Datas relativas ao início da base da Receita.
const EMISSAO = somarDias(INICIO_BASE_RECEITA, 2);
const HOJE = somarDias(INICIO_BASE_RECEITA, 11);
const cliente = CLIENTES[0];

const nota = (parcial: Partial<NotaErp>): NotaErp => ({
  modelo: "NF-e",
  serie: "1",
  numero: 18_301,
  emissao: EMISSAO,
  competencia: EMISSAO,
  digitacao: EMISSAO,
  clienteCodigo: cliente?.codigo ?? null,
  clienteNome: cliente?.razao ?? null,
  clienteCnpj: cliente?.cnpj ?? null,
  uf: "SP",
  pais: "BRA",
  paisNome: "Brasil",
  cidade: cliente?.cidade ?? null,
  natureza: "5.102",
  naturezaDescricao: "Venda de mercadoria adquirida de terceiros",
  valorTotal: 20_000,
  baseCbs: 20_000,
  valorCbs: 180,
  valorIbs: 20,
  valorIss: null,
  cancelada: false,
  substituida: false,
  numeroRetorno: null,
  ...parcial,
});

const comReceita = (n: NotaErp, apurado: number | null): NotaSaida => ({
  ...n,
  chave: apurado === null ? null : "x".repeat(44),
  paReceita: apurado === null ? null : INICIO_BASE_RECEITA.slice(0, 7),
  apuradoReceita: apurado,
  importadoEm: `${HOJE}T12:00:00Z`,
  origem: "erp",
});

// Serviço para um cliente no exterior (nome inventado), para as regras de exportação.
const exportacao = nota({
  modelo: "NFS-e",
  numero: 412,
  clienteNome: "Lumbre Packaging S.L. (fictício)",
  clienteCnpj: null,
  uf: "EX",
  pais: "ESP",
  paisNome: "Espanha",
  cidade: "Valência",
  natureza: "S.002",
  naturezaDescricao: "Arte de embalagem para cliente no exterior",
  valorCbs: 0,
  valorIss: null,
});

describe("checagens das notas de saída", () => {
  it("exportação com CBS destacada no ERP e sem retorno da NFS-e", () => {
    const c = checarNota(comReceita({ ...exportacao, valorCbs: 90 }, null), HOJE);
    expect(c.map((x) => [x.tom, x.codigo])).toEqual([
      ["crit", "exterior_cbs_erp"],
      ["warn", "sem_retorno"],
    ]);
    expect(situacaoReceita(comReceita(exportacao, null))).toBe("sem débito");
  });

  it("exportação que a Receita tributou", () => {
    const c = checarNota(comReceita({ ...exportacao, numeroRetorno: "1" }, 90), HOJE);
    expect(c[0]?.codigo).toBe("exterior_cbs_receita");
  });

  it("ISS na exportação: pelo valor quando a fonte traz, pela natureza quando não traz", () => {
    const comNatureza = {
      ...exportacao,
      numeroRetorno: "1",
      naturezaDescricao: "Serviço tributado pelo ISSQN",
    };
    expect(checarNota(comReceita(comNatureza, null), HOJE).map((x) => x.codigo)).toContain(
      "iss_exportacao",
    );
    const semIss = { ...comNatureza, valorIss: 0 };
    expect(checarNota(comReceita(semIss, null), HOJE).map((x) => x.codigo)).not.toContain(
      "iss_exportacao",
    );
    const comIss = { ...exportacao, numeroRetorno: "1", valorIss: 1900.7 };
    const iss = checarNota(comReceita(comIss, null), HOJE).find(
      (x) => x.codigo === "iss_exportacao",
    );
    expect(iss?.texto).toMatch(/R\$\s1\.900,70/);
  });

  it("venda no Brasil: bate, diverge ou não apareceu", () => {
    const venda = nota({});
    expect(checarNota(comReceita(venda, 180), HOJE)).toEqual([]);
    expect(checarNota(comReceita(venda, 200), HOJE).map((x) => x.codigo)).toEqual(["divergencia"]);
    expect(checarNota(comReceita(venda, null), HOJE).map((x) => x.codigo)).toEqual([
      "receita_nao_apurou",
    ]);
    expect(checarNota(comReceita(venda, null), somarDias(EMISSAO, 3))).toEqual([]);
  });

  it("cancelada no ERP com débito na Receita", () => {
    const cancelada = nota({ cancelada: true });
    expect(checarNota(comReceita(cancelada, 9), HOJE).map((x) => x.codigo)).toEqual([
      "cancelada_com_debito",
    ]);
    expect(checarNota(comReceita(cancelada, null), HOJE)).toEqual([]);
  });

  it("nota emitida antes do início da base aparece como fora da base", () => {
    const antiga = nota({ emissao: somarDias(INICIO_BASE_RECEITA, -10) });
    expect(situacaoReceita(comReceita(antiga, null))).toBe("fora da base");
  });
});
