import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';

import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

import { FacultyScheduleTimetableComponent } from '../faculty-schedule-timetable/faculty-schedule-timetable.component';
import { DialogManualOverrideComponent } from '../dialog-manual-override/dialog-manual-override.component';
import { LoadingComponent } from '../loading/loading.component';
import { fadeAnimation } from '../../core/animations/animations';

export interface ViewInternalArrangementsDialogData {
  facultyId: number;
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  schedules: any[];
  academicYear?: string;
  semester?: string;
  generatePdfFunction?: () => Blob | Promise<Blob> | void;
  generateExcelFunction?: () => Promise<void> | void;
  onScheduleUpdated?: () => void;
}

@Component({
  selector: 'app-dialog-view-internal-arrangements',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    LoadingComponent,
    FacultyScheduleTimetableComponent
  ],
  templateUrl: './dialog-view-internal-arrangements.component.html',
  styleUrls: ['./dialog-view-internal-arrangements.component.scss'],
  animations: [fadeAnimation]
})
export class DialogViewInternalArrangementsComponent implements OnInit, OnDestroy {
  title = '';

  subtitle = '';

  timeOptions: string[] = [];

  wasSaved = false;

  selectedView: 'table-view' | 'pdf-view' = 'table-view';

  pdfBlobUrl: SafeResourceUrl | null = null;

  isLoadingPdf = false;

  private currentRawBlobUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<DialogViewInternalArrangementsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewInternalArrangementsDialogData,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog
  ) {}

  // Initializes title, subtitle, and time dropdown options
  ngOnInit(): void {
    this.title = `${this.data.facultyName} (Internal Arrangement)`;

    if (this.data.academicYear && this.data.semester) {
      this.subtitle = `For Academic Year ${this.data.academicYear}, ${this.data.semester}`;
    } else {
      this.subtitle = 'Internal Arrangement Timetable';
    }

    this.generateTimeOptions();
  }

  // Revokes active blob URL on component destroy
  ngOnDestroy(): void {
    if (this.currentRawBlobUrl) {
      URL.revokeObjectURL(this.currentRawBlobUrl);
    }
  }

  // Generates 12-hour formatted time options array
  private generateTimeOptions(): void {
    const times: string[] = [];

    for (let hour = 7; hour <= 21; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 21 && min > 0) break;

        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        const displayMin = min === 0 ? '00' : '30';

        times.push(`${displayHour}:${displayMin} ${period}`);
      }
    }

    this.timeOptions = times;
  }

  // Formats 24-hour time string into 12-hour AM/PM format
  private formatTo12Hour(time24: string): string {
    if (!time24) return '';

    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = String(m).padStart(2, '0');

    return `${displayHour}:${displayMin} ${period}`;
  }

  // Builds formatted faculty schedule object for FacultyScheduleTimetable
  get formattedFacultySchedule(): any {
    return {
      faculty_name: this.data.facultyName,
      schedules: this.data.schedules || []
    };
  }

  // Handles toggle between Table View and PDF View
  onViewChange(view: 'table-view' | 'pdf-view'): void {
    this.selectedView = view;

    if (view === 'pdf-view') {
      this.generateAndDisplayPdf();
    } else {
      this.pdfBlobUrl = null;
    }
  }

  // Generates and sets PDF preview iframe URL
  async generateAndDisplayPdf(): Promise<void> {
    if (!this.data.generatePdfFunction) {
      this.pdfBlobUrl = null;
      return;
    }

    this.isLoadingPdf = true;

    try {
      const result = this.data.generatePdfFunction();
      const pdfBlob = result instanceof Promise ? await result : result;

      if (pdfBlob instanceof Blob) {
        if (this.currentRawBlobUrl) {
          URL.revokeObjectURL(this.currentRawBlobUrl);
        }

        this.currentRawBlobUrl = URL.createObjectURL(pdfBlob);
        this.pdfBlobUrl =
          this.sanitizer.bypassSecurityTrustResourceUrl(this.currentRawBlobUrl);
      } else {
        this.pdfBlobUrl = null;
      }
    } catch (error) {
      console.error('PDF preview failed:', error);
      this.pdfBlobUrl = null;
    } finally {
      this.isLoadingPdf = false;
    }
  }

  // Triggers PDF download
  async downloadPdf(): Promise<void> {
    if (!this.data.generatePdfFunction) return;

    try {
      const result = this.data.generatePdfFunction();
      const pdfResult = result instanceof Promise ? await result : result;

      if (pdfResult instanceof Blob) {
        const blobUrl = URL.createObjectURL(pdfResult);
        const a = document.createElement('a');
        a.href = blobUrl;
        const formattedName =
          this.data.facultyName.replace(',', '').replace(/\s+/g, '_');
        a.download = `${formattedName}_Arrangements.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('PDF download failed:', error);
    }
  }

  // Triggers Excel download
  async downloadExcel(): Promise<void> {
    if (this.data.generateExcelFunction) {
      try {
        await this.data.generateExcelFunction();
      } catch (error) {
        console.error('Excel download failed:', error);
      }
    }
  }

  // Opens manual override dialog when flag icon is clicked on schedule block
  onAppealClicked(block: any): void {
    const dialogRef = this.dialog.open(DialogManualOverrideComponent, {
      width: '520px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: true,
      disableClose: true,
      data: {
        facultyName: this.data.facultyName,
        options: { timeOptions: this.timeOptions },
        original: {
          scheduleId: block.schedule_id,
          courseCode: block.course_details?.course_code || '',
          courseTitle: block.course_details?.course_title || '',
          program: block.program_code || '',
          yearLevel: String(block.year_level || ''),
          section: block.section_name || '',
          day: block.day,
          roomCode: block.room_code || 'TBA',
          timeRange: `${this.formatTo12Hour(block.start_time)} - ${this.formatTo12Hour(block.end_time)}`
        }
      }
    });

    dialogRef.afterClosed().subscribe((wasSaved: boolean) => {
      if (wasSaved) {
        this.wasSaved = true;

        if (this.data.onScheduleUpdated) {
          this.data.onScheduleUpdated();
        }

        if (this.selectedView === 'pdf-view') {
          this.generateAndDisplayPdf();
        }
      }
    });
  }

  // Closes the view dialog
  closeDialog(): void {
    this.dialogRef.close(this.wasSaved);
  }
}
