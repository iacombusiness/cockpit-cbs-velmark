import { linhaDoTempo } from "./demo/linha-do-tempo";

/*
 * Modelo do cockpit CBS: tipos e regras puras (sem acesso a banco).
 *
 * Fonte dos campos: Apuração Assistida da CBS (APIs v2 da Receita). Na demonstração, os itens
 * vêm do simulador, no mesmo formato. Valores opcionais que a Receita omite quando zero chegam
 * como 0.
 */

export type Lado = "debito" | "credito";

export interface Debito {
  lado: "debito";
  chave: string;
  pa: string; // "2026-10"
  documento: number;
  emissao: string | null;
  registro: string | null;
  atualizacao: string;
  apurado: number;
  excedente: number;
  inexigivel: number;
  suspenso: number;
  pgtoAntecipado: number;
  extinto: number;
  saldo: number;
  arquivoId: number;
  ingeridoEm: string;
  atualizadoEm: string;
}

export interface Credito {
  lado: "credito";
  chave: string;
  pa: string;
  documento: number;
  emissao: string | null;
  registro: string | null;
  atualizacao: string;
  apurado: number;
  aApropriar: number;
  apropriado: number;
  utilizado: number;
  saldoCredor: number;
  pedidoRessarcimento: number;
  arquivoId: number;
  ingeridoEm: string;
  atualizadoEm: string;
}

export type Documento = Debito | Credito;

/** Raiz do CNPJ da empresa (8 dígitos), para reconhecer notas emitidas por ela mesma (Velmark, fictícia). */
export const CNPJ_RAIZ_EMPRESA = "83186149";

export const TIPO_DOC: Readonly<Record<number, string>> = {
  55: "NF-e",
  57: "CT-e",
  62: "NFCom",
  63: "BP-e",
  65: "NFC-e",
  66: "NF3-e",
  67: "CT-e OS",
  91: "NFS-e",
};

export const nomeDoc = (documento: number): string => TIPO_DOC[documento] ?? `Doc. ${documento}`;

const UF: Readonly<Record<string, string>> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

const MUNICIPIO: Readonly<Record<string, string>> = {
  "3549805": "São José do Rio Preto/SP",
  "3509502": "Campinas/SP",
};

/** CNPJ do emitente embutido na chave (44 dígitos: posições 7–20; NFS-e de 50 dígitos: 10–23). */
export function emitente(chave: string): string {
  if (chave.length === 44) return chave.slice(6, 20);
  if (chave.length === 50) return chave.slice(9, 23);
  return "";
}

/** Número do documento embutido na chave. */
export function numeroDoc(chave: string): number {
  if (chave.length === 44) return Number(chave.slice(25, 34));
  if (chave.length === 50) return Number(chave.slice(23, 36));
  return 0;
}

export const descDoc = (d: { documento: number; chave: string }): string =>
  `${nomeDoc(d.documento)} ${numeroDoc(d.chave).toLocaleString("pt-BR")}`;

/** Descrição a partir só da chave (modelo embutido na de 44 dígitos; 50 dígitos é NFS-e). */
export const descChave = (chave: string): string =>
  descDoc({ documento: chave.length === 50 ? 91 : Number(chave.slice(20, 22)), chave });

export const emitidaPelaEmpresa = (chave: string): boolean =>
  emitente(chave).startsWith(CNPJ_RAIZ_EMPRESA);

export interface ParteChave {
  rotulo: string;
  bruto: string;
  legivel: string;
  destaque: boolean;
}

/** Decompõe a chave de acesso nos campos do leiaute (NF-e/CT-e de 44, NFS-e Nacional de 50). */
export function partesChave(chave: string): ParteChave[] {
  const p = (
    rotulo: string,
    ini: number,
    fim: number,
    legivel?: (s: string) => string,
    destaque = false,
  ): ParteChave => {
    const bruto = chave.slice(ini, fim);
    return { rotulo, bruto, legivel: legivel ? legivel(bruto) : bruto, destaque };
  };
  const cnpj = (s: string) => s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const aamm = (s: string) => `${s.slice(2, 4)}/20${s.slice(0, 2)}`;
  if (chave.length === 44) {
    return [
      p("UF", 0, 2, (s) => UF[s] ?? s),
      p("Ano e mês", 2, 6, aamm),
      p("CNPJ do emitente", 6, 20, cnpj, true),
      p("Modelo", 20, 22, (s) => TIPO_DOC[Number(s)] ?? s),
      p("Série", 22, 25, (s) => String(Number(s))),
      p("Número", 25, 34, (s) => Number(s).toLocaleString("pt-BR"), true),
      p("Tipo de emissão", 34, 35, (s) => (s === "1" ? "normal" : s)),
      p("Código numérico", 35, 43),
      p("Dígito", 43, 44),
    ];
  }
  if (chave.length === 50) {
    return [
      p("Município", 0, 7, (s) => MUNICIPIO[s] ?? `IBGE ${s} (${UF[s.slice(0, 2)] ?? "?"})`),
      p("Ambiente", 7, 8),
      p("Tipo de inscrição", 8, 9, (s) => (s === "2" ? "CNPJ" : "CPF")),
      p("CNPJ do emitente", 9, 23, cnpj, true),
      p("Número da NFS-e", 23, 36, (s) => Number(s).toLocaleString("pt-BR"), true),
      p("Ano e mês", 36, 40, aamm),
      p("Código numérico", 40, 49),
      p("Dígito", 49, 50),
    ];
  }
  return [{ rotulo: "Chave", bruto: chave, legivel: chave, destaque: false }];
}

/* ------------------------------------------------------------------ datas e prazos */

const pad = (n: number) => String(n).padStart(2, "0");

/** Hoje no horário de Brasília, "AAAA-MM-DD". */
export function hojeSP(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return partes;
}

/** Dias corridos entre duas datas "AAAA-MM-DD" (b - a). */
export function dias(a: string, b: string): number {
  const [ay = 0, am = 1, ad = 1] = a.slice(0, 10).split("-").map(Number);
  const [by = 0, bm = 1, bd = 1] = b.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}

/** Último dia de segunda a sexta do mês (não considera feriados). */
export function ultimoDiaUtil(ano: number, mes: number): string {
  const d = new Date(Date.UTC(ano, mes, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export type ModoPA = "ano_teste" | "definitivo";

/**
 * Prazos do PA (LC 214/2025, art. 45; Decreto 12.955/2026, art. 46): a Receita apresenta a
 * apuração até o dia 15 do mês seguinte (dia 20 para quem entrega a DeRE); ajustes até o último
 * dia útil do mês seguinte (§ 3º). Confirmar ou ajustar é confissão de
 * dívida (§ 6º); sem manifestação no prazo, presume-se correto o saldo (§ 7º). Em 2026 a apuração
 * é meramente informativa, desde que as obrigações acessórias estejam cumpridas.
 */
export function prazosDoPA(pa: string): {
  disponivelAte: string;
  prazoAjuste: string;
  modo: ModoPA;
} {
  const ano = Number(pa.slice(0, 4));
  const mes = Number(pa.slice(5, 7));
  const ny = mes === 12 ? ano + 1 : ano;
  const nm = mes === 12 ? 1 : mes + 1;
  return {
    disponivelAte: `${ny}-${pad(nm)}-15`,
    prazoAjuste: ultimoDiaUtil(ny, nm),
    modo: ano < 2027 ? "ano_teste" : "definitivo",
  };
}

export const mesesDoAno = (ano: number): string[] =>
  Array.from({ length: 12 }, (_, i) => `${ano}-${pad(i + 1)}`);

/* ------------------------------------------------------------------ agregados */

const soma = <T>(itens: readonly T[], f: (x: T) => number): number =>
  Math.round(itens.reduce((a, x) => a + f(x), 0) * 100) / 100;

export interface ResumoPA {
  pa: string;
  nDebitos: number;
  nCreditos: number;
  debitoApurado: number;
  debitoExtinto: number;
  saldoDevedor: number;
  debitoNfe: number;
  debitoNfse: number;
  creditoApurado: number;
  aApropriar: number;
  apropriado: number;
  utilizado: number;
  saldoCredor: number;
}

export function resumoPA(
  debitos: readonly Debito[],
  creditos: readonly Credito[],
  pa: string,
): ResumoPA {
  const d = debitos.filter((x) => x.pa === pa);
  const c = creditos.filter((x) => x.pa === pa);
  return {
    pa,
    nDebitos: d.length,
    nCreditos: c.length,
    debitoApurado: soma(d, (x) => x.apurado),
    debitoExtinto: soma(d, (x) => x.extinto),
    saldoDevedor: soma(d, (x) => x.saldo),
    debitoNfe: soma(
      d.filter((x) => x.documento !== 91),
      (x) => x.apurado,
    ),
    debitoNfse: soma(
      d.filter((x) => x.documento === 91),
      (x) => x.apurado,
    ),
    creditoApurado: soma(c, (x) => x.apurado),
    aApropriar: soma(c, (x) => x.aApropriar),
    apropriado: soma(c, (x) => x.apropriado),
    utilizado: soma(c, (x) => x.utilizado),
    saldoCredor: soma(c, (x) => x.saldoCredor),
  };
}

export interface Fornecedor {
  cnpj: string;
  notas: Credito[];
  apurado: number;
  aApropriar: number;
  diasMaisAntigo: number;
  pct: number;
  acumulado: number;
}

/** Fornecedores com crédito a apropriar, do maior para o menor (Pareto). */
export function fornecedoresAApropriar(creditos: readonly Credito[], hoje: string): Fornecedor[] {
  const mapa = new Map<string, Fornecedor>();
  for (const c of creditos) {
    if (c.aApropriar <= 0) continue;
    const cnpj = emitente(c.chave);
    const f = mapa.get(cnpj) ?? {
      cnpj,
      notas: [],
      apurado: 0,
      aApropriar: 0,
      diasMaisAntigo: 0,
      pct: 0,
      acumulado: 0,
    };
    f.notas.push(c);
    f.apurado += c.apurado;
    f.aApropriar += c.aApropriar;
    if (c.registro) f.diasMaisAntigo = Math.max(f.diasMaisAntigo, dias(c.registro, hoje));
    mapa.set(cnpj, f);
  }
  const lista = [...mapa.values()].sort(
    (a, b) => b.aApropriar - a.aApropriar || a.cnpj.localeCompare(b.cnpj),
  );
  const total = lista.reduce((a, f) => a + f.aApropriar, 0);
  let acc = 0;
  for (const f of lista) {
    f.apurado = Math.round(f.apurado * 100) / 100;
    f.aApropriar = Math.round(f.aApropriar * 100) / 100;
    acc += f.aApropriar;
    f.pct = total ? (f.aApropriar / total) * 100 : 0;
    f.acumulado = total ? (acc / total) * 100 : 0;
  }
  return lista;
}

export interface FaixaAging {
  nome: string;
  notas: number;
  valor: number;
}

/** Crédito a apropriar por tempo desde o registro na Receita. */
export function agingAApropriar(creditos: readonly Credito[], hoje: string): FaixaAging[] {
  const faixas: [string, number, number][] = [
    ["0–30 dias", 0, 30],
    ["31–60 dias", 31, 60],
    ["61–90 dias", 61, 90],
    ["mais de 90", 91, Number.POSITIVE_INFINITY],
  ];
  return faixas.map(([nome, a, b]) => {
    const itens = creditos.filter((c) => {
      if (c.aApropriar <= 0 || !c.registro) return false;
      const d = dias(c.registro, hoje);
      return d >= a && d <= b;
    });
    return { nome, notas: itens.length, valor: soma(itens, (c) => c.aApropriar) };
  });
}

/** O item como a Receita entrega no arquivo (campos de valor zerados são omitidos). */
export function itemComoRFB(d: Documento): Record<string, unknown> {
  const base = {
    origem: 0,
    documento: d.documento,
    chave: d.chave,
    emissao: d.emissao,
    registro: d.registro,
    atualizacao: d.atualizacao,
  };
  const pa = `${d.pa.slice(5, 7)}/${d.pa.slice(0, 4)}`;
  const se = (v: number) => (v ? v : undefined);
  if (d.lado === "debito") {
    const cbs = {
      apurado: d.apurado,
      excedente: se(d.excedente),
      inexigivel: se(d.inexigivel),
      suspenso: se(d.suspenso),
      pgtoAntecipado: se(d.pgtoAntecipado),
      extinto: se(d.extinto),
      saldoDevedor: d.saldo,
    };
    return { pa, debitos: [{ ...base, cbs: JSON.parse(JSON.stringify(cbs)) as unknown }] };
  }
  const apropriacao = {
    aApropriar: se(d.aApropriar),
    apropriado: se(d.apropriado),
    utilizacao: {
      utilizado: se(d.utilizado),
      naoUtilizado: { saldoCredor: d.saldoCredor, pedidoRessarcimento: se(d.pedidoRessarcimento) },
    },
  };
  return {
    pa,
    creditos: [
      {
        ...base,
        cbs: {
          apurado: d.apurado,
          apropriacao: JSON.parse(JSON.stringify(apropriacao)) as unknown,
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------ cockpit do período */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Período que o cockpit abre: o mais antigo com dados cujo prazo de ajuste ainda não passou
 * (o mais urgente); se todos já passaram, o último com dados; sem dados, o mês corrente.
 */
export function paPadrao(
  comDados: readonly string[],
  prazoDe: (pa: string) => string,
  hoje: string,
): string {
  const ordenados = [...comDados].sort();
  const aberto = ordenados.find((pa) => prazoDe(pa) >= hoje);
  return aberto ?? ordenados.at(-1) ?? hoje.slice(0, 7);
}

export type TomPendencia = "crit" | "warn" | "info";
export type AcaoPendencia =
  | { tipo: "exportacao" }
  | { tipo: "creditos" }
  | { tipo: "nota"; chave: string }
  | { tipo: "decidir" };

export interface PendenciaPA {
  tom: TomPendencia;
  titulo: string;
  texto: string;
  acao?: AcaoPendencia;
}

/** Crédito a apropriar há mais de tantos dias vira pendência individual. */
export const DIAS_CREDITO_PARADO = 60;

/**
 * O que pede atenção num PA, da mais grave para a mais leve. Puro: recebe os documentos
 * do período, as chaves com exportação tributada e quantas decisões já existem.
 */
export function pendenciasDoPA(
  pa: string,
  debitos: readonly Debito[],
  creditos: readonly Credito[],
  exportacaoComCbs: ReadonlySet<string>,
  nDecisoes: number,
  hoje: string,
): PendenciaPA[] {
  const out: PendenciaPA[] = [];
  const deb = debitos.filter((d) => d.pa === pa);
  const cred = creditos.filter((c) => c.pa === pa);
  const { modo } = prazosDoPA(pa);

  const exp = deb.filter((d) => exportacaoComCbs.has(d.chave));
  if (exp.length) {
    out.push({
      tom: "crit",
      titulo: `${exp.length} NFS-e para o exterior com CBS apurada`,
      texto: `${BRL.format(soma(exp, (d) => d.apurado))} de CBS que a Receita apurou sobre serviços para o exterior. Exportação é imune: confira a classificação das notas.`,
      acao: { tipo: "exportacao" },
    });
  }

  const parados = cred
    .filter((c) => c.aApropriar > 0 && c.registro && dias(c.registro, hoje) > DIAS_CREDITO_PARADO)
    .sort((a, b) => b.aApropriar - a.aApropriar);
  for (const c of parados.slice(0, 3)) {
    out.push({
      tom: "warn",
      titulo: `Crédito parado há ${dias(c.registro ?? hoje, hoje)} dias`,
      texto: `${BRL.format(c.aApropriar)} a apropriar na ${descDoc(c)} do fornecedor ${emitente(c.chave).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}. O crédito só libera quando o fornecedor quita o débito dele.`,
      acao: { tipo: "nota", chave: c.chave },
    });
  }
  if (parados.length > 3) {
    out.push({
      tom: "warn",
      titulo: `Mais ${parados.length - 3} créditos parados há mais de ${DIAS_CREDITO_PARADO} dias`,
      texto: `${BRL.format(soma(parados.slice(3), (c) => c.aApropriar))} a apropriar no total.`,
      acao: { tipo: "creditos" },
    });
  }

  const aApropriar = soma(cred, (c) => c.aApropriar);
  if (aApropriar > 0 && !parados.length) {
    out.push({
      tom: "info",
      titulo: `${BRL.format(aApropriar)} de crédito a apropriar`,
      texto: "Notas recentes, dentro do ciclo normal de pagamento dos fornecedores.",
      acao: { tipo: "creditos" },
    });
  }

  const extinto = soma(deb, (d) => d.extinto);
  if (extinto > 0) {
    out.push({
      tom: "info",
      titulo: `${BRL.format(extinto)} de débito já extinto`,
      texto: "Parte do débito deste período foi quitada por compensação com créditos ou pagamento.",
    });
  }

  if (!deb.length && !cred.length) {
    out.push({
      tom: "info",
      titulo: "Nenhuma alteração da Receita para este período",
      texto: `A primeira consulta trouxe só o que mudou desde ${linhaDoTempo().inicioBase.split("-").reverse().join("/")}. O histórico anterior não chega por esta API.`,
    });
  } else if (nDecisoes === 0) {
    out.push({
      tom: modo === "definitivo" ? "warn" : "info",
      titulo: "Nenhuma decisão registrada",
      texto:
        modo === "definitivo"
          ? "Registre se a apuração será confirmada, ajustada ou se o prazo vai correr. Depois do prazo, o silêncio vale como confissão."
          : "Em 2026 a apuração é informativa, mas registrar o que foi visto cria o hábito e a trilha para 2027.",
      acao: { tipo: "decidir" },
    });
  }
  return out;
}
