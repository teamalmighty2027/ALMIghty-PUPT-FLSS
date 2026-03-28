import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  constructor(private authService: AuthService) {}

  hasPermission(key: string): boolean {
    return this.authService.hasPermission(key);
  }

  canViewReports(): boolean {
    return this.hasPermission('view_reports');
  }

  canEditAcademicYears(): boolean {
    return this.hasPermission('edit_academic_years');
  }

  canEditFacultyPreferences(): boolean {
    return this.hasPermission('edit_faculty_preferences');
  }

  canAssignSchedules(): boolean {
    return this.hasPermission('assign_schedules');
  }

  canViewPreferences(): boolean {
    return this.hasPermission('view_preferences');
  }

  getAllowedPrograms(): number[] {
    return this.authService.getAllowedPrograms();
  }

  hasFullProgramAccess(): boolean {
    return this.authService.isFullProgramAccess();
  }

  canAccessProgram(programId: number): boolean {
    if (this.hasFullProgramAccess()) {
      return true;
    }

    return this.getAllowedPrograms().includes(programId);
  }

  getPermissions(): string[] {
    return this.authService.getPermissions();
  }

  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((permission) => this.hasPermission(permission));
  }

  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((permission) => this.hasPermission(permission));
  }
}
