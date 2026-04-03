import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import {
  BridgingCourseOption,
  CourseCatalogItem,
  SectionOption,
} from '../../core/models/scheduling.model';

interface DialogData {
  programLabel: string;
  yearLevel: number;
  sections: SectionOption[];
  defaultSectionId?: number;
  courses: CourseCatalogItem[];
  bridgingCourses?: BridgingCourseOption[];
  curriculumId?: number | null;
}

interface DialogResult {
  course_id: number;
  bridging_course_id: number | null;
  type: string;
  applies_to_all_sections: boolean;
  section_per_program_year_id: number | null;
  min_petitioners: number | null;
  petitioners_count: number | null;
  petition_file: File | null;
}

@Component({
  selector: 'app-dialog-temporary-course',
  standalone: true,
  templateUrl: './dialog-temporary-course.component.html',
  styleUrls: ['./dialog-temporary-course.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
  ],
})
export class DialogTemporaryCourseComponent {
  form: FormGroup;
  selectedFile: File | null = null;
  selectedFileName: string = '';
  availableCourses: CourseCatalogItem[] = [];
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  private readonly defaultSectionId: number | null;
  private readonly bridgingCourses: BridgingCourseOption[];
  private readonly bridgingCourseItems: CourseCatalogItem[];
  private readonly bridgingCourseByCourseId = new Map<
    number,
    BridgingCourseOption
  >();

  readonly typeOptions = [
    { value: 'summer', label: 'Summer' },
    { value: 'bridging', label: 'Bridging' },
    { value: 'tutorial', label: 'Tutorial' },
    { value: 'petition', label: 'Petition' },
  ];

  private readonly petitionDefaults: Record<string, number> = {
    petition: 45,
    tutorial: 1,
    summer: 0,
    bridging: 0,
  };

  private readonly maxFileSizeBytes = 10 * 1024 * 1024;
  private readonly allowedFileTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<DialogTemporaryCourseComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.defaultSectionId =
      data.defaultSectionId ?? data.sections[0]?.section_id ?? null;

    this.bridgingCourses = [...(data.bridgingCourses ?? [])].sort((a, b) =>
      a.course_code.localeCompare(b.course_code)
    );
    this.bridgingCourseItems = this.bridgingCourses.map((course) => ({
      course_id: course.course_id,
      course_code: course.course_code,
      course_title: course.course_title,
      lec_hours: course.lec_hours,
      lab_hours: course.lab_hours,
      units: course.units,
      tuition_hours: course.tuition_hours,
    }));
    this.bridgingCourses.forEach((course) => {
      this.bridgingCourseByCourseId.set(course.course_id, course);
    });

    this.form = this.fb.group({
      course_id: [null, Validators.required],
      type: ['summer', Validators.required],
      applies_to_all_sections: [false],
      section_per_program_year_id: [this.defaultSectionId],
      min_petitioners: [this.petitionDefaults['summer'], [Validators.min(0)]],
      petitioners_count: [0, [Validators.min(0)]],
      petition_file: [null],
    });

    this.setupFormListeners();
    this.updateCourseOptions();
    this.updateSectionValidators();
    this.updatePetitionValidators();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.isBridgingTypeSelected() && !this.hasBridgingCourses()) {
      this.showSnackBar('No bridging course is configured for this scope.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.isPetitionTypeSelected() && !this.selectedFile) {
        this.showSnackBar('Petition file is required for this type.');
      } else {
        this.showSnackBar('Please complete the required fields.');
      }
      return;
    }

    const courseId = this.form.value.course_id;
    const bridgingCourseId = this.isBridgingTypeSelected()
      ? this.bridgingCourseByCourseId.get(courseId)?.bridging_course_id ?? null
      : null;

    if (this.isBridgingTypeSelected() && !bridgingCourseId) {
      this.showSnackBar('No bridging course is configured for this scope.');
      return;
    }

    const result: DialogResult = {
      course_id: courseId,
      bridging_course_id: bridgingCourseId,
      type: this.form.value.type,
      applies_to_all_sections: this.form.value.applies_to_all_sections,
      section_per_program_year_id: this.form.value.section_per_program_year_id,
      min_petitioners: this.parseNumber(this.form.value.min_petitioners),
      petitioners_count: this.parseNumber(this.form.value.petitioners_count),
      petition_file: this.selectedFile,
    };

    this.dialogRef.close(result);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!this.allowedFileTypes.includes(file.type)) {
      this.snackBar.open('Upload a PDF, JPG, or PNG file only.', 'Close', {
        duration: 3000,
      });
      input.value = '';
      return;
    }

    if (file.size > this.maxFileSizeBytes) {
      this.snackBar.open('File size must be less than 10MB.', 'Close', {
        duration: 3000,
      });
      input.value = '';
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
    this.form.patchValue({ petition_file: file });
  }

  removeFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.form.patchValue({ petition_file: null });
    
    // Clear the file input element value
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  isPetitionTypeSelected(): boolean {
    const type = this.form.get('type')?.value;
    return type === 'petition' || type === 'tutorial';
  }

  isBridgingTypeSelected(): boolean {
    return this.form.get('type')?.value === 'bridging';
  }

  hasBridgingCourses(): boolean {
    return this.bridgingCourseItems.length > 0;
  }

  getSectionLabel(sectionId: number | null): string {
    if (!sectionId) {
      return 'All sections';
    }
    const section = this.data.sections.find((s) => s.section_id === sectionId);
    return section ? section.section_name : 'All sections';
  }

  private setupFormListeners(): void {
    this.form.get('applies_to_all_sections')?.valueChanges.subscribe(() => {
      this.updateSectionValidators();
    });

    this.form.get('type')?.valueChanges.subscribe(() => {
      this.updateCourseOptions();
      this.updatePetitionValidators();
    });

    this.form.get('course_id')?.valueChanges.subscribe(() => {
      this.updateBridgingSelection();
    });
  }

  private updateCourseOptions(): void {
    if (this.isBridgingTypeSelected()) {
      this.availableCourses = this.bridgingCourseItems;
    } else {
      this.availableCourses = this.data.courses;
    }

    const courseControl = this.form.get('course_id');

    if (this.isBridgingTypeSelected()) {
      const selectedCourseId = courseControl?.value;
      const hasMatch = selectedCourseId
        ? this.bridgingCourseByCourseId.has(selectedCourseId)
        : false;

      if (!hasMatch) {
        const nextCourseId = this.availableCourses[0]?.course_id ?? null;
        courseControl?.setValue(nextCourseId);
      }
    }

    this.updateBridgingSelection();
  }

  private updateSectionValidators(): void {
    const sectionControl = this.form.get('section_per_program_year_id');
    const appliesToAll = this.form.get('applies_to_all_sections')?.value;

    if (appliesToAll) {
      sectionControl?.clearValidators();
      sectionControl?.setValue(null);
      sectionControl?.disable({ emitEvent: false });
    } else {
      sectionControl?.setValidators([Validators.required]);
      sectionControl?.enable({ emitEvent: false });

      if (!sectionControl?.value && this.defaultSectionId) {
        sectionControl?.setValue(this.defaultSectionId, { emitEvent: false });
      }
    }

    sectionControl?.updateValueAndValidity({ emitEvent: false });
  }

  private updatePetitionValidators(): void {
    const fileControl = this.form.get('petition_file');
    const type = this.form.get('type')?.value;
    const minControl = this.form.get('min_petitioners');

    if (this.isPetitionTypeSelected()) {
      fileControl?.setValidators([Validators.required]);
    } else {
      fileControl?.clearValidators();
      this.removeFile();
    }

    fileControl?.updateValueAndValidity({ emitEvent: false });

    if (minControl && !minControl.dirty) {
      minControl.setValue(this.petitionDefaults[type] ?? 0);
    }
  }

  private updateBridgingSelection(): void {
    if (!this.isBridgingTypeSelected()) {
      return;
    }

    const selectedCourseId = this.form.get('course_id')?.value;
    const hasMatch = selectedCourseId
      ? this.bridgingCourseByCourseId.has(selectedCourseId)
      : false;

    if (!hasMatch) {
      const nextCourseId = this.availableCourses[0]?.course_id ?? null;
      this.form.get('course_id')?.setValue(nextCourseId, { emitEvent: false });
    }
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
    });
  }
}
