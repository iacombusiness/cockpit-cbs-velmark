import type { PainelSaude } from "./api";

/*
 * Regras puras da tela da conexão com a Receita. Brasília não tem horário de verão desde 2019:
 * a conversão UTC → BRT é sempre -3 h.
 */

const BRT = -3;

/** Próxima execução de um job diário "MM HH * * *" (UTC), como instante ISO. */
export function proximaExecucaoDiaria(schedule: string, agora: Date): Date | null {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(schedule.trim());
  if (!m) return null;
  const proxima = new Date(
    Date.UTC(
      agora.getUTCFullYear(),
      agora.getUTCMonth(),
      agora.getUTCDate(),
      Number(m[2]),
      Number(m[1]),
    ),
  );
  if (proxima.getTime() <= agora.getTime()) proxima.setUTCDate(proxima.getUTCDate() + 1);
  return proxima;
}

/** Agenda do pg_cron (UTC) em português, no horário de Brasília. */
export function descreverCron(schedule: string): string {
  const s = schedule.trim();
  const cada = /^\*\/(\d+) \* \* \* \*$/.exec(s);
  if (cada) return `a cada ${cada[1]} min`;
  const diario = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(s);
  if (diario) {
    const h = (Number(diario[2]) + BRT + 24) % 24;
    return `todo dia às ${String(h).padStart(2, "0")}:${String(Number(diario[1])).padStart(2, "0")}`;
  }
  return s;
}

export type TomSaude = "good" | "warn" | "crit";

export interface EstadoGeral {
  tom: TomSaude;
  titulo: string;
  selo: string;
}

export function estadoGeral(p: PainelSaude): EstadoGeral {
  if (p.config && !p.config.enabled) {
    return {
      tom: "crit",
      titulo: "A conexão com a Receita está desligada",
      selo: "Conexão desligada",
    };
  }
  const riscos = p.ingestao.map((i) => i.risco_janela);
  if (riscos.includes("critico")) {
    return {
      tom: "crit",
      titulo: "A janela de 8 dias da Receita está em risco",
      selo: "Janela em risco",
    };
  }
  if (!p.ingestao.length || riscos.includes("sem_carga")) {
    return {
      tom: "warn",
      titulo: "A conexão ainda não concluiu uma carga",
      selo: "Sem carga concluída",
    };
  }
  const falhas =
    p.cron.some((c) => c.falhas_24h > 0 || !c.ativo) ||
    p.ingestao.some((i) => i.erros_7d > 0 || i.alertas_criticos_abertos > 0);
  if (riscos.includes("atencao") || falhas) {
    return { tom: "warn", titulo: "A conexão precisa de atenção", selo: "Atenção" };
  }
  return { tom: "good", titulo: "A conexão está em dia com a Receita", selo: "Ingestão em dia" };
}

const REGIAO: Record<string, string> = {
  "sa-east-1": "São Paulo (sa-east-1)",
  "us-east-1": "Virgínia (us-east-1)",
  "us-east-2": "Ohio (us-east-2)",
};

export function resumoHttp(http: PainelSaude["http"]): {
  regiao: string | null;
  ok: number;
  total: number;
} {
  const contagem = new Map<string, number>();
  for (const h of http) if (h.regiao) contagem.set(h.regiao, (contagem.get(h.regiao) ?? 0) + 1);
  const top = [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    regiao: top ? (REGIAO[top] ?? top) : null,
    ok: http.filter((h) => h.status !== null && h.status >= 200 && h.status < 300).length,
    total: http.length,
  };
}

/** Normaliza a busca do explorador: só letras e dígitos, minúsculas. */
export const termoBusca = (q: string): string =>
  q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
