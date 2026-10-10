export declare const CSP: string
export declare const SECURITY_HEADERS: Record<string, string>
export declare function vercelConfig(): {
  $schema: string
  framework: string
  installCommand: string
  buildCommand: string
  outputDirectory: string
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
