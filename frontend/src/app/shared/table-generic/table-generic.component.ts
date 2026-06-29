import { Component, Input, OnInit, AfterViewInit, ViewChild, Output, EventEmitter, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { DialogGenericComponent } from '../dialog-generic/dialog-generic.component';

@Component({
  selector: 'app-table-generic',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatSymbolDirective,
  ],
  templateUrl: './table-generic.component.html',
  styleUrls: ['./table-generic.component.scss'],
})
export class TableGenericComponent<T> implements OnInit, AfterViewInit {
  @Input() columns: {
    key: string;
    label: string;
    template?: TemplateRef<any>;
  }[] = [];

  @Input() set data(value: T[]) {
    this._data = value;
    this.dataSource.data = this._data;
  }
  get data(): T[] {
    return this._data;
  }
  @Input() displayedColumns: string[] = [];
  @Input() showViewButton: boolean = false;
  @Input() showDeleteButton: boolean = true;
  @Input() isHeaderSticky: boolean = true;
  @Input() disableEdit: boolean = false;
  @Input() customActions: any[] = [];
  @Input() showEditButton: boolean = true;

  @Input() showTableHeading: boolean = false;
  @Input() tableHeadingTitle: string = '';
  @Input() tableHeadingButtonText: string = '';
  @Input() tableHeadingButtonIcon: string = '';
  @Input() tableName: string = '';

  @Input() totalItems: number = 0;
  @Input() pageSize: number = 25;
  @Input() isServerSidePagination: boolean = false;
  @Input() pageIndex: number = 0;

  @Output() edit = new EventEmitter<T>();
  @Output() delete = new EventEmitter<T>();
  @Output() view = new EventEmitter<T>();
  @Output() tableHeadingButtonClick = new EventEmitter<void>();
  @Output() customAction = new EventEmitter<{ action: string; row: T }>();

  @Output() pageChange = new EventEmitter<any>();

  private _data: T[] = [];
  public dataSource = new MatTableDataSource<T>([]);
  public showFirstLastButtons = true;

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private dialog: MatDialog) {}

  ngOnInit() {
    this.dataSource.data = this.data;
    if (!this.displayedColumns.includes('action')) {
      this.displayedColumns.push('action');
    }
  }

  ngAfterViewInit() {
  setTimeout(() => {
    if (this.paginator) {
      // ONLY attach the paginator to the data source if we are doing client-side pagination.
      // If it's server-side, we leave them detached so our custom [length] binding isn't overwritten.
      if (!this.isServerSidePagination) {
        this.dataSource.paginator = this.paginator;
      }
    } else {
      console.error('Paginator is not defined');
    }
  });
}

  getIndex(index: number): number {
    if (this.paginator) {
      return this.paginator.pageIndex * this.paginator.pageSize + index + 1;
    }
    return index + 1;
  }

  isFirstColumn(columnKey: string): boolean {
    return this.columns.length > 0 && this.columns[0].key === columnKey;
  }

  onEdit(item: T) {
    this.edit.emit(item);
  }

  onView(item: T) {
    this.view.emit(item);
  }

  onTableHeadingButtonClick() {
    this.tableHeadingButtonClick.emit();
  }

  onCustomAction(action: string, item: T) {
    this.customAction.emit({ action, row: item });
  }

  onPageChange(event: any) {
    this.pageChange.emit(event);
  }

  onDelete(item: T) {
    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Confirm Delete',
        content: 'Are you sure you want to delete this? This action cannot be undone.',
        actionText: 'Delete',
        cancelText: 'Cancel',
        action: 'delete',
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'delete') {
        this.delete.emit(item);
      }
    });
  }
}