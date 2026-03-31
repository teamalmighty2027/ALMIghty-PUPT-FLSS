import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Faculty } from '../../core/services/superadmin/management/faculty/faculty.service'; // Path based on your faculty.component.ts

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit {
  profileForm!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      // Account Info - Required for FacultyController
      first_name: ['', Validators.required],
      middle_name: [''],
      last_name: ['', Validators.required],
      suffix_name: [''],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      
      // System IDs (Set to read-only as per your rough sketch)
      code: [{ value: '', disabled: true }],
      faculty_profile_id: [{ value: '', disabled: true }],
      program_id: [''],

      // Personal Details from FacultyProfile
      birthdate: [''],
      sex: [''],
      
      // Address Group - Matches FacultyController.php
      house_num: [''],
      street: [''],
      barangay: [''],
      city: [''],
      province: [''],
      country: [''],
      zipcode: ['']
    });
  }

  onSubmit() {
    if (this.profileForm.valid) {
      // Use getRawValue() to include disabled fields like 'email' if needed for the API
      console.log('Update Payload:', this.profileForm.getRawValue());
    }
  }
}