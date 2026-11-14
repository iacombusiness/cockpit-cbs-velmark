const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR");
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const brl = (v: number): string => BRL.format(v);
export const inteiro = (v: number): string => INTEIRO.format(v);

export function pct(v: number, casas = 1): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** 11.756 -> "11,8 mil" (eixos e rótulos curtos de gráfico). */
export function compacto(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** "2026-10-30" ou ISO completo -> "30/10/2026". */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Instante ISO -> "30/10/2026 17:30" no horário de Brasília. */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATA_HORA.format(new Date(iso)).replace(",", "");
}

/** PA no formato interno "2026-10" -> "10/2026". */
export const paBR = (pa: string): string => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const paCurto = (pa: string): string => MESES[Number(pa.slice(5, 7)) - 1] ?? pa;

export function cnpjFmt(s: string): string {
  return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Lê um valor digitado no padrão brasileiro ("-8.023,69", "8023,69", "R$ 1.000") e devolve
 * o número, ou null se não for um valor válido. Ponto sem vírgula é separador de milhar.
 */
export function lerValorBR(texto: string): number | null {
  const limpo = texto
    .replace(/R\$|\s/g, "")
    .replace(/[−–]/g, "-")
    .trim();
  if (!/^-?[\d.]+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteira = "", dec] = limpo.split(",");
  if (inteira.includes(".") && !/^-?\d{1,3}(\.\d{3})+$/.test(inteira)) return null;
  const v = Number(`${inteira.replace(/\./g, "")}${dec === undefined ? "" : `.${dec}`}`);
  return Number.isFinite(v) ? v : null;
}
