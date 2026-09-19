const actionBeforeObject = /\b(?:add|show|write|render|display|include|generate|put|spell|print)\b.{0,48}\b(?:readable\s+)?(?:text|title|caption|subtitle|word|lettering|logo|watermark)\b/iu;
const objectBeforeAction = /\b(?:readable\s+)?(?:text|title|caption|subtitle|word|lettering|logo|watermark)\b.{0,48}\b(?:add|show|write|render|display|include|generate|put|spell|print)\b/iu;
const quotedTextDirective = /\b(?:text|title|caption|subtitle|word|lettering)\s*[:=]\s*["'“‘][^"'”’]{1,80}["'”’]/iu;
const koreanObjectThenAction = /(?:글씨|텍스트|자막|문구|제목|로고|워터마크).{0,24}(?:넣|표시|생성|쓰|작성|추가|보이|새기)/u;
const koreanActionThenObject = /(?:넣|표시|생성|쓰|작성|추가|보이|새기).{0,24}(?:글씨|텍스트|자막|문구|제목|로고|워터마크)/u;
const negativePrefix = /(?:\b(?:no|not|without|exclude|forbid|avoid|remove)\b|(?:없게|없이|금지|배제|제외|제거))/iu;
const negativeSuffix = /(?:\b(?:not|forbidden|prohibited)\b|(?:지\s*마|지\s*않|말\s*것|금지|배제|제외|제거))/iu;
const typographyPayloadKeys = new Set(['text', 'copy', 'caption', 'subtitle', 'overlaytext', 'onscreentext', 'displaytext', 'logo', 'logotext', 'watermark', 'watermarktext', 'titletext', 'renderedtext']);

export function requestsGeneratedTypography(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  const matches = [actionBeforeObject, objectBeforeAction, quotedTextDirective, koreanObjectThenAction, koreanActionThenObject]
    .map((pattern) => text.match(pattern))
    .filter(Boolean);
  return matches.some((match) => {
    const start = Math.max(0, match.index - 24);
    const end = Math.min(text.length, match.index + match[0].length + 24);
    return !negativePrefix.test(text.slice(start, match.index + match[0].length))
      && !negativeSuffix.test(text.slice(match.index + match[0].length, end));
  });
}

function hasMaterialValue(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (value === true) return true;
  if (Number.isFinite(value)) return true;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function payloadRequestsGeneratedTypography(value) {
  if (Array.isArray(value)) return value.some(payloadRequestsGeneratedTypography);
  if (!value || typeof value !== 'object') return typeof value === 'string' && requestsGeneratedTypography(value);
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
    if (typographyPayloadKeys.has(normalizedKey) && hasMaterialValue(item)) return true;
    if (normalizedKey !== 'negativeprompt' && payloadRequestsGeneratedTypography(item)) return true;
  }
  return false;
}

export function validateGeneratedTypographyPolicy(renderPlan) {
  const errors = [];
  if (renderPlan?.generated_text_policy !== 'forbid-generated-typography') errors.push('generated_text_policy must forbid generated typography');
  for (const [index, shot] of (renderPlan?.shots || []).entries()) {
    if (requestsGeneratedTypography(shot?.prompt)) errors.push(`shots[${index}].prompt requests generated typography`);
    if (payloadRequestsGeneratedTypography(shot?.provider_payload || {})) errors.push(`shots[${index}].provider_payload requests generated typography`);
  }
  return errors;
}
