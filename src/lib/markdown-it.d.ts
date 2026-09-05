declare module "markdown-it" {
  export default class MarkdownIt {
    constructor(options?: Record<string, unknown>);
    parse(
      source: string,
      env?: Record<string, unknown>,
    ): Array<{ type: string; info: string; markup: string }>;
    render(source: string): string;
    renderInline(source: string): string;
  }
}
