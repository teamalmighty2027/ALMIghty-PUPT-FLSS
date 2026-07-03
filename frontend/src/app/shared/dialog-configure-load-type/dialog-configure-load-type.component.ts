import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { DialogConfirmDeleteComponent } from '../dialog-confirm-delete/dialog-confirm-delete.component';

import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service'; // Adjust path if needed

@Component({
  selector: 'app-dialog-configure-load-type',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatDialogModule,
    MatButtonModule, 
    MatIconModule, 
    MatInputModule, 
    MatFormFieldModule, 
    MatTableModule
  ],
  templateUrl: './dialog-configure-load-type.component.html',
  styleUrls: ['./dialog-configure-load-type.component.scss']
})
export class DialogConfigureLoadTypeComponent implements OnInit {
  displayedColumns: string[] = ['name', 'action'];
  dataSource = new MatTableDataSource<any>([]);
  
  newTypeName: string = '';
  isLoading: boolean = true;
  isSaving: boolean = false;
  wasChanged: boolean = false; // Tracks if we need to refresh the dropdown in the parent

  constructor(
    public dialogRef: MatDialogRef<DialogConfigureLoadTypeComponent>,
    private schedulingService: SchedulingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadTypes();
  }

  loadTypes(): void {
    this.isLoading = true;
    this.schedulingService.getAssignmentTypes().subscribe({
      next: (types) => {
        this.dataSource.data = types;
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.snackBar.open('Failed to load types.', 'Close', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  addType(): void {
    const trimmedName = this.newTypeName.trim();
    if (!trimmedName) return;

    this.isSaving = true;
    this.schedulingService.addAssignmentType(trimmedName).subscribe({
      next: (res) => {
        this.wasChanged = true;
        this.newTypeName = '';
        this.loadTypes(); // Refresh table
        this.snackBar.open('Load type added.', 'Close', { duration: 3000 });
        this.isSaving = false;
      },
      error: (err) => {
        console.error(err);
        this.snackBar.open('Failed to add load type (It may already exist).', 'Close', { duration: 3000 });
        this.isSaving = false;
      }
    });
  }

  deleteType(id: number): void {
    // Open the modern Material confirmation dialog
    const confirmDialog = this.dialog.open(DialogConfirmDeleteComponent, {
      width: '400px',
      data: { message: 'Are you sure? Any existing faculty schedule using this load type will be reset to empty.' }
    });

    // Wait for the user's choice
    confirmDialog.afterClosed().subscribe(result => {
      if (result === true) {
        // User clicked "Delete"
        this.schedulingService.deleteAssignmentType(id).subscribe({
          next: () => {
            this.wasChanged = true;
            this.loadTypes(); // Refresh table
            this.snackBar.open('Load type deleted.', 'Close', { duration: 3000 });
          },
          error: (err) => {
            console.error(err);
            this.snackBar.open('Failed to delete load type.', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  closeDialog(): void {
    this.dialogRef.close(this.wasChanged);
  }
}