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
use App\Http\Controllers\SystemNoticeController;
use App\Http\Controllers\AdminConfigurationController;

/*
|----------------------------
| Authentication Routes
|----------------------------
 */
Route::middleware('custom.ratelimit:login')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->name('login');
});

Route::post('/faculty/request-reactivation', [
    FacultyController::class,
    'requestReactivation'
]);

Route::middleware([
    'auth:sanctum',
    'token.expiration',
    'throttle:api',
])->group(function () {
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
Route::middleware([
    'auth:sanctum',
    'token.expiration',
    'super_admin',
    'throttle:api',
])->group(function () {
    Route::get('/accounts', [AccountController::class, 'index']);
    Route::post('/accounts', [AccountController::class, 'store']);
    Route::get('/accounts/{user}', [AccountController::class, 'show']);
    Route::put('/accounts/{user}', [AccountController::class, 'update']);
    Route::delete('/accounts/{user}', [AccountController::class, 'destroy']);

    Route::get('/admins', [AccountController::class, 'indexAdmins']);
    Route::post('/admins', [AccountController::class, 'storeAdmin']);
    Route::put('/admins/{admin}', [AccountController::class, 'updateAdmin']);
    Route::delete('/admins/{admin}', [AccountController::class, 'destroyAdmin']);

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

    /*
    |----------------------------------
    | System Notices Management Routes
    |----------------------------------
     */
    Route::prefix('system-notices')->group(function () {
        Route::get('/', [SystemNoticeController::class, 'index']);
        Route::post('/', [SystemNoticeController::class, 'store']);
        Route::get(
            '/unresolved-count',
            [SystemNoticeController::class, 'unresolvedCount']
        );
        Route::get('/{id}', [SystemNoticeController::class, 'show']);
        Route::patch(
            '/{id}/resolve',
            [SystemNoticeController::class, 'resolve']
        );
    });

    Route::post('/faculty/{user}/approve-reactivation', [
        FacultyController::class,
        'approveReactivation'
    ]);
});

/*
|--------------------------
| General Protected Routes
|--------------------------
 */
Route::middleware([
    'auth:sanctum',
    'token.expiration',
    'throttle:api',
])->group(function () {
    /**
     * Report a system notice from the frontend
     */
    Route::post(
      '/system-notices/report', [
        SystemNoticeController::class, 'storeFromFrontend'
    ]);

    /**
     * Academic Year
     */
    Route::get('/academic-years', [
        AcademicYearController::class, 'getAcademicYears'
    ]);
    Route::post('/academic-years', [
        AcademicYearController::class, 'addAcademicYear'
    ]);
    Route::delete('/academic-years/{id}', [
        AcademicYearController::class, 'deleteAcademicYear'
    ]);
    Route::put('/academic-years/{id}', [
        AcademicYearController::class, 'updateAcademicYear'
    ]);
    Route::get('/academic-years/active-semester', [
        AcademicYearController::class, 'getActiveAcademicYearAndSemester'
    ]);
    Route::put('/academic-years/active-semester', [
        AcademicYearController::class, 'setActiveAcademicYearAndSemester'
    ]);
    Route::put('/academic-years/faculty-view-semester', [
        AcademicYearController::class, 'setFacultyViewSemester'
    ]);
    Route::get('/academic-years/{id}/program-details', [
        AcademicYearController::class, 'getProgramDetailsByAcademicYear'
    ]);
    Route::get('/academic-years/active/year-levels-curricula', [
        AcademicYearController::class, 'getActiveYearLevelsCurricula'
    ]);
    Route::put('/academic-years/{id}/year-level-curricula', [
        AcademicYearController::class, 'updateYearLevelCurricula'
    ]);
    Route::put('/academic-years/{id}/sections', [
        AcademicYearController::class, 'updateSections'
    ]);
    Route::delete('/academic-years/{ayId}/programs/{progId}', [
        AcademicYearController::class, 'removeProgramFromAcademicYear'
    ]);
    Route::get('/academic-years/active/offered-courses', [
        AcademicYearController::class, 'getOfferedCoursesBySem'
    ]);
    Route::get('/programs/{id}/courses', [
        AcademicYearController::class, 'getProgramCourses'
    ]);


    Route::get('/admin/notifications', [\App\Http\Controllers\AdminNotificationController::class, 'index']);
    Route::post('/admin/notifications/{id}/read', [\App\Http\Controllers\AdminNotificationController::class, 'markAsRead']);
    Route::post('/admin/notifications/read-all', [\App\Http\Controllers\AdminNotificationController::class, 'markAllAsRead']);
    Route::delete('/admin/notifications/clear-all', [\App\Http\Controllers\AdminNotificationController::class, 'clearAll']);

    Route::prefix('admin/config')->group(function () {
        
        // Academic Ranks Endpoints
        Route::get('/academic-ranks', [AdminConfigurationController::class, 'getAcademicRanks']);
        Route::post('/academic-ranks', [AdminConfigurationController::class, 'addAcademicRank']);
        Route::put('/academic-ranks/{id}', [AdminConfigurationController::class, 'updateAcademicRank']);
        Route::delete('/academic-ranks/{id}', [AdminConfigurationController::class, 'deleteAcademicRank']);

        // Departments Endpoints
        Route::get('/departments', [AdminConfigurationController::class, 'getDepartments']);
        Route::post('/departments', [AdminConfigurationController::class, 'addDepartment']);
        Route::put('/departments/{id}', [AdminConfigurationController::class, 'updateDepartment']);
        Route::delete('/departments/{id}', [AdminConfigurationController::class, 'deleteDepartment']);
        
    });

    /**
     * Buildings
     */
    Route::apiResource('buildings', BuildingController::class);

    /**
     * Course
     */
    Route::get('/courses', [CourseController::class, 'index']);
    Route::post('/courses', [CourseController::class, 'addCourse']);
    Route::put('/courses/{id}', [CourseController::class, 'updateCourse']);
    Route::delete('/courses/{id}', [CourseController::class, 'deleteCourse']);

    /**
     * Bridging Courses
     */
    Route::get('/bridging-courses', [
        BridgingCourseController::class, 'index'
    ]);

    /**
     * Curriculum & Curriculum Details
     */
    Route::get('/curricula', [CurriculumController::class, 'index']);
    Route::get('/curricula/{id}', [CurriculumController::class, 'show']);
    Route::post('/curricula', [
        CurriculumController::class, 'addCurriculum'
    ]);
    Route::delete('/curricula/{id}', [
        CurriculumController::class, 'deleteCurriculum'
    ]);
    Route::post('/curricula/{id}/copy', [
        CurriculumController::class, 'copyCurriculum'
    ]);
    Route::put('/curricula/{id}', [CurriculumController::class, 'update']);

    Route::delete(
        '/curricula/{curriculumYear}/programs/{programId}',
        [CurriculumController::class, 'removeProgramFromCurriculum']
    );
    Route::get('/curricula/{curriculumYear}/programs', [
        CurriculumController::class, 'getProgramsByCurriculumYear'
    ]);
    Route::post('/curricula/{curriculumYear}/programs', [
        CurriculumController::class, 'addProgramToCurriculum'
    ]);

    Route::get('/curricula/{curriculumYear}/details', [
        CurriculumDetailsController::class, 'getCurriculumDetails'
    ]);

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
    Route::post('/emails/preference-submitted', [
        EmailController::class, 'emailPrefSubmitted'
    ]);
    Route::post('/emails/faculty-schedules', [
        EmailController::class, 'emailAllFacultySchedule'
    ]);
    Route::post('/emails/faculty-schedule', [
        EmailController::class, 'emailSingleFacultySchedule'
    ]);

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

    // Faculty Time Plots
    Route::get('/faculty/{faculty_id}/time-plots',[FacultyTimePlotController::class, 'index']);
    Route::post('/faculty/time-plots',[FacultyTimePlotController::class, 'store']);
    Route::delete('/faculty/time-plots/{id}',[FacultyTimePlotController::class, 'destroy']);

    Route::put('/faculty/{user}', [FacultyController::class, 'update']);
    Route::delete('/faculty/{user}', [FacultyController::class, 'destroy']);


    /**
     * Faculty Notification
     */
    Route::get('/faculty/notifications', [
        FacultyNotificationController::class, 'getFacultyNotifications'
    ]);
    Route::get('/notifications/requests', [
        FacultyNotificationController::class, 'getRequestNotifications'
    ]);
    Route::post('/notifications/deadline-single', [
        EmailController::class, 'notifyFacultyBeforeDeadlineSingle'
    ]);
    Route::post('/notifications/deadline-test', [
        EmailController::class, 'singleDeadlineNotification'
    ]);
    Route::post('/notifications/deadline-global', [
        EmailController::class, 'notifyGlobalFacultyDeadline'
    ]);

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
    Route::post('/preferences', [
        PreferenceController::class, 'submitPreferences'
    ]);
    Route::get('/preferences/unique', [
        PreferenceController::class, 'getUniqueFacultyPreferences'
    ]);
    Route::get('/preferences', [
        PreferenceController::class, 'getAllFacultyPreferences'
    ]);
    Route::get('/faculty/{faculty_id}/preferences', [
        PreferenceController::class, 'getFacultyPreferencesById'
    ]);
    Route::get('/faculty/{faculty_id}/preferences/history', [
        PreferenceController::class, 'getPreferencesHistoryByFacultyId'
    ]);
    Route::delete('/preferences/{preference_id}', [
        PreferenceController::class, 'deletePreferences'
    ]);
    Route::delete('/preferences', [
        PreferenceController::class, 'deleteAllPreferences'
    ]);
    Route::patch('/preferences/toggle', [
        PreferenceController::class, 'toggleAllPreferences'
    ]);
    Route::patch('/preferences/{faculty_id}/toggle', [
        PreferenceController::class, 'toggleSinglePreferences'
    ]);
    Route::post('/preferences/access-requests', [
        PreferenceController::class, 'requestAccess'
    ]);
    Route::delete('/preferences/access-requests', [
        PreferenceController::class, 'cancelRequestAccess'
    ]);
    Route::patch('/preferences/{preference_id}/toggle-ignore', [
        PreferenceController::class, 'toggleIgnorePreference'
    ]);

    /**
     * Rescheduling Appeals
     */
    // ── FACULTY (Submit & Manage) ──
    Route::post('/rescheduling-appeals',                [RescheduleController::class, 'submitReschedulingAppeal']);
    Route::get('/my-appeals',                           [RescheduleController::class, 'getMyAppeals']);
    Route::delete('/my-appeals/{id}',                   [RescheduleController::class, 'cancelAppeal']);

    Route::post('/rescheduling-appeals/toggle-access', [RescheduleController::class, 'toggleFacultyAppealAccess']);
    Route::post('/rescheduling-appeals/request-access', [RescheduleController::class, 'requestAppealAccess']);
    Route::post('/rescheduling-appeals/cancel-request', [RescheduleController::class, 'cancelAppealAccessRequest']);
    Route::post('/rescheduling-appeals/toggle-all-access', [RescheduleController::class, 'toggleAllFacultyAppealAccess']);
    Route::post('/rescheduling-appeals/reject-access', [RescheduleController::class, 'rejectAppealAccessRequest']);
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
    Route::get('/programs/active', [
        ProgramController::class, 'getActivePrograms'
    ]);
    Route::get('/programs', [ProgramController::class, 'getPrograms']);
    Route::post('/programs', [ProgramController::class, 'addProgram']);
    Route::get('/programs/{id}', [
        ProgramController::class, 'getProgramDetails'
    ]);
    Route::put('/programs/{id}', [ProgramController::class, 'updateProgram']);
    Route::delete('/programs/{id}', [
        ProgramController::class, 'deleteProgram'
    ]);

    /**
     * Reports
     */
    Route::get('/reports/terms', [
        ReportsController::class, 'getAllTermsForDropdown'
    ]);
    Route::get('/reports/faculty-schedules', [
        ReportsController::class, 'getFacultySchedulesReport'
    ]);
    Route::get('/reports/room-schedules', [
        ReportsController::class, 'getRoomSchedulesReport'
    ]);
    Route::get('/reports/program-schedules', [
        ReportsController::class, 'getProgramSchedulesReport'
    ]);
    Route::get('/reports/faculty/{faculty_id}/schedule', [
        ReportsController::class, 'getSingleFacultySchedule'
    ]);
    Route::get('/reports/faculty/{faculty_id}/schedule-history', [
        ReportsController::class, 'getFacultyScheduleHistory'
    ]);
    Route::get('/reports/faculty/{faculty_id}/academic-years', [
        ReportsController::class, 'getFacultyAcademicYearsHistory'
    ]);
    Route::get('/reports/overview', [
        ReportsController::class, 'getOverviewDetails'
    ]);

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
    Route::post('/rooms', [RoomController::class, 'addRoom']);
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
    Route::get('/schedules/populate', [
        ScheduleController::class, 'populateSchedules'
    ]);
    Route::post('/schedules', [ScheduleController::class, 'assignSchedule']);
    Route::post('/schedules/duplicate-course', [
        ScheduleController::class, 'duplicateCourse'
    ]);
    Route::delete('/schedules/duplicate-course/{id}', [
        ScheduleController::class, 'removeDuplicateCourse'
    ]);
    Route::get('/faculty/active', [
        FacultyController::class, 'getFacultyDetails'
    ]);
    Route::get('/rooms/available', [RoomController::class, 'getAllRooms']);
    Route::patch('/schedules/publish', [
        ScheduleController::class, 'toggleAllSchedules'
    ]);
    Route::patch('/schedules/{id}/publish', [
        ScheduleController::class, 'toggleSingleSchedule'
    ]);
    Route::patch('/schedules/{schedule}/assignment-type', [
        ScheduleController::class, 'updateAssignmentType'
    ]);
    
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
    Route::post('/semesters', [SemesterController::class, 'store']);
    Route::get('/semesters/{id}', [SemesterController::class, 'show']);
    Route::put('/semesters/{id}', [SemesterController::class, 'update']);
    Route::delete('/semesters/{id}', [SemesterController::class, 'destroy']);

    /**
     * AI Assisted Scheduling
     */
    Route::post('/schedules/suggestions', [
        ScheduleController::class, 'getHeuristicSchedulingSuggestion'
    ]);
    Route::get('/schedules/historical', [
        ScheduleController::class, 'getHistoricalSchedules'
    ]);

    /**
     * Year Level
     */
    Route::get('/year-levels', [YearLevelController::class, 'index']);
    Route::post('/year-levels', [YearLevelController::class, 'store']);
    Route::get('/year-levels/{id}', [YearLevelController::class, 'show']);
    Route::put('/year-levels/{id}', [YearLevelController::class, 'update']);
    Route::delete('/year-levels/{id}', [YearLevelController::class, 'destroy']);
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
    Route::middleware(['check.hmac:orr,frrs,puptweb,ojtims'])->group(function () {
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
