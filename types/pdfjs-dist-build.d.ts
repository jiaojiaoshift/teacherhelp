declare module "pdfjs-dist/build/pdf.mjs";

declare module "pdfjs-dist/build/pdf.worker.mjs" {
  export class WorkerMessageHandler {
    static setup(handler: unknown, port: unknown): void;
  }
}
