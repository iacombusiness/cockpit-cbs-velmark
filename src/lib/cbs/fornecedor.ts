import type { CadastroFornecedor } from "./api";
import { cnpjFmt } from "./formato";

/*
 * Exibição do cadastro público do fornecedor (tabela cbs_fornecedor). Puro e testável.
 * Os nomes vêm da Receita em maiúsculas e sem acento: são exibidos como vieram.
 */

export function nomeFornecedor(cnpj: string, cad: CadastroFornecedor | undefined): string {
  return cad?.razaoSocial ?? cnpjFmt(cnpj);
}

export function localFornecedor(cad: CadastroFornecedor | undefined): string | null {
  if (!cad?.municipio) return cad?.uf ?? null;
  return cad.uf ? `${cad.municipio}/${cad.uf}` : cad.municipio;
}

export interface SinalFornecedor {
  tom: "crit" | "warn" | "info" | "neutro";
  texto: string;
  dica: string;
}

/** Sinais que importam para o crédito: CNPJ não ativo, Simples/MEI, cadastro ainda não buscado. */
export function sinaisFornecedor(cad: CadastroFornecedor | undefined): SinalFornecedor[] {
  if (!cad || cad.status === "pendente" || cad.status === "erro") {
    return [
      {
        tom: "neutro",
        texto: "cadastro em busca",
        dica: "A integração busca o cadastro público deste CNPJ a cada 10 minutos.",
      },
    ];
  }
  if (cad.status === "nao_encontrado") {
    return [
      {
        tom: "warn",
        texto: "CNPJ não encontrado",
        dica: "A base pública da Receita não tem este CNPJ. Confira o emitente da nota.",
      },
    ];
  }
  const out: SinalFornecedor[] = [];
  if (cad.situacao && cad.situacao.toUpperCase() !== "ATIVA") {
    out.push({
      tom: "crit",
      texto: `CNPJ ${cad.situacao.toLowerCase()}`,
      dica: "Fornecedor com CNPJ fora da situação ativa: o débito dele, e portanto o seu crédito, pode não ser quitado.",
    });
  }
  if (cad.mei) {
    out.push({ tom: "info", texto: "MEI", dica: "Microempreendedor individual (SIMEI)." });
  } else if (cad.simples) {
    out.push({
      tom: "info",
      texto: "Simples Nacional",
      dica: "Optante pelo Simples Nacional: o crédito segue regras próprias do regime.",
    });
  }
  return out;
}
