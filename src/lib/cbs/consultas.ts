import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import * as api from "./api";
import { hojeSP, prazosDoPA, type Documento } from "./modelo";

/*
 * Hooks de leitura. Na demonstração os dados vêm do simulador da API (memória da aba) e só
 * mudam quando alguém registra uma decisão ou simula uma consulta à Receita, que invalidam o
 * cache.
 */
const LONGO = 5 * 60_000;

export const chaves = {
  debitos: ["cbs", "debitos"] as const,
  creditos: ["cbs", "creditos"] as const,
  periodos: ["cbs", "periodos"] as const,
  decisoes: ["cbs", "decisoes"] as const,
  emitidos: ["cbs", "emitidos"] as const,
  diagnosticos: ["cbs", "diagnosticos"] as const,
  saude: ["cbs", "saude"] as const,
  solicitacoes: ["cbs", "solicitacoes"] as const,
  arquivos: ["cbs", "arquivos"] as const,
  alertas: ["cbs", "alertas"] as const,
  versoes: (chave: string) => ["cbs", "versoes", chave] as const,
  acesso: ["cbs", "acesso"] as const,
  podeDecidir: ["cbs", "pode-decidir"] as const,
  cadastros: ["cbs", "cadastros"] as const,
  notasSaida: ["cbs", "notas-saida"] as const,
  importacoesSaida: ["cbs", "importacoes-saida"] as const,
};

export const useDebitos = () =>
  useQuery({ queryKey: chaves.debitos, queryFn: api.buscarDebitos, staleTime: LONGO });
export const useCreditos = () =>
  useQuery({ queryKey: chaves.creditos, queryFn: api.buscarCreditos, staleTime: LONGO });
export const usePeriodos = () =>
  useQuery({ queryKey: chaves.periodos, queryFn: api.buscarPeriodos, staleTime: LONGO });
export const useDecisoes = () =>
  useQuery({ queryKey: chaves.decisoes, queryFn: api.buscarDecisoes, staleTime: LONGO });
export const useEmitidos = () =>
  useQuery({ queryKey: chaves.emitidos, queryFn: api.buscarDocumentosEmitidos, staleTime: LONGO });
export const useDiagnosticos = () =>
  useQuery({
    queryKey: chaves.diagnosticos,
    queryFn: api.buscarDiagnosticosExportacao,
    staleTime: LONGO,
  });
export const useSaude = () =>
  useQuery({ queryKey: chaves.saude, queryFn: api.buscarSaude, staleTime: 60_000 });
export const useSolicitacoes = () =>
  useQuery({ queryKey: chaves.solicitacoes, queryFn: api.buscarSolicitacoes, staleTime: 60_000 });
export const useArquivos = () =>
  useQuery({ queryKey: chaves.arquivos, queryFn: api.buscarArquivos, staleTime: LONGO });
export const useAlertas = () =>
  useQuery({ queryKey: chaves.alertas, queryFn: api.buscarAlertasAbertos, staleTime: 60_000 });
export const useVersoes = (chave: string | null) =>
  useQuery({
    queryKey: chaves.versoes(chave ?? ""),
    queryFn: () => api.buscarVersoes(chave ?? ""),
    enabled: Boolean(chave),
    staleTime: LONGO,
  });

/** Cadastro público dos fornecedores por CNPJ (Map vazio enquanto carrega). */
export const useCadastros = () =>
  useQuery({ queryKey: chaves.cadastros, queryFn: api.buscarCadastros, staleTime: LONGO });

export const useNotasSaida = () =>
  useQuery({ queryKey: chaves.notasSaida, queryFn: api.buscarNotasSaida, staleTime: LONGO });
export const useImportacoesSaida = () =>
  useQuery({
    queryKey: chaves.importacoesSaida,
    queryFn: api.buscarImportacoesSaida,
    staleTime: LONGO,
  });

/** Depois de uma consulta simulada à Receita, recarrega tudo o que ela pode ter mudado. */
export function useRecarregarTudo() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["cbs"] });
}

/** Só para esconder o que o papel de leitura não pode fazer; quem barra de fato é a RPC. */
export const usePodeDecidir = () =>
  useQuery({ queryKey: chaves.podeDecidir, queryFn: api.podeDecidir, staleTime: 10 * 60_000 });

/** Débitos + créditos juntos, com índice por chave, e a data de hoje (Brasília). */
export function useDocumentos() {
  const deb = useDebitos();
  const cred = useCreditos();
  const dados = useMemo(() => {
    if (!deb.data || !cred.data) return null;
    const todos: Documento[] = [...deb.data, ...cred.data];
    const porChave = new Map<string, Documento[]>();
    for (const d of todos) porChave.set(d.chave, [...(porChave.get(d.chave) ?? []), d]);
    return { debitos: deb.data, creditos: cred.data, todos, porChave };
  }, [deb.data, cred.data]);
  return {
    dados,
    hoje: hojeSP(),
    carregando: deb.isPending || cred.isPending,
    erro: deb.error ?? cred.error,
  };
}

export function useRegistrarDecisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.registrarDecisao,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: chaves.decisoes }),
        qc.invalidateQueries({ queryKey: chaves.periodos }),
      ]);
    },
  });
}

/**
 * Muda o status do período preservando responsável, observação e prazo manual atuais.
 * O prazo da view só é "manual" quando difere do último dia útil calculado.
 */
export function useAtualizarPeriodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { periodo: api.Periodo; status: api.Periodo["status"] }) => {
      const manual =
        v.periodo.prazoAjuste !== prazosDoPA(v.periodo.pa).prazoAjuste
          ? v.periodo.prazoAjuste
          : null;
      return api.atualizarPeriodo(
        v.periodo.pa,
        v.status,
        v.periodo.responsavel,
        v.periodo.observacao,
        manual,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.periodos }),
  });
}
