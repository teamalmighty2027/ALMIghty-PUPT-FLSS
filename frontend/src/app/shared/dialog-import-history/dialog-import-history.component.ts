import { Component, Inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { Course } from '../../core/models/preferences.model';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { fadeAnimation } from '../../core/animations/animations';

interface ImportHistoryDialogData {
  facultyId: number;
  availableCourses: Course[];
  existingKeys: string[];
  currentSemesterId: number;
  currentActiveSemesterId: number;
}

@Component({
  selector: 'app-dialog-import-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSymbolDirective
  ],
  templateUrl: './dialog-import-history.component.html',
  styleUrls: ['./dialog-import-history.component.scss'],
  animations: [fadeAnimation]
})
export class DialogImportHistoryComponent implements OnInit {
  isLoading = signal(true);
  academicYearList = signal<any[]>([]);
  
  selectedYear = signal<any>(null);
  selectedSemester = signal<number | null>(null);
  
  historyPreferences = signal<any[]>([]);
  selectedCourses = new Set<string>();

  // Filtered courses from history that can be imported
  importableCourses = computed(() => {
    const prefs = this.historyPreferences();
    const available = this.data.availableCourses;
    const existingKeys = this.data.existingKeys;

    return prefs.map(pref => {
      // Find matching course in current offerings
      // Temporary courses are excluded as per plan
      if (pref.is_temporary) return null;

      const match = available.find(c => c.course_code === pref.course_details.course_code);
      if (!match) return null;

      const key = this.getSelectionKey(match);
      const isAlreadyAdded = existingKeys.includes(key);

      return {
        ...pref,
        currentMatch: match,
        isAlreadyAdded,
        key
      };
    }).filter(item => item !== null) as any[];
  });

  constructor(
    private preferencesService: PreferencesService,
    public dialogRef: MatDialogRef<DialogImportHistoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImportHistoryDialogData
  ) {}

  ngOnInit(): void {
    this.selectedSemester.set(this.data.currentSemesterId);
    this.loadHistory();
  }

  private loadHistory(): void {
    this.isLoading.set(true);
    this.preferencesService
      .getPreferencesHistoryByFacultyId(this.data.facultyId.toString())
      .subscribe({
        next: (response) => {
          // Filter academic years to only include those that have the target semester
          // AND exclude the currently active one to prevent redundant imports
          const filteredYears = response.academic_years.filter((ay: any) => {
            const semestersArray = Object.values(ay.semesters);
            return semestersArray.some((s: any) => 
              s.semester_id === this.data.currentSemesterId &&
              s.active_semester_id !== this.data.currentActiveSemesterId
            );
          });
          
          this.academicYearList.set(filteredYears);
          
          if (filteredYears.length > 0) {
            this.selectedYear.set(filteredYears[0]);
            this.updatePreferencesFromSelection();
          } else {
            this.isLoading.set(false);
          }
        },
        error: (err) => {
          console.error('Error loading history:', err);
          this.isLoading.set(false);
        }
      });
  }

  onYearChange(): void {
    this.updatePreferencesFromSelection();
  }

  /**
   * Updates the preferences from the selected year
   */
  private updatePreferencesFromSelection(): void {
    const year = this.selectedYear();
    const semId = this.selectedSemester();
    
    if (!year || !semId) {
      this.historyPreferences.set([]);
      this.isLoading.set(false);
      return;
    }

    const semestersArray = Object.values(year.semesters);
    const sem = semestersArray.find((s: any) => s.semester_id === semId) as any;
    this.historyPreferences.set(sem?.preferences ?? []);
    this.selectedCourses.clear();
    this.isLoading.set(false);
  }

  /**
   * Toggles the selection of a course
   */
  toggleSelection(key: string): void {
    if (this.selectedCourses.has(key)) {
      this.selectedCourses.delete(key);
    } else {
      this.selectedCourses.add(key);
    }
  }

  /**
   * Checks if all courses are selected
   */
  isAllSelected(): boolean {
    const importable = this.importableCourses().filter(c => !c.isAlreadyAdded);
    return importable.length > 0 && importable.every(c => this.selectedCourses.has(c.key));
  }

  /**
   * Toggles the selection of all courses
   */
  toggleAll(): void {
    if (this.isAllSelected()) {
      this.selectedCourses.clear();
    } else {
      this.importableCourses().forEach(c => {
        if (!c.isAlreadyAdded) this.selectedCourses.add(c.key);
      });
    }
  }

  /**
   * Imports the selected courses to the table
   */
  importSelected(): void {
    const selected = this.importableCourses()
      .filter(c => this.selectedCourses.has(c.key))
      .map(c => ({
        ...c.currentMatch,
        previousSectionName: c.section_details?.section_name,
        previousProgramCode: c.course_details?.program_code,
        preferred_days: c.preferred_days
      }));
    
    this.dialogRef.close(selected);
  }

  /**
   * Generates a unique key for a course
   */
  private getSelectionKey(course: Course): string {
    const base = course.temporary_course_offering_id
      ? `temp-${course.temporary_course_offering_id}`
      : `course-${course.course_id}`;
    const sectionId = course.section?.section_id ?? 'none';
    return `${base}-section-${sectionId}`;
  }
}
