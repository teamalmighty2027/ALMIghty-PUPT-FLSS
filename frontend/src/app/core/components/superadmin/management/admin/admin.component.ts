import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';

import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  TableDialogComponent,
  DialogConfig,
  DialogFieldConfig,
} from '../../../../../shared/table-dialog/table-dialog.component';
import {
  DialogAdminPermissionComponent,
} from '../../../../../shared/dialog-admin-permission/dialog-admin-permission.component';
import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import {
  InputField,
  TableHeaderComponent,
} from '../../../../../shared/table-header/table-header.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';

import {
  AdminService,
  User,
} from '../../../../services/superadmin/management/admin/admin.service';

import { fadeAnimation } from '../../../../animations/animations';

@Component({
  selector: 'app-admin',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
  ],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit, OnDestroy {
  adminStatuses = ['Active', 'Inactive'];
  selectedAdminIndex: number | null = null;

  admins: User[] = [];
  filteredAdmins: User[] = [];
  isLoading = true;

  searchControl = new FormControl('');
  private destroy$ = new Subject<void>();

  columns = [
    { key: 'index', label: '#' },
    { key: 'code', label: 'Admin Code' },
    { key: 'fullName', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
  ];

  displayedColumns: string[] = [
    'index',
    'code',
    'fullName',
    'email',
    'status',
    'action',
  ];

  headerInputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Admin',
      key: 'search',
    },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private adminService: AdminService
  ) {}

  /**
   * Initializes the component by fetching admins and setting up search.
   */
  ngOnInit() {
    this.fetchAdmins();
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
   * Fetches the list of admin users from the service.
   */
  fetchAdmins() {
    this.isLoading = true;
    this.adminService
      .getAdmins()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (admins) => {
          this.admins = admins.map((admin) => ({
            ...admin,
            fullName: `${admin.last_name}, ${admin.first_name} ${
              admin.middle_name ?? ''
            } ${admin.suffix_name ?? ''}`.trim(),
          }));

          this.filteredAdmins = [...this.admins];
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snackBar.open(
            'Error fetching admins. Please try again.',
            'Close',
            { duration: 3000 }
          );

          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
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
   * Filters the admin list based on the provided search term.
   * @param searchTerm The term entered by the user.
   */
  onSearch(searchTerm: string) {
    const lowerSearch = searchTerm.toLowerCase();

    if (!lowerSearch) {
      this.filteredAdmins = [...this.admins];
    } else {
      this.filteredAdmins = this.admins.filter(
        (admin) =>
          admin.code.toLowerCase().includes(lowerSearch) ||
          admin.fullName.toLowerCase().includes(lowerSearch) ||
          admin.role.toLowerCase().includes(lowerSearch) ||
          admin.status.toLowerCase().includes(lowerSearch)
      );
    }

    this.cdr.markForCheck();
  }

  /**
   * Handles input changes from the header components.
   * @param values The key-value pairs of changed inputs.
   */
  onInputChange(values: { [key: string]: any }) {
    if (values['search'] !== undefined) {
      this.onSearch(values['search']);
    }
  }

  /**
   * Generates the configuration for the admin add/edit dialog.
   * @param admin Optional admin user for editing.
   * @returns The dialog configuration object.
   */
  private getDialogConfig(admin?: User): DialogConfig {
    const baseFields: DialogFieldConfig[] = [
      {
        label: 'Admin Code',
        formControlName: 'code',
        type: 'text',
        maxLength: 20,
        required: true,
        disabled: true,
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
      },
      {
        label: 'Suffix',
        formControlName: 'suffix_name',
        type: 'text',
        maxLength: 50,
      },
      {
        label: 'Email',
        formControlName: 'email',
        type: 'text',
        maxLength: 100,
        required: true,
      },
      {
        label: 'Status',
        formControlName: 'status',
        type: 'select',
        options: this.adminStatuses,
        required: true,
      },
    ];

    // Add password fields only when creating a new admin
    const passwordFields: DialogFieldConfig[] = !admin
      ? [
          {
            label: 'Password',
            formControlName: 'password',
            type: 'text',
            maxLength: 100,
            required: true,
          },
          {
            label: 'Confirm Password',
            formControlName: 'confirmPassword',
            type: 'text',
            maxLength: 100,
            required: true,
            confirmPassword: true,
          },
        ]
      : [];

    return {
      title: 'Admin',
      isEdit: !!admin,
      fields: [...baseFields, ...passwordFields],
      initialValue: admin
        ? {
            ...admin,
            password: undefined,
            confirmPassword: undefined,
          }
        : { status: 'Active', role: 'admin' },
    };
  }

  /**
   * Opens the dialog to add a new admin user.
   */
  openAddAdminDialog() {
    this.adminService.getNextAdminCode().subscribe({
      next: (code) => {
        const config = this.getDialogConfig();
        config.initialValue = { ...config.initialValue, code };

        const dialogRef = this.dialog.open(TableDialogComponent, {
          data: config,
          disableClose: true,
          autoFocus: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result) {
            const { confirmPassword, ...adminData } = result;
            const { name, ...rest } = adminData;

            this.adminService.addAdmin({ ...rest, role: 'admin' }).subscribe({
              next: (newAdmin) => {
                const adminWithDisplay = {
                  ...newAdmin,
                  fullName: this.formatAdminName(newAdmin),
                };

                this.admins = [...this.admins, adminWithDisplay];
                this.filteredAdmins = [...this.admins];
                this.cdr.markForCheck();

                this.snackBar.open('Admin added successfully', 'Close', {
                  duration: 3000,
                });
              },
              error: (error) => {
                this.snackBar.open(
                  'Error adding admin. Please try again.',
                  'Close',
                  { duration: 3000 }
                );
                console.error('Error adding admin:', error);
              },
            });
          }
        });
      },
      error: (error) => {
        this.snackBar.open(
          'Error generating admin code. Please try again.',
          'Close',
          { duration: 3000 }
        );
        console.error('Error generating admin code:', error);
      },
    });
  }

  /**
   * Opens the dialog to edit an existing admin user.
   *
   * @param admin The admin user to edit.
   */
  openEditAdminDialog(admin: User) {
    const config = this.getDialogConfig(admin);

    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: config,
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.updateAdmin(admin.id, { ...result, role: 'admin' });
      }
    });
  }

  /**
   * Opens the permission management dialog for an admin user.
   * @param admin The admin user to manage.
   */
  openPermissionDialog(admin: User): void {
    const dialogRef = this.dialog.open(DialogAdminPermissionComponent, {
      data: {
        adminId: admin.id,
        adminName: `${admin.first_name} ${admin.last_name}`,
      },
      width: '600px',
      disableClose: false,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.snackBar.open('Permissions updated successfully', 'Close', {
          duration: 3000,
        });

        this.fetchAdmins();
      }
    });
  }

  /**
   * Handles custom actions triggered from the table.
   * @param event The action event data.
   */
  onCustomAction(event: any): void {
    if (event.action === 'edit-permissions') {
      this.openPermissionDialog(event.row);
    }
  }

  /**
   * Updates an existing admin user's information.
   * @param id The ID of the admin to update.
   * @param updatedAdmin The new data for the admin.
   */
  updateAdmin(id: string, updatedAdmin: any) {
    const { confirmPassword, ...adminData } = updatedAdmin;

    if (!adminData.password) {
      delete adminData.password;
    }

    const existingAdmin = this.admins.find((admin) => admin.id === id);
    if (!existingAdmin) return;

    this.adminService.updateAdmin(id, adminData).subscribe({
      next: (updatedAdminResponse) => {
        const updatedAdminWithDisplay = {
          ...existingAdmin,
          ...updatedAdminResponse,
          fullName: this.formatAdminName(updatedAdminResponse),
        };

        this.admins = this.admins.map((admin) =>
          admin.id === id ? updatedAdminWithDisplay : admin
        );

        const searchTerm = this.searchControl.value;

        if (searchTerm) {
          this.onSearch(searchTerm);
        } else {
          this.filteredAdmins = [...this.admins];
        }

        this.cdr.detectChanges();

        this.snackBar.open('Admin updated successfully', 'Close', {
          duration: 3000,
        });
      },
      error: (error) => {
        this.snackBar.open('Error updating admin. Please try again.', 'Close', {
          duration: 3000,
        });
        console.error('Error updating admin:', error);
      },
    });
  }

  /**
   * Formats an admin's name into a standard display string.
   * @param admin The admin user object.
   * @returns The formatted full name.
   */
  private formatAdminName(admin: User): string {
    const name = `${admin.last_name}, ${admin.first_name}${
      admin.middle_name ? ' ' + admin.middle_name : ''
    }${admin.suffix_name ? ' ' + admin.suffix_name : ''}`;

    return name.trim();
  }
}
