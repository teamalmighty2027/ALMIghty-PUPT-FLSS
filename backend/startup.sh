#!/bin/bash

# 1. Update the Apache configuration to point to the 'public' folder
sed -i "s|/home/site/wwwroot|/home/site/wwwroot/backend/public|g" /etc/apache2/sites-available/000-default.conf

# 2. Start Apache in the foreground
/usr/sbin/apache2ctl -D FOREGROUND