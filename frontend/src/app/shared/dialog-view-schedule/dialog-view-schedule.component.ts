import { Component, Inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar } from '@angular/material/snack-bar';

import { forkJoin } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { LoadingComponent } from '../loading/loading.component';
import { ScheduleTimelineComponent } from '../schedule-timeline/schedule-timeline.component';
import { fadeAnimation } from '../../core/animations/animations';
import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';
import { MatDialog } from '@angular/material/dialog';
import { DialogConfigureLoadTypeComponent } from '../dialog-configure-load-type/dialog-configure-load-type.component';
import { MatDividerModule } from '@angular/material/divider';

interface ScheduleGroup {
  title: string;
  scheduleData: any;
}

interface ViewScheduleDialogData {
  entity: string;
  entityData?: any;
  customTitle?: string;
  academicYear?: string;
  semester?: number;
  scheduleGroups?: ScheduleGroup[];
  generatePdfFunction: (preview: boolean, currentData?: any[]) => Blob | Promise<Blob> | void;
  generateExcelFunction?: () => Promise<void> | void;
  showViewToggle?: boolean;
  exportType?: 'all' | 'single';
  fileName?: string;
  showAssignmentSummary?: boolean;
}

@Component({
  selector: 'app-dialog-view-schedule',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LoadingComponent,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSymbolDirective,
    ScheduleTimelineComponent,
    MatSelectModule,
    MatFormFieldModule,
    MatDividerModule
  ],
  templateUrl: './dialog-view-schedule.component.html',
  styleUrls: ['./dialog-view-schedule.component.scss'],
  animations: [fadeAnimation],
})
export class DialogViewScheduleComponent implements OnInit, OnDestroy {
  title: string = '';
  subtitle: string = '';
  isLoading = true;
  scheduleGroups?: ScheduleGroup[];
  selectedView: 'table-view' | 'pdf-view' = 'table-view';
  pdfBlobUrl: SafeResourceUrl | null = null;
  showViewToggle: boolean = true;
  summaryColumns: string[] = ['subjectCode', 'description', 'hrs', 'yearSection', 'day', 'time', 'assignmentType'];
  summaryDataSource = new MatTableDataSource<any>([]);
  dynamicLoadTypes: { id: number, name: string }[] = [];

  // State trackers for Save workflow
  isSaving = false;
  wasSaved = false;

  get scheduleData(): any {
    return this.data.entityData;
  }

  get scheduleDataCopy(): any[] {
    return Array.isArray(this.data.entityData) ? [...this.data.entityData] : [];
  }

  get hasChanges(): boolean {
    if (!this.summaryDataSource.data) return false;
    return this.summaryDataSource.data.some(s => s.assignment_type_id !== s.originalAssignmentTypeId);
  }

  private currentRawBlobUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<DialogViewScheduleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewScheduleDialogData,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private schedulingService: SchedulingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.showViewToggle = data.showViewToggle ?? true;
    if (!this.showViewToggle) {
      this.selectedView = 'pdf-view';
    }
  }

  ngOnInit(): void {
    // Fetch dynamic load types from database
    this.schedulingService.getAssignmentTypes().subscribe({
      next: (types) => {
        this.dynamicLoadTypes = types;
      },
      error: (err) => console.error('Failed to load assignment types', err)
    });

    this.initializeScheduleTitle();
    
    if (this.data.entity === 'faculty' && Array.isArray(this.data.entityData)) {
      this.data.entityData.forEach(s => {
        // Track the ID instead of the string name
        s.assignment_type_id = s.assignment_type_id || null; 
        s.originalAssignmentTypeId = s.assignment_type_id; 
      });

      this.summaryDataSource.data = this.data.entityData;
    }

    this.initializeScheduleData();
  }

  ngOnDestroy(): void {
    if (this.currentRawBlobUrl) {
      URL.revokeObjectURL(this.currentRawBlobUrl);
    }
  }

  private initializeScheduleData() {
    if (this.data.entity === 'program') {
      if (this.data.scheduleGroups && this.data.scheduleGroups.length > 0) {
        this.scheduleGroups = this.data.scheduleGroups;
        if (this.selectedView === 'pdf-view') this.generateAndDisplayPdf();
        else this.isLoading = false;
      } else {
        this.isLoading = false;
      }
    } else if (this.data.entity === 'faculty' || this.data.entity === 'room') {
      if (this.data.exportType === 'all') {
        this.generateAndDisplayPdf();
      } else if (Array.isArray(this.data.entityData) && this.data.entityData.length > 0) {
        if (this.selectedView === 'pdf-view') {
          this.generateAndDisplayPdf();
        } else {
          this.isLoading = false;
        }
      } else {
        this.isLoading = false;
      }
    }
  }

  private initializeScheduleTitle(): void {
    const { customTitle, entityData, academicYear, semester } = this.data;
    this.title = customTitle ?? entityData?.name ?? entityData?.title ?? 'Schedule';
    this.subtitle = academicYear && semester ? `For Academic Year ${academicYear}, ${semester}` : '';
  }

  public closeDialog(): void {
    // Pass the saved state back to the parent component
    console.log('closeDialog() called, wasSaved =', this.wasSaved);
    this.dialogRef.close(this.wasSaved);
  }

  onViewChange(view: 'table-view' | 'pdf-view'): void {
    this.selectedView = view;
    this.isLoading = true;
    if (view === 'pdf-view') {
      this.generateAndDisplayPdf();
    } else {
      this.pdfBlobUrl = null;
      this.isLoading = false;
    }
  }

  async generateAndDisplayPdf(): Promise<void> {
    if (this.data.generatePdfFunction) {
      try {
        const result = this.data.generatePdfFunction(true, this.summaryDataSource.data);
        const pdfBlob = result instanceof Promise ? await result : result;

        if (pdfBlob instanceof Blob) {
          if (this.currentRawBlobUrl) URL.revokeObjectURL(this.currentRawBlobUrl);
          this.currentRawBlobUrl = URL.createObjectURL(pdfBlob);
          this.pdfBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentRawBlobUrl);
        } else {
          this.pdfBlobUrl = null;
        }
      } catch (error) {
        console.error('PDF preview failed:', error);
        this.pdfBlobUrl = null;
      } finally {
        this.isLoading = false;
      }
    } else {
      this.isLoading = false;
      this.pdfBlobUrl = null;
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.data.generatePdfFunction) return;
    try {
      const result = this.data.generatePdfFunction(false, this.summaryDataSource.data);
      const pdfResult = result instanceof Promise ? await result : result;
      if (pdfResult instanceof Blob) {
        const blobUrl = URL.createObjectURL(pdfResult);
        const a = document.createElement('a');
        a.href = blobUrl;
        const fileName = this.data.fileName ?? this.data.customTitle?.replace(/\s+/g, '_') ?? 'schedule';
        a.download = `${fileName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('PDF download failed:', error);
    }
  }

  async downloadExcel(): Promise<void> {
    if (this.data.generateExcelFunction) {
      try {
        await this.data.generateExcelFunction();
      } catch (error) {
        console.error('Error downloading Excel:', error);
      }
    }
  }

  calculateHours(start: string, end: string): number {
    if (!start || !end) return 0;
    const startMins = this.timeToMinutes(start);
    const endMins = this.timeToMinutes(end);
    return parseFloat(((endMins - startMins) / 60).toFixed(2));
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
  }

  formatTimeDisplay(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  onAssignmentTypeChange(schedule: any, event: any): void {
    if (event.value === 'CONFIGURE') {
      // Use setTimeout to force Angular to update the UI and remove the selection
      setTimeout(() => {
        schedule.assignment_type_id = schedule.originalAssignmentTypeId || null;
      });
      
      this.openConfigureDialog();
      return;
    }

    schedule.assignment_type_id = event.value;
    
    // Find and map the string name so the local object stays fully updated
    const selectedType = this.dynamicLoadTypes.find(t => t.id === event.value);
    schedule.assignment_type = selectedType ? selectedType.name : null;
  }

  clearAll(): void {
    this.summaryDataSource.data.forEach(s => {
      s.assignment_type_id = null;
      s.assignment_type = null;
    });
  }

  openConfigureDialog(): void {
    const configDialog = this.dialog.open(DialogConfigureLoadTypeComponent, {
      width: '500px',
      autoFocus: false,
      disableClose: true // Force them to use the close button
    });

    configDialog.afterClosed().subscribe((wasChanged: boolean) => {
      if (wasChanged) {
        // If they added or deleted something, re-fetch the list for the dropdown!
        this.schedulingService.getAssignmentTypes().subscribe(types => {
          this.dynamicLoadTypes = types;
        });
      }
    });
  }

  saveChanges(): void {
    // 1. Check against the new ID
    const changedSchedules = this.summaryDataSource.data.filter(
      s => s.assignment_type_id !== s.originalAssignmentTypeId
    );

    if (changedSchedules.length === 0) return;

    this.isSaving = true;

    const requests = changedSchedules.map(s => {
      const scheduleId = s.schedule_id || s.id;
      
      // 2. Pass the ID, not the string!
      return this.schedulingService.updateAssignmentType(scheduleId, s.assignment_type_id).pipe(
        tap(() => {
          s.originalAssignmentTypeId = s.assignment_type_id; 
          s.originalAssignmentType = s.assignment_type; // keep string synced just in case
        }) 
      );
    });

    // Execute bulk save
    forkJoin(requests).subscribe({
      next: () => {
        this.isSaving = false;
        this.wasSaved = true; // Mark as saved so table refreshes on close
        this.snackBar.open('Assignments saved successfully!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Error saving assignments', err);
        this.snackBar.open('Failed to save assignments.', 'Close', { duration: 3000 });
      }
    });
  }
}