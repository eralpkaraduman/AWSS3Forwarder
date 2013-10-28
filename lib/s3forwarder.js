var program = require('commander');
var forever = require('forever');
var express = require('express');
var routes = require('../routes');
var user = require('../routes/user');
var http = require('http');
var path = require('path');
var util = require('util');
var fs = require('fs');
var AWS = require('aws-sdk');
var path = require('path');
var awsConfig = require(awsConfig());

/*
AWS.config.loadFromPath(awsConfig());
var s3 = new AWS.S3({apiVersion: '2013-10-28'});
*/
var Uploader = require('s3-upload-stream').Uploader,
    zlib       = require('zlib'),
    fs         = require('fs');


var app = express();

var monitor;

var currentUpload = null;

function parseString(val){
    return val+"";
}

var usage_s = '-a -f <absoluteFilePath> -b <s3bucketName> -p <dirToWriteInInBucket>';

program
    .version(require('../package.json').version)
    .option('-u, --upload',"force to check queue and upload remaining items")
    .option('-s, --start','starts web server')
    .option('-d, --daemon','starts web server as "forever" daemon')
    .option('-k, --kill','find and kill all web server processes')
    .option('-a, --add','add file to queue')
    .option('-f, --file <file>',"file path",parseString)
    .option('-b, --bucket <bucket>',"bucket name",parseString)
    .option('-p, --bucketPath <bucketPath>',"dir",parseString)
    .usage(usage_s)
    .parse(process.argv);

// startDaemon();

function currentProgramPath(){
    return path.resolve(__dirname, 's3forwarderMonitor.js')
}

function awsConfig(){
    return path.resolve(__dirname, '../awsConfig.json')
}

function findWebServerProcess(cb){
    forever.list (false, function(err,processes){

        var ps = [];

        if(err){
            cb(ps);
        }else if(processes){

            for(var i=0; i<processes.length; i++){
                var p =  processes[i];
                if(p.file == currentProgramPath()){
                    p.foreverIndex = i;
                    ps.push(p);
                }
            }

            cb(ps);
        }else{
            cb(ps);
        }


    });
}

if(program.start){

    findWebServerProcess(function(processes){

        if(processes.length<=0){

            monitor = require("./s3forwarderMonitor");

        }else{
            console.log("web server is running:");
            for(var i=0; i<processes.length; i++){
                var p =  processes[i];
                console.log("pid:", p.pid);
            }
            /*
            console.log("killing existing processes");
            var child = forever.startDaemon(currentProgramPath(),{options:['-k']});
            */
        }
    });

}else if(program.daemon){

    startDaemon();

}else if(program.kill){
    kill();
}else if(program.add){
    //console.log('ad');

    var queueItem = {};
    queueItem.file = program.file;
    queueItem.bucket = program.bucket;
    queueItem.bucketPath = program.bucketPath;
    queueItem.errors = [];

    queueItem.queueDate = new Date();

    var e_f = function(m){
        if(m){
            console.log(m+"\n usage: "+usage_s);
        }else{
            appendQueue(queueItem);

            uploadItemsInQueueForce();

        }

    }

    if(!queueItem.file)e_f("no file specified");
    else if(!queueItem.bucket)e_f("no bucket specified");
    else if(!queueItem.bucketPath){
        queueItem.bucketPath = "";
        e_f(null);
    }else e_f(null);

}else if(program.upload){

    uploadItemsInQueueForce();

}else{
    //startDaemon();

    console.log(usage_s);
}

function getQueue(){
    var queue = null;
    try{
        var queue_tx = fs.readFileSync(queuePath());
        queue = JSON.parse(queue_tx);

    }catch(e){
        queue = [];
    }

    return queue;
}

function failedPath(){
    return path.resolve(__dirname, '../failed.json');
}

function queuePath(){
    return path.resolve(__dirname, '../queue.json');
}

function getFailedQueue(){
    var queue = null;
    try{
        var queue_tx = fs.readFileSync(failedPath());
        queue = JSON.parse(queue_tx);

    }catch(e){
        queue = [];
    }

    return queue;
}

function appendFailedQueue(item){
    var queue = getFailedQueue();
    queue.push(item);

    writeFailedQueue(queue);

}

function appendQueue(item){
    var queue = getQueue();
    queue.push(item);

    writeQueue(queue);

}


function writeFailedQueue(newQueue){

    fs.writeFileSync(failedPath(), JSON.stringify(newQueue));
}


function writeQueue(newQueue){

    fs.writeFileSync(queuePath(), JSON.stringify(newQueue));
}

function kill(){
    findWebServerProcess(function(processes){

        console.log("killing",processes.length,"processes");
        for(var i=0; i<processes.length; i++){
            var p =  processes[i];
            forever.stop(p.foreverIndex);
            console.log("pid:", p.pid,"killed");
        }
    });
}

function startDaemon(){

    console.log("starting daemon..");

    findWebServerProcess(function(processes){

        if(processes.length<=0){
            var child = forever.startDaemon(currentProgramPath(),{
                //options:["-s"],
                logFile:path.resolve(__dirname, '../daemon-log.log'),
                outFile:path.resolve(__dirname, '../daemon-out.log'),
                errFile:path.resolve(__dirname, '../daemon-err.log'),
                silent              : false,
                watch               : false
                });
            console.log("daemon started");
        }else{
            console.log("web server is running:");
            for(var i=0; i<processes.length; i++){
                var p =  processes[i];
                console.log("pid:", p.pid);
            }
        }
    });
}


function uploadItemsInQueueForce(){



    var cur_queue = getQueue();
    var uploadItem = cur_queue.pop();

    if(uploadItem == null){
        console.log("all uploads complete");

    }else{

        if(currentUpload){
            console.log("there is an ongoing upload");
            return;

        }else{
            console.log("started uploads");
        }

        console.log("uploading: ",uploadItem.file,"...");

        var filePath = path.normalize(uploadItem.file);
        var fileName = path.basename(uploadItem.file);


        if (fs.existsSync(filePath)) {
            var params = {Bucket: uploadItem.bucket, Key: fileName};

            var read = fs.createReadStream(filePath);
            var compress = zlib.createGzip();

            currentUpload = new Uploader(
                //Connection details.
                {
                    "accessKeyId": awsConfig.accessKeyId,
                    "secretAccessKey": awsConfig.secretAccessKey,
                    "region": awsConfig.region
                },
                //Upload destination details.
                {
                    "Bucket": uploadItem.bucket,
                    "Key": uploadItem.bucketPath+fileName
                },
                function (err, uploadStream)
                {
                    //console.log("uploadStream "+util.inspect(uploadStream));

                    if(err){

                        console.log(err, uploadStream);

                        uploadItem = writeErrorToUploadItem(uploadItem,err);
                        writeQueue(cur_queue);
                        appendFailedQueue(uploadItem);

                        currentUpload = null;
                        uploadItemsInQueueForce();

                        writeCurrent(null);

                    }else{



                        uploadStream.on('chunk', function (data) {

                            var fileStats = fs.statSync(filePath);

                            currentUpload.percentUploaded = data.uploadedSize/fileStats.size;

                            console.log("uploaded % "+currentUpload.percentUploaded*100);

                            writeCurrent(currentUpload);
                        });

                        uploadStream.on('uploaded', function (data) {
                            console.log("uploaded "+util.inspect(data));

                            writeQueue(cur_queue);

                            currentUpload.percentUploaded = 1;

                            writeCurrent(currentUpload);


                            currentUpload = null;
                            uploadItemsInQueueForce();
                        });

                        console.log('stream created compressing & uploading');

                        //Pipe the file stream through Gzip compression and upload result to S3.
                        //read.pipe(compress).pipe(uploadStream);
                        read.pipe(uploadStream);

                    }

                    currentUpload.percentUploaded = 0;
                    currentUpload.uploadItem = uploadItem;

                    writeCurrent(currentUpload);
                }
            );




        }else{ // remove item

            console.log("filePath %s not found",filePath);

            uploadItem = writeErrorToUploadItem(uploadItem,"file not found");
            // remove
            writeQueue(cur_queue);

            //write to failed list
            appendFailedQueue(uploadItem);

            currentUpload = null;


            uploadItemsInQueueForce(); // loop
        }


    }
}


function currentUploadLogPath(){
    return path.resolve(__dirname, '../current.json');
}

function getCurrent(){
    var current = null;
    try{
        var current_tx = fs.readFileSync(currentUploadLogPath());
        current = JSON.parse(current_tx);

    }catch(e){
        current = {};
    }


    return current;
}

function writeCurrent(current){

    //var current = c;

    var c = {
        uploadItem:current.uploadItem,
        percentUploaded:current.percentUploaded,
        updateDate:new Date()
    }

    //current.currentChunk = null;
    //current.s3Client = null;

    fs.writeFileSync(currentUploadLogPath(), JSON.stringify(c));
}


function writeErrorToUploadItem(ui,error){
    if(ui.errors == null){
        ui.errors = [];
    }

    if(ui.errors.indexOf(error)<0){
        ui.errors.push(error);
    }

    return ui;
}

exports.getQueue = getQueue;
exports.getFailedQueue = getFailedQueue;

exports.getCurrentUpload = getCurrent;