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

import { DesigneeRoleService } from '../../../../../services/superadmin/management/faculty/designee-role.service';
import { DesigneeRole } from '../../../../../services/superadmin/management/faculty/faculty-type.service';

import { RouterLink } from '@angular/router';
import { fadeAnimation } from '../../../../../animations/animations';

@Component({
  selector: 'app-designee-roles',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
    RouterLink,
  ],
  templateUrl: './designee-roles.component.html',
  styleUrl: './designee-roles.component.scss',
  animations: [fadeAnimation],
})
export class DesigneeRolesComponent implements OnInit, OnDestroy {
  designeeRoles: any[] = [];
  filteredDesigneeRoles: any[] = [];
  isLoading = true;
  searchControl = new FormControl('');
  private destroy$ = new Subject<void>();

  columns = [
    { key: 'role_name', label: 'Role Name' },
    { key: 'regular_units', label: 'Regular Units' },
    { key: 'additional_units', label: 'Part-time Units' },
    { key: 'total_units', label: 'Total Units' },
  ];

  displayedColumns: string[] = [
    'role_name',
    'regular_units',
    'additional_units',
    'total_units',
    'action',
  ];

  headerInputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Designee Roles',
      key: 'search',
      placeholder: 'Search by role name or units...',
    },
  ];

  constructor(
    private designeeRoleService: DesigneeRoleService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  // Initializes the component by loading designee roles and setting up search.
  ngOnInit(): void {
    this.loadDesigneeRoles();
    this.setupSearch();
  }

  // Cleans up subscriptions on component destruction.
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Sets up the search input change listener with debounce.
  setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((searchTerm) => {
        this.onSearch(searchTerm || '');
      });
  }

  // Filters the designee roles list based on search query.
  onSearch(searchTerm: string): void {
    const lowerSearch = searchTerm.toLowerCase();
    if (!lowerSearch) {
      this.filteredDesigneeRoles = [...this.designeeRoles];
    } else {
      this.filteredDesigneeRoles = this.designeeRoles.filter(
        (role) =>
          role.role_name.toLowerCase().includes(lowerSearch) ||
          role.regular_units.toString().includes(lowerSearch) ||
          role.additional_units.toString().includes(lowerSearch) ||
          (role.regular_units + role.additional_units)
            .toString()
            .includes(lowerSearch)
      );
    }
  }

  // Responds to input change events from the table header component.
  onInputChange(values: { [key: string]: any }): void {
    if (values['search'] !== undefined) {
      this.searchControl.setValue(values['search']);
    }
  }

  // Fetches the list of designee roles from the service.
  loadDesigneeRoles(showLoading = true): void {
    if (showLoading) {
      this.isLoading = true;
    }

    this.designeeRoleService
      .getDesigneeRoles()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: (roles) => {
          this.designeeRoles = roles.map((role) => ({
            ...role,
            total_units: role.regular_units + role.additional_units,
          }));
          this.filteredDesigneeRoles = [...this.designeeRoles];

          const currentSearch = this.searchControl.value;
          if (currentSearch) {
            this.onSearch(currentSearch);
          }
        },
        error: () => {
          this.snackBar.open('Error loading designee roles', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  // Opens the add/edit dialog for designee roles.
  openDialog(action: string, data?: DesigneeRole): void {
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: {
        title: `${action} Designee Role`,
        fields: [
          {
            name: 'role_name',
            label: 'Role Name',
            type: 'text',
            required: true,
            formControlName: 'role_name',
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
        ],
        action,
        initialValue: data
          ? {
              role_name: data.role_name,
              regular_units: data.regular_units,
              additional_units: data.additional_units,
            }
          : {
              role_name: '',
              regular_units: 0,
              additional_units: 0,
            },
      },
      autoFocus: true,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        if (result) {
          if (action === 'Add') {
            this.designeeRoleService
              .createDesigneeRole(result)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (newRole) => {
                  const roleWithTotal = {
                    ...newRole,
                    total_units:
                      newRole.regular_units + newRole.additional_units,
                  };
                  this.designeeRoles = [...this.designeeRoles, roleWithTotal];
                  this.filteredDesigneeRoles = [...this.designeeRoles];
                  this.snackBar.open(
                    'Designee role added successfully',
                    'Close',
                    { duration: 3000 }
                  );
                },
                error: (error) => {
                  const errorMessage =
                    error.error?.message || 'Error adding designee role';
                  this.snackBar.open(errorMessage, 'Close', {
                    duration: 5000,
                  });
                },
              });
          } else if (action === 'Edit' && data) {
            this.designeeRoleService
              .updateDesigneeRole(data.designee_role_id, result)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (updatedRole) => {
                  const index = this.designeeRoles.findIndex(
                    (role) => role.designee_role_id === data.designee_role_id
                  );
                  if (index !== -1) {
                    const roleWithTotal = {
                      ...updatedRole,
                      total_units:
                        updatedRole.regular_units +
                        updatedRole.additional_units,
                    };
                    this.designeeRoles[index] = roleWithTotal;
                    this.designeeRoles = [...this.designeeRoles];
                    this.filteredDesigneeRoles = [...this.designeeRoles];
                  }
                  this.snackBar.open(
                    'Designee role updated successfully',
                    'Close',
                    { duration: 3000 }
                  );
                },
                error: (error) => {
                  const errorMessage =
                    error.error?.message || 'Error updating designee role';
                  this.snackBar.open(errorMessage, 'Close', {
                    duration: 5000,
                  });
                },
              });
          }
        }
      });
  }

  // Deletes the specified designee role.
  onDelete(data: DesigneeRole): void {
    this.designeeRoleService
      .deleteDesigneeRole(data.designee_role_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.designeeRoles = this.designeeRoles.filter(
            (role) => role.designee_role_id !== data.designee_role_id
          );
          this.filteredDesigneeRoles = [...this.designeeRoles];
          this.snackBar.open(
            'Designee role deleted successfully',
            'Close',
            { duration: 3000 }
          );
        },
        error: (error) => {
          const errorMessage =
            error.error?.message || 'Error deleting designee role';
          this.snackBar.open(errorMessage, 'Close', {
            duration: 5000,
          });
        },
      });
  }
}
