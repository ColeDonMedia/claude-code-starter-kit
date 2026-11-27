// Text that tries to steer an AI agent: shared by the injection warning (hooks/inject-warn.mjs). Pattern matching only, no model
// and no network, so it is fast and the same input always gives the same answer; it also misses clever attacks. A hit is a WARNING
// that the content may be trying to give orders, never a block: security writing quotes these phrases legitimately.
// Idea from Lasso Security's claude-hooks (MIT; categories, warn-don't-block); the patterns here are written for this kit.
export const INJECTION = [
  ["override", "high", /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|every\s+)?(of\s+)?(the\s+|your\s+|my\s+)?(previous|prior|above|earlier|preceding|original|system)\s+(instructions?|prompts?|rules|directions|guidelines)/i, "tells the AI to drop its instructions"],
  ["new-instructions", "high", /\b(new|updated|real|actual)\s+(system\s+)?instructions?\s*(:|follow)|\byour\s+(new|real|true)\s+(task|instructions?|goal)\s+(is|are)\b/i, "claims to replace the AI's instructions"],
  ["fake-system", "high", /<\/?\s*(system|system_prompt|im_start|im_end|assistant|admin)\s*>|\[\/?(INST|SYS)\]|<<\s*SYS\s*>>|^\s*(system|assistant)\s*:\s*\S/im, "fake system or role markers"],
  ["hide-from-user", "high", /\b(do not|don't|never)\s+(tell|inform|mention|show|reveal|alert)\b[^.\n]{0,40}\b(the\s+)?user\b|\bwithout\s+(telling|informing|notifying|asking)\s+(the\s+)?user\b/i, "asks the AI to hide something from the user"],
  ["exfiltrate", "high", /\b(send|post|upload|forward|transmit|include|append|paste)\b[^\n]{0,60}?(api[\s_-]?keys?|tokens?|passwords?|secrets?|credentials?|\.env\b|ssh\s+keys?|id_rsa|cookies?|system\s+prompt|conversation)[^\n]{0,60}?\b(to|into|at)\s+\S/i, "asks the AI to send secrets or the conversation somewhere"],
  ["run-commands", "medium", /\b(run|execute|exec)\s+(this|the\s+following)\s+(command|script|code)\b|\bcurl\s+[^\s|]+\s*\|\s*(ba|z)?sh\b|\b(iex|Invoke-Expression)\b/i, "asks the AI to run a command"],
  ["role-play", "medium", /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+(to\s+be|you\s+are)|act\s+as\s+(an?\s+)?(unrestricted|jailbroken|evil|dan))\b|\bdo\s+anything\s+now\b|\bdeveloper\s+mode\b/i, "tries to give the AI a new role"],
  ["switch-off", "medium", /\b(disable|bypass|turn\s+off|skip|ignore)\s+(the\s+|your\s+|all\s+)?(safety|security|permission|sandbox|guardrails?|approval|hooks?)\b/i, "asks the AI to switch off safeguards"],
  ["prompt-leak", "medium", /\b(print|show|reveal|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+prompt|instructions|initial\s+prompt|hidden\s+prompt)\b/i, "asks the AI to reveal its instructions"],
];

const HIDDEN = [
  ["hidden-tags", "high", /[\u{E0000}-\u{E007F}]/u, "invisible Unicode tag characters (a known way to hide orders to an AI)"],
  ["hidden-bidi", "high", /[\u202A-\u202E\u2066-\u2069]/, "hidden text-direction characters"],
  ["zero-width", "medium", /[\u200B-\u200F\u2060-\u2064]{3,}/, "a run of zero-width characters"],
];

const COMMENT = /<!--([\s\S]{0,2000}?)-->/g;

// Findings for one piece of fetched or tool-returned text. Each: { id, severity, why, sample }.
export function scanInjection(text) {
  const s = String(text ?? "").slice(0, 400_000);
  const out = [];
  const seen = new Set();
  const add = (id, severity, why, sample = "") => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, severity, why, sample: sample.replace(/\s+/g, " ").trim().slice(0, 90) });
  };
  for (const [id, sev, re, why] of INJECTION) {
    const m = re.exec(s);
    if (m) add(id, sev, why, s.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20));
  }
  for (const [id, sev, re, why] of HIDDEN) if (re.test(s)) add(id, sev, why);
  for (const m of s.matchAll(COMMENT))
    if (/\b(ignore|instruction|assistant|claude|ai\b|model|execute|run|send|secret|system)/i.test(m[1]) && m[1].trim().length > 30)
      add("hidden-comment", "medium", "an HTML comment (invisible on the page) with instruction-like text", m[1]);
  return out;
}
