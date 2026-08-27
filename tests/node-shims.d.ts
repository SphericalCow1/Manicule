declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    ok(actual: unknown, message?: string): void;
  };
  export default assert;
}

declare module "node:test" {
  export default function test(name: string, callback: () => void | Promise<void>): void;
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare const process: {
  cwd(): string;
};
