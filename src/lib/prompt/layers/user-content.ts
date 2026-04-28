/**
 * Layer 3 —— user_content 组装
 *
 * 把 CharacterProfile 渲染段 + 用户可选补充文本（part4 参考词/剧本额外说明）
 * 拼装成用户层提示词内容。
 *
 * 与 style/part1 的顺序由 engine.ts 统一控制，本层只负责 user 层的合并。
 */

import { renderCharacterProfile, type CharacterProfile } from "@/lib/prompt/character-profile";

export type UserContentInput = {
  profile: CharacterProfile;
  /** 可选英文参考词，追加到 profile 之后。 */
  part4?: string | null;
  /** 可选剧本自由补充（如场景暗示、情绪关键词），不含角色视觉设定。 */
  extra_user_text?: string | null;
};

export const buildUserContentBlock = (input: UserContentInput): string => {
  const sections: string[] = [renderCharacterProfile(input.profile)];

  const extra = input.extra_user_text?.trim();
  if (extra) {
    sections.push(`补充说明：\n${extra}`);
  }

  const part4 = input.part4?.trim();
  if (part4) {
    const withPrefix = /^参考风格\s*[:：]/.test(part4) ? part4 : `参考风格：\n${part4}`;
    sections.push(withPrefix);
  }

  return sections.join("\n\n");
};
