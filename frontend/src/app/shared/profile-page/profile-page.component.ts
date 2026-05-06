import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, FormGroup, Validators, ValidationErrors } from '@angular/forms';
import { FacultyService, FacultyProfileData } from '../../core/services/superadmin/management/faculty/faculty.service';
import { AdminService, AdminProfileData } from '../../core/services/superadmin/management/admin/admin-profile.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { pageFloatUpAnimation } from '../../core/animations/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DialogBirthdateWarningComponent } from '../dialog-birthdate-warning/dialog-birthdate-warning.component';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule, MatDialogModule, MatSymbolDirective],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
  animations: [pageFloatUpAnimation]
})
export class ProfilePageComponent implements OnInit {
  profileForm!: FormGroup;
  isLoading = false;
  selectedFile: File | null = null;
  profilePictureUrl: string | null = null; // Holds the preview/current image
  isAdmin: boolean = false;

  constructor(
    private fb: FormBuilder,
    private facultyService: FacultyService,
    private adminService: AdminService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.isAdmin = this.authService.getUserRole() === 'admin' || this.authService.getUserRole() === 'superadmin';
  }

  ngOnInit(): void {
    this.initForm();
    this.loadProfileData();
  }

  initForm(): void {
    const formConfig: any = {
      first_name: ['', Validators.required],
      middle_name: [''],
      last_name: ['', Validators.required],
      suffix_name: [''],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      code: [{ value: '', disabled: true }],
      department: [''],
      birthdate: ['', [this.birthdateValidator.bind(this)]],
      sex: [''],
      house_num: [''],
      street: [''],
      barangay: [''],
      city: [''],
      province: [''],
      country: [''],
      zipcode: ['', [Validators.pattern('^[0-9]{4}$')]]
    };

    // Only add faculty_profile_id for faculty users
    if (!this.isAdmin) {
      formConfig.faculty_profile_id = [{ value: '', disabled: true }];
    }

    this.profileForm = this.fb.group(formConfig);
    this.patchInitialValuesFromAuth();
  }

  private patchInitialValuesFromAuth(): void {
    if (!this.isAdmin) {
      return;
    }

    const userData = this.authService.getUserData();
    const firstName = userData.first_name || userData.name?.split(' ')[0] || '';
    const lastName = userData.last_name || userData.name?.split(' ').slice(1).join(' ') || '';

    this.profileForm.patchValue({
      first_name: firstName,
      last_name: lastName,
      suffix_name: userData.suffix_name || '',
      email: userData.email || '',
      code: userData.code || this.authService.getUserCode() || '',
    });
  }

  loadProfileData(): void {
    this.isLoading = true;
    this.profileForm.disable();

    const service = this.isAdmin ? this.adminService : this.facultyService;

    service.getProfile().subscribe({
      next: (data) => {
        const formData = {
          ...data,
          sex: data.sex || ''
        };

        this.profilePictureUrl = data.profile_picture_url || null; // Load existing image

        // Enable the form first before patching to ensure disabled fields get updated
        this.enableProfileForm();
        
        // Now patch the values
        this.profileForm.patchValue(formData);
        
        // Re-disable the fields that should be disabled
        this.profileForm.get('email')?.disable();
        this.profileForm.get('code')?.disable();
        if (!this.isAdmin) {
          this.profileForm.get('faculty_profile_id')?.disable();
        }

        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load profile', err);
        this.enableProfileForm();
        this.isLoading = false;
      }
    });
  }

  private enableProfileForm(): void {
    this.profileForm.enable();
    this.profileForm.get('email')?.disable();
    this.profileForm.get('code')?.disable();
    if (!this.isAdmin) {
      this.profileForm.get('faculty_profile_id')?.disable();
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      
      // Show image preview locally before saving
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profilePictureUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onBirthdateChange(event: any): void {
    const value = event.target?.value;
    if (value && this.isToday(value)) {
      this.profileForm.get('birthdate')?.setValue('');
      this.openBirthdateWarning();
    }
  }

  private isToday(value: string): boolean {
    const selected = new Date(value);
    const today = new Date();
    selected.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return selected.getTime() === today.getTime();
  }

  private openBirthdateWarning(): void {
    this.dialog.open(DialogBirthdateWarningComponent, {
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'birthdate-warning-dialog',
    });
  }

  private birthdateValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    if (this.isToday(value)) {
      return { birthdateToday: true };
    }

    return null;
  }

  onSubmit(): void {
    if (this.profileForm.valid) {
      const formValues = this.profileForm.getRawValue();

      if (formValues.birthdate && this.isToday(formValues.birthdate)) {
        this.openBirthdateWarning();
        return;
      }

      this.isLoading = true;
      const formData = new FormData();
      
      // Get all raw values (including disabled if you need them, but mostly standard value is fine)
      Object.keys(formValues).forEach(key => {
        if (formValues[key] !== null && formValues[key] !== '') {
          formData.append(key, formValues[key]);
        }
      });

      // Append the file if a new one was selected
      if (this.selectedFile) {
        formData.append('profile_picture', this.selectedFile);
      }
      
      const service = this.isAdmin ? this.adminService : this.facultyService;

      service.updateProfile(formData).subscribe({
        next: (response) => {
          this.isLoading = false;
          // Update URL in case backend returned the new finalized path
          if (response.profile_picture_url) {
             this.profilePictureUrl = response.profile_picture_url;
          }
          
          this.snackBar.open('Profile updated successfully!', 'Close', {
            duration: 3000, 
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
            panelClass: ['success-snackbar']
          });
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading = false;
          console.error('Update failed', err);
          this.snackBar.open('Failed to update profile. Please try again.', 'Close', {
            duration: 4000,
            panelClass: ['error-snackbar']
          });
        }
      });
    }
  }
}