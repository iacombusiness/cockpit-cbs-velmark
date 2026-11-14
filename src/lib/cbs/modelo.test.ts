import { describe, expect, it } from "vitest";

// Chaves de acesso fictícias (Velmark e fornecedores de demonstração), com dígito verificador válido.

import { lerValorBR } from "./formato";

import {
  agingAApropriar,
  dias,
  emitente,
  fornecedoresAApropriar,
  itemComoRFB,
  numeroDoc,
  paPadrao,
  partesChave,
  pendenciasDoPA,
  prazosDoPA,
  ultimoDiaUtil,
  type Credito,
  type Debito,
} from "./modelo";

const NFSE_412 = "35498051283186149000134000000000041226111053473869";
const NFE_51311 = "35261070969643000123550010000513111348370922";

function credito(parcial: Partial<Credito> & { chave: string }): Credito {
  return {
    lado: "credito",
    pa: "2026-11",
    documento: 55,
    emissao: "2026-11-03",
    registro: "2026-11-03",
    atualizacao: "2026-11-03T10:00:00Z",
    apurado: 0,
    aApropriar: 0,
    apropriado: 0,
    utilizado: 0,
    saldoCredor: 0,
    pedidoRessarcimento: 0,
    arquivoId: 2,
    ingeridoEm: "",
    atualizadoEm: "",
    ...parcial,
  };
}

describe("chave de acesso", () => {
  it("lê CNPJ e número da NFS-e Nacional (50 dígitos)", () => {
    expect(emitente(NFSE_412)).toBe("83186149000134");
    expect(numeroDoc(NFSE_412)).toBe(412);
    const partes = partesChave(NFSE_412);
    expect(partes.find((p) => p.rotulo === "Município")?.legivel).toBe("São José do Rio Preto/SP");
    expect(partes.map((p) => p.bruto).join("")).toBe(NFSE_412);
  });

  it("lê CNPJ, modelo e número da NF-e (44 dígitos)", () => {
    expect(emitente(NFE_51311)).toBe("70969643000123");
    expect(numeroDoc(NFE_51311)).toBe(51311);
    const partes = partesChave(NFE_51311);
    expect(partes.find((p) => p.rotulo === "Modelo")?.legivel).toBe("NF-e");
    expect(partes.find((p) => p.rotulo === "UF")?.legivel).toBe("SP");
    expect(partes.map((p) => p.bruto).join("")).toBe(NFE_51311);
  });
});

describe("prazos do PA", () => {
  it("2026 é ano-teste; ajuste até o último dia útil do mês seguinte", () => {
    expect(prazosDoPA("2026-10")).toEqual({
      disponivelAte: "2026-11-15",
      prazoAjuste: "2026-11-30",
      modo: "ano_teste",
    });
    expect(prazosDoPA("2026-12").prazoAjuste).toBe("2027-01-29");
  });

  it("o primeiro prazo real é 26/02/2027 (PA 01/2027)", () => {
    expect(prazosDoPA("2027-01")).toEqual({
      disponivelAte: "2027-02-15",
      prazoAjuste: "2027-02-26",
      modo: "definitivo",
    });
  });

  it("último dia útil pula fim de semana", () => {
    expect(ultimoDiaUtil(2026, 5)).toBe("2026-05-29"); // 31/05/2026 é domingo
    expect(dias("2026-01-22", "2026-11-10")).toBe(292);
  });
});

describe("crédito a apropriar", () => {
  const creditos = [
    credito({
      chave: "35261182597552000193550010000018541188000022",
      apurado: 243.81,
      aApropriar: 243.81,
    }),
    credito({
      chave: "35260182597552000193550010000013401131702910",
      pa: "2026-01",
      registro: "2026-01-22",
      apurado: 391.23,
      aApropriar: 216.92,
      apropriado: 174.31,
      utilizado: 174.31,
    }),
    credito({
      chave: "41261171096259000126550010002853361152853362",
      apurado: 313.65,
      aApropriar: 313.65,
    }),
    credito({
      chave: "31260170911337000136550010007908901142804862",
      apurado: 0.85,
      apropriado: 0.85,
      utilizado: 0.85,
    }),
  ];

  it("agrupa por CNPJ do emitente, ordena e fecha 100% no acumulado", () => {
    const f = fornecedoresAApropriar(creditos, "2026-11-10");
    expect(f.map((x) => x.cnpj)).toEqual(["82597552000193", "71096259000126"]);
    expect(f[0]?.aApropriar).toBe(460.73);
    expect(f[0]?.diasMaisAntigo).toBe(292);
    expect(f.at(-1)?.acumulado).toBeCloseTo(100, 6);
  });

  it("separa o crédito parado por faixa de dias", () => {
    const a = agingAApropriar(creditos, "2026-11-10");
    expect(a.map((x) => x.notas)).toEqual([2, 0, 0, 1]);
    expect(a[3]?.valor).toBe(216.92);
  });
});

describe("JSON como a Receita entrega", () => {
  it("omite campos de valor zerados, mas mantém apurado e saldo", () => {
    const d: Debito = {
      lado: "debito",
      chave: NFE_51311,
      pa: "2026-10",
      documento: 55,
      emissao: "2026-10-09",
      registro: "2026-10-09",
      atualizacao: "2026-11-07",
      apurado: 1036.15,
      excedente: 0,
      inexigivel: 0,
      suspenso: 0,
      pgtoAntecipado: 0,
      extinto: 0,
      saldo: 1036.15,
      arquivoId: 1,
      ingeridoEm: "",
      atualizadoEm: "",
    };
    expect(itemComoRFB(d)).toEqual({
      pa: "10/2026",
      debitos: [
        {
          origem: 0,
          documento: 55,
          chave: NFE_51311,
          emissao: "2026-10-09",
          registro: "2026-10-09",
          atualizacao: "2026-11-07",
          cbs: { apurado: 1036.15, saldoDevedor: 1036.15 },
        },
      ],
    });
  });
});

describe("cockpit do período", () => {
  const debito = (parcial: Partial<Debito> & { chave: string }): Debito => ({
    lado: "debito",
    pa: "2026-10",
    documento: 91,
    emissao: "2026-10-05",
    registro: "2026-10-05",
    atualizacao: "2026-11-03T10:00:00Z",
    apurado: 0,
    excedente: 0,
    inexigivel: 0,
    suspenso: 0,
    pgtoAntecipado: 0,
    extinto: 0,
    saldo: 0,
    arquivoId: 1,
    ingeridoEm: "",
    atualizadoEm: "",
    ...parcial,
  });

  it("abre no período mais urgente com prazo ainda aberto", () => {
    const prazo = (pa: string) => prazosDoPA(pa).prazoAjuste;
    expect(paPadrao(["2026-09", "2026-11", "2026-10"], prazo, "2026-11-11")).toBe("2026-10");
    expect(paPadrao(["2026-09"], prazo, "2026-11-11")).toBe("2026-09");
    expect(paPadrao([], prazo, "2026-11-11")).toBe("2026-11");
  });

  it("aponta exportação tributada primeiro e crédito parado depois", () => {
    const deb = [debito({ chave: NFSE_412, apurado: 8023.69, saldo: 8023.69 })];
    const cred = [
      credito({ chave: NFE_51311, pa: "2026-10", registro: "2026-08-01", aApropriar: 150.5 }),
    ];
    const p = pendenciasDoPA("2026-10", deb, cred, new Set([NFSE_412]), 0, "2026-11-11");
    expect(p.map((x) => x.tom)).toEqual(["crit", "warn", "info"]);
    expect(p[0]?.texto).toContain("8.023,69");
    expect(p[1]?.acao).toEqual({ tipo: "nota", chave: NFE_51311 });
    expect(p[2]?.titulo).toBe("Nenhuma decisão registrada");
  });

  it("período sem dados avisa da base parcial e não cobra decisão", () => {
    const p = pendenciasDoPA("2026-02", [], [], new Set(), 0, "2026-11-11");
    expect(p).toHaveLength(1);
    expect(p[0]?.titulo).toBe("Nenhuma alteração da Receita para este período");
  });
});

describe("valor digitado", () => {
  it("lê o padrão brasileiro e recusa o que não é valor", () => {
    expect(lerValorBR("-8.023,69")).toBe(-8023.69);
    expect(lerValorBR("8023,69")).toBe(8023.69);
    expect(lerValorBR("R$ 1.000")).toBe(1000);
    expect(lerValorBR("−12,5")).toBe(-12.5);
    expect(lerValorBR("1.00")).toBeNull();
    expect(lerValorBR("abc")).toBeNull();
    expect(lerValorBR("")).toBeNull();
  });
});
