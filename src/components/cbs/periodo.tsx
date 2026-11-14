import { Lock } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

import { JsonVisor } from "@/components/cbs/nota";
import { useAbrirNota } from "@/components/cbs/nota-contexto";
import { Estado } from "@/components/cbs/pecas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssuntoDecisao, Decisao, Periodo, TipoDecisao } from "@/lib/cbs/api";
import { useAtualizarPeriodo, useRegistrarDecisao } from "@/lib/cbs/consultas";
import { brl, compacto, dataBR, dataHoraBR, lerValorBR, paBR, paCurto } from "@/lib/cbs/formato";
import {
  descChave,
  descDoc,
  dias,
  prazosDoPA,
  type Debito,
  type ModoPA,
  type ResumoPA,
} from "@/lib/cbs/modelo";
import { ROTULO_ASSUNTO, ROTULO_DECISAO, ROTULO_STATUS } from "@/lib/cbs/rotulos";
import { cn } from "@/lib/utils";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

function traduzirErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/sem permiss/i.test(msg)) {
    return "O seu acesso ao cockpit é só de leitura. Peça a quem administra para registrar.";
  }
  if (/justificativa/i.test(msg)) return "A justificativa precisa de pelo menos 10 caracteres.";
  return msg;
}

/* ------------------------------------------------------------------ faixa de meses */

export function FaixaMeses({
  resumos,
  selecionado,
  comExportacao,
  aoSelecionar,
}: {
  resumos: ResumoPA[];
  selecionado: string;
  comExportacao: ReadonlySet<string>;
  aoSelecionar: (pa: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Períodos de apuração"
      className="grid grid-cols-6 gap-1.5 sm:grid-cols-12"
    >
      {resumos.map((r) => {
        const temDados = r.nDebitos + r.nCreditos > 0;
        const sel = r.pa === selecionado;
        const flag = comExportacao.has(r.pa);
        return (
          <button
            key={r.pa}
            type="button"
            aria-pressed={sel}
            onClick={() => aoSelecionar(r.pa)}
            className={cn(
              "grid min-w-0 justify-items-center gap-0.5 rounded-md border bg-card px-1 py-2 text-center hover:border-ink-3",
              !temDados && "border-dashed bg-transparent",
              sel && "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]",
            )}
          >
            <b
              className={cn(
                "font-[family-name:var(--font-display)] text-sm font-semibold",
                !temDados && "text-ink-3",
              )}
            >
              {paCurto(r.pa)}
            </b>
            <small className="max-w-full truncate text-[10.5px] text-ink-3 tabular">
              {!temDados
                ? "sem dados"
                : r.debitoApurado
                  ? compacto(Math.round(r.debitoApurado))
                  : "só créd."}
            </small>
            {flag && (
              <span className="size-1.5 rounded-full bg-crit" title="Exportação com CBS">
                <span className="sr-only">tem exportação com CBS</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ prazo e status */

export function RelogioPrazo({
  pa,
  periodo,
  hoje,
}: {
  pa: string;
  periodo: Periodo;
  hoje: string;
}) {
  const restante = dias(hoje, periodo.prazoAjuste);
  const total = Math.max(1, dias(`${pa}-01`, periodo.prazoAjuste));
  const feito = Math.min(1, Math.max(0, dias(`${pa}-01`, hoje) / total));
  const C = 2 * Math.PI * 40;
  const primeiro = prazosDoPA("2027-01").prazoAjuste;
  const diasPrimeiro = dias(hoje, primeiro);
  const cor = restante < 0 ? "var(--ink-3)" : restante <= 5 ? "var(--crit)" : "var(--primary)";
  const manual = periodo.prazoAjuste !== prazosDoPA(pa).prazoAjuste;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        className="size-24"
        role="img"
        aria-label={
          restante >= 0
            ? `${restante} dias até o prazo de ajuste`
            : `prazo de ajuste encerrado há ${-restante} dias`
        }
      >
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={cor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(C * feito).toFixed(1)} ${C.toFixed(1)}`}
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="52"
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          style={{ fill: "var(--foreground)", fontFamily: "var(--font-display)" }}
        >
          {Math.abs(restante)}
        </text>
        <text x="50" y="68" textAnchor="middle" fontSize="10" style={{ fill: "var(--ink-3)" }}>
          {restante >= 0 ? "dias" : "dias atrás"}
        </text>
      </svg>
      <dl className="grid gap-2 text-[13px]">
        <Linha rotulo="Disponível até">
          <b className="tabular">{dataBR(periodo.disponivelAte)}</b>
        </Linha>
        <Linha rotulo="Prazo de ajuste">
          <b className="tabular">{dataBR(periodo.prazoAjuste)}</b>
          {manual && <span className="text-ink-3"> · ajustado à mão</span>}
          {restante < 0 && <span className="text-ink-3"> · encerrado</span>}
        </Linha>
        <Linha rotulo="Depois do prazo">
          {periodo.modo === "ano_teste"
            ? "Em 2026 a apuração é meramente informativa, desde que as obrigações acessórias estejam em dia (Decreto 12.955/2026)."
            : "O silêncio vale como confissão do saldo apurado."}
        </Linha>
        {diasPrimeiro > 0 && (
          <Linha rotulo="Primeiro prazo real">
            <b className="tabular">{dataBR(primeiro)}</b> (PA 01/2027), em {diasPrimeiro} dias
          </Linha>
        )}
      </dl>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2.5">
      <dt className="text-ink-3">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ModoEStatus({ periodo, podeAlterar }: { periodo: Periodo; podeAlterar: boolean }) {
  const atualizar = useAtualizarPeriodo();
  const modo: ModoPA = periodo.modo;
  return (
    <div className="grid gap-1.5">
      {modo === "ano_teste" ? (
        <Estado tom="info">Ano-teste: apuração informativa</Estado>
      ) : (
        <Estado tom="warn">Definitivo: o prazo vale</Estado>
      )}
      <label className="flex items-center gap-2 text-xs text-ink-3">
        Status
        <select
          className={cn(SELECT, "h-7 w-auto py-0 text-xs font-semibold text-foreground")}
          value={periodo.status}
          disabled={atualizar.isPending || !podeAlterar}
          title={podeAlterar ? undefined : "Acesso de leitura: só o administrador muda o status"}
          onChange={(e) => {
            const status = e.target.value as Periodo["status"];
            atualizar.mutate(
              { periodo, status },
              {
                onSuccess: () => toast.success(`PA ${paBR(periodo.pa)}: ${ROTULO_STATUS[status]}.`),
                onError: (erro) => toast.error(traduzirErro(erro)),
              },
            );
          }}
        >
          {(Object.keys(ROTULO_STATUS) as Periodo["status"][]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ maiores débitos */

export function MaioresDebitos({
  debitos,
  exportacaoComCbs,
}: {
  debitos: Debito[];
  exportacaoComCbs: ReadonlySet<string>;
}) {
  const abrirNota = useAbrirNota();
  const [todos, setTodos] = useState(false);
  const ordenados = [...debitos].sort((a, b) => b.apurado - a.apurado);
  const visiveis = todos ? ordenados : ordenados.slice(0, 8);
  if (!ordenados.length) {
    return <p className="text-sm text-ink-3">Nenhum débito neste período na base atual.</p>;
  }
  return (
    <>
      <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full border-collapse text-[13px] tabular">
          <thead>
            <tr className="border-b border-rule-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3">
              <th className="px-2.5 py-2 font-semibold">Documento</th>
              <th className="px-2.5 py-2 font-semibold">Emissão</th>
              <th className="px-2.5 py-2 text-right font-semibold">CBS apurada</th>
              <th className="px-2.5 py-2 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((d) => (
              <tr
                key={d.chave}
                tabIndex={0}
                onClick={() => abrirNota(d.chave)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") abrirNota(d.chave);
                }}
                className="cursor-pointer border-b hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
              >
                <td className="px-2.5 py-2">
                  <span className="mr-2 whitespace-nowrap">{descDoc(d)}</span>
                  {exportacaoComCbs.has(d.chave) && <Estado tom="crit">exportação</Estado>}
                </td>
                <td className="px-2.5 py-2">{dataBR(d.emissao)}</td>
                <td className="px-2.5 py-2 text-right">{brl(d.apurado)}</td>
                <td className="px-2.5 py-2 text-right">{brl(d.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenados.length > 8 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTodos((t) => !t)}>
          {todos ? "Mostrar só os 8 maiores" : `Ver todos os ${ordenados.length} débitos`}
        </Button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ registrar decisão */

const ASSUNTOS_FORM: AssuntoDecisao[] = ["debitos", "creditos", "geral"];
const DECISOES_FORM: TipoDecisao[] = [
  "sem_acao",
  "confirmar",
  "ajustar",
  "corrigir_documento",
  "silencio",
];

export function FormDecisao({
  pa,
  modo,
  substituir,
  aoCancelarSubstituicao,
  refDecisao,
}: {
  pa: string;
  modo: ModoPA;
  substituir: Decisao | null;
  aoCancelarSubstituicao: () => void;
  refDecisao: RefObject<HTMLSelectElement | null>;
}) {
  const registrar = useRegistrarDecisao();
  const [servico, setServico] = useState<AssuntoDecisao>("debitos");
  const [decisao, setDecisao] = useState<TipoDecisao>(
    modo === "ano_teste" ? "sem_acao" : "confirmar",
  );
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (substituir) setServico(substituir.servico);
  }, [substituir]);

  const valorLido = lerValorBR(valor);
  const erroJust = justificativa.trim().length < 10;
  const erroValor = decisao === "ajustar" && valorLido === null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erroJust || erroValor) return;
    registrar.mutate(
      {
        pa,
        servico,
        decisao,
        justificativa: justificativa.trim(),
        valorAjuste: decisao === "ajustar" ? valorLido : null,
        chave: substituir?.chave ?? null,
        substituiId: substituir?.id ?? null,
      },
      {
        onSuccess: (id) => {
          toast.success(`Decisão #${id} registrada para o PA ${paBR(pa)}.`);
          setJustificativa("");
          setValor("");
          setTentou(false);
          aoCancelarSubstituicao();
        },
        onError: (erro) => toast.error(traduzirErro(erro)),
      },
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3.5">
      {substituir && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-2 text-[13px]">
          <span>
            Esta decisão vai <b>substituir a #{substituir.id}</b> (
            {ROTULO_DECISAO[substituir.decisao].toLowerCase()}).
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={aoCancelarSubstituicao}>
            Cancelar
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="f-servico" className="text-[13px] font-medium">
            Assunto
          </label>
          <select
            id="f-servico"
            className={SELECT}
            value={servico}
            onChange={(e) => setServico(e.target.value as AssuntoDecisao)}
          >
            {[...new Set([...ASSUNTOS_FORM, servico])].map((s) => (
              <option key={s} value={s}>
                {ROTULO_ASSUNTO[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="f-decisao" className="text-[13px] font-medium">
            Decisão
          </label>
          <select
            id="f-decisao"
            ref={refDecisao}
            className={SELECT}
            value={decisao}
            onChange={(e) => setDecisao(e.target.value as TipoDecisao)}
          >
            {DECISOES_FORM.map((d) => (
              <option key={d} value={d}>
                {ROTULO_DECISAO[d]}
                {d === "sem_acao" && modo === "ano_teste" ? " (ano-teste)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {decisao === "ajustar" && (
        <div className="grid gap-1.5">
          <label htmlFor="f-valor" className="text-[13px] font-medium">
            Valor do ajuste (R$)
          </label>
          <input
            id="f-valor"
            inputMode="decimal"
            placeholder="Ex.: -8.023,69"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-invalid={tentou && erroValor}
            aria-describedby="f-valor-ajuda"
            className={cn(SELECT, "tabular")}
          />
          <span id="f-valor-ajuda" className="text-xs text-ink-3">
            {tentou && erroValor ? (
              <span className="text-crit">Informe o valor no formato 1.234,56.</span>
            ) : valorLido !== null ? (
              `Vai gravar ${brl(valorLido)}.`
            ) : (
              "Use o sinal de menos para reduzir."
            )}
          </span>
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="f-just" className="text-[13px] font-medium">
          Justificativa
        </label>
        <Textarea
          id="f-just"
          rows={3}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          aria-invalid={tentou && erroJust}
          aria-describedby="f-just-ajuda"
          placeholder="Ex.: a NF-e com CBS maior na Receita incluiu frete e seguro na base; vamos conferir com o fiscal antes de ajustar."
        />
        <span
          id="f-just-ajuda"
          className={cn("text-xs", tentou && erroJust ? "text-crit" : "text-ink-3")}
        >
          {tentou && erroJust
            ? "Escreva pelo menos 10 caracteres."
            : "Fica gravada com o seu nome e o retrato dos números do período neste momento."}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex max-w-[44ch] items-start gap-2 text-xs text-ink-3">
          <Lock className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
          Depois de registrada, a decisão não pode ser alterada nem apagada. Para mudar, registre
          outra que a substitui.
        </p>
        <Button type="submit" disabled={registrar.isPending}>
          {registrar.isPending ? "Registrando…" : "Registrar decisão"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ trilha */

export function TrilhaDecisoes({
  decisoes,
  aoSubstituir,
}: {
  decisoes: Decisao[];
  /** Ausente no papel de leitura: a trilha aparece, sem o botão de substituir. */
  aoSubstituir?: (d: Decisao) => void;
}) {
  const abrirNota = useAbrirNota();
  const substituidaPor = new Map<number, number>();
  for (const d of decisoes) if (d.substituiId !== null) substituidaPor.set(d.substituiId, d.id);
  const lista = [...decisoes].sort((a, b) => b.id - a.id);

  if (!lista.length) {
    return <p className="text-sm text-ink-3">Nenhuma decisão registrada para este período.</p>;
  }
  return (
    <ol className="grid">
      {lista.map((d) => {
        const por = substituidaPor.get(d.id);
        return (
          <li
            key={d.id}
            className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 border-t py-3 first:border-t-0 first:pt-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2.5 rounded-full border-2",
                por === undefined ? "border-primary" : "border-ink-3",
              )}
            />
            <div className="grid min-w-0 gap-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <b>{ROTULO_DECISAO[d.decisao]}</b>
                {d.valorAjuste !== null && <span className="tabular">{brl(d.valorAjuste)}</span>}
                <span className="text-ink-3">· {ROTULO_ASSUNTO[d.servico]}</span>
                {por === undefined ? (
                  <Estado tom="good">vigente</Estado>
                ) : (
                  <Estado>substituída pela #{por}</Estado>
                )}
              </p>
              {d.chave && (
                <button
                  type="button"
                  onClick={() => abrirNota(d.chave ?? "")}
                  className="justify-self-start text-[13px] text-primary hover:underline"
                >
                  Sobre a {descChave(d.chave)}
                </button>
              )}
              <p className="whitespace-pre-line text-[13px] text-ink-2">{d.justificativa}</p>
              <p className="text-xs text-ink-3 tabular">
                #{d.id} · {d.decididoPor} · {dataHoraBR(d.decididoEm)}
                {d.substituiId !== null && ` · substitui a #${d.substituiId}`}
                {d.arquivosVistos.length > 0 &&
                  ` · arquivos vistos ${d.arquivosVistos.map((a) => `#${a}`).join(", ")}`}
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-ink-2">
                  Retrato dos números no momento da decisão
                </summary>
                <div className="mt-1.5">
                  <JsonVisor valor={d.retrato} />
                </div>
              </details>
              {por === undefined && aoSubstituir && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => aoSubstituir(d)}
                >
                  Registrar decisão que substitui esta
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
