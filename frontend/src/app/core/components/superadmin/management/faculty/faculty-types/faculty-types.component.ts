import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TableGenericComponent } from '../../../../../../shared/table-generic/table-generic.component';
import { TableHeaderComponent, InputField } from '../../../../../../shared/table-header/table-header.component';
import { TableDialogComponent } from '../../../../../../shared/table-dialog/table-dialog.component';
import { LoadingComponent } from '../../../../../../shared/loading/loading.component';

import {
  FacultyTypeService,
  FacultyType,
  DesigneeRole,
} from '../../../../../services/superadmin/management/faculty/faculty-type.service';
import { DesigneeRoleService } from
  '../../../../../services/superadmin/management/faculty/designee-role.service';

import { RouterLink } from '@angular/router';
import { fadeAnimation } from '../../../../../animations/animations';

@Component({
  selector: 'app-faculty-types',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
    RouterLink,
  ],
  templateUrl: './faculty-types.component.html',
  styleUrl: './faculty-types.component.scss',
  animations: [fadeAnimation],
})
export class FacultyTypesComponent implements OnInit, OnDestroy {
  facultyTypes: FacultyType[] = [];
  filteredFacultyTypes: FacultyType[] = [];
  designeeRoles: DesigneeRole[] = [];
  isLoading = true;
  searchControl = new FormControl('');
  private destroy$ = new Subject<void>();

  columns = [
    { key: 'faculty_type', label: 'Faculty Type' },
    { key: 'regular_units', label: 'Regular Units' },
    { key: 'additional_units', label: 'Part-time Units' },
    { key: 'total_units', label: 'Total Units' },
    { key: 'designee_role_name', label: 'Designee Role' },
  ];

  displayedColumns: string[] = [
    'faculty_type',
    'regular_units',
    'additional_units',
    'total_units',
    'designee_role_name',
    'action',
  ];

  headerInputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty Types',
      key: 'search',
      placeholder: 'Search by type or units...',
    },
  ];

  constructor(
    private facultyTypeService: FacultyTypeService,
    private designeeRoleService: DesigneeRoleService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadFacultyTypes();
    this.loadDesigneeRoles();
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.onSearch(searchTerm || '');
      });
  }

  onSearch(searchTerm: string): void {
    const lowerSearch = searchTerm.toLowerCase();
    if (!lowerSearch) {
      this.filteredFacultyTypes = [...this.facultyTypes];
    } else {
      this.filteredFacultyTypes = this.facultyTypes.filter(
        (type) =>
          type.faculty_type.toLowerCase().includes(lowerSearch) ||
          type.regular_units.toString().includes(lowerSearch) ||
          type.additional_units.toString().includes(lowerSearch) ||
          (type.regular_units + type.additional_units)
            .toString()
            .includes(lowerSearch)
      );
    }
  }

  onInputChange(values: { [key: string]: any }): void {
    if (values['search'] !== undefined) {
      this.searchControl.setValue(values['search']);
    }
  }

  loadFacultyTypes(showLoading = true): void {
    if (showLoading) {
      this.isLoading = true;
    }

    this.facultyTypeService
      .getFacultyTypes()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: (types) => {
          this.facultyTypes = types.map((type) => ({
            ...type,
            total_units: type.regular_units + type.additional_units,
            designee_role_name: type.designee_role?.role_name || 'None',
          }));
          this.filteredFacultyTypes = [...this.facultyTypes];

          const currentSearch = this.searchControl.value;
          if (currentSearch) {
            this.onSearch(currentSearch);
          }
        },
        error: () => {
          this.snackBar.open('Error loading faculty types', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  // Fetches all designee roles to populate the dropdown in the dialog.
  loadDesigneeRoles(): void {
    this.designeeRoleService
      .getDesigneeRoles()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (roles) => {
          this.designeeRoles = roles;
        },
        error: () => {
          this.snackBar.open('Error loading designee roles', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  openDialog(action: string, data?: FacultyType): void {
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: {
        title: `${action} Faculty Type`,
        fields: [
          {
            name: 'faculty_type',
            label: 'Faculty Type',
            type: 'text',
            required: true,
            formControlName: 'faculty_type',
          },
          {
            name: 'regular_units',
            label: 'Regular Units',
            type: 'number',
            required: true,
            formControlName: 'regular_units',
          },
          {
            name: 'additional_units',
            label: 'Part-time Units',
            type: 'number',
            required: true,
            formControlName: 'additional_units',
          },
          {
            name: 'designee_role_id',
            label: 'Designee Role',
            type: 'select',
            required: false,
            formControlName: 'designee_role_id',
            options: [
              { value: '', label: 'None' },
              ...this.designeeRoles.map((role) => ({
                value: role.designee_role_id,
                label: role.role_name,
              })),
            ],
          },
        ],
        action,
        initialValue: data
          ? {
              faculty_type: data.faculty_type,
              regular_units: data.regular_units,
              additional_units: data.additional_units,
              designee_role_id: data.designee_role_id || '',
            }
          : {
              faculty_type: '',
              regular_units: 0,
              additional_units: 0,
              designee_role_id: '',
            },
      },
      autoFocus: true,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        if (result) {
          // Normalize empty string designee_role_id to null
          if (result.designee_role_id === '') {
            result.designee_role_id = null;
          }

          if (action === 'Add') {
            this.facultyTypeService
              .createFacultyType(result)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (newType) => {
                  const typeWithTotal = {
                    ...newType,
                    total_units:
                      newType.regular_units + newType.additional_units,
                    designee_role_name:
                      newType.designee_role?.role_name || 'None',
                  };
                  this.facultyTypes = [...this.facultyTypes, typeWithTotal];
                  this.filteredFacultyTypes = [...this.facultyTypes];
                  this.snackBar.open(
                    'Faculty type added successfully',
                    'Close',
                    {
                      duration: 3000,
                    }
                  );
                },
                error: (error) => {
                  const errorMessage =
                    error.error?.message ||
                    'Error adding faculty type';
                  this.snackBar.open(errorMessage, 'Close', {
                    duration: 5000,
                  });
                },
              });
          } else if (action === 'Edit' && data) {
            this.facultyTypeService
              .updateFacultyType(data.faculty_type_id, result)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (updatedType) => {
                  const index = this.facultyTypes.findIndex(
                    (type) => type.faculty_type_id === data.faculty_type_id
                  );
                  if (index !== -1) {
                    const typeWithTotal = {
                      ...updatedType,
                      total_units:
                        updatedType.regular_units +
                        updatedType.additional_units,
                      designee_role_name:
                        updatedType.designee_role?.role_name || 'None',
                    };
                    this.facultyTypes[index] = typeWithTotal;
                    this.facultyTypes = [...this.facultyTypes];
                    this.filteredFacultyTypes = [...this.facultyTypes];
                  }
                  this.snackBar.open(
                    'Faculty type updated successfully',
                    'Close',
                    {
                      duration: 3000,
                    }
                  );
                },
                error: (error) => {
                  const errorMessage =
                    error.error?.message ||
                    'Error updating faculty type';
                  this.snackBar.open(errorMessage, 'Close', {
                    duration: 5000,
                  });
                },
              });
          }
        }
      });
  }

  onDelete(data: FacultyType): void {
    this.facultyTypeService
      .deleteFacultyType(data.faculty_type_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.facultyTypes = this.facultyTypes.filter(
            (type) => type.faculty_type_id !== data.faculty_type_id
          );
          this.filteredFacultyTypes = [...this.facultyTypes];
          this.snackBar.open('Faculty type deleted successfully', 'Close', {
            duration: 3000,
          });
        },
        error: (error) => {
          const errorMessage =
            error.error?.message ||
            'Error deleting faculty type';
          this.snackBar.open(errorMessage, 'Close', {
            duration: 5000,
          });
        },
      });
  }
}
