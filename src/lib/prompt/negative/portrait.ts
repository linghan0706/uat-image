/**
 * PORTRAIT 预设的默认负向词。
 *
 * 分两套：
 * - MJ_PORTRAIT_NEGATIVE：用于 Midjourney 的 --no 语法（由 sky-rsa-provider 的
 *   buildMjTextToImageBody 写入 prompt 末尾）。MJ 对 --no 的长度敏感，保持精简。
 * - DIFFUSION_PORTRAIT_NEGATIVE：用于标准扩散模型的 negative_prompt 字段，
 *   可长可详尽。
 */

/** MJ：精简核心禁令，避免过长被 MJ 截断。 */
export const MJ_PORTRAIT_NEGATIVE =
  "text, letters, words, watermark, logo, signature, label, caption, " +
  "subtitle, numbers, symbols, emoji, barcode, qr code, stamp, seal, " +
  "annotation, ui elements, frame, border, grid, table, measurement lines, " +
  "typography on clothing, text on props, readable patterns, " +
  "wrong gender, gender swap, male to female, female to male, " +
  "multiple people, duplicate person, duplicate face, extra face, front and back view, side view, " +
  "close-up, headshot, bust, half body, cropped body, side profile, " +
  "collage, multiple views, split panel, picture-in-picture, character sheet, model sheet, " +
  "design sheet, reference sheet, turnaround sheet, sketch, oil painting, poster, cinematic still, " +
  "scene background, bokeh, dramatic lighting, " +
  "extra limbs, extra fingers, deformed hands, blurry, low resolution";

/** 通用扩散模型：完整详尽。 */
export const DIFFUSION_PORTRAIT_NEGATIVE =
  "text, letters, words, characters, calligraphy, handwriting, " +
  "watermark, logo, signature, label, caption, subtitle, annotation, " +
  "numbers, digits, symbols, emoji, barcode, qr code, stamp, seal, " +
  "ui elements, frame, border, speech bubble, callout, info panel, " +
  "grid, table, page layout, title block, margins, measurement lines, guide lines, " +
  "typography on clothing, text on props, readable patterns, " +
  "wrong gender, gender swap, male to female, female to male, " +
  "male body when female is specified, female body when male is specified, " +
  "beard when female is specified, breasts when male is specified, " +
  "multiple people, duplicate person, duplicate body, duplicate face, extra face, " +
  "front and back view, side view, rear view, detail inset, " +
  "close-up, headshot, face close-up, bust portrait, half body, cropped body, " +
  "cropped feet, cropped head, side profile, three-quarter profile, looking away, " +
  "collage, multiple views, split panel, picture-in-picture, character sheet, model sheet, " +
  "design sheet, reference sheet, specification sheet, turnaround sheet, " +
  "rough sketch, unfinished sketch, concept thumbnails, oil painting, painterly brush strokes, " +
  "poster composition, cinematic still, movie scene, scenic background, forest, city street, room interior, " +
  "bokeh, shallow depth of field, dramatic rim light, neon light, smoke, rain, fire, " +
  "extra limbs, extra fingers, missing fingers, deformed hands, " +
  "blurry, low resolution, pixelated, noise, artifacts";
