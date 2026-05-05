import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FacultyService } from '../../core/services/superadmin/management/faculty/faculty.service'; 
import { PhAddressService } from '../../core/services/address/ph-address.service'; // <-- Correct Address Service Path
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
  profilePictureUrl: string | null = null; 

  // Arrays to hold dropdown choices for the template
  provinces: any[] = [];
  cities: any[] = [];
  barangays: any[] = [];

  constructor(
    private fb: FormBuilder,
    private facultyService: FacultyService,
    private snackBar: MatSnackBar,
    private addressService: PhAddressService // <-- Inject Address Service
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();         // 1. Fetch initial province list
    this.setupAddressListeners(); // 2. Listen for dropdown changes
    this.loadProfileData();       // 3. Load user data
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
      department: [''], 
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

        // EXACT MATCH Dictionary for Metro Manila & nearby areas
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
        if (foundZip) {
          this.profileForm.get('zipcode')?.setValue(foundZip);
        } else {
          this.profileForm.get('zipcode')?.setValue('');
        }
      }
    });
  }

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

  loadProfileData(): void {
    this.isLoading = true;
    this.profileForm.disable(); 

    this.facultyService.getProfile().subscribe({
      next: (data) => {
        const formData = {
          ...data,
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
      
      const formValues = this.profileForm.getRawValue(); 

      Object.keys(formValues).forEach(key => {
        if (formValues[key] !== null && formValues[key] !== '') {
          formData.append(key, formValues[key]);
        }
      });

      if (this.selectedFile) {
        formData.append('profile_picture', this.selectedFile);
      }
      
      this.facultyService.updateProfile(formData).subscribe({
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