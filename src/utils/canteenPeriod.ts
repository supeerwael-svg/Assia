import type { CanteenEntry, CanteenRejectReason, Student } from '@/db/types';
import { isEnrolledOn, isSchoolDay } from './absenceReports';

export type CanteenPeriodMode = 'day' | 'week' | 'month';

export function periodDates(mode: CanteenPeriodMode, anchor: string): string[] {
  const anchorDate = new Date(`${anchor}T00:00:00Z`);
  if (mode === 'day') return [anchor];
  if (mode === 'week') {
    const start = new Date(anchorDate);
    start.setUTCDate(anchorDate.getUTCDate() - anchorDate.getUTCDay());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      return day.toISOString().slice(0, 10);
    });
  }
  const year = anchorDate.getUTCFullYear();
  const month = anchorDate.getUTCMonth();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month, index + 1)).toISOString().slice(0, 10),
  );
}

export function acceptedEntryKeys(entries: CanteenEntry[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.deletedAt === null && entry.result === 'accepted' && entry.studentId !== null)
      .map((entry) => entryKey(entry.studentId as string, entry.date)),
  );
}

export function entryKey(studentId: string, date: string): string {
  return `${studentId}|${date}`;
}

export interface CanteenPeriodRow {
  studentId: string;
  expectedDays: string[];
  enteredDays: string[];
  missedDays: string[];
  rate: number | null;
}

export function isZeroEntry(row: CanteenPeriodRow): boolean {
  return row.expectedDays.length > 0 && row.enteredDays.length === 0;
}

export interface CanteenDayContext {
  canteenDays: number[];
  holidayDates: ReadonlySet<string>;
}

export function buildPeriodRows(
  students: Student[],
  dates: string[],
  entries: CanteenEntry[],
  context: CanteenDayContext,
): CanteenPeriodRow[] {
  const accepted = acceptedEntryKeys(entries);
  return students
    .filter((student) => student.deletedAt === null && student.boardingStatus === 'half-boarder')
    .map((student) => {
      const expectedDays = dates.filter(
        (date) => isSchoolDay(date, context.canteenDays, context.holidayDates) && isEnrolledOn(student, date),
      );
      const enteredDays = expectedDays.filter((date) => accepted.has(entryKey(student.id, date)));
      const missedDays = expectedDays.filter((date) => !accepted.has(entryKey(student.id, date)));
      const rate = expectedDays.length === 0 ? null : Math.round((enteredDays.length * 100) / expectedDays.length);
      return { studentId: student.id, expectedDays, enteredDays, missedDays, rate };
    });
}

export function sortByLowestRate(rows: CanteenPeriodRow[]): CanteenPeriodRow[] {
  return [...rows].sort((a, b) => {
    if (a.rate === null) return b.rate === null ? 0 : 1;
    if (b.rate === null) return -1;
    return a.rate - b.rate;
  });
}

export interface MissedSplit {
  absentFromSchool: string[];
  presentNotEaten: string[];
}

export function splitMissedDays(row: CanteenPeriodRow, wholeDayAbsentKeys: ReadonlySet<string>): MissedSplit {
  const split: MissedSplit = { absentFromSchool: [], presentNotEaten: [] };
  for (const date of row.missedDays) {
    if (wholeDayAbsentKeys.has(entryKey(row.studentId, date))) split.absentFromSchool.push(date);
    else split.presentNotEaten.push(date);
  }
  return split;
}

export function rejectedEntries(entries: CanteenEntry[], date: string, reason: CanteenRejectReason | 'all'): CanteenEntry[] {
  return entries
    .filter((entry) => entry.deletedAt === null && entry.date === date && entry.result === 'rejected')
    .filter((entry) => reason === 'all' || entry.reason === reason)
    .sort((a, b) => b.time.localeCompare(a.time));
}

export function halfBoardersWithoutEntry(
  students: Student[],
  date: string,
  entries: CanteenEntry[],
  context: CanteenDayContext,
): Student[] {
  if (!isSchoolDay(date, context.canteenDays, context.holidayDates)) return [];
  const accepted = acceptedEntryKeys(entries);
  return students.filter(
    (student) =>
      student.deletedAt === null &&
      student.boardingStatus === 'half-boarder' &&
      isEnrolledOn(student, date) &&
      !accepted.has(entryKey(student.id, date)),
  );
}
