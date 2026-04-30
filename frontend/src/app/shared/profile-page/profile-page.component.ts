import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  selectedFile: File | null = null;
  profilePictureUrl: string | null = null; // Holds the preview/current image

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
      code: [{ value: '', disabled: true }], 
      faculty_profile_id: [{ value: '', disabled: true }],
      department: [''], // <-- Changed from program_id
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
    this.profileForm.disable(); 

    this.facultyService.getProfile().subscribe({
      next: (data) => {
        const formData = {
          ...data,
          sex: data.sex || '' 
        };
        
        this.profilePictureUrl = data.profile_picture_url || null; // Load existing image
        
        this.profileForm.patchValue(formData);
        
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

  onSubmit(): void {
    if (this.profileForm.valid) {
      this.isLoading = true;
      const formData = new FormData();
      
      // Get all raw values (including disabled if you need them, but mostly standard value is fine)
      const formValues = this.profileForm.getRawValue(); 

      // Append standard text fields to FormData
      Object.keys(formValues).forEach(key => {
        if (formValues[key] !== null && formValues[key] !== '') {
          formData.append(key, formValues[key]);
        }
      });

      // Append the file if a new one was selected
      if (this.selectedFile) {
        formData.append('profile_picture', this.selectedFile);
      }
      
      this.facultyService.updateProfile(formData).subscribe({
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