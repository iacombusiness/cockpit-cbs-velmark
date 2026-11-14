/*
 * Simulador da API de Apuração Assistida da CBS (v2) da Receita, com dados fictícios da Velmark.
 * Dados fictícios · Velmark, empresa de demonstração. Nada aqui chama a Receita nem banco algum:
 * tudo é gerado no navegador, com semente fixa, relativo ao dia de hoje, e vive só na memória da aba.
 *
 * O que ele reproduz da API real (documentação pública da Receita, v2):
 * - consulta incremental: cada arquivo traz só o que mudou desde a consulta anterior;
 * - fluxo assíncrono: pedido -> tíquete -> situação -> link temporário assinado (48 h, um download)
 *   -> arquivo JSON { tiqueteSolicitacao, ni, geradoEm, apuracao: [{ pa, debitos | creditos }] };
 * - até 4 pedidos por dia, por credencial e por serviço (a cota zera à meia-noite);
 * - janela de 8 dias: quem passa mais de 8 dias sem consultar perde o que mudou antes;
 * - a primeira consulta, sem consulta nos 3 meses anteriores, começa no dia 1º do mês, pela data de
 *   alteração (por isso chegam notas de meses antigos e o mês anterior vem incompleto);
 * - o campo ni do arquivo vem com o CNPJ completo (14 dígitos), embora a documentação diga 8.
 */
import type {
  Alerta,
  Arquivo,
  AssuntoDecisao,
  CadastroFornecedor,
  Decisao,
  DocumentoEmitido,
  ImportacoesSaida,
  NovaDecisao,
  PainelSaude,
  Periodo,
  Solicitacao,
  Versao,
} from "../api";
import { prazosDoPA, type Credito, type Debito, type Documento } from "../modelo";
import type { NotaSaida } from "../saidas";
import {
  HORA_CONSULTA_UTC,
  instanteBR,
  linhaDoTempo,
  somarDias,
  somarMeses,
} from "./linha-do-tempo";
import { CLIENTES, EMPRESA, FORNECEDORES, type Parceiro } from "./parceiros";

/** Alíquota-teste da CBS em 2026 (LC 214/2025, art. 343). */
const ALIQUOTA_TESTE = 0.009;
const COTA_DIA = 4;
const SERVICOS = ["debitos", "creditos"] as const;
type Servico = (typeof SERVICOS)[number];
const AUTOR = "controladoria@velmark.exemplo";

/* ------------------------------------------------------------------ utilitários */

function semente(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pad = (v: number | string, n: number) => String(v).padStart(n, "0");

const UF_COD: Readonly<Record<string, string>> = { SP: "35", PR: "41", MG: "31", SC: "42" };
const IBGE: Readonly<Record<string, string>> = {
  "São José do Rio Preto": "3549805",
  Campinas: "3509502",
};

/** Dígito verificador módulo 11 (pesos 2 a 9, da direita para a esquerda), como o da NF-e. */
export function dvMod11(base: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** Chave de 44 dígitos (NF-e, CT-e, NF3-e...). */
export function chave44(
  uf: string,
  emissao: string,
  cnpj: string,
  modelo: number,
  numero: number,
  codigo: number,
): string {
  const base =
    (UF_COD[uf] ?? "35") +
    emissao.slice(2, 4) +
    emissao.slice(5, 7) +
    cnpj +
    pad(modelo, 2) +
    "001" +
    pad(numero, 9) +
    "1" +
    pad(codigo, 8);
  return base + dvMod11(base);
}

/** Chave da NFS-e Nacional (50 dígitos). */
export function chave50(
  ibge: string,
  cnpj: string,
  numero: number,
  emissao: string,
  codigo: number,
): string {
  const base =
    ibge +
    "1" +
    "2" +
    cnpj +
    pad(numero, 13) +
    emissao.slice(2, 4) +
    emissao.slice(5, 7) +
    pad(codigo, 9);
  return base + dvMod11(base);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function diasUteis(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const dia = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dia !== 0 && dia !== 6) out.push(d);
  }
  return out;
}

/* ------------------------------------------------------------------ estado */

interface Estado {
  geradoEm: number;
  debitos: Map<string, Debito>;
  creditos: Map<string, Credito>;
  versoes: Map<string, Versao[]>;
  pendentes: Record<Servico, Documento[][]>;
  decisoes: Decisao[];
  periodos: Map<string, Periodo>;
  solicitacoes: Solicitacao[];
  arquivos: Arquivo[];
  http: PainelSaude["http"];
  alertas: Alerta[];
  notas: NotaSaida[];
  cadastros: Map<string, CadastroFornecedor>;
  ultimaConsulta: Record<Servico, string | null>;
  seqArquivo: number;
  seqSolicitacao: number;
  seqHttp: number;
  sorteio: () => number;
}

let estado: Estado | null = null;

function itemOficial(d: Documento): Record<string, unknown> {
  const base = {
    origem: 0,
    documento: d.documento,
    chave: d.chave,
    emissao: d.emissao,
    registro: d.registro,
    atualizacao: d.atualizacao,
  };
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
    return { ...base, cbs: JSON.parse(JSON.stringify(cbs)) as unknown };
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
    ...base,
    cbs: { apurado: d.apurado, apropriacao: JSON.parse(JSON.stringify(apropriacao)) as unknown },
  };
}

const paOficial = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;

function tiquete(sorteio: () => number): string {
  const hex = () =>
    Math.floor(sorteio() * 0x10000)
      .toString(16)
      .padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Monta o arquivo como a Receita entrega: um JSON com os itens agrupados por período. */
function montarArquivo(
  servico: Servico,
  tiq: string,
  geradoEm: string,
  itens: Documento[],
): string {
  const porPa = new Map<string, Record<string, unknown>[]>();
  for (const d of [...itens].sort((a, b) => a.pa.localeCompare(b.pa))) {
    porPa.set(d.pa, [...(porPa.get(d.pa) ?? []), itemOficial(d)]);
  }
  const doc = {
    tiqueteSolicitacao: tiq,
    ni: EMPRESA.cnpj, // a documentação diz 8 dígitos (a raiz); o arquivo real traz os 14
    geradoEm,
    apuracao: [...porPa].map(([pa, lista]) => ({ pa: paOficial(pa), [servico]: lista })),
  };
  return JSON.stringify(doc, null, 2);
}

async function sha256(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const resumo = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ geração */

interface Rascunho {
  doc: Documento;
  /** Estados anteriores, do mais antigo ao mais novo (o atual é `doc`). */
  antes: Documento[];
}

const SERVICO_DO_FORNECEDOR: Readonly<Record<string, number>> = {
  S002: 66, // energia: NF3-e
  S003: 57, // transporte: CT-e
  S004: 91, // contabilidade: NFS-e
  S005: 91, // sistemas e internet: NFS-e
};

function debito(
  chave: string,
  documento: number,
  pa: string,
  emissao: string,
  registro: string,
  atualizacao: string,
  apurado: number,
  extinto = 0,
): Debito {
  return {
    lado: "debito",
    chave,
    pa,
    documento,
    emissao,
    registro,
    atualizacao,
    apurado,
    excedente: 0,
    inexigivel: 0,
    suspenso: 0,
    pgtoAntecipado: 0,
    extinto,
    saldo: r2(apurado - extinto),
    arquivoId: 0,
    ingeridoEm: atualizacao,
    atualizadoEm: atualizacao,
  };
}

function credito(
  chave: string,
  documento: number,
  pa: string,
  emissao: string,
  registro: string,
  atualizacao: string,
  apurado: number,
  apropriado = 0,
  utilizado = 0,
): Credito {
  return {
    lado: "credito",
    chave,
    pa,
    documento,
    emissao,
    registro,
    atualizacao,
    apurado,
    aApropriar: r2(apurado - apropriado),
    apropriado,
    utilizado,
    saldoCredor: r2(apropriado - utilizado),
    pedidoRessarcimento: 0,
    arquivoId: 0,
    ingeridoEm: atualizacao,
    atualizadoEm: atualizacao,
  };
}

function gerar(agora: Date): Estado {
  const sorteio = semente(20261110);
  const entre = (a: number, b: number) => a + sorteio() * (b - a);
  const inteiroEntre = (a: number, b: number) => Math.floor(entre(a, b + 1));
  const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(sorteio() * lista.length)] as T;

  const t = linhaDoTempo(agora);
  const consultas = t.diasDeConsulta.map((d) => ({
    dia: d,
    em: `${d}T${pad(HORA_CONSULTA_UTC.h, 2)}:${pad(HORA_CONSULTA_UTC.m, 2)}:00Z`,
  }));
  const ultimaConsultaEm = consultas.at(-1)?.em ?? agora.toISOString();
  const quando = (dia: string, hMin: number, hMax: number) =>
    instanteBR(dia, inteiroEntre(hMin, hMax), inteiroEntre(0, 59), inteiroEntre(0, 59));

  const rascunhos: Rascunho[] = [];
  const pendentesBrutos: Record<Servico, Documento[][]> = {
    debitos: [[], [], []],
    creditos: [[], [], []],
  };

  /* ---- débitos: vendas da Velmark (NF-e) e alguns serviços de impressão (NFS-e) */
  let numeroNfe = 18_240;
  let numeroNfse = 311;
  const venda = (dia: string, pa: string): Debito => {
    const valor = r2(
      sorteio() < 0.7
        ? entre(900, 9_500)
        : sorteio() < 0.8
          ? entre(9_500, 28_000)
          : entre(28_000, 61_000),
    );
    const emissao = quando(dia, 8, 17);
    const registro = emissao;
    numeroNfe += inteiroEntre(1, 3);
    const chave = chave44(
      "SP",
      dia,
      EMPRESA.cnpj,
      55,
      numeroNfe,
      inteiroEntre(10_000_000, 99_999_999),
    );
    return debito(chave, 55, pa, emissao, registro, registro, r2(valor * ALIQUOTA_TESTE));
  };
  const servicoImpressao = (dia: string, pa: string): Debito => {
    const valor = r2(entre(1_800, 7_600));
    const emissao = quando(dia, 9, 16);
    numeroNfse += 1;
    const chave = chave50(
      EMPRESA.ibge,
      EMPRESA.cnpj,
      numeroNfse,
      dia,
      inteiroEntre(100_000_000, 999_999_999),
    );
    return debito(chave, 91, pa, emissao, emissao, emissao, r2(valor * ALIQUOTA_TESTE));
  };

  // Mês anterior: emitidas lá, mas só chegam as que a Receita alterou desde o início da base.
  const diasAnt = diasUteis(
    `${t.paAnterior}-01`,
    somarDias(`${somarMeses(t.paAnterior, 1)}-01`, -1),
  );
  const debitosAnteriores: Debito[] = [];
  for (const dia of diasAnt) {
    const n = inteiroEntre(1, 3);
    for (let i = 0; i < n; i++) debitosAnteriores.push(venda(dia, t.paAnterior));
    if (sorteio() < 0.12) debitosAnteriores.push(servicoImpressao(dia, t.paAnterior));
  }
  // Notas do mês anterior que a Receita alterou desde o início da base (só essas chegam pela API).
  const alteradasAnt = debitosAnteriores.filter(() => sorteio() < 0.32);
  for (const d of alteradasAnt) {
    const alt = quando(somarDias(t.inicioBase, inteiroEntre(0, 2)), 1, 5);
    const reprocessado = { ...d, atualizacao: alt, atualizadoEm: alt, ingeridoEm: alt };
    if (sorteio() < 0.3) {
      // depois foi extinto por compensação com créditos: mudança de valor entre as versões
      const dia = escolher(
        t.diasDeConsulta.slice(1).length ? t.diasDeConsulta.slice(1) : t.diasDeConsulta,
      );
      const alt2 = quando(somarDias(dia, -1), 10, 20);
      rascunhos.push({
        antes: [reprocessado],
        doc: debito(
          d.chave,
          d.documento,
          d.pa,
          d.emissao ?? "",
          d.registro ?? "",
          alt2,
          d.apurado,
          d.apurado,
        ),
      });
    } else {
      rascunhos.push({ antes: [], doc: reprocessado });
    }
  }

  // Mês atual: todas as notas emitidas desde o dia 1º.
  for (const dia of diasUteis(`${t.paAtual}-01`, somarDias(t.hoje, -1))) {
    const n = inteiroEntre(1, 3);
    for (let i = 0; i < n; i++) rascunhos.push({ antes: [], doc: venda(dia, t.paAtual) });
    if (sorteio() < 0.15) rascunhos.push({ antes: [], doc: servicoImpressao(dia, t.paAtual) });
  }
  // Para a consulta ao vivo: vendas de hoje que a Receita ainda não entregou.
  pendentesBrutos.debitos[0] = [
    venda(t.hoje, t.paAtual),
    venda(t.hoje, t.paAtual),
    servicoImpressao(t.hoje, t.paAtual),
  ];
  pendentesBrutos.debitos[1] = [venda(t.hoje, t.paAtual)];

  /* ---- créditos: compras de fornecedores */
  const mercadoria = FORNECEDORES.filter((f) => f.subtipo === "mercadoria");
  const porCodigo = new Map(FORNECEDORES.map((f) => [f.codigo, f]));
  const numeros = new Map<string, number>();
  const compra = (f: Parceiro, dia: string, pa: string, faixa: [number, number]): Credito => {
    const modelo = SERVICO_DO_FORNECEDOR[f.codigo] ?? 55;
    const atual = numeros.get(f.codigo) ?? inteiroEntre(2_000, 90_000);
    const numero = atual + inteiroEntre(1, 40);
    numeros.set(f.codigo, numero);
    const valor = r2(entre(faixa[0], faixa[1]));
    const emissao = quando(dia, 7, 18);
    const chave =
      modelo === 91
        ? chave50(
            IBGE[f.cidade] ?? EMPRESA.ibge,
            f.cnpj,
            numero,
            dia,
            inteiroEntre(100_000_000, 999_999_999),
          )
        : chave44(f.uf, dia, f.cnpj, modelo, numero, inteiroEntre(10_000_000, 99_999_999));
    return credito(chave, modelo, pa, emissao, emissao, emissao, r2(valor * ALIQUOTA_TESTE));
  };
  const pago = (c: Credito, quandoPagou: string, utilizado = 0): Credito =>
    credito(
      c.chave,
      c.documento,
      c.pa,
      c.emissao ?? "",
      c.registro ?? "",
      quandoPagou,
      c.apurado,
      c.apurado,
      utilizado,
    );

  // Créditos antigos ainda a apropriar (fornecedor não quitou), reprocessados desde o início da base.
  const parados: [string, number][] = [
    ["F013", 95],
    ["F001", 78],
    ["F012", 71],
    ["F006", 66],
  ];
  for (const [codigo, idade] of parados) {
    const f = porCodigo.get(codigo);
    if (!f) continue;
    const dia = somarDias(t.hoje, -idade);
    const c = compra(f, dia, dia.slice(0, 7), [9_000, 31_000]);
    const alt = quando(somarDias(t.inicioBase, inteiroEntre(0, 3)), 1, 5);
    rascunhos.push({
      antes: [],
      doc: { ...c, atualizacao: alt, atualizadoEm: alt, ingeridoEm: alt },
    });
  }

  // Mês anterior: créditos que o fornecedor quitou desde o início da base (apropriados, alguns usados).
  for (let i = 0; i < 12; i++) {
    const f = escolher(mercadoria);
    const c = compra(f, escolher(diasAnt), t.paAnterior, [2_500, 34_000]);
    const alt = quando(somarDias(t.inicioBase, inteiroEntre(0, 2)), 1, 5);
    const apropriado = pago(c, alt);
    if (i < 4 && t.diasDeConsulta.length > 1) {
      const dia = t.diasDeConsulta[inteiroEntre(1, t.diasDeConsulta.length - 1)] ?? t.hoje;
      const usado = r2(c.apurado * entre(0.4, 1));
      rascunhos.push({
        antes: [apropriado],
        doc: pago(c, quando(somarDias(dia, -1), 11, 19), usado),
      });
    } else {
      rascunhos.push({ antes: [], doc: apropriado });
    }
  }

  // Mês atual: compras de mercadoria, fretes, energia, contabilidade e sistemas.
  const diasAtual = diasUteis(`${t.paAtual}-01`, somarDias(t.hoje, -1));
  for (const dia of diasAtual) {
    if (sorteio() < 0.85) {
      const c = compra(escolher(mercadoria), dia, t.paAtual, [2_000, 36_000]);
      if (sorteio() < 0.35 && dia < somarDias(t.hoje, -3)) {
        const quitou = quando(somarDias(dia, inteiroEntre(2, 3)), 9, 18);
        rascunhos.push({ antes: [c], doc: pago(c, quitou) });
      } else {
        rascunhos.push({ antes: [], doc: c });
      }
    }
    if (sorteio() < 0.3) {
      const frete = porCodigo.get("S003");
      if (frete) rascunhos.push({ antes: [], doc: compra(frete, dia, t.paAtual, [180, 950]) });
    }
  }
  const primeiroDiaUtil = diasAtual[0];
  for (const [codigo, faixa] of [
    ["S002", [3_200, 4_400]],
    ["S004", [2_600, 3_100]],
    ["S005", [1_300, 1_600]],
  ] as const) {
    const f = porCodigo.get(codigo);
    if (f && primeiroDiaUtil)
      rascunhos.push({ antes: [], doc: compra(f, primeiroDiaUtil, t.paAtual, [...faixa]) });
  }
  // Para a consulta ao vivo: compras de hoje e um fornecedor que quitou o débito dele.
  const quitaraHoje = rascunhos.find(
    (r) =>
      r.doc.lado === "credito" &&
      r.doc.pa === t.paAtual &&
      r.doc.aApropriar > 0 &&
      r.doc.documento === 55,
  );
  pendentesBrutos.creditos[0] = [
    compra(escolher(mercadoria), t.hoje, t.paAtual, [3_000, 22_000]),
    compra(escolher(mercadoria), t.hoje, t.paAtual, [3_000, 22_000]),
    ...(quitaraHoje?.doc.lado === "credito" ? [pago(quitaraHoje.doc, t.hoje)] : []),
  ];
  pendentesBrutos.creditos[1] = [compra(escolher(mercadoria), t.hoje, t.paAtual, [1_500, 9_000])];

  /* ---- entrega dia a dia: cada estado vai no arquivo da primeira consulta depois da alteração */
  const e: Estado = {
    geradoEm: agora.getTime(),
    debitos: new Map(),
    creditos: new Map(),
    versoes: new Map(),
    pendentes: pendentesBrutos,
    decisoes: [],
    periodos: new Map(),
    solicitacoes: [],
    arquivos: [],
    http: [],
    alertas: [],
    notas: [],
    cadastros: new Map(),
    ultimaConsulta: { debitos: null, creditos: null },
    seqArquivo: 0,
    seqSolicitacao: 0,
    seqHttp: 0,
    sorteio,
  };

  // Cada arquivo traz só o estado mais recente de cada documento alterado desde a consulta anterior.
  const lotes = consultas.map(() => ({
    debitos: new Map<string, Documento>(),
    creditos: new Map<string, Documento>(),
  }));
  for (const r of rascunhos) {
    for (const v of [...r.antes, r.doc]) {
      const i = consultas.findIndex((c) => Date.parse(v.atualizacao) <= Date.parse(c.em));
      if (i < 0) continue; // alterada depois da última consulta: chega na próxima
      lotes[i]?.[v.lado === "debito" ? "debitos" : "creditos"].set(v.chave, v);
    }
  }
  // Mantém na fila o que mudou depois da última consulta.
  for (const r of rascunhos) {
    if (Date.parse(r.doc.atualizacao) > Date.parse(ultimaConsultaEm)) {
      const fila = e.pendentes[r.doc.lado === "debito" ? "debitos" : "creditos"];
      fila[0] = [...(fila[0] ?? []), r.doc];
    }
  }

  consultas.forEach((c, i) => {
    for (const servico of SERVICOS) {
      const itens = [...(lotes[i]?.[servico].values() ?? [])];
      registrarEntrega(e, servico, c.em, itens, "agendada", c.dia);
    }
  });

  /* ---- cadastro público dos fornecedores */
  const CNAE: Readonly<Record<string, string>> = {
    mercadoria: "Fabricação de embalagens de material plástico ou papel",
    S002: "Distribuição de energia elétrica",
    S003: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças",
    S004: "Atividades de contabilidade",
    S005: "Desenvolvimento e licenciamento de programas de computador",
  };
  for (const f of FORNECEDORES) {
    e.cadastros.set(f.cnpj, {
      cnpj: f.cnpj,
      razaoSocial: semAcento(f.razao),
      nomeFantasia: semAcento(f.fantasia),
      situacao: f.codigo === "F013" ? "INAPTA" : "ATIVA",
      uf: f.uf,
      municipio: semAcento(f.cidade),
      cnae: CNAE[f.codigo] ?? CNAE[f.subtipo] ?? "Comércio atacadista de embalagens",
      porte: f.codigo === "F012" ? "EMPRESA DE PEQUENO PORTE" : "DEMAIS",
      simples: f.codigo === "F012",
      mei: false,
      status: "ok",
      consultadoEm: instanteBR(somarDias(t.hoje, -2), 10, 20),
    });
  }

  /* ---- períodos e decisões */
  const pas = new Set([...e.debitos.values(), ...e.creditos.values()].map((d) => d.pa));
  for (const pa of pas) {
    const p = prazosDoPA(pa);
    e.periodos.set(pa, {
      pa,
      modo: p.modo,
      status: pa === t.paAnterior ? "em_revisao" : "aberto",
      disponivelAte: p.disponivelAte,
      prazoAjuste: p.prazoAjuste,
      situacaoPrazo: p.modo === "ano_teste" ? "informativo" : "no_prazo",
      responsavel: pa === t.paAnterior ? "Controladoria" : null,
      observacao:
        pa === t.paAnterior
          ? "Base parcial: a API só trouxe o que a Receita alterou desde o início da base."
          : null,
    });
  }
  e.decisoes.push({
    id: 1,
    pa: t.paAnterior,
    servico: "creditos",
    chave: null,
    decisao: "sem_acao",
    valorAjuste: null,
    justificativa:
      "Créditos conferidos com as notas de entrada do ERP. O que falta apropriar é de fornecedores que ainda não quitaram o débito deles.",
    retrato: {},
    arquivosVistos: e.arquivos.filter((a) => a.caminho.includes("/creditos/")).map((a) => a.id),
    decididoPor: AUTOR,
    decididoEm: instanteBR(t.diasDeConsulta[1] ?? t.hoje, 15, 42),
    substituiId: null,
  });

  /* ---- notas de saída no ERP, cruzadas com os débitos */
  gerarNotasSaida(e, t, sorteio, debitosAnteriores);

  /* ---- alertas informativos (as "pegadinhas" da API) */
  e.alertas.push(
    {
      id: 2,
      criadoEm: consultas[0]?.em ?? agora.toISOString(),
      nivel: "info",
      tipo: "ni_com_14_digitos",
      mensagem: `O campo ni do arquivo veio com o CNPJ completo (${EMPRESA.cnpj}); a documentação diz 8 dígitos. A conferência usa só a raiz.`,
    },
    {
      id: 1,
      criadoEm: consultas[0]?.em ?? agora.toISOString(),
      nivel: "info",
      tipo: "base_parcial",
      mensagem:
        "A primeira consulta trouxe só o que a Receita alterou desde o dia 1º do mês, pela data de alteração: chegaram notas de meses antigos e o mês anterior está incompleto.",
    },
  );
  return e;
}

function registrarEntrega(
  e: Estado,
  servico: Servico,
  em: string,
  itens: Documento[],
  origem: "agendada" | "manual",
  dia: string,
  naHora = false,
): { arquivo: Arquivo; texto: string } {
  e.seqSolicitacao += 1;
  e.seqArquivo += 1;
  const tiq = tiquete(e.sorteio);
  const solicitadoEm = naHora
    ? new Date(Date.parse(em) - 5_000).toISOString()
    : new Date(Date.parse(em) + Math.floor(e.sorteio() * 4_000)).toISOString();
  const geradoEm = naHora
    ? new Date(Date.parse(em) - 1_500).toISOString()
    : new Date(Date.parse(solicitadoEm) + 2_000 + Math.floor(e.sorteio() * 2_500)).toISOString();
  const recebidoEm = naHora
    ? new Date(Date.parse(geradoEm) + 1_000).toISOString()
    : new Date(Date.parse(geradoEm) + 60_000 * (1 + Math.floor(e.sorteio() * 12))).toISOString();
  const texto = montarArquivo(servico, tiq, geradoEm, itens);
  const arquivo: Arquivo = {
    id: e.seqArquivo,
    solicitacaoId: e.seqSolicitacao,
    caminho: `${EMPRESA.cnpj.slice(0, 8)}/${servico}/${dia}/${tiq}.json`,
    sha256: "",
    bytes: new TextEncoder().encode(texto).length,
    ni: EMPRESA.cnpj,
    geradoEm,
    recebidoEm,
    conteudo: texto,
  };
  e.arquivos.unshift(arquivo);
  e.solicitacoes.unshift({
    id: e.seqSolicitacao,
    servico,
    origem,
    solicitadoEm,
    httpStatus: 202,
    tiquete: tiq,
    situacao: "CONCLUIDA",
    etapa: "processado",
    registros: itens.length,
    codigoErro: null,
  });
  for (const [status, quando] of [
    [202, solicitadoEm],
    [200, geradoEm],
    [200, recebidoEm],
  ] as const) {
    e.seqHttp += 1;
    e.http.unshift({ id: e.seqHttp, status, regiao: "sa-east-1", erro: null, em: quando });
  }
  for (const v of itens) aplicar(e, v, arquivo.id, recebidoEm);
  e.ultimaConsulta[servico] = recebidoEm;
  return { arquivo, texto };
}

function aplicar(e: Estado, v: Documento, arquivoId: number, recebidoEm: string): void {
  const doc = { ...v, arquivoId, atualizadoEm: recebidoEm } as Documento;
  const anterior = doc.lado === "debito" ? e.debitos.get(doc.chave) : e.creditos.get(doc.chave);
  if (!anterior) doc.ingeridoEm = recebidoEm;
  else doc.ingeridoEm = anterior.ingeridoEm;
  if (doc.lado === "debito") e.debitos.set(doc.chave, doc);
  else e.creditos.set(doc.chave, doc);
  e.versoes.set(doc.chave, [
    ...(e.versoes.get(doc.chave) ?? []),
    { lado: doc.lado, arquivoId, atualizacao: doc.atualizacao, dados: itemOficial(doc) },
  ]);
}

function gerarNotasSaida(
  e: Estado,
  t: ReturnType<typeof linhaDoTempo>,
  sorteio: () => number,
  debitosAnteriores: Debito[],
): void {
  const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(sorteio() * lista.length)] as T;
  const numeroDaChave = (chave: string) =>
    chave.length === 44 ? Number(chave.slice(25, 34)) : Number(chave.slice(23, 36));
  const notaDe = (d: Debito, naReceita: boolean): NotaSaida => {
    const cliente = escolher(CLIENTES);
    const servico = d.documento === 91;
    const valor = r2(d.apurado / ALIQUOTA_TESTE);
    const dia = (d.emissao ?? t.hoje).slice(0, 10);
    const foraDoEstado = cliente.uf !== "SP";
    return {
      modelo: servico ? "NFS-e" : "NF-e",
      serie: "1",
      numero: numeroDaChave(d.chave),
      emissao: dia,
      competencia: dia,
      digitacao: dia,
      clienteCodigo: cliente.codigo,
      clienteNome: cliente.razao,
      clienteCnpj: cliente.cnpj,
      uf: cliente.uf,
      pais: "BRA",
      paisNome: "Brasil",
      cidade: cliente.cidade,
      natureza: servico ? "S.001" : foraDoEstado ? "6.102" : "5.102",
      naturezaDescricao: servico
        ? "Impressão personalizada em embalagens"
        : "Venda de mercadoria adquirida de terceiros",
      valorTotal: valor,
      baseCbs: valor,
      valorCbs: d.apurado,
      valorIbs: r2(valor * 0.001),
      valorIss: servico ? r2(valor * 0.02) : null,
      cancelada: false,
      substituida: false,
      numeroRetorno: servico ? `${dia.slice(0, 4)}${pad(numeroDaChave(d.chave), 9)}` : null,
      importadoEm: instanteBR(t.hoje, 7, 5),
      origem: "erp",
      chave: naReceita ? d.chave : null,
      paReceita: naReceita ? d.pa : null,
      apuradoReceita: naReceita ? d.apurado : null,
    };
  };

  const naReceita = [...e.debitos.values()];
  const chavesNaReceita = new Set(naReceita.map((d) => d.chave));
  const notas: NotaSaida[] = naReceita.map((d) => notaDe(d, true));
  // Notas do mês anterior que não mudaram desde o início da base: estão no ERP, mas fora da base.
  for (const d of debitosAnteriores)
    if (!chavesNaReceita.has(d.chave)) notas.push(notaDe(d, false));

  const doMesAtual = notas.filter(
    (n) =>
      n.chave && n.paReceita === t.paAtual && n.modelo === "NF-e" && (n.emissao ?? "") < t.hoje,
  );
  // 1) CBS diferente: a Receita apurou sobre uma base maior (frete e seguro somados).
  const divergente = doMesAtual[2];
  if (divergente && divergente.chave) {
    const d = e.debitos.get(divergente.chave);
    if (d) {
      const novo = r2(d.apurado * 1.18);
      const ajustado = { ...d, apurado: novo, saldo: r2(novo - d.extinto) };
      e.debitos.set(d.chave, ajustado);
      const vs = e.versoes.get(d.chave) ?? [];
      const ultima = vs.at(-1);
      if (ultima) ultima.dados = itemOficial(ajustado);
      divergente.apuradoReceita = novo;
    }
  }
  // 2) Cancelada no ERP, mas a Receita mantém o débito.
  const cancelada = doMesAtual[5];
  if (cancelada) cancelada.cancelada = true;
  // 3) Venda com CBS no ERP, emitida há mais de 5 dias, que a Receita ainda não apurou.
  const ref = doMesAtual.find((n) => (n.emissao ?? "") <= somarDias(t.hoje, -6)) ?? doMesAtual[0];
  if (ref) {
    const numero = ref.numero + 1_000;
    notas.push({
      ...ref,
      numero,
      clienteNome: escolher(CLIENTES).razao,
      chave: null,
      paReceita: null,
      apuradoReceita: null,
    });
  }
  // 4) NFS-e sem número de retorno do emissor nacional registrado no ERP.
  const nfse = notas.find(
    (n) =>
      n.modelo === "NFS-e" &&
      n.paReceita === t.paAtual &&
      (n.emissao ?? "") <= somarDias(t.hoje, -2),
  );
  if (nfse) nfse.numeroRetorno = null;

  e.notas = notas.sort(
    (a, b) => (b.emissao ?? "").localeCompare(a.emissao ?? "") || b.numero - a.numero,
  );
}

function dados(): Estado {
  // Gera uma vez por aba; num dia novo, gera de novo (a demonstração acompanha a data).
  const agora = new Date();
  if (!estado || linhaDoTempo(new Date(estado.geradoEm)).hoje !== linhaDoTempo(agora).hoje) {
    estado = gerar(agora);
  }
  return estado;
}

/* ------------------------------------------------------------------ leituras */

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const latencia = () => espera(120);

export async function debitos(): Promise<Debito[]> {
  await latencia();
  return [...dados().debitos.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

export async function creditos(): Promise<Credito[]> {
  await latencia();
  return [...dados().creditos.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

export async function versoes(chave: string): Promise<Versao[]> {
  await latencia();
  return [...(dados().versoes.get(chave) ?? [])];
}

export async function periodos(): Promise<Periodo[]> {
  await latencia();
  return [...dados().periodos.values()].sort((a, b) => a.pa.localeCompare(b.pa));
}

export async function decisoes(): Promise<Decisao[]> {
  await latencia();
  return [...dados().decisoes].sort((a, b) => b.id - a.id);
}

export async function registrarDecisao(d: NovaDecisao): Promise<number> {
  await latencia();
  const e = dados();
  const id = Math.max(0, ...e.decisoes.map((x) => x.id)) + 1;
  const nova: Decisao = {
    id,
    pa: d.pa,
    servico: d.servico as AssuntoDecisao,
    chave: d.chave,
    decisao: d.decisao,
    valorAjuste: d.valorAjuste,
    justificativa: d.justificativa,
    retrato: {},
    arquivosVistos: e.arquivos.map((a) => a.id),
    decididoPor: AUTOR,
    decididoEm: new Date().toISOString(),
    substituiId: d.substituiId,
  };
  e.decisoes.push(nova);
  const p = e.periodos.get(d.pa);
  if (p && p.status === "aberto") e.periodos.set(d.pa, { ...p, status: "em_revisao" });
  return id;
}

export async function atualizarPeriodo(
  pa: string,
  status: Periodo["status"],
  responsavel: string | null,
  observacao: string | null,
  prazoAjusteManual: string | null,
): Promise<void> {
  await latencia();
  const e = dados();
  const p = prazosDoPA(pa);
  e.periodos.set(pa, {
    pa,
    modo: p.modo,
    status,
    disponivelAte: p.disponivelAte,
    prazoAjuste: prazoAjusteManual ?? p.prazoAjuste,
    situacaoPrazo: p.modo === "ano_teste" ? "informativo" : "no_prazo",
    responsavel,
    observacao,
  });
}

export async function documentosEmitidos(): Promise<DocumentoEmitido[]> {
  await latencia();
  return [];
}

export async function saude(): Promise<PainelSaude> {
  await latencia();
  const e = dados();
  const agora = new Date();
  const hoje = linhaDoTempo(agora).hoje;
  const ingestao = SERVICOS.map((servico) => {
    const doServico = e.solicitacoes.filter((s) => s.servico === servico);
    const hojeN = doServico.filter(
      (s) => linhaDoTempo(new Date(s.solicitadoEm)).hoje === hoje,
    ).length;
    const ultima = e.ultimaConsulta[servico];
    const diasSem = ultima ? r2((agora.getTime() - Date.parse(ultima)) / 864e5) : null;
    return {
      servico,
      ultima_processada: ultima,
      dias_sem_carga: diasSem,
      risco_janela: (diasSem === null
        ? "sem_carga"
        : diasSem >= 7
          ? "critico"
          : diasSem >= 3
            ? "atencao"
            : "ok") as PainelSaude["ingestao"][number]["risco_janela"],
      solicitacoes_hoje: hojeN,
      cota_restante_hoje: Math.max(0, COTA_DIA - hojeN),
      em_andamento: doServico.filter((s) => s.etapa !== "processado").length,
      erros_7d: 0,
      alertas_criticos_abertos: 0,
    };
  });
  const ultimaAgendada = e.solicitacoes.find((s) => s.origem === "agendada")?.solicitadoEm ?? null;
  return {
    agora: agora.toISOString(),
    config: { enabled: true, servicos: [...SERVICOS] },
    ingestao,
    cron: [
      {
        job: "consulta-diaria-receita",
        schedule: `${HORA_CONSULTA_UTC.m} ${HORA_CONSULTA_UTC.h} * * *`,
        ativo: true,
        ultimo_status: "succeeded",
        ultima_execucao: ultimaAgendada,
        execucoes_24h: 1,
        falhas_24h: 0,
      },
      {
        job: "processar-arquivos",
        schedule: "*/15 * * * *",
        ativo: true,
        ultimo_status: "succeeded",
        ultima_execucao: new Date(Math.floor(agora.getTime() / 900_000) * 900_000).toISOString(),
        execucoes_24h: 96,
        falhas_24h: 0,
      },
    ],
    http: e.http.slice(0, 30),
  };
}

export async function solicitacoes(): Promise<Solicitacao[]> {
  await latencia();
  return dados().solicitacoes.slice(0, 30);
}

export async function arquivos(): Promise<Arquivo[]> {
  await latencia();
  const lista = dados().arquivos.slice(0, 30);
  for (const a of lista) if (!a.sha256) a.sha256 = await sha256(a.conteudo);
  return lista;
}

export async function alertas(): Promise<Alerta[]> {
  await latencia();
  return [...dados().alertas];
}

export async function cadastros(): Promise<Map<string, CadastroFornecedor>> {
  await latencia();
  return new Map(dados().cadastros);
}

export async function notasSaida(): Promise<NotaSaida[]> {
  await latencia();
  return [...dados().notas];
}

export async function importacoesSaida(): Promise<ImportacoesSaida> {
  await latencia();
  const e = dados();
  const t = linhaDoTempo();
  const datas = e.notas.flatMap((n) => (n.emissao ? [n.emissao] : [])).sort();
  const concluida = new Date(Date.now() - 23 * 60_000).toISOString();
  return {
    erp: [
      {
        id: 1,
        arquivo: null,
        notas: e.notas.length,
        novas: 2,
        ligadasReceita: e.notas.filter((n) => n.chave).length,
        de: datas[0] ?? null,
        ate: datas.at(-1) ?? t.hoje,
        importadoPor: "integração do ERP",
        importadoEm: concluida,
        origem: "erp",
        situacao: "concluida",
        erro: null,
        totalErp: e.notas.length,
        erpLidoEm: new Date(Date.now() - 31 * 60_000).toISOString(),
        concluidaEm: concluida,
      },
    ],
    planilha: [],
  };
}

/* ------------------------------------------------------------------ consulta ao vivo */

export type EtapaConsulta =
  "recusada" | "solicitada" | "em_processamento" | "concluida" | "baixada" | "link_usado";

export interface PassoConsulta {
  etapa: EtapaConsulta;
  titulo: string;
  texto: string;
  em: string;
}

/**
 * Percorre o fluxo da API v2 para um serviço, como a integração faz: pede, recebe o tíquete,
 * consulta a situação, recebe o link temporário, baixa uma vez e processa o arquivo.
 */
export async function consultarAgora(
  servico: Servico,
  aoPasso: (p: PassoConsulta) => void,
  pausa: (ms: number) => Promise<void> = espera,
): Promise<void> {
  const e = dados();
  const agora = () => new Date().toISOString();
  const hoje = linhaDoTempo().hoje;
  const pedidosHoje = e.solicitacoes.filter(
    (s) => s.servico === servico && linhaDoTempo(new Date(s.solicitadoEm)).hoje === hoje,
  ).length;
  if (pedidosHoje >= COTA_DIA) {
    aoPasso({
      etapa: "recusada",
      titulo: "Cota do dia esgotada",
      texto: `A API aceita até ${COTA_DIA} pedidos por dia para cada serviço, por credencial. A cota zera à meia-noite: o próximo pedido só amanhã.`,
      em: agora(),
    });
    return;
  }
  const tiq = tiquete(e.sorteio);
  aoPasso({
    etapa: "solicitada",
    titulo: "Pedido aceito (HTTP 202)",
    texto: `A Receita devolveu o tíquete ${tiq}. O arquivo é montado em segundo plano: o processamento pode levar até 4 horas.`,
    em: agora(),
  });
  await pausa(1_400);
  aoPasso({
    etapa: "em_processamento",
    titulo: "Situação do tíquete: EM_PROCESSAMENTO",
    texto: "A integração consulta a situação de tempos em tempos (ou espera o aviso no webhook).",
    em: agora(),
  });
  await pausa(1_800);
  const validade = new Date(Date.now() + 48 * 3_600_000);
  aoPasso({
    etapa: "concluida",
    titulo: "Situação: CONCLUIDA. Link temporário recebido",
    texto: `Link assinado válido até ${validade.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (48 horas) e para um único download.`,
    em: agora(),
  });
  await pausa(1_200);
  const limite = Date.now() - 12 * 60_000;
  const itens = (e.pendentes[servico].shift() ?? []).map((d) => {
    const alt = new Date(Date.now() - Math.floor(e.sorteio() * 8 + 3) * 60_000).toISOString();
    // Nota de hoje com horário ainda no futuro: puxa para alguns minutos atrás.
    const emissao =
      d.emissao && Date.parse(d.emissao) > limite
        ? new Date(limite - Math.floor(e.sorteio() * 90) * 60_000).toISOString()
        : d.emissao;
    const registro =
      d.registro && emissao && Date.parse(d.registro) > Date.parse(alt) ? emissao : d.registro;
    return { ...d, emissao, registro, atualizacao: alt } as Documento;
  });
  const { arquivo } = registrarEntrega(e, servico, agora(), itens, "manual", hoje, true);
  // registrarEntrega grava a solicitação como já concluída; o tíquete exibido é o desta consulta.
  const sol = e.solicitacoes[0];
  if (sol) sol.tiquete = tiq;
  arquivo.sha256 = await sha256(arquivo.conteudo);
  aoPasso({
    etapa: "baixada",
    titulo: itens.length
      ? `Arquivo baixado: ${itens.length} ${itens.length === 1 ? "registro novo ou alterado" : "registros novos ou alterados"}`
      : "Arquivo baixado: nada mudou desde a última consulta",
    texto: `${arquivo.bytes.toLocaleString("pt-BR")} bytes, SHA-256 ${arquivo.sha256.slice(0, 16)}…, guardado antes de qualquer processamento. A consulta é incremental: só vem o que mudou.`,
    em: agora(),
  });
  await pausa(600);
  aoPasso({
    etapa: "link_usado",
    titulo: "O link não vale mais",
    texto:
      "Um segundo download do mesmo arquivo seria recusado: cada link serve para um download só.",
    em: agora(),
  });
}

export const NOME_SERVICO: Readonly<Record<Servico, string>> = {
  debitos: "Débitos",
  creditos: "Créditos",
};
export { SERVICOS, type Servico };
export const _paraTeste = { gerar };
