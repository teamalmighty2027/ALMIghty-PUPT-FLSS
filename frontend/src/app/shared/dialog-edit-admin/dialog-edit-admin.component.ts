import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface AdminDialogData {
  admin: {
    id: string;
    code: string;
    last_name: string;
    first_name: string;
    middle_name?: string;
    suffix_name?: string;
    email: string;
    status: string;
    role: string;
  };
}

@Component({
  selector: 'app-dialog-edit-admin',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './dialog-edit-admin.component.html',
  styleUrls: ['./dialog-edit-admin.component.scss'],
})
export class DialogEditAdminComponent implements OnInit {
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DialogEditAdminComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AdminDialogData
  ) {}

  ngOnInit(): void {
    const admin = this.data.admin;

    this.form = this.fb.group({
      code: [{ value: admin.code ?? '', disabled: true }, [Validators.required]],
      last_name: [admin.last_name ?? '', [Validators.required]],
      first_name: [admin.first_name ?? '', [Validators.required]],
      middle_name: [admin.middle_name ?? ''],
      suffix_name: [admin.suffix_name ?? ''],
      email: [admin.email ?? '', [Validators.required, Validators.email]],
      status: [admin.status ?? 'Active', [Validators.required]],
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.valid) {
      const formValue = this.form.getRawValue();

      this.dialogRef.close({
        ...formValue,
        id: this.data.admin.id,
        role: this.data.admin.role,
      });
    }
  }
}
