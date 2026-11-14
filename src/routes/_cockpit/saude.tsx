import { createFileRoute } from "@tanstack/react-router";
import { CloudDownload, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAbrirNota } from "@/components/cbs/nota-contexto";
import {
  Cabecalho,
  Carregando,
  ErroCarga,
  Estado,
  KpiGrade,
  Painel,
  Pendencia,
  type Tom,
} from "@/components/cbs/pecas";
import { Button } from "@/components/ui/button";
import {
  consultarReceitaAgora,
  type Alerta,
  type Arquivo,
  type PainelSaude,
  type PassoConsulta,
  type Solicitacao,
} from "@/lib/cbs/api";
import {
  useAlertas,
  useArquivos,
  useDocumentos,
  useRecarregarTudo,
  useSaude,
  useSolicitacoes,
} from "@/lib/cbs/consultas";
import { brl, dataHoraBR, inteiro } from "@/lib/cbs/formato";
import { descDoc, emitente, nomeDoc, numeroDoc, type Documento } from "@/lib/cbs/modelo";
import {
  descreverCron,
  estadoGeral,
  proximaExecucaoDiaria,
  resumoHttp,
  termoBusca,
} from "@/lib/cbs/saude";
import { servicoBR } from "@/lib/cbs/rotulos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_cockpit/saude")({
  head: () => ({ meta: [{ title: "Conexão e notas · Cockpit CBS" }] }),
  component: TelaSaude,
});

const JANELA_DIAS = 8;
const ALERTA_DIAS = 7;
const COTA_DIA = 4;

function TelaSaude() {
  const saude = useSaude();
  const solicitacoes = useSolicitacoes();
  const arquivos = useArquivos();
  const alertas = useAlertas();
  const erro = saude.error ?? solicitacoes.error ?? arquivos.error ?? alertas.error;
  if (erro) return <ErroCarga erro={erro} />;
  if (!saude.data || !solicitacoes.data || !arquivos.data || !alertas.data) return <Carregando />;
  return (
    <>
      <Conexao
        painel={saude.data}
        solicitacoes={solicitacoes.data}
        arquivos={arquivos.data}
        alertas={alertas.data}
      />
      <Painel titulo="Explorador de notas" subtitulo="Busque por número, chave, CNPJ ou tipo">
        <ExploradorNotas />
      </Painel>
    </>
  );
}

/* ------------------------------------------------------------------ conexão com a Receita */

const TOM_RISCO: Record<PainelSaude["ingestao"][number]["risco_janela"], Tom> = {
  ok: "good",
  atencao: "warn",
  critico: "crit",
  sem_carga: "warn",
};

function Celula({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 px-4 py-3.5 shadow-[1px_1px_0_0_var(--border)]">
      <span className="eyebrow">{rotulo}</span>
      {children}
    </div>
  );
}

function Conexao({
  painel,
  solicitacoes,
  arquivos,
  alertas,
}: {
  painel: PainelSaude;
  solicitacoes: Solicitacao[];
  arquivos: Arquivo[];
  alertas: Alerta[];
}) {
  const geral = estadoGeral(painel);
  const agora = new Date(painel.agora);
  const diasSem = painel.ingestao.map((i) => i.dias_sem_carga);
  const piorDias = diasSem.some((d) => d === null) ? null : Math.max(...diasSem.map(Number), 0);
  const piorRisco =
    painel.ingestao.find((i) => i.risco_janela === "critico")?.risco_janela ??
    painel.ingestao.find((i) => i.risco_janela !== "ok")?.risco_janela ??
    "ok";
  const cota = Math.min(...painel.ingestao.map((i) => i.cota_restante_hoje), COTA_DIA);
  const diario = painel.cron.find((c) => /^\d{1,2} \d{1,2} \* \* \*$/.test(c.schedule));
  const proxima = diario ? proximaExecucaoDiaria(diario.schedule, agora) : null;
  const http = resumoHttp(painel.http);

  return (
    <>
      <Cabecalho
        sobretitulo="Conexão com a API da Receita e explorador de notas"
        titulo={geral.titulo}
        texto={`A Receita entrega só o que mudou desde a última consulta, e guarda as mudanças por ${JANELA_DIAS} dias. Se a conexão ficar mais tempo sem uma carga concluída, os dados desse intervalo se perdem.`}
        lado={<Estado tom={geral.tom}>{geral.selo}</Estado>}
      />

      <KpiGrade>
        <Celula rotulo="Janela da Receita">
          <b className="font-[family-name:var(--font-display)] text-lg tabular">
            {piorDias === null
              ? "sem carga concluída"
              : `${piorDias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de ${JANELA_DIAS} dias`}
          </b>
          <div
            role="img"
            aria-label={
              piorDias === null
                ? "Nenhuma carga concluída ainda"
                : `${piorDias.toLocaleString("pt-BR")} dias desde a última carga, de ${JANELA_DIAS} permitidos`
            }
            className="relative h-2 rounded-full bg-secondary"
          >
            <i
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                piorRisco === "critico" ? "bg-crit" : piorRisco === "ok" ? "bg-primary" : "bg-warn",
              )}
              style={{
                width: `${Math.max(1.5, Math.min(100, ((piorDias ?? 0) / JANELA_DIAS) * 100))}%`,
              }}
            />
            <span
              className="absolute -inset-y-1 w-0.5 bg-crit"
              style={{ left: `${(ALERTA_DIAS / JANELA_DIAS) * 100}%` }}
            />
          </div>
          <span className="text-xs text-ink-3">Alerta crítico a partir de {ALERTA_DIAS} dias</span>
        </Celula>
        <Celula rotulo="Cota de hoje">
          <b className="font-[family-name:var(--font-display)] text-lg tabular">
            {cota} de {COTA_DIA} restantes
          </b>
          <span className="text-xs text-ink-3">
            por API (
            {painel.config?.servicos.map((x) => servicoBR(x).toLowerCase()).join(" e ") ?? "—"})
          </span>
        </Celula>
        <Celula rotulo="Próxima consulta">
          <b className="font-[family-name:var(--font-display)] text-lg tabular">
            {proxima ? dataHoraBR(proxima.toISOString()) : "—"}
          </b>
          <span className="font-[family-name:var(--font-mono)] text-xs text-ink-3">
            {diario?.job ?? "sem job diário"}
          </span>
        </Celula>
        <Celula rotulo="Região de execução">
          <b className="text-[15px]">{http.regiao ?? "—"}</b>
          <span className="text-xs text-ink-3">
            {http.ok} de {http.total} chamadas recentes com HTTP 2xx
          </span>
        </Celula>
      </KpiGrade>

      <ConsultaAoVivo cota={painel.ingestao} />

      {painel.ingestao.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {painel.ingestao.map((i) => (
            <Estado key={i.servico} tom={TOM_RISCO[i.risco_janela]}>
              {servicoBR(i.servico)}: última carga {dataHoraBR(i.ultima_processada)}
              {i.erros_7d ? ` · ${i.erros_7d} erros em 7 dias` : ""}
            </Estado>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Painel titulo="Agendamentos e consultas">
          <Tabela
            cabecalho={["Job", "Quando", "Última", "24 h"]}
            direita={[3]}
            linhas={painel.cron.map((c) => [
              <span key="j" className="font-[family-name:var(--font-mono)] text-xs">
                {c.job}
                {!c.ativo && (
                  <span className="ml-1.5">
                    <Estado tom="crit">desligado</Estado>
                  </span>
                )}
              </span>,
              descreverCron(c.schedule),
              <span key="u">
                {dataHoraBR(c.ultima_execucao)}
                {c.ultimo_status && c.ultimo_status !== "succeeded" && (
                  <span className="ml-1.5">
                    <Estado tom="crit">{c.ultimo_status}</Estado>
                  </span>
                )}
              </span>,
              c.falhas_24h ? (
                <Estado key="e" tom="crit">
                  {c.execucoes_24h} · {c.falhas_24h} falhas
                </Estado>
              ) : (
                <Estado key="e" tom="good">
                  {c.execucoes_24h} · sem falhas
                </Estado>
              ),
            ])}
          />
          <h3 className="mb-2 mt-5 font-semibold">Consultas à Receita</h3>
          <Tabela
            cabecalho={["#", "Serviço", "Origem", "Quando", "Registros", "Etapa"]}
            direita={[4]}
            linhas={solicitacoes.slice(0, 12).map((s) => [
              s.id,
              servicoBR(s.servico),
              s.origem,
              dataHoraBR(s.solicitadoEm),
              s.registros === null ? "—" : inteiro(s.registros),
              <Estado
                key="et"
                tom={
                  s.etapa === "processado" ? "good" : /erro|falha/.test(s.etapa) ? "crit" : "info"
                }
              >
                {s.etapa}
                {s.codigoErro ? ` · ${s.codigoErro}` : ""}
              </Estado>,
            ])}
          />
        </Painel>

        <Painel
          titulo="Arquivos originais da Receita"
          subtitulo="Guardados antes de qualquer processamento"
        >
          <div className="grid gap-3.5">
            {arquivos.slice(0, 6).map((a) => (
              <ArquivoOriginal key={a.id} a={a} />
            ))}
            {arquivos.length > 6 && (
              <p className="text-xs text-ink-3">
                Mostrando os 6 mais recentes de {arquivos.length}.
              </p>
            )}
          </div>
          <h3 className="mb-2 mt-5 font-semibold">Alertas abertos</h3>
          {alertas.length ? (
            alertas.map((a) => (
              <Pendencia
                key={a.id}
                tom={a.nivel === "critico" ? "crit" : a.nivel === "atencao" ? "warn" : "info"}
                titulo={a.tipo.replace(/_/g, " ")}
                texto={a.mensagem}
                acao={
                  <span className="whitespace-nowrap text-xs text-ink-3">
                    {dataHoraBR(a.criadoEm)}
                  </span>
                }
              />
            ))
          ) : (
            <p className="text-sm text-ink-3">Nenhum alerta aberto.</p>
          )}
        </Painel>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ consulta ao vivo (simulada) */

function ConsultaAoVivo({ cota }: { cota: PainelSaude["ingestao"] }) {
  const recarregar = useRecarregarTudo();
  const [passos, setPassos] = useState<PassoConsulta[]>([]);
  const [rodando, setRodando] = useState<"debitos" | "creditos" | null>(null);

  const consultar = async (servico: "debitos" | "creditos") => {
    setRodando(servico);
    setPassos([]);
    try {
      await consultarReceitaAgora(servico, (p) => setPassos((atual) => [...atual, p]));
      await recarregar();
    } finally {
      setRodando(null);
    }
  };

  const restante = (servico: string) =>
    cota.find((c) => c.servico === servico)?.cota_restante_hoje ?? COTA_DIA;
  const tom = (p: PassoConsulta): Tom =>
    p.etapa === "recusada" ? "crit" : p.etapa === "baixada" ? "good" : "info";

  return (
    <Painel
      titulo="Simular uma consulta à Receita agora"
      subtitulo="O mesmo caminho da integração: pedido, tíquete, situação, link temporário e download do arquivo"
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["debitos", "creditos"] as const).map((servico) => (
          <Button
            key={servico}
            variant="outline"
            disabled={rodando !== null}
            onClick={() => void consultar(servico)}
          >
            <CloudDownload aria-hidden="true" />
            {rodando === servico ? "Consultando…" : `Consultar ${servicoBR(servico).toLowerCase()}`}
            <span className="text-xs text-ink-3">
              ({restante(servico)} de {COTA_DIA} hoje)
            </span>
          </Button>
        ))}
      </div>
      {passos.length > 0 ? (
        <ol className="mt-4 grid gap-2.5" aria-live="polite">
          {passos.map((p, i) => (
            <li key={`${p.etapa}-${i}`} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
              <span className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-ink-3">
                {i + 1}.
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Estado tom={tom(p)}>{p.titulo}</Estado>
                  <span className="text-xs text-ink-3">{dataHoraBR(p.em)}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-ink-2">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">
          Cada consulta gasta 1 dos {COTA_DIA} pedidos do dia daquele serviço. Na demonstração, o
          processamento leva segundos; na API real, pode levar até 4 horas.
        </p>
      )}
    </Painel>
  );
}

function Tabela({
  cabecalho,
  linhas,
  direita = [],
}: {
  cabecalho: string[];
  linhas: ReactNode[][];
  direita?: number[];
}) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full border-collapse text-[13px] tabular">
        <thead>
          <tr className="border-b border-rule-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3">
            {cabecalho.map((c, i) => (
              <th
                key={c}
                className={cn(
                  "whitespace-nowrap px-2.5 py-2 font-semibold",
                  direita.includes(i) && "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b">
              {l.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    "whitespace-nowrap px-2.5 py-2",
                    direita.includes(j) && "text-right",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArquivoOriginal({ a }: { a: Arquivo }) {
  const servico = a.caminho.split("/")[1] ?? "";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(a.sha256);
      toast.success("SHA-256 copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o hash e use Ctrl+C.");
    }
  };
  return (
    <div className="grid gap-1.5 border-b pb-3 last:border-b-0">
      <div className="flex flex-wrap justify-between gap-2">
        <b>
          Arquivo #{a.id} ·{" "}
          {servico === "debitos" ? "Débitos" : servico === "creditos" ? "Créditos" : servico}
        </b>
        <span className="text-xs text-ink-3 tabular">
          {inteiro(a.bytes)} bytes · gerado {dataHoraBR(a.geradoEm)}
        </span>
      </div>
      <span className="break-all font-[family-name:var(--font-mono)] text-[11.5px] text-ink-2">
        {a.caminho}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <span className="min-w-0">
          <span className="eyebrow mr-2">SHA-256</span>
          <span className="break-all font-[family-name:var(--font-mono)] text-[11.5px]">
            {a.sha256}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => void copiar()}>
          Copiar
        </Button>
      </div>
      <details className="group">
        <summary className="cursor-pointer text-[12.5px] font-medium text-primary">
          Ver o arquivo como veio da Receita
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-background p-2.5 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed">
          {a.conteudo.length > 6000 ? `${a.conteudo.slice(0, 6000)}\n…` : a.conteudo}
        </pre>
      </details>
      {a.ni && a.ni.length === 14 && (
        <p className="text-[12.5px] text-ink-2">
          <Estado tom="warn">NI com 14 dígitos</Estado> A documentação diz 8. A integração compara
          só a raiz.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ explorador */

const LIMITE = 60;

function buscar(todos: Documento[], q: string): Documento[] {
  const t = termoBusca(q);
  if (!t) {
    return [
      ...todos.filter((d) => d.lado === "debito" && d.documento === 91),
      ...todos
        .filter((d) => d.lado === "credito" && d.aApropriar > 200)
        .sort((a, b) => b.apurado - a.apurado),
    ];
  }
  const numero = /^\d+$/.test(t) ? Number(t) : null;
  const exato = (d: Documento) => (numero !== null && numeroDoc(d.chave) === numero ? 0 : 1);
  return todos
    .filter(
      (d) =>
        d.chave.includes(t) ||
        (numero !== null && numeroDoc(d.chave) === numero) ||
        (t.length >= 8 && /^\d+$/.test(t) && emitente(d.chave).startsWith(t)) ||
        termoBusca(nomeDoc(d.documento)) === t,
    )
    .sort((a, b) => exato(a) - exato(b));
}

function ExploradorNotas() {
  const { dados, carregando, erro } = useDocumentos();
  const abrirNota = useAbrirNota();
  const [q, setQ] = useState("");
  const resultado = useMemo(() => (dados ? buscar(dados.todos, q) : []), [dados, q]);
  if (erro) return <ErroCarga erro={erro} />;
  if (carregando || !dados) return <Carregando texto="Carregando as notas…" />;
  const visiveis = resultado.slice(0, LIMITE);

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
        <Search className="size-4 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex.: número da nota, CNPJ do fornecedor, NFS-e"
          aria-label="Buscar notas"
          className="h-10 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <p className="text-xs text-ink-3" aria-live="polite">
        {q.trim()
          ? `${inteiro(resultado.length)} ${resultado.length === 1 ? "resultado" : "resultados"}${resultado.length > LIMITE ? ` (mostrando ${LIMITE})` : ""}`
          : `${inteiro(dados.todos.length)} documentos na base. Sugestões: NFS-e com débito e maiores créditos a apropriar.`}
      </p>
      {visiveis.length ? (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((d) => (
            <li key={`${d.lado}-${d.chave}`}>
              <button
                type="button"
                onClick={() => abrirNota(d.chave)}
                className="grid w-full gap-0.5 rounded-md border bg-background px-3 py-2 text-left hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex justify-between gap-2 text-[13px]">
                  <span>
                    <b>{descDoc(d)}</b> · {d.lado === "debito" ? "débito" : "crédito"}
                  </span>
                  <span className="tabular">{brl(d.apurado)}</span>
                </span>
                <span className="truncate font-[family-name:var(--font-mono)] text-[11px] text-ink-3">
                  {d.chave}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">Nada encontrado para “{q}”.</p>
      )}
    </div>
  );
}
