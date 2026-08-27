declare module "markdown-it" {
  export default class MarkdownIt {
    constructor(options?: Record<string, unknown>);
    render(source: string): string;
    renderInline(source: string): string;
  }
}
