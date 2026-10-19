import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../../../../environments/environment.dev';

export interface AdminProfileData {
  first_name: string;
  last_name: string;
  middle_name?: string;
  suffix_name?: string;
  email?: string;
  code?: string;
  department?: string;
  profile_picture?: string;
  profile_picture_url?: string;
  birthdate?: string;
  sex?: 'Male' | 'Female' | 'Prefer not to say';
  house_num?: string;
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  country?: string;
  zipcode?: number;
  academic_rank?: string
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<AdminProfileData> {
    return this.http.get<AdminProfileData>(`${this.baseUrl}/admin/profile`);
  }

  updateProfile(payload: FormData): Observable<any> {
    // IMPORTANT: Laravel cannot read multipart/form-data via PUT request natively.
    // We send a POST request but tell Laravel to treat it as a PUT request.
    payload.append('_method', 'PUT');
    return this.http.post<any>(`${this.baseUrl}/admin/profile`, payload);
  }
}