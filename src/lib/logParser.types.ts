export interface ParsedLogRow {
  /** 原始日志中的行号（从 1 开始） */
  lineNumber: number
  /** 已转义并完成高亮的 <tr> HTML */
  html: string
}
