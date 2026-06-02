import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../../../../environments/environment.dev';

export interface User {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix_name: string;
  code: string;
  role: string;
  email: string;
  faculty?: {
    faculty_type: string;
    faculty_units: number;
  };
  status?: string;
}

export interface Faculty {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix_name: string;
  name: string;
  code: string;
  email: string;
  status: string;
  role: string;
  password?: string;
  faculty?: {
    id: number;
    user_id: number;
    faculty_type_id: number;
    fesr_user_id: number | null;
    created_at: string;
    updated_at: string;
    faculty_type: {
      faculty_type_id: number;
      faculty_type: string;
      regular_units: number;
      additional_units: number;
      created_at: string;
      updated_at: string;
    };
  };
}

// Interface specifically for the Profile Page data
export interface FacultyProfileData {
  first_name: string;
  last_name: string;
  middle_name?: string;
  suffix_name?: string;
  email?: string;
  code?: string;
  user_profile_id?: number;
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
}

@Injectable({
  providedIn: 'root',
})
export class FacultyService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getFaculty(): Observable<Faculty[]> {
    return this.http.get<any[]>(`${this.baseUrl}/faculty`).pipe(
      map((users) => {
        if (!Array.isArray(users)) {
          throw new Error('Unexpected response format');
        }

        return users.map((user) => ({
          id: user.id.toString(),
          last_name: user.last_name,
          first_name: user.first_name,
          middle_name: user.middle_name,
          suffix_name: user.suffix_name,
          name: `${user.last_name}, ${user.first_name}${
            user.middle_name ? ' ' + user.middle_name : ''
          }${user.suffix_name ? ' ' + user.suffix_name : ''}`,
          code: user.code,
          email: user.email || '',
          status: user.status || 'Active',
          role: user.role,
          faculty: user.faculty,
        }));
      }),
      catchError((error) => {
        console.error('Error fetching faculty:', error);
        return of([]);
      })
    );
  }

  getSuggestedCode(): Observable<string> {
    return this.http
      .get<{ suggested_code: string }>(`${this.baseUrl}/faculty/suggest-code`)
      .pipe(map((res) => res.suggested_code));
  }

  addFaculty(faculty: Faculty): Observable<Faculty> {
    return this.http.post<Faculty>(`${this.baseUrl}/faculty`, faculty);
  }

  updateFaculty(
    id: string,
    faculty: Omit<Faculty, 'code'>
  ): Observable<Faculty> {
    return this.http.put<Faculty>(`${this.baseUrl}/faculty/${id}`, faculty);
  }

  // ==========================================
  // PERSONAL PROFILE METHODS
  // ==========================================

  /**
   * Fetches the currently authenticated faculty's own profile.
   * Relies on the API recognizing the user via their Auth token (e.g., Sanctum).
   */
  getProfile(): Observable<FacultyProfileData> {
    return this.http.get<FacultyProfileData>(`${this.baseUrl}/faculty/profile`);
  }

  /**
   * Updates the currently authenticated faculty's own profile.
   * Changed payload to FormData to support file uploads.
   */
  updateProfile(payload: FormData): Observable<any> {
    // IMPORTANT: Laravel cannot read multipart/form-data via PUT request natively.
    // We send a POST request but tell Laravel to treat it as a PUT request.
    payload.append('_method', 'PUT');
    return this.http.post<any>(`${this.baseUrl}/faculty/profile`, payload);
  }
}