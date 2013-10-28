Tool for uploading files to AWS s3 buckets
------------------------------------------

modify awsConfig.json_template, fill in your own credentials than save it as awsConfig.json

- bin/s3forwarder -h or --help displays available commands

- bin/s3forwarder -u : force upload all items in queue

- bin/s3forwarder -d : start monitoring web server as daemon (runs on 5050)

- bin/s3forwarder -k : kill monitoring web server


Adding files for upload
-----------------------

bin/s3forwarder -a -b myBucketName -f /absolute/path/to/my.file -p optional/pathToPutInBucket

after running this command s3forwarder will queue item and immediately start uploading

if you have the monitoring web server open, you can go to,
- http://yourserver/queue to view items waiting in queue
- http://yourserver/failed to view failed items
- http://yourserver/current to view the progress of last uploaded/uploading item


TO-DO:
------
- add option to remove successfully uploaded files
- add option to change monitoring server port
- add option to upload directories

