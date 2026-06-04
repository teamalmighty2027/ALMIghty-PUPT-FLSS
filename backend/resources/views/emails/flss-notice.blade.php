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
        /* Styled card for login credentials */
        .credentials-box {
            margin: 20px 0;
            border: 1px solid #800000;
            border-radius: 8px;
            overflow: hidden;
        }
        .credentials-box .cred-title {
            background-color: #800000;
            color: #ffffff;
            padding: 8px 16px;
            font-weight: 600;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        .credentials-box table {
            width: 100%;
            border-collapse: collapse;
        }
        .credentials-box td {
            padding: 10px 16px;
            font-size: 15px;
            border-bottom: 1px solid #f0dede;
            vertical-align: top;
        }
        .credentials-box td:first-child {
            font-weight: 600;
            width: 30%;
            color: #800000;
            white-space: nowrap;
        }
        .credentials-box tr:last-child td {
            border-bottom: none;
        }
        /* Login button inside the credentials card */
        .login-btn {
            display: inline-block;
            margin: 16px 0 8px;
            padding: 10px 28px;
            background-color: #800000;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 0.3px;
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
            <h1>PUP Taguig <br> Faculty Loading and Scheduling System (FLSS) </h1>
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
                
                <p>We, the BSIT 3-1 Capstone Project Team (Team ALMighty), are currently conducting our Capstone Project titled <b> "Implementation of the Polytechnic University of the Philippines Taguig Faculty Loading and Scheduling System (FLSS)" </b> under the guidance of our research adviser, Dr. Gecilie C. Almirañez.</p>
                
                <p>The main goal of this project is to implement the campus's scheduling system this <b> 1st Semester of the Academic Year 2026-2027 </b>. This activity involves the submission of your subject preferences for the upcoming semester.</p>
                
                <p>To facilitate your access to the system, please be informed that your official PUP email addresses will be registered into the FLSS. Your email addresses will be used strictly for account creation and system related notifications </p>              

                <p>We assure you that all collected personal data will be handled with strict confidentiality and will be used solely for academic and system development purposes. All data processing activities are in full compliance with the Data Privacy Act of 2012 (Republic Act No. 10173). Access to your information is restricted only to authorized system administrators and the developers directly involved in this study.</p>

                <p>To gain access to the system, please use the account
                credentials below. We strongly recommend changing your
                password upon your first login.</p>

                <!-- Account credentials card -->
                <div class="credentials-box">
                    <div class="cred-title">Your Account Credentials</div>
                    <table>
                        <tr>
                            <td>Email</td>
                            <td>{{ $email }}</td>
                        </tr>
                        <tr>
                            <td>Password</td>
                            <td>{{ $password }}</td>
                        </tr>
                    </table>
                    <div style="padding: 4px 16px 16px;">
                        <a href="{{ $loginUrl }}" class="login-btn">
                            Log In to FLSS
                        </a>
                    </div>
                </div>
                
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