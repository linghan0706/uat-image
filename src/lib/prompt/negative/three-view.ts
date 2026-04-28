/**
 * THREE_VIEW 预设的默认负向词。
 *
 * 除通用禁文字外，三视图额外禁止：阴影/投影/动态姿态/镜头畸变/背景道具。
 */

export const MJ_THREE_VIEW_NEGATIVE =
  "text, letters, words, watermark, logo, signature, label, " +
  "shadow, ground shadow, drop shadow, cast shadow, reflection, " +
  "action pose, dynamic pose, tilted head, turned head, " +
  "lens distortion, wide angle, fisheye, background props, " +
  "extra limbs, extra fingers, deformed hands, blurry";

export const DIFFUSION_THREE_VIEW_NEGATIVE =
  "shadow, ground shadow, drop shadow, cast shadow, reflection, " +
  "extra limbs, extra fingers, missing fingers, deformed hands, " +
  "text, watermark, logo, signature, label, annotation, " +
  "action pose, dynamic pose, tilted head, turned head, " +
  "smile, frown, angry, sad, surprised, open mouth, teeth showing, " +
  "lens distortion, wide angle, fisheye, barrel distortion, " +
  "background objects, props, furniture, decorations, patterns, " +
  "blurry, low resolution, pixelated, noise, artifacts, " +
  "body cut off, cropped figure, partial body, missing feet, missing head";
