const BLOCKED_TERMS = [
  '色情', '赌博', '博彩', '毒品', '反动', '恐怖主义', '枪支弹药', '代开发票', '买卖账号',
]

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<\/?(?:script|iframe|object|embed)\b/i, reason: '标签不能包含脚本或嵌入代码' },
  { pattern: /(?:https?:\/\/|www\.)/i, reason: '标签不能包含网址' },
  { pattern: /(?:微信|vx|qq|电话|手机)\s*[:：]?\s*[a-z0-9_-]{5,}/i, reason: '标签不能包含联系方式' },
]

export function getUnsafeTagReason(value: string): string | null {
  const tag = value.trim()
  const term = BLOCKED_TERMS.find((item) => tag.includes(item))
  if (term) return `标签包含敏感词“${term}”`
  return BLOCKED_PATTERNS.find((item) => item.pattern.test(tag))?.reason || null
}
