import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment.dev';

export interface Permission {
  id: number;
  permission_key: string;
  display_name: string;
  description: string;
  category: string;
}

export interface AdminPermissionData {
  adminId: number;
  adminName: string;
}

@Component({
  selector: 'app-dialog-admin-permission',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './dialog-admin-permission.component.html',
  styleUrls: ['./dialog-admin-permission.component.scss'],
})
export class DialogAdminPermissionComponent implements OnInit {
  private baseUrl = environment.apiUrl;

  permissionForm!: FormGroup;
  permissions: Permission[] = [];
  programs: any[] = [];
  isLoading = false;
  isSaving = false;
  selectedPermissions: number[] = [];
  selectedPrograms: number[] = [];
  isFullAccess = true;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private dialogRef: MatDialogRef<DialogAdminPermissionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AdminPermissionData,
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadPermissions();
    this.loadPrograms();
    this.loadAdminPermissions();
  }

  private initializeForm(): void {
    this.permissionForm = this.fb.group({
      is_full_access: [true],
    });
  }

  private loadPermissions(): void {
    this.isLoading = true;
    this.http.get<Permission[]>(`${this.baseUrl}/permissions`).subscribe({
      next: (permissions) => {
        this.permissions = permissions;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading permissions:', error);
        this.isLoading = false;
      },
    });
  }

  private loadPrograms(): void {
    this.http.get<any[]>(`${this.baseUrl}/programs`).subscribe({
      next: (programs) => {
        this.programs = programs.sort((a, b) =>
          a.program_title.localeCompare(b.program_title)
        );
      },
      error: (error) => {
        console.error('Error loading programs:', error);
      },
    });
  }

  private loadAdminPermissions(): void {
    this.isLoading = true;
    this.http
      .get<any>(`${this.baseUrl}/admins/${this.data.adminId}/permissions`)
      .subscribe({
        next: (data) => {
          this.selectedPermissions = (data.permissions || []).map((permission: any) =>
            typeof permission === 'number' ? permission : permission.id
          );
          this.selectedPrograms = (data.allowed_programs || []).map((program: any) =>
            typeof program === 'number' ? program : program.program_id
          );
          this.isFullAccess = data.is_full_access !== false;
          this.permissionForm.patchValue({
            is_full_access: this.isFullAccess,
          });
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading admin permissions:', error);
          this.isLoading = false;
        },
      });
  }

  togglePermission(permissionId: number): void {
    const index = this.selectedPermissions.indexOf(permissionId);
    if (index > -1) {
      this.selectedPermissions.splice(index, 1);
    } else {
      this.selectedPermissions.push(permissionId);
    }
  }

  toggleProgram(programId: number): void {
    const index = this.selectedPrograms.indexOf(programId);
    if (index > -1) {
      this.selectedPrograms.splice(index, 1);
    } else {
      this.selectedPrograms.push(programId);
    }
  }

  hasPermission(permissionId: number): boolean {
    return this.selectedPermissions.includes(permissionId);
  }

  hasProgram(programId: number): boolean {
    return this.selectedPrograms.includes(programId);
  }

  onFullAccessChange(value: boolean): void {
    this.isFullAccess = value;
    if (value) {
      this.selectedPrograms = [];
    }
  }

  savePermissions(): void {
    if (!this.data.adminId) {
      console.error('Admin ID is required');
      return;
    }

    this.isSaving = true;
    const payload = {
      permissions: this.selectedPermissions,
      allowed_programs: this.isFullAccess ? [] : this.selectedPrograms,
    };

    this.http
      .post(`${this.baseUrl}/admins/${this.data.adminId}/permissions`, payload)
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.dialogRef.close({ success: true, data: payload });
        },
        error: (error) => {
          console.error('Error saving permissions:', error);
          this.isSaving = false;
        },
      });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
