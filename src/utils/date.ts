export function formatInspectionDate(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = date.getDate().toString().padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

export function getTodayDateString(): string {
  return formatInspectionDate(new Date());
}

export function getCurrentInspectionDate(): string {
  return formatInspectionDate(new Date());
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function parseInspectionDate(dateStr: string): number {
  const match = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(dateStr);
  if (!match) return NaN;

  const day = parseInt(match[1], 10);
  const month = MONTHS.indexOf(match[2]);
  const year = parseInt(match[3], 10);

  if (month === -1) return NaN;

  return new Date(year, month, day).getTime();
}