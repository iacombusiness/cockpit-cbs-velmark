import { linhaDoTempo } from "./demo/linha-do-tempo";
import { brl } from "./formato";
import { dias } from "./modelo";

/*
 * Checagem das notas de saída: as notas do ERP cruzadas com o que a Receita apurou. Na
 * demonstração, as notas do ERP da Velmark (fictícias) já vêm carregadas pela integração.
 * Puro e testável.
 */

/**
 * A primeira consulta à Receita só trouxe o que mudou desde esta data (base parcial). Na
 * demonstração, é o dia 1º do mês da primeira consulta (ver demo/linha-do-tempo.ts).
 */
export const INICIO_BASE_RECEITA = linhaDoTempo().inicioBase;

export interface NotaErp {
  modelo: string;
  serie: string;
  numero: number;
  emissao: string | null; // AAAA-MM-DD
  competencia: string | null;
  digitacao: string | null;
  clienteCodigo: string | null;
  clienteNome: string | null;
  /** Só CNPJ (pessoa jurídica). CPF de pessoa física não é guardado. */
  clienteCnpj: string | null;
  uf: string | null;
  pais: string | null;
  paisNome: string | null;
  cidade: string | null;
  natureza: string | null;
  naturezaDescricao: string | null;
  valorTotal: number;
  baseCbs: number;
  valorCbs: number;
  valorIbs: number;
  /** ISS destacado na nota; null quando a fonte não traz. */
  valorIss: number | null;
  cancelada: boolean;
  substituida: boolean;
  numeroRetorno: string | null;
}

/* ------------------------------------------------------------------ checagens */

export interface NotaSaida extends NotaErp {
  chave: string | null;
  paReceita: string | null;
  apuradoReceita: number | null;
  importadoEm: string;
  /** "erp": veio sozinha pela integração com o ERP; "planilha": importação manual. */
  origem: "planilha" | "erp";
}

export type TomChecagem = "crit" | "warn" | "info";

export interface Checagem {
  codigo: string;
  tom: TomChecagem;
  titulo: string;
  texto: string;
}

export const ehExterior = (n: Pick<NotaErp, "uf" | "pais">): boolean =>
  n.uf === "EX" || (n.pais !== null && !["BRA", "BR", "105", "1058"].includes(n.pais));

const PESO: Record<TomChecagem, number> = { crit: 0, warn: 1, info: 2 };

export function checarNota(n: NotaSaida, hoje: string): Checagem[] {
  const out: Checagem[] = [];
  const exterior = ehExterior(n);
  const apurado = n.apuradoReceita ?? 0;
  const idade = n.emissao ? dias(n.emissao, hoje) : 0;
  const destino = n.paisNome ?? n.pais ?? "o exterior";

  if (exterior && !n.cancelada && apurado > 0) {
    out.push({
      codigo: "exterior_cbs_receita",
      tom: "crit",
      titulo: "Exportação com CBS na Receita",
      texto: `A Receita apurou ${brl(apurado)} sobre uma nota para ${destino}. Exportação é imune (LC 214, arts. 79 e 80): confira o CST (410) e o cClassTrib da nota.`,
    });
  }
  if (exterior && !n.cancelada && n.valorCbs > 0) {
    out.push({
      codigo: "exterior_cbs_erp",
      tom: "crit",
      titulo: "CBS destacada numa exportação",
      texto: `O ERP destacou ${brl(n.valorCbs)} de CBS numa nota para ${destino}. Corrija a classificação antes de transmitir as próximas.`,
    });
  }
  if (n.cancelada && apurado > 0) {
    out.push({
      codigo: "cancelada_com_debito",
      tom: "crit",
      titulo: "Cancelada com débito",
      texto: `Nota cancelada no ERP, mas a Receita mantém ${brl(apurado)} de CBS. Confira se o cancelamento foi transmitido.`,
    });
  }
  if (
    !exterior &&
    !n.cancelada &&
    n.valorCbs > 0 &&
    n.apuradoReceita !== null &&
    Math.abs(apurado - n.valorCbs) > Math.max(1, n.valorCbs * 0.01)
  ) {
    out.push({
      codigo: "divergencia",
      tom: "warn",
      titulo: "ERP e Receita divergem",
      texto: `CBS no ERP ${brl(n.valorCbs)}, na Receita ${brl(apurado)}.`,
    });
  }
  if (n.modelo.toUpperCase().includes("NFS") && !n.cancelada && !n.numeroRetorno && idade >= 2) {
    out.push({
      codigo: "sem_retorno",
      tom: "warn",
      titulo: "Sem número de retorno",
      texto:
        "NFS-e sem número de retorno no ERP: o retorno do emissor nacional não foi registrado. Confira se a nota foi autorizada e com qual classificação.",
    });
  }
  // Com o valor do ISS, vale o valor; sem ele, o texto da natureza de operação.
  const issDestacado = (n.valorIss ?? 0) > 0;
  if (
    n.modelo.toUpperCase().includes("NFS") &&
    exterior &&
    !n.cancelada &&
    (issDestacado || (n.valorIss === null && /tributad/i.test(n.naturezaDescricao ?? "")))
  ) {
    out.push({
      codigo: "iss_exportacao",
      tom: "warn",
      titulo: "Exportação com ISS",
      texto: issDestacado
        ? `ISS de ${brl(n.valorIss ?? 0)} destacado numa exportação para ${destino}. Se o resultado do serviço se verifica no exterior, o ISS não incide (LC 116/2003, art. 2º, I). Leve ao parecer.`
        : "A natureza de operação diz “tributado pelo ISSQN”. Se o resultado do serviço se verifica no exterior, o ISS também pode não incidir (LC 116/2003, art. 2º, I). Leve ao parecer.",
    });
  }
  if (
    !exterior &&
    !n.cancelada &&
    n.valorCbs > 0 &&
    n.chave === null &&
    (n.emissao ?? "") >= INICIO_BASE_RECEITA &&
    idade >= 5
  ) {
    out.push({
      codigo: "receita_nao_apurou",
      tom: "warn",
      titulo: "Receita não apurou",
      texto: `Venda no Brasil com CBS: ${idade} dias depois da emissão, a nota não aparece nos débitos da Receita. Confira a transmissão e o CST.`,
    });
  }
  return out.sort((a, b) => PESO[a.tom] - PESO[b.tom]);
}

/** Situação da nota do lado da Receita, para a coluna da tabela. */
export function situacaoReceita(n: NotaSaida): string {
  if (n.apuradoReceita !== null) return brl(n.apuradoReceita);
  if (n.cancelada) return "—";
  if ((n.emissao ?? "") < INICIO_BASE_RECEITA) return "fora da base";
  return ehExterior(n) ? "sem débito" : "ainda não apareceu";
}
