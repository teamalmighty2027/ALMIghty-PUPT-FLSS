import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
<<<<<<< feat/admin-profile
import { AbstractControl, ReactiveFormsModule, FormBuilder, FormGroup, Validators, ValidationErrors } from '@angular/forms';
import { FacultyService, FacultyProfileData } from '../../core/services/superadmin/management/faculty/faculty.service';
import { AdminService, AdminProfileData } from '../../core/services/superadmin/management/admin/admin-profile.service';
import { AuthService } from '../../core/services/auth/auth.service';
=======
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FacultyService } from '../../core/services/superadmin/management/faculty/faculty.service'; 
import { PhAddressService } from '../../core/services/address/ph-address.service';
>>>>>>> main
import { pageFloatUpAnimation } from '../../core/animations/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DialogBirthdateWarningComponent } from '../dialog-birthdate-warning/dialog-birthdate-warning.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatSnackBarModule, MatDialogModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
  animations: [pageFloatUpAnimation]
})
export class ProfilePageComponent implements OnInit {
  profileForm!: FormGroup;
  isLoading = false;
  selectedFile: File | null = null;
<<<<<<< feat/admin-profile
  profilePictureUrl: string | null = null; // Holds the preview/current image
  isAdmin: boolean = false;
=======
  profilePictureUrl: string | null = null; 

  // Arrays to hold dropdown choices for the template
  provinces: any[] = [];
  cities: any[] = [];
  barangays: any[] = [];
>>>>>>> main

  constructor(
    private fb: FormBuilder,
    private facultyService: FacultyService,
<<<<<<< feat/admin-profile
    private adminService: AdminService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.isAdmin = this.authService.getUserRole() === 'admin' || this.authService.getUserRole() === 'superadmin';
  }
=======
    private snackBar: MatSnackBar,
    private addressService: PhAddressService
  ) {}
>>>>>>> main

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
    this.setupAddressListeners();
    this.loadProfileData();
  }

  initForm(): void {
    const formConfig: any = {
      first_name: ['', Validators.required],
      middle_name: [''],
      last_name: ['', Validators.required],
      suffix_name: [''],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
<<<<<<< feat/admin-profile
      code: [{ value: '', disabled: true }],
      department: [''],
      birthdate: ['', [this.birthdateValidator.bind(this)]],
=======
      code: [{ value: '', disabled: true }], 
      faculty_profile_id: [{ value: '', disabled: true }],
      department: [''], 
      birthdate: [''], 
>>>>>>> main
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

  /**
   * Wire form controls to address API calls and derived values.
   */
  setupAddressListeners(): void {
    // When Province changes, load Cities
    this.profileForm.get('province')?.valueChanges.subscribe(provinceName => {
      const selectedProv = this.provinces.find(p => p.name === provinceName);
      if (selectedProv) {
        this.addressService.getCities(selectedProv.code).subscribe(data => {
          // SORT CITIES ALPHABETICALLY
          this.cities = data.sort((a, b) => a.name.localeCompare(b.name));
          
          this.profileForm.get('city')?.setValue('');
          this.profileForm.get('barangay')?.setValue('');
          this.barangays = []; 
        });
      }
    });

    // When City changes, load Barangays & Zip Code
    this.profileForm.get('city')?.valueChanges.subscribe(cityName => {
      const selectedCity = this.cities.find(c => c.name === cityName);
      if (selectedCity) {
        this.addressService.getBarangays(selectedCity.code).subscribe(data => {
          // SORT BARANGAYS ALPHABETICALLY
          this.barangays = data.sort((a, b) => a.name.localeCompare(b.name));
          this.profileForm.get('barangay')?.setValue('');
        });
      }

      const zipCodeMap: { [key: string]: string } = {
        'City of Taguig': '1630',
        'City of Manila': '1000',
        'Quezon City': '1100',
        'City of Makati': '1200',
        'City of Pasig': '1600',
        'City of Mandaluyong': '1550',
        'City of Marikina': '1800',
        'City of Muntinlupa': '1770',
        'City of Parañaque': '1700',
        'City of Las Piñas': '1740',
        'City of Valenzuela': '1440',
        'City of Malabon': '1470',
        'City of Navotas': '1490',
        'City of San Juan': '1500',
        'Pasay City': '1300',
        'Pateros': '1620',
        'City of Caloocan': '1400',
        'Bacoor City': '4102',
        'Dasmariñas City': '4114',
        'Imus City': '4103'
      };

      const foundZip = zipCodeMap[cityName];
      this.profileForm.get('zipcode')?.setValue(foundZip ?? '');
    });
  }

  /**
   * Load provinces from PSGC and include Metro Manila as an option.
   */
  loadProvinces(): void {
    this.addressService.getProvinces().subscribe(data => {
      
      // Only manually add Metro Manila if it's NOT already in the data
      const hasNCR = data.some(p => p.code === '130000000');
      if (!hasNCR) {
        data.push({ code: '130000000', name: 'Metro Manila' });
      }
      
      // Sort alphabetically
      this.provinces = data.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /**
   * Load the user's profile and initialize dependent address lists.
   */
  loadProfileData(): void {
    this.isLoading = true;
    this.profileForm.disable();

    const service = this.isAdmin ? this.adminService : this.facultyService;

    service.getProfile().subscribe({
      next: (data) => {
        const formData = {
          ...data,
<<<<<<< feat/admin-profile
          sex: data.sex || ''
        };

        this.profilePictureUrl = data.profile_picture_url || null; // Load existing image

        this.profileForm.patchValue(formData);

        this.enableProfileForm();
=======
          sex: data.sex || '',
          province: data.province || '',
          city: data.city || '',
          barangay: data.barangay || ''
        };
        
        this.profilePictureUrl = data.profile_picture_url || null;
        this.profileForm.patchValue(formData, { emitEvent: true });
        
        if (data.province) {
           setTimeout(() => {
             const prov = this.provinces.find(p => p.name === data.province);
             if (prov) {
               this.addressService.getCities(prov.code).subscribe(cities => {
                 // Sort cities on initial load
                 this.cities = cities.sort((a, b) => a.name.localeCompare(b.name));
                 
                 const city = this.cities.find(c => c.name === data.city);
                 if (city) {
                   this.addressService.getBarangays(city.code).subscribe(brgys => {
                     // Sort barangays on initial load
                     this.barangays = brgys.sort((a, b) => a.name.localeCompare(b.name));
                   });
                 }
               });
             }
           }, 500); 
        }

        this.profileForm.enable();
        this.profileForm.get('email')?.disable();
        this.profileForm.get('faculty_profile_id')?.disable();
        this.profileForm.get('code')?.disable(); 
        
>>>>>>> main
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load profile', err);
        this.enableProfileForm();
        this.isLoading = false;
      }
    });
  }

<<<<<<< feat/admin-profile
  private enableProfileForm(): void {
    this.profileForm.enable();
    this.profileForm.get('email')?.disable();
    this.profileForm.get('code')?.disable();
    if (!this.isAdmin) {
      this.profileForm.get('faculty_profile_id')?.disable();
    }
  }

=======
  /**
   * Handle file input selection for profile picture preview.
   */
>>>>>>> main
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profilePictureUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

<<<<<<< feat/admin-profile
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

=======
  /**
   * Submit the profile form to update the user's profile.
   */
>>>>>>> main
  onSubmit(): void {
    if (this.profileForm.valid) {
      const formValues = this.profileForm.getRawValue();

      if (formValues.birthdate && this.isToday(formValues.birthdate)) {
        this.openBirthdateWarning();
        return;
      }

      this.isLoading = true;
      const formData = new FormData();
      
<<<<<<< feat/admin-profile
      // Get all raw values (including disabled if you need them, but mostly standard value is fine)
=======
      const formValues = this.profileForm.getRawValue(); 

>>>>>>> main
      Object.keys(formValues).forEach(key => {
        if (formValues[key] !== null && formValues[key] !== '') {
          formData.append(key, formValues[key]);
        }
      });

      if (this.selectedFile) {
        formData.append('profile_picture', this.selectedFile);
      }
      
      const service = this.isAdmin ? this.adminService : this.facultyService;

      service.updateProfile(formData).subscribe({
        next: (response) => {
          this.isLoading = false;
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