import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { trigger, transition, style, animate } from '@angular/animations';
import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { TableHeaderComponent } from '../../../../shared/table-header/table-header.component';
import { ReschedulingService, AppealResponse } from '../../../services/faculty/rescheduling/rescheduling.service';

// ── Local view model ───────────────────────────────────────────
interface ReschedulingAppeal {
  id: number;
  rawAppealId: number;
  facultyName: string;
  programCode: string;
  courseTitle: string;
  originalSchedule: string;
  originalDay?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  originalRoom?: string;
  appealVerification: string;   // 'Pending' | 'Approved' | 'Denied'
  preferredDay?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  room?: string;
  filePath?: string | null;
  reasoning?: string | null;
}

@Component({
  selector: 'app-rescheduling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    LoadingComponent,
    TableHeaderComponent,
  ],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 })),
      ]),
    ]),
  ],
  templateUrl: './rescheduling.component.html',
  styleUrl: './rescheduling.component.scss',
})
export class ReschedulingComponent implements OnInit, AfterViewInit {
  isLoading = false;
  headerInputFields: any[] = [];

  selectedAppeal: ReschedulingAppeal | null = null;
  showModal = false;
  adminRemarks = '';

  displayedColumns: string[] = [
    'index', 'facultyName', 'programCode',
    'originalSchedule', 'appealVerification', 'action',
  ];
  dataSource = new MatTableDataSource<ReschedulingAppeal>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timeOptions: string[] = [];

  constructor(private reschedulingService: ReschedulingService) {}

  ngOnInit(): void {
    this.generateTimeOptions();
    this.loadAppeals();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  // ── Helpers ────────────────────────────────────────────────────
  generateTimeOptions(): void {
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute === 0 ? '00' : String(minute).padStart(2, '0');
        this.timeOptions.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
  }

  private mapAppeal(a: AppealResponse): ReschedulingAppeal {
    let status = 'Pending';
    if (a.is_approved === true)  status = 'Approved';
    if (a.is_approved === false) status = 'Denied';

    return {
      id:               a.appeal_id,
      rawAppealId:      a.appeal_id,
      facultyName:      a.faculty_name,
      programCode:      a.program_code,
      courseTitle:      a.course_title,
      originalSchedule: `${a.original_day} | ${a.original_start_time} - ${a.original_end_time}`,
      originalDay:      a.original_day,
      originalStartTime: a.original_start_time,
      originalEndTime:  a.original_end_time,
      originalRoom:     a.original_room,
      appealVerification: status,
      preferredDay:      a.appeal_day,
      preferredStartTime: a.appeal_start_time,
      preferredEndTime:  a.appeal_end_time,
      room:              a.appeal_room ?? undefined,
      filePath:          a.file_path,
      reasoning:         a.reasoning,
    };
  }

  // ── Data loading ───────────────────────────────────────────────
  loadAppeals(): void {
    this.isLoading = true;
    this.reschedulingService.getAllAppeals().subscribe({
      next: (data) => {
        this.dataSource.data = data.map(a => this.mapAppeal(a));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load appeals:', err);
        this.isLoading = false;
      },
    });
  }

  getRowIndex(i: number): number {
    const pageIndex = this.paginator ? this.paginator.pageIndex : 0;
    const pageSize  = this.paginator ? this.paginator.pageSize  : 25;
    return i + 1 + pageIndex * pageSize;
  }

  // ── Modal ──────────────────────────────────────────────────────
  openEditModal(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    this.adminRemarks = '';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedAppeal = null;
    this.adminRemarks = '';
  }

  clearAll(): void {
    if (!this.selectedAppeal) return;
    this.selectedAppeal.preferredDay       = undefined;
    this.selectedAppeal.preferredStartTime = undefined;
    this.selectedAppeal.preferredEndTime   = undefined;
    this.selectedAppeal.room               = undefined;
    this.adminRemarks = '';
  }

  isDaySelected(day: string): boolean {
    return this.selectedAppeal?.preferredDay === day;
  }

  selectDay(day: string): void {
    if (this.selectedAppeal) this.selectedAppeal.preferredDay = day;
  }

  // ── Approve ────────────────────────────────────────────────────
  approveAppeal(): void {
    if (!this.selectedAppeal) return;

    this.reschedulingService.approveAppeal(
      this.selectedAppeal.rawAppealId,
      {
        day:       this.selectedAppeal.preferredDay       ?? '',
        startTime: this.selectedAppeal.preferredStartTime ?? '',
        endTime:   this.selectedAppeal.preferredEndTime   ?? '',
        room:      this.selectedAppeal.room               ?? '',
      },
      this.adminRemarks
    ).subscribe({
      next: () => {
        this.updateLocalStatus(this.selectedAppeal!.id, 'Approved');
        this.closeModal();
      },
      error: (err) => console.error('Failed to approve appeal:', err),
    });
  }

  // ── Deny ───────────────────────────────────────────────────────
  denyAppeal(): void {
    if (!this.selectedAppeal) return;

    this.reschedulingService.denyAppeal(
      this.selectedAppeal.rawAppealId,
      this.adminRemarks
    ).subscribe({
      next: () => {
        this.updateLocalStatus(this.selectedAppeal!.id, 'Denied');
        this.closeModal();
      },
      error: (err) => console.error('Failed to deny appeal:', err),
    });
  }

  private updateLocalStatus(id: number, status: string): void {
    this.dataSource.data = this.dataSource.data.map(row =>
      row.id === id ? { ...row, appealVerification: status } : row
    );
  }

  // ── Other ──────────────────────────────────────────────────────
  onExportAll(): void {
    console.log('Export all appeals', this.dataSource.data);
  }

  onInputChange(event: any): void {
    this.dataSource.filter = event?.value?.trim().toLowerCase() ?? '';
  }

  // Build full URL for uploaded appeal PDF
  getFileUrl(filePath: string | null | undefined): string {
    if (!filePath) return "#";
    return `http://127.0.0.1:8000/storage/${filePath}`;
  }

  assignSchedule(): void {
    this.approveAppeal();
  }
}