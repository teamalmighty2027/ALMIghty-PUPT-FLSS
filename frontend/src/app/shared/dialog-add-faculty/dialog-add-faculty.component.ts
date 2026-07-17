import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { FacultyType } from '../../core/services/superadmin/management/faculty/faculty-type.service';

export interface AddFacultyDialogData {
  suggestedCode: string;
  facultyTypes: FacultyType[];
  facultyStatuses: string[];
  onConfigureTypes: () => void;
}

function passwordMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password && confirm && password !== confirm
      ? { passwordMismatch: true }
      : null;
  };
}

@Component({
  selector: 'app-dialog-add-faculty',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './dialog-add-faculty.component.html',
  styleUrls: ['./dialog-add-faculty.component.scss'],
})
export class DialogAddFacultyComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DialogAddFacultyComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddFacultyDialogData
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group(
      {
        code: [this.data.suggestedCode ?? '', [Validators.required]],
        last_name: ['', [Validators.required]],
        first_name: ['', [Validators.required]],
        middle_name: [''],
        suffix_name: [''],
        email: ['', [Validators.required, Validators.email]],
        faculty_type_id: [null, [Validators.required]],
        status: ['Active', [Validators.required]],
        password: ['', [Validators.required, Validators.minLength(12)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: passwordMatchValidator() }
    );

    // Handle "Configure faculty types..." option
    this.form.get('faculty_type_id')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        if (value === 'configure') {
          this.dialogRef.close();
          this.data.onConfigureTypes();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.valid) {
      const { confirmPassword, ...payload } = this.form.getRawValue();
      this.dialogRef.close(payload);
    }
  }
}
