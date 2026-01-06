import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './rescheduling.component.html',
  styleUrl: './rescheduling.component.scss'
})
export class ReschedulingComponent implements OnInit {
  pendingAppeals: ReschedulingAppeal[] = [];
  selectedAppeal: ReschedulingAppeal | null = null;
  showModal: boolean = false;
  
  // Days of the week
  daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Time options (you can customize these)
  timeOptions: string[] = [];

  ngOnInit(): void {
    this.generateTimeOptions();
    this.loadMockData();
  }

  generateTimeOptions(): void {
    // Generate time options from 7:00 AM to 9:00 PM in 30-minute intervals
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute === 0 ? '00' : minute;
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
  }

  openEditModal(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    if (!this.selectedAppeal.preferredDay) {
      this.selectedAppeal.preferredDay = 'Tue';
    }
    if (!this.selectedAppeal.preferredStartTime) {
      this.selectedAppeal.preferredStartTime = '8:00 AM';
    }
    if (!this.selectedAppeal.preferredEndTime) {
      this.selectedAppeal.preferredEndTime = '11:00 AM';
    }
    if (!this.selectedAppeal.room) {
      this.selectedAppeal.room = 'A401';
    }
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
    if (this.selectedAppeal) {
      this.selectedAppeal.preferredDay = day;
    }
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
    if (this.selectedAppeal) {
      // Find the appeal in the list and update it
      const index = this.pendingAppeals.findIndex(a => a.id === this.selectedAppeal!.id);
      if (index !== -1) {
        this.pendingAppeals[index] = { ...this.selectedAppeal };
        this.pendingAppeals[index].appealVerification = 'Scheduled';
      }
      
      // Here you would typically make an API call to save the data
      console.log('Assigning schedule:', this.selectedAppeal);
      
      this.closeModal();
    }
  }
}