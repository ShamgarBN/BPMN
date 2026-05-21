declare module 'bpmn-js/lib/Modeler' {
  interface ImportXMLResult {
    warnings: string[];
  }
  interface SaveXMLResult {
    xml: string;
    warnings?: string[];
  }
  interface SaveSVGResult {
    svg: string;
  }
  interface ModelerOptions {
    container: HTMLElement | string;
    additionalModules?: unknown[];
    keyboard?: { bindTo?: HTMLElement | Document };
  }

  export default class BpmnModeler {
    constructor(options: ModelerOptions);
    importXML(xml: string): Promise<ImportXMLResult>;
    saveXML(options?: { format?: boolean; preamble?: boolean }): Promise<SaveXMLResult>;
    saveSVG(): Promise<SaveSVGResult>;
    destroy(): void;
    get(name: string): unknown;
    on(event: string, priority: number, callback: (event: unknown) => void): void;
    on(event: string, callback: (event: unknown) => void): void;
    off(event: string, callback?: (event: unknown) => void): void;
  }
}

declare module 'bpmn-auto-layout' {
  /** Returns the laid-out BPMN XML string directly (not wrapped in an object). */
  export function layoutProcess(xml: string, options?: { layoutAlgorithm?: string }): Promise<string>;
}

/**
 * Compile-time constant injected by Vite's `define` (see vite.config.ts).
 * Carries the package.json version so the renderer can stamp project files
 * with the version of the app that wrote them.
 */
declare const __APP_VERSION__: string
