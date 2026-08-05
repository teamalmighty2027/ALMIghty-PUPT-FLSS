import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
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

export interface AddAdminDialogData {
  code: string;
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
  selector: 'app-dialog-add-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './dialog-add-admin.component.html',
  styleUrls: ['./dialog-add-admin.component.scss'],
})
export class DialogAddAdminComponent implements OnInit {
  form!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DialogAddAdminComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddAdminDialogData
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group(
      {
        code: [this.data.code ?? '', [Validators.required]],
        last_name: ['', [Validators.required]],
        first_name: ['', [Validators.required]],
        middle_name: [''],
        suffix_name: [''],
        email: ['', [Validators.required, Validators.email]],
        status: ['Active', [Validators.required]],
        password: ['', [Validators.required, Validators.minLength(12)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: passwordMatchValidator() }
    );
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
