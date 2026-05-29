import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, SimpleChanges, OnInit, OnDestroy } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TableDialogComponent } from '../table-dialog/table-dialog.component';
import { InputField } from '../table-header/table-header.component';
import { ReportsService } from '../../core/services/admin/reports/reports.service';

@Component({
  selector: 'app-reports-header',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRippleModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    FormsModule,
  ],
  templateUrl: './reports-header.component.html',
  styleUrl: './reports-header.component.scss'
})
export class ReportsHeaderComponent implements OnInit, OnDestroy {
  @Input() inputFields: InputField[] = [];
  @Input() addButtonLabel = 'Add';
  @Input() addIconName = 'add_box';
  @Input() buttonDisabled = false;
  @Input() showExportButton = true;
  @Input() showExportDialog = false;
  @Input() showAddButton = true;
  @Input() showActiveYearAndSem = false;
  @Input() showButtons = true;
  @Input() selectedValues: { [key: string]: any } = {};
  @Input() customExportOptions: { all: string; current: string } | null = null;
  @Input() searchLabel = 'Search';
  @Input() activeYear = '';
  @Input() activeSemester = '';
  @Input() tooltipMessage = '';
  @Input() isLoading: boolean = false;
  @Input() selectedTermId: number | null = null;
  @Input() showTermFilter = true;

  @Input() showExportByProgramButton = false;
  @Output() exportByProgram = new EventEmitter<void>();

  @Output() add = new EventEmitter<void>();
  @Output() inputChange = new EventEmitter<{ [key: string]: any }>();
  @Output() export = new EventEmitter<'all' | 'current' | undefined>();
  @Output() search = new EventEmitter<string>();
  @Output() activeYearSemClick = new EventEmitter<void>();
  @Output() addAcademicYear = new EventEmitter<void>();
  @Output() termChange = new EventEmitter<number | null>();
  @Output() selectedTermIdChange = new EventEmitter<number | null>();

  form: FormGroup;
  isTermsLoading = true;
  availableTerms: any[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder, 
    private dialog: MatDialog, 
    private reportsService: ReportsService
  ) {
    this.form = this.fb.group({});
  }

  ngOnInit() {
    this.initializeForm();
    this.loadTerms();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['inputFields'] || changes['selectedValues']) {
      this.initializeForm();
    }
  }

  private initializeForm() {
    this.form = this.fb.group({});
    this.inputFields.forEach((field) => {
      const initialValue =
        this.selectedValues[field.key] !== undefined
          ? this.selectedValues[field.key]
          : '';
      this.form.addControl(field.key, this.fb.control(initialValue));
    });

    this.form.valueChanges.subscribe((value) => {
      this.inputChange.emit(value);

      if (value['academicYear'] === '__add__') {
        this.addAcademicYear.emit();
      }
    });
  }

  onAdd(): void {
    this.add.emit();
  }

  onExport(): void {
    if (this.showExportDialog) {
      const dialogRef = this.dialog.open(TableDialogComponent, {
        data: {
          isExportDialog: true,
          customExportOptions: this.customExportOptions,
        },
        disableClose: true,
        autoFocus: true,
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.export.emit(result);
        }
      });
    } else {
      this.export.emit(undefined);
    }
  }

  onExportByProgram(): void {
    this.exportByProgram.emit();
  }

  onActiveYearSemClick(): void {
    this.activeYearSemClick.emit();
  }

  onAddAcademicYearClick(): void {
    this.addAcademicYear.emit();
  }

  onClearSearch(key: string): void {
    this.form.get(key)?.setValue('');
    this.inputChange.emit(this.form.value);
  }

  loadTerms(): void {
    this.isTermsLoading = true;
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        this.availableTerms = data;
        const currentTermId = this.reportsService.getSelectedTerm();
        const hasCurrentTerm = currentTermId !== null && data.some(
          (term) => term.active_semester_id === currentTermId,
        );

        if (hasCurrentTerm) {
          this.selectedTermId = currentTermId;
        } else {
          const activeTerm = data.find((term) => term.is_active === 1);
          if (activeTerm) {
            this.selectedTermId = activeTerm.active_semester_id;
            this.onTermChange();
          }
        }

        this.isTermsLoading = false;
      },
      error: (error) => {
        this.isTermsLoading = false;
        console.error('Error loading terms:', error);
      },
    });
  }

  onTermChange(): void {
    this.selectedTermIdChange.emit(this.selectedTermId);
    this.reportsService.setSelectedTerm(this.selectedTermId);
    this.termChange.emit(this.selectedTermId);
  }

  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1:
        return '1st Semester';
      case 2:
        return '2nd Semester';
      case 3:
        return 'Summer';
      default:
        return `Sem ${semesterNumber}`;
    }
  }

  trackByOptionKey(index: number, option: any): string {
    return `${option.key}-${index}`;
  }

  trackByField(index: number, field: any): string {
    return field.key;
  }

  trackByOption(index: number, option: string): string {
    return option; 
  }

  trackByKey(index: number, item: any): any {
    if (item && typeof item === 'object' && 'key' in item) {
      return item.key;
    }
    return item;
  }
}