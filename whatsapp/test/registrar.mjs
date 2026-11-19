// Carregado com `node --import ./test/registrar.mjs`: troca baileys, pino e
// qrcode por versões falsas (test/mocks) — os testes não falam com o WhatsApp.
import { register } from "node:module";

register("./resolver.mjs", import.meta.url);
