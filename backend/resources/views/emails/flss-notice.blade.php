<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Implementation of the FLSS</title>
    <style type="text/css">
        body {
            margin: 0;
            padding: 20px;
            background-color: #fff5f5;
            font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            line-height: 1.6;
        }
        .container {
            max-width: 700px;
            margin: 20px auto;
            background-color: rgb(248, 241, 241);
            padding: 0;
            border-radius: 16px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            overflow: hidden;
        }
        .header {
            text-align: center;
            padding: 30px 20px;
            background-color: #800000;
            color: #ffffff;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 35px 40px;
            color: #2c3e50;
            font-size: 16px;
        }
        .memo-headers {
            margin-bottom: 30px;
            border-bottom: 2px solid #800000;
            padding-bottom: 15px;
        }
        .memo-headers p {
            margin: 5px 0;
            text-align: left;
        }
        .memo-body p {
            text-align: justify;
            text-indent: 30px;
            margin-bottom: 15px;
        }
        .memo-list {
            margin-left: 20px;
            margin-bottom: 20px;
        }
        .memo-list li {
            margin-bottom: 5px;
        }
        .sign-off {
            margin-top: 40px;
            text-align: left;
        }
        .footer {
            text-align: center;
            font-size: 14px;
            color: #666666;
            padding: 15px 40px;
            background-color: rgb(239, 228, 228);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>PUP Taguig - FLSS Project</h1>
        </div>

        <div class="content">
            <div class="memo-headers">
                <p><strong>To:</strong> {{ $first_name }} {{ $last_name }} </p>
                <p><strong>From:</strong> BSIT 3-1 Capstone Project Team (Team ALMighty)</p>
                <p><strong>Date:</strong> {{ $date_sent }} </p>
                <p><strong>Subject:</strong> Implementation of the Faculty Loading and Scheduling System (FLSS) and Account Creation</p>
            </div>

            <div class="memo-body">
                <p style="text-indent: 0; font-weight: bold;">Dear {{ $first_name }} {{ $last_name }},</p>
                <p style="text-indent: 0;">Greetings!</p>
                
                <p>We, the BSIT 3-1 students, are currently conducting our Capstone Project titled "Implementation of the Polytechnic University of the Philippines Taguig Faculty Loading and Scheduling System (FLSS)" under the guidance of our research adviser, Dr. Gecilie C. Almirañez.</p>
                
                <p>The main goal of this project is to implement the campus's scheduling system to improve schedule flexibility, conflict detection, analytics, and overall usability.</p>
                
                <p>As key users of this system, your participation is vital. By logging into the FLSS, you acknowledge and agree to these terms regarding the collection and processing of your professional information.</p>
                
                <p>To facilitate your access to the system, please be informed that your official PUP email addresses will be collected and registered into the FLSS. Your email addresses will be used strictly for the following system functionalities:</p>
                
                <ul class="memo-list">
                    <li>Creation of your individual faculty account</li>
                    <li>Secure login and authentication</li>
                    <li>Viewing of assigned class schedule</li>
                    <li>Submission and management of your schedule preferences</li>
                    <li>Communication of system-related notifications</li>
                </ul>                

                <p>We assure you that all collected personal data will be handled with strict confidentiality and will be used solely for academic and system development purposes. All data processing activities are in full compliance with the Data Privacy Act of 2012 (Republic Act No. 10173). Access to your information is restricted only to authorized system administrators and the developers directly involved in this study.</p>
                <p>To ensure the confidentiality and integrity of your information, the following data privacy measures are in place:</p>

                <ul class="memo-list">
                    <li><strong>Secure Credential Handling:</strong> All passwords are protected using industry-standard one-way hashing (encryption).</li>  
                    <li><strong>Limited Usage Period:</strong> Data collection is limited to the study's duration (Summer Semester 2026 to First Semester 2026-2027).</li>
                    <li><strong>Controlled Access:</strong> Only authorized system administrators and specific researchers have access to user data for technical support.</li>
                    <li><strong>Non-Disclosure:</strong> Your credentials and contact information will never be shared, sold, or utilized for any purpose outside the scope of this project.</li>
                    <li><strong>Official Communication:</strong> This system will only send automated notices regarding your official faculty loading and scheduling.</li>
                </ul>
                
                <p>Thank you very much for your time, support, and cooperation in helping us improve the faculty loading and scheduling process of our campus.</p>
            </div>

            <div class="sign-off">
                <p>Respectfully yours,</p>
                <p><strong>The FLSS Development Team</strong><br>
                BSIT 3-1 Capstone Researchers</p>
            </div>
        </div>

        <div class="footer">
            <p style="margin: 0;">
                © 2026 Polytechnic University of the Philippines - Taguig Branch<br>
                Faculty Loading and Scheduling System
            </p>
        </div>
    </div>
</body>
</html>