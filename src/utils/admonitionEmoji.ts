/**
 * Splits leading emoji from admonition title (Issue #119).
 *
 * Unicode-safe emoji detection without external dependencies.
 * Handles single emoji, skin tones, ZWJ sequences, flags, and keycaps,
 * while strictly avoiding false positives on numbers, copyright, trademark, etc.
 */

const EMOJI_BASE =
  String.raw`\p{RI}\p{RI}` +
  String.raw`|\p{Emoji_Presentation}` +
  String.raw`|\p{Extended_Pictographic}\uFE0F` +
  String.raw`|[0-9#*]\uFE0F?\u20E3`;

const EMOJI_CHAR = String.raw`(?:${EMOJI_BASE})(?:\uFE0F|\p{Emoji_Modifier}|\u200D(?:${EMOJI_BASE}))*`;

const LEADING_EMOJI = new RegExp(`^((?:${EMOJI_CHAR})\\s?)+`, "u");

export interface SplitAdmonitionEmojiResult {
  emoji: string;
  remainder: string;
}

export function splitLeadingEmoji(title: string): SplitAdmonitionEmojiResult {
  if (!title) {
    return { emoji: "", remainder: "" };
  }
  const trimmed = title.trimStart();
  const match = LEADING_EMOJI.exec(trimmed);
  if (!match) {
    return { emoji: "", remainder: title };
  }
  return {
    emoji: match[0].trim(),
    remainder: trimmed.slice(match[0].length).trim(),
  };
}
