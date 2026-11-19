// Carregado com `node --import ./testes/unidade/registrar.mjs`: deixa o Node
// (que já remove os tipos do TypeScript sozinho) achar os módulos do app como
// o Next acha — "@/lib/x" vira lib/x.ts e "next/navigation" vira o .js.
import { register } from "node:module";

register("./resolver.mjs", import.meta.url);
