import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  TemplateRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  Subject,
  takeUntil,
  firstValueFrom,
} from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';

import {
  TableDialogComponent,
  DialogConfig,
  DialogFieldConfig,
} from '../../../../../shared/table-dialog/table-dialog.component';
import { DialogEditFacultyComponent } from '../../../../../shared/dialog-edit-faculty/dialog-edit-faculty.component';
import { DialogAddFacultyComponent } from '../../../../../shared/dialog-add-faculty/dialog-add-faculty.component';
import { DialogGenericComponent, DialogData } from '../../../../../shared/dialog-generic/dialog-generic.component';
import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import {
  InputField,
  TableHeaderComponent,
} from '../../../../../shared/table-header/table-header.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';

import {
  FacultyService,
  Faculty,
} from '../../../../services/superadmin/management/faculty/faculty.service';
import {
  FacultyTypeService,
  FacultyType,
} from '../../../../services/superadmin/management/faculty/faculty-type.service';

import { fadeAnimation } from '../../../../animations/animations';
import { getFacultyTypeClass } from '../../../../../shared/utils/faculty-type.utils';

interface Column {
  key: string;
  label: string;
  template?: TemplateRef<any>;
}

@Component({
  selector: 'app-faculty',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatRippleModule,
  ],
  templateUrl: './faculty.component.html',
  styleUrls: ['./faculty.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacultyComponent implements OnInit, OnDestroy, AfterViewInit {
  facultyStatuses = ['Active', 'Inactive', 'Retired'];
  facultyTypes: FacultyType[] = [];
  selectedFacultyIndex: number | null = null;

  @ViewChild('facultyTypeTemplate') facultyTypeTemplate!: TemplateRef<any>;
  @ViewChild('facultyUnitsTemplate') facultyUnitsTemplate!: TemplateRef<any>;
  @ViewChild('statusTemplate') statusTemplate!: TemplateRef<any>;
  @ViewChild('mobileFilterTemplate') mobileFilterTemplate!: TemplateRef<any>;

  faculty: Faculty[] = [];
  filteredFaculty: Faculty[] = [];
  isLoading = true;

  searchControl = new FormControl('');
  private activeFilters: { search: string; facultyType: string; status: string; sortBy: string } = {
    search: '',
    facultyType: '',
    status: '',
    sortBy: '',
  };

  // Filter bar state — bound directly in the template
  filterStatus = '';
  filterFacultyType = '';
  sortBy = '';
  isMobileView = false;
  mobileFilterStatus = '';
  mobileFilterFacultyType = '';
  mobileSortBy = '';

  readonly statusOptions = ['Active', 'Inactive', 'Retired'];
  facultyTypeOptions: string[] = [];

  readonly sortOptions = [
    { key: 'name_asc',    label: 'Name A → Z' },
    { key: 'name_desc',   label: 'Name Z → A' },
    { key: 'code_asc',    label: 'Code A → Z' },
    { key: 'code_desc',   label: 'Code Z → A' },
    { key: 'status_asc',  label: 'Active First' },
    { key: 'status_desc', label: 'Inactive First' },
    { key: 'type_asc',    label: 'Type A → Z' },
    { key: 'units_asc',   label: 'Units ↑' },
    { key: 'units_desc',  label: 'Units ↓' },
  ];
  private destroy$ = new Subject<void>();

  columns: Column[] = [
    { key: 'index', label: '#' },
    { key: 'code', label: 'Faculty Code' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'faculty_type', label: 'Type' },
    { key: 'faculty_units', label: 'Units Assigned' },
    { key: 'status', label: 'Status' },
  ];

  displayedColumns: string[] = [
    'index',
    'code',
    'name',
    'email',
    'faculty_type',
    'faculty_units',
    'status',
    'action',
  ];

  headerInputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty',
      key: 'search',
    },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private facultyService: FacultyService,
    private router: Router,
    private facultyTypeService: FacultyTypeService
  ) {}

  /**
   * Initializes the component by loading faculty types and data.
   */
  ngOnInit() {
    this.updateViewMode();
    this.loadFacultyTypes();
    this.fetchFaculty();
    this.setupSearch();
  }

  /**
   * Cleans up subscriptions when the component is destroyed.
   */
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Assigns custom templates to table columns after view initialization.
   */
  ngAfterViewInit() {
    const facultyTypeColumn = this.columns.find(
      (col) => col.key === 'faculty_type'
    );

    if (facultyTypeColumn) {
      facultyTypeColumn.template = this.facultyTypeTemplate;
    }

    const facultyUnitsColumn = this.columns.find(
      (col) => col.key === 'faculty_units'
    );

    if (facultyUnitsColumn) {
      facultyUnitsColumn.template = this.facultyUnitsTemplate;
    }

    const statusColumn = this.columns.find(
      (col) => col.key === 'status'
    );

    if (statusColumn) {
      statusColumn.template = this.statusTemplate;
    }

    this.cdr.detectChanges();
  }

  /**
   * Sets up the search control with debouncing and distinct filtering.
   */
  setupSearch() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.onSearch(searchTerm || '');
      });
  }

  /**
   * Handles input changes from the table header — search only now.
   */
  onInputChange(values: { [key: string]: any }) {
    if (values['search'] !== undefined) {
      this.activeFilters.search = values['search'] ?? '';
      this.applyFiltersAndSort();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateViewMode();
  }

  private updateViewMode(): void {
    this.isMobileView = window.innerWidth < 768;
  }

  private syncMobileFiltersFromState(): void {
    this.mobileFilterStatus = this.filterStatus;
    this.mobileFilterFacultyType = this.filterFacultyType;
    this.mobileSortBy = this.sortBy;
  }

  openMobileFilterPanel(): void {
    this.syncMobileFiltersFromState();
    this.dialog.open(this.mobileFilterTemplate, {
      width: '100%',
      maxWidth: '100vw',
      maxHeight: '90vh',
      panelClass: 'faculty-mobile-filter-dialog',
      autoFocus: false,
      hasBackdrop: true,
    });
  }

  closeMobileFilterPanel(): void {
    this.dialog.closeAll();
  }

  toggleMobileStatus(status: string): void {
    this.mobileFilterStatus = this.mobileFilterStatus === status ? '' : status;
  }

  toggleMobileFacultyType(type: string): void {
    this.mobileFilterFacultyType = type === '' ? '' : (this.mobileFilterFacultyType === type ? '' : type);
  }

  applyMobileFilters(): void {
    this.filterStatus = this.mobileFilterStatus;
    this.filterFacultyType = this.mobileFilterFacultyType;
    this.sortBy = this.mobileSortBy;
    this.activeFilters.status = this.filterStatus;
    this.activeFilters.facultyType = this.filterFacultyType;
    this.activeFilters.sortBy = this.sortBy;
    this.applyFiltersAndSort();
    this.dialog.closeAll();
    this.cdr.detectChanges();
  }

  clearMobileFilters(): void {
    this.mobileFilterStatus = '';
    this.mobileFilterFacultyType = '';
    this.mobileSortBy = '';
    this.filterStatus = '';
    this.filterFacultyType = '';
    this.sortBy = '';
    this.activeFilters.status = '';
    this.activeFilters.facultyType = '';
    this.activeFilters.sortBy = '';
    this.applyFiltersAndSort();
    this.dialog.closeAll();
    this.cdr.detectChanges();
  }

  /** Toggle status filter chip */
  toggleStatus(status: string): void {
    this.filterStatus = this.filterStatus === status ? '' : status;
    this.activeFilters.status = this.filterStatus;
    this.applyFiltersAndSort();
  }

  /** Toggle faculty type filter chip */
  toggleFacultyType(type: string): void {
    // Clicking "All" always clears the type filter
    this.filterFacultyType = type === '' ? '' : (this.filterFacultyType === type ? '' : type);
    this.activeFilters.facultyType = this.filterFacultyType;
    this.applyFiltersAndSort();
  }

  /** Handle sort dropdown change */
  onSortChange(value: string): void {
    this.sortBy = value;
    this.activeFilters.sortBy = value;
    this.applyFiltersAndSort();
  }

  /** Clear all filters and sort */
  clearAllFilters(): void {
    this.filterStatus = '';
    this.filterFacultyType = '';
    this.sortBy = '';
    this.mobileFilterStatus = '';
    this.mobileFilterFacultyType = '';
    this.mobileSortBy = '';
    this.activeFilters = { search: this.activeFilters.search, facultyType: '', status: '', sortBy: '' };
    this.applyFiltersAndSort();
  }

  getActiveFilterCount(): number {
    return [this.filterStatus, this.filterFacultyType, this.sortBy].filter(Boolean).length;
  }

  get hasActiveFilters(): boolean {
    return this.getActiveFilterCount() > 0;
  }

  /**
   * Applies all active filters and the selected sort order.
   */
  private applyFiltersAndSort(): void {
    const { search, facultyType, status, sortBy } = this.activeFilters;
    const lowerSearch = search.toLowerCase().trim();

    let result = this.faculty.filter((f) => {
      // Text search across name, code, email
      const matchesSearch = !lowerSearch ||
        f.code.toLowerCase().includes(lowerSearch) ||
        f.name.toLowerCase().includes(lowerSearch) ||
        f.email.toLowerCase().includes(lowerSearch);

      // Faculty type filter
      const matchesType = !facultyType ||
        (f.faculty?.faculty_type?.faculty_type ?? '').toLowerCase() === facultyType.toLowerCase();

      // Status filter
      const matchesStatus = !status ||
        f.status.toLowerCase() === status.toLowerCase();

      return matchesSearch && matchesType && matchesStatus;
    });

    // Sort
    result = this.sortFaculty(result, sortBy);

    this.filteredFaculty = result;
    this.cdr.markForCheck();
  }

  /**
   * Sorts the faculty array based on the selected sort key.
   */
  private sortFaculty(list: Faculty[], sortBy: string): Faculty[] {
    const sorted = [...list];

    switch (sortBy) {
      case 'name_asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'code_asc':
        return sorted.sort((a, b) => a.code.localeCompare(b.code));
      case 'code_desc':
        return sorted.sort((a, b) => b.code.localeCompare(a.code));
      case 'status_asc':
        return sorted.sort((a, b) => a.status.localeCompare(b.status));
      case 'status_desc':
        return sorted.sort((a, b) => b.status.localeCompare(a.status));
      case 'type_asc':
        return sorted.sort((a, b) =>
          (a.faculty?.faculty_type?.faculty_type ?? '').localeCompare(
            b.faculty?.faculty_type?.faculty_type ?? ''
          )
        );
      case 'units_asc':
        return sorted.sort((a, b) => {
          const ua = (a.faculty?.faculty_type?.regular_units ?? 0) + (a.faculty?.faculty_type?.additional_units ?? 0);
          const ub = (b.faculty?.faculty_type?.regular_units ?? 0) + (b.faculty?.faculty_type?.additional_units ?? 0);
          return ua - ub;
        });
      case 'units_desc':
        return sorted.sort((a, b) => {
          const ua = (a.faculty?.faculty_type?.regular_units ?? 0) + (a.faculty?.faculty_type?.additional_units ?? 0);
          const ub = (b.faculty?.faculty_type?.regular_units ?? 0) + (b.faculty?.faculty_type?.additional_units ?? 0);
          return ub - ua;
        });
      default:
        return sorted;
    }
  }

  /**
   * Legacy search handler kept for searchControl compatibility.
   */
  onSearch(searchTerm: string) {
    this.activeFilters.search = searchTerm;
    this.applyFiltersAndSort();
  }

  /**
   * Fetches the list of faculty members from the service.
   */
  fetchFaculty() {
    this.isLoading = true;

    this.facultyService
      .getFaculty()
      .pipe(
        catchError((error) => {
          console.error('Error fetching faculty:', error);

          this.snackBar.open(
            'Error fetching faculty. Please try again.',
            'Close',
            { duration: 3000 }
          );

          this.isLoading = false;
          this.cdr.markForCheck();
          return of([]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((faculty) => {
        this.faculty = faculty;
        this.filteredFaculty = [...this.faculty];
        // Re-apply any active filters after reload
        this.applyFiltersAndSort();
        this.isLoading = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Configures the dialog for adding or editing faculty.
   *
   * @param faculty Optional Faculty object for editing.
   * @param suggestedCode Optional suggested code for new faculty.
   * @returns DialogConfig object.
   */
  private getDialogConfig(
    faculty?: Faculty,
    suggestedCode?: string
  ): DialogConfig {
    const baseFields: DialogFieldConfig[] = [
      {
        label: 'Faculty Code',
        formControlName: 'code',
        type: 'text',
        maxLength: 12,
        required: true,
        // NOTE: Temporary enabled faculty code editing for corrections
        // disabled: !!faculty,
      },
      {
        label: 'Last Name',
        formControlName: 'last_name',
        type: 'text',
        maxLength: 50,
        required: true,
      },
      {
        label: 'First Name',
        formControlName: 'first_name',
        type: 'text',
        maxLength: 50,
        required: true,
      },
      {
        label: 'Middle Name',
        formControlName: 'middle_name',
        type: 'text',
        maxLength: 50,
        required: false,
      },
      {
        label: 'Suffix Name',
        formControlName: 'suffix_name',
        type: 'text',
        maxLength: 50,
        required: false,
      },
      {
        label: 'Email',
        formControlName: 'email',
        type: 'text',
        maxLength: 100,
        required: true,
      },
      {
        label: 'Type',
        formControlName: 'faculty_type_id',
        type: 'select',
        options: [
          {
            value: 'configure',
            label: 'Configure faculty types...',
            metadata: {
              isConfig: true,
              icon: 'settings',
            },
          },
          ...this.facultyTypes.map((type) => ({
            value: type.faculty_type_id,
            label: type.faculty_type,
          })),
        ],
        required: true,
      },
      {
        label: 'Status',
        formControlName: 'status',
        type: 'select',
        options: this.facultyStatuses.map((status) => ({
          value: status,
          label: status,
        })),
        required: true,
      },
    ];

    // Add password fields only when creating a new faculty
    const passwordFields: DialogFieldConfig[] = !faculty
      ? [
          {
            label: 'Password',
            formControlName: 'password',
            type: 'password',
            maxLength: 100,
            minLength: 12,
            required: true,
          },
          {
            label: 'Confirm Password',
            formControlName: 'confirmPassword',
            type: 'password',
            maxLength: 100,
            required: true,
            minLength: 12,
            confirmPassword: true,
          },
        ]
      : [];

    return {
      title: faculty ? 'Edit Faculty' : 'Add Faculty',
      isEdit: !!faculty,
      fields: [...baseFields, ...passwordFields],
      initialValue: faculty
        ? {
            code: faculty.code,
            last_name: faculty.last_name,
            first_name: faculty.first_name,
            middle_name: faculty.middle_name,
            suffix_name: faculty.suffix_name,
            email: faculty.email,
            faculty_type_id: faculty.faculty?.faculty_type_id,
            status: faculty.status,
          }
        : suggestedCode
        ? { code: suggestedCode }
        : undefined,
    };
  }

  /**
   * Handles the faculty type configuration option in the dialog.
   *
   * @param dialogRef The dialog reference to handle.
   */
  private handleFacultyTypeConfig(dialogRef: any) {
    const dialogAfterOpened$ = dialogRef.afterOpened();

    dialogAfterOpened$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const form = dialogRef.componentInstance.form;
      const facultyTypeControl = form.get('faculty_type_id');

      if (facultyTypeControl) {
        facultyTypeControl.valueChanges
          .pipe(takeUntil(this.destroy$))
          .subscribe((value: string) => {
            if (value === 'configure') {
              dialogRef.close();
              this.router.navigate(['/superadmin/faculty/types']);
            }
          });
      }
    });
  }

  /**
   * Opens the dialog to add a new faculty member.
   */
  async openAddFacultyDialog() {
    let suggestedCode = '';

    try {
      suggestedCode = await firstValueFrom(
        this.facultyService.getSuggestedCode()
      );
    } catch (error) {
      console.warn('Could not fetch suggested code', error);
    }

    const dialogRef = this.dialog.open(DialogAddFacultyComponent, {
      data: {
        suggestedCode,
        facultyTypes: this.facultyTypes,
        facultyStatuses: this.facultyStatuses,
        onConfigureTypes: () => {
          this.router.navigate(['/superadmin/faculty/types']);
        },
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        result.role = 'faculty';

        this.facultyService
          .addFaculty(result)
          .pipe(
            catchError((error) => {
              console.error('Error adding faculty:', error);

              const errorMessage =
                error.error?.message ||
                'Error adding faculty. Please try again.';

              this.snackBar.open(errorMessage, 'Close', {
                duration: 5000,
              });

              return of(null);
            })
          )
          .subscribe((newFaculty) => {
            if (newFaculty) {
              this.snackBar.open('Faculty added successfully', 'Close', {
                duration: 3000,
              });

              this.fetchFaculty();
            }
          });
      }
    });
  }

  /**
   * Opens the dialog to edit an existing faculty member.
   * @param faculty The faculty member to edit.
   */
  openEditFacultyDialog(faculty: Faculty) {
    this.selectedFacultyIndex = this.faculty.indexOf(faculty);

    const dialogRef = this.dialog.open(DialogEditFacultyComponent, {
      data: {
        faculty: {
          id: faculty.id,
          code: faculty.code,
          last_name: faculty.last_name,
          first_name: faculty.first_name,
          middle_name: faculty.middle_name,
          suffix_name: faculty.suffix_name,
          email: faculty.email,
          faculty_type_id: faculty.faculty?.faculty_type_id,
          status: faculty.status,
        },
        facultyTypes: this.facultyTypes,
        facultyStatuses: this.facultyStatuses,
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && this.selectedFacultyIndex !== null) {
        if (result.status !== faculty.status) {
          this.confirmStatusChange(faculty, result);
        } else {
          this.updateFaculty(result);
        }
      }
    });
  }

  /**
   * Prompts admin with a confirmation dialog before changing faculty status.
   */
  private confirmStatusChange(faculty: Faculty, updatedFaculty: Faculty): void {
    let dialogData: DialogData;

    if (updatedFaculty.status === 'Inactive') {
      dialogData = {
        title: 'Set Faculty to Inactive',
        content: `Are you sure you want to set ${faculty.name} to Inactive? ` +
          'Profile details will be cleared while keeping basic reference data.',
        actionText: 'Set Inactive',
        cancelText: 'Cancel',
        action: 'Confirm',
      };
    } else if (updatedFaculty.status === 'Retired') {
      dialogData = {
        title: 'WARNING: Set Faculty to Retired',
        content: `WARNING: Retiring ${faculty.name} is permanent and irreversible. ` +
          'All personal identifiable information (name, email, password, profile) ' +
          'will be immediately and permanently scrubbed from the database.',
        actionText: 'Permanently Scrub & Retire',
        cancelText: 'Cancel',
        action: 'Confirm',
        actionTextColor: '#ffffff',
        actionBgColor: '#dc2626',
      };
    } else {
      this.updateFaculty(updatedFaculty);
      return;
    }

    const confirmRef = this.dialog.open(DialogGenericComponent, {
      data: dialogData,
      autoFocus: true,
      panelClass: 'dialog-base',
    });

    confirmRef.afterClosed().subscribe((res) => {
      if (res === 'Confirm') {
        this.updateFaculty(updatedFaculty);
      }
    });
  }

  /**
   * Updates an existing faculty member.
   * @param updatedFaculty The updated faculty data.
   */
  updateFaculty(updatedFaculty: Faculty) {
    if (
      this.selectedFacultyIndex !== null &&
      this.selectedFacultyIndex !== undefined
    ) {
      const selectedFaculty = this.faculty[this.selectedFacultyIndex];

      if (selectedFaculty && selectedFaculty.id) {
        const facultyId = selectedFaculty.id;
        updatedFaculty.role = 'faculty';

        // Check if the password field contains the masked value ('********') or is empty.
        // If so, do not include it in the update payload.
        if (
          updatedFaculty.password === '********' ||
          !updatedFaculty.password
        ) {
          delete updatedFaculty.password;
        }

        this.facultyService
          .updateFaculty(facultyId, updatedFaculty)
          .pipe(
            catchError((error) => {
              console.error('Error updating faculty:', error);

              const errorMessage =
                error.error?.message ||
                'Error updating faculty. Please try again.';

              this.snackBar.open(errorMessage, 'Close', {
                duration: 5000,
              });

              return of(null);
            })
          )
          .subscribe((updatedFacultyResponse) => {
            if (updatedFacultyResponse) {
              this.snackBar.open('Faculty updated successfully', 'Close', {
                duration: 3000,
              });

              this.fetchFaculty();
            }
          });
      }
    }
  }

  /**
   * Sanitizes a file name for safe storage.
   *
   * @param fileName The name of the file to sanitize.
   * @returns The sanitized file name.
   */
  sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  /**
   * Returns a CSS class mapping based on the faculty type.
   *
   * @param facultyType The type of the faculty member.
   * @returns An object mapping class names to boolean values.
   */
  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    return getFacultyTypeClass(facultyType);
  }

  /**
   * Asynchronously loads all available faculty types.
   *
   * @returns A promise that resolves when loading is complete.
   */
  async loadFacultyTypes(): Promise<void> {
    try {
      this.facultyTypes = await firstValueFrom(
        this.facultyTypeService.getFacultyTypes()
      );
      this.facultyTypeOptions = this.facultyTypes.map(t => t.faculty_type);
      this.cdr.markForCheck();
    } catch (error) {
      this.snackBar.open('Error loading faculty types', 'Close', {
        duration: 3000,
      });
    }
  }

  /**
   * Approves a pending reactivation request for an inactive faculty member.
   */
  approveReactivation(faculty: Faculty): void {
    if (!faculty.id) return;

    this.facultyService.approveReactivation(faculty.id).subscribe({
      next: () => {
        this.snackBar.open('Faculty account reactivated successfully.', 'Close', {
          duration: 3000,
        });
        this.fetchFaculty();
      },
      error: (err) => {
        console.error('Approve reactivation failed:', err);
        this.snackBar.open('Failed to reactivate account.', 'Close', {
          duration: 4000,
        });
      },
    });
  }
}
