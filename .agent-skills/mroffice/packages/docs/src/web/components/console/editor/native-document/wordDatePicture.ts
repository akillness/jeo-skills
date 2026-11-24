/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's date picture (a date content control's `w:dateFormat`, a DATE
 * field's `\@` switch), in the English names Word uses for an English UI:
 * `dd/MM/yyyy`, `MMMM d, yyyy`, `dddd, d MMMM yyyy h:mm am/pm`, a quoted
 * literal kept as written. The same reading as the server's
 * (file_adapters/docx/data_binding.py `_format_date`). PURE.
 */

const ENGLISH_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ENGLISH_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PICTURE_TOKEN = /'[^']*'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|ss|s|am\/pm|AM\/PM|[\s\S]/g;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** The picture's rendering of `date`, or "" for an empty picture. */
export function formatWordDatePicture(
  date: Date,
  picture: string,
  options: { utc?: boolean } = {},
): string {
  if (!picture) return "";
  // A control's date is a calendar day written in the file; read in UTC it
  // is the day written, whatever the viewer's zone (OFL-062: a zone that
  // skipped a day rolled the 30th to the 31st).
  const utc = options.utc === true;
  const hours = utc ? date.getUTCHours() : date.getHours();
  const day = utc ? date.getUTCDay() : date.getDay();
  const dayOfMonth = utc ? date.getUTCDate() : date.getDate();
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  const hour = hours;
  const hour12 = hour % 12 || 12;
  let out = "";
  for (const token of picture.match(PICTURE_TOKEN) ?? []) {
    if (token.length >= 2 && token.startsWith("'") && token.endsWith("'")) out += token.slice(1, -1);
    else if (token === "dddd") out += ENGLISH_DAYS[day];
    else if (token === "ddd") out += ENGLISH_DAYS[day].slice(0, 3);
    else if (token === "dd") out += pad2(dayOfMonth);
    else if (token === "d") out += String(dayOfMonth);
    else if (token === "MMMM") out += ENGLISH_MONTHS[month];
    else if (token === "MMM") out += ENGLISH_MONTHS[month].slice(0, 3);
    else if (token === "MM") out += pad2(month + 1);
    else if (token === "M") out += String(month + 1);
    else if (token === "yyyy") out += String(year).padStart(4, "0");
    else if (token === "yy") out += pad2(year % 100);
    else if (token === "HH") out += pad2(hour);
    else if (token === "H") out += String(hour);
    else if (token === "hh") out += pad2(hour12);
    else if (token === "h") out += String(hour12);
    else if (token === "mm") out += pad2(minutes);
    else if (token === "m") out += String(minutes);
    else if (token === "ss") out += pad2(seconds);
    else if (token === "s") out += String(seconds);
    else if (token === "AM/PM") out += hour < 12 ? "AM" : "PM";
    else if (token === "am/pm") out += hour < 12 ? "am" : "pm";
    else out += token;
  }
  return out;
}

/**
 * The text a date control shows for an ISO full date (`YYYY-MM-DD` or
 * `YYYY-MM-DDTHH:MM:SSZ`, as `w:fullDate` holds it) under its picture: the
 * calendar day as written, not shifted by the viewer's time zone. The ISO day
 * itself when the control states no picture.
 */
export function wordDateControlText(fullDate: string, picture: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(fullDate);
  if (!match) return "";
  // `new Date(year, …)` reads a year of 0–99 as 1900–1999; the year is set
  
  // UTC throughout: a local Date rolls a calendar day the viewer's zone
  // never had onto the next one (OFL-062).
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0), 0);
  if (Number.isNaN(date.getTime())) return "";
  return picture ? formatWordDatePicture(date, picture, { utc: true }) : match[0].slice(0, 10);
}
