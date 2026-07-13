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
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { forkJoin, Observable } from 'rxjs';

import { tap } from 'rxjs/operators';

import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { LoadingComponent } from '../loading/loading.component';
import { ScheduleTimelineComponent } from '../schedule-timeline/schedule-timeline.component';
import { fadeAnimation } from '../../core/animations/animations';
import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';
import { ReportsService } from '../../core/services/admin/reports/reports.service';
import { MatDialog } from '@angular/material/dialog';
import { DialogConfigureLoadTypeComponent } from '../dialog-configure-load-type/dialog-configure-load-type.component';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

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
  exportType?: string;
  fileName?: string;
  showAssignmentSummary?: boolean;
  facultyId?: number;
  termId?: number;
  facultyType?: string;
  isAdmin?: boolean;
  regularUnits?: number;
  additionalUnits?: number;
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
    MatInputModule,
    MatDividerModule,
    MatTooltipModule
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

  // Faculty Time Plots properties
  timePlots: any[] = [];
  originalTimePlots: any[] = [];
  timePlotCaps: any = {};
  eligibleTypes: string[] = [];
  selectedType: string = '';
  selectedDay: string = 'Monday';
  startTime: string = '07:00';
  endTime: string = '08:30';

  // Fixed Night Service slots
  readonly NIGHT_SERVICE_SLOTS = [
    { label: '5:00 PM – 8:00 PM', start: '17:00', end: '20:00' },
    { label: '6:00 PM – 9:00 PM', start: '18:00', end: '21:00' },
  ];

  selectedNightSlot: string = '17:00';
  isAddingTimePlot = false;
  timeOptions: { value: string; label: string; minutes: number }[] = [];
  endTimeOptions: { value: string; label: string; minutes: number }[] = [];
  pendingAdditions: any[] = [];
  pendingDeletions: number[] = [];

  get showTimePlotPanel(): boolean {
    return this.data.entity === 'faculty' && 
           !!this.data.isAdmin && 
           this.data.facultyType !== 'Part-Time';
  }

  get scheduleData(): any {
    return this.data.entityData;
  }

  get scheduleDataCopy(): any[] {
    return Array.isArray(this.data.entityData) ? [...this.data.entityData] : [];
  }

  get hasChanges(): boolean {
    const data = this.summaryDataSource?.data || [];
    const hasLoadTypeChanges = data.some(
      s => s.assignment_type_id !== s.originalAssignmentTypeId
    );
    const hasTimePlotChanges = this.pendingAdditions.length > 0 ||
                               this.pendingDeletions.length > 0;
    return hasLoadTypeChanges || hasTimePlotChanges;
  }



  private currentRawBlobUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<DialogViewScheduleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewScheduleDialogData,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private schedulingService: SchedulingService,
    private reportsService: ReportsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.showViewToggle = data.showViewToggle ?? true;
    if (!this.showViewToggle) {
      this.selectedView = 'pdf-view';
    }
  }

  ngOnInit(): void {
    if (this.showTimePlotPanel) {
      this.getEligibleTypes();
      this.generateTimeOptions();

      if (this.selectedType === 'night_service') {
        this.startTime = '17:00';
        this.endTime = '20:00';
      } else if (this.startTime) {
        this.onStartTimeChange(this.startTime);
      }

      this.loadTimePlots();
    }


    // Fetch dynamic load types from database
    this.schedulingService.getAssignmentTypes().subscribe({
      next: (types) => {
        this.dynamicLoadTypes = types;
      },
      error: (err) => console.error('Failed to load assignment types', err)
    });

    this.initializeScheduleTitle();
    
    if (this.data.entity === 'faculty' && Array.isArray(this.data.entityData)) {
      // FIX: Create a shallow copy of the data so we don't mutate the parent table's memory!
      const clonedSchedules = this.data.entityData.map(s => ({ ...s }));

      clonedSchedules.forEach(s => {
        s.assignment_type_id = s.assignment_type_id || null; 
        s.originalAssignmentTypeId = s.assignment_type_id; 
      });

      this.summaryDataSource.data = clonedSchedules;
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
    const data = this.summaryDataSource?.data || [];
    const changedSchedules = data.filter(
      s => s.assignment_type_id !== s.originalAssignmentTypeId
    );

    const hasTimePlotChanges = this.pendingAdditions.length > 0 ||
                               this.pendingDeletions.length > 0;
    if (changedSchedules.length === 0 && !hasTimePlotChanges) {
      console.log('saveChanges: No changes detected.');
      return;
    }

    this.isSaving = true;
    const requests: Observable<any>[] = [];

    changedSchedules.forEach(s => {
      const scheduleId = s.schedule_id || s.id;
      console.log('Adding schedule assignment type update request:', {
        scheduleId,
        assignment_type_id: s.assignment_type_id
      });
      requests.push(
        this.schedulingService.updateAssignmentType(
          scheduleId,
          s.assignment_type_id
        ).pipe(
          tap(() => {
            s.originalAssignmentTypeId = s.assignment_type_id; 
            s.originalAssignmentType = s.assignment_type; 
          }) 
        )
      );
    });

    this.pendingAdditions.forEach(plot => {
      const payload = {
        faculty_id: plot.faculty_id,
        active_semester_id: plot.active_semester_id,
        time_type: plot.time_type,
        day: plot.day,
        start_time: plot.start_time,
        end_time: plot.end_time
      };
      console.log('Adding time plot create request payload:', payload);
      requests.push(this.reportsService.createFacultyTimePlot(payload));
    });

    this.pendingDeletions.forEach(id => {
      console.log('Adding time plot delete request for ID:', id);
      requests.push(this.reportsService.deleteFacultyTimePlot(id));
    });

    console.log(`Executing ${requests.length} save requests via forkJoin...`);

    forkJoin(requests).subscribe({
      next: (responses) => {
        console.log('Save requests executed successfully. Responses:', responses);
        this.isSaving = false;
        this.wasSaved = true;
        this.pendingAdditions = [];
        this.pendingDeletions = [];
        this.snackBar.open('Changes saved successfully!', 'Close', {
          duration: 3000
        });
        this.loadTimePlots();
      },
      error: (err) => {
        console.error('Save requests failed:', err);
        this.isSaving = false;
        let msg = 'Failed to save changes.';
        if (err && err.message) {
          msg = err.message;
        } else if (err.error) {
          if (err.error.message) {
            msg = err.error.message;
          } else if (err.error.errors) {
            const errorKeys = Object.keys(err.error.errors);
            if (errorKeys.length > 0) {
              const firstKey = errorKeys[0];
              const firstError = err.error.errors[firstKey];
              msg = Array.isArray(firstError) ? firstError[0] : firstError;
            }
          }
        }
        this.snackBar.open(`Error: ${msg}`, 'Close', { duration: 5000 });
      }
    });
  }


  /**
   * Identifies eligible time types based on faculty role/type.
   */
  getEligibleTypes(): void {
    const type = this.data.facultyType || '';
    if (type.includes('Designee') || type.startsWith('Designee')) {
      this.eligibleTypes = ['night_service', 'official_time'];
    } else if (type === 'Full-Time' || type === 'Temporary') {
      this.eligibleTypes = ['advising_time'];
    } else {
      this.eligibleTypes = [];
    }
    if (this.eligibleTypes.length > 0) {
      this.selectedType = this.eligibleTypes[0];
    }
  }

  /**
   * Generates time options in 30-minute intervals from 7:00 AM to 9:00 PM.
   */
  generateTimeOptions(): void {
    const start = 7 * 60;
    const end = 21 * 60;
    const interval = 30;
    this.timeOptions = [];

    for (let mins = start; mins <= end; mins += interval) {
      const hours = Math.floor(mins / 60);
      const m = mins % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hDisplay = hours % 12 || 12;
      const label = `${hDisplay}:${m.toString().padStart(2, '0')} ${ampm}`;
      const value = `${hours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      this.timeOptions.push({ value, label, minutes: mins });
    }
  }

  /**
   * Dynamically filters end time choices based on selected start time.
   *
   * @param newStartValue The start time value string (e.g. '07:00')
   */
  onStartTimeChange(newStartValue: string): void {
    const selectedSlot = this.timeOptions.find(opt => opt.value === newStartValue);
    if (!selectedSlot) {
      this.endTimeOptions = [];
      return;
    }

    this.endTimeOptions = this.timeOptions.filter(
      opt => opt.minutes > selectedSlot.minutes
    );

    if (this.endTime) {
      const isStillAvailable = this.endTimeOptions.some(
        opt => opt.value === this.endTime
      );
      if (!isStillAvailable) {
        this.endTime = '';
      }
    }
  }

  // Updates start and end times automatically when a night service slot is selected
  onNightSlotChange(startValue: string): void {
    const slot = this.NIGHT_SERVICE_SLOTS.find(
      s => s.start === startValue
    );
    if (slot) {
      this.startTime = slot.start;
      this.endTime = slot.end;
    }
  }

  // Resets or initializes time options when the assignment type changes
  onTypeChange(newType: string): void {
    if (newType === 'night_service') {
      this.selectedNightSlot = '17:00';
      this.startTime = '17:00';
      this.endTime = '20:00';
    } else {
      this.startTime = '07:00';
      this.onStartTimeChange(this.startTime);
    }
  }

  // Checks if total plotted night service hours exceed the hard limit of 15 hours
  isNightServiceOverCap(): boolean {
    return this.getPlottedHours('night_service') > 15;
  }

  /**
   * Fetches time plots for the faculty member from the database.
   */
  loadTimePlots(): void {
    if (!this.data.facultyId || !this.data.termId) return;

    this.reportsService
      .getFacultyTimePlots(this.data.facultyId, this.data.termId)
      .subscribe({
        next: (res) => {
          this.originalTimePlots = res.time_plots || [];
          this.timePlotCaps = res.caps || {};
          this.syncLocalTimePlotsState();
        },
        error: (err) => console.error('Failed to load time plots', err)
      });
  }

  /**
   * Synchronises buffered memory edits (additions/deletions) to UI list.
   */
  syncLocalTimePlotsState(): void {
    let current = this.originalTimePlots.map(p => ({ ...p }));
    if (this.pendingDeletions.length > 0) {
      current = current.filter(p => !this.pendingDeletions.includes(p.id));
    }
    if (this.pendingAdditions.length > 0) {
      current = [...current, ...this.pendingAdditions];
    }
    this.timePlots = current;
    this.cdr.detectChanges();
  }

  /**
   * Utility helper to check if two time ranges overlap.
   */
  doTimesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
    const start1 = this.timeToMinutes(s1);
    const end1 = this.timeToMinutes(e1);
    const start2 = this.timeToMinutes(s2);
    const end2 = this.timeToMinutes(e2);
    return Math.max(start1, start2) < Math.min(end1, end2);
  }

/**
   * Calculates total plotted hours for a given time type.
   * Automatically adds "Regular Load" classes to "Official Time".
   */
  getPlottedHours(type: string): number {
    let totalMin = 0;
    const plotsOfType = this.timePlots.filter(p => p.time_type === type);
    for (const plot of plotsOfType) {
      const startMin = this.timeToMinutes(plot.start_time.substring(0, 5));
      const endMin = this.timeToMinutes(plot.end_time.substring(0, 5));
      totalMin += (endMin - startMin);
    }
    
    let hours = totalMin / 60;

    // NEW: If calculating Official Time, automatically add Regular Load teaching hours!
    if (type === 'official_time') {
      hours += this.totalRegularTeachingHours;
    }

    return parseFloat(hours.toFixed(2));
  }

  /**
   * Calculates remaining hours before hitting the weekly cap.
   */
  getRemainingHours(type: string): number {
    const cap = this.timePlotCaps[type] || 0;
    const plotted = this.getPlottedHours(type);
    return Math.max(0, cap - plotted);
  }

  /**
   * Formats the time plot type key for display.
   */
  getDisplayTypeName(type: string): string {
    switch (type) {
      case 'night_service': return 'Night Service';
      case 'official_time': return 'Official Time';
      case 'advising_time': return 'Advising Time';
      default: return type;
    }
  }

  /**
   * Submits a request to store a new faculty time plot block.
   */
  onAddTimePlot(): void {
    if (!this.selectedType || !this.selectedDay ||
        !this.startTime || !this.endTime) {
      this.snackBar.open('Please fill out all fields.', 'Close', {
        duration: 3000
      });
      return;
    }

    const startMin = this.timeToMinutes(this.startTime);
    const endMin = this.timeToMinutes(this.endTime);
    if (endMin <= startMin) {
      this.snackBar.open('End time must be after start time.', 'Close', {
        duration: 3000
      });
      return;
    }

    // 1. Check plotted overlaps
    const hasOverlap = this.timePlots.some(p =>
      p.day === this.selectedDay &&
      this.doTimesOverlap(
        this.startTime,
        this.endTime,
        p.start_time.substring(0, 5),
        p.end_time.substring(0, 5)
      )
    );

    if (hasOverlap) {
      this.snackBar.open(
        'This time slot overlaps with another plotted time slot.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    // 2. Check teaching schedule conflicts
    const hasScheduleConflict = this.scheduleDataCopy.some(s =>
      s.day === this.selectedDay &&
      s.start_time &&
      s.end_time &&
      this.doTimesOverlap(
        this.startTime,
        this.endTime,
        s.start_time.substring(0, 5),
        s.end_time.substring(0, 5)
      )
    );

    if (hasScheduleConflict) {
      this.snackBar.open(
        'This time slot overlaps with an assigned class schedule.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    // 3. Check cap limit
    const cap = this.timePlotCaps[this.selectedType] || 0;
    const plotted = this.getPlottedHours(this.selectedType);
    const duration = (endMin - startMin) / 60;
    if (plotted + duration > cap) {
      const typeName = this.getDisplayTypeName(this.selectedType);
      this.snackBar.open(
        `Adding this slot exceeds the weekly limit of ${cap} hours ` +
        `for ${typeName}.`,
        'Close',
        { duration: 5000 }
      );
      return;
    }

    const tempPlot = {
      id: -Date.now(),
      faculty_id: this.data.facultyId,
      active_semester_id: this.data.termId,
      time_type: this.selectedType,
      day: this.selectedDay,
      start_time: this.startTime,
      end_time: this.endTime,
      isTemp: true
    };

    this.pendingAdditions.push(tempPlot);
    this.syncLocalTimePlotsState();
    this.snackBar.open('Time slot added. Remember to save changes.', 'Close', { duration: 3000 });
  }

  /**
   * Deletes an existing time plot block by ID.
   */
  onDeleteTimePlot(id: number): void {
    if (id < 0) {
      this.pendingAdditions = this.pendingAdditions.filter(p => p.id !== id);
    } else {
      if (!this.pendingDeletions.includes(id)) {
        this.pendingDeletions.push(id);
      }
    }
    this.syncLocalTimePlotsState();
    this.snackBar.open('Time slot removed. Remember to save changes.', 'Close', { duration: 3000 });
  }

  // ==========================================
  // --- REAL-TIME HOUR TRACKING & VALIDATION ---
  // ==========================================

  get maxRegularHours(): number {
    if (this.data.regularUnits !== undefined) return this.data.regularUnits;
    const type = (this.data.facultyType || '').toLowerCase();
    if (type.includes('part-time') || type.includes('part time')) return 0;
    if (type.includes('director')) return 3;
    if (type.includes('hap')) return 6;
    if (type.includes('special')) return 9;
    if (type.includes('designee')) return 6;
    return 15;
  }

  get maxAdditionalHours(): number {
    if (this.data.additionalUnits !== undefined) return this.data.additionalUnits;
    return 12;
  }

  /**
   * Calculates Total Regular Teaching Hours Plotted.
   */
  get totalRegularTeachingHours(): number {
    const schedules = this.summaryDataSource?.data || [];
    let total = 0;
    for (const sched of schedules) {
      if (sched.assignment_type_id) {
        const foundType = this.dynamicLoadTypes.find(t => t.id === sched.assignment_type_id);
        const typeName = foundType ? foundType.name : (sched.assignment_type || '');
        if (typeName.toLowerCase().includes('regular')) {
          total += this.calculateHours(sched.start_time, sched.end_time);
        }
      }
    }
    return parseFloat(total.toFixed(2));
  }

  /**
   * NEW: Creates individual badges for Regular, Part Time, and Others.
   * Calculates specific Red/Green statuses for each individual limit!
   */
  get facultyLoadBadges(): { label: string, hours: number, max?: number, statusClass: string }[] {
    const badges = [];
    const schedules = this.summaryDataSource?.data || [];
    
    let regularHrs = 0;
    let partTimeHrs = 0;
    const otherBreakdown: Record<string, number> = {};

    for (const sched of schedules) {
      if (sched.assignment_type_id) {
        const foundType = this.dynamicLoadTypes.find(t => t.id === sched.assignment_type_id);
        const typeName = foundType ? foundType.name : (sched.assignment_type || '');
        const hrs = this.calculateHours(sched.start_time, sched.end_time);

        if (typeName.toLowerCase().includes('regular')) {
          regularHrs += hrs;
        } else if (typeName.toLowerCase().includes('part time') || typeName.toLowerCase().includes('part-time')) {
          partTimeHrs += hrs;
        } else {
          otherBreakdown[typeName] = (otherBreakdown[typeName] || 0) + hrs;
        }
      }
    }

    // 1. Regular Load Badge
    let regStatus = 'status-neutral';
    if (regularHrs > this.maxRegularHours) regStatus = 'status-red';
    else if (regularHrs > 0 && regularHrs >= this.maxRegularHours) regStatus = 'status-green';
    
    badges.push({
      label: 'Regular Load',
      hours: parseFloat(regularHrs.toFixed(2)),
      max: this.maxRegularHours,
      statusClass: regStatus
    });

    // 2. Part Time Badge
    if (partTimeHrs > 0 || this.maxAdditionalHours > 0) {
      let ptStatus = 'status-neutral';
      if (partTimeHrs > this.maxAdditionalHours) ptStatus = 'status-red';
      
      badges.push({
        label: 'Part Time',
        hours: parseFloat(partTimeHrs.toFixed(2)),
        max: this.maxAdditionalHours,
        statusClass: ptStatus
      });
    }

    // 3. Other Dynamic Load Types (Temporary Substitution, etc.)
    for (const [type, hrs] of Object.entries(otherBreakdown)) {
      badges.push({
        label: type,
        hours: parseFloat(hrs.toFixed(2)),
        statusClass: 'status-neutral'
      });
    }

    return badges;
  }

  get remainingOfficialTimeHours(): number {
    const plottedOfficialTime = this.getPlottedHours('official_time');
    return Math.max(0, parseFloat((plottedOfficialTime - this.totalRegularTeachingHours).toFixed(2)));
  }

  get hasPartTimeRegularViolation(): boolean {
    const isPartTime = (this.data.facultyType || '').toLowerCase().includes('part-time') || 
                       (this.data.facultyType || '').toLowerCase().includes('part time');
    if (!isPartTime) return false;

    const schedules = this.summaryDataSource?.data || [];
    return schedules.some(sched => {
      const foundType = this.dynamicLoadTypes.find(t => t.id === sched.assignment_type_id);
      const type = foundType ? foundType.name.toLowerCase() : (sched.assignment_type || '').toLowerCase();
      return type.includes('regular');
    });
  }

  get hasTimeWindowViolation(): boolean {
    const schedules = this.summaryDataSource?.data || [];
    const WINDOW_START = 7 * 60;  // 7:00 AM in minutes
    const WINDOW_END = 17 * 60;   // 5:00 PM in minutes

    return schedules.some(sched => {
      const foundType = this.dynamicLoadTypes.find(t => t.id === sched.assignment_type_id);
      const type = foundType ? foundType.name.toLowerCase() : (sched.assignment_type || '').toLowerCase();
      if (!type.includes('regular')) return false;

      const startMins = this.timeToMinutes(sched.start_time);
      const endMins = this.timeToMinutes(sched.end_time);
      return startMins < WINDOW_START || endMins > WINDOW_END;
    });
  }

  get dialogWarningsTooltip(): string {
    const warnings: string[] = [];
    const badges = this.facultyLoadBadges;
    
    const regBadge = badges.find(b => b.label === 'Regular Load');
    const ptBadge = badges.find(b => b.label === 'Part Time');

    if (regBadge && regBadge.max && regBadge.hours > regBadge.max) {
      warnings.push(`⚠️ Exceeded Limit: Plotted ${regBadge.hours} hrs of Regular Load (Max: ${regBadge.max} hrs).`);
    }
    if (ptBadge && ptBadge.max && ptBadge.hours > ptBadge.max) {
      warnings.push(`⚠️ Exceeded Limit: Plotted ${ptBadge.hours} hrs of Part Time Load (Max: ${ptBadge.max} hrs).`);
    }
    if (this.hasPartTimeRegularViolation) {
      warnings.push(`⚠️ Part-Time Restriction: Part-time faculty cannot be assigned regular loads.`);
    }
    if (this.hasTimeWindowViolation) {
      warnings.push(`⚠️ Time Window Violation: One or more Regular Loads are scheduled outside 7:00 AM - 5:00 PM.`);
    }
    return warnings.join('\n');
  }

  getRowWarning(sched: any): string | null {
    const foundType = this.dynamicLoadTypes.find(t => t.id === sched.assignment_type_id);
    const type = foundType ? foundType.name.toLowerCase() : (sched.assignment_type || '').toLowerCase();
    
    // We only validate rules against "Regular" loads. If Part Time is selected, no warning!
    if (!type.includes('regular')) return null;

    const isPartTime = (this.data.facultyType || '').toLowerCase().includes('part-time') || 
                       (this.data.facultyType || '').toLowerCase().includes('part time');
    if (isPartTime) {
      return 'Part-time faculty cannot have regular loads.';
    }

    const startMins = this.timeToMinutes(sched.start_time);
    const endMins = this.timeToMinutes(sched.end_time);
    const WINDOW_START = 7 * 60;
    const WINDOW_END = 17 * 60;

    if (startMins < WINDOW_START || endMins > WINDOW_END) {
      return 'Regular loads must be 7AM - 5PM.';
    }

    return null;
  }
}