// Tipos mínimos do nodemailer — só o que lib/email.ts usa. Evita depender
// de @types/nodemailer acompanhar a versão instalada.
declare module "nodemailer" {
  type Transporte = {
    sendMail(mensagem: {
      from: string;
      to: string;
      subject: string;
      text?: string;
      html?: string;
    }): Promise<unknown>;
  };

  const nodemailer: {
    createTransport(opcoes: {
      host: string;
      port: number;
      secure: boolean;
      auth?: { user: string; pass: string };
    }): Transporte;
  };

  export default nodemailer;
}
