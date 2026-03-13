import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, SimpleChanges } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableDialogComponent } from '../table-dialog/table-dialog.component';
import { InputField } from '../table-header/table-header.component';

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
  ],
  templateUrl: './reports-header.component.html',
  styleUrl: './reports-header.component.scss'
})
export class ReportsHeaderComponent {
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

  @Output() add = new EventEmitter<void>();
  @Output() inputChange = new EventEmitter<{ [key: string]: any }>();
  @Output() export = new EventEmitter<'all' | 'current' | undefined>();
  @Output() search = new EventEmitter<string>();
  @Output() activeYearSemClick = new EventEmitter<void>();
  @Output() addAcademicYear = new EventEmitter<void>();

  form: FormGroup;

  constructor(private fb: FormBuilder, private dialog: MatDialog) {
    this.form = this.fb.group({});
  }

  ngOnInit() {
    this.initializeForm();
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

  trackByOptionKey(index: number, option: any): string {
    return `${option.key}-${index}`;
  }

  trackByField(index: number, field: any): string {
    return field.key; // Use a unique identifier (e.g., field.key)
  }

  trackByOption(index: number, option: string): string {
    return option; // If options are simple strings, use the string itself
  }

  trackByKey(index: number, item: any): any {
    // If the item is an object with a key, return the key
    if (item && typeof item === 'object' && 'key' in item) {
      return item.key;
    }

    // If the item is a primitive, return the item itself
    return item;
  }
}