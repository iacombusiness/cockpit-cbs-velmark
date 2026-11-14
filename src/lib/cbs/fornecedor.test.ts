import { describe, expect, it } from "vitest";

import type { CadastroFornecedor } from "./api";
// Fornecedor fictício da Velmark (empresa de demonstração).
import { localFornecedor, nomeFornecedor, sinaisFornecedor } from "./fornecedor";

const cad = (parcial: Partial<CadastroFornecedor>): CadastroFornecedor => ({
  cnpj: "82597552000193",
  razaoSocial: "ULMBORO PAPELAO ONDULADO S.A.",
  nomeFantasia: null,
  situacao: "ATIVA",
  uf: "SP",
  municipio: "LIMEIRA",
  cnae: null,
  porte: null,
  simples: false,
  mei: false,
  status: "ok",
  consultadoEm: "2026-11-12T12:00:00Z",
  ...parcial,
});

describe("cadastro do fornecedor", () => {
  it("usa a razão social e cai para o CNPJ formatado sem cadastro", () => {
    expect(nomeFornecedor("82597552000193", cad({}))).toBe("ULMBORO PAPELAO ONDULADO S.A.");
    expect(nomeFornecedor("82597552000193", undefined)).toBe("82.597.552/0001-93");
    expect(localFornecedor(cad({}))).toBe("LIMEIRA/SP");
    expect(localFornecedor(undefined)).toBeNull();
  });

  it("sinaliza CNPJ não ativo, Simples/MEI e cadastro pendente", () => {
    expect(sinaisFornecedor(cad({}))).toEqual([]);
    expect(sinaisFornecedor(cad({ situacao: "BAIXADA" })).map((s) => [s.tom, s.texto])).toEqual([
      ["crit", "CNPJ baixada"],
    ]);
    expect(sinaisFornecedor(cad({ simples: true })).map((s) => s.texto)).toEqual([
      "Simples Nacional",
    ]);
    expect(sinaisFornecedor(cad({ simples: true, mei: true })).map((s) => s.texto)).toEqual([
      "MEI",
    ]);
    expect(sinaisFornecedor(cad({ status: "pendente" }))[0]?.texto).toBe("cadastro em busca");
    expect(sinaisFornecedor(undefined)[0]?.tom).toBe("neutro");
    expect(sinaisFornecedor(cad({ status: "nao_encontrado" }))[0]?.tom).toBe("warn");
  });
});
