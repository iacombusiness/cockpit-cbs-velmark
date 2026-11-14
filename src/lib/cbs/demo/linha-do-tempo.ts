/*
 * Linha do tempo da demonstração, sempre relativa ao dia de hoje (horário de Brasília), para o
 * cockpit continuar fazendo sentido em qualquer dia em que for aberto.
 *
 * - A empresa fez a primeira consulta à API há 4 dias, às 06:10, e consulta todo dia no mesmo
 *   horário (uma vez por serviço).
 * - Como não havia consulta nos últimos 3 meses, a primeira trouxe o que a Receita alterou desde o
 *   dia 1º do mês daquela consulta (pela data de alteração, não pelo período de apuração): por
 *   isso aparecem notas de meses antigos e o mês anterior chega incompleto.
 */

export const DIAS_DESDE_PRIMEIRA_CONSULTA = 4;
/** 06:10 em Brasília = 09:10 UTC (Brasília não tem horário de verão desde 2019). */
export const HORA_CONSULTA_UTC = { h: 9, m: 10 } as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Hoje em Brasília, "AAAA-MM-DD" (cópia de modelo.hojeSP, para o modelo poder importar este arquivo). */
function hojeSP(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function somarDias(data: string, n: number): string {
  const [a = 2026, m = 1, d = 1] = data.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** Soma meses a um PA "AAAA-MM". */
export function somarMeses(pa: string, n: number): string {
  const a = Number(pa.slice(0, 4));
  const m = Number(pa.slice(5, 7)) - 1 + n;
  const x = new Date(Date.UTC(a, m, 1));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`;
}

/** Instante ISO de uma data "AAAA-MM-DD" num horário de Brasília (h:m:s). */
export function instanteBR(data: string, h: number, m = 0, s = 0): string {
  return `${data}T${pad(h)}:${pad(m)}:${pad(s)}-03:00`;
}

export interface LinhaDoTempo {
  hoje: string;
  /** Dias (AAAA-MM-DD) em que a consulta diária já rodou, do mais antigo ao mais recente. */
  diasDeConsulta: string[];
  /** A Receita só entregou o que mudou desde esta data (dia 1º do mês da primeira consulta). */
  inicioBase: string;
  paAtual: string;
  paAnterior: string;
}

export function linhaDoTempo(agora: Date = new Date()): LinhaDoTempo {
  const hoje = hojeSP(agora);
  const corte = new Date(`${hoje}T${pad(HORA_CONSULTA_UTC.h)}:${pad(HORA_CONSULTA_UTC.m)}:00Z`);
  const rodouHoje = agora.getTime() >= corte.getTime();
  const primeira = somarDias(hoje, -DIAS_DESDE_PRIMEIRA_CONSULTA);
  const diasDeConsulta: string[] = [];
  for (let i = DIAS_DESDE_PRIMEIRA_CONSULTA; i >= (rodouHoje ? 0 : 1); i--) {
    diasDeConsulta.push(somarDias(hoje, -i));
  }
  const paAtual = hoje.slice(0, 7);
  return {
    hoje,
    diasDeConsulta,
    inicioBase: `${primeira.slice(0, 7)}-01`,
    paAtual,
    paAnterior: somarMeses(paAtual, -1),
  };
}
