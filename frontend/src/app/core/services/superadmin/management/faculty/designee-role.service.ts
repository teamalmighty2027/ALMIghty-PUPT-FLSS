import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment.dev';
import { DesigneeRole } from './faculty-type.service';

@Injectable({
  providedIn: 'root',
})
export class DesigneeRoleService {
  private apiUrl = `${environment.apiUrl}/designee-roles`;

  constructor(private http: HttpClient) {}

  // Retrieves all designee roles from the backend API.
  getDesigneeRoles(): Observable<DesigneeRole[]> {
    return this.http.get<DesigneeRole[]>(this.apiUrl);
  }

  // Retrieves a single designee role by its ID.
  getDesigneeRole(id: number): Observable<DesigneeRole> {
    return this.http.get<DesigneeRole>(`${this.apiUrl}/${id}`);
  }

  // Sends a request to create a new designee role.
  createDesigneeRole(
    data: Partial<DesigneeRole>
  ): Observable<DesigneeRole> {
    return this.http.post<DesigneeRole>(this.apiUrl, data);
  }

  // Sends a request to update an existing designee role.
  updateDesigneeRole(
    id: number,
    data: Partial<DesigneeRole>
  ): Observable<DesigneeRole> {
    return this.http.put<DesigneeRole>(`${this.apiUrl}/${id}`, data);
  }

  // Sends a request to delete a designee role.
  deleteDesigneeRole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
