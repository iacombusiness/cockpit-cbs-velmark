import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { GraficoDebitos } from "@/components/cbs/graficos";
import { useAbrirNota } from "@/components/cbs/nota-contexto";
import {
  Cabecalho,
  Carregando,
  ErroCarga,
  Kpi,
  KpiGrade,
  Legenda,
  Painel,
  Pendencia,
} from "@/components/cbs/pecas";
import {
  FaixaMeses,
  FormDecisao,
  MaioresDebitos,
  ModoEStatus,
  RelogioPrazo,
  TrilhaDecisoes,
} from "@/components/cbs/periodo";
import { Button } from "@/components/ui/button";
import type { Decisao, Diagnostico, Periodo } from "@/lib/cbs/api";
import {
  useDecisoes,
  useDiagnosticos,
  useDocumentos,
  usePeriodos,
  usePodeDecidir,
} from "@/lib/cbs/consultas";
import { brl, dataBR, inteiro, paBR } from "@/lib/cbs/formato";
import { INICIO_BASE_RECEITA } from "@/lib/cbs/saidas";
import {
  mesesDoAno,
  paPadrao,
  pendenciasDoPA,
  prazosDoPA,
  resumoPA,
  type AcaoPendencia,
  type Credito,
  type Debito,
  type ResumoPA,
} from "@/lib/cbs/modelo";

const PA_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

export const Route = createFileRoute("/_cockpit/periodo")({
  validateSearch: (s: Record<string, unknown>): { pa?: string } =>
    typeof s["pa"] === "string" && PA_VALIDO.test(s["pa"]) ? { pa: s["pa"] } : {},
  head: () => ({ meta: [{ title: "Período · Cockpit CBS" }] }),
  component: TelaPeriodo,
});

function TelaPeriodo() {
  const docs = useDocumentos();
  const periodos = usePeriodos();
  const decisoes = useDecisoes();
  const diags = useDiagnosticos();
  const erro = docs.erro ?? periodos.error ?? decisoes.error ?? diags.error;
  if (erro) return <ErroCarga erro={erro} />;
  if (!docs.dados || !periodos.data || !decisoes.data || !diags.data) return <Carregando />;
  return (
    <Conteudo
      debitos={docs.dados.debitos}
      creditos={docs.dados.creditos}
      periodos={periodos.data}
      decisoes={decisoes.data}
      diagnosticos={diags.data}
      hoje={docs.hoje}
    />
  );
}

/** Período sem linha na view (mês sem dados) ganha os prazos calculados e status "aberto". */
function periodoOuPadrao(periodos: Periodo[], pa: string): Periodo {
  const achado = periodos.find((p) => p.pa === pa);
  if (achado) return achado;
  const p = prazosDoPA(pa);
  return {
    pa,
    modo: p.modo,
    status: "aberto",
    disponivelAte: p.disponivelAte,
    prazoAjuste: p.prazoAjuste,
    situacaoPrazo: p.modo === "ano_teste" ? "informativo" : "no_prazo",
    responsavel: null,
    observacao: null,
  };
}

function Conteudo({
  debitos,
  creditos,
  periodos,
  decisoes,
  diagnosticos,
  hoje,
}: {
  debitos: Debito[];
  creditos: Credito[];
  periodos: Periodo[];
  decisoes: Decisao[];
  diagnosticos: Map<string, Diagnostico>;
  hoje: string;
}) {
  const { pa: paBusca } = Route.useSearch();
  const navegar = useNavigate({ from: Route.fullPath });
  const abrirNota = useAbrirNota();
  const pode = usePodeDecidir().data === true;
  const [substituir, setSubstituir] = useState<Decisao | null>(null);
  const refForm = useRef<HTMLDivElement>(null);
  const refDecisao = useRef<HTMLSelectElement>(null);

  const base = useMemo(() => {
    const comDados = [...new Set([...debitos, ...creditos].map((d) => d.pa))];
    const exportacao = new Set(
      [...diagnosticos].filter(([, d]) => d === "exportacao_com_cbs").map(([chave]) => chave),
    );
    const paComExportacao = new Set(
      debitos.filter((d) => exportacao.has(d.chave)).map((d) => d.pa),
    );
    const prazoDe = (pa: string) =>
      periodos.find((p) => p.pa === pa)?.prazoAjuste ?? prazosDoPA(pa).prazoAjuste;
    const anos = [...new Set([...comDados, hoje.slice(0, 7)].map((pa) => Number(pa.slice(0, 4))))];
    return { comDados, exportacao, paComExportacao, prazoDe, anos: anos.sort() };
  }, [debitos, creditos, diagnosticos, periodos, hoje]);

  const pa = paBusca ?? paPadrao(base.comDados, base.prazoDe, hoje);
  const ano = Number(pa.slice(0, 4));
  const resumos = useMemo(
    () => mesesDoAno(ano).map((m) => resumoPA(debitos, creditos, m)),
    [ano, debitos, creditos],
  );
  const r: ResumoPA = resumos.find((x) => x.pa === pa) ?? resumoPA(debitos, creditos, pa);
  const periodo = periodoOuPadrao(periodos, pa);
  const decisoesPA = decisoes.filter((d) => d.pa === pa);
  const pendencias = pendenciasDoPA(
    pa,
    debitos,
    creditos,
    base.exportacao,
    decisoesPA.length,
    hoje,
  );

  const irPara = (novo: string) => {
    setSubstituir(null);
    void navegar({ search: { pa: novo } });
  };

  const focarForm = () => {
    refForm.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    refDecisao.current?.focus({ preventScroll: true });
  };

  const acaoDe = (a: AcaoPendencia | undefined) => {
    if (!a) return null;
    switch (a.tipo) {
      case "exportacao":
        return (
          <Button asChild variant="outline" size="sm">
            <Link to="/saidas">Ver notas</Link>
          </Button>
        );
      case "creditos":
        return (
          <Button asChild variant="outline" size="sm">
            <Link to="/creditos">Ver créditos</Link>
          </Button>
        );
      case "nota":
        return (
          <Button variant="outline" size="sm" onClick={() => abrirNota(a.chave)}>
            Abrir nota
          </Button>
        );
      case "decidir":
        if (!pode) return null;
        return (
          <Button variant="outline" size="sm" onClick={focarForm}>
            Registrar
          </Button>
        );
    }
  };

  const anoAnterior = base.anos.includes(ano - 1);
  const anoSeguinte = base.anos.includes(ano + 1);

  return (
    <>
      <Cabecalho
        sobretitulo="Cockpit do período"
        titulo="O que a Receita apurou, e o que decidimos sobre isso"
        texto="Escolha o período de apuração. Os números são os da Apuração Assistida da CBS; cada decisão registrada guarda o retrato do que você estava vendo."
        lado={
          (anoAnterior || anoSeguinte) && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={!anoAnterior}
                onClick={() => irPara(`${ano - 1}-12`)}
                aria-label={`Ir para ${ano - 1}`}
              >
                <ChevronLeft />
              </Button>
              <span className="font-[family-name:var(--font-display)] font-semibold">{ano}</span>
              <Button
                variant="ghost"
                size="icon"
                disabled={!anoSeguinte}
                onClick={() => irPara(`${ano + 1}-01`)}
                aria-label={`Ir para ${ano + 1}`}
              >
                <ChevronRight />
              </Button>
            </div>
          )
        }
      />

      <FaixaMeses
        resumos={resumos}
        selecionado={pa}
        comExportacao={base.paComExportacao}
        aoSelecionar={irPara}
      />

      <Painel
        titulo={`Débito apurado por período, ${ano}`}
        acao={
          <Legenda
            itens={[
              { serie: "s1", rotulo: "NF-e" },
              { serie: "s2", rotulo: "NFS-e" },
            ]}
          />
        }
      >
        <GraficoDebitos
          resumos={resumos}
          selecionado={pa}
          aoSelecionar={irPara}
          rotuloDica={(x) => (
            <>
              <b>PA {paBR(x.pa)}</b>
              <br />
              NF-e {brl(x.debitoNfe)}
              <br />
              NFS-e {brl(x.debitoNfse)}
              <br />
              Total {brl(x.debitoApurado)} · {inteiro(x.nDebitos)} documentos
            </>
          )}
        />
        <p className="mt-2 text-xs text-ink-3">
          Base parcial: só documentos incluídos ou alterados pela Receita desde{" "}
          {dataBR(INICIO_BASE_RECEITA)}. Os meses anteriores aparecem incompletos e não são o
          fechamento do mês.
        </p>
      </Painel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Painel
            titulo={
              <span className="flex flex-wrap items-center gap-3.5">
                <span className="stamp" aria-label={`Período ${paBR(pa)}`}>
                  <small className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-2">
                    PA
                  </small>
                  {paBR(pa)}
                </span>
                <ModoEStatus periodo={periodo} podeAlterar={pode} />
              </span>
            }
          >
            <RelogioPrazo pa={pa} periodo={periodo} hoje={hoje} />
          </Painel>

          <KpiGrade>
            <Kpi
              rotulo="Débito apurado"
              valor={brl(r.debitoApurado)}
              sub={`${inteiro(r.nDebitos)} documentos`}
              apagado={!r.debitoApurado}
            />
            <Kpi
              rotulo="Extinto"
              valor={brl(r.debitoExtinto)}
              sub="compensado ou pago"
              apagado={!r.debitoExtinto}
            />
            <Kpi rotulo="Saldo devedor" valor={brl(r.saldoDevedor)} apagado={!r.saldoDevedor} />
            <Kpi
              rotulo="Crédito apurado"
              valor={brl(r.creditoApurado)}
              sub={`${inteiro(r.nCreditos)} documentos`}
              apagado={!r.creditoApurado}
            />
            <Kpi
              rotulo="A apropriar"
              valor={brl(r.aApropriar)}
              sub="aguarda o fornecedor"
              apagado={!r.aApropriar}
            />
            <Kpi
              rotulo="Saldo credor"
              valor={brl(r.saldoCredor)}
              sub="disponível para uso"
              apagado={!r.saldoCredor}
            />
          </KpiGrade>

          <Painel titulo="Maiores débitos do período" subtitulo="Clique para abrir a nota">
            <MaioresDebitos
              debitos={debitos.filter((d) => d.pa === pa)}
              exportacaoComCbs={base.exportacao}
            />
          </Painel>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Painel
            titulo="Pendências"
            subtitulo={`${pendencias.length} ${pendencias.length === 1 ? "item" : "itens"}`}
          >
            {pendencias.map((p) => (
              <Pendencia
                key={p.titulo}
                tom={p.tom}
                titulo={p.titulo}
                texto={p.texto}
                acao={acaoDe(p.acao)}
              />
            ))}
          </Painel>

          <div ref={refForm}>
            <Painel titulo="Registrar decisão" subtitulo={`PA ${paBR(pa)}`}>
              {pode ? (
                <FormDecisao
                  key={pa}
                  pa={pa}
                  modo={periodo.modo}
                  substituir={substituir}
                  aoCancelarSubstituicao={() => setSubstituir(null)}
                  refDecisao={refDecisao}
                />
              ) : (
                <p className="text-sm text-ink-2">
                  Seu acesso é de leitura: você acompanha as decisões na trilha abaixo, mas quem
                  registra é o administrador do cockpit.
                </p>
              )}
            </Painel>
          </div>

          <Painel titulo="Trilha de decisões" subtitulo={`PA ${paBR(pa)}`}>
            <TrilhaDecisoes
              decisoes={decisoesPA}
              {...(pode
                ? {
                    aoSubstituir: (d: Decisao) => {
                      setSubstituir(d);
                      focarForm();
                    },
                  }
                : {})}
            />
          </Painel>
        </div>
      </div>
    </>
  );
}
