<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appeal Access Requested</title>
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

        .header {
            text-align: center;
            padding: 30px 20px;
            background-color: #800000;
        }

        .logo {
            width: 120px;
            height: auto;
            margin-bottom: 15px;
        }

        .header h1 {
            margin: 0;
            color: #ffffff;
            font-size: 24px;
            font-weight: 600;
            letter-spacing: 0.5px;
            padding: 0;
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

        .button-container {
            text-align: center;
            margin: 35px 0;
        }

        .button {
            background-color: #800000;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 9999px;
            font-size: 16px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(128, 0, 0, 0.1);
        }

        .button:hover {
            background-color: #660000;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px rgba(128, 0, 0, 0.2);
        }

        p {
            text-align: justify;
        }

        .important-note {
            font-size: 14px;
            color: #666666;
            font-style: italic;
            margin: 0;
            padding-top: 20px;
        }

        .footer {
            text-align: center;
            font-size: 14px;
            color: #666666;
            padding: 15px 40px;
            background-color: rgb(239, 228, 228);
        }

        .important-note a {
            color: #800000;
            text-decoration: none;
            font-weight: 500;
        }

        .important-note a:hover {
            text-decoration: underline;
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
        <div class="header">
            <img src="https://images.pupt-flss.com/pup_logo_white_bg.png"
                alt="PUP Logo" class="logo">
            <h1>PUP Taguig</h1>
            <h1>Faculty Loading and Scheduling System</h1>
        </div>

        <div class="content">
            <p class="greeting"><b>Hello Admin,</b></p>

            <p>
                <strong>{{ $firstName }} {{ $lastName }}</strong> has requested
                access to submit a schedule appeal for the upcoming academic
                semester.
            </p>

            <p>
                You can review this request and enable their submission
                access directly from <strong>Overview Dashboard</strong>
                or the <strong>Internal Arrangements</strong> tab in the
                <strong>Rescheduling</strong> module of the PUPT-FLSS
                Admin portal.
            </p>

            <div class="button-container">
                <a href="{{ url('/admin/rescheduling') }}" class="button">
                    View Rescheduling Requests
                </a>
            </div>

            <p class="important-note">
                Need help? Contact system support at
                <a href="mailto:pupt.flss2027@gmail.com">
                    pupt.flss2027@gmail.com
                </a>
            </p>
        </div>

        <div class="footer">
            <p class="copyright">
                © 2026 Polytechnic University of the Philippines - Taguig<br>
                Faculty Loading and Scheduling System<br>
                All rights reserved.
            </p>
        </div>
    </div>
</body>

</html>