import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { compacto, paCurto } from "@/lib/cbs/formato";
import type { ResumoPA } from "@/lib/cbs/modelo";

/*
 * Gráficos SVG à mão (regras de visualização do projeto):
 * escala única, nunca dois eixos Y; barras finas com ponta arredondada de 4px e base reta;
 * 2px de vão entre segmentos empilhados; grade recessiva; dica (tooltip) em toda marca;
 * texto sempre na cor de texto, nunca na cor da série. Cada gráfico mede a própria caixa.
 */

function useLargura<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.round(entrada.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

/* ------------------------------------------------------------------ dica flutuante */

interface EstadoDica {
  x: number;
  y: number;
  conteudo: ReactNode;
}

function useDica() {
  const [dica, setDica] = useState<EstadoDica | null>(null);
  return {
    dica,
    noPonteiro: (conteudo: ReactNode) => ({
      onPointerMove: (e: PointerEvent<SVGElement>) =>
        setDica({ x: e.clientX, y: e.clientY, conteudo }),
      onPointerLeave: () => setDica(null),
      onFocus: (e: { currentTarget: SVGElement }) => {
        const r = e.currentTarget.getBoundingClientRect();
        setDica({ x: r.right, y: r.top, conteudo });
      },
      onBlur: () => setDica(null),
    }),
    esconder: () => setDica(null),
  };
}

function DicaFlutuante({ dica }: { dica: EstadoDica | null }) {
  if (!dica) return null;
  const esquerda = Math.min(
    dica.x + 14,
    (typeof window === "undefined" ? 1200 : window.innerWidth) - 270,
  );
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-[260px] rounded-md bg-foreground px-2.5 py-2 text-xs leading-relaxed text-background shadow-lg tabular"
      style={{ left: Math.max(8, esquerda), top: dica.y + 14 }}
    >
      {dica.conteudo}
    </div>
  );
}

export function Amostra({ serie }: { serie: "s1" | "s2" }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-1.5 inline-block size-2 rounded-sm ${serie === "s1" ? "bg-s1" : "bg-s2"}`}
    />
  );
}

/* ------------------------------------------------------------------ escala e formas */

/** Máximo "redondo" com 3 intervalos (1, 2, 2,5, 5 × 10ⁿ). */
function escala(maximo: number): { max: number; ticks: number[] } {
  if (maximo <= 0) return { max: 1, ticks: [0, 1] };
  const bruto = maximo / 3;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  return { max: passo * 3, ticks: [0, passo, passo * 2, passo * 3] };
}

function topoArredondado(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function direitaArredondada(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

/* ------------------------------------------------------------------ débito por PA (colunas empilhadas) */

export function GraficoDebitos({
  resumos,
  selecionado,
  aoSelecionar,
  rotuloDica,
}: {
  resumos: ResumoPA[];
  selecionado: string;
  aoSelecionar: (pa: string) => void;
  rotuloDica: (r: ResumoPA) => ReactNode;
}) {
  const [ref, larguraMedida] = useLargura<HTMLDivElement>();
  const { dica, noPonteiro, esconder } = useDica();
  const W = Math.max(280, Math.min(900, larguraMedida || 600));
  const H = W < 520 ? 210 : 250;
  const m = { t: 22, r: 6, b: 30, l: 46 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const { max, ticks } = escala(Math.max(...resumos.map((r) => r.debitoApurado), 0));
  const banda = iw / Math.max(1, resumos.length);
  const bw = Math.min(24, banda * 0.56);
  const y = (v: number) => m.t + ih - (v / max) * ih;

  const tecla = (pa: string) => (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      aoSelecionar(pa);
    }
  };

  return (
    <div ref={ref} className="min-w-0">
      <svg
        className="cbs-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Débito de CBS apurado por período de apuração, NF-e e NFS-e"
      >
        <g className="grade">
          {ticks.map((t) => (
            <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g className="eixo">
          {ticks.map((t) => (
            <text key={t} x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {t === 0 ? "0" : compacto(t)}
            </text>
          ))}
        </g>
        {resumos.map((r, i) => {
          const x0 = m.l + banda * i;
          const x = x0 + (banda - bw) / 2;
          const sel = r.pa === selecionado;
          const h1 = (r.debitoNfe / max) * ih;
          const h2 = (r.debitoNfse / max) * ih;
          const vao = h1 > 0 && h2 > 0 ? 2 : 0;
          return (
            <g key={r.pa}>
              {sel && (
                <rect
                  className="faixa-sel"
                  x={x0 + 2}
                  y={m.t - 14}
                  width={banda - 4}
                  height={ih + 14}
                  rx={6}
                />
              )}
              {h1 > 0 &&
                (h2 > 0 ? (
                  <rect className="s1" x={x} y={y(0) - h1} width={bw} height={h1} />
                ) : (
                  <path className="s1" d={topoArredondado(x, y(0) - h1, bw, h1, 4)} />
                ))}
              {h2 > 0 && (
                <path className="s2" d={topoArredondado(x, y(0) - h1 - vao - h2, bw, h2, 4)} />
              )}
              {(banda >= 26 || i % 2 === 0 || sel) && (
                <text
                  className={`rotulo${sel ? " forte" : ""}`}
                  x={x0 + banda / 2}
                  y={H - 10}
                  textAnchor="middle"
                >
                  {paCurto(r.pa)}
                </text>
              )}
              {sel && r.debitoApurado > 0 && (
                <text
                  className="rotulo forte"
                  x={x0 + banda / 2}
                  y={y(0) - h1 - vao - h2 - 6}
                  textAnchor="middle"
                >
                  {compacto(Math.round(r.debitoApurado))}
                </text>
              )}
              <rect
                className="mira"
                data-clicavel="true"
                role="button"
                tabIndex={0}
                aria-label={`Abrir o período ${paCurto(r.pa)}`}
                x={x0}
                y={m.t - 14}
                width={banda}
                height={ih + 14}
                onClick={() => {
                  esconder();
                  aoSelecionar(r.pa);
                }}
                onKeyDown={tecla(r.pa)}
                {...noPonteiro(rotuloDica(r))}
              />
            </g>
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
      </svg>
      <DicaFlutuante dica={dica} />
    </div>
  );
}

/* ------------------------------------------------------------------ barras horizontais */

export interface LinhaBarra {
  chave: string;
  rotulo: string;
  valor: string;
  forte?: boolean;
  segs: { v: number; serie: "s1" | "s2" }[];
  dica?: ReactNode;
}

export function BarrasH({ linhas, aria }: { linhas: LinhaBarra[]; aria: string }) {
  const [ref, larguraMedida] = useLargura<HTMLDivElement>();
  const { dica, noPonteiro } = useDica();
  const W = Math.max(280, Math.min(900, larguraMedida || 600));
  const estreito = W < 560;
  const bh = estreito ? 14 : 18;
  const alturaLinha = estreito ? 46 : 34;
  const m = estreito ? { t: 4, r: 8, b: 24, l: 0 } : { t: 8, r: 190, b: 26, l: 96 };
  const H = m.t + m.b + alturaLinha * linhas.length;
  const iw = W - m.l - m.r;
  const totalMax = Math.max(...linhas.map((l) => l.segs.reduce((a, s) => a + s.v, 0)), 0);
  const { max, ticks } = escala(totalMax);
  const x = (v: number) => m.l + (v / max) * iw;

  return (
    <div ref={ref} className="min-w-0">
      <svg className="cbs-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <g className="grade">
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} />
          ))}
        </g>
        <g className="eixo">
          {ticks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={H - 8}
              textAnchor={
                estreito && i === ticks.length - 1
                  ? "end"
                  : estreito && i === 0
                    ? "start"
                    : "middle"
              }
            >
              {t === 0 ? "0" : compacto(t)}
            </text>
          ))}
        </g>
        {linhas.map((l, i) => {
          const topo = m.t + i * alturaLinha;
          const yy = estreito ? topo + 20 : topo + (alturaLinha - bh) / 2;
          const segs = l.segs.filter((s) => s.v > 0);
          let cx = x(0);
          const formas = segs.map((s, j) => {
            const w = (s.v / max) * iw;
            const ultimo = j === segs.length - 1;
            const forma = ultimo ? (
              <path key={j} className={s.serie} d={direitaArredondada(cx, yy, w, bh, 4)} />
            ) : (
              <rect key={j} className={s.serie} x={cx} y={yy} width={w} height={bh} />
            );
            cx += w + (ultimo ? 0 : 2);
            return forma;
          });
          return (
            <g key={l.chave}>
              {estreito ? (
                <>
                  <text className="rotulo" x={6} y={topo + 13}>
                    {l.rotulo}
                  </text>
                  <text
                    className={`rotulo${l.forte ? " forte" : ""}`}
                    x={W - m.r}
                    y={topo + 13}
                    textAnchor="end"
                  >
                    {l.valor}
                  </text>
                </>
              ) : (
                <text className="rotulo" x={m.l - 10} y={yy + bh / 2 + 4} textAnchor="end">
                  {l.rotulo}
                </text>
              )}
              {formas}
              {!estreito && (
                <text className={`rotulo${l.forte ? " forte" : ""}`} x={cx + 8} y={yy + bh / 2 + 4}>
                  {l.valor}
                </text>
              )}
              {l.dica !== undefined && (
                <rect
                  className="mira"
                  tabIndex={0}
                  x={0}
                  y={topo}
                  width={W}
                  height={alturaLinha}
                  {...noPonteiro(l.dica)}
                />
              )}
            </g>
          );
        })}
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} stroke="var(--ink-3)" strokeWidth={1} />
      </svg>
      <DicaFlutuante dica={dica} />
    </div>
  );
}
