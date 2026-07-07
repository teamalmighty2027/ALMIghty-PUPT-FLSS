<?php

use App\Http\Controllers\AcademicYearController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BuildingController;
use App\Http\Controllers\BridgingCourseController;
use App\Http\Controllers\CourseController;
use App\Http\Controllers\CurriculumController;
use App\Http\Controllers\CurriculumDetailsController;
use App\Http\Controllers\DesigneeRoleController;
use App\Http\Controllers\ElectiveController;
use App\Http\Controllers\EmailController;
use App\Http\Controllers\External\v1\ExternalController;
use App\Http\Controllers\FacultyController;
use App\Http\Controllers\FacultyTimePlotController;
use App\Http\Controllers\FacultyProfileController;
use App\Http\Controllers\AdminProfileController;
use App\Http\Controllers\FacultyNotificationController;
use App\Http\Controllers\FacultyTypeController;
use App\Http\Controllers\LogoController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\PreferenceController;
use App\Http\Controllers\RescheduleController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\ProgramSyncController;
use App\Http\Controllers\ReportsController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\RoomTypeController;
use App\Http\Controllers\ScheduleController;
use App\Http\Controllers\SemesterController;
use App\Http\Controllers\TemporaryCourseOfferingController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\YearLevelController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuditLogController;
use Illuminate\Support\Facades\Storage;
use App\Http\Controllers\AssignmentTypeController;

/*
|----------------------------
| Authentication Routes
|----------------------------
 */
Route::middleware('custom.ratelimit:login')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->name('login');
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('logout', [AuthController::class, 'logout'])->name('logout');
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::post('/auth/refresh', [AuthController::class, 'refreshToken']);
});

/**
 * (Identity ) IDP Routes
 */
Route::prefix('auth')->group(function () {
    // Exchange OAuth code for a login token
    Route::post('/callback', [AuthController::class, 'handleIdpCallback']);

    // Log out proxy session on IDP
    Route::post('/session', [AuthController::class, 'logoutIdpProxy']);

    // Handle token verify redirect
    Route::get('/redirect', [AuthController::class, 'handleOnePortalRedirect']);

    // Get the login redirect URL containing client ID (securely server-side)
    Route::get('/idp-login', [AuthController::class, 'getIdpLoginUrl']);
});



// Password reset routes — throttled to prevent email flooding/enumeration
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/password/email', [
        PasswordResetController::class, 'sendResetLinkEmail'
    ]);
    Route::post('/password/reset', [
        PasswordResetController::class, 'reset'
    ]);
    Route::post('/password/verify-token', [
        PasswordResetController::class, 'verifyToken'
    ]);
});

// Fallback route for Philippine Addresses (Publicly accessible)
Route::get('/addresses/fallback/{file}', function ($file) {
    if (!Storage::disk('public')->exists('addresses/' . $file)) {
        return response()->json([], 404);
    }
    $content = Storage::disk('public')->get('addresses/' . $file);
    return response()->json(json_decode($content));
});

/*
|-----------------------------
| Super Admin Protected Routes
|-----------------------------
 */
Route::middleware(['auth:sanctum', 'super_admin', 'throttle:api'])
    ->group(function () {
    Route::get('/showAccounts', [AccountController::class, 'index']);
    Route::post('/addAccount', [AccountController::class, 'store']);
    Route::get('/accounts/{user}', [AccountController::class, 'show']);
    Route::put('/updateAccount/{user}', [AccountController::class, 'update']);
    Route::delete('/deleteAccount/{user}', [AccountController::class, 'destroy']);

    Route::get('/getAdmins', [AccountController::class, 'indexAdmins']);
    Route::post('/addAdmins', [AccountController::class, 'storeAdmin']);
    Route::put('/updateAdmins/{admin}', [AccountController::class, 'updateAdmin']);
    Route::delete('/deleteAdmins/{admin}', [AccountController::class, 'destroyAdmin']);

    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    Route::post('/programs/sync', [ProgramSyncController::class, 'syncProgramsManual']);

    /*
    |----------------------------------
    | Permission Management Routes
    |----------------------------------
     */
    Route::get('/permissions', [AccountController::class, 'getPermissions']);
    Route::get('/admins/{admin}/permissions', [AccountController::class, 'getAdminPermissions']);
    Route::post('/admins/{admin}/permissions', [AccountController::class, 'updateAdminPermissions']);
    Route::get('/programs', [ProgramController::class, 'index']);

    /*
    |----------------------------------
    | Bridging Courses Management Routes
    |----------------------------------
    */
    Route::post('/bridging-courses', [BridgingCourseController::class, 'store']);
    Route::put('/bridging-courses/{id}', [BridgingCourseController::class, 'update']);
    Route::delete('/bridging-courses/{id}', [BridgingCourseController::class, 'destroy']);
    Route::patch(
        '/bridging-courses/{id}/combine',
        [BridgingCourseController::class, 'combine']
    );
});

/*
|--------------------------
| General Protected Routes
|--------------------------
 */
Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {

    /**
     * Academic Year
     */
    Route::get('/get-academic-years', [AcademicYearController::class, 'getAcademicYears']);
    Route::post('/add-academic-year', [AcademicYearController::class, 'addAcademicYear']);
    Route::delete('/delete-academic-year', [AcademicYearController::class, 'deleteAcademicYear']);
    Route::put('/update-academic-year', [AcademicYearController::class, 'updateAcademicYear']);
    Route::get('/get-active-year-semester', [AcademicYearController::class, 'getActiveAcademicYearAndSemester']);
    Route::post('/set-active-year-semester', [AcademicYearController::class, 'setActiveAcademicYearAndSemester']);
    Route::post('/set-faculty-view-semester', [AcademicYearController::class, 'setFacultyViewSemester']);
    Route::post('/fetch-ay-prog-details', [AcademicYearController::class, 'getProgramDetailsByAcademicYear']);
    Route::get('/active-year-levels-curricula', [AcademicYearController::class, 'getActiveYearLevelsCurricula']);
    Route::post('/update-yr-lvl-curricula', [AcademicYearController::class, 'updateYearLevelCurricula']);
    Route::post('/update-sections', [AcademicYearController::class, 'updateSections']);
    Route::delete('/remove-program', [AcademicYearController::class, 'removeProgramFromAcademicYear']);
    Route::get('/offered-courses-sem', [AcademicYearController::class, 'getOfferedCoursesBySem']);
    Route::get('/program-courses', [AcademicYearController::class, 'getProgramCourses']);

    /**
     * Admin
     */
    Route::get('/admins', [AccountController::class, 'indexAdmins']);
    Route::post('/admins', [AccountController::class, 'storeAdmin']);
    Route::put('/admins/{admin}', [AccountController::class, 'updateAdmin']);
    Route::delete('/admins/{admin}', [AccountController::class, 'destroyAdmin']);
    
    Route::get('/admin/notifications', [\App\Http\Controllers\AdminNotificationController::class, 'index']);
    Route::post('/admin/notifications/{id}/read', [\App\Http\Controllers\AdminNotificationController::class, 'markAsRead']);
    Route::post('/admin/notifications/read-all', [\App\Http\Controllers\AdminNotificationController::class, 'markAllAsRead']);
    Route::delete('/admin/notifications/clear-all', [\App\Http\Controllers\AdminNotificationController::class, 'clearAll']);

    /**
     * Buildings
     */
    Route::apiResource('buildings', BuildingController::class);

    /**
     * Course
     */
    Route::get('/courses', [CourseController::class, 'index']);
    Route::post('/addCourse', [CourseController::class, 'addCourse']);
    Route::put('/courses/{id}', [CourseController::class, 'updateCourse']);
    Route::delete('/courses/{id}', [CourseController::class, 'deleteCourse']);

    /**
     * Bridging Courses
     */
    Route::get('/bridging-courses', [BridgingCourseController::class, 'index']);

    /**
     * Curriculum & Curriculum Details
     */
    Route::get('/curricula', [CurriculumController::class, 'index']);
    Route::get('/curricula/{id}', [CurriculumController::class, 'show']);
    Route::post('/addCurriculum', [CurriculumController::class, 'addCurriculum']);
    Route::post('/deleteCurriculum', [CurriculumController::class, 'deleteCurriculum']);
    Route::post('/copyCurriculum', [CurriculumController::class, 'copyCurriculum']);
    Route::put('/updateCurriculum/{id}', [CurriculumController::class, 'update']);

    Route::post('/removeProgramFromCurriculum', [CurriculumController::class, 'removeProgramFromCurriculum']);
    Route::get('/programs-by-curriculum-year/{curriculumYear}', [CurriculumController::class, 'getProgramsByCurriculumYear']);
    Route::post('/addProgramToCurriculum', [CurriculumController::class, 'addProgramToCurriculum']);

    Route::get('/curricula-details/{curriculumYear}/', [CurriculumDetailsController::class, 'getCurriculumDetails']);

    /**
     * Electives
     */
    Route::get('/electives', [ElectiveController::class, 'index']);
    Route::post('/electives', [ElectiveController::class, 'storeElective']);           
    Route::put('/electives/{id}', [ElectiveController::class, 'updateElective']);
    Route::delete('/electives/{id}', [ElectiveController::class, 'destroyElective']);  
    Route::get('/electives/{slotName}', [ElectiveController::class, 'showBySlot']);
    Route::post('/curriculum-electives', [ElectiveController::class, 'storeCurriculumElective']);
    Route::put('/curriculum-electives/{id}', [ElectiveController::class, 'updateCurriculumElective']);
    Route::get('/curriculum/{curriculumYear}/electives', [ElectiveController::class, 'getCurriculumElectives']);

    

    /**
     * Email
     */
    Route::post('/email-all-faculty-pref-submitted', [EmailController::class, 'emailPrefSubmitted']);
    Route::post('/email-all-faculty-schedule', [EmailController::class, 'emailAllFacultySchedule']);
    Route::post('/email-single-faculty-schedule', [EmailController::class, 'emailSingleFacultySchedule']);

    /**
     * Faculty
     */
    Route::get('/faculty', [FacultyController::class, 'index']);
    Route::get('/faculty/suggest-code', [FacultyController::class, 'suggestCode']);
    Route::post('/faculty', [FacultyController::class, 'store']);
    Route::get('/faculty/profile', [FacultyProfileController::class, 'show']);
    Route::put('/faculty/profile', [FacultyProfileController::class, 'update']);
    Route::get('/admin/profile', [AdminProfileController::class, 'show']);
    Route::put('/admin/profile', [AdminProfileController::class, 'update']);
    Route::put('/faculty/{user}', [FacultyController::class, 'update']);
    Route::delete('/faculty/{user}', [FacultyController::class, 'destroy']);

    /**
     * Faculty Notification
     */
    Route::get('/faculty-notifications', [FacultyNotificationController::class, 'getFacultyNotifications']);
    Route::get('/request-notifications', [FacultyNotificationController::class, 'getRequestNotifications']);
    Route::get('/notify-faculty-deadlines-single', [EmailController::class, 'notifyFacultyBeforeDeadlineSingle']);
    Route::post('/test-faculty-notification', [EmailController::class, 'singleDeadlineNotification']);
    Route::get('/notify-global-deadline', [EmailController::class, 'notifyGlobalFacultyDeadline']);

    /**
     * Faculty Type
     */
    Route::apiResource('faculty-types', FacultyTypeController::class);
    Route::apiResource('designee-roles', DesigneeRoleController::class);

    /**
     * Logos
     */
    Route::prefix('logos')->group(function () {
        Route::get('/', [LogoController::class, 'index']);
        Route::post('/upload', [LogoController::class, 'upload']);
        Route::get('/image/{type}', [LogoController::class, 'getImage'])->where('type', 'university|government');
        Route::get('/details/{type}', [LogoController::class, 'show'])->where('type', 'university|government');
        Route::delete('/{type}', [LogoController::class, 'delete'])->where('type', 'university|government');

    });

    /**
     * Preferences
     */
    Route::post('/submit-preferences', [PreferenceController::class, 'submitPreferences']);
    Route::get('/get-unique-preferences', [PreferenceController::class, 'getUniqueFacultyPreferences']);
    Route::get('/get-all-preferences', [PreferenceController::class, 'getAllFacultyPreferences']);
    Route::get('/get-preferences/{faculty_id}', [PreferenceController::class, 'getFacultyPreferencesById']);
    Route::get('/get-preferences-history/{faculty_id}', [PreferenceController::class, 'getPreferencesHistoryByFacultyId']);
    Route::delete('/delete-preferences/{preference_id}', [PreferenceController::class, 'deletePreferences']);
    Route::delete('/delete-all-preferences', [PreferenceController::class, 'deleteAllPreferences']);
    Route::post('/toggle-all-preferences', [PreferenceController::class, 'toggleAllPreferences']);
    Route::post('/toggle-single-preferences', [PreferenceController::class, 'toggleSinglePreferences']);
    Route::post('/request-access', [PreferenceController::class, 'requestAccess']);
    Route::post('/cancel-request-access', [PreferenceController::class, 'cancelRequestAccess']);
    Route::patch('/preferences/{preference_id}/toggle-ignore', [PreferenceController::class, 'toggleIgnorePreference']);

    /**
     * Rescheduling Appeals
     */
    // ── FACULTY (Submit & Manage) ──
    Route::post('/rescheduling-appeals',                [RescheduleController::class, 'submitReschedulingAppeal']);
    Route::get('/my-appeals',                           [RescheduleController::class, 'getMyAppeals']);
    Route::delete('/my-appeals/{id}',                   [RescheduleController::class, 'cancelAppeal']);

    // In routes/api.php
    Route::post('/rescheduling-appeals/toggle-access', [RescheduleController::class, 'toggleFacultyAppealAccess']);
    Route::post('/rescheduling-appeals/request-access', [RescheduleController::class, 'requestAppealAccess']);
    Route::post('/rescheduling-appeals/cancel-request', [RescheduleController::class, 'cancelAppealAccessRequest']);
    Route::post('/rescheduling-appeals/toggle-all-access', [RescheduleController::class, 'toggleAllFacultyAppealAccess']);

    Route::post('/rescheduling-appeals/reject-access', [RescheduleController::class, 'rejectAppealAccessRequest']);
    Route::post('/rescheduling-appeals/toggle-access', [RescheduleController::class, 'toggleFacultyAppealAccess']);
    Route::post('/rescheduling-appeals/toggle-all-access', [RescheduleController::class, 'toggleAllFacultyAppealAccess']);
    Route::post('/rescheduling-appeals/request-access', [RescheduleController::class, 'requestAppealAccess']);
    Route::post('/rescheduling-appeals/cancel-request', [RescheduleController::class, 'cancelAppealAccessRequest']);

    Route::get('/rescheduling-appeals/{id}/download', [App\Http\Controllers\RescheduleController::class, 'downloadAppealDocument']);

    // ── ADMIN (View & Evaluate) ──
    Route::middleware('permission:rescheduling')->group(function () {
        Route::get('/rescheduling-appeals',                 [RescheduleController::class, 'getAllAppeals']);
        Route::post('/rescheduling-appeals/{id}/approve',   [RescheduleController::class, 'approveAppeal']);
        Route::post('/rescheduling-appeals/{id}/deny',      [RescheduleController::class, 'denyAppeal']);
    });


    /**
     * Programs
     */
    Route::get('/programs/active', [ProgramController::class, 'getActivePrograms']);
    Route::get('/programs', [ProgramController::class, 'getPrograms']);
    Route::post('/addProgram', [ProgramController::class, 'addProgram']);
    Route::get('/programs/{id}', [ProgramController::class, 'getProgramDetails']);
    Route::put('/updateProgram/{id}', [ProgramController::class, 'updateProgram']);
    Route::delete('/deleteProgram/{id}', [ProgramController::class, 'deleteProgram']);

    /**
     * Reports
     */
    Route::get('/reports/terms', [ReportsController::class, 'getAllTermsForDropdown']);
    Route::get('/faculty-schedules-report', [ReportsController::class, 'getFacultySchedulesReport']);
    Route::get('/room-schedules-report', [ReportsController::class, 'getRoomSchedulesReport']);
    Route::get('/program-schedules-report', [ReportsController::class, 'getProgramSchedulesReport']);
    Route::get('/single-faculty-schedule/{faculty_id}', [ReportsController::class, 'getSingleFacultySchedule']);
    Route::get('/faculty-schedule-history/{faculty_id}', [ReportsController::class, 'getFacultyScheduleHistory']);
    Route::get('/faculty-academic-years-history/{faculty_id}', [ReportsController::class, 'getFacultyAcademicYearsHistory']);
    Route::get('/overview-details', [ReportsController::class, 'getOverviewDetails']);

    /**
     * Faculty Time Plots
     */
    Route::get(
        '/faculty/{faculty_id}/time-plots',
        [FacultyTimePlotController::class, 'index']
    );
    Route::post(
        '/faculty/time-plots',
        [FacultyTimePlotController::class, 'store']
    );
    Route::delete(
        '/faculty/time-plots/{id}',
        [FacultyTimePlotController::class, 'destroy']
    );


    /**
     * Analytics
     */
    Route::prefix('analytics')->middleware('permission:view_reports')->group(function () {
        Route::get('/heatmap', [AnalyticsController::class, 'getScheduleHeatmap']);
        Route::get('/room-utilization', [AnalyticsController::class, 'getRoomUtilization']);
        Route::get('/faculty-load', [AnalyticsController::class, 'getFacultyLoadDistribution']);
        Route::get('/faculty-type-composition', [AnalyticsController::class, 'getFacultyTypeComposition']);
        Route::get('/appeal-activity', [AnalyticsController::class, 'getAppealActivity']);
        Route::get('/program-coverage', [AnalyticsController::class, 'getProgramCoverage']);
        Route::get('/semester-trends', [AnalyticsController::class, 'getSemesterTrends']);
        Route::get('/optimal-slots', [AnalyticsController::class, 'getOptimalSlots']);
        Route::get('/underutilized-rooms', [AnalyticsController::class, 'getUnderutilizedRooms']);
        Route::get('/faculty-load-analysis', [AnalyticsController::class, 'getFacultyLoadAnalysis']);
        Route::get('/conflict-risk', [AnalyticsController::class, 'getConflictRisk']);
        Route::get('/program-laggards', [AnalyticsController::class, 'getProgramLaggards']);
    });

    /**
     * Rooms
     */
    Route::get('/rooms', [RoomController::class, 'getRooms']);
    Route::post('/addRoom', [RoomController::class, 'addRoom']);
    Route::put('/rooms/{room_id}', [RoomController::class, 'updateRoom']);
    Route::delete('/rooms/{room_id}', [RoomController::class, 'deleteRoom']);

    /**
     * Room Types
     */
    Route::get('/room-types', [RoomTypeController::class, 'index']);
    Route::get('/room-types/{id}', [RoomTypeController::class, 'show']);
    Route::post('/room-types', [RoomTypeController::class, 'store']);
    Route::put('/room-types/{id}', [RoomTypeController::class, 'update']);
    Route::delete('/room-types/{id}', [RoomTypeController::class, 'destroy']);

    /**
     * Scheduling
     */
    Route::get('/populate-schedules', [ScheduleController::class, 'populateSchedules']);
    Route::post('/assign-schedule', [ScheduleController::class, 'assignSchedule']);
    Route::post('/duplicate-course', [ScheduleController::class, 'duplicateCourse']);
    Route::delete('/remove-duplicate-course', [ScheduleController::class, 'removeDuplicateCourse']);
    Route::get('/get-active-faculty', [FacultyController::class, 'getFacultyDetails']);
    Route::get('/get-available-rooms', [RoomController::class, 'getAllRooms']);
    Route::post('/toggle-all-schedule', [ScheduleController::class, 'toggleAllSchedules']);
    Route::post('/toggle-single-schedule', [ScheduleController::class, 'toggleSingleSchedule']);
    Route::patch('/schedules/{schedule}/assignment-type', [ScheduleController::class, 'updateAssignmentType']);
    
    // Dynamic Load Types Configuration
    Route::get('/assignment-types', [AssignmentTypeController::class, 'index']);
    Route::post('/assignment-types', [AssignmentTypeController::class, 'store']);
    Route::put('/assignment-types/{id}', [AssignmentTypeController::class, 'update']);
    Route::delete('/assignment-types/{id}', [AssignmentTypeController::class, 'destroy']);

    /**
     * Temporary Course Offerings
     */
    Route::apiResource('temporary-course-offerings', TemporaryCourseOfferingController::class)
        ->only(['index', 'show', 'store', 'update']);
    Route::patch('/temporary-course-offerings/{id}/archive', [TemporaryCourseOfferingController::class, 'archive']);

    /**
     * Semester
     */
    Route::get('/semesters', [SemesterController::class, 'index']);
    Route::post('/addSemester', [SemesterController::class, 'store']);
    Route::get('/semesters/{id}', [SemesterController::class, 'show']);
    Route::put('/updateSemester/{id}', [SemesterController::class, 'update']);
    Route::delete('/deleteSemester/{id}', [SemesterController::class, 'destroy']);

    /**
     * AI Assisted Scheduling
     */
    Route::post('/suggestion-heuristic', [ScheduleController::class, 'getHeuristicSchedulingSuggestion']);
    Route::get('/schedules/historical', [ScheduleController::class, 'getHistoricalSchedules']);

    /**
     * Year Level
     */
    Route::get('/year_levels', [YearLevelController::class, 'index']);
    Route::post('/addYearLevel', [YearLevelController::class, 'store']);
    Route::get('/year_levels/{id}', [YearLevelController::class, 'show']);
    Route::put('/updateYearLevel/{id}', [YearLevelController::class, 'update']);
    Route::delete('/deleteYearLevel/{id}', [YearLevelController::class, 'destroy']);
});

/*
|----------------------------
| External/Integration Routes
|----------------------------
 */
Route::prefix('v1')->group(function () {

    /**
     * Health Check Route
     */
    Route::get('/health', [ExternalController::class, 'healthCheck']);

    /**
     * Faculty List Endpoint
     * General Faculty Data
     */
    Route::middleware(['check.hmac:orr,frrs,puptweb'])->group(function () {
        Route::get('/faculties', [ExternalController::class, 'facultyList']);
    });

    /**
     * Department List Endpoint
     * Accreditation System (Accred)
     */
    Route::middleware(['check.hmac:accred'])->group(function () {
        Route::get('/departments', [ExternalController::class, 'departmentList']);
    });

    /**
     * Faculty Schedules Endpoints
     * Faculty Attendance System (FAS)
     */
    Route::middleware(['check.hmac:fas'])->group(function () {
        // Legacy route (backward compatibility)
        Route::get('/faculty-schedules', [ExternalController::class, 'partTimeFacultySchedules']);

        // RESTful faculty schedule routes
        Route::prefix('faculty-schedules')->group(function () {
            Route::get('/part-time', [ExternalController::class, 'partTimeFacultySchedules']);
            Route::get('/temporary', [ExternalController::class, 'temporaryFacultySchedules']);
        });
    });

    /**
     * Rooms List Endpoint
     * Shared by fas & frrs
     */
    Route::middleware(['check.hmac:fas,frrs'])->group(function () {
        Route::get('/rooms', [ExternalController::class, 'roomsList']);
    });

    /**
     * Academic Year and Semester Endpoint
     * Dental Management System (DMS)
     */
    Route::middleware(['check.hmac:dms'])->group(function () {
        Route::get('/academic-year-semester', 
          [ExternalController::class, 'academicYearAndSemester']
        );
    });

    /**
     * Course Schedules and Files endpoints
     * Faculty Reportorial Requirements System (FRRS)
     */
    Route::middleware(['check.hmac:frrs'])->group(function () {
        Route::get('/course-schedules', [ExternalController::class, 'courseSchedules']);
        Route::get('/course-files', [ExternalController::class, 'courseFiles']);
    });

    /**
     * Faculty Profiles Endpoint
     * Dental Management System (DMS), Online Clinic Management System (OCMS)
     */
    Route::middleware(['check.hmac:dms,ocms'])->group(function () {
        Route::get('/faculty-profiles', [ExternalController::class, 'facultyProfiles']);
    });

    /**
     * Biometric Synchronization System (BioSync)
     * ! Deprecated Route
     */
    // Route::middleware(['check.hmac:biosync'])->group(function () {
    //     Route::get('/computer-laboratory-schedules', [ExternalController::class, 'labSchedules']);
    // });
});

// DEPRECATED: Webhook integration with FESR/HRIS is deprecated and has been removed.
