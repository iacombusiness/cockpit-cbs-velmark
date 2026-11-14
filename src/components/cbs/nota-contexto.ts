import { createContext, useContext } from "react";

/** Abre a gaveta de detalhe (NotaProvider, em nota.tsx) para uma chave de acesso. */
export const NotaCtx = createContext<((chave: string) => void) | null>(null);

/** Abre a gaveta de detalhe de qualquer documento pela chave de acesso. */
export function useAbrirNota(): (chave: string) => void {
  const abrir = useContext(NotaCtx);
  if (!abrir) throw new Error("useAbrirNota precisa estar dentro de <NotaProvider>.");
  return abrir;
}
