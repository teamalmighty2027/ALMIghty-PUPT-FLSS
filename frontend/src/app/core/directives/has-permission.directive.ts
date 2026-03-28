import {
  Directive,
  Input,
  ViewContainerRef,
  TemplateRef,
  OnInit,
  OnChanges,
  SimpleChanges,
  EmbeddedViewRef,
  Renderer2,
} from '@angular/core';
import { PermissionService } from '../services/permission/permission.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit, OnChanges {
  private permissions: string[] = [];
  private logicalOp: 'any' | 'all' = 'any';
  private action: 'hide' | 'disable' = 'hide';
  private viewRef: EmbeddedViewRef<any> | null = null;

  @Input()
  set appHasPermission(permission: string | string[]) {
    this.permissions = Array.isArray(permission)
      ? permission.map((p) => p.trim()).filter((p) => p.length > 0)
      : [permission].map((p) => p.trim()).filter((p) => p.length > 0);
    this.updateView();
  }

  @Input()
  set appHasPermissionLogicalOp(op: 'any' | 'all') {
    this.logicalOp = op;
    this.updateView();
  }

  @Input()
  set appHasPermissionAction(action: 'hide' | 'disable') {
    this.action = action;
    this.updateView();
  }

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService,
    private renderer: Renderer2,
  ) {}

  ngOnInit(): void {
    this.updateView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appHasPermission'] || changes['appHasPermissionLogicalOp'] || changes['appHasPermissionAction']) {
      this.updateView();
    }
  }

  private updateView(): void {
    const permissions = this.permissions;
    let hasPermission = false;

    if (this.logicalOp === 'all') {
      hasPermission = permissions.every((p) => this.permissionService.hasPermission(p));
    } else {
      hasPermission = permissions.some((p) => this.permissionService.hasPermission(p));
    }

    if (hasPermission) {
      if (!this.viewRef) {
        this.viewRef = this.viewContainer.createEmbeddedView(this.templateRef);
      }
      if (this.action === 'disable') {
        this.applyDisabledState(false);
      }
    } else {
      if (this.action === 'disable') {
        if (!this.viewRef) {
          this.viewRef = this.viewContainer.createEmbeddedView(this.templateRef);
        }
        this.applyDisabledState(true);
      } else {
        this.viewContainer.clear();
        this.viewRef = null;
      }
    }
  }

  private applyDisabledState(isDisabled: boolean): void {
    if (!this.viewRef) {
      return;
    }

    this.viewRef.rootNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      this.renderer.setProperty(node, 'disabled', isDisabled);
      this.renderer.setAttribute(node, 'aria-disabled', String(isDisabled));

      if (isDisabled) {
        this.renderer.setAttribute(node, 'tabindex', '-1');
      } else {
        this.renderer.removeAttribute(node, 'tabindex');
      }
    });
  }
}
