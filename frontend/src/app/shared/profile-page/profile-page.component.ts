import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  ValidationErrors,
} from '@angular/forms';
import { FacultyService } from '../../core/services/superadmin/management/faculty/faculty.service';
import { AdminService } from '../../core/services/superadmin/management/admin/admin-profile.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { PhAddressService } from '../../core/services/address/ph-address.service';
import { pageFloatUpAnimation } from '../../core/animations/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DialogBirthdateWarningComponent } from '../dialog-birthdate-warning/dialog-birthdate-warning.component';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatSymbolDirective,
    MatDatepickerModule,
  ],
  providers: [
    provideNativeDateAdapter(),
  ],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
  animations: [pageFloatUpAnimation],
})
export class ProfilePageComponent implements OnInit {
  profileForm!: FormGroup;
  isLoading = false;
  selectedFile: File | null = null;

  // Holds the preview/current profile image URL
  profilePictureUrl: string | null = null;
  isAdmin: boolean = false;

  // Arrays to hold dropdown choices for the address section
  provinces: any[] = [];
  cities: any[] = [];
  barangays: any[] = [];
  activePrograms: any[] = [];

  academicRanks: string[] = [
    'Instructor I', 'Instructor II', 'Instructor III',
    'Assistant Professor I', 'Assistant Professor II', 'Assistant Professor III', 'Assistant Professor IV',
    'Associate Professor I', 'Associate Professor II', 'Associate Professor III', 'Associate Professor IV', 'Associate Professor V',
    'Professor I', 'Professor II', 'Professor III', 'Professor IV', 'Professor V', 'Professor VI',
    'Special Lecturer'
  ];

  // Mobile Inline Dropdown variables
  isMobileView: boolean = window.innerWidth <= 768;
  activeMobileDropdown: string | null = null;
  mobileDropdownSearchable: boolean = false;
  mobileDropdownSearch: string = '';

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.isMobileView = window.innerWidth <= 768;
    if (!this.isMobileView && this.activeMobileDropdown) {
      this.closeAllMobileDropdowns();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.isMobileView) return;
    const clickedInside = (event.target as HTMLElement).closest('.select-wrapper');
    if (!clickedInside) {
      this.closeAllMobileDropdowns();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    this.closeAllMobileDropdowns();
  }

  toggleMobileDropdown(event: Event, controlName: string, searchable: boolean = false) {
    event.stopPropagation();
    if (this.activeMobileDropdown === controlName) {
      this.closeAllMobileDropdowns();
    } else {
      this.activeMobileDropdown = controlName;
      this.mobileDropdownSearchable = searchable;
      this.mobileDropdownSearch = '';
    }
  }

  closeAllMobileDropdowns() {
    this.activeMobileDropdown = null;
    this.mobileDropdownSearch = '';
  }

  onDropdownSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.mobileDropdownSearch = input.value;
  }

  selectDropdownOption(controlName: string, value: any) {
    const control = this.profileForm.get(controlName);
    if (control) {
      control.setValue(value);
      control.markAsTouched();
      control.updateValueAndValidity();
    }
    this.closeAllMobileDropdowns();
  }

  getDropdownOptions(controlName: string): { value: any; label: string }[] {
    let options: { value: any; label: string }[] = [];
    if (controlName === 'department') {
      options = this.activePrograms.map(p => ({
        value: p.program_title,
        label: p.program_title
      }));
    } else if (controlName === 'academic_rank') {
      options = this.academicRanks.map(r => ({
        value: r,
        label: r
      }));
    } else if (controlName === 'sex') {
      options = [
        { value: 'Male', label: 'Male' },
        { value: 'Female', label: 'Female' },
        { value: 'Prefer not to say', label: 'Prefer not to say' }
      ];
    } else if (controlName === 'province') {
      options = this.provinces.map(p => ({
        value: p.name,
        label: p.name
      }));
    } else if (controlName === 'city') {
      options = this.cities.map(c => ({
        value: c.name,
        label: c.name
      }));
    } else if (controlName === 'barangay') {
      options = this.barangays.map(b => ({
        value: b.name,
        label: b.name
      }));
    }

    if (!this.mobileDropdownSearch) {
      return options;
    }
    const searchLower = this.mobileDropdownSearch.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(searchLower));
  }

  constructor(
    private fb: FormBuilder,
    private facultyService: FacultyService,
    private adminService: AdminService,
    private authService: AuthService,
    private addressService: PhAddressService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.isAdmin =
      this.authService.getUserRole() === 'admin' ||
      this.authService.getUserRole() === 'superadmin';
  }

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
    this.setupAddressListeners();
    this.loadProfileData();
    this.loadActivePrograms();
  }

  // Initialize reactive form controls
  initForm(): void {
    const formConfig: any = {
      first_name: ['', Validators.required],
      middle_name: [''],
      last_name: ['', Validators.required],
      suffix_name: [''],
      email: [
        { value: '', disabled: true },
        [Validators.required, Validators.email],
      ],
      code: [{ value: '', disabled: true }],
      department: ['', Validators.required],
      academic_rank: ['', Validators.required],
      birthdate: ['', [this.birthdateValidator.bind(this)]],
      sex: [''],
      house_num: [''],
      street: [''],
      barangay: [''],
      city: [''],
      province: [''],
      country: [''],
      zipcode: ['', [Validators.pattern('^[0-9]{4}$')]],
    };

    this.profileForm = this.fb.group(formConfig);
    this.patchInitialValuesFromAuth();

    // Safeguard: Remove required validators for Admin/Superadmin users
    if (this.isAdmin) {
      this.profileForm.get('department')?.clearValidators();
      this.profileForm.get('academic_rank')?.clearValidators();
      this.profileForm.get('department')?.updateValueAndValidity();
      this.profileForm.get('academic_rank')?.updateValueAndValidity();
    }
  }

  // Pre-fill name/email for admin from cached auth data
  private patchInitialValuesFromAuth(): void {
    if (!this.isAdmin) {
      return;
    }

    const userData = this.authService.getUserData();
    const firstName =
      userData.first_name || userData.name?.split(' ')[0] || '';
    const lastName =
      userData.last_name ||
      userData.name?.split(' ').slice(1).join(' ') ||
      '';

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
    this.profileForm.get('province')?.valueChanges.subscribe((provinceName: any) => {
      const selectedProv = this.provinces.find(p => p.name === provinceName);

      if (selectedProv) {
        this.addressService.getCities(selectedProv.code).subscribe((data: any[]) => {
          this.cities = data.sort((a, b) => a.name.localeCompare(b.name));
          this.profileForm.get('city')?.setValue('');
          this.profileForm.get('barangay')?.setValue('');
          this.barangays = [];
        });
      }
    });

    // When City changes, load Barangays & Zip Code
    this.profileForm.get('city')?.valueChanges.subscribe((cityName: any) => {
      const selectedCity = this.cities.find(c => c.name === cityName);

      if (selectedCity) {
        this.addressService.getBarangays(selectedCity.code).subscribe((data: any[]) => {
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
        'Imus City': '4103',
      };

      const foundZip = zipCodeMap[cityName];
      this.profileForm.get('zipcode')?.setValue(foundZip ?? '');
    });
  }

  /**
   * Load provinces from PSGC and include Metro Manila as an option.
   */
  loadProvinces(): void {
    this.addressService.getProvinces().subscribe((data: any[]) => {
      const hasNCR = data.some(p => p.code === '130000000');
      if (!hasNCR) {
        data.push({ code: '130000000', name: 'Metro Manila' });
      }
      this.provinces = data.sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  
  /**
   * Load active programs for the Department dropdown
   */
  loadActivePrograms(): void {
    this.facultyService.getActivePrograms().subscribe({
      next: (data: any[]) => {
        this.activePrograms = data;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load active programs', err);
      }
    });
  }

  /**
   * Load the user's profile and initialize dependent address lists.
   */
  loadProfileData(): void {
    this.isLoading = true;
    this.profileForm.disable();

    const service: any = this.isAdmin ? this.adminService : this.facultyService;

    service.getProfile().subscribe({
      next: (data: any) => {
        const formData = {
          ...data,
          sex: data.sex || '',
          province: data.province || '',
          city: data.city || '',
          barangay: data.barangay || '',
          academic_rank: data.academic_rank || '',
        };

        this.profilePictureUrl = data.profile_picture_url || null;

        this.authService.updateProfileCompletionStatus(data, this.authService.getUserRole());

        // Enable first so disabled fields get patched correctly
        this.enableProfileForm();
        this.profileForm.patchValue(formData);

        // Re-disable read-only fields
        this.profileForm.get('email')?.disable();
        this.profileForm.get('code')?.disable();

        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load profile', err);
        this.enableProfileForm();
        this.isLoading = false;
      },
    });
  }

  // Re-enable form after load, keeping read-only fields disabled
  private enableProfileForm(): void {
    this.profileForm.enable();
    this.profileForm.get('email')?.disable();
    this.profileForm.get('code')?.disable();
  }

  /**
   * Handle file input selection for profile picture preview.
   */
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

  onBirthdateChange(event: any): void {
    let value = event.target?.value;
    if (!value && event.value) {
      const date = event.value as Date;
      if (date && date.getFullYear) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        value = `${year}-${month}-${day}`;
      }
    }
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
    if (!value) return null;
    if (this.isToday(value)) return { birthdateToday: true };
    return null;
  }

  /**
   * Submit the profile form to update the user's profile.
   */
  onSubmit(): void {
    if (this.profileForm.valid) {
      const formValues = this.profileForm.getRawValue();

      if (formValues.birthdate && this.isToday(formValues.birthdate)) {
        this.openBirthdateWarning();
        return;
      }

      this.isLoading = true;
      const formData = new FormData();

      Object.keys(formValues).forEach(key => {
        if (formValues[key] !== null && formValues[key] !== '') {
          formData.append(key, formValues[key]);
        }
      });

      if (this.selectedFile) {
        formData.append('profile_picture', this.selectedFile);
      }

      const service: any = this.isAdmin ? this.adminService : this.facultyService;

      service.updateProfile(formData).subscribe({
        next: (response: any) => {
          this.isLoading = false;
          if (response.profile_picture_url) {
            this.profilePictureUrl = response.profile_picture_url;
            this.authService.updateProfilePictureUrl(response.profile_picture_url);
          }

          const savedValues = this.profileForm.getRawValue();
          this.authService.updateProfileCompletionStatus(savedValues, this.authService.getUserRole());

          this.snackBar.open('Profile updated successfully!', 'Close', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
            panelClass: ['success-snackbar'],
          });
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading = false;
          console.error('Update failed', err);
          this.snackBar.open('Failed to update profile. Please try again.', 'Close', {
            duration: 4000,
            panelClass: ['error-snackbar'],
          });
        },
      });
    }
  }
}