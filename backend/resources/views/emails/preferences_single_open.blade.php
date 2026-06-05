<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Faculty Preferences Submission</title>
    <style type="text/css">
        body {
            margin: 0;
            padding: 20px;
            background-color: #fff5f5;
            font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            line-height: 1.6;
        }

        .container {
            max-width: 650px;
            margin: 20px auto;
            background-color: rgb(248, 241, 241);
            padding: 0;
            border-radius: 16px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            overflow: hidden;
        }

        .content {
            padding: 35px 40px;
            color: #2c3e50;
            font-size: 16px;
        }

        .greeting {
            font-size: 18px;
            margin-bottom: 25px;
            color: #1a1a1a;
            font-weight: 500;
        }

        p {
            text-align: justify;
        }

        .deadline-box {
            background-color: rgb(242, 224, 224);
            border-left: 6px solid #800000;
            padding: 15px 20px;
            margin: 25px 0;
            border-radius: 6px;
        }

        .deadline-text {
            color: #800000;
            font-weight: 500;
            margin: 0;
        }

        .button-container {
            text-align: center;
            margin: 25px 0 35px 0;
            display: flex;
            justify-content: center;
            gap: 15px;
            flex-wrap: wrap;
        }

        .button {
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 24px;
            border-radius: 9999px;
            font-size: 15px;
            font-weight: 500;
            display: inline-block;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .btn-yes {
            background-color: #28a745;
        }

        .btn-yes:hover {
            background-color: #218838;
        }

        .btn-no {
            background-color: #800000;
        }

        .btn-no:hover {
            background-color: #660000;
        }

        .important-note {
            font-size: 14px;
            color: #666666;
            font-style: italic;
            margin: 0;
        }

        .action-note {
            background-color: #ebf8ff;
            border-left: 4px solid #3182ce;
            padding: 12px 15px;
            margin-bottom: 20px;
            border-radius: 4px;
            font-size: 14.5px;
            color: #2a4365;
        }

        /* COLLAPSIBLE TABLE STYLES */
        .pref-details {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            margin: 20px 0;
        }

        .pref-summary {
            background-color: #f7fafc;
            color: #2d3748;
            padding: 12px 15px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 8px;
            border-bottom: 1px solid #e2e8f0;
        }

        .preferences-box {
            padding: 15px;
        }

        .pref-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
            table-layout: fixed;
        }

        .pref-table th {
            background-color: #fcebeb;
            color: #800000;
            padding: 12px 8px;
            text-align: left;
            border-bottom: 2px solid #e2e8f0;
            font-weight: 600;
            word-wrap: break-word;
        }

        .pref-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #edf2f7;
            color: #4a5568;
            vertical-align: top;
            word-wrap: break-word;
        }

        .col-course { width: 35%; }
        .col-program { width: 15%; }
        .col-section { width: 20%; }
        .col-schedule { width: 30%; }

        .pref-table tr:last-child td {
            border-bottom: none;
        }

        .schedule-pill {
            display: inline-block;
            background-color: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 3px 6px;
            margin-bottom: 4px;
            font-size: 12px;
            white-space: normal;
            word-break: break-word;
        }

        .program-badge {
            display: inline-block;
            background-color: #edf2f7;
            color: #4a5568;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 4px;
            word-break: break-word;
        }
        
        .section-badge {
            display: inline-block;
            background-color: #e2e8f0;
            color: #2d3748;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 12px;
            font-weight: 600;
            word-break: break-word;
        }

        /* TUTORIAL VIDEO STYLES */
        .tutorial-title {
            font-weight: 600;
            color: #1a1a1a;
            font-size: 16px;
            margin-bottom: 5px;
        }

        .video-list {
            margin-top: 0;
            padding-left: 20px;
        }

        .video-list li {
            margin-bottom: 8px;
        }

        .video-list a {
            color: #800000;
            font-weight: 500;
            text-decoration: none;
        }

        .video-list a:hover {
            text-decoration: underline;
        }

        .footer {
            text-align: center;
            font-size: 14px;
            color: #666666;
            padding: 15px 40px;
            background-color: rgb(239, 228, 228);
        }

        .copyright {
            text-align: center;
            font-size: 13px;
            color: rgb(132, 94, 94);
            font-weight: 400;
        }
    </style>
</head>

<body>
    <div class="container">
        <div class="content">
            <p class="greeting"><b>Dear Professor {{ $faculty_name }},</b></p>

            <p>I hope this email finds you well. I would like to inform you that the <b>submission is now open</b> for
                your load and schedule preferences for the upcoming semester.</p>

            <div class="action-note">
                <b>Note:</b> If this is your first time logging in, please use the credentials below:<br>
                <b>Email:</b> {{ $email }}<br>
                <b>Default Password:</b> puptfaculty123*
            </div>

            <div class="deadline-box">
                <p class="deadline-text">Submission Deadline: {{ $deadline }}</p>
                @if ($days_left !== null)
                    <p class="deadline-text">Time Remaining: {{ $days_left }} {{ $days_left == 1 ? 'day' : 'days' }}
                    </p>
                @endif
            </div>

            @if(isset($previousPreferences) && count($previousPreferences) > 0)
                <p>These were your submitted preferences from the <b>{{ $previous_academic_year }} {{ $previous_semester_label }}</b>.</p>
                
                <details class="pref-details">
                    <div class="preferences-box">
                        <table class="pref-table">
                            <thead>
                                <tr>
                                    <th class="col-course">Course</th>
                                    <th class="col-program">Prog.</th>
                                    <th class="col-section">Yr & Sec</th>
                                    <th class="col-schedule">Day & Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($previousPreferences as $pref)
                                    @php
                                        // Extract Course Info
                                        $courseCode = $pref->courseAssignment->course->course_code ?? $pref->temporaryCourseOffering->course->course_code ?? 'N/A';
                                        $courseTitle = $pref->courseAssignment->course->course_title ?? $pref->temporaryCourseOffering->course->course_title ?? 'N/A';
                                        
                                        // Extract Program Info
                                        $programCode = 'N/A';
                                        if ($pref->courseAssignment && $pref->courseAssignment->curriculaProgram && $pref->courseAssignment->curriculaProgram->program) {
                                            $programCode = $pref->courseAssignment->curriculaProgram->program->program_code;
                                        } elseif ($pref->temporaryCourseOffering && $pref->temporaryCourseOffering->program) {
                                            $programCode = $pref->temporaryCourseOffering->program->program_code;
                                        }

                                        // Extract Year & Section
                                        $yearLevel = $pref->section->year_level ?? $pref->temporaryCourseOffering->year_level ?? 'N/A';
                                        $sectionName = $pref->section->section_name ?? 'N/A';
                                        $yearSection = ($yearLevel !== 'N/A' && $sectionName !== 'N/A') ? $yearLevel . '-' . $sectionName : 'N/A';
                                    @endphp
                                    <tr>
                                        <td class="col-course">
                                            <b>{{ $courseCode }}</b><br>
                                            <span style="font-size: 13px; color: #718096;">{{ $courseTitle }}</span>
                                        </td>
                                        <td class="col-program">
                                            <span class="program-badge">{{ $programCode }}</span>
                                        </td>
                                        <td class="col-section">
                                            <span class="section-badge">{{ $yearSection }}</span>
                                        </td>
                                        <td class="col-schedule">
                                            @if($pref->preferenceDays && $pref->preferenceDays->count() > 0)
                                                @foreach($pref->preferenceDays as $day)
                                                    @php
                                                        $startTime = $day->preferred_start_time ? \Carbon\Carbon::parse($day->preferred_start_time)->format('h:i A') : '';
                                                        $endTime = $day->preferred_end_time ? \Carbon\Carbon::parse($day->preferred_end_time)->format('h:i A') : '';
                                                        $timeString = ($startTime && $endTime) ? "($startTime - $endTime)" : "(Any Time)";
                                                    @endphp
                                                    <span class="schedule-pill">{{ $day->preferred_day }}<br>{{ $timeString }}</span><br>
                                                @endforeach
                                            @else
                                                <span style="color: #a0aec0; font-style: italic;">No specific schedule set</span>
                                            @endif
                                        </td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </details>
                
                <p style="margin-top: 30px;">Would you like to use these exact same preferences for this coming academic year?</p>
                <div class="action-note" style="background-color: #fffaf0; border-left-color: #dd6b20; color: #7b341e;">
                    <b>Note:</b> Clicking <b>YES</b> will copy the courses and schedules listed above directly into your current preferences. Clicking <b>NO</b> will allow you to input new preferences.
                </div>
            @else
                <p>Please take a moment to log in to the system and provide your preferences at your earliest convenience. Your input is highly valued and helps ensure a smooth scheduling process.</p>
            @endif

            <p class="important-note"><b>NOTE:</b> YOU MUST LOGIN FIRST BEFORE YOU CLICK YES OR NO.</p>
            <div class="button-container">
                @if(isset($previousPreferences) && count($previousPreferences) > 0)
                    <a href="{{ $app_url }}/faculty/preferences?action=auto_import" class="button btn-yes">YES (Import automatically)</a>
                    <a href="{{ $app_url }}/faculty/preferences" class="button btn-no">NO (Input new preferences)</a>
                @else
                    <a href="{{ $app_url }}/faculty/preferences" class="button btn-no">Submit Preferences Now</a>
                @endif
            </div>

            <div style="margin-top: 35px;">
                <div class="tutorial-title">How-to Videos:</div>
                <p style="margin-top: 0;">To better understand the system process, you can watch these videos:</p>
                <ul class="video-list">
                    <li>
                        <a href="https://youtu.be/IzAfVlUYY7s?si=-6z8Z3rJSbodNwfu" target="_blank">How to Login</a>
                    </li>
                    <li>
                        <a href="https://youtu.be/2TPF8RWpOlc?si=1Jvukyua718bpF7f" target="_blank">How to Set Preferences</a>
                    </li>
                    <li>
                        <a href="https://youtu.be/kiixp_kmtWA?si=xzaQosKHFV2qpjkC" target="_blank">How to Reschedule</a>
                    </li>
                </ul>
            </div>

            <p class="important-note" style="margin-top: 20px;">Note: If you experience any technical difficulties or have questions about the
                submission process, please don't hesitate to contact our support team at <a
                    href="mailto:pupt.flss2027@gmail.com">pupt.flss2027@gmail.com</a></p>
        </div>

        <div class="footer">
            <p class="copyright">
                © 2026 Polytechnic University of the Philippines - Taguig Branch<br>
                Faculty Loading and Scheduling System<br>
                All rights reserved.
            </p>
        </div>
    </div>
</body>

</html>