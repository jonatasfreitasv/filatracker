const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const LITERAL_ANSI_PATTERN = /(?:\\u001b|\\u001B|\\x1b|\\x1B|␛|�)\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitizeTerminalLogLine(value: string): string {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(LITERAL_ANSI_PATTERN, '')
    .replace(CONTROL_CHARS_PATTERN, '');
}
