import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
// Ensure your path to the service is correct
import { FacultyService } from '../../core/services/superadmin/management/faculty/faculty.service'; 
import { pageFloatUpAnimation } from '../../core/animations/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; 

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
  animations: [pageFloatUpAnimation]
})
export class ProfilePageComponent implements OnInit {
  profileForm!: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private facultyService: FacultyService,
    private snackBar: MatSnackBar 
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProfileData();
  }

  initForm(): void {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required],
      middle_name: [''],
      last_name: ['', Validators.required],
      suffix_name: [''],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      
      // Removed the 'disabled: true' lock here so you can edit the code
      code: [''], 
      faculty_profile_id: [{ value: '', disabled: true }],
      program_id: [''],

      birthdate: [''], 
      sex: [''],
      
      house_num: [''],
      street: [''],
      barangay: [''],
      city: [''],
      province: [''],
      country: [''],
      zipcode: ['', [Validators.pattern('^[0-9]{4}$')]] 
    });
  }

  loadProfileData(): void {
    this.isLoading = true;
    this.profileForm.disable(); // Prevent editing while loading

    this.facultyService.getProfile().subscribe({
      next: (data) => {
        const formData = {
          ...data,
          sex: data.sex || '' 
        };
        
        // patchValue automatically maps the JSON keys to your form controls
        this.profileForm.patchValue(data);
        
        // Re-enable form, but keep specific fields locked (Notice 'code' is NOT locked anymore)
        this.profileForm.enable();
        this.profileForm.get('email')?.disable();
        this.profileForm.get('faculty_profile_id')?.disable();
        
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load profile', err);
        this.isLoading = false;
      }
    });
  }

  onSubmit(): void {
    if (this.profileForm.valid) {
      this.isLoading = true;
      const payload = this.profileForm.value; 
      
      this.facultyService.updateProfile(payload).subscribe({
        next: (response) => {
          this.isLoading = false;
          
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