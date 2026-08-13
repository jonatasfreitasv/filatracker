//! Strip JSONC (comments + trailing commas) and parse into `serde_json::Value`.

use std::fs;
use std::path::Path;

fn strip_jsonc(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let n = chars.len();
    let mut i = 0;

    while i < n {
        match chars[i] {
            '"' => {
                out.push(chars[i]);
                i += 1;
                while i < n {
                    if chars[i] == '\\' && i + 1 < n {
                        out.push(chars[i]);
                        out.push(chars[i + 1]);
                        i += 2;
                    } else if chars[i] == '"' {
                        out.push(chars[i]);
                        i += 1;
                        break;
                    } else {
                        out.push(chars[i]);
                        i += 1;
                    }
                }
            }
            '/' if i + 1 < n && chars[i + 1] == '/' => {
                while i < n && chars[i] != '\n' {
                    i += 1;
                }
            }
            '/' if i + 1 < n && chars[i + 1] == '*' => {
                i += 2;
                while i + 1 < n && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                if i + 1 < n {
                    i += 2;
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }

    fix_trailing_commas(&out)
}

fn fix_trailing_commas(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(n);
    let mut i = 0;

    while i < n {
        if chars[i] == ',' {
            let mut j = i + 1;
            while j < n && matches!(chars[j], ' ' | '\t' | '\n' | '\r') {
                j += 1;
            }
            if j < n && matches!(chars[j], '}' | ']') {
                i += 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Read `wrangler.jsonc` and return parsed JSON, or `None` if missing / invalid.
pub fn parse_wrangler_jsonc_file(path: &Path) -> Option<serde_json::Value> {
    let text = fs::read_to_string(path).ok()?;
    let stripped = strip_jsonc(&text);
    serde_json::from_str(&stripped).ok()
}
