import * as sim from "./demo/simulador";
import type { Credito, Debito, Lado } from "./modelo";
import type { NotaSaida } from "./saidas";

/*
 * Camada de dados do cockpit. Nesta demonstração não há banco nem login: tudo vem do simulador
 * da API de Apuração Assistida da CBS (src/lib/cbs/demo/simulador.ts), com dados fictícios da
 * Velmark, gerados no navegador. As assinaturas são as mesmas que as telas usam.
 */

/* ------------------------------------------------------------------ débitos e créditos */

export const buscarDebitos = (): Promise<Debito[]> => sim.debitos();
export const buscarCreditos = (): Promise<Credito[]> => sim.creditos();

/* ------------------------------------------------------------------ versões de um documento */

export interface Versao {
  lado: Lado;
  arquivoId: number;
  atualizacao: string;
  dados: Record<string, unknown>;
}

export const buscarVersoes = (chave: string): Promise<Versao[]> => sim.versoes(chave);

/* ------------------------------------------------------------------ períodos e decisões */

export interface Periodo {
  pa: string;
  modo: "ano_teste" | "definitivo";
  status: "aberto" | "em_revisao" | "decidido" | "encerrado";
  disponivelAte: string;
  prazoAjuste: string;
  situacaoPrazo: string;
  responsavel: string | null;
  observacao: string | null;
}

export const buscarPeriodos = (): Promise<Periodo[]> => sim.periodos();

export type TipoDecisao = "confirmar" | "ajustar" | "silencio" | "corrigir_documento" | "sem_acao";
export type AssuntoDecisao = "debitos" | "creditos" | "pagamentos" | "recolhimentos" | "geral";

export interface Decisao {
  id: number;
  pa: string;
  servico: AssuntoDecisao;
  chave: string | null;
  decisao: TipoDecisao;
  valorAjuste: number | null;
  justificativa: string;
  retrato: Record<string, unknown>;
  arquivosVistos: number[];
  decididoPor: string;
  decididoEm: string;
  substituiId: number | null;
}

export const buscarDecisoes = (): Promise<Decisao[]> => sim.decisoes();

export interface NovaDecisao {
  pa: string; // "AAAA-MM"
  servico: AssuntoDecisao;
  decisao: TipoDecisao;
  justificativa: string;
  valorAjuste: number | null;
  chave: string | null;
  substituiId: number | null;
}

/** Na demonstração, a decisão fica só na memória desta aba. Devolve o id da decisão. */
export const registrarDecisao = (d: NovaDecisao): Promise<number> => sim.registrarDecisao(d);

/**
 * Grava status, responsável, observação e prazo manual de uma vez: quem chama precisa reenviar
 * os valores atuais do que não quer mudar.
 */
export const atualizarPeriodo = (
  pa: string,
  status: Periodo["status"],
  responsavel: string | null,
  observacao: string | null,
  prazoAjusteManual: string | null,
): Promise<void> => sim.atualizarPeriodo(pa, status, responsavel, observacao, prazoAjusteManual);

/* ------------------------------------------------------------------ documentos emitidos (lado ERP) */

export interface DocumentoEmitido {
  chave: string;
  documento: number;
  numero: string | null;
  emissao: string | null;
  competencia: string | null;
  tomadorNome: string | null;
  tomadorPais: string | null;
  tomadorExterior: boolean | null;
  valorOperacao: number | null;
  cst: string | null;
  cclasstrib: string | null;
  origem: string;
  dados: Record<string, unknown> | null;
}

export const buscarDocumentosEmitidos = (): Promise<DocumentoEmitido[]> => sim.documentosEmitidos();

export type Diagnostico =
  "sem_dados_do_documento" | "exportacao_com_cbs" | "exterior_sem_cbs" | "tomador_no_brasil";

/** A Velmark não exporta: nenhuma nota para o exterior a diagnosticar. */
export const buscarDiagnosticosExportacao = (): Promise<Map<string, Diagnostico>> =>
  Promise.resolve(new Map());

/* ------------------------------------------------------------------ conexão com a Receita */

export interface PainelSaude {
  agora: string;
  config: { enabled: boolean; servicos: string[] } | null;
  ingestao: {
    servico: string;
    ultima_processada: string | null;
    dias_sem_carga: number | null;
    risco_janela: "ok" | "atencao" | "critico" | "sem_carga";
    solicitacoes_hoje: number;
    cota_restante_hoje: number;
    em_andamento: number;
    erros_7d: number;
    alertas_criticos_abertos: number;
  }[];
  cron: {
    job: string;
    schedule: string;
    ativo: boolean;
    ultimo_status: string | null;
    ultima_execucao: string | null;
    execucoes_24h: number;
    falhas_24h: number;
  }[];
  http: {
    id: number;
    status: number | null;
    regiao: string | null;
    erro: string | null;
    em: string;
  }[];
}

export const buscarSaude = (): Promise<PainelSaude> => sim.saude();

export interface Solicitacao {
  id: number;
  servico: string;
  origem: string;
  solicitadoEm: string;
  httpStatus: number | null;
  tiquete: string | null;
  situacao: string | null;
  etapa: string;
  registros: number | null;
  codigoErro: string | null;
}

export const buscarSolicitacoes = (): Promise<Solicitacao[]> => sim.solicitacoes();

export interface Arquivo {
  id: number;
  solicitacaoId: number;
  caminho: string;
  sha256: string;
  bytes: number;
  ni: string | null;
  geradoEm: string | null;
  recebidoEm: string;
  /** O arquivo como veio da Receita (JSON), guardado antes de qualquer processamento. */
  conteudo: string;
}

export const buscarArquivos = (): Promise<Arquivo[]> => sim.arquivos();

export interface Alerta {
  id: number;
  criadoEm: string;
  nivel: "info" | "atencao" | "critico";
  tipo: string;
  mensagem: string;
}

export const buscarAlertasAbertos = (): Promise<Alerta[]> => sim.alertas();

export type { PassoConsulta } from "./demo/simulador";

/** Percorre o fluxo da API (pedido, tíquete, situação, link, download) para um serviço. */
export const consultarReceitaAgora = (
  servico: "debitos" | "creditos",
  aoPasso: (p: sim.PassoConsulta) => void,
): Promise<void> => sim.consultarAgora(servico, aoPasso);

/* ------------------------------------------------------------------ cadastro dos fornecedores */

/** Cadastro público do CNPJ (razão social, situação, município, CNAE, regime). */
export interface CadastroFornecedor {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  uf: string | null;
  municipio: string | null;
  cnae: string | null;
  porte: string | null;
  simples: boolean | null;
  mei: boolean | null;
  status: "pendente" | "ok" | "nao_encontrado" | "erro";
  consultadoEm: string | null;
}

export const buscarCadastros = (): Promise<Map<string, CadastroFornecedor>> => sim.cadastros();

/* ------------------------------------------------------------------ notas de saída (ERP × Receita) */

export const buscarNotasSaida = (): Promise<NotaSaida[]> => sim.notasSaida();

export interface ImportacaoSaida {
  id: number;
  arquivo: string | null;
  notas: number;
  novas: number;
  ligadasReceita: number;
  de: string | null;
  ate: string | null;
  importadoPor: string;
  importadoEm: string;
  origem: "planilha" | "erp";
  situacao: "buscando" | "concluida" | "erro";
  erro: string | null;
  totalErp: number | null;
  /** Quando a integração leu o ERP pela última vez. */
  erpLidoEm: string | null;
  concluidaEm: string | null;
}

export interface ImportacoesSaida {
  /** Leituras automáticas do ERP, da mais nova para a mais antiga. */
  erp: ImportacaoSaida[];
  /** Importações por planilha (não usadas na demonstração). */
  planilha: ImportacaoSaida[];
}

export const buscarImportacoesSaida = (): Promise<ImportacoesSaida> => sim.importacoesSaida();

/* ------------------------------------------------------------------ acesso */

/** Na demonstração, quem abre pode registrar decisões (ficam só na memória da aba). */
export const podeDecidir = (): Promise<boolean> => Promise.resolve(true);
export const temAcesso = (): Promise<boolean> => Promise.resolve(true);
