import type { AssuntoDecisao, Periodo, TipoDecisao } from "./api";

/* Rótulos de tela dos valores gravados no banco (cbs_decisao, cbs_periodo). */

export const ROTULO_DECISAO: Record<TipoDecisao, string> = {
  sem_acao: "Sem ação",
  confirmar: "Confirmar a apuração",
  ajustar: "Ajustar valor",
  corrigir_documento: "Corrigir documento na origem",
  silencio: "Deixar o prazo correr",
};

export const ROTULO_ASSUNTO: Record<AssuntoDecisao, string> = {
  debitos: "Débitos",
  creditos: "Créditos",
  pagamentos: "Pagamentos",
  recolhimentos: "Recolhimentos",
  geral: "Período inteiro",
};

export const ROTULO_STATUS: Record<Periodo["status"], string> = {
  aberto: "Aberto",
  em_revisao: "Em revisão",
  decidido: "Decidido",
  encerrado: "Encerrado",
};

export const ROTULO_SERVICO: Record<string, string> = {
  debitos: "Débitos",
  creditos: "Créditos",
  pagamentos: "Pagamentos",
  recolhimentos: "Recolhimentos",
};

export const servicoBR = (s: string): string => ROTULO_SERVICO[s] ?? s;
