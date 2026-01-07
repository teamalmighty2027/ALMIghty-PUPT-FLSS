import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { trigger, transition, style, animate } from '@angular/animations';
import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { TableHeaderComponent } from '../../../../shared/table-header/table-header.component';

interface ReschedulingAppeal {
  id: number;
  facultyName: string;
  programCode: string;
  courseTitle: string;
  originalSchedule: string;
  originalDay?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  originalRoom?: string;
  appealVerification: string;
  preferredDay?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  room?: string;
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
    LoadingComponent,
    TableHeaderComponent
  ],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 }))
      ])
    ])
  ],
  templateUrl: './rescheduling.component.html',
  styleUrl: './rescheduling.component.scss'
})
export class ReschedulingComponent implements OnInit, AfterViewInit {
  // Loading state
  isLoading = false;
  
  // Header input fields for search/filter
  headerInputFields: any[] = [];

  pendingAppeals: ReschedulingAppeal[] = [];
  selectedAppeal: ReschedulingAppeal | null = null;
  showModal: boolean = false;

  // Table
  displayedColumns: string[] = ['index', 'facultyName', 'programCode', 'originalSchedule', 'appealVerification', 'action'];
  dataSource = new MatTableDataSource<ReschedulingAppeal>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Days & time
  daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  timeOptions: string[] = [];

  ngOnInit(): void {
    this.generateTimeOptions();
    this.loadMockData();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  generateTimeOptions(): void {
    // Generate time options from 7:00 AM to 9:00 PM in 30-minute intervals
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute === 0 ? '00' : String(minute).padStart(2, '0');
        this.timeOptions.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
  }

  loadMockData(): void {
    // Mock data - replace this with actual API call
    this.pendingAppeals = [
      {
        id: 1,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Mon',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'A301',
        appealVerification: 'No started'
      },
      {
        id: 2,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Tue',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'B202',
        appealVerification: 'No started'
      },
      {
        id: 3,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Wed',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'C105',
        appealVerification: 'No started'
      },
      {
        id: 4,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Thu',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'A401',
        appealVerification: 'No started'
      },
      {
        id: 5,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Fri',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'D301',
        appealVerification: 'No started'
      },
      {
        id: 6,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Mon',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'E102',
        appealVerification: 'No started'
      },
      {
        id: 7,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Tue',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'F201',
        appealVerification: 'No started'
      },
      {
        id: 8,
        facultyName: 'Bautista, John Matthew B',
        programCode: 'ACCO 014',
        courseTitle: 'Principles of Accounting',
        originalSchedule: '8:00 AM - 11:00 AM',
        originalDay: 'Wed',
        originalStartTime: '8:00 AM',
        originalEndTime: '11:00 AM',
        originalRoom: 'G304',
        appealVerification: 'No started'
      }
    ];

    this.dataSource.data = this.pendingAppeals;
  }

  getRowIndex(i: number): number {
    const pageIndex = this.paginator ? this.paginator.pageIndex : 0;
    const pageSize = this.paginator ? this.paginator.pageSize : 25;
    return i + 1 + pageIndex * pageSize;
  }

  // Actions
  onView(appeal: ReschedulingAppeal): void {
    this.openEditModal(appeal);
  }

  onExportAll(): void {
    console.log('Export all appeals', this.dataSource.data);
    // Stub: implement real export (CSV/Excel) as needed.
  }

  onInputChange(event: any): void {
    console.log('Input changed:', event);
    // Stub: implement search/filter logic here
  }

  onExportSingle(appeal: ReschedulingAppeal): void {
    console.log('Export single appeal', appeal);
    // Stub: implement real export for `appeal`.
  }

  openEditModal(appeal: ReschedulingAppeal): void {
    console.log('Opening edit modal for appeal:', appeal);
    this.selectedAppeal = { ...appeal };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedAppeal = null;
  }

  isDaySelected(day: string): boolean {
    return this.selectedAppeal?.preferredDay === day;
  }

  selectDay(day: string): void {
    if (this.selectedAppeal) this.selectedAppeal.preferredDay = day;
  }

  clearAll(): void {
    if (this.selectedAppeal) {
      this.selectedAppeal.preferredDay = 'Tue';
      this.selectedAppeal.preferredStartTime = '8:00 AM';
      this.selectedAppeal.preferredEndTime = '11:00 AM';
      this.selectedAppeal.room = 'A401';
    }
  }

  assignSchedule(): void {
    if (!this.selectedAppeal) return;
    const index = this.pendingAppeals.findIndex(a => a.id === this.selectedAppeal!.id);
    if (index !== -1) {
      this.pendingAppeals[index] = { ...this.selectedAppeal };
      this.pendingAppeals[index].appealVerification = 'Scheduled';
      this.dataSource.data = this.pendingAppeals;
    }
    console.log('Assigning schedule:', this.selectedAppeal);
    this.closeModal();
  }
}