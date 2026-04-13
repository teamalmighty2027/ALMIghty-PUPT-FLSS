import { Injectable } from '@angular/core';
import { Schedule, DraftEntry } from '../../../models/scheduling.model';

@Injectable({
  providedIn: 'root'
})
export class DraftStateService {
  private workingMap = new Map<number, DraftEntry>();
  private originalMap = new Map<number, DraftEntry>();

  constructor() { }

  /**
   * Initializes the draft state from the current live schedules.
   * Snapshots them so we can detect changes (isDirty).
   */
  initFromSchedules(schedules: Schedule[]): void {
    this.workingMap.clear();
    this.originalMap.clear();

    schedules.forEach(schedule => {

      if (schedule.schedule_id) {
        const entry: DraftEntry = {
          schedule_id: schedule.schedule_id,
          faculty_id: schedule.faculty_id || null,
          faculty_name: schedule.professor || 'Not set',
          room_id: schedule.room_id || null,
          room_code: schedule.room || 'Not set',
          day: schedule.day && schedule.day !== 'Not set' ? schedule.day : null,
          start_time: schedule.start_time || null,
          end_time: schedule.end_time || null,
          hasConflict: false
        };
        this.workingMap.set(schedule.schedule_id, { ...entry });
        this.originalMap.set(schedule.schedule_id, { ...entry });
      }
    });
  }

  /**
   * Returns a draft entry by schedule_id.
   */
  get(schedule_id: number): DraftEntry | undefined {
    return this.workingMap.get(schedule_id);
  }

  /**
   * Updates a draft entry.
   */
  set(schedule_id: number, entry: DraftEntry): void {
    this.workingMap.set(schedule_id, { ...entry });
  }

  /**
   * Resets all draft state.
   */
  clear(): void {
    this.workingMap.clear();
    this.originalMap.clear();
  }

  /**
   * Returns all entries that differ from their original live snapshot.
   */
  getDirty(): DraftEntry[] {
    const dirtyCount: DraftEntry[] = [];
    this.workingMap.forEach((entry) => {
      if (this.isEntryDirty(entry)) {
        dirtyCount.push(entry);
      }
    });
    return dirtyCount;
  }

  /**
   * Internal helper to compare an entry against its original snapshot.
   */
  private isEntryDirty(entry: DraftEntry): boolean {
    const original = this.originalMap.get(entry.schedule_id);
    if (!original) return false;

    return (
      entry.faculty_id !== original.faculty_id ||
      entry.room_id !== original.room_id ||
      entry.day !== original.day ||
      entry.start_time !== original.start_time ||
      entry.end_time !== original.end_time
    );
  }

  /**
   * Returns all entries currently flagged as having an AI conflict.
   */
  getConflicted(): DraftEntry[] {
    return Array.from(this.workingMap.values()).filter(e => e.hasConflict);
  }

  /**
   * Returns true if there are any pending unsaved changes.
   */
  hasDirtyEntries(): boolean {
    for (const entry of this.workingMap.values()) {
      if (this.isEntryDirty(entry)) {
        return true;
      }
    }
    return false;
  }
}
