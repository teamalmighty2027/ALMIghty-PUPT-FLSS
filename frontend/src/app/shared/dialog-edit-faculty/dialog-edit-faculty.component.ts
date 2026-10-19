import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FacultyType } from '../../core/services/superadmin/management/faculty/faculty-type.service';

export interface FacultyEditDialogData {
  faculty: {
    id: number;
    code: string;
    last_name: string;
    first_name: string;
    middle_name?: string;
    suffix_name?: string;
    email: string;
    faculty_type_id: number;
    status: string;
  };
  facultyTypes: FacultyType[];
  facultyStatuses: string[];
}

@Component({
  selector: 'app-dialog-edit-faculty',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './dialog-edit-faculty.component.html',
  styleUrls: ['./dialog-edit-faculty.component.scss'],
})
export class DialogEditFacultyComponent implements OnInit {
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DialogEditFacultyComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FacultyEditDialogData
  ) {}

  ngOnInit(): void {
    const f = this.data.faculty;
    this.form = this.fb.group({
      code: [f.code ?? '', [Validators.required]],
      last_name: [f.last_name ?? '', [Validators.required]],
      first_name: [f.first_name ?? '', [Validators.required]],
      middle_name: [f.middle_name ?? ''],
      suffix_name: [f.suffix_name ?? ''],
      email: [f.email ?? '', [Validators.required, Validators.email]],
      faculty_type_id: [f.faculty_type_id ?? null, [Validators.required]],
      status: [f.status ?? 'Active', [Validators.required]],
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.getRawValue());
    }
  }
}
