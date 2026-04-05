import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Faculty } from '../../core/services/superadmin/management/faculty/faculty.service'; 
import { pageFloatUpAnimation } from '../../core/animations/animations';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss'],
  animations: [pageFloatUpAnimation]
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
      
      // System IDs
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
      const payload: Faculty = this.profileForm.getRawValue(); 
      
      console.log('Update Payload:', payload);
    }
  }
}