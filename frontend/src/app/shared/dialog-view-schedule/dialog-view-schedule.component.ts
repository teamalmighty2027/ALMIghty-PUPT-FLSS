import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { ChangeDetectorRef } from '@angular/core';

import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { LoadingComponent } from '../loading/loading.component';
import { ScheduleTimelineComponent } from '../schedule-timeline/schedule-timeline.component';
import { fadeAnimation } from '../../core/animations/animations';

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
  generatePdfFunction: (preview: boolean) => Blob | Promise<Blob> | void;
  generateExcelFunction?: () => Promise<void> | void;
  showViewToggle?: boolean;
  exportType?: 'all' | 'single';
  fileName?: string;
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
    ScheduleTimelineComponent 
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

  // ── Getter so the template always reads the live array reference ──
  get scheduleData(): any {
    return this.data.entityData;
  }

  // ── Spread copy so ngOnChanges fires in ScheduleTimelineComponent ──
  get scheduleDataCopy(): any[] {
    return Array.isArray(this.data.entityData) ? [...this.data.entityData] : [];
  }

  private currentRawBlobUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<DialogViewScheduleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewScheduleDialogData,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {
    this.showViewToggle = data.showViewToggle ?? true;
    if (!this.showViewToggle) {
      this.selectedView = 'pdf-view';
    }
  }

  ngOnInit(): void {
    this.initializeScheduleTitle();
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
        // scheduleData getter returns data.entityData automatically
        if (this.selectedView === 'pdf-view') this.generateAndDisplayPdf();
        else this.isLoading = false;
      } else {
        console.warn('No schedule groups available for programs.');
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
        console.warn('No schedules found or invalid data structure:', this.data.entityData);
        this.isLoading = false;
      }
    }
  }

  private flattenScheduleGroups(groups: ScheduleGroup[]): any[] {
    const flattenedData: any[] = [];
    groups.forEach((group) => {
      if (Array.isArray(group.scheduleData)) {
        group.scheduleData.forEach((scheduleItem: any) => {
          flattenedData.push({ ...scheduleItem, groupTitle: group.title });
        });
      }
    });
    return flattenedData;
  }

  private initializeScheduleTitle(): void {
    this.setTitleAndSubtitle();
  }

  private setTitleAndSubtitle(): void {
    const { customTitle, entityData, academicYear, semester } = this.data;
    this.title = customTitle ?? entityData?.name ?? entityData?.title ?? 'Schedule';
    this.subtitle = academicYear && semester
      ? `For Academic Year ${academicYear}, ${semester}`
      : '';
  }

  public closeDialog(): void {
    this.dialogRef.close();
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
        const result = this.data.generatePdfFunction(true);
        const pdfBlob = result instanceof Promise ? await result : result;

        if (pdfBlob instanceof Blob) {
          if (this.currentRawBlobUrl) {
            URL.revokeObjectURL(this.currentRawBlobUrl);
          }
          this.currentRawBlobUrl = URL.createObjectURL(pdfBlob);
          this.pdfBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentRawBlobUrl);
        } else {
          this.pdfBlobUrl = null;
        }
      } catch (error) {
        console.error('PDF preview generation failed:', error);
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
      const result = this.data.generatePdfFunction(false);
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

  trackGroup(index: number, group: ScheduleGroup): any {
    return group ? group.title : undefined;
  }
}