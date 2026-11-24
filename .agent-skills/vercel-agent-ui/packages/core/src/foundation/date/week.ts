// The first day of the week for a locale. Browsers give it through
// `Intl.Locale#getWeekInfo`, but Firefox only has it since 153 (ESR 140
// doesn't) and older Chrome and Safari named it `weekInfo`, so a table of
// CLDR's regions covers the rest.

// Regions whose week doesn't start on Monday, from CLDR's `weekData.firstDay`:
// https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/weekData.json
const regionDays = new Map<string, number>()
for (const [day, regions] of [
  [
    0,
    "AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW",
  ],
  [5, "MV"],
  [6, "AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY"],
] as const) {
  for (const region of regions.split(" ")) {
    regionDays.set(region, day)
  }
}

// The `-u-fw-` extension a tag can carry to pick the first day itself, like `en-US-u-fw-mon`.
const extensionDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

const cache = new Map<string, number>()

/**
 * The day a week starts on in a locale, 0 for Sunday to 6 for Saturday, as
 * `Date#getDay` counts: 0 in the United States, 1 in most of Europe, 6 in much
 * of the Middle East. A tag's `-u-fw-` extension wins. Without a locale, the
 * runtime's own.
 * @stable
 */
function firstDayOfWeek(locale?: string) {
  const key = locale ?? ""
  let day = cache.get(key)
  if (day === undefined) {
    cache.set(key, (day = resolveFirstDay(locale)))
  }
  return day
}

function resolveFirstDay(locale: string | undefined) {
  let tag: Intl.Locale
  try {
    tag = new Intl.Locale(
      locale ?? new Intl.DateTimeFormat().resolvedOptions().locale
    )
  } catch {
    return 1
  }
  const extension = /-u(?:-[a-z0-9]{2,8})*?-fw-([a-z]{3})\b/i
    .exec(tag.toString())?.[1]
    ?.toLowerCase()
  if (extension && extensionDays.includes(extension)) {
    return extensionDays.indexOf(extension)
  }
  const info = weekInfo(tag)
  // `getWeekInfo` counts from 1 for Monday to 7 for Sunday.
  if (info) {
    return info.firstDay % 7
  }
  return regionDays.get(tag.maximize().region ?? "") ?? 1
}

type WeekInfo = { firstDay: number }

function weekInfo(tag: Intl.Locale) {
  const locale = tag as Intl.Locale & {
    getWeekInfo?: () => WeekInfo
    weekInfo?: WeekInfo
  }
  try {
    return locale.getWeekInfo?.() ?? locale.weekInfo
  } catch {
    return undefined
  }
}

export { firstDayOfWeek }
